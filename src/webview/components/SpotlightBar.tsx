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

/** La misma lista que usa el cuadro de mensajes del chat. */
const PROMPT_HISTORY_KEY = 'agent-hub.promptHistory';
const RECENT_SHOWN = 5;

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const historyPos = useRef(-1);

  // Al cerrar, el foco vuelve al elemento que abrió la barra Spotlight.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, [isOpen]);

  // Trampa de foco accesible (Tab y Shift+Tab ciclan dentro de Spotlight).
  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const readHistory = (): string[] => {
    try {
      const list = JSON.parse(localStorage.getItem(PROMPT_HISTORY_KEY) ?? '[]');
      return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };

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
    try {
      const list = readHistory().filter((item) => item !== trimmed);
      localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify([...list, trimmed].slice(-50)));
    } catch {}
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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-20 px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-label="Barra de ejecución rápida Spotlight"
        className="w-full max-w-2xl bg-[#0a0e17] border border-[#202b3f] rounded-2xl shadow-2xl shadow-black/80 overflow-hidden animate-in zoom-in-95 duration-150 ring-1 ring-cyan-500/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Entrada Principal */}
        <form onSubmit={handleSubmit} className="flex items-center px-4 py-3.5 gap-3 border-b border-[#202b3f] bg-[#07090e]">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center shrink-0 shadow-sm shadow-cyan-500/10">
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => {
              historyPos.current = -1;
              setPrompt(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              const history = readHistory();
              if (history.length === 0) return;
              e.preventDefault();
              historyPos.current = e.key === 'ArrowUp' ? Math.min(historyPos.current + 1, history.length - 1) : Math.max(historyPos.current - 1, -1);
              setPrompt(historyPos.current < 0 ? '' : history[history.length - 1 - historyPos.current]);
            }}
            placeholder="Escribe una instrucción rápida, /goal [objetivo], o presiona Enter..."
            className="flex-1 bg-transparent border-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
          {prompt ? (
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f] text-slate-300">ESC</kbd>
              <span className="text-slate-500">para salir</span>
            </div>
          )}
        </form>

        {/* Acciones Rápidas (Chips) */}
        <div className="p-3.5 bg-[#0a0e17] space-y-2.5">
          {!prompt && readHistory().length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 px-1">
                <span>Recientes (↑ ↓ para recorrerlos)</span>
                <span className="text-[10px] font-mono text-slate-500">historial</span>
              </div>
              <div className="space-y-0.5">
                {readHistory().slice(-RECENT_SHOWN).reverse().map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setPrompt(item);
                      inputRef.current?.focus();
                    }}
                    className="block w-full truncate text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-[#162035] hover:text-white transition cursor-pointer border border-transparent hover:border-[#202b3f]"
                    title={item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400 px-1 pt-1">Acciones Rápidas Sugeridas</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => handleChipClick('loop')}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-violet-500/50 text-left transition cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-violet-950/60 border border-violet-500/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Repeat className="w-3.5 h-3.5 text-violet-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">Modo Loop</div>
                <div className="text-[10px] text-slate-400 truncate">Bucle continuo</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('goal')}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-amber-500/50 text-left transition cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-500/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Target className="w-3.5 h-3.5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">Modo Meta</div>
                <div className="text-[10px] text-slate-400 truncate">Meta con tests</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('commit')}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-emerald-500/50 text-left transition cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <GitCommit className="w-3.5 h-3.5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">Auto Commit</div>
                <div className="text-[10px] text-slate-400 truncate">Git semántico</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('tests')}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-cyan-500/50 text-left transition cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FlaskConical className="w-3.5 h-3.5 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">Correr Tests</div>
                <div className="text-[10px] text-slate-400 truncate">npm test / verif</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChipClick('audit')}
              className="flex items-center gap-2 p-2 rounded-xl bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-cyan-500/50 text-left transition cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200">Auditar Rama</div>
                <div className="text-[10px] text-slate-400 truncate">Seguridad diffs</div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-[#07090e] border-t border-[#202b3f] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Atajo global:</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#0c1220] border border-[#202b3f] text-slate-300 font-mono">Alt + Espacio</kbd>
          </div>
          <span className="text-slate-500">AgentHub Desktop v0.1.0 • Tactical HUD</span>
        </div>
      </div>
    </div>
  );
};
