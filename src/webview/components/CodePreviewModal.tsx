import React, { useState } from 'react';
import { Check, Code2, Copy, FileCode, X } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { isStandaloneBrowser, openInVsCode } from '../vscode-api';

interface Props {
  file: string;
  content: string;
  line?: number;
  onClose: () => void;
}

export const CodePreviewModal: React.FC<Props> = ({ file, content, line, onClose }) => {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');
  const fileName = file.split(/[\\/]/).pop() ?? file;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <ModalShell
      title={fileName}
      icon={<FileCode className="w-4 h-4 text-indigo-400" />}
      widthClass="max-w-4xl"
      onClose={onClose}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/90 text-xs text-zinc-400">
        <span className="font-mono truncate max-w-lg" title={file}>
          {file} {line ? `(Línea ${line})` : `(${lines.length} líneas)`}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
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

      <div className="max-h-[70vh] overflow-auto p-4 bg-zinc-950 font-mono text-xs leading-relaxed text-zinc-200">
        <div className="table w-full">
          {lines.map((l, idx) => {
            const lineNum = idx + 1;
            const isTargetLine = line === lineNum;
            return (
              <div
                key={lineNum}
                className={`table-row hover:bg-zinc-900/60 ${isTargetLine ? 'bg-indigo-950/60 text-indigo-200' : ''}`}
              >
                <span className="table-cell select-none pr-4 text-right text-zinc-600 font-mono text-[11px] w-12 border-r border-zinc-800/80">
                  {lineNum}
                </span>
                <span className="table-cell pl-4 whitespace-pre font-mono">
                  {l || ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
};
