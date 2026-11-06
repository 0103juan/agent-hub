import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountProfile, ModelOption, ProviderType, ReasoningEffort } from '../../shared/types';
import { AgentEvent, AgentProvider, AgentRun, AgentTarget, AgentTurnRequest } from '../agent-provider';
import { assertSafeCliValue } from '../cli-process';
import { CliProcessPool, PooledCliSpec } from '../cli-process-pool';
import { TerminalOpener } from '../terminal-opener';
import { AntigravityStreamParser } from './antigravity-stream-parser';

const EXTRA_DIR_PREFIX = '.gemini-';
const MAIN_ACCOUNT_ID = 'google-main';

/** Se usa solo si `agy models` no responde. */
const FALLBACK_MODEL_LISTING = `
gemini-4-argon-high\tGemini 4 Argon (High)
gemini-4-argon-medium\tGemini 4 Argon (Medium)
gemini-4-argon-low\tGemini 4 Argon (Low)
gemini-3.8-flash-high\tGemini 3.8 Flash (High)
gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)
gemini-3.8-flash-low\tGemini 3.8 Flash (Low)
`;

/** Agrupa `gemini-x-high` y `gemini-x-low` en un modelo con varios esfuerzos. */
export function parseModelListing(listing: string): ModelOption[] {
  const models = new Map<string, ModelOption>();
  for (const line of listing.split(/\r?\n/)) {
    const [rawId, rawLabel] = line.trim().split(/\t|\s{2,}/);
    if (!rawId || !rawId.includes('-')) continue;
    const variant = rawId.match(/^(.+)-(low|medium|high)$/);
    const id = variant ? variant[1] : rawId;
    const label = (rawLabel ?? rawId).replace(/\s*\((Low|Medium|High)\)$/, '');
    const model = models.get(id) ?? { id, label, efforts: [] };
    if (variant) model.efforts.push(variant[2] as ReasoningEffort);
    models.set(id, model);
  }
  return [...models.values()];
}

/** agy recibe el esfuerzo como sufijo del modelo, no como flag. */
export function toVariantId(modelId: string, effort?: ReasoningEffort): string {
  return effort ? `${modelId}-${effort}` : modelId;
}

export function resolveAgyBinary(homeDir: string): string {
  const binaryName = process.platform === 'win32' ? 'agy.exe' : 'agy';
  const defaultPath = path.join(homeDir, '.gemini', 'bin', binaryName);
  return fs.existsSync(defaultPath) ? defaultPath : binaryName;
}

export class AntigravityProvider implements AgentProvider {
  public readonly type: ProviderType = 'google';
  private readonly homeDir = os.homedir();
  private readonly binaryPath = resolveAgyBinary(this.homeDir);
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
    const models = await this.fetchModels();
    const status = fs.existsSync(this.binaryPath) || this.binaryPath.endsWith('agy') || this.binaryPath.endsWith('agy.exe')
      ? 'connected'
      : 'disconnected';
    const account = (id: string, name: string, configDir: string): AccountProfile => ({
      id,
      name,
      provider: 'google',
      status,
      email: this.readEmail(configDir),
      configDir,
      models
    });

    const extraDirs = fs
      .readdirSync(this.homeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(EXTRA_DIR_PREFIX))
      .map((entry) => entry.name);

    return [
      account(MAIN_ACCOUNT_ID, 'Antigravity (Principal)', path.join(this.homeDir, '.gemini')),
      ...extraDirs.map((dir) => {
        const slug = dir.slice(EXTRA_DIR_PREFIX.length);
        return account(`google-${slug}`, `Antigravity (${slug})`, path.join(this.homeDir, dir));
      })
    ];
  }

  private fetchModels(): Promise<ModelOption[]> {
    return new Promise((resolve) => {
      execFile(this.binaryPath, ['models'], { timeout: 20000, windowsHide: true }, (error, stdout) => {
        const models = error ? [] : parseModelListing(stdout);
        resolve(models.length > 0 ? models : parseModelListing(FALLBACK_MODEL_LISTING));
      });
    });
  }

  private readEmail(configDir: string): string | undefined {
    try {
      const file = JSON.parse(fs.readFileSync(path.join(configDir, 'google_accounts.json'), 'utf8'));
      return file.active ?? file.old?.[0];
    } catch {
      return undefined;
    }
  }

  private buildEnv(configDir: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ANTIGRAVITY_GEMINI_DIR: configDir,
      ANTIGRAVITY_APP_DATA_DIR: path.join(configDir, 'antigravity')
    };
  }

  private buildSpec({ account, workspaceDir, modelId, effort }: AgentTarget): PooledCliSpec {
    const variantId = toVariantId(modelId, effort);
    return {
      key: ['antigravity', account.id, workspaceDir, variantId].join('|'),
      command: this.binaryPath,
      args: [
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--model', assertSafeCliValue(variantId)
      ],
      resumeArgs: (resumeId) => ['--conversation', assertSafeCliValue(resumeId)],
      cwd: workspaceDir,
      env: this.buildEnv(account.configDir ?? path.join(this.homeDir, '.gemini')),
      shell: false
    };
  }

  public startTurn(request: AgentTurnRequest, onEvent: (event: AgentEvent) => void): AgentRun {
    const inputLine = JSON.stringify({ event: 'user', message: { role: 'user', content: request.prompt } });
    return this.pool.runTurn(this.buildSpec(request), request.resumeId, inputLine, new AntigravityStreamParser(), onEvent);
  }

  public prewarm(target: AgentTarget): void {
    this.pool.prewarm(this.buildSpec(target), target.resumeId);
  }

  public openLogin(account: AccountProfile): void {
    const configDir = account.configDir ?? path.join(this.homeDir, '.gemini');
    this.openTerminal({
      name: `AgentHub: ${account.name}`,
      env: { ANTIGRAVITY_GEMINI_DIR: configDir, ANTIGRAVITY_APP_DATA_DIR: path.join(configDir, 'antigravity') },
      shellPath: this.binaryPath
    });
  }

  public describeLogout(account: AccountProfile): string {
    return account.id === MAIN_ACCOUNT_ID
      ? 'Antigravity tiene un solo inicio de sesión: se cerrará para todas sus cuentas. Se abrirá una terminal de agy con /logout.'
      : `${account.name} es una etiqueta sin credenciales propias. Se quitará de la lista y se borrará su carpeta ${account.configDir}.`;
  }

  public async logout(account: AccountProfile): Promise<void> {
    if (account.id === MAIN_ACCOUNT_ID) {
      this.openTerminal({ name: `AgentHub: ${account.name}`, shellPath: this.binaryPath, command: '/logout' });
      return;
    }
    const configDir = account.configDir;
    if (!configDir || !path.basename(configDir).startsWith(EXTRA_DIR_PREFIX)) {
      throw new Error(`Carpeta de cuenta no válida: ${configDir}`);
    }
    fs.rmSync(configDir, { recursive: true, force: true });
  }

  public addAccount(label: string): void {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const configDir = path.join(this.homeDir, `${EXTRA_DIR_PREFIX}${slug}`);
    fs.mkdirSync(path.join(configDir, 'antigravity'), { recursive: true });
    this.openLogin({ id: `google-${slug}`, name: `Antigravity (${label})`, provider: 'google', status: 'disconnected', configDir, models: [] });
  }
}
