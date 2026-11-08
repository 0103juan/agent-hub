import React, { useState, useEffect } from 'react';
import {
  FileText,
  Save,
  Send,
  X,
  Copy,
  Check,
  CheckSquare
} from 'lucide-react';

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

  useEffect(() => {
    setText(content);
    setSaved(true);
  }, [content]);

  if (!isOpen) return null;

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
        <div className="flex items-center gap-2 text-zinc-200 font-semibold">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span>Borrador (Scratchpad)</span>
        </div>
        <div className="flex items-center gap-1.5">
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
            title="Guardar en .agent-hub/scratchpad.md"
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
          value={text}
          onChange={handleChange}
          onBlur={handleSave}
          placeholder="Escribe notas, tareas, snippets o requerimientos temporales..."
          className="flex-1 w-full p-2 bg-transparent border-none text-zinc-200 font-mono text-xs resize-none focus:outline-none leading-relaxed placeholder-zinc-600 selection:bg-indigo-600/30"
        />
      </div>

      {/* Footer con acción de envío */}
      <div className="p-2 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-zinc-500 font-mono">
          .agent-hub/scratchpad.md
        </span>
        <button
          type="button"
          onClick={handleSend}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer shadow-xs"
        >
          <Send className="w-3 h-3" />
          <span>Enviar al Agente</span>
        </button>
      </div>
    </aside>
  );
};
