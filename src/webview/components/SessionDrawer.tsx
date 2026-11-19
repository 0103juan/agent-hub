import React, { useEffect, useState } from 'react';
import { ArchivedSessionInfo, ConversationSession, ProtocolRole, SearchHit } from '../../shared/types';
import { agentLabel, groupByFlow } from '../../shared/flows';
import { formatFull, relativeTime } from '../utils/format';
import { postToHost } from '../vscode-api';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { ROLE_COLORS } from './SquadCanvas';
import { normalizeText } from '../../shared/workspace-actions';
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
  Star,
  X
} from 'lucide-react';

const FAVORITE_SESSIONS_KEY = 'agent-hub.favoriteSessions';

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
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'messages'>('recent');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITE_SESSIONS_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const toggleFavorite = (id: string) =>
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        localStorage.setItem(FAVORITE_SESSIONS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const [confirmClearEmpty, setConfirmClearEmpty] = useState(false);
  // Conversaciones sin un solo mensaje (y que no son la activa): se pueden borrar de una vez.
  const emptySessions = sessions.filter((s) => (s.messageCount ?? s.messages.length) === 0 && s.id !== activeSessionId);
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
      (s.title && normalizeText(s.title).includes(normalizeText(searchQuery))) ||
      (s.taskSlug && normalizeText(s.taskSlug).includes(normalizeText(searchQuery))) ||
      (s.projectName && normalizeText(s.projectName).includes(normalizeText(searchQuery)));

    const currentProject = s.projectName || UNASSIGNED;
    const matchesProject =
      selectedProjectFilter === 'all' || currentProject === selectedProjectFilter;

    return matchesSearch && matchesProject;
  }).sort((a, b) =>
    Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) ||
    (sortBy === 'name'
      ? (a.title || '').localeCompare(b.title || '')
      : sortBy === 'messages'
        ? (b.messageCount ?? b.messages.length) - (a.messageCount ?? a.messages.length)
        : (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  );

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
      className="h-full flex flex-col space-y-3 w-96 max-w-[90vw] bg-[#0a0e17]/98 border-r border-[#202b3f] p-3.5 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#202b3f]">
        <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Historial y Flujos</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-[#0c1220] border border-[#202b3f] text-slate-400">({sessions.length})</span>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-[#162035] text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* Action Button: Nueva tarea */}
        {!showNewTaskForm ? (
          <button
            onClick={() => setShowNewTaskForm(true)}
            className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva tarea</span>
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="p-3 bg-[#0a0e17] border border-[#202b3f] rounded-xl space-y-2.5 text-xs shadow-lg">
            <div className="font-semibold text-slate-200 text-[11px] flex items-center justify-between">
              <span>Organizar nueva tarea</span>
              <button
                type="button"
                onClick={() => setShowNewTaskForm(false)}
                className="text-slate-400 hover:text-white text-[11px]"
              >
                Cancelar
              </button>
            </div>

            <div className="space-y-1.5">
              <select
                aria-label="Proyecto"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
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
                  className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
                />
              )}
            </div>

            <div>
              <input
                type="text"
                placeholder="Tarea / Slug (ej: feat-auth, bug-secop)"
                value={newTaskSlug}
                onChange={(e) => setNewTaskSlug(e.target.value)}
                className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>

            <div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as ProtocolRole)}
                className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
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
              className="w-full py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 rounded-lg font-bold text-[11px] transition shadow-md shadow-cyan-500/20 cursor-pointer"
            >
              Iniciar tarea
            </button>
          </form>
        )}

        {/* Search & Project Filter Bar */}
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar tareas, chats o proyectos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && searchQuery) {
                  e.stopPropagation();
                  setSearchQuery('');
                }
              }}
              className="w-full pl-8 pr-8 py-1.5 bg-[#07090e] border border-[#202b3f] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition"
            />
            {searchQuery && (
              <button type="button" aria-label="Borrar la búsqueda" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-500">Ordenar:</span>
            {([['recent', 'Recientes'], ['name', 'Nombre'], ['messages', 'Más largas']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sortBy === id}
                onClick={() => setSortBy(id)}
                className={`px-2 py-0.5 rounded-md transition ${sortBy === id ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1220]'}`}
              >
                {label}
              </button>
            ))}
            {searching && <span className="ml-auto font-mono text-[10px] text-slate-500">{filteredSessions.length} de {sessions.length}</span>}
          </div>
          {emptySessions.length > 0 && sessions.length - emptySessions.length >= 1 && (
            <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
              {confirmClearEmpty ? (
                <>
                  <span className="text-red-300">¿Eliminar {emptySessions.length} vacías?</span>
                  <button
                    type="button"
                    onClick={() => {
                      emptySessions.forEach((s) => onDeleteSession(s.id));
                      setConfirmClearEmpty(false);
                    }}
                    className="px-2 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded-md text-[10px]"
                  >
                    Sí
                  </button>
                  <button type="button" aria-label="Cancelar" onClick={() => setConfirmClearEmpty(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmClearEmpty(true)} className="text-[10px] text-slate-500 hover:text-red-400 transition">
                  Limpiar {emptySessions.length} conversaciones vacías
                </button>
              )}
            </div>
          )}

          {availableProjects.length > 1 && (
            <div className="flex items-center gap-1.5 py-0.5 text-[11px] overflow-x-auto whitespace-nowrap pb-1 custom-scroll">
              <button
                type="button"
                onClick={() => setAllCollapsed(!allCollapsed)}
                title={allCollapsed ? 'Expandir todos los proyectos' : 'Colapsar todos los proyectos'}
                aria-label={allCollapsed ? 'Expandir todos' : 'Colapsar todos'}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#0c1220] shrink-0"
              >
                {allCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setSelectedProjectFilter('all')}
                className={`px-2.5 py-0.5 rounded-full transition shrink-0 ${
                  selectedProjectFilter === 'all'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                    : 'bg-[#07090e] text-slate-400 hover:text-slate-200 border border-[#202b3f]'
                }`}
              >
                Todos
              </button>
              {availableProjects.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProjectFilter(p)}
                  className={`px-2.5 py-0.5 rounded-full transition shrink-0 ${
                    selectedProjectFilter === p
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                      : 'bg-[#07090e] text-slate-400 hover:text-slate-200 border border-[#202b3f]'
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
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">En mensajes</div>
            {messageHits.map((hit, index) => (
              <button
                key={`${hit.sessionId}-${index}`}
                type="button"
                onClick={() => {
                  onSelectSession(hit.sessionId);
                  onClose();
                }}
                className="w-full text-left p-1.5 rounded-lg hover:bg-[#162035] border border-[#202b3f] transition-colors cursor-pointer"
              >
                <span className="block truncate text-[11px] font-medium text-slate-200">{hit.title || 'Conversación'}</span>
                <span className="block truncate text-[11px] text-slate-400">{hit.snippet}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sessions Grouped by Project */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {Object.keys(groupedByProject).length === 0 ? (
            <div className="text-center p-6 text-slate-400 text-xs">
              No hay sesiones que coincidan con la búsqueda.
            </div>
          ) : (
            orderedProjects.map(([projectName, pSessions]) => {
              const isCollapsed = collapsedProjects[projectName] && !searching;
              return (
                <div
                  key={projectName}
                  className={`space-y-1.5 rounded-xl border border-[#202b3f] bg-[#0a0e17]/70 p-2 shadow-sm transition ${dropTarget === projectName ? 'ring-2 ring-cyan-500 bg-cyan-500/20' : ''}`}
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
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 p-1 rounded-lg hover:bg-[#0c1220] select-none">
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
                        className="flex-1 min-w-0 bg-[#07090e] border border-cyan-500 rounded-lg px-2 py-0.5 text-slate-100 text-[11px] focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleProjectCollapse(projectName)}
                        className="flex-1 min-w-0 flex items-center gap-1.5 text-left hover:text-white"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <FolderGit2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{projectName}</span>
                      </button>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono px-1.5 py-0.2 rounded-full bg-[#0c1220] border border-[#202b3f] shrink-0">
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
                        className="text-slate-400 hover:text-emerald-400 transition shrink-0 p-1 rounded-md hover:bg-[#0c1220]"
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
                            className="text-[10px] px-1.5 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded-md transition shrink-0"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            aria-label="Cancelar"
                            onClick={() => setPendingDeleteProject(null)}
                            className="text-slate-400 hover:text-white shrink-0 p-0.5"
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
                            className="text-slate-400 hover:text-cyan-300 transition shrink-0 p-1 rounded hover:bg-[#0c1220]"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar ${projectName}`}
                            title="Eliminar proyecto y sus conversaciones"
                            onClick={() => setPendingDeleteProject(projectName)}
                            className="text-slate-400 hover:text-red-400 transition shrink-0 p-1 rounded hover:bg-[#0c1220]"
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
                      className="w-[calc(100%-1rem)] ml-2 bg-[#07090e] border border-emerald-500/80 rounded-lg px-2.5 py-1 text-slate-100 text-[11px] focus:outline-none"
                    />
                  )}

                  {/* Tasks / Sessions in this Project */}
                  {!isCollapsed && (() => {
                    const { flows, loose } = groupByFlow(pSessions, []);
                    const renderRow = (s: ConversationSession, mates?: ConversationSession[]) => {
                      const isTeam = Boolean(s.squad);
                      const tag = isTeam ? agentLabel(s, mates ?? [s]) : (s.taskSlug ? `#${s.taskSlug}` : null);
                      const roleMeta = s.protocolRole ? PROTOCOL_ROLES[s.protocolRole] : undefined;
                      const roleBadgeClass = s.protocolRole && ROLE_COLORS[s.protocolRole]
                        ? ROLE_COLORS[s.protocolRole]
                        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
                      return (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', s.id);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDropTarget(null)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs transition cursor-grab active:cursor-grabbing border ${
                            s.id === activeSessionId
                              ? 'bg-cyan-500/15 text-white font-medium border-cyan-500/50 shadow-sm shadow-cyan-500/10'
                              : 'hover:bg-[#0c1220] hover:border-[#202b3f] text-slate-300 border-transparent'
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
                            <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${s.id === activeSessionId ? 'text-cyan-400' : 'text-slate-400'}`} />
                            <span className="block min-w-0 flex-1">
                              <span className="truncate text-[11px] flex items-center gap-1.5">
                                <span className={`truncate ${s.id === activeSessionId ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>{s.title || 'Conversación'}</span>
                                {tag && (
                                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0 ${isTeam ? 'font-medium' : 'font-mono'}`}>
                                    {tag}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 truncate mt-0.5">
                                <span className="truncate text-slate-400">{s.modelId}</span>
                                {s.protocolRole && (
                                  <>
                                    <span>•</span>
                                    <span className={`text-[9px] px-1 rounded uppercase font-bold border ${roleBadgeClass}`}>
                                      {roleMeta?.label ?? s.protocolRole}
                                    </span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="shrink-0">{s.messageCount ?? s.messages.length} msgs</span>
                                {s.updatedAt > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="shrink-0 text-slate-500" title={formatFull(s.updatedAt)}>{relativeTime(s.updatedAt)}</span>
                                  </>
                                )}
                              </span>
                            </span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              aria-pressed={favorites.includes(s.id)}
                              aria-label={favorites.includes(s.id) ? 'Quitar de favoritas' : 'Marcar como favorita'}
                              title={favorites.includes(s.id) ? 'Quitar de favoritas' : 'Marcar como favorita (sube al principio)'}
                              onClick={() => toggleFavorite(s.id)}
                              className="text-slate-500 hover:text-amber-400 p-0.5 transition"
                            >
                              <Star className={`w-3.5 h-3.5 ${favorites.includes(s.id) ? 'text-amber-400 fill-amber-400' : ''}`} />
                            </button>
                            {s.id === activeSessionId && (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}

                            {sessions.length > 1 && (pendingDeleteId === s.id ? (
                              <>
                                <span className="text-[10px] text-red-300">¿Eliminar?</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteSession(s.id);
                                    setPendingDeleteId(null);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded transition"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancelar"
                                  onClick={() => setPendingDeleteId(null)}
                                  className="flex items-center justify-center text-slate-400 hover:text-white rounded p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(s.id)}
                                className="flex items-center justify-center hover:text-red-400 text-slate-500 p-1 rounded hover:bg-[#0c1220] transition"
                                aria-label={`Eliminar ${s.title || 'conversación'}`}
                                title="Eliminar conversación"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-1.5 pl-2.5 border-l-2 border-cyan-500/30 ml-2">
                        {flows.map((flow) => (
                          <div key={flow.squad} className="space-y-1">
                            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider px-1 pt-1.5 pb-0.5 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                              <span className="truncate">{flow.name}</span>
                            </div>
                            {flow.members.map((s) => renderRow(s, flow.members))}
                          </div>
                        ))}
                        {loose.map((s) => renderRow(s, loose))}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-[#202b3f] pt-2">
          <button
            type="button"
            onClick={() => {
              if (!showArchive) postToHost({ command: 'listArchive' });
              setShowArchive(!showArchive);
            }}
            aria-expanded={showArchive}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-white uppercase tracking-wider transition"
          >
            {showArchive ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            <span>Conversaciones Archivadas</span>
          </button>
          {showArchive && (
            <ul className="mt-1.5 max-h-40 overflow-y-auto space-y-1.5 custom-scroll">
              {archive.length === 0 && <li className="text-[11px] text-slate-500 p-2 text-center">No hay conversaciones archivadas.</li>}
              {archive.map((item) => (
                <li key={item.id} className="flex items-center gap-2 p-2 rounded-xl bg-[#0a0e17] border border-[#202b3f] text-[11px]">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium text-slate-200">{item.title || 'Conversación'}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">{new Date(item.updatedAt).toLocaleString()}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => postToHost({ command: 'restoreSession', sessionId: item.id })}
                    className="px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-cyan-300 hover:text-white border border-[#202b3f] transition shrink-0 font-medium text-[10px]"
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex z-40">
        {drawerContent}
        <div className="flex-1" onClick={onClose} />
      </div>
    );
  };
