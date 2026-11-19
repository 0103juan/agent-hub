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
  desarrollador: 'border-violet-500/50 bg-violet-950/30 text-violet-300',
  revisor: 'border-amber-500/50 bg-amber-950/30 text-amber-300',
  externo: 'border-violet-500/50 bg-violet-950/30 text-violet-300',
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
  working: { label: 'Trabajando', dot: 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' },
  done: { label: 'Con respuesta', dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.7)]' },
  waiting: { label: 'Esperando', dot: 'bg-[#475569]' },
  queued: { label: 'En espera', dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' }
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
    <div className="mb-3 space-y-1.5 p-3 rounded-xl bg-[#07090e] border border-[#202b3f]">
      <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">Duración y costo por etapa</div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400 font-mono">Aún no hay datos de duración ni costo.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.session.id} className="text-[11px]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="truncate text-slate-200 font-semibold">{agentName(row.session)}</span>
                <span className="font-mono text-cyan-400 shrink-0 font-medium">
                  {[row.durationMs ? formatDuration(row.durationMs) : undefined, formatCost(row.costUSD)].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#07090e] border border-[#202b3f]/70 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400" style={{ width: `${Math.max(2, widthOf(row))}%` }} />
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
    <div className="mb-3 space-y-1.5 p-3 rounded-xl bg-[#07090e] border border-[#202b3f]">
      <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">Línea de tiempo</div>
      <ol className="space-y-1">
        {stages.map((session, index) => {
          const status = STAGE_STYLE[statusOf(session)];
          const position = state.waitingSessionIds.indexOf(session.id) + 1;
          const count = index > 0 ? relays(stages[index - 1], session) : 0;
          return (
            <li key={session.id}>
              {index > 0 && (
                <div className="ml-2 pl-2 border-l border-[#202b3f] my-1 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                  {count > 0 && <span className="text-cyan-400">↓ {count} relevo{count === 1 ? '' : 's'}</span>}
                </div>
              )}
              <button
                type="button"
                onClick={() => onOpenChat(session.id)}
                className="w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-[#0c1220] border border-transparent hover:border-[#202b3f] transition cursor-pointer"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} aria-hidden />
                <span className="font-semibold text-slate-100 truncate">{agentName(session)}</span>
                <span className="ml-auto text-[11px] font-mono text-slate-400 shrink-0">{status.label}{position > 0 ? ` #${position}` : ''}</span>
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
          <button type="button" onClick={() => finish('discard')} className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition cursor-pointer">
            Sí, descartar
          </button>
          <button type="button" aria-label="Cancelar" onClick={() => setConfirmDiscard(false)} className="text-slate-400 hover:text-white cursor-pointer p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDiscard(true)}
          className="px-2 py-0.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-rose-300 border border-rose-500/40 transition cursor-pointer font-mono"
        >
          Descartar copia
        </button>
      )}
    </span>
  );
};

const DIFF_STATUS_COLOR: Record<string, string> = { A: 'text-emerald-400', M: 'text-amber-400', D: 'text-rose-400' };

const DiffFileRow: React.FC<{ file: SquadDiffFile }> = ({ file }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-[11px] font-mono">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-1.5 text-left text-[#cbd5e1] hover:text-[#f8fafc]">
        <span className={`w-3 shrink-0 font-bold ${DIFF_STATUS_COLOR[file.status[0]] ?? 'text-[#94a3b8]'}`}>{file.status}</span>
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
    <ModalShell title="Revisar cambios" icon={<GitCompare className="w-4 h-4 text-cyan-400" />} widthClass="max-w-2xl" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {files === undefined ? (
          <p className="text-[11px] text-[#94a3b8]">Cargando cambios…</p>
        ) : files.length === 0 ? (
          <p className="text-[11px] text-slate-400 font-mono">La copia aparte no tiene cambios.</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((file) => (
              <DiffFileRow key={file.file} file={file} />
            ))}
          </ul>
        )}
      </div>
      <div className="p-3 border-t border-[#202b3f] bg-[#07090e]/80 text-[11px]">
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
    <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-xl border border-cyan-500/30 bg-[#07090e] text-xs">
      <GitBranch className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
      <span className="font-mono text-cyan-300 font-semibold truncate" title={isolated.isolatedBranch}>{isolated.isolatedBranch}</span>
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            postToHost({ command: 'squadDiff', sessionId: isolated.id });
            setReviewing(true);
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-slate-700 text-slate-200 border border-[#202b3f] transition font-mono text-xs cursor-pointer shadow-xs"
        >
          <GitCompare className="w-3.5 h-3.5 text-cyan-400" /> Revisar cambios
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
        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-100 border border-[#202b3f] normal-case font-normal transition cursor-pointer font-mono"
      >
        <FileText className="w-3.5 h-3.5 text-cyan-400" /> Informe
      </button>
      {open && (
        <ModalShell title="Informe del equipo" icon={<FileText className="w-4 h-4 text-cyan-400" />} widthClass="max-w-2xl" onClose={() => setOpen(false)}>
          <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono text-slate-200 whitespace-pre-wrap break-words bg-[#07090e]">
            {markdown ?? 'Generando informe…'}
          </pre>
          <div className="p-3 border-t border-[#202b3f] bg-[#07090e]/80 flex items-center gap-2 text-[11px] font-mono">
            <button
              type="button"
              disabled={markdown === undefined}
              onClick={copy}
              className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold transition cursor-pointer"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button
              type="button"
              disabled={markdown === undefined}
              onClick={() => markdown !== undefined && postToHost({ command: 'runAction', actionId: 'pull-request', sessionId: squadAgent.id, input: markdown })}
              title="Abre una terminal con gh pr create usando el informe como descripción"
              className="px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] disabled:opacity-40 text-slate-100 border border-[#202b3f] font-medium transition cursor-pointer"
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

  const buttonClass = 'p-1 rounded bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] transition cursor-pointer';
  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-1 text-[10px] text-[#94a3b8] font-mono">
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
              className={`w-2.5 h-2.5 rounded-full border ${(session.protocolRole && ROLE_COLORS[session.protocolRole]) || 'border-[#202b3f] text-slate-400'}`}
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
          <li key={handoff.id} className="p-2.5 bg-[#0c1220] border border-amber-500/50 rounded-xl text-[11px] space-y-1 shadow-sm">
            <div className="flex items-center gap-1 font-mono">
              <span className="font-bold text-cyan-300">{handoff.from}</span>
              <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="font-bold text-violet-300">{handoff.to}</span>
            </div>
            <p className="text-slate-300 whitespace-pre-wrap break-words line-clamp-6">{handoff.text}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => postToHost({ command: 'approveHandoff', id: handoff.id, approve: true })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition cursor-pointer"
              >
                <Check className="w-3 h-3" /> Aprobar
              </button>
              <button
                type="button"
                onClick={() => postToHost({ command: 'approveHandoff', id: handoff.id, approve: false })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-rose-300 border border-rose-500/40 transition cursor-pointer font-mono"
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
    return <p className="text-center text-xs text-slate-400 p-8 font-mono">No hay agentes en el equipo para graficar.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="p-4 bg-[#0a0e17] border border-[#202b3f] rounded-2xl relative overflow-hidden shadow-xl">
        <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span>Topología del Squad</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-cyan-400 font-semibold">{agents.length} agentes coordinados</span>
            {agents.some((session) => session.squad) && <TeamReport squadAgent={agents.find((session) => session.squad)!} state={state} />}
          </span>
        </div>

        <IsolationControls agents={agents} state={state} />

        <Timeline agents={agents} state={state} onOpenChat={onOpenChat} />

        <StageBars agents={agents} state={state} />

        {/* Nodos de agentes */}
        <ZoomPane agents={agents} onOpenChat={onOpenChat}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.map((session) => {
            const waitPosition = state.waitingSessionIds.indexOf(session.id) + 1;
            const isRunning = state.runningSessionIds.includes(session.id) && waitPosition === 0;
            const live = state.live[session.id];
            const role = session.protocolRole;
            const roleColor = (role && ROLE_COLORS[role]) || 'border-[#202b3f] bg-[#07090e] text-slate-300';

            return (
              <div
                key={session.id}
                onClick={() => onOpenChat(session.id)}
                className={`p-3 rounded-xl border transition cursor-pointer hover:border-cyan-400/60 shadow-sm relative ${roleColor} ${
                  isRunning ? 'ring-1 ring-emerald-500/60 shadow-[0_0_12px_rgba(52,211,153,0.25)]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-slate-400'}`}
                      aria-hidden
                    />
                    <span className="font-bold text-xs text-slate-100 truncate">{agentName(session)}</span>
                  </div>
                  {role && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase border border-current opacity-95">
                      {PROTOCOL_ROLES[role]?.label || role}
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 font-mono truncate mb-2">
                  {session.modelId} {isRunning ? '· Trabajando…' : waitPosition > 0 ? `· En espera #${waitPosition}` : '· En espera'}
                </div>

                {live?.commands && live.commands.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-300 truncate bg-[#07090e] border border-[#202b3f] px-2 py-0.5 rounded-lg shadow-xs">
                    <Terminal className="w-3 h-3 text-cyan-400 shrink-0" />
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
          <div className="mt-4 pt-3 border-t border-[#202b3f] space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
              Últimos relevos de mensajes:
            </div>
            <div className="space-y-1.5">
              {[...state.comms].slice(-4).reverse().map((msg) => (
                <div key={msg.id} className="flex items-center gap-2 text-xs font-mono text-slate-200 bg-[#07090e] p-2 rounded-xl border border-[#202b3f]">
                  <span className="font-bold text-cyan-300">{msg.from}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="font-bold text-violet-300">{msg.to}</span>
                  <span className="text-slate-400 truncate flex-1 ml-1">&ldquo;{msg.text}&rdquo;</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
