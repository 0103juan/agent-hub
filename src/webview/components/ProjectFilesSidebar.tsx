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
        return 'text-zinc-400 bg-zinc-800 border-zinc-700';
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
    <aside className="w-72 shrink-0 max-[560px]:absolute max-[560px]:inset-y-0 max-[560px]:left-0 max-[560px]:z-30 max-[560px]:w-[85%] max-[560px]:shadow-2xl border-r border-zinc-800 bg-zinc-950 flex flex-col h-full text-xs">
      {/* Header */}
      <div className="p-2 border-b border-zinc-800 flex items-center justify-between gap-1.5 shrink-0 bg-zinc-900/50">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('git')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
              activeTab === 'git'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <GitCompare className="w-3 h-3" />
            <span>Git ({gitFiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tree')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
              activeTab === 'tree'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
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
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Refrescar archivos del proyecto"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Ocultar panel lateral"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Buscador de archivos y contenido */}
      <div className="p-2 border-b border-zinc-850 shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
          <Search className="w-3 h-3 text-zinc-500 shrink-0" />
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
            className="w-full bg-transparent border-none text-[11px] text-zinc-200 focus:outline-none placeholder-zinc-500"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {activeTab === 'tree' && (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-500 text-[10px]">Modo:</span>
            <button
              type="button"
              onClick={() => setSearchMode('name')}
              className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                searchMode === 'name' ? 'bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40' : 'text-zinc-400 hover:text-zinc-200'
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
              className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                searchMode === 'content' ? 'bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              En Contenido (Grep)
            </button>
          </div>
        )}
      </div>

      {/* Lista de contenidos */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 no-scrollbar">
        {activeTab === 'git' ? (
          <>
            {/* Smart Triggers Git */}
            {gitFiles.length > 0 && (
              <div className="p-1.5 mb-1.5 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-1">
                <div className="text-[10px] font-semibold text-zinc-400 px-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Disparadores Inteligentes</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 px-1 pb-0.5 font-mono text-[10px]">
                  {(['M', 'A', 'D', '?'] as const).map((status) => {
                    const count = gitFiles.filter((item) => item.status === status).length;
                    return count > 0 && (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={statusFilter === status}
                        onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                        className={`px-1 rounded border cursor-pointer ${statusColor(status)} ${statusFilter === status ? 'ring-1 ring-white/50' : 'opacity-80 hover:opacity-100'}`}
                        title={`${statusLabel(status)}: ${statusFilter === status ? 'mostrar todos' : 'filtrar solo estos'}`}
                      >
                        {status} {count}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => gitFiles.filter((item) => item.status !== 'D').forEach((item) => postToHost({ command: 'attachFile', file: item.path }))}
                    className="ml-auto px-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
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
                    className="px-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
                    title="Copiar la lista de archivos cambiados"
                  >
                    {copiedList ? 'Copiada' : 'Copiar lista'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGitSort(gitSort === 'status' ? 'name' : 'status')}
                    className="flex items-center gap-0.5 px-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
                    title={`Ordenado por ${gitSort === 'status' ? 'estado' : 'nombre'}; clic para cambiar`}
                  >
                    <ListOrdered className="w-3 h-3" />
                    {gitSort === 'status' ? 'estado' : 'nombre'}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onGenerateCommit}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium transition cursor-pointer"
                    title="Generar mensaje de commit convencional según los cambios actuales"
                  >
                    <GitCommit className="w-3 h-3" />
                    <span>Auto Commit</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAuditBranch}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-purple-300 border border-purple-500/30 text-[10px] font-medium transition cursor-pointer"
                    title="Auditar diferencias y posibles riesgos de la rama con el agente"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Auditar Cambios</span>
                  </button>
                </div>
              </div>
            )}

            {filteredGit.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-[11px] space-y-1">
                <FileCheck2 className="w-6 h-6 mx-auto text-zinc-600" />
                <p>No hay cambios pendientes en Git</p>
              </div>
            ) : (
              filteredGit.map((item) => (
                <div
                  key={item.path}
                  className="group relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded hover:bg-zinc-900 transition"
                >
                  <div
                    className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
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
                    <span className="flex min-w-0 font-mono text-[11px] text-zinc-300 group-hover:text-zinc-100">
                      {item.path.includes('/') && <span className="truncate text-zinc-500">{item.path.slice(0, item.path.lastIndexOf('/') + 1)}</span>}
                      <span className="shrink-0">{item.path.slice(item.path.lastIndexOf('/') + 1)}</span>
                    </span>
                  </div>

                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded bg-zinc-900 pl-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => (onOpenDiff ? onOpenDiff(item.path) : onPreviewFile(item.path))}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
                      title="Comparar Diff interactivo"
                    >
                      <FileDiff className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPreviewFile(item.path)}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-cyan-300 transition"
                      title="Previsualizar archivo completo"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openInVsCode(workspaceDir ? `${workspaceDir.replace(/[\\/]$/, '')}/${item.path}` : item.path)}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-blue-300 transition"
                      title="Abrir en VS Code"
                    >
                      <Code2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => copyPath(item.path)}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                      title="Copiar la ruta"
                    >
                      {copiedPath === item.path ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => postToHost({ command: 'attachFile', file: item.path })}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 transition"
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
            <div className="text-center py-8 text-zinc-500 text-[11px] space-y-1">
              <Search className="w-6 h-6 mx-auto text-zinc-600" />
              <p>Sin coincidencias en el contenido</p>
            </div>
          ) : (
            contentResults.map((item, idx) => (
              <div
                key={`${item.file}-${item.line}-${idx}`}
                className="group p-1.5 rounded hover:bg-zinc-900 transition text-[11px] cursor-pointer border border-transparent hover:border-zinc-800"
                onClick={() => onPreviewFile(item.file, item.line)}
                title={`${item.file}:${item.line}\nClic para abrir previsualización`}
              >
                <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] mb-0.5">
                  <span className="truncate text-indigo-300 font-medium">{item.file}</span>
                  <span className="shrink-0 text-zinc-500 font-bold">L{item.line}</span>
                </div>
                <div className="font-mono text-[10.5px] text-zinc-300 truncate bg-zinc-950/70 px-1.5 py-0.5 rounded border border-zinc-850">
                  {item.text}
                </div>
              </div>
            ))
          )
        ) : filteredTree.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-[11px] space-y-1">
            <FolderOpen className="w-6 h-6 mx-auto text-zinc-600" />
            <p>No se encontraron archivos</p>
          </div>
        ) : (
          filteredTree.map((item) => (
            <div
              key={item.path}
              className="group flex items-center justify-between gap-1.5 px-2 py-1 rounded hover:bg-zinc-900 transition text-[11px]"
            >
              <div
                className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                onClick={() => !item.isDir && onPreviewFile(item.path)}
                title={item.path}
              >
                {item.isDir ? (
                  <Folder className="w-3 h-3 text-indigo-400 shrink-0" />
                ) : (
                  <FileCode className="w-3 h-3 text-zinc-400 shrink-0" />
                )}
                <span
                  className={`truncate font-mono ${
                    item.isDir ? 'text-zinc-300 font-semibold' : 'text-zinc-400 group-hover:text-zinc-100'
                  }`}
                >
                  {item.name}
                </span>
              </div>

              {!item.isDir && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewFile(item.path)}
                    className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300"
                    title="Previsualizar"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyPath(item.path)}
                    className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    title="Copiar la ruta"
                  >
                    {copiedPath === item.path ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => postToHost({ command: 'attachFile', file: item.path })}
                    className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300"
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
