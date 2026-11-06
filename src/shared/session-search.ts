import { ConversationSession, SearchHit } from './types';

const MAX_HITS = 30;
const SNIPPET_RADIUS = 60;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Busca sin distinguir tildes ni mayúsculas en todos los mensajes; un resultado por sesión. */
export function searchSessions(sessions: ConversationSession[], query: string): SearchHit[] {
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.role === 'system') continue;
      // NFD solo cambia el largo de los caracteres con tilde; el índice se calcula sobre el texto normalizado y se recorta del original.
      const index = normalize(message.content).indexOf(needle);
      if (index === -1) continue;
      const start = Math.max(0, index - SNIPPET_RADIUS);
      hits.push({
        sessionId: session.id,
        title: session.title,
        snippet: message.content.slice(start, index + needle.length + SNIPPET_RADIUS).replace(/\s+/g, ' ').trim()
      });
      break;
    }
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}
