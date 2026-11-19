import React from 'react';

export const DiffLines: React.FC<{ diff: string }> = ({ diff }) => (
  <pre className="mt-1 max-h-64 overflow-auto rounded-xl bg-[#07090e] border border-[#202b3f] p-2 text-xs font-mono leading-relaxed space-y-0.5 shadow-inner select-text">
    {diff.split('\n').map((line, index) => {
      const isAdd = line.startsWith('+') && !line.startsWith('+++');
      const isDel = line.startsWith('-') && !line.startsWith('---');
      const isHeader = line.startsWith('@@');

      return (
        <span
          key={index}
          className={`block ${
            isAdd
              ? 'text-emerald-300 bg-emerald-500/15 border-l-2 border-emerald-500 px-1.5 rounded-r font-medium'
              : isDel
              ? 'text-rose-300 bg-rose-500/15 border-l-2 border-rose-500 px-1.5 rounded-r font-medium'
              : isHeader
              ? 'text-cyan-400/90 font-semibold px-1 py-0.5 bg-[#0a0e17] rounded'
              : 'text-slate-400 px-1'
          }`}
        >
          {line || ' '}
        </span>
      );
    })}
  </pre>
);
