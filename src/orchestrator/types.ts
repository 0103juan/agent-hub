export type ProviderType = 'claude' | 'google' | 'openai' | 'copilot';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AccountProfile {
  id: string;
  name: string;
  provider: ProviderType;
  email?: string;
  subscriptionType?: string;
  status: 'connected' | 'disconnected' | 'checking';
  configDir?: string;
  activeModel?: string;
  availableModels?: string[];
}

export interface MCPServerInfo {
  id: string;
  name: string;
  type: 'stdio' | 'http' | 'sse';
  category: 'cloud' | 'local_portfolio' | 'custom';
  command?: string;
  args?: string[];
  url?: string;
  status: 'connected' | 'needs_auth' | 'disconnected';
  syncedToGoogle: boolean;
  syncedToClaude: boolean;
  enabled: boolean;
  description?: string;
}

export interface FileContextAttachment {
  file: string;
  lines?: string;
  content: string;
  language?: string;
}

export interface SessionTelemetry {
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  lastCostUSD?: number;
  weeklyUtilization?: number;
  fiveHourUtilization?: number;
  weeklyResetsAt?: number;
  fiveHourResetsAt?: number;
}

export interface ModelAccountTelemetry {
  key: string; // `${profileId}::${modelName}`
  profileId: string;
  accountName: string;
  modelName: string;
  provider: ProviderType;
  turnsCount: number;
  weeklyUtilization?: number;
  fiveHourUtilization?: number;
  weeklyResetsAt?: number;
  fiveHourResetsAt?: number;
  cumulativeCostUSD: number;
  lastCostUSD?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  lastTurnTokens?: {
    input?: number;
    output?: number;
    thinking?: number;
  };
  lastTurnDurationMs?: number;
  lastUpdated: number;
}

export type TelemetryRegistry = Record<string, ModelAccountTelemetry>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  profileId: string;
  modelName: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: FileContextAttachment[];
  telemetry?: {
    inputTokens?: number;
    outputTokens?: number;
    thinkingTokens?: number;
    costUSD?: number;
    durationMs?: number;
  };
}

export type ProtocolRole = 'explorador' | 'arquitecto' | 'tester' | 'desarrollador' | 'revisor' | 'externo' | 'documentador';

export interface ProtocolRoleConfig {
  id: ProtocolRole;
  label: string;
  description: string;
  recommendedModel: string;
  recommendedEffort: ReasoningEffort;
  systemPrompt: string;
}

export interface ConversationSession {
  id: string;
  title: string;
  projectName?: string; // Ej: 'portafolio', 'metrovia-servicios-back', etc.
  projectPath?: string; // Ruta absoluta del repo
  taskSlug?: string;    // Ej: 'feat-auth', 'secop-query-fix'
  protocolRole?: ProtocolRole;
  profileId: string;
  modelName: string;
  cliSessionId?: string;
  effort: ReasoningEffort;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface WebviewState {
  profiles: AccountProfile[];
  activeProfileId: string;
  selectedModel: string;
  mcps: MCPServerInfo[];
  sessions: ConversationSession[];
  activeSessionId: string;
  messages: ChatMessage[];
  isGenerating: boolean;
  effort: ReasoningEffort;
  telemetryRegistry: TelemetryRegistry;
}
