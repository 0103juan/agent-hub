import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Notice } from '../../shared/types';

const relativeTime = (at: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  return `hace ${Math.floor(seconds / 86400)} d`;
};

/** Campana con el historial de avisos; lo no leído es lo que llegó después del último id visto. */
export const Notifications: React.FC<{ notices: Notice[]; onOpenSession: (sessionId: string) => void }> = ({ notices, onOpenSession }) => {
  const [open, setOpen] = useState(false);
  const [readId, setReadId] = useState<string | undefined>();
  const readIndex = readId ? notices.findIndex((notice) => notice.id === readId) : -1;
  const unread = notices.length - (readIndex + 1);

  const toggle = () => {
    if (!open && notices.length > 0) setReadId(notices[notices.length - 1].id);
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="relative p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
        aria-label={`Notificaciones${unread > 0 ? `, ${unread} sin leer` : ''}`}
        title="Notificaciones"
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-indigo-600 text-white text-[9px] leading-[14px] text-center font-mono">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <ul className="absolute right-0 top-full mt-1 z-40 w-72 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {notices.length === 0 && <li className="p-1.5 text-[11px] text-zinc-400">Sin avisos.</li>}
          {[...notices].reverse().map((notice) => (
            <li key={notice.id}>
              <button
                type="button"
                disabled={!notice.sessionId}
                onClick={() => {
                  if (notice.sessionId) onOpenSession(notice.sessionId);
                  setOpen(false);
                }}
                className="block w-full text-left px-1.5 py-1 rounded text-[11px] text-zinc-300 enabled:hover:bg-zinc-800 disabled:cursor-default"
              >
                <span className="block break-words">{notice.text}</span>
                <span className="block text-[10px] text-zinc-500 font-mono">{relativeTime(notice.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
