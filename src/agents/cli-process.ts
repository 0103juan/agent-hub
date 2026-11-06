import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import { AgentEvent, AgentRun, TurnOutcome } from './agent-provider';

export interface StreamParser {
  /** Traduce una línea de salida de la CLI a eventos del agente. */
  parseLine(line: string): AgentEvent[];
}

export interface CliProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Necesario en Windows para lanzar los `.cmd` de npm. */
  shell: boolean;
}

interface ActiveTurn {
  parser: StreamParser;
  onEvent: (event: AgentEvent) => void;
  hasText: boolean;
  isCancelled: boolean;
  parserError?: string;
  resolve: (outcome: TurnOutcome) => void;
}

/** Los IDs viajan sin comillas cuando `shell` es true. */
export function assertSafeCliValue(value: string): string {
  if (!/^[\w.:[\]-]+$/.test(value)) {
    throw new Error(`Valor no permitido para la CLI: ${value}`);
  }
  return value;
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    process.kill(pid, 'SIGTERM');
  }
}

/**
 * CLI en modo `--input-format stream-json`: el proceso sobrevive entre turnos,
 * así cada mensaje se ahorra los segundos de arranque.
 */
export class CliProcess {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly command: string;
  private turn?: ActiveTurn;
  private pendingOutput = '';
  private stderr = '';
  private exitError?: string;
  private hasExited = false;

  constructor({ command, args, cwd, env, shell }: CliProcessOptions) {
    this.command = command;
    this.child = spawn(command, args, { cwd, env, shell, windowsHide: true });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (data: string) => this.handleOutput(data));
    this.child.stderr.on('data', (data: string) => {
      this.stderr += data;
    });
    this.child.stdin.on('error', () => undefined);
    this.child.on('error', (error) => {
      this.exitError = `No se pudo ejecutar ${this.command}: ${error.message}`;
      this.handleExit(null);
    });
    this.child.on('close', (code) => this.handleExit(code));
  }

  public get isIdle(): boolean {
    return !this.hasExited && !this.turn;
  }

  public startTurn(inputLine: string, parser: StreamParser, onEvent: (event: AgentEvent) => void): AgentRun {
    const outcome = new Promise<TurnOutcome>((resolve) => {
      if (this.hasExited) {
        resolve({ status: 'failed', error: this.exitError ?? `${this.command} ya no está en ejecución.` });
        return;
      }
      this.stderr = '';
      this.turn = { parser, onEvent, hasText: false, isCancelled: false, resolve };
      this.child.stdin.write(`${inputLine}\n`);
    });

    return {
      outcome,
      cancel: () => {
        if (this.turn) this.turn.isCancelled = true;
        this.dispose();
      }
    };
  }

  public dispose(): void {
    if (this.child.pid && !this.hasExited) killProcessTree(this.child.pid);
  }

  private handleOutput(data: string): void {
    this.pendingOutput += data;
    const lines = this.pendingOutput.split('\n');
    this.pendingOutput = lines.pop() ?? '';
    lines.forEach((line) => this.handleLine(line));
  }

  private handleLine(line: string): void {
    const turn = this.turn;
    if (!turn) return;

    for (const event of turn.parser.parseLine(line)) {
      if (event.kind === 'turnEnd') {
        this.finishTurn(turn, null);
        return;
      }
      if (event.kind === 'text') turn.hasText = true;
      if (event.kind === 'error') {
        turn.parserError = event.message;
      } else {
        turn.onEvent(event);
      }
    }
  }

  private handleExit(code: number | null): void {
    if (this.hasExited) return;
    this.hasExited = true;
    if (this.pendingOutput.trim()) this.handleLine(this.pendingOutput);
    if (this.turn) this.finishTurn(this.turn, code);
  }

  private finishTurn(turn: ActiveTurn, exitCode: number | null): void {
    this.turn = undefined;
    if (turn.isCancelled) {
      turn.resolve({ status: 'cancelled' });
    } else if (turn.parserError) {
      turn.resolve({ status: 'failed', error: turn.parserError });
    } else if (turn.hasText) {
      turn.resolve({ status: 'completed' });
    } else {
      const detail = this.exitError ?? this.stderr.trim();
      turn.resolve({ status: 'failed', error: detail || `El agente terminó sin respuesta (código ${exitCode ?? 0}).` });
    }
  }
}
