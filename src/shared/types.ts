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

/** `readonly` quita al agente las herramientas de escritura (solo las respeta Claude). */
export type SessionPermission = 'full' | 'readonly';

/** Gasto agregado de todas las sesiones, para la pestaña Métricas. */
export interface CostSummary {
  /** Últimos días con gasto, de más viejo a más nuevo; `day` es YYYY-MM-DD. */
  days: Array<{ day: string; costUSD: number }>;
  /** Gasto total por agente, de mayor a menor. */
  agents: Array<{ name: string; costUSD: number; durationMs?: number }>;
}

/** Sesión archivada, sin sus mensajes. */
export interface ArchivedSessionInfo {
  id: string;
  title: string;
  updatedAt: number;
  projectName?: string;
}

/** Aviso para el centro de notificaciones del panel. */
export interface Notice {
  id: string;
  at: number;
  text: string;
  sessionId?: string;
}

export interface SquadDiffFile {
  file: string;
  /** A, M, D... según git. */
  status: string;
  diff: string;
}

export interface SearchHit {
  sessionId: string;
  title: string;
  /** Fragmento del mensaje que coincide. */
  snippet: string;
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
  /** Duración del turno en ms. */
  durationMs?: number;
  /** Commit de la copia aparte al terminar este turno; permite volver a ese punto. */
  stageCommit?: string;
  /** Respuesta de un turno "plan primero": propone, no edita. */
  isPlan?: boolean;
  /** Fijado por la persona para encontrarlo rápido. */
  pinned?: boolean;
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
  /** Archivos o capturas adjuntas que acompañan al mensaje en cola. */
  attachments?: FileContextAttachment[];
  /** Marca de tiempo de cuándo se encoló. */
  at?: number;
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

/** Ciclo por defecto de `/loop` sin texto. */
export const DEFAULT_LOOP_INSTRUCTION = 'Analiza la app, propón mejoras concretas, impleméntalas, compila, corrige los errores y vuelve a analizar.';

export interface LoopConfig {
  active: boolean;
  instruction: string;
  iteration: number;
  maxIterations?: number;
  startedAt?: number;
  /** La persona pidió parar cuando termine la iteración en curso, sin cortarla. */
  stopAfterCurrent?: boolean;
}

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
  permission?: SessionPermission;
  /** Los traspasos entre agentes del equipo esperan la aprobación de la persona. */
  approveStages?: boolean;
  /** A quién pasa el trabajo en este equipo; manda sobre el `handoffTo` del rol. */
  handoffTo?: ProtocolRole[];
  /** Commit desde el que partió la copia aparte. */
  isolatedBase?: string;
  /** Rama del `git worktree` aislado del equipo; `projectPath` apunta a esa copia. */
  isolatedBranch?: string;
  /** Configuración del bucle continuo iterativo (Modo Loop). */
  loopConfig?: LoopConfig;
  messages: ChatMessage[];
  /** Total real; la vista solo recibe los mensajes de la sesión activa. */
  messageCount?: number;
  createdAt: number;
  updatedAt: number;
}
