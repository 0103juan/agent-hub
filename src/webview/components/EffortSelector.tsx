import React from 'react';
import { ReasoningEffort } from '../../orchestrator/types';
import { Gauge } from 'lucide-react';

interface Props {
  effort: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}

export const EffortSelector: React.FC<Props> = ({ effort, onChange }) => {
  const options: { id: ReasoningEffort; label: string }[] = [
    { id: 'low', label: 'Bajo' },
    { id: 'medium', label: 'Medio' },
    { id: 'high', label: 'Alto' },
    { id: 'max', label: 'Max' }
  ];

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <div className="flex items-center gap-1 text-zinc-400" title="Esfuerzo de razonamiento (Thinking / CoT)">
        <Gauge className="w-3 h-3 text-indigo-400" />
        <span>Esfuerzo:</span>
      </div>
      <div className="flex bg-zinc-900 border border-zinc-800 rounded p-0.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
              effort === opt.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

