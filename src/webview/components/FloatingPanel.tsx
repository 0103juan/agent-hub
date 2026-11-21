import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Menú desplegable anclado a un botón pero pintado en `document.body` con `position: fixed`.
 * Dentro de las columnas de SplitWorkspace la cabecera crea su propio contexto de apilamiento
 * (backdrop-blur) y la columna recorta con overflow-hidden: un `absolute z-50` quedaba debajo del chat.
 */
export const FloatingPanel: React.FC<{
  anchorRef: React.RefObject<HTMLElement | null>;
  panelRef?: React.RefObject<HTMLDivElement>;
  className?: string;
  children: React.ReactNode;
}> = ({ anchorRef, panelRef, className = '', children }) => {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = panelRef ?? ownRef;
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = ref.current?.offsetWidth ?? 0;
      const margin = 8;
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
      const top = anchor.bottom + 6;
      setPos({ top, left, maxHeight: Math.max(160, window.innerHeight - top - margin) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, ref]);

  return createPortal(
    <div
      ref={ref}
      // Los eventos de un portal suben por el árbol de React: que el doble clic no maximice la columna.
      onDoubleClick={(event) => event.stopPropagation()}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight, zIndex: 1000 }}
      className={`overflow-y-auto no-scrollbar ${className}`}
    >
      {children}
    </div>,
    document.body
  );
};
