import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { AppWindow, BarChart3, Bot, Brain, Clock, Code2, FileText, FolderGit2, GitBranch, Globe, Loader2, Maximize, Maximize2, MessageSquare, Minimize2, Rows3, RefreshCw, Rows4, ShieldAlert, SplitSquareVertical, Terminal, Users, Volume2, VolumeX, Wrench, Zap } from 'lucide-react';
import { agentName } from '../shared/agent-name';
import { PROTOCOL_ROLES } from '../shared/protocol-roles';
import { HostMessage } from '../shared/ipc';
import { ProtocolRole } from '../shared/types';
import { AccountsView } from './components/AccountsView';
import { AgentHubBrand } from './components/AgentHubLogo';
import { AgentsView } from './components/AgentsView';
import { BranchManagerModal } from './components/BranchManagerModal';
import { CodePreviewModal } from './components/CodePreviewModal';
import { CommandPalette } from './components/CommandPalette';
import { InteractiveDiffModal } from './components/InteractiveDiffModal';
import { MemoryView } from './components/MemoryView';
import { Notifications } from './components/Notifications';
import { ProjectFilesSidebar } from './components/ProjectFilesSidebar';
import { ScratchpadDrawer } from './components/ScratchpadDrawer';
import { SecurityAuditorModal, SecurityAuditData } from './components/SecurityAuditorModal';
import { SpotlightBar } from './components/SpotlightBar';
import { TerminalDrawer } from './components/TerminalDrawer';
import { WorkspacePicker } from './components/WorkspacePicker';
import { playCompleteChime, playAttentionChime } from './utils/sound';
import { ACCENT_EVENT, getAccent } from './state/accent';
import { ROLE_COLORS } from './components/SquadCanvas';
import { ChatView } from './components/chat/ChatView';
import { MCPManagerView } from './components/MCPManagerView';
import { SessionDrawer } from './components/SessionDrawer';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { hubReducer, INITIAL_HUB_STATE } from './state/hub-state';
import { isStandaloneBrowser, postToHost, isFromHost } from './vscode-api';

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

  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [diffModal, setDiffModal] = useState<{ file: string; original: string; modified: string; rawDiff: string } | null>(null);
  const [contentSearchResults, setContentSearchResults] = useState<Array<{ file: string; line: number; text: string }>>([]);

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchesData, setBranchesData] = useState<{ currentBranch: string; branches: string[]; squadBranches: string[] }>({
    currentBranch: 'main',
    branches: ['main'],
    squadBranches: []
  });

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [securityData, setSecurityData] = useState<SecurityAuditData>({
    secretIssues: [],
    undocumentedEnvVars: [],
    sqlIssues: []
  });

  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [scratchpadContent, setScratchpadContent] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('agent-hub.sound') !== '0');
  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('agent-hub.sound', next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen((open) => !open);
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleFocus();
      } else if (event.altKey && (event.code === 'Space' || event.key === ' ')) {
        event.preventDefault();
        setIsSpotlightOpen((open) => !open);
      } else if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        setIsTerminalOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFocus]);

  useEffect(() => {
    const handleOpenSpotlight = () => setIsSpotlightOpen(true);
    window.addEventListener('agenthub:open-spotlight', handleOpenSpotlight);
    return () => window.removeEventListener('agenthub:open-spotlight', handleOpenSpotlight);
  }, []);

  const [previewFileModal, setPreviewFileModal] = useState<{ file: string; content: string; line?: number } | null>(null);

  const [workspaceOverview, setWorkspaceOverview] = useState<{
    workspaceDir: string;
    recentWorkspaces: string[];
    gitFiles: Array<{ path: string; status: 'M' | 'A' | 'D' | '?' | 'R' }>;
    projectTree: Array<{ path: string; name: string; isDir: boolean }>;
  }>({
    workspaceDir: '',
    recentWorkspaces: [],
    gitFiles: [],
    projectTree: []
  });

  const [isFilesSidebarOpen, setIsFilesSidebarOpen] = useState(() => localStorage.getItem('agent-hub.filesSidebarOpen') === '1');
  const toggleFilesSidebar = useCallback(() => {
    setIsFilesSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('agent-hub.filesSidebarOpen', next ? '1' : '0');
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    // Al mover el panel a otra ventana VS Code recarga el iframe y puede perder el primer `ready`.
    const retryReady = window.setInterval(() => {
      postToHost({ command: 'ready' });
      postToHost({ command: 'getWorkspaceOverview' });
    }, 1500);
    const onMessage = (event: MessageEvent<HostMessage>) => {
      if (!isFromHost(event.source, window)) return;
      window.clearInterval(retryReady);
      const msg = event.data;
      if (msg?.type === 'filePreview') {
        setPreviewFileModal({ file: msg.file, content: msg.content, line: msg.line });
        return;
      }
      if (msg?.type === 'workspaceOverview') {
        setWorkspaceOverview({
          workspaceDir: msg.workspaceDir,
          recentWorkspaces: msg.recentWorkspaces,
          gitFiles: msg.gitFiles,
          projectTree: msg.projectTree
        });
        return;
      }
      if (msg?.type === 'terminalOutput') {
        // Solo la cola: un `npm run dev` largo volvería lento el panel.
        setTerminalOutput((prev) => (prev + msg.output).slice(-200_000));
        if (msg.command && msg.output.startsWith('\n$ ')) setTerminalRunning(true);
        if (msg.exitCode !== undefined) setTerminalRunning(false);
        return;
      }
      if (msg?.type === 'gitDiffResult') {
        setDiffModal({
          file: msg.file,
          original: msg.original,
          modified: msg.modified,
          rawDiff: msg.rawDiff
        });
        return;
      }
      if (msg?.type === 'contentSearchResults') {
        setContentSearchResults(msg.results);
        return;
      }
      if (msg?.type === 'gitBranches') {
        setBranchesData({
          currentBranch: msg.currentBranch,
          branches: msg.branches,
          squadBranches: msg.squadBranches
        });
        return;
      }
      if (msg?.type === 'securityAuditResult') {
        setSecurityData({
          secretIssues: msg.secretIssues,
          undocumentedEnvVars: msg.undocumentedEnvVars,
          sqlIssues: msg.sqlIssues
        });
        setIsSecurityModalOpen(true);
        return;
      }
      if (msg?.type === 'scratchpadContent') {
        setScratchpadContent(msg.content);
        return;
      }
      if (msg?.type === 'notice') {
        // Se lee al llegar el aviso: este efecto corre una sola vez y `soundEnabled` quedaría congelado.
        if (localStorage.getItem('agent-hub.sound') !== '0') {
          if (msg.notice.text.toLowerCase().includes('fall') || msg.notice.text.toLowerCase().includes('pregunta')) {
            playAttentionChime();
          } else {
            playCompleteChime();
          }
        }
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
          try {
            new Notification('AgentHub', { body: msg.notice.text, icon: '/icon.svg' });
          } catch {}
        }
      }
      dispatch(msg);
    };
    window.addEventListener('message', onMessage);
    postToHost({ command: 'ready' });
    postToHost({ command: 'getWorkspaceOverview' });
    return () => {
      window.clearInterval(retryReady);
      window.removeEventListener('message', onMessage);
    };
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

  const runTerminalCommand = useCallback((cmd: string) => {
    setIsTerminalOpen(true);
    postToHost({ command: 'runTerminalCommand', commandLine: cmd });
  }, []);

  const openDiffFile = useCallback((file: string) => {
    postToHost({ command: 'gitDiffFile', file });
  }, []);

  const revertGitFile = useCallback((file: string) => {
    postToHost({ command: 'gitRevertFile', file });
  }, []);

  const generateSemanticCommit = useCallback(() => {
    setActiveTab('chat');
    postToHost({ command: 'generateCommit', sessionId: activeSessionId });
  }, [activeSessionId]);

  const auditProjectBranch = useCallback(() => {
    setActiveTab('chat');
    postToHost({ command: 'auditBranch', sessionId: activeSessionId });
  }, [activeSessionId]);

  const submitSpotlightPrompt = useCallback((prompt: string) => {
    setActiveTab('chat');
    postToHost({ command: 'sendPrompt', sessionId: activeSessionId, prompt, attachments: [] });
  }, [activeSessionId]);

  const searchFileContent = useCallback((query: string) => {
    postToHost({ command: 'searchContent', query });
  }, []);

  const openBranchManager = useCallback(() => {
    postToHost({ command: 'getGitBranches' });
    setIsBranchModalOpen(true);
  }, []);

  const checkoutGitBranch = useCallback((branch: string) => {
    postToHost({ command: 'checkoutBranch', branch });
  }, []);

  const createGitBranch = useCallback((branch: string) => {
    postToHost({ command: 'createBranch', branch });
  }, []);

  const deleteGitBranch = useCallback((branch: string) => {
    postToHost({ command: 'deleteBranch', branch });
  }, []);

  const runSecurityAudit = useCallback(() => {
    postToHost({ command: 'runSecurityAudit' });
  }, []);

  const openScratchpad = useCallback(() => {
    postToHost({ command: 'loadScratchpad' });
    setIsScratchpadOpen(true);
  }, []);

  const saveScratchpad = useCallback((content: string) => {
    postToHost({ command: 'saveScratchpad', content });
  }, []);

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
      <div className={`flex items-center justify-between ${density === 'compact' ? 'px-2 py-1' : 'px-3 py-1.5'} border-b border-zinc-800 shrink-0`}>
        <div className={`flex items-center gap-2 min-w-0 ${focusMode ? 'invisible' : ''}`}>
          <div className="flex items-center shrink-0 pr-2 border-r border-zinc-800">
            <AgentHubBrand compact={density === 'compact'} onClick={() => setActiveTab('chat')} />
          </div>
          <div className="hidden sm:flex items-center shrink-0 pr-2 border-r border-zinc-800">
            <WorkspacePicker
              currentDir={workspaceOverview.workspaceDir}
              recentDirs={workspaceOverview.recentWorkspaces}
            />
          </div>
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
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
                <span className={isActive ? undefined : 'hidden min-[1280px]:inline'}>{tab.label}</span>
              </button>
            );
          })}
          </div>
        </div>

        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
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
            onClick={toggleFilesSidebar}
            className={`p-1.5 rounded transition cursor-pointer relative ${
              isFilesSidebarOpen ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            aria-label="Panel de archivos y cambios Git"
            title={`Explorador de Archivos y Git (${workspaceOverview.gitFiles.length} cambios)`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            {workspaceOverview.gitFiles.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 px-1 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-bold leading-none py-0.5">
                {workspaceOverview.gitFiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsSpotlightOpen(true)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition"
            aria-label="Lanzador rápido Spotlight (Alt+Espacio)"
            title="Lanzador rápido Spotlight (Alt+Espacio)"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsTerminalOpen((v) => !v)}
            className={`p-1.5 rounded transition ${
              isTerminalOpen ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300'
            }`}
            aria-label="Terminal Shell integrada (Ctrl+`)"
            title="Terminal Shell integrada (Ctrl+`)"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={openBranchManager}
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-750 text-[11px] font-mono transition cursor-pointer"
            title="Gestor de Ramas Git y Worktrees"
          >
            <GitBranch className="w-3 h-3 text-emerald-400" />
            <span className="truncate max-w-[90px]">{branchesData.currentBranch}</span>
          </button>
          <button
            onClick={runSecurityAudit}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition cursor-pointer"
            aria-label="Auditar Seguridad, Entorno y SQL"
            title="Auditar Seguridad, Entorno y SQL del proyecto"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={openScratchpad}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition cursor-pointer"
            aria-label="Borrador de Trabajo / Scratchpad"
            title="Borrador de Trabajo / Scratchpad (.agent-hub/scratchpad.md)"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleSound}
            className={`p-1.5 rounded hover:bg-zinc-800 transition cursor-pointer ${
              soundEnabled ? 'text-zinc-400 hover:text-indigo-300' : 'text-zinc-600'
            }`}
            aria-label={soundEnabled ? 'Silenciar alertas de audio' : 'Activar alertas de audio'}
            title={soundEnabled ? 'Alertas sonoras activas' : 'Alertas sonoras silenciadas'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleDensity}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            aria-label={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'}. Cambiar`}
            title={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'} (clic para cambiar)`}
          >
            {density === 'compact' ? <Rows4 className="w-3.5 h-3.5" /> : <Rows3 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => postToHost({ command: 'openMain' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            aria-label="Modo Central / Pestaña Principal (Ctrl+Alt+M)"
            title="Modo Central / Pestaña Principal (Ctrl+Alt+M)"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => postToHost({ command: 'openBeside' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            aria-label="Panel Lateral Dividido (Ctrl+Alt+B)"
            title="Panel Lateral Dividido (Ctrl+Alt+B)"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => postToHost({ command: 'popOutWindow' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            aria-label="Desacoplar a Ventana Flotante Independiente (Ctrl+Alt+W)"
            title="Desacoplar a Ventana Flotante Independiente (Ctrl+Alt+W)"
          >
            <AppWindow className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => postToHost({ command: 'openExternalBrowser' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            aria-label="Abrir en Navegador Web / PWA Externa (localhost:3710)"
            title="Abrir en Navegador Web / PWA Externa (localhost:3710)"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => postToHost({ command: 'refreshAccounts' })}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            aria-label="Refrescar estado"
            title="Refrescar estado"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {isStandaloneBrowser() && (
            <button
              onClick={() => {
                const projectPath = state.sessions.find((s) => s.id === state.activeSessionId)?.projectPath;
                const uri = projectPath
                  ? `vscode://file/${encodeURI(projectPath.replace(/\\/g, '/'))}`
                  : 'vscode://';
                window.open(uri, '_blank');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-medium transition"
              title="Abrir este proyecto en Visual Studio Code"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span className="hidden min-[480px]:inline">Abrir en VS Code</span>
            </button>
          )}
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

      <div className={`flex-1 min-h-0 flex overflow-hidden ${shownTab === 'chat' ? '' : density === 'compact' ? 'p-1.5 overflow-y-auto' : 'p-2.5 overflow-y-auto'}`}>
        {shownTab === 'chat' && session && (
          <>
            <ProjectFilesSidebar
              workspaceDir={workspaceOverview.workspaceDir}
              gitFiles={workspaceOverview.gitFiles}
              projectTree={workspaceOverview.projectTree}
              contentResults={contentSearchResults}
              isOpen={isFilesSidebarOpen && !focusMode}
              onToggle={toggleFilesSidebar}
              onPreviewFile={(file, line) => postToHost({ command: 'previewFile', file, line })}
              onOpenDiff={openDiffFile}
              onGenerateCommit={generateSemanticCommit}
              onAuditBranch={auditProjectBranch}
              onSearchContent={searchFileContent}
            />
            <div className={`flex-1 min-w-0 h-full flex flex-col overflow-hidden ${density === 'compact' ? 'p-1.5' : 'p-2.5'}`}>
              <ChatView
                state={state}
                session={session}
                focusMode={focusMode}
                dispatch={dispatch}
                onOpenHistory={() => setDrawerMode('history')}
                onNewTask={() => setDrawerMode('newTask')}
              />
            </div>
          </>
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

      {previewFileModal && (
        <CodePreviewModal
          file={previewFileModal.file}
          content={previewFileModal.content}
          line={previewFileModal.line}
          onClose={() => setPreviewFileModal(null)}
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

      <TerminalDrawer
        isOpen={isTerminalOpen}
        onToggle={() => setIsTerminalOpen((v) => !v)}
        output={terminalOutput}
        onRunCommand={runTerminalCommand}
        onClear={() => setTerminalOutput('')}
        running={terminalRunning}
        onStop={() => postToHost({ command: 'stopTerminalCommand' })}
      />

      <SpotlightBar
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        onSubmitPrompt={submitSpotlightPrompt}
        onGenerateCommit={generateSemanticCommit}
        onAuditBranch={auditProjectBranch}
        onRunTests={() => runTerminalCommand('npm test')}
      />

      {diffModal && (
        <InteractiveDiffModal
          file={diffModal.file}
          original={diffModal.original}
          modified={diffModal.modified}
          rawDiff={diffModal.rawDiff}
          onClose={() => setDiffModal(null)}
          onRevert={revertGitFile}
        />
      )}

      {isBranchModalOpen && (
        <BranchManagerModal
          currentBranch={branchesData.currentBranch}
          branches={branchesData.branches}
          squadBranches={branchesData.squadBranches}
          onClose={() => setIsBranchModalOpen(false)}
          onCheckout={checkoutGitBranch}
          onCreate={createGitBranch}
          onDelete={deleteGitBranch}
          onRefresh={openBranchManager}
        />
      )}

      {isSecurityModalOpen && (
        <SecurityAuditorModal
          data={securityData}
          onClose={() => setIsSecurityModalOpen(false)}
          onSendToAgent={submitSpotlightPrompt}
          onPreviewFile={(file, line) => postToHost({ command: 'previewFile', file, line })}
        />
      )}

      <ScratchpadDrawer
        isOpen={isScratchpadOpen}
        content={scratchpadContent}
        onClose={() => setIsScratchpadOpen(false)}
        onSave={saveScratchpad}
        onSendToAgent={submitSpotlightPrompt}
      />
    </div>
  );
};

export default App;
