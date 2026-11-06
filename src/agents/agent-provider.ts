import { AccountProfile, ProviderType, QuotaSnapshot, ReasoningEffort, TurnUsage } from '../shared/types';

export interface AgentTarget {
  account: AccountProfile;
  workspaceDir: string;
  modelId: string;
  effort?: ReasoningEffort;
  resumeId?: string;
  /** El agente no debe modificar archivos; solo lo hacen cumplir los proveedores que pueden. */
  readOnly?: boolean;
}

export interface AgentTurnRequest extends AgentTarget {
  prompt: string;
}

/** Lo que un proveedor informa mientras corre un turno. */
export type AgentEvent =
  | { kind: 'text'; text: string }
  | { kind: 'activity'; label: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'resumeId'; id: string }
  | { kind: 'quota'; quota: QuotaSnapshot }
  | { kind: 'usage'; usage: TurnUsage }
  | { kind: 'question'; question: string; options: string[] }
  | { kind: 'turnEnd' }
  | { kind: 'error'; message: string };

export type TurnOutcome =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface AgentRun {
  outcome: Promise<TurnOutcome>;
  cancel(): void;
}

/** Estrategia por proveedor: agregar uno nuevo no toca el chat ni la interfaz. */
export interface AgentProvider {
  readonly type: ProviderType;
  discoverAccounts(forceRefresh: boolean): Promise<AccountProfile[]>;
  startTurn(request: AgentTurnRequest, onEvent: (event: AgentEvent) => void): AgentRun;
  /** Opcional: arranca la CLI antes del mensaje para responder más rápido. */
  prewarm?(target: AgentTarget): void;
  openLogin(account: AccountProfile): void;
  /** Texto para confirmar; undefined si el proveedor no pide confirmación. */
  describeLogout(account: AccountProfile): string | undefined;
  logout(account: AccountProfile): Promise<void>;
  addAccount(label: string): void;
}
