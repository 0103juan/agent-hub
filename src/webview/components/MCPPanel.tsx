import React from 'react';
import { MCPServerInfo } from '../../orchestrator/types';
import { RefreshCw, Wrench, Check, AlertTriangle, Cloud } from 'lucide-react';

interface Props {
  mcps: MCPServerInfo[];
  isSyncing: boolean;
  onSync: () => void;
}

export const MCPPanel: React.FC<Props> = ({ mcps, isSyncing, onSync }) => {
  return (
    <div className="bg-zinc-900/60 rounded-lg border border-zinc-800 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <Wrench className="w-3.5 h-3.5 text-indigo-400" />
          <span>Servidores MCP Detectados ({mcps.length})</span>
        </div>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 transition disabled:opacity-50"
          title="Sincronizar servidores MCP entre Claude y Google"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Sincronizar</span>
        </button>
      </div>

      {mcps.length === 0 ? (
        <div className="text-[11px] text-zinc-500 py-2 text-center">
          No se detectaron servidores MCP configurados aún.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {mcps.map((mcp) => (
            <div
              key={mcp.name}
              className="flex items-center justify-between p-2 rounded bg-zinc-800/40 border border-zinc-800 text-[11px]"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="font-mono text-zinc-300 truncate">{mcp.name}</span>
                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  {mcp.type}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  title={mcp.syncedToClaude ? 'Disponible en Claude' : 'No disponible en Claude'}
                  className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                    mcp.syncedToClaude
                      ? 'bg-orange-950 text-orange-400 border border-orange-800/50'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  Claude
                </span>
                <span
                  title={mcp.syncedToGoogle ? 'Disponible en Google' : 'No disponible en Google'}
                  className={`text-[9px] px-1 py-0.5 rounded font-mono ${
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
      )}
    </div>
  );
};

