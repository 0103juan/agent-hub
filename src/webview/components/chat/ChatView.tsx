import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronUp, Cpu, Download, Pencil, FolderGit2, Layers, ListTree, Pin, Plus, Repeat, SlidersHorizontal, Square, Wallet, X } from 'lucide-react';
import { agentName } from '../../../shared/agent-name';
import { PROTOCOL_ROLES } from '../../../shared/protocol-roles';
import { resolveSelection } from '../../../shared/model-selection';
import { ConversationSession, FileContextAttachment, ProtocolRole, ProviderType, QueuedMessage, ReasoningEffort, SessionPermission } from '../../../shared/types';
import { HubAction, HubState } from '../../state/hub-state';
import { ACCENTS, getAccent, setAccent } from '../../state/accent';
import { formatTime } from '../../utils/format';
import { postToHost } from '../../vscode-api';
import { EffortSelector } from '../EffortSelector';
import { ProtocolRoleSelector } from '../ProtocolRoleSelector';
import { ProviderBadge } from '../ProviderBadge';
import { ROLE_COLORS } from '../SquadCanvas';
import { TelemetryBar } from '../TelemetryBar';
import { withThumbnails } from '../../state/thumbnails';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { AccountNotice, ModelAccountBar } from './ModelAccountBar';
import { QuotaNotice } from './QuotaNotice';

// El stream cambia la sesión muchas veces por segundo; estas piezas no dependen de él.
const AccountBar = memo(ModelAccountBar);
const Effort = memo(EffortSelector);
const Roles = memo(ProtocolRoleSelector);
const Usage = memo(TelemetryBar);
const Quota = memo(QuotaNotice);
const Editor = memo(Composer);

const NO_EFFORTS: ReasoningEffort[] = [];
const NO_QUEUE: QueuedMessage[] = [];
const NO_ATTACHMENTS: FileContextAttachment[] = [];

interface Props {
  state: HubState;
  session: ConversationSession;
  /** Oculta las barras secundarias; quedan el chat y el composer. */
  focusMode?: boolean;
  /** Dentro de una columna: el título y el proyecto ya están en la barra de la columna, y Historial/Nueva tarea en la barra superior. */
  embedded?: boolean;
  dispatch: React.Dispatch<HubAction>;
  onOpenHistory: () => void;
  onNewTask: () => void;
}

const ONBOARDING_KEY = 'agent-hub.onboardingDismissed';

/** Primeros pasos: las casillas salen del estado, no se marcan a mano. */
const Onboarding: React.FC<{ state: HubState }> = ({ state }) => {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(ONBOARDING_KEY) === '1');
  if (dismissed) return null;
  const steps = [
    { label: 'Conectar una cuenta', done: state.accounts.some((account) => account.status === 'connected') },
    { label: 'Enviar un mensaje', done: state.sessions.some((s) => (s.messageCount ?? s.messages.length) > 0) },
    { label: 'Lanzar un equipo de agentes', done: state.sessions.some((s) => s.squad) }
  ];
  return (
    <div className="shrink-0 p-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px]">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-zinc-200">Primeros pasos</span>
        <button
          type="button"
          aria-label="Descartar primeros pasos"
          onClick={() => {
            localStorage.setItem(ONBOARDING_KEY, '1');
            setDismissed(true);
          }}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <ul className="space-y-0.5">
        {steps.map((step) => (
          <li key={step.label} className={`flex items-center gap-1.5 ${step.done ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {step.done ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            <span>{step.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 text-[10px] text-zinc-500">Atajos: Ctrl+K paleta de comandos · Ctrl+/ todos los atajos</div>
    </div>
  );
};

/** Menú con los mensajes del usuario y los fijados; llevar al mensaje es scroll a su ancla. */
const ConversationIndex: React.FC<{ session: ConversationSession }> = ({ session }) => {
  const [open, setOpen] = useState(false);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const entries = session.messages.filter((m) => (m.role === 'user' || m.pinned) && (!onlyPinned || m.pinned));
  const goTo = (messageId: string) => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: 'center' });
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition"
        aria-label="Índice de la conversación"
        title="Índice de la conversación"
      >
        <ListTree className="w-3 h-3 text-indigo-400" />
      </button>
      {open && (
        <ul className="absolute right-0 top-full mt-1 z-30 w-64 max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          <li className="flex items-center justify-between px-1.5 py-1 text-[10px] text-zinc-500 uppercase tracking-wider">
            <span>{entries.length} entradas</span>
            <button type="button" aria-pressed={onlyPinned} onClick={() => setOnlyPinned(!onlyPinned)} className={`normal-case tracking-normal text-[11px] ${onlyPinned ? 'text-amber-300' : 'text-zinc-400 hover:text-zinc-200'}`}>
              Solo fijados
            </button>
          </li>
          {entries.length === 0 && <li className="p-1.5 text-[11px] text-zinc-400">{onlyPinned ? 'No hay mensajes fijados.' : 'Aún no hay mensajes.'}</li>}
          {entries.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => goTo(m.id)}
                className="flex w-full items-center gap-1.5 text-left px-1.5 py-1 rounded text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                {m.pinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Fijado" />}
                <span className="truncate">{m.content.trim().split('\n')[0] || '(sin texto)'}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">{formatTime(m.timestamp)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Color del proyecto, guardado en localStorage; marca la cabecera y los chips de la franja de agentes. */
const AccentPicker: React.FC<{ current?: string; onPick: (color: string) => void }> = ({ current, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Color del proyecto"
        title="Color del proyecto"
        className="block w-3 h-3 rounded-full border border-zinc-600"
        style={{ backgroundColor: current ?? 'transparent' }}
      />
      {open && (
        <span className="absolute left-0 top-full mt-1 z-30 flex gap-1 p-1.5 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => {
                onPick(color);
                setOpen(false);
              }}
              className={`w-4 h-4 rounded-full border ${color === current ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
      )}
    </span>
  );
};

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export const ChatView: React.FC<Props> = ({ state, session, focusMode, embedded, dispatch, onOpenHistory, onNewTask }) => {
  const { id: sessionId, profileId, modelId, effort: sessionEffort } = session;
  const selection = useMemo(
    () => resolveSelection({ profileId, modelId, effort: sessionEffort }, state.accounts),
    [profileId, modelId, sessionEffort, state.accounts]
  );
  const { account, model, effort } = selection;
  const telemetry = account && model ? state.telemetry[`${account.id}::${model.label}`] : undefined;

  const selectEffort = useCallback(
    (nextEffort: ReasoningEffort) => postToHost({ command: 'updateSession', sessionId, patch: { effort: nextEffort } }),
    [sessionId]
  );
  const selectRole = useCallback(
    (protocolRole: ProtocolRole | undefined) =>
      postToHost({ command: 'updateSession', sessionId, patch: { protocolRole: protocolRole ?? null } }),
    [sessionId]
  );
  const failover = useCallback(
    (targetProvider: ProviderType) => postToHost({ command: 'failoverSession', sessionId, targetProvider }),
    [sessionId]
  );
  const setBudget = (value: string) => {
    const amount = Number.parseFloat(value);
    postToHost({ command: 'updateSession', sessionId, patch: { budgetUSD: amount > 0 ? amount : null } });
  };
  const spentUSD = useMemo(() => session.messages.reduce((sum, m) => sum + (m.costUSD ?? 0), 0), [session.messages]);
  const budgetPercent = session.budgetUSD ? Math.min(100, Math.round((spentUSD / session.budgetUSD) * 100)) : 0;

  const attachments = state.attachments[sessionId] ?? NO_ATTACHMENTS;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  // `targetId` envía a otro agente del equipo (menciones con @).
  const sendPrompt = useCallback(
    async (prompt: string, planFirst?: boolean, targetId?: string) => {
      dispatch({ type: 'clearAttachments', sessionId: targetId ?? sessionId });
      const attachments = await withThumbnails(attachmentsRef.current);
      postToHost({ command: 'sendPrompt', sessionId: targetId ?? sessionId, prompt, attachments, ...(planFirst ? { planFirst } : {}) });
    },
    [sessionId, dispatch]
  );

  const mates = state.sessions
    .filter((candidate) => session.squad && candidate.squad === session.squad && candidate.id !== sessionId)
    .map((candidate) => ({ id: candidate.id, name: agentName(candidate) }));
  const matesKey = mates.map((mate) => `${mate.id}:${mate.name}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mentionAgents = useMemo(() => mates, [matesKey]);

  const [, setAccentTick] = useState(0);
  const accent = getAccent(session.projectName);

  const [deckExpanded, setDeckExpanded] = useState(() => localStorage.getItem('agent-hub.sessionDeckExpanded') === '1');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const toggleDeck = useCallback(() => {
    setDeckExpanded((prev) => {
      const next = !prev;
      localStorage.setItem('agent-hub.sessionDeckExpanded', next ? '1' : '0');
      return next;
    });
  }, []);

  const contextBudget = useMemo(() => {
    const modelName = model?.label.toLowerCase() ?? '';
    let limit = 128_000;
    if (modelName.includes('gemini') || modelName.includes('flash') || modelName.includes('pro')) {
      limit = 1_000_000;
    } else if (modelName.includes('claude') || modelName.includes('sonnet') || modelName.includes('opus')) {
      limit = 200_000;
    } else if (modelName.includes('ollama') || modelName.includes('llama') || modelName.includes('deepseek')) {
      limit = 32_768;
    }

    const historyChars = session.messages.reduce((sum, m) => sum + m.content.length + (m.thinking?.length ?? 0), 0);
    const historyTokens = Math.round(historyChars / 4);
    const attachmentChars = attachments.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);
    const attachmentTokens = Math.round(attachmentChars / 4);
    const systemTokens = 500;
    const usedTokens = historyTokens + attachmentTokens + systemTokens;
    const percentage = Math.min(100, Math.round((usedTokens / limit) * 100));

    return { usedTokens, limit, percentage, historyTokens, attachmentTokens, systemTokens };
  }, [session.messages, attachments, model?.label]);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [isEmbeddedToolsOpen, setIsEmbeddedToolsOpen] = useState(false);

  const tools = (
    <>
          <button
            type="button"
            onClick={() => setRenaming(session.title)}
            className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition"
            aria-label="Renombrar la conversación"
            title="Renombrar la conversación"
          >
            <Pencil className="w-3 h-3 text-cyan-400" />
          </button>
          <select
            value={session.permission ?? 'full'}
            onChange={(event) =>
              postToHost({ command: 'updateSession', sessionId, patch: { permission: event.target.value as SessionPermission } })
            }
            aria-label="Permisos del agente"
            title="Solo lectura quita al agente las herramientas de escritura. Solo Claude lo hace cumplir; los demás proveedores lo ignoran."
            className="text-[11px] px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 focus:outline-none focus:border-indigo-500"
          >
            <option value="full">Completo</option>
            <option value="readonly">Solo lectura</option>
          </select>
          <ConversationIndex session={session} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition cursor-pointer"
              aria-label="Exportar conversación"
              title="Exportar conversación (Markdown, HTML, JSON)"
            >
              <Download className="w-3 h-3 text-indigo-400" />
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-750 rounded-lg shadow-2xl py-1 z-30 text-xs animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => {
                    postToHost({ command: 'exportSession', sessionId, format: 'markdown' });
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 cursor-pointer transition"
                >
                  <span className="text-sm">📝</span>
                  <div>
                    <div className="font-medium text-[11px]">Markdown (.md)</div>
                    <div className="text-[10px] text-zinc-400">Documento estándar</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    postToHost({ command: 'exportSession', sessionId, format: 'html' });
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 cursor-pointer transition"
                >
                  <span className="text-sm">🌐</span>
                  <div>
                    <div className="font-medium text-indigo-300 text-[11px]">Reporte HTML (.html)</div>
                    <div className="text-[10px] text-zinc-400">Autónomo con tema oscuro</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    postToHost({ command: 'exportSession', sessionId, format: 'json' });
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 cursor-pointer transition"
                >
                  <span className="text-sm">📊</span>
                  <div>
                    <div className="font-medium text-[11px]">Transcripción JSON (.json)</div>
                    <div className="text-[10px] text-zinc-400">Datos y métricas completos</div>
                  </div>
                </button>
              </div>
            )}
          </div>
    </>
  );

  return (
    <div className="flex flex-col h-full space-y-2.5">
      {(!embedded || renaming !== null) && (
      <div
        className="flex items-center justify-between gap-2 px-1 text-xs shrink-0 border-l-2 pl-1.5"
        style={{ borderLeftColor: accent ?? 'transparent' }}
      >
        <AccentPicker
          current={accent}
          onPick={(color) => {
            setAccent(session.projectName, color);
            setAccentTick((tick) => tick + 1);
          }}
        />
        {renaming !== null ? (
          <form
            className="flex-1 min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              if (renaming.trim() && renaming.trim() !== session.title) postToHost({ command: 'updateSession', sessionId, patch: { title: renaming.trim() } });
              setRenaming(null);
            }}
          >
            <input
              autoFocus
              value={renaming}
              maxLength={80}
              aria-label="Nuevo título de la conversación"
              onChange={(event) => setRenaming(event.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(event) => event.key === 'Escape' && setRenaming(null)}
              className="w-full bg-zinc-900 border border-indigo-500 rounded px-2 py-0.5 text-xs text-zinc-100 focus:outline-none"
            />
          </form>
        ) : (
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-zinc-300 hover:text-indigo-300 transition font-medium p-1 rounded hover:bg-zinc-850"
          title={`${session.projectName || 'General'} / ${session.title}`}
        >
          <FolderGit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="hidden min-[420px]:inline max-w-[40%] truncate shrink-0 text-zinc-400 font-mono text-[11px]">{session.projectName || 'General'} /</span>
          <span className="min-w-0 truncate font-semibold text-zinc-200">{session.title}</span>
          <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
        </button>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {!embedded && (<>
          {tools}
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition"
            aria-label={`Historial, ${state.sessions.length} conversaciones`}
            title="Abrir el historial de conversaciones"
          >
            <Layers className="w-3 h-3 text-indigo-400" />
            <span><span className="hidden min-[420px]:inline">Historial </span>{state.sessions.length}</span>
          </button>
          <button
            type="button"
            onClick={onNewTask}
            className="flex items-center justify-center gap-1 text-[11px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow"
            aria-label="Nueva tarea"
            title="Crear nueva tarea en un proyecto"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden min-[420px]:inline">Nueva tarea</span>
          </button>
          </>)}
        </div>
      </div>
      )}

      {!focusMode && (
        <div className="shrink-0 space-y-2">
          {/* Barra de control compacta y desplegable */}
          <div className="flex items-center justify-between gap-x-1.5 px-2 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs shadow-xs overflow-x-auto no-scrollbar">
            {/* Selector interactivo de Cuenta, Modelo y Rol arriba en la sección compacta */}
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              <AccountBar
                sessionId={sessionId}
                accounts={state.accounts}
                selection={selection}
                compact={true}
              />
              <Roles
                selectedRole={session.protocolRole}
                onSelectRole={selectRole}
                handoffTo={session.handoffTo}
                compact={true}
              />
            </div>

            {embedded && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEmbeddedToolsOpen(!isEmbeddedToolsOpen)}
                  className={`p-1 rounded transition border cursor-pointer ${
                    isEmbeddedToolsOpen
                      ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                      : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
                  }`}
                  title="Opciones de la sesión (Permisos, Renombrar, Exportar)"
                >
                  <SlidersHorizontal className="w-3 h-3 text-zinc-400" />
                </button>
                {isEmbeddedToolsOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-750 rounded-lg shadow-2xl p-2.5 z-40 space-y-2 text-xs animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">Permisos:</span>
                      <select
                        value={session.permission ?? 'full'}
                        onChange={(e) => {
                          postToHost({ command: 'updateSession', sessionId, patch: { permission: e.target.value as SessionPermission } });
                        }}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700"
                      >
                        <option value="full">Completo</option>
                        <option value="readonly">Solo lectura</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(session.title);
                          setIsEmbeddedToolsOpen(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[11px]"
                      >
                        <Pencil className="w-3 h-3 text-cyan-400" />
                        <span>Renombrar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          postToHost({ command: 'exportSession', sessionId, format: 'markdown' });
                          setIsEmbeddedToolsOpen(false);
                        }}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[11px]"
                        title="Exportar Markdown"
                      >
                        <Download className="w-3 h-3 text-indigo-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Métricas clave y botón desplegar */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Medidor de contexto compacto con barra visual */}
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-850 border border-zinc-750 text-[11px]"
                title={`Contexto: ${formatTokens(contextBudget.usedTokens)} de ${formatTokens(contextBudget.limit)} tokens (${contextBudget.percentage}%)\nHistorial: ${formatTokens(contextBudget.historyTokens)} | Adjuntos: ${formatTokens(contextBudget.attachmentTokens)}`}
              >
                <Cpu className="w-3 h-3 text-indigo-400 shrink-0" />
                <div className="w-10 h-1 bg-zinc-700 rounded-full overflow-hidden hidden min-[360px]:block">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      contextBudget.percentage > 85 ? 'bg-red-500' : contextBudget.percentage > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${contextBudget.percentage}%` }}
                  />
                </div>
                <span className={`font-mono text-[10px] font-medium ${
                  contextBudget.percentage > 85 ? 'text-red-400' : contextBudget.percentage > 60 ? 'text-amber-400' : 'text-zinc-300'
                }`}>
                  {contextBudget.percentage}%
                </span>
              </div>

              {/* Gasto compacto */}
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-850 border border-zinc-750 text-[11px] font-mono text-zinc-300"
                title={`Gasto acumulado: $${spentUSD.toFixed(4)}${session.budgetUSD ? ` / Límite $${session.budgetUSD}` : ''}`}
              >
                <Wallet className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-400">${spentUSD.toFixed(spentUSD >= 1 ? 2 : 4)}</span>
              </div>

              {/* Botón Desplegar / Plegar */}
              <button
                type="button"
                onClick={toggleDeck}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer border ${
                  deckExpanded
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                }`}
                aria-expanded={deckExpanded}
                aria-label={deckExpanded ? 'Plegar panel de controles' : 'Desplegar panel de controles'}
                title={deckExpanded ? 'Plegar controles detallados' : 'Desplegar controles detallados (esfuerzo, rol, métricas y límites)'}
              >
                <SlidersHorizontal className="w-3 h-3 text-indigo-400 group-hover:text-white" />
                <span className="hidden min-[440px]:inline">{deckExpanded ? 'Plegar' : 'Desplegar'}</span>
                {deckExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Panel Desplegado / Expandido con organización modular */}
          {deckExpanded && (
            <div className="p-2.5 rounded-xl bg-zinc-900/95 border border-zinc-800 shadow-xl space-y-2.5 animate-message-fade">
              {/* Fila 1: Esfuerzo de razonamiento, Rol de protocolo y Permisos */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <Effort effort={effort ?? sessionEffort} supportedEfforts={model?.efforts ?? NO_EFFORTS} onChange={selectEffort} />
                  <Roles selectedRole={session.protocolRole} onSelectRole={selectRole} handoffTo={session.handoffTo} />
                </div>
                <div className="flex items-center gap-1.5 ml-auto text-[11px]">
                  <span className="text-zinc-400 font-medium">Permisos:</span>
                  <select
                    value={session.permission ?? 'full'}
                    onChange={(event) =>
                      postToHost({ command: 'updateSession', sessionId, patch: { permission: event.target.value as SessionPermission } })
                    }
                    aria-label="Permisos de sesión"
                    className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="full">Completo (Lectura y Escritura)</option>
                    <option value="readonly">Solo lectura</option>
                  </select>
                </div>
              </div>

              {/* Fila 3: Tarjetas de Métricas de Contexto y Límite de Gasto en Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                {/* Tarjeta Contexto */}
                <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-medium text-zinc-300">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      Ventana de Contexto
                    </span>
                    <span className="font-mono text-zinc-400 text-[10px]">
                      <strong className="text-zinc-200">{formatTokens(contextBudget.usedTokens)}</strong> / {formatTokens(contextBudget.limit)} ({contextBudget.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        contextBudget.percentage > 85 ? 'bg-red-500' : contextBudget.percentage > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${contextBudget.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-0.5">
                    <span>Historial: {formatTokens(contextBudget.historyTokens)}</span>
                    <span>Adjuntos: {formatTokens(contextBudget.attachmentTokens)}</span>
                    <span>Sistema: {formatTokens(contextBudget.systemTokens)}</span>
                  </div>
                </div>

                {/* Tarjeta Presupuesto y Gasto */}
                <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-medium text-zinc-300">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                      Gasto de la Sesión
                    </span>
                    <span className="font-mono text-emerald-400 font-semibold">${spentUSD.toFixed(4)}</span>
                  </div>
                  {session.budgetUSD ? (
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden" title={`${budgetPercent}% del límite`}>
                      <div
                        className={`h-full rounded-full ${budgetPercent >= 100 ? 'bg-red-500' : budgetPercent > 75 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${budgetPercent}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-1.5 bg-zinc-800/50 rounded-full" />
                  )}
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-0.5">
                    <span>{session.budgetUSD ? `${budgetPercent}% consumido` : 'Sin límite asignado'}</span>
                    <label className="flex items-center gap-1">
                      <span>Límite $:</span>
                      <input
                        key={session.budgetUSD ?? 'none'}
                        type="number"
                        min="0"
                        step="0.5"
                        defaultValue={session.budgetUSD ?? ''}
                        placeholder="sin límite"
                        aria-label="Límite de gasto en USD"
                        onBlur={(event) => setBudget(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                        className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1 text-right text-zinc-200 focus:outline-none focus:border-indigo-500"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Fila 4: Telemetría de cuenta (semana, 5h, tokens in/out) */}
              <Usage activeTelemetry={telemetry} />

              {/* Fila 5: Quota Notice si aplica */}
              <Quota telemetry={telemetry} accounts={state.accounts} activeAccount={account} onFailover={failover} />

              {/* Fila 6: Onboarding si aún no hay mensajes */}
              {session.messages.length === 0 && <Onboarding state={state} />}
            </div>
          )}
        </div>
      )}

      {session.loopConfig?.active && (
        <div className="bg-gradient-to-r from-purple-950/70 via-indigo-950/70 to-purple-950/70 border-b border-purple-500/40 px-3.5 py-2 flex items-center justify-between gap-3 text-xs shadow-inner shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
            </span>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-semibold text-purple-300 shrink-0">
                Modo Loop (Iteración {session.loopConfig.iteration}{session.loopConfig.maxIterations ? `/${session.loopConfig.maxIterations}` : ''}):
              </span>
              <span className="text-zinc-200 truncate font-mono text-[11px]" title={session.loopConfig.instruction}>
                "{session.loopConfig.instruction}"
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => postToHost({ command: 'finishLoop', sessionId })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium text-[11px] transition shadow-sm cursor-pointer ${
                session.loopConfig.stopAfterCurrent
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/50 hover:bg-amber-500/30'
                  : 'bg-purple-600/80 hover:bg-purple-500 text-white'
              }`}
              title={session.loopConfig.stopAfterCurrent ? 'Clic para seguir iterando' : 'Deja terminar la iteración en curso y no lanza la siguiente'}
            >
              <Pin className="w-3 h-3" />
              <span>{session.loopConfig.stopAfterCurrent ? 'Para al terminar · Deshacer' : 'Parar al terminar'}</span>
            </button>
            <button
              type="button"
              onClick={() => postToHost({ command: 'stopLoop', sessionId })}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-600/90 hover:bg-red-500 text-white font-medium text-[11px] transition shadow-sm cursor-pointer"
              title="Corta el turno en curso y detiene el bucle"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Detener ya</span>
            </button>
          </div>
        </div>
      )}

      <MessageList
        key={sessionId}
        sessionId={sessionId}
        messages={session.messages}
        accountName={account?.name}
        accounts={state.accounts}
        role={session.protocolRole}
        fileDiffs={state.fileDiffs}
        live={state.live[sessionId]}
        onSendSuggestion={sendPrompt}
      />

      {account?.status !== 'connected' ? (
        <AccountNotice accounts={state.accounts} account={account} />
      ) : (
      <Editor
        focusTick={state.focusComposerTick}
        attachments={attachments}
        workspaceFiles={state.workspaceFiles}
        composerText={state.composerText}
        sessionId={sessionId}
        accountName={account?.name}
        isRunning={state.runningSessionIds.includes(sessionId)}
        queue={state.queues[sessionId] ?? NO_QUEUE}
        mentionAgents={mentionAgents}
        dispatch={dispatch}
        onSend={sendPrompt}
      />
      )}
    </div>
  );
};
