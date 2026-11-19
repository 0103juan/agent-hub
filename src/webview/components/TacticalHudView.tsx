import React, { useMemo } from 'react';
import { CountUp, magnet, rise } from './motion';
import { ArrowRight, BarChart3, Bot, Brain, CheckCircle2, Clock, Columns3, FileText, Layers, Loader2, MessageSquare, PauseCircle, Plug, Sparkles, Terminal, Users, Wrench } from 'lucide-react';
import { HubState } from '../state/hub-state';
import { ConversationSession } from '../../shared/types';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { ROLE_COLORS } from './SquadCanvas';
import { getAccent } from '../state/accent';
import { agentName } from '../../shared/agent-name';
import type { TerminalTabState } from './TerminalDrawer';

interface Props {
  state: HubState;
  session?: ConversationSession;
  workspaceDir: string;
  gitFilesCount: number;
  currentBranch: string;
  terminal?: TerminalTabState;
  terminalBadge: 'success' | 'error' | null;
  onOpenChat: (sessionId: string) => void;
  onOpenTerminal: () => void;
  onSwitchTab: (tab: 'chat' | 'agents' | 'memory' | 'documents' | 'mcps' | 'telemetry' | 'accounts') => void;
  onNewTask: () => void;
}

type Status = 'running' | 'waiting' | 'attention' | 'done' | 'idle';
const STATUS_LABEL: Record<Status, string> = { running: 'En curso', waiting: 'En espera', attention: 'Te espera', done: 'Respondió', idle: 'Sin turnos' };
const STATUS_TEXT: Record<Status, string> = { running: 'text-amber-300', waiting: 'text-sky-300', attention: 'text-rose-300', done: 'text-emerald-300', idle: 'text-slate-400' };

const CARD = 'hud-spot hud-rise relative rounded-2xl bg-gradient-to-b from-[#0c1220]/95 to-[#0a0e17]/95 border border-[#202b3f] hover:border-cyan-500/40 p-4 flex flex-col gap-3 min-w-0 shadow-lg backdrop-blur-md transition-all duration-200';
const CARD_HEAD = 'flex items-center justify-between gap-2 pb-2.5 border-b border-[#202b3f] text-[11px] font-bold uppercase tracking-[0.1em] text-slate-200';

const Ring: React.FC<{ r: number; ratio: number; color: string; width: number }> = ({ r, ratio, color, width }) => {
  const length = 2 * Math.PI * r;
  return (
    <>
      <circle cx="120" cy="120" r={r} fill="none" stroke="#162035" strokeWidth={width} />
      <circle cx="120" cy="120" r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
        strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(1, ratio))} className="transition-[stroke-dashoffset] duration-700" />
    </>
  );
};

export const TacticalHudView: React.FC<Props> = ({
  state,
  session,
  workspaceDir,
  gitFilesCount,
  currentBranch,
  terminal,
  terminalBadge,
  onOpenChat,
  onOpenTerminal,
  onSwitchTab,
  onNewTask
}) => {
  const statusOf = (s: ConversationSession): Status =>
    state.runningSessionIds.includes(s.id) ? 'running'
      : state.waitingSessionIds.includes(s.id) ? 'waiting'
      : state.attentionSessionIds.includes(s.id) ? 'attention'
      : s.messages.some((m) => m.role === 'assistant') ? 'done' : 'idle';

  const totalCostUSD = useMemo(
    () => state.sessions.reduce((acc, s) => acc + s.messages.reduce((sum, m) => sum + (m.costUSD ?? 0), 0), 0),
    [state.sessions]
  );
  // Aproximación de 4 caracteres por token: sirve de orden de magnitud, no de factura.
  const approxTokens = useMemo(
    () => Math.round(state.sessions.reduce((acc, s) => acc + s.messages.reduce((sum, m) => sum + m.content.length, 0), 0) / 4),
    [state.sessions]
  );
  const connectedAccounts = state.accounts.filter((a) => a.status === 'connected').length;
  const connectedMcps = state.mcps.filter((m) => m.status === 'connected').length;
  const recentSessions = useMemo(() => [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [state.sessions]);
  const roleSessions = useMemo(() => {
    const rank = (s: ConversationSession) => (state.runningSessionIds.includes(s.id) ? 0 : state.attentionSessionIds.includes(s.id) ? 1 : 2);
    return state.sessions.filter((s) => s.protocolRole).sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt).slice(0, 6);
  }, [state.sessions, state.runningSessionIds, state.attentionSessionIds]);
  // Las etapas son los agentes del equipo del chat activo, en el orden en que se crearon.
  const squadStages = session?.squad ? state.sessions.filter((s) => s.squad === session.squad && s.protocolRole) : [];
  const terminalLines = (terminal?.output ?? '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trimEnd().split('\n').slice(-14).join('\n');

  const notices = state.notices.slice(-12).reverse();
  // Con pocos avisos se repiten para que la cinta llene el ancho sin huecos.
  const tickerItems = notices.length ? Array.from({ length: Math.max(1, Math.ceil(8 / notices.length)) }, () => notices).flat() : [];

  const lastAnswer = (s: ConversationSession) =>
    [...s.messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())?.content.trim().slice(0, 160) ??
    'Conversación lista para recibir instrucciones.';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#07090e] text-slate-100 overflow-y-auto p-3 sm:p-4 pb-0 gap-3 relative selection:bg-cyan-500/30 selection:text-cyan-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.07),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.05),transparent_50%)] pointer-events-none" aria-hidden />

      {/* CABECERA TÁCTICA: COMMAND CENTER */}
      <div className="hud-spot hud-rise relative shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#0a0e17]/95 border border-[#202b3f] shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20 font-black">
            <Sparkles className="w-5 h-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-[0.1em] text-slate-100 uppercase">COMMAND CENTER</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span> LIVE HUD
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate flex items-center gap-2 mt-0.5">
              <code className="text-cyan-300/90 font-mono">📁 {workspaceDir || 'Sin carpeta'}</code>
              <span className="text-slate-600">•</span>
              {currentBranch
                ? <span className="font-mono text-emerald-400 font-semibold">⎇ {currentBranch}{gitFilesCount > 0 ? ` [+${gitFilesCount}]` : ''}</span>
                : <span className="font-mono text-slate-500">⚪ Sin Git</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenTerminal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition shadow-sm ${terminal?.running ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-[#0c1220] hover:bg-slate-800 text-slate-300 border-[#202b3f]'}`}>
            <Terminal className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
            Terminal
            {terminalBadge && <span className={`w-2 h-2 rounded-full ${terminalBadge === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`} aria-label={terminalBadge === 'error' ? 'El último comando falló' : 'El último comando terminó bien'} />}
          </button>
          <button type="button" onClick={onNewTask} {...magnet} className="hud-magnet px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0c1220] hover:bg-slate-800 text-slate-200 border border-[#202b3f] transition shadow-sm">
            + Nueva tarea
          </button>
          <button type="button" onClick={() => onSwitchTab('chat')} {...magnet}
            className="hud-magnet flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-md shadow-cyan-500/25 transition">
            Ir al chat <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {notices.length > 0 && (
        <div className="hud-ticker hud-rise relative shrink-0 overflow-hidden rounded-xl border border-[#202b3f] bg-[#0a0e17]/75 py-1.5 shadow-inner" style={rise(1)} aria-label="Actividad reciente">
          <div className="hud-marquee">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {tickerItems.map((notice, index) => (
                  <li key={index} className="flex items-center">
                    <button type="button" tabIndex={copy === 1 || index >= notices.length ? -1 : undefined} disabled={!notice.sessionId} onClick={() => notice.sessionId && onOpenChat(notice.sessionId)}
                      className="flex items-center gap-2 px-4 text-[11px] text-slate-300 enabled:hover:text-amber-300 whitespace-nowrap transition">
                      <span className="font-mono text-amber-400 font-bold">{new Date(notice.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {notice.text.length > 90 ? `${notice.text.slice(0, 90)}…` : notice.text}
                    </button>
                    <span className="text-[#334155]" aria-hidden>◆</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}

      <div className="relative grid grid-cols-1 min-[900px]:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)_minmax(220px,1fr)] gap-3.5 flex-1">
        {/* IZQUIERDA: agentes con rol y etapas del equipo */}
        <aside className="flex flex-col gap-3.5 min-w-0">
          <section className={CARD} style={rise(2)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5 text-violet-300">
                <Users className="w-3.5 h-3.5" aria-hidden />
                <span>Agentes con rol</span>
              </span>
              <span className="font-mono text-amber-400 font-bold">{state.sessions.filter((s) => s.protocolRole).length}</span>
            </div>
            {roleSessions.length === 0 && <p className="text-xs text-slate-400 py-1">Ningún chat tiene rol. Asígnalo al crear una tarea o desde la cabecera del chat.</p>}
            {roleSessions.map((s) => {
              const status = statusOf(s);
              return (
                <button key={s.id} type="button" onClick={() => onOpenChat(s.id)}
                  className={`text-left p-3 rounded-xl border transition-all duration-200 flex flex-col gap-1.5 shadow-sm ${
                    status === 'running'
                      ? 'border-amber-500/60 bg-amber-500/10 hover:border-amber-400'
                      : status === 'attention'
                      ? 'border-rose-500/50 bg-rose-500/10 hover:border-rose-400'
                      : 'border-[#202b3f] bg-[#07090e]/75 hover:border-slate-500'
                  }`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${ROLE_COLORS[s.protocolRole!] ?? 'border-slate-700 text-slate-300'}`}>
                      {PROTOCOL_ROLES[s.protocolRole!]?.label ?? s.protocolRole}
                    </span>
                    <span className={`font-mono text-[10px] font-bold ${STATUS_TEXT[status]}`}>
                      {STATUS_LABEL[status].toUpperCase()}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-slate-100 truncate">{s.title || agentName(s)}</span>
                  <span className="font-mono text-[10px] text-slate-400 truncate">📁 {s.projectName || 'Sin proyecto'}</span>
                </button>
              );
            })}
            {state.pendingHandoffs.length > 0 && (
              <button type="button" onClick={() => onSwitchTab('agents')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/15 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition shadow-sm">
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" aria-hidden />
                <span>{state.pendingHandoffs.length} traspaso{state.pendingHandoffs.length === 1 ? '' : 's'} por aprobar</span>
              </button>
            )}
          </section>

          <section className={CARD} style={rise(5)}>
            <div className={CARD_HEAD}>
              <span>Etapas del equipo</span>
              <span className="font-mono text-emerald-400 font-bold normal-case">{session?.squad ? `${squadStages.filter((s) => statusOf(s) === 'done').length}/${squadStages.length}` : '—'}</span>
            </div>
            {squadStages.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">El chat activo no pertenece a un equipo. Lanza el pipeline desde <b className="text-slate-200">Flujos</b> en el compositor o crea un equipo en <button type="button" onClick={() => onSwitchTab('agents')} className="underline text-amber-400 font-medium">Agentes</button>.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {squadStages.map((s, index) => {
                  const status = statusOf(s);
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => onOpenChat(s.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] transition-all hover:brightness-110 shadow-sm ${
                        status === 'running'
                          ? 'border-amber-500/50 bg-amber-500/15 text-amber-200 font-bold'
                          : status === 'done'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium'
                          : 'border-[#202b3f] bg-[#07090e]/60 text-slate-300 hover:border-slate-600'
                      }`}>
                        {status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" aria-hidden /> : status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden /> : <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden />}
                        <span className="font-mono text-slate-400 font-bold">{index + 1}.</span>
                        <span className="truncate font-sans font-semibold">{PROTOCOL_ROLES[s.protocolRole!]?.label ?? s.protocolRole}</span>
                        <span className={`ml-auto font-mono text-[10px] font-bold ${STATUS_TEXT[status]}`}>{STATUS_LABEL[status]}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>

        {/* CENTRO: dial de estado y estaciones de trabajo */}
        <section className="flex flex-col gap-3.5 min-w-0">
          <div className={`${CARD} items-center py-6 overflow-hidden`} style={rise(3)}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 320" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="hudGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path d="M 30 170 Q 200 40 300 140 T 570 170" fill="none" stroke="url(#hudGlow)" strokeWidth="1.2" strokeDasharray="4 4" />
            </svg>
            <div className="relative w-56 h-56">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 240 240" role="img"
                aria-label={`${connectedAccounts} de ${state.accounts.length} cuentas conectadas; ${connectedMcps} de ${state.mcps.length} MCPs conectados`}>
                <circle cx="120" cy="120" r="117" fill="none" stroke={state.runningSessionIds.length ? '#06b6d4' : '#334155'} strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="1 7"
                  className={state.runningSessionIds.length ? 'hud-orbit' : undefined} />
                <circle cx="120" cy="120" r="109" fill="#0a0e17" />
                <Ring r={105} width={8} color="#06b6d4" ratio={state.accounts.length ? connectedAccounts / state.accounts.length : 0} />
                <Ring r={85} width={5} color="#10b981" ratio={state.mcps.length ? connectedMcps / state.mcps.length : 0} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-5xl font-black font-mono text-slate-50 tracking-tight leading-none">
                  <CountUp value={state.runningSessionIds.length} format={(n) => String(Math.round(n))} />
                </span>
                <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest mt-1.5">Agentes en curso</span>
                <span className="text-[10px] font-mono text-slate-400 mt-1">{state.waitingSessionIds.length} en espera · {state.attentionSessionIds.length} te esperan</span>
              </div>
            </div>
            <div className="relative flex flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />Cuentas {connectedAccounts}/{state.accounts.length}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />MCPs {connectedMcps}/{state.mcps.length}</span>
            </div>
            <dl className="relative grid grid-cols-2 sm:grid-cols-4 w-full mt-3 pt-3 border-t border-[#202b3f] text-center divide-x divide-[#202b3f]">
              {[
                { label: 'Sesiones', value: state.sessions.length, format: (n: number) => String(Math.round(n)), tone: 'text-slate-100' },
                { label: 'Costo acum.', value: totalCostUSD, format: (n: number) => `$${n.toFixed(3)}`, tone: 'text-emerald-400' },
                { label: 'Cambios Git', value: gitFilesCount, format: (n: number) => (currentBranch ? String(Math.round(n)) : '—'), tone: 'text-emerald-300' },
                { label: 'Tokens aprox.', value: approxTokens, format: (n: number) => `${(n / 1000).toFixed(1)}k`, tone: 'text-violet-300' }
              ].map((stat) => (
                <div key={stat.label} className="px-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</dt>
                  <dd className={`font-mono text-base font-black ${stat.tone}`}><CountUp value={stat.value} format={stat.format} /></dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={`${CARD} flex-1`} style={rise(6)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-2 text-cyan-300">
                <Layers className="w-4 h-4" aria-hidden />
                <span>Estaciones de trabajo</span>
              </span>
              <button type="button" onClick={() => onSwitchTab('chat')} className="flex items-center gap-1 normal-case tracking-normal text-[11px] font-semibold text-slate-300 hover:text-cyan-400 transition">
                <Columns3 className="w-3.5 h-3.5" aria-hidden />Chats en columnas <ArrowRight className="w-3 h-3" aria-hidden />
              </button>
            </div>
            {recentSessions.length === 0 && <p className="text-xs text-slate-400 py-2">Aún no hay chats. Crea uno con <b className="text-slate-200">+ Nueva tarea</b>.</p>}
            <div className="grid grid-cols-1 min-[1200px]:grid-cols-2 gap-3">
              {recentSessions.map((s, index) => {
                const accent = getAccent(s.projectName);
                const status = statusOf(s);
                return (
                  <button key={s.id} type="button" onClick={() => onOpenChat(s.id)} style={rise(7 + index)}
                    className={`hud-spot hud-rise group text-left p-3.5 rounded-xl bg-[#07090e]/80 border transition-all duration-200 hover:-translate-y-0.5 flex flex-col gap-2 relative overflow-hidden shadow-sm ${
                      s.id === session?.id ? 'border-cyan-500/70 shadow-cyan-500/10' : 'border-[#202b3f] hover:border-slate-500'
                    }`}>
                    {status === 'running'
                      ? <span className="aurora-border absolute top-0 inset-x-0 h-0.5" aria-hidden />
                      : accent && <span className="absolute top-0 inset-x-0 h-0.5" style={{ backgroundColor: accent }} aria-hidden />}
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent || '#a1a1aa' }} aria-hidden />
                          <span className="text-xs font-bold text-slate-100 truncate group-hover:text-cyan-300 transition">{agentName(s)}</span>
                        </span>
                        <span className="block text-[10px] font-mono text-slate-400 truncate mt-0.5">📁 {s.projectName || 'Sin proyecto'} · {s.modelId}</span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {s.protocolRole && <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${ROLE_COLORS[s.protocolRole] ?? 'border-slate-700 text-slate-300'}`}>{PROTOCOL_ROLES[s.protocolRole]?.label ?? s.protocolRole}</span>}
                        <span className={`font-mono text-[10px] font-bold ${STATUS_TEXT[status]}`}>{status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="En curso" /> : STATUS_LABEL[status]}</span>
                      </span>
                    </span>
                    <span className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{lastAnswer(s)}</span>
                    <span className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-[#162035] font-mono">
                      <span>{s.messages.length} mensajes</span>
                      <span className="text-cyan-400 font-semibold group-hover:translate-x-1 transition-transform">Abrir Chat →</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* DERECHA: MCPs y salida de la terminal */}
        <aside className="flex flex-col gap-3.5 min-w-0">
          <section className={CARD} style={rise(4)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Plug className="w-3.5 h-3.5" aria-hidden />
                <span>Servidores MCP</span>
              </span>
              <button type="button" onClick={() => onSwitchTab('mcps')} className="font-mono text-emerald-400 font-bold normal-case whitespace-nowrap hover:underline">{connectedMcps} conectados</button>
            </div>
            {state.mcps.length === 0 && <p className="text-xs text-slate-400 py-1">Sin servidores MCP configurados.</p>}
            {state.mcps.slice(0, 6).map((mcp) => (
              <div key={mcp.id} title={mcp.healthMessage || mcp.description} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#202b3f] bg-[#07090e]/75 text-xs shadow-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${mcp.status === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : mcp.status === 'needs_auth' ? 'bg-amber-400' : 'bg-slate-600'}`} aria-hidden />
                  <span className="truncate font-medium text-slate-200">{mcp.name}</span>
                </span>
                <span className={`font-mono text-[10px] font-semibold shrink-0 ${mcp.status === 'connected' ? 'text-emerald-400' : mcp.status === 'needs_auth' ? 'text-amber-300' : 'text-slate-500'}`}>
                  {mcp.status === 'connected' ? (mcp.tools?.length ? `${mcp.tools.length} tools` : 'conectado') : mcp.status === 'needs_auth' ? 'requiere login' : 'desconectado'}
                </span>
              </div>
            ))}
            {state.mcps.length > 6 && <button type="button" onClick={() => onSwitchTab('mcps')} className="text-[11px] font-medium text-slate-300 hover:text-amber-400 text-left transition">Ver los {state.mcps.length} →</button>}
          </section>

          <section className={`${CARD} flex-1`} style={rise(7)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Terminal className="w-3.5 h-3.5" aria-hidden />
                <span>Terminal</span>
              </span>
              <button type="button" onClick={onOpenTerminal} className="normal-case tracking-normal text-[11px] font-semibold text-slate-300 hover:text-amber-400 transition">Abrir shell →</button>
            </div>
            {terminal?.lastCommand && (
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] px-1">
                <span className="truncate text-slate-300">$ {terminal.lastCommand}</span>
                {terminal.running ? <span className="text-amber-400 font-bold animate-pulse">en curso</span>
                  : terminal.lastExitCode !== undefined && <span className={terminal.lastExitCode === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>exit {terminal.lastExitCode}</span>}
              </div>
            )}
            <pre className="flex-1 min-h-[140px] max-h-72 overflow-auto rounded-xl bg-[#07090e] border border-[#202b3f] p-3 font-mono text-[11px] leading-relaxed text-emerald-300/90 whitespace-pre-wrap break-all shadow-inner">
              {terminalLines || 'Sin salida todavía. Abre la shell para ejecutar tests, builds o git.'}
            </pre>
          </section>
        </aside>
      </div>

      {/* DOCK FLOTANTE CON LAS DEMÁS VISTAS */}
      <nav className="sticky bottom-0 z-20 flex justify-center pt-1 pb-3 pointer-events-none" aria-label="Otras vistas">
        <div className="hud-dock hud-rise pointer-events-auto flex flex-wrap justify-center gap-1 p-1.5 rounded-2xl bg-[#0a0e17]/90 backdrop-blur-xl border border-[#202b3f] shadow-2xl shadow-black/80" style={rise(9)}>
          {([
            { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-4 h-4 text-cyan-300" />, badge: state.attentionSessionIds.length },
            { id: 'agents', label: 'Agentes', icon: <Bot className="w-4 h-4 text-violet-300" />, badge: state.runningSessionIds.length },
            { id: 'memory', label: 'Memoria', icon: <Brain className="w-4 h-4 text-violet-300" />, badge: 0 },
            { id: 'documents', label: 'Documentos', icon: <FileText className="w-4 h-4 text-teal-300" />, badge: 0 },
            { id: 'mcps', label: 'MCPs', icon: <Wrench className="w-4 h-4 text-emerald-300" />, badge: 0 },
            { id: 'telemetry', label: 'Métricas', icon: <BarChart3 className="w-4 h-4 text-rose-300" />, badge: 0 },
            { id: 'accounts', label: 'Cuentas', icon: <Users className="w-4 h-4 text-amber-300" />, badge: 0 }
          ] as const).map((item) => (
            <button key={item.id} type="button" onClick={() => onSwitchTab(item.id)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-50 hover:bg-white/5 transition">
              {item.icon}<span>{item.label}</span>
              {item.badge > 0 && <span className="absolute -top-1 -right-1 min-w-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold leading-4 text-center shadow-sm">{item.badge}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};
