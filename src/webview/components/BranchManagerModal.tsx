import React, { useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Copy,
  Search,
  GitMerge,
  Workflow
} from 'lucide-react';
import { ModalShell } from './ModalShell';
import { normalizeText } from '../../shared/workspace-actions';

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
  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [copiedBranch, setCopiedBranch] = useState<string>();
  const copyBranch = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedBranch(name);
      setTimeout(() => setCopiedBranch(undefined), 1500);
    } catch {}
  };
  // Git no admite espacios ni estos caracteres en una rama; los espacios pasan a guiones.
  const cleanName = newBranchName.trim().replace(/\s+/g, '-');
  const nameError = /[~^:?*[\\]|\.\.|@\{|\.lock$|^-|\/$/.test(cleanName) ? 'Ese nombre no es válido para git.' : branches.includes(cleanName) ? 'Esa rama ya existe.' : '';
  const visibleBranches = [...branches]
    .filter((name) => normalizeText(name).includes(normalizeText(filter.trim())))
    .sort((a, b) => (a === currentBranch ? -1 : b === currentBranch ? 1 : a.localeCompare(b)));

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanName || nameError) return;
    onCreate(cleanName);
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
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#07090e] border border-emerald-500/40 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-slate-400 font-mono text-[11px] uppercase font-semibold">Rama activa:</span>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-950/60 text-emerald-300 font-mono font-bold border border-emerald-500/40 flex items-center gap-1.5 shadow-xs">
              <Check className="w-3 h-3 text-emerald-400" />
              {currentBranch}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="p-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 hover:text-white border border-[#202b3f] hover:border-cyan-500/40 transition-colors cursor-pointer"
              title="Refrescar lista de ramas"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(!isCreating)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold transition cursor-pointer shadow-md shadow-cyan-950/50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Rama</span>
            </button>
          </div>
        </div>

        {/* Formulario para nueva rama */}
        {isCreating && (
          <form
            onSubmit={handleCreateSubmit}
            className="flex items-center gap-2 p-3 rounded-xl bg-[#07090e] border border-cyan-500/50 shadow-inner animate-in fade-in"
          >
            <GitBranch className="w-4 h-4 text-cyan-400 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="nombre-de-la-rama (ej. feature/nuevo-modulo)"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
            />
            {nameError && <span className="text-[11px] font-mono text-rose-300 shrink-0">{nameError}</span>}
            <button
              type="submit"
              disabled={!cleanName || Boolean(nameError)}
              className="disabled:opacity-40 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-cyan-400 hover:brightness-110 text-slate-950 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm shadow-cyan-950/40"
            >
              Crear y Cambiar
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#0c1220]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Ramas Locales */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="font-bold text-slate-200 tracking-wide">
              Ramas Locales ({visibleBranches.length === branches.length ? branches.length : `${visibleBranches.length} de ${branches.length}`})
            </span>
            {branches.length > 5 && (
              <span className="relative">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar ramas…"
                  aria-label="Filtrar ramas"
                  className="w-44 bg-[#07090e] border border-[#202b3f] rounded-lg pl-7 pr-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </span>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5 p-1">
            {visibleBranches.map((b) => {
              const isCurrent = b === currentBranch;
              return (
                <div
                  key={b}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border transition ${
                    isCurrent
                      ? 'bg-[#0a0e17] border-emerald-500/50 text-emerald-300 font-bold shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'bg-[#07090e] border-[#202b3f] text-slate-200 hover:border-cyan-500/30 hover:bg-[#162035]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'text-slate-400'}`} />
                    <span className="font-mono truncate">{b}</span>
                    <button type="button" onClick={() => copyBranch(b)} className="text-slate-400 hover:text-cyan-300 shrink-0 transition-colors p-1" title="Copiar el nombre de la rama" aria-label={`Copiar ${b}`}>
                      {copiedBranch === b ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    {isCurrent && (
                      <span className="text-[9px] font-mono font-bold bg-emerald-950/80 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/50 uppercase">
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
                          className="px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-200 hover:text-white border border-cyan-500/35 hover:border-cyan-400 text-xs font-mono font-medium transition cursor-pointer shadow-xs"
                        >
                          Cambiar
                        </button>
                        {pendingDelete === b ? (
                          <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-500/50 rounded-lg px-2 py-0.5">
                            <span className="text-[11px] font-mono text-rose-300">¿Eliminar?</span>
                            <button
                              type="button"
                              onClick={() => {
                                onDelete(b);
                                setPendingDelete(undefined);
                              }}
                              className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Sí
                            </button>
                            <button type="button" onClick={() => setPendingDelete(undefined)} aria-label="Cancelar" className="text-slate-400 hover:text-white p-0.5">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDelete(b)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                            title={`Eliminar rama ${b}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
          <div className="space-y-2 pt-3 border-t border-[#202b3f]">
            <div className="flex items-center gap-1.5 font-bold text-violet-300 px-1">
              <Workflow className="w-3.5 h-3.5 text-violet-400" />
              <span>Ramas Aisladas de Agentes / Squads ({squadBranches.length})</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-1">
              {squadBranches.map((sb) => {
                const isCurrent = sb === currentBranch;
                return (
                  <div
                    key={sb}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-violet-950/20 border border-violet-500/40 text-violet-200 hover:border-violet-400/50 transition"
                  >
                    <span className="font-mono text-xs truncate">{sb}</span>
                    <div className="flex items-center gap-1.5">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => onCheckout(sb)}
                          className="px-2.5 py-1 rounded-lg bg-violet-950/40 hover:bg-violet-900/60 text-violet-200 hover:text-white border border-violet-500/40 hover:border-violet-400 text-xs font-mono font-medium transition cursor-pointer"
                        >
                          Checkout
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(sb)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-rose-950/30 transition"
                        title="Descartar rama de agente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
