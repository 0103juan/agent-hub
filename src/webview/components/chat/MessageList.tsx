import React, { memo, useEffect, useRef, useState } from 'react';
import { AlertCircle, Brain, Check, CheckCircle2, ChevronRight, Film, GitFork, Image as ImageIcon, Loader2, Music, Pin, RotateCcw, Search, ShieldCheck, Terminal, X } from 'lucide-react';
import { PROTOCOL_ROLES } from '../../../shared/protocol-roles';
import { AccountProfile, ChatMessage, FileContextAttachment, LiveStatus, ProtocolRole, ProviderType } from '../../../shared/types';
import { extractQuestionOptions, QuestionOptions } from '../../../shared/question-options';
import { postToHost } from '../../vscode-api';
import { ProviderBadge } from '../ProviderBadge';
import { ROLE_COLORS } from '../SquadCanvas';
import { Markdown } from './Markdown';

const STICK_TO_BOTTOM_PX = 320;
const PAGE_SIZE = 40;
const LONG_BLOCK_CHARS = 400;
const QUICK_PROMPTS = ['Explicar arquitectura del proyecto', 'Revisar vulnerabilidades y seguridad', 'Generar tests unitarios para cambios'];

const AttachmentPreview: React.FC<{ attachment: FileContextAttachment }> = ({ attachment }) => {
  const { mediaType, mediaUri, thumbnailUri, file, sizeFormatted, fsPath } = attachment;
  const imageUri = thumbnailUri ?? mediaUri;
  const caption = (icon: React.ReactNode, colorClass: string) => (
    <div className={`text-[11px] font-mono flex items-center gap-1 ${colorClass}`}>
      {icon}
      <span className="truncate max-w-[200px]">{file}</span>
      {sizeFormatted && <span className="text-zinc-400 text-[11px]">({sizeFormatted})</span>}
    </div>
  );

  if (mediaType === 'image') {
    return (
      <div className="space-y-1">
        {imageUri && (
          <button
            type="button"
            title={fsPath ? 'Abrir imagen' : file}
            disabled={!fsPath}
            onClick={() => fsPath && postToHost({ command: 'openAttachment', fsPath })}
            className="block"
          >
            <img src={imageUri} alt={file} className="max-h-40 max-w-[240px] rounded-lg border border-zinc-750 object-contain bg-black/40" />
          </button>
        )}
        {caption(<ImageIcon className="w-3 h-3 text-pink-400" />, 'text-pink-300')}
      </div>
    );
  }
  if (mediaType === 'audio') {
    return (
      <div className="w-full max-w-md space-y-1 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
        {caption(<Music className="w-3.5 h-3.5 text-amber-400" />, 'text-amber-300')}
        {mediaUri && <audio controls src={mediaUri} className="w-full h-8" />}
      </div>
    );
  }
  if (mediaType === 'video') {
    return (
      <div className="space-y-1 w-full max-w-lg">
        {mediaUri && <video controls src={mediaUri} className="max-h-64 w-full rounded-lg border border-zinc-750 bg-black/60" />}
        {caption(<Film className="w-3.5 h-3.5 text-purple-400" />, 'text-purple-300')}
      </div>
    );
  }
  return <span className="text-[11px] font-mono text-indigo-300">{file}{attachment.lines ? `#${attachment.lines}` : ''}</span>;
};

type TurnItem = { kind: 'note'; text: string } | { kind: 'step'; label: string };

/** Lo que el agente escribió antes de su último paso es narración del proceso; lo de después, la respuesta. */
export function splitTurn(message: Pick<ChatMessage, 'content' | 'activity' | 'activityOffsets'>): { process: TurnItem[]; answer: string } {
  const steps = message.activity ?? [];
  const offsets = message.activityOffsets;
  // Mensajes guardados antes de registrar las posiciones: no se puede separar.
  if (!offsets || offsets.length !== steps.length) {
    return { process: steps.map((label) => ({ kind: 'step', label })), answer: message.content };
  }
  const process: TurnItem[] = [];
  let start = 0;
  steps.forEach((label, index) => {
    const note = message.content.slice(start, offsets[index]).trim();
    if (note) process.push({ kind: 'note', text: note });
    process.push({ kind: 'step', label });
    start = offsets[index];
  });
  return { process, answer: message.content.slice(start).trim() };
}

const TurnProcess: React.FC<{ message: ChatMessage; process: TurnItem[]; hasAnswer: boolean }> = ({ message, process, hasAnswer }) => {
  if (process.length === 0 && !message.thinking) return null;
  const stepCount = process.filter((item) => item.kind === 'step').length;
  const last = process[process.length - 1];
  const summary = message.isStreaming && last
    ? (last.kind === 'step' ? last.label : last.text.split('\r\n')[0])
    : [`${stepCount} ${stepCount === 1 ? 'paso' : 'pasos'}`, message.thinking && 'razonamiento'].filter(Boolean).join(' · ');

  return (
    // Abierto solo mientras trabaja y aún no hay respuesta; después queda plegado.
    <details open={message.isStreaming && !hasAnswer} className="group mb-2 rounded-md border border-zinc-800 bg-zinc-950/40 text-[12px] overflow-hidden">
      {message.isStreaming && <div className="aurora-border h-0.5 w-full" />}
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200">
        {message.isStreaming ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />}
        <span className="font-medium text-zinc-300">Proceso</span>
        <span className="truncate">· {summary}</span>
      </summary>
      <div className="space-y-1.5 border-t border-zinc-800 px-2 py-2">
        {message.thinking && (
          <details open={message.thinking.length <= LONG_BLOCK_CHARS} className="group/think text-zinc-500">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 hover:text-zinc-300">
              <Brain className="h-3 w-3 shrink-0" />
              <span>Razonamiento</span>
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open/think:rotate-90" />
            </summary>
            <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words italic">{message.thinking}</p>
          </details>
        )}
        <ol className="space-y-1 border-l border-zinc-800 pl-2.5">
          {process.map((item, index) =>
            item.kind === 'step' ? (
              <li key={index} className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                <Terminal className="h-3 w-3 shrink-0" />
                <span className="truncate" title={item.label}>{item.label}</span>
              </li>
            ) : (
              <li key={index} className="text-zinc-400">
                <Markdown text={item.text} />
              </li>
            )
          )}
        </ol>
      </div>
    </details>
  );
};

/** El navegador omite pintar lo que está fuera de pantalla en conversaciones largas. */

function playTurnChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

const OFFSCREEN_SKIP_STYLE: React.CSSProperties = { contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' };


const QuestionOptionsCard: React.FC<{
  questionOptions: QuestionOptions;
  disabled: boolean;
  onSelectOption: (optionText: string) => void;
}> = ({ questionOptions, disabled, onSelectOption }) => {
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [selected, setSelected] = useState<string | undefined>(questionOptions.selected);

  const handleSelect = (option: string) => {
    setSelected(option);
    onSelectOption(option);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otherText.trim()) return;
    const customOption = otherText.trim();
    setSelected(customOption);
    onSelectOption(customOption);
    setOtherText('');
    setShowOtherInput(false);
  };

  return (
    <div className="mt-3 p-3 rounded-xl border border-indigo-500/30 bg-zinc-950/80 shadow-md space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
        <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="truncate">{questionOptions.question}</span>
      </div>

      <div className="space-y-1.5">
        {questionOptions.options.slice(0, 5).map((opt, idx) => {
          const isRecommended = opt.toLowerCase().includes('(recommended)') || opt.toLowerCase().includes('(recomendado)');
          const cleanText = opt.replace(/\s*\((?:recommended|recomendado)\)\s*/gi, '').trim();
          const isSelected = selected === opt || selected === cleanText;

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled || Boolean(selected)}
              onClick={() => handleSelect(cleanText)}
              className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between gap-2 border transition ${
                isSelected
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 font-medium'
                  : 'bg-zinc-900/90 hover:bg-zinc-800/90 border-zinc-800 hover:border-indigo-500/50 text-zinc-300'
              } disabled:opacity-80 disabled:cursor-default`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 font-mono text-[11px] flex items-center justify-center shrink-0 border border-zinc-700/60">
                  {idx + 1}
                </span>
                <span className="truncate">{cleanText}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isRecommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                    Recomendado
                  </span>
                )}
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </div>
            </button>
          );
        })}

        {!selected && (
          <div>
            {!showOtherInput ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowOtherInput(true)}
                className="w-full text-left p-2 rounded-lg text-xs flex items-center gap-2 border border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition"
              >
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 font-mono text-[11px] flex items-center justify-center shrink-0 border border-zinc-700/60">
                  {questionOptions.options.length < 5 ? questionOptions.options.length + 1 : '6'}
                </span>
                <span className="italic">Otra opción (Escribir respuesta personalizada)...</span>
              </button>
            ) : (
              <form onSubmit={handleCustomSubmit} className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 space-y-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="Escribe tu indicación o respuesta personalizada..."
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowOtherInput(false)}
                    className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!otherText.trim()}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium transition"
                  >
                    Aprobar y enviar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium pt-0.5">
          <Check className="w-3.5 h-3.5" />
          <span>Opción aprobada: "{selected}"</span>
        </div>
      )}
    </div>
  );
};
/** Fase del turno según lo que ya llegó, con el tiempo transcurrido desde que empezó. */
const TurnStatus: React.FC<{ message: ChatMessage; hasAnswer: boolean; live?: LiveStatus }> = ({ message, hasAnswer, live }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const phase = hasAnswer ? 'Escribiendo' : live?.commands.length || message.activity?.length ? 'Usando herramienta' : 'Pensando';
  const seconds = Math.max(0, Math.floor((now - message.timestamp) / 1000));
  return (
    <span className="font-sans text-indigo-300">
      {phase} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
};

const DiffLines: React.FC<{ diff: string }> = ({ diff }) => (
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

const ChangedFile: React.FC<{ sessionId: string; checkpointHash: string; file: string; diff?: string }> = ({ sessionId, checkpointHash, file, diff }) => {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    if (!open && diff === undefined) postToHost({ command: 'fileDiff', sessionId, checkpointHash, file });
    setOpen(!open);
  };
  return (
    <li className="text-[11px] font-mono text-zinc-300">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 flex-1 min-w-0 text-left hover:text-zinc-100" title={`Ver los cambios de ${file}`}>
          <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="truncate">{file}</span>
        </button>
        <button
          type="button"
          onClick={() => postToHost({ command: 'revertFile', sessionId, checkpointHash, file })}
          className="flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline shrink-0"
          title={`Revertir solo ${file} al estado previo al turno`}
        >
          <RotateCcw className="w-3 h-3" />
          <span>Revertir</span>
        </button>
      </div>
      {open && (diff === undefined ? <div className="text-zinc-400 pl-4">Cargando diff…</div> : <DiffLines diff={diff} />)}
    </li>
  );
};

interface BubbleProps {
  message: ChatMessage;
  sessionId: string;
  onSendSuggestion: (prompt: string) => void;
  provider?: ProviderType;
  role?: ProtocolRole;
  fileDiffs: Record<string, string>;
  /** Solo el mensaje en curso recibe el estado en vivo, para no repintar los demás. */
  live?: LiveStatus;
  isLast: boolean;
}

const MessageBubble = memo<BubbleProps>(({ message, sessionId, onSendSuggestion, provider, role, fileDiffs, live, isLast }) => {
  const isUser = message.role === 'user';
  const attachments = message.attachments ?? [];
  const turn = splitTurn(message);
  const questionOptions = message.questionOptions ?? (!message.isStreaming ? extractQuestionOptions(turn.answer || message.content) : undefined);

  return (
    <div
      id={`msg-${message.id}`}
      style={message.isStreaming ? undefined : OFFSCREEN_SKIP_STYLE}
      className={`msg-bubble p-2.5 rounded-lg text-[13px] leading-relaxed border ${
        isUser ? 'bg-zinc-800/90 text-zinc-100 ml-4 animate-message-fade' : 'bg-zinc-900/90 text-zinc-200 mr-2 animate-message-fade'
      } ${message.isError ? 'border-red-500/40' : isUser ? 'border-zinc-700' : 'border-zinc-800'}`}
    >
      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1 font-mono">
        <div className="flex items-center gap-1">
          {message.isError && <AlertCircle className="w-3 h-3 text-red-400" />}
          {!isUser && provider && <ProviderBadge provider={provider} />}
          <span>{isUser ? 'Tú' : message.modelName}</span>
          {!isUser && role && (
            <span className={`px-1 rounded border uppercase text-[10px] ${ROLE_COLORS[role] ?? 'border-zinc-700 text-zinc-300'}`}>
              {PROTOCOL_ROLES[role]?.label ?? role}
            </span>
          )}
          {message.isPlan && <span className="px-1 rounded border border-indigo-500/50 bg-indigo-950/40 text-indigo-300 uppercase text-[10px]">Plan</span>}
          {message.isStreaming && !isUser && <TurnStatus message={message} hasAnswer={Boolean(turn.answer)} live={live} />}
          {message.pinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400" aria-label="Fijado" />}
        </div>
        {!message.isStreaming && (
          <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition">
            <button
              type="button"
              onClick={() => postToHost({ command: 'pinMessage', sessionId, messageId: message.id })}
              aria-pressed={Boolean(message.pinned)}
              className="flex items-center text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition cursor-pointer"
              title={message.pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
              aria-label={message.pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
            >
              <Pin className={`w-3 h-3 ${message.pinned ? 'text-amber-400 fill-amber-400' : 'text-zinc-400'}`} />
            </button>
            {!isUser && turn.answer && (
              <button
                type="button"
                onClick={() => postToHost({ command: 'crossReview', sessionId, messageId: message.id })}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-indigo-300 border border-zinc-700/60 transition cursor-pointer"
                title="Auditoría Imparcial: pedir una segunda opinión técnica a otro modelo conectado"
              >
                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                <span className="hidden min-[400px]:inline">Segunda opinión</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => postToHost({ command: 'forkSession', sessionId, messageId: message.id })}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition cursor-pointer"
              title="Bifurcar conversación desde este punto (Time-Travel branching)"
            >
              <GitFork className="w-3 h-3 text-amber-400" />
              <span className="hidden min-[400px]:inline">Bifurcar</span>
            </button>
          </div>
        )}
      </div>

      {!isUser && <TurnProcess message={message} process={turn.process} hasAnswer={Boolean(turn.answer)} />}

      {isUser ? (
        <div className="font-sans break-words">
          <Markdown text={message.content} withCodeActions={false} />
        </div>
      ) : turn.answer ? (
        <div className={message.isError ? 'text-red-300' : undefined}>
          <Markdown text={turn.answer} withCodeActions={!message.isStreaming} />
          {!isUser && questionOptions && (
            <QuestionOptionsCard
              questionOptions={questionOptions}
              disabled={Boolean(message.isStreaming)}
              onSelectOption={(chosen) => onSendSuggestion(chosen)}
            />
          )}
        </div>
      ) : (
        message.isStreaming && turn.process.length === 0 && (
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Trabajando…</span>
          </div>
        )
      )}

      {!isUser && !message.isStreaming && message.isPlan && isLast && (
        <button
          type="button"
          onClick={() => onSendSuggestion('Plan aprobado: ejecútalo ahora.')}
          className="mt-2 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition"
        >
          Ejecutar plan
        </button>
      )}

      {!isUser && !message.isStreaming && message.checkpointHash && (
        <div className="mt-2 pt-1.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
          <span className="truncate max-w-[200px]" title={message.checkpointDiff || 'Punto de restauración disponible'}>
            {message.checkpointDiff ? message.checkpointDiff.split('\r\n')[0] : 'Punto de restauración guardado'}
          </span>
          <button
            type="button"
            onClick={() => postToHost({ command: 'rollbackTurn', sessionId, checkpointHash: message.checkpointHash! })}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline px-1 py-0.5 rounded transition cursor-pointer"
            title="Revertir los archivos modificados durante este turno al estado previo"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Deshacer turno</span>
          </button>
        </div>
      )}

      {!isUser && !message.isStreaming && message.checkpointHash && message.checkpointFiles && message.checkpointFiles.length > 0 && (
        <ul className="mt-1 space-y-0.5" aria-label="Archivos cambiados en el turno">
          {message.checkpointFiles.map((file) => (
            <ChangedFile
              key={file}
              sessionId={sessionId}
              checkpointHash={message.checkpointHash!}
              file={file}
              diff={fileDiffs[`${message.checkpointHash}:${file}`]}
            />
          ))}
        </ul>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-zinc-700/60">
          {attachments.map((attachment, index) => (
            <AttachmentPreview key={index} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  );
});

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  accountName?: string;
  accounts: AccountProfile[];
  role?: ProtocolRole;
  fileDiffs: Record<string, string>;
  live?: LiveStatus;
  onSendSuggestion: (prompt: string) => void;
}

export const MessageList: React.FC<Props> = ({ sessionId, messages, accountName, accounts, role, fileDiffs, live, onSendSuggestion }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterMode, setFilterMode] = React.useState<'all' | 'modified' | 'errors'>('all');
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const wasStreamingRef = useRef(false);
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (wasStreamingRef.current && !lastMessage?.isStreaming) {
      playTurnChime();
    }
    wasStreamingRef.current = Boolean(lastMessage?.isStreaming);
  }, [lastMessage?.isStreaming]);

  // Atajo Ctrl+F o Cmd+F para abrir búsqueda in-chat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredMessages = messages.filter((m) => {
    if (filterMode === 'modified' && !m.checkpointHash) return false;
    if (filterMode === 'errors' && !m.isError) return false;
    if (!searchQuery.trim()) return true;
    return m.content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  useEffect(() => setVisibleCount(PAGE_SIZE), [sessionId]);
  const hiddenCount = Math.max(0, filteredMessages.length - visibleCount);
  const shownMessages = hiddenCount > 0 ? filteredMessages.slice(hiddenCount) : filteredMessages;

  const scrollRef = useRef<HTMLDivElement>(null);

  const isFollowing = useRef(true);

  // Sigue el stream sin arrastrar a quien subió a leer.
  useEffect(() => {
    if (!isFollowing.current && lastMessage?.role !== 'user') return;
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, lastMessage?.content, lastMessage?.activity?.length, lastMessage?.role]);

  const trackFollowing = () => {
    const element = scrollRef.current;
    if (element) isFollowing.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
  };

  return (
    <div ref={scrollRef} onScroll={trackFollowing} className="msg-list flex-1 overflow-y-auto space-y-3 p-1 min-h-0 relative">
      {isSearchOpen && (
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-900/95 border border-zinc-700 shadow-lg text-xs sticky top-0 z-20 glass-panel">
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar en la conversación (Ctrl+F)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-zinc-200 focus:outline-none text-xs"
            autoFocus
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${filterMode === 'all' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('modified')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${filterMode === 'modified' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Modificados
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('errors')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${filterMode === 'errors' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Errores
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setIsSearchOpen(false); setSearchQuery(''); setFilterMode('all'); }}
            className="text-zinc-400 hover:text-zinc-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400 space-y-2">
          <Terminal className="w-6 h-6 text-zinc-400" />
          <p className="text-xs">
            Ejecuta instrucciones en <span className="text-zinc-300 font-medium">{accountName ?? 'el modelo seleccionado'}</span> utilizando tu suscripción directa.
          </p>
          <div className="flex flex-wrap gap-1 justify-center pt-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onSendSuggestion(prompt)}
                className="text-[11px] px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => {
                isFollowing.current = false;
                setVisibleCount((count) => count + PAGE_SIZE);
              }}
              className="w-full text-[11px] py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
            >
              Mostrar {Math.min(hiddenCount, PAGE_SIZE)} anteriores ({hiddenCount} ocultos)
            </button>
          )}
          {shownMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              sessionId={sessionId}
              onSendSuggestion={onSendSuggestion}
              provider={accounts.find((account) => account.id === message.profileId)?.provider}
              role={role}
              fileDiffs={fileDiffs}
              live={message === lastMessage ? live : undefined}
              isLast={message === lastMessage}
            />
          ))}
        </>
      )}
    </div>
  );
};
