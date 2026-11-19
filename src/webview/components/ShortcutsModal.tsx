import React, { useState, useMemo } from 'react';
import { Keyboard, Search, X } from 'lucide-react';
import { ModalShell } from './ModalShell';

export const SHORTCUTS: Array<{ keys: string; label: string; group?: string }> = [
  { keys: 'Ctrl K', label: 'Paleta global de comandos', group: 'Navegación' },
  { keys: 'Ctrl /', label: 'Esta ayuda de atajos', group: 'Navegación' },
  { keys: 'Ctrl N', label: 'Nueva conversación', group: 'Chat' },
  { keys: 'Ctrl 1 – 8', label: 'Cambiar de pestaña (1: HUD Center, 2: Chat, 5: Documentos)', group: 'Navegación' },
  { keys: 'Alt ↑ / ↓', label: 'Conversación anterior / siguiente', group: 'Chat' },
  { keys: 'Ctrl Alt 1 – 4', label: 'Enfocar una columna (vista en columnas)', group: 'Ventanas' },
  { keys: 'Ctrl Alt ← / →', label: 'Pasar a la columna vecina', group: 'Ventanas' },
  { keys: 'Ctrl Shift F', label: 'Modo enfoque (Focus Mode)', group: 'Ventanas' },
  { keys: 'Alt Espacio', label: 'Lanzador rápido flotante', group: 'Navegación' },
  { keys: 'Ctrl `', label: 'Terminal integrada CRT', group: 'Herramientas' },
  { keys: 'Ctrl F', label: 'Buscar en la conversación activa', group: 'Chat' },
  { keys: 'Ctrl B', label: 'Panel de archivos y cambios Git', group: 'Herramientas' },
  { keys: 'Ctrl E', label: 'Borrador de notas y tareas (scratchpad.md)', group: 'Herramientas' },
  { keys: 'Ctrl Shift D', label: 'Iniciar o detener el dictado por voz', group: 'Entrada' },
  { keys: 'Ctrl Shift C', label: 'Copiar la última respuesta del agente', group: 'Chat' },
  { keys: 'Ctrl Shift P', label: 'Activar o desactivar «Plan primero»', group: 'Agente' },
  { keys: 'Mayús + clic en Copiar', label: 'Copiar un mensaje con encabezado y hora', group: 'Chat' },
  { keys: 'Ctrl + / Ctrl −', label: 'Acercar / alejar la interfaz (Ctrl 0 restablece)', group: 'Ventanas' },
  { keys: '↑ / ↓ en el cuadro vacío', label: 'Recorrer los mensajes que enviaste', group: 'Chat' },
  { keys: 'Esc en el cuadro vacío', label: 'Detener el turno en curso', group: 'Chat' },
  { keys: 'Enter / Shift Enter', label: 'Enviar / salto de línea', group: 'Chat' },
  { keys: 'F11 / F12 / Ctrl R', label: 'Pantalla completa / DevTools / recargar', group: 'Sistema' }
];

const GROUP_STYLES: Record<string, string> = {
  Navegación: 'text-cyan-300 bg-cyan-950/40 border-cyan-500/40',
  Chat: 'text-blue-300 bg-blue-950/40 border-blue-500/40',
  Ventanas: 'text-amber-300 bg-amber-950/40 border-amber-500/40',
  Herramientas: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40',
  Agente: 'text-violet-300 bg-violet-950/40 border-violet-500/40',
  Entrada: 'text-rose-300 bg-rose-950/40 border-rose-500/40',
  Sistema: 'text-slate-300 bg-slate-800/40 border-slate-600/40'
};

export const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('Todos');

  const groups = useMemo(() => {
    const set = new Set<string>();
    SHORTCUTS.forEach((s) => {
      if (s.group) set.add(s.group);
    });
    return ['Todos', ...Array.from(set)];
  }, []);

  const filteredShortcuts = useMemo(() => {
    const q = query.toLowerCase().trim();
    return SHORTCUTS.filter((s) => {
      const matchesGroup = selectedGroup === 'Todos' || s.group === selectedGroup;
      if (!matchesGroup) return false;
      if (!q) return true;
      return (
        s.label.toLowerCase().includes(q) ||
        s.keys.toLowerCase().includes(q) ||
        (s.group && s.group.toLowerCase().includes(q))
      );
    });
  }, [query, selectedGroup]);

  return (
    <ModalShell
      title="Atajos de Teclado del HUD"
      icon={<Keyboard className="w-4 h-4 text-cyan-400" />}
      widthClass="max-w-xl"
      onClose={onClose}
    >
      <div className="flex flex-col max-h-[75vh]">
        {/* Barra de Filtro y Búsqueda */}
        <div className="p-3 border-b border-[#202b3f] bg-[#07090e]/80 space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar por atajo o acción (ej. Ctrl K, terminal, plan)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-[#0a0e17] border border-[#202b3f] focus:border-cyan-500 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono transition"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-100 transition cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Chips de categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {groups.map((group) => {
              const active = selectedGroup === group;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => setSelectedGroup(group)}
                  className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-mono font-medium transition cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.25)] font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1220] border border-[#202b3f]'
                  }`}
                >
                  {group}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista de Atajos */}
        <ul className="p-3 overflow-y-auto space-y-1.5 flex-1" role="list" aria-label="Lista de atajos">
          {filteredShortcuts.length === 0 ? (
            <li className="p-6 text-center text-slate-500 text-xs font-mono">
              No se encontraron atajos para &ldquo;{query}&rdquo;
            </li>
          ) : (
            filteredShortcuts.map((shortcut) => (
              <li
                key={shortcut.keys}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#07090e] hover:bg-[#0c1220] border border-[#202b3f] hover:border-cyan-500/30 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {shortcut.group && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold border uppercase shrink-0 ${
                        GROUP_STYLES[shortcut.group] ?? 'text-slate-400 bg-[#0c1220] border-[#202b3f]'
                      }`}
                    >
                      {shortcut.group}
                    </span>
                  )}
                  <span className="text-xs text-slate-200 font-medium truncate">{shortcut.label}</span>
                </div>
                <kbd className="shrink-0 px-2.5 py-1 rounded-md bg-[#07090e] border border-[#202b3f] font-mono text-[11px] text-cyan-300 font-bold shadow-[inset_0_-2px_0_#162035,0_1px_2px_rgba(0,0,0,0.5)] tracking-wide">
                  {shortcut.keys}
                </kbd>
              </li>
            ))
          )}
        </ul>

        {/* Footer */}
        <div className="p-3 border-t border-[#202b3f] bg-[#07090e] flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0">
          <span>
            {filteredShortcuts.length} de {SHORTCUTS.length} atajos mapeados
          </span>
          <span className="text-cyan-400 font-semibold">Esc para cerrar</span>
        </div>
      </div>
    </ModalShell>
  );
};
