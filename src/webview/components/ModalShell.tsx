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
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 z-50 animate-backdrop-fade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`select-text bg-[#0a0e17] border border-[#202b3f] rounded-2xl w-full ${widthClass} max-h-[85vh] flex flex-col shadow-2xl shadow-black/80 overflow-hidden animate-modal-pop`}
      >
        <div className="px-4 py-3 border-b border-[#202b3f] flex items-center justify-between bg-[#07090e]/95 backdrop-blur-md shrink-0">
          <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2 tracking-wide">
            {icon}
            <span>{title}</span>
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#0c1220] border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
