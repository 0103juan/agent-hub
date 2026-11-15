import React, { useState, useRef, useEffect, useMemo } from 'react';
import { downloadText } from '../utils/format';
import {
  Terminal as TerminalIcon,
  Play,
  Trash2,
  Download,
  Copy,
  Check,
  Minimize2,
  Maximize2,
  X,
  Sparkles,
  Square,
  RotateCcw,
  Plus,
  CornerDownLeft,
  Search,
  History,
  MessageSquarePlus,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Layers,
  PanelRight,
  PanelBottom
} from 'lucide-react';

export type TerminalShell = 'default' | 'pwsh' | 'cmd' | 'bash' | 'wsl';

export interface TerminalTabState {
  id: string;
  title: string;
  cwd?: string;
  shell?: TerminalShell;
  startedAt?: number;
  output: string;
  running: boolean;
  lastCommand?: string;
  lastExitCode?: number;
}

export interface QuickCommand {
  label: string;
  cmd: string;
}

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  tabs: TerminalTabState[];
  activeTabId: string;
  defaultCwd?: string;
  quickCommands?: QuickCommand[];
  snippets?: QuickCommand[];
  dock?: 'bottom' | 'right';
  onToggleDock?: () => void;
  onSaveSnippets?: (snippets: QuickCommand[]) => void;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
  onChangeShell?: (shell: TerminalShell, terminalId: string) => void;
  onRunCommand: (command: string, terminalId: string) => void;
  onSendInput: (data: string, terminalId: string) => void;
  onClear: (terminalId: string) => void;
  onStop: (terminalId: string) => void;
  onPreviewFile?: (file: string, line?: number) => void;
  onAttachToChat?: (tailOutput: string, command?: string) => void;
  onAskAI?: (command: string, exitCode: number, tailOutput: string) => void;
}

const TERMINAL_HISTORY_KEY = 'agent-hub.terminalHistory';
const TERMINAL_HEIGHT_KEY = 'agent-hub.terminalHeight';
const HISTORY_MAX = 100;
const MAX_TERMINAL_LINES = 3000;
const FOLLOW_PX = 40;
const MIN_HEIGHT = 150;
const DEFAULT_HEIGHT = 260;

const DEFAULT_QUICK_COMMANDS: QuickCommand[] = [
  { label: 'npm test', cmd: 'npm test' },
  { label: 'git status', cmd: 'git status' },
  { label: 'npm run build', cmd: 'npm run build' },
  { label: 'git log', cmd: 'git log -n 5 --oneline' }
];

const ANSI_COLORS: Record<number, string> = {
  30: 'text-zinc-500',
  31: 'text-rose-400',
  32: 'text-emerald-400',
  33: 'text-amber-300',
  34: 'text-sky-400',
  35: 'text-fuchsia-400',
  36: 'text-cyan-400',
  37: 'text-zinc-200',
  90: 'text-zinc-500',
  91: 'text-rose-300',
  92: 'text-emerald-300',
  93: 'text-amber-200',
  94: 'text-sky-300',
  95: 'text-fuchsia-300',
  96: 'text-cyan-300',
  97: 'text-white'
};

const LINK_OR_PATH_RE = /(https?:\/\/[^\s"'<>]+|(?:[a-zA-Z]:[\\/]|[a-zA-Z0-9_.-]+[\\/])[a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]{1,8}(?::(\d+)(?::\d+)?)?)/g;

function renderInteractiveText(
  text: string,
  keyPrefix: string,
  searchQuery: string,
  onPreviewFile?: (file: string, line?: number) => void
): React.ReactNode {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(LINK_OR_PATH_RE.source, 'g');

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(highlightSearch(text.slice(lastIndex, match.index), `${keyPrefix}-t-${lastIndex}`, searchQuery));
    }
    const token = match[1];
    const lineNum = match[2] ? Number(match[2]) : undefined;
    if (/^https?:\/\//i.test(token)) {
      parts.push(
        <a
          key={`${keyPrefix}-u-${match.index}`}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-sky-500/60 text-sky-300 hover:text-sky-200"
        >
          {token}
        </a>
      );
    } else if (onPreviewFile) {
      const filePath = token.replace(/:\d+(?::\d+)?$/, '');
      parts.push(
        <button
          key={`${keyPrefix}-f-${match.index}`}
          type="button"
          onClick={() => onPreviewFile(filePath, lineNum)}
          className="underline decoration-indigo-400/60 text-indigo-300 hover:text-indigo-200 cursor-pointer font-mono"
          title={`Abrir ${filePath}${lineNum ? `:${lineNum}` : ''}`}
        >
          {token}
        </button>
      );
    } else {
      parts.push(token);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(highlightSearch(text.slice(lastIndex), `${keyPrefix}-e-${lastIndex}`, searchQuery));
  }
  return parts.length > 0 ? parts : text;
}

function highlightSearch(text: string, keyPrefix: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (!lower.includes(q)) return text;
  const out: React.ReactNode[] = [];
  let pos = 0;
  let idx = lower.indexOf(q, pos);
  while (idx !== -1) {
    if (idx > pos) out.push(text.slice(pos, idx));
    out.push(
      <mark key={`${keyPrefix}-${idx}`} className="bg-amber-400/35 text-amber-100 rounded-xs px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    pos = idx + query.length;
    idx = lower.indexOf(q, pos);
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/** Renderiza códigos SGR ANSI básicos (`\x1b[...m`) junto a rutas y búsqueda. */
function renderAnsiLine(
  line: string,
  lineIdx: number,
  searchQuery: string,
  onPreviewFile?: (file: string, line?: number) => void
): React.ReactNode {
  if (!line) return ' ';
  if (!line.includes('\x1b[')) {
    return renderInteractiveText(line, `l${lineIdx}`, searchQuery, onPreviewFile);
  }
  const parts: React.ReactNode[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let colorClass = '';
  let bold = false;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      const text = line.slice(lastIndex, match.index);
      const cls = [colorClass, bold ? 'font-semibold' : ''].filter(Boolean).join(' ');
      const content = renderInteractiveText(text, `l${lineIdx}-${lastIndex}`, searchQuery, onPreviewFile);
      parts.push(cls ? <span key={lastIndex} className={cls}>{content}</span> : content);
    }
    const codes = (match[1] || '0').split(';').map((n) => Number(n));
    for (const code of codes) {
      if (code === 0) {
        colorClass = '';
        bold = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (code === 39) {
        colorClass = '';
      } else if (ANSI_COLORS[code]) {
        colorClass = ANSI_COLORS[code];
      }
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    const text = line.slice(lastIndex);
    const cls = [colorClass, bold ? 'font-semibold' : ''].filter(Boolean).join(' ');
    const content = renderInteractiveText(text, `l${lineIdx}-${lastIndex}`, searchQuery, onPreviewFile);
    parts.push(cls ? <span key={lastIndex} className={cls}>{content}</span> : content);
  }
  return parts.length > 0 ? parts : ' ';
}

function formatCwdLabel(cwd?: string): string {
  if (!cwd) return '~';
  const normalized = cwd.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

export const TerminalDrawer: React.FC<Props> = ({
  isOpen,
  onToggle,
  tabs,
  activeTabId,
  defaultCwd,
  quickCommands,
  snippets = [],
  dock = 'bottom',
  onToggleDock,
  onSaveSnippets,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onChangeShell,
  onRunCommand,
  onSendInput,
  onClear,
  onStop,
  onPreviewFile,
  onAttachToChat,
  onAskAI
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const output = activeTab?.output ?? '';
  const running = activeTab?.running ?? false;
  const currentCwd = activeTab?.cwd || defaultCwd;
  const effectiveQuickCommands = quickCommands && quickCommands.length > 0 ? quickCommands : DEFAULT_QUICK_COMMANDS;

  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TERMINAL_HISTORY_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [height, setHeight] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(TERMINAL_HEIGHT_KEY));
      return Number.isFinite(saved) && saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT;
    } catch {
      return DEFAULT_HEIGHT;
    }
  });
  const follow = useRef(true);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [blockView, setBlockView] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<number, boolean>>({});
  const [isSnippetsOpen, setIsSnippetsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => {
    if (!output) return [];
    const all = output.split('\n');
    return all.length > MAX_TERMINAL_LINES ? all.slice(-MAX_TERMINAL_LINES) : all;
  }, [output]);

  const commandBlocks = useMemo(() => {
    if (!blockView || lines.length === 0) return [];
    const blocks: Array<{ id: number; command: string; lines: string[]; exitCode?: number }> = [];
    let current: { id: number; command: string; lines: string[]; exitCode?: number } | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\$ /.test(line)) {
        if (current) blocks.push(current);
        current = { id: blocks.length, command: line.slice(2), lines: [] };
      } else {
        if (!current) current = { id: blocks.length, command: 'Salida inicial', lines: [] };
        const exitMatch = line.match(/^\[Proceso terminado con código (\d+)\]$/);
        if (exitMatch) current.exitCode = Number(exitMatch[1]);
        current.lines.push(line);
      }
    }
    if (current) blocks.push(current);
    return blocks;
  }, [blockView, lines]);

  const matchCount = useMemo(() => {
    if (!isSearchOpen || !searchQuery) return 0;
    const q = searchQuery.toLowerCase();
    let count = 0;
    for (const line of lines) {
      const lower = line.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      let idx = lower.indexOf(q);
      while (idx !== -1) {
        count++;
        idx = lower.indexOf(q, idx + q.length);
      }
    }
    return count;
  }, [lines, isSearchOpen, searchQuery]);

  const filteredHistory = useMemo(() => {
    const unique = [...history].reverse();
    if (!historyFilter.trim()) return unique.slice(0, 12);
    const q = historyFilter.toLowerCase();
    return unique.filter((item) => item.toLowerCase().includes(q)).slice(0, 12);
  }, [history, historyFilter]);

  const suggestion = useMemo(() => {
    if (running || !command || command.includes('\n')) return '';
    const candidates = [...[...history].reverse(), ...effectiveQuickCommands.map((q) => q.cmd)];
    const found = candidates.find((item) => item.startsWith(command) && item !== command);
    return found ?? '';
  }, [running, command, history, effectiveQuickCommands]);

  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [running, activeTab?.id]);

  useEffect(() => {
    if (scrollRef.current && follow.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, isOpen, activeTab?.id]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const maxH = Math.max(260, Math.floor(window.innerHeight * 0.75));
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(maxH, Math.max(MIN_HEIGHT, startH + (startY - ev.clientY)));
      setHeight(next);
      setIsExpanded(false);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(TERMINAL_HEIGHT_KEY, String(heightRef.current));
      } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const heightRef = useRef(height);
  heightRef.current = height;

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (!isOpen || !activeTab) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (running) {
      onSendInput(command, activeTab.id);
      follow.current = true;
      setCommand('');
      return;
    }
    const trimmed = command.trim();
    if (!trimmed) return;
    onRunCommand(trimmed, activeTab.id);
    setHistory((prev) => {
      const next = [...prev.filter((item) => item !== trimmed), trimmed].slice(-HISTORY_MAX);
      try {
        localStorage.setItem(TERMINAL_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    follow.current = true;
    setHistoryIndex(-1);
    setIsHistorySearchOpen(false);
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      onClear(activeTab.id);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setIsSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      setIsHistorySearchOpen((v) => !v);
      setHistoryFilter('');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && running && !window.getSelection()?.toString()) {
      e.preventDefault();
      onStop(activeTab.id);
    } else if (e.key === 'Escape') {
      if (isHistorySearchOpen) setIsHistorySearchOpen(false);
      else if (isSearchOpen) { setIsSearchOpen(false); setSearchQuery(''); }
      else inputRef.current?.blur();
    } else if (!running && e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setCommand(suggestion);
    } else if (!running && e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex]);
    } else if (!running && e.key === 'ArrowDown') {
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

  const canAskAI = Boolean(onAskAI && !running && activeTab.lastExitCode !== undefined && activeTab.lastExitCode !== 0 && activeTab.lastCommand);

  return (
    <div
      style={dock === 'bottom' ? { height: isExpanded ? '85vh' : `${height}px` } : undefined}
      className={
        dock === 'right'
          ? 'w-[42vw] min-w-[320px] max-w-[680px] h-full border-l border-zinc-800 bg-zinc-950 flex flex-col shrink-0 z-20 relative'
          : 'border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 z-20 relative'
      }
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setIsSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      }}
    >
      {/* Barra de arrastre superior para redimensionar */}
      {dock === 'bottom' && (
        <div
          onMouseDown={startResize}
          className="h-1.5 w-full cursor-ns-resize hover:bg-indigo-500/40 transition-colors shrink-0"
          title="Arrastra para ajustar la altura de la terminal"
        />
      )}

      {/* Barra superior del drawer */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-900 border-b border-zinc-800 text-xs shrink-0 select-none gap-2 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium shrink-0">
            <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden min-[540px]:inline">Terminal</span>
            {currentCwd && (
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded" title={currentCwd}>
                {formatCwdLabel(currentCwd)}
              </span>
            )}
          </div>
          <div className="h-3.5 w-px bg-zinc-700 mx-1 shrink-0" />
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const isSelected = tab.id === activeTab.id;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition ${
                    isSelected
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    {tab.running ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    ) : tab.lastExitCode !== undefined ? (
                      <span
                        className={`text-[10px] font-mono ${tab.lastExitCode === 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        title={`Último código de salida: ${tab.lastExitCode}`}
                      >
                        {tab.lastExitCode === 0 ? '✓' : `✗${tab.lastExitCode}`}
                      </span>
                    ) : null}
                    <span>{tab.title}</span>
                  </button>
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onCloseTab(tab.id)}
                      className="text-zinc-500 hover:text-zinc-200 cursor-pointer ml-0.5"
                      title="Cerrar pestaña"
                      aria-label={`Cerrar ${tab.title}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={onNewTab}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              title="Nueva pestaña de terminal"
              aria-label="Nueva pestaña de terminal"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Acciones rápidas & controles */}
        <div className="flex items-center gap-1 shrink-0">
          {onChangeShell && (
            <select
              value={activeTab.shell ?? 'default'}
              onChange={(e) => onChangeShell(e.target.value as TerminalShell, activeTab.id)}
              disabled={running}
              className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-indigo-500 disabled:opacity-50 cursor-pointer"
              title="Shell de esta pestaña"
              aria-label="Selector de shell"
            >
              <option value="default">Auto</option>
              <option value="pwsh">pwsh</option>
              <option value="cmd">cmd</option>
              <option value="bash">bash</option>
              <option value="wsl">wsl</option>
            </select>
          )}
          {dock === 'bottom' && (
            <div className="hidden lg:flex items-center gap-1 mr-1">
              {effectiveQuickCommands.map((qc) => (
                <button
                  key={qc.cmd}
                  type="button"
                  onClick={() => onRunCommand(qc.cmd, activeTab.id)}
                  className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 text-[10px] font-mono transition cursor-pointer"
                  title={`Ejecutar: ${qc.cmd}`}
                >
                  {qc.label}
                </button>
              ))}
            </div>
          )}

          {canAskAI && (
            <button
              type="button"
              onClick={() => {
                const tail = lines.slice(-50).join('\n');
                onAskAI?.(activeTab.lastCommand!, activeTab.lastExitCode!, tail);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 text-[11px] font-medium transition cursor-pointer"
              title="Enviar error al agente para analizar y corregir"
            >
              <Sparkles className="w-3 h-3" />
              <span className="hidden sm:inline">Corregir con IA</span>
            </button>
          )}

          {running && <span className="font-mono text-[11px] text-amber-300" title="Tiempo del comando en curso">{elapsed} s</span>}
          {history.length > 0 && !running && (
            <button
              type="button"
              onClick={() => onRunCommand(history[history.length - 1], activeTab.id)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title={`Volver a ejecutar: ${history[history.length - 1]}`}
              aria-label="Volver a ejecutar el último comando"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setBlockView((v) => !v)}
            className={`p-1 rounded transition ${blockView ? 'bg-zinc-800 text-indigo-300' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            title={blockView ? 'Vista continua' : 'Agrupar por bloques de comando'}
            aria-label="Alternar vista por bloques"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          {onSaveSnippets && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSnippetsOpen((v) => !v)}
                className={`p-1 rounded transition ${isSnippetsOpen ? 'bg-zinc-800 text-amber-300' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                title="Snippets del proyecto (.agent-hub/terminal-snippets.json)"
                aria-label="Snippets del proyecto"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>
              {isSnippetsOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl p-2 z-30 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-300">
                    <span>Snippets del proyecto</span>
                    {(command.trim() || activeTab.lastCommand) && (
                      <button
                        type="button"
                        onClick={() => {
                          const cmdToSave = command.trim() || activeTab.lastCommand || '';
                          if (!cmdToSave) return;
                          const next = [...snippets.filter((s) => s.cmd !== cmdToSave), { label: cmdToSave, cmd: cmdToSave }];
                          onSaveSnippets(next);
                        }}
                        className="text-indigo-300 hover:text-indigo-200 text-[10px] cursor-pointer"
                      >
                        + Guardar actual
                      </button>
                    )}
                  </div>
                  {snippets.length === 0 ? (
                    <div className="text-[11px] text-zinc-500 py-1">Sin snippets guardados aún.</div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {snippets.map((s) => (
                        <div key={s.cmd} className="flex items-center justify-between gap-1 group">
                          <button
                            type="button"
                            onClick={() => {
                              onRunCommand(s.cmd, activeTab.id);
                              setIsSnippetsOpen(false);
                            }}
                            className="flex-1 text-left px-1.5 py-1 rounded hover:bg-zinc-800 font-mono text-[11px] text-zinc-200 truncate cursor-pointer"
                            title={s.cmd}
                          >
                            {s.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSaveSnippets(snippets.filter((item) => item.cmd !== s.cmd))}
                            className="p-0.5 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Eliminar snippet"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((v) => !v);
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            className={`p-1 rounded transition ${isSearchOpen ? 'bg-zinc-800 text-indigo-300' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            title="Buscar en la salida (Ctrl+F)"
            aria-label="Buscar en la salida"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          {onAttachToChat && (
            <button
              type="button"
              onClick={() => onAttachToChat(lines.slice(-60).join('\n'), activeTab.lastCommand)}
              disabled={!output}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-30"
              title="Adjuntar salida al chat"
              aria-label="Adjuntar salida al chat"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadText(`terminal-${activeTab.id}-${Date.now()}.log`, output)}
            disabled={!output}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-30"
            title="Guardar la salida en un archivo .log"
            aria-label="Guardar la salida en un archivo"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={copyOutput}
            disabled={!output}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-30"
            title="Copiar la salida de la consola"
            aria-label="Copiar la salida de la consola"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onClear(activeTab.id)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Limpiar consola"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {onToggleDock && (
            <button
              type="button"
              onClick={onToggleDock}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title={dock === 'bottom' ? 'Acoplar a la derecha' : 'Acoplar abajo'}
              aria-label="Cambiar posición de la terminal"
            >
              {dock === 'bottom' ? <PanelRight className="w-3.5 h-3.5" /> : <PanelBottom className="w-3.5 h-3.5" />}
            </button>
          )}
          {dock === 'bottom' && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title={isExpanded ? 'Reducir altura' : 'Expandir altura'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
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

      {/* Barra de búsqueda en salida (Ctrl+F) */}
      {isSearchOpen && (
        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/95 border-b border-zinc-800 text-xs shrink-0">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsSearchOpen(false);
                setSearchQuery('');
                inputRef.current?.focus();
              }
            }}
            placeholder="Buscar en la salida..."
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          />
          {searchQuery && (
            <span className="text-[11px] font-mono text-zinc-400">
              {matchCount} {matchCount === 1 ? 'coincidencia' : 'coincidencias'}
            </span>
          )}
          <button
            type="button"
            onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
            className="p-0.5 text-zinc-400 hover:text-zinc-200"
            title="Cerrar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Área de texto/stream */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_PX;
        }}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs text-zinc-300 bg-black/40 leading-relaxed selection:bg-indigo-600/30 whitespace-pre-wrap break-all"
      >
        {lines.length > 0 ? (
          blockView ? (
            <div className="space-y-2">
              {commandBlocks.map((blk) => {
                const isCollapsed = Boolean(collapsedBlocks[blk.id]);
                return (
                  <div key={blk.id} className="rounded border border-zinc-800 bg-zinc-950/80 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-zinc-900/90 border-b border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => setCollapsedBlocks((prev) => ({ ...prev, [blk.id]: !prev[blk.id] }))}
                        className="flex items-center gap-1.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                        <span className="text-emerald-400 font-semibold truncate">$ {blk.command}</span>
                        {blk.exitCode !== undefined && (
                          <span className={`text-[10px] px-1 rounded ${blk.exitCode === 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                            {blk.exitCode === 0 ? '✓ 0' : `✗ ${blk.exitCode}`}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(blk.lines.join('\n'))}
                          className="p-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                          title="Copiar salida del bloque"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {blk.command !== 'Salida inicial' && !running && (
                          <button
                            type="button"
                            onClick={() => onRunCommand(blk.command, activeTab.id)}
                            className="p-0.5 text-zinc-400 hover:text-emerald-300 cursor-pointer"
                            title="Volver a ejecutar este comando"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="p-2">
                        {blk.lines.map((line, lIdx) => (
                          <div key={lIdx}>
                            {renderAnsiLine(line, lIdx, isSearchOpen ? searchQuery : '', onPreviewFile)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            lines.map((line, index) => {
              const lineClass = /^\$ /.test(line)
                ? 'text-emerald-400 font-semibold'
                : /^> /.test(line)
                  ? 'text-indigo-300'
                  : !line.includes('\x1b[') && /\b(error|fail(ed)?|ERR!|fatal|exception)\b/i.test(line)
                    ? 'text-rose-300'
                    : !line.includes('\x1b[') && /\bwarn(ing)?\b/i.test(line)
                      ? 'text-amber-300'
                      : undefined;
              return (
                <div key={index} className={lineClass}>
                  {renderAnsiLine(line, index, isSearchOpen ? searchQuery : '', onPreviewFile)}
                </div>
              );
            })
          )
        ) : (
          <div className="text-zinc-400 text-center py-6 font-sans text-xs [overflow-wrap:normal] break-normal">
            Escribe un comando abajo o selecciona una acción rápida para iniciar.
          </div>
        )}
      </div>

      {/* Búsqueda inversa en historial (Ctrl+R) */}
      {isHistorySearchOpen && history.length > 0 && (
        <div className="border-t border-zinc-800 bg-zinc-900/95 px-2.5 py-1.5 text-xs shrink-0 space-y-1">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <input
              type="text"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsHistorySearchOpen(false);
                  inputRef.current?.focus();
                } else if (e.key === 'Enter' && filteredHistory[0]) {
                  e.preventDefault();
                  setCommand(filteredHistory[0]);
                  setIsHistorySearchOpen(false);
                  inputRef.current?.focus();
                }
              }}
              placeholder="Filtrar historial (Ctrl+R)..."
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setIsHistorySearchOpen(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-28 overflow-y-auto space-y-0.5">
            {filteredHistory.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setCommand(item);
                  setIsHistorySearchOpen(false);
                  inputRef.current?.focus();
                }}
                className="w-full text-left px-2 py-0.5 rounded font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white truncate cursor-pointer"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input de comandos o stdin */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 bg-zinc-900 border-t border-zinc-800 shrink-0">
        <span className="text-emerald-400 font-mono text-xs font-bold pl-1">
          {running ? '>' : '$'}
        </span>
        <div className="relative flex-1 flex items-center bg-zinc-950 border border-zinc-800 rounded focus-within:border-indigo-500 overflow-hidden">
          {suggestion && (
            <div
              aria-hidden="true"
              className="absolute inset-0 px-2.5 py-1 text-xs font-mono pointer-events-none whitespace-pre overflow-hidden text-zinc-600"
            >
              <span className="invisible">{command}</span>
              <span>{suggestion.slice(command.length)}</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              running
                ? 'Proceso en ejecución: escribe entrada para stdin (ej. y) o Ctrl+C para detener...'
                : 'Escribe un comando shell (Tab autocompleta, Ctrl+R historial, Ctrl+F buscar)...'
            }
            className="w-full bg-transparent px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none placeholder-zinc-600 relative z-10"
            autoFocus
          />
        </div>
        {history.length > 0 && !running && (
          <button
            type="button"
            onClick={() => setIsHistorySearchOpen((v) => !v)}
            className={`p-1.5 rounded border border-zinc-800 transition cursor-pointer ${
              isHistorySearchOpen ? 'bg-zinc-800 text-indigo-300' : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Buscar en historial (Ctrl+R)"
            aria-label="Buscar en historial"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        )}
        {running ? (
          <>
            <button
              type="submit"
              className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition cursor-pointer"
              title="Enviar línea a stdin"
            >
              <CornerDownLeft className="w-3 h-3" />
              <span>Enviar</span>
            </button>
            <button
              type="button"
              onClick={() => onStop(activeTab.id)}
              className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium transition cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Detener</span>
            </button>
          </>
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
