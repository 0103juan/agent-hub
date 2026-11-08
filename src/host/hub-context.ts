import { ProviderRegistry } from '../agents/provider-registry';
import { ChatService } from '../chat/chat-service';
import { MCPSyncer } from '../mcp/mcp-syncer';
import { HostMessage } from '../shared/ipc';
import { SessionStore } from '../storage/session-store';
import { TelemetryStore } from '../storage/telemetry-store';

/** Dependencias que reciben los handlers; `extension.ts` las construye una sola vez. */
export interface HubContext {
  sessions: SessionStore;
  telemetry: TelemetryStore;
  providers: ProviderRegistry;
  chat: ChatService;
  mcp: MCPSyncer;
  post(message: HostMessage): void;
  openBesidePanel(): void;
  openMainPanel(): void;
  popOutWindow(): Promise<void>;
}
