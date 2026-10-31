import React, { useState } from 'react';
import { TelemetryRegistry, ModelAccountTelemetry, ProviderType } from '../../orchestrator/types';
import { BarChart3, Activity, Brain, DollarSign, RotateCcw, Filter, Sparkles, Bot, Layers, AlertTriangle, X, Download } from 'lucide-react';

interface Props {
  telemetryRegistry: TelemetryRegistry;
  onClearTelemetry: () => void;
}

export const TelemetryDashboard: React.FC<Props> = ({ telemetryRegistry, onClearTelemetry }) => {
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  const entries: ModelAccountTelemetry[] = Object.values(telemetryRegistry);

  const filteredEntries = filterProvider === 'all'
    ? entries
    : entries.filter((e) => e.provider === filterProvider);

  // Totales acumulados globales
  const totalIn = entries.reduce((acc, curr) => acc + (curr.totalInputTokens || 0), 0);
  const totalOut = entries.reduce((acc, curr) => acc + (curr.totalOutputTokens || 0), 0);
  const totalThink = entries.reduce((acc, curr) => acc + (curr.totalThinkingTokens || 0), 0);
  const totalTokens = totalIn + totalOut + totalThink;
  const totalCost = entries.reduce((acc, curr) => acc + (curr.cumulativeCostUSD || 0), 0);
  const totalTurns = entries.reduce((acc, curr) => acc + (curr.turnsCount || 0), 0);

  const handleExportCSV = () => {
    if (entries.length === 0) return;
    const headers = ['Cuenta', 'Modelo', 'Proveedor', 'Turnos', 'Tokens Entrada', 'Tokens Salida', 'Tokens Razonamiento', 'Cache Reuso', 'Costo USD'];
    const rows = entries.map((e) => [
      `"${e.accountName}"`,
      `"${e.modelName}"`,
      `"${e.provider}"`,
      e.turnsCount,
      e.totalInputTokens,
      e.totalOutputTokens,
      e.totalThinkingTokens,
      e.totalCacheReadTokens,
      e.cumulativeCostUSD.toFixed(4)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `agenthub-telemetria-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 p-1">
      {/* Top Header */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
        <div>
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span>Telemetría Granular por Cuenta y Modelo</span>
          </h2>
          <p className="text-[11px] text-zinc-400">
            Monitoreo en vivo de cuotas, tokens de entrada/salida/pensamiento y costos
          </p>
        </div>

        {entries.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
              title="Exportar métricas a CSV para reportes"
            >
              <Download className="w-3 h-3 text-emerald-400" />
              <span>Exportar CSV</span>
            </button>

            {showClearConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-900/20 border border-red-800/40 rounded px-2 py-1">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-300">¿Limpiar métricas?</span>
                <button
                  onClick={() => { onClearTelemetry(); setShowClearConfirm(false); }}
                  className="text-[10px] px-1.5 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded transition"
                >Sí</button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 border border-zinc-700 transition"
                title="Reiniciar métricas"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>Tokens Totales</span>
          </div>
          <div className="font-mono font-bold text-zinc-100 text-sm">
            {(totalTokens / 1000).toFixed(1)}k
          </div>
          <div className="text-[9px] text-zinc-400 font-mono">
            {((totalIn) / 1000).toFixed(1)}k in • {((totalOut) / 1000).toFixed(1)}k out
          </div>
        </div>

        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Brain className="w-3 h-3 text-purple-400" />
            <span>Razonamiento (CoT)</span>
          </div>
          <div className="font-mono font-bold text-purple-300 text-sm">
            {(totalThink / 1000).toFixed(1)}k
          </div>
          <div className="text-[9px] text-zinc-500">
            Tokens de pensamiento
          </div>
        </div>

        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            <span>Costo Estimado</span>
          </div>
          <div className="font-mono font-bold text-emerald-400 text-sm">
            ${totalCost.toFixed(3)}
          </div>
          <div className="text-[9px] text-emerald-500/80">
            Ahorrado vía suscripción
          </div>
        </div>

        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>Turnos Totales</span>
          </div>
          <div className="font-mono font-bold text-zinc-100 text-sm">
            {totalTurns}
          </div>
          <div className="text-[9px] text-zinc-500 font-mono">
            {entries.length} modelos activos
          </div>
        </div>
      </div>

      {/* Provider Filter Tabs */}
      <div className="flex items-center gap-1.5 pt-1">
        <Filter className="w-3.5 h-3.5 text-zinc-500 ml-1" />
        <span className="text-[11px] text-zinc-400 mr-1">Filtrar:</span>
        {[
          { id: 'all', label: 'Todos' },
          { id: 'claude', label: 'Claude Pro' },
          { id: 'google', label: 'Google Gemini' },
          { id: 'openai', label: 'ChatGPT / GPT-OSS' },
          { id: 'copilot', label: 'Copilot' }
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterProvider(f.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
              filterProvider === f.id
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Granular Breakdown per Model and Account */}
      {filteredEntries.length === 0 ? (
        <div className="text-center p-6 bg-zinc-900/40 rounded-lg border border-zinc-800 text-zinc-500 text-xs">
          Aún no se han registrado turnos para este filtro. Envía un mensaje desde el chat para comenzar a capturar telemetría.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredEntries.map((item) => {
            const weekly = item.weeklyUtilization !== undefined
              ? Math.min(100, Math.round(item.weeklyUtilization * 100))
              : null;
            const session = item.fiveHourUtilization !== undefined
              ? Math.min(100, Math.round(item.fiveHourUtilization * 100))
              : null;

            return (
              <div
                key={item.key}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2.5 hover:border-zinc-700 transition"
              >
                {/* Entry Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    {item.provider === 'claude' && (
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-orange-600/20 text-orange-400 font-bold text-[10px]">
                        C
                      </span>
                    )}
                    {item.provider === 'google' && (
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-blue-600/20 text-blue-400 font-bold text-[10px]">
                        <Sparkles className="w-3 h-3" />
                      </span>
                    )}
                    {item.provider === 'openai' && (
                      <span className="w-5 h-5 rounded flex items-center justify-center bg-emerald-600/20 text-emerald-400 font-bold text-[10px]">
                        <Bot className="w-3 h-3" />
                      </span>
                    )}

                    <div>
                      <div className="font-semibold text-xs text-zinc-100 flex items-center gap-1.5">
                        <span>{item.accountName}</span>
                        <span className="font-mono text-indigo-400 text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20">
                          {item.modelName}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {item.turnsCount} turnos ejecutados
                      </div>
                    </div>
                  </div>

                  {item.cumulativeCostUSD > 0 && (
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        ${item.cumulativeCostUSD.toFixed(4)}
                      </span>
                      <span className="block text-[9px] text-zinc-500">Costo acumulado</span>
                    </div>
                  )}
                </div>

                {/* Rate limit status bars */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                      <span>Cuota Semanal:</span>
                      <span className="font-mono font-semibold text-zinc-200">
                        {weekly !== null ? `${weekly}%` : 'Ilimitado / N/A'}
                      </span>
                    </div>
                    {weekly !== null && (
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${weekly > 85 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                          style={{ width: `${weekly}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                      <span>Ventana 5h:</span>
                      <span className="font-mono font-semibold text-zinc-200">
                        {session !== null ? `${session}%` : '0%'}
                      </span>
                    </div>
                    {session !== null && (
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-cyan-500 h-full rounded-full"
                          style={{ width: `${session}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Tokens Detail Grid */}
                <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] font-mono">
                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-500 block">Entrada:</span>
                    <span className="text-zinc-200 font-bold">{item.totalInputTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-500 block">Salida:</span>
                    <span className="text-blue-300 font-bold">{item.totalOutputTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-500 block">Pensamiento:</span>
                    <span className="text-purple-300 font-bold">{item.totalThinkingTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-500 block">Cache Reuso:</span>
                    <span className="text-emerald-400 font-bold">{item.totalCacheReadTokens.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

