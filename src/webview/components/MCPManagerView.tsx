import React, { useState } from 'react';
import { MCPServerInfo } from '../../shared/types';
import { RefreshCw, Wrench, FolderGit2, Globe, Search, Activity, ShieldCheck } from 'lucide-react';
import { postToHost } from '../vscode-api';

interface Props {
  mcps: MCPServerInfo[];
  isSyncing: boolean;
  onSync: () => void;
  onTogglePortfolio: (mcpName: string, enable: boolean) => void;
}

export const MCPManagerView: React.FC<Props> = ({ mcps, isSyncing, onSync, onTogglePortfolio }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMcps = mcps.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const cloudMcps = filteredMcps.filter((m) => m.category !== 'local_portfolio');
  const portfolioMcps = filteredMcps.filter((m) => m.category === 'local_portfolio');

  return (
    <div className="space-y-3 p-1">
      {/* Header & Sub-Tabs */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
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
              className="w-full pl-8 pr-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-700"
            />
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
                    <div className="flex items-center justify-between">
                      <div>
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
                      <span>Ejecutable: {mcp.command}</span>
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
              {cloudMcps.map((mcp) => (
                <div
                  key={mcp.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs"
                >
                  <div className="truncate mr-2">
                    <div className="font-mono text-zinc-200 truncate flex items-center gap-1.5">
                      <span>{mcp.name}</span>
                      {mcp.healthMessage && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1 py-0.2 rounded font-sans">
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
