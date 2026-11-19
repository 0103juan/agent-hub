import React, { useState } from 'react';
import { CostSummary, TelemetryRegistry, ModelAccountTelemetry } from '../../shared/types';
import { BarChart3, Activity, Brain, DollarSign, RotateCcw, Filter, Layers, AlertTriangle, X, Download } from 'lucide-react';
import { ProviderBadge } from './ProviderBadge';
import { downloadText } from '../utils/format';
import { CountUp } from './motion';

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
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0a0e17]/95 border border-[#202b3f] shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <span>Métricas por cuenta y modelo</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVO
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Cuotas de ventana, tokens y costos consolidados de cada combinación
            </p>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#0c1220] hover:bg-slate-800 text-slate-300 border border-[#202b3f] hover:border-slate-600 transition shadow-sm"
              title="Copiar un resumen en texto para pegarlo en un reporte"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>{summaryCopied ? '¡Copiado!' : 'Copiar resumen'}</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#0c1220] hover:bg-slate-800 text-slate-300 border border-[#202b3f] hover:border-slate-600 transition shadow-sm"
              title="Exportar métricas, totales y gasto en JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Exportar JSON</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#0c1220] hover:bg-slate-800 text-slate-300 border border-[#202b3f] hover:border-slate-600 transition shadow-sm"
              title="Exportar métricas a CSV para reportes"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar CSV</span>
            </button>

            {showClearConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-950/30 border border-red-800/50 rounded-lg px-2.5 py-1 shadow-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[11px] font-medium text-red-300">¿Limpiar métricas?</span>
                <button
                  onClick={() => { onClearTelemetry(); setShowClearConfirm(false); }}
                  className="text-[11px] font-bold px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded transition shadow-sm"
                >Sí</button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#0c1220] hover:bg-red-950/20 text-slate-400 hover:text-red-400 border border-[#202b3f] hover:border-red-900/40 transition"
                title="Reiniciar métricas"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-2 min-[520px]:grid-cols-4 gap-2.5 text-xs">
        <div className="hub-lift p-3 bg-gradient-to-b from-[#0c1220]/90 to-[#0a0e17]/95 border border-[#202b3f] hover:border-cyan-500/40 rounded-xl space-y-1.5 shadow-sm transition">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tokens totales</span>
            </span>
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">VOL</span>
          </div>
          <div className="font-mono font-bold text-slate-100 text-lg">
            <CountUp value={totalTokens} format={(n) => `${(n / 1000).toFixed(1)}k`} />
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 pt-1 border-t border-[#162035]">
            <span className="text-emerald-400">{((totalIn) / 1000).toFixed(1)}k in</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-400">{((totalOut) / 1000).toFixed(1)}k out</span>
          </div>
        </div>

        <div className="hub-lift p-3 bg-gradient-to-b from-[#0c1220]/90 to-[#0a0e17]/95 border border-[#202b3f] hover:border-cyan-500/40 rounded-xl space-y-1.5 shadow-sm transition">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              <span>Razonamiento</span>
            </span>
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">THINK</span>
          </div>
          <div className="font-mono font-bold text-violet-300 text-lg">
            <CountUp value={totalThink} format={(n) => `${(n / 1000).toFixed(1)}k`} />
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-[#162035]">
            Tokens de pensamiento profundo
          </div>
        </div>

        <div className="hub-lift p-3 bg-gradient-to-b from-[#0c1220]/90 to-[#0a0e17]/95 border border-[#202b3f] hover:border-cyan-500/40 rounded-xl space-y-1.5 shadow-sm transition">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Costo estimado</span>
            </span>
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">USD</span>
          </div>
          <div className="font-mono font-bold text-emerald-400 text-lg">
            <CountUp value={totalCost} format={(n) => `$${n.toFixed(3)}`} />
          </div>
          <div className="text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-[#162035]">
            {totalTurns > 0 ? `$${(totalCost / totalTurns).toFixed(3)} / turno` : 'Consolidado de turnos'}
          </div>
        </div>

        <div className="hub-lift p-3 bg-gradient-to-b from-[#0c1220]/90 to-[#0a0e17]/95 border border-[#202b3f] hover:border-cyan-500/40 rounded-xl space-y-1.5 shadow-sm transition">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Turnos totales</span>
            </span>
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">ACT</span>
          </div>
          <div className="font-mono font-bold text-slate-100 text-lg">
            <CountUp value={totalTurns} format={(n) => String(Math.round(n))} />
          </div>
          <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-[#162035]">
            {entries.length} {entries.length === 1 ? 'modelo registrado' : 'modelos registrados'}
          </div>
        </div>
      </div>

      {/* Gasto por día y por agente */}
      <div className="p-4 rounded-2xl bg-[#0a0e17] border border-[#202b3f] space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Distribución de Gasto y Proyección</span>
          </h3>
          <div className="flex items-center gap-1 bg-[#0c1220] p-0.5 rounded-lg border border-[#202b3f] text-[11px]">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={rangeDays === days}
                onClick={() => setRangeDays(days)}
                className={`px-2.5 py-0.5 rounded-md font-medium transition ${
                  rangeDays === days
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        {recentDays.length === 0 && costs.agents.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-2">Aún no hay gasto registrado. Aparecerá aquí cuando los agentes completen turnos con costo.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400">
                <span className="font-medium text-slate-300">Historial por día (últimos {recentDays.length} días)</span>
                <span className="font-mono text-slate-300">Total en rango: <strong className="text-emerald-400">{usd(rangeTotal)}</strong></span>
              </div>
              {monthlyProjection > 0 && (
                <div className="text-[11px] text-slate-300 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                  <span>Ritmo estimado según la última semana:</span>
                  <span className="font-mono font-bold text-amber-300">≈ {usd(monthlyProjection)} / mes</span>
                </div>
              )}
              <div className="space-y-1.5 pt-1">
                {recentDays.map((d, dayIndex) => {
                  const previous = recentDays[dayIndex - 1];
                  const delta = previous && previous.costUSD > 0 ? Math.round(((d.costUSD - previous.costUSD) / previous.costUSD) * 100) : null;
                  const date = new Date(`${d.day}T00:00:00`);
                  const label = d.day === todayKey ? 'hoy' : date.toLocaleDateString('es', { weekday: 'short' });
                  return (
                    <div key={d.day} className="flex items-center gap-2.5 text-[11px] font-mono group hover:bg-[#0c1220]/40 p-1 rounded-lg transition">
                      <span className="w-24 shrink-0 text-slate-400">{d.day} <span className={d.day === todayKey ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>{label}</span></span>
                      <div className="flex-1 h-2.5 bg-[#07090e] border border-[#202b3f] rounded-full overflow-hidden">
                        <div
                          className="hub-bar h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm"
                          style={{ width: `${maxDayCost > 0 ? Math.max(3, (d.costUSD / maxDayCost) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-slate-100 font-bold">{usd(d.costUSD)}</span>
                      <span className={`w-10 shrink-0 text-right font-medium ${delta === null ? 'text-slate-600' : delta > 0 ? 'text-amber-400' : 'text-emerald-400'}`} title="Cambio frente al día anterior">
                        {delta === null ? '—' : `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#162035]">
              <div className="text-[11px] font-medium text-slate-300">Gasto consolidado por agente</div>
              <div className="space-y-1.5">
                {costs.agents.map((a) => (
                  <div key={a.name} className="flex items-center gap-2.5 text-[11px] font-mono group hover:bg-[#0c1220]/40 p-1 rounded-lg transition">
                    <span className="w-24 shrink-0 truncate text-slate-300 font-sans font-medium" title={a.name}>{a.name}</span>
                    <div className="flex-1 h-2.5 bg-[#07090e] border border-[#202b3f] rounded-full overflow-hidden">
                      <div
                        className="hub-bar h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 shadow-sm"
                        style={{ width: `${maxAgentCost > 0 ? Math.max(3, (a.costUSD / maxAgentCost) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-slate-100 font-bold">{usd(a.costUSD)}</span>
                    <span className="w-10 shrink-0 text-right text-slate-400 font-medium" title="Parte del gasto total por agente">
                      {agentsTotal > 0 ? `${Math.round((a.costUSD / agentsTotal) * 100)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Provider Filter & Sort Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#0a0e17] border border-[#202b3f] shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[11px] text-slate-400 font-medium">Filtrar:</span>
          <div className="flex items-center gap-1">
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  filterProvider === f.id
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1220]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-400">Ordenar por:</span>
          {([['cost', 'Costo'], ['turns', 'Turnos'], ['name', 'Cuenta']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sortBy === id}
              onClick={() => setSortBy(id)}
              className={`px-2.5 py-0.5 rounded-md font-medium transition ${
                sortBy === id
                  ? 'bg-[#0c1220] text-slate-100 border border-[#202b3f]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Granular Breakdown per Model and Account */}
      {filteredEntries.length === 0 ? (
        <div className="text-center p-8 bg-[#0a0e17]/60 rounded-xl border border-[#202b3f] text-slate-400 text-xs">
          Aún no se han registrado turnos para este filtro. Envía un mensaje desde el chat para comenzar a capturar telemetría.
        </div>
      ) : (
        <div className="space-y-3">
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
                className="p-4 bg-[#0a0e17] border border-[#202b3f] hover:border-cyan-500/40 rounded-xl space-y-3 shadow-sm transition"
              >
                {/* Entry Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#162035]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ProviderBadge provider={item.provider} />

                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{item.accountName}</span>
                        <span className="font-mono text-cyan-300 text-[11px] px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 whitespace-nowrap">
                          {item.modelName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {item.turnsCount} {item.turnsCount === 1 ? 'turno ejecutado' : 'turnos ejecutados'}
                      </div>
                    </div>
                  </div>

                  {item.cumulativeCostUSD > 0 && (
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        ${item.cumulativeCostUSD.toFixed(4)}
                      </span>
                      <span className="block text-[11px] text-slate-400 font-mono">
                        Costo acumulado{item.turnsCount > 0 ? ` · $${(item.cumulativeCostUSD / item.turnsCount).toFixed(4)}/turno` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Rate limit status bars */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Cuota semanal:</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {weekly !== null ? `${weekly}%` : 'N/A'}
                      </span>
                    </div>
                    {weekly !== null && (
                      <div className="w-full bg-[#07090e] border border-[#202b3f] rounded-full h-2 overflow-hidden">
                        <div
                          className={`hub-bar h-full rounded-full ${weekly > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-cyan-500 to-teal-400'}`}
                          style={{ width: `${weekly}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Ventana 5h:</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {session !== null ? `${session}%` : 'N/A'}
                      </span>
                    </div>
                    {session !== null && (
                      <div className="w-full bg-[#07090e] border border-[#202b3f] rounded-full h-2 overflow-hidden">
                        <div
                          className="hub-bar bg-cyan-400 h-full rounded-full"
                          style={{ width: `${session}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Tokens Detail Grid */}
                <div className="grid grid-cols-2 min-[520px]:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                  <div className="p-2 bg-[#0c1220] rounded-lg border border-[#202b3f]/70">
                    <span className="text-slate-400 block font-sans text-[10px]">Entrada:</span>
                    <span className="text-slate-100 font-bold text-xs">{item.totalInputTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-2 bg-[#0c1220] rounded-lg border border-[#202b3f]/70">
                    <span className="text-slate-400 block font-sans text-[10px]">Salida:</span>
                    <span className="text-blue-300 font-bold text-xs">{item.totalOutputTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-2 bg-[#0c1220] rounded-lg border border-[#202b3f]/70">
                    <span className="text-slate-400 block font-sans text-[10px]">Pensamiento:</span>
                    <span className="text-violet-300 font-bold text-xs">{item.totalThinkingTokens.toLocaleString()}</span>
                  </div>

                  <div className="p-2 bg-[#0c1220] rounded-lg border border-[#202b3f]/70">
                    <span className="text-slate-400 block font-sans text-[10px]">Caché reusada:</span>
                    <span className="text-emerald-400 font-bold text-xs">{item.totalCacheReadTokens.toLocaleString()}</span>
                    {item.totalCacheReadTokens > 0 && (
                      <span className="block text-[10px] text-slate-500 font-sans" title="Parte de la entrada que salió de la caché">
                        {Math.round((item.totalCacheReadTokens / (item.totalInputTokens + item.totalCacheReadTokens)) * 100)}% de entrada
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

