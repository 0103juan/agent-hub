import { AccountProfile, ProviderType } from '../shared/types';
import { readJsonFile, writeJsonFile } from '../storage/json-file';
import { AgentProvider } from './agent-provider';

const CACHE_MAX_AGE_MS = 60 * 60 * 1000;

interface AccountsCache {
  savedAt: number;
  accounts: AccountProfile[];
}

/**
 * Consultar cuentas lanza varias CLIs y tarda segundos. Se responde con lo último
 * conocido y se refresca en segundo plano cuando ese dato envejece.
 */
export class ProviderRegistry {
  private readonly providers: Map<ProviderType, AgentProvider>;
  private known?: AccountsCache;
  private refreshing?: Promise<AccountProfile[]>;

  constructor(
    providers: AgentProvider[],
    private readonly cacheFile?: string,
    private readonly onAccountsChanged?: (accounts: AccountProfile[]) => void
  ) {
    this.providers = new Map(providers.map((provider) => [provider.type, provider]));
    if (cacheFile) this.known = readJsonFile<AccountsCache | undefined>(cacheFile, undefined);
  }

  public get(type: ProviderType): AgentProvider {
    const provider = this.providers.get(type);
    if (!provider) throw new Error(`Proveedor no registrado: ${type}`);
    return provider;
  }

  public async listAccounts(forceRefresh = false): Promise<AccountProfile[]> {
    if (forceRefresh || !this.known) return this.refresh();
    if (Date.now() - this.known.savedAt > CACHE_MAX_AGE_MS) void this.refresh();
    return this.known.accounts;
  }

  private refresh(): Promise<AccountProfile[]> {
    this.refreshing ??= this.discover().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  /** Un proveedor caído no debe dejar sin cuentas a los demás. */
  private async discover(): Promise<AccountProfile[]> {
    const results = await Promise.allSettled(
      [...this.providers.values()].map((provider) => provider.discoverAccounts(true))
    );
    const accounts = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    this.known = { savedAt: Date.now(), accounts };
    if (this.cacheFile) writeJsonFile(this.cacheFile, this.known);
    this.onAccountsChanged?.(accounts);
    return accounts;
  }
}
