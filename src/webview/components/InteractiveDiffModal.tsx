import React, { useEffect, useState } from 'react';
import { downloadText } from '../utils/format';
import {
  X,
  Copy,
  Check,
  Undo2,
  FileCode,
  GitCompare,
  Columns2,
  Download,
  Rows2
} from 'lucide-react';

interface Props {
  file: string;
  original: string;
  modified: string;
  rawDiff: string;
  onClose: () => void;
  onRevert: (file: string) => void;
}

export const InteractiveDiffModal: React.FC<Props> = ({
  file,
  original,
  modified,
  rawDiff,
  onClose,
  onRevert
}) => {
  const [copied, setCopied] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  const handleCopy = () => {
    navigator.clipboard.writeText(rawDiff || modified);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const originalLines = original ? original.split('\n') : [];
  const modifiedLines = modified ? modified.split('\n') : [];
  const maxLines = Math.max(originalLines.length, modifiedLines.length);
  const diffLines = rawDiff ? rawDiff.split('\n') : [];
  const added = diffLines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
  const removed = diffLines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col w-full max-w-6xl h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
              {file}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
              Diff HEAD ↔ Actual
            </span>
            {(added > 0 || removed > 0) && (
              <span className="font-mono text-[11px] shrink-0">
                <span className="text-emerald-400">+{added}</span> <span className="text-rose-400">−{removed}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 rounded border border-zinc-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`p-1 rounded text-xs transition ${
                  viewMode === 'split' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Vista dividida (Split)"
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`p-1 rounded text-xs transition ${
                  viewMode === 'unified' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Vista unificada (Raw Git Diff)"
              >
                <Rows2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => downloadText(`${file.split(/[\\/]/).pop() ?? 'cambios'}.diff`, rawDiff || modified)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs transition cursor-pointer"
              title="Descargar el diff como archivo .diff"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden min-[560px]:inline">.diff</span>
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(file).catch(() => {})}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs transition cursor-pointer"
              title="Copiar la ruta del archivo"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="hidden min-[560px]:inline">Ruta</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs transition cursor-pointer"
              title="Copiar diff al portapapeles"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar Diff'}</span>
            </button>

            {confirmRevert ? (
              <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-800/80 rounded px-2 py-0.5">
                <span className="text-[11px] text-rose-300">¿Descartar cambios?</span>
                <button
                  type="button"
                  onClick={() => {
                    onRevert(file);
                    onClose();
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium transition cursor-pointer"
                >
                  Sí, revertir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevert(false)}
                  className="px-1.5 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRevert(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs transition cursor-pointer"
                title="Revertir este archivo al estado HEAD"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Revertir</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto bg-zinc-950 font-mono text-xs select-text">
          {viewMode === 'unified' ? (
            <div className="p-4 whitespace-pre-wrap leading-relaxed">
              {rawDiff ? (
                rawDiff.split('\n').map((line, idx) => {
                  let lineClass = 'text-zinc-400';
                  if (line.startsWith('+')) lineClass = 'text-emerald-400 bg-emerald-500/10';
                  else if (line.startsWith('-')) lineClass = 'text-rose-400 bg-rose-500/10';
                  else if (line.startsWith('@@')) lineClass = 'text-cyan-400 bg-cyan-500/10 font-bold';
                  return (
                    <div key={idx} className={`px-2 py-0.5 ${lineClass}`}>
                      {line || ' '}
                    </div>
                  );
                })
              ) : (
                <div className="text-zinc-500 text-center py-12">
                  No hay diferencias detectadas entre HEAD y el archivo actual.
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-zinc-800 min-h-full">
              {/* Columna Izquierda: Original (HEAD) */}
              <div className="flex flex-col">
                <div className="px-3 py-1 bg-zinc-900 border-b border-zinc-800 text-[11px] font-semibold text-rose-400 flex items-center justify-between sticky top-0 z-10">
                  <span>HEAD (Original)</span>
                  <span className="text-zinc-500">{originalLines.length} líneas</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {Array.from({ length: maxLines }).map((_, idx) => {
                    const origLine = originalLines[idx];
                    const modLine = modifiedLines[idx];
                    const isDiff = origLine !== modLine;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 px-1 rounded ${
                          isDiff && origLine !== undefined
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'text-zinc-400'
                        }`}
                      >
                        <span className="w-8 shrink-0 text-right text-[10px] text-zinc-600 select-none">
                          {origLine !== undefined ? idx + 1 : ''}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all">
                          {origLine ?? ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Columna Derecha: Modificado (Working Tree) */}
              <div className="flex flex-col">
                <div className="px-3 py-1 bg-zinc-900 border-b border-zinc-800 text-[11px] font-semibold text-emerald-400 flex items-center justify-between sticky top-0 z-10">
                  <span>Actual (Modificado)</span>
                  <span className="text-zinc-500">{modifiedLines.length} líneas</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {Array.from({ length: maxLines }).map((_, idx) => {
                    const origLine = originalLines[idx];
                    const modLine = modifiedLines[idx];
                    const isDiff = origLine !== modLine;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 px-1 rounded ${
                          isDiff && modLine !== undefined
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'text-zinc-300'
                        }`}
                      >
                        <span className="w-8 shrink-0 text-right text-[10px] text-zinc-600 select-none">
                          {modLine !== undefined ? idx + 1 : ''}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all">
                          {modLine ?? ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
