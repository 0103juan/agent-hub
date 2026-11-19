import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  Brain,
  Clock,
  MessageSquare,
  Plus,
  Square,
  Terminal,
  Users,
  X,
  LayoutGrid,
  Network,
  Columns3,
  Sparkles,
  Zap,
  Bug,
  ShieldCheck,
  Palette,
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  Compass,
  Cpu,
  Workflow,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  Radio,
  FolderGit2
} from 'lucide-react';
import { PendingHandoffs, SquadCanvas, ROLE_COLORS } from './SquadCanvas';
import { agentName } from '../../shared/agent-name';
import { agentLabel, flowNameFrom, groupByFlow } from '../../shared/flows';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { ConversationSession, ProtocolRole } from '../../shared/types';
import { HubState } from '../state/hub-state';
import { postToHost } from '../vscode-api';
import { relativeTime } from '../utils/format';
import { normalizeText } from '../../shared/workspace-actions';

const SPAWN_KEY = 'agent-hub.spawnForm';

/** El formulario recuerda el último proyecto y los roles elegidos. */
const readSpawn = (): { project: string; roles: Array<ProtocolRole | ''> } => {
  try {
    const saved = JSON.parse(localStorage.getItem(SPAWN_KEY) ?? '{}');
    return {
      project: typeof saved.project === 'string' ? saved.project : '',
      roles: Array.isArray(saved.roles) && saved.roles.length > 0 ? saved.roles : ['']
    };
  } catch {
    return { project: '', roles: [''] };
  }
};

interface Props {
  state: HubState;
  onOpenChat: (sessionId: string) => void;
}

const SELECT_CLASS =
  'bg-[#0a0e17] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition';

interface SquadPreset {
  id: string;
  name: string;
  tagline: string;
  icon: React.ReactNode;
  roles: ProtocolRole[];
  color: string;
}

const SQUAD_PRESETS: SquadPreset[] = [
  {
    id: 'full-protocol',
    name: 'Full Protocol',
    tagline: 'Especificación, pruebas, código y revisión',
    icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />,
    roles: ['arquitecto', 'tester', 'desarrollador', 'revisor'],
    color: 'border-amber-500/40 hover:border-amber-500/70 bg-amber-500/10 text-amber-200'
  },
  {
    id: 'feature-duo',
    name: 'Feature Duo',
    tagline: 'Diseño técnico e implementación ágil',
    icon: <Zap className="w-3.5 h-3.5 text-cyan-400" />,
    roles: ['arquitecto', 'desarrollador'],
    color: 'border-cyan-500/40 hover:border-cyan-500/70 bg-cyan-500/10 text-cyan-200'
  },
  {
    id: 'bugfix',
    name: 'Bugfix Squad',
    tagline: 'Causa raíz, test de regresión y arreglo',
    icon: <Bug className="w-3.5 h-3.5 text-rose-400" />,
    roles: ['depurador', 'tester', 'desarrollador'],
    color: 'border-rose-500/40 hover:border-rose-500/70 bg-rose-500/10 text-rose-200'
  },
  {
    id: 'quality-docs',
    name: 'Auditoría & Docs',
    tagline: 'Seguridad, buenas prácticas y documentación',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
    roles: ['revisor', 'documentador'],
    color: 'border-emerald-500/40 hover:border-emerald-500/70 bg-emerald-500/10 text-emerald-200'
  },
  {
    id: 'ui-design',
    name: 'UI & Frontend',
    tagline: 'Diseño gráfico, maquetación y componentes',
    icon: <Palette className="w-3.5 h-3.5 text-pink-400" />,
    roles: ['disenador', 'desarrollador'],
    color: 'border-pink-500/40 hover:border-pink-500/70 bg-pink-500/10 text-pink-200'
  }
];

const RoleIcon: React.FC<{ role?: string; className?: string }> = ({ role, className = 'w-3.5 h-3.5' }) => {
  switch (role) {
    case 'arquitecto':
      return <Compass className={`${className} text-blue-400`} />;
    case 'tester':
      return <CheckCircle2 className={`${className} text-emerald-400`} />;
    case 'desarrollador':
      return <Zap className={`${className} text-violet-400`} />;
    case 'revisor':
      return <ShieldCheck className={`${className} text-amber-400`} />;
    case 'depurador':
      return <Bug className={`${className} text-rose-400`} />;
    case 'coordinador':
      return <Workflow className={`${className} text-sky-400`} />;
    case 'documentador':
      return <FileText className={`${className} text-teal-400`} />;
    case 'disenador':
      return <Palette className={`${className} text-pink-400`} />;
    case 'explorador':
      return <Compass className={`${className} text-cyan-400`} />;
    case 'externo':
      return <Cpu className={`${className} text-violet-400`} />;
    default:
      return <Bot className={`${className} text-[#64748b]`} />;
  }
};

const SpawnForm: React.FC<{ projects: string[]; defaultExpanded?: boolean }> = ({ projects, defaultExpanded = true }) => {
  const initial = useMemo(readSpawn, []);
  const [project, setProject] = useState(initial.project);
  const [roles, setRoles] = useState<Array<ProtocolRole | ''>>(initial.roles);
  const [prompt, setPrompt] = useState('');
  const [flowName, setFlowName] = useState('');
  const [isolate, setIsolate] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const proposed = prompt.trim() ? flowNameFrom(prompt, '') : '';

  const applyPreset = (preset: SquadPreset) => {
    setRoles(preset.roles);
    if (!flowName.trim() && !prompt.trim()) {
      setFlowName(preset.name);
    }
  };

  const spawn = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      localStorage.setItem(SPAWN_KEY, JSON.stringify({ project, roles }));
    } catch {}
    postToHost({
      command: 'spawnAgents',
      projectName: project || undefined,
      roles: roles.map((role) => role || undefined),
      prompt,
      flowName: flowName.trim() || undefined,
      isolate
    });
    setPrompt('');
    setFlowName('');
  };

  return (
    <form
      onSubmit={spawn}
      className="hub-card p-3.5 sm:p-4 rounded-xl bg-[#0a0e17]/95 border border-[#202b3f] space-y-3.5 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#202b3f] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-500/20">
            <Users className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              Despachador de Escuadrón
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                Paralelo
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">
              Lanza agentes autónomos especializados con relevos automáticos y worktree aislado
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#162035] transition"
          title={expanded ? 'Minimizar formulario' : 'Expandir formulario'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <>
          {/* Fila de presets rápidos */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider font-mono">
              Formaciones rápidas
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {SQUAD_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition shrink-0 ${preset.color}`}
                  title={`${preset.name}: ${preset.tagline}`}
                >
                  {preset.icon}
                  <span>{preset.name}</span>
                  <span className="text-[10px] opacity-75 font-mono">({preset.roles.length})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Configuración de Proyecto y Nombre del Flujo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-[#cbd5e1] flex items-center gap-1 font-mono">
                <FolderGit2 className="w-3 h-3 text-[#94a3b8]" /> Proyecto de destino
              </label>
              <select
                aria-label="Proyecto"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className={`w-full ${SELECT_CLASS}`}
              >
                <option value="">Carpeta abierta (por defecto)</option>
                {projects.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-[#cbd5e1] flex items-center gap-1 font-mono">
                <Workflow className="w-3 h-3 text-[#94a3b8]" /> Nombre del flujo / misión
              </label>
              <input
                type="text"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder={proposed || 'Ej: Migración de componentes a Tailwind'}
                aria-label="Nombre del flujo"
                className={`w-full ${SELECT_CLASS}`}
              />
            </div>
          </div>

          {/* Roster de agentes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-[#94a3b8] tracking-wider font-mono">
              <span>Escuadrón asignado ({roles.length} {roles.length === 1 ? 'agente' : 'agentes'})</span>
              <button
                type="button"
                onClick={() => setRoles([...roles, roles[roles.length - 1] ?? ''])}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-normal normal-case transition"
              >
                <Plus className="w-3 h-3" /> Añadir otro agente
              </button>
            </div>

            <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {roles.map((role, index) => {
                const roleColor = (role && ROLE_COLORS[role]) || 'border-[#202b3f] bg-[#0c1220] text-slate-300';
                const roleConfig = role ? PROTOCOL_ROLES[role] : undefined;
                return (
                  <li
                    key={index}
                    className="flex items-center gap-2 p-1.5 rounded-lg bg-[#07090e]/80 border border-[#202b3f] text-[11px]"
                  >
                    <span className="font-mono text-slate-500 text-[10px] w-5 text-center shrink-0">
                      #{index + 1}
                    </span>
                    <div className="shrink-0">
                      <RoleIcon role={role} />
                    </div>
                    <select
                      aria-label={`Rol del agente ${index + 1}`}
                      value={role}
                      onChange={(e) =>
                        setRoles(
                          roles.map((current, i) => (i === index ? (e.target.value as ProtocolRole | '') : current))
                        )
                      }
                      className="flex-1 min-w-0 bg-transparent text-slate-100 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-[#0c1220] text-slate-300">
                        Sin rol (libre)
                      </option>
                      {Object.values(PROTOCOL_ROLES).map((config) => (
                        <option key={config.id} value={config.id} className="bg-[#0c1220] text-slate-100">
                          {config.label} — {config.description.slice(0, 50)}...
                        </option>
                      ))}
                    </select>

                    {role && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase border shrink-0 ${roleColor}`}
                      >
                        {roleConfig?.label || role}
                      </span>
                    )}

                    {roles.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Quitar agente ${index + 1}`}
                        onClick={() => setRoles(roles.filter((_, i) => i !== index))}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-[#162035] transition shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Misión inicial / prompt */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-slate-300 font-mono">Objetivo inicial para el equipo</span>
              <span className="font-mono text-slate-500">«&gt;&gt; nombre: mensaje» para comunicarse</span>
            </div>
            <textarea
              value={prompt}
              rows={2}
              aria-label="Tarea inicial"
              placeholder="Describe la tarea para que el equipo la resuelva coordinadamente..."
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 resize-none transition"
            />
          </div>

          {/* Opciones y Botón de Despacho */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#202b3f]">
            <label
              className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none"
              title="Los agentes trabajan en una rama y carpeta aparte; luego puedes revisar el diff, fusionar o descartar los cambios sin alterar tu rama activa"
            >
              <input
                type="checkbox"
                checked={isolate}
                onChange={(event) => setIsolate(event.target.checked)}
                className="w-4 h-4 rounded border-[#202b3f] bg-[#07090e] text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <span>Copia aparte aislada</span>
                <span className="text-[10px] text-slate-500 font-mono">(Git Worktree)</span>
              </span>
            </label>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 rounded-lg font-bold text-xs shadow-md shadow-cyan-500/20 transition hover:brightness-110 active:scale-[0.99]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                Lanzar {roles.length} {roles.length === 1 ? 'Agente' : 'Agentes'}
              </span>
              <span className="text-[10px] opacity-75 font-mono ml-1">(Ctrl+Enter)</span>
            </button>
          </div>
        </>
      )}
    </form>
  );
};

/** Turnos esperando cupo, en orden; se puede subir uno al frente o quitarlo. */
const WaitingQueue: React.FC<{ state: HubState }> = ({ state }) => {
  const waiting = state.waitingSessionIds.flatMap((id) => state.sessions.filter((session) => session.id === id));
  if (waiting.length === 0) return null;
  return (
    <section aria-label="Esperando turno" className="space-y-1.5 p-3 rounded-xl bg-amber-950/20 border border-amber-500/40">
      <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
        <Clock className="w-3.5 h-3.5 text-amber-400" aria-hidden />
        <span>Cola de espera por concurrencia ({waiting.length})</span>
      </div>
      <ul className="space-y-1.5">
        {waiting.map((session, index) => {
          const mates = session.squad ? state.sessions.filter((s) => s.squad === session.squad) : [session];
          const role = session.protocolRole;
          const roleColor = (role && ROLE_COLORS[role]) || 'border-[#202b3f] bg-[#0c1220] text-slate-300';
          return (
            <li
              key={session.id}
              className="flex items-center gap-2 p-2 bg-[#0c1220]/90 border border-[#202b3f] rounded-lg text-xs"
            >
              <span className="font-mono font-bold text-amber-400 shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">
                #{index + 1}
              </span>
              <RoleIcon role={role} />
              <span className="font-semibold text-white truncate">{agentLabel(session, mates)}</span>
              {role && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase border shrink-0 ${roleColor}`}>
                  {PROTOCOL_ROLES[role]?.label || role}
                </span>
              )}
              <span className="text-slate-500 font-mono text-[11px] truncate hidden sm:inline">{session.modelId}</span>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => postToHost({ command: 'queueAction', sessionId: session.id, action: 'prioritize' })}
                    className="px-2 py-0.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-100 border border-[#202b3f] text-[11px] font-medium transition cursor-pointer"
                  >
                    Subir al frente
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => postToHost({ command: 'queueAction', sessionId: session.id, action: 'cancel' })}
                  className="px-2 py-0.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-[11px] font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const AgentCard: React.FC<{
  session: ConversationSession;
  mates?: ConversationSession[];
  state: HubState;
  onOpenChat: (id: string) => void;
}> = ({ session, mates, state, onOpenChat }) => {
  const waitPosition = state.waitingSessionIds.indexOf(session.id) + 1;
  const running = state.runningSessionIds.includes(session.id) && waitPosition === 0;
  const live = state.live[session.id];
  const queued = state.queues[session.id]?.length ?? 0;
  const role = session.protocolRole;
  const roleConfig = role ? PROTOCOL_ROLES[role] : undefined;
  const roleColor = (role && ROLE_COLORS[role]) || 'border-[#202b3f] bg-[#0c1220] text-slate-300';
  const needsAttention = state.attentionSessionIds.includes(session.id);

  return (
    <li
      className={`hub-card hub-lift p-3 sm:p-3.5 rounded-xl border space-y-2.5 transition text-xs relative ${
        needsAttention
          ? 'border-rose-500/70 bg-gradient-to-r from-rose-950/25 via-[#0a0e17] to-[#0a0e17] shadow-lg shadow-rose-950/20'
          : running
          ? 'border-emerald-500/60 bg-gradient-to-r from-emerald-950/20 via-[#0a0e17] to-[#0a0e17] shadow-lg shadow-emerald-950/20'
          : waitPosition > 0
          ? 'border-sky-500/40 bg-[#0a0e17]'
          : 'border-[#202b3f] bg-[#0a0e17]'
      }`}
    >
      {/* Cabecera de la tarjeta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              running
                ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                : needsAttention
                ? 'bg-rose-400 animate-pulse shadow-sm shadow-rose-400'
                : waitPosition > 0
                ? 'bg-sky-400'
                : 'bg-[#475569]'
            }`}
            aria-hidden
          />
          <span className="font-bold text-[#f8fafc] text-sm truncate">{agentLabel(session, mates ?? [session])}</span>
          <RoleIcon role={role} />
          {role && (
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase border shrink-0 ${roleColor}`}>
              {roleConfig?.label || role}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {needsAttention && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full animate-pulse">
              <AlertCircle className="w-3 h-3" /> Requiere decisión
            </span>
          )}
          {running && (
            <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              ⚡ En ejecución
            </span>
          )}
          {waitPosition > 0 && (
            <span className="text-[11px] font-medium text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-full">
              ⏳ En espera #{waitPosition}
            </span>
          )}
          <span className="text-slate-400 font-mono text-[11px] bg-[#07090e]/80 px-2 py-0.5 rounded border border-[#202b3f]">
            {session.modelId}
          </span>
        </div>
      </div>

      {/* Contexto y detalles de estado */}
      <div className="flex flex-wrap items-center gap-2 text-slate-400 text-[11px]">
        {session.projectName && (
          <span className="flex items-center gap-1 text-slate-300 bg-[#07090e]/60 px-2 py-0.5 rounded border border-[#202b3f]">
            <FolderGit2 className="w-3 h-3 text-slate-400" />
            {session.projectName}
          </span>
        )}
        <span>{session.messageCount ?? session.messages.length} mensajes</span>
        <span>·</span>
        <span>Actualizado {relativeTime(session.updatedAt)}</span>
        {queued > 0 && <span className="text-amber-400 font-medium">· {queued} en cola</span>}
      </div>

      {/* Razonamiento / Thinking en vivo */}
      {live?.thinking && (
        <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/30 text-slate-100 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-300 uppercase tracking-wider font-mono">
            <Brain className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Razonamiento activo</span>
          </div>
          <p className="italic text-[11px] text-slate-300 line-clamp-3 leading-relaxed pl-5">
            "{live.thinking}"
          </p>
        </div>
      )}

      {/* Comandos de consola en ejecución */}
      {live && live.commands.length > 0 && (
        <div className="p-2 rounded-lg bg-black/80 border border-[#202b3f] font-mono text-[11px] space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 border-b border-[#202b3f] pb-1">
            <Terminal className="w-3 h-3 text-emerald-400" />
            <span>Actividad en terminal</span>
          </div>
          <ul className="space-y-0.5 text-emerald-300">
            {live.commands.slice(-3).map((command, index) => (
              <li key={index} className="flex gap-1.5 truncate">
                <span className="text-slate-500 select-none">$</span>
                <span className="truncate">{command}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Salida reciente de texto */}
      {live?.tail && !live.thinking && (
        <p className="text-slate-400 text-[11px] line-clamp-2 break-words bg-[#07090e]/40 p-2 rounded border border-[#202b3f] font-mono">
          {live.tail}
        </p>
      )}

      {/* Barra de Acciones */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#202b3f]">
        <div className="text-[11px] text-slate-500 font-mono">ID: {session.id.slice(0, 8)}</div>
        <div className="flex items-center gap-2">
          {running && (
            <button
              type="button"
              onClick={() => postToHost({ command: 'stopTurn', sessionId: session.id })}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-[11px] font-medium transition"
            >
              <Square className="w-3 h-3 fill-current" /> Detener Turno
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChat(session.id)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] shadow-sm shadow-cyan-500/30 transition hover:brightness-110"
          >
            <MessageSquare className="w-3.5 h-3.5 text-slate-950" /> Abrir Chat
            <ArrowRight className="w-3 h-3 text-slate-950" />
          </button>
        </div>
      </div>
    </li>
  );
};

const BOARD_COLUMNS = [
  { id: 'Esperando', label: 'En espera', color: 'text-sky-400', border: 'border-sky-500/40', dot: 'bg-sky-400' },
  { id: 'Trabajando', label: 'Trabajando', color: 'text-emerald-400', border: 'border-emerald-500/40', dot: 'bg-emerald-400 animate-pulse' },
  { id: 'Te espera', label: 'Te espera', color: 'text-rose-400', border: 'border-rose-500/40', dot: 'bg-rose-400 animate-pulse' },
  { id: 'Hecho', label: 'Completado', color: 'text-slate-400', border: 'border-[#202b3f]', dot: 'bg-slate-500' }
] as const;

const Board: React.FC<{ agents: ConversationSession[]; state: HubState; onOpenChat: (id: string) => void }> = ({
  agents,
  state,
  onOpenChat
}) => {
  const columnOf = (session: ConversationSession): (typeof BOARD_COLUMNS)[number]['id'] =>
    state.waitingSessionIds.includes(session.id)
      ? 'Esperando'
      : state.runningSessionIds.includes(session.id)
      ? 'Trabajando'
      : state.attentionSessionIds.includes(session.id)
      ? 'Te espera'
      : session.messages.some((m) => m.role === 'assistant') || (session.messageCount ?? 0) >= 2
      ? 'Hecho'
      : 'Esperando';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Tablero de agentes">
      {BOARD_COLUMNS.map((col) => {
        const cards = agents.filter((session) => columnOf(session) === col.id);
        return (
          <section
            key={col.id}
            aria-label={col.label}
            className="flex flex-col rounded-xl bg-[#0a0e17]/80 border border-[#202b3f] p-3 space-y-2 min-h-[340px]"
          >
            <div className={`flex items-center justify-between pb-2 border-b border-[#202b3f] text-xs font-bold uppercase tracking-wider ${col.color}`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span>{col.label}</span>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.2 rounded-full bg-[#07090e]/80 border border-[#202b3f] text-slate-300">
                {cards.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-0.5">
              {cards.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-center text-slate-500 text-xs border border-dashed border-[#202b3f] rounded-lg p-3">
                  <span>Sin agentes en esta fase</span>
                </div>
              ) : (
                cards.map((session) => {
                  const mates = session.squad ? agents.filter((s) => s.squad === session.squad) : [session];
                  const role = session.protocolRole;
                  const roleColor = (role && ROLE_COLORS[role]) || 'border-[#202b3f] bg-[#0c1220] text-slate-300';
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onOpenChat(session.id)}
                      className="hub-lift w-full text-left p-3 rounded-lg bg-[#0c1220] border border-[#202b3f] hover:border-cyan-500/60 text-xs space-y-1.5 transition block shadow-sm cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-white truncate">{agentLabel(session, mates)}</span>
                        {role && (
                          <span className={`text-[9px] font-mono px-1 py-0.2 rounded uppercase border shrink-0 ${roleColor}`}>
                            {PROTOCOL_ROLES[role]?.label || role}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] truncate">{session.modelId}</div>
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-mono pt-1 border-t border-[#202b3f]">
                        <span>{session.messageCount ?? session.messages.length} msgs</span>
                        <span>{relativeTime(session.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export const AgentsView: React.FC<Props> = ({ state, onOpenChat }) => {
  const [viewMode, setViewModeState] = useState<'cards' | 'canvas' | 'board'>(() => {
    const saved = localStorage.getItem('agent-hub.agentsView');
    return saved === 'canvas' || saved === 'board' ? saved : 'cards';
  });
  const setViewMode = (mode: 'cards' | 'canvas' | 'board') => {
    localStorage.setItem('agent-hub.agentsView', mode);
    setViewModeState(mode);
  };

  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'working' | 'attention' | 'queued'>('all');

  const isWorking = (session: ConversationSession) =>
    state.runningSessionIds.includes(session.id) && !state.waitingSessionIds.includes(session.id);

  const agents = state.sessions
    .filter(
      (session) =>
        session.squad ||
        state.runningSessionIds.includes(session.id) ||
        state.waitingSessionIds.includes(session.id) ||
        state.queues[session.id]?.length
    )
    .sort((a, b) => Number(isWorking(b)) - Number(isWorking(a)));

  const workingAgents = agents.filter(isWorking);
  const waitingAgents = agents.filter((s) => state.waitingSessionIds.includes(s.id));
  const attentionAgents = agents.filter((s) => state.attentionSessionIds.includes(s.id));

  const shownAgents = agents.filter((session) => {
    const mates = session.squad ? agents.filter((s) => s.squad === session.squad) : [session];
    const label = agentLabel(session, mates);
    const name = agentName(session);
    const q = normalizeText(agentFilter.trim());
    const matchesText =
      normalizeText(name).includes(q) ||
      normalizeText(label).includes(q) ||
      (session.squadName ? normalizeText(session.squadName).includes(q) : false);

    if (!matchesText) return false;

    if (statusFilter === 'working') return isWorking(session);
    if (statusFilter === 'attention') return state.attentionSessionIds.includes(session.id);
    if (statusFilter === 'queued') return state.waitingSessionIds.includes(session.id);
    return true;
  });

  const projects = [...new Set(state.sessions.flatMap((session) => (session.projectName ? [session.projectName] : [])))];
  const { flows, loose } = groupByFlow(shownAgents, state.runningSessionIds);

  return (
    <div className="space-y-3.5 w-full min-w-0 pb-6">
      {/* Barra de Cabecera Táctica */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#0a0e17]/95 border border-[#202b3f] shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-500/20 shrink-0">
            <Users className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">Coordinación de Agentes</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {agents.length} {agents.length === 1 ? 'agente' : 'agentes'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Despacho en paralelo, topología de relevos y ejecución de escuadrones
            </p>
          </div>
        </div>

        {/* Indicadores en vivo */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#07090e]/80 border border-[#202b3f] text-[11px] font-medium font-mono">
            <span className={`w-2 h-2 rounded-full ${workingAgents.length > 0 ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'}`} />
            <span className="text-slate-300">{workingAgents.length} en curso</span>
          </div>
          {waitingAgents.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#07090e]/80 border border-amber-500/30 text-[11px] font-medium text-amber-300 font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span>{waitingAgents.length} en cola</span>
            </div>
          )}
          {attentionAgents.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/40 border border-rose-500/40 text-[11px] font-bold text-rose-300 animate-pulse font-mono">
              <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
              <span>{attentionAgents.length} te esperan</span>
            </div>
          )}

          {workingAgents.length > 1 && (
            <button
              type="button"
              onClick={() => workingAgents.forEach((session) => postToHost({ command: 'stopTurn', sessionId: session.id }))}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition font-mono cursor-pointer"
              title="Detener el turno de todos los agentes que están trabajando"
            >
              <Square className="w-3 h-3 fill-current" />
              Detener {workingAgents.length}
            </button>
          )}

          {/* Selector de Vistas Segmentado */}
          <div className="flex items-center gap-1 bg-[#07090e] border border-[#202b3f] p-1 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Vista de lista"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                viewMode === 'canvas'
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Vista de topología / grafo"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Topología</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tablero por estado (Kanban)"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Tablero</span>
            </button>
          </div>
        </div>
      </div>

      <PendingHandoffs handoffs={state.pendingHandoffs} />

      <WaitingQueue state={state} />

      {viewMode === 'board' ? (
        <Board agents={agents} state={state} onOpenChat={onOpenChat} />
      ) : viewMode === 'canvas' ? (
        <SquadCanvas agents={agents} state={state} onOpenChat={onOpenChat} />
      ) : (
        <>
          <SpawnForm projects={projects} defaultExpanded={agents.length <= 2} />

          {/* Barra de Filtros y Búsqueda */}
          {agents.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-xl bg-[#07090e]/80 border border-[#202b3f]">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 ml-1 shrink-0" />
                <input
                  value={agentFilter}
                  onChange={(event) => setAgentFilter(event.target.value)}
                  placeholder={`Filtrar entre ${agents.length} agentes por nombre, rol o escuadrón…`}
                  aria-label="Filtrar agentes"
                  className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                {agentFilter && (
                  <button
                    type="button"
                    onClick={() => setAgentFilter('')}
                    className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtros de estado */}
              <div className="flex items-center gap-1 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-[#0c1220] text-white font-semibold border border-[#202b3f]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({agents.length})
                </button>
                {workingAgents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('working')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      statusFilter === 'working'
                        ? 'bg-emerald-950 text-emerald-300 font-semibold border border-emerald-500/30'
                        : 'text-[#94a3b8] hover:text-emerald-300'
                    }`}
                  >
                    En curso ({workingAgents.length})
                  </button>
                )}
                {attentionAgents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('attention')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      statusFilter === 'attention'
                        ? 'bg-rose-950 text-rose-300 font-semibold border border-rose-500/30'
                        : 'text-[#94a3b8] hover:text-rose-300'
                    }`}
                  >
                    Te esperan ({attentionAgents.length})
                  </button>
                )}
                {waitingAgents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('queued')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      statusFilter === 'queued'
                        ? 'bg-amber-950 text-amber-300 font-semibold border border-amber-500/30'
                        : 'text-[#94a3b8] hover:text-amber-300'
                    }`}
                  >
                    En cola ({waitingAgents.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Listado de Flujos y Escuadrones */}
          {agents.length === 0 ? (
            <div className="hub-card p-8 rounded-xl bg-[#0a0e17]/80 border border-[#202b3f] text-center space-y-3 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
                <Users className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-sm font-bold text-white">Sin agentes activos ni escuadrones</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Despliega tu primer escuadrón de agentes para coordinar especificación, código, pruebas y revisión de forma simultánea.
                </p>
              </div>
            </div>
          ) : shownAgents.length === 0 ? (
            <p className="text-center text-xs text-slate-400 p-6 bg-[#07090e]/40 rounded-xl border border-[#202b3f] font-mono">
              Ningún agente coincide con los criterios de búsqueda o filtro.
            </p>
          ) : (
            <div className="space-y-4" aria-label="Agentes">
              {flows.map((flow) => {
                const workingInFlow = flow.members.filter(isWorking);
                return (
                  <div key={flow.squad} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-[#0a0e17]/90 rounded-lg border border-[#202b3f]">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-100 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shrink-0 shadow-sm shadow-cyan-500/50" />
                        <span className="truncate">{flow.name}</span>
                        {flow.project && (
                          <span className="text-slate-400 font-normal text-[11px] bg-[#0c1220] px-2 py-0.5 rounded border border-[#202b3f] truncate font-mono">
                            {flow.project}
                          </span>
                        )}
                        <span className="text-slate-500 text-[11px] font-mono">
                          ({flow.members.length} {flow.members.length === 1 ? 'agente' : 'agentes'})
                        </span>
                      </div>

                      {workingInFlow.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {workingInFlow.length} trabajando
                          </span>
                        </div>
                      )}
                    </div>

                    <ul className="space-y-2.5">
                      {flow.members.map((session) => (
                        <AgentCard
                          key={session.id}
                          session={session}
                          mates={flow.members}
                          state={state}
                          onOpenChat={onOpenChat}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}

              {loose.length > 0 && (
                <div className="space-y-2">
                  {flows.length > 0 && (
                    <div className="px-2 py-1 text-xs font-bold text-[#94a3b8] uppercase tracking-wider font-mono">
                      Conversaciones Individuales ({loose.length})
                    </div>
                  )}
                  <ul className="space-y-2.5">
                    {loose.map((session) => (
                      <AgentCard
                        key={session.id}
                        session={session}
                        mates={loose}
                        state={state}
                        onOpenChat={onOpenChat}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Registro de Comunicaciones / Transmisiones entre Agentes */}
      {viewMode === 'cards' && state.comms.length > 0 && (
        <section
          aria-label="Comunicación entre agentes"
          className="hub-card p-3.5 sm:p-4 rounded-xl bg-[#0a0e17]/90 border border-[#202b3f] space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#202b3f]">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>Intercomunicador de Escuadrón (Transmisiones)</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#07090e] text-slate-400 border border-[#202b3f]">
              {state.comms.length} {state.comms.length === 1 ? 'relevo' : 'relevos'}
            </span>
          </div>

          <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {[...state.comms].reverse().map((message) => (
              <li
                key={message.id}
                className="p-2.5 bg-[#07090e]/80 border border-[#202b3f] rounded-lg text-xs space-y-1.5"
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="font-bold text-cyan-300 bg-cyan-950/40 px-1.5 py-0.2 rounded border border-cyan-500/20">
                    {message.from}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-bold text-violet-300 bg-violet-950/40 px-1.5 py-0.2 rounded border border-violet-500/20">
                    {message.to}
                  </span>
                  <span className="ml-auto text-slate-500 text-[10px]">
                    {new Date(message.at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-slate-200 whitespace-pre-wrap break-words leading-relaxed pl-1 text-[11px]">
                  {message.text}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
