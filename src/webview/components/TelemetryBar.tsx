import React from 'react';
import { ModelAccountTelemetry } from '../../orchestrator/types';
import { Activity, Clock, DollarSign, Brain, ArrowDownRight, ArrowUpRight, ShieldCheck } from 'lucide-react';

interface Props {
  activeTelemetry: ModelAccountTelemetry | undefined;
  accountName: string;
  modelName: string;
}

export const TelemetryBar: React.FC<Props> = ({ activeTelemetry, accountName, modelName }) => {
  const weeklyPct = activeTelemetry?.weeklyUtilization !== undefined
    ? Math.min(100, Math.round(activeTelemetry.weeklyUtilization * 100))
    : null;

  const sessionPct = activeTelemetry?.fiveHourUtilization !== undefined
    ? Math.min(100, Math.round(activeTelemetry.fiveHourUtilization * 100))
    : null;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2.5 space-y-2">
      {/* Active Model & Account Header Badge */}
      <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-zinc-800/80">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-zinc-200 truncate">{accountName}</span>
          <span className="text-zinc-500">•</span>
          <span className="font-mono text-indigo-300 text-[10px]">{modelName}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>{activeTelemetry?.turnsCount || 0} turnos</span>
        </div>
      </div>

      {/* Rate limit bars for this account/model */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {/* Weekly utilization */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-indigo-400" />
              <span>Cuota Semanal</span>
            </span>
            <span className="font-mono font-semibold text-zinc-200">
              {weeklyPct !== null ? `${weeklyPct}%` : 'N/A'}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${(weeklyPct || 0) > 85 ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
              style={{ width: `${weeklyPct || 0}%` }}
            />
          </div>
        </div>

        {/* 5-hour session utilization */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Ventana 5h</span>
            </span>
            <span className="font-mono font-semibold text-zinc-200">
              {sessionPct !== null ? `${sessionPct}%` : '0%'}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${sessionPct || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tokens & Cost Badges for this account/model */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[10px] text-zinc-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5 text-zinc-300" title="Tokens totales de entrada">
            <ArrowDownRight className="w-3 h-3 text-emerald-400" />
            <span>{((activeTelemetry?.totalInputTokens || 0) / 1000).toFixed(1)}k in</span>
          </span>

          <span className="flex items-center gap-0.5 text-zinc-300" title="Tokens totales de salida">
            <ArrowUpRight className="w-3 h-3 text-blue-400" />
            <span>{((activeTelemetry?.totalOutputTokens || 0) / 1000).toFixed(1)}k out</span>
          </span>

          {(activeTelemetry?.totalThinkingTokens || 0) > 0 && (
            <span className="flex items-center gap-0.5 text-purple-300" title="Tokens de razonamiento / pensamiento">
              <Brain className="w-3 h-3 text-purple-400" />
              <span>{((activeTelemetry?.totalThinkingTokens || 0) / 1000).toFixed(1)}k think</span>
            </span>
          )}
        </div>

        {(activeTelemetry?.cumulativeCostUSD || 0) > 0 && (
          <span className="flex items-center gap-0.5 text-emerald-400 font-semibold" title="Costo acumulado estimado">
            <DollarSign className="w-3 h-3" />
            <span>${(activeTelemetry?.cumulativeCostUSD || 0).toFixed(4)}</span>
          </span>
        )}
      </div>
    </div>
  );
};
