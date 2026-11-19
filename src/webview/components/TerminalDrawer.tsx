import React, { useState, useRef, useEffect, useMemo } from 'react';
import { terminalHistoryKey } from '../../shared/terminal-history';
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
  30: 'text-slate-500',
  31: 'text-rose-400',
  32: 'text-emerald-400',
  33: 'text-amber-300',
  34: 'text-sky-400',
  35: 'text-fuchsia-400',
  36: 'text-cyan-400',
  37: 'text-slate-200',
  90: 'text-slate-500',
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
          className="underline decoration-cyan-400/60 text-cyan-300 hover:text-cyan-200 cursor-pointer font-mono"
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
  const historyKey = terminalHistoryKey(defaultCwd);
  const readHistory = (key: string): string[] => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };
  const [history, setHistory] = useState<string[]>(() => readHistory(historyKey));
  useEffect(() => {
    setHistory(readHistory(historyKey));
    setHistoryIndex(-1);
  }, [historyKey]);
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
        localStorage.setItem(historyKey, JSON.stringify(next));
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
          ? 'w-[42vw] min-w-[320px] max-w-[680px] h-full border-l border-[#202b3f] bg-[#07090e] flex flex-col shrink-0 z-20 relative shadow-2xl'
          : 'border-t border-[#202b3f] bg-[#07090e] flex flex-col shrink-0 z-20 relative shadow-2xl'
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
          className="h-1.5 w-full cursor-ns-resize hover:bg-cyan-500/50 bg-[#0a0e17] border-b border-[#202b3f]/50 transition-colors shrink-0"
          title="Arrastra para ajustar la altura de la terminal"
        />
      )}

      {/* Barra superior del drawer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0e17]/95 border-b border-[#202b3f] text-xs shrink-0 select-none gap-2 overflow-hidden backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold tracking-wide shrink-0">
            <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden min-[540px]:inline">Terminal</span>
            {currentCwd && (
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded-md" title={currentCwd}>
                {formatCwdLabel(currentCwd)}
              </span>
            )}
          </div>
          <div className="h-4 w-px bg-[#202b3f] mx-1 shrink-0" />
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const isSelected = tab.id === activeTab.id;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition ${
                    isSelected
                      ? 'bg-[#0c1220] text-cyan-200 border border-cyan-500/40 font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1220]/60 border border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    {tab.running ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                    ) : tab.lastExitCode !== undefined ? (
                      <span
                        className={`text-[10px] font-mono font-bold ${tab.lastExitCode === 0 ? 'text-emerald-400' : 'text-rose-400'}`}
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
                      className="text-slate-500 hover:text-rose-400 cursor-pointer ml-1 transition-colors"
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
              className="p-1 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-cyan-400 border border-transparent hover:border-[#202b3f] transition cursor-pointer"
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
              className="bg-[#07090e] border border-[#202b3f] rounded-lg px-2 py-1 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
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
                  className="px-2 py-1 rounded-lg bg-[#0c1220] hover:bg-[#202b3f] text-slate-300 hover:text-cyan-300 border border-[#202b3f] text-[10px] font-mono font-medium transition cursor-pointer shadow-xs"
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/35 text-[11px] font-semibold transition cursor-pointer shadow-xs hover:border-violet-400/50"
              title="Enviar error al agente para analizar y corregir"
            >
              <Sparkles className="w-3 h-3 text-violet-300" />
              <span className="hidden sm:inline">Corregir con IA</span>
            </button>
          )}

          {running && (
            <span className="font-mono text-[11px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md" title="Tiempo del comando en curso">
              {elapsed} s
            </span>
          )}
          {history.length > 0 && !running && (
            <button
              type="button"
              onClick={() => onRunCommand(history[history.length - 1], activeTab.id)}
              className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition cursor-pointer"
              title={`Volver a ejecutar: ${history[history.length - 1]}`}
              aria-label="Volver a ejecutar el último comando"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setBlockView((v) => !v)}
            className={`p-1.5 rounded-lg transition cursor-pointer border ${
              blockView
                ? 'bg-[#0c1220] text-cyan-400 border-cyan-500/40'
                : 'hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border-transparent hover:border-[#202b3f]'
            }`}
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
                className={`p-1.5 rounded-lg transition cursor-pointer border ${
                  isSnippetsOpen
                    ? 'bg-[#0c1220] text-amber-300 border-amber-500/40'
                    : 'hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border-transparent hover:border-[#202b3f]'
                }`}
                title="Snippets del proyecto (.agent-hub/terminal-snippets.json)"
                aria-label="Snippets del proyecto"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>
              {isSnippetsOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-[#202b3f] bg-[#0a0e17] shadow-2xl p-2.5 z-30 space-y-1.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200 pb-1 border-b border-[#202b3f]">
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
                        className="text-cyan-400 hover:text-cyan-300 text-[10px] font-medium cursor-pointer"
                      >
                        + Guardar actual
                      </button>
                    )}
                  </div>
                  {snippets.length === 0 ? (
                    <div className="text-[11px] text-slate-500 py-1.5 text-center font-mono">Sin snippets guardados aún.</div>
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
                            className="flex-1 text-left px-2 py-1 rounded-lg hover:bg-[#0c1220] font-mono text-[11px] text-slate-200 hover:text-cyan-300 truncate cursor-pointer transition-colors"
                            title={s.cmd}
                          >
                            {s.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSaveSnippets(snippets.filter((item) => item.cmd !== s.cmd))}
                            className="p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
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
            className={`p-1.5 rounded-lg transition cursor-pointer border ${
              isSearchOpen
                ? 'bg-[#0c1220] text-cyan-400 border-cyan-500/40'
                : 'hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border-transparent hover:border-[#202b3f]'
            }`}
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
              className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition disabled:opacity-30 cursor-pointer"
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
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition disabled:opacity-30 cursor-pointer"
            title="Guardar la salida en un archivo .log"
            aria-label="Guardar la salida en un archivo"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={copyOutput}
            disabled={!output}
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition disabled:opacity-30 cursor-pointer"
            title="Copiar la salida de la consola"
            aria-label="Copiar la salida de la consola"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onClear(activeTab.id)}
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition cursor-pointer"
            title="Limpiar consola"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {onToggleDock && (
            <button
              type="button"
              onClick={onToggleDock}
              className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition cursor-pointer"
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
              className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#202b3f] transition cursor-pointer"
              title={isExpanded ? 'Reducir altura' : 'Expandir altura'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-rose-400 border border-transparent hover:border-[#202b3f] transition cursor-pointer"
            title="Cerrar terminal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Barra de búsqueda en salida (Ctrl+F) */}
      {isSearchOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0e17]/95 border-b border-[#202b3f] text-xs shrink-0">
          <Search className="w-3.5 h-3.5 text-cyan-400" />
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
            className="flex-1 bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          />
          {searchQuery && (
            <span className="text-[11px] font-mono text-slate-400">
              {matchCount} {matchCount === 1 ? 'coincidencia' : 'coincidencias'}
            </span>
          )}
          <button
            type="button"
            onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-[#0c1220] cursor-pointer"
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
        className="flex-1 overflow-y-auto p-3.5 font-mono text-xs text-slate-300 bg-[#07090e] leading-relaxed selection:bg-cyan-600/40 selection:text-white whitespace-pre-wrap break-all"
      >
        {lines.length > 0 ? (
          blockView ? (
            <div className="space-y-2.5">
              {commandBlocks.map((blk) => {
                const isCollapsed = Boolean(collapsedBlocks[blk.id]);
                return (
                  <div key={blk.id} className="rounded-xl border border-[#202b3f] bg-[#07090e] overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0a0e17] border-b border-[#202b3f]/80">
                      <button
                        type="button"
                        onClick={() => setCollapsedBlocks((prev) => ({ ...prev, [blk.id]: !prev[blk.id] }))}
                        className="flex items-center gap-1.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        <span className="text-emerald-400 font-semibold truncate">$ {blk.command}</span>
                        {blk.exitCode !== undefined && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ${blk.exitCode === 0 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'}`}>
                            {blk.exitCode === 0 ? '✓ 0' : `✗ ${blk.exitCode}`}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(blk.lines.join('\n'))}
                          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#0c1220] cursor-pointer transition-colors"
                          title="Copiar salida del bloque"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {blk.command !== 'Salida inicial' && !running && (
                          <button
                            type="button"
                            onClick={() => onRunCommand(blk.command, activeTab.id)}
                            className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-[#0c1220] cursor-pointer transition-colors"
                            title="Volver a ejecutar este comando"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="p-3 bg-[#07090e]/60">
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
                  ? 'text-cyan-300'
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
          <div className="text-slate-400 text-center py-8 font-sans text-xs [overflow-wrap:normal] break-normal">
            Escribe un comando abajo o selecciona una acción rápida para iniciar.
          </div>
        )}
      </div>

      {/* Búsqueda inversa en historial (Ctrl+R) */}
      {isHistorySearchOpen && history.length > 0 && (
        <div className="border-t border-[#202b3f] bg-[#0a0e17]/95 px-3 py-2 text-xs shrink-0 space-y-1.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-cyan-400" />
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
              className="flex-1 bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setIsHistorySearchOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-[#0c1220]"
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
                className="w-full text-left px-2 py-1 rounded-md font-mono text-[11px] text-slate-300 hover:bg-[#0c1220] hover:text-cyan-300 truncate cursor-pointer transition-colors"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input de comandos o stdin */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2.5 bg-[#0a0e17] border-t border-[#202b3f] shrink-0">
        <span className="text-emerald-400 font-mono text-sm font-bold pl-1.5 select-none drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
          {running ? '>' : '$'}
        </span>
        <div className="relative flex-1 flex items-center bg-[#07090e] border border-[#202b3f] rounded-xl focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/30 overflow-hidden shadow-inner">
          {suggestion && (
            <div
              aria-hidden="true"
              className="absolute inset-0 px-3 py-1.5 text-xs font-mono pointer-events-none whitespace-pre overflow-hidden text-slate-600"
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
            className="w-full bg-transparent px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none placeholder-slate-600 relative z-10"
            autoFocus
          />
        </div>
        {history.length > 0 && !running && (
          <button
            type="button"
            onClick={() => setIsHistorySearchOpen((v) => !v)}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isHistorySearchOpen
                ? 'bg-[#0c1220] text-cyan-400 border-cyan-500/40'
                : 'bg-[#07090e] text-slate-400 hover:text-slate-200 border-[#202b3f] hover:border-slate-600'
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c1220] hover:bg-slate-700 text-slate-200 border border-[#202b3f] rounded-xl text-xs font-semibold transition cursor-pointer"
              title="Enviar línea a stdin"
            >
              <CornerDownLeft className="w-3 h-3" />
              <span>Enviar</span>
            </button>
            <button
              type="button"
              onClick={() => onStop(activeTab.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-md transition cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Detener</span>
            </button>
          </>
        ) : (
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-cyan-950/50 transition cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Ejecutar</span>
          </button>
        )}
      </form>
    </div>
  );
};
