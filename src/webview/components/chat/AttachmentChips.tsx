import React from 'react';
import { FileCode, Film, Music, X } from 'lucide-react';
import { FileContextAttachment } from '../../../shared/types';

interface Props {
  attachments: FileContextAttachment[];
  onRemove: (index: number) => void;
}

const removeButtonClass = 'w-4 h-4 rounded-full bg-black/80 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0';

function iconFor(attachment: FileContextAttachment): React.ReactNode {
  if (attachment.mediaType === 'audio') return <Music className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (attachment.mediaType === 'video') return <Film className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
  return <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
}

/** Bandeja del compositor: miniatura para imágenes y etiqueta para el resto. */
export const AttachmentChips: React.FC<Props> = ({ attachments, onRemove }) => (
  <div className="flex flex-wrap items-center gap-2 p-2 bg-[#07090e] rounded-xl border border-[#202b3f] shadow-inner">
    {attachments.length > 1 && (
      <div className="flex items-center justify-between w-full text-[11px] font-mono text-slate-400 border-b border-[#202b3f] pb-1.5 px-0.5">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          <span>
            {attachments.length} adjuntos • ~{Math.round(attachments.reduce((sum, a) => sum + (a.content?.length ?? 0), 0) / 4).toLocaleString()} tokens de contexto
          </span>
        </span>
        <button
          type="button"
          onClick={() => attachments.forEach(() => onRemove(0))}
          className="text-rose-400 hover:text-rose-300 transition text-[11px] font-sans font-semibold cursor-pointer"
        >
          Quitar todos
        </button>
      </div>
    )}
    {attachments.map((attachment, index) => {
      const label = `${attachment.file}${attachment.lines ? `#${attachment.lines}` : ''}`;
      const remove = (
        <button type="button" aria-label={`Quitar ${attachment.file}`} onClick={() => onRemove(index)} className={removeButtonClass}>
          <X className="w-3 h-3" />
        </button>
      );

      if (attachment.mediaType === 'image' && attachment.mediaUri) {
        return (
          <div key={index} className="relative group shrink-0" title={label}>
            <img src={attachment.mediaUri} alt={attachment.file} className="h-14 w-14 rounded-lg border border-cyan-500/40 object-cover bg-black/60 shadow-md group-hover:border-cyan-400 transition" />
            <span className="absolute -top-1 -right-1 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition shadow-md">{remove}</span>
          </div>
        );
      }

      return (
        <div key={index} className="flex items-center gap-1.5 max-w-full text-xs px-2.5 py-1 rounded-lg bg-cyan-950/40 text-cyan-200 border border-cyan-500/40 shadow-xs font-mono">
          {iconFor(attachment)}
          <span className="truncate">{label}</span>
          {attachment.sizeFormatted && <span className="text-slate-400 text-[10px] shrink-0">{attachment.sizeFormatted}</span>}
          {remove}
        </div>
      );
    })}
  </div>
);
