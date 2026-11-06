const ENTRY_START = /^Señal:/m;
const MAX_KEPT_ENTRIES = 40;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Separa el texto previo de las entradas, que empiezan en cada línea `Señal:`. */
export function splitEntries(content: string): { head: string; entries: string[] } {
  const first = content.search(ENTRY_START);
  if (first === -1) return { head: content, entries: [] };
  const entries = content
    .slice(first)
    .split(/^(?=Señal:)/m)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return { head: content.slice(0, first).trim(), entries };
}

const isObsolete = (entry: string) => /^Obsoleta:/im.test(entry);

function lessonKey(entry: string): string {
  return normalize(/^Lección:(.*)$/m.exec(entry)?.[1] ?? entry);
}

/** Quita las obsoletas y las repetidas (queda la más nueva); el orden original se conserva. */
function liveEntries(entries: string[]): string[] {
  const newestOf = new Map<string, number>();
  entries.forEach((entry, index) => newestOf.set(lessonKey(entry), index));
  return entries.filter((entry, index) => !isObsolete(entry) && newestOf.get(lessonKey(entry)) === index);
}

/** Lo que se le envía al agente: las entradas vigentes más nuevas que quepan, sin cortar ninguna a la mitad. */
export function selectExperience(content: string, maxChars: number): string {
  const { entries } = splitEntries(content);
  if (entries.length === 0) return content.trim().slice(-maxChars);
  const picked: string[] = [];
  let total = 0;
  for (const entry of liveEntries(entries).reverse()) {
    if (total + entry.length > maxChars && picked.length > 0) break;
    picked.unshift(entry.length > maxChars ? entry.slice(0, maxChars) : entry);
    total += entry.length + 1;
  }
  return picked.join('\n\n');
}

/** Limpieza del archivo: sin obsoletas ni repetidas y con un tope de entradas (las más nuevas). */
export function pruneExperience(content: string): string {
  const { head, entries } = splitEntries(content);
  if (entries.length === 0) return content;
  const kept = liveEntries(entries).slice(-MAX_KEPT_ENTRIES);
  return [head, ...kept].filter(Boolean).join('\n\n') + '\n';
}
