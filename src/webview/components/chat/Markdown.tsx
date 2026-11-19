import { renderSyntaxCode } from './syntax-highlighter';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Code, Copy, CornerDownLeft, Download, ExternalLink, Eye, FileCode, FileText, GitCompare, ListOrdered, Maximize2, RotateCcw, Save, Sliders, WrapText, X, ZoomIn, ZoomOut } from 'lucide-react';
import { downloadText, extensionFor } from '../../utils/format';
import { isStandaloneBrowser, openInVsCode, postToHost } from '../../vscode-api';

// La CSP del webview de VS Code (solo scripts con nonce) la heredan los iframes: Mermaid no puede cargar ahí.
const CAN_RENDER_MERMAID = isStandaloneBrowser();

type Align = 'left' | 'center' | 'right' | undefined;

export interface ListItemDetail {
  text: string;
  ordered: boolean;
  level: number;
  num?: number;
}

type Block =
  | { kind: 'code'; language: string; code: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[]; itemDetails: ListItemDetail[]; start?: number }
  | { kind: 'table'; align: Align[]; header: string[]; rows: string[][] }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'paragraph'; text: string };

const LIST_ITEM_ORDERED = /^(\s*)(\d+)\.\s+(.*)$/;
const LIST_ITEM_BULLET = /^(\s*)([-*+])\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function parseListItem(line: string): { ordered: boolean; indent: number; num?: number; text: string } | null {
  const ord = line.match(LIST_ITEM_ORDERED);
  if (ord) return { ordered: true, indent: ord[1].length, num: parseInt(ord[2], 10), text: ord[3] };
  const bul = line.match(LIST_ITEM_BULLET);
  if (bul) return { ordered: false, indent: bul[1].length, text: bul[3] };
  return null;
}

function isListStart(line: string): boolean {
  return LIST_ITEM_ORDERED.test(line) || LIST_ITEM_BULLET.test(line);
}

/** Como en GFM, `\|` es una barra literal aunque esté dentro de `código`. */
function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isTableStart(lines: string[], index: number): boolean {
  const separator = lines[index + 1];
  return lines[index].includes('|') && separator !== undefined && separator.includes('-') && TABLE_SEPARATOR.test(separator);
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  return /^\s*```/.test(line) || /^#{1,4}\s/.test(line) || RULE.test(line) || isListStart(line) ||
    QUOTE.test(line) || isTableStart(lines, index);
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      index += 1;
      blocks.push({ kind: 'code', language: fence[1], code: code.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitRow(line);
      const align = splitRow(lines[index + 1]).map((cell): Align =>
        cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : cell.startsWith(':') ? 'left' : undefined);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|')) rows.push(splitRow(lines[index++]));
      blocks.push({ kind: 'table', align, header, rows });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) quote.push(lines[index++].replace(QUOTE, ''));
      blocks.push({ kind: 'quote', text: quote.join('\n') });
      continue;
    }

    const firstItem = parseListItem(line);
    if (firstItem) {
      const baseIndent = firstItem.indent;
      const itemDetails: ListItemDetail[] = [];
      const firstOrdered = firstItem.ordered;
      const firstNum = firstItem.num;

      while (index < lines.length) {
        const curLine = lines[index];
        const parsed = parseListItem(curLine);
        if (parsed) {
          const rawLevel = Math.max(0, parsed.indent - baseIndent);
          const level = rawLevel >= 4 ? 2 : rawLevel >= 2 ? 1 : 0;
          itemDetails.push({
            text: parsed.text,
            ordered: parsed.ordered,
            level,
            num: parsed.num
          });
          index += 1;
        } else if (
          itemDetails.length > 0 &&
          curLine.trim() &&
          !startsBlock(lines, index) &&
          (/^\s{2,}/.test(curLine) || !curLine.match(/^#{1,4}\s|^```|^>/))
        ) {
          // Línea de continuación del ítem anterior (multilínea)
          const prev = itemDetails[itemDetails.length - 1];
          const hasUnclosedParen = /\([^)]*$/.test(prev.text);
          if (hasUnclosedParen) {
            prev.text += curLine.trim();
          } else {
            prev.text += ' ' + curLine.trim();
          }
          index += 1;
        } else {
          break;
        }
      }

      blocks.push({
        kind: 'list',
        ordered: firstOrdered,
        items: itemDetails.map((d) => d.text),
        itemDetails,
        start: firstNum
      });
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    do paragraph.push(lines[index++]);
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index));
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

/** Las imágenes locales que genera un agente solo cargan por la URI de recursos del webview. */
export function resolveImageSrc(src: string, filesBase?: string, workspaceBase?: string): string {
  if (/^(?:https?|data):/i.test(src)) return src;
  const path = decodeURI(src.replace(/^file:\/\/\/?/i, '')).replace(/\\/g, '/');
  const isAbsolute = /^[a-z]:\//i.test(path) || path.startsWith('/');
  const base = isAbsolute ? filesBase : workspaceBase;
  if (!base) return src;
  const encoded = path.replace(/^\//, '').replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
    .split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/$/, '')}/${encoded}`;
}

function metaContent(name: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || undefined;
}

const MarkdownImage: React.FC<{ alt: string; src: string }> = ({ alt, src }) => {
  const [hasFailed, setHasFailed] = useState(false);
  const resolved = resolveImageSrc(src, metaContent('agent-hub-files'), metaContent('agent-hub-workspace'));
  if (hasFailed) return <span className="text-slate-500">[imagen no disponible: {alt || src}]</span>;
  return (
    <img
      src={resolved}
      alt={alt}
      title={alt || src}
      loading="lazy"
      onError={() => setHasFailed(true)}
      className="my-1.5 block max-h-80 max-w-full rounded border border-[#202b3f] bg-[#07090e]/80 object-contain shadow-sm"
    />
  );
};

interface FileLinkInfo {
  isFile: boolean;
  cleanPath: string;
  displayName: string;
  lineBadge?: string;
  startLine?: number;
  endLine?: number;
  fileType: 'doc' | 'code' | 'config' | 'default';
}

function parseFileLinkTarget(rawLabel: string, href: string): FileLinkInfo | null {
  const isFileUri = /^file:\/\//i.test(href);
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(href);
  const isAbsUnixPath = href.startsWith('/') && !href.startsWith('//');
  const pathNoHash = href.replace(/^file:\/\/\/?/i, '').split('#')[0];
  const hasExt = /\.(md|markdown|txt|ts|tsx|js|jsx|json|ya?ml|html|css|py|java|go|rs|sh|sql|xml|toml|env|dockerfile)$/i.test(pathNoHash);

  if (!isFileUri && !isWindowsPath && !isAbsUnixPath && !hasExt) {
    return null;
  }

  let cleanHref = href.replace(/^file:\/\/(localhost)?\/?/i, '');
  // Eliminar slash inicial sobrante en rutas absolutas de Windows (/C:/...)
  cleanHref = cleanHref.replace(/^\/([a-zA-Z]:)/, '$1');
  let lineBadge: string | undefined;
  let startLine: number | undefined;
  let endLine: number | undefined;

  const hashIdx = cleanHref.indexOf('#');
  if (hashIdx !== -1) {
    const fragment = cleanHref.slice(hashIdx + 1);
    cleanHref = cleanHref.slice(0, hashIdx);
    const lineMatch = fragment.match(/^L?(\d+)(?:-L?(\d+))?$/i);
    if (lineMatch) {
      startLine = parseInt(lineMatch[1], 10);
      endLine = lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined;
      lineBadge = endLine && endLine !== startLine ? `L${startLine}–${endLine}` : `L${startLine}`;
    } else {
      lineBadge = fragment;
    }
  }

  const decodedPath = decodeURIComponent(cleanHref).replace(/\\/g, '/');
  const parts = decodedPath.split('/');
  const baseName = parts[parts.length - 1] || rawLabel;
  const ext = (baseName.split('.').pop() || '').toLowerCase();

  let fileType: FileLinkInfo['fileType'] = 'default';
  if (['md', 'txt', 'markdown', 'rst', 'adoc', 'pdf'].includes(ext)) {
    fileType = 'doc';
  } else if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'cs', 'rb', 'php', 'swift', 'kt'].includes(ext)) {
    fileType = 'code';
  } else if (['yml', 'yaml', 'json', 'toml', 'xml', 'env', 'config', 'ini', 'dockerfile'].includes(ext)) {
    fileType = 'config';
  }

  const isRawPath = rawLabel.includes('/') || rawLabel.includes('\\') || rawLabel.startsWith('file:');
  const displayName = isRawPath ? baseName : rawLabel;

  return {
    isFile: true,
    cleanPath: decodedPath,
    displayName,
    lineBadge,
    startLine,
    endLine,
    fileType
  };
}

/** Ruta a un archivo escrita como `código`: absoluta (`C:/…`, `/…`) o relativa con carpeta (`docs/x.html`). */
export function isInlineFilePath(text: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\/)[^\r\n]*\.[A-Za-z0-9]{1,8}$/.test(text) || /^(?:\.{1,2}[\\/])?(?:[\w@.-]+[\\/])+[\w@.-]+\.[A-Za-z0-9]{1,8}$/.test(text);
}

const FileLinkChip: React.FC<{ fileInfo: FileLinkInfo }> = ({ fileInfo }) => {
  const { cleanPath, displayName, lineBadge, startLine, endLine, fileType } = fileInfo;

  const icon =
    fileType === 'doc' ? (
      <FileText className="w-3.5 h-3.5 text-sky-400 group-hover:text-sky-300 shrink-0" />
    ) : fileType === 'code' ? (
      <FileCode className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-300 shrink-0" />
    ) : fileType === 'config' ? (
      <Sliders className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 shrink-0" />
    ) : (
      <FileText className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300 shrink-0" />
    );

  const canOpenInDocuments = /\.(md|markdown|mdx|txt|rst|adoc|log|csv|json|ya?ml|toml|ini|xml|html?|sql|sh|ps1|bat|py|[jt]sx?|css|java|go|rs|cs|php|rb|cpp?|hpp?)$/i.test(cleanPath);

  return (
    <span className="inline-flex items-center align-middle">
    <button
      type="button"
      title={`${cleanPath}${lineBadge ? ` (${lineBadge})` : ''} • Clic para abrir ${canOpenInDocuments ? 'en Documentos' : 'en el editor'}`}
      onClick={(e) => {
        e.preventDefault();
        // En la app de escritorio no hay editor de VS Code: el texto se abre en Documentos.
        if (canOpenInDocuments) window.dispatchEvent(new CustomEvent('agenthub:open-document', { detail: cleanPath }));
        else postToHost({ command: 'openAttachment', fsPath: cleanPath, line: startLine, endLine });
      }}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 mx-0.5 rounded-md bg-[#162035]/90 hover:bg-[#202b3f] border border-[#202b3f] hover:border-cyan-500/60 text-slate-200 hover:text-white transition-all shadow-xs text-[11.5px] font-mono group align-middle cursor-pointer"
    >
      {icon}
      <span className="font-medium tracking-tight truncate max-w-[260px]">{displayName}</span>
      {lineBadge && (
        <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-semibold tracking-tight shrink-0">
          {lineBadge}
        </span>
      )}
    </button>
    {canOpenInDocuments && (
      <button
        type="button"
        title="Abrir en VS Code"
        aria-label={`Abrir ${displayName} en VS Code`}
        onClick={() => openInVsCode(cleanPath, startLine)}
        className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#0c1220] transition"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    )}
    </span>
  );
};

/** Devuelve elementos React, nunca HTML: el texto del modelo no puede inyectar marcado. */
function renderInline(text: string): React.ReactNode[] {
  // 1. Imágenes: !\[([^\]]*)\]\([^\)]+\)
  // 2. Enlaces (pueden contener código en backticks): \[(?:`[^`]+`|[^\]])+\]\([^\)]+\)
  // 3. Código en línea: `[^`]+`
  // 4. Negrita: \*\*[^*]+\*\*
  // 5. Cursiva: \*[^*\s][^*]*\*
  const TOKEN_REGEX = /(!\[[^\]]*\]\([^\)]+\)|\[(?:`[^`]+`|[^\]])+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  const parts = text.split(TOKEN_REGEX);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      // Una ruta a un archivo dentro de `código` (absoluta o relativa con carpeta) también se puede abrir.
      const inner = part.slice(1, -1).trim();
      if (isInlineFilePath(inner)) {
        const fileInfo = parseFileLinkTarget(inner, inner);
        if (fileInfo) return <FileLinkChip key={index} fileInfo={fileInfo} />;
      }
      return (
        <code
          key={index}
          title="Clic para copiar"
          onClick={() => navigator.clipboard.writeText(part.slice(1, -1)).catch(() => {})}
          className="cursor-copy rounded bg-[#162035] px-1 text-[0.92em] font-mono text-cyan-300 border border-[#202b3f] hover:bg-[#202b3f]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const image = part.match(/^!\[([^\]]*)\]\(([\s\S]+)\)$/);
    if (image) return <MarkdownImage key={index} alt={image[1]} src={image[2].trim()} />;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index} className="font-semibold text-slate-100">{renderInline(part.slice(2, -2))}</strong>;
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{renderInline(part.slice(1, -1))}</em>;
    }

    const link = part.match(/^\[((?:`[^`]+`|[^\]])+)\]\(([\s\S]+)\)$/);
    if (link) {
      let rawLabel = link[1].trim();
      let isCode = false;
      if (rawLabel.startsWith('`') && rawLabel.endsWith('`') && rawLabel.length >= 2) {
        isCode = true;
        rawLabel = rawLabel.slice(1, -1).trim();
      }

      let href = link[2].trim();
      // Limpiar saltos de línea y tabulaciones generadas por saltos de línea de modelos
      href = href.replace(/[\r\n]+\s*/g, '').replace(/-\s+/g, '-');
      if (/^file:\/\//i.test(href) || /^[a-zA-Z]:[\\/]/.test(href) || href.startsWith('/')) {
        href = href.replace(/\s+/g, '');
      }

      // Verificamos si es referencia a archivo local o del workspace
      const fileInfo = parseFileLinkTarget(rawLabel, href);
      if (fileInfo) {
        return <FileLinkChip key={index} fileInfo={fileInfo} />;
      }

      const inner = isCode ? (
        <code className="rounded bg-cyan-950/40 border border-cyan-500/40 px-1.5 py-0.5 text-cyan-200 font-mono text-[0.92em]">
          {rawLabel}
        </code>
      ) : (
        rawLabel
      );

      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline font-medium align-middle"
        >
          <span>{inner}</span>
          <ExternalLink className="w-3 h-3 text-slate-500 hover:text-cyan-300" />
        </a>
      );
    }

    return part;
  });
}

export interface InteractiveDiagramViewerProps {
  language: 'mermaid' | 'svg';
  code: string;
}

export const InteractiveDiagramViewer: React.FC<InteractiveDiagramViewerProps> = ({ language, code }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const inlineCanvasRef = useRef<HTMLDivElement>(null);
  const fullscreenCanvasRef = useRef<HTMLDivElement>(null);
  const fullscreenModalRef = useRef<HTMLDivElement>(null);

  // Al salir de pantalla completa, restaurar el foco en el disparador que abrió el visor
  useEffect(() => {
    if (!isFullscreen) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, [isFullscreen]);

  // Trampa de foco cíclica en modo pantalla completa
  const trapFullscreenFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !fullscreenModalRef.current) return;
    const focusable = Array.from(
      fullscreenModalRef.current.querySelectorAll<HTMLElement>(
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

  const handleZoomIn = () => {
    setScale((s) => Math.min(5, Math.round((s + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setScale((s) => Math.max(0.2, Math.round((s - 0.25) * 100) / 100));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, dragStart]);

  // Zoom con la rueda del ratón (wheel) evitando scroll de página
  useEffect(() => {
    const target = isFullscreen ? fullscreenCanvasRef.current : inlineCanvasRef.current;
    if (!target) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setScale((prev) => {
        const next = prev * factor;
        return Math.min(5, Math.max(0.2, Math.round(next * 100) / 100));
      });
    };

    target.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      target.removeEventListener('wheel', onWheel);
    };
  }, [isFullscreen]);

  // Tecla Escape para salir de pantalla completa
  useEffect(() => {
    if (!isFullscreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
        handleReset();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  const renderContent = () => {
    if (language === 'svg') {
      let cleanSvg = code.trim();
      if (!cleanSvg.includes('xmlns=')) {
        cleanSvg = cleanSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      return (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`}
          alt="Diagrama SVG interactivo"
          draggable={false}
          className="max-h-full max-w-full object-contain pointer-events-none select-none drop-shadow"
        />
      );
    }

    const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
mermaid.initialize({
  startOnLoad: true,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#09090b',
    primaryColor: '#4f46e5',
    primaryTextColor: '#f4f4f5'
  }
});
</script>
<style>
  html, body {
    margin: 0;
    padding: 16px;
    background: #09090b;
    color: #f4f4f5;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    box-sizing: border-box;
    overflow: auto;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .mermaid {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }
  svg {
    max-width: 100%;
    height: auto;
  }
</style>
</head>
<body>
  <pre class="mermaid">${escapedCode}</pre>
</body></html>`;

    return (
      <iframe
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title="Diagrama Mermaid interactivo"
        className="w-full h-full border-0 bg-transparent pointer-events-none select-none"
      />
    );
  };

  const controlsPill = (size: 'sm' | 'md' = 'sm') => {
    const btnClass = size === 'sm'
      ? 'flex h-6 w-6 items-center justify-center rounded hover:bg-[#202b3f] hover:text-white transition-colors'
      : 'flex h-7 w-7 items-center justify-center rounded hover:bg-[#202b3f] hover:text-white transition-colors';
    const textClass = size === 'sm'
      ? 'px-1.5 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-[#162035] rounded min-w-[3rem] text-center transition-colors'
      : 'px-2 py-0.5 text-xs font-mono text-slate-200 hover:text-white hover:bg-[#162035] rounded min-w-[3.5rem] text-center transition-colors';
    const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

    return (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center gap-0.5 rounded-lg border border-[#202b3f] bg-[#0a0e17]/95 p-1 text-slate-300 shadow-md backdrop-blur-md"
      >
        <button
          type="button"
          onClick={handleZoomOut}
          title="Reducir zoom (-)"
          aria-label="Reducir zoom"
          className={btnClass}
        >
          <ZoomOut className={iconSize} />
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="Restablecer zoom al 100%"
          aria-label="Restablecer zoom"
          className={textClass}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          title="Aumentar zoom (+)"
          aria-label="Aumentar zoom"
          className={btnClass}
        >
          <ZoomIn className={iconSize} />
        </button>
        <div className="mx-1 h-3.5 w-[1px] bg-[#202b3f]" />
        <button
          type="button"
          onClick={handleReset}
          title="Restablecer vista (posición y zoom)"
          aria-label="Restablecer vista"
          className={btnClass}
        >
          <RotateCcw className={iconSize} />
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Visor integrado (Inline) */}
      <div
        ref={inlineCanvasRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleReset}
        className={`relative w-full h-80 overflow-hidden border-b border-[#202b3f] bg-[#07090e] flex items-center justify-center select-none group/diagram ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: 'radial-gradient(circle, #202b3f 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: `${position.x}px ${position.y}px`,
        }}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
          className={`w-full h-full flex items-center justify-center select-none pointer-events-none ${
            isDragging ? 'transition-none' : 'transition-transform duration-100 ease-out'
          }`}
        >
          {renderContent()}
        </div>

        {/* Barra de herramientas flotante */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {controlsPill('sm')}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setIsFullscreen(true);
              handleReset();
            }}
            title="Abrir en pantalla completa para inspeccionar"
            aria-label="Pantalla completa"
            className="flex h-8 items-center gap-1 rounded-lg border border-[#202b3f] bg-[#0a0e17]/95 px-2 text-xs text-slate-300 shadow-md backdrop-blur-md hover:bg-cyan-600/30 hover:border-cyan-500/60 hover:text-cyan-200 transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px]">Ampliar</span>
          </button>
        </div>

        {/* Pista de uso al pasar el cursor */}
        <div className="absolute bottom-2 left-2 z-10 pointer-events-none flex items-center gap-1.5 rounded-md bg-[#0a0e17]/90 px-2 py-0.5 text-[10px] text-slate-400 border border-[#202b3f] backdrop-blur-xs opacity-0 group-hover/diagram:opacity-100 transition-opacity">
          <span>Arrastra para mover · Rueda para zoom · Doble clic para centrar</span>
        </div>
      </div>

      {/* Modal de Pantalla Completa */}
      {isFullscreen && (
        <div
          ref={fullscreenModalRef}
          onKeyDown={trapFullscreenFocus}
          role="dialog"
          aria-modal="true"
          aria-label={`Vista ampliada de diagrama ${language === 'mermaid' ? 'Mermaid' : 'SVG'}`}
          className="fixed inset-0 z-50 flex flex-col bg-[#07090e]/95 backdrop-blur-md animate-in fade-in duration-150"
        >
          {/* Cabecera del modal */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center justify-between border-b border-[#202b3f] bg-[#0a0e17]/95 px-4 py-2.5 shadow-md"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                <Eye className="h-4 w-4 text-cyan-400" />
                <span>Diagrama {language === 'mermaid' ? 'Mermaid' : 'SVG'}</span>
              </span>
              <span className="rounded bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                Pantalla Completa
              </span>
            </div>

            <div className="flex items-center gap-2">
              {controlsPill('md')}
              <button
                type="button"
                onClick={() => {
                  setIsFullscreen(false);
                  handleReset();
                }}
                title="Cerrar pantalla completa (Esc)"
                aria-label="Cerrar pantalla completa"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[#202b3f] bg-[#0c1220] px-3 text-xs text-slate-200 hover:bg-[#162035] hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Cerrar</span>
                <kbd className="hidden sm:inline-block rounded bg-[#07090e] border border-[#202b3f] px-1 py-0.2 text-[10px] text-slate-400">Esc</kbd>
              </button>
            </div>
          </div>

          {/* Lienzo ampliado */}
          <div
            ref={fullscreenCanvasRef}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleReset}
            className={`relative flex-1 w-full overflow-hidden bg-[#07090e] flex items-center justify-center select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{
              backgroundImage: 'radial-gradient(circle, #202b3f 1.2px, transparent 1.2px)',
              backgroundSize: '24px 24px',
              backgroundPosition: `${position.x}px ${position.y}px`,
            }}
          >
            <div
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center center',
              }}
              className={`w-full h-full flex items-center justify-center select-none pointer-events-none ${
                isDragging ? 'transition-none' : 'transition-transform duration-100 ease-out'
              }`}
            >
              {renderContent()}
            </div>

            {/* Pista flotante inferior en pantalla completa */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 rounded-full border border-[#202b3f] bg-[#0a0e17]/90 px-4 py-1 text-xs text-slate-400 shadow-lg backdrop-blur">
              <span>Arrastra para mover</span>
              <span>·</span>
              <span>Rueda para zoom</span>
              <span>·</span>
              <span>Doble clic para centrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/** Un bloque más largo se pliega y muestra el resto a demanda. */
const COLLAPSE_CODE_LINES = 30;

const CodeBlock: React.FC<{ language: string; code: string; withActions: boolean }> = ({ language, code, withActions }) => {
  const [wasCopied, setWasCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState(language === 'mermaid' && CAN_RENDER_MERMAID);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [savePath, setSavePath] = useState<string>();
  const [wrap, setWrap] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const lineCount = code.split('\n').length;
  const collapsible = lineCount > COLLAPSE_CODE_LINES;

  const isVisual = language === 'html' || language === 'svg' || (language === 'mermaid' && CAN_RENDER_MERMAID);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setWasCopied(true);
    setTimeout(() => setWasCopied(false), 1500);
  };

  const actionClass = 'flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-[#162035] hover:text-white text-slate-400 text-[11px] font-medium transition cursor-pointer border border-transparent hover:border-[#202b3f]';

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-[#202b3f] bg-[#07090e] shadow-md">
      <div className="flex items-center gap-1.5 border-b border-[#202b3f] px-3 py-1 text-xs text-slate-400 bg-[#0a0e17]">
        <span className="flex-1 truncate font-mono">
          <span className="font-bold text-cyan-400 uppercase text-[11px]">{language || 'texto'}</span>{' '}
          <span className="text-slate-500 text-[10px]">· {lineCount} {lineCount === 1 ? 'línea' : 'líneas'}</span>
        </span>
        {!previewMode && (
          <>
            <button type="button" aria-pressed={wrap} className={`${actionClass} ${wrap ? 'bg-[#162035] text-slate-100 border-[#202b3f]' : ''}`} onClick={() => setWrap(!wrap)} title="Ajustar líneas largas" aria-label="Ajustar líneas largas">
              <WrapText className="h-3 w-3" />
            </button>
            <button type="button" aria-pressed={lineNumbers} className={`${actionClass} ${lineNumbers ? 'bg-[#162035] text-slate-100 border-[#202b3f]' : ''}`} onClick={() => setLineNumbers(!lineNumbers)} title="Números de línea" aria-label="Números de línea">
              <ListOrdered className="h-3 w-3" />
            </button>
          </>
        )}
        <button type="button" className={actionClass} onClick={() => downloadText(`codigo.${extensionFor(language)}`, code)} title="Descargar como archivo" aria-label="Descargar como archivo">
          <Download className="h-3 w-3" />
        </button>
        {isVisual && (
          <button
            type="button"
            className={`${actionClass} ${previewMode ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50' : 'text-cyan-400'}`}
            onClick={() => setPreviewMode(!previewMode)}
            title="Alternar vista previa interactiva"
          >
            {previewMode ? <Code className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>{previewMode ? 'Código' : 'Vista previa'}</span>
          </button>
        )}
        {withActions && (
          <>
            <button type="button" className={actionClass} onClick={copy} title="Copiar">
              {wasCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>Copiar</span>
            </button>
            <button
              type="button"
              className={actionClass}
              title="Revisar cambios directamente sobre el archivo en el editor"
              onClick={() => postToHost({ command: 'applyInlineDiff', code })}
            >
              <Eye className="h-3 w-3 text-emerald-400" />
              <span>Inline</span>
            </button>
            <button
              type="button"
              className={actionClass}
              title="Quitar la revisión inline del editor"
              onClick={() => postToHost({ command: 'clearInlineDiff' })}
            >
              <X className="h-3 w-3 text-slate-400" />
              <span>Limpiar</span>
            </button>
            <button type="button" className={actionClass} title="Guardar en un archivo del espacio de trabajo" onClick={() => setSavePath(savePath === undefined ? '' : undefined)}>
              <Save className="h-3 w-3" />
              <span>Guardar</span>
            </button>
            <button type="button" className={actionClass} title="Insertar en el cursor" onClick={() => postToHost({ command: 'insertCode', code })}>
              <CornerDownLeft className="h-3 w-3" />
              <span>Insertar</span>
            </button>
            <button type="button" className={actionClass} title="Comparar con el archivo abierto" onClick={() => postToHost({ command: 'openDiff', code })}>
              <GitCompare className="h-3 w-3" />
              <span>Diff</span>
            </button>
          </>
        )}
      </div>

      {savePath !== undefined && (
        <form
          className="flex items-center gap-1.5 border-b border-[#202b3f] px-3 py-1.5 text-xs bg-[#07090e]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!savePath.trim()) return;
            postToHost({ command: 'saveCodeToFile', filePath: savePath.trim(), code });
            setSavePath(undefined);
          }}
        >
          <input
            autoFocus
            value={savePath}
            onChange={(event) => setSavePath(event.target.value)}
            placeholder="ruta/relativa/archivo.ext"
            aria-label="Ruta del archivo"
            className="flex-1 min-w-0 bg-transparent font-mono text-slate-200 focus:outline-none placeholder-slate-500 text-xs"
          />
          <button type="submit" className={actionClass}>Guardar</button>
        </form>
      )}

      {previewMode && language === 'svg' && (
        <InteractiveDiagramViewer language="svg" code={code} />
      )}

      {previewMode && language === 'html' && (
        <div className="p-2.5 bg-[#07090e] flex flex-col items-center border-b border-[#202b3f]">
          <div className="flex items-center gap-2 mb-2 text-[10px]">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`px-2 py-0.5 rounded transition ${viewport === 'desktop' ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200 bg-[#162035]'}`}
            >
              Escritorio (100%)
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`px-2 py-0.5 rounded transition ${viewport === 'mobile' ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200 bg-[#162035]'}`}
            >
              Móvil (375px)
            </button>
          </div>
          <iframe
            sandbox="allow-scripts"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script><style>body { margin: 0; padding: 12px; font-family: system-ui, sans-serif; background: #09090b; color: #f4f4f5; }</style></head><body>${code}</body></html>`}
            className={`h-80 border border-[#202b3f] rounded-lg transition-all duration-300 bg-[#07090e] ${viewport === 'mobile' ? 'w-[375px]' : 'w-full'}`}
          />
        </div>
      )}

      {previewMode && language === 'mermaid' && (
        <InteractiveDiagramViewer language="mermaid" code={code} />
      )}

      {!previewMode && language === 'svg' && code.includes('</svg>') && (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`}
          alt="Vista previa del SVG"
          className="mx-auto block max-h-80 max-w-full p-2"
        />
      )}

      {!previewMode && (
        <div className={`relative ${collapsible && !showAll ? 'max-h-[26rem] overflow-hidden' : ''}`}>
          <pre className={`flex p-3 text-xs leading-5 bg-[#07090e] ${wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'} ${language === 'svg' ? 'border-t border-[#202b3f]' : ''}`}>
            {lineNumbers && (
              <span aria-hidden className="select-none pr-2 mr-2 border-r border-[#162035] text-right leading-5 text-slate-600 shrink-0 font-mono">
                {Array.from({ length: lineCount }, (_, index) => `${index + 1}\n`).join('')}
              </span>
            )}
            <code className="leading-5 min-w-0 font-mono">{renderSyntaxCode(code, language)}</code>
          </pre>
          {collapsible && !showAll && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#07090e] to-transparent" />}
        </div>
      )}
      {!previewMode && collapsible && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="flex w-full items-center justify-center gap-1 border-t border-[#202b3f] bg-[#07090e] py-1 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-[#162035] transition cursor-pointer">
          {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showAll ? 'Mostrar menos' : `Mostrar las ${lineCount} líneas`}
        </button>
      )}
    </div>
  );
};

const HEADING_CLASSES = [
  '',
  'text-base font-bold text-white tracking-tight pt-2 pb-0.5 border-b border-[#202b3f]/60 pb-1',
  'text-sm font-bold text-slate-100 pt-1.5 pb-0.5',
  'text-xs font-semibold text-slate-200 pt-1',
  'text-xs font-medium text-slate-300'
];

const MarkdownTable: React.FC<{ block: Extract<Block, { kind: 'table' }> }> = ({ block }) => {
  const [copied, setCopied] = useState(false);
  // Texto separado por tabuladores: se pega directo en una hoja de cálculo.
  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText([block.header, ...block.rows].map((row) => row.join('\t')).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
  <div className="group/table relative my-2 overflow-x-auto rounded-xl border border-[#202b3f] bg-[#0a0e17] shadow-md">
    <button
      type="button"
      onClick={copyTable}
      className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-lg bg-[#07090e] border border-[#202b3f] px-2.5 py-1 text-xs text-slate-300 opacity-0 transition group-hover/table:opacity-100 focus-visible:opacity-100 hover:text-white cursor-pointer shadow-md"
      title="Copiar la tabla para pegarla en una hoja de cálculo"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? 'Copiada' : 'Copiar tabla'}</span>
    </button>
    {/* Los identificadores largos se parten para que una columna no se lleve todo el ancho. */}
    <table className="w-full border-collapse text-xs leading-normal [overflow-wrap:anywhere]">
      <thead className="bg-[#07090e] text-cyan-300 font-mono text-[11px] uppercase tracking-wider border-b border-[#202b3f]">
        <tr>
          {block.header.map((cell, cellIndex) => (
            <th key={cellIndex} style={{ textAlign: block.align[cellIndex] ?? 'left' }} className="px-3 py-2 font-bold">
              {renderInline(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#202b3f]/60">
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="even:bg-[#0a0e17]/40 hover:bg-[#162035] transition">
            {block.header.map((_, cellIndex) => (
              <td key={cellIndex} style={{ textAlign: block.align[cellIndex] }} className="min-w-[7rem] px-3 py-2 align-top text-slate-200">
                {renderInline(row[cellIndex] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
};

function isItemFileLink(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // Formato markdown link: [label](href) o [`label`](href) (opcionalmente con texto corto tras el link)
  const link = trimmed.match(/^\[((?:`[^`]+`|[^\]])+)\]\(([^)]+)\)(.*)$/);
  if (link) {
    const rawLabel = link[1].replace(/^`|`$/g, '').trim();
    const href = link[2].trim();
    const rest = link[3].trim();
    if (parseFileLinkTarget(rawLabel, href) !== null) {
      return rest.length <= 40;
    }
    if (/\.(ts|tsx|js|jsx|json|ya?ml|html|css|py|java|go|rs|md|txt|sql|env|c|cpp|h|hpp|sh)$/i.test(rawLabel) ||
        /\.(ts|tsx|js|jsx|json|ya?ml|html|css|py|java|go|rs|md|txt|sql|env|c|cpp|h|hpp|sh)$/i.test(href)) {
      return rest.length <= 40;
    }
  }
  // Formato código solo: `archivo.ext`
  const code = trimmed.match(/^`([^`]+)`(.*)$/);
  if (code && /\.(ts|tsx|js|jsx|json|ya?ml|html|css|py|java|go|rs|md|txt|sql|env|c|cpp|h|hpp|sh)$/i.test(code[1])) {
    return code[2].trim().length <= 40;
  }
  return false;
}

export const Markdown = memo<{ text: string; withCodeActions?: boolean }>(({ text, withCodeActions = false }) => (
  <div className="space-y-2 break-words text-slate-200">
    {parseMarkdownBlocks(text).map((block, index) => {
      switch (block.kind) {
        case 'code':
          return <CodeBlock key={index} language={block.language} code={block.code} withActions={withCodeActions} />;
        case 'heading':
          return <div key={index} role="heading" aria-level={block.level} className={HEADING_CLASSES[block.level]}>{renderInline(block.text)}</div>;
        case 'list': {
          const rawItems = block.itemDetails && block.itemDetails.length > 0
            ? block.itemDetails
            : block.items.map((item, i) => ({ text: item, ordered: block.ordered, level: 0, num: i + 1 }));

          const isFileList = rawItems.length > 0 && rawItems.every((item) => isItemFileLink(item.text));

          if (isFileList) {
            return (
              <div key={index} className="my-2 p-2 rounded-xl bg-[#0a0e17] border border-[#202b3f] shadow-xs">
                <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-thin">
                  {rawItems.map((item, itemIndex) => (
                    <div key={itemIndex} className="shrink-0">
                      {renderInline(item.text)}
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (!block.itemDetails || block.itemDetails.length === 0) {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={index} className={`space-y-0.5 pl-4 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </List>
            );
          }
          return (
            <div key={index} className="my-1.5 space-y-1 text-xs">
              {block.itemDetails.map((item, itemIndex) => {
                const indentClass = item.level === 0 ? '' : item.level === 1 ? 'pl-4' : 'pl-8';
                const bulletChar = item.level > 1 ? '–' : '•';
                // `- [ ]` y `- [x]` se dibujan como casillas de tarea.
                const task = !item.ordered ? /^\[([ xX])\]\s+/.exec(item.text) : null;
                const taskDone = task ? task[1].toLowerCase() === 'x' : false;
                const itemText = task ? item.text.slice(task[0].length) : item.text;
                return (
                  <div key={itemIndex} className={`flex items-start gap-2.5 ${indentClass}`}>
                    <span className="shrink-0 select-none text-slate-400 font-mono text-[11px] leading-5 min-w-[1.25rem] text-right font-medium">
                      {task ? (taskDone ? '☑' : '☐') : item.ordered ? `${item.num ?? itemIndex + 1}.` : bulletChar}
                    </span>
                    <div className={`flex-1 leading-5 ${taskDone ? 'text-slate-500 line-through' : ''}`}>
                      {renderInline(itemText)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }
        case 'table':
          return <MarkdownTable key={index} block={block} />;
        case 'quote':
          return (
            <blockquote key={index} className="whitespace-pre-wrap border-l-2 border-cyan-500 pl-3.5 py-1.5 my-2 bg-[#0a0e17]/70 rounded-r-xl text-slate-200 text-xs italic shadow-xs">
              {renderInline(block.text)}
            </blockquote>
          );
        case 'rule':
          return <hr key={index} className="my-3 border-[#202b3f]" />;
        case 'paragraph':
          return <p key={index} className="whitespace-pre-wrap leading-relaxed">{renderInline(block.text)}</p>;
      }
    })}
  </div>
));
