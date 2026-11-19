import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderGit2, FolderOpen, ExternalLink, Code2, Check, Clock, ChevronDown, ChevronRight, ArrowUp, Star, Search, Copy } from 'lucide-react';
import { postToHost, openInVsCode } from '../vscode-api';
import { normalizeText } from '../../shared/workspace-actions';

const FAVORITES_KEY = 'agent-hub.favoriteDirs';

const readFavorites = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export interface WorkspacePickerProps {
  currentDir?: string;
  recentDirs: string[];
  /** Si se da, el selector cambia la carpeta de esa conversación y no la del chat activo. */
  sessionId?: string;
}

export const WorkspacePicker: React.FC<WorkspacePickerProps> = ({ currentDir, recentDirs, sessionId }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [reposOnly, setReposOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const toggleFavorite = (dir: string) =>
    setFavorites((current) => {
      const next = current.includes(dir) ? current.filter((item) => item !== dir) : [...current, dir];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const [listing, setListing] = useState<{ root: string; dir: string; entries: Array<{ name: string; path: string; isGit: boolean }> } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'dirListing') setListing(e.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (open) postToHost({ command: 'listDirs' });
    setFilter('');
  }, [open]);

  // Al cambiar de carpeta el filtro anterior ya no aplica.
  useEffect(() => setFilter(''), [listing?.dir]);

  const visibleEntries = (listing?.entries ?? []).filter(
    (entry) => (!reposOnly || entry.isGit) && normalizeText(entry.name).includes(normalizeText(filter.trim()))
  );
  const breadcrumb = listing
    ? [listing.root.split(/[\\/]/).filter(Boolean).pop() ?? '', ...listing.dir.slice(listing.root.length).split(/[\\/]/).filter(Boolean)].join(' / ')
    : '';
  const browse = (dir: string) => postToHost({ command: 'listDirs', dir });
  const atRoot = !listing || listing.dir.toLowerCase() === listing.root.toLowerCase();
  const parentDir = listing ? listing.dir.replace(/[\\/][^\\/]+$/, '') : '';

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
    }
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const folderName = currentDir ? currentDir.split(/[\\/]/).filter(Boolean).pop() ?? currentDir : 'Seleccionar carpeta';

  const selectDir = (dir: string) => {
    postToHost(sessionId ? { command: 'setSessionDir', sessionId, dir } : { command: 'setWorkspaceDir', dir });
    setOpen(false);
  };

  const chooseDir = () => {
    postToHost(sessionId ? { command: 'chooseSessionDir', sessionId } : { command: 'chooseWorkspaceDir' });
    setOpen(false);
  };

  const openInExplorer = () => {
    postToHost({ command: 'openFolderInExplorer', dir: currentDir });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#0a0e17] hover:bg-[#162035] text-slate-300 hover:text-slate-100 border border-[#202b3f] hover:border-cyan-500/50 transition cursor-pointer max-w-[180px] sm:max-w-[220px] shadow-sm ${
          open ? 'border-cyan-500/60 bg-[#162035] ring-1 ring-cyan-500/30 text-cyan-200' : ''
        }`}
        title={`Proyecto actual: ${currentDir ?? 'Sin carpeta asignada'}\nClic para cambiar de carpeta o ver proyectos recientes`}
      >
        <FolderGit2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="truncate font-mono text-[11px] font-semibold">{folderName}</span>
        <ChevronDown className={`w-2.5 h-2.5 text-slate-500 shrink-0 ml-auto transition-transform duration-150 ${open ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-84 sm:w-96 p-2.5 rounded-xl bg-[#0a0e17] border border-[#202b3f] shadow-2xl shadow-black/80 space-y-2.5 text-xs animate-modal-pop">
          <div className="space-y-1 pb-1.5 border-b border-[#202b3f]">
            <span className="text-[10px] uppercase font-mono font-semibold text-slate-400 tracking-wider">Espacio de Trabajo Activo</span>
            <div className="text-[11px] font-mono text-cyan-300 break-all p-2 rounded-lg bg-[#07090e] border border-[#202b3f]">
              {currentDir ?? 'Ninguno (Modo global)'}
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={chooseDir}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 border border-cyan-500/40 transition text-left cursor-pointer shadow-sm shadow-cyan-500/10"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="font-semibold text-xs">Abrir otra carpeta...</span>
            </button>

            {currentDir && (
              <div className="grid grid-cols-3 gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={openInExplorer}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 text-[11px] transition cursor-pointer border border-[#202b3f]"
                  title="Abrir en el Explorador de archivos de Windows"
                >
                  <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>Explorador</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openInVsCode(currentDir);
                    setOpen(false);
                  }}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 text-[11px] transition cursor-pointer border border-[#202b3f]"
                  title="Abrir este repositorio en VS Code"
                >
                  <Code2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>VS Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentDir).catch(() => {});
                    setOpen(false);
                  }}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 text-[11px] transition cursor-pointer border border-[#202b3f]"
                  title="Copiar la ruta de la carpeta actual"
                >
                  <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Copiar</span>
                </button>
              </div>
            )}
          </div>

          {favorites.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-[#202b3f]">
              <span className="text-[10px] uppercase font-mono font-semibold text-slate-400 tracking-wider flex items-center gap-1.5">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400/30" />
                Carpetas Favoritas
              </span>
              <div className="max-h-24 overflow-y-auto space-y-0.5 no-scrollbar">
                {favorites.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => selectDir(dir)}
                    className="w-full truncate text-left px-2 py-1.5 rounded-lg text-[11px] text-slate-300 hover:bg-[#162035] hover:text-white transition cursor-pointer"
                    title={dir}
                  >
                    {dir.split(/[\\/]/).filter(Boolean).pop() ?? dir}
                  </button>
                ))}
              </div>
            </div>
          )}

          {listing && (
            <div className="space-y-1.5 pt-1.5 border-t border-[#202b3f]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={atRoot}
                  onClick={() => browse(parentDir)}
                  className="p-1 rounded-lg hover:bg-[#162035] text-slate-400 hover:text-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-default transition border border-transparent hover:border-[#202b3f]"
                  title="Subir un nivel"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <span className="flex-1 truncate text-[11px] font-mono text-slate-300" title={listing.dir}>
                  {breadcrumb}
                </span>
                <button
                  type="button"
                  onClick={() => selectDir(listing.dir)}
                  className="px-2 py-0.5 rounded-md bg-cyan-600/25 hover:bg-cyan-600/40 text-cyan-200 border border-cyan-500/40 text-[10px] font-medium transition cursor-pointer"
                >
                  Usar esta
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filtrar carpetas…"
                    aria-label="Filtrar carpetas"
                    className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setReposOnly((on) => !on)}
                  aria-pressed={reposOnly}
                  className={`p-1.5 rounded-lg border text-[10px] cursor-pointer transition ${
                    reposOnly
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                      : 'border-[#202b3f] text-slate-400 hover:text-slate-200 hover:bg-[#162035]'
                  }`}
                  title="Mostrar solo repositorios git"
                >
                  <FolderGit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5 no-scrollbar">
                {visibleEntries.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-slate-500 font-mono text-center">
                    {listing.entries.length === 0 ? 'Sin subcarpetas' : 'Nada coincide'}
                  </div>
                )}
                {visibleEntries.map((entry) => (
                  <div key={entry.path} className="flex items-center gap-1 rounded-lg hover:bg-[#162035] text-slate-300 hover:text-white transition">
                    <button
                      type="button"
                      onClick={() => browse(entry.path)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left text-[11px] cursor-pointer"
                      title={`Entrar a ${entry.path}`}
                    >
                      {entry.isGit ? <FolderGit2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      <span className="truncate">{entry.name}</span>
                      <ChevronRight className="w-3 h-3 text-slate-500 shrink-0 ml-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(entry.path)}
                      aria-pressed={favorites.includes(entry.path)}
                      className="p-1 rounded text-slate-500 hover:text-amber-300 cursor-pointer"
                      title={favorites.includes(entry.path) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    >
                      <Star className={`w-3 h-3 ${favorites.includes(entry.path) ? 'text-amber-400 fill-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectDir(entry.path)}
                      className="p-1 mr-1 rounded text-slate-400 hover:text-cyan-300 cursor-pointer"
                      title="Seleccionar esta carpeta como proyecto"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentDirs.length > 0 && (
            <div className="space-y-1 pt-1.5 border-t border-[#202b3f]">
              <span className="text-[10px] uppercase font-mono font-semibold text-slate-400 tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                Proyectos Recientes
              </span>
              <div className="max-h-40 overflow-y-auto space-y-0.5 no-scrollbar">
                {recentDirs.map((dir) => {
                  const isCurrent = currentDir && dir.toLowerCase() === currentDir.toLowerCase();
                  const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => selectDir(dir)}
                      className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer text-[11px] ${
                        isCurrent
                          ? 'bg-[#0c1220] text-cyan-300 font-semibold border border-cyan-500/30'
                          : 'hover:bg-[#162035] text-slate-300 hover:text-white'
                      }`}
                      title={dir}
                    >
                      <div className="truncate">
                        <div className="font-medium truncate">{name}</div>
                        <div className="text-[9px] font-mono text-slate-500 truncate">{dir}</div>
                      </div>
                      {isCurrent && <Check className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
