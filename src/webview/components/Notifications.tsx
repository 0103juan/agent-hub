import React, { useState } from 'react';
import { AlertCircle, Bell, CheckCircle2 } from 'lucide-react';
import { Notice } from '../../shared/types';
import { relativeTime } from '../utils/format';

/** Campana con el historial de avisos; lo no leído es lo que llegó después del último id visto. */
export const Notifications: React.FC<{ notices: Notice[]; onOpenSession: (sessionId: string) => void }> = ({ notices: allNotices, onOpenSession }) => {
  const [open, setOpen] = useState(false);
  // "Limpiar" oculta lo anterior en esta ventana; el historial del host no se toca.
  const [clearedAt, setClearedAt] = useState(0);
  const notices = allNotices.filter((notice) => notice.at > clearedAt);
  const [readId, setReadId] = useState<string | undefined>();
  const readIndex = readId ? notices.findIndex((notice) => notice.id === readId) : -1;
  const unread = notices.length - (readIndex + 1);
  const isFailure = (text: string) => /fall|error|no se pudo/i.test(text);
  const unreadFailures = notices.slice(readIndex + 1).filter((notice) => isFailure(notice.text)).length;

  const toggle = () => {
    if (!open && notices.length > 0) setReadId(notices[notices.length - 1].id);
    setOpen(!open);
  };

  return (
    <div className="relative" onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}>
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
          <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full ${unreadFailures > 0 ? 'bg-red-600' : 'bg-indigo-600'} text-white text-[9px] leading-[14px] text-center font-mono`}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <ul className="absolute right-0 top-full mt-1 z-40 w-72 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          <li className="flex items-center justify-between px-1.5 py-1 text-[10px] text-zinc-500 uppercase tracking-wider">
            <span>{notices.length} aviso{notices.length === 1 ? '' : 's'}</span>
            <button
              type="button"
              disabled={notices.length === 0}
              onClick={() => setClearedAt(Date.now())}
              className="normal-case tracking-normal text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              Limpiar todo
            </button>
          </li>
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
                <span className="flex items-start gap-1 break-words">
                  {isFailure(notice.text) ? <AlertCircle className="w-3 h-3 mt-0.5 text-red-400 shrink-0" aria-label="Fallo" /> : <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-400 shrink-0" aria-label="Aviso" />}
                  <span>{notice.text}</span>
                </span>
                <span className="block text-[10px] text-zinc-500 font-mono">{relativeTime(notice.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
