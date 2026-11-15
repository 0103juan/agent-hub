import React from 'react';
import { Keyboard } from 'lucide-react';
import { ModalShell } from './ModalShell';

export const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: 'Ctrl K', label: 'Paleta de comandos' },
  { keys: 'Ctrl /', label: 'Esta ayuda de atajos' },
  { keys: 'Ctrl N', label: 'Nueva conversación' },
  { keys: 'Ctrl 1 – 7', label: 'Cambiar de pestaña (4: Documentos)' },
  { keys: 'Alt ↑ / ↓', label: 'Conversación anterior / siguiente' },
  { keys: 'Ctrl Alt 1 – 4', label: 'Enfocar una columna (vista en columnas)' },
  { keys: 'Ctrl Alt ← / →', label: 'Pasar a la columna vecina' },
  { keys: 'Ctrl Shift F', label: 'Modo enfoque' },
  { keys: 'Alt Espacio', label: 'Lanzador rápido' },
  { keys: 'Ctrl `', label: 'Terminal integrada' },
  { keys: 'Ctrl F', label: 'Buscar en la conversación' },
  { keys: 'Ctrl B', label: 'Panel de archivos y cambios Git' },
  { keys: 'Ctrl E', label: 'Borrador de trabajo' },
  { keys: 'Ctrl Shift D', label: 'Iniciar o detener el dictado' },
  { keys: 'Ctrl Shift C', label: 'Copiar la última respuesta' },
  { keys: 'Ctrl Shift P', label: 'Activar o desactivar «Plan primero»' },
  { keys: 'Mayús + clic en Copiar', label: 'Copiar un mensaje con su encabezado (autor y hora)' },
  { keys: 'Ctrl + / Ctrl −', label: 'Acercar / alejar la interfaz (Ctrl 0 restablece)' },
  { keys: '↑ / ↓ en el cuadro vacío', label: 'Recorrer los mensajes que enviaste' },
  { keys: 'Esc en el cuadro vacío', label: 'Detener el turno en curso' },
  { keys: 'Enter / Shift Enter', label: 'Enviar / salto de línea' },
  { keys: 'F11 / F12 / Ctrl R', label: 'Pantalla completa / herramientas de desarrollo / recargar (app de escritorio)' }
];

export const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <ModalShell title="Atajos de teclado" icon={<Keyboard className="w-4 h-4 text-indigo-400" />} widthClass="max-w-md" onClose={onClose}>
    <ul className="p-2 overflow-y-auto text-[11px]">
      {SHORTCUTS.map((shortcut) => (
        <li key={shortcut.keys} className="flex items-center justify-between gap-3 px-2 py-1 rounded hover:bg-zinc-800/60">
          <span className="text-zinc-300">{shortcut.label}</span>
          <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-300">{shortcut.keys}</kbd>
        </li>
      ))}
    </ul>
  </ModalShell>
);
