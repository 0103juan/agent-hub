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
  SearchHit,
  SessionPermission,
  TelemetryRegistry
} from './types';

export interface SessionPatch {
  profileId?: string;
  modelId?: string;
  effort?: ReasoningEffort;
  protocolRole?: ProtocolRole | null;
  /** null quita el límite. */
  budgetUSD?: number | null;
  permission?: SessionPermission;
}

/** Mensajes webview → extensión. */
export type WebviewMessage =
  | { command: 'ready' }
  | { command: 'refreshAccounts' }
  | { command: 'openBeside' }
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
  | { command: 'attachActiveEditor' }
  | { command: 'attachFiles' }
  | { command: 'savePastedFile'; dataUri: string; fileName: string }
  | { command: 'searchFiles'; query: string }
  | { command: 'attachFile'; file: string }
  | { command: 'attachProblems' }
  | { command: 'attachGit' }
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
  | { command: 'exportSession'; sessionId: string }
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
  | { command: 'runAction'; actionId: string; sessionId: string; input: string };

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
  | { type: 'attachmentAdded'; attachment: FileContextAttachment }
  | { type: 'workspaceFiles'; files: string[] }
  | { type: 'composerText'; text: string }
  | { type: 'searchResults'; query: string; hits: SearchHit[] }
  | { type: 'focusComposer' }
  | { type: 'archive'; items: ArchivedSessionInfo[] }
  | { type: 'notice'; notice: Notice }
  | { type: 'teamReport'; squad: string; markdown: string }
  | { type: 'squadDiff'; squad: string; files: SquadDiffFile[] }
  | { type: 'experience'; content: string }
  | { type: 'fileDiff'; checkpointHash: string; file: string; diff: string };
