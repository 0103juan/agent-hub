import React, { useEffect, useRef, useState } from 'react';

/** Interacciones compartidas por las vistas (HUD, Métricas, compositor). Respetan "reducir movimiento". */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Retraso de la entrada escalonada (`.hud-rise`). */
export const rise = (i: number) => ({ '--i': i }) as React.CSSProperties;

/** Cifra que rueda desde su valor anterior hasta el nuevo, como un contador mecánico. */
export const CountUp: React.FC<{ value: number; format: (n: number) => string }> = ({ value, format }) => {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    if (reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      from.current = origin + (value - origin) * (1 - (1 - t) ** 3);
      setShown(from.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
};

/** Botón que se inclina hacia el puntero (los "magnetic buttons" de Awwwards). Va con la clase `hud-magnet`. */
export const magnet = {
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
    if (reducedMotion() || (event.currentTarget as HTMLButtonElement).disabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.transform = `translate(${(event.clientX - box.left - box.width / 2) * 0.18}px, ${(event.clientY - box.top - box.height / 2) * 0.3}px)`;
  },
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.style.transform = '';
  }
};
