import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Check, FileText, GitBranch, GitCompare, Minus, Plus, RotateCcw, Terminal, X } from 'lucide-react';
import { agentName } from '../../shared/agent-name';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { AgentMessage, ConversationSession, SquadDiffFile } from '../../shared/types';
import { HubState } from '../state/hub-state';
import { postToHost } from '../vscode-api';
import { DiffLines } from './chat/DiffLines';
import { ModalShell } from './ModalShell';

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

type StageStatus = 'working' | 'done' | 'waiting' | 'queued';

const STAGE_STYLE: Record<StageStatus, { label: string; dot: string }> = {
  working: { label: 'Trabajando', dot: 'bg-emerald-400 animate-pulse' },
  done: { label: 'Con respuesta', dot: 'bg-indigo-400' },
  waiting: { label: 'Esperando', dot: 'bg-zinc-600' },
  queued: { label: 'En espera', dot: 'bg-amber-400' }
};

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};
const formatCost = (usd: number) => `$${usd.toFixed(2).replace('.', ',')}`;

/** Una barra por agente con su duración y costo, proporcionales al mayor del equipo. */
const StageBars: React.FC<{ agents: ConversationSession[]; state: HubState }> = ({ agents, state }) => {
  const rows = [...agents]
    .sort((a, b) => stageRank(a) - stageRank(b))
    .flatMap((session) => {
      const data = state.costs?.agents.find((entry) => entry.name === agentName(session));
      return data && (data.durationMs || data.costUSD) ? [{ session, durationMs: data.durationMs, costUSD: data.costUSD }] : [];
    });
  const maxDuration = Math.max(0, ...rows.map((row) => row.durationMs ?? 0));
  const maxCost = Math.max(0, ...rows.map((row) => row.costUSD));
  const widthOf = (row: (typeof rows)[number]) =>
    maxDuration > 0 ? ((row.durationMs ?? 0) / maxDuration) * 100 : maxCost > 0 ? (row.costUSD / maxCost) * 100 : 0;

  return (
    <div className="mb-3 space-y-1">
      <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Duración y costo por etapa</div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-zinc-500">Aún no hay datos de duración ni costo.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.session.id} className="text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-zinc-200">{agentName(row.session)}</span>
                <span className="font-mono text-zinc-400 shrink-0">
                  {[row.durationMs ? formatDuration(row.durationMs) : undefined, formatCost(row.costUSD)].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, widthOf(row))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Timeline: React.FC<Props> = ({ agents, state, onOpenChat }) => {
  const stages = [...agents].sort((a, b) => stageRank(a) - stageRank(b));
  const statusOf = (session: ConversationSession): StageStatus =>
    state.waitingSessionIds.includes(session.id) ? 'queued'
      : state.runningSessionIds.includes(session.id) ? 'working' : (session.messageCount ?? session.messages.length) >= 2 ? 'done' : 'waiting';
  const relays = (from: ConversationSession, to: ConversationSession) =>
    state.comms.filter((msg) => msg.from === agentName(from) && msg.to === agentName(to)).length;

  return (
    <div className="mb-3 space-y-1">
      <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Línea de tiempo</div>
      <ol className="space-y-0.5">
        {stages.map((session, index) => {
          const status = STAGE_STYLE[statusOf(session)];
          const position = state.waitingSessionIds.indexOf(session.id) + 1;
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
                <span className="ml-auto text-zinc-400 shrink-0">{status.label}{position > 0 ? ` #${position}` : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** Fusionar o descartar la copia aparte; descartar pide confirmación en línea. */
const FinishButtons: React.FC<{ sessionId: string; onDone?: () => void }> = ({ sessionId, onDone }) => {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const finish = (action: 'merge' | 'discard') => {
    postToHost({ command: 'finishSquad', sessionId, action });
    setConfirmDiscard(false);
    onDone?.();
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
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
  );
};

const DIFF_STATUS_COLOR: Record<string, string> = { A: 'text-emerald-400', M: 'text-amber-400', D: 'text-red-400' };

const DiffFileRow: React.FC<{ file: SquadDiffFile }> = ({ file }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-[11px] font-mono">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-1.5 text-left text-zinc-300 hover:text-zinc-100">
        <span className={`w-3 shrink-0 font-bold ${DIFF_STATUS_COLOR[file.status[0]] ?? 'text-zinc-400'}`}>{file.status}</span>
        <span className="truncate">{file.file}</span>
      </button>
      {open && <DiffLines diff={file.diff} />}
    </li>
  );
};

/** Revisión tipo PR de la copia aparte antes de fusionarla. */
const SquadReview: React.FC<{ isolated: ConversationSession; state: HubState; onClose: () => void }> = ({ isolated, state, onClose }) => {
  const files = state.squadDiff && state.squadDiff.squad === isolated.squad ? state.squadDiff.files : undefined;
  return (
    <ModalShell title="Revisar cambios" icon={<GitCompare className="w-4 h-4 text-indigo-400" />} widthClass="max-w-2xl" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {files === undefined ? (
          <p className="text-[11px] text-zinc-400">Cargando cambios…</p>
        ) : files.length === 0 ? (
          <p className="text-[11px] text-zinc-400">La copia aparte no tiene cambios.</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((file) => (
              <DiffFileRow key={file.file} file={file} />
            ))}
          </ul>
        )}
      </div>
      <div className="p-2.5 border-t border-zinc-800 bg-zinc-950/60 text-[11px]">
        <FinishButtons sessionId={isolated.id} onDone={onClose} />
      </div>
    </ModalShell>
  );
};

/** Fin de un equipo con copia aparte: revisar, fusionar la rama o descartarla. */
const IsolationControls: React.FC<{ agents: ConversationSession[]; state: HubState }> = ({ agents, state }) => {
  const [reviewing, setReviewing] = useState(false);
  const isolated = agents.find((session) => session.isolatedBranch);
  if (!isolated) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 p-2 rounded-lg border border-zinc-800 bg-zinc-950/50 text-[11px]">
      <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      <span className="font-mono text-zinc-200 truncate" title={isolated.isolatedBranch}>{isolated.isolatedBranch}</span>
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            postToHost({ command: 'squadDiff', sessionId: isolated.id });
            setReviewing(true);
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          <GitCompare className="w-3 h-3 text-indigo-400" /> Revisar cambios
        </button>
        <FinishButtons sessionId={isolated.id} />
      </span>
      {reviewing && <SquadReview isolated={isolated} state={state} onClose={() => setReviewing(false)} />}
    </div>
  );
};

/** Informe del equipo en markdown: se copia o se usa como cuerpo del PR (acción `pull-request`). */
const TeamReport: React.FC<{ squadAgent: ConversationSession; state: HubState }> = ({ squadAgent, state }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const markdown = state.teamReport && state.teamReport.squad === squadAgent.squad ? state.teamReport.markdown : undefined;
  const copy = () => {
    if (markdown === undefined) return;
    navigator.clipboard.writeText(markdown).then(() => setCopied(true), () => undefined);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          postToHost({ command: 'teamReport', sessionId: squadAgent.id });
          setCopied(false);
          setOpen(true);
        }}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 normal-case font-normal transition"
      >
        <FileText className="w-3 h-3 text-indigo-400" /> Informe
      </button>
      {open && (
        <ModalShell title="Informe del equipo" icon={<FileText className="w-4 h-4 text-indigo-400" />} widthClass="max-w-2xl" onClose={() => setOpen(false)}>
          <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-zinc-200 whitespace-pre-wrap break-words">
            {markdown ?? 'Generando informe…'}
          </pre>
          <div className="p-2.5 border-t border-zinc-800 bg-zinc-950/60 flex items-center gap-2 text-[11px]">
            <button
              type="button"
              disabled={markdown === undefined}
              onClick={copy}
              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium transition"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button
              type="button"
              disabled={markdown === undefined}
              onClick={() => markdown !== undefined && postToHost({ command: 'runAction', actionId: 'pull-request', sessionId: squadAgent.id, input: markdown })}
              title="Abre una terminal con gh pr create usando el informe como descripción"
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 font-medium transition"
            >
              Abrir PR
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
};

/** Zoom (botones o Ctrl+rueda) y arrastre para desplazar; con más de 5 agentes suma un minimapa. */
const ZoomPane: React.FC<{ agents: ConversationSession[]; onOpenChat: (sessionId: string) => void; children: React.ReactNode }> = ({ agents, onOpenChat, children }) => {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; lx: number; ly: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const zoom = (delta: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.5, Math.round((v.k + delta) * 10) / 10)) }));

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 0.1 : -0.1);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const buttonClass = 'p-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition';
  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-1 text-[10px] text-zinc-400 font-mono">
        <button type="button" aria-label="Alejar" onClick={() => zoom(-0.1)} className={buttonClass}><Minus className="w-3 h-3" /></button>
        <span className="w-8 text-center">{Math.round(view.k * 100)}%</span>
        <button type="button" aria-label="Acercar" onClick={() => zoom(0.1)} className={buttonClass}><Plus className="w-3 h-3" /></button>
        <button type="button" aria-label="Reiniciar vista" title="Reiniciar vista" onClick={() => setView({ x: 0, y: 0, k: 1 })} className={buttonClass}>
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
      <div
        ref={box}
        title="Arrastra para mover; Ctrl + rueda para el zoom"
        className="overflow-hidden max-h-[24rem] cursor-grab active:cursor-grabbing select-none"
        onPointerDown={(event) => {
          drag.current = { sx: event.clientX, sy: event.clientY, lx: event.clientX, ly: event.clientY, moved: false };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          if (!current.moved && Math.abs(event.clientX - current.sx) + Math.abs(event.clientY - current.sy) < 5) return;
          const dx = event.clientX - current.lx;
          const dy = event.clientY - current.ly;
          current.moved = true;
          current.lx = event.clientX;
          current.ly = event.clientY;
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={() => {
          suppressClick.current = Boolean(drag.current?.moved);
          drag.current = null;
          setTimeout(() => (suppressClick.current = false), 0);
        }}
        onPointerLeave={() => (drag.current = null)}
        onClickCapture={(event) => {
          if (suppressClick.current) event.stopPropagation();
        }}
      >
        <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }}>{children}</div>
      </div>
      {agents.length > 5 && (
        <div className="flex flex-wrap gap-1 mt-1.5" aria-label="Minimapa">
          {agents.map((session) => (
            <button
              key={session.id}
              type="button"
              title={agentName(session)}
              onClick={() => onOpenChat(session.id)}
              className={`w-2.5 h-2.5 rounded-full border ${(session.protocolRole && ROLE_COLORS[session.protocolRole]) || 'border-zinc-700 text-zinc-400'}`}
              style={{ backgroundColor: 'currentColor' }}
            />
          ))}
        </div>
      )}
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
          <span className="flex items-center gap-2">
            <span className="text-indigo-400">{agents.length} agentes coordinados</span>
            {agents.some((session) => session.squad) && <TeamReport squadAgent={agents.find((session) => session.squad)!} state={state} />}
          </span>
        </div>

        <IsolationControls agents={agents} state={state} />

        <Timeline agents={agents} state={state} onOpenChat={onOpenChat} />

        <StageBars agents={agents} state={state} />

        {/* Nodos de agentes */}
        <ZoomPane agents={agents} onOpenChat={onOpenChat}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {agents.map((session) => {
            const waitPosition = state.waitingSessionIds.indexOf(session.id) + 1;
            const isRunning = state.runningSessionIds.includes(session.id) && waitPosition === 0;
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
                  {session.modelId} {isRunning ? '· Trabajando…' : waitPosition > 0 ? `· En espera #${waitPosition}` : '· En espera'}
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
        </ZoomPane>

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
