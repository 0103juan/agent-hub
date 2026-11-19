import React, { useMemo, useState } from 'react';
import { Command, Search, MessageSquare, Sparkles, Zap, Terminal, CornerDownLeft } from 'lucide-react';
import { agentName } from '../../shared/agent-name';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { ConversationSession } from '../../shared/types';
import { filterActions, normalizeText } from '../../shared/workspace-actions';
import { ModalShell } from './ModalShell';

interface Entry {
  key: string;
  group: 'Aplicación' | 'Sesiones' | 'Roles' | 'Acciones';
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  sessions: ConversationSession[];
  /** Comandos de la propia aplicación (pestañas, vistas, zoom…). */
  appCommands?: Array<{ key: string; label: string; hint?: string; run: () => void }>;
  onSwitchSession: (sessionId: string) => void;
  onSelectRole: (role: ConversationSession['protocolRole'] & string) => void;
  onRunAction: (actionId: string) => void;
  onClose: () => void;
}

const getGroupBadge = (group: string) => {
  switch (group) {
    case 'Roles':
      return {
        icon: <Sparkles className="w-3.5 h-3.5 text-violet-400" />,
        badgeClass: 'bg-violet-950/60 text-violet-300 border-violet-800/40'
      };
    case 'Sesiones':
      return {
        icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />,
        badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
      };
    case 'Acciones':
      return {
        icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
        badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-800/40'
      };
    case 'Aplicación':
    default:
      return {
        icon: <Terminal className="w-3.5 h-3.5 text-cyan-400" />,
        badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40'
      };
  }
};

/** Paleta global (Ctrl/Cmd+K): cambiar de sesión, aplicar un rol o ejecutar una acción. */
export const CommandPalette: React.FC<Props> = ({
  sessions,
  appCommands = [],
  onSwitchSession,
  onSelectRole,
  onRunAction,
  onClose
}) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [activeCategory, setActiveCategory] = useState<'all' | 'Sesiones' | 'Roles' | 'Acciones' | 'Aplicación'>('all');

  const entries = useMemo(() => {
    const needle = normalizeText(query.trim());
    const all: Entry[] = [
      ...appCommands.map((command) => ({ ...command, group: 'Aplicación' as const })),
      ...[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => ({
        key: `s-${s.id}`,
        group: 'Sesiones' as const,
        label: s.title || agentName(s),
        hint: s.projectName,
        run: () => onSwitchSession(s.id)
      })),
      ...Object.values(PROTOCOL_ROLES).map((role) => ({
        key: `r-${role.id}`,
        group: 'Roles' as const,
        label: role.label,
        hint: `${role.recommendedModel} · ${role.recommendedEffort}${role.readOnly ? ' · solo lectura' : ''}${role.handoffTo ? ` → ${PROTOCOL_ROLES[role.handoffTo]?.label ?? role.handoffTo}` : ''}`,
        run: () => onSelectRole(role.id)
      }))
    ].filter((entry) => !needle || normalizeText(`${entry.label} ${entry.hint ?? ''}`).includes(needle));
    const actions: Entry[] = filterActions(query, 'all').map((action) => ({
      key: `a-${action.id}`,
      group: 'Acciones' as const,
      label: action.label,
      hint: action.description,
      run: () => onRunAction(action.id)
    }));
    return [...all, ...actions];
  }, [query, sessions, appCommands, onSwitchSession, onSelectRole, onRunAction]);

  const visibleEntries = useMemo(() => {
    if (activeCategory === 'all') return entries;
    return entries.filter((e) => e.group === activeCategory);
  }, [entries, activeCategory]);

  const counts = useMemo(() => {
    const c = { all: entries.length, Sesiones: 0, Roles: 0, Acciones: 0, Aplicación: 0 };
    for (const e of entries) {
      if (e.group in c) (c as Record<string, number>)[e.group]++;
    }
    return c;
  }, [entries]);

  const active = Math.min(cursor, Math.max(0, visibleEntries.length - 1));

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    entry.run();
    onClose();
  };

  return (
    <ModalShell
      title="Paleta de comandos"
      icon={<Command className="w-4 h-4 text-cyan-400" />}
      widthClass="max-w-xl"
      onClose={onClose}
    >
      {/* Barra de búsqueda y filtros rápidos */}
      <div className="p-3 bg-[#07090e] border-b border-[#202b3f] shrink-0 space-y-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            autoFocus
            value={query}
            aria-label="Buscar sesión, rol o acción"
            placeholder="Buscar sesión, rol o acción... (ej. planificar, terminal, arquitecto)"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor(Math.min(active + 1, visibleEntries.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor(Math.max(active - 1, 0));
              } else if (event.key === 'Enter') {
                run(visibleEntries[active]);
              }
            }}
            className="w-full bg-[#07090e] border border-[#202b3f] rounded-xl pl-9 pr-24 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 font-mono transition-all shadow-inner"
          />
          {query && (
            <div className="absolute right-2.5 flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-[#0c1220] px-2 py-0.5 rounded-md border border-[#202b3f]">
              <span>{visibleEntries.length} {visibleEntries.length === 1 ? 'coinc.' : 'coincs.'}</span>
            </div>
          )}
        </div>

        {/* Pestañas de categoría HUD */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: 'Todos', count: counts.all },
              { id: 'Roles', label: 'Roles', count: counts.Roles },
              { id: 'Sesiones', label: 'Sesiones', count: counts.Sesiones },
              { id: 'Acciones', label: 'Acciones', count: counts.Acciones },
              { id: 'Aplicación', label: 'Comandos', count: counts.Aplicación }
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategory(cat.id);
                setCursor(0);
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition cursor-pointer border ${
                activeCategory === cat.id
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.25)] font-bold'
                  : 'bg-[#0c1220] hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-[#202b3f]'
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* Lista de resultados */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1" role="listbox" aria-label="Resultados">
        {visibleEntries.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-xs font-mono">
            Sin resultados para &ldquo;{query}&rdquo;.
          </div>
        )}
        {visibleEntries.map((entry, index) => {
          const isSelected = index === active;
          const { icon, badgeClass } = getGroupBadge(entry.group);
          return (
            <button
              key={entry.key}
              type="button"
              role="option"
              aria-selected={isSelected}
              ref={(element) => isSelected && element?.scrollIntoView({ block: 'nearest' })}
              onClick={() => run(entry)}
              onMouseMove={() => setCursor(index)}
              className={`flex w-full items-center gap-2.5 text-left p-2.5 rounded-xl text-xs transition cursor-pointer relative group border ${
                isSelected
                  ? 'bg-[#0c1220] border-cyan-500/50 shadow-sm'
                  : 'bg-transparent hover:bg-[#0c1220]/60 border-transparent hover:border-[#202b3f]'
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-cyan-400 rounded-r shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
              <div className="p-1.5 rounded-lg bg-[#07090e] border border-[#202b3f] shrink-0">
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate font-semibold ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                    {entry.label}
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${badgeClass}`}>
                    {entry.group}
                  </span>
                </div>
                {entry.hint && (
                  <p className="truncate text-[10px] text-slate-400 mt-0.5 font-mono">
                    {entry.hint}
                  </p>
                )}
              </div>
              {isSelected && (
                <div className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-cyan-300 bg-[#07090e] px-1.5 py-0.5 rounded border border-[#202b3f]">
                  <CornerDownLeft className="w-3 h-3 text-cyan-400" />
                  <span>↵</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer de navegación HUD */}
      <div className="px-4 py-2.5 bg-[#07090e] border-t border-[#202b3f] text-[10px] text-slate-400 flex items-center justify-between shrink-0 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-[#0c1220] border border-[#202b3f] text-slate-300 font-bold">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-[#0c1220] border border-[#202b3f] text-slate-300 font-bold">↓</kbd>
            <span className="text-slate-400 text-[10px]">navegar</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-[#0c1220] border border-[#202b3f] text-slate-300 font-bold">↵</kbd>
            <span className="text-slate-400 text-[10px]">ejecutar</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-[#0c1220] border border-[#202b3f] text-slate-300 font-bold">Esc</kbd>
            <span className="text-slate-400 text-[10px]">cerrar</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-slate-400 font-semibold">{visibleEntries.length} resultado{visibleEntries.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </ModalShell>
  );
};
