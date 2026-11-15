import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Clock, Columns3, ExternalLink, Layers, LayoutGrid, Loader2, Maximize2, Minimize2, Plus, Rows3, Send } from 'lucide-react';
import { agentName } from '../../shared/agent-name';
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
      return p === n || (p.id === n.id && p.title === n.title && p.squad === n.squad && p.messageCount === n.messageCount && p.projectName === n.projectName);
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
  const ordered = [...state.sessions].sort((a, b) => Number(running(b.id)) - Number(running(a.id)));

  // Las columnas solo se pintan si el chat activo es una de ellas: si la selección no lo incluye, se pasa al primero.
  const apply = (next: string[]) => {
    const clean = [...new Set(next)].slice(-MAX_COLUMNS);
    sp.setIds(clean);
    if (clean.length > 1 && !clean.includes(session.id)) switchSession(clean[0]);
  };
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
      className={`p-1 rounded transition ${sp.layout === value ? 'bg-zinc-700 text-indigo-300' : 'hover:text-indigo-300'}`}
    >
      {icon}
    </button>
  );

  return (
    <div ref={barRef} className="relative flex items-center gap-2 px-3 py-1 border-b border-zinc-800 shrink-0 text-[11px] text-zinc-400 flex-wrap">
      <button
        type="button"
        onClick={() => setMenu(menu === 'chats' ? 'none' : 'chats')}
        aria-expanded={menu === 'chats'}
        className={`flex items-center gap-1 px-2 py-0.5 rounded border transition hover:text-indigo-300 ${sp.ids.length ? 'border-indigo-500/60 text-indigo-300' : 'border-zinc-700'}`}
      >
        <Columns3 className="w-3 h-3" aria-hidden />
        Columnas{sp.ids.length ? ` (${sp.list.length})` : ''}
      </button>

      {sp.list.length > 1 && (
        <>
          <div className="flex items-center gap-0.5 border border-zinc-800 rounded p-0.5">
            {layoutBtn('cols', <Columns3 className="w-3 h-3" />, 'Columnas')}
            {layoutBtn('rows', <Rows3 className="w-3 h-3" />, 'Filas')}
            {layoutBtn('grid', <LayoutGrid className="w-3 h-3" />, 'Cuadrícula 2×2')}
          </div>
          <form
            className="flex items-center gap-1 flex-1 min-w-[180px] max-w-md"
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
              className="flex-1 min-w-0 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
            />
            <button type="submit" aria-label="Enviar a todas" disabled={!broadcast.trim()} className="p-1 rounded hover:text-indigo-300 disabled:opacity-40">
              <Send className="w-3 h-3" />
            </button>
          </form>
        </>
      )}

      <button
        type="button"
        onClick={() => setMenu(menu === 'pending' ? 'none' : 'pending')}
        aria-expanded={menu === 'pending'}
        className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded border transition ${pending.length ? 'border-amber-500/60 text-amber-300' : 'border-zinc-700 hover:text-zinc-200'}`}
      >
        <Bell className="w-3 h-3" aria-hidden />
        Pendientes{pending.length ? ` (${pending.length})` : ''}
      </button>
      <button type="button" aria-label="Abrir este chat en otra ventana" title="Abrir este chat en otra ventana" onClick={() => openSolo(session.id)} className="p-1 rounded hover:text-indigo-300">
        <ExternalLink className="w-3 h-3" />
      </button>
      {sp.list.length > 1 && (
        <>
          <button type="button" onClick={onOpenHistory} aria-label={`Historial, ${state.sessions.length} conversaciones`} title="Abrir el historial de conversaciones" className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 hover:text-zinc-200 transition">
            <Layers className="w-3 h-3" aria-hidden />
            Historial {state.sessions.length}
          </button>
          <button type="button" onClick={onNewTask} aria-label="Nueva tarea" title="Crear nueva tarea en un proyecto" className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition">
            <Plus className="w-3 h-3" aria-hidden />
            Nueva tarea
          </button>
        </>
      )}

      {menu === 'chats' && (
        <ul className="absolute left-3 top-full mt-1 z-30 w-80 max-h-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          <li className="flex items-center justify-between px-1.5 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
            <span>{sp.ids.length >= MAX_COLUMNS ? `Máximo ${MAX_COLUMNS} columnas` : 'Marca los chats que quieres ver juntos'}</span>
            {sp.ids.length > 0 && (
              <button type="button" onClick={() => sp.setIds([])} className="normal-case tracking-normal text-zinc-400 hover:text-zinc-200">
                Limpiar
              </button>
            )}
          </li>
          {ordered.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sp.ids.includes(s.id)}
                  disabled={!sp.ids.includes(s.id) && sp.ids.length >= MAX_COLUMNS}
                  onChange={() => apply(sp.ids.length === 0 && s.id !== session.id ? [session.id, s.id] : sp.ids.includes(s.id) ? sp.ids.filter((x) => x !== s.id) : [...sp.ids, s.id])}
                />
                {running(s.id) && <Loader2 className="w-3 h-3 animate-spin text-indigo-300 shrink-0" aria-hidden />}
                <span className="truncate text-zinc-200">{s.title}</span>
                {s.projectName && <span className="ml-auto shrink-0 text-zinc-500">{s.projectName}</span>}
              </label>
            </li>
          ))}
          <li className="mt-1 pt-1 border-t border-zinc-800 px-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Conjuntos guardados</li>
          {sp.sets.map((set) => (
            <li key={set.name} className="flex items-center gap-1 px-1.5 py-0.5">
              <button
                type="button"
                onClick={() => {
                  apply(set.ids.filter((id) => state.sessions.some((s) => s.id === id)));
                  setMenu('none');
                }}
                className="flex-1 truncate text-left text-zinc-200 hover:text-indigo-300"
              >
                {set.name} <span className="text-zinc-500">· {set.ids.length}</span>
              </button>
              <button type="button" aria-label={`Borrar ${set.name}`} onClick={() => sp.setSets(sp.sets.filter((x) => x.name !== set.name))} className="text-zinc-500 hover:text-red-300">
                ×
              </button>
            </li>
          ))}
          {sp.ids.length > 0 && (
            <li>
              <form
                className="flex items-center gap-1 p-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = setName.trim();
                  if (!name) return;
                  sp.setSets([...sp.sets.filter((x) => x.name !== name), { name, ids: sp.ids }]);
                  setSetName('');
                }}
              >
                <input value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="Nombre del conjunto" aria-label="Nombre del conjunto" className="flex-1 min-w-0 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200" />
                <button type="submit" disabled={!setName.trim()} className="px-2 py-0.5 rounded border border-zinc-700 hover:text-indigo-300 disabled:opacity-40">
                  Guardar
                </button>
              </form>
            </li>
          )}
        </ul>
      )}

      {menu === 'pending' && (
        <ul className="absolute right-3 top-full mt-1 z-30 w-96 max-h-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {pending.length === 0 && <li className="px-2 py-3 text-center text-zinc-500">Nada te espera.</li>}
          {pending.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => reveal(s.id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="truncate text-zinc-200 font-medium">{agentName(s)}</span>
                  {s.projectName && <span className="ml-auto shrink-0 text-zinc-500">{s.projectName}</span>}
                </div>
                <div className="mt-0.5 line-clamp-3 text-zinc-400">{lastAnswer(s) || 'Sin respuesta todavía.'}</div>
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
  currentBranch?: string;
  branches?: string[];
  squadBranches?: string[];
  gitFilesCount?: number;
  onCheckoutBranch?: (branch: string) => void;
  onCreateBranch?: (branch: string) => void;
  onOpenBranchManager?: () => void;
  onOpenHistory: () => void;
  onNewTask: () => void;
}

export const SplitColumns: React.FC<ColumnsProps> = ({
  state,
  session,
  sp,
  focusMode,
  dispatch,
  switchSession,
  recentDirs,
  currentBranch = 'main',
  branches = [],
  squadBranches = [],
  gitFilesCount = 0,
  onCheckoutBranch,
  onCreateBranch,
  onOpenBranchManager,
  onOpenHistory,
  onNewTask
}) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const active = isSplitActive(sp, session.id);
  const shown = active ? (sp.maximized && sp.ids.includes(sp.maximized) ? sp.list.filter((s) => s.id === sp.maximized) : sp.list) : [session];
  const split = active && shown.length > 1;
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
      <Clock className="w-3 h-3 text-zinc-400 shrink-0" aria-label="En espera" />
    ) : state.runningSessionIds.includes(s.id) ? (
      <Loader2 className="w-3 h-3 animate-spin text-indigo-300 shrink-0" aria-label="Trabajando" />
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
      className={`flex-1 min-w-0 h-full min-h-0 ${scrollX} ${container} ${over ? 'ring-2 ring-indigo-500/60 rounded-lg' : ''}`}
    >
      {shown.map((column, index) => (
        <React.Fragment key={column.id}>
          {split && index > 0 && sp.layout !== 'grid' && (
            <div
              role="separator"
              aria-label="Ajustar tamaño"
              onPointerDown={(event) => startResize(event, shown[index - 1].id, column.id)}
              className={`shrink-0 rounded bg-zinc-800 hover:bg-indigo-500/60 transition ${sp.layout === 'cols' ? 'w-1.5 mx-0.5 cursor-col-resize' : 'h-1.5 my-0.5 cursor-row-resize'}`}
            />
          )}
          <div
            data-col={column.id}
            onFocusCapture={() => column.id !== session.id && switchSession(column.id)}
            style={split && sp.layout !== 'grid' ? { flex: `${sp.weights[column.id] ?? 1} 1 0%` } : undefined}
            className={`${split && sp.layout === 'cols' ? 'min-w-[340px]' : 'min-w-0'} min-h-0 flex flex-col overflow-hidden ${split ? '' : 'flex-1 h-full'} ${active ? `rounded-lg border ${column.id === session.id ? 'border-indigo-500/60' : 'border-zinc-800'}` : ''}`}
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
                className="relative shrink-0 flex items-center gap-1.5 px-2 py-0.5 text-[11px] bg-zinc-900/70 border-b border-zinc-800 cursor-grab"
              >
                {status(column)}
                <span className="truncate text-zinc-300">
                  <span className="text-zinc-500 font-mono mr-1">{index + 1}</span>
                  {column.title}
                </span>
                <div className="min-w-0" onMouseDown={(event) => event.stopPropagation()} draggable={false}>
                  <WorkspacePicker sessionId={column.id} currentDir={column.projectPath} recentDirs={recentDirs} />
                </div>
                <div onMouseDown={(event) => event.stopPropagation()} draggable={false}>
                  <GitBranchBadge
                    compact
                    branch={column.isolatedBranch || currentBranch}
                    branches={branches}
                    squadBranches={squadBranches}
                    uncommittedCount={gitFilesCount}
                    onCheckout={onCheckoutBranch}
                    onCreate={onCreateBranch}
                    onOpenManager={onOpenBranchManager}
                    currentDir={column.projectPath}
                  />
                </div>
                <span className="ml-auto flex items-center gap-1 text-zinc-500 shrink-0">
                  <button type="button" aria-label="Abrir en otra ventana" title="Abrir en otra ventana" onClick={() => openSolo(column.id)} className="hover:text-zinc-200">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={sp.maximized === column.id ? 'Restaurar columnas' : 'Maximizar columna'}
                    title={sp.maximized === column.id ? 'Restaurar columnas (doble clic en el título)' : 'Maximizar (doble clic en el título)'}
                    onClick={() => sp.setMaximized(sp.maximized === column.id ? null : column.id)}
                    className="hover:text-zinc-200"
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
                    className="hover:text-zinc-200"
                  >
                    ×
                  </button>
                </span>
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
