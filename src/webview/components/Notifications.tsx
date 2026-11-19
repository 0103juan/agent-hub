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
    <div className="relative shrink-0" onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`relative p-1.5 rounded-lg hover:bg-[#162035] text-slate-400 hover:text-slate-100 border border-transparent hover:border-[#202b3f] transition cursor-pointer ${
          open ? 'bg-[#162035] text-cyan-300 border-[#202b3f]' : ''
        }`}
        aria-label={`Notificaciones${unread > 0 ? `, ${unread} sin leer` : ''}`}
        title="Notificaciones"
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full ${
              unreadFailures > 0 ? 'bg-red-600 shadow-sm shadow-red-500/50' : 'bg-cyan-600 shadow-sm shadow-cyan-500/50'
            } text-white text-[9px] leading-[15px] text-center font-mono font-bold`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <ul className="absolute right-0 top-full mt-1.5 z-50 w-80 max-h-80 overflow-y-auto rounded-xl border border-[#202b3f] bg-[#0a0e17] p-1.5 shadow-2xl shadow-black/80 space-y-1 animate-modal-pop">
          <li className="flex items-center justify-between px-2 py-1 text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider border-b border-[#202b3f]">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${unreadFailures > 0 ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
              {notices.length} aviso{notices.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              disabled={notices.length === 0}
              onClick={() => setClearedAt(Date.now())}
              className="normal-case tracking-normal text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40 transition cursor-pointer"
            >
              Limpiar todo
            </button>
          </li>
          {notices.length === 0 && (
            <li className="p-3 text-xs text-center text-slate-500 font-mono">Sin avisos pendientes.</li>
          )}
          {[...notices].reverse().map((notice) => {
            const failed = isFailure(notice.text);
            return (
              <li key={notice.id}>
                <button
                  type="button"
                  disabled={!notice.sessionId}
                  onClick={() => {
                    if (notice.sessionId) onOpenSession(notice.sessionId);
                    setOpen(false);
                  }}
                  className={`block w-full text-left p-2 rounded-lg text-xs transition border ${
                    failed
                      ? 'bg-red-950/20 hover:bg-red-950/30 border-red-900/40 text-red-200'
                      : 'bg-[#07090e] hover:bg-[#162035] border-[#202b3f] text-slate-200'
                  } ${notice.sessionId ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="flex items-start gap-2 break-words">
                    {failed ? (
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-red-400 shrink-0" aria-label="Fallo" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" aria-label="Aviso" />
                    )}
                    <span className="flex-1 font-medium">{notice.text}</span>
                  </span>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 font-mono">
                    <span>{relativeTime(notice.at)}</span>
                    {notice.sessionId && (
                      <span className="text-cyan-400 hover:text-cyan-300">Ir a sesión</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
