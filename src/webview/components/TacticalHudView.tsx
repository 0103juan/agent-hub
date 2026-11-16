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
const STATUS_TEXT: Record<Status, string> = { running: 'text-amber-300', waiting: 'text-sky-300', attention: 'text-rose-300', done: 'text-emerald-300', idle: 'text-zinc-400' };

const CARD = 'hud-spot hud-rise relative rounded-xl bg-[#0e131f]/90 border border-[#202b3f] p-3.5 flex flex-col gap-2.5 min-w-0';
const CARD_HEAD = 'flex items-center justify-between gap-2 pb-2 border-b border-[#202b3f] text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300';

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
    <div className="flex-1 min-h-0 flex flex-col bg-[#07090e] text-zinc-100 overflow-y-auto p-3 sm:p-4 pb-0 gap-3 relative selection:bg-amber-500/30 selection:text-amber-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.07),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.05),transparent_50%)] pointer-events-none" aria-hidden />

      {/* CABECERA: dónde trabaja el chat activo */}
      <div className="hud-spot hud-rise relative shrink-0 flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-[#0e131f]/90 border border-[#202b3f]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-950 shadow-lg shadow-amber-500/20">
            <Sparkles className="w-5 h-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-[0.08em] text-zinc-100">COMMAND CENTER</h1>
            <p className="text-xs text-zinc-400 truncate">
              <code className="text-amber-300 font-mono">📁 {workspaceDir || 'Sin carpeta'}</code>
              {currentBranch
                ? <span className="ml-2 font-mono text-emerald-300">⎇ {currentBranch}{gitFilesCount > 0 ? ` [+${gitFilesCount}]` : ''}</span>
                : <span className="ml-2 font-mono text-zinc-400">⚪ Sin Git</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenTerminal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${terminal?.running ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-[#202b3f]'}`}>
            <Terminal className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
            Terminal
            {terminalBadge && <span className={`w-2 h-2 rounded-full ${terminalBadge === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`} aria-label={terminalBadge === 'error' ? 'El último comando falló' : 'El último comando terminó bien'} />}
          </button>
          <button type="button" onClick={onNewTask} {...magnet} className="hud-magnet px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-[#202b3f] transition">
            + Nueva tarea
          </button>
          <button type="button" onClick={() => onSwitchTab('chat')} {...magnet}
            className="hud-magnet flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20 transition">
            Ir al chat <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {notices.length > 0 && (
        <div className="hud-ticker hud-rise relative shrink-0 overflow-hidden rounded-lg border border-[#202b3f] bg-[#0e131f]/60 py-1.5" style={rise(1)} aria-label="Actividad reciente">
          <div className="hud-marquee">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {tickerItems.map((notice, index) => (
                  <li key={index} className="flex items-center">
                    <button type="button" tabIndex={copy === 1 || index >= notices.length ? -1 : undefined} disabled={!notice.sessionId} onClick={() => notice.sessionId && onOpenChat(notice.sessionId)}
                      className="flex items-center gap-2 px-4 text-[11px] text-zinc-300 enabled:hover:text-amber-200 whitespace-nowrap">
                      <span className="font-mono text-amber-300/90">{new Date(notice.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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

      <div className="relative grid grid-cols-1 min-[900px]:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)_minmax(220px,1fr)] gap-3 flex-1">
        {/* IZQUIERDA: agentes con rol y etapas del equipo */}
        <aside className="flex flex-col gap-3 min-w-0">
          <section className={CARD} style={rise(2)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-purple-300" aria-hidden />Agentes con rol</span>
              <span className="font-mono text-amber-300">{state.sessions.filter((s) => s.protocolRole).length}</span>
            </div>
            {roleSessions.length === 0 && <p className="text-xs text-zinc-400">Ningún chat tiene rol. Asígnalo al crear una tarea o desde la cabecera del chat.</p>}
            {roleSessions.map((s) => {
              const status = statusOf(s);
              return (
                <button key={s.id} type="button" onClick={() => onOpenChat(s.id)}
                  className={`text-left p-2.5 rounded-lg border transition flex flex-col gap-1 ${status === 'running' ? 'border-amber-500/50 bg-amber-500/5' : 'border-[#202b3f] bg-[#07090e]/60 hover:border-zinc-600'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`px-1.5 rounded border text-[10px] font-semibold uppercase ${ROLE_COLORS[s.protocolRole!] ?? 'border-zinc-700 text-zinc-300'}`}>{PROTOCOL_ROLES[s.protocolRole!]?.label ?? s.protocolRole}</span>
                    <span className={`font-mono text-[10px] ${STATUS_TEXT[status]}`}>{STATUS_LABEL[status].toUpperCase()}</span>
                  </span>
                  <span className="text-xs font-semibold text-zinc-200 truncate">{s.title || agentName(s)}</span>
                  <span className="font-mono text-[10px] text-zinc-400 truncate">📁 {s.projectName || 'Sin proyecto'}</span>
                </button>
              );
            })}
            {state.pendingHandoffs.length > 0 && (
              <button type="button" onClick={() => onSwitchTab('agents')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 hover:bg-amber-500/20 transition">
                <PauseCircle className="w-3.5 h-3.5" aria-hidden />{state.pendingHandoffs.length} traspaso{state.pendingHandoffs.length === 1 ? '' : 's'} por aprobar
              </button>
            )}
          </section>

          <section className={CARD} style={rise(5)}>
            <div className={CARD_HEAD}>
              <span>Etapas del equipo</span>
              <span className="font-mono text-emerald-300 normal-case">{session?.squad ? `${squadStages.filter((s) => statusOf(s) === 'done').length}/${squadStages.length}` : '—'}</span>
            </div>
            {squadStages.length === 0 ? (
              <p className="text-xs text-zinc-400">El chat activo no pertenece a un equipo. Lanza el pipeline desde <b className="text-zinc-200">Flujos</b> en el compositor o crea un equipo en <button type="button" onClick={() => onSwitchTab('agents')} className="underline text-amber-300">Agentes</button>.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {squadStages.map((s, index) => {
                  const status = statusOf(s);
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => onOpenChat(s.id)} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[11px] transition hover:brightness-125 ${status === 'running' ? 'border-amber-500/50 bg-amber-500/10 text-amber-200 font-semibold' : status === 'done' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-[#202b3f] text-zinc-300'}`}>
                        {status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : status === 'done' ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : <Clock className="w-3 h-3 text-zinc-400" aria-hidden />}
                        <span className="font-mono text-zinc-400">{index + 1}.</span>
                        <span className="truncate">{PROTOCOL_ROLES[s.protocolRole!]?.label ?? s.protocolRole}</span>
                        <span className={`ml-auto font-mono text-[10px] ${STATUS_TEXT[status]}`}>{STATUS_LABEL[status]}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>

        {/* CENTRO: dial de estado y estaciones de trabajo */}
        <section className="flex flex-col gap-3 min-w-0">
          <div className={`${CARD} items-center py-5 overflow-hidden`} style={rise(3)}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 320" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="hudGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path d="M 30 170 Q 200 40 300 140 T 570 170" fill="none" stroke="url(#hudGlow)" strokeWidth="1.2" strokeDasharray="4 4" />
            </svg>
            <div className="relative w-52 h-52">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 240 240" role="img"
                aria-label={`${connectedAccounts} de ${state.accounts.length} cuentas conectadas; ${connectedMcps} de ${state.mcps.length} MCPs conectados`}>
                <circle cx="120" cy="120" r="117" fill="none" stroke={state.runningSessionIds.length ? '#f59e0b' : '#334155'} strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="1 7"
                  className={state.runningSessionIds.length ? 'hud-orbit' : undefined} />
                <circle cx="120" cy="120" r="109" fill="#0e131f" />
                <Ring r={105} width={8} color="#f59e0b" ratio={state.accounts.length ? connectedAccounts / state.accounts.length : 0} />
                <Ring r={85} width={4} color="#38bdf8" ratio={state.mcps.length ? connectedMcps / state.mcps.length : 0} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-4xl font-black font-mono text-zinc-50"><CountUp value={state.runningSessionIds.length} format={(n) => String(Math.round(n))} /></span>
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-[0.14em]">Agentes en curso</span>
                <span className="text-[10px] font-mono text-zinc-400 mt-1">{state.waitingSessionIds.length} en espera · {state.attentionSessionIds.length} te esperan</span>
              </div>
            </div>
            <div className="relative flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-zinc-400 font-mono">
              <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Cuentas {connectedAccounts}/{state.accounts.length}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-1" />MCPs {connectedMcps}/{state.mcps.length}</span>
            </div>
            <dl className="relative grid grid-cols-2 sm:grid-cols-4 w-full mt-1 text-center divide-x divide-[#202b3f]">
              {[
                { label: 'Sesiones', value: state.sessions.length, format: (n: number) => String(Math.round(n)), tone: 'text-zinc-50' },
                { label: 'Costo acumulado', value: totalCostUSD, format: (n: number) => `$${n.toFixed(3)}`, tone: 'text-amber-300' },
                { label: 'Cambios Git', value: gitFilesCount, format: (n: number) => (currentBranch ? String(Math.round(n)) : '—'), tone: 'text-emerald-300' },
                { label: 'Tokens aprox.', value: approxTokens, format: (n: number) => `${(n / 1000).toFixed(1)}k`, tone: 'text-sky-300' }
              ].map((stat) => (
                <div key={stat.label} className="px-2">
                  <dt className="text-[10px] uppercase tracking-wider text-zinc-400">{stat.label}</dt>
                  <dd className={`font-mono text-base font-bold ${stat.tone}`}><CountUp value={stat.value} format={stat.format} /></dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={`${CARD} flex-1`} style={rise(6)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-amber-300" aria-hidden />Estaciones de trabajo</span>
              <button type="button" onClick={() => onSwitchTab('chat')} className="flex items-center gap-1 normal-case tracking-normal text-[11px] font-medium text-zinc-300 hover:text-amber-300 transition">
                <Columns3 className="w-3.5 h-3.5" aria-hidden />Chats en columnas <ArrowRight className="w-3 h-3" aria-hidden />
              </button>
            </div>
            {recentSessions.length === 0 && <p className="text-xs text-zinc-400">Aún no hay chats. Crea uno con <b className="text-zinc-200">+ Nueva tarea</b>.</p>}
            <div className="grid grid-cols-1 min-[1200px]:grid-cols-2 gap-2.5">
              {recentSessions.map((s, index) => {
                const accent = getAccent(s.projectName);
                const status = statusOf(s);
                return (
                  <button key={s.id} type="button" onClick={() => onOpenChat(s.id)} style={rise(7 + index)}
                    className={`hud-spot hud-rise group text-left p-3 rounded-lg bg-[#07090e]/70 border transition-[border-color,transform] duration-300 hover:-translate-y-0.5 flex flex-col gap-2 relative overflow-hidden ${s.id === session?.id ? 'border-amber-500/60' : 'border-[#202b3f] hover:border-amber-500/40'}`}>
                    {status === 'running'
                      ? <span className="aurora-border absolute top-0 inset-x-0 h-0.5" aria-hidden />
                      : accent && <span className="absolute top-0 inset-x-0 h-0.5" style={{ backgroundColor: accent }} aria-hidden />}
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent || '#a1a1aa' }} aria-hidden />
                          <span className="text-xs font-bold text-zinc-100 truncate group-hover:text-amber-300 transition">{agentName(s)}</span>
                        </span>
                        <span className="block text-[10px] font-mono text-zinc-400 truncate mt-0.5">📁 {s.projectName || 'Sin proyecto'} · {s.modelId}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.protocolRole && <span className={`px-1.5 rounded text-[10px] font-medium border ${ROLE_COLORS[s.protocolRole] ?? 'border-zinc-700 text-zinc-300'}`}>{PROTOCOL_ROLES[s.protocolRole]?.label ?? s.protocolRole}</span>}
                        <span className={`font-mono text-[10px] ${STATUS_TEXT[status]}`}>{status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" aria-label="En curso" /> : STATUS_LABEL[status]}</span>
                      </span>
                    </span>
                    <span className="text-[11.5px] text-zinc-300 line-clamp-2 leading-relaxed">{lastAnswer(s)}</span>
                    <span className="flex items-center justify-between text-[10px] text-zinc-400 pt-1.5 border-t border-[#202b3f] font-mono">
                      <span>{s.messages.length} mensajes</span>
                      <span className="text-amber-300/80 group-hover:translate-x-0.5 transition-transform">Abrir →</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* DERECHA: MCPs y salida de la terminal */}
        <aside className="flex flex-col gap-3 min-w-0">
          <section className={CARD} style={rise(4)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5"><Plug className="w-3.5 h-3.5 text-emerald-300" aria-hidden />Servidores MCP</span>
              <button type="button" onClick={() => onSwitchTab('mcps')} className="font-mono text-emerald-300 normal-case whitespace-nowrap hover:underline">{connectedMcps} conectados</button>
            </div>
            {state.mcps.length === 0 && <p className="text-xs text-zinc-400">Sin servidores MCP configurados.</p>}
            {state.mcps.slice(0, 6).map((mcp) => (
              <div key={mcp.id} title={mcp.healthMessage || mcp.description} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-[#202b3f] bg-[#07090e]/60 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${mcp.status === 'connected' ? 'bg-emerald-400' : mcp.status === 'needs_auth' ? 'bg-amber-400' : 'bg-zinc-500'}`} aria-hidden />
                  <span className="truncate text-zinc-200">{mcp.name}</span>
                </span>
                <span className={`font-mono text-[10px] shrink-0 ${mcp.status === 'connected' ? 'text-emerald-300' : mcp.status === 'needs_auth' ? 'text-amber-300' : 'text-zinc-400'}`}>
                  {mcp.status === 'connected' ? (mcp.tools?.length ? `${mcp.tools.length} tools` : 'conectado') : mcp.status === 'needs_auth' ? 'requiere login' : 'desconectado'}
                </span>
              </div>
            ))}
            {state.mcps.length > 6 && <button type="button" onClick={() => onSwitchTab('mcps')} className="text-[11px] text-zinc-300 hover:text-amber-300 text-left">Ver los {state.mcps.length} →</button>}
          </section>

          <section className={`${CARD} flex-1`} style={rise(7)}>
            <div className={CARD_HEAD}>
              <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-emerald-300" aria-hidden />Terminal</span>
              <button type="button" onClick={onOpenTerminal} className="normal-case tracking-normal text-[11px] font-medium text-zinc-300 hover:text-amber-300 transition">Abrir shell →</button>
            </div>
            {terminal?.lastCommand && (
              <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                <span className="truncate text-zinc-300">$ {terminal.lastCommand}</span>
                {terminal.running ? <span className="text-amber-300">en curso</span>
                  : terminal.lastExitCode !== undefined && <span className={terminal.lastExitCode === 0 ? 'text-emerald-300' : 'text-rose-300'}>exit {terminal.lastExitCode}</span>}
              </div>
            )}
            <pre className="flex-1 min-h-[140px] max-h-72 overflow-auto rounded-lg bg-[#06080e] border border-[#202b3f] p-2.5 font-mono text-[11px] leading-relaxed text-emerald-200/90 whitespace-pre-wrap break-all">
              {terminalLines || 'Sin salida todavía. Abre la shell para ejecutar tests, builds o git.'}
            </pre>
          </section>
        </aside>
      </div>

      {/* DOCK FLOTANTE CON LAS DEMÁS VISTAS (como la barra inferior de Awwwards) */}
      <nav className="sticky bottom-0 z-20 flex justify-center pt-1 pb-3 pointer-events-none" aria-label="Otras vistas">
        <div className="hud-dock hud-rise pointer-events-auto flex flex-wrap justify-center gap-1 p-1.5 rounded-2xl bg-[#0e131f]/85 backdrop-blur-md border border-[#202b3f] shadow-2xl shadow-black/60" style={rise(9)}>
          {([
            { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-4 h-4 text-amber-300" />, badge: state.attentionSessionIds.length },
            { id: 'agents', label: 'Agentes', icon: <Bot className="w-4 h-4 text-purple-300" />, badge: state.runningSessionIds.length },
            { id: 'memory', label: 'Memoria', icon: <Brain className="w-4 h-4 text-amber-300" />, badge: 0 },
            { id: 'documents', label: 'Documentos', icon: <FileText className="w-4 h-4 text-sky-300" />, badge: 0 },
            { id: 'mcps', label: 'MCPs', icon: <Wrench className="w-4 h-4 text-emerald-300" />, badge: 0 },
            { id: 'telemetry', label: 'Métricas', icon: <BarChart3 className="w-4 h-4 text-rose-300" />, badge: 0 },
            { id: 'accounts', label: 'Cuentas', icon: <Users className="w-4 h-4 text-indigo-300" />, badge: 0 }
          ] as const).map((item) => (
            <button key={item.id} type="button" onClick={() => onSwitchTab(item.id)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5">
              {item.icon}<span>{item.label}</span>
              {item.badge > 0 && <span className="absolute -top-1 -right-1 min-w-4 px-1 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-bold leading-4 text-center">{item.badge}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};
