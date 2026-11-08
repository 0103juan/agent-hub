import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Target,
  GitCommit,
  FlaskConical,
  Repeat,
  ShieldCheck,
  Send,
  X,
  CornerDownLeft,
  Zap
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt: (prompt: string) => void;
  onGenerateCommit: () => void;
  onAuditBranch: () => void;
  onRunTests: () => void;
}

export const SpotlightBar: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmitPrompt,
  onGenerateCommit,
  onAuditBranch,
  onRunTests
}) => {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmitPrompt(trimmed);
    onClose();
  };

  const handleChipClick = (action: string) => {
    if (action === 'loop') {
      setPrompt('/loop ');
      inputRef.current?.focus();
    } else if (action === 'goal') {
      setPrompt('/goal ');
      inputRef.current?.focus();
    } else if (action === 'commit') {
      onGenerateCommit();
      onClose();
    } else if (action === 'tests') {
      onRunTests();
      onClose();
    } else if (action === 'audit') {
      onAuditBranch();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Entrada Principal */}
        <form onSubmit={handleSubmit} className="flex items-center px-4 py-3.5 gap-3 border-b border-zinc-800 bg-zinc-950/80">
          <Zap className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Escribe una instrucción rápida, /goal [objetivo], o presiona Enter..."
            className="flex-1 bg-transparent border-none text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {prompt ? (
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Enviar</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400">ESC</kbd>
              <span>para salir</span>
            </div>
          )}
        </form>

        {/* Acciones Rápidas (Chips) */}
        <div className="p-3 bg-zinc-900/90 space-y-2">
          <div className="text-[11px] font-medium text-zinc-400 px-1">Acciones Rápidas Sugeridas</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => handleChipClick('loop')}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 hover:border-purple-500/50 text-left transition cursor-pointer group"
            >
              <Repeat className="w-4 h-4 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200">Modo Loop</div>
                <div className="text-[10px] text-zinc-400 truncate">Bucle continuo (/loop)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('goal')}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 hover:border-indigo-500/50 text-left transition cursor-pointer group"
            >
              <Target className="w-4 h-4 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200">Modo Meta</div>
                <div className="text-[10px] text-zinc-400 truncate">Bucle con tests (/goal)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('commit')}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/50 text-left transition cursor-pointer group"
            >
              <GitCommit className="w-4 h-4 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200">Auto Commit</div>
                <div className="text-[10px] text-zinc-400 truncate">Convencional semántico</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('tests')}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 hover:border-cyan-500/50 text-left transition cursor-pointer group"
            >
              <FlaskConical className="w-4 h-4 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200">Correr Tests</div>
                <div className="text-[10px] text-zinc-400 truncate">npm test / verificar</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('audit')}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 hover:border-purple-500/50 text-left transition cursor-pointer group"
            >
              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200">Auditar Rama</div>
                <div className="text-[10px] text-zinc-400 truncate">Revisión de seguridad</div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span>Atajo global:</span>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">Alt + Espacio</kbd>
          </div>
          <span>AgentHub Desktop v0.1.0</span>
        </div>
      </div>
    </div>
  );
};
