import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountProfile, ModelOption, ProviderType, ReasoningEffort } from '../../shared/types';
import { AgentEvent, AgentProvider, AgentRun, AgentTarget, AgentTurnRequest } from '../agent-provider';
import { assertSafeCliValue } from '../cli-process';
import { CliProcessPool, PooledCliSpec } from '../cli-process-pool';
import { TerminalOpener } from '../terminal-opener';
import { ClaudeStreamParser } from './claude-stream-parser';

const ALL_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'max'];

const CLAUDE_MODELS: ModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', efforts: ALL_EFFORTS },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', efforts: ALL_EFFORTS },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', efforts: ['low', 'medium', 'high'] }
];

const MAIN_DIR_NAME = '.claude';
const EXTRA_DIR_PREFIX = '.claude-';

/** El ejecutable real evita pasar por cmd.exe; el shim de npm queda como respaldo. */
function resolveClaudeBinary(): { command: string; shell: boolean } {
  const binary = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return fs.existsSync(binary) ? { command: binary, shell: false } : { command: 'claude', shell: process.platform === 'win32' };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export class ClaudeProvider implements AgentProvider {
  public readonly type: ProviderType = 'claude';
  private readonly homeDir = os.homedir();
  private readonly binary = resolveClaudeBinary();
  private cachedAccounts?: Promise<AccountProfile[]>;

  constructor(
    private readonly openTerminal: TerminalOpener,
    private readonly pool: CliProcessPool
  ) {}

  public discoverAccounts(forceRefresh: boolean): Promise<AccountProfile[]> {
    if (forceRefresh || !this.cachedAccounts) {
      this.cachedAccounts = this.scanAccounts();
    }
    return this.cachedAccounts;
  }

  private async scanAccounts(): Promise<AccountProfile[]> {
    const extraDirs = fs
      .readdirSync(this.homeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(EXTRA_DIR_PREFIX))
      .map((entry) => entry.name);

    return Promise.all([
      this.readAccount('claude-main', 'Claude (Principal)', path.join(this.homeDir, MAIN_DIR_NAME)),
      ...extraDirs.map((dir) => {
        const slug = dir.slice(EXTRA_DIR_PREFIX.length);
        return this.readAccount(`claude-${slug}`, `Claude (${capitalize(slug)})`, path.join(this.homeDir, dir));
      })
    ]);
  }

  private readAccount(id: string, name: string, configDir: string): Promise<AccountProfile> {
    return new Promise((resolve) => {
      const env = this.buildEnv(id, configDir);
      // `auth status` sale con código 1 sin sesión, pero igual imprime su JSON.
      exec('claude auth status', { env, timeout: 15000, windowsHide: true }, (_error, stdout) => {
        const account: AccountProfile = {
          id,
          name,
          provider: 'claude',
          status: 'disconnected',
          configDir,
          models: CLAUDE_MODELS
        };
        try {
          const status = JSON.parse(stdout);
          account.status = status.loggedIn ? 'connected' : 'disconnected';
          account.email = status.email ?? undefined;
          account.subscriptionType = status.subscriptionType ?? undefined;
        } catch {
          // Sin JSON no hay sesión comprobable: queda desconectada.
        }
        resolve(account);
      });
    });
  }

  /** La cuenta principal usa la configuración nativa de la CLI. */
  private buildEnv(accountId: string, configDir: string): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (accountId === 'claude-main') {
      delete env.CLAUDE_CONFIG_DIR;
    } else {
      env.CLAUDE_CONFIG_DIR = configDir;
    }
    return env;
  }

  private buildSpec({ account, workspaceDir, modelId, effort, readOnly }: AgentTarget): PooledCliSpec {
    const args = [
      '-p',
      '--input-format=stream-json',
      '--output-format=stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
      '--model', assertSafeCliValue(modelId)
    ];
    if (effort) args.push('--effort', effort);
    if (readOnly) args.push('--disallowedTools', 'Edit,Write,NotebookEdit');

    return {
      ...this.binary,
      key: ['claude', account.id, workspaceDir, modelId, effort, readOnly ? 'ro' : 'rw'].join('|'),
      args,
      resumeArgs: (resumeId) => ['--resume', assertSafeCliValue(resumeId)],
      cwd: workspaceDir,
      env: this.buildEnv(account.id, account.configDir ?? path.join(this.homeDir, MAIN_DIR_NAME))
    };
  }

  public startTurn(request: AgentTurnRequest, onEvent: (event: AgentEvent) => void): AgentRun {
    const inputLine = JSON.stringify({ type: 'user', message: { role: 'user', content: request.prompt } });
    return this.pool.runTurn(this.buildSpec(request), request.resumeId, inputLine, new ClaudeStreamParser(), onEvent);
  }

  public prewarm(target: AgentTarget): void {
    this.pool.prewarm(this.buildSpec(target), target.resumeId);
  }

  public openLogin(account: AccountProfile): void {
    this.openTerminal({
      name: `AgentHub: ${account.name}`,
      env: { CLAUDE_CONFIG_DIR: account.id === 'claude-main' ? undefined : account.configDir },
      command: 'claude auth login'
    });
  }

  public describeLogout(account: AccountProfile): string {
    return account.id === 'claude-main'
      ? 'Se cerrará la sesión principal de Claude Code en este equipo, también la que usa su extensión de VS Code.'
      : `Se cerrará la sesión de ${account.name}.`;
  }

  public logout(account: AccountProfile): Promise<void> {
    const env = this.buildEnv(account.id, account.configDir ?? path.join(this.homeDir, MAIN_DIR_NAME));
    return new Promise((resolve, reject) => {
      exec('claude auth logout', { env, timeout: 15000, windowsHide: true }, (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve();
      });
    });
  }

  public addAccount(label: string): void {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const configDir = path.join(this.homeDir, `${EXTRA_DIR_PREFIX}${slug}`);
    fs.mkdirSync(configDir, { recursive: true });
    this.openTerminal({
      name: `AgentHub: Claude (${label})`,
      env: { CLAUDE_CONFIG_DIR: configDir },
      command: 'claude auth login'
    });
  }
}
