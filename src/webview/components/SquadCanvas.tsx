import React, { useState } from 'react';
import { ArrowRight, Bot, Check, GitBranch, MessageSquare, Terminal, X } from 'lucide-react';
import { agentName } from '../../shared/agent-name';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { AgentMessage, ConversationSession } from '../../shared/types';
import { HubState } from '../state/hub-state';
import { postToHost } from '../vscode-api';

interface Props {
  agents: ConversationSession[];
  state: HubState;
  onOpenChat: (sessionId: string) => void;
}

export const ROLE_COLORS: Record<string, string> = {
  arquitecto: 'border-blue-500/50 bg-blue-950/30 text-blue-300',
  tester: 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300',
  desarrollador: 'border-purple-500/50 bg-purple-950/30 text-purple-300',
  revisor: 'border-amber-500/50 bg-amber-950/30 text-amber-300',
  externo: 'border-indigo-500/50 bg-indigo-950/30 text-indigo-300',
  explorador: 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300',
  documentador: 'border-teal-500/50 bg-teal-950/30 text-teal-300',
  disenador: 'border-pink-500/50 bg-pink-950/30 text-pink-300',
  coordinador: 'border-sky-500/50 bg-sky-950/30 text-sky-300',
  depurador: 'border-red-500/50 bg-red-950/30 text-red-300'
};

const PIPELINE_ORDER = ['coordinador', 'depurador', 'arquitecto', 'tester', 'desarrollador', 'revisor', 'documentador'];
const stageRank = (session: ConversationSession) => {
  const index = PIPELINE_ORDER.indexOf(session.protocolRole ?? '');
  return index === -1 ? PIPELINE_ORDER.length : index;
};

type StageStatus = 'working' | 'done' | 'waiting';

const STAGE_STYLE: Record<StageStatus, { label: string; dot: string }> = {
  working: { label: 'Trabajando', dot: 'bg-emerald-400 animate-pulse' },
  done: { label: 'Con respuesta', dot: 'bg-indigo-400' },
  waiting: { label: 'Esperando', dot: 'bg-zinc-600' }
};

const Timeline: React.FC<Props> = ({ agents, state, onOpenChat }) => {
  const stages = [...agents].sort((a, b) => stageRank(a) - stageRank(b));
  const statusOf = (session: ConversationSession): StageStatus =>
    state.runningSessionIds.includes(session.id) ? 'working' : (session.messageCount ?? session.messages.length) >= 2 ? 'done' : 'waiting';
  const relays = (from: ConversationSession, to: ConversationSession) =>
    state.comms.filter((msg) => msg.from === agentName(from) && msg.to === agentName(to)).length;

  return (
    <div className="mb-3 space-y-1">
      <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Línea de tiempo</div>
      <ol className="space-y-0.5">
        {stages.map((session, index) => {
          const status = STAGE_STYLE[statusOf(session)];
          const count = index > 0 ? relays(stages[index - 1], session) : 0;
          return (
            <li key={session.id}>
              {index > 0 && (
                <div className="ml-1 flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                  <span className="w-px h-3 bg-zinc-700" aria-hidden />
                  {count > 0 && <span>↓ {count} mensaje{count === 1 ? '' : 's'}</span>}
                </div>
              )}
              <button
                type="button"
                onClick={() => onOpenChat(session.id)}
                className="w-full flex items-center gap-2 text-left text-[11px] px-1.5 py-1 rounded hover:bg-zinc-800/60 transition"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} aria-hidden />
                <span className="font-semibold text-zinc-100 truncate">{agentName(session)}</span>
                <span className="ml-auto text-zinc-400 shrink-0">{status.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** Fin de un equipo con copia aparte: fusionar la rama o descartarla. */
const IsolationControls: React.FC<{ agents: ConversationSession[] }> = ({ agents }) => {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isolated = agents.find((session) => session.isolatedBranch);
  if (!isolated) return null;
  const finish = (action: 'merge' | 'discard') => {
    postToHost({ command: 'finishSquad', sessionId: isolated.id, action });
    setConfirmDiscard(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 p-2 rounded-lg border border-zinc-800 bg-zinc-950/50 text-[11px]">
      <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      <span className="font-mono text-zinc-200 truncate" title={isolated.isolatedBranch}>{isolated.isolatedBranch}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => finish('merge')}
          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
        >
          Fusionar
        </button>
        {confirmDiscard ? (
          <>
            <span className="text-amber-400">¿Descartar la copia y sus cambios?</span>
            <button type="button" onClick={() => finish('discard')} className="px-1.5 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white transition">
              Sí, descartar
            </button>
            <button type="button" aria-label="Cancelar" onClick={() => setConfirmDiscard(false)} className="text-zinc-400 hover:text-zinc-200">
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDiscard(true)}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-red-300 border border-zinc-700 transition"
          >
            Descartar copia
          </button>
        )}
      </span>
    </div>
  );
};

/** Traspasos entre agentes que esperan tu aprobación. */
export const PendingHandoffs: React.FC<{ handoffs: AgentMessage[] }> = ({ handoffs }) => {
  if (handoffs.length === 0) return null;
  return (
    <section aria-label="Traspasos pendientes" className="space-y-1.5">
      <h2 className="text-[11px] font-semibold text-amber-300">Traspasos pendientes ({handoffs.length})</h2>
      <ul className="space-y-1.5">
        {handoffs.map((handoff) => (
          <li key={handoff.id} className="p-2 bg-zinc-900 border border-amber-500/50 rounded-lg text-[11px] space-y-1">
            <div className="flex items-center gap-1 font-mono">
              <span className="font-bold text-indigo-300">{handoff.from}</span>
              <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="font-bold text-purple-300">{handoff.to}</span>
            </div>
            <p className="text-zinc-300 whitespace-pre-wrap break-words line-clamp-6">{handoff.text}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => postToHost({ command: 'approveHandoff', id: handoff.id, approve: true })}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                <Check className="w-3 h-3" /> Aprobar
              </button>
              <button
                type="button"
                onClick={() => postToHost({ command: 'approveHandoff', id: handoff.id, approve: false })}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-red-300 border border-zinc-700 transition"
              >
                <X className="w-3 h-3" /> Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const SquadCanvas: React.FC<Props> = ({ agents, state, onOpenChat }) => {
  if (agents.length === 0) {
    return <p className="text-center text-[11px] text-zinc-400 p-6">No hay agentes en el equipo para graficar.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl relative overflow-hidden glass-panel">
        <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider mb-2 flex items-center justify-between">
          <span>Topología del Squad</span>
          <span className="text-indigo-400">{agents.length} agentes coordinados</span>
        </div>

        <IsolationControls agents={agents} />

        <Timeline agents={agents} state={state} onOpenChat={onOpenChat} />

        {/* Nodos de agentes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {agents.map((session) => {
            const isRunning = state.runningSessionIds.includes(session.id);
            const live = state.live[session.id];
            const role = session.protocolRole;
            const roleColor = (role && ROLE_COLORS[role]) || 'border-zinc-700 bg-zinc-800/40 text-zinc-300';

            return (
              <div
                key={session.id}
                onClick={() => onOpenChat(session.id)}
                className={`p-2.5 rounded-lg border transition cursor-pointer hover:border-zinc-500 shadow-sm relative ${roleColor} ${
                  isRunning ? 'ring-1 ring-emerald-500/50 shadow-emerald-950/30' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}
                      aria-hidden
                    />
                    <span className="font-semibold text-xs text-zinc-100 truncate">{agentName(session)}</span>
                  </div>
                  {role && (
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded uppercase border border-current opacity-90">
                      {PROTOCOL_ROLES[role]?.label || role}
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-zinc-400 font-mono truncate mb-1">
                  {session.modelId} {isRunning ? '· Trabajando…' : '· En espera'}
                </div>

                {live?.commands && live.commands.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 truncate bg-black/30 px-1.5 py-0.5 rounded">
                    <Terminal className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{live.commands[live.commands.length - 1]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Flujo de mensajes recientes */}
        {state.comms.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 space-y-1.5">
            <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">
              Últimos relevos de mensajes:
            </div>
            <div className="space-y-1">
              {[...state.comms].slice(-4).reverse().map((msg) => (
                <div key={msg.id} className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-300 bg-zinc-950/50 p-1.5 rounded border border-zinc-800/60">
                  <span className="font-bold text-indigo-300">{msg.from}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="font-bold text-purple-300">{msg.to}</span>
                  <span className="text-zinc-400 truncate flex-1 ml-1">"{msg.text}"</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
