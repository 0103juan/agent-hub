import React, { useEffect, useState } from 'react';
import { postToHost } from '../vscode-api';

/** Solo la cola de este largo viaja al agente (ver el host). */
const SENT_TAIL_CHARS = 2000;

export const MemoryView: React.FC<{ experience?: string }> = ({ experience }) => {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    postToHost({ command: 'readExperience' });
  }, []);
  useEffect(() => {
    if (experience !== undefined) setDraft(experience);
  }, [experience]);

  const overflow = Math.max(0, draft.length - SENT_TAIL_CHARS);

  return (
    <div className="space-y-2">
      <div className="text-xs font-bold text-zinc-200 px-1">Memoria del proyecto</div>
      <p className="text-[11px] text-zinc-400 px-1">
        Notas que el agente recibe como experiencia previa (.agent-hub/experience.md). Solo se envían los últimos {SENT_TAIL_CHARS.toLocaleString()} caracteres.
      </p>
      <div className="relative">
        <textarea
          value={draft}
          rows={16}
          aria-label="Memoria del proyecto"
          onChange={(event) => setDraft(event.target.value)}
          className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-indigo-500 resize-y"
        />
        {overflow > 0 && (
          <div className="mt-1 p-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-300">
            Los primeros {overflow.toLocaleString()} caracteres quedan fuera: el agente no los ve.
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[11px] ${overflow > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
          {draft.length.toLocaleString()} / {SENT_TAIL_CHARS.toLocaleString()} caracteres
        </span>
        <button
          type="button"
          disabled={draft === (experience ?? '')}
          onClick={() => postToHost({ command: 'saveExperience', content: draft })}
          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium transition"
        >
          Guardar
        </button>
      </div>
    </div>
  );
};
