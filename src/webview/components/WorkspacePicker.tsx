import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderGit2, FolderOpen, ExternalLink, Code2, Check, Clock, ChevronDown } from 'lucide-react';
import { postToHost, openInVsCode } from '../vscode-api';

export interface WorkspacePickerProps {
  currentDir?: string;
  recentDirs: string[];
}

export const WorkspacePicker: React.FC<WorkspacePickerProps> = ({ currentDir, recentDirs }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    postToHost({ command: 'setWorkspaceDir', dir });
    setOpen(false);
  };

  const chooseDir = () => {
    postToHost({ command: 'chooseWorkspaceDir' });
    setOpen(false);
  };

  const openInExplorer = () => {
    postToHost({ command: 'openFolderInExplorer', dir: currentDir });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer max-w-[180px] sm:max-w-[220px]"
        title={`Proyecto actual: ${currentDir ?? 'Sin carpeta asignada'}\nClic para cambiar de carpeta o ver proyectos recientes`}
      >
        <FolderGit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="truncate font-mono text-[11px] font-semibold">{folderName}</span>
        <ChevronDown className="w-2.5 h-2.5 text-zinc-500 shrink-0 ml-auto" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 p-2 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-2 text-xs animate-message-fade">
          <div className="space-y-0.5 pb-1 border-b border-zinc-800">
            <span className="text-[10px] uppercase font-mono font-semibold text-zinc-400 tracking-wider">Espacio de Trabajo Activo</span>
            <div className="text-[11px] font-mono text-zinc-200 break-all p-1.5 rounded bg-zinc-950 border border-zinc-850">
              {currentDir ?? 'Ninguno (Modo global)'}
            </div>
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={chooseDir}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 transition text-left cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-medium text-xs">Abrir otra carpeta...</span>
            </button>

            {currentDir && (
              <div className="grid grid-cols-2 gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={openInExplorer}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 text-[11px] transition text-left cursor-pointer"
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
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 text-[11px] transition text-left cursor-pointer"
                  title="Abrir este repositorio en VS Code"
                >
                  <Code2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>VS Code</span>
                </button>
              </div>
            )}
          </div>

          {recentDirs.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-zinc-800">
              <span className="text-[10px] uppercase font-mono font-semibold text-zinc-400 tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-400" />
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
                      className={`w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded text-left transition cursor-pointer text-[11px] ${
                        isCurrent
                          ? 'bg-zinc-800 text-indigo-300 font-semibold border border-indigo-500/20'
                          : 'hover:bg-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                      title={dir}
                    >
                      <div className="truncate">
                        <div className="font-medium truncate">{name}</div>
                        <div className="text-[9px] font-mono text-zinc-400 truncate">{dir}</div>
                      </div>
                      {isCurrent && <Check className="w-3 h-3 text-indigo-400 shrink-0 ml-1" />}
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
