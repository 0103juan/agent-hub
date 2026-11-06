import React, { useEffect, useState } from 'react';
import { ArchivedSessionInfo, ConversationSession, ProtocolRole, SearchHit } from '../../shared/types';
import { postToHost } from '../vscode-api';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import {
  Plus,
  MessageSquare,
  Trash2,
  Clock,
  Check,
  FolderGit2,
  Tag,
  Search,
  Filter,
  Layers,
  ChevronDown,
  ChevronRight,
  Pencil,
  X
} from 'lucide-react';

interface Props {
  sessions: ConversationSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateSession: (projectName?: string, taskSlug?: string, role?: ProtocolRole) => void;
  onDeleteSession: (id: string) => void;
  onMoveSession: (id: string, projectName?: string) => void;
  onRenameProject: (from: string, to: string) => void;
  onDeleteProject: (projectName: string) => void;
  onClose: () => void;
  startWithNewTask?: boolean;
  searchHits: SearchHit[];
  searchQuery: string;
  archive: ArchivedSessionInfo[];
}

const MESSAGE_SEARCH_MIN_CHARS = 2;
const MESSAGE_SEARCH_DELAY_MS = 250;

const UNASSIGNED = 'Sin proyecto';
const NEW_PROJECT = '__nuevo__';
const MANY_PROJECTS = 4;

export const SessionDrawer: React.FC<Props> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onMoveSession,
  onRenameProject,
  onDeleteProject,
  onClose,
  startWithNewTask = false,
  searchHits,
  searchQuery: hitsQuery,
  archive
}) => {
  const [showArchive, setShowArchive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  // Con muchos proyectos solo queda abierto el de la conversación activa.
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>(() => {
    const names = new Set(sessions.map((s) => s.projectName || UNASSIGNED));
    if (names.size <= MANY_PROJECTS) return {};
    const active = sessions.find((s) => s.id === activeSessionId)?.projectName || UNASSIGNED;
    return Object.fromEntries([...names].filter((name) => name !== active).map((name) => [name, true]));
  });
  const [addingTo, setAddingTo] = useState<{ project: string; slug: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Formulario rápido para nueva tarea/sesión
  const [showNewTaskForm, setShowNewTaskForm] = useState(startWithNewTask);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectText, setNewProjectText] = useState('');
  const [newTaskSlug, setNewTaskSlug] = useState('');
  const [newRole, setNewRole] = useState<ProtocolRole | ''>('');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  // Busca dentro de los mensajes tras una pausa al teclear.
  const trimmedQuery = searchQuery.trim();
  useEffect(() => {
    if (trimmedQuery.length < MESSAGE_SEARCH_MIN_CHARS) return;
    const timer = setTimeout(() => postToHost({ command: 'searchSessions', query: trimmedQuery }), MESSAGE_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);
  const messageHits = trimmedQuery.length >= MESSAGE_SEARCH_MIN_CHARS && hitsQuery === trimmedQuery ? searchHits : [];

  // Extraer lista de proyectos únicos
  const availableProjects = Array.from(new Set(sessions.map((s) => s.projectName || UNASSIGNED)));
  const namedProjects = availableProjects.filter((name) => name !== UNASSIGNED);

  // Filtrar sesiones
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      searchQuery === '' ||
      (s.title && s.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.taskSlug && s.taskSlug.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.projectName && s.projectName.toLowerCase().includes(searchQuery.toLowerCase()));

    const currentProject = s.projectName || UNASSIGNED;
    const matchesProject =
      selectedProjectFilter === 'all' || currentProject === selectedProjectFilter;

    return matchesSearch && matchesProject;
  });

  // Agrupar sesiones por Proyecto -> Tarea
  const groupedByProject: Record<string, ConversationSession[]> = {};
  for (const s of filteredSessions) {
    const proj = s.projectName || UNASSIGNED;
    if (!groupedByProject[proj]) groupedByProject[proj] = [];
    groupedByProject[proj].push(s);
  }

  const latest = (list: ConversationSession[]) => Math.max(...list.map((s) => s.updatedAt ?? 0));
  const orderedProjects = Object.entries(groupedByProject).sort(([a, listA], [b, listB]) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : latest(listB) - latest(listA)
  );
  const searching = searchQuery !== '';
  const allCollapsed = orderedProjects.every(([name]) => collapsedProjects[name]);
  const setAllCollapsed = (collapsed: boolean) =>
    setCollapsedProjects(Object.fromEntries(availableProjects.map((name) => [name, collapsed])));

  const submitInlineTask = () => {
    if (!addingTo) return;
    onCreateSession(addingTo.project === UNASSIGNED ? undefined : addingTo.project, addingTo.slug.trim() || undefined);
    setAddingTo(null);
    onClose();
  };

  const toggleProjectCollapse = (proj: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [proj]: !prev[proj] }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateSession(
      (newProjectName === NEW_PROJECT ? newProjectText : newProjectName).trim() || undefined,
      newTaskSlug.trim() || undefined,
      (newRole as ProtocolRole) || undefined
    );
    setNewProjectName('');
    setNewProjectText('');
    setNewTaskSlug('');
    setNewRole('');
    setShowNewTaskForm(false);
    onClose();
  };

  const drawerContent = (
    <div
      className="h-full flex flex-col space-y-3 w-96 max-w-[90vw] bg-zinc-900 border-r border-zinc-800 p-3 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Historial y tareas</span>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* Action Button: Nueva tarea */}
        {!showNewTaskForm ? (
          <button
            onClick={() => setShowNewTaskForm(true)}
            className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva tarea</span>
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="p-2.5 bg-zinc-800/80 border border-zinc-700 rounded-lg space-y-2 text-xs">
            <div className="font-semibold text-zinc-200 text-[11px] flex items-center justify-between">
              <span>Organizar nueva tarea</span>
              <button
                type="button"
                onClick={() => setShowNewTaskForm(false)}
                className="text-zinc-400 hover:text-zinc-200 text-[11px]"
              >
                Cancelar
              </button>
            </div>

            <div className="space-y-1.5">
              <select
                aria-label="Proyecto"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-indigo-500"
              >
                <option value="">Carpeta abierta (por defecto)</option>
                {namedProjects.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value={NEW_PROJECT}>+ Nuevo proyecto…</option>
              </select>
              {newProjectName === NEW_PROJECT && (
                <input
                  type="text"
                  autoFocus
                  placeholder="Nombre del proyecto (ej: portafolio, finesa)"
                  value={newProjectText}
                  onChange={(e) => setNewProjectText(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            <div>
              <input
                type="text"
                placeholder="Tarea / Slug (ej: feat-auth, bug-secop)"
                value={newTaskSlug}
                onChange={(e) => setNewTaskSlug(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as ProtocolRole)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-indigo-500"
              >
                <option value="">Sin rol inicial (libre)</option>
                {Object.values(PROTOCOL_ROLES).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} - {r.description.substring(0, 35)}...
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-[11px] transition"
            >
              Iniciar tarea
            </button>
          </form>
        )}

        {/* Search & Project Filter Bar */}
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Buscar tareas, chats o proyectos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 bg-zinc-800/60 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-700"
            />
          </div>

          {availableProjects.length > 1 && (
            <div className="flex items-center gap-1 py-0.5 text-[11px] overflow-x-auto whitespace-nowrap pb-1">
              <button
                type="button"
                onClick={() => setAllCollapsed(!allCollapsed)}
                title={allCollapsed ? 'Expandir todos los proyectos' : 'Colapsar todos los proyectos'}
                aria-label={allCollapsed ? 'Expandir todos' : 'Colapsar todos'}
                className="p-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"
              >
                {allCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setSelectedProjectFilter('all')}
                className={`px-1.5 py-0.5 rounded transition shrink-0 ${
                  selectedProjectFilter === 'all'
                    ? 'bg-zinc-800 text-zinc-200 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todos
              </button>
              {availableProjects.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProjectFilter(p)}
                  className={`px-1.5 py-0.5 rounded transition shrink-0 ${
                    selectedProjectFilter === p
                      ? 'bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {messageHits.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto shrink-0">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">En mensajes</div>
            {messageHits.map((hit, index) => (
              <button
                key={`${hit.sessionId}-${index}`}
                type="button"
                onClick={() => {
                  onSelectSession(hit.sessionId);
                  onClose();
                }}
                className="w-full text-left p-1.5 rounded hover:bg-zinc-800/50 border border-zinc-800/60"
              >
                <span className="block truncate text-[11px] font-medium text-zinc-200">{hit.title || 'Conversación'}</span>
                <span className="block truncate text-[11px] text-zinc-400">{hit.snippet}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sessions Grouped by Project */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {Object.keys(groupedByProject).length === 0 ? (
            <div className="text-center p-6 text-zinc-400 text-xs">
              No hay sesiones que coincidan con la búsqueda.
            </div>
          ) : (
            orderedProjects.map(([projectName, pSessions]) => {
              const isCollapsed = collapsedProjects[projectName] && !searching;
              return (
                <div
                  key={projectName}
                  className={`space-y-1 rounded ${dropTarget === projectName ? 'ring-1 ring-indigo-500 bg-indigo-500/10' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTarget(projectName);
                  }}
                  onDragLeave={() => setDropTarget((current) => (current === projectName ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropTarget(null);
                    const sessionId = event.dataTransfer.getData('text/plain');
                    if (sessionId) onMoveSession(sessionId, projectName === UNASSIGNED ? undefined : projectName);
                  }}
                >
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 p-1 rounded hover:bg-zinc-800/40 select-none">
                    {renaming?.from === projectName ? (
                      <input
                        autoFocus
                        aria-label="Nuevo nombre del proyecto"
                        value={renaming.to}
                        onChange={(e) => setRenaming({ from: projectName, to: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onRenameProject(projectName, renaming.to);
                            setRenaming(null);
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            setRenaming(null);
                          }
                        }}
                        onBlur={() => setRenaming(null)}
                        className="flex-1 min-w-0 bg-zinc-900 border border-indigo-500 rounded px-1.5 py-0.5 text-zinc-200 text-[11px] focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleProjectCollapse(projectName)}
                        className="flex-1 min-w-0 flex items-center gap-1.5 text-left hover:text-zinc-200"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        )}
                        <FolderGit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">{projectName}</span>
                      </button>
                    )}
                    <span className="text-[11px] text-zinc-400 font-mono px-1 rounded bg-zinc-800/80 shrink-0">
                      {pSessions.length}
                    </span>
                    {renaming?.from !== projectName && pendingDeleteProject !== projectName && (
                      <button
                        type="button"
                        aria-label={`Nueva tarea en ${projectName}`}
                        title={projectName === UNASSIGNED ? 'Nueva tarea' : `Nueva tarea en ${projectName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedProjects((prev) => ({ ...prev, [projectName]: false }));
                          setAddingTo({ project: projectName, slug: '' });
                        }}
                        className="text-zinc-400 hover:text-emerald-400 transition shrink-0 p-0.5 rounded hover:bg-zinc-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {projectName !== UNASSIGNED && renaming?.from !== projectName && (
                      pendingDeleteProject === projectName ? (
                        <>
                          <span className="text-[11px] text-red-300 shrink-0">¿Con sus {pSessions.length}?</span>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteProject(projectName);
                              setPendingDeleteProject(null);
                            }}
                            className="text-[11px] px-1.5 bg-red-700 hover:bg-red-600 text-white rounded transition shrink-0"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            aria-label="Cancelar"
                            onClick={() => setPendingDeleteProject(null)}
                            className="text-zinc-400 hover:text-zinc-200 shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Renombrar ${projectName}`}
                            title="Renombrar proyecto"
                            onClick={() => setRenaming({ from: projectName, to: projectName })}
                            className="text-zinc-400 hover:text-indigo-300 transition shrink-0"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar ${projectName}`}
                            title="Eliminar proyecto y sus conversaciones"
                            onClick={() => setPendingDeleteProject(projectName)}
                            className="text-zinc-400 hover:text-red-400 transition shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )
                    )}
                  </div>

                  {addingTo?.project === projectName && (
                    <input
                      autoFocus
                      aria-label={`Nombre de la nueva tarea en ${projectName}`}
                      placeholder="Nombre de la tarea (Enter para crear)"
                      value={addingTo.slug}
                      onChange={(e) => setAddingTo({ project: projectName, slug: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitInlineTask();
                        else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setAddingTo(null);
                        }
                      }}
                      onBlur={() => setAddingTo(null)}
                      className="w-[calc(100%-1rem)] ml-2 bg-zinc-900 border border-emerald-500 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none"
                    />
                  )}

                  {/* Tasks / Sessions in this Project */}
                  {!isCollapsed && (
                    <div className="space-y-1 pl-2 border-l border-zinc-800/80 ml-2">
                      {pSessions.map((s) => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', s.id);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDropTarget(null)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition cursor-grab active:cursor-grabbing ${
                            s.id === activeSessionId
                              ? 'bg-zinc-800 text-indigo-300 font-medium border border-zinc-700'
                              : 'hover:bg-zinc-800/50 text-zinc-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSession(s.id);
                              onClose();
                            }}
                            className="flex-1 min-w-0 flex items-center gap-2 mr-2 text-left"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="block min-w-0">
                              <span className="truncate text-[11px] flex items-center gap-1">
                                <span className="truncate">{s.title || 'Conversación'}</span>
                                {s.taskSlug && (
                                  <span className="text-[11px] px-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono shrink-0">
                                    #{s.taskSlug}
                                  </span>
                                )}
                              </span>
                              <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1 truncate">
                                <span className="truncate">{s.modelId}</span>
                                {s.protocolRole && (
                                  <>
                                    <span>•</span>
                                    <span className="text-purple-400 uppercase font-semibold">
                                      {PROTOCOL_ROLES[s.protocolRole]?.label ?? s.protocolRole}
                                    </span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="shrink-0">{s.messageCount ?? s.messages.length} msgs</span>
                              </span>
                            </span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            {s.id === activeSessionId && (
                              <Check className="w-3.5 h-3.5 text-indigo-400" />
                            )}

                            {sessions.length > 1 && (pendingDeleteId === s.id ? (
                              <>
                                <span className="text-[11px] text-red-300">¿Eliminar?</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteSession(s.id);
                                    setPendingDeleteId(null);
                                  }}
                                  className="text-[11px] px-1.5 bg-red-700 hover:bg-red-600 text-white rounded transition"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancelar"
                                  onClick={() => setPendingDeleteId(null)}
                                  className="flex items-center justify-center text-zinc-400 hover:text-zinc-200 rounded transition"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(s.id)}
                                className="flex items-center justify-center hover:text-red-400 text-zinc-400 rounded transition"
                                aria-label={`Eliminar ${s.title || 'conversación'}`}
                                title="Eliminar conversación"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 pt-2">
          <button
            type="button"
            onClick={() => {
              if (!showArchive) postToHost({ command: 'listArchive' });
              setShowArchive(!showArchive);
            }}
            aria-expanded={showArchive}
            className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 uppercase tracking-wide"
          >
            {showArchive ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Archivadas
          </button>
          {showArchive && (
            <ul className="mt-1 max-h-40 overflow-y-auto space-y-1">
              {archive.length === 0 && <li className="text-[11px] text-zinc-400 p-1">No hay conversaciones archivadas.</li>}
              {archive.map((item) => (
                <li key={item.id} className="flex items-center gap-2 p-1.5 rounded border border-zinc-800/60 text-[11px]">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium text-zinc-200">{item.title || 'Conversación'}</span>
                    <span className="block text-zinc-400">{new Date(item.updatedAt).toLocaleString()}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => postToHost({ command: 'restoreSession', sessionId: item.id })}
                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-indigo-300 border border-zinc-700 transition shrink-0"
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );

    return (
      <div className="fixed inset-0 bg-black/70 flex z-40">
        {drawerContent}
        <div className="flex-1" onClick={onClose} />
      </div>
    );
  };
