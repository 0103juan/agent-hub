import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppWindow, BarChart3, Bot, Brain, Clock, Code2, Columns3, FileText, FolderGit2, GitBranch, Globe, Loader2, Maximize, Maximize2, MessageSquare, Minimize2, Pin, Rows3, RefreshCw, Rows4, ShieldAlert, Sparkles, SplitSquareVertical, Terminal, Users, Volume2, VolumeX, Wrench, Zap } from 'lucide-react';
import { agentName } from '../shared/agent-name';
import { PROTOCOL_ROLES } from '../shared/protocol-roles';
import { HostMessage } from '../shared/ipc';
import { ProtocolRole } from '../shared/types';
import { AccountsView } from './components/AccountsView';
import { AgentHubBrand } from './components/AgentHubLogo';
import { AgentsView } from './components/AgentsView';
import { BranchManagerModal } from './components/BranchManagerModal';
import { GitBranchBadge } from './components/GitBranchBadge';
import { CodePreviewModal } from './components/CodePreviewModal';
import { CommandPalette } from './components/CommandPalette';
import { DocumentsView } from './components/DocumentsView';
import { InteractiveDiffModal } from './components/InteractiveDiffModal';
import { MemoryView } from './components/MemoryView';
import { Notifications } from './components/Notifications';
import { ProjectFilesSidebar } from './components/ProjectFilesSidebar';
import { ScratchpadDrawer } from './components/ScratchpadDrawer';
import { SecurityAuditorModal, SecurityAuditData } from './components/SecurityAuditorModal';
import { SpotlightBar } from './components/SpotlightBar';
import { TerminalDrawer, TerminalTabState, QuickCommand, TerminalShell } from './components/TerminalDrawer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { WorkspacePicker } from './components/WorkspacePicker';
import { playCompleteChime, playAttentionChime, setVolume, Volume } from './utils/sound';
import { ACCENT_EVENT, getAccent } from './state/accent';
import { ROLE_COLORS } from './components/SquadCanvas';
import { ChatView } from './components/chat/ChatView';
import { isSplitActive, SplitBar, SplitColumns, useSplit, type SplitLayout } from './components/SplitWorkspace';
import { MCPManagerView } from './components/MCPManagerView';
import { SessionDrawer } from './components/SessionDrawer';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { TacticalHudView } from './components/TacticalHudView';
import { hubReducer, INITIAL_HUB_STATE } from './state/hub-state';
import { isStandaloneBrowser, isElectron, openInVsCode, postToHost, isFromHost } from './vscode-api';

type Tab = 'hud' | 'chat' | 'agents' | 'memory' | 'documents' | 'mcps' | 'telemetry' | 'accounts';
type Density = 'comfortable' | 'compact';
const DENSITY_KEY = 'agent-hub.density';
const FOCUS_KEY = 'agent-hub.focus';
/** Identifica esta ventana ante el servidor, que manda los mensajes de los chats que cada ventana tiene a la vista. */
const CLIENT_ID = Math.random().toString(36).slice(2);
const TAB_ORDER: Tab[] = ['hud', 'chat', 'agents', 'memory', 'documents', 'mcps', 'telemetry', 'accounts'];
type DrawerMode = 'closed' | 'history' | 'newTask';

export const App: React.FC = () => {
  const [state, dispatch] = useReducer(hubReducer, INITIAL_HUB_STATE);
  const [localActiveId, setLocalActiveId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const activeSessionId = (localActiveId && state.sessions.some((candidate) => candidate.id === localActiveId))
    ? localActiveId
    : state.activeSessionId;
  const session = state.sessions.find((candidate) => candidate.id === activeSessionId);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // La app siempre abre en el HUD Center.
  const [activeTab, setActiveTab] = useState<Tab>('hud');
  // En anchos estrechos la franja de pestañas se desplaza: la activa debe quedar a la vista.
  useEffect(() => {
    document.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTab]);
  // Píldora de la pestaña activa: se desliza de una pestaña a otra en vez de saltar.
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [tabPill, setTabPill] = useState<React.CSSProperties>();
  useLayoutEffect(() => {
    const strip = tabStripRef.current;
    if (!strip) return;
    const place = () => {
      const active = strip.querySelector<HTMLElement>('[aria-current="page"]');
      setTabPill(active ? { left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight } : undefined);
    };
    place();
    const observer = new ResizeObserver(place);
    strip.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [activeTab]);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('closed');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // El editor de documentos se monta al visitarlo por primera vez y se queda montado para no perder lo escrito.
  const [documentsMounted, setDocumentsMounted] = useState(false);
  const [documentRequest, setDocumentRequest] = useState<{ file: string; tick: number; root?: string }>();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const onConnection = (event: Event) => setOffline(!(event as CustomEvent<boolean>).detail);
    const goOffline = () => setOffline(true);
    window.addEventListener('agenthub:connection', onConnection);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('agenthub:connection', onConnection);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
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
  const isTerminalOpenRef = useRef(isTerminalOpen);
  isTerminalOpenRef.current = isTerminalOpen;
  const [terminalBadge, setTerminalBadge] = useState<'success' | 'error' | null>(null);
  const [terminalDock, setTerminalDock] = useState<'bottom' | 'right'>(() =>
    localStorage.getItem('agent-hub.terminalDock') === 'right' ? 'right' : 'bottom'
  );
  const [terminalSnippets, setTerminalSnippets] = useState<QuickCommand[]>([]);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabState[]>([
    { id: 'default', title: 'Shell 1', output: '', running: false }
  ]);
  const terminalTabsRef = useRef(terminalTabs);
  terminalTabsRef.current = terminalTabs;
  const [activeTerminalId, setActiveTerminalId] = useState('default');
  const activeTerminalIdRef = useRef(activeTerminalId);
  activeTerminalIdRef.current = activeTerminalId;
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [diffModal, setDiffModal] = useState<{ file: string; original: string; modified: string; rawDiff: string } | null>(null);
  const [contentSearchResults, setContentSearchResults] = useState<Array<{ file: string; line: number; text: string }>>([]);

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchesData, setBranchesData] = useState<{ currentBranch: string; branches: string[]; squadBranches: string[] }>({
    currentBranch: '',
    branches: [],
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
      } else if (event.key === 'Escape' && document.body.dataset.focusMode === '1' && !(event.target instanceof HTMLTextAreaElement)) {
        toggleFocus();
      } else if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        setIsShortcutsOpen((open) => !open);
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && /^[1-8]$/.test(event.key)) {
        event.preventDefault();
        setActiveTab(TAB_ORDER[Number(event.key) - 1]);
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('agenthub:new-chat'));
      } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('agenthub:step-session', { detail: event.key === 'ArrowUp' ? -1 : 1 }));
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
  const workspaceOverviewRef = useRef(workspaceOverview);
  workspaceOverviewRef.current = workspaceOverview;


  useEffect(() => {
    if (isTerminalOpen) {
      setTerminalBadge(null);
      const cwd = session?.projectPath || workspaceOverview.workspaceDir || undefined;
      postToHost({ command: 'loadTerminalSnippets', cwd });
    }
  }, [isTerminalOpen, session?.projectPath, workspaceOverview.workspaceDir]);

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
      postToHost({ command: 'getGitBranches' });
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
        const currentBranch = msg.currentBranch;
        if (!sessionRef.current?.projectPath) {
          setBranchesData((prev) => ({ ...prev, currentBranch: currentBranch || '' }));
        }
        return;
      }
      if (msg?.type === 'dirGitStatus') {
        const activeDir = sessionRef.current?.projectPath || workspaceOverviewRef.current.workspaceDir;
        if (!msg.dir || !activeDir || msg.dir === activeDir) {
          setBranchesData((prev) => ({ ...prev, currentBranch: msg.branch }));
          if (msg.gitFiles) {
            setWorkspaceOverview((prev) => ({ ...prev, gitFiles: msg.gitFiles }));
          }
        }
        return;
      }
      if (msg?.type === 'terminalSnippets') {
        setTerminalSnippets(Array.isArray(msg.snippets) ? msg.snippets : []);
        return;
      }
      if (msg?.type === 'terminalOutput') {
        const targetId = msg.terminalId || 'default';
        const finished = msg.exitCode !== undefined;
        if (finished && !isTerminalOpenRef.current) {
          setTerminalBadge(msg.exitCode === 0 ? 'success' : 'error');
        }
        setTerminalTabs((prev) => {
          const exists = prev.some((t) => t.id === targetId);
          const list = exists
            ? prev
            : [...prev, { id: targetId, title: `Shell ${prev.length + 1}`, output: '', running: false }];
          return list.map((t) => {
            if (t.id !== targetId) return t;
            const started = Boolean(msg.command && msg.output?.startsWith('\n$ '));
            return {
              ...t,
              cwd: msg.cwd || t.cwd,
              output: (t.output + (msg.output || '')).slice(-200_000),
              running: started ? true : finished ? false : t.running,
              startedAt: started ? Date.now() : t.startedAt,
              lastCommand: msg.command || t.lastCommand,
              lastExitCode: finished ? msg.exitCode : started ? undefined : t.lastExitCode
            };
          });
        });
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
        const activeDir = sessionRef.current?.projectPath || workspaceOverviewRef.current.workspaceDir;
        if (!msg.dir || !activeDir || msg.dir === activeDir) {
          setBranchesData({
            currentBranch: msg.currentBranch,
            branches: msg.branches,
            squadBranches: msg.squadBranches
          });
        }
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
            const shown = new Notification('AgentHub', { body: msg.notice.text, icon: '/icon.svg' });
            shown.onclick = () => {
              window.focus();
              shown.close();
            };
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

  useEffect(() => {
    const targetDir = session?.projectPath || workspaceOverview.workspaceDir;
    if (targetDir) {
      postToHost({ command: 'getGitBranches', dir: targetDir, sessionId: session?.id });
      postToHost({ command: 'getDirGitStatus', dir: targetDir, sessionId: session?.id });
    }
  }, [session?.id, session?.projectPath, workspaceOverview.workspaceDir]);

  const switchSession = useCallback((sessionId: string) => {
    setLocalActiveId(sessionId);
    postToHost({ command: 'switchSession', sessionId });
  }, []);
  const sp = useSplit(state.sessions);
  const splitOn = !!session && isSplitActive(sp, session.id);
  // El servidor solo manda los mensajes del chat activo y visibles; las columnas y la ventana suelta piden los suyos.
  const soloParam = new URLSearchParams(location.search).get('solo');
  const visibleKey = [activeSessionId, ...sp.ids, ...(soloParam ? [soloParam] : [])].filter(Boolean).join(',');
  useEffect(() => {
    if (!offline) postToHost({ command: 'setVisibleSessions', clientId: CLIENT_ID, sessionIds: visibleKey ? visibleKey.split(',') : [] });
  }, [visibleKey, offline]);
  // Un chat nuevo que pasa a ser el activo se suma como columna si ya se estaba en vista dividida.
  const knownIds = useRef<Set<string> | null>(null);
  const wasSplit = useRef(false);
  useEffect(() => {
    const known = knownIds.current;
    knownIds.current = new Set(state.sessions.map((s) => s.id));
    if (known && activeSessionId && !known.has(activeSessionId) && wasSplit.current) {
      sp.setIds([...sp.ids, activeSessionId]);
    }
    wasSplit.current = isSplitActive(sp, activeSessionId);
  }, [state.sessions, activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);
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
  // El título de la ventana avisa de los agentes en curso y de los que esperan respuesta.
  const attentionCount = state.attentionSessionIds.length;
  useEffect(() => {
    document.body.dataset.focusMode = focusMode ? '1' : '0';
  }, [focusMode]);
  // Cerrar o recargar con agentes trabajando perdería el turno en curso: el navegador pide confirmar.
  const hasRunning = runningSessions.length > 0;
  useEffect(() => {
    if (!hasRunning) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasRunning]);
  useEffect(() => {
    const prefix = attentionCount > 0 ? `● ${attentionCount} ` : runningSessions.length > 0 ? `(${runningSessions.length}) ` : '';
    document.title = `${prefix}AgentHub`;
  }, [attentionCount, runningSessions.length]);

  useEffect(() => {
    const onNewChat = () => {
      setActiveTab('chat');
      createSession();
    };
    const onStep = (event: Event) => {
      const ordered = [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
      const index = ordered.findIndex((candidate) => candidate.id === state.activeSessionId);
      const next = ordered[index + (event as CustomEvent<number>).detail];
      if (next) {
        switchSession(next.id);
        setActiveTab('chat');
      }
    };
    window.addEventListener('agenthub:new-chat', onNewChat);
    window.addEventListener('agenthub:step-session', onStep);
    return () => {
      window.removeEventListener('agenthub:new-chat', onNewChat);
      window.removeEventListener('agenthub:step-session', onStep);
    };
  }, [state.sessions, state.activeSessionId, switchSession]);

  const openChat = (sessionId: string) => {
    switchSession(sessionId);
    setActiveTab('chat');
  };
  const shownTab = focusMode ? 'chat' : activeTab;
  const deleteSession = (sessionId: string) => postToHost({ command: 'deleteSession', sessionId });
  const createSession = (projectName?: string, taskSlug?: string, protocolRole?: ProtocolRole) => {
    setLocalActiveId(null);
    postToHost({ command: 'createSession', projectName, taskSlug, protocolRole });
  };

  const terminalQuickCommands = useMemo<QuickCommand[]>(() => {
    // Solo la raíz decide el tipo de proyecto: un src-tauri/Cargo.toml no convierte en Rust a un proyecto Node.
    const names = new Set(workspaceOverview.projectTree.filter((item) => !item.path.includes('/')).map((item) => item.name.toLowerCase()));
    const gitTail: QuickCommand[] = [
      { label: 'git status', cmd: 'git status' },
      { label: 'git log', cmd: 'git log -n 5 --oneline' }
    ];
    if (names.has('pubspec.yaml')) {
      return [{ label: 'flutter test', cmd: 'flutter test' }, { label: 'flutter pub get', cmd: 'flutter pub get' }, ...gitTail];
    }
    if (names.has('cargo.toml')) {
      return [{ label: 'cargo test', cmd: 'cargo test' }, { label: 'cargo build', cmd: 'cargo build' }, ...gitTail];
    }
    if (names.has('build.gradle') || names.has('build.gradle.kts')) {
      return [{ label: 'gradlew test', cmd: './gradlew test' }, { label: 'bundleRelease', cmd: './gradlew bundleRelease' }, ...gitTail];
    }
    if (names.has('pyproject.toml') || names.has('requirements.txt')) {
      return [{ label: 'pytest', cmd: 'pytest' }, ...gitTail];
    }
    return [
      { label: 'npm test', cmd: 'npm test' },
      { label: 'npm run build', cmd: 'npm run build' },
      ...gitTail
    ];
  }, [workspaceOverview.projectTree]);

  const runTerminalCommand = useCallback((cmd: string, terminalId?: string) => {
    const targetId = terminalId || activeTerminalIdRef.current || 'default';
    const tab = terminalTabsRef.current.find((t) => t.id === targetId);
    const cwd = tab?.cwd || sessionRef.current?.projectPath || workspaceOverviewRef.current.workspaceDir || undefined;
    const shell = tab?.shell;
    setIsTerminalOpen(true);
    postToHost({ command: 'runTerminalCommand', terminalId: targetId, commandLine: cmd, cwd, shell });
  }, []);

  const openTerminalAt = useCallback((dir: string) => {
    const existing = terminalTabsRef.current.find((t) => t.cwd === dir);
    const id = existing?.id ?? `term-${Date.now().toString(36)}`;
    if (!existing) {
      const title = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
      setTerminalTabs((prev) => [...prev, { id, title, cwd: dir, output: '', running: false }]);
    }
    setActiveTerminalId(id);
    setIsTerminalOpen(true);
  }, []);

  const createTerminalTab = useCallback(() => {
    const nextId = `term-${Date.now().toString(36)}`;
    const cwd = sessionRef.current?.projectPath || workspaceOverviewRef.current.workspaceDir || undefined;
    setTerminalTabs((prev) => [...prev, { id: nextId, title: `Shell ${prev.length + 1}`, cwd, output: '', running: false }]);
    setActiveTerminalId(nextId);
  }, []);

  const closeTerminalTab = useCallback((id: string) => {
    postToHost({ command: 'stopTerminalCommand', terminalId: id });
    setTerminalTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (activeTerminalIdRef.current === id && next[0]) {
        setActiveTerminalId(next[0].id);
      }
      return next;
    });
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

  const openBranchManager = useCallback((dir?: string) => {
    const targetDir = dir || session?.projectPath || workspaceOverview.workspaceDir;
    postToHost({ command: 'getGitBranches', dir: targetDir, sessionId: session?.id });
    setIsBranchModalOpen(true);
  }, [session?.projectPath, session?.id, workspaceOverview.workspaceDir]);

  const checkoutGitBranch = useCallback((branch: string, dir?: string) => {
    const targetDir = dir || session?.projectPath || workspaceOverview.workspaceDir;
    postToHost({ command: 'checkoutBranch', branch, dir: targetDir, sessionId: session?.id });
  }, [session?.projectPath, session?.id, workspaceOverview.workspaceDir]);

  const createGitBranch = useCallback((branch: string, dir?: string) => {
    const targetDir = dir || session?.projectPath || workspaceOverview.workspaceDir;
    postToHost({ command: 'createBranch', branch, dir: targetDir, sessionId: session?.id });
  }, [session?.projectPath, session?.id, workspaceOverview.workspaceDir]);

  const deleteGitBranch = useCallback((branch: string, dir?: string) => {
    const targetDir = dir || session?.projectPath || workspaceOverview.workspaceDir;
    postToHost({ command: 'deleteBranch', branch, dir: targetDir, sessionId: session?.id });
  }, [session?.projectPath, session?.id, workspaceOverview.workspaceDir]);

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

  const stateRef = useRef(state);
  stateRef.current = state;
  // Cualquier parte de la app puede pedir abrir un archivo en el editor de documentos.
  useEffect(() => {
    const onOpenDocument = (event: Event) => {
      const file = String((event as CustomEvent).detail ?? '');
      if (!file) return;
      // Un archivo absoluto se abre sobre la carpeta del chat que lo generó (o la suya, si queda fuera).
      const norm = (value: string) => value.replace(/\\/g, '/').toLowerCase();
      const isAbsolute = /^[a-z]:[\\/]/i.test(file) || file.startsWith('/');
      const chatRoot = stateRef.current.sessions.find((s) => s.id === stateRef.current.activeSessionId)?.projectPath;
      // Una ruta relativa es de la carpeta del chat activo, no de la que tenga abierta Documentos.
      const root = !isAbsolute ? chatRoot : chatRoot && norm(file).startsWith(norm(chatRoot).replace(/\/$/, '') + '/') ? chatRoot : file.replace(/[\\/][^\\/]*$/, '') || undefined;
      setDocumentsMounted(true);
      setDocumentRequest((previous) => ({ file, root, tick: (previous?.tick ?? 0) + 1 }));
      setPreviewFileModal(null);
      setIsScratchpadOpen(false);
      setActiveTab('documents');
    };
    window.addEventListener('agenthub:open-document', onOpenDocument);
    return () => window.removeEventListener('agenthub:open-document', onOpenDocument);
  }, [setActiveTab]);
  useEffect(() => {
    if (shownTab === 'documents') setDocumentsMounted(true);
  }, [shownTab]);

  const copyLastAnswer = useCallback(() => {
    const last = [...(state.sessions.find((candidate) => candidate.id === state.activeSessionId)?.messages ?? [])].reverse().find((m) => m.role === 'assistant' && m.content.trim());
    if (last) navigator.clipboard.writeText(last.content).catch(() => {});
  }, [state.sessions, state.activeSessionId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        event.preventDefault();
        copyLastAnswer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyLastAnswer]);

  // Atajos que dependen de funciones definidas arriba, y refresco del panel al volver a la ventana.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleFilesSidebar();
      } else if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        openScratchpad();
      }
    };
    let lastRefresh = 0;
    const refresh = () => {
      if (document.hidden || Date.now() - lastRefresh < 5000) return;
      lastRefresh = Date.now();
      postToHost({ command: 'getWorkspaceOverview' });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [toggleFilesSidebar, openScratchpad]);

  const handlePopOut = useCallback(() => {
    const targetUrl = session ? `${window.location.origin}${window.location.pathname}?solo=${session.id}` : window.location.href;
    if (isElectron()) {
      postToHost({ command: 'popOutWindow', url: targetUrl });
      return;
    }
    if (isStandaloneBrowser() && typeof window !== 'undefined') {
      try {
        const popup = window.open(
          targetUrl,
          `AgentHub_${session ? session.id : 'Solo'}`,
          'width=1160,height=780,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
        );
        if (popup) {
          popup.focus();
          return;
        }
      } catch {}
    }
    postToHost({ command: 'popOutWindow', url: targetUrl });
  }, [session]);

  const handleSplitBeside = useCallback(() => {
    if (session) {
      if (sp.ids.length >= 2) {
        const nextLayout: SplitLayout = sp.layout === 'cols' ? 'rows' : sp.layout === 'rows' ? 'grid' : 'cols';
        sp.setLayout(nextLayout);
      } else {
        const other = state.sessions.find((s) => s.id !== session.id);
        if (other) {
          sp.setIds([session.id, other.id]);
        } else {
          sp.toggle(session.id);
        }
      }
    }
    postToHost({ command: 'openBeside' });
  }, [session, sp, state.sessions]);

  const handleOpenMain = useCallback(() => {
    if (session && sp.ids.length >= 2) {
      sp.setIds([session.id]);
    } else {
      setFocusMode((v) => !v);
    }
    postToHost({ command: 'openMain' });
  }, [session, sp]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    postToHost({ command: 'refreshAccounts' });
    postToHost({ command: 'getWorkspaceOverview' });
    setTimeout(() => setIsRefreshing(false), 700);
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open(window.location.origin, '_blank');
    }
    postToHost({ command: 'openExternalBrowser' });
  }, []);

  useEffect(() => {
    const onShortcuts = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (isMod && event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'w') {
          event.preventDefault();
          handlePopOut();
        } else if (key === 'b') {
          event.preventDefault();
          handleSplitBeside();
        } else if (key === 'm') {
          event.preventDefault();
          handleOpenMain();
        }
      }
    };
    window.addEventListener('keydown', onShortcuts);
    return () => window.removeEventListener('keydown', onShortcuts);
  }, [handlePopOut, handleSplitBeside, handleOpenMain]);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'hud', label: '✦ HUD Center', icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" /> },
    { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'agents', label: `Agentes (${runningSessions.length})${state.attentionSessionIds.length > 0 ? ` ●${state.attentionSessionIds.length}` : ''}${state.pendingHandoffs.length > 0 ? ` ⏸${state.pendingHandoffs.length}` : ''}`, icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'memory', label: 'Memoria', icon: <Brain className="w-3.5 h-3.5" /> },
    { id: 'documents', label: 'Documentos', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'mcps', label: `MCPs (${state.mcps.length})`, icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'telemetry', label: 'Métricas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'accounts', label: `Cuentas (${state.accounts.length})`, icon: <Users className="w-3.5 h-3.5" /> }
  ];

  // Ventana de un solo chat (?solo=<id>): sin barras ni pestañas, el chat fijo aunque otra ventana cambie el activo.
  const soloId = new URLSearchParams(location.search).get('solo');
  const soloSession = soloId ? state.sessions.find((candidate) => candidate.id === soloId) : undefined;
  if (soloId) {
    if (soloSession) {
      return (
        <div className="h-screen flex flex-col bg-[#07090e] text-slate-200 overflow-hidden">
          {/* Barra superior de ventana flotante */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0e17]/95 border-b border-[#202b3f] text-xs select-none shrink-0 backdrop-blur z-10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse shrink-0" />
              <span className="font-mono font-semibold text-slate-200 truncate">{soloSession.title || 'Chat Flotante'}</span>
              <span className="text-[10px] font-mono text-slate-500 truncate hidden min-[400px]:inline">({soloSession.modelId})</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isElectron() && (
                <button
                  type="button"
                  onClick={() => {
                    postToHost({ command: 'toggleAlwaysOnTop' });
                    setIsPinned(!isPinned);
                  }}
                  title={isPinned ? 'Fijado encima (haz clic para desfijar o usa Ctrl+Shift+T)' : 'Desfijado (haz clic para fijar encima o usa Ctrl+Shift+T)'}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium border transition cursor-pointer ${
                    isPinned
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                      : 'bg-[#0c1220] hover:bg-[#162035] text-slate-400 border-[#202b3f]'
                  }`}
                >
                  <Pin className={`w-3 h-3 ${isPinned ? 'rotate-45 text-cyan-400' : ''}`} />
                  <span className="hidden min-[380px]:inline">{isPinned ? 'Fijado' : 'Fijar'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  window.location.href = window.location.origin + window.location.pathname;
                }}
                title="Abrir vista completa de AgentHub"
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#0c1220] transition cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-2 flex flex-col">
            <ChatView state={state} session={soloSession} dispatch={dispatch} onOpenHistory={() => {}} onNewTask={() => {}} />
          </div>
        </div>
      );
    }
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 bg-[#07090e] text-slate-400 select-none">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mb-3" />
        <span className="text-xs font-mono text-slate-500">Cargando conversación flotante...</span>
      </div>
    );
  }

  return (
    <div data-density={density} className="flex flex-col h-screen bg-[#07090e] text-slate-100 overflow-hidden relative selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Los lectores de pantalla anuncian cada aviso nuevo (agente terminó, pregunta, fallo). */}
      <div className="sr-only" role="status" aria-live="polite">{state.notices[state.notices.length - 1]?.text}</div>
      <div className={`flex items-center justify-between ${density === 'compact' ? 'px-2 py-1' : 'px-3 py-1.5'} bg-[#0a0e17]/95 backdrop-blur-md border-b border-[#202b3f] shrink-0 max-[420px]:flex-wrap max-[420px]:gap-y-1 z-20`}>
        <div className={`flex items-center gap-2 min-w-0 max-[420px]:w-full ${focusMode ? 'invisible' : ''}`}>
          <div className="flex items-center shrink-0 pr-2 border-r border-[#202b3f]">
            <AgentHubBrand compact={density === 'compact'} onClick={() => setActiveTab(activeTab === 'hud' ? 'chat' : 'hud')} />
          </div>
          {/* Con varias columnas cada una trae su propio selector; el global confundiría de qué chat es la carpeta. */}
          {!splitOn && (
          <div className="hidden sm:flex items-center shrink-0 pr-2 border-r border-[#202b3f]">
            <WorkspacePicker
              sessionId={session?.id}
              currentDir={session?.projectPath || workspaceOverview.workspaceDir}
              recentDirs={workspaceOverview.recentWorkspaces}
            />
          </div>
          )}
          <div ref={tabStripRef} className="relative flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar max-[900px]:[mask-image:linear-gradient(to_right,#000_calc(100%-14px),transparent)]">
          {tabPill && (
            <span
              aria-hidden
              className="hub-tab-pill absolute rounded-md bg-gradient-to-r from-cyan-500/25 via-teal-500/30 to-cyan-500/20 border border-cyan-400/40 shadow-[0_0_14px_rgba(6,182,212,0.3)] backdrop-blur-sm pointer-events-none"
              style={tabPill}
            />
          )}
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
                className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all duration-200 shrink-0 select-none ${
                  isActive
                    ? 'text-cyan-200 font-semibold drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1220]/70'
                }`}
              >
                {tab.icon}
                <span className={isActive ? undefined : 'hidden lg:inline'}>{tab.label}</span>
              </button>
            );
          })}
          </div>
        </div>

        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar max-[900px]:[mask-image:linear-gradient(to_right,#000_calc(100%-14px),transparent)]">
          <button
            onClick={toggleFocus}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              focusMode
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'text-slate-400 hover:text-cyan-300 hover:bg-[#0c1220] border border-transparent'
            }`}
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
            className={`p-1.5 rounded-md transition cursor-pointer relative ${
              isFilesSidebarOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
            aria-label="Panel de archivos y cambios Git"
            title={`Explorador de Archivos y Git (${workspaceOverview.gitFiles.length} cambios)`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            {workspaceOverview.gitFiles.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-mono font-bold leading-none py-0.5 shadow-sm">
                {workspaceOverview.gitFiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsSpotlightOpen(true)}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-amber-300 border border-transparent transition cursor-pointer"
            aria-label="Lanzador rápido Spotlight (Alt+Espacio)"
            title="Lanzador rápido Spotlight (Alt+Espacio)"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </button>
          <button
            onClick={() => setIsTerminalOpen((v) => !v)}
            className={`relative p-1.5 rounded-md transition cursor-pointer ${
              isTerminalOpen
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                : 'hover:bg-[#0c1220] text-slate-400 hover:text-emerald-300 border border-transparent'
            }`}
            aria-label="Terminal Shell integrada (Ctrl+`)"
            title="Terminal Shell integrada (Ctrl+`)"
          >
            <Terminal className="w-3.5 h-3.5" />
            {terminalTabs.some((t) => t.running) ? (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
            ) : terminalBadge ? (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                  terminalBadge === 'error' ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                }`}
              />
            ) : null}
          </button>
          {!splitOn && <GitBranchBadge
            branch={branchesData.currentBranch}
            branches={branchesData.branches}
            squadBranches={branchesData.squadBranches}
            uncommittedCount={workspaceOverview.gitFiles.length}
            onCheckout={checkoutGitBranch}
            onCreate={createGitBranch}
            onOpenManager={openBranchManager}
            currentDir={session?.projectPath || workspaceOverview.workspaceDir}
            className="hidden sm:inline-flex"
          />}
          <button
            onClick={runSecurityAudit}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-amber-300 border border-transparent transition cursor-pointer"
            aria-label="Auditar Seguridad, Entorno y SQL"
            title="Auditar Seguridad, Entorno y SQL del proyecto"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={openScratchpad}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent transition cursor-pointer"
            aria-label="Borrador de Trabajo / Scratchpad"
            title="Borrador de Trabajo / Scratchpad (.agent-hub/scratchpad.md)"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleSound}
            className={`p-1.5 rounded-md hover:bg-[#0c1220] border border-transparent transition cursor-pointer ${
              soundEnabled ? 'text-cyan-400 hover:text-cyan-300' : 'text-slate-600 hover:text-slate-400'
            }`}
            aria-label={soundEnabled ? 'Silenciar alertas de audio' : 'Activar alertas de audio'}
            title={soundEnabled ? 'Alertas sonoras activas' : 'Alertas sonoras silenciadas'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleDensity}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent transition cursor-pointer"
            aria-label={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'}. Cambiar`}
            title={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'} (clic para cambiar)`}
          >
            {density === 'compact' ? <Rows4 className="w-3.5 h-3.5" /> : <Rows3 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleOpenMain}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent transition cursor-pointer"
            aria-label="Modo Central / Pestaña Principal (Ctrl+Alt+M)"
            title="Modo Central: enfoca el chat activo y colapsa paneles (Ctrl+Alt+M)"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          {!splitOn && (<>
          <button
            onClick={() => session && sp.toggle(session.id)}
            aria-pressed={!!session && sp.ids.includes(session.id)}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              session && sp.ids.includes(session.id)
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent'
            }`}
            aria-label="Ver varios chats a la vez"
            title="Ver varios chats a la vez: agrega o quita este chat de la vista en columnas"
          >
            <Columns3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSplitBeside}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent transition cursor-pointer"
            aria-label="Panel Lateral Dividido (Ctrl+Alt+B)"
            title="Panel Lateral Dividido: divide el espacio en paneles paralelos (Ctrl+Alt+B)"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handlePopOut}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent transition cursor-pointer"
            aria-label="Desacoplar a Ventana Flotante Independiente (Ctrl+Alt+W)"
            title="Desacoplar a Ventana Flotante Independiente (Ctrl+Alt+W)"
          >
            <AppWindow className="w-3.5 h-3.5" />
          </button>
          </>)}
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent transition cursor-pointer"
            aria-label="Abrir en Navegador Web / PWA Externa (localhost:3710)"
            title="Abrir en Navegador Web / PWA Externa (localhost:3710)"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent transition cursor-pointer"
            aria-label="Refrescar estado"
            title="Refrescar estado"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
          {isStandaloneBrowser() && (
            <button
              onClick={() => {
                const projectPath = state.sessions.find((s) => s.id === state.activeSessionId)?.projectPath || workspaceOverview.workspaceDir;
                const uri = projectPath
                  ? `vscode://file/${encodeURI(projectPath.replace(/\\/g, '/'))}`
                  : 'vscode://';
                window.open(uri, '_blank');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-mono font-medium whitespace-nowrap shrink-0 transition cursor-pointer shadow-sm"
              title="Abrir este proyecto en Visual Studio Code"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span className="hidden min-[1500px]:inline">Abrir en VS Code</span>
            </button>
          )}
          </>)}
        </div>
      </div>

      {offline && (
        <div role="alert" className="flex items-center justify-center gap-2 px-3 py-1 bg-amber-500/10 border-b border-amber-500/25 text-[11px] font-mono text-amber-300 shrink-0 shadow-[inset_0_1px_0_rgba(245,158,11,0.2)]">
          <Loader2 className="w-3 h-3 animate-spin text-amber-400" aria-hidden />
          <span><strong className="font-bold tracking-wide">[OFFLINE HUD]</strong> Sin conexión con el servidor de AgentHub. Reconectando…</span>
        </div>
      )}

      {!focusMode && runningSessions.length + waitingSessions.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#07090e]/80 border-b border-[#202b3f] overflow-x-auto shrink-0 no-scrollbar" aria-label="Agentes en curso">
          {[...runningSessions, ...waitingSessions].map((running) => {
            const role = running.protocolRole;
            const position = state.waitingSessionIds.indexOf(running.id) + 1;
            const accent = getAccent(running.projectName);
            return (
              <button
                key={running.id}
                type="button"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('text/plain', running.id)}
                onClick={() => openChat(running.id)}
                title={`${agentName(running)}${role ? ` · ${PROTOCOL_ROLES[role]?.label ?? role}` : ''}`}
                style={accent ? { borderColor: accent } : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono shrink-0 transition hover:brightness-125 ${(role && ROLE_COLORS[role]) || 'border-[#202b3f] bg-[#0a0e17] text-slate-300 hover:border-cyan-500/40'}`}
              >
                {position > 0 ? <Clock className="w-3 h-3 text-amber-400" aria-hidden /> : <Loader2 className="w-3 h-3 animate-spin text-cyan-400" aria-hidden />}
                <span className="max-w-[120px] truncate font-medium">{agentName(running)}</span>
                {position > 0 && <span className="font-mono text-amber-400/80">#espera {position}</span>}
              </button>
            );
          })}
        </div>
      )}

      {!focusMode && shownTab === 'chat' && session && <SplitBar state={state} session={session} sp={sp} switchSession={switchSession} onOpenHistory={() => setDrawerMode('history')} onNewTask={() => setDrawerMode('newTask')} />}

      {/* Fuera del chat las vistas comparten el lenguaje del HUD: brillo bajo el puntero y entrada escalonada.
          El chat queda sin brillo: su lista puede tener miles de nodos y es donde se lee con calma. */}
      <div
        onPointerMove={shownTab === 'chat' ? undefined : (event) => {
          event.currentTarget.style.setProperty('--mx', `${event.clientX}px`);
          event.currentTarget.style.setProperty('--my', `${event.clientY}px`);
        }}
        className={`flex-1 min-h-0 flex overflow-hidden relative ${shownTab === 'chat' ? '' : shownTab === 'hud' ? 'hub-view' : 'hub-view hub-stagger'} ${shownTab === 'chat' || shownTab === 'hud' ? '' : density === 'compact' ? 'p-1.5 overflow-y-auto' : 'p-2.5 overflow-y-auto'}`}
      >
        {shownTab === 'hud' && (
          <TacticalHudView
            state={state}
            session={session}
            workspaceDir={session?.projectPath || workspaceOverview.workspaceDir}
            gitFilesCount={workspaceOverview.gitFiles.length}
            currentBranch={branchesData.currentBranch}
            terminal={terminalTabs.find((t) => t.id === activeTerminalId)}
            terminalBadge={terminalBadge}
            onOpenChat={(sessionId) => {
              switchSession(sessionId);
              setActiveTab('chat');
            }}
            onOpenTerminal={() => setIsTerminalOpen(true)}
            onSwitchTab={(tab) => setActiveTab(tab)}
            onNewTask={() => setDrawerMode('newTask')}
          />
        )}
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
            <div className={`flex-1 min-w-0 h-full flex overflow-hidden ${density === 'compact' ? 'p-1.5' : 'p-2.5'}`}>
              <SplitColumns
                state={state}
                session={session}
                sp={sp}
                focusMode={focusMode}
                dispatch={dispatch}
                switchSession={switchSession}
                recentDirs={workspaceOverview.recentWorkspaces}
                onCheckoutBranch={checkoutGitBranch}
                onCreateBranch={createGitBranch}
                onOpenBranchManager={openBranchManager}
                onOpenTerminal={openTerminalAt}
                onOpenHistory={() => setDrawerMode('history')}
                onNewTask={() => setDrawerMode('newTask')}
              />
            </div>
          </>
        )}
        {shownTab === 'chat' && !session && (
          <div className="flex-1 min-w-0 h-full flex flex-col items-center justify-center p-6 text-center select-none bg-[#07090e]">
            <div className="w-full max-w-md p-6 rounded-2xl bg-[#0a0e17] border border-[#202b3f] shadow-2xl space-y-4 animate-modal-pop">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#0c1220] border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-100 font-mono">Sin conversación activa</h2>
                <p className="text-xs text-slate-400 font-mono">Inicia un nuevo chat con la IA o selecciona una tarea desde el Centro de Mando.</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDrawerMode('newTask')}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  + Iniciar Nuevo Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('hud')}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#0c1220] hover:bg-[#162035] text-slate-200 border border-[#202b3f] text-xs font-mono transition cursor-pointer"
                >
                  Centro de Mando
                </button>
              </div>
            </div>
          </div>
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
        {documentsMounted && (
          <div className={shownTab === 'documents' ? 'flex-1 min-w-0 flex' : 'hidden'}>
            <DocumentsView openRequest={documentRequest} active={shownTab === 'documents'} />
          </div>
        )}
        {terminalDock === 'right' && (
          <TerminalDrawer
            isOpen={isTerminalOpen}
            onToggle={() => setIsTerminalOpen((v) => !v)}
            tabs={terminalTabs}
            activeTabId={activeTerminalId}
            defaultCwd={session?.projectPath || workspaceOverview.workspaceDir}
            quickCommands={terminalQuickCommands}
            snippets={terminalSnippets}
            dock={terminalDock}
            onToggleDock={() => {
              setTerminalDock((prev) => {
                const next = prev === 'bottom' ? 'right' : 'bottom';
                try { localStorage.setItem('agent-hub.terminalDock', next); } catch {}
                return next;
              });
            }}
            onSaveSnippets={(next) => {
              const cwd = sessionRef.current?.projectPath || workspaceOverviewRef.current.workspaceDir || undefined;
              postToHost({ command: 'saveTerminalSnippets', cwd, snippets: next });
            }}
            onSelectTab={setActiveTerminalId}
            onNewTab={createTerminalTab}
            onCloseTab={closeTerminalTab}
            onChangeShell={(shell: TerminalShell, terminalId: string) =>
              setTerminalTabs((prev) => prev.map((t) => (t.id === terminalId ? { ...t, shell } : t)))
            }
            onRunCommand={runTerminalCommand}
            onSendInput={(data, terminalId) => postToHost({ command: 'sendTerminalInput', terminalId, data })}
            onClear={(terminalId) =>
              setTerminalTabs((prev) => prev.map((t) => (t.id === terminalId ? { ...t, output: '' } : t)))
            }
            onStop={(terminalId) => postToHost({ command: 'stopTerminalCommand', terminalId })}
            onPreviewFile={(file, line) => postToHost({ command: 'previewFile', file, line })}
            onAttachToChat={(tailOutput, command) => {
              const header = command ? `Salida de terminal (\`${command}\`):` : 'Salida de terminal:';
              submitSpotlightPrompt(`${header}\n\`\`\`\n${tailOutput}\n\`\`\``);
            }}
            onAskAI={(command, exitCode, tailOutput) => {
              submitSpotlightPrompt(
                `El comando \`${command}\` falló en la terminal con código ${exitCode}. Analiza la causa raíz y corrígelo:\n\`\`\`\n${tailOutput}\n\`\`\``
              );
            }}
          />
        )}
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
          appCommands={[
            ...tabs.map((tab, index) => ({ key: `tab-${tab.id}`, label: `Ir a ${tab.label.replace(/ \(.*$/, '')}`, hint: `Ctrl ${index + 1}`, run: () => setActiveTab(tab.id) })),
            { key: 'new-chat', label: 'Nueva conversación', hint: 'Ctrl N', run: () => createSession() },
            { key: 'focus', label: focusMode ? 'Salir del modo enfoque' : 'Modo enfoque', hint: 'Ctrl Shift F', run: toggleFocus },
            { key: 'terminal', label: 'Mostrar u ocultar la terminal', hint: 'Ctrl `', run: () => setIsTerminalOpen((open) => !open) },
            { key: 'scratchpad', label: 'Abrir el borrador de trabajo', run: openScratchpad },
            { key: 'branches', label: 'Gestor de ramas Git', run: openBranchManager },
            { key: 'audit', label: 'Auditar seguridad, entorno y SQL', run: runSecurityAudit },
            { key: 'density', label: 'Cambiar densidad (cómodo/compacto)', run: toggleDensity },
            { key: 'sound', label: soundEnabled ? 'Silenciar alertas sonoras' : 'Activar alertas sonoras', run: toggleSound },
            { key: 'shortcuts', label: 'Ver atajos de teclado', hint: 'Ctrl /', run: () => setIsShortcutsOpen(true) },
            { key: 'copy-last', label: 'Copiar la última respuesta', hint: 'Ctrl Shift C', run: copyLastAnswer },
            { key: 'copy-path', label: 'Copiar la ruta del proyecto', run: () => workspaceOverview.workspaceDir && navigator.clipboard.writeText(workspaceOverview.workspaceDir).catch(() => {}) },
            { key: 'open-explorer', label: 'Abrir el proyecto en el Explorador', run: () => postToHost({ command: 'openFolderInExplorer', dir: workspaceOverview.workspaceDir }) },
            { key: 'open-vscode', label: 'Abrir el proyecto en VS Code', run: () => workspaceOverview.workspaceDir && openInVsCode(workspaceOverview.workspaceDir) },
            { key: 'refresh-accounts', label: 'Refrescar las cuentas', run: () => postToHost({ command: 'refreshAccounts' }) },
            { key: 'sync-mcps', label: 'Sincronizar los servidores MCP', run: () => { setIsSyncing(true); postToHost({ command: 'syncMcps' }); } },
            { key: 'sound-test', label: 'Probar la alerta sonora', run: playCompleteChime },
            ...(['low', 'medium', 'high'] as Volume[]).map((level) => ({
              key: `volume-${level}`,
              label: `Volumen de las alertas: ${level === 'low' ? 'bajo' : level === 'medium' ? 'medio' : 'alto'}`,
              run: () => { setVolume(level); playCompleteChime(); }
            }))
          ]}
          onClose={closePalette}
        />
      )}
      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}

      {terminalDock === 'bottom' && (
        <TerminalDrawer
          isOpen={isTerminalOpen}
          onToggle={() => setIsTerminalOpen((v) => !v)}
          tabs={terminalTabs}
          activeTabId={activeTerminalId}
          defaultCwd={session?.projectPath || workspaceOverview.workspaceDir}
          quickCommands={terminalQuickCommands}
          snippets={terminalSnippets}
          dock={terminalDock}
          onToggleDock={() => {
            setTerminalDock((prev) => {
              const next = prev === 'bottom' ? 'right' : 'bottom';
              try { localStorage.setItem('agent-hub.terminalDock', next); } catch {}
              return next;
            });
          }}
          onSaveSnippets={(next) => {
            const cwd = sessionRef.current?.projectPath || workspaceOverviewRef.current.workspaceDir || undefined;
            postToHost({ command: 'saveTerminalSnippets', cwd, snippets: next });
          }}
          onSelectTab={setActiveTerminalId}
          onNewTab={createTerminalTab}
          onCloseTab={closeTerminalTab}
          onChangeShell={(shell: TerminalShell, terminalId: string) =>
            setTerminalTabs((prev) => prev.map((t) => (t.id === terminalId ? { ...t, shell } : t)))
          }
          onRunCommand={runTerminalCommand}
          onSendInput={(data, terminalId) => postToHost({ command: 'sendTerminalInput', terminalId, data })}
          onClear={(terminalId) =>
            setTerminalTabs((prev) => prev.map((t) => (t.id === terminalId ? { ...t, output: '' } : t)))
          }
          onStop={(terminalId) => postToHost({ command: 'stopTerminalCommand', terminalId })}
          onPreviewFile={(file, line) => postToHost({ command: 'previewFile', file, line })}
          onAttachToChat={(tailOutput, command) => {
            const header = command ? `Salida de terminal (\`${command}\`):` : 'Salida de terminal:';
            submitSpotlightPrompt(`${header}\n\`\`\`\n${tailOutput}\n\`\`\``);
          }}
          onAskAI={(command, exitCode, tailOutput) => {
            submitSpotlightPrompt(
              `El comando \`${command}\` falló en la terminal con código ${exitCode}. Analiza la causa raíz y corrígelo:\n\`\`\`\n${tailOutput}\n\`\`\``
            );
          }}
        />
      )}

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
