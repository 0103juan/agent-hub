import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { CheckSquare, ChevronDown, Cpu, Download, FolderGit2, Layers, ListTree, Pin, Plus, Square, Wallet, X } from 'lucide-react';
import { resolveSelection } from '../../../shared/model-selection';
import { ConversationSession, ProtocolRole, ProviderType, QueuedMessage, ReasoningEffort, SessionPermission } from '../../../shared/types';
import { HubAction, HubState } from '../../state/hub-state';
import { postToHost } from '../../vscode-api';
import { EffortSelector } from '../EffortSelector';
import { ProtocolRoleSelector } from '../ProtocolRoleSelector';
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

interface Props {
  state: HubState;
  session: ConversationSession;
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
    </div>
  );
};

/** Menú con los mensajes del usuario y los fijados; llevar al mensaje es scroll a su ancla. */
const ConversationIndex: React.FC<{ session: ConversationSession }> = ({ session }) => {
  const [open, setOpen] = useState(false);
  const entries = session.messages.filter((m) => m.role === 'user' || m.pinned);
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
          {entries.length === 0 && <li className="p-1.5 text-[11px] text-zinc-400">Aún no hay mensajes.</li>}
          {entries.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => goTo(m.id)}
                className="flex w-full items-center gap-1.5 text-left px-1.5 py-1 rounded text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                {m.pinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Fijado" />}
                <span className="truncate">{m.content.trim().split('\n')[0] || '(sin texto)'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export const ChatView: React.FC<Props> = ({ state, session, dispatch, onOpenHistory, onNewTask }) => {
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

  const attachmentsRef = useRef(state.attachments);
  attachmentsRef.current = state.attachments;

  const sendPrompt = useCallback(
    async (prompt: string, planFirst?: boolean) => {
      dispatch({ type: 'clearAttachments' });
      const attachments = await withThumbnails(attachmentsRef.current);
      postToHost({ command: 'sendPrompt', sessionId, prompt, attachments, ...(planFirst ? { planFirst } : {}) });
    },
    [sessionId, dispatch]
  );

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
    const attachmentChars = state.attachments.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);
    const attachmentTokens = Math.round(attachmentChars / 4);
    const systemTokens = 500;
    const usedTokens = historyTokens + attachmentTokens + systemTokens;
    const percentage = Math.min(100, Math.round((usedTokens / limit) * 100));

    return { usedTokens, limit, percentage, historyTokens, attachmentTokens, systemTokens };
  }, [session.messages, state.attachments, model?.label]);

  return (
    <div className="flex flex-col h-full space-y-2.5">
      <div className="flex items-center justify-between gap-2 px-1 text-xs shrink-0">
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

        <div className="flex items-center gap-1 shrink-0">
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
          <button
            type="button"
            onClick={() => postToHost({ command: 'exportSession', sessionId })}
            className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition"
            aria-label="Exportar conversación a Markdown"
            title="Exportar conversación a Markdown"
          >
            <Download className="w-3 h-3 text-indigo-400" />
          </button>
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
        </div>
      </div>

      <div className="shrink-0">
        <AccountBar sessionId={sessionId} accounts={state.accounts} selection={selection} />
      </div>

      <div className="flex items-center gap-2 px-1 shrink-0">
        <Effort effort={effort ?? sessionEffort} supportedEfforts={model?.efforts ?? NO_EFFORTS} onChange={selectEffort} />
        <Roles selectedRole={session.protocolRole} onSelectRole={selectRole} />
      </div>

      <div className="shrink-0">
        <Usage activeTelemetry={telemetry} />
      </div>

      <div className="flex items-center justify-between px-2 py-1 text-[11px] text-zinc-400 bg-zinc-900/60 rounded border border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-zinc-400 text-[11px]">Contexto:</span>
          <span className="font-mono text-zinc-200 font-medium text-[11px]">{formatTokens(contextBudget.usedTokens)}</span>
          <span className="text-zinc-500 font-mono text-[10px]">/ {formatTokens(contextBudget.limit)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                contextBudget.percentage > 85 ? 'bg-red-500' : contextBudget.percentage > 60 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${contextBudget.percentage}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-400 w-8 text-right">{contextBudget.percentage}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-zinc-400 bg-zinc-900/60 rounded border border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Wallet className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Gasto:</span>
          <span className="font-mono text-zinc-200 font-medium">${spentUSD.toFixed(4)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.budgetUSD ? (
            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden" title={`${budgetPercent}% del límite`}>
              <div
                className={`h-full rounded-full ${budgetPercent >= 100 ? 'bg-red-500' : budgetPercent > 75 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          ) : null}
          <label className="flex items-center gap-1">
            <span>Límite $</span>
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
              className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1 font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </label>
        </div>
      </div>

      <Quota telemetry={telemetry} accounts={state.accounts} activeAccount={account} onFailover={failover} />

      {session.messages.length === 0 && <Onboarding state={state} />}

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
        attachments={state.attachments}
        workspaceFiles={state.workspaceFiles}
        composerText={state.composerText}
        sessionId={sessionId}
        accountName={account?.name}
        isRunning={state.runningSessionIds.includes(sessionId)}
        queue={state.queues[sessionId] ?? NO_QUEUE}
        dispatch={dispatch}
        onSend={sendPrompt}
      />
      )}
    </div>
  );
};
