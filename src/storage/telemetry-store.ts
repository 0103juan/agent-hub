import * as path from 'path';
import { ModelAccountTelemetry, ProviderType, QuotaSnapshot, TelemetryRegistry, TurnUsage } from '../shared/types';
import { DebouncedJsonFile, readJsonFile } from './json-file';

export interface TelemetryTarget {
  profileId: string;
  accountName: string;
  modelName: string;
  provider: ProviderType;
}

export class TelemetryStore {
  private readonly telemetryFile: DebouncedJsonFile;
  private registry: TelemetryRegistry;

  constructor(storageDir: string) {
    const filePath = path.join(storageDir, 'telemetry.json');
    this.telemetryFile = new DebouncedJsonFile(filePath, () => this.registry);
    this.registry = readJsonFile<TelemetryRegistry>(filePath, {});
  }

  public getRegistry(): TelemetryRegistry {
    return this.registry;
  }

  private entryFor(target: TelemetryTarget): ModelAccountTelemetry {
    const key = `${target.profileId}::${target.modelName}`;
    const entry = this.registry[key] ?? {
      ...target,
      key,
      turnsCount: 0,
      cumulativeCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThinkingTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      lastUpdated: Date.now()
    };
    entry.accountName = target.accountName;
    entry.lastUpdated = Date.now();
    this.registry[key] = entry;
    return entry;
  }

  /** La cuota llega varias veces por turno y no debe sumar turnos. */
  public recordQuota(target: TelemetryTarget, quota: QuotaSnapshot): void {
    const entry = this.entryFor(target);
    for (const [field, value] of Object.entries(quota)) {
      if (value !== undefined) entry[field as keyof QuotaSnapshot] = value;
    }
    this.telemetryFile.schedule();
  }

  public recordTurn(target: TelemetryTarget, usage: TurnUsage): ModelAccountTelemetry {
    const entry = this.entryFor(target);
    entry.turnsCount += 1;
    entry.totalInputTokens += usage.inputTokens ?? 0;
    entry.totalOutputTokens += usage.outputTokens ?? 0;
    entry.totalThinkingTokens += usage.thinkingTokens ?? 0;
    entry.totalCacheReadTokens += usage.cacheReadTokens ?? 0;
    entry.totalCacheCreationTokens += usage.cacheCreationTokens ?? 0;
    if (usage.costUSD) {
      entry.cumulativeCostUSD += usage.costUSD;
      entry.lastCostUSD = usage.costUSD;
    }
    entry.lastTurnDurationMs = usage.durationMs;
    entry.lastTurnTokens = { input: usage.inputTokens, output: usage.outputTokens, thinking: usage.thinkingTokens };
    this.telemetryFile.schedule();
    return entry;
  }

  public clear(): void {
    this.registry = {};
    this.telemetryFile.schedule();
  }

  public flush(): void {
    this.telemetryFile.flush();
  }
}
