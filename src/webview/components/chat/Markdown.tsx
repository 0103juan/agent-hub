import { renderSyntaxCode } from './syntax-highlighter';
import React, { memo, useState } from 'react';
import { Check, Code, Copy, CornerDownLeft, ExternalLink, Eye, FileCode, FileText, GitCompare, Save, Sliders, X } from 'lucide-react';
import { isStandaloneBrowser, postToHost } from '../../vscode-api';

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
  if (hasFailed) return <span className="text-zinc-500">[imagen no disponible: {alt || src}]</span>;
  return (
    <img
      src={resolved}
      alt={alt}
      title={alt || src}
      loading="lazy"
      onError={() => setHasFailed(true)}
      className="my-1.5 block max-h-80 max-w-full rounded border border-zinc-700 bg-zinc-950/60 object-contain"
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
      <FileText className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-300 shrink-0" />
    );

  const tooltip = `${cleanPath}${lineBadge ? ` (${lineBadge})` : ''} • Clic para abrir en editor`;

  return (
    <button
      type="button"
      title={tooltip}
      onClick={(e) => {
        e.preventDefault();
        postToHost({ command: 'openAttachment', fsPath: cleanPath, line: startLine, endLine });
      }}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 mx-0.5 rounded-md bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/80 hover:border-indigo-500/60 text-zinc-200 hover:text-white transition-all shadow-xs text-[11.5px] font-mono group align-middle cursor-pointer"
    >
      {icon}
      <span className="font-medium tracking-tight truncate max-w-[260px]">{displayName}</span>
      {lineBadge && (
        <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 font-semibold tracking-tight shrink-0">
          {lineBadge}
        </span>
      )}
    </button>
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
      return <code key={index} className="rounded bg-zinc-800 px-1 text-[0.92em] font-mono">{part.slice(1, -1)}</code>;
    }

    const image = part.match(/^!\[([^\]]*)\]\(([\s\S]+)\)$/);
    if (image) return <MarkdownImage key={index} alt={image[1]} src={image[2].trim()} />;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
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
        <code className="rounded bg-indigo-950/80 border border-indigo-700/60 px-1 py-0.5 text-indigo-300 font-mono text-[0.92em]">
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
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline font-medium align-middle"
        >
          <span>{inner}</span>
          <ExternalLink className="w-3 h-3 text-zinc-500 hover:text-indigo-300" />
        </a>
      );
    }

    return part;
  });
}

const CodeBlock: React.FC<{ language: string; code: string; withActions: boolean }> = ({ language, code, withActions }) => {
  const [wasCopied, setWasCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState(language === 'mermaid' && CAN_RENDER_MERMAID);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [savePath, setSavePath] = useState<string>();

  const isVisual = language === 'html' || language === 'svg' || (language === 'mermaid' && CAN_RENDER_MERMAID);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setWasCopied(true);
    setTimeout(() => setWasCopied(false), 1500);
  };

  const actionClass = 'flex items-center gap-1 rounded px-1 hover:bg-zinc-700 hover:text-zinc-100';

  return (
    <div className="my-1.5 overflow-hidden rounded border border-zinc-700 bg-zinc-950/60">
      <div className="flex items-center gap-1 border-b border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
        <span className="flex-1 truncate">{language || 'texto'}</span>
        {isVisual && (
          <button
            type="button"
            className={`${actionClass} ${previewMode ? 'bg-indigo-600/40 text-indigo-200' : 'text-indigo-400'}`}
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
              {wasCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
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
              <X className="h-3 w-3 text-zinc-400" />
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
          className="flex items-center gap-1 border-b border-zinc-700 px-2 py-1 text-[11px]"
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
            className="flex-1 min-w-0 bg-transparent font-mono text-zinc-200 focus:outline-none placeholder-zinc-500"
          />
          <button type="submit" className={actionClass}>Guardar</button>
        </form>
      )}

      {previewMode && language === 'svg' && (
        <div className="p-4 bg-zinc-950 flex items-center justify-center border-b border-zinc-800">
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`}
            alt="Vista previa interactiva del SVG"
            className="mx-auto block max-h-80 max-w-full"
          />
        </div>
      )}

      {previewMode && language === 'html' && (
        <div className="p-2 bg-zinc-950 flex flex-col items-center border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-2 text-[10px]">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`px-2 py-0.5 rounded transition ${viewport === 'desktop' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800'}`}
            >
              Escritorio (100%)
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`px-2 py-0.5 rounded transition ${viewport === 'mobile' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800'}`}
            >
              Móvil (375px)
            </button>
          </div>
          <iframe
            sandbox="allow-scripts"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script><style>body { margin: 0; padding: 12px; font-family: system-ui, sans-serif; background: #09090b; color: #f4f4f5; }</style></head><body>${code}</body></html>`}
            className={`h-80 border border-zinc-700/80 rounded transition-all duration-300 bg-zinc-950 ${viewport === 'mobile' ? 'w-[375px]' : 'w-full'}`}
          />
        </div>
      )}

      {previewMode && language === 'mermaid' && (
        <div className="p-2 bg-zinc-950 flex flex-col items-center border-b border-zinc-800">
          <iframe
            sandbox="allow-scripts"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true, theme: 'dark', themeVariables: { darkMode: true, background: '#09090b', primaryColor: '#4f46e5', primaryTextColor: '#f4f4f5' } });
</script><style>body { margin: 0; padding: 16px; background: #09090b; color: #f4f4f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: auto; font-family: system-ui, sans-serif; }</style></head><body><pre class="mermaid">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`}
            className="w-full h-80 border border-zinc-800 rounded bg-zinc-950"
          />
        </div>
      )}

      {!previewMode && language === 'svg' && code.includes('</svg>') && (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`}
          alt="Vista previa del SVG"
          className="mx-auto block max-h-80 max-w-full p-2"
        />
      )}

      {!previewMode && (
        <pre className={`overflow-x-auto p-2 text-xs ${language === 'svg' ? 'border-t border-zinc-700' : ''}`}><code className="leading-5">{renderSyntaxCode(code, language)}</code></pre>
      )}
    </div>
  );
};

const HEADING_CLASSES = ['', 'text-base font-semibold', 'text-sm font-semibold', 'font-semibold', 'font-medium'];

const MarkdownTable: React.FC<{ block: Extract<Block, { kind: 'table' }> }> = ({ block }) => (
  <div className="my-1.5 overflow-x-auto rounded border border-zinc-700">
    {/* Los identificadores largos se parten para que una columna no se lleve todo el ancho. */}
    <table className="w-full border-collapse text-[12px] leading-snug [overflow-wrap:anywhere]">
      <thead className="bg-zinc-800/80 text-zinc-100">
        <tr>
          {block.header.map((cell, cellIndex) => (
            <th key={cellIndex} style={{ textAlign: block.align[cellIndex] ?? 'left' }} className="border-b border-zinc-700 px-2 py-1.5 font-semibold">
              {renderInline(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-t border-zinc-800 first:border-t-0 even:bg-zinc-800/30">
            {block.header.map((_, cellIndex) => (
              <td key={cellIndex} style={{ textAlign: block.align[cellIndex] }} className="min-w-[7rem] px-2 py-1.5 align-top">
                {renderInline(row[cellIndex] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

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
  <div className="space-y-1.5 break-words">
    {parseMarkdownBlocks(text).map((block, index) => {
      switch (block.kind) {
        case 'code':
          return <CodeBlock key={index} language={block.language} code={block.code} withActions={withCodeActions} />;
        case 'heading':
          return <div key={index} role="heading" aria-level={block.level} className={`pt-1 ${HEADING_CLASSES[block.level]}`}>{renderInline(block.text)}</div>;
        case 'list': {
          const rawItems = block.itemDetails && block.itemDetails.length > 0
            ? block.itemDetails
            : block.items.map((item, i) => ({ text: item, ordered: block.ordered, level: 0, num: i + 1 }));

          const isFileList = rawItems.length > 0 && rawItems.every((item) => isItemFileLink(item.text));

          if (isFileList) {
            return (
              <div key={index} className="my-2 p-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800 shadow-xs">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-thin">
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
            <div key={index} className="my-1.5 space-y-1.5 text-[13px]">
              {block.itemDetails.map((item, itemIndex) => {
                const indentClass = item.level === 0 ? '' : item.level === 1 ? 'pl-4' : 'pl-8';
                const bulletChar = item.level > 1 ? '–' : '•';
                return (
                  <div key={itemIndex} className={`flex items-start gap-2.5 ${indentClass}`}>
                    <span className="shrink-0 select-none text-zinc-400 font-mono text-[11px] leading-6 min-w-[1.25rem] text-right font-medium">
                      {item.ordered ? `${item.num ?? itemIndex + 1}.` : bulletChar}
                    </span>
                    <div className="flex-1 leading-6">
                      {renderInline(item.text)}
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
          return <blockquote key={index} className="whitespace-pre-wrap border-l-2 border-zinc-600 pl-2.5 text-zinc-300">{renderInline(block.text)}</blockquote>;
        case 'rule':
          return <hr key={index} className="my-2 border-zinc-700" />;
        case 'paragraph':
          return <p key={index} className="whitespace-pre-wrap">{renderInline(block.text)}</p>;
      }
    })}
  </div>
));
