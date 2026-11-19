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
  <span className="flex-1 min-w-0 flex items-center gap-1.5" title={title}>
    {icon}
    <span className="text-slate-400 shrink-0 font-medium text-[11px]">{label}</span>
    <span className="flex-1 min-w-3 h-2 mx-1 bg-[#07090e] border border-[#202b3f] rounded-full overflow-hidden">
      <span
        className={`block h-full rounded-full transition-all duration-500 ${(percent ?? 0) >= CRITICAL_PERCENT ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : (percent ?? 0) > NEAR_LIMIT_PERCENT ? 'bg-amber-500' : barClass}`}
        style={{ width: `${percent ?? 0}%` }}
      />
    </span>
    <span className="font-mono font-bold text-slate-200 shrink-0 text-[11px]">{percent !== null ? `${percent}%` : 'N/A'}</span>
  </span>
);

export const TelemetryBar: React.FC<{ activeTelemetry: ModelAccountTelemetry | undefined }> = ({ activeTelemetry }) => (
  <details className="group bg-[#0a0e17]/95 border border-[#202b3f] hover:border-cyan-500/40 rounded-xl text-[11px] shadow-sm backdrop-blur-md transition">
    <summary
      className="flex items-center gap-3 px-3 py-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-[#0c1220]/50 rounded-xl transition"
      title="Ver turnos, tokens y costo"
    >
      <QuotaMeter
        icon={<Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
        label="Semana"
        title="Cuota semanal"
        percent={toPercent(activeTelemetry?.weeklyUtilization)}
        barClass="bg-gradient-to-r from-cyan-500 to-teal-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
      />
      <QuotaMeter
        icon={<Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
        label="5 h"
        title="Ventana de 5 horas"
        percent={toPercent(activeTelemetry?.fiveHourUtilization)}
        barClass="bg-cyan-400"
      />
      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 group-open:rotate-180" />
    </summary>

    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-t border-[#162035] text-slate-300 font-mono bg-[#0a0e17]/80 rounded-b-xl">
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f]" title="Turnos con esta cuenta y modelo">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span className="text-slate-200 font-semibold">{activeTelemetry?.turnsCount || 0} turnos</span>
      </span>

      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f]" title="Tokens totales de entrada">
        <ArrowDownRight className="w-3 h-3 text-emerald-400" />
        <span className="text-slate-200">{formatTokens(activeTelemetry?.totalInputTokens)} in</span>
      </span>

      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f]" title="Tokens totales de salida">
        <ArrowUpRight className="w-3 h-3 text-cyan-400" />
        <span className="text-cyan-300 font-semibold">{formatTokens(activeTelemetry?.totalOutputTokens)} out</span>
      </span>

      {(activeTelemetry?.turnsCount || 0) > 0 && (
        <span className="flex items-center gap-1 text-slate-400 px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f]" title="Promedio de tokens (entrada + salida) por turno">
          <span>
            Ø {formatTokens(((activeTelemetry?.totalInputTokens || 0) + (activeTelemetry?.totalOutputTokens || 0)) / (activeTelemetry?.turnsCount || 1))}/turno
          </span>
        </span>
      )}
      {(activeTelemetry?.totalCacheReadTokens || 0) > 0 && (
        <span className="flex items-center gap-1 text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-950/20 border border-emerald-800/40" title="Tokens leídos de la caché">
          <span>{formatTokens(activeTelemetry?.totalCacheReadTokens)} caché</span>
        </span>
      )}
      {(activeTelemetry?.totalThinkingTokens || 0) > 0 && (
        <span className="flex items-center gap-1 text-violet-300 px-1.5 py-0.5 rounded bg-violet-950/20 border border-violet-800/40" title="Tokens de razonamiento">
          <Brain className="w-3 h-3 text-violet-400" />
          <span>{formatTokens(activeTelemetry?.totalThinkingTokens)} think</span>
        </span>
      )}

      {(activeTelemetry?.cumulativeCostUSD || 0) > 0 && (
        <span className="flex items-center gap-1 text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/30 border border-emerald-500/30 ml-auto" title="Costo acumulado estimado">
          <DollarSign className="w-3 h-3" />
          <span>${(activeTelemetry?.cumulativeCostUSD || 0).toFixed(4)}</span>
        </span>
      )}
    </div>
  </details>
);
