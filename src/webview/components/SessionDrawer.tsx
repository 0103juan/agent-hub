import React, { useState } from 'react';
import { ConversationSession, ProtocolRole } from '../../orchestrator/types';
import { PROTOCOL_ROLES } from '../../orchestrator/protocol-roles';
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
  ChevronRight
} from 'lucide-react';

interface Props {
  sessions: ConversationSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateSession: (projectName?: string, taskSlug?: string, role?: ProtocolRole) => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}

export const SessionDrawer: React.FC<Props> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  // Formulario rápido para nueva tarea/sesión
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newTaskSlug, setNewTaskSlug] = useState('');
  const [newRole, setNewRole] = useState<ProtocolRole | ''>('');

  // Extraer lista de proyectos únicos
  const availableProjects = Array.from(
    new Set(sessions.map((s) => s.projectName || 'Sin Proyecto'))
  );

  // Filtrar sesiones
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      searchQuery === '' ||
      (s.title && s.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.taskSlug && s.taskSlug.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.projectName && s.projectName.toLowerCase().includes(searchQuery.toLowerCase()));

    const currentProject = s.projectName || 'Sin Proyecto';
    const matchesProject =
      selectedProjectFilter === 'all' || currentProject === selectedProjectFilter;

    return matchesSearch && matchesProject;
  });

  // Agrupar sesiones por Proyecto -> Tarea
  const groupedByProject: Record<string, ConversationSession[]> = {};
  for (const s of filteredSessions) {
    const proj = s.projectName || 'General / Sin Proyecto';
    if (!groupedByProject[proj]) groupedByProject[proj] = [];
    groupedByProject[proj].push(s);
  }

  const toggleProjectCollapse = (proj: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [proj]: !prev[proj] }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateSession(
      newProjectName.trim() || undefined,
      newTaskSlug.trim() || undefined,
      (newRole as ProtocolRole) || undefined
    );
    setNewProjectName('');
    setNewTaskSlug('');
    setNewRole('');
    setShowNewTaskForm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex z-40">
      <div className="w-80 bg-zinc-900 border-r border-zinc-800 h-full flex flex-col p-3 space-y-3 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Proyectos y Tareas</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-0.5 rounded hover:bg-zinc-800 transition"
          >
            Cerrar
          </button>
        </div>

        {/* Action Button: Nueva Tarea / Sesión */}
        {!showNewTaskForm ? (
          <button
            onClick={() => setShowNewTaskForm(true)}
            className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Tarea / Sesión</span>
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="p-2.5 bg-zinc-800/80 border border-zinc-700 rounded-lg space-y-2 text-xs">
            <div className="font-semibold text-zinc-200 text-[11px] flex items-center justify-between">
              <span>Organizar Nueva Tarea</span>
              <button
                type="button"
                onClick={() => setShowNewTaskForm(false)}
                className="text-zinc-400 hover:text-zinc-200 text-[10px]"
              >
                Cancelar
              </button>
            </div>

            <div>
              <input
                type="text"
                placeholder="Proyecto (ej: portafolio, finesa)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <input
                type="text"
                placeholder="Tarea / Slug (ej: feat-auth, bug-secop)"
                value={newTaskSlug}
                onChange={(e) => setNewTaskSlug(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as ProtocolRole)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">Sin Rol Inicial (Libre)</option>
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
              Iniciar Tarea
            </button>
          </form>
        )}

        {/* Search & Project Filter Bar */}
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Buscar tareas, chats o proyectos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 bg-zinc-800/60 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-zinc-700"
            />
          </div>

          {availableProjects.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-[10px] scrollbar-none">
              <span className="text-zinc-500 mr-0.5 shrink-0">Filtrar:</span>
              <button
                onClick={() => setSelectedProjectFilter('all')}
                className={`px-1.5 py-0.5 rounded transition shrink-0 ${
                  selectedProjectFilter === 'all'
                    ? 'bg-zinc-800 text-zinc-200 font-medium'
                    : 'text-zinc-500 hover:text-zinc-400'
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
                      : 'text-zinc-500 hover:text-zinc-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sessions Grouped by Project */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {Object.keys(groupedByProject).length === 0 ? (
            <div className="text-center p-6 text-zinc-500 text-xs">
              No hay sesiones que coincidan con la búsqueda.
            </div>
          ) : (
            Object.entries(groupedByProject).map(([projectName, pSessions]) => {
              const isCollapsed = collapsedProjects[projectName];
              return (
                <div key={projectName} className="space-y-1">
                  {/* Project Header */}
                  <div
                    onClick={() => toggleProjectCollapse(projectName)}
                    className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer p-1 rounded hover:bg-zinc-800/40 select-none"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <FolderGit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">{projectName}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono px-1 rounded bg-zinc-800/80">
                      {pSessions.length}
                    </span>
                  </div>

                  {/* Tasks / Sessions in this Project */}
                  {!isCollapsed && (
                    <div className="space-y-1 pl-2 border-l border-zinc-800/80 ml-2">
                      {pSessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => {
                            onSelectSession(s.id);
                            onClose();
                          }}
                          className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition ${
                            s.id === activeSessionId
                              ? 'bg-zinc-800 text-indigo-300 font-medium border border-zinc-700'
                              : 'hover:bg-zinc-800/50 text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate mr-2">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <div className="truncate">
                              <div className="truncate text-[11px] flex items-center gap-1">
                                <span className="truncate">{s.title || 'Conversación'}</span>
                                {s.taskSlug && (
                                  <span className="text-[9px] px-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono shrink-0">
                                    #{s.taskSlug}
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-zinc-500 font-mono flex items-center gap-1">
                                <span>{s.modelName}</span>
                                {s.protocolRole && (
                                  <>
                                    <span>•</span>
                                    <span className="text-purple-400 uppercase font-semibold">
                                      {s.protocolRole}
                                    </span>
                                  </>
                                )}
                                <span>•</span>
                                <span>{s.messages.length} msgs</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {s.id === activeSessionId && (
                              <Check className="w-3.5 h-3.5 text-indigo-400" />
                            )}

                            {sessions.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(s.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-500 rounded transition"
                                title="Eliminar conversación"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
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
      </div>

      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
