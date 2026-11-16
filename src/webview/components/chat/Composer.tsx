import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  FolderUp,
  GitBranch,
  GitCommit,
  GitCompare,
  Mic,
  MicOff,
  Paperclip,
  Play,
  Repeat,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  Volume2,
  Workflow,
  Wrench,
  X
} from 'lucide-react';
import { PROTOCOL_ROLES } from '../../../shared/protocol-roles';
import { TEAM_TEMPLATES } from '../../../shared/team-templates';
import { ROLE_COLORS } from '../SquadCanvas';
import { filterActions } from '../../../shared/workspace-actions';
import { magnet } from '../motion';
import { DEFAULT_LOOP_INSTRUCTION, FileContextAttachment, ProtocolRole, QueuedMessage } from '../../../shared/types';
import { HubAction } from '../../state/hub-state';
import { postToHost } from '../../vscode-api';
import { ActionPalette } from './ActionPalette';
import { AttachmentChips } from './AttachmentChips';

const FILE_SEARCH_DELAY_MS = 150;
const MAX_SLASH_ITEMS = 8;
const TOKEN_WARN = 8000;
const HISTORY_KEY = 'agent-hub.promptHistory';
const HISTORY_MAX = 50;
const MAX_TEXTAREA_PX = 240;
/** Pegar más texto que esto lo adjunta como archivo: el prompt no se llena de miles de líneas. */
const LONG_PASTE_CHARS = 12_000;
const draftKey = (sessionId: string) => `agent-hub.draft.${sessionId}`;

/** Plantillas de `/`: cargan el texto en el borrador para completarlo antes de enviar. */
const SNIPPETS: Array<{ name: string; hint: string; text: string }> = [
  { name: 'resumir', hint: 'Resumir lo que hay en contexto', text: 'Resume en pocos puntos lo esencial de ' },
  { name: 'explicar', hint: 'Explicar código paso a paso', text: 'Explica paso a paso cómo funciona ' },
  { name: 'tests', hint: 'Pedir pruebas para un cambio', text: 'Escribe pruebas que fallen si se rompe ' },
  { name: 'refactor', hint: 'Simplificar sin cambiar el comportamiento', text: 'Simplifica sin cambiar el comportamiento: ' }
];

const readHistory = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};
const pushHistory = (text: string): void => {
  try {
    const list = readHistory().filter((item) => item !== text);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...list, text].slice(-HISTORY_MAX)));
  } catch {}
};

interface SlashItem {
  key: string;
  label: string;
  hint: string;
  run: () => void;
}

interface Props {
  attachments: FileContextAttachment[];
  workspaceFiles: string[];
  composerText?: string;
  focusTick?: number;
  sessionId: string;
  accountName?: string;
  isRunning: boolean;
  queue: QueuedMessage[];
  /** Compañeros del mismo equipo a los que se puede escribir con `@nombre`. */
  mentionAgents?: Array<{ id: string; name: string }>;
  dispatch: React.Dispatch<HubAction>;
  onSend: (prompt: string, planFirst?: boolean, targetId?: string) => void;
}

const NO_AGENTS: Array<{ id: string; name: string }> = [];

function savePastedFile(file: File, sessionId: string): void {
  const reader = new FileReader();
  reader.onload = () => {
    const extension = file.type.split('/')[1] ?? 'bin';
    const fileName = file.name || `clip_${Date.now()}.${extension}`;
    postToHost({ command: 'savePastedFile', dataUri: reader.result as string, fileName, sessionId });
  };
  reader.readAsDataURL(file);
}

export const Composer: React.FC<Props> = ({ attachments, workspaceFiles, composerText, focusTick = 0, sessionId, accountName, isRunning, queue, mentionAgents = NO_AGENTS, dispatch, onSend }) => {
  const [prompt, setPrompt] = useState('');
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dictationHint, setDictationHint] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  // Con Ctrl+Enter para enviar, Enter solo hace salto de línea: cómodo para prompts largos.
  const [ctrlEnter, setCtrlEnter] = useState(() => localStorage.getItem('agent-hub.ctrlEnter') === '1');
  const toggleCtrlEnter = () =>
    setCtrlEnter((current) => {
      localStorage.setItem('agent-hub.ctrlEnter', current ? '0' : '1');
      return !current;
    });
  const historyPos = useRef(-1);
  const draftSession = useRef(sessionId);
  const [requireApproval, setRequireApproval] = useState(false);
  const [template, setTemplate] = useState(TEAM_TEMPLATES[0].id);
  const [isolate, setIsolate] = useState(true);
  const [planFirst, setPlanFirst] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(() => localStorage.getItem('agent-hub.composerToolsExpanded') === '1');
  const toggleTools = () => {
    setToolsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem('agent-hub.composerToolsExpanded', next ? '1' : '0');
      return next;
    });
  };
  const activeOptionsCount = (isolate ? 1 : 0) + (requireApproval ? 1 : 0) + (planFirst ? 1 : 0);
  const estimatedTokens = Math.round(
    (prompt.length + attachments.reduce((sum, attachment) => sum + (attachment.content?.length ?? 0), 0)) / 4
  );

  const fileSearchTimer = useRef<ReturnType<typeof setTimeout>>();
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechTranscribedRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleFocusComposer = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('agenthub:focus-composer', handleFocusComposer);
    return () => window.removeEventListener('agenthub:focus-composer', handleFocusComposer);
  }, []);

  // Cada sesión conserva su borrador al cambiar de pestaña o recargar.
  useEffect(() => {
    draftSession.current = sessionId;
    historyPos.current = -1;
    try {
      setPrompt(localStorage.getItem(draftKey(sessionId)) ?? '');
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    try {
      if (prompt) localStorage.setItem(draftKey(draftSession.current), prompt);
      else localStorage.removeItem(draftKey(draftSession.current));
    } catch {}
  }, [prompt]);

  // El cuadro crece con el texto hasta un tope.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [prompt]);

  // "Editar" en un mensaje del usuario carga su texto aquí.
  useEffect(() => {
    const onSetComposer = (event: Event) => {
      setPrompt(String((event as CustomEvent).detail ?? ''));
      textareaRef.current?.focus();
    };
    window.addEventListener('agenthub:set-composer', onSetComposer);
    return () => window.removeEventListener('agenthub:set-composer', onSetComposer);
  }, []);

  useEffect(() => {
    if (focusTick > 0) textareaRef.current?.focus();
  }, [focusTick]);

  useEffect(() => {
    if (composerText === undefined) return;
    setPrompt(composerText);
    dispatch({ type: 'composerTextConsumed' });
  }, [composerText, dispatch]);

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {}

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setIsListening(false);
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {}
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    audioChunksRef.current = [];
    setIsListening(false);
    setRecordingSeconds(0);
  };

  const toggleVoiceDictation = async () => {
    if (isListening) {
      stopVoiceRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      speechTranscribedRef.current = false;

      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          // Si el reconocimiento de voz no transcribió texto (ej. en Electron sin servicio online),
          // convertimos el audio a adjunto de notas de voz para que el modelo multimodal lo escuche.
          if (!speechTranscribedRef.current && audioBlob.size > 500) {
            const reader = new FileReader();
            reader.onload = () => {
              postToHost({
                command: 'savePastedFile',
                dataUri: reader.result as string,
                fileName: `nota-voz-${Date.now()}.${recorder.mimeType?.includes('wav') ? 'wav' : 'webm'}`,
                sessionId
              });
            };
            reader.readAsDataURL(audioBlob);
          }
        }
        setRecordingSeconds(0);
      };

      recorder.start(250);
      setIsListening(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);

      // Intento paralelo de transcripción en tiempo real con Web Speech API
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const recognition = new SpeechRec();
          recognition.lang = 'es-ES';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              transcript += event.results[i][0].transcript;
            }
            if (transcript.trim()) {
              speechTranscribedRef.current = true;
              setPrompt((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
            }
          };
          recognition.onerror = () => {};
          recognitionRef.current = recognition;
          recognition.start();
        } catch {}
      }
    } catch (err) {
      console.warn('Error al activar dictado de micrófono:', err);
      setDictationHint(true);
      setTimeout(() => setDictationHint(false), 5000);
      setIsListening(false);
    }
  };

  // Ctrl+Mayús+D inicia o detiene el dictado sin tocar el ratón.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        toggleVoiceDictation();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPlanFirst((on) => !on);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const runAction = (actionId: string) =>
    postToHost({ command: 'runAction', actionId, sessionId, input: prompt });

  const startPipeline = (text: string) => postToHost({ command: 'startPipeline', prompt: text, requireApproval, template, isolate });
  const selectRole = (protocolRole: ProtocolRole) =>
    postToHost({ command: 'updateSession', sessionId, patch: { protocolRole } });

  // `/` al inicio del borrador y sin espacio todavía: sugiere roles, acciones y comandos del equipo.
  const slashQuery = /^\/(\S*)$/.exec(prompt)?.[1]?.toLowerCase();
  const slashItems: SlashItem[] = slashQuery === undefined ? [] : [
    ...(['loop', 'pipeline', 'comparar'] as const)
      .filter((name) => name.startsWith(slashQuery))
      .map((name) => ({
        key: name,
        label: `/${name}`,
        hint: name === 'loop' ? 'Bucle iterativo continuo hasta que termine la sesión o lo detengas' : name === 'pipeline' ? 'Equipo completo con el texto que sigue' : 'Mismo prompt en varias cuentas',
        run: () => setPrompt(`/${name} `)
      })),
    ...SNIPPETS
      .filter((snippet) => snippet.name.startsWith(slashQuery))
      .map((snippet) => ({
        key: `snippet-${snippet.name}`,
        label: `/${snippet.name}`,
        hint: snippet.hint,
        run: () => { setPrompt(snippet.text); textareaRef.current?.focus(); }
      })),
    ...Object.values(PROTOCOL_ROLES)
      .filter((role) => role.id.startsWith(slashQuery))
      .map((role) => ({
        key: role.id,
        label: `/${role.id}`,
        hint: `Rol: ${role.label}`,
        run: () => { selectRole(role.id); setPrompt(''); }
      })),
    ...(slashQuery ? filterActions(slashQuery, 'all') : []).map((action) => ({
      key: action.id,
      label: action.label,
      hint: action.group,
      run: () => { runAction(action.id); setPrompt(''); }
    }))
  ].slice(0, MAX_SLASH_ITEMS);

  const runSlashCommand = (text: string): boolean => {
    const loopMatch = /^\/loop(?:\s+([\s\S]*))?$/i.exec(text);
    if (loopMatch) {
      postToHost({
        command: 'startLoop',
        sessionId,
        instruction: (loopMatch[1] || '').trim() || DEFAULT_LOOP_INSTRUCTION
      });
      return true;
    }
    const command = /^\/(pipeline|comparar)\s+([\s\S]+)/.exec(text);
    if (command) {
      if (command[1] === 'pipeline') startPipeline(command[2].trim());
      else postToHost({ command: 'compareModels', prompt: command[2].trim() });
      return true;
    }
    const role = /^\/(\w+)$/.exec(text)?.[1] as ProtocolRole | undefined;
    if (role && PROTOCOL_ROLES[role]) {
      selectRole(role);
      return true;
    }
    return false;
  };

  const submit = () => {
    if (!prompt.trim()) return;
    if (runSlashCommand(prompt.trim())) {
      setPrompt('');
      return;
    }
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
    }
    // `@agente mensaje` va a la sesión de ese agente, sin el prefijo.
    const text = prompt.trim();
    pushHistory(text);
    historyPos.current = -1;
    const target = [...mentionAgents]
      .sort((a, b) => b.name.length - a.name.length)
      .find((agent) => text.startsWith(`@${agent.name}`) && /^\s+\S/.test(text.slice(agent.name.length + 1)));
    if (target) onSend(text.slice(target.name.length + 1).trim(), planFirst || undefined, target.id);
    else onSend(text, planFirst || undefined);
    setPlanFirst(false);
    setPrompt('');
    setIsSearchingFiles(false);
  };

  const handleChange = (value: string) => {
    setPrompt(value);
    const lastWord = value.split(/\s+/).pop() ?? '';
    setIsSearchingFiles(lastWord.startsWith('@'));
    clearTimeout(fileSearchTimer.current);
    if (lastWord.startsWith('@')) {
      fileSearchTimer.current = setTimeout(
        () => postToHost({ command: 'searchFiles', query: lastWord.slice(1) }),
        FILE_SEARCH_DELAY_MS
      );
    }
  };

  const mentionQuery = isSearchingFiles ? (prompt.split(/\s+/).pop() ?? '').slice(1).toLowerCase() : undefined;
  const mentionMatches = mentionQuery === undefined ? [] : mentionAgents.filter((agent) => agent.name.toLowerCase().includes(mentionQuery));

  const mentionAgent = (name: string) => {
    setPrompt(prompt.replace(/@\S*$/, `@${name} `));
    setIsSearchingFiles(false);
    textareaRef.current?.focus();
  };

  const attachFile = (file: string) => {
    postToHost({ command: 'attachFile', file, sessionId });
    setPrompt(prompt.replace(/@\S*$/, ''));
    setIsSearchingFiles(false);
  };

  return (
    <div className="space-y-2 shrink-0">
      {attachments.length > 0 && (
        <AttachmentChips attachments={attachments} onRemove={(index) => dispatch({ type: 'removeAttachment', sessionId, index })} />
      )}

      {/* Banner de grabación de voz en vivo */}
      {isListening && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="font-semibold text-rose-300">
              Grabando voz ({Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')})
            </span>
            <span className="text-zinc-400 text-[11px] hidden sm:inline">• Habla con naturalidad</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={stopVoiceRecording}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>Listo</span>
            </button>
            <button
              type="button"
              onClick={cancelVoiceRecording}
              className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              title="Cancelar grabación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cola de mensajes enriquecida con archivos adjuntos */}
      {queue.length > 0 && (
        <div className="space-y-1.5" aria-label="Mensajes en cola">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="font-semibold flex items-center gap-1.5 text-amber-300">
              <Clock className="w-3.5 h-3.5" />
              Mensajes en cola ({queue.length})
            </span>
            <span className="text-[10px] text-zinc-500">Se envían automáticamente al terminar el turno actual</span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
            {queue.map((queued, idx) => (
              <div
                key={queued.id}
                className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 transition text-xs text-zinc-200 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] font-semibold border border-amber-500/30 shrink-0">
                      #{idx + 1}
                    </span>
                    {queued.from && (
                      <span className="text-[11px] text-purple-400 font-semibold truncate shrink-0">
                        @{queued.from}:
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-300 font-medium truncate" title={queued.prompt}>
                      {queued.prompt}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Cargar texto en el borrador"
                      onClick={() => {
                        setPrompt((prev) => (prev ? `${prev}\n${queued.prompt}` : queued.prompt));
                        postToHost({ command: 'removeQueued', sessionId, queuedId: queued.id });
                        textareaRef.current?.focus();
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Quitar de la cola"
                      onClick={() => postToHost({ command: 'removeQueued', sessionId, queuedId: queued.id })}
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Vista de Archivos y Capturas Adjuntas en la Cola */}
                {queued.attachments && queued.attachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/60">
                    {queued.attachments.map((att, aIdx) => {
                      const src = att.thumbnailUri || att.mediaUri;
                      const isImg = att.mediaType === 'image' || src?.startsWith('data:image/');
                      return (
                        <div
                          key={aIdx}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 max-w-[200px]"
                          title={att.file}
                        >
                          {isImg && src ? (
                            <img src={src} alt={att.file} className="w-4 h-4 rounded object-cover shrink-0" />
                          ) : (
                            <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
                          )}
                          <span className="truncate">{att.file.split(/[\\/]/).pop()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={() => postToHost({ command: 'resumeQueue', sessionId })}
              className="w-full text-center py-1 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-950/40 hover:bg-indigo-900/50 rounded-lg border border-indigo-700/50 transition font-medium"
            >
              Reanudar cola ({queue.length} mensaje{queue.length === 1 ? '' : 's'})
            </button>
          )}
        </div>
      )}

      {slashItems.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 shadow-lg" role="listbox" aria-label="Comandos">
          {slashItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.run}
              className="flex w-full items-center gap-2 text-left px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 rounded"
            >
              <span className="font-mono text-indigo-300 shrink-0">{item.label}</span>
              <span className="truncate text-zinc-400">{item.hint}</span>
            </button>
          ))}
        </div>
      )}

      {isSearchingFiles && (mentionMatches.length > 0 || workspaceFiles.length > 0) && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 p-1 shadow-lg">
          {mentionMatches.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => mentionAgent(agent.name)}
              className="flex w-full items-center gap-1.5 text-left px-2 py-1 text-[11px] text-purple-300 hover:bg-zinc-800 rounded"
            >
              <Bot className="w-3 h-3 shrink-0" />
              <span className="truncate">@{agent.name}</span>
              <span className="ml-auto text-zinc-500">agente</span>
            </button>
          ))}
          {workspaceFiles.slice(0, 8).map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => attachFile(file)}
              className="block w-full text-left px-2 py-1 text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 rounded truncate"
            >
              {file}
            </button>
          ))}
        </div>
      )}

      {/* Barra de herramientas compacta del compositor en una sola fila */}
      <div className="flex items-center justify-between gap-1 px-0.5 relative z-20 text-[11px] overflow-x-auto no-scrollbar py-0.5">
        {/* Grupo de adjuntos y contexto */}
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => postToHost({ command: 'attachActiveEditor', sessionId })}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 hover:text-indigo-300 border border-zinc-700/70 transition shrink-0 font-medium"
            title="Adjuntar selección o archivo actual del editor"
          >
            <Paperclip className="w-3 h-3 text-indigo-400" />
            <span>Contexto</span>
          </button>

          <button
            type="button"
            onClick={() => postToHost({ command: 'attachFiles', sessionId })}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-950/40 hover:bg-pink-900/50 text-pink-300 hover:text-pink-200 border border-pink-700/50 transition shrink-0 font-medium"
            title="Adjuntar cualquier archivo del proyecto"
          >
            <FolderUp className="w-3 h-3 text-pink-400" />
            <span>Archivos</span>
          </button>

          <button
            type="button"
            onClick={() => postToHost({ command: 'attachGit', sessionId })}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 hover:text-indigo-300 border border-zinc-700/70 transition shrink-0 font-medium"
            title="Adjuntar el diff de git actual"
          >
            <GitCompare className="w-3 h-3 text-indigo-400" />
            <span className="hidden min-[400px]:inline">Diff</span>
          </button>

          <button
            type="button"
            onClick={() => postToHost({ command: 'attachProblems', sessionId })}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 hover:text-amber-200 border border-amber-700/40 transition shrink-0 font-medium"
            title="Adjuntar los errores y avisos del editor (Problemas)"
          >
            <AlertTriangle className="w-3 h-3" />
            <span className="hidden min-[440px]:inline">Problemas</span>
          </button>
        </div>

        {/* Grupo de acciones rápidas y despliegue de flujos */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => runAction('tests')}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition font-medium"
            title="Ejecutar los tests del proyecto"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Test</span>
          </button>

          <button
            type="button"
            onClick={() => postToHost({ command: 'generateCommit', sessionId })}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 transition font-medium"
            title="Generar mensaje Conventional Commits a partir de git diff"
          >
            <GitCommit className="w-3 h-3 text-blue-400" />
            <span className="hidden min-[440px]:inline">Commit</span>
          </button>

          <button
            type="button"
            onClick={toggleTools}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium transition cursor-pointer ${
              toolsExpanded
                ? 'bg-purple-950/60 text-purple-200 border-purple-500/50 shadow-xs'
                : 'bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 border-zinc-700/70'
            }`}
            aria-expanded={toolsExpanded}
            title={toolsExpanded ? 'Plegar los flujos' : 'Lanzar un equipo de agentes (ODD, SDD, EDD…), plan primero o auditar la rama'}
          >
            <Workflow className="w-3 h-3 text-purple-400" />
            <span>Flujos</span>
            {activeOptionsCount > 0 && (
              <span title={`${activeOptionsCount} opción(es) activa(s)`} className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] flex items-center justify-center font-bold">
                {activeOptionsCount}
              </span>
            )}
            {toolsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/70 transition font-medium"
            title="Buscar y ejecutar acciones del workspace"
          >
            <Wrench className="w-3 h-3 text-indigo-400" />
            <span className="hidden min-[480px]:inline">Acciones</span>
          </button>
        </div>
      </div>

      {/* Bandeja de flujos: lanzar un equipo de agentes, opciones del próximo mensaje y revisión de la rama */}
      {toolsExpanded && (() => {
        const chosen = TEAM_TEMPLATES.find((item) => item.id === template) ?? TEAM_TEMPLATES[0];
        const shortName = chosen.label.replace(/\s*\(.*\)$/, '');
        // Roles que trabajan a la vez (p. ej. Revisor + Documentador) se dibujan juntos en un mismo paso.
        const parallel = Object.values(chosen.handoffs ?? {}).find((targets) => (targets?.length ?? 0) > 1) ?? [];
        const steps = chosen.roles.reduce<ProtocolRole[][]>((acc, role) => {
          if (parallel.includes(role) && acc.some((step) => step.some((r) => parallel.includes(r)))) return acc;
          acc.push(parallel.includes(role) ? (parallel as ProtocolRole[]) : [role]);
          return acc;
        }, []);
        const hasRequirement = Boolean(prompt.trim());
        return (
          <div className="rounded-xl bg-zinc-900/95 border border-purple-500/30 shadow-lg text-xs animate-message-fade grid gap-px bg-[linear-gradient(#2a3750,#2a3750)] overflow-hidden min-[1100px]:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* 1. Equipo */}
            <section className="bg-zinc-900 p-3 space-y-2.5 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-purple-300 flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5" aria-hidden />Lanzar un equipo de agentes</h3>
              </div>
              <p className="text-[11.5px] text-zinc-400 leading-relaxed">
                Escribe el requerimiento en el cuadro de abajo y lánzalo: cada agente hace su parte y le pasa el resultado al siguiente. Los ves trabajar en <b className="text-zinc-200">Agentes</b>.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-zinc-400" htmlFor="flow-template">Metodología</label>
                <select
                  id="flow-template"
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  className="text-[11.5px] px-2 py-1 rounded-md bg-zinc-800 text-zinc-100 border border-zinc-700 focus:outline-none focus:border-purple-500"
                >
                  {TEAM_TEMPLATES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </div>
              {/* La cadena de agentes de la metodología elegida */}
              <ol className="flex flex-wrap items-center gap-1.5" aria-label={`Orden de trabajo: ${chosen.description}`}>
                {steps.map((step, index) => (
                  <li key={step.join('+')} className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-zinc-500">{index + 1}</span>
                    <span className="flex items-center gap-1">
                      {step.map((role) => (
                        <span key={role} className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${ROLE_COLORS[role] ?? 'border-zinc-700 text-zinc-300'}`}>{PROTOCOL_ROLES[role]?.label ?? role}</span>
                      ))}
                      {step.length > 1 && <span className="text-[10px] text-zinc-400">a la vez</span>}
                    </span>
                    {index < steps.length - 1 && <span className="text-zinc-500" aria-hidden>→</span>}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
                <label className="flex items-start gap-1.5 cursor-pointer max-w-[280px]">
                  <input type="checkbox" checked={isolate} onChange={(event) => setIsolate(event.target.checked)} className="mt-0.5 rounded border-zinc-700 text-purple-600 focus:ring-purple-500" />
                  <span><span className="font-medium text-zinc-200">Trabajar en una copia aparte</span><span className="block text-[10.5px] text-zinc-400">Rama y carpeta propias (worktree). Al final fusionas o descartas.</span></span>
                </label>
                <label className="flex items-start gap-1.5 cursor-pointer max-w-[280px]">
                  <input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} className="mt-0.5 rounded border-zinc-700 text-purple-600 focus:ring-purple-500" />
                  <span><span className="font-medium text-zinc-200">Aprobar cada traspaso</span><span className="block text-[10.5px] text-zinc-400">El equipo se detiene entre agentes hasta que apruebes.</span></span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={!hasRequirement}
                  onClick={() => {
                    startPipeline(prompt.trim());
                    setPrompt('');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-semibold transition shadow-sm"
                >
                  <Workflow className="w-3.5 h-3.5" aria-hidden />
                  Lanzar equipo {shortName}
                </button>
                <span className={`text-[11px] ${hasRequirement ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {hasRequirement ? `Requerimiento listo: «${prompt.trim().slice(0, 60)}${prompt.trim().length > 60 ? '…' : ''}»` : '↓ Primero escribe el requerimiento abajo'}
                </span>
              </div>
            </section>

            {/* 2. Próximo mensaje */}
            <section className="bg-zinc-900 p-3 space-y-2 min-w-0">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-300">Próximo mensaje</h3>
              <p className="text-[11.5px] text-zinc-400 leading-relaxed">Se aplica al botón <b className="text-zinc-200">Enviar</b> de este chat, sin equipo.</p>
              <label className="flex items-start gap-1.5 cursor-pointer">
                <input type="checkbox" checked={planFirst} onChange={(event) => setPlanFirst(event.target.checked)} className="mt-0.5 rounded border-zinc-700 text-purple-600 focus:ring-purple-500" />
                <span><span className="font-medium text-zinc-200">Plan primero</span><span className="block text-[10.5px] text-zinc-400">El agente propone un plan sin tocar archivos; luego decides si lo ejecuta.</span></span>
              </label>
            </section>

            {/* 3. Revisión */}
            <section className="bg-zinc-900 p-3 space-y-2 min-w-0">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-300">Revisar la rama</h3>
              <p className="text-[11.5px] text-zinc-400 leading-relaxed">Un agente revisa todo lo que cambió en esta rama frente a <code className="font-mono text-zinc-200">main</code> (errores, riesgos, secretos).</p>
              <button
                type="button"
                onClick={() => postToHost({ command: 'auditBranch', sessionId })}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition font-medium"
                title="git diff main...HEAD"
              >
                <GitBranch className="w-3.5 h-3.5 text-teal-400" aria-hidden />
                Auditar rama vs main
              </button>
            </section>
          </div>
        );
      })()}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const files = Array.from(event.dataTransfer.files);
          files.forEach((file) => {
            const nativePath = (file as any).path;
            if (nativePath) {
              postToHost({ command: 'attachFile', file: nativePath, sessionId });
            } else {
              savePastedFile(file, sessionId);
            }
          });
        }}
        className={`hub-glow relative rounded-xl border bg-zinc-900/90 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition shadow-sm overflow-hidden ${
          isDragging ? 'border-dashed border-indigo-400 bg-indigo-950/30 ring-2 ring-indigo-500/40' : 'border-zinc-700/80'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={prompt}
          rows={2}
          aria-label="Mensaje"
          onFocus={() => postToHost({ command: 'prewarmSession', sessionId })}
          placeholder={`Pregunta a ${accountName ?? 'el agente'}, @ para agentes y archivos, / para comandos...`}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            const el = event.currentTarget;
            if (event.key === 'Escape' && isRunning && !prompt) {
              postToHost({ command: 'stopTurn', sessionId });
            } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey && slashItems.length === 0) {
              const history = readHistory();
              const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
              const atEnd = el.selectionStart === prompt.length;
              if (event.key === 'ArrowUp' && history.length > 0 && (!prompt || atStart)) {
                event.preventDefault();
                historyPos.current = Math.min(historyPos.current + 1, history.length - 1);
                setPrompt(history[history.length - 1 - historyPos.current]);
              } else if (event.key === 'ArrowDown' && historyPos.current >= 0 && atEnd) {
                event.preventDefault();
                historyPos.current -= 1;
                setPrompt(historyPos.current < 0 ? '' : history[history.length - 1 - historyPos.current]);
              }
            }
            if (event.key === 'Enter' && (ctrlEnter ? event.ctrlKey || event.metaKey : !event.shiftKey)) {
              event.preventDefault();
              if (slashItems.length === 1) slashItems[0].run();
              else submit();
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length > 0) {
              files.forEach((file) => savePastedFile(file, sessionId));
              return;
            }
            const text = event.clipboardData.getData('text/plain');
            if (text.length > LONG_PASTE_CHARS) {
              event.preventDefault();
              savePastedFile(new File([text], `pegado-${Date.now()}.txt`, { type: 'text/plain' }), sessionId);
              setPasteHint(true);
              setTimeout(() => setPasteHint(false), 6000);
            }
          }}
          className="w-full bg-transparent text-zinc-100 text-[13px] p-3 focus:outline-none resize-none placeholder-zinc-400 leading-relaxed font-sans overflow-y-auto"
        />

        <div className="flex items-center justify-between px-3 pb-2 pt-0.5 text-[11px] text-zinc-400">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[11px] text-zinc-400">{ctrlEnter ? 'Ctrl⏎ Enviar' : '⏎ Enviar'}</kbd>
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[11px] text-zinc-400">{ctrlEnter ? '⏎ Salto' : '⇧⏎ Salto'}</kbd>
            <button type="button" onClick={toggleCtrlEnter} className="ml-1 text-[10px] text-zinc-500 hover:text-zinc-300 underline decoration-dotted" title="Cambiar la tecla que envía el mensaje">cambiar</button>
            {pasteHint && (
              <span className="ml-2 text-indigo-300" role="status">Texto largo adjuntado como archivo</span>
            )}
            {dictationHint && (
              <span className="ml-2 text-indigo-300" role="status">Dictado de Windows activo: habla ahora</span>
            )}
            {prompt.includes('\n') && <span className="ml-2 font-mono">{prompt.split('\n').length} líneas</span>}
            {estimatedTokens > 0 && (
              <span className={`ml-2 font-mono ${estimatedTokens > TOKEN_WARN ? 'text-amber-400' : ''}`} title="Estimación: caracteres del borrador y adjuntos de texto / 4">
                ~{estimatedTokens.toLocaleString()} tokens
              </span>
            )}
          </span>

          <span className="flex items-center gap-1.5">
            {prompt && (
              <button
                type="button"
                onClick={() => { setPrompt(''); textareaRef.current?.focus(); }}
                className="flex items-center px-1.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-300 border border-zinc-700/60 transition cursor-pointer"
                title="Borrar el borrador"
                aria-label="Borrar el borrador"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (prompt.startsWith('/loop ')) {
                  setPrompt(prompt.slice(6));
                } else if (prompt.startsWith('/loop')) {
                  setPrompt('');
                } else {
                  setPrompt('/loop ' + prompt);
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                prompt.startsWith('/loop')
                  ? 'bg-purple-600/30 text-purple-300 border-purple-500/60 shadow-xs'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
              }`}
              title="Alternar Modo Loop continuo (/loop)"
            >
              <Repeat className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden min-[450px]:inline">Loop</span>
            </button>

            <button
              type="button"
              onClick={toggleVoiceDictation}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                isListening
                  ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
              }`}
              title={isListening ? 'Detener dictado por voz' : 'Dictar mensaje por voz'}
            >
              {isListening ? <MicOff className="w-3.5 h-3.5 text-red-400" /> : <Mic className="w-3.5 h-3.5 text-indigo-400" />}
              <span className="hidden min-[400px]:inline">{isListening ? 'Escuchando...' : 'Dictar'}</span>
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={() => postToHost({ command: 'stopTurn', sessionId })}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition shadow-sm"
                title="Detener generación"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="text-[11px]">Detener</span>
              </button>
            )}
            <button
              type="submit"
              disabled={!prompt.trim()}
              {...magnet}
              className="hud-magnet flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white font-medium transition shadow-sm"
              title={isRunning ? 'Dejar en cola; se envía al terminar el turno' : 'Enviar prompt'}
            >
              <span className="text-[11px]">{isRunning ? 'En cola' : 'Enviar'}</span>
              <Send className="w-3 h-3" />
            </button>
          </span>
        </div>
      </form>

      {isPaletteOpen && <ActionPalette onRun={runAction} onClose={() => setIsPaletteOpen(false)} />}
    </div>
  );
};
