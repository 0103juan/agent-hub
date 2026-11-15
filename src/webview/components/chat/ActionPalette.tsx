import React, { useMemo, useState } from 'react';
import { Search, Wrench } from 'lucide-react';
import { ACTION_GROUPS, ActionGroup, filterActions, WORKSPACE_ACTIONS } from '../../../shared/workspace-actions';
import { ModalShell } from '../ModalShell';
import { ACTION_ICONS } from './action-icons';

interface Props {
  onRun: (actionId: string) => void;
  onClose: () => void;
}

export const ActionPalette: React.FC<Props> = ({ onRun, onClose }) => {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ActionGroup | 'all'>('all');
  const matches = useMemo(() => filterActions(query, group), [query, group]);

  const run = (actionId: string) => {
    onRun(actionId);
    onClose();
  };

  const filters: Array<{ id: ActionGroup | 'all'; label: string; count: number }> = [
    { id: 'all', label: 'Todas', count: filterActions(query, 'all').length },
    ...ACTION_GROUPS.map((id) => ({ id, label: id, count: filterActions(query, id).length }))
  ];

  return (
    <ModalShell title="Acciones" icon={<Wrench className="w-4 h-4 text-indigo-400" />} widthClass="max-w-2xl" onClose={onClose}>
      <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-900 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar acción (tests, git, secretos, diagrama)..."
            aria-label="Buscar acción"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches[0]) run(matches[0].id);
              else if (event.key === 'ArrowDown') {
                event.preventDefault();
                document.querySelector<HTMLButtonElement>('[data-action]')?.focus();
              }
            }}
            className="w-full bg-zinc-950 border border-zinc-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setGroup(filter.id)}
              className={`px-2 py-0.5 rounded-full border transition ${
                group === filter.id
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-medium'
                  : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
              }`}
            >
              {filter.label} <span className="font-mono opacity-70">{filter.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-2 space-y-2"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-action]'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = buttons[index + (event.key === 'ArrowDown' ? 1 : -1)];
          if (next) {
            event.preventDefault();
            next.focus();
          }
        }}
      >
        {matches.length === 0 && <div className="text-center py-8 text-zinc-400 text-xs">No hay acciones con ese filtro.</div>}
        {ACTION_GROUPS.map((actionGroup) => {
          const actions = matches.filter((action) => action.group === actionGroup);
          if (actions.length === 0) return null;
          return (
            <section key={actionGroup}>
              <h4 className="text-[11px] font-semibold text-zinc-400 px-1 pb-1">{actionGroup}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {actions.map((action) => {
                  const { icon: Icon, color } = ACTION_ICONS[action.id] ?? { icon: Wrench, color: 'text-zinc-400' };
                  return (
                    <button
                      data-action
                      key={action.id}
                      type="button"
                      onClick={() => run(action.id)}
                      className="flex items-start gap-2 px-2 py-1.5 rounded-lg border border-transparent hover:border-zinc-700 hover:bg-zinc-800 text-left transition group min-w-0"
                    >
                      <span className="p-1 rounded bg-zinc-800/80 group-hover:bg-zinc-700 border border-zinc-700/50 shrink-0">
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">{action.label}</span>
                        <span className="block text-[11px] text-zinc-400 group-hover:text-zinc-200 truncate">{action.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="p-2 border-t border-zinc-800 bg-zinc-950/60 text-[11px] text-zinc-400 px-3">
        <kbd className="font-mono text-zinc-400">Enter</kbd> ejecuta la primera · <kbd className="font-mono text-zinc-400">Esc</kbd> cierra
      </div>
    </ModalShell>
  );
};
