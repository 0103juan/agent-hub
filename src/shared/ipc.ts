import {
  AccountProfile,
  ArchivedSessionInfo,
  Notice,
  SquadDiffFile,
  AgentMessage,
  LiveStatus,
  QueuedMessage,
  ConversationSession,
  FileContextAttachment,
  MCPServerInfo,
  ProtocolRole,
  ProviderType,
  ReasoningEffort,
  CostSummary,
  LoopConfig,
  SearchHit,
  SessionPermission,
  TelemetryRegistry
} from './types';

export interface SessionPatch {
  profileId?: string;
  modelId?: string;
  effort?: ReasoningEffort;
  protocolRole?: ProtocolRole | null;
  /** Nuevo título de la conversación; vacío se ignora. */
  title?: string;
  /** null quita el límite. */
  budgetUSD?: number | null;
  permission?: SessionPermission;
  loopConfig?: LoopConfig | null;
}

/** Mensajes webview → extensión. */
export type WebviewMessage =
  | { command: 'ready' }
  | { command: 'refreshAccounts' }
  | { command: 'openBeside' }
  | { command: 'openMain' }
  | { command: 'popOutWindow'; url?: string }
  | { command: 'toggleAlwaysOnTop' }
  | { command: 'openExternalBrowser' }
  | { command: 'createSession'; projectName?: string; taskSlug?: string; protocolRole?: ProtocolRole }
  | { command: 'switchSession'; sessionId: string }
  | { command: 'deleteSession'; sessionId: string }
  | { command: 'moveSession'; sessionId: string; projectName?: string }
  | { command: 'renameProject'; from: string; to: string }
  | { command: 'deleteProject'; projectName: string }
  | { command: 'spawnAgents'; projectName?: string; roles: Array<ProtocolRole | undefined>; prompt: string; isolate?: boolean }
  | { command: 'removeQueued'; sessionId: string; queuedId: string }
  | { command: 'resumeQueue'; sessionId: string }
  | { command: 'updateSession'; sessionId: string; patch: SessionPatch }
  | { command: 'sendPrompt'; sessionId: string; prompt: string; attachments: FileContextAttachment[]; planFirst?: boolean }
  | { command: 'stopTurn'; sessionId: string }
  | { command: 'prewarmSession'; sessionId: string }
  | { command: 'attachActiveEditor'; sessionId?: string }
  | { command: 'attachFiles'; sessionId?: string }
  | { command: 'savePastedFile'; dataUri: string; fileName: string; sessionId?: string }
  | { command: 'searchFiles'; query: string }
  | { command: 'attachFile'; file: string; sessionId?: string }
  | { command: 'attachProblems'; sessionId?: string }
  | { command: 'attachGit'; sessionId?: string }
  | { command: 'saveCodeToFile'; filePath: string; code: string }
  | { command: 'rollbackTurn'; sessionId: string; checkpointHash: string }
  | { command: 'startPipeline'; projectName?: string; prompt: string; requireApproval?: boolean; template?: string; isolate?: boolean }
  | { command: 'compareModels'; prompt: string }
  | { command: 'searchSessions'; query: string }
  | { command: 'teamReport'; sessionId: string }
  | { command: 'squadDiff'; sessionId: string }
  | { command: 'restoreStage'; sessionId: string; messageId: string }
  | { command: 'queueAction'; sessionId: string; action: 'cancel' | 'prioritize' }
  | { command: 'pruneExperience' }
  | { command: 'finishSquad'; sessionId: string; action: 'merge' | 'discard' }
  | { command: 'approveHandoff'; id: string; approve: boolean }
  | { command: 'listArchive' }
  | { command: 'restoreSession'; sessionId: string }
  | { command: 'readExperience' }
  | { command: 'saveExperience'; content: string }
  | { command: 'fileDiff'; sessionId: string; checkpointHash: string; file: string }
  | { command: 'pinMessage'; sessionId: string; messageId: string }
  | { command: 'revertFile'; sessionId: string; checkpointHash: string; file: string }
  | { command: 'failoverSession'; sessionId: string; targetProvider: ProviderType }
  | { command: 'checkMcpHealth'; mcpId: string }
  | { command: 'exportSession'; sessionId: string; format?: 'markdown' | 'html' | 'json' }
  | { command: 'crossReview'; sessionId: string; messageId: string }
  | { command: 'forkSession'; sessionId: string; messageId: string }
  | { command: 'generateCommit'; sessionId: string }
  | { command: 'auditBranch'; sessionId: string }
  | { command: 'applyInlineDiff'; code: string; filePath?: string }
  | { command: 'clearInlineDiff' }
  | { command: 'insertCode'; code: string }
  | { command: 'openDiff'; code: string }
  | { command: 'openAttachment'; fsPath: string; line?: number; endLine?: number }
  | { command: 'loginAccount'; profileId: string }
  | { command: 'logoutAccount'; profileId: string }
  | { command: 'addAccount'; provider: ProviderType; label?: string }
  | { command: 'togglePortfolioMcp'; mcpName: string; enable: boolean }
  | { command: 'syncMcps' }
  | { command: 'clearTelemetry' }
  | { command: 'previewFile'; file: string; line?: number }
  | { command: 'setWorkspaceDir'; dir: string }
  | { command: 'setSessionDir'; sessionId: string; dir: string }
  | { command: 'chooseSessionDir'; sessionId: string }
  | { command: 'setVisibleSessions'; clientId: string; sessionIds: string[] }
  | { command: 'chooseWorkspaceDir' }
  | { command: 'listDirs'; dir?: string }
  | { command: 'listDocuments'; all?: boolean; root?: string }
  | { command: 'readDocument'; file: string; root?: string }
  | { command: 'saveDocument'; file: string; content: string; expectedMtime?: number; force?: boolean; root?: string }
  | { command: 'startSystemDictation' }
  | { command: 'getWorkspaceOverview' }
  | { command: 'openFolderInExplorer'; dir?: string }
  | { command: 'runTerminalCommand'; commandLine: string; terminalId?: string; cwd?: string; shell?: string }
  | { command: 'stopTerminalCommand'; terminalId?: string }
  | { command: 'sendTerminalInput'; data: string; terminalId?: string }
  | { command: 'loadTerminalSnippets'; cwd?: string }
  | { command: 'saveTerminalSnippets'; snippets: Array<{ label: string; cmd: string }>; cwd?: string }
  | { command: 'gitDiffFile'; file: string }
  | { command: 'gitRevertFile'; file: string }
  | { command: 'gitCommitQuick'; message: string }
  | { command: 'searchContent'; query: string }
  | { command: 'getGitBranches'; dir?: string; sessionId?: string }
  | { command: 'getDirGitStatus'; dir?: string; sessionId?: string }
  | { command: 'checkoutBranch'; branch: string; dir?: string; sessionId?: string }
  | { command: 'createBranch'; branch: string; dir?: string; sessionId?: string }
  | { command: 'deleteBranch'; branch: string; dir?: string; sessionId?: string }
  | { command: 'initGitRepo'; dir?: string; sessionId?: string }
  | { command: 'runSecurityAudit' }
  | { command: 'loadScratchpad' }
  | { command: 'saveScratchpad'; content: string }
  | { command: 'runAction'; actionId: string; sessionId: string; input: string }
  | { command: 'startLoop'; sessionId: string; instruction: string; maxIterations?: number }
  | { command: 'stopLoop'; sessionId: string }
  | { command: 'finishLoop'; sessionId: string };

export type WebviewCommand = WebviewMessage['command'];

export interface HubStatePatch {
  accounts?: AccountProfile[];
  mcps?: MCPServerInfo[];
  sessions?: ConversationSession[];
  activeSessionId?: string;
  telemetry?: TelemetryRegistry;
  runningSessionIds?: string[];
  queues?: Record<string, QueuedMessage[]>;
  comms?: AgentMessage[];
  /** Agentes que terminaron o preguntaron y la persona aún no vio. */
  attentionSessionIds?: string[];
  costs?: CostSummary;
  /** Traspasos entre agentes esperando tu aprobación. */
  pendingHandoffs?: AgentMessage[];
  /** Turnos esperando cupo, en orden de llegada. */
  waitingSessionIds?: string[];
}

/** Mensajes extensión → webview. */
export type HostMessage =
  | { type: 'state'; patch: HubStatePatch }
  | { type: 'live'; sessionId: string; live?: LiveStatus }
  | { type: 'turnText'; sessionId: string; messageId: string; text: string }
  | { type: 'turnActivity'; sessionId: string; messageId: string; label: string }
  | { type: 'turnQuestion'; sessionId: string; messageId: string; question: string; options: string[] }
  | { type: 'attachmentAdded'; attachment: FileContextAttachment; sessionId?: string }
  | { type: 'workspaceFiles'; files: string[] }
  | { type: 'composerText'; text: string }
  | { type: 'searchResults'; query: string; hits: SearchHit[] }
  | { type: 'focusComposer' }
  | { type: 'archive'; items: ArchivedSessionInfo[] }
  | { type: 'notice'; notice: Notice }
  | { type: 'teamReport'; squad: string; markdown: string }
  | { type: 'squadDiff'; squad: string; files: SquadDiffFile[] }
  | { type: 'experience'; content: string }
  | { type: 'filePreview'; file: string; content: string; line?: number }
  | {
      type: 'workspaceOverview';
      workspaceDir: string;
      recentWorkspaces: string[];
      gitFiles: Array<{ path: string; status: 'M' | 'A' | 'D' | '?' | 'R' }>;
      projectTree: Array<{ path: string; name: string; isDir: boolean }>;
      currentBranch?: string;
      isGit?: boolean;
    }
  | {
      type: 'dirGitStatus';
      dir: string;
      sessionId?: string;
      branch: string;
      uncommittedCount: number;
      gitFiles: Array<{ path: string; status: 'M' | 'A' | 'D' | '?' | 'R' }>;
    }
  | { type: 'documents'; root: string; files: Array<{ path: string; name: string; size: number; mtime: number }>; truncated?: boolean; skipped?: string[] }
  | { type: 'documentContent'; file: string; content?: string; mtime?: number; error?: string }
  | { type: 'documentSaved'; file: string; ok: boolean; mtime?: number; error?: string; conflict?: boolean }
  | { type: 'dirListing'; root: string; dir: string; entries: Array<{ name: string; path: string; isGit: boolean }> }
  | { type: 'terminalOutput'; output: string; exitCode?: number; command?: string; terminalId?: string; cwd?: string }
  | { type: 'terminalSnippets'; snippets: Array<{ label: string; cmd: string }> }
  | { type: 'gitDiffResult'; file: string; original: string; modified: string; rawDiff: string }
  | { type: 'contentSearchResults'; query: string; results: Array<{ file: string; line: number; text: string }> }
  | {
      type: 'gitBranches';
      dir?: string;
      isGit?: boolean;
      currentBranch: string;
      branches: string[];
      squadBranches: string[];
    }
  | {
      type: 'securityAuditResult';
      secretIssues: Array<{ file: string; line: number; type: string; snippet: string }>;
      undocumentedEnvVars: string[];
      sqlIssues: Array<{ file: string; line: number; issue: string }>;
    }
  | { type: 'scratchpadContent'; content: string }
  | { type: 'fileDiff'; checkpointHash: string; file: string; diff: string };
