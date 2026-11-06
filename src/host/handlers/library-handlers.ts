import * as fs from 'fs';
import * as path from 'path';
import { EXPERIENCE_FILE } from '../../agents/prompt-composer';
import { getCheckpointFileDiff } from '../git-checkpoint';
import { HubContext } from '../hub-context';
import { isInsideWorkspace } from '../safe-path';
import { workspaceDir } from '../workspace';
import { HandlerMap } from './handler-types';
import { workspaceDirForSession } from './session-handlers';

/** Sesiones archivadas, memoria del proyecto, diffs por archivo, mensajes fijados y traspasos por aprobar. */
export function libraryHandlers(hub: HubContext): HandlerMap<
  'listArchive' | 'restoreSession' | 'readExperience' | 'saveExperience' | 'fileDiff' | 'pinMessage' | 'approveHandoff'
> {
  const experiencePath = () => {
    const dir = workspaceDir();
    return dir ? path.join(dir, EXPERIENCE_FILE) : undefined;
  };
  const publishArchive = () => hub.post({ type: 'archive', items: hub.sessions.listArchive() });
  const publishExperience = () => {
    const file = experiencePath();
    let content = '';
    try {
      if (file) content = fs.readFileSync(file, 'utf8');
    } catch {
      // Sin archivo todavía: la memoria está vacía.
    }
    hub.post({ type: 'experience', content });
  };

  return {
    listArchive: publishArchive,

    restoreSession: ({ sessionId }) => {
      if (hub.sessions.restore(sessionId)) hub.chat.publishSessions();
      publishArchive();
    },

    readExperience: publishExperience,

    saveExperience: ({ content }) => {
      const file = experiencePath();
      if (!file) throw new Error('Abre una carpeta de trabajo para guardar la memoria del proyecto.');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
      publishExperience();
    },

    fileDiff: ({ sessionId, checkpointHash, file }) => {
      const dir = workspaceDirForSession(hub, sessionId);
      if (!isInsideWorkspace(dir, file)) return;
      hub.post({ type: 'fileDiff', checkpointHash, file, diff: getCheckpointFileDiff(dir, checkpointHash, file) });
    },

    pinMessage: ({ sessionId, messageId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      hub.sessions.update(sessionId, {
        messages: session.messages.map((message) => (message.id === messageId ? { ...message, pinned: !message.pinned || undefined } : message))
      });
      hub.chat.publishSessions();
    },

    approveHandoff: ({ id, approve }) => hub.chat.approveHandoff(id, approve)
  };
}
