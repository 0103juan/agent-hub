import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { BarChart3, Bot, Brain, Clock, Loader2, Maximize2, MessageSquare, Minimize2, Rows3, RefreshCw, Rows4, SplitSquareVertical, Users, Wrench } from 'lucide-react';
import { agentName } from '../shared/agent-name';
import { PROTOCOL_ROLES } from '../shared/protocol-roles';
import { HostMessage } from '../shared/ipc';
import { ProtocolRole } from '../shared/types';
import { AccountsView } from './components/AccountsView';
import { AgentsView } from './components/AgentsView';
import { CommandPalette } from './components/CommandPalette';
import { MemoryView } from './components/MemoryView';
import { Notifications } from './components/Notifications';
import { ACCENT_EVENT, getAccent } from './state/accent';
import { ROLE_COLORS } from './components/SquadCanvas';
import { ChatView } from './components/chat/ChatView';
import { MCPManagerView } from './components/MCPManagerView';
import { SessionDrawer } from './components/SessionDrawer';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { hubReducer, INITIAL_HUB_STATE } from './state/hub-state';
import { postToHost } from './vscode-api';

type Tab = 'chat' | 'agents' | 'memory' | 'mcps' | 'telemetry' | 'accounts';
type Density = 'comfortable' | 'compact';
const DENSITY_KEY = 'agent-hub.density';
const FOCUS_KEY = 'agent-hub.focus';
type DrawerMode = 'closed' | 'history' | 'newTask';

export const App: React.FC = () => {
  const [state, dispatch] = useReducer(hubReducer, INITIAL_HUB_STATE);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('closed');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [density, setDensity] = useState<Density>(() => (localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'));
  const toggleDensity = () => {
    const next = density === 'compact' ? 'comfortable' : 'compact';
    localStorage.setItem(DENSITY_KEY, next);
    setDensity(next);
  };
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem(FOCUS_KEY) === '1');
  const toggleFocus = useCallback(() => {
    setFocusMode((on) => {
      localStorage.setItem(FOCUS_KEY, on ? '0' : '1');
      return !on;
    });
  }, []);
  // Fuerza el repintado de los chips cuando se cambia el color de un proyecto.
  const [, setAccentTick] = useState(0);
  useEffect(() => {
    const bump = () => setAccentTick((tick) => tick + 1);
    window.addEventListener(ACCENT_EVENT, bump);
    return () => window.removeEventListener(ACCENT_EVENT, bump);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen((open) => !open);
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleFocus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => dispatch(event.data);
    window.addEventListener('message', onMessage);
    postToHost({ command: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => setIsSyncing(false), [state.mcps]);

  const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId);

  const switchSession = useCallback((sessionId: string) => postToHost({ command: 'switchSession', sessionId }), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);
  const activeSessionId = state.activeSessionId;
  const selectRole = useCallback(
    (protocolRole: ProtocolRole) => postToHost({ command: 'updateSession', sessionId: activeSessionId, patch: { protocolRole } }),
    [activeSessionId]
  );
  const runAction = useCallback(
    (actionId: string) => postToHost({ command: 'runAction', actionId, sessionId: activeSessionId, input: '' }),
    [activeSessionId]
  );
  // Un turno esperando cupo no está trabajando: se muestra aparte, con su posición.
  const runningSessions = state.sessions.filter(
    (candidate) => state.runningSessionIds.includes(candidate.id) && !state.waitingSessionIds.includes(candidate.id)
  );
  const waitingSessions = state.waitingSessionIds.flatMap((id) => state.sessions.filter((candidate) => candidate.id === id));
  const openChat = (sessionId: string) => {
    switchSession(sessionId);
    setActiveTab('chat');
  };
  const shownTab = focusMode ? 'chat' : activeTab;
  const deleteSession = (sessionId: string) => postToHost({ command: 'deleteSession', sessionId });
  const createSession = (projectName?: string, taskSlug?: string, protocolRole?: ProtocolRole) =>
    postToHost({ command: 'createSession', projectName, taskSlug, protocolRole });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'agents', label: `Agentes (${runningSessions.length})${state.attentionSessionIds.length > 0 ? ` ●${state.attentionSessionIds.length}` : ''}${state.pendingHandoffs.length > 0 ? ` ⏸${state.pendingHandoffs.length}` : ''}`, icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'memory', label: 'Memoria', icon: <Brain className="w-3.5 h-3.5" /> },
    { id: 'mcps', label: `MCPs (${state.mcps.length})`, icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'telemetry', label: 'Métricas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'accounts', label: `Cuentas (${state.accounts.length})`, icon: <Users className="w-3.5 h-3.5" /> }
  ];

  return (
    <div data-density={density} className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className={`flex items-center gap-1.5 min-w-0 ${focusMode ? 'invisible' : ''}`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
                className={`flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition shrink-0 ${
                  isActive ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.icon}
                <span className={isActive ? undefined : 'hidden min-[420px]:inline'}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleFocus}
            className={`p-1.5 rounded hover:bg-zinc-800 transition ${focusMode ? 'text-indigo-300' : 'text-zinc-400 hover:text-zinc-200'}`}
            aria-label={focusMode ? 'Salir del modo enfoque' : 'Modo enfoque'}
            aria-pressed={focusMode}
            title={`${focusMode ? 'Salir del modo enfoque' : 'Modo enfoque'} (Ctrl+Shift+F)`}
          >
            {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <Notifications notices={state.notices} onOpenSession={openChat} />
          {!focusMode && (<>
          <button
            onClick={toggleDensity}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            aria-label={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'}. Cambiar`}
            title={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'} (clic para cambiar)`}
          >
            {density === 'compact' ? <Rows4 className="w-3.5 h-3.5" /> : <Rows3 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => postToHost({ command: 'openBeside' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            aria-label="Abrir en un panel a la derecha"
            title="Abrir en un panel a la derecha"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => postToHost({ command: 'refreshAccounts' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            aria-label="Refrescar estado"
            title="Refrescar estado"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          </>)}
        </div>
      </div>

      {!focusMode && runningSessions.length + waitingSessions.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-800 overflow-x-auto shrink-0" aria-label="Agentes en curso">
          {[...runningSessions, ...waitingSessions].map((running) => {
            const role = running.protocolRole;
            const position = state.waitingSessionIds.indexOf(running.id) + 1;
            const accent = getAccent(running.projectName);
            return (
              <button
                key={running.id}
                type="button"
                onClick={() => openChat(running.id)}
                title={`${agentName(running)}${role ? ` · ${PROTOCOL_ROLES[role]?.label ?? role}` : ''}`}
                style={accent ? { borderColor: accent } : undefined}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] shrink-0 transition hover:brightness-125 ${(role && ROLE_COLORS[role]) || 'border-zinc-700 bg-zinc-800/40 text-zinc-300'}`}
              >
                {position > 0 ? <Clock className="w-3 h-3" aria-hidden /> : <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
                <span className="max-w-[120px] truncate">{agentName(running)}</span>
                {position > 0 && <span className="font-mono text-zinc-400">En espera #{position}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className={`flex-1 min-h-0 p-3 ${shownTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {shownTab === 'chat' && session && (
          <ChatView
            state={state}
            session={session}
            focusMode={focusMode}
            dispatch={dispatch}
            onOpenHistory={() => setDrawerMode('history')}
            onNewTask={() => setDrawerMode('newTask')}
          />
        )}

        {shownTab === 'agents' && (
          <AgentsView
            state={state}
            onOpenChat={(sessionId) => {
              switchSession(sessionId);
              setActiveTab('chat');
            }}
          />
        )}

        {shownTab === 'memory' && <MemoryView experience={state.experience} />}

        {shownTab === 'mcps' && (
          <MCPManagerView
            mcps={state.mcps}
            isSyncing={isSyncing}
            onSync={() => {
              setIsSyncing(true);
              postToHost({ command: 'syncMcps' });
            }}
            onTogglePortfolio={(mcpName, enable) => postToHost({ command: 'togglePortfolioMcp', mcpName, enable })}
          />
        )}

        {shownTab === 'telemetry' && (
          <TelemetryDashboard
            telemetryRegistry={state.telemetry}
            costs={state.costs}
            onClearTelemetry={() => postToHost({ command: 'clearTelemetry' })}
          />
        )}

        {shownTab === 'accounts' && <AccountsView accounts={state.accounts} session={session} />}
      </div>

      {drawerMode !== 'closed' && (
        <SessionDrawer
          sessions={state.sessions}
          activeSessionId={state.activeSessionId}
          onSelectSession={switchSession}
          onCreateSession={createSession}
          onDeleteSession={deleteSession}
          onMoveSession={(sessionId, projectName) => postToHost({ command: 'moveSession', sessionId, projectName })}
          onRenameProject={(from, to) => postToHost({ command: 'renameProject', from, to })}
          onDeleteProject={(projectName) => postToHost({ command: 'deleteProject', projectName })}
          onClose={() => setDrawerMode('closed')}
          startWithNewTask={drawerMode === 'newTask'}
          searchHits={state.searchHits}
          searchQuery={state.searchQuery}
          archive={state.archive}
        />
      )}

      {isPaletteOpen && (
        <CommandPalette
          sessions={state.sessions}
          onSwitchSession={(sessionId) => {
            switchSession(sessionId);
            setActiveTab('chat');
          }}
          onSelectRole={selectRole}
          onRunAction={runAction}
          onClose={closePalette}
        />
      )}
    </div>
  );
};

export default App;
