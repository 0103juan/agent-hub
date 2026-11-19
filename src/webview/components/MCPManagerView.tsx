import React, { useState, useMemo } from 'react';
import { MCPServerInfo } from '../../shared/types';
import { normalizeText } from '../../shared/workspace-actions';
import {
  RefreshCw,
  Wrench,
  FolderGit2,
  Globe,
  Search,
  Activity,
  Check,
  Copy,
  X,
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Terminal,
  Zap
} from 'lucide-react';
import { postToHost } from '../vscode-api';

interface Props {
  mcps: MCPServerInfo[];
  isSyncing: boolean;
  onSync: () => void;
  onTogglePortfolio: (mcpName: string, enable: boolean) => void;
}

export const MCPManagerView: React.FC<Props> = ({ mcps, isSyncing, onSync, onTogglePortfolio }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'synced' | 'unsynced' | 'portfolio' | 'cloud'>('all');
  const [copiedId, setCopiedId] = useState<string>();
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const copyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(undefined), 1500);
    } catch {}
  };

  const toggleToolsExpand = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const inClaude = mcps.filter((m) => m.syncedToClaude).length;
  const inGoogle = mcps.filter((m) => m.syncedToGoogle).length;
  const totalTools = useMemo(() => mcps.reduce((acc, m) => acc + (m.tools?.length ?? 0), 0), [mcps]);
  const connectedCount = mcps.filter((m) => m.status === 'connected' || m.syncedToClaude || m.syncedToGoogle).length;

  const filteredMcps = useMemo(() => {
    return mcps
      .filter((m) => {
        const q = normalizeText(searchQuery);
        const matchesName = normalizeText(m.name).includes(q);
        const matchesDesc = m.description ? normalizeText(m.description).includes(q) : false;
        const matchesTools = m.tools ? m.tools.some((t) => normalizeText(t).includes(q)) : false;
        return matchesName || matchesDesc || matchesTools;
      })
      .filter((m) => {
        if (filterMode === 'synced') return Boolean(m.syncedToClaude || m.syncedToGoogle);
        if (filterMode === 'unsynced') return !m.syncedToClaude && !m.syncedToGoogle;
        if (filterMode === 'portfolio') return m.category === 'local_portfolio';
        if (filterMode === 'cloud') return m.category !== 'local_portfolio';
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [mcps, searchQuery, filterMode]);

  const portfolioMcps = filteredMcps.filter((m) => m.category === 'local_portfolio');
  const cloudMcps = filteredMcps.filter((m) => m.category !== 'local_portfolio');

  return (
    <div className="space-y-3.5 w-full max-w-4xl min-w-0 pb-6">
      {/* Cabecera Táctica */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0a0e17] border border-[#202b3f] shadow-lg shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/25 shrink-0">
            <Wrench className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100">Centro de Herramientas y Servidores MCP</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {mcps.length} {mcps.length === 1 ? 'servidor' : 'servidores'}
                {totalTools > 0 && ` · ${totalTools} herramientas`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Protocolos de contexto y herramientas conectadas a Claude y Google Antigravity
            </p>
          </div>
        </div>

        {/* Acciones Globales */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-[#07090e] px-3 py-1 rounded-full border border-[#202b3f]">
            <span className="text-orange-400">Claude {inClaude}</span>
            <span>·</span>
            <span className="text-cyan-400">Antigravity {inGoogle}</span>
          </div>

          <button
            type="button"
            onClick={() =>
              mcps.filter((m) => m.category !== 'local_portfolio').forEach((m) => postToHost({ command: 'checkMcpHealth', mcpId: m.id }))
            }
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 font-medium transition"
            title="Probar conectividad y salud de todos los servidores"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Probar salud</span>
          </button>

          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold transition shadow-md shadow-cyan-500/20 disabled:opacity-50 hover:brightness-110"
            title="Sincronizar configuraciones en claude.json y settings de Antigravity"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar todo</span>
          </button>
        </div>
      </div>

      {/* Controles de Búsqueda y Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-xl bg-[#0a0e17] border border-[#202b3f]">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Buscar servidor o herramienta (ej: read_file, postgres, playwright)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
            className="w-full pl-8 pr-7 py-1.5 bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Borrar la búsqueda"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Píldoras de Filtro */}
        <div className="flex items-center gap-1 text-[11px] flex-wrap">
          {(
            [
              ['all', `Todos (${mcps.length})`],
              ['portfolio', `Portafolio Local (${mcps.filter((m) => m.category === 'local_portfolio').length})`],
              ['cloud', `Nube / Plugins (${mcps.filter((m) => m.category !== 'local_portfolio').length})`],
              ['synced', `Sincronizados (${mcps.filter((m) => m.syncedToClaude || m.syncedToGoogle).length})`],
              ['unsynced', `Sin sincronizar (${mcps.filter((m) => !m.syncedToClaude && !m.syncedToGoogle).length})`]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilterMode(id)}
              className={`px-2.5 py-1 rounded-md transition font-medium ${
                filterMode === id
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#162035]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* SECCIÓN 1: Servidores Locales del Portafolio */}
      {portfolioMcps.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <FolderGit2 className="w-4 h-4 text-emerald-400" />
              <span>Servidores Locales de tu Portafolio ({portfolioMcps.length})</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Ejecutables STDIO gestionados</span>
          </div>

          <div className="space-y-2.5">
            {portfolioMcps.map((mcp) => {
              const isExpanded = Boolean(expandedTools[mcp.id]);
              const toolsList = mcp.tools || [];
              const visibleTools = isExpanded ? toolsList : toolsList.slice(0, 6);
              const commandStr = `${mcp.command || ''} ${(mcp.args || []).join(' ')}`.trim();

              return (
                <article
                  key={mcp.id}
                  className="hub-card hub-lift p-3.5 rounded-xl bg-[#0a0e17] border border-[#202b3f] hover:border-cyan-500/40 space-y-2.5 transition shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/50" />
                      <span className="font-mono text-sm font-bold text-emerald-300 truncate">{mcp.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 uppercase font-semibold">
                        {mcp.type || 'stdio'}
                      </span>
                      {mcp.description && (
                        <span className="text-xs text-slate-400 truncate hidden md:inline">
                          · {mcp.description}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            mcp.syncedToClaude
                              ? 'bg-orange-950/60 text-orange-400 border-orange-500/40'
                              : 'bg-[#07090e] text-slate-500 border border-[#202b3f]'
                          }`}
                        >
                          Claude {mcp.syncedToClaude ? '✓' : '✕'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            mcp.syncedToGoogle
                              ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40'
                              : 'bg-[#07090e] text-slate-500 border border-[#202b3f]'
                          }`}
                        >
                          Antigravity {mcp.syncedToGoogle ? '✓' : '✕'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onTogglePortfolio(mcp.name, !mcp.syncedToClaude)}
                        className={`text-xs px-3 py-1 rounded-lg font-bold transition ${
                          mcp.syncedToClaude
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40'
                            : 'bg-[#0c1220] text-slate-400 border border-[#202b3f] hover:bg-[#162035] hover:text-slate-200'
                        }`}
                      >
                        {mcp.syncedToClaude ? 'Activo' : 'Activar'}
                      </button>
                    </div>
                  </div>

                  {mcp.description && (
                    <p className="text-xs text-slate-300 md:hidden">{mcp.description}</p>
                  )}

                  {/* Línea de comando ejecutable */}
                  {commandStr && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#07090e] border border-[#202b3f] font-mono text-xs text-slate-300">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate text-cyan-300">{commandStr}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyCommand(mcp.id, commandStr)}
                        className="text-slate-500 hover:text-slate-200 transition p-1 shrink-0"
                        title="Copiar comando completo"
                      >
                        {copiedId === mcp.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Chips de herramientas expuestas */}
                  {toolsList.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-500 mr-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-cyan-400" />
                        Herramientas ({toolsList.length}):
                      </span>
                      {visibleTools.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 rounded-md bg-[#162035]/60 border border-[#202b3f] text-cyan-200 font-mono text-[10px]"
                        >
                          {tool}
                        </span>
                      ))}
                      {toolsList.length > 6 && (
                        <button
                          type="button"
                          onClick={() => toggleToolsExpand(mcp.id)}
                          className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline ml-1"
                        >
                          {isExpanded ? 'Ver menos' : `+${toolsList.length - 6} más`}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* SECCIÓN 2: Servidores en la Nube y Plugins */}
      {cloudMcps.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Servidores en la Nube y Plugins Registrados ({cloudMcps.length})</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">SSE / HTTP / Conectores remotos</span>
          </div>

          <div className="space-y-2">
            {cloudMcps.map((mcp) => {
              const isHealthy =
                !mcp.healthMessage || !/error|fall|fail|timeout|no /i.test(mcp.healthMessage);
              const toolsList = mcp.tools || [];
              const isExpanded = Boolean(expandedTools[mcp.id]);
              const visibleTools = isExpanded ? toolsList : toolsList.slice(0, 6);

              return (
                <article
                  key={mcp.id}
                  className="hub-card hub-lift p-3 rounded-xl bg-[#0a0e17] border border-[#202b3f] hover:border-cyan-500/40 text-xs space-y-2 transition shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isHealthy ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'
                          }`}
                        />
                        <span className="font-mono font-bold text-slate-100 truncate">{mcp.name}</span>
                        {mcp.healthMessage && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                              isHealthy
                                ? 'text-emerald-300 bg-emerald-950/60 border-emerald-800/40'
                                : 'text-rose-300 bg-rose-950/60 border-rose-800/40'
                            }`}
                          >
                            {mcp.healthMessage}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {mcp.url || (mcp.command ? `${mcp.command} ${(mcp.args || []).join(' ')}` : 'Conectado')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => postToHost({ command: 'checkMcpHealth', mcpId: mcp.id })}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-medium transition"
                        title="Probar salud del servidor"
                      >
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Probar</span>
                      </button>

                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            mcp.syncedToClaude
                              ? 'bg-orange-950/60 text-orange-400 border-orange-500/40'
                              : 'bg-[#07090e] text-slate-500 border border-[#202b3f]'
                          }`}
                        >
                          Claude {mcp.syncedToClaude ? '✓' : '✕'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            mcp.syncedToGoogle
                              ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40'
                              : 'bg-[#07090e] text-slate-500 border border-[#202b3f]'
                          }`}
                        >
                          Antigravity {mcp.syncedToGoogle ? '✓' : '✕'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Herramientas expuestas para plugins en la nube */}
                  {toolsList.length > 0 && (
                    <div className="pt-1 border-t border-[#202b3f]/60 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-500 mr-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-cyan-400" />
                        Herramientas ({toolsList.length}):
                      </span>
                      {visibleTools.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 rounded-md bg-[#07090e] border border-[#202b3f] text-slate-300 font-mono text-[10px]"
                        >
                          {tool}
                        </span>
                      ))}
                      {toolsList.length > 6 && (
                        <button
                          type="button"
                          onClick={() => toggleToolsExpand(mcp.id)}
                          className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline ml-1"
                        >
                          {isExpanded ? 'Ver menos' : `+${toolsList.length - 6} más`}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {filteredMcps.length === 0 && (
        <div className="p-8 text-center text-slate-400 bg-[#0a0e17] rounded-xl border border-[#202b3f] text-xs">
          Ningún servidor MCP coincide con el criterio de búsqueda o filtro seleccionado.
        </div>
      )}
    </div>
  );
};
