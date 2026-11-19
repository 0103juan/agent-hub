import React, { useEffect, useState, useMemo } from 'react';
import {
  Brain,
  Check,
  Copy,
  NotebookPen,
  Undo2,
  Search,
  Sparkles,
  Layers,
  Code,
  FileText,
  Scissors,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  AlertCircle,
  ExternalLink,
  X
} from 'lucide-react';
import { postToHost } from '../vscode-api';

/** Solo la cola de este largo viaja al agente (ver el host). */
const SENT_TAIL_CHARS = 2000;

const today = () => new Date().toISOString().slice(0, 10);

interface ParsedLesson {
  id: string;
  type: 'protocol' | 'dated' | 'other';
  signal?: string;
  lesson?: string;
  evidence?: string;
  title?: string;
  body: string;
  rawText: string;
  startIndex: number;
  inContext: boolean;
}

export const MemoryView: React.FC<{ experience?: string }> = ({ experience }) => {
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');
  const [searchQuery, setSearchQuery] = useState('');

  // Formulario estructurado para nueva lección
  const [isAddingLesson, setIsAddingLesson] = useState(false);
  const [newSignal, setNewSignal] = useState('');
  const [newLesson, setNewLesson] = useState('');
  const [newEvidence, setNewEvidence] = useState('');

  useEffect(() => {
    postToHost({ command: 'readExperience' });
  }, []);
  useEffect(() => {
    if (experience !== undefined) setDraft(experience);
  }, [experience]);

  const overflow = Math.max(0, draft.length - SENT_TAIL_CHARS);
  const activeTailStart = Math.max(0, draft.length - SENT_TAIL_CHARS);
  const dirty = draft !== (experience ?? '');
  const lines = draft ? draft.split('\n').length : 0;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  const save = () => dirty && postToHost({ command: 'saveExperience', content: draft });

  // Parsea las lecciones estructuradas del archivo experience.md
  const lessons: ParsedLesson[] = useMemo(() => {
    if (!draft) return [];
    const items: ParsedLesson[] = [];
    const blocks = draft.split(/\n\n+/);
    let cumulativeIndex = 0;

    blocks.forEach((block, index) => {
      const trimmed = block.trim();
      const startIndex = cumulativeIndex;
      cumulativeIndex += block.length + 2;

      if (!trimmed || trimmed.startsWith('# Lecciones')) return;

      const isInContext = startIndex >= activeTailStart || (startIndex + block.length) >= activeTailStart;

      // Formato Protocolo: Señal / Lección / Evidencia
      const signalMatch = trimmed.match(/Señal:\s*([\s\S]*?)(?=\nLección:|$)/i);
      const lessonMatch = trimmed.match(/Lección:\s*([\s\S]*?)(?=\nEvidencia:|$)/i);
      const evidenceMatch = trimmed.match(/Evidencia:\s*([\s\S]*?)$/i);

      if (signalMatch && lessonMatch) {
        items.push({
          id: `lesson-${index}`,
          type: 'protocol',
          signal: signalMatch[1].trim(),
          lesson: lessonMatch[1].trim(),
          evidence: evidenceMatch ? evidenceMatch[1].trim() : undefined,
          body: trimmed,
          rawText: trimmed,
          startIndex,
          inContext: isInContext
        });
      } else if (trimmed.startsWith('- 20') || trimmed.startsWith('- [20')) {
        // Formato fechado: - YYYY-MM-DD: ...
        const colonIdx = trimmed.indexOf(':');
        items.push({
          id: `dated-${index}`,
          type: 'dated',
          title: colonIdx !== -1 ? trimmed.slice(0, colonIdx).replace(/^-\s*/, '') : 'Nota fechada',
          body: colonIdx !== -1 ? trimmed.slice(colonIdx + 1).trim() : trimmed.replace(/^-\s*/, ''),
          rawText: trimmed,
          startIndex,
          inContext: isInContext
        });
      } else {
        items.push({
          id: `other-${index}`,
          type: 'other',
          body: trimmed,
          rawText: trimmed,
          startIndex,
          inContext: isInContext
        });
      }
    });

    return items;
  }, [draft, activeTailStart]);

  const filteredLessons = useMemo(() => {
    if (!searchQuery.trim()) return lessons;
    const q = searchQuery.toLowerCase();
    return lessons.filter((item) => {
      return (
        (item.signal && item.signal.toLowerCase().includes(q)) ||
        (item.lesson && item.lesson.toLowerCase().includes(q)) ||
        (item.evidence && item.evidence.toLowerCase().includes(q)) ||
        item.body.toLowerCase().includes(q)
      );
    });
  }, [lessons, searchQuery]);

  // Una línea con fecha al final: el agente lee primero lo más reciente porque solo recibe la cola.
  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    const next = `${draft.trimEnd()}${draft.trim() ? '\n' : ''}- ${today()}: ${text}\n`;
    setDraft(next);
    setNote('');
    postToHost({ command: 'saveExperience', content: next });
  };

  const addStructuredLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSignal.trim() || !newLesson.trim()) return;
    const entry = `\nSeñal: ${newSignal.trim()}\nLección: ${newLesson.trim()}${newEvidence.trim() ? `\nEvidencia: ${newEvidence.trim()}` : ''}\n`;
    const next = `${draft.trimEnd()}${entry}`;
    setDraft(next);
    setNewSignal('');
    setNewLesson('');
    setNewEvidence('');
    setIsAddingLesson(false);
    postToHost({ command: 'saveExperience', content: next });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const copyEntry = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div className="space-y-3.5 min-w-0 w-full max-w-4xl pb-6">
      {/* Cabecera Táctica del Centro de Memoria */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0a0e17] border border-[#202b3f] shadow-lg shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-violet-500/25 shrink-0">
            <Brain className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100">Memoria del Proyecto</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                .agent-hub/experience.md
              </span>
              {dirty && (
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/40 rounded-full px-2 py-0.5 animate-pulse">
                  ● Cambios sin guardar
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Base de experiencia persistente que los agentes leen como guía previa en cada turno
            </p>
          </div>
        </div>

        {/* Selector de Modo: Fichas vs Markdown */}
        <div className="flex items-center gap-1 bg-[#07090e] border border-[#202b3f] p-1 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setViewMode('structured')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition font-medium ${
              viewMode === 'structured'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Fichas ({lessons.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition font-medium ${
              viewMode === 'raw'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Editor Markdown</span>
          </button>
        </div>
      </div>

      {/* Indicador de Ventana de Contexto (Tail Injection) */}
      <div className="p-3.5 rounded-xl bg-[#0a0e17] border border-[#202b3f] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                overflow > 0 ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              }`}
            />
            <span className="font-bold text-slate-100">Ventana de Inyección Activa</span>
            <span className="text-[11px] text-slate-400">
              (El agente solo recibe los últimos {SENT_TAIL_CHARS.toLocaleString()} caracteres del archivo)
            </span>
          </div>
          <div className="font-mono text-[11px] font-bold">
            <span className={overflow > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {Math.min(draft.length, SENT_TAIL_CHARS).toLocaleString()} / {SENT_TAIL_CHARS.toLocaleString()} car.
            </span>
            <span className="text-slate-500 font-normal ml-2">
              (Total archivo: {draft.length.toLocaleString()} car. · {lines} líneas)
            </span>
          </div>
        </div>

        {/* Barra de progreso de capacidad */}
        <div className="h-2 rounded-full bg-[#07090e] overflow-hidden border border-[#202b3f] flex">
          {overflow > 0 && (
            <div
              className="h-full bg-slate-700/60 transition-all"
              style={{ width: `${Math.min(70, (overflow / draft.length) * 100)}%` }}
              title={`${overflow.toLocaleString()} caracteres históricos en disco`}
            />
          )}
          <div
            className={`h-full transition-all ${
              overflow > 0
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
            }`}
            style={{
              width: `${Math.min(100, (Math.min(draft.length, SENT_TAIL_CHARS) / draft.length) * 100)}%`
            }}
            title="Ventana visible por el agente"
          />
        </div>

        {overflow > 0 ? (
          <div className="flex items-center justify-between text-[11px] text-amber-300 pt-0.5">
            <span>
              ℹ {overflow.toLocaleString()} caracteres quedan en disco como archivo histórico; los agentes leen la sección más reciente.
            </span>
            <button
              type="button"
              onClick={() => postToHost({ command: 'pruneExperience' })}
              className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 underline font-medium"
              title="Quitar entradas repetidas y las más antiguas"
            >
              <Scissors className="w-3 h-3" /> Optimizar / Podar
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-emerald-400 pt-0.5">
            ✔ Todo el contenido de la memoria cabe actualmente dentro de la ventana de contexto del agente.
          </p>
        )}
      </div>

      {/* Formulario rápido para añadir notas o lecciones */}
      <div className="p-3.5 rounded-xl bg-[#0a0e17] border border-[#202b3f] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <NotebookPen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Registrar nueva experiencia</span>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingLesson(!isAddingLesson)}
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition"
          >
            {isAddingLesson ? (
              <>
                <ChevronUp className="w-3 h-3" /> Modo nota rápida
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" /> Formato estructurado (Señal / Lección / Evidencia)
              </>
            )}
          </button>
        </div>

        {isAddingLesson ? (
          <form onSubmit={addStructuredLesson} className="space-y-2 pt-1 border-t border-[#202b3f]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-amber-400 mb-1">
                  Señal (Cuándo aplica)
                </label>
                <input
                  value={newSignal}
                  onChange={(e) => setNewSignal(e.target.value)}
                  placeholder="Ej: Al empaquetar scripts CLI con esbuild..."
                  className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-emerald-400 mb-1">
                  Evidencia (Archivo o comando)
                </label>
                <input
                  value={newEvidence}
                  onChange={(e) => setNewEvidence(e.target.value)}
                  placeholder="Ej: src/server/standalone.ts o tests/flows.test.ts"
                  className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-cyan-300 mb-1">
                Lección (Regla no obvia aprendida)
              </label>
              <textarea
                value={newLesson}
                rows={2}
                onChange={(e) => setNewLesson(e.target.value)}
                placeholder="Ej: require.main === module se evalúa como true en Electron; requiere validar !process.versions.electron..."
                className="w-full bg-[#07090e] border border-[#202b3f] rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingLesson(false)}
                className="px-3 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 border border-[#202b3f] text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!newSignal.trim() || !newLesson.trim()}
                className="px-4 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition shadow-sm shadow-cyan-500/20"
              >
                Guardar Lección
              </button>
            </div>
          </form>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addNote();
            }}
          >
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-label="Añadir una nota con fecha"
              placeholder="Añadir una nota rápida (se guardará con la fecha de hoy)..."
              className="flex-1 min-w-0 bg-[#07090e] border border-[#202b3f] rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20"
            />
            <button
              type="submit"
              disabled={!note.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition shrink-0 shadow-sm shadow-cyan-500/20"
            >
              Añadir Nota
            </button>
          </form>
        )}
      </div>

      {/* VISTA 1: Fichas Estructuradas */}
      {viewMode === 'structured' ? (
        <div className="space-y-3">
          {/* Barra de búsqueda de lecciones */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-[#0a0e17] border border-[#202b3f]">
            <Search className="w-3.5 h-3.5 text-slate-500 ml-1 shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Buscar entre ${lessons.length} lecciones registradas (ej: electron, git, tokens, tests)...`}
              className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredLessons.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-[#0a0e17] rounded-xl border border-[#202b3f] text-xs">
              {searchQuery ? 'Ninguna lección coincide con la búsqueda.' : 'Aún no hay lecciones registradas en el proyecto.'}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filteredLessons.map((item) => (
                <li
                  key={item.id}
                  className={`hub-card hub-lift p-3.5 rounded-xl border space-y-2 text-xs transition relative ${
                    item.inContext
                      ? 'border-[#202b3f] bg-[#0a0e17] shadow-sm'
                      : 'border-[#202b3f]/60 bg-[#07090e]/60 opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#202b3f]/70 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.type === 'protocol' ? (
                        <>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase shrink-0">
                            SEÑAL
                          </span>
                          <span className="font-bold text-slate-100 truncate">{item.signal}</span>
                        </>
                      ) : item.type === 'dated' ? (
                        <>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                            {item.title}
                          </span>
                          <span className="font-medium text-slate-200 truncate">{item.body}</span>
                        </>
                      ) : (
                        <span className="font-mono text-slate-400 truncate">{item.body.slice(0, 60)}...</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.inContext ? (
                        <span className="text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full">
                          ● En contexto activo
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 bg-[#07090e] border border-[#202b3f] px-2 py-0.2 rounded-full">
                          Archivado en disco
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => copyEntry(item.rawText)}
                        className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-[#162035] transition"
                        title="Copiar lección"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.type === 'protocol' && (
                    <div className="space-y-2 pt-0.5">
                      <div className="p-2.5 rounded-lg bg-[#07090e] border border-[#202b3f] space-y-1">
                        <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase">
                          LECCIÓN
                        </div>
                        <p className="text-slate-200 leading-relaxed text-xs pl-1">
                          {item.lesson}
                        </p>
                      </div>

                      {item.evidence && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase shrink-0">
                            EVIDENCIA
                          </span>
                          <span className="font-mono text-slate-300 truncate">{item.evidence}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {item.type !== 'protocol' && (
                    <p className="text-slate-300 text-xs whitespace-pre-wrap leading-relaxed">
                      {item.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* VISTA 2: Editor Markdown Raw */
        <div className="space-y-2">
          <div className="relative">
            <textarea
              value={draft}
              rows={16}
              aria-label="Memoria del proyecto"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                  event.preventDefault();
                  save();
                }
              }}
              className="w-full bg-[#07090e] border border-[#202b3f] rounded-xl p-3 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 resize-y leading-relaxed"
            />
          </div>
        </div>
      )}

      {/* Barra de Acciones Globales */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#202b3f]">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>{lines} líneas</span>
          <span>·</span>
          <span>{words} palabras</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('agenthub:open-document', { detail: '.agent-hub/experience.md' })
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-medium transition"
            title="Abrir experience.md en el editor de documentos, con vista previa de Markdown"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>En el editor</span>
          </button>

          <button
            type="button"
            onClick={copy}
            disabled={!draft}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] disabled:opacity-40 text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-medium transition"
            title="Copiar toda la memoria"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copiar todo</span>
          </button>

          <button
            type="button"
            disabled={!dirty}
            onClick={() => setDraft(experience ?? '')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] disabled:opacity-40 text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-medium transition"
            title="Volver a lo último guardado"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Descartar</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setDraft(
                (current) =>
                  `${current.trimEnd()}${
                    current.trim() ? '\n\n' : ''
                  }## Decisiones\n- \n\n## Convenciones\n- \n\n## Pendientes\n- \n`
              )
            }
            className="px-3 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-medium transition"
            title="Añadir las secciones Decisiones, Convenciones y Pendientes"
          >
            Plantilla
          </button>

          <button
            type="button"
            onClick={() => postToHost({ command: 'pruneExperience' })}
            title="Quita notas repetidas y las más viejas; el resultado se recarga aquí"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-medium transition"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>Podar duplicados</span>
          </button>

          <button
            type="button"
            disabled={!dirty}
            onClick={save}
            title="Guardar (Ctrl+S)"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition shadow-md shadow-cyan-500/20"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Guardar (Ctrl+S)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
