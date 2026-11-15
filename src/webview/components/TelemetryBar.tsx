import React from 'react';
import { ModelAccountTelemetry } from '../../shared/types';
import { Activity, Clock, DollarSign, Brain, ArrowDownRight, ArrowUpRight, ChevronDown, ShieldCheck } from 'lucide-react';

const NEAR_LIMIT_PERCENT = 85;
const CRITICAL_PERCENT = 95;

const toPercent = (utilization?: number) =>
  utilization === undefined ? null : Math.min(100, Math.round(utilization * 100));

const formatTokens = (tokens = 0) => `${(tokens / 1000).toFixed(1)}k`;

interface MeterProps {
  icon: React.ReactNode;
  label: string;
  title: string;
  percent: number | null;
  barClass: string;
}

const QuotaMeter: React.FC<MeterProps> = ({ icon, label, title, percent, barClass }) => (
  <span className="flex-1 min-w-0 flex items-center gap-1" title={title}>
    {icon}
    <span className="text-zinc-400 shrink-0">{label}</span>
    <span className="flex-1 min-w-3 h-1.5 mx-0.5 bg-zinc-800 rounded-full overflow-hidden">
      <span
        className={`block h-full rounded-full transition-all duration-500 ${(percent ?? 0) >= CRITICAL_PERCENT ? 'bg-red-500' : (percent ?? 0) > NEAR_LIMIT_PERCENT ? 'bg-amber-500' : barClass}`}
        style={{ width: `${percent ?? 0}%` }}
      />
    </span>
    <span className="font-mono font-semibold text-zinc-200 shrink-0">{percent !== null ? `${percent}%` : 'N/A'}</span>
  </span>
);

export const TelemetryBar: React.FC<{ activeTelemetry: ModelAccountTelemetry | undefined }> = ({ activeTelemetry }) => (
  <details className="group bg-zinc-900/90 border border-zinc-800 rounded-lg text-[11px]">
    <summary
      className="flex items-center gap-3 px-2.5 py-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
      title="Ver turnos, tokens y costo"
    >
      <QuotaMeter
        icon={<Activity className="w-3 h-3 text-indigo-400 shrink-0" />}
        label="Semana"
        title="Cuota semanal"
        percent={toPercent(activeTelemetry?.weeklyUtilization)}
        barClass="bg-indigo-500"
      />
      <QuotaMeter
        icon={<Clock className="w-3 h-3 text-cyan-400 shrink-0" />}
        label="5 h"
        title="Ventana de 5 horas"
        percent={toPercent(activeTelemetry?.fiveHourUtilization)}
        barClass="bg-cyan-500"
      />
      <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0 transition group-open:rotate-180" />
    </summary>

    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 border-t border-zinc-800/80 text-zinc-300 font-mono">
      <span className="flex items-center gap-0.5" title="Turnos con esta cuenta y modelo">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span>{activeTelemetry?.turnsCount || 0} turnos</span>
      </span>

      <span className="flex items-center gap-0.5" title="Tokens totales de entrada">
        <ArrowDownRight className="w-3 h-3 text-emerald-400" />
        <span>{formatTokens(activeTelemetry?.totalInputTokens)} in</span>
      </span>

      <span className="flex items-center gap-0.5" title="Tokens totales de salida">
        <ArrowUpRight className="w-3 h-3 text-blue-400" />
        <span>{formatTokens(activeTelemetry?.totalOutputTokens)} out</span>
      </span>

      {(activeTelemetry?.turnsCount || 0) > 0 && (
        <span className="flex items-center gap-0.5 text-zinc-400" title="Promedio de tokens (entrada + salida) por turno">
          <span>
            Ø {formatTokens(((activeTelemetry?.totalInputTokens || 0) + (activeTelemetry?.totalOutputTokens || 0)) / (activeTelemetry?.turnsCount || 1))}/turno
          </span>
        </span>
      )}
      {(activeTelemetry?.totalCacheReadTokens || 0) > 0 && (
        <span className="flex items-center gap-0.5 text-emerald-300" title="Tokens leídos de la caché">
          <span>{formatTokens(activeTelemetry?.totalCacheReadTokens)} caché</span>
        </span>
      )}
      {(activeTelemetry?.totalThinkingTokens || 0) > 0 && (
        <span className="flex items-center gap-0.5 text-purple-300" title="Tokens de razonamiento">
          <Brain className="w-3 h-3 text-purple-400" />
          <span>{formatTokens(activeTelemetry?.totalThinkingTokens)} think</span>
        </span>
      )}

      {(activeTelemetry?.cumulativeCostUSD || 0) > 0 && (
        <span className="flex items-center gap-0.5 text-emerald-400 font-semibold" title="Costo acumulado estimado">
          <DollarSign className="w-3 h-3" />
          <span>{(activeTelemetry?.cumulativeCostUSD || 0).toFixed(4)}</span>
        </span>
      )}
    </div>
  </details>
);
