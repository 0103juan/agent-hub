import React, { useEffect, useReducer, useState } from 'react';
import { BarChart3, Bot, MessageSquare, RefreshCw, SplitSquareVertical, Users, Wrench } from 'lucide-react';
import { HostMessage } from '../shared/ipc';
import { ProtocolRole } from '../shared/types';
import { AccountsView } from './components/AccountsView';
import { AgentsView } from './components/AgentsView';
import { ChatView } from './components/chat/ChatView';
import { MCPManagerView } from './components/MCPManagerView';
import { SessionDrawer } from './components/SessionDrawer';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { hubReducer, INITIAL_HUB_STATE } from './state/hub-state';
import { postToHost } from './vscode-api';

type Tab = 'chat' | 'agents' | 'mcps' | 'telemetry' | 'accounts';
type DrawerMode = 'closed' | 'history' | 'newTask';

export const App: React.FC = () => {
  const [state, dispatch] = useReducer(hubReducer, INITIAL_HUB_STATE);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('closed');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => dispatch(event.data);
    window.addEventListener('message', onMessage);
    postToHost({ command: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => setIsSyncing(false), [state.mcps]);

  const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId);

  const switchSession = (sessionId: string) => postToHost({ command: 'switchSession', sessionId });
  const deleteSession = (sessionId: string) => postToHost({ command: 'deleteSession', sessionId });
  const createSession = (projectName?: string, taskSlug?: string, protocolRole?: ProtocolRole) =>
    postToHost({ command: 'createSession', projectName, taskSlug, protocolRole });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'agents', label: `Agentes (${state.runningSessionIds.length})${state.attentionSessionIds.length > 0 ? ` ●${state.attentionSessionIds.length}` : ''}`, icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'mcps', label: `MCPs (${state.mcps.length})`, icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'telemetry', label: 'Métricas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'accounts', label: `Cuentas (${state.accounts.length})`, icon: <Users className="w-3.5 h-3.5" /> }
  ];

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
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
        </div>
      </div>

      <div className={`flex-1 min-h-0 p-3 ${activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {activeTab === 'chat' && session && (
          <ChatView
            state={state}
            session={session}
            dispatch={dispatch}
            onOpenHistory={() => setDrawerMode('history')}
            onNewTask={() => setDrawerMode('newTask')}
          />
        )}

        {activeTab === 'agents' && (
          <AgentsView
            state={state}
            onOpenChat={(sessionId) => {
              switchSession(sessionId);
              setActiveTab('chat');
            }}
          />
        )}

        {activeTab === 'mcps' && (
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

        {activeTab === 'telemetry' && (
          <TelemetryDashboard
            telemetryRegistry={state.telemetry}
            costs={state.costs}
            onClearTelemetry={() => postToHost({ command: 'clearTelemetry' })}
          />
        )}

        {activeTab === 'accounts' && <AccountsView accounts={state.accounts} session={session} />}
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
        />
      )}
    </div>
  );
};

export default App;
