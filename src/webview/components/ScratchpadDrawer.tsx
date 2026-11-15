import React, { useState, useEffect } from 'react';
import { FileText, Save, Send, X, Copy, Check, CheckSquare, ListChecks, Trash2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  content: string;
  onClose: () => void;
  onSave: (content: string) => void;
  onSendToAgent: (text: string) => void;
}

export const ScratchpadDrawer: React.FC<Props> = ({
  isOpen,
  content,
  onClose,
  onSave,
  onSendToAgent
}) => {
  const [text, setText] = useState(content);
  const [saved, setSaved] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setText(content);
    setSaved(true);
  }, [content]);

  // Autoguardado 1,5 s después de dejar de escribir.
  useEffect(() => {
    if (saved) return;
    const timer = setTimeout(() => {
      onSave(text);
      setSaved(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [text, saved, onSave]);

  if (!isOpen) return null;

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setSaved(false);
  };

  const handleSave = () => {
    onSave(text);
    setSaved(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSend = () => {
    if (!text.trim()) return;
    onSendToAgent(`[CONTEXTO DEL SCRATCHPAD DE TRABAJO]\n\n${text}`);
    onClose();
  };

  return (
    <aside className="fixed right-0 top-0 bottom-0 w-80 sm:w-96 bg-zinc-950 border-l border-zinc-800 shadow-2xl z-40 flex flex-col text-xs animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
        <div className="flex items-center gap-2 text-zinc-200 font-semibold" title="Borrador de trabajo (scratchpad.md)">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span>Borrador</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('agenthub:open-document', { detail: '.agent-hub/scratchpad.md' }))}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            title="Abrir scratchpad.md en el editor de documentos"
            aria-label="Abrir en el editor de documentos"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setText((current) => `${current}${current && !current.endsWith('\n') ? '\n' : ''}- [ ] `);
              setSaved(false);
            }}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 transition"
            title="Añadir una tarea (- [ ])"
            aria-label="Añadir una tarea"
          >
            <ListChecks className="w-3.5 h-3.5" />
          </button>
          {confirmClear ? (
            <span className="flex items-center gap-1 text-[11px] text-red-300">
              ¿Vaciar?
              <button
                type="button"
                onClick={() => {
                  setText('');
                  setSaved(false);
                  setConfirmClear(false);
                }}
                className="px-1.5 rounded bg-red-700 hover:bg-red-600 text-white"
              >
                Sí
              </button>
              <button type="button" aria-label="Cancelar" onClick={() => setConfirmClear(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={!text}
              onClick={() => setConfirmClear(true)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-300 transition disabled:opacity-30"
              title="Vaciar el borrador"
              aria-label="Vaciar el borrador"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Copiar contenido"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
              saved
                ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Guardar en .agent-hub/scratchpad.md (Ctrl+S; también se guarda solo)"
          >
            <Save className="w-3 h-3" />
            <span>{saved ? 'Guardado' : 'Guardar'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Textarea */}
      <div className="flex-1 p-2 bg-zinc-950 flex flex-col">
        <textarea
          autoFocus
          value={text}
          onChange={handleChange}
          onBlur={() => !saved && handleSave()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault();
              handleSave();
            } else if (e.key === 'Escape') {
              onClose();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            } else if (e.key === 'Tab' && !e.shiftKey) {
              // Tab sangra en vez de salir del campo.
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: start, selectionEnd: end } = el;
              const next = `${text.slice(0, start)}  ${text.slice(end)}`;
              setText(next);
              setSaved(false);
              requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
            }
          }}
          placeholder="Escribe notas, tareas, snippets o requerimientos temporales..."
          className="flex-1 w-full p-2 bg-transparent border-none text-zinc-200 font-mono text-xs resize-none focus:outline-none leading-relaxed placeholder-zinc-600 selection:bg-indigo-600/30"
        />
      </div>

      {/* Footer con acción de envío */}
      <div className="p-2 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-2 shrink-0">
        <span className="min-w-0 truncate text-[10px] text-zinc-500 font-mono" title=".agent-hub/scratchpad.md">
          .agent-hub/scratchpad.md · {words} palabras · {text.length} car.
        </span>
        <button
          type="button"
          onClick={handleSend}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium whitespace-nowrap shrink-0 transition cursor-pointer shadow-xs"
        >
          <Send className="w-3 h-3" />
          <span>Enviar al Agente</span>
          <span className="opacity-60 text-[10px]">Ctrl+⏎</span>
        </button>
      </div>
    </aside>
  );
};
