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
    <aside className="fixed right-0 top-0 bottom-0 w-80 sm:w-96 bg-[#07090e] border-l border-[#202b3f] shadow-2xl z-40 flex flex-col text-xs animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-[#202b3f] bg-[#0a0e17]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 text-slate-200 font-bold tracking-wide" title="Borrador de trabajo (scratchpad.md)">
          <div className="p-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span>Borrador Táctico</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('agenthub:open-document', { detail: '.agent-hub/scratchpad.md' }))}
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer"
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
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-emerald-300 border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer"
            title="Añadir una tarea (- [ ])"
            aria-label="Añadir una tarea"
          >
            <ListChecks className="w-3.5 h-3.5" />
          </button>
          {confirmClear ? (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-rose-300 bg-rose-950/60 border border-rose-800/60 px-2 py-0.5 rounded-md">
              ¿Vaciar?
              <button
                type="button"
                onClick={() => {
                  setText('');
                  setSaved(false);
                  setConfirmClear(false);
                }}
                className="px-1.5 py-0.2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Sí
              </button>
              <button type="button" aria-label="Cancelar" onClick={() => setConfirmClear(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={!text}
              onClick={() => setConfirmClear(true)}
              className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-rose-400 border border-transparent hover:border-[#202b3f] transition-colors disabled:opacity-30 cursor-pointer"
              title="Vaciar el borrador"
              aria-label="Vaciar el borrador"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-white border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer"
            title="Copiar contenido"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition cursor-pointer border ${
              saved
                ? 'bg-[#0c1220] text-slate-400 border-[#202b3f]'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 shadow-xs'
            }`}
            title="Guardar en .agent-hub/scratchpad.md (Ctrl+S; también se guarda solo)"
          >
            <Save className="w-3 h-3" />
            <span>{saved ? 'Guardado' : 'Guardar'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-white border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Textarea */}
      <div className="flex-1 p-3 bg-[#07090e] flex flex-col">
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
          className="flex-1 w-full p-3 bg-transparent border border-[#202b3f]/70 rounded-xl text-slate-200 font-mono text-xs resize-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 leading-relaxed placeholder-slate-600 selection:bg-cyan-500/35 shadow-inner"
        />
      </div>

      {/* Footer con acción de envío */}
      <div className="p-3 border-t border-[#202b3f] bg-[#07090e] flex items-center justify-between gap-2 shrink-0 font-mono">
        <span className="min-w-0 truncate text-[10px] text-slate-400" title=".agent-hub/scratchpad.md">
          {words} palabras · {text.length} car.
        </span>
        <button
          type="button"
          onClick={handleSend}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer shadow-md shadow-cyan-600/30"
        >
          <Send className="w-3 h-3" />
          <span>Enviar al Agente</span>
          <span className="opacity-70 text-[9px] bg-cyan-950/60 text-cyan-200 px-1 py-0.2 rounded font-mono">Ctrl+↵</span>
        </button>
      </div>
    </aside>
  );
};
