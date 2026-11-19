import React, { useEffect, useRef, useState } from 'react';
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

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  // Al cerrar, el foco vuelve al elemento que abrió el modal.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  // Trampa de foco accesible (Tab y Shift+Tab ciclan dentro del modal).
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-backdrop-fade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-label={`Diff interactivo de ${file}`}
        className="bg-[#0a0e17] border border-[#202b3f] rounded-2xl shadow-2xl flex flex-col w-full max-w-6xl h-[88vh] overflow-hidden animate-modal-pop"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#07090e]/95 border-b border-[#202b3f] backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0">
              <GitCompare className="w-4 h-4 text-cyan-400 shrink-0" />
            </div>
            <span className="font-mono text-xs font-bold text-white truncate">
              {file}
            </span>
            <span className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
              Diff HEAD ↔ Actual
            </span>
            {(added > 0 || removed > 0) && (
              <span className="font-mono text-[11px] bg-[#07090e] border border-[#202b3f] px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]">+{added}</span>
                <span className="text-rose-400 font-bold drop-shadow-[0_0_6px_rgba(244,63,94,0.6)]">−{removed}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#07090e] rounded-lg border border-[#202b3f] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer border ${
                  viewMode === 'split' ? 'bg-[#0c1220] text-cyan-300 border-cyan-500/40 shadow-xs' : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
                title="Vista dividida (Split)"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer border ${
                  viewMode === 'unified' ? 'bg-[#0c1220] text-cyan-300 border-cyan-500/40 shadow-xs' : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
                title="Vista unificada (Raw Git Diff)"
              >
                <Rows2 className="w-3.5 h-3.5" />
                <span>Unified</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => downloadText(`${file.split(/[\\/]/).pop() ?? 'cambios'}.diff`, rawDiff || modified)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 hover:text-white border border-[#202b3f] text-xs font-mono font-medium transition cursor-pointer shadow-xs"
              title="Descargar el diff como archivo .diff"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden min-[560px]:inline">.diff</span>
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(file).catch(() => {})}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 hover:text-white border border-[#202b3f] text-xs font-mono font-medium transition cursor-pointer shadow-xs"
              title="Copiar la ruta del archivo"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="hidden min-[560px]:inline">Ruta</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 hover:text-white border border-[#202b3f] text-xs font-mono font-medium transition cursor-pointer shadow-xs"
              title="Copiar diff al portapapeles"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar Diff'}</span>
            </button>

            {confirmRevert ? (
              <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-500/50 rounded-lg px-2.5 py-1">
                <span className="text-[11px] font-mono text-rose-300">¿Descartar cambios?</span>
                <button
                  type="button"
                  onClick={() => {
                    onRevert(file);
                    onClose();
                  }}
                  className="px-2.5 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer shadow-xs"
                >
                  Sí, revertir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevert(false)}
                  className="px-2 py-0.5 rounded-md hover:bg-[#0c1220] text-slate-400 hover:text-slate-200 text-[11px] transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRevert(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 text-xs font-mono font-bold transition cursor-pointer shadow-xs hover:border-rose-400/50"
                title="Revertir este archivo al estado HEAD"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Revertir</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#0c1220] border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto bg-[#07090e] font-mono text-xs select-text">
          {viewMode === 'unified' ? (
            <div className="p-4 whitespace-pre-wrap leading-relaxed">
              {rawDiff ? (
                rawDiff.split('\n').map((line, idx) => {
                  let lineClass = 'text-slate-400';
                  if (line.startsWith('+')) lineClass = 'text-emerald-300 bg-emerald-950/30 border-l-2 border-emerald-500';
                  else if (line.startsWith('-')) lineClass = 'text-rose-300 bg-rose-950/30 border-l-2 border-rose-500';
                  else if (line.startsWith('@@')) lineClass = 'text-cyan-300 bg-cyan-950/40 font-bold border-l-2 border-cyan-400 px-3 py-1 my-1 rounded-r-md';
                  return (
                    <div key={idx} className={`px-2.5 py-0.5 ${lineClass}`}>
                      {line || ' '}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 text-center py-12 font-mono text-xs">
                  No hay diferencias detectadas entre HEAD y el archivo actual.
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-[#202b3f] min-h-full">
              {/* Columna Izquierda: Original (HEAD) */}
              <div className="flex flex-col">
                <div className="px-3.5 py-2 bg-[#0a0e17] border-b border-[#202b3f] text-[11px] font-bold text-rose-400 font-mono flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>ORIGINAL (HEAD)</span>
                  </div>
                  <span className="text-slate-400 text-[10px]">{originalLines.length} líneas</span>
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
                            ? 'bg-rose-500/15 text-rose-200 border-l-2 border-rose-500'
                            : 'text-slate-400'
                        }`}
                      >
                        <span className="w-9 shrink-0 text-right text-[10px] text-slate-400 select-none pr-1 font-mono">
                          {origLine !== undefined ? idx + 1 : ''}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all font-mono">
                          {origLine ?? ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Columna Derecha: Modificado (Working Tree) */}
              <div className="flex flex-col">
                <div className="px-3.5 py-2 bg-[#0a0e17] border-b border-[#202b3f] text-[11px] font-bold text-emerald-400 font-mono flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>ACTUAL (MODIFICADO)</span>
                  </div>
                  <span className="text-slate-400 text-[10px]">{modifiedLines.length} líneas</span>
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
                            ? 'bg-emerald-500/15 text-emerald-200 border-l-2 border-emerald-500'
                            : 'text-slate-300'
                        }`}
                      >
                        <span className="w-9 shrink-0 text-right text-[10px] text-slate-400 select-none pr-1 font-mono">
                          {modLine !== undefined ? idx + 1 : ''}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all font-mono">
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
