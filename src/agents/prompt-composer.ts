import * as fs from 'fs';
import * as path from 'path';
import { selectExperience } from '../shared/experience';
import { PROTOCOL_ROLES } from '../shared/protocol-roles';
import { ChatMessage, FileContextAttachment, ProtocolRole } from '../shared/types';

const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_MESSAGE_CHARS = 4000;
/** Los mensajes más recientes van completos; los anteriores solo como recordatorio. */
const RECENT_HISTORY_MESSAGES = 6;
const OLD_HISTORY_MESSAGE_CHARS = 400;
const MAX_RULES_CHARS = 8000;
const MAX_EXPERIENCE_CHARS = 2000;
export const EXPERIENCE_FILE = '.agent-hub/experience.md';

/** Campos que un agente entrega al compañero siguiente del pipeline. */
export const HANDOFF_FIELDS = ['Hecho:', 'Archivos:', 'Pendiente:', 'Verificación:'];

export function missingHandoffFields(body: string): string[] {
  return HANDOFF_FIELDS.filter((field) => !body.includes(field));
}

export interface PromptParts {
  prompt: string;
  role?: ProtocolRole;
  attachments?: FileContextAttachment[];
  /** Mensajes previos, solo cuando la CLI no puede reanudar la conversación. */
  history?: ChatMessage[];
  /** Compañeros del mismo equipo, para que el agente sepa a quién escribirle. */
  team?: { self: string; mates: string[]; /** Compañero al que pasar el trabajo al terminar. */ next?: string[] };
  /** Reglas persistentes del repositorio (.agent-hub/rules.md, AGENTS.md, etc.) */
  projectRules?: string;
  /** Lecciones de tareas anteriores del proyecto (.agent-hub/experience.md). */
  experience?: string;
  /** El rol puede escribir: solo entonces se le pide registrar lecciones. */
  canWrite?: boolean;
}

const ATTACHMENT_KIND_LABELS = { image: 'Imagen', audio: 'Audio', video: 'Video', file: 'Archivo' };

function formatAttachment(attachment: FileContextAttachment): string {
  if (attachment.mediaType && attachment.mediaType !== 'text') {
    return `${ATTACHMENT_KIND_LABELS[attachment.mediaType]} "${attachment.file}" en la ruta local: ${attachment.fsPath ?? attachment.file}. Ábrelo con tus herramientas.`;
  }
  const location = attachment.lines ? `${attachment.file}#${attachment.lines}` : attachment.file;
  return `Archivo: \`${location}\`\n\`\`\`${attachment.language ?? ''}\n${attachment.content}\n\`\`\``;
}

function formatHistory(history: ChatMessage[]): string {
  return history
    .filter((message) => message.role !== 'system' && message.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message, index, kept) => {
      const speaker = message.role === 'user' ? 'Usuario' : 'Asistente';
      const isRecent = index >= kept.length - RECENT_HISTORY_MESSAGES;
      const limit = isRecent ? MAX_HISTORY_MESSAGE_CHARS : OLD_HISTORY_MESSAGE_CHARS;
      return `${speaker}: ${message.content.slice(0, limit)}${message.content.length > limit ? ' […]' : ''}`;
    })
    .join('\n\n');
}

/** Carga directivas de proyecto desde archivos estándar si existen en workspaceDir. */
export function loadProjectRules(workspaceDir?: string): string | undefined {
  if (!workspaceDir) return undefined;
  const candidates = [
    path.join(workspaceDir, '.agent-hub', 'rules.md'),
    path.join(workspaceDir, 'AGENTS.md'),
    path.join(workspaceDir, '.cursorrules'),
    path.join(workspaceDir, 'CLAUDE.md'),
    path.join(workspaceDir, 'GEMINI.md')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf8').trim();
        if (content) return content.slice(0, MAX_RULES_CHARS);
      }
    } catch {
      // Ignorar fallos de lectura
    }
  }
  return undefined;
}

/** Lecciones guardadas del proyecto; si exceden el tope se conservan las más recientes. */
export function loadExperience(workspaceDir?: string): string | undefined {
  if (!workspaceDir) return undefined;
  try {
    const content = fs.readFileSync(path.join(workspaceDir, EXPERIENCE_FILE), 'utf8').trim();
    return content ? selectExperience(content, MAX_EXPERIENCE_CHARS) || undefined : undefined;
  } catch {
    return undefined;
  }
}

export function composePrompt({ prompt, role, attachments = [], history = [], team, projectRules, experience, canWrite }: PromptParts): string {
  const sections: string[] = [];

  if (projectRules && projectRules.trim()) {
    sections.push(`[REGLAS DEL PROYECTO]\n${projectRules.trim()}`);
  }

  if (experience?.trim()) {
    sections.push(`[EXPERIENCIA DEL PROYECTO]\n${experience.trim()}`);
  }
  if (canWrite) {
    sections.push(
      `[LECCIONES]\nSi aprendiste algo no obvio que ayude en tareas futuras de este proyecto, añade al final de ${EXPERIENCE_FILE} ` +
        'una entrada de 3 líneas: `Señal:` (cuándo aplica), `Lección:` y `Evidencia:` (archivo o comando que lo demuestra). Si no hay nada, no escribas.'
    );
  }

  if (role) {
    const config = PROTOCOL_ROLES[role];
    sections.push(`[ROL: ${config.label.toUpperCase()}]\n${config.systemPrompt}`);
  }

  if (team) {
    sections.push(
      `[EQUIPO]\nTe llamas "${team.self}" y trabajas con: ${team.mates.join(', ')}.\n` +
        'Para escribirle a un compañero pon en tu respuesta una línea `>> nombre: mensaje` (termina con una línea en blanco). ' +
        'Hazlo solo si necesitas algo de él, y no contestes a mensajes que no piden respuesta.' +
        (team.next?.length
          ? ` Cuando termines tu parte, pásale el trabajo a ${team.next.map((name) => `"${name}"`).join(' y a ')} con una línea \`>> ${team.next[0]}: ...\` por cada uno, con estos campos, uno por línea: ${HANDOFF_FIELDS.join(' ')}`
          : '')
    );
  }

  const transcript = formatHistory(history);
  if (transcript) {
    sections.push(`Conversación previa con otro modelo, úsala como contexto:\n${transcript}`);
  }

  if (attachments.length > 0) {
    sections.push(`Contexto adjunto:\n\n${attachments.map(formatAttachment).join('\n\n')}`);
  }

  sections.push(sections.length > 0 ? `Instrucción:\n${prompt}` : prompt);
  return sections.join('\n\n---\n\n');
}
