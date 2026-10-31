import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationSession, ChatMessage, ReasoningEffort, TelemetryRegistry, ModelAccountTelemetry, ProviderType, ProtocolRole } from './types';

export class SessionStorage {
  private storageDir: string;
  private sessionsFile: string;
  private telemetryFile: string;
  private sessions: Map<string, ConversationSession> = new Map();
  private telemetryRegistry: TelemetryRegistry = {};
  private activeSessionId: string | null = null;

  constructor() {
    this.storageDir = path.join(os.homedir(), '.agent-hub');
    this.sessionsFile = path.join(this.storageDir, 'sessions.json');
    this.telemetryFile = path.join(this.storageDir, 'telemetry.json');
    this.ensureStorageExists();
    this.loadSessionsFromDisk();
    this.loadTelemetryFromDisk();
  }

  private ensureStorageExists(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private loadSessionsFromDisk(): void {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const raw = fs.readFileSync(this.sessionsFile, 'utf8');
        const list: ConversationSession[] = JSON.parse(raw);
        for (const s of list) {
          this.normalizeSessionProvider(s);
          this.sessions.set(s.id, s);
        }
        if (list.length > 0) {
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          this.activeSessionId = list[0].id;
        }
      }
    } catch (e) {
      console.error('Error cargando sesiones:', e);
    }

    if (this.sessions.size === 0) {
      this.createNewSession('Conversación Inicial', 'claude-main', 'Claude 3.7 Sonnet', 'medium');
    }
  }

  private saveSessionsToDisk(): void {
    try {
      this.ensureStorageExists();
      const list = Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      fs.writeFileSync(this.sessionsFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {
      console.error('Error guardando sesiones:', e);
    }
  }

  private loadTelemetryFromDisk(): void {
    try {
      if (fs.existsSync(this.telemetryFile)) {
        const raw = fs.readFileSync(this.telemetryFile, 'utf8');
        this.telemetryRegistry = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error cargando telemetría:', e);
      this.telemetryRegistry = {};
    }
  }

  private saveTelemetryToDisk(): void {
    try {
      this.ensureStorageExists();
      fs.writeFileSync(this.telemetryFile, JSON.stringify(this.telemetryRegistry, null, 2), 'utf8');
    } catch (e) {
      console.error('Error guardando telemetría:', e);
    }
  }

  public getSessions(): ConversationSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getActiveSession(): ConversationSession {
    if (!this.activeSessionId || !this.sessions.has(this.activeSessionId)) {
      const first = Array.from(this.sessions.values())[0];
      if (first) {
        this.activeSessionId = first.id;
        return first;
      }
      return this.createNewSession('Conversación Inicial', 'claude-main', 'Claude 3.7 Sonnet', 'medium');
    }
    return this.sessions.get(this.activeSessionId)!;
  }

  public setActiveSession(id: string): ConversationSession | null {
    if (this.sessions.has(id)) {
      this.activeSessionId = id;
      return this.sessions.get(id)!;
    }
    return null;
  }

  public createNewSession(
    title: string,
    profileId: string,
    modelName: string,
    effort: ReasoningEffort,
    projectName?: string,
    projectPath?: string,
    taskSlug?: string,
    protocolRole?: ProtocolRole
  ): ConversationSession {
    const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const session: ConversationSession = {
      id,
      title: title || 'Nueva Conversación',
      projectName,
      projectPath,
      taskSlug,
      protocolRole,
      profileId,
      modelName,
      effort,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.saveSessionsToDisk();
    return session;
  }

  public updateSessionMetadata(
    sessionId: string,
    meta: {
      title?: string;
      projectName?: string;
      taskSlug?: string;
      protocolRole?: ProtocolRole;
    }
  ): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (meta.title !== undefined) s.title = meta.title;
    if (meta.projectName !== undefined) s.projectName = meta.projectName;
    if (meta.taskSlug !== undefined) s.taskSlug = meta.taskSlug;
    if (meta.protocolRole !== undefined) s.protocolRole = meta.protocolRole;
    s.updatedAt = Date.now();
    this.saveSessionsToDisk();
  }

  public updateSessionSettings(
    sessionId: string,
    profileId?: string,
    modelName?: string,
    effort?: ReasoningEffort
  ): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (profileId) s.profileId = profileId;
    if (modelName) s.modelName = modelName;
    if (effort) s.effort = effort;
    this.normalizeSessionProvider(s);
    s.updatedAt = Date.now();
    this.saveSessionsToDisk();
  }

  public normalizeSessionProvider(session: ConversationSession): void {
    const model = session.modelName || '';
    const isGoogle =
      model.startsWith('gemini-') ||
      model.startsWith('claude-opus-5') ||
      model.startsWith('claude-sonnet-5') ||
      model === 'gpt-oss-120b-medium';
    const isClaudeNative = model.startsWith('Claude 3') || model === 'Claude Opus 5.5';

    if (isGoogle && (!session.profileId || session.profileId.startsWith('claude'))) {
      session.profileId = 'google-workspace';
    } else if (isClaudeNative && (!session.profileId || session.profileId.startsWith('google'))) {
      session.profileId = 'claude-main';
    }
  }

  public updateSessionMessages(
    sessionId: string,
    messages: ChatMessage[],
    cliSessionId?: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.messages = messages;
    session.updatedAt = Date.now();
    if (cliSessionId) {
      session.cliSessionId = cliSessionId;
    }

    if (session.title === 'Nueva Conversación' || session.title === 'Conversación Inicial') {
      const firstUserMsg = messages.find((m) => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        session.title = firstUserMsg.content.slice(0, 35).trim() + (firstUserMsg.content.length > 35 ? '...' : '');
      }
    }

    this.saveSessionsToDisk();
  }

  public deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.values());
      this.activeSessionId = remaining.length > 0 ? remaining[0].id : null;
    }
    this.saveSessionsToDisk();
  }

  // --- TELEMETRÍA POR CUENTA Y POR MODELO ---

  public getTelemetryRegistry(): TelemetryRegistry {
    return this.telemetryRegistry;
  }

  public recordTurnTelemetry(
    profileId: string,
    accountName: string,
    modelName: string,
    provider: ProviderType,
    delta: {
      inputTokens?: number;
      outputTokens?: number;
      thinkingTokens?: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
      costUSD?: number;
      weeklyUtilization?: number;
      fiveHourUtilization?: number;
      weeklyResetsAt?: number;
      fiveHourResetsAt?: number;
      durationMs?: number;
    }
  ): ModelAccountTelemetry {
    const key = `${profileId}::${modelName}`;
    const existing = this.telemetryRegistry[key] || {
      key,
      profileId,
      accountName,
      modelName,
      provider,
      turnsCount: 0,
      cumulativeCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThinkingTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      lastUpdated: Date.now()
    };

    existing.turnsCount += 1;
    existing.accountName = accountName;
    existing.lastUpdated = Date.now();

    if (delta.inputTokens) existing.totalInputTokens += delta.inputTokens;
    if (delta.outputTokens) existing.totalOutputTokens += delta.outputTokens;
    if (delta.thinkingTokens) existing.totalThinkingTokens += delta.thinkingTokens;
    if (delta.cacheReadTokens) existing.totalCacheReadTokens += delta.cacheReadTokens;
    if (delta.cacheCreationTokens) existing.totalCacheCreationTokens += delta.cacheCreationTokens;

    if (delta.costUSD) {
      existing.cumulativeCostUSD += delta.costUSD;
      existing.lastCostUSD = delta.costUSD;
    }

    if (delta.weeklyUtilization !== undefined) {
      existing.weeklyUtilization = delta.weeklyUtilization;
    }
    if (delta.fiveHourUtilization !== undefined) {
      existing.fiveHourUtilization = delta.fiveHourUtilization;
    }
    if (delta.weeklyResetsAt) existing.weeklyResetsAt = delta.weeklyResetsAt;
    if (delta.fiveHourResetsAt) existing.fiveHourResetsAt = delta.fiveHourResetsAt;
    if (delta.durationMs) existing.lastTurnDurationMs = delta.durationMs;

    existing.lastTurnTokens = {
      input: delta.inputTokens,
      output: delta.outputTokens,
      thinking: delta.thinkingTokens
    };

    this.telemetryRegistry[key] = existing;
    this.saveTelemetryToDisk();
    return existing;
  }

  public clearTelemetry(): void {
    this.telemetryRegistry = {};
    this.saveTelemetryToDisk();
  }
}
