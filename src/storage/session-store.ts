import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_MODEL_ID, DEFAULT_PROFILE_ID } from '../shared/model-selection';
import { ArchivedSessionInfo, ChatMessage, ConversationSession, ProtocolRole, ReasoningEffort } from '../shared/types';
import { DebouncedJsonFile, readJsonFile } from './json-file';

const DEFAULT_TITLE = 'Nueva conversación';
const LEGACY_DEFAULT_TITLES = new Set([DEFAULT_TITLE, 'Nueva Conversación', 'Conversación Inicial']);
const MAX_TITLE_LENGTH = 40;
const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewSessionOptions {
  profileId?: string;
  modelId?: string;
  effort?: ReasoningEffort;
  projectName?: string;
  projectPath?: string;
  taskSlug?: string;
  protocolRole?: ProtocolRole;
  squad?: string;
  approveStages?: boolean;
  isolatedBranch?: string;
  isolatedBase?: string;
  handoffTo?: ProtocolRole[];
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
  private readonly archivePath: string;

  constructor(storageDir: string) {
    const filePath = path.join(storageDir, 'sessions.json');
    this.sessionsFile = new DebouncedJsonFile(filePath, () => this.list());
    for (const stored of readJsonFile<StoredSession[]>(filePath, [])) {
      const session = migrateSession(stored);
      this.sessions.set(session.id, session);
    }
    this.archivePath = path.join(storageDir, 'archive.json');
    this.archiveOld(this.archivePath, Date.now() - ARCHIVE_AFTER_MS);
    this.activeSessionId = this.list()[0]?.id ?? this.create({}).id;
  }

  /** Mueve a un archivo aparte las sesiones sin actividad desde `cutoff`; siempre deja al menos una. */
  private archiveOld(archivePath: string, cutoff: number): void {
    const old = this.list().filter((session) => session.updatedAt < cutoff);
    if (old.length === 0 || old.length === this.sessions.size) return;
    try {
      fs.writeFileSync(archivePath, JSON.stringify([...readJsonFile<StoredSession[]>(archivePath, []), ...old]));
    } catch {
      return; // sin copia segura no se borra nada
    }
    for (const session of old) this.sessions.delete(session.id);
    this.persist();
  }

  public listArchive(): ArchivedSessionInfo[] {
    return readJsonFile<StoredSession[]>(this.archivePath, [])
      .map(({ id, title, updatedAt, projectName }) => ({ id, title, updatedAt, projectName }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Devuelve una sesión archivada a la lista; se le renueva la fecha para que no se archive de nuevo al reabrir. */
  public restore(sessionId: string): boolean {
    const archived = readJsonFile<StoredSession[]>(this.archivePath, []);
    const found = archived.find((session) => session.id === sessionId);
    if (!found) return false;
    fs.writeFileSync(this.archivePath, JSON.stringify(archived.filter((session) => session !== found)));
    const session = migrateSession(found);
    this.sessions.set(session.id, { ...session, updatedAt: Date.now() });
    this.persist();
    return true;
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
      approveStages: options.approveStages,
      isolatedBranch: options.isolatedBranch,
      isolatedBase: options.isolatedBase,
      handoffTo: options.handoffTo,
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
    // Una copia aislada de un equipo no es la carpeta del proyecto.
    return this.list().find((session) => session.projectName === projectName && session.projectPath && !session.isolatedBranch)?.projectPath;
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
