export type ProviderType = 'claude' | 'google' | 'copilot' | 'ollama';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelOption {
  id: string;
  label: string;
  /** Niveles que acepta el modelo; vacío si el proveedor no expone esfuerzo. */
  efforts: ReasoningEffort[];
}

export interface AccountProfile {
  id: string;
  name: string;
  provider: ProviderType;
  email?: string;
  subscriptionType?: string;
  status: 'connected' | 'disconnected';
  configDir?: string;
  models: ModelOption[];
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
  tools?: string[];
  healthMessage?: string;
}

export type MediaType = 'image' | 'audio' | 'video';

export interface FileContextAttachment {
  file: string;
  lines?: string;
  content: string;
  language?: string;
  mediaType?: 'text' | 'file' | MediaType;
  mediaUri?: string;
  /** Versión reducida de la imagen, la única que se guarda en el historial. */
  thumbnailUri?: string;
  fsPath?: string;
  sizeFormatted?: string;
}

export interface QuotaSnapshot {
  weeklyUtilization?: number;
  fiveHourUtilization?: number;
  weeklyResetsAt?: number;
  fiveHourResetsAt?: number;
}

export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUSD?: number;
  durationMs?: number;
}

export interface ModelAccountTelemetry extends QuotaSnapshot {
  key: string; // `${profileId}::${modelName}`
  profileId: string;
  accountName: string;
  modelName: string;
  provider: ProviderType;
  turnsCount: number;
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

export interface QuestionOptions {
  question: string;
  options: string[];
  selected?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  profileId: string;
  modelName: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
  /** Herramientas que usó el agente durante el turno. */
  activity?: string[];
  /** Largo de `content` cuando empezó cada herramienta: el texto anterior al último paso es narración, no respuesta. */
  activityOffsets?: number[];
  /** Razonamiento visible del modelo, recortado. */
  thinking?: string;
  attachments?: FileContextAttachment[];
  checkpointHash?: string;
  checkpointDiff?: string;
  /** Archivos que el turno cambió respecto al checkpoint. */
  checkpointFiles?: string[];
  /** Costo del turno en USD, si el proveedor lo informa. */
  costUSD?: number;
  questionOptions?: QuestionOptions;
}

/** Mensaje esperando a que el agente termine su turno actual. */
export interface QueuedMessage {
  id: string;
  prompt: string;
  /** Nombre del agente que lo envió; ausente si lo escribió la persona. */
  from?: string;
}

/** Lo que un agente está haciendo ahora; alimenta la vista de agentes. */
export interface LiveStatus {
  thinking: string;
  commands: string[];
  tail: string;
}

/** Mensaje entre dos agentes del mismo equipo. */
export interface AgentMessage {
  id: string;
  at: number;
  from: string;
  to: string;
  text: string;
}

export type ProtocolRole = 'explorador' | 'arquitecto' | 'tester' | 'desarrollador' | 'revisor' | 'externo' | 'documentador' | 'disenador' | 'coordinador' | 'depurador';

export interface ProtocolRoleConfig {
  id: ProtocolRole;
  label: string;
  description: string;
  recommendedModel: string;
  recommendedEffort: ReasoningEffort;
  systemPrompt: string;
  /** El rol no debe modificar archivos; el proveedor lo hace cumplir cuando puede. */
  readOnly?: boolean;
  /** Rol al que pasa su trabajo en un pipeline. */
  handoffTo?: ProtocolRole;
}

export interface ConversationSession {
  id: string;
  title: string;
  projectName?: string; // Ej: 'portafolio', 'metrovia-servicios-back', etc.
  projectPath?: string; // Ruta absoluta del repo
  taskSlug?: string;    // Ej: 'feat-auth', 'secop-query-fix'
  /** Agentes creados juntos comparten equipo y pueden escribirse entre sí. */
  squad?: string;
  protocolRole?: ProtocolRole;
  profileId: string;
  modelId: string;
  /** ID de la conversación en la CLI; solo vale para la cuenta que lo creó. */
  cliSessionId?: string;
  effort: ReasoningEffort;
  /** Límite de gasto en USD; con equipo cuenta el gasto de todos sus agentes. */
  budgetUSD?: number;
  messages: ChatMessage[];
  /** Total real; la vista solo recibe los mensajes de la sesión activa. */
  messageCount?: number;
  createdAt: number;
  updatedAt: number;
}
