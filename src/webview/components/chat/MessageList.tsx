import React, { memo, useEffect, useRef, useState } from 'react';
import { AlertCircle, Brain, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock, Copy, FileCode, Film, GitFork, Image as ImageIcon, Layers, Loader2, Music, Pencil, Pin, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Terminal, UserRound, X } from 'lucide-react';
import { PROTOCOL_ROLES } from '../../../shared/protocol-roles';
import { normalizeText } from '../../../shared/workspace-actions';
import { AccountProfile, ChatMessage, FileContextAttachment, LiveStatus, ProtocolRole, ProviderType } from '../../../shared/types';
import { extractQuestionOptions, isQuestionPrompt, QuestionOptions } from '../../../shared/question-options';
import { postToHost } from '../../vscode-api';
import { dayLabel, formatCost, formatDuration, formatFull, formatTime, sameDay } from '../../utils/format';
import { ProviderBadge } from '../ProviderBadge';
import { AgentHubIcon } from '../AgentHubLogo';
import { ROLE_COLORS } from '../SquadCanvas';
import { DiffLines } from './DiffLines';
import { Markdown } from './Markdown';

const STICK_TO_BOTTOM_PX = 48;
const PAGE_SIZE = 40;
const LONG_BLOCK_CHARS = 400;
const QUICK_PROMPTS = [
  'Explicar arquitectura del proyecto',
  'Revisar vulnerabilidades y seguridad',
  'Generar tests unitarios para cambios',
  'Resumir los cambios sin commitear',
  'Buscar código muerto y duplicado',
  'Proponer mejoras de rendimiento'
];
const COLLAPSE_USER_CHARS = 700;
const LONG_ANSWER_WORDS = 150;
const SHOW_TOP_PX = 600;
/** El composer escucha este evento para cargar un texto (editar y reenviar). */
const setComposerText = (text: string) => window.dispatchEvent(new CustomEvent('agenthub:set-composer', { detail: text }));

const AttachmentPreview: React.FC<{ attachment: FileContextAttachment }> = ({ attachment }) => {
  const { mediaType, mediaUri, thumbnailUri, file, sizeFormatted, fsPath } = attachment;
  const imageUri = thumbnailUri ?? mediaUri;
  const caption = (icon: React.ReactNode, colorClass: string) => (
    <div className={`text-[11px] font-mono flex items-center gap-1 ${colorClass}`}>
      {icon}
      <span className="truncate max-w-[200px]">{file}</span>
      {sizeFormatted && <span className="text-slate-400 text-[11px]">({sizeFormatted})</span>}
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
            <img src={imageUri} alt={file} className="max-h-40 max-w-[240px] rounded-lg border border-[#202b3f] object-contain bg-black/40" />
          </button>
        )}
        {caption(<ImageIcon className="w-3 h-3 text-pink-400" />, 'text-pink-300')}
      </div>
    );
  }
  if (mediaType === 'audio') {
    return (
      <div className="w-full max-w-md space-y-1 p-2 rounded-lg bg-[#07090e] border border-[#202b3f]">
        {caption(<Music className="w-3.5 h-3.5 text-amber-400" />, 'text-amber-300')}
        {mediaUri && <audio controls src={mediaUri} className="w-full h-8" />}
      </div>
    );
  }
  if (mediaType === 'video') {
    return (
      <div className="space-y-1 w-full max-w-lg">
        {mediaUri && <video controls src={mediaUri} className="max-h-64 w-full rounded-lg border border-[#202b3f] bg-black/60" />}
        {caption(<Film className="w-3.5 h-3.5 text-violet-400" />, 'text-violet-300')}
      </div>
    );
  }
  return <span className="text-[11px] font-mono text-cyan-300">{file}{attachment.lines ? `#${attachment.lines}` : ''}</span>;
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

function stepIcon(label: string): React.ReactNode {
  const l = label.toLowerCase();
  if (l.includes('search') || l.includes('buscar') || l.includes('find') || l.includes('grep')) {
    return <Search className="h-3 w-3 text-cyan-400 shrink-0" />;
  }
  if (l.includes('file') || l.includes('read') || l.includes('edit') || l.includes('write') || l.includes('archivo') || l.includes('patch')) {
    return <FileCode className="h-3 w-3 text-emerald-400 shrink-0" />;
  }
  return <Terminal className="h-3 w-3 text-cyan-400 shrink-0" />;
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
    <details open={message.isStreaming && !hasAnswer} className="group mb-3 rounded-xl border border-[#202b3f] bg-[#07090e] text-[12px] overflow-hidden shadow-sm">
      {message.isStreaming && <div className="aurora-border h-0.5 w-full" />}
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[11px] text-slate-400 hover:text-slate-200 transition">
        {message.isStreaming ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-cyan-400 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90 text-slate-500" />}
        <span className="font-bold text-slate-200">Proceso de ejecución</span>
        <span className="truncate text-slate-400 font-mono">· {summary}</span>
      </summary>
      <div className="space-y-2.5 border-t border-[#162035] px-3 py-2.5">
        {message.thinking && (
          <details open={message.thinking.length <= LONG_BLOCK_CHARS} className="group/think text-slate-400 border-l-2 border-violet-500/60 pl-2.5">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 hover:text-slate-200 text-violet-300 font-semibold">
              <Brain className="h-3.5 w-3.5 shrink-0" />
              <span>Razonamiento interno</span>
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open/think:rotate-90 text-slate-500" />
            </summary>
            <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words italic text-slate-400 font-mono text-[11px] leading-relaxed bg-[#0a0e17] p-2.5 rounded-lg border border-[#202b3f]">
              {message.thinking}
            </p>
          </details>
        )}
        <ol className="space-y-1.5 border-l border-[#202b3f] pl-3">
          {process.map((item, index) =>
            item.kind === 'step' ? (
              <li key={index} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                {stepIcon(item.label)}
                <span className="truncate text-slate-300" title={item.label}>{item.label}</span>
              </li>
            ) : (
              <li key={index} className="text-slate-300 text-xs">
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
  const [dismissed, setDismissed] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [selected, setSelected] = useState<string | undefined>(questionOptions.selected);

  if (dismissed) return null;

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

  useEffect(() => {
    if (disabled || selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= questionOptions.options.length) {
        e.preventDefault();
        const chosen = questionOptions.options[num - 1].replace(/\s*\((?:recommended|recomendado)\)\s*/gi, '').trim();
        handleSelect(chosen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, selected, questionOptions.options]);

  return (
    <div className="mt-3 p-3.5 rounded-xl border border-cyan-500/40 bg-[#07090e] shadow-md space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-100">
        <div className="flex items-center gap-2 min-w-0 text-cyan-300">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="truncate" title={questionOptions.question}>{questionOptions.question}</span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          title="Descartar opciones"
          className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[#0c1220] transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {questionOptions.options.slice(0, 5).map((opt, idx) => {
          const isRecommended = opt.toLowerCase().includes('(recommended)') || opt.toLowerCase().includes('(recomendado)');
          const cleanText = opt.replace(/\s*\((?:recommended|recomendado)\)\s*/gi, '').trim();
          const isSelected = selected === opt || selected === cleanText;

          const colonIdx = cleanText.indexOf(':');
          const hasColon = colonIdx > 0 && colonIdx <= 65;
          const title = hasColon ? cleanText.slice(0, colonIdx).trim() : cleanText;
          const description = hasColon ? cleanText.slice(colonIdx + 1).trim() : '';

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled || Boolean(selected)}
              onClick={() => handleSelect(cleanText)}
              className={`w-full text-left p-3 rounded-xl text-xs flex items-start justify-between gap-3 border transition-all duration-200 ${
                isSelected
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold shadow-sm'
                  : 'bg-[#0a0e17] hover:bg-[#0c1220] border-[#202b3f] hover:border-cyan-500/60 text-slate-300 cursor-pointer shadow-xs'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className="w-5 h-5 rounded-md bg-[#0c1220] text-slate-200 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 border border-[#202b3f] mt-0.5">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-100 leading-snug">{title}</div>
                  {description && (
                    <div className="text-[11px] text-slate-400 mt-1 leading-relaxed break-words font-normal">
                      {description}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {isRecommended && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                    Recomendado
                  </span>
                )}
                {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              </div>
            </button>
          );
        })}

        {!selected && !disabled && (
          <div>
            {!showOtherInput ? (
              <button
                type="button"
                onClick={() => setShowOtherInput(true)}
                className="w-full text-left p-2.5 rounded-xl text-xs flex items-center gap-2 border border-dashed border-[#202b3f] hover:border-cyan-500/50 bg-[#0a0e17]/50 hover:bg-[#0c1220]/60 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <span className="w-5 h-5 rounded-md bg-[#0c1220] text-slate-400 font-mono text-[11px] flex items-center justify-center shrink-0 border border-[#202b3f]">
                  {questionOptions.options.length < 5 ? questionOptions.options.length + 1 : '6'}
                </span>
                <span className="italic">Otra opción (Escribir respuesta personalizada)...</span>
              </button>
            ) : (
              <form onSubmit={handleCustomSubmit} className="p-3 rounded-xl bg-[#0a0e17] border border-[#202b3f] space-y-2.5">
                <input
                  type="text"
                  autoFocus
                  placeholder="Escribe tu indicación o respuesta personalizada..."
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  className="w-full bg-[#07090e] border border-[#202b3f] focus:border-cyan-500 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOtherInput(false)}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!otherText.trim()}
                    className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40 text-slate-950 text-[11px] font-bold transition shadow-sm cursor-pointer"
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
        <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-bold pt-1 border-t border-[#162035]">
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
    <span className="font-sans text-cyan-300">
      {phase} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
};


/** Vuelve la copia aparte del equipo al commit de esta etapa; pide confirmación en línea. */
const RestoreStage: React.FC<{ sessionId: string; messageId: string }> = ({ sessionId, messageId }) => {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="flex items-center gap-1.5">
      <span className="text-amber-400">¿Volver a esta etapa? Se pierde lo posterior.</span>
      <button
        type="button"
        onClick={() => {
          postToHost({ command: 'restoreStage', sessionId, messageId });
          setConfirming(false);
        }}
        className="px-1.5 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white transition"
      >
        Sí, volver
      </button>
      <button type="button" aria-label="Cancelar" onClick={() => setConfirming(false)} className="text-slate-400 hover:text-slate-200">
        <X className="w-3 h-3" />
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200 hover:underline px-1 py-0.5 rounded transition"
      title="Devolver la copia aparte del equipo al estado en que terminó esta etapa"
    >
      <RotateCcw className="w-3 h-3" />
      <span>Volver aquí</span>
    </button>
  );
};

/** Agrupa las notas de sistema consecutivas (2 o más); el resto queda como está. */
function groupSystemNotes(messages: ChatMessage[]): Array<ChatMessage | ChatMessage[]> {
  const items: Array<ChatMessage | ChatMessage[]> = [];
  let run: ChatMessage[] = [];
  const flush = () => {
    items.push(...(run.length > 1 ? [run] : run));
    run = [];
  };
  for (const message of messages) {
    if (message.role === 'system') run.push(message);
    else {
      flush();
      items.push(message);
    }
  }
  flush();
  return items;
}

/** Notas de sistema seguidas, en una sola tarjeta plegable. */
const SystemGroup: React.FC<{ messages: ChatMessage[]; defaultOpen: boolean }> = ({ messages, defaultOpen }) => (
  <details open={defaultOpen} className="group rounded-xl border border-[#202b3f] bg-[#0a0e17] text-[12px] overflow-hidden shadow-xs">
    <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 font-mono">
      <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90 text-cyan-400" />
      <span className="font-medium text-slate-300">{messages.length} eventos de sistema</span>
      {messages.some((m) => m.isError) && <AlertCircle className="w-3.5 h-3.5 text-rose-400" aria-label="Con error" />}
    </summary>
    <ul className="space-y-1.5 border-t border-[#202b3f] px-3 py-2 bg-[#07090e]/60">
      {messages.map((m) => (
        <li key={m.id} id={`msg-${m.id}`} className={m.isError ? 'text-rose-300' : 'text-slate-300'}>
          <Markdown text={m.content} withCodeActions={false} />
        </li>
      ))}
    </ul>
  </details>
);

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
  /** Texto del mensaje del usuario que originó esta respuesta; permite regenerarla. */
  regenerateFrom?: string;
}

const MessageBubble = memo<BubbleProps>(({ message, sessionId, onSendSuggestion, provider, role, fileDiffs, live, isLast, regenerateFrom }) => {
  const isUser = message.role === 'user';
  const attachments = message.attachments ?? [];
  const turn = splitTurn(message);
  const rawQuestion = message.questionOptions ?? (!message.isStreaming ? extractQuestionOptions(turn.answer || message.content) : undefined);
  const questionOptions = rawQuestion && isQuestionPrompt(rawQuestion.question) && rawQuestion.options.length >= 2 ? rawQuestion : undefined;
  const [copied, setCopied] = useState(false);
  const [activeDiffFile, setActiveDiffFile] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const collapsible = isUser && message.content.length > COLLAPSE_USER_CHARS;
  const wordCount = isUser || message.isStreaming ? 0 : (turn.answer || message.content).trim().split(/\s+/).length;

  const copyMessageText = async (event?: React.MouseEvent) => {
    try {
      const body = isUser ? message.content : (turn.answer || message.content);
      // Con Mayús: lleva el autor y la hora, útil para pegar en un ticket o un chat.
      const textToCopy = event?.shiftKey ? `**${isUser ? 'Tú' : message.modelName}** · ${formatFull(message.timestamp)}\n\n${body}` : body;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      id={`msg-${message.id}`}
      style={message.isStreaming ? undefined : OFFSCREEN_SKIP_STYLE}
      className={`msg-bubble p-3.5 rounded-2xl text-[13px] leading-relaxed border transition-all ${
        isUser
          ? 'bg-gradient-to-br from-cyan-950/30 via-[#0a0e17]/95 to-[#07090e] text-slate-100 ml-4 border-cyan-500/35 shadow-sm animate-message-fade'
          : 'bg-gradient-to-b from-[#0c1220]/90 to-[#0a0e17]/95 hover:border-cyan-500/30 text-slate-200 mr-2 border-[#202b3f] shadow-sm animate-message-fade'
      } ${message.isError ? '!border-red-500/50' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-1 text-[11px] text-slate-400 mb-2 font-mono">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
          {message.isError && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
          {isUser ? (
            <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <UserRound className="w-3.5 h-3.5" />
              <span>Tú</span>
            </div>
          ) : (
            <>
              {provider && <ProviderBadge provider={provider} />}
              <span className="font-bold text-slate-200">{message.modelName}</span>
            </>
          )}
          {!isUser && role && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${ROLE_COLORS[role] ?? 'border-[#202b3f] text-slate-300'}`}>
              {PROTOCOL_ROLES[role]?.label ?? role}
            </span>
          )}
          {message.isPlan && <span className="px-2 py-0.5 rounded border border-cyan-500/50 bg-cyan-950/50 text-cyan-300 uppercase text-[10px] font-bold">Plan</span>}
          {message.isStreaming && !isUser && <TurnStatus message={message} hasAnswer={Boolean(turn.answer)} live={live} />}
          {message.pinned && <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-label="Fijado" />}
          {!isUser && !message.isStreaming && wordCount >= LONG_ANSWER_WORDS && (
            <span className="text-slate-500 text-[10px]" title={`~${Math.round(message.content.length / 4).toLocaleString()} tokens`}>
              {wordCount.toLocaleString()} palabras · {Math.max(1, Math.round(wordCount / 220))} min
            </span>
          )}
          <time dateTime={new Date(message.timestamp).toISOString()} title={formatFull(message.timestamp)} className="text-slate-500 text-[10px]">
            {formatTime(message.timestamp)}
          </time>
          {!isUser && !message.isStreaming && message.durationMs !== undefined && (
            <span className="flex items-center gap-1 text-slate-500 text-[10px]" title="Duración del turno">
              <Clock className="w-3 h-3 text-slate-500" />{formatDuration(message.durationMs)}
            </span>
          )}
          {!isUser && !message.isStreaming && message.costUSD !== undefined && message.costUSD > 0 && (
            <span className="text-emerald-400 font-bold text-[10px]" title={`Costo del turno: $${message.costUSD.toFixed(4)}`}>{formatCost(message.costUSD)}</span>
          )}
        </div>
        {!message.isStreaming && (
          <div className="flex items-center gap-1.5 ml-auto shrink-0 opacity-80 hover:opacity-100 transition">
            <button
              type="button"
              onClick={copyMessageText}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] hover:border-cyan-500/40 transition cursor-pointer shadow-xs"
              title="Copiar el texto (Mayús+clic: con autor y hora)"
              aria-label="Copiar texto del mensaje"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
              <span className={copied ? 'text-emerald-400 font-bold' : undefined}>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              type="button"
              onClick={() => postToHost({ command: 'pinMessage', sessionId, messageId: message.id })}
              aria-pressed={Boolean(message.pinned)}
              className="flex items-center text-[10px] px-1.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] hover:border-cyan-500/40 transition cursor-pointer shadow-xs"
              title={message.pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
              aria-label={message.pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
            >
              <Pin className={`w-3 h-3 ${message.pinned ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />
            </button>
            {!isUser && turn.answer && (
              <button
                type="button"
                onClick={() => postToHost({ command: 'crossReview', sessionId, messageId: message.id })}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-cyan-300 border border-[#202b3f] hover:border-cyan-500/50 transition cursor-pointer shadow-xs"
                title="Auditoría Imparcial: pedir una segunda opinión técnica a otro modelo conectado"
              >
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                <span className="hidden min-[400px]:inline">Segunda opinión</span>
              </button>
            )}
            {isUser && (
              <button
                type="button"
                onClick={() => setComposerText(message.content)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] hover:border-cyan-500/40 transition cursor-pointer shadow-xs"
                title="Cargar este mensaje en el cuadro de texto para editarlo y reenviarlo"
              >
                <Pencil className="w-3 h-3 text-cyan-400" />
                <span className="hidden min-[400px]:inline">Editar</span>
              </button>
            )}
            {!isUser && isLast && regenerateFrom && (
              <button
                type="button"
                onClick={() => onSendSuggestion(regenerateFrom)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] hover:border-emerald-500/40 transition cursor-pointer shadow-xs"
                title={message.isError ? 'Volver a enviar el último mensaje: el turno falló' : 'Volver a enviar el último mensaje para obtener otra respuesta'}
              >
                <RefreshCw className="w-3 h-3 text-emerald-400" />
                <span className="hidden min-[400px]:inline">{message.isError ? 'Reintentar' : 'Regenerar'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => postToHost({ command: 'forkSession', sessionId, messageId: message.id })}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-amber-300 border border-[#202b3f] hover:border-amber-500/50 transition cursor-pointer shadow-xs"
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
          <div className={collapsible && !expanded ? 'max-h-40 overflow-hidden [mask-image:linear-gradient(#000_60%,transparent)]' : undefined}>
            <Markdown text={message.content} withCodeActions={false} />
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((on) => !on)}
              className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 cursor-pointer"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Ver menos' : 'Ver todo el mensaje'}
            </button>
          )}
        </div>
      ) : turn.answer ? (
        <div className={message.isError ? 'text-red-300' : undefined}>
          <Markdown text={turn.answer} withCodeActions={!message.isStreaming} />
          {!isUser && questionOptions && (
            <QuestionOptionsCard
              questionOptions={questionOptions}
              disabled={!isLast || Boolean(message.isStreaming)}
              onSelectOption={(chosen) => onSendSuggestion(chosen)}
            />
          )}
        </div>
      ) : (
        message.isStreaming && turn.process.length === 0 && (
          <div className="flex items-center gap-1.5 text-slate-400 font-mono text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Trabajando…</span>
          </div>
        )
      )}

      {!isUser && !message.isStreaming && message.isPlan && isLast && (
        <button
          type="button"
          onClick={() => onSendSuggestion('Plan aprobado: ejecútalo ahora.')}
          className="mt-2 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-mono font-medium transition shadow-sm cursor-pointer"
        >
          Ejecutar plan
        </button>
      )}

      {!isUser && !message.isStreaming && message.checkpointHash && (
        <div className="mt-2.5 pt-2 border-t border-[#202b3f] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="truncate max-w-[200px]" title={message.checkpointDiff || 'Punto de restauración disponible'}>
            {message.checkpointDiff ? message.checkpointDiff.split('\r\n')[0] : 'Punto de restauración guardado'}
          </span>
          <button
            type="button"
            onClick={() => postToHost({ command: 'rollbackTurn', sessionId, checkpointHash: message.checkpointHash! })}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline px-1.5 py-0.5 rounded transition cursor-pointer"
            title="Revertir los archivos modificados durante este turno al estado previo"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Deshacer turno</span>
          </button>
        </div>
      )}

      {!isUser && !message.isStreaming && message.stageCommit && (
        <div className="mt-2.5 pt-2 border-t border-[#202b3f] flex items-center justify-end text-[11px] text-slate-400 font-mono">
          <RestoreStage sessionId={sessionId} messageId={message.id} />
        </div>
      )}

      {!isUser && !message.isStreaming && message.checkpointHash && message.checkpointFiles && message.checkpointFiles.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-[#202b3f] space-y-1.5">
          <div className="text-[10px] text-slate-400 font-mono font-medium flex items-center justify-between">
            <span>Archivos modificados ({message.checkpointFiles.length}):</span>
            <span className="text-slate-400 text-[9px]">desplazamiento horizontal ➔</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 scrollbar-thin">
            {message.checkpointFiles.map((file) => {
              const isSelected = activeDiffFile === file;
              return (
                <div
                  key={file}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-mono transition ${
                    isSelected
                      ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                      : 'bg-[#0c1220] hover:bg-[#162035] border-[#202b3f] hover:border-[#202b3f] text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSelected && fileDiffs[`${message.checkpointHash}:${file}`] === undefined) {
                        postToHost({ command: 'fileDiff', sessionId, checkpointHash: message.checkpointHash!, file });
                      }
                      setActiveDiffFile(isSelected ? null : file);
                    }}
                    className="flex items-center gap-1 hover:text-white"
                    title={`Ver diff de ${file}`}
                  >
                    <FileCode className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate max-w-[200px]">{file}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => postToHost({ command: 'revertFile', sessionId, checkpointHash: message.checkpointHash!, file })}
                    className="text-amber-400 hover:text-amber-300 hover:underline shrink-0 text-[10px] ml-1 pl-1 border-l border-[#202b3f]"
                    title={`Revertir solo ${file} al estado previo al turno`}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {activeDiffFile && (
            <div className="mt-1.5 p-2.5 rounded-xl bg-[#07090e] border border-[#202b3f]">
              <div className="text-[10px] font-mono text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Diff de <strong className="text-slate-200 font-semibold">{activeDiffFile}</strong>:</span>
                <button
                  type="button"
                  onClick={() => setActiveDiffFile(null)}
                  className="text-slate-400 hover:text-cyan-300 text-[10px] hover:underline"
                >
                  Cerrar diff
                </button>
              </div>
              {fileDiffs[`${message.checkpointHash}:${activeDiffFile}`] === undefined ? (
                <div className="text-slate-400 pl-2 text-xs font-mono">Cargando diff…</div>
              ) : (
                <DiffLines diff={fileDiffs[`${message.checkpointHash}:${activeDiffFile}`]} />
              )}
            </div>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2.5 pt-2 border-t border-[#202b3f]">
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
  const [filterMode, setFilterMode] = React.useState<'all' | 'modified' | 'errors' | 'pinned'>('all');
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
    if (filterMode === 'pinned' && !m.pinned) return false;
    if (!searchQuery.trim()) return true;
    return normalizeText(m.content).includes(normalizeText(searchQuery));
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

  // Al abrir un chat se empieza abajo, aunque en el anterior se hubiera subido a leer.
  useEffect(() => {
    isFollowing.current = true;
  }, [sessionId]);

  // El contenido crece después del primer pintado (resaltado de código, imágenes, tablas, mensajes que llegan tarde)
  // y la columna cambia de tamaño: mientras se sigue el final, se mantiene pegado abajo.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const stick = () => {
      if (isFollowing.current) element.scrollTop = element.scrollHeight;
    };
    const mutations = new MutationObserver(stick);
    mutations.observe(element, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(stick);
    resize.observe(element);
    element.addEventListener('load', stick, true);
    stick();
    return () => {
      mutations.disconnect();
      resize.disconnect();
      element.removeEventListener('load', stick, true);
    };
  }, []);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const trackFollowing = () => {
    const element = scrollRef.current;
    if (element) {
      const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
      isFollowing.current = isNearBottom;
      setShowScrollBottom(!isNearBottom);
      setShowScrollTop(element.scrollTop > SHOW_TOP_PX);
    }
  };

  const scrollToBottom = () => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      isFollowing.current = true;
      setShowScrollBottom(false);
    }
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        onScroll={trackFollowing}
        onWheel={(e) => {
          if (e.deltaY < 0) isFollowing.current = false;
        }}
        role="log"
        aria-label="Conversación"
        className={`msg-list select-text flex-1 overflow-y-auto space-y-3 p-1 min-h-0 relative ${showScrollTop || showScrollBottom ? 'pb-12' : ''}`}
      >
      {isSearchOpen && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#0a0e17]/95 border border-[#202b3f] shadow-xl text-xs sticky top-0 z-20 backdrop-blur-md">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar en la conversación (Ctrl+F)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-slate-100 placeholder-slate-500 focus:outline-none text-xs font-sans"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setIsSearchOpen(false); setSearchQuery(''); setFilterMode('all'); }
            }}
          />
          {(searchQuery.trim() || filterMode !== 'all') && (
            <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-[#0c1220] px-2 py-0.5 rounded border border-[#202b3f]">{filteredMessages.length} de {messages.length}</span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${filterMode === 'all' ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('modified')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${filterMode === 'modified' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Modificados
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('pinned')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${filterMode === 'pinned' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Fijados
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('errors')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${filterMode === 'errors' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Errores
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setIsSearchOpen(false); setSearchQuery(''); setFilterMode('all'); }}
            className="text-slate-400 hover:text-slate-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-4">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/30 to-blue-500/30 blur-md group-hover:blur-lg transition" />
            <div className="relative p-3.5 rounded-2xl bg-[#0a0e17] border border-[#202b3f] shadow-2xl flex items-center justify-center">
              <AgentHubIcon size={44} />
            </div>
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center justify-center gap-2 font-mono">
              <span>AGENT<span className="text-cyan-400">HUB</span></span>
              <span className="text-slate-600">·</span>
              <span className="text-cyan-300 font-semibold">{accountName ?? 'Modo Autónomo'}</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Suscripción multimodelo activa. Haz una pregunta, adjunta archivos con @ o dispara una acción rápida del enjambre:
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg pt-1">
            {QUICK_PROMPTS.map((prompt, idx) => {
              const icon = idx === 0
                ? <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                : idx === 1
                  ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  : <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
              return (
                <button
                  key={prompt}
                  onClick={() => onSendSuggestion(prompt)}
                  className="flex items-center gap-1.5 text-xs font-mono font-medium px-3.5 py-1.5 rounded-xl bg-[#0a0e17] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/50 shadow-sm transition-all hover:scale-[1.02] cursor-pointer hub-lift"
                >
                  {icon}
                  <span>{prompt}</span>
                </button>
              );
            })}
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
              className="w-full text-[11px] py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] hover:border-cyan-500/40 font-mono transition"
            >
              Mostrar {Math.min(hiddenCount, PAGE_SIZE)} anteriores ({hiddenCount} ocultos)
            </button>
          )}
          {hiddenCount > PAGE_SIZE && (
            <button
              type="button"
              onClick={() => {
                isFollowing.current = false;
                setVisibleCount(filteredMessages.length);
              }}
              className="w-full text-[11px] py-1 rounded text-slate-400 hover:text-cyan-300 font-mono transition"
            >
              Mostrar todos los {filteredMessages.length} mensajes
            </button>
          )}
          {groupSystemNotes(shownMessages).map((item, index, items) => {
            const first = Array.isArray(item) ? item[0] : item;
            const previous = items[index - 1];
            const previousMessage = previous && (Array.isArray(previous) ? previous[previous.length - 1] : previous);
            const day = (!previousMessage || !sameDay(previousMessage.timestamp, first.timestamp)) && (
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-mono select-none">
                <span className="flex-1 h-px bg-[#202b3f]" />
                <span>{dayLabel(first.timestamp)}</span>
                <span className="flex-1 h-px bg-[#202b3f]" />
              </div>
            );
            return Array.isArray(item) ? (
              <React.Fragment key={item[0].id}>
                {day}
                <SystemGroup
                  messages={item}
                  defaultOpen={item[item.length - 1] === lastMessage && item.some((m) => m.isError)}
                />
              </React.Fragment>
            ) : (
              <React.Fragment key={item.id}>
              {day}
              <MessageBubble
                message={item}
                sessionId={sessionId}
                onSendSuggestion={onSendSuggestion}
                provider={accounts.find((account) => account.id === item.profileId)?.provider}
                role={role}
                fileDiffs={fileDiffs}
                live={item === lastMessage ? live : undefined}
                isLast={item === lastMessage}
                regenerateFrom={item === lastMessage && item.role === 'assistant' ? [...messages].reverse().find((m) => m.role === 'user')?.content : undefined}
              />
              </React.Fragment>
            );
          })}
        </>
      )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => {
            isFollowing.current = false;
            setShowScrollBottom(true);
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          aria-label="Ir al inicio de la conversación"
          title="Ir al inicio de la conversación"
          className={`absolute right-3 ${showScrollBottom ? 'bottom-12' : 'bottom-3'} z-20 flex w-fit items-center gap-1 px-2.5 py-1 rounded-full bg-[#0c1220] hover:bg-[#162035] text-slate-200 text-[11px] border border-[#202b3f] hover:border-cyan-500/50 shadow-xl transition cursor-pointer font-mono`}
        >
          <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
          <span>Inicio</span>
        </button>
      )}

      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-mono font-medium shadow-xl border border-cyan-400/30 transition-all hover:scale-105 cursor-pointer animate-float-bounce"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          <span>Ir al último mensaje</span>
          {lastMessage?.isStreaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          )}
        </button>
      )}
    </div>
  );
};
