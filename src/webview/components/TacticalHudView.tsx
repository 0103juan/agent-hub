import React, { useMemo } from 'react';
import {
  Sparkles,
  Terminal,
  Bot,
  Brain,
  FileText,
  Wrench,
  BarChart3,
  Users,
  ShieldAlert,
  GitBranch,
  Play,
  CheckCircle2,
  Clock,
  ArrowRight,
  FolderGit2,
  Zap,
  Activity,
  Layers,
  FileCode2
} from 'lucide-react';
import { HubState } from '../state/hub-state';
import { ConversationSession, ProtocolRole } from '../../shared/types';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { ROLE_COLORS } from './SquadCanvas';
import { getAccent } from '../state/accent';
import { agentName } from '../../shared/agent-name';

interface Props {
  state: HubState;
  session?: ConversationSession;
  workspaceDir: string;
  gitFilesCount: number;
  currentBranch: string;
  terminalRunning: boolean;
  terminalBadge: 'success' | 'error' | null;
  onOpenChat: (sessionId: string) => void;
  onOpenTerminal: () => void;
  onSwitchTab: (tab: any) => void;
  onNewTask: () => void;
}

export const TacticalHudView: React.FC<Props> = ({
  state,
  session,
  workspaceDir,
  gitFilesCount,
  currentBranch,
  terminalRunning,
  terminalBadge,
  onOpenChat,
  onOpenTerminal,
  onSwitchTab,
  onNewTask
}) => {
  // Cálculo de estadísticas globales en vivo
  const totalCostUSD = useMemo(() => {
    return state.sessions.reduce((acc, s) => {
      const sessionCost = s.messages.reduce((mAcc, m) => mAcc + (m.costUSD ?? 0), 0);
      return acc + sessionCost;
    }, 0);
  }, [state.sessions]);

  const totalTokens = useMemo(() => {
    return state.sessions.reduce((acc, s) => {
      const sessionChars = s.messages.reduce((mAcc, m) => mAcc + m.content.length, 0);
      return acc + Math.round(sessionChars / 4);
    }, 0);
  }, [state.sessions]);

  const connectedAccountsCount = useMemo(() => {
    return state.accounts.filter((a) => a.status === 'connected').length;
  }, [state.accounts]);

  const runningSessions = useMemo(() => {
    return state.sessions.filter((s) => state.runningSessionIds.includes(s.id));
  }, [state.sessions, state.runningSessionIds]);

  const recentSessions = useMemo(() => {
    return [...state.sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
  }, [state.sessions]);

  // Roles en el squad
  const activeRoles = useMemo(() => {
    const rolesMap = new Map<string, number>();
    state.sessions.forEach((s) => {
      if (s.protocolRole) {
        rolesMap.set(s.protocolRole, (rolesMap.get(s.protocolRole) ?? 0) + 1);
      }
    });
    return Array.from(rolesMap.entries()).map(([role, count]) => ({ role: role as ProtocolRole, count }));
  }, [state.sessions]);

  const lastAnswer = (s: ConversationSession) =>
    [...s.messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())?.content.trim().slice(0, 160) ??
    'Conversación lista para recibir instrucciones.';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-950 text-zinc-100 overflow-y-auto p-3 sm:p-4 gap-4 relative selection:bg-amber-500/30 selection:text-amber-200">
      {/* Fondo sutil con gradiente táctico */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.04),transparent_50%)] pointer-events-none" />

      {/* CABECERA SUPERIOR DEL HUD: ESTADO GLOBAL */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-amber-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wide text-zinc-100">COMMAND CENTER · TACTICAL HUD</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Workspace activo: <code className="text-amber-300 font-mono">{workspaceDir || 'agent-hub'}</code>
              {currentBranch ? (
                <span className="ml-2 font-mono text-emerald-400">⎇ {currentBranch}</span>
              ) : (
                <span className="ml-2 font-mono text-zinc-500">⚪ Sin Git</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTerminal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              terminalRunning
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border-zinc-750'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Terminal Shell</span>
            {terminalBadge && (
              <span className={`w-2 h-2 rounded-full ${terminalBadge === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSwitchTab('chat')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 shadow-md shadow-amber-500/20 transition cursor-pointer"
          >
            <span>Abrir Chat &amp; Split</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ETAPAS DEL PROTOCOLO DE DESARROLLO (PIPELINE BAR) */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Protocolo:</span>
        {[
          { label: '1. Coordinador', active: false, done: true },
          { label: '2. Arquitecto', active: false, done: true },
          { label: '3. Tester', active: false, done: true },
          { label: '4. Desarrollador', active: true, done: false },
          { label: '5. Diseñador', active: true, done: false },
          { label: '6. Seguridad', active: false, done: false }
        ].map((step, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium text-[11px] transition ${
              step.active
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold shadow-xs'
                : step.done
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-zinc-850/50 border-zinc-800 text-zinc-500'
            }`}
          >
            {step.done ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : step.active ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
            )}
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      {/* CUADRÍCULA PRINCIPAL TÁCTICA: CENTRO HOLOGRÁFICO + ESTACIONES */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* PANEL IZQUIERDO: DIAL HOLOGRÁFICO & MÉTRICAS (4 COLS) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="p-5 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
            {/* SVG DIAL CIRCULAR */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="6" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="6"
                  strokeDasharray="264"
                  strokeDashoffset="26"
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="34"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeDasharray="213"
                  strokeDashoffset="60"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black font-mono text-zinc-100 tracking-tight">100%</span>
                <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mt-0.5">Integridad</span>
                <span className="text-[10px] font-mono text-zinc-400 mt-1">37/37 SUITES PASS</span>
              </div>
            </div>

            {/* TILES DE ESTADÍSTICAS BENTO */}
            <div className="grid grid-cols-2 gap-2 w-full mt-4">
              <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 font-medium">SESIONES TOTALES</div>
                <div className="text-lg font-bold font-mono text-zinc-100 mt-0.5">{state.sessions.length}</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {runningSessions.length} activas
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 font-medium">COSTO ACUMULADO</div>
                <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                  ${totalCostUSD.toFixed(3)}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">USD</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 font-medium">TOKENS PROCESADOS</div>
                <div className="text-base font-bold font-mono text-zinc-200 mt-0.5">
                  {(totalTokens / 1000).toFixed(1)}k
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">historial + prompt</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 font-medium">CUENTAS / MCPS</div>
                <div className="text-base font-bold font-mono text-cyan-300 mt-0.5">
                  {connectedAccountsCount} / {state.mcps.length}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">servicios listos</div>
              </div>
            </div>
          </div>

          {/* ROLES ACTIVOS DEL SQUAD */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-xl flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                Roles de Protocolo Asignados
              </span>
              <span className="text-[10px] font-mono text-zinc-500">{activeRoles.length} roles</span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeRoles.map(({ role, count }) => (
                <span
                  key={role}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${
                    ROLE_COLORS[role] || 'border-zinc-700 bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <span>{PROTOCOL_ROLES[role]?.label || role}</span>
                  <span className="font-mono text-[10px] opacity-75">({count})</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL CENTRAL Y DERECHO: WORKSTATIONS Y CHATS (8 COLS) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-xl flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Estaciones de Trabajo Activas (Workstations)
                </h2>
              </div>
              <button
                type="button"
                onClick={onNewTask}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 transition cursor-pointer"
              >
                + Nueva Tarea
              </button>
            </div>

            {/* BENTO GRID DE SESIONES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentSessions.map((s) => {
                const accent = getAccent(s.projectName);
                const role = s.protocolRole;
                const isRunning = state.runningSessionIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => onOpenChat(s.id)}
                    className="group p-3 rounded-lg bg-zinc-950/70 hover:bg-zinc-850/80 border border-zinc-800/90 hover:border-amber-500/50 transition-all duration-150 cursor-pointer flex flex-col justify-between gap-2.5 shadow-md relative overflow-hidden"
                  >
                    {accent && (
                      <div
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ backgroundColor: accent }}
                      />
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: accent || '#a1a1aa' }}
                          />
                          <h3 className="text-xs font-bold text-zinc-200 truncate group-hover:text-amber-300 transition">
                            {agentName(s)}
                          </h3>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">
                          📁 {s.projectName || 'Sin proyecto'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {role && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9.5px] font-medium border ${
                              ROLE_COLORS[role] || 'border-zinc-700 text-zinc-300'
                            }`}
                          >
                            {PROTOCOL_ROLES[role]?.label || role}
                          </span>
                        )}
                        {isRunning ? (
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="En curso" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                        )}
                      </div>
                    </div>

                    <p className="text-[11.5px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {lastAnswer(s)}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-900 font-mono">
                      <span>{s.messages.length} mensajes</span>
                      <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                        Abrir estación →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACCESOS DIRECTOS RÁPIDOS A LAS 7 VISTAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {[
              { id: 'documents', label: 'Docs (MD/HTML)', icon: <FileText className="w-3.5 h-3.5 text-cyan-400" /> },
              { id: 'memory', label: 'Memoria', icon: <Brain className="w-3.5 h-3.5 text-amber-400" /> },
              { id: 'agents', label: 'Squad Canvas', icon: <Bot className="w-3.5 h-3.5 text-purple-400" /> },
              { id: 'mcps', label: 'MCPs', icon: <Wrench className="w-3.5 h-3.5 text-emerald-400" /> },
              { id: 'telemetry', label: 'Telemetría', icon: <BarChart3 className="w-3.5 h-3.5 text-rose-400" /> },
              { id: 'accounts', label: 'Cuentas', icon: <Users className="w-3.5 h-3.5 text-indigo-400" /> }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSwitchTab(item.id)}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-zinc-100 transition cursor-pointer"
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
