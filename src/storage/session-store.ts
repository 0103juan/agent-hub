import * as path from 'path';
import { DEFAULT_MODEL_ID, DEFAULT_PROFILE_ID } from '../shared/model-selection';
import { ChatMessage, ConversationSession, ProtocolRole, ReasoningEffort } from '../shared/types';
import { DebouncedJsonFile, readJsonFile } from './json-file';

const DEFAULT_TITLE = 'Nueva conversación';
const LEGACY_DEFAULT_TITLES = new Set([DEFAULT_TITLE, 'Nueva Conversación', 'Conversación Inicial']);
const MAX_TITLE_LENGTH = 40;

export interface NewSessionOptions {
  profileId?: string;
  modelId?: string;
  effort?: ReasoningEffort;
  projectName?: string;
  projectPath?: string;
  taskSlug?: string;
  protocolRole?: ProtocolRole;
  squad?: string;
}

type StoredSession = Omit<ConversationSession, 'modelId'> & { modelId?: string; modelName?: string };

/** Normaliza sesiones antiguas y turnos que quedaron a medias al cerrar VS Code. */
export function migrateSession(stored: StoredSession): ConversationSession {
  const { modelName, ...session } = stored;
  const rawModel = session.modelId ?? modelName ?? DEFAULT_MODEL_ID;
  const isDisplayName = /\s/.test(rawModel);
  return {
    ...session,
    modelId: isDisplayName ? DEFAULT_MODEL_ID : rawModel.replace(/-(low|medium|high)$/, ''),
    profileId: session.profileId === 'google-workspace' ? 'google-main' : session.profileId,
    messages: session.messages
      .filter((message) => message.content || message.role !== 'assistant')
      .map((message) => ({ ...message, isStreaming: false }))
  };
}

export class SessionStore {
  private readonly sessionsFile: DebouncedJsonFile;
  private readonly sessions = new Map<string, ConversationSession>();
  private activeSessionId: string;

  constructor(storageDir: string) {
    const filePath = path.join(storageDir, 'sessions.json');
    this.sessionsFile = new DebouncedJsonFile(filePath, () => this.list());
    for (const stored of readJsonFile<StoredSession[]>(filePath, [])) {
      const session = migrateSession(stored);
      this.sessions.set(session.id, session);
    }
    this.activeSessionId = this.list()[0]?.id ?? this.create({}).id;
  }

  private persist(): void {
    this.sessionsFile.schedule();
  }

  public flush(): void {
    this.sessionsFile.flush();
  }

  public list(): ConversationSession[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public get(sessionId: string): ConversationSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getActive(): ConversationSession {
    return this.sessions.get(this.activeSessionId) ?? this.create({});
  }

  public setActive(sessionId: string): void {
    if (this.sessions.has(sessionId)) this.activeSessionId = sessionId;
  }

  public create(options: NewSessionOptions): ConversationSession {
    const now = Date.now();
    const session: ConversationSession = {
      id: `session-${now}-${Math.random().toString(36).substring(2, 7)}`,
      title: options.taskSlug ?? DEFAULT_TITLE,
      projectName: options.projectName,
      projectPath: options.projectPath,
      taskSlug: options.taskSlug,
      protocolRole: options.protocolRole,
      squad: options.squad,
      profileId: options.profileId ?? DEFAULT_PROFILE_ID,
      modelId: options.modelId ?? DEFAULT_MODEL_ID,
      effort: options.effort ?? 'medium',
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    this.persist();
    return session;
  }

  public update(sessionId: string, changes: Partial<ConversationSession>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    Object.assign(session, changes, { updatedAt: Date.now() });
    this.persist();
  }

  /** Cambiar de cuenta invalida la conversación de la CLI anterior. */
  public changeAccount(sessionId: string, profileId: string): void {
    this.update(sessionId, { profileId, cliSessionId: undefined });
  }

  public appendMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.messages.push(message);
    if (message.role === 'user' && LEGACY_DEFAULT_TITLES.has(session.title)) {
      session.title = message.content.length > MAX_TITLE_LENGTH
        ? `${message.content.slice(0, MAX_TITLE_LENGTH).trim()}…`
        : message.content;
    }
    session.updatedAt = Date.now();
    this.persist();
  }

  /** Ruta del repo de un proyecto, tomada de cualquiera de sus conversaciones. */
  public projectPath(projectName: string): string | undefined {
    return this.list().find((session) => session.projectName === projectName && session.projectPath)?.projectPath;
  }

  public renameProject(from: string, to: string): void {
    for (const session of this.sessions.values()) {
      if (session.projectName === from) session.projectName = to;
    }
    this.persist();
  }

  /** Sin `projectName` la conversación queda fuera de todo proyecto. */
  public moveToProject(sessionId: string, projectName?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.update(sessionId, {
      projectName,
      projectPath: (projectName && this.projectPath(projectName)) || session.projectPath
    });
  }

  public delete(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.list()[0]?.id ?? this.create({}).id;
    }
    this.persist();
  }
}
