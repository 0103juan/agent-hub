import { HostMessage, HubStatePatch } from '../../shared/ipc';
import {
  AccountProfile,
  LiveStatus,
  ChatMessage,
  ConversationSession,
  AgentMessage,
  FileContextAttachment,
  MCPServerInfo,
  CostSummary,
  SearchHit,
  QueuedMessage,
  TelemetryRegistry
} from '../../shared/types';

export interface HubState {
  accounts: AccountProfile[];
  accountsLoaded: boolean;
  mcps: MCPServerInfo[];
  sessions: ConversationSession[];
  activeSessionId: string;
  telemetry: TelemetryRegistry;
  runningSessionIds: string[];
  queues: Record<string, QueuedMessage[]>;
  comms: AgentMessage[];
  attentionSessionIds: string[];
  costs: CostSummary;
  /** Resultado de buscar dentro de los mensajes de todas las sesiones. */
  searchHits: SearchHit[];
  searchQuery: string;
  /** Sube cada vez que la extensión pide enfocar el composer. */
  focusComposerTick: number;
  live: Record<string, LiveStatus>;
  attachments: FileContextAttachment[];
  workspaceFiles: string[];
  /** Texto que la extensión pide poner en el borrador. */
  composerText?: string;
}

export type HubAction =
  | HostMessage
  | { type: 'removeAttachment'; index: number }
  | { type: 'clearAttachments' }
  | { type: 'composerTextConsumed' };

export const INITIAL_HUB_STATE: HubState = {
  accounts: [],
  accountsLoaded: false,
  mcps: [],
  sessions: [],
  activeSessionId: '',
  telemetry: {},
  runningSessionIds: [],
  queues: {},
  comms: [],
  attentionSessionIds: [],
  costs: { days: [], agents: [] },
  searchHits: [],
  searchQuery: '',
  focusComposerTick: 0,
  live: {},
  attachments: [],
  workspaceFiles: []
};

function applyPatch(state: HubState, patch: HubStatePatch): HubState {
  return { ...state, ...patch, accountsLoaded: state.accountsLoaded || patch.accounts !== undefined };
}

function updateMessage(
  state: HubState,
  sessionId: string,
  messageId: string,
  change: (message: ChatMessage) => ChatMessage
): HubState {
  return {
    ...state,
    sessions: state.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, messages: session.messages.map((m) => (m.id === messageId ? change(m) : m)) }
        : session
    )
  };
}

export function hubReducer(state: HubState, action: HubAction): HubState {
  switch (action.type) {
    case 'state':
      return applyPatch(state, action.patch);
    case 'live': {
      const { [action.sessionId]: _previous, ...others } = state.live;
      return { ...state, live: action.live ? { ...others, [action.sessionId]: action.live } : others };
    }
    case 'turnText':
      return updateMessage(state, action.sessionId, action.messageId, (m) => ({ ...m, content: m.content + action.text }));
    case 'turnActivity':
      return updateMessage(state, action.sessionId, action.messageId, (m) => ({
        ...m,
        activity: [...(m.activity ?? []), action.label],
        // El host vacía el texto pendiente antes de anunciar el paso, así que este largo coincide con el suyo.
        activityOffsets: [...(m.activityOffsets ?? []), m.content.length]
      }));
    case 'turnQuestion':
      return updateMessage(state, action.sessionId, action.messageId, (m) => ({
        ...m,
        questionOptions: { question: action.question, options: action.options }
      }));
    case 'attachmentAdded':
      return { ...state, attachments: [...state.attachments, action.attachment] };
    case 'workspaceFiles':
      return { ...state, workspaceFiles: action.files };
    case 'searchResults':
      return { ...state, searchQuery: action.query, searchHits: action.hits };
    case 'focusComposer':
      return { ...state, focusComposerTick: state.focusComposerTick + 1 };
    case 'composerText':
      return { ...state, composerText: action.text };
    case 'removeAttachment':
      return { ...state, attachments: state.attachments.filter((_, index) => index !== action.index) };
    case 'clearAttachments':
      return { ...state, attachments: [] };
    case 'composerTextConsumed':
      return { ...state, composerText: undefined };
  }
}
