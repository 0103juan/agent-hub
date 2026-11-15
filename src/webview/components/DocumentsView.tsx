import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Bold, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Code, Code2, Columns2, Copy, Eye, FilePlus,
  FileText, Folder, FolderOpen, Heading2, Italic, Link2, List, ListChecks, ListTree, Minus, Pencil, Plus, Quote, RefreshCw, Save,
  Search, Table, Undo2
} from 'lucide-react';
import { postToHost, openInVsCode } from '../vscode-api';
import { relativeTime } from '../utils/format';
import { Markdown } from './chat/Markdown';
import { normalizeText } from '../../shared/workspace-actions';

interface DocInfo {
  path: string;
  name: string;
  size: number;
  mtime: number;
}

interface FolderNode {
  name: string;
  path: string;
  folders: Map<string, FolderNode>;
  files: DocInfo[];
  /** Archivos en esta carpeta y todas las de abajo. */
  count: number;
}

/** Arma el árbol de carpetas a partir de las rutas relativas; solo existen las carpetas que contienen documentos. */
function buildTree(files: DocInfo[]): FolderNode {
  const make = (name: string, folderPath: string): FolderNode => ({ name, path: folderPath, folders: new Map(), files: [], count: 0 });
  const rootNode = make('', '');
  for (const file of files) {
    const parts = file.path.split('/');
    let node = rootNode;
    node.count++;
    for (let index = 0; index < parts.length - 1; index++) {
      const folderPath = parts.slice(0, index + 1).join('/');
      let child = node.folders.get(parts[index]);
      if (!child) {
        child = make(parts[index], folderPath);
        node.folders.set(parts[index], child);
      }
      child.count++;
      node = child;
    }
    node.files.push(file);
  }
  return rootNode;
}

type Mode = 'edit' | 'split' | 'preview';
type Filter = 'all' | 'generated' | 'markdown' | 'html';
type Status = { kind: 'info' | 'error' | 'conflict'; text: string };

const MODE_KEY = 'agent-hub.docMode';
const CODE_KEY = 'agent-hub.docsIncludeCode';
const VIEW_KEY = 'agent-hub.docsView';
/** Hasta este número de archivos, el árbol arranca con todas las carpetas abiertas. */
const OPEN_ALL_UP_TO = 60;
const MAX_LIST_ROWS = 500;
const MARKDOWN_EXT = /\.(md|markdown)$/i;
const HTML_EXT = /\.(html|htm)$/i;
const READING_WORDS_PER_MINUTE = 220;
const TEMPLATE_TABLE = '| Columna | Columna |\n| --- | --- |\n| dato | dato |\n';

const normalize = (file: string) => file.replace(/\\/g, '/').toLowerCase();
const isMarkdown = (file: string) => MARKDOWN_EXT.test(file);
const isHtml = (file: string) => HTML_EXT.test(file);
const isPreviewable = (file: string) => isMarkdown(file) || isHtml(file);
const slugify = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** Encabezados del documento para el esquema; los `#` dentro de bloques de código no cuentan. */
function outlineOf(text: string): Array<{ level: number; title: string; line: number }> {
  const headings: Array<{ level: number; title: string; line: number }> = [];
  let inFence = false;
  text.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const match = !inFence && /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (match) headings.push({ level: match[1].length, title: match[2], line: index });
  });
  return headings;
}

interface Props {
  /** Pedido de abrir un archivo desde otra parte de la app; `tick` distingue pedidos repetidos del mismo archivo. */
  openRequest?: { file: string; tick: number; root?: string };
  /** El panel sigue montado al cambiar de pestaña para no perder lo escrito; solo refresca cuando está a la vista. */
  active: boolean;
}

export const DocumentsView: React.FC<Props> = ({ openRequest, active }) => {
  const [files, setFiles] = useState<DocInfo[]>([]);
  const [root, setRoot] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [showCode, setShowCode] = useState(() => localStorage.getItem(CODE_KEY) === '1');
  const [view, setViewState] = useState<'tree' | 'list'>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'tree'));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState<{ file: string; mtime?: number } | null>(null);
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === 'edit' || stored === 'preview' ? stored : 'split';
  });
  const [status, setStatus] = useState<Status | null>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requested = useRef<string>();
  /** Carpeta sobre la que trabaja el editor; sin ella, la global. La fija quien pide abrir un archivo. */
  const rootArg = useRef<string>();
  const post = (message: { command: 'listDocuments'; all?: boolean } | { command: 'readDocument'; file: string } | { command: 'saveDocument'; file: string; content: string; expectedMtime?: number; force?: boolean }) =>
    postToHost({ ...message, root: rootArg.current });
  const lastSent = useRef<{ file: string; content: string }>();
  /** Archivo que se abre en cuanto el servidor confirma el guardado (guardar y abrir, o crear uno nuevo). */
  const openAfterSave = useRef<string>();
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const currentRef = useRef(current);
  currentRef.current = current;

  const dirty = current !== null && draft !== saved;
  const markdown = current !== null && isMarkdown(current.file);
  const html = current !== null && isHtml(current.file);
  const previewable = markdown || html;
  const effectiveMode: Mode = previewable ? mode : 'edit';
  const setMode = (next: Mode) => {
    localStorage.setItem(MODE_KEY, next);
    setModeState(next);
  };

  const refreshList = useCallback(() => post({ command: 'listDocuments', all: showCode }), [showCode]);
  const load = useCallback((file: string) => {
    requested.current = file;
    setStatus(null);
    setConfirmRevert(false);
    post({ command: 'readDocument', file });
  }, []);

  /** Despliega las carpetas que contienen el archivo para que se vea dónde está. */
  const revealInTree = (file: string) => {
    const parts = file.replace(/\\/g, '/').split('/');
    const folders: Record<string, boolean> = {};
    for (let index = 1; index < parts.length; index++) folders[parts.slice(0, index).join('/')] = true;
    setExpanded((now) => ({ ...now, ...folders }));
  };

  const open = (file: string) => {
    revealInTree(root && normalize(file).startsWith(normalize(root)) ? file.slice(root.length).replace(/^[\\/]+/, '') : file);
    if (dirty && normalize(file) !== normalize(current?.file ?? '')) setPendingOpen(file);
    else load(file);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'documents') {
        setFiles(message.files);
        setRoot(message.root);
        setTruncated(Boolean(message.truncated));
        setSkipped(message.skipped ?? []);
      } else if (message?.type === 'documentContent') {
        if (normalize(message.file) !== normalize(requested.current ?? currentRef.current?.file ?? '')) return;
        if (message.error) {
          // Un documento de .agent-hub que aún no existe se abre vacío y se crea al guardar.
          if (/ENOENT|no such file/i.test(message.error) && normalize(message.file).includes('.agent-hub/')) {
            setCurrent({ file: message.file });
            setSaved('');
            setDraft('');
            setStatus({ kind: 'info', text: 'Archivo nuevo: se crea al guardar' });
          } else {
            setStatus({ kind: 'error', text: message.error });
          }
          return;
        }
        // Una relectura en segundo plano solo actualiza si no hay cambios propios sin guardar.
        const reload = currentRef.current && normalize(currentRef.current.file) === normalize(message.file);
        if (reload && draftRef.current !== savedRef.current) return;
        setCurrent({ file: message.file, mtime: message.mtime });
        setSaved(message.content);
        setDraft(message.content);
      } else if (message?.type === 'documentSaved') {
        if (normalize(message.file) !== normalize(lastSent.current?.file ?? '')) return;
        if (message.ok) {
          setSaved(lastSent.current!.content);
          setCurrent((now) => (now ? { ...now, mtime: message.mtime } : now));
          setStatus({ kind: 'info', text: 'Guardado' });
          refreshList();
          if (openAfterSave.current) {
            const next = openAfterSave.current;
            openAfterSave.current = undefined;
            load(next);
          }
        } else {
          openAfterSave.current = undefined;
          setStatus({ kind: message.conflict ? 'conflict' : 'error', text: message.error });
        }
      }
    };
    window.addEventListener('message', onMessage);
    refreshList();
    return () => window.removeEventListener('message', onMessage);
  }, [refreshList, load]);

  // Al volver a la ventana se actualiza la lista y, si no hay cambios propios, el archivo abierto (un agente pudo editarlo).
  useEffect(() => {
    if (!active) return;
    refreshList();
    const onFocus = () => {
      refreshList();
      const now = currentRef.current;
      if (now && draftRef.current === savedRef.current) post({ command: 'readDocument', file: now.file });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [active, refreshList]);

  useEffect(() => {
    if (openRequest) {
      if (openRequest.root !== rootArg.current) {
        rootArg.current = openRequest.root;
        refreshList();
      }
      open(openRequest.file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.tick]);

  // Cerrar la app con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = (force = false) => {
    if (!current || (!dirty && !force)) return;
    lastSent.current = { file: current.file, content: draft };
    post({ command: 'saveDocument', file: current.file, content: draft, expectedMtime: current.mtime, force });
  };

  const createDocument = () => {
    const title = (creating ?? '').trim();
    const slug = slugify(title);
    if (!slug) return;
    const file = `.agent-hub/${slug}.md`;
    lastSent.current = { file, content: `# ${title}\n\n` };
    post({ command: 'saveDocument', file, content: `# ${title}\n\n` });
    openAfterSave.current = file; // se abre cuando el servidor confirma que existe
    setCreating(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // ----- edición de Markdown
  const edit = (change: (value: string, start: number, end: number) => { value: string; start: number; end: number }) => {
    const element = textareaRef.current;
    if (!element) return;
    const result = change(draft, element.selectionStart, element.selectionEnd);
    setDraft(result.value);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.start, result.end);
    });
  };
  const wrap = (before: string, after = before, placeholder = 'texto') =>
    edit((value, start, end) => {
      const selected = value.slice(start, end) || placeholder;
      return { value: value.slice(0, start) + before + selected + after + value.slice(end), start: start + before.length, end: start + before.length + selected.length };
    });
  const prefixLines = (prefix: string) =>
    edit((value, start, end) => {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const nextBreak = value.indexOf('\n', end);
      const lineEnd = nextBreak === -1 ? value.length : nextBreak;
      const block = value.slice(lineStart, lineEnd).split('\n').map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line)).join('\n');
      return { value: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length };
    });
  const insert = (text: string) => edit((value, start, end) => ({ value: value.slice(0, start) + text + value.slice(end), start: start + text.length, end: start + text.length }));

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    // Los atajos del editor no deben activar los globales de la app (Ctrl+B panel de archivos, Ctrl+K paleta…).
    if (mod && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
      }
      if (markdown && (key === 'b' || key === 'i' || key === 'k')) {
        event.preventDefault();
        event.stopPropagation();
        if (key === 'b') wrap('**');
        else if (key === 'i') wrap('_');
        else wrap('[', '](https://)');
        return;
      }
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      insert('  ');
      return;
    }
    // Enter dentro de una lista sigue la lista; en un elemento vacío la termina.
    if (event.key === 'Enter' && !mod && !event.shiftKey && markdown) {
      const element = event.currentTarget;
      const caret = element.selectionStart;
      if (caret !== element.selectionEnd) return;
      const lineStart = draft.lastIndexOf('\n', caret - 1) + 1;
      const line = draft.slice(lineStart, caret);
      const match = /^(\s*)([-*+]|\d+\.)(\s+\[[ xX]\])?\s+/.exec(line);
      if (!match) return;
      event.preventDefault();
      if (!line.slice(match[0].length).trim()) {
        edit((value) => ({ value: value.slice(0, lineStart) + value.slice(caret), start: lineStart, end: lineStart }));
        return;
      }
      const marker = /^\d+\.$/.test(match[2]) ? `${parseInt(match[2], 10) + 1}.` : match[2];
      insert(`\n${match[1]}${marker}${match[3] ? ' [ ]' : ''} `);
    }
  };

  const outline = useMemo(() => (markdown ? outlineOf(draft) : []), [draft, markdown]);
  const goToLine = (line: number) => {
    if (effectiveMode === 'preview') setMode('split');
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      const offset = draft.split('\n').slice(0, line).reduce((sum, text) => sum + text.length + 1, 0);
      element.focus();
      element.setSelectionRange(offset, offset);
      element.scrollTop = Math.max(0, line * (parseFloat(getComputedStyle(element).lineHeight) || 20) - 40);
    });
  };

  const needle = normalizeText(query.trim());
  // Memorizado: reescribir en el editor no debe reconstruir el árbol de miles de archivos.
  const visibleFiles = useMemo(
    () =>
      files.filter(
        (doc) =>
          (filter === 'all' ||
            (filter === 'generated'
              ? doc.path.startsWith('.agent-hub/')
              : filter === 'html'
              ? isHtml(doc.path)
              : isMarkdown(doc.path))) &&
          (!needle || normalizeText(doc.path).includes(needle))
      ),
    [files, filter, needle]
  );
  const setView = (next: 'tree' | 'list') => {
    localStorage.setItem(VIEW_KEY, next);
    setViewState(next);
  };
  const toggleCode = () => {
    localStorage.setItem(CODE_KEY, showCode ? '0' : '1');
    setShowCode(!showCode);
  };
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const folderPaths = useMemo(() => {
    const paths: string[] = [];
    const walk = (node: FolderNode) => node.folders.forEach((child) => { paths.push(child.path); walk(child); });
    walk(tree);
    return paths;
  }, [tree]);
  const setAllFolders = (open: boolean) => setExpanded(Object.fromEntries(folderPaths.map((folder) => [folder, open])));
  // Al buscar o filtrar se muestran abiertas todas las carpetas con coincidencias.
  const isFolderOpen = (node: FolderNode, depth: number) =>
    needle || filter !== 'all' ? true : expanded[node.path] ?? (files.length <= OPEN_ALL_UP_TO || depth < 1);
  const toggleFolder = (node: FolderNode, depth: number) => setExpanded((now) => ({ ...now, [node.path]: !isFolderOpen(node, depth) }));

  const renderFile = (doc: DocInfo, depth: number) => {
    const selected = current !== null && normalize(current.file) === normalize(doc.path);
    return (
      <li key={doc.path}>
        <button
          type="button"
          onClick={() => open(doc.path)}
          aria-current={selected ? 'true' : undefined}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
          className={`w-full flex items-center gap-1.5 py-1 pr-2 rounded text-left text-[11px] transition ${selected ? 'bg-indigo-600/20 border border-indigo-500/40' : 'border border-transparent hover:bg-zinc-800'}`}
          title={`${doc.path} · ${formatSize(doc.size)}`}
        >
          <FileText className={`w-3 h-3 shrink-0 ${isMarkdown(doc.path) ? 'text-indigo-400' : isHtml(doc.path) ? 'text-amber-400' : 'text-zinc-500'}`} />
          <span className="truncate font-medium text-zinc-100">{doc.name}</span>
          {doc.path.startsWith('.agent-hub/') && <span className="shrink-0 px-1 rounded bg-indigo-500/15 text-indigo-300 text-[9px] uppercase">hub</span>}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">{relativeTime(doc.mtime)}</span>
        </button>
      </li>
    );
  };

  const renderNode = (node: FolderNode, depth: number): React.ReactNode[] => {
    // `.agent-hub` primero, el resto por nombre.
    const folders = [...node.folders.values()].sort((a, b) => (a.name === '.agent-hub' ? -1 : b.name === '.agent-hub' ? 1 : a.name.localeCompare(b.name)));
    const items: React.ReactNode[] = [];
    for (const folder of folders) {
      const open = isFolderOpen(folder, depth);
      items.push(
        <li key={`folder-${folder.path}`}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => toggleFolder(folder, depth)}
            style={{ paddingLeft: `${depth * 12 + 2}px` }}
            className="w-full flex items-center gap-1 py-1 pr-2 rounded text-left text-[11px] text-zinc-300 hover:bg-zinc-800"
            title={folder.path}
          >
            {open ? <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" /> : <ChevronRight className="w-3 h-3 shrink-0 text-zinc-500" />}
            {open ? <FolderOpen className="w-3 h-3 shrink-0 text-amber-400" /> : <Folder className="w-3 h-3 shrink-0 text-amber-400" />}
            <span className="truncate font-medium">{folder.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">{folder.count}</span>
          </button>
        </li>
      );
      if (open) items.push(...renderNode(folder, depth + 1));
    }
    for (const doc of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) items.push(renderFile(doc, depth));
    return items;
  };

  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const absolute = current ? (/^([a-zA-Z]:|\/)/.test(current.file) ? current.file : `${root.replace(/[\\/]$/, '')}/${current.file}`) : '';

  const modeButton = (id: Mode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={effectiveMode === id}
      disabled={!previewable && id !== 'edit'}
      onClick={() => setMode(id)}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition disabled:opacity-30 ${effectiveMode === id ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
      title={label}
    >
      {icon}
      <span className="hidden min-[1100px]:inline">{label}</span>
    </button>
  );
  const tool = (label: string, icon: React.ReactNode, action: () => void) => (
    <button key={label} type="button" onClick={action} className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition" title={label} aria-label={label}>
      {icon}
    </button>
  );

  return (
    <div className="select-text flex-1 min-w-0 min-h-[480px] flex flex-col min-[900px]:flex-row gap-2.5 h-full">
      {/* Lista de documentos */}
      <aside className="min-[900px]:w-64 shrink-0 flex flex-col gap-1.5 max-h-80 min-[900px]:max-h-none rounded-lg bg-zinc-900 border border-zinc-800 p-2 min-h-0">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-zinc-100">Documentos</span>
          <span className="font-mono text-[11px] text-zinc-500">({visibleFiles.length})</span>
          <button type="button" onClick={() => setView(view === 'tree' ? 'list' : 'tree')} className="ml-auto p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title={view === 'tree' ? 'Ver como lista (por fecha)' : 'Ver como árbol de carpetas'} aria-label="Cambiar entre árbol y lista">
            {view === 'tree' ? <List className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
          </button>
          {view === 'tree' && folderPaths.length > 0 && (
            <>
              <button type="button" onClick={() => setAllFolders(true)} className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title="Abrir todas las carpetas" aria-label="Abrir todas las carpetas">
                <ChevronsUpDown className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => setAllFolders(false)} className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title="Cerrar todas las carpetas" aria-label="Cerrar todas las carpetas">
                <ChevronsDownUp className="w-3 h-3" />
              </button>
            </>
          )}
          <button type="button" onClick={refreshList} className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title="Actualizar la lista" aria-label="Actualizar la lista">
            <RefreshCw className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => setCreating('')} className="p-1 rounded text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800" title="Nuevo documento en .agent-hub" aria-label="Nuevo documento">
            <FilePlus className="w-3.5 h-3.5" />
          </button>
        </div>
        {creating !== null && (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              createDocument();
            }}
          >
            <input
              autoFocus
              value={creating}
              onChange={(event) => setCreating(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setCreating(null)}
              placeholder="Título (se guarda en .agent-hub)"
              aria-label="Título del documento nuevo"
              className="flex-1 min-w-0 bg-zinc-950 border border-indigo-500 rounded px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
            <button type="submit" disabled={!slugify(creating)} className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white" aria-label="Crear">
              <Plus className="w-3 h-3" />
            </button>
          </form>
        )}
        <div className="relative">
          <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
            placeholder="Buscar documento…"
            aria-label="Buscar documento"
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-6 pr-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          {([['all', 'Todos'], ['generated', 'Generados'], ['markdown', 'Markdown'], ['html', 'HTML']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`px-2 py-0.5 rounded-full border transition ${filter === id ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              title={id === 'generated' ? 'Lo que AgentHub guarda en .agent-hub: borrador, memoria y tus notas' : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer" title="Además de documentos (Markdown, JSON, YAML, texto…), lista código y scripts de todas las subcarpetas">
          <input type="checkbox" checked={showCode} onChange={toggleCode} />
          Incluir código y scripts
        </label>
        <ul className="flex-1 overflow-y-auto space-y-0.5 min-h-0" aria-label="Documentos del proyecto">
          {visibleFiles.length === 0 && <li className="p-2 text-[11px] text-zinc-500">{files.length === 0 ? 'No hay documentos de texto en este proyecto.' : 'Nada coincide.'}</li>}
          {view === 'tree'
            ? renderNode(tree, 0)
            : visibleFiles.slice(0, MAX_LIST_ROWS).map((doc) => {
                const selected = current !== null && normalize(current.file) === normalize(doc.path);
                return (
                  <li key={doc.path}>
                    <button
                      type="button"
                      onClick={() => open(doc.path)}
                      aria-current={selected ? 'true' : undefined}
                      className={`w-full text-left px-2 py-1 rounded text-[11px] transition ${selected ? 'bg-indigo-600/20 border border-indigo-500/40' : 'border border-transparent hover:bg-zinc-800'}`}
                      title={doc.path}
                    >
                      <span className="flex items-center gap-1">
                        <span className="truncate font-medium text-zinc-100">{doc.name}</span>
                        {doc.path.startsWith('.agent-hub/') && <span className="shrink-0 px-1 rounded bg-indigo-500/15 text-indigo-300 text-[9px] uppercase">hub</span>}
                      </span>
                      <span className="flex items-center justify-between gap-1 font-mono text-[10px] text-zinc-500">
                        <span className="truncate">{doc.path}</span>
                        <span className="shrink-0">{formatSize(doc.size)} · {relativeTime(doc.mtime)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
          {view === 'list' && visibleFiles.length > MAX_LIST_ROWS && (
            <li className="p-2 text-[11px] text-zinc-500">Se muestran los {MAX_LIST_ROWS} más recientes de {visibleFiles.length}. Usa el buscador o el árbol para el resto.</li>
          )}
        </ul>
        {(truncated || skipped.length > 0) && (
          <p className="text-[10px] text-zinc-500 leading-snug" role="note">
            {truncated && 'Hay más archivos de los que se listan; usa el buscador. '}
            {skipped.length > 0 && <span title="Dependencias y compilados: no son documentos del proyecto">Se omiten {skipped.join(', ')}.</span>}
          </p>
        )}
      </aside>

      {/* Editor */}
      <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden" aria-label="Editor de documentos">
        {!current ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center text-zinc-400 text-xs">
            <FileText className="w-8 h-8 text-zinc-600" />
            <p>Elige un documento de la lista para verlo y editarlo.</p>
            <p className="text-[11px] text-zinc-500">Los archivos de Markdown y HTML se muestran con vista previa en vivo. «Generados» reúne lo que AgentHub guarda en <span className="font-mono">.agent-hub</span>.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-950/60">
              <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[40%]" title={absolute}>{current.file}</span>
              {dirty ? (
                <span className="px-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px]">Sin guardar</span>
              ) : (
                <span className="text-[10px] text-zinc-500">{status?.kind === 'info' ? status.text : 'Al día'}</span>
              )}
              <span className="flex items-center ml-auto gap-0.5 bg-zinc-900 border border-zinc-800 rounded p-0.5">
                {modeButton('edit', 'Editar', <Pencil className="w-3 h-3" />)}
                {modeButton('split', 'Dividido', <Columns2 className="w-3 h-3" />)}
                {modeButton('preview', 'Vista previa', <Eye className="w-3 h-3" />)}
              </span>
              <button type="button" onClick={copy} className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title="Copiar el contenido" aria-label="Copiar el contenido">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button type="button" onClick={() => openInVsCode(absolute)} className="p-1 rounded text-zinc-400 hover:text-blue-300 hover:bg-zinc-800" title="Abrir en VS Code" aria-label="Abrir en VS Code">
                <Code2 className="w-3.5 h-3.5" />
              </button>
              {confirmRevert ? (
                <span className="flex items-center gap-1 text-[11px] text-red-300">
                  ¿Descartar?
                  <button type="button" onClick={() => { setDraft(saved); setConfirmRevert(false); }} className="px-1.5 rounded bg-red-700 hover:bg-red-600 text-white">Sí</button>
                  <button type="button" onClick={() => setConfirmRevert(false)} className="text-zinc-400 hover:text-zinc-200">No</button>
                </span>
              ) : (
                <button type="button" disabled={!dirty} onClick={() => setConfirmRevert(true)} className="p-1 rounded text-zinc-400 hover:text-red-300 hover:bg-zinc-800 disabled:opacity-30" title="Descartar los cambios sin guardar" aria-label="Descartar los cambios">
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={!dirty}
                onClick={() => save()}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-[11px] font-medium transition"
                title="Guardar (Ctrl+S)"
              >
                <Save className="w-3 h-3" />
                Guardar
              </button>
            </div>

            {markdown && effectiveMode !== 'preview' && (
              <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-zinc-800/80" role="toolbar" aria-label="Formato de Markdown">
                {tool('Negrita (Ctrl+B)', <Bold className="w-3.5 h-3.5" />, () => wrap('**'))}
                {tool('Cursiva (Ctrl+I)', <Italic className="w-3.5 h-3.5" />, () => wrap('_'))}
                {tool('Título', <Heading2 className="w-3.5 h-3.5" />, () => prefixLines('## '))}
                {tool('Lista', <List className="w-3.5 h-3.5" />, () => prefixLines('- '))}
                {tool('Lista de tareas', <ListChecks className="w-3.5 h-3.5" />, () => prefixLines('- [ ] '))}
                {tool('Cita', <Quote className="w-3.5 h-3.5" />, () => prefixLines('> '))}
                {tool('Código en línea', <Code className="w-3.5 h-3.5" />, () => wrap('`'))}
                {tool('Bloque de código', <Code2 className="w-3.5 h-3.5" />, () => wrap('```\n', '\n```', 'código'))}
                {tool('Enlace (Ctrl+K)', <Link2 className="w-3.5 h-3.5" />, () => wrap('[', '](https://)'))}
                {tool('Tabla', <Table className="w-3.5 h-3.5" />, () => insert(TEMPLATE_TABLE))}
                {tool('Línea separadora', <Minus className="w-3.5 h-3.5" />, () => insert('\n---\n'))}
                {outline.length > 0 && (
                  <details className="relative ml-auto">
                    <summary className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <ListTree className="w-3.5 h-3.5" /> Esquema ({outline.length})
                    </summary>
                    <ul className="absolute right-0 top-full mt-1 z-30 w-64 max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                      {outline.map((heading) => (
                        <li key={`${heading.line}-${heading.title}`}>
                          <button
                            type="button"
                            onClick={(event) => {
                              goToLine(heading.line);
                              event.currentTarget.closest('details')?.removeAttribute('open');
                            }}
                            style={{ paddingLeft: `${(heading.level - 1) * 10 + 6}px` }}
                            className="w-full truncate text-left py-1 pr-1.5 rounded text-[11px] text-zinc-300 hover:bg-zinc-800"
                          >
                            {heading.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {status && status.kind !== 'info' && (
              <div role="alert" className={`flex flex-wrap items-center gap-2 px-3 py-1.5 text-[11px] border-b ${status.kind === 'conflict' ? 'bg-amber-950/40 border-amber-700/50 text-amber-200' : 'bg-red-950/40 border-red-700/50 text-red-200'}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 min-w-0">{status.text}</span>
                {status.kind === 'conflict' && (
                  <>
                    <button type="button" onClick={() => save(true)} className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium">Sobrescribir</button>
                    <button
                      type="button"
                      onClick={() => {
                        // Se descartan los cambios propios y se lee de nuevo lo que hay en disco.
                        requested.current = current.file;
                        setDraft('');
                        setSaved('');
                        setStatus(null);
                        post({ command: 'readDocument', file: current.file });
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                    >
                      Recargar de disco
                    </button>
                  </>
                )}
              </div>
            )}

            <div className={`flex-1 min-h-0 grid ${effectiveMode === 'split' ? 'grid-cols-1 min-[1000px]:grid-cols-2' : 'grid-cols-1'} divide-zinc-800 min-[1000px]:divide-x`}>
              {effectiveMode !== 'preview' && (
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onEditorKeyDown}
                  spellCheck={markdown}
                  aria-label={`Contenido de ${current.file}`}
                  className="min-h-[200px] w-full h-full resize-none bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-100 focus:outline-none select-text overflow-y-auto"
                />
              )}
              {effectiveMode !== 'edit' && (
                <div className="min-h-[200px] overflow-y-auto p-3 text-[13px] text-zinc-200 select-text flex flex-col" aria-label="Vista previa">
                  {html ? (
                    <div className="w-full flex-1 flex flex-col min-h-[380px] rounded-lg overflow-hidden border border-zinc-800 bg-white">
                      <iframe
                        sandbox="allow-scripts"
                        srcDoc={draft}
                        className="w-full flex-1 border-0 min-h-[380px]"
                        title="Vista previa HTML segura"
                      />
                    </div>
                  ) : draft.trim() ? (
                    <Markdown text={draft} withCodeActions={false} />
                  ) : (
                    <p className="text-zinc-500 text-xs">El documento está vacío.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 px-3 py-1 border-t border-zinc-800 bg-zinc-950/60 font-mono text-[10px] text-zinc-500">
              <span>{draft.split('\n').length} líneas</span>
              <span>{words.toLocaleString()} palabras</span>
              <span>{draft.length.toLocaleString()} caracteres</span>
              {markdown && words > 0 && <span>~{Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE))} min de lectura</span>}
              <span className="ml-auto">Ctrl+S guardar</span>
            </div>
          </>
        )}
      </section>

      {pendingOpen && (
        <div role="alertdialog" aria-label="Cambios sin guardar" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-amber-600/60 shadow-2xl text-xs text-amber-100">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Tienes cambios sin guardar en <span className="font-mono">{current?.file}</span>.</span>
          <button type="button" onClick={() => { openAfterSave.current = pendingOpen; save(); setPendingOpen(null); }} className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white">Guardar y abrir</button>
          <button type="button" onClick={() => { const next = pendingOpen; setPendingOpen(null); setDraft(saved); load(next); }} className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white">Descartar y abrir</button>
          <button type="button" onClick={() => setPendingOpen(null)} className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200">Seguir editando</button>
        </div>
      )}
    </div>
  );
};
