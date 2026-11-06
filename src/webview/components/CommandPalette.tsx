import React, { useMemo, useState } from 'react';
import { Command, Search } from 'lucide-react';
import { agentName } from '../../shared/agent-name';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { ConversationSession } from '../../shared/types';
import { filterActions } from '../../shared/workspace-actions';
import { ModalShell } from './ModalShell';

interface Entry {
  key: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  sessions: ConversationSession[];
  onSwitchSession: (sessionId: string) => void;
  onSelectRole: (role: ConversationSession['protocolRole'] & string) => void;
  onRunAction: (actionId: string) => void;
  onClose: () => void;
}

/** Paleta global (Ctrl/Cmd+K): cambiar de sesión, aplicar un rol o ejecutar una acción. */
export const CommandPalette: React.FC<Props> = ({ sessions, onSwitchSession, onSelectRole, onRunAction, onClose }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all: Entry[] = [
      ...sessions.map((s) => ({
        key: `s-${s.id}`,
        group: 'Sesiones',
        label: s.title || agentName(s),
        hint: s.projectName,
        run: () => onSwitchSession(s.id)
      })),
      ...Object.values(PROTOCOL_ROLES).map((role) => ({
        key: `r-${role.id}`,
        group: 'Roles',
        label: role.label,
        hint: 'Aplicar a la sesión activa',
        run: () => onSelectRole(role.id)
      }))
    ].filter((entry) => !needle || `${entry.label} ${entry.hint ?? ''}`.toLowerCase().includes(needle));
    const actions = filterActions(query, 'all').map((action) => ({
      key: `a-${action.id}`,
      group: 'Acciones',
      label: action.label,
      hint: action.description,
      run: () => onRunAction(action.id)
    }));
    return [...all, ...actions];
  }, [query, sessions, onSwitchSession, onSelectRole, onRunAction]);

  const active = Math.min(cursor, entries.length - 1);
  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    entry.run();
    onClose();
  };

  return (
    <ModalShell title="Paleta de comandos" icon={<Command className="w-4 h-4 text-indigo-400" />} widthClass="max-w-lg" onClose={onClose}>
      <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-900">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            value={query}
            aria-label="Buscar sesión, rol o acción"
            placeholder="Buscar sesión, rol o acción..."
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor(Math.min(active + 1, entries.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor(Math.max(active - 1, 0));
              } else if (event.key === 'Enter') {
                run(entries[active]);
              }
            }}
            className="w-full bg-zinc-950 border border-zinc-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1" role="listbox" aria-label="Resultados">
        {entries.length === 0 && <div className="text-center py-6 text-zinc-400 text-xs">Sin resultados.</div>}
        {entries.map((entry, index) => (
          <button
            key={entry.key}
            type="button"
            role="option"
            aria-selected={index === active}
            ref={(element) => index === active && element?.scrollIntoView({ block: 'nearest' })}
            onClick={() => run(entry)}
            onMouseMove={() => setCursor(index)}
            className={`flex w-full items-center gap-2 text-left px-2 py-1 rounded text-[11px] ${index === active ? 'bg-zinc-800' : ''}`}
          >
            <span className="w-16 shrink-0 text-zinc-500 uppercase text-[10px]">{entry.group}</span>
            <span className="truncate text-zinc-200 font-medium">{entry.label}</span>
            {entry.hint && <span className="truncate text-zinc-400 ml-auto">{entry.hint}</span>}
          </button>
        ))}
      </div>
    </ModalShell>
  );
};
