import React, { useState } from 'react';
import { MCPServerInfo } from '../../shared/types';
import { normalizeText } from '../../shared/workspace-actions';
import { RefreshCw, Wrench, FolderGit2, Globe, Search, Activity, Check, Copy, X } from 'lucide-react';
import { postToHost } from '../vscode-api';

interface Props {
  mcps: MCPServerInfo[];
  isSyncing: boolean;
  onSync: () => void;
  onTogglePortfolio: (mcpName: string, enable: boolean) => void;
}

export const MCPManagerView: React.FC<Props> = ({ mcps, isSyncing, onSync, onTogglePortfolio }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [syncFilter, setSyncFilter] = useState<'all' | 'synced' | 'unsynced'>('all');
  const [copiedId, setCopiedId] = useState<string>();
  const copyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(undefined), 1500);
    } catch {}
  };
  const inClaude = mcps.filter((m) => m.syncedToClaude).length;
  const inGoogle = mcps.filter((m) => m.syncedToGoogle).length;

  const filteredMcps = mcps
    .filter(
      (m) =>
        normalizeText(m.name).includes(normalizeText(searchQuery)) ||
        (m.description && normalizeText(m.description).includes(normalizeText(searchQuery)))
    )
    .filter((m) => syncFilter === 'all' || (syncFilter === 'synced') === Boolean(m.syncedToClaude || m.syncedToGoogle))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cloudMcps = filteredMcps.filter((m) => m.category !== 'local_portfolio');
  const portfolioMcps = filteredMcps.filter((m) => m.category === 'local_portfolio');

  return (
    <div className="space-y-3 p-1 min-w-0 w-full">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
        <div>
          <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
            <Wrench className="w-4 h-4 text-indigo-400" />
            <span>Servidores MCP ({mcps.length})</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Herramientas y protocolos conectados a Claude y Antigravity
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => mcps.filter((m) => m.category !== 'local_portfolio').forEach((m) => postToHost({ command: 'checkMcpHealth', mcpId: m.id }))}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium transition"
            title="Probar la salud de todos los servidores"
          >
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Probar todos</span>
          </button>
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50 shadow"
            title="Sincronizar todos los servidores"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Buscar servidor MCP por nombre o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
              className="w-full pl-8 pr-7 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-700"
            />
            {searchQuery && (
              <button type="button" aria-label="Borrar la búsqueda" onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-zinc-200">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {([['all', 'Todos'], ['synced', 'Sincronizados'], ['unsynced', 'Sin sincronizar']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={syncFilter === id}
                onClick={() => setSyncFilter(id)}
                className={`px-2 py-0.5 rounded-full border transition ${syncFilter === id ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto font-mono text-zinc-500">Claude {inClaude} · Antigravity {inGoogle}</span>
          </div>

          {/* Local Portfolio MCPs */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Servidores locales de tu portafolio ({portfolioMcps.length})</span>
            </div>

            {portfolioMcps.length === 0 ? (
              <div className="text-[11px] text-zinc-400 p-2.5 bg-zinc-900/50 rounded border border-zinc-800">
                No se detectaron servidores locales coincidentes.
              </div>
            ) : (
              <div className="space-y-2">
                {portfolioMcps.map((mcp) => (
                  <div
                    key={mcp.id}
                    className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-2 hover:border-zinc-700 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold text-emerald-300">{mcp.name}</div>
                        <div className="text-[11px] text-zinc-400">{mcp.description || 'Servidor MCP local'}</div>
                      </div>

                      <button
                        onClick={() => onTogglePortfolio(mcp.name, !mcp.syncedToClaude)}
                        className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition ${
                          mcp.syncedToClaude
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {mcp.syncedToClaude ? 'Activo' : 'Activar'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                      <span>Protocolo: {mcp.type}</span>
                      <span>•</span>
                      <span className="truncate">Ejecutable: {mcp.command}</span>
                      {mcp.command && (
                        <button type="button" onClick={() => copyCommand(mcp.id, `${mcp.command} ${(mcp.args || []).join(' ')}`.trim())} className="shrink-0 text-zinc-500 hover:text-zinc-200" title="Copiar el comando">
                          {copiedId === mcp.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cloud / Registered MCPs */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Servidores en la nube y plugins ({cloudMcps.length})</span>
            </div>

            <div className="space-y-1.5">
              {cloudMcps.length === 0 && (
                <div className="text-[11px] text-zinc-400 p-2.5 bg-zinc-900/50 rounded border border-zinc-800">Ningún servidor coincide con el filtro.</div>
              )}
              {cloudMcps.map((mcp) => (
                <div
                  key={mcp.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs"
                >
                  <div className="truncate mr-2 min-w-0 flex-1">
                    <div className="font-mono text-zinc-200 truncate flex items-center gap-1.5">
                      <span>{mcp.name}</span>
                      {mcp.healthMessage && (
                        <span className={`text-[10px] px-1 py-0.2 rounded font-sans border ${/error|fall|fail|timeout|no /i.test(mcp.healthMessage) ? 'text-red-300 bg-red-950/60 border-red-800/40' : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40'}`}>
                          {mcp.healthMessage}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {mcp.url || (mcp.command ? `${mcp.command} ${(mcp.args || []).join(' ')}` : 'Conectado')}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => postToHost({ command: 'checkMcpHealth', mcpId: mcp.id })}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition"
                      title="Probar salud del servidor"
                    >
                      <Activity className="w-3.5 h-3.5" />
                    </button>

                    <span
                      title={mcp.syncedToClaude ? 'Sincronizado en Claude' : 'No sincronizado en Claude'}
                      className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${
                        mcp.syncedToClaude
                          ? 'bg-orange-950 text-orange-400 border border-orange-800/50'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      Claude
                    </span>
                    <span
                      title={mcp.syncedToGoogle ? 'Sincronizado en Antigravity' : 'No sincronizado en Antigravity'}
                      className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${
                        mcp.syncedToGoogle
                          ? 'bg-blue-950 text-blue-400 border border-blue-800/50'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      Antigravity
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </>
    </div>
  );
};
