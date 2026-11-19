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
    <ModalShell title="Acciones Rápidas" icon={<Wrench className="w-4 h-4 text-cyan-400" />} widthClass="max-w-2xl" onClose={onClose}>
      <div className="p-3.5 border-b border-[#202b3f] bg-[#07090e] space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar acción (tests, git, secretos, arquitectura)..."
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
            className="w-full bg-[#0a0e17] border border-[#202b3f] focus:border-cyan-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setGroup(filter.id)}
              className={`px-3 py-0.5 rounded-full border transition cursor-pointer text-[10.5px] ${
                group === filter.id
                  ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/60 font-semibold shadow-xs'
                  : 'bg-[#0c1220] hover:bg-[#162035] text-slate-400 border-[#202b3f]'
              }`}
            >
              {filter.label} <span className="font-mono opacity-70 ml-0.5">{filter.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-[#0a0e17] max-h-96"
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
        {matches.length === 0 && (
          <div className="text-center py-8 text-slate-400 font-mono text-xs">No hay acciones con ese filtro.</div>
        )}
        {ACTION_GROUPS.map((actionGroup) => {
          const actions = matches.filter((action) => action.group === actionGroup);
          if (actions.length === 0) return null;
          return (
            <section key={actionGroup} className="space-y-2">
              <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 px-1">{actionGroup}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {actions.map((action) => {
                  const { icon: Icon, color } = ACTION_ICONS[action.id] ?? { icon: Wrench, color: 'text-cyan-400' };
                  return (
                    <button
                      data-action
                      key={action.id}
                      type="button"
                      onClick={() => run(action.id)}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-cyan-500/50 text-left transition group min-w-0 cursor-pointer shadow-xs hub-lift"
                    >
                      <span className="p-1.5 rounded-lg bg-[#07090e] group-hover:bg-[#0c1220] border border-[#202b3f] shrink-0 group-hover:scale-105 transition-transform">
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-100 group-hover:text-cyan-200 truncate">{action.label}</span>
                        <span className="block text-[11px] text-slate-400 group-hover:text-slate-300 truncate mt-0.5">{action.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-[#202b3f] bg-[#07090e] text-[11px] text-slate-400 px-4 flex items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f] text-slate-300">Enter</kbd>
          <span>ejecuta la primera coincidencia</span>
        </div>
        <span className="text-slate-400">Esc cierra</span>
      </div>
    </ModalShell>
  );
};
