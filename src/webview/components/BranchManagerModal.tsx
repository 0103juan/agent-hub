import React, { useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  GitMerge,
  Workflow
} from 'lucide-react';
import { ModalShell } from './ModalShell';

interface Props {
  currentBranch: string;
  branches: string[];
  squadBranches: string[];
  onClose: () => void;
  onCheckout: (branch: string) => void;
  onCreate: (branch: string) => void;
  onDelete: (branch: string) => void;
  onRefresh: () => void;
}

export const BranchManagerModal: React.FC<Props> = ({
  currentBranch,
  branches,
  squadBranches,
  onClose,
  onCheckout,
  onCreate,
  onDelete,
  onRefresh
}) => {
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    onCreate(newBranchName.trim());
    setNewBranchName('');
    setIsCreating(false);
  };

  return (
    <ModalShell
      title="Gestor de Ramas Git y Worktrees"
      icon={<GitBranch className="w-4 h-4 text-emerald-400" />}
      widthClass="max-w-2xl"
      onClose={onClose}
    >
      <div className="p-4 space-y-4 text-xs">
        {/* Cabecera con rama actual */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Rama activa:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-semibold border border-emerald-500/30 flex items-center gap-1">
              <Check className="w-3 h-3" />
              {currentBranch}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Refrescar lista de ramas"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(!isCreating)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Nueva Rama</span>
            </button>
          </div>
        </div>

        {/* Formulario para nueva rama */}
        {isCreating && (
          <form
            onSubmit={handleCreateSubmit}
            className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-indigo-500/40 animate-in fade-in"
          >
            <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="nombre-de-la-rama (ej. feature/nuevo-modulo)"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition"
            >
              Crear y Cambiar
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Ramas Locales */}
        <div className="space-y-1.5">
          <div className="font-semibold text-zinc-300 px-1">Ramas Locales ({branches.length})</div>
          <div className="max-h-52 overflow-y-auto space-y-1 p-1">
            {branches.map((b) => {
              const isCurrent = b === currentBranch;
              return (
                <div
                  key={b}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border transition ${
                    isCurrent
                      ? 'bg-zinc-850 border-emerald-500/30 text-emerald-300'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-850'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className={`w-3.5 h-3.5 ${isCurrent ? 'text-emerald-400' : 'text-zinc-500'}`} />
                    <span className="font-mono truncate">{b}</span>
                    {isCurrent && (
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-800">
                        actual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isCurrent && (
                      <>
                        <button
                          type="button"
                          onClick={() => onCheckout(b)}
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] transition cursor-pointer"
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(b)}
                          className="p-1 rounded hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 transition"
                          title={`Eliminar rama ${b}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ramas de Agentes / Squads */}
        {squadBranches.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-300 px-1">
              <Workflow className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ramas Aisladas de Agentes / Squads ({squadBranches.length})</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 p-1">
              {squadBranches.map((sb) => {
                const isCurrent = sb === currentBranch;
                return (
                  <div
                    key={sb}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-950/20 border border-indigo-800/30 text-indigo-200"
                  >
                    <span className="font-mono text-[11px] truncate">{sb}</span>
                    <div className="flex items-center gap-1">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => onCheckout(sb)}
                          className="px-2 py-0.5 rounded bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-200 text-[11px] transition"
                        >
                          Checkout
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(sb)}
                        className="p-1 text-zinc-500 hover:text-rose-400"
                        title="Descartar rama de agente"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
