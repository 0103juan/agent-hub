import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Code2, Copy, Eye, FileCode, Pencil, Search, WrapText } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { isStandaloneBrowser, openInVsCode } from '../vscode-api';
import { Markdown } from './chat/Markdown';

interface Props {
  file: string;
  content: string;
  line?: number;
  onClose: () => void;
}

export const CodePreviewModal: React.FC<Props> = ({ file, content, line, onClose }) => {
  const [copied, setCopied] = useState<'content' | 'path'>();
  const [wrap, setWrap] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [jumpTo, setJumpTo] = useState(line);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => content.split('\n'), [content]);
  const fileName = file.split(/[\\/]/).pop() ?? file;
  const isMarkdown = useMemo(() => /\.(md|markdown)$/i.test(file), [file]);
  const isHtml = useMemo(() => /\.(html|htm)$/i.test(file), [file]);
  const isPreviewable = isMarkdown || isHtml;

  // Números de las líneas que contienen el texto buscado.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return lines.flatMap((text, index) => (text.toLowerCase().includes(needle) ? [index + 1] : []));
  }, [lines, query]);
  const currentMatch = matches.length > 0 ? matches[matchIndex % matches.length] : undefined;
  const focusLine = currentMatch ?? jumpTo;

  // Lleva a la vista la línea pedida, la del siguiente resultado o la que abrió el modal.
  useEffect(() => {
    if (!focusLine) return;
    bodyRef.current?.querySelector(`[data-line="${focusLine}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusLine, lines]);

  const copy = async (what: 'content' | 'path') => {
    try {
      await navigator.clipboard.writeText(what === 'content' ? content : file);
      setCopied(what);
      setTimeout(() => setCopied(undefined), 2000);
    } catch {}
  };

  const step = (delta: number) => matches.length > 0 && setMatchIndex((index) => (index + delta + matches.length) % matches.length);

  return (
    <ModalShell
      title={fileName}
      icon={<FileCode className="w-4 h-4 text-indigo-400" />}
      widthClass="max-w-4xl"
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/90 text-xs text-zinc-400">
        <button
          type="button"
          onClick={() => copy('path')}
          className="font-mono truncate max-w-lg text-left hover:text-zinc-200"
          title="Copiar la ruta"
        >
          {copied === 'path' ? 'Ruta copiada' : file} {line ? `(Línea ${line})` : `(${lines.length} líneas)`}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {isPreviewable && (
            <div className="flex items-center bg-zinc-800 rounded p-0.5 border border-zinc-700 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('code')}
                className={`px-2 py-0.5 rounded transition ${viewMode === 'code' ? 'bg-zinc-900 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Código
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition ${viewMode === 'preview' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Eye className="w-3 h-3" />
                <span>Vista previa</span>
              </button>
            </div>
          )}
          {viewMode === 'code' && (
            <button
              type="button"
              onClick={() => setWrap(!wrap)}
              aria-pressed={wrap}
              className={`p-1.5 rounded transition ${wrap ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:text-white'}`}
              title="Ajustar líneas largas"
              aria-label="Ajustar líneas largas"
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => copy('content')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
          >
            {copied === 'content' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === 'content' ? 'Copiado' : 'Copiar'}</span>
          </button>
          {/\.(md|markdown|html|htm|txt|json|ya?ml|csv|log|toml)$/i.test(file) && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('agenthub:open-document', { detail: file }))}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 transition"
              title="Abrir en el editor de documentos"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Editar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openInVsCode(file, line)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 transition"
            title="Abrir en VS Code en la línea exacta"
          >
            <Code2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Abrir en VS Code</span>
          </button>
        </div>
      </div>

      {viewMode === 'code' && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/60 text-[11px]">
          <span className="relative flex-1 min-w-0">
            <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') step(event.shiftKey ? -1 : 1);
              }}
              placeholder="Buscar en el archivo (Enter: siguiente, Mayús+Enter: anterior)"
              aria-label="Buscar en el archivo"
              className="w-full bg-zinc-950 border border-zinc-800 rounded pl-6 pr-2 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </span>
          {query.trim() && (
            <span className="font-mono text-zinc-400 shrink-0">{matches.length > 0 ? `${(matchIndex % matches.length) + 1} de ${matches.length}` : 'sin resultados'}</span>
          )}
          <button type="button" onClick={() => step(-1)} disabled={matches.length === 0} aria-label="Resultado anterior" className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => step(1)} disabled={matches.length === 0} aria-label="Resultado siguiente" className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            min={1}
            max={lines.length}
            placeholder="Ir a línea"
            aria-label="Ir a la línea"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              const target = Number(event.currentTarget.value);
              if (target >= 1 && target <= lines.length) {
                setQuery('');
                setJumpTo(target);
              }
            }}
            className="w-24 shrink-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {viewMode === 'preview' ? (
        isHtml ? (
          <div className="h-[65vh] p-3 bg-zinc-950 flex flex-col">
            <iframe
              sandbox="allow-scripts"
              srcDoc={content}
              className="w-full flex-1 border-0 bg-white rounded-lg shadow-inner"
              title="Vista previa HTML"
            />
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto p-4 bg-zinc-950 text-xs text-zinc-200">
            <Markdown text={content} />
          </div>
        )
      ) : (
        <div ref={bodyRef} className="max-h-[70vh] overflow-auto p-4 bg-zinc-950 font-mono text-xs leading-relaxed text-zinc-200">
          <div className="table w-full">
            {lines.map((l, idx) => {
              const lineNum = idx + 1;
              const isTargetLine = focusLine === lineNum;
              const isMatch = matches.includes(lineNum);
              return (
                <div
                  key={lineNum}
                  data-line={lineNum}
                  className={`table-row hover:bg-zinc-900/60 ${isTargetLine ? 'bg-indigo-950/60 text-indigo-200' : isMatch ? 'bg-amber-500/10' : ''}`}
                >
                  <span className="table-cell select-none pr-4 text-right text-zinc-600 font-mono text-[11px] w-12 border-r border-zinc-800/80">
                    {lineNum}
                  </span>
                  <span className={`table-cell pl-4 font-mono ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
                    {l || ' '}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ModalShell>
  );
};
