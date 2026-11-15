import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  icon: React.ReactNode;
  widthClass?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const ModalShell: React.FC<Props> = ({ title, icon, widthClass = 'max-w-sm', onClose, children }) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const dialogRef = useRef<HTMLDivElement>(null);
  // Tab y Mayús+Tab dan la vuelta dentro del modal en vez de salir a la página de atrás.
  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Al cerrar, el foco vuelve a lo que abrió el modal.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-3 z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} onKeyDown={trapFocus} role="dialog" aria-modal="true" aria-label={title} className={`select-text bg-zinc-900 border border-zinc-700 rounded-xl w-full ${widthClass} max-h-[85vh] flex flex-col shadow-2xl overflow-hidden`}>
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
            {icon}
            <span>{title}</span>
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
