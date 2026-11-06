import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  Clock,
  FolderUp,
  GitBranch,
  GitCommit,
  GitCompare,
  Mic,
  MicOff,
  Paperclip,
  Play,
  Send,
  Square,
  Workflow,
  Wrench,
  X
} from 'lucide-react';
import { PROTOCOL_ROLES } from '../../../shared/protocol-roles';
import { TEAM_TEMPLATES } from '../../../shared/team-templates';
import { filterActions } from '../../../shared/workspace-actions';
import { FileContextAttachment, ProtocolRole, QueuedMessage } from '../../../shared/types';
import { HubAction } from '../../state/hub-state';
import { postToHost } from '../../vscode-api';
import { ActionPalette } from './ActionPalette';
import { AttachmentChips } from './AttachmentChips';

const FILE_SEARCH_DELAY_MS = 150;
const MAX_SLASH_ITEMS = 8;
const TOKEN_WARN = 8000;

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

function savePastedFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const extension = file.type.split('/')[1] ?? 'bin';
    const fileName = file.name || `clip_${Date.now()}.${extension}`;
    postToHost({ command: 'savePastedFile', dataUri: reader.result as string, fileName });
  };
  reader.readAsDataURL(file);
}

export const Composer: React.FC<Props> = ({ attachments, workspaceFiles, composerText, focusTick = 0, sessionId, accountName, isRunning, queue, mentionAgents = NO_AGENTS, dispatch, onSend }) => {
  const [prompt, setPrompt] = useState('');
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [template, setTemplate] = useState(TEAM_TEMPLATES[0].id);
  const [isolate, setIsolate] = useState(true);
  const [planFirst, setPlanFirst] = useState(false);
  const estimatedTokens = Math.round(
    (prompt.length + attachments.reduce((sum, attachment) => sum + (attachment.content?.length ?? 0), 0)) / 4
  );

  const fileSearchTimer = useRef<ReturnType<typeof setTimeout>>();
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusTick > 0) textareaRef.current?.focus();
  }, [focusTick]);

  useEffect(() => {
    if (composerText === undefined) return;
    setPrompt(composerText);
    dispatch({ type: 'composerTextConsumed' });
  }, [composerText, dispatch]);

  const toggleVoiceDictation = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Tu navegador no soporta la Web Speech API para dictado por voz.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'es-ES';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => setIsListening(true);
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setPrompt((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const runAction = (actionId: string) =>
    postToHost({ command: 'runAction', actionId, sessionId, input: prompt });

  const startPipeline = (text: string) => postToHost({ command: 'startPipeline', prompt: text, requireApproval, template, isolate });
  const selectRole = (protocolRole: ProtocolRole) =>
    postToHost({ command: 'updateSession', sessionId, patch: { protocolRole } });

  // `/` al inicio del borrador y sin espacio todavía: sugiere roles, acciones y comandos del equipo.
  const slashQuery = /^\/(\S*)$/.exec(prompt)?.[1]?.toLowerCase();
  const slashItems: SlashItem[] = slashQuery === undefined ? [] : [
    ...(['pipeline', 'comparar'] as const)
      .filter((name) => name.startsWith(slashQuery))
      .map((name) => ({
        key: name,
        label: `/${name}`,
        hint: name === 'pipeline' ? 'Equipo completo con el texto que sigue' : 'Mismo prompt en varias cuentas',
        run: () => setPrompt(`/${name} `)
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
    postToHost({ command: 'attachFile', file });
    setPrompt(prompt.replace(/@\S*$/, ''));
    setIsSearchingFiles(false);
  };

  return (
    <div className="space-y-2 shrink-0">
      {attachments.length > 0 && (
        <AttachmentChips attachments={attachments} onRemove={(index) => dispatch({ type: 'removeAttachment', index })} />
      )}

      {queue.length > 0 && (
        <ul className="space-y-1" aria-label="Mensajes en cola">
          {queue.map((queued) => (
            <li key={queued.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate flex-1" title={queued.prompt}>
                {queued.from && <span className="text-purple-400 font-semibold">{queued.from}: </span>}
                {queued.prompt}
              </span>
              <button
                type="button"
                aria-label="Quitar de la cola"
                onClick={() => postToHost({ command: 'removeQueued', sessionId, queuedId: queued.id })}
                className="text-zinc-400 hover:text-red-400 transition shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
          {!isRunning && (
            <li>
              <button
                type="button"
                onClick={() => postToHost({ command: 'resumeQueue', sessionId })}
                className="w-full text-center py-1 text-[11px] text-indigo-400 hover:text-indigo-300 bg-zinc-900/60 rounded border border-zinc-800 transition"
              >
                Reanudar cola ({queue.length} mensaje{queue.length === 1 ? '' : 's'})
              </button>
            </li>
          )}
        </ul>
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

      <div className="flex flex-wrap items-center gap-1 min-[420px]:gap-1.5 px-0.5 relative z-20">
        <button
          type="button"
          onClick={() => postToHost({ command: 'attachActiveEditor' })}
          className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 hover:text-indigo-300 bg-zinc-800/80 hover:bg-zinc-700/80 px-2 min-[420px]:px-2.5 py-1 rounded-md border border-zinc-700/60 transition shrink-0"
          title="Adjuntar selección o archivo actual del editor"
        >
          <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
          <span className="min-[420px]:hidden">Contexto</span>
          <span className="hidden min-[420px]:inline">Adjuntar contexto</span>
        </button>

        <button
          type="button"
          onClick={() => postToHost({ command: 'attachFiles' })}
          className="flex items-center gap-1.5 text-[11px] font-medium text-pink-300 hover:text-pink-200 bg-pink-950/40 hover:bg-pink-900/50 px-2 min-[420px]:px-2.5 py-1 rounded-md border border-pink-700/50 transition shrink-0"
          title="Adjuntar cualquier archivo"
        >
          <FolderUp className="w-3.5 h-3.5 text-pink-400" />
          <span>Archivos</span>
        </button>

        <button
          type="button"
          onClick={() => postToHost({ command: 'attachProblems' })}
          className="flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-950/30 hover:bg-amber-900/40 px-2 py-1 rounded-md border border-amber-700/40 transition shrink-0"
          title="Adjuntar los errores y avisos del editor (Problemas)"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden min-[420px]:inline">Problemas</span>
        </button>

        <button
          type="button"
          onClick={() => postToHost({ command: 'attachGit' })}
          className="flex items-center gap-1 text-[11px] font-medium text-zinc-300 hover:text-indigo-300 bg-zinc-800/80 hover:bg-zinc-700/80 px-2 py-1 rounded-md border border-zinc-700/60 transition shrink-0"
          title="Adjuntar el diff de git actual"
        >
          <GitCompare className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden min-[420px]:inline">Diff git</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!prompt.trim()) {
              postToHost({ command: 'runAction', actionId: 'tests', sessionId, input: '' });
              return;
            }
            startPipeline(prompt.trim());
            setPrompt('');
          }}
          className="flex items-center gap-1 text-[11px] font-medium px-2 min-[420px]:px-2.5 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition shrink-0"
          title="Ejecutar Pipeline Autónomo TDD (Arquitecto -> Tester -> Desarrollador -> Revisor)"
        >
          <Workflow className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden min-[420px]:inline">Pipeline TDD</span>
        </button>

        <select
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          aria-label="Plantilla de equipo"
          title={TEAM_TEMPLATES.find((item) => item.id === template)?.description}
          className="text-[11px] px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 focus:outline-none focus:border-indigo-500 shrink-0"
        >
          {TEAM_TEMPLATES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-[11px] text-zinc-400 shrink-0 cursor-pointer" title="El equipo trabaja en una rama y carpeta aparte; al terminar fusionas o descartas">
          <input type="checkbox" checked={isolate} onChange={(event) => setIsolate(event.target.checked)} />
          <span>Copia aparte</span>
        </label>

        <label className="flex items-center gap-1 text-[11px] text-zinc-400 shrink-0 cursor-pointer" title="Cada traspaso entre agentes espera tu aprobación antes de continuar">
          <input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} />
          <span>Aprobar cada traspaso</span>
        </label>

        <label className="flex items-center gap-1 text-[11px] text-zinc-400 shrink-0 cursor-pointer" title="El agente propone un plan sin editar nada; tú lo ejecutas después">
          <input type="checkbox" checked={planFirst} onChange={(event) => setPlanFirst(event.target.checked)} />
          <span>Plan primero</span>
        </label>

        <button
          type="button"
          onClick={() => postToHost({ command: 'generateCommit', sessionId })}
          className="flex items-center gap-1 text-[11px] font-medium px-2 min-[420px]:px-2.5 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 transition shrink-0"
          title="Generar mensaje Conventional Commits a partir de git diff"
        >
          <GitCommit className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden min-[420px]:inline">Commit</span>
        </button>

        <button
          type="button"
          onClick={() => postToHost({ command: 'auditBranch', sessionId })}
          className="flex items-center gap-1 text-[11px] font-medium px-2 min-[420px]:px-2.5 py-1 rounded-md bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition shrink-0"
          title="Auditar rama completa contra main (git diff main...HEAD)"
        >
          <GitBranch className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden min-[420px]:inline">Auditar rama</span>
        </button>

        <button
          type="button"
          onClick={() => runAction('tests')}
          className="flex items-center gap-1 text-[11px] font-medium px-2 min-[420px]:px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition shrink-0"
          aria-label="Ejecutar los tests"
          title="Ejecutar los tests del proyecto"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="hidden min-[420px]:inline">Test</span>
        </button>

        <button
          type="button"
          onClick={() => setIsPaletteOpen(true)}
          className="flex items-center gap-1 text-[11px] font-medium px-2 min-[420px]:px-2.5 py-1 rounded-md transition shrink-0 border bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border-zinc-700/60"
          title="Buscar y ejecutar acciones"
        >
          <Wrench className="w-3 h-3 text-indigo-400" />
          <span>Acciones</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        <span className="ml-auto text-[11px] text-zinc-400 font-mono shrink-0 hidden md:inline-block">@ para agentes y archivos</span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          Array.from(event.dataTransfer.files).forEach(savePastedFile);
        }}
        className="relative rounded-xl border border-zinc-700/80 bg-zinc-900/90 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition shadow-sm overflow-hidden"
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
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (slashItems.length === 1) slashItems[0].run();
              else submit();
            }
          }}
          onPaste={(event) => Array.from(event.clipboardData.files).forEach(savePastedFile)}
          className="w-full bg-transparent text-zinc-100 text-[13px] p-3 focus:outline-none resize-none placeholder-zinc-400 leading-relaxed font-sans"
        />

        <div className="flex items-center justify-between px-3 pb-2 pt-0.5 text-[11px] text-zinc-400">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[11px] text-zinc-400">⏎ Enviar</kbd>
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[11px] text-zinc-400">⇧⏎ Salto</kbd>
            {estimatedTokens > 0 && (
              <span className={`ml-2 font-mono ${estimatedTokens > TOKEN_WARN ? 'text-amber-400' : ''}`} title="Estimación: caracteres del borrador y adjuntos de texto / 4">
                ~{estimatedTokens.toLocaleString()} tokens
              </span>
            )}
          </span>

          <span className="flex items-center gap-1.5">
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white font-medium transition shadow-sm"
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
