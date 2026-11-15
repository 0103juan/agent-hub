import React, { useEffect, useState } from 'react';
import { Check, Copy, NotebookPen, Undo2 } from 'lucide-react';
import { postToHost } from '../vscode-api';

/** Solo la cola de este largo viaja al agente (ver el host). */
const SENT_TAIL_CHARS = 2000;

const today = () => new Date().toISOString().slice(0, 10);

export const MemoryView: React.FC<{ experience?: string }> = ({ experience }) => {
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    postToHost({ command: 'readExperience' });
  }, []);
  useEffect(() => {
    if (experience !== undefined) setDraft(experience);
  }, [experience]);

  const overflow = Math.max(0, draft.length - SENT_TAIL_CHARS);
  const dirty = draft !== (experience ?? '');
  const lines = draft ? draft.split('\n').length : 0;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  const save = () => dirty && postToHost({ command: 'saveExperience', content: draft });

  // Una línea con fecha al final: el agente lee primero lo más reciente porque solo recibe la cola.
  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    const next = `${draft.trimEnd()}${draft.trim() ? '\n' : ''}- ${today()}: ${text}\n`;
    setDraft(next);
    setNote('');
    postToHost({ command: 'saveExperience', content: next });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="space-y-2 min-w-0 w-full">
      <div className="text-xs font-bold text-zinc-200 px-1 flex items-center gap-2">
        <span>Memoria del proyecto</span>
        {dirty && <span className="text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5">Cambios sin guardar</span>}
      </div>
      <p className="text-[11px] text-zinc-400 px-1">
        Notas que el agente recibe como experiencia previa (.agent-hub/experience.md). Solo se envían los últimos {SENT_TAIL_CHARS.toLocaleString()} caracteres.
      </p>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          addNote();
        }}
      >
        <NotebookPen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-label="Añadir una nota con fecha"
          placeholder="Añadir una nota rápida (se guarda con la fecha de hoy)…"
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
        <button type="submit" disabled={!note.trim()} className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 text-[11px] transition">
          Añadir
        </button>
      </form>
      <div className="relative">
        <textarea
          value={draft}
          rows={16}
          aria-label="Memoria del proyecto"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              save();
            }
          }}
          className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-indigo-500 resize-y"
        />
        {overflow > 0 && (
          <div className="mt-1 p-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-300">
            Los primeros {overflow.toLocaleString()} caracteres quedan fuera: el agente no los ve.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className={`font-mono text-[11px] ${overflow > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
          {draft.length.toLocaleString()} / {SENT_TAIL_CHARS.toLocaleString()} caracteres · {lines} líneas · {words} palabras
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('agenthub:open-document', { detail: '.agent-hub/experience.md' }))}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] transition"
            title="Abrir experience.md en el editor de documentos, con vista previa de Markdown"
          >
            <NotebookPen className="w-3 h-3" />
            En el editor
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={!draft}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 text-[11px] transition"
            title="Copiar toda la memoria"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            Copiar
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => setDraft(experience ?? '')}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 text-[11px] transition"
            title="Volver a lo último guardado"
          >
            <Undo2 className="w-3 h-3" />
            Descartar
          </button>
          <button
            type="button"
            onClick={() => setDraft((current) => `${current.trimEnd()}${current.trim() ? '\n\n' : ''}## Decisiones\n- \n\n## Convenciones\n- \n\n## Pendientes\n- \n`)}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] transition"
            title="Añadir las secciones Decisiones, Convenciones y Pendientes"
          >
            Plantilla
          </button>
          <button
            type="button"
            onClick={() => postToHost({ command: 'pruneExperience' })}
            title="Quita notas repetidas y las más viejas; el resultado se recarga aquí"
            className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] transition"
          >
            Podar duplicados y viejas
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={save}
            title="Guardar (Ctrl+S)"
            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium transition"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
