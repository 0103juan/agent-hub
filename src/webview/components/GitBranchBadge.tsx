import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, Check, ChevronDown, Search, Plus, ExternalLink, X, RefreshCw, GitMerge } from 'lucide-react';
import { postToHost } from '../vscode-api';

export interface GitBranchBadgeProps {
  branch?: string;
  branches?: string[];
  squadBranches?: string[];
  uncommittedCount?: number;
  compact?: boolean;
  onCheckout?: (branch: string, dir?: string) => void;
  onCreate?: (branch: string, dir?: string) => void;
  onOpenManager?: (dir?: string) => void;
  onClick?: () => void;
  currentDir?: string;
  className?: string;
}

export const GitBranchBadge: React.FC<GitBranchBadgeProps> = ({
  branch = '',
  branches = [],
  squadBranches = [],
  uncommittedCount = 0,
  compact = false,
  onCheckout,
  onCreate,
  onOpenManager,
  onClick,
  currentDir,
  className = ''
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isGit = Boolean(branch && branch.trim());
  const cleanBranch = isGit ? branch.trim() : '';
  const hasChanges = (uncommittedCount ?? 0) > 0;
  const count = uncommittedCount ?? 0;

  // Unir y ordenar ramas: la rama activa primero, luego alfabéticamente
  const allBranches = Array.from(new Set(cleanBranch ? [cleanBranch, ...branches] : branches)).filter(Boolean);
  const visibleBranches = allBranches
    .filter((b) => b.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => (a === cleanBranch ? -1 : b === cleanBranch ? 1 : a.localeCompare(b)));

  const visibleSquadBranches = squadBranches
    .filter((b) => b.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => (a === cleanBranch ? -1 : b === cleanBranch ? 1 : a.localeCompare(b)));

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const handleEvents = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e instanceof MouseEvent && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleEvents);
    document.addEventListener('keydown', handleEvents);
    return () => {
      document.removeEventListener('mousedown', handleEvents);
      document.removeEventListener('keydown', handleEvents);
    };
  }, [open]);

  if (!isGit) {
    return (
      <div ref={containerRef} className="relative shrink-0 select-none">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`group inline-flex items-center gap-1.5 rounded border font-mono transition cursor-pointer text-zinc-400 hover:text-zinc-200 border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} ${className}`}
          title="Esta carpeta no es un repositorio Git. Clic para ver opciones."
        >
          <GitBranch className={`shrink-0 text-zinc-500 ${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
          <span className="truncate max-w-[90px] text-zinc-400">Sin Git</span>
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl p-3 z-50 text-xs">
            <div className="font-semibold text-zinc-200 mb-1">Sin control de versiones Git</div>
            <div className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
              La carpeta activa no contiene un repositorio Git inicializado (<code>.git</code>).
            </div>
            <button
              type="button"
              onClick={() => {
                postToHost({ command: 'initGitRepo', dir: currentDir });
                setOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Inicializar Git aquí (git init)
            </button>
          </div>
        )}
      </div>
    );
  }

  // Al abrir, refrescar ramas desde el host y enfocar buscador
  const handleToggleOpen = () => {
    if (onClick && !onCheckout) {
      onClick();
      return;
    }
    const next = !open;
    setOpen(next);
    if (next) {
      setFilter('');
      setIsCreating(false);
      setNewBranchName('');
      postToHost({ command: 'getGitBranches', dir: currentDir });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleCheckoutBranch = (target: string) => {
    if (target === cleanBranch) {
      setOpen(false);
      return;
    }
    if (onCheckout) {
      onCheckout(target, currentDir);
    } else {
      postToHost({ command: 'checkoutBranch', branch: target, dir: currentDir });
    }
    setOpen(false);
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = newBranchName.trim().replace(/\s+/g, '-');
    if (!safeName) return;
    if (onCreate) {
      onCreate(safeName, currentDir);
    } else {
      postToHost({ command: 'createBranch', branch: safeName, dir: currentDir });
    }
    setNewBranchName('');
    setIsCreating(false);
    setOpen(false);
  };

  const tooltip = hasChanges
    ? `Rama: ${cleanBranch} · ${count} archivo${count === 1 ? '' : 's'} con cambios sin commitear (local, sin fetch) · Clic para ver o cambiar de rama`
    : `Rama: ${cleanBranch} · Árbol de trabajo limpio (sin cambios) · Clic para ver o cambiar de rama`;

  const ariaLabel = hasChanges
    ? `Rama git ${cleanBranch}, ${count} cambios sin commitear. Clic para cambiar de rama.`
    : `Rama git ${cleanBranch}, sin cambios pendientes. Clic para cambiar de rama.`;

  return (
    <div ref={containerRef} className="relative shrink-0 select-none">
      <button
        type="button"
        onClick={handleToggleOpen}
        className={`group inline-flex items-center gap-1.5 rounded border font-mono transition cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 ${
          compact
            ? 'px-1.5 py-0.5 text-[10px] bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800 hover:border-zinc-700'
            : 'px-2 py-1 text-[11px] bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-750 hover:border-zinc-700'
        } ${open ? 'border-emerald-500/50 bg-zinc-800' : ''} ${className}`}
        title={tooltip}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <GitBranch
          className={`shrink-0 text-emerald-400 ${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'}`}
          aria-hidden="true"
        />
        <span
          className={`font-mono truncate ${
            compact ? 'max-w-[70px] text-[10px]' : 'max-w-[110px] text-[11px]'
          }`}
        >
          {cleanBranch}
        </span>
        <ChevronDown
          className={`shrink-0 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-150 ${
            compact ? 'w-2 h-2' : 'w-2.5 h-2.5'
          } ${open ? 'rotate-180 text-emerald-400' : ''}`}
          aria-hidden="true"
        />
        {hasChanges ? (
          <span
            className={`flex items-center gap-0.5 font-mono font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/35 shrink-0 ${
              compact ? 'px-1 py-0 text-[9px] leading-tight' : 'px-1.5 py-0.2 text-[10px]'
            }`}
            title={`${count} cambio${count === 1 ? '' : 's'} sin commitear (local, sin fetch)`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>{count}</span>
          </span>
        ) : (
          <span
            className="flex items-center text-emerald-400/80 shrink-0"
            title="Árbol limpio (sin cambios)"
          >
            <Check className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} aria-hidden="true" />
          </span>
        )}
      </button>

      {/* Popover / Menú Desplegable con Ramas */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-2.5 text-xs animate-message-fade">
          {/* Cabecera: Rama Activa y Estado */}
          <div className="p-2 rounded-lg bg-zinc-950/70 border border-zinc-850 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono font-semibold text-zinc-400 tracking-wider">
                Rama Activa
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-semibold text-[10px] border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                {cleanBranch}
              </span>
            </div>
            <div className="text-[11px] font-mono flex items-center gap-1.5 pt-0.5">
              {hasChanges ? (
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  {count} archivo{count === 1 ? '' : 's'} con cambios sin commitear
                </span>
              ) : (
                <span className="text-emerald-400/90 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Árbol limpio (sin cambios pendientes)
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Consulta local directa · sin fetch de red
            </div>
          </div>

          {/* Buscador de Ramas */}
          {(allBranches.length > 3 || filter) && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar ramas..."
                className="w-full pl-7 pr-6 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="absolute right-2 top-1.5 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Lista de Ramas Locales */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-semibold px-1">
              <span>Ramas disponibles ({visibleBranches.length})</span>
              <button
                type="button"
                onClick={() => postToHost({ command: 'getGitBranches', dir: currentDir })}
                className="hover:text-zinc-300 normal-case tracking-normal flex items-center gap-1"
                title="Refrescar lista de ramas"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Refrescar</span>
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5 no-scrollbar">
              {visibleBranches.length === 0 ? (
                <div className="p-2 text-center text-zinc-500 text-[11px]">
                  No se encontraron ramas con "{filter}".
                </div>
              ) : (
                visibleBranches.map((b) => {
                  const isActive = b === cleanBranch;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => handleCheckoutBranch(b)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition font-mono text-xs cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold'
                          : 'hover:bg-zinc-800 text-zinc-300 hover:text-white border border-transparent'
                      }`}
                      title={isActive ? `Rama activa actualmente` : `Cambiar a la rama ${b}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GitBranch
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                          }`}
                        />
                        <span className="truncate">{b}</span>
                      </div>
                      {isActive ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0 font-medium">
                          <Check className="w-3 h-3" />
                          <span>Actual</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-indigo-400 hover:text-indigo-300 shrink-0 font-medium">
                          Cambiar →
                        </span>
                      )}
                    </button>
                  );
                })
              )}
              {visibleBranches.length === 1 && !filter && (
                <div className="p-2 text-[10.5px] text-zinc-400 bg-zinc-950/60 rounded border border-zinc-800/80 mt-1.5 leading-relaxed">
                  Solo existe la rama <span className="font-mono text-emerald-400 font-semibold">{cleanBranch}</span> en este repositorio. Pulsa <strong>"+ Nueva rama"</strong> para crear otra.
                </div>
              )}
            </div>
          </div>

          {/* Ramas de Squad / Pipelines si existen */}
          {visibleSquadBranches.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold px-1">
                Ramas de Equipo / Worktrees ({visibleSquadBranches.length})
              </div>
              <div className="max-h-28 overflow-y-auto space-y-0.5 pr-0.5 no-scrollbar">
                {visibleSquadBranches.map((b) => {
                  const isActive = b === cleanBranch;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => handleCheckoutBranch(b)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition font-mono text-[11px] cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold'
                          : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GitMerge className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="truncate">{b}</span>
                      </div>
                      {isActive && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Formulario Crear Nueva Rama */}
          <div className="pt-1.5 border-t border-zinc-800 space-y-1.5">
            {!isCreating ? (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 hover:text-white transition cursor-pointer text-xs font-medium"
              >
                <Plus className="w-3 h-3 text-indigo-400" />
                <span>Nueva rama...</span>
              </button>
            ) : (
              <form onSubmit={handleCreateBranch} className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="nombre-de-rama"
                    className="flex-1 min-w-0 px-2 py-1 rounded bg-zinc-950 border border-indigo-500 text-zinc-100 text-xs font-mono focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newBranchName.trim()}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition disabled:opacity-40 cursor-pointer"
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewBranchName('');
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-zinc-500">
                  Crea y cambia automáticamente a la nueva rama.
                </div>
              </form>
            )}

            {/* Acceso al gestor modal avanzado */}
            {(onOpenManager || onClick) && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onOpenManager) onOpenManager(currentDir);
                  else if (onClick) onClick();
                }}
                className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition cursor-pointer"
              >
                <span>Gestor avanzado de ramas...</span>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
