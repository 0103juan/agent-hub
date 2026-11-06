import React from 'react';

export const DiffLines: React.FC<{ diff: string }> = ({ diff }) => (
  <pre className="mt-0.5 max-h-60 overflow-auto rounded bg-zinc-950 border border-zinc-800 p-1.5 text-[11px] font-mono leading-snug">
    {diff.split('\n').map((line, index) => (
      <span
        key={index}
        className={`block ${line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-300 bg-emerald-500/10' : line.startsWith('-') && !line.startsWith('---') ? 'text-rose-300 bg-rose-500/10' : 'text-zinc-400'}`}
      >
        {line || ' '}
      </span>
    ))}
  </pre>
);
