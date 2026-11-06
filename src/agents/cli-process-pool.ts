import { AgentEvent, AgentRun } from './agent-provider';
import { CliProcess, CliProcessOptions, StreamParser } from './cli-process';

/** Cada proceso vivo carga sus MCP (unos 1,2 GB medidos), por eso solo se conserva uno. */
const MAX_IDLE_PROCESSES = 1;
const IDLE_TTL_MS = 5 * 60 * 1000;

export interface PooledCliSpec extends CliProcessOptions {
  /** Identifica cuenta, modelo, esfuerzo y carpeta: lo que un proceso no puede cambiar. */
  key: string;
  /** Argumentos para retomar una conversación existente. */
  resumeArgs: (resumeId: string) => string[];
}

interface IdleProcess {
  process: CliProcess;
  key: string;
  conversationId?: string;
  expiry: NodeJS.Timeout;
}

export class CliProcessPool {
  private idle: IdleProcess[] = [];

  private spawnProcess(spec: PooledCliSpec, resumeId?: string): CliProcess {
    const args = resumeId ? [...spec.args, ...spec.resumeArgs(resumeId)] : spec.args;
    return new CliProcess({ ...spec, args });
  }

  private take(key: string, conversationId?: string): CliProcess | undefined {
    const index = this.idle.findIndex(
      (entry) => entry.key === key && entry.conversationId === conversationId && entry.process.isIdle
    );
    if (index === -1) return undefined;
    const [entry] = this.idle.splice(index, 1);
    clearTimeout(entry.expiry);
    return entry.process;
  }

  private evict(entry: IdleProcess): void {
    clearTimeout(entry.expiry);
    this.idle = this.idle.filter((candidate) => candidate !== entry);
    entry.process.dispose();
  }

  private park(process: CliProcess, key: string, conversationId?: string): void {
    const entry: IdleProcess = {
      process,
      key,
      conversationId,
      expiry: setTimeout(() => this.evict(entry), IDLE_TTL_MS)
    };
    entry.expiry.unref?.();
    this.idle.push(entry);
    while (this.idle.length > MAX_IDLE_PROCESSES) this.evict(this.idle[0]);
  }

  public runTurn(
    spec: PooledCliSpec,
    resumeId: string | undefined,
    inputLine: string,
    parser: StreamParser,
    onEvent: (event: AgentEvent) => void
  ): AgentRun {
    const process = this.take(spec.key, resumeId) ?? this.spawnProcess(spec, resumeId);
    let conversationId = resumeId;
    const run = process.startTurn(inputLine, parser, (event) => {
      if (event.kind === 'resumeId') conversationId = event.id;
      onEvent(event);
    });

    return {
      cancel: run.cancel,
      outcome: run.outcome.then((outcome) => {
        // Tras un error la conversación puede quedar inconsistente: no se reutiliza.
        if (outcome.status === 'completed') {
          this.park(process, spec.key, conversationId);
        } else {
          process.dispose();
        }
        return outcome;
      })
    };
  }

  /** Deja el proceso arrancado antes de que llegue el mensaje. */
  public prewarm(spec: PooledCliSpec, resumeId?: string): void {
    const isReady = this.idle.some(
      (entry) => entry.key === spec.key && entry.conversationId === resumeId && entry.process.isIdle
    );
    if (!isReady) this.park(this.spawnProcess(spec, resumeId), spec.key, resumeId);
  }

  public dispose(): void {
    [...this.idle].forEach((entry) => this.evict(entry));
  }
}
