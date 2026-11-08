import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  Trash2,
  Minimize2,
  Maximize2,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Square
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  output: string;
  onRunCommand: (command: string) => void;
  onClear: () => void;
  running: boolean;
  onStop: () => void;
}

const QUICK_COMMANDS = [
  { label: 'npm test', cmd: 'npm test' },
  { label: 'git status', cmd: 'git status' },
  { label: 'npm run build', cmd: 'npm run build' },
  { label: 'git log', cmd: 'git log -n 5 --oneline' }
];

export const TerminalDrawer: React.FC<Props> = ({
  isOpen,
  onToggle,
  output,
  onRunCommand,
  onClear,
  running,
  onStop
}) => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'terminal' | 'output'>('terminal');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    onRunCommand(trimmed);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        setHistoryIndex(nextIndex);
        setCommand(history[nextIndex]);
      }
    }
  };

  return (
    <div
      className={`border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 transition-all duration-200 z-20 ${
        isExpanded ? 'h-96' : 'h-64'
      }`}
    >
      {/* Bar superior del drawer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <TerminalIcon className="w-4 h-4 text-emerald-400" />
            <span>Terminal Integrada</span>
          </div>
          <div className="h-3.5 w-px bg-zinc-700 mx-1" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('terminal')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                activeTab === 'terminal'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Consola Shell
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('output')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                activeTab === 'output'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Salida del Sistema
            </button>
          </div>
        </div>

        {/* Acciones rápidas & controles */}
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center gap-1 mr-2">
            {QUICK_COMMANDS.map((qc) => (
              <button
                key={qc.cmd}
                type="button"
                onClick={() => onRunCommand(qc.cmd)}
                className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 text-[10px] font-mono transition cursor-pointer"
                title={`Ejecutar: ${qc.cmd}`}
              >
                {qc.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Limpiar consola"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title={isExpanded ? 'Reducir altura' : 'Expandir altura'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Cerrar terminal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Área de texto/stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs text-zinc-300 bg-black/40 leading-relaxed selection:bg-indigo-600/30 whitespace-pre-wrap break-all"
      >
        {output ? (
          output
        ) : (
          <div className="text-zinc-600 text-center py-6 font-sans text-xs">
            Escribe un comando abajo o selecciona una acción rápida para iniciar.
          </div>
        )}
      </div>

      {/* Input de comandos */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 bg-zinc-900 border-t border-zinc-800 shrink-0">
        <span className="text-emerald-400 font-mono text-xs font-bold pl-1">$</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un comando shell (ej. npm test, git status, dir)..."
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
          autoFocus
        />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium transition cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Detener</span>
          </button>
        ) : (
          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Ejecutar</span>
          </button>
        )}
      </form>
    </div>
  );
};
