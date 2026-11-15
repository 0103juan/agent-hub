import React, { useState } from 'react';
import { ArrowRight, Brain, Clock, MessageSquare, Plus, Square, Terminal, Users, X, LayoutGrid, Network, Columns3 } from 'lucide-react';
import { PendingHandoffs, SquadCanvas } from './SquadCanvas';
import { agentName } from '../../shared/agent-name';
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
  'bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-indigo-500';

const SpawnForm: React.FC<{ projects: string[] }> = ({ projects }) => {
  const initial = React.useMemo(readSpawn, []);
  const [project, setProject] = useState(initial.project);
  const [roles, setRoles] = useState<Array<ProtocolRole | ''>>(initial.roles);
  const [prompt, setPrompt] = useState('');
  const [isolate, setIsolate] = useState(true);

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
      isolate
    });
    setPrompt('');
  };

  return (
    <form onSubmit={spawn} className="max-w-3xl p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
      <div className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-indigo-400" />
        Crear agentes en paralelo
      </div>

      <select aria-label="Proyecto" value={project} onChange={(e) => setProject(e.target.value)} className={`w-full ${SELECT_CLASS}`}>
        <option value="">Carpeta abierta (por defecto)</option>
        {projects.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <ul className="space-y-1">
        {roles.map((role, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <select
              aria-label={`Rol del agente ${index + 1}`}
              value={role}
              onChange={(e) => setRoles(roles.map((current, i) => (i === index ? (e.target.value as ProtocolRole | '') : current)))}
              className={`flex-1 min-w-0 ${SELECT_CLASS}`}
            >
              <option value="">Sin rol (libre)</option>
              {Object.values(PROTOCOL_ROLES).map((config) => (
                <option key={config.id} value={config.id}>{config.label}</option>
              ))}
            </select>
            {roles.length > 1 && (
              <button
                type="button"
                aria-label={`Quitar agente ${index + 1}`}
                onClick={() => setRoles(roles.filter((_, i) => i !== index))}
                className="text-zinc-400 hover:text-red-400 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setRoles([...roles, roles[roles.length - 1] ?? ''])}
        className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-indigo-300 transition"
      >
        <Plus className="w-3 h-3" /> Otro agente
      </button>

      <textarea
        value={prompt}
        rows={2}
        aria-label="Tarea inicial"
        placeholder="Tarea inicial para todos (opcional). Se hablan con «>> nombre: mensaje»."
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-[11px] text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-indigo-500 resize-none"
      />

      <label className="flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer" title="Los agentes trabajan en una rama y carpeta aparte; luego fusionas o descartas">
        <input type="checkbox" checked={isolate} onChange={(event) => setIsolate(event.target.checked)} />
        <span>Copia aparte</span>
      </label>

      <button type="submit" className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-[11px] transition">
        Iniciar {roles.length} {roles.length === 1 ? 'agente' : 'agentes'} <span className="opacity-60">(Ctrl+Enter)</span>
      </button>
    </form>
  );
};

/** Turnos esperando cupo, en orden; se puede subir uno al frente o quitarlo. */
const WaitingQueue: React.FC<{ state: HubState }> = ({ state }) => {
  const waiting = state.waitingSessionIds.flatMap((id) => state.sessions.filter((session) => session.id === id));
  if (waiting.length === 0) return null;
  return (
    <section aria-label="Esperando turno" className="space-y-1.5">
      <h2 className="text-[11px] font-semibold text-amber-300">Esperando turno ({waiting.length})</h2>
      <ul className="space-y-1">
        {waiting.map((session, index) => (
          <li key={session.id} className="flex items-center gap-1.5 p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px]">
            <Clock className="w-3 h-3 text-amber-400 shrink-0" aria-hidden />
            <span className="font-mono text-zinc-400 shrink-0">#{index + 1}</span>
            <span className="font-semibold text-zinc-100 truncate">{agentName(session)}</span>
            <span className="ml-auto flex items-center gap-1 shrink-0">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => postToHost({ command: 'queueAction', sessionId: session.id, action: 'prioritize' })}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                >
                  Subir
                </button>
              )}
              <button
                type="button"
                onClick={() => postToHost({ command: 'queueAction', sessionId: session.id, action: 'cancel' })}
                className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-red-300 border border-zinc-700 transition"
              >
                Quitar
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const AgentCard: React.FC<{ session: ConversationSession; state: HubState; onOpenChat: (id: string) => void }> = ({ session, state, onOpenChat }) => {
  const waitPosition = state.waitingSessionIds.indexOf(session.id) + 1;
  const running = state.runningSessionIds.includes(session.id) && waitPosition === 0;
  const live = state.live[session.id];
  const queued = state.queues[session.id]?.length ?? 0;
  const role = session.protocolRole && PROTOCOL_ROLES[session.protocolRole]?.label;
  const needsAttention = state.attentionSessionIds.includes(session.id);

  return (
    <li className={`p-2.5 bg-zinc-900 border rounded-lg space-y-1.5 text-[11px] ${needsAttention ? 'border-amber-500/70' : 'border-zinc-800'}`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${running ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} aria-hidden />
        <span className="font-semibold text-zinc-100 truncate">{agentName(session)}</span>
        {needsAttention && <span className="text-amber-400 font-semibold shrink-0">· Te espera</span>}
        {role && <span className="text-purple-400 uppercase font-semibold shrink-0">{role}</span>}
        <span className="ml-auto text-zinc-400 font-mono truncate">{session.modelId}</span>
      </div>
      <div className="text-zinc-400">
        {running ? 'Trabajando' : waitPosition > 0 ? `En espera #${waitPosition}` : 'En espera'}
        {session.projectName && <> · {session.projectName}</>}
        {queued > 0 && <span className="text-amber-400"> · {queued} en cola</span>}
      </div>

      {live?.thinking && (
        <p className="flex gap-1.5 italic text-zinc-300 line-clamp-3">
          <Brain className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
          <span>{live.thinking}</span>
        </p>
      )}

      {live && live.commands.length > 0 && (
        <ul className="font-mono text-zinc-300 space-y-0.5">
          {live.commands.map((command, index) => (
            <li key={index} className="flex gap-1.5 truncate">
              <Terminal className="w-3 h-3 mt-0.5 text-zinc-400 shrink-0" />
              <span className="truncate">{command}</span>
            </li>
          ))}
        </ul>
      )}

      {live?.tail && <p className="text-zinc-400 line-clamp-2 break-words">{live.tail}</p>}

      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => onOpenChat(session.id)}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          <MessageSquare className="w-3 h-3 text-indigo-400" /> Abrir
        </button>
        {running && (
          <button
            type="button"
            onClick={() => postToHost({ command: 'stopTurn', sessionId: session.id })}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white transition"
          >
            <Square className="w-3 h-3 fill-current" /> Detener
          </button>
        )}
      </div>
    </li>
  );
};

const BOARD_COLUMNS = ['Esperando', 'Trabajando', 'Te espera', 'Hecho'] as const;

const Board: React.FC<{ agents: ConversationSession[]; state: HubState; onOpenChat: (id: string) => void }> = ({ agents, state, onOpenChat }) => {
  const columnOf = (session: ConversationSession): (typeof BOARD_COLUMNS)[number] =>
    state.waitingSessionIds.includes(session.id) ? 'Esperando'
      : state.runningSessionIds.includes(session.id) ? 'Trabajando'
      : state.attentionSessionIds.includes(session.id) ? 'Te espera'
      : session.messages.some((m) => m.role === 'assistant') || (session.messageCount ?? 0) >= 2 ? 'Hecho'
      : 'Esperando';

  return (
    <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-2" aria-label="Tablero de agentes">
      {BOARD_COLUMNS.map((column) => {
        const cards = agents.filter((session) => columnOf(session) === column);
        return (
          <section key={column} aria-label={column} className="space-y-1.5 min-w-0">
            <h3 className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">{column} <span className="font-mono">{cards.length}</span></h3>
            {cards.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpenChat(session.id)}
                className="w-full text-left p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-[11px] min-w-0"
              >
                <span className="block font-semibold text-zinc-100 truncate">{agentName(session)}</span>
                <span className="block text-zinc-400 truncate">
                  {(session.protocolRole && PROTOCOL_ROLES[session.protocolRole]?.label) || 'Sin rol'}
                </span>
                <span className="block text-zinc-500 font-mono truncate">
                  {session.messageCount ?? session.messages.length} msgs · {relativeTime(session.updatedAt)}
                </span>
              </button>
            ))}
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
  const isWorking = (session: ConversationSession) => state.runningSessionIds.includes(session.id) && !state.waitingSessionIds.includes(session.id);
  const agents = state.sessions
    .filter((session) => session.squad || state.runningSessionIds.includes(session.id) || state.waitingSessionIds.includes(session.id) || state.queues[session.id]?.length)
    .sort((a, b) => Number(isWorking(b)) - Number(isWorking(a)));
  const workingAgents = agents.filter(isWorking);
  const shownAgents = agents.filter((session) => normalizeText(agentName(session)).includes(normalizeText(agentFilter.trim())));
  const projects = [...new Set(state.sessions.flatMap((session) => (session.projectName ? [session.projectName] : [])))];

  return (
    <div className="space-y-3 w-full min-w-0">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-bold text-zinc-200">Panel de Coordinación</span>
        {workingAgents.length > 1 && (
          <button
            type="button"
            onClick={() => workingAgents.forEach((session) => postToHost({ command: 'stopTurn', sessionId: session.id }))}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-[11px] transition"
            title="Detener el turno de todos los agentes que están trabajando"
          >
            <Square className="w-3 h-3 fill-current" />
            Detener {workingAgents.length}
          </button>
        )}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded-md text-xs">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition ${viewMode === 'cards' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Vista de lista"
          >
            <LayoutGrid className="w-3 h-3" />
            <span>Lista</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('canvas')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition ${viewMode === 'canvas' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Vista de topología / grafo"
          >
            <Network className="w-3 h-3" />
            <span>Topología</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition ${viewMode === 'board' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Tablero por estado"
          >
            <Columns3 className="w-3 h-3" />
            <span>Tablero</span>
          </button>
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
          <SpawnForm projects={projects} />

      {agents.length > 3 && (
        <input
          value={agentFilter}
          onChange={(event) => setAgentFilter(event.target.value)}
          placeholder={`Filtrar entre ${agents.length} agentes…`}
          aria-label="Filtrar agentes"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
      )}
      {agents.length === 0 ? (
        <p className="text-center text-[11px] text-zinc-400 p-4">Aún no hay agentes activos ni en equipo.</p>
      ) : shownAgents.length === 0 ? (
        <p className="text-center text-[11px] text-zinc-400 p-4">Ningún agente coincide con el filtro.</p>
      ) : (
        <ul className="space-y-2" aria-label="Agentes">
          {shownAgents.map((session) => (
            <AgentCard key={session.id} session={session} state={state} onOpenChat={onOpenChat} />
          ))}
        </ul>
      )}

        </>
      )}

      {viewMode === 'cards' && state.comms.length > 0 && (
        <section aria-label="Comunicación entre agentes" className="space-y-1.5">
          <h2 className="text-[11px] font-semibold text-zinc-200">Comunicación ({state.comms.length})</h2>
          <ul className="space-y-1.5">
            {[...state.comms].reverse().map((message) => (
              <li key={message.id} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px]">
                <div className="flex items-center gap-1 font-mono text-purple-400">
                  <span>{message.from}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-400" />
                  <span>{message.to}</span>
                  <span className="ml-auto text-zinc-400">{new Date(message.at).toLocaleTimeString()}</span>
                </div>
                <p className="text-zinc-300 whitespace-pre-wrap break-words line-clamp-4">{message.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
