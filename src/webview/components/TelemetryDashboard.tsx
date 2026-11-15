import React, { useState } from 'react';
import { CostSummary, TelemetryRegistry, ModelAccountTelemetry } from '../../shared/types';
import { BarChart3, Activity, Brain, DollarSign, RotateCcw, Filter, Layers, AlertTriangle, X, Download } from 'lucide-react';
import { ProviderBadge } from './ProviderBadge';
import { downloadText } from '../utils/format';

interface Props {
  telemetryRegistry: TelemetryRegistry;
  costs: CostSummary;
  onClearTelemetry: () => void;
}

export const TelemetryDashboard: React.FC<Props> = ({ telemetryRegistry, costs, onClearTelemetry }) => {
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [rangeDays, setRangeDays] = useState(14);
  const [sortBy, setSortBy] = useState<'cost' | 'turns' | 'name'>('cost');

  const entries: ModelAccountTelemetry[] = Object.values(telemetryRegistry);

  const filteredEntries = (filterProvider === 'all' ? entries : entries.filter((e) => e.provider === filterProvider)).sort((a, b) =>
    sortBy === 'cost' ? b.cumulativeCostUSD - a.cumulativeCostUSD : sortBy === 'turns' ? b.turnsCount - a.turnsCount : a.accountName.localeCompare(b.accountName)
  );

  // Totales acumulados globales
  const totalIn = entries.reduce((acc, curr) => acc + (curr.totalInputTokens || 0), 0);
  const totalOut = entries.reduce((acc, curr) => acc + (curr.totalOutputTokens || 0), 0);
  const totalThink = entries.reduce((acc, curr) => acc + (curr.totalThinkingTokens || 0), 0);
  const totalTokens = totalIn + totalOut + totalThink;
  const totalCost = entries.reduce((acc, curr) => acc + (curr.cumulativeCostUSD || 0), 0);
  const totalTurns = entries.reduce((acc, curr) => acc + (curr.turnsCount || 0), 0);

  const recentDays = costs.days.slice(-rangeDays);
  const lastWeek = costs.days.slice(-7);
  // Proyección simple: el promedio diario de los últimos 7 días registrados por 30.
  const monthlyProjection = lastWeek.length >= 3 ? (lastWeek.reduce((sum, d) => sum + d.costUSD, 0) / lastWeek.length) * 30 : 0;
  const todayKey = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
  const agentsTotal = costs.agents.reduce((sum, agent) => sum + agent.costUSD, 0);
  const rangeTotal = recentDays.reduce((sum, d) => sum + d.costUSD, 0);
  const maxDayCost = Math.max(...recentDays.map((d) => d.costUSD), 0);
  const maxAgentCost = Math.max(...costs.agents.map((a) => a.costUSD), 0);
  const usd = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

  const handleExportCSV = () => {
    if (entries.length === 0) return;
    const headers = ['Cuenta', 'Modelo', 'Proveedor', 'Turnos', 'Tokens Entrada', 'Tokens Salida', 'Tokens Razonamiento', 'Cache Reuso', 'Costo USD'];
    const rows = entries.map((e) => [
      `"${e.accountName.replace(/"/g, '""')}"`,
      `"${e.modelName.replace(/"/g, '""')}"`,
      `"${e.provider}"`,
      e.turnsCount,
      e.totalInputTokens,
      e.totalOutputTokens,
      e.totalThinkingTokens,
      e.totalCacheReadTokens,
      e.cumulativeCostUSD.toFixed(4)
    ]);
    downloadText(`agenthub-telemetria-${Date.now()}.csv`, [headers.join(','), ...rows.map((r) => r.join(','))].join('\n'), 'text/csv');
  };

  const [summaryCopied, setSummaryCopied] = useState(false);
  const handleCopySummary = async () => {
    const lines = [
      `Tokens: ${(totalTokens / 1000).toFixed(1)}k (${(totalIn / 1000).toFixed(1)}k entrada, ${(totalOut / 1000).toFixed(1)}k salida, ${(totalThink / 1000).toFixed(1)}k razonamiento)`,
      `Costo: $${totalCost.toFixed(3)} en ${totalTurns} turnos`,
      ...entries.map((e) => `- ${e.accountName} · ${e.modelName}: ${e.turnsCount} turnos, $${e.cumulativeCostUSD.toFixed(4)}`)
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 1500);
    } catch {}
  };

  const handleExportJSON = () => {
    if (entries.length === 0) return;
    downloadText(`agenthub-telemetria-${Date.now()}.json`, JSON.stringify({ totals: { totalTokens, totalCost, totalTurns }, entries, costs }, null, 2), 'application/json');
  };

  return (
    <div className="space-y-4 p-1 w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Métricas por cuenta y modelo</span>
          </h2>
          <p className="text-[11px] text-zinc-400">
            Cuotas, tokens y costos de cada combinación
          </p>
        </div>

        {entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
              title="Copiar un resumen en texto para pegarlo en un reporte"
            >
              <Download className="w-3 h-3 text-indigo-400" />
              <span>{summaryCopied ? 'Copiado' : 'Copiar resumen'}</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
              title="Exportar métricas, totales y gasto en JSON"
            >
              <Download className="w-3 h-3 text-cyan-400" />
              <span>Exportar JSON</span>
            </button>
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
                <span className="text-[11px] text-red-300">¿Limpiar métricas?</span>
                <button
                  onClick={() => { onClearTelemetry(); setShowClearConfirm(false); }}
                  className="text-[11px] px-1.5 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded transition"
                >Sí</button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition"
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
      <div className="grid grid-cols-2 min-[520px]:grid-cols-4 gap-2 text-xs">
        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>Tokens totales</span>
          </div>
          <div className="font-mono font-bold text-zinc-100 text-sm">
            {(totalTokens / 1000).toFixed(1)}k
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            {((totalIn) / 1000).toFixed(1)}k in • {((totalOut) / 1000).toFixed(1)}k out
          </div>
        </div>

        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Brain className="w-3 h-3 text-purple-400" />
            <span>Razonamiento</span>
          </div>
          <div className="font-mono font-bold text-purple-300 text-sm">
            {(totalThink / 1000).toFixed(1)}k
          </div>
          <div className="text-[11px] text-zinc-400">
            Tokens de pensamiento
          </div>
        </div>

        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            <span>Costo estimado</span>
          </div>
          <div className="font-mono font-bold text-emerald-400 text-sm">
            ${totalCost.toFixed(3)}
          </div>
          <div className="text-[11px] text-emerald-500/80">
            {totalTurns > 0 ? `$${(totalCost / totalTurns).toFixed(3)} por turno` : 'Acumulado reportado por las CLIs'}
          </div>
        </div>

        <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>Turnos totales</span>
          </div>
          <div className="font-mono font-bold text-zinc-100 text-sm">
            {totalTurns}
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            {entries.length} modelos activos
          </div>
        </div>
      </div>

      {/* Gasto por día y por agente */}
      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2.5">
        <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Gasto</span>
        </h3>
        {recentDays.length === 0 && costs.agents.length === 0 ? (
          <p className="text-[11px] text-zinc-400">Aún no hay gasto registrado. Aparecerá aquí cuando los agentes completen turnos con costo.</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                <span>Por día (últimos {recentDays.length})</span>
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={rangeDays === days}
                    onClick={() => setRangeDays(days)}
                    className={`px-1.5 rounded border transition ${rangeDays === days ? 'bg-zinc-800 text-white border-zinc-700' : 'border-transparent hover:text-zinc-200'}`}
                  >
                    {days} d
                  </button>
                ))}
                <span className="ml-auto font-mono text-zinc-300">Total {usd(rangeTotal)}</span>
              </div>
              {monthlyProjection > 0 && (
                <div className="text-[11px] text-zinc-500">Si sigues al ritmo de la última semana: <span className="font-mono text-amber-300">≈ {usd(monthlyProjection)}</span> al mes.</div>
              )}
              {recentDays.map((d, dayIndex) => {
                const previous = recentDays[dayIndex - 1];
                const delta = previous && previous.costUSD > 0 ? Math.round(((d.costUSD - previous.costUSD) / previous.costUSD) * 100) : null;
                const date = new Date(`${d.day}T00:00:00`);
                const label = d.day === todayKey ? 'hoy' : date.toLocaleDateString('es', { weekday: 'short' });
                return (
                <div key={d.day} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="w-24 shrink-0 text-zinc-400">{d.day} <span className="text-zinc-500">{label}</span></span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${maxDayCost > 0 ? Math.max(2, (d.costUSD / maxDayCost) * 100) : 0}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-zinc-200 font-mono">{usd(d.costUSD)}</span>
                  <span className={`w-9 shrink-0 text-right ${delta === null ? 'text-zinc-600' : delta > 0 ? 'text-amber-400' : 'text-emerald-400'}`} title="Cambio frente al día anterior">
                    {delta === null ? '—' : `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}%`}
                  </span>
                </div>
                );
              })}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-400">Por agente</div>
              {costs.agents.map((a) => (
                <div key={a.name} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="w-24 shrink-0 truncate text-zinc-300" title={a.name}>{a.name}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${maxAgentCost > 0 ? Math.max(2, (a.costUSD / maxAgentCost) * 100) : 0}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-zinc-200">{usd(a.costUSD)}</span>
                  <span className="w-9 shrink-0 text-right text-zinc-500" title="Parte del gasto total por agente">
                    {agentsTotal > 0 ? `${Math.round((a.costUSD / agentsTotal) * 100)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Provider Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Filter className="w-3.5 h-3.5 text-zinc-400 ml-1" />
        <span className="text-[11px] text-zinc-400 mr-1">Filtrar:</span>
        {[
          { id: 'all', label: 'Todos' },
          { id: 'claude', label: 'Claude' },
          { id: 'google', label: 'Antigravity' },
          { id: 'copilot', label: 'Copilot' }
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterProvider(f.id)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              filterProvider === f.id
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-zinc-400 ml-1">Ordenar por:</span>
        {([['cost', 'Costo'], ['turns', 'Turnos'], ['name', 'Cuenta']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={sortBy === id}
            onClick={() => setSortBy(id)}
            className={`px-2 py-0.5 rounded font-medium transition ${sortBy === id ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Granular Breakdown per Model and Account */}
      {filteredEntries.length === 0 ? (
        <div className="text-center p-6 bg-zinc-900/40 rounded-lg border border-zinc-800 text-zinc-400 text-xs">
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
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-zinc-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <ProviderBadge provider={item.provider} />

                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-zinc-100 flex flex-wrap items-center gap-x-1.5">
                        <span>{item.accountName}</span>
                        <span className="font-mono text-indigo-400 text-[11px] px-1.5 py-px rounded whitespace-nowrap bg-indigo-500/10 border border-indigo-500/20">
                          {item.modelName}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {item.turnsCount} turnos ejecutados
                      </div>
                    </div>
                  </div>

                  {item.cumulativeCostUSD > 0 && (
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        ${item.cumulativeCostUSD.toFixed(4)}
                      </span>
                      <span className="block text-[11px] text-zinc-400">
                        Costo acumulado{item.turnsCount > 0 ? ` · $${(item.cumulativeCostUSD / item.turnsCount).toFixed(4)}/turno` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Rate limit status bars */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span>Cuota semanal:</span>
                      <span className="font-mono font-semibold text-zinc-200">
                        {weekly !== null ? `${weekly}%` : 'N/A'}
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
                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span>Ventana 5h:</span>
                      <span className="font-mono font-semibold text-zinc-200">
                        {session !== null ? `${session}%` : 'N/A'}
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
                <div className="grid grid-cols-2 min-[520px]:grid-cols-4 gap-1.5 pt-1 text-[11px] font-mono">
                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-400 block">Entrada:</span>
                    <span className="text-zinc-200 font-bold">{item.totalInputTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-400 block">Salida:</span>
                    <span className="text-blue-300 font-bold">{item.totalOutputTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-400 block">Pensamiento:</span>
                    <span className="text-purple-300 font-bold">{item.totalThinkingTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-1.5 bg-zinc-800/40 rounded border border-zinc-800">
                    <span className="text-zinc-400 block">Caché reusada:</span>
                    <span className="text-emerald-400 font-bold">{item.totalCacheReadTokens.toLocaleString()}</span>
                    {item.totalCacheReadTokens > 0 && (
                      <span className="block text-[10px] text-zinc-500" title="Parte de la entrada que salió de la caché">
                        {Math.round((item.totalCacheReadTokens / (item.totalInputTokens + item.totalCacheReadTokens)) * 100)}% de la entrada
                      </span>
                    )}
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

