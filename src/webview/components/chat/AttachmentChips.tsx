import React from 'react';
import { FileCode, Film, Music, X } from 'lucide-react';
import { FileContextAttachment } from '../../../shared/types';

interface Props {
  attachments: FileContextAttachment[];
  onRemove: (index: number) => void;
}

const removeButtonClass = 'rounded-full bg-black/70 text-zinc-200 hover:text-red-400 p-0.5';

function iconFor(attachment: FileContextAttachment): React.ReactNode {
  if (attachment.mediaType === 'audio') return <Music className="w-3 h-3 text-amber-400" />;
  if (attachment.mediaType === 'video') return <Film className="w-3 h-3 text-purple-400" />;
  return <FileCode className="w-3 h-3 text-indigo-400" />;
}

/** Bandeja del compositor: miniatura para imágenes y etiqueta para el resto. */
export const AttachmentChips: React.FC<Props> = ({ attachments, onRemove }) => (
  <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-zinc-900/60 rounded border border-zinc-800">
    {attachments.map((attachment, index) => {
      const label = `${attachment.file}${attachment.lines ? `#${attachment.lines}` : ''}`;
      const remove = (
        <button type="button" aria-label={`Quitar ${attachment.file}`} onClick={() => onRemove(index)} className={removeButtonClass}>
          <X className="w-3 h-3" />
        </button>
      );

      if (attachment.mediaType === 'image' && attachment.mediaUri) {
        return (
          <div key={index} className="relative group" title={label}>
            <img src={attachment.mediaUri} alt={attachment.file} className="h-14 w-14 rounded-md border border-zinc-700 object-cover bg-black/40" />
            <span className="absolute top-0.5 right-0.5 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">{remove}</span>
          </div>
        );
      }

      return (
        <div key={index} className="flex items-center gap-1 max-w-full text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
          {iconFor(attachment)}
          <span className="font-mono truncate">{label}</span>
          {attachment.sizeFormatted && <span className="text-zinc-400 shrink-0">{attachment.sizeFormatted}</span>}
          {remove}
        </div>
      );
    })}
  </div>
);
