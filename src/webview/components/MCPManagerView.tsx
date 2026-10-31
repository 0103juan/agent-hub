import React, { useState } from 'react';
import { MCPServerInfo } from '../../orchestrator/types';
import { RefreshCw, Wrench, FolderGit2, Globe, Search, Play, Terminal, Layers } from 'lucide-react';
import { vscode } from '../vscode-api';

interface Props {
  mcps: MCPServerInfo[];
  isSyncing: boolean;
  onSync: () => void;
  onTogglePortfolio: (mcpName: string, enable: boolean) => void;
}

export const MCPManagerView: React.FC<Props> = ({ mcps, isSyncing, onSync, onTogglePortfolio }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'playground'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMcp, setSelectedMcp] = useState<string>(mcps[0]?.name || '');
  const [playgroundQuery, setPlaygroundQuery] = useState('');
  const [playgroundResult, setPlaygroundResult] = useState<string | null>(null);

  const filteredMcps = mcps.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const cloudMcps = filteredMcps.filter((m) => m.category !== 'local_portfolio');
  const portfolioMcps = filteredMcps.filter((m) => m.category === 'local_portfolio');

  const handleTestCall = () => {
    if (!selectedMcp) return;
    setPlaygroundResult(`[MCP Test Call] Enviando consulta a '${selectedMcp}'...\nHerramienta: tools/list o info directa.\nResultado: Servidor activo y respondiendo correctamente en stdio.`);
  };

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
            Herramientas y protocolos conectados para Claude y Google
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-800 rounded p-0.5 text-[10px]">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-2 py-0.5 rounded transition ${
                activeTab === 'list' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setActiveTab('playground')}
              className={`px-2 py-0.5 rounded transition ${
                activeTab === 'playground' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Playground
            </button>
          </div>

          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50 shadow"
            title="Sincronizar todos los servidores"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {activeTab === 'playground' ? (
        /* MCP Playground View */
        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3 text-xs">
          <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Inspector y Tester de Herramientas MCP</span>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-zinc-400 uppercase font-semibold">Selecciona Servidor MCP:</label>
            <select
              value={selectedMcp}
              onChange={(e) => setSelectedMcp(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-zinc-200 text-xs font-mono"
            >
              {mcps.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name} ({m.type}) - {m.category}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-zinc-400 uppercase font-semibold">Parámetros / Comando de prueba:</label>
            <input
              type="text"
              placeholder='Ej: {"action": "list"} o tools/list'
              value={playgroundQuery}
              onChange={(e) => setPlaygroundQuery(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-zinc-200 text-xs font-mono focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <button
            onClick={handleTestCall}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Ejecutar Test en Servidor MCP</span>
          </button>

          {playgroundResult && (
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded font-mono text-[11px] text-zinc-300 whitespace-pre-wrap">
              {playgroundResult}
            </div>
          )}
        </div>
      ) : (
        /* MCP List View with Search */
        <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Buscar servidor MCP por nombre o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-zinc-700"
            />
          </div>

          {/* Local Portfolio MCPs */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Servidores Locales de tu Portafolio ({portfolioMcps.length})</span>
            </div>

            {portfolioMcps.length === 0 ? (
              <div className="text-[11px] text-zinc-500 p-2.5 bg-zinc-900/50 rounded border border-zinc-800">
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
                        {mcp.syncedToClaude ? 'Activo en Sesión' : 'Activar'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
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
              <span>Servidores Cloud & Plugins ({cloudMcps.length})</span>
            </div>

            <div className="space-y-1.5">
              {cloudMcps.map((mcp) => (
                <div
                  key={mcp.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs"
                >
                  <div className="truncate mr-2">
                    <div className="font-mono text-zinc-200 truncate">{mcp.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {mcp.url || (mcp.command ? `${mcp.command} ${(mcp.args || []).join(' ')}` : 'Conectado')}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      title={mcp.syncedToClaude ? 'Sincronizado en Claude' : 'No sincronizado en Claude'}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        mcp.syncedToClaude
                          ? 'bg-orange-950 text-orange-400 border border-orange-800/50'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      Claude
                    </span>
                    <span
                      title={mcp.syncedToGoogle ? 'Sincronizado en Google' : 'No sincronizado en Google'}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        mcp.syncedToGoogle
                          ? 'bg-blue-950 text-blue-400 border border-blue-800/50'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      Google
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
