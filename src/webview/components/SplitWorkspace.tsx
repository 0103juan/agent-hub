import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, Clock, Columns3, ExternalLink, FolderGit2, Layers, LayoutGrid, Loader2, Maximize2, MessageSquare, Minimize2, Plus, Rows3, Search, Send, Terminal, Users } from 'lucide-react';
import { normalizeText } from '../../shared/workspace-actions';
import { relativeTime } from '../utils/format';
import { agentName } from '../../shared/agent-name';
import { agentLabel, groupByFlow } from '../../shared/flows';
import { ConversationSession } from '../../shared/types';
import { HubAction, HubState } from '../state/hub-state';
import { isElectron, postToHost } from '../vscode-api';
import { ChatView } from './chat/ChatView';
import { WorkspacePicker } from './WorkspacePicker';
import { GitBranchBadge } from './GitBranchBadge';

const SPLIT_KEY = 'agent-hub.split';
const LAYOUT_KEY = 'agent-hub.splitLayout';
const SETS_KEY = 'agent-hub.splitSets';
const MAX_COLUMNS = 4;
const MIN_COLUMN_WIDTH = 340; // por debajo el encabezado y el composer se desbordan; la fila hace scroll horizontal

export type SplitLayout = 'cols' | 'rows' | 'grid';
interface SavedSet { name: string; ids: string[] }

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Estado de la vista en columnas; vive en App porque el botón de la barra y las columnas lo comparten. */
export function useSplit(sessions: ConversationSession[]) {
  const [ids, setIdsState] = useState<string[]>(() => load(SPLIT_KEY, []));
  const [layout, setLayoutState] = useState<SplitLayout>(() => load(LAYOUT_KEY, 'cols'));
  const [sets, setSetsState] = useState<SavedSet[]>(() => load(SETS_KEY, []));
  const [maximized, setMaximized] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});

  const setIds = useCallback((next: string[]) => {
    const clean = [...new Set(next)].slice(-MAX_COLUMNS);
    save(SPLIT_KEY, clean);
    setIdsState(clean);
  }, []);
  const toggle = useCallback((id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]), [ids, setIds]);
  const move = useCallback(
    (from: string, to: string) => {
      const a = ids.indexOf(from);
      const b = ids.indexOf(to);
      if (a < 0 || b < 0) return;
      const next = ids.filter((x) => x !== from);
      next.splice(b, 0, from); // hacia la derecha cae después del destino; hacia la izquierda, antes
      setIds(next);
    },
    [ids, setIds]
  );
  const setLayout = (next: SplitLayout) => {
    save(LAYOUT_KEY, next);
    setLayoutState(next);
  };
  const setSets = (next: SavedSet[]) => {
    save(SETS_KEY, next);
    setSetsState(next);
  };
  useEffect(() => {
    if (sessions.length && ids.some((id) => !sessions.some((s) => s.id === id))) setIds(ids.filter((id) => sessions.some((s) => s.id === id)));
  }, [sessions, ids, setIds]);
  const list = ids.flatMap((id) => sessions.filter((s) => s.id === id));
  return { ids, list, layout, setLayout, sets, setSets, setIds, toggle, move, maximized, setMaximized, weights, setWeights };
}
export type SplitApi = ReturnType<typeof useSplit>;

type ChatProps = React.ComponentProps<typeof ChatView>;
/**
 * Cada fragmento de stream cambia `state.sessions`, y con él todas las columnas. Una columna solo se repinta
 * si cambió su sesión o algo que ChatView lee de `state` (la lista de sesiones solo por título, equipo y conteo).
 */
const sameChat = (a: ChatProps, b: ChatProps) => {
  const id = b.session.id;
  const x = a.state;
  const y = b.state;
  return (
    a.session === b.session && a.focusMode === b.focusMode && a.embedded === b.embedded && a.dispatch === b.dispatch && // onOpenHistory/onNewTask se recrean en cada render pero hacen siempre lo mismo
   
    x.accounts === y.accounts && x.attachments[id] === y.attachments[id] && x.composerText === y.composerText &&
    x.fileDiffs === y.fileDiffs && x.focusComposerTick === y.focusComposerTick && x.live[id] === y.live[id] &&
    x.queues === y.queues && x.runningSessionIds === y.runningSessionIds && x.telemetry === y.telemetry &&
    x.workspaceFiles === y.workspaceFiles &&
    x.sessions.length === y.sessions.length &&
    x.sessions.every((p, i) => {
      const n = y.sessions[i];
      return p === n || (p.id === n.id && p.title === n.title && p.squad === n.squad && p.squadName === n.squadName && p.messageCount === n.messageCount && p.projectName === n.projectName);
    })
  );
};
const Chat = React.memo(ChatView, sameChat);

/** Hay vista en columnas cuando el chat activo es una de al menos dos columnas. */
export const isSplitActive = (sp: SplitApi, activeId: string) => sp.list.length > 1 && sp.ids.includes(activeId);

/** Abre el chat en su propia ventana; sirve con dos monitores. */
const openSolo = (id: string) => {
  const url = `${location.origin}/?solo=${encodeURIComponent(id)}`;
  if (isElectron()) {
    postToHost({ command: 'popOutWindow', url });
  } else {
    window.open(url, '_blank', 'width=720,height=900');
  }
};

const lastAnswer = (s: ConversationSession) =>
  [...s.messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())?.content.trim().slice(0, 220) ?? '';

interface BarProps {
  state: HubState;
  session: ConversationSession;
  sp: SplitApi;
  switchSession: (id: string) => void;
  onOpenHistory: () => void;
  onNewTask: () => void;
}

export const SplitBar: React.FC<BarProps> = ({ state, session, sp, switchSession, onOpenHistory, onNewTask }) => {
  const [menu, setMenu] = useState<'none' | 'chats' | 'pending'>('none');
  const [setName, setSetName] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu === 'none') return;
    const close = (event: Event) => {
      if (event.type === 'keydown' ? (event as KeyboardEvent).key === 'Escape' : !barRef.current?.contains(event.target as Node)) setMenu('none');
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);
  const running = (id: string) => state.runningSessionIds.includes(id);
  const pending = state.attentionSessionIds.flatMap((id) => state.sessions.filter((s) => s.id === id));
  const { flows, loose } = groupByFlow(state.sessions, state.runningSessionIds);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const q = normalizeText(query.trim());
  const matches = (...texts: Array<string | undefined>) => !q || texts.some((text) => text && normalizeText(text).includes(q));
  const shownFlows = flows.filter((f) => matches(f.name, f.project, ...f.members.map((m) => `${agentLabel(m, f.members)} ${m.title}`)));
  const shownLoose = loose.filter((s) => matches(s.title, s.projectName));
  const full = sp.ids.length >= MAX_COLUMNS;

  const toggleFlow = (members: ConversationSession[]) => {
    const allSelected = members.length > 0 && members.every((m) => sp.ids.includes(m.id));
    if (allSelected) {
      apply(sp.ids.filter((id) => !members.some((m) => m.id === id)));
    } else {
      const remainingSlots = Math.max(0, MAX_COLUMNS - sp.ids.length);
      const toAdd = members.filter((m) => !sp.ids.includes(m.id)).slice(0, remainingSlots).map((m) => m.id);
      apply([...sp.ids, ...toAdd]);
    }
  };

  // Las columnas solo se pintan si el chat activo es una de ellas: si la selección no lo incluye, se pasa al primero.
  const apply = (next: string[]) => {
    const clean = [...new Set(next)].slice(-MAX_COLUMNS);
    sp.setIds(clean);
    if (clean.length > 1 && !clean.includes(session.id)) switchSession(clean[0]);
  };
  const pick = (id: string) => apply(sp.ids.length === 0 && id !== session.id ? [session.id, id] : sp.ids.includes(id) ? sp.ids.filter((x) => x !== id) : [...sp.ids, id]);
  const reveal = (id: string) => {
    // ponytail: si ya hay columnas, el chat se suma; si no, solo se abre.
    if (sp.list.length > 0 && !sp.ids.includes(id)) sp.setIds([...sp.ids, id]);
    switchSession(id);
    setMenu('none');
  };
  const send = () => {
    const prompt = broadcast.trim();
    if (!prompt) return;
    sp.list.forEach((s) => postToHost({ command: 'sendPrompt', sessionId: s.id, prompt, attachments: [] }));
    setBroadcast('');
  };
  const layoutBtn = (value: SplitLayout, icon: React.ReactNode, label: string) => (
    <button
      key={value}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={sp.layout === value}
      onClick={() => sp.setLayout(value)}
      className={`p-1.5 rounded-md transition cursor-pointer ${sp.layout === value ? 'bg-[#0c1220] text-cyan-300 border border-cyan-800/40 shadow-xs' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
    >
      {icon}
    </button>
  );

  return (
    <div ref={barRef} className="relative z-40 flex items-center gap-2.5 px-3 py-1.5 border-b border-[#202b3f] bg-[#0a0e17]/95 backdrop-blur-md shrink-0 text-xs text-slate-300 flex-wrap">
      <button
        type="button"
        onClick={() => setMenu(menu === 'chats' ? 'none' : 'chats')}
        aria-expanded={menu === 'chats'}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold transition cursor-pointer ${sp.ids.length ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs' : 'bg-[#0c1220] border-[#202b3f] text-slate-300 hover:text-white'}`}
      >
        <Columns3 className="w-3.5 h-3.5" aria-hidden />
        Columnas{sp.ids.length ? ` (${sp.list.length})` : ''}
      </button>

      {sp.list.length > 1 && (
        <>
          <div className="flex items-center bg-[#07090e] rounded-lg border border-[#202b3f] p-0.5">
            {layoutBtn('cols', <Columns3 className="w-3.5 h-3.5" />, 'Columnas')}
            {layoutBtn('rows', <Rows3 className="w-3.5 h-3.5" />, 'Filas')}
            {layoutBtn('grid', <LayoutGrid className="w-3.5 h-3.5" />, 'Cuadrícula 2×2')}
          </div>
          <form
            className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={broadcast}
              onChange={(event) => setBroadcast(event.target.value)}
              placeholder={`Enviar a las ${sp.list.length} columnas…`}
              aria-label="Enviar el mismo mensaje a todas las columnas"
              className="flex-1 min-w-0 px-3 py-1 rounded-xl bg-[#07090e] border border-[#202b3f] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono shadow-inner text-xs"
            />
            <button type="submit" aria-label="Enviar a todas" disabled={!broadcast.trim()} className="p-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition disabled:opacity-30 cursor-pointer shadow-xs">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </>
      )}

      <button
        type="button"
        onClick={() => setMenu(menu === 'pending' ? 'none' : 'pending')}
        aria-expanded={menu === 'pending'}
        className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold transition cursor-pointer ${pending.length ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-xs' : 'bg-[#0c1220] border-[#202b3f] text-slate-400 hover:text-slate-200'}`}
      >
        <Bell className="w-3.5 h-3.5" aria-hidden />
        Pendientes{pending.length ? ` (${pending.length})` : ''}
      </button>
      {sp.list.length < 2 && <button type="button" aria-label="Abrir este chat en otra ventana" title="Abrir este chat en otra ventana" onClick={() => openSolo(session.id)} className="p-1.5 rounded-lg hover:bg-[#0c1220] text-slate-400 hover:text-cyan-300 border border-transparent hover:border-[#202b3f] transition-colors cursor-pointer">
        <ExternalLink className="w-3.5 h-3.5" />
      </button>}
      {sp.list.length > 1 && (
        <>
          <button type="button" onClick={onOpenHistory} aria-label={`Historial, ${state.sessions.length} conversaciones`} title="Abrir el historial de conversaciones" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-slate-700 text-slate-300 hover:text-white border border-[#202b3f] transition font-mono text-xs cursor-pointer">
            <Layers className="w-3.5 h-3.5" aria-hidden />
            Historial {state.sessions.length}
          </button>
          <button type="button" onClick={onNewTask} aria-label="Nueva tarea" title="Crear nueva tarea en un proyecto" className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold transition cursor-pointer shadow-md shadow-cyan-500/20 text-xs">
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Nueva tarea
          </button>
        </>
      )}

      {menu === 'chats' && (
        <div className="absolute left-3 top-full mt-1 z-30 w-[min(60rem,calc(100vw-1.5rem))] max-h-[min(36rem,75vh)] flex flex-col rounded-xl border border-[#202b3f] bg-[#0a0e17] shadow-2xl shadow-black/80 animate-modal-pop">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#202b3f]">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por flujo, proyecto, rol o chat…"
                aria-label="Buscar chats"
                className="w-full pl-8 pr-2 py-1 rounded-lg bg-[#07090e] border border-[#202b3f] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs"
              />
            </div>
            <span className={`shrink-0 font-mono text-[11px] ${full ? 'text-amber-300' : 'text-slate-400'}`} title={full ? `Máximo ${MAX_COLUMNS} columnas: quita una para agregar otra` : 'Columnas elegidas'}>
              {sp.ids.length}/{MAX_COLUMNS} columnas
            </span>
            {sp.ids.length > 0 && (
              <button type="button" onClick={() => sp.setIds([])} className="shrink-0 text-slate-400 hover:text-slate-200 cursor-pointer">
                Limpiar
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[3fr_2fr] md:divide-x divide-[#202b3f] overflow-y-auto md:overflow-hidden">
            <section className="min-h-0 md:overflow-y-auto p-2 space-y-1.5" aria-label="Equipos de agentes por flujo">
              <h3 className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <Users className="w-3 h-3" aria-hidden /> Equipos por flujo · {shownFlows.length}
              </h3>
              {shownFlows.length === 0 && <p className="px-1 py-3 text-slate-500">{q ? 'Ningún equipo coincide.' : 'Aún no hay equipos.'}</p>}
              {shownFlows.map((flow) => {
                const picked = flow.members.filter((m) => sp.ids.includes(m.id)).length;
                const busy = flow.members.filter((m) => running(m.id)).length;
                const open = expanded[flow.squad] ?? (Boolean(q) || picked > 0 || busy > 0);
                return (
                  <div key={flow.squad} className={`rounded-lg border ${picked ? 'border-cyan-700/50 bg-cyan-950/10' : 'border-[#202b3f] bg-[#07090e]/60'}`}>
                    <div className="flex items-start gap-2 px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        aria-label={`Ver todo el equipo ${flow.name}`}
                        checked={picked === flow.members.length}
                        ref={(el) => {
                          if (el) el.indeterminate = picked > 0 && picked < flow.members.length;
                        }}
                        disabled={picked < flow.members.length && full}
                        onChange={() => toggleFlow(flow.members)}
                      />
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpanded({ ...expanded, [flow.squad]: !open })}
                        className="flex-1 min-w-0 text-left cursor-pointer group"
                        title={flow.name}
                      >
                        <span className="flex items-center gap-1.5">
                          {open ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" aria-hidden /> : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" aria-hidden />}
                          <span className={`w-2 h-2 rounded-full shrink-0 ${busy ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} aria-hidden />
                          <span className="truncate text-slate-100 font-medium group-hover:text-cyan-200">{flow.name}</span>
                        </span>
                        <span className="mt-0.5 pl-[1.375rem] flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-400">
                          <span className={`inline-flex items-center gap-1 px-1.5 rounded font-mono ${flow.project ? 'bg-[#162035] text-cyan-300' : 'bg-[#0c1220] text-slate-500'}`}>
                            <FolderGit2 className="w-2.5 h-2.5" aria-hidden />
                            {flow.project ?? 'Sin proyecto'}
                          </span>
                          <span title={new Date(flow.createdAt).toLocaleString('es')}>Inició {relativeTime(flow.createdAt)}</span>
                          <span>{flow.members.length} agentes</span>
                          {busy > 0 && <span className="text-emerald-300">{busy} trabajando</span>}
                          {picked > 0 && <span className="text-cyan-300">{picked} en columnas</span>}
                        </span>
                        {!open && (
                          <span className="mt-0.5 pl-[1.375rem] block truncate text-[10.5px] text-slate-500">
                            {flow.members.map((m) => agentLabel(m, flow.members)).join(' → ')}
                          </span>
                        )}
                      </button>
                    </div>
                    {open && (
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 px-2 pb-1.5 pl-7">
                        {flow.members.map((s) => (
                          <li key={s.id}>
                            <label className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-[#162035] cursor-pointer" title={s.title}>
                              <input type="checkbox" checked={sp.ids.includes(s.id)} disabled={!sp.ids.includes(s.id) && full} onChange={() => pick(s.id)} />
                              <span className="truncate text-slate-200">{agentLabel(s, flow.members)}</span>
                              {running(s.id) ? (
                                <Loader2 className="ml-auto w-3 h-3 animate-spin text-cyan-300 shrink-0" aria-label="Trabajando" />
                              ) : (
                                <span className="ml-auto shrink-0 text-[10px] text-slate-500">{relativeTime(s.updatedAt)}</span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="min-h-0 md:overflow-y-auto p-2 space-y-0.5" aria-label="Chats sueltos">
              <h3 className="flex items-center gap-1.5 px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <MessageSquare className="w-3 h-3" aria-hidden /> Chats sueltos · {shownLoose.length}
              </h3>
              {shownLoose.length === 0 && <p className="px-1 py-3 text-slate-500">{q ? 'Ningún chat coincide.' : 'No hay chats sueltos.'}</p>}
              {shownLoose.map((s) => (
                <label key={s.id} className={`flex items-start gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-[#162035] ${sp.ids.includes(s.id) ? 'bg-cyan-950/20' : ''}`} title={s.title}>
                  <input type="checkbox" className="mt-0.5" checked={sp.ids.includes(s.id)} disabled={!sp.ids.includes(s.id) && full} onChange={() => pick(s.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {running(s.id) && <Loader2 className="w-3 h-3 animate-spin text-cyan-300 shrink-0" aria-label="Trabajando" />}
                      <span className="truncate text-slate-200">{s.title}</span>
                    </span>
                    <span className="flex gap-2 text-[10.5px] text-slate-500">
                      <span className="truncate font-mono text-slate-400">{s.projectName ?? 'Sin proyecto'}</span>
                      <span className="shrink-0">{relativeTime(s.updatedAt)}</span>
                    </span>
                  </span>
                </label>
              ))}
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-[#202b3f]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Conjuntos</span>
            {sp.sets.length === 0 && <span className="text-slate-600">Ninguno guardado.</span>}
            {sp.sets.map((set) => (
              <span key={set.name} className="inline-flex items-center rounded-full border border-[#202b3f] bg-[#0c1220]">
                <button
                  type="button"
                  onClick={() => {
                    apply(set.ids.filter((id) => state.sessions.some((s) => s.id === id)));
                    setMenu('none');
                  }}
                  className="pl-2.5 pr-1 py-0.5 text-slate-200 hover:text-cyan-300 cursor-pointer"
                >
                  {set.name} <span className="text-slate-500">· {set.ids.length}</span>
                </button>
                <button type="button" aria-label={`Borrar ${set.name}`} onClick={() => sp.setSets(sp.sets.filter((x) => x.name !== set.name))} className="pr-2 text-slate-500 hover:text-red-300 cursor-pointer">
                  ×
                </button>
              </span>
            ))}
            {sp.ids.length > 0 && (
              <form
                className="ml-auto flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = setName.trim();
                  if (!name) return;
                  sp.setSets([...sp.sets.filter((x) => x.name !== name), { name, ids: sp.ids }]);
                  setSetName('');
                }}
              >
                <input value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="Guardar selección como…" aria-label="Nombre del conjunto" className="w-44 px-2 py-0.5 rounded bg-[#07090e] border border-[#202b3f] text-slate-200 focus:outline-none focus:border-cyan-500 text-xs" />
                <button type="submit" disabled={!setName.trim()} className="px-2 py-0.5 rounded border border-[#202b3f] bg-[#0c1220] hover:text-cyan-300 disabled:opacity-40 text-xs cursor-pointer">
                  Guardar
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {menu === 'pending' && (
        <ul className="absolute right-3 top-full mt-1 z-30 w-96 max-h-80 overflow-y-auto rounded-xl border border-[#202b3f] bg-[#0a0e17] p-1.5 shadow-2xl">
          {pending.length === 0 && <li className="px-2 py-3 text-center text-slate-500">Nada te espera.</li>}
          {pending.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => reveal(s.id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-[#162035]">
                <div className="flex items-center gap-2">
                  <span className="truncate text-slate-200 font-medium">{agentName(s)}</span>
                  {s.projectName && <span className="ml-auto shrink-0 text-slate-500">{s.projectName}</span>}
                </div>
                <div className="mt-0.5 line-clamp-3 text-slate-400">{lastAnswer(s) || 'Sin respuesta todavía.'}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface ColumnsProps {
  state: HubState;
  session: ConversationSession;
  sp: SplitApi;
  focusMode: boolean;
  dispatch: React.Dispatch<HubAction>;
  switchSession: (id: string) => void;
  recentDirs: string[];
  onCheckoutBranch?: (branch: string, dir?: string) => void;
  onCreateBranch?: (branch: string, dir?: string) => void;
  onOpenBranchManager?: (dir?: string) => void;
  /** Abre (o reutiliza) una pestaña de terminal en esa carpeta. */
  onOpenTerminal?: (dir: string) => void;
  onOpenHistory: () => void;
  onNewTask: () => void;
}

interface DirGit { branch?: string; branches?: string[]; squadBranches?: string[]; uncommitted?: number }

/** Rama y cambios de cada carpeta en columnas; el estado git de App es solo el del chat activo. */
function useDirGit(dirs: string[]): Record<string, DirGit> {
  const [byDir, setByDir] = useState<Record<string, DirGit>>({});
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.dir) return;
      if (msg.type === 'gitBranches') {
        setByDir((prev) => ({ ...prev, [msg.dir]: { ...prev[msg.dir], branch: msg.currentBranch, branches: msg.branches, squadBranches: msg.squadBranches } }));
      } else if (msg.type === 'dirGitStatus') {
        setByDir((prev) => ({ ...prev, [msg.dir]: { ...prev[msg.dir], branch: msg.branch, uncommitted: msg.uncommittedCount } }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const key = dirs.join('|');
  useEffect(() => {
    dirs.forEach((dir) => postToHost({ command: 'getDirGitStatus', dir }));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return byDir;
}

export const SplitColumns: React.FC<ColumnsProps> = ({
  state,
  session,
  sp,
  focusMode,
  dispatch,
  switchSession,
  recentDirs,
  onCheckoutBranch,
  onCreateBranch,
  onOpenBranchManager,
  onOpenTerminal,
  onOpenHistory,
  onNewTask
}) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const active = isSplitActive(sp, session.id);
  const shown = active ? (sp.maximized && sp.ids.includes(sp.maximized) ? sp.list.filter((s) => s.id === sp.maximized) : sp.list) : [session];
  const split = active && shown.length > 1;
  const git = useDirGit(active ? [...new Set(shown.flatMap((s) => (s.projectPath ? [s.projectPath] : [])))] : []);
  const rootRef = useRef<HTMLDivElement>(null);

  const focusColumn = useCallback(
    (id: string) => {
      switchSession(id);
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLTextAreaElement>(`[data-col="${id}"] textarea`)?.focus());
    },
    [switchSession]
  );

  // Ctrl+Alt+1..4 enfoca una columna; Ctrl+Alt+←/→ salta a la vecina.
  useEffect(() => {
    if (!split) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.altKey)) return;
      const index = shown.findIndex((s) => s.id === session.id);
      let target: ConversationSession | undefined;
      if (/^[1-4]$/.test(event.key)) target = shown[Number(event.key) - 1];
      else if (event.key === 'ArrowRight') target = shown[(index + 1) % shown.length];
      else if (event.key === 'ArrowLeft') target = shown[(index - 1 + shown.length) % shown.length];
      if (!target) return;
      event.preventDefault();
      focusColumn(target.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const status = (s: ConversationSession) =>
    state.waitingSessionIds.includes(s.id) ? (
      <Clock className="w-3 h-3 text-slate-400 shrink-0" aria-label="En espera" />
    ) : state.runningSessionIds.includes(s.id) ? (
      <Loader2 className="w-3 h-3 animate-spin text-cyan-300 shrink-0" aria-label="Trabajando" />
    ) : state.attentionSessionIds.includes(s.id) ? (
      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" role="img" aria-label="Te espera" />
    ) : (
      <span className="w-2 h-2 rounded-full bg-emerald-500/70 shrink-0" role="img" aria-label="Inactivo" />
    );

  // Arrastrar el borde entre dos columnas reparte su espacio.
  const startResize = (event: React.PointerEvent<HTMLDivElement>, a: string, b: string) => {
    const before = event.currentTarget.previousElementSibling as HTMLElement | null;
    const after = event.currentTarget.nextElementSibling as HTMLElement | null;
    if (!before || !after) return;
    const horizontal = sp.layout === 'cols';
    const min = horizontal ? MIN_COLUMN_WIDTH : 160;
    const size = (el: HTMLElement) => (horizontal ? el.getBoundingClientRect().width : el.getBoundingClientRect().height);
    const sa = size(before);
    const sb = size(after);
    const wa = sp.weights[a] ?? 1;
    const wb = sp.weights[b] ?? 1;
    const start = horizontal ? event.clientX : event.clientY;
    const onMove = (e: PointerEvent) => {
      const delta = (horizontal ? e.clientX : e.clientY) - start;
      const next = Math.min(Math.max(sa + delta, min), Math.max(min, sa + sb - min));
      const share = next / (sa + sb);
      sp.setWeights({ ...sp.weights, [a]: (wa + wb) * share, [b]: (wa + wb) * (1 - share) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const container =
    split && sp.layout === 'grid' ? 'grid grid-cols-2 auto-rows-fr gap-2' : split && sp.layout === 'rows' ? 'flex flex-col' : 'flex';
  const scrollX = split && sp.layout === 'cols' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden';

  return (
    <div
      ref={rootRef}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('text/plain')) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const id = event.dataTransfer.getData('text/plain');
        if (!state.sessions.some((s) => s.id === id)) return;
        event.preventDefault();
        sp.setIds([...(sp.ids.length ? sp.ids : [session.id]), id]);
      }}
      className={`flex-1 min-w-0 h-full min-h-0 ${scrollX} ${container} ${over ? 'ring-2 ring-cyan-500/60 rounded-lg' : ''}`}
    >
      {shown.map((column, index) => (
        <React.Fragment key={column.id}>
          {split && index > 0 && sp.layout !== 'grid' && (
            <div
              role="separator"
              aria-label="Ajustar tamaño"
              onPointerDown={(event) => startResize(event, shown[index - 1].id, column.id)}
              className={`shrink-0 rounded bg-[#202b3f] hover:bg-cyan-500 transition-colors ${sp.layout === 'cols' ? 'w-1.5 mx-0.5 cursor-col-resize' : 'h-1.5 my-0.5 cursor-row-resize'}`}
            />
          )}
          <div
            data-col={column.id}
            onFocusCapture={() => column.id !== session.id && switchSession(column.id)}
            style={split && sp.layout !== 'grid' ? { flex: `${sp.weights[column.id] ?? 1} 1 0%` } : undefined}
            className={`${split && sp.layout === 'cols' ? 'min-w-[340px]' : 'min-w-0'} min-h-0 flex flex-col overflow-hidden ${split ? '' : 'flex-1 h-full'} ${active ? `rounded-xl border ${column.id === session.id ? 'border-cyan-500/70 shadow-lg shadow-cyan-950/40' : 'border-[#202b3f]'}` : ''}`}
          >
            {active && ( // maximizada también: el título trae el botón para restaurar
              <div
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/x-column', column.id);
                  setDragId(column.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  if (!dragId) return;
                  event.stopPropagation();
                  if (dragId !== column.id) sp.move(dragId, column.id);
                  setDragId(null);
                }}
                onDoubleClick={() => sp.setMaximized(sp.maximized === column.id ? null : column.id)}
                title={column.title}
                className="relative shrink-0 px-3 py-1.5 space-y-1 text-xs bg-[#07090e]/95 border-b border-[#202b3f] backdrop-blur-md cursor-grab select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                {status(column)}
                <span className="min-w-0 flex-1 truncate text-slate-300">
                  <span className="text-slate-500 font-mono mr-1">{index + 1}</span>
                  {column.title}
                </span>
                <span className="flex items-center gap-1.5 text-slate-500 shrink-0">
                  {column.projectPath && onOpenTerminal && (
                    <button type="button" aria-label="Terminal en la carpeta de este chat" title={`Terminal en ${column.projectPath}`} onClick={() => onOpenTerminal(column.projectPath!)} className="hover:text-emerald-300">
                      <Terminal className="w-3 h-3" />
                    </button>
                  )}
                  <button type="button" aria-label="Abrir en otra ventana" title="Abrir en otra ventana" onClick={() => openSolo(column.id)} className="hover:text-slate-200">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={sp.maximized === column.id ? 'Restaurar columnas' : 'Maximizar columna'}
                    title={sp.maximized === column.id ? 'Restaurar columnas (doble clic en el título)' : 'Maximizar (doble clic en el título)'}
                    onClick={() => sp.setMaximized(sp.maximized === column.id ? null : column.id)}
                    className="hover:text-slate-200"
                  >
                    {sp.maximized === column.id ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar de la vista dividida"
                    onClick={() => {
                      if (column.id === session.id) switchSession(sp.list.find((other) => other.id !== column.id)!.id);
                      if (sp.maximized === column.id) sp.setMaximized(null);
                      sp.toggle(column.id);
                    }}
                    className="hover:text-slate-200"
                  >
                    ×
                  </button>
                </span>
                </div>
                {/* Carpeta y rama de esta columna, no las del chat activo; en otra fila para que no se monten sobre el título. */}
                <div className="flex flex-wrap items-center gap-1.5 min-w-0" onMouseDown={(event) => event.stopPropagation()} draggable={false}>
                  <WorkspacePicker sessionId={column.id} currentDir={column.projectPath} recentDirs={recentDirs} />
                  {column.projectPath && (
                    <GitBranchBadge
                      compact
                      branch={column.isolatedBranch || git[column.projectPath]?.branch}
                      branches={git[column.projectPath]?.branches}
                      squadBranches={git[column.projectPath]?.squadBranches}
                      uncommittedCount={git[column.projectPath]?.uncommitted}
                      onCheckout={onCheckoutBranch}
                      onCreate={onCreateBranch}
                      onOpenManager={onOpenBranchManager}
                      currentDir={column.projectPath}
                    />
                  )}
                  {column.squadName && (
                    <span className="min-w-0 truncate px-1.5 py-0.5 rounded bg-violet-950/40 border border-violet-700/40 text-violet-200 text-[10px]" title={`Flujo: ${column.squadName}`}>
                      {column.squadName}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col">{/* el título de la columna resta altura: sin esto el chat (h-full) empuja el composer fuera */}
              <Chat state={state} session={column} focusMode={focusMode} embedded={active} dispatch={dispatch} onOpenHistory={onOpenHistory} onNewTask={onNewTask} />
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
