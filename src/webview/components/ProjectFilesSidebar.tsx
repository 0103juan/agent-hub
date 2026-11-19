import React, { useState, useEffect } from 'react';
import { FileCode, Folder, FolderOpen, GitBranch, GitCompare, Eye, Plus, Search, ChevronRight, ChevronDown, RefreshCw, X, FileCheck2, FilePlus, FileDiff, Sparkles, ShieldCheck, GitCommit, Copy, Check, Code2, ListOrdered } from 'lucide-react';
import { openInVsCode, postToHost } from '../vscode-api';
import { normalizeText } from '../../shared/workspace-actions';

export interface GitFileItem {
  path: string;
  status: 'M' | 'A' | 'D' | '?' | 'R';
}

export interface TreeItem {
  path: string;
  name: string;
  isDir: boolean;
}

export interface ContentSearchResult {
  file: string;
  line: number;
  text: string;
}

const getFileColor = (name: string) => {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'text-cyan-400';
    case '.js':
    case '.jsx':
      return 'text-amber-400';
    case '.json':
    case '.yaml':
    case '.yml':
      return 'text-amber-300';
    case '.css':
    case '.scss':
      return 'text-rose-400';
    case '.md':
      return 'text-emerald-400';
    case '.svg':
    case '.png':
    case '.ico':
      return 'text-violet-400';
    default:
      return 'text-slate-400';
  }
};

interface Props {
  workspaceDir?: string;
  gitFiles: GitFileItem[];
  projectTree: TreeItem[];
  contentResults?: ContentSearchResult[];
  isOpen: boolean;
  onToggle: () => void;
  onPreviewFile: (path: string, line?: number) => void;
  onOpenDiff?: (path: string) => void;
  onGenerateCommit?: () => void;
  onAuditBranch?: () => void;
  onSearchContent?: (query: string) => void;
}

export const ProjectFilesSidebar: React.FC<Props> = ({
  workspaceDir,
  gitFiles,
  projectTree,
  contentResults = [],
  isOpen,
  onToggle,
  onPreviewFile,
  onOpenDiff,
  onGenerateCommit,
  onAuditBranch,
  onSearchContent
}) => {
  const [activeTab, setActiveTabState] = useState<'git' | 'tree'>(() => (localStorage.getItem('agent-hub.filesTab') === 'tree' ? 'tree' : 'git'));
  const setActiveTab = (tab: 'git' | 'tree') => {
    localStorage.setItem('agent-hub.filesTab', tab);
    setActiveTabState(tab);
  };
  const [statusFilter, setStatusFilter] = useState<GitFileItem['status'] | null>(null);
  const [gitSort, setGitSort] = useState<'status' | 'name'>('status');
  const [copiedList, setCopiedList] = useState(false);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [copiedPath, setCopiedPath] = useState<string>();
  const copyPath = async (file: string) => {
    try {
      await navigator.clipboard.writeText(file);
      setCopiedPath(file);
      setTimeout(() => setCopiedPath(undefined), 1500);
    } catch {}
  };

  useEffect(() => {
    if (searchMode === 'content' && activeTab === 'tree' && search.trim().length >= 2) {
      const timer = setTimeout(() => {
        onSearchContent?.(search.trim());
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [search, searchMode, activeTab, onSearchContent]);

  if (!isOpen) return null;

  const filteredGit = gitFiles.filter((item) =>
    normalizeText(item.path).includes(normalizeText(search)) && (!statusFilter || item.status === statusFilter)
  ).sort((a, b) => (gitSort === 'name' ? a.path.localeCompare(b.path) : 'MADR?'.indexOf(a.status) - 'MADR?'.indexOf(b.status) || a.path.localeCompare(b.path)));
  const filteredTree = projectTree.filter((item) =>
    normalizeText(item.path).includes(normalizeText(search))
  );

  const statusColor = (status: GitFileItem['status']) => {
    switch (status) {
      case 'M':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'A':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'D':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case '?':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      default:
        return 'text-slate-400 bg-[#162035] border-[#202b3f]';
    }
  };

  const statusLabel = (status: GitFileItem['status']) => {
    switch (status) {
      case 'M':
        return 'Modificado';
      case 'A':
        return 'Añadido';
      case 'D':
        return 'Eliminado';
      case '?':
        return 'Sin rastrear';
      default:
        return status;
    }
  };

  return (
    <aside className="w-80 shrink-0 max-[560px]:absolute max-[560px]:inset-y-0 max-[560px]:left-0 max-[560px]:z-30 max-[560px]:w-[85%] max-[560px]:shadow-2xl border-r border-[#202b3f] bg-[#07090e] flex flex-col h-full text-xs">
      {/* Header */}
      <div className="p-2.5 border-b border-[#202b3f] flex items-center justify-between gap-1.5 shrink-0 bg-[#0a0e17]/95 backdrop-blur-md">
        <div className="flex items-center gap-1 bg-[#0c1220] p-0.5 rounded-lg border border-[#202b3f]">
          <button
            type="button"
            onClick={() => setActiveTab('git')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
              activeTab === 'git'
                ? 'bg-cyan-600 text-slate-950 font-bold shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCompare className="w-3 h-3" />
            <span>Git ({gitFiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tree')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
              activeTab === 'tree'
                ? 'bg-cyan-600 text-slate-950 font-bold shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3 h-3" />
            <span>Archivos ({projectTree.filter((item) => !item.isDir).length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => postToHost({ command: 'getWorkspaceOverview' })}
            className="p-1.5 rounded-lg hover:bg-[#162035] text-slate-400 hover:text-slate-200 transition"
            title="Refrescar archivos del proyecto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-[#162035] text-slate-400 hover:text-slate-200 transition"
            title="Ocultar panel lateral"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Buscador de archivos y contenido */}
      <div className="p-2.5 border-b border-[#162035] shrink-0 space-y-2 bg-[#0a0e17]/50">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0c1220] border border-[#202b3f] text-slate-300 focus-within:border-cyan-500/70 shadow-inner">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder={
              activeTab === 'git'
                ? 'Filtrar cambios...'
                : searchMode === 'content'
                ? 'Buscar en contenido de archivos...'
                : 'Buscar por nombre...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            className="w-full bg-transparent border-none text-[11px] text-slate-100 focus:outline-none placeholder-slate-500 font-sans"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-200">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {activeTab === 'tree' && (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-500 text-[10px]">Modo:</span>
            <button
              type="button"
              onClick={() => setSearchMode('name')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                searchMode === 'name' ? 'bg-cyan-950/40 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Nombre
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchMode('content');
                if (search.trim().length >= 2) onSearchContent?.(search.trim());
              }}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                searchMode === 'content' ? 'bg-cyan-950/40 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              En Contenido (Grep)
            </button>
          </div>
        )}
      </div>

      {/* Lista de contenidos */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
        {activeTab === 'git' ? (
          <>
            {/* Smart Triggers Git */}
            {gitFiles.length > 0 && (
              <div className="p-2.5 mb-2 bg-[#0c1220] rounded-xl border border-[#202b3f] space-y-2 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Disparadores Inteligentes</span>
                  </span>
                  <span className="font-mono text-slate-400 text-[10px]">{gitFiles.length} cambios</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                  {(['M', 'A', 'D', '?'] as const).map((status) => {
                    const count = gitFiles.filter((item) => item.status === status).length;
                    return count > 0 && (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={statusFilter === status}
                        onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                        className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer transition ${statusColor(status)} ${statusFilter === status ? 'ring-1 ring-white/60 shadow-sm' : 'opacity-85 hover:opacity-100'}`}
                        title={`${statusLabel(status)}: ${statusFilter === status ? 'mostrar todos' : 'filtrar solo estos'}`}
                      >
                        {status} {count}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => gitFiles.filter((item) => item.status !== 'D').forEach((item) => postToHost({ command: 'attachFile', file: item.path }))}
                    className="ml-auto px-2 py-0.5 rounded-md bg-[#0a0e17] hover:bg-[#162035] text-slate-300 border border-[#202b3f] cursor-pointer font-sans text-[10px]"
                    title="Adjuntar al chat todos los archivos cambiados"
                  >
                    Adjuntar todos
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(filteredGit.map((item) => `${item.status} ${item.path}`).join('\n'));
                        setCopiedList(true);
                        setTimeout(() => setCopiedList(false), 1500);
                      } catch {}
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#0a0e17] hover:bg-[#162035] text-slate-300 border border-[#202b3f] cursor-pointer font-sans text-[10px]"
                    title="Copiar la lista de archivos cambiados"
                  >
                    {copiedList ? 'Copiada' : 'Copiar lista'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGitSort(gitSort === 'status' ? 'name' : 'status')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0a0e17] hover:bg-[#162035] text-slate-300 border border-[#202b3f] cursor-pointer font-sans text-[10px]"
                    title={`Ordenado por ${gitSort === 'status' ? 'estado' : 'nombre'}; clic para cambiar`}
                  >
                    <ListOrdered className="w-3 h-3" />
                    <span>{gitSort === 'status' ? 'estado' : 'nombre'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#162035]">
                  <button
                    type="button"
                    onClick={onGenerateCommit}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition cursor-pointer shadow-xs"
                    title="Generar mensaje de commit convencional según los cambios actuales"
                  >
                    <GitCommit className="w-3.5 h-3.5" />
                    <span>Auto Commit</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAuditBranch}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px] font-bold transition cursor-pointer shadow-xs"
                    title="Auditar diferencias y posibles riesgos de la rama con el agente"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Auditar Cambios</span>
                  </button>
                </div>
              </div>
            )}

            {filteredGit.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-[11px] space-y-1">
                <FileCheck2 className="w-6 h-6 mx-auto text-slate-600" />
                <p>No hay cambios pendientes en Git</p>
              </div>
            ) : (
              filteredGit.map((item) => (
                <div
                  key={item.path}
                  className="group relative flex items-center justify-between gap-1.5 p-2 rounded-xl bg-[#0a0e17]/70 hover:bg-[#0c1220] border border-transparent hover:border-[#202b3f] transition-all duration-150 shadow-xs"
                >
                  <div
                    className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                    onClick={() => (onOpenDiff ? onOpenDiff(item.path) : onPreviewFile(item.path))}
                    title={`${item.path} (${statusLabel(item.status)})\nClic para ver Diff interactivo`}
                  >
                    <span
                      className={`w-4 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center shrink-0 border ${statusColor(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                    <span className="flex min-w-0 font-mono text-[11px] text-slate-300 group-hover:text-slate-100">
                      {item.path.includes('/') && <span className="truncate text-slate-500">{item.path.slice(0, item.path.lastIndexOf('/') + 1)}</span>}
                      <span className="shrink-0 font-semibold">{item.path.slice(item.path.lastIndexOf('/') + 1)}</span>
                    </span>
                  </div>

                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-lg bg-[#0c1220] border border-[#202b3f] p-0.5 shadow-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => (onOpenDiff ? onOpenDiff(item.path) : onPreviewFile(item.path))}
                      className="p-1 rounded-md hover:bg-[#162035] text-slate-400 hover:text-cyan-400 transition"
                      title="Comparar Diff interactivo"
                    >
                      <FileDiff className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPreviewFile(item.path)}
                      className="p-1 rounded-md hover:bg-[#162035] text-slate-400 hover:text-cyan-400 transition"
                      title="Previsualizar archivo completo"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openInVsCode(workspaceDir ? `${workspaceDir.replace(/[\\/]$/, '')}/${item.path}` : item.path)}
                      className="p-1 rounded-md hover:bg-[#162035] text-slate-400 hover:text-blue-400 transition"
                      title="Abrir en VS Code"
                    >
                      <Code2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => copyPath(item.path)}
                      className="p-1 rounded-md hover:bg-[#162035] text-slate-400 hover:text-slate-200 transition"
                      title="Copiar la ruta"
                    >
                      {copiedPath === item.path ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => postToHost({ command: 'attachFile', file: item.path })}
                      className="p-1 rounded-md hover:bg-[#162035] text-slate-400 hover:text-emerald-400 transition"
                      title="Adjuntar al chat (@)"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        ) : searchMode === 'content' && search.trim().length >= 2 ? (
          contentResults.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-[11px] space-y-1">
              <Search className="w-6 h-6 mx-auto text-slate-600" />
              <p>Sin coincidencias en el contenido</p>
            </div>
          ) : (
            contentResults.map((item, idx) => (
              <div
                key={`${item.file}-${item.line}-${idx}`}
                className="group p-1.5 rounded hover:bg-[#162035] transition text-[11px] cursor-pointer border border-transparent hover:border-[#202b3f]"
                onClick={() => onPreviewFile(item.file, item.line)}
                title={`${item.file}:${item.line}\nClic para abrir previsualización`}
              >
                <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] mb-0.5">
                  <span className="truncate text-cyan-300 font-medium">{item.file}</span>
                  <span className="shrink-0 text-slate-500 font-bold">L{item.line}</span>
                </div>
                <div className="font-mono text-[10.5px] text-slate-300 truncate bg-[#07090e] px-1.5 py-0.5 rounded border border-[#202b3f]">
                  {item.text}
                </div>
              </div>
            ))
          )
        ) : filteredTree.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-[11px] space-y-1">
            <FolderOpen className="w-6 h-6 mx-auto text-slate-600" />
            <p>No se encontraron archivos</p>
          </div>
        ) : (
          filteredTree.map((item) => (
            <div
              key={item.path}
              className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#0c1220] border border-transparent hover:border-[#202b3f] transition text-[11px]"
            >
              <div
                className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                onClick={() => !item.isDir && onPreviewFile(item.path)}
                title={item.path}
              >
                {item.isDir ? (
                  <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                ) : (
                  <FileCode className={`w-3.5 h-3.5 shrink-0 ${getFileColor(item.name)}`} />
                )}
                <span
                  className={`truncate font-mono ${
                    item.isDir ? 'text-slate-200 font-semibold' : 'text-slate-300 group-hover:text-slate-100'
                  }`}
                >
                  {item.name}
                </span>
              </div>

              {!item.isDir && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0 bg-[#0a0e17] border border-[#202b3f] p-0.5 rounded-md shadow-xs">
                  <button
                    type="button"
                    onClick={() => onPreviewFile(item.path)}
                    className="p-1 rounded hover:bg-[#162035] text-slate-400 hover:text-cyan-400"
                    title="Previsualizar"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyPath(item.path)}
                    className="p-1 rounded hover:bg-[#162035] text-slate-400 hover:text-slate-200"
                    title="Copiar la ruta"
                  >
                    {copiedPath === item.path ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => postToHost({ command: 'attachFile', file: item.path })}
                    className="p-1 rounded hover:bg-[#162035] text-slate-400 hover:text-emerald-400"
                    title="Adjuntar al chat"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
