import { createCheckpoint, getCheckpointDiff, getCheckpointFiles } from '../host/git-checkpoint';
import { AgentEvent, AgentRun, TurnOutcome } from '../agents/agent-provider';
import { composePrompt, loadExperience, loadProjectRules, missingHandoffFields } from '../agents/prompt-composer';
import { ProviderRegistry } from '../agents/provider-registry';
import { HostMessage } from '../shared/ipc';
import { agentName } from '../shared/agent-name';
import { extractQuestionOptions } from '../shared/question-options';
import { summarizeCosts } from '../shared/cost-summary';
import { resolveSelection } from '../shared/model-selection';
import { PROTOCOL_ROLES } from '../shared/protocol-roles';
import {
  AccountProfile,
  AgentMessage,
  ChatMessage,
  ConversationSession,
  FileContextAttachment,
  LiveStatus,
  ProtocolRole,
  QueuedMessage,
  QuestionOptions,
  TurnUsage
} from '../shared/types';
import { SessionStore } from '../storage/session-store';
import { TelemetryStore, TelemetryTarget } from '../storage/telemetry-store';

export interface SendPromptOptions {
  sessionId: string;
  prompt: string;
  attachments?: FileContextAttachment[];
  role?: ProtocolRole;
  workspaceDir: string;
  /** Agente que escribió el mensaje; ausente si lo escribió la persona. */
  from?: string;
  /** Cuántos mensajes entre agentes llevan encadenados; frena las conversaciones sin fin. */
  hops?: number;
  /** Ya se reintentó con otra cuenta tras agotar la cuota; evita reintentar en bucle. */
  retried?: boolean;
}

interface Queued {
  item: QueuedMessage;
  options: SendPromptOptions;
}

/** Unas 30 actualizaciones por segundo bastan para que el texto se vea fluido. */
const TEXT_FLUSH_INTERVAL_MS = 33;
const MAX_AGENT_HOPS = 6;
const MAX_COMMS = 100;
/** Errores con que las CLI avisan que la cuenta se quedó sin cuota. */
const QUOTA_ERROR = /usage limit|rate limit|quota|limit reached|too many requests|429/i;
const MAX_STORED_THINKING = 2000;
const LIVE_THINKING_CHARS = 400;
const LIVE_TAIL_CHARS = 300;
const LIVE_COMMANDS = 6;
/** `>> nombre: mensaje`; el mensaje llega hasta una línea en blanco o el siguiente `>>`. */
const AGENT_MESSAGE = /^>>\s*([\w.-]+)\s*:\s*(.+(?:\n(?!\s*\n|>>).+)*)/gm;

export { extractQuestionOptions };

function newMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/** Los archivos ya están en disco; el historial solo guarda la referencia. */
function withoutHeavyContent(attachment: FileContextAttachment): FileContextAttachment {
  const { mediaUri, content, ...reference } = attachment;
  return { ...reference, content: attachment.mediaType ? '' : content.slice(0, 500) };
}

/**
 * Único dueño de un turno: la conversación vive aquí y la webview solo la pinta,
 * así recargar la ventana no pierde respuestas ni deja turnos colgados.
 */
export class ChatService {
  private readonly activeRuns = new Map<string, AgentRun>();
  private readonly preparingSessionIds = new Set<string>();
  private readonly queues = new Map<string, Queued[]>();
  private readonly live = new Map<string, LiveStatus>();
  private comms: AgentMessage[] = [];
  /** Agentes que terminaron o preguntaron mientras la persona veía otro. */
  private readonly attention = new Set<string>();
  /** Milisegundos sin salida del agente antes de cancelar el turno; 0 lo desactiva. */
  public idleTimeoutMs = 0;

  constructor(
    private readonly sessions: SessionStore,
    private readonly telemetry: TelemetryStore,
    private readonly providers: ProviderRegistry,
    private readonly post: (message: HostMessage) => void,
    private readonly notify?: (text: string) => void
  ) {}

  public markSeen(sessionId: string): void {
    if (this.attention.delete(sessionId)) this.publishSessions();
  }

  /** Gasto acumulado del agente o, si trabaja en equipo, de todo el equipo. */
  public spentUSD(session: ConversationSession): number {
    return this.sessions
      .list()
      .filter((other) => other.id === session.id || (session.squad && other.squad === session.squad))
      .reduce((sum, other) => sum + other.messages.reduce((total, message) => total + (message.costUSD ?? 0), 0), 0);
  }

  public runningSessionIds(): string[] {
    return [...this.preparingSessionIds, ...this.activeRuns.keys()];
  }

  public isRunning(sessionId: string): boolean {
    return this.preparingSessionIds.has(sessionId) || this.activeRuns.has(sessionId);
  }

  public cancel(sessionId: string): void {
    this.activeRuns.get(sessionId)?.cancel();
  }

  /** Detiene el turno y olvida lo que esperaba en cola. */
  public discard(sessionId: string): void {
    this.queues.delete(sessionId);
    this.cancel(sessionId);
  }

  public removeQueued(sessionId: string, queuedId: string): void {
    const queue = this.queues.get(sessionId)?.filter((entry) => entry.item.id !== queuedId) ?? [];
    this.queues.set(sessionId, queue);
    this.publishSessions();
  }

  /** Tras detener un turno la cola queda en espera; esto la retoma. */
  public async resumeQueue(sessionId: string): Promise<void> {
    if (!this.isRunning(sessionId)) await this.drain(sessionId);
  }

  private async drain(sessionId: string): Promise<void> {
    const next = this.queues.get(sessionId)?.shift();
    if (next) await this.send(next.options);
    else this.publishSessions();
  }

  /** Solo viajan los mensajes de la sesión activa: el historial completo puede pesar megas. */
  public publishSessions(): void {
    const activeSessionId = this.sessions.getActive().id;
    this.post({
      type: 'state',
      patch: {
        sessions: this.sessions.list().map((session) => ({
          ...session,
          messageCount: session.messages.length,
          messages: session.id === activeSessionId ? session.messages : []
        })),
        activeSessionId,
        runningSessionIds: this.runningSessionIds(),
        queues: Object.fromEntries([...this.queues].map(([id, queue]) => [id, queue.map((entry) => entry.item)])),
        comms: this.comms,
        attentionSessionIds: [...this.attention],
        costs: summarizeCosts(this.sessions.list())
      }
    });
  }

  /** Adelanta el arranque de la CLI mientras la persona escribe. */
  public async prewarm(sessionId: string, workspaceDir: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || this.isRunning(sessionId)) return;
    const { account, model, effort } = resolveSelection(session, await this.providers.listAccounts());
    if (!account || !model || account.status !== 'connected') return;
    this.providers.get(account.provider).prewarm?.({
      account,
      workspaceDir,
      modelId: model.id,
      effort,
      resumeId: session.cliSessionId,
      readOnly: this.isReadOnly(session, session.protocolRole)
    });
  }

  /** Misma regla al precalentar y al enviar: si difiere, la CLI precalentada no se reutiliza. */
  private isReadOnly(session: ConversationSession, role: ProtocolRole | undefined): boolean {
    return session.permission === 'readonly' || Boolean(role && PROTOCOL_ROLES[role].readOnly);
  }

  /** Mensaje informativo local: no pasa por ningún modelo. */
  public addNote(sessionId: string, content: string, isError = false): void {
    this.sessions.appendMessage(sessionId, {
      id: newMessageId(),
      role: 'system',
      content,
      profileId: '',
      modelName: 'AgentHub',
      timestamp: Date.now(),
      isError
    });
    this.publishSessions();
  }

  public async send(options: SendPromptOptions): Promise<void> {
    const { sessionId, prompt, attachments = [], workspaceDir } = options;
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (this.isRunning(sessionId)) {
      const queue = this.queues.get(sessionId) ?? [];
      queue.push({ item: { id: newMessageId(), prompt, from: options.from }, options });
      this.queues.set(sessionId, queue);
      this.publishSessions();
      return;
    }

    this.attention.delete(sessionId);
    if (session.budgetUSD !== undefined && this.spentUSD(session) >= session.budgetUSD) {
      this.addNote(sessionId, `Límite de gasto alcanzado ($${session.budgetUSD.toFixed(2)}). Súbelo para seguir.`, true);
      return;
    }

    this.preparingSessionIds.add(sessionId);
    this.publishSessions();
    const accounts = await this.providers.listAccounts();
    this.preparingSessionIds.delete(sessionId);

    const { account, model, effort } = resolveSelection(session, accounts);
    if (!account || !model) {
      this.addNote(sessionId, 'No hay ninguna cuenta disponible. Vincula una en Ajustes.', true);
      return;
    }

    if (account.id !== session.profileId) this.sessions.changeAccount(sessionId, account.id);
    const resumeId = session.cliSessionId;
    const role = options.role ?? session.protocolRole;
    const history = resumeId ? [] : [...session.messages];
    const team = this.teammates(session);
    const target: TelemetryTarget = {
      profileId: account.id,
      accountName: account.name,
      modelName: model.label,
      provider: account.provider
    };

    this.sessions.appendMessage(sessionId, {
      id: newMessageId(),
      role: 'user',
      content: prompt,
      profileId: account.id,
      modelName: options.from ?? 'Usuario',
      timestamp: Date.now(),
      attachments: attachments.map(withoutHeavyContent)
    });

    const reply: ChatMessage = {
      id: newMessageId(),
      role: 'assistant',
      content: '',
      profileId: account.id,
      modelName: model.label,
      timestamp: Date.now(),
      isStreaming: true,
      activity: [],
      activityOffsets: []
    };
    this.sessions.appendMessage(sessionId, reply);

    const live: LiveStatus = { thinking: '', commands: [], tail: '' };
    this.live.set(sessionId, live);
    let usage: TurnUsage = {};
    let pendingText = '';
    let flushTimer: NodeJS.Timeout | undefined;
    const flushText = () => {
      clearTimeout(flushTimer);
      flushTimer = undefined;
      this.post({ type: 'live', sessionId, live: { ...live, commands: [...live.commands] } });
      if (!pendingText) return;
      this.post({ type: 'turnText', sessionId, messageId: reply.id, text: pendingText });
      pendingText = '';
    };

    let run: AgentRun | undefined;
    let timedOut = false;
    let idleTimer: NodeJS.Timeout | undefined;
    const bumpIdle = () => {
      clearTimeout(idleTimer);
      if (this.idleTimeoutMs <= 0) return;
      idleTimer = setTimeout(() => {
        timedOut = true;
        run?.cancel();
      }, this.idleTimeoutMs);
    };

    const onEvent = (event: AgentEvent) => {
      bumpIdle();
      switch (event.kind) {
        case 'text':
          reply.content += event.text;
          pendingText += event.text;
          live.tail = reply.content.slice(-LIVE_TAIL_CHARS);
          flushTimer ??= setTimeout(flushText, TEXT_FLUSH_INTERVAL_MS);
          break;
        case 'thinking':
          reply.thinking = ((reply.thinking ?? '') + event.text).slice(-MAX_STORED_THINKING);
          live.thinking = reply.thinking.slice(-LIVE_THINKING_CHARS);
          flushTimer ??= setTimeout(flushText, TEXT_FLUSH_INTERVAL_MS);
          break;
        case 'activity':
          live.commands = [...live.commands, event.label].slice(-LIVE_COMMANDS);
          flushText();
          reply.activity?.push(event.label);
          reply.activityOffsets?.push(reply.content.length);
          this.post({ type: 'turnActivity', sessionId, messageId: reply.id, label: event.label });
          break;
        case 'resumeId':
          this.sessions.update(sessionId, { cliSessionId: event.id });
          break;
        case 'quota':
          this.telemetry.recordQuota(target, event.quota);
          this.post({ type: 'state', patch: { telemetry: this.telemetry.getRegistry() } });
          break;
        case 'question':
          reply.questionOptions = { question: event.question, options: event.options };
          this.post({ type: 'turnQuestion', sessionId, messageId: reply.id, question: event.question, options: event.options });
          break;
        case 'usage':
          usage = event.usage;
          break;
      }
    };

    const checkpointHash = createCheckpoint(workspaceDir);
    if (checkpointHash) reply.checkpointHash = checkpointHash;
    const startedAt = Date.now();
    let outcome: TurnOutcome;
    try {
      run = this.providers.get(account.provider).startTurn(
        {
          account,
          prompt: composePrompt({ prompt, role, attachments, history, team, projectRules: loadProjectRules(workspaceDir),
            // Con conversación reanudada la CLI ya tiene esto del primer turno: no se paga de nuevo.
            experience: resumeId ? undefined : loadExperience(workspaceDir),
            canWrite: !resumeId && !(role && PROTOCOL_ROLES[role].readOnly)
          }),
          workspaceDir,
          modelId: model.id,
          effort,
          resumeId,
          readOnly: this.isReadOnly(session, role)
        },
        onEvent
      );
      bumpIdle();
      this.activeRuns.set(sessionId, run);
      this.publishSessions();
      outcome = await run.outcome;
    } catch (error) {
      outcome = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }

    clearTimeout(idleTimer);
    this.activeRuns.delete(sessionId);
    flushText();
    this.live.delete(sessionId);
    this.post({ type: 'live', sessionId });
    this.finishTurn(session, reply, outcome);
    if (timedOut) this.addNote(sessionId, `Sin actividad durante ${Math.round(this.idleTimeoutMs / 60000)} min: el turno se canceló.`, true);
    if (usage.costUSD) reply.costUSD = usage.costUSD;
    if (checkpointHash) {
      reply.checkpointDiff = getCheckpointDiff(workspaceDir, checkpointHash);
      reply.checkpointFiles = getCheckpointFiles(workspaceDir, checkpointHash);
      this.sessions.update(session.id, { messages: session.messages });
    }
    if (outcome.status === 'completed') {
      this.telemetry.recordTurn(target, { ...usage, durationMs: Date.now() - startedAt });
      this.routeAgentMessages(session, reply.content, options.hops ?? 0);
    }
    if (outcome.status !== 'cancelled' && session.id !== this.sessions.getActive().id) {
      this.attention.add(session.id);
      this.notify?.(
        outcome.status === 'failed' ? `${agentName(session)} falló` : reply.questionOptions ? `${agentName(session)} te hace una pregunta` : `${agentName(session)} terminó`
      );
    }
    this.post({ type: 'state', patch: { telemetry: this.telemetry.getRegistry() } });
    this.publishSessions();
    if (outcome.status === 'completed') {
      await this.drain(sessionId);
    } else if (outcome.status === 'failed' && !options.retried && QUOTA_ERROR.test(outcome.error)) {
      await this.retryWithOtherAccount(options, account.id, accounts);
    }
  }

  /** Cuota agotada: pasa a otra cuenta conectada del mismo proveedor y repite el mensaje una vez. */
  private async retryWithOtherAccount(options: SendPromptOptions, failedId: string, accounts: AccountProfile[]): Promise<void> {
    const failed = accounts.find((candidate) => candidate.id === failedId);
    const alternative = accounts.find(
      (candidate) => candidate.status === 'connected' && candidate.id !== failedId && candidate.provider === failed?.provider
    );
    if (!alternative) return;
    this.sessions.changeAccount(options.sessionId, alternative.id);
    this.addNote(options.sessionId, `${failed?.name ?? 'La cuenta'} se quedó sin cuota: reintentando con ${alternative.name}.`);
    await this.send({ ...options, retried: true });
  }

  /** Nombres de los compañeros de equipo; indefinido si el agente trabaja solo. */
  private teammates(session: ConversationSession): { self: string; mates: string[]; next?: string } | undefined {
    if (!session.squad) return undefined;
    const mates = this.sessions.list().filter((other) => other.squad === session.squad && other.id !== session.id);
    const nextRole = session.protocolRole && PROTOCOL_ROLES[session.protocolRole].handoffTo;
    const next = nextRole ? mates.find((mate) => mate.protocolRole === nextRole) : undefined;
    return mates.length > 0 ? { self: agentName(session), mates: mates.map(agentName), next: next && agentName(next) } : undefined;
  }

  /** Entrega a cada compañero los `>> nombre: mensaje` que el agente escribió. */
  private routeAgentMessages(sender: ConversationSession, text: string, hops: number): void {
    if (!sender.squad) return;
    const mates = this.sessions.list().filter((other) => other.squad === sender.squad && other.id !== sender.id);
    // Ignora bloques de código markdown y código inline para evitar falsos disparos en diffs o ejemplos
    const cleanText = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
    for (const [, name, body] of cleanText.matchAll(AGENT_MESSAGE)) {
      const target = mates.find((mate) => agentName(mate).toLowerCase() === name.toLowerCase());
      if (!target) {
        this.addNote(sender.id, `No hay ningún agente "${name}" en el equipo.`, true);
      } else if (hops >= MAX_AGENT_HOPS) {
        this.addNote(sender.id, 'Se detuvo la cadena de mensajes entre agentes.', true);
        return;
      } else {
        const from = agentName(sender);
        const isHandoff = sender.protocolRole && target.protocolRole === PROTOCOL_ROLES[sender.protocolRole].handoffTo;
        const missing = isHandoff ? missingHandoffFields(body) : [];
        if (missing.length > 0) this.addNote(sender.id, `Traspaso a ${name} sin los campos: ${missing.join(' ')}`, true);
        this.comms = [...this.comms, { id: newMessageId(), at: Date.now(), from, to: agentName(target), text: body.trim() }].slice(-MAX_COMMS);
        void this.send({
          sessionId: target.id,
          prompt: body.trim(),
          from,
          hops: hops + 1,
          workspaceDir: target.projectPath ?? sender.projectPath ?? ''
        });
      }
    }
  }

  public async failover(sessionId: string, targetProvider: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const accounts = await this.providers.listAccounts();
    const targetAccount = accounts.find((a) => a.provider === targetProvider && a.status === 'connected');
    if (!targetAccount) {
      this.addNote(sessionId, `No hay cuentas conectadas de ${targetProvider}.`, true);
      return;
    }
    this.sessions.changeAccount(sessionId, targetAccount.id);
    this.addNote(sessionId, `🔄 Sesión transferida a ${targetAccount.name}.`);
    this.publishSessions();
  }

  private finishTurn(session: ConversationSession, reply: ChatMessage, outcome: TurnOutcome): void {
    reply.isStreaming = false;
    if (!reply.questionOptions && reply.content) {
      const detected = extractQuestionOptions(reply.content);
      if (detected) reply.questionOptions = detected;
    }
    const messages = reply.content || reply.activity?.length
      ? session.messages
      : session.messages.filter((message) => message !== reply);
    this.sessions.update(session.id, { messages });

    if (outcome.status === 'cancelled') {
      this.addNote(session.id, 'Turno detenido.');
    } else if (outcome.status === 'failed') {
      // La conversación de la CLI puede estar dañada: el siguiente turno arranca con el historial.
      this.sessions.update(session.id, { cliSessionId: undefined });
      this.addNote(session.id, outcome.error, true);
    }
  }
}
