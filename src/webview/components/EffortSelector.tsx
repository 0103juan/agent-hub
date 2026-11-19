import React from 'react';
import { ReasoningEffort } from '../../shared/types';
import { Gauge } from 'lucide-react';

interface Props {
  effort: ReasoningEffort;
  /** Niveles del modelo activo; los demás se muestran deshabilitados. */
  supportedEfforts: ReasoningEffort[];
  onChange: (effort: ReasoningEffort) => void;
}

export const EFFORT_LABELS: Record<ReasoningEffort, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Xalto', max: 'Max' };
export const EFFORT_HINTS: Record<ReasoningEffort, string> = {
  low: 'Respuestas rápidas y baratas, con poco razonamiento',
  medium: 'Equilibrio entre velocidad y profundidad',
  high: 'Razona más antes de responder: mejor para código difícil',
  xhigh: 'Entre Alto y Max: razonamiento muy profundo con menos costo que Max',
  max: 'Máximo razonamiento: el más lento y el que más cuota gasta'
};

export const EffortSelector: React.FC<Props> = ({ effort, supportedEfforts, onChange }) => {
  const options = (['low', 'medium', 'high', 'xhigh', 'max'] as ReasoningEffort[])
    .filter((id) => id !== 'xhigh' || supportedEfforts.includes(id))
    .map((id) => ({ id, label: EFFORT_LABELS[id] }));
  const hints = EFFORT_HINTS;

  return (
    <div className="flex items-center gap-1.5 text-[11px] shrink-0">
      <div className="flex items-center gap-1 text-slate-400 font-medium" title="Esfuerzo de razonamiento">
        <Gauge className="w-3 h-3 text-cyan-400" />
        <span className="hidden min-[480px]:inline">Esfuerzo:</span>
      </div>
      <div role="group" aria-label="Esfuerzo de razonamiento" className="flex bg-[#07090e] border border-[#202b3f] rounded-lg p-0.5 shadow-xs">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={!supportedEfforts.includes(opt.id)}
            onClick={() => onChange(opt.id)}
            aria-pressed={effort === opt.id}
            title={supportedEfforts.includes(opt.id) ? hints[opt.id] : 'No disponible con este modelo'}
            className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono font-medium transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
              effort === opt.id
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.25)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#162035] border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

