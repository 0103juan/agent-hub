const TIME = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const FULL = new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'medium' });
const DAY = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });

export const formatTime = (ms: number): string => TIME.format(ms);
export const formatFull = (ms: number): string => FULL.format(ms);

const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0);

/** "Hoy", "Ayer" o la fecha, para separar los mensajes por día. */
export function dayLabel(ms: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  return diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : DAY.format(ms);
}

export const sameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b);

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const formatCost = (usd: number): string => (usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`);

/** "ahora", "hace 5 min", "hace 3 h", "hace 2 d". */
export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  return `hace ${Math.floor(seconds / 86400)} d`;
}

/** Descarga un texto como archivo desde el navegador o la app. */
export function downloadText(fileName: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EXTENSIONS: Record<string, string> = {
  typescript: 'ts', ts: 'ts', tsx: 'tsx', javascript: 'js', js: 'js', jsx: 'jsx', python: 'py', py: 'py', json: 'json',
  html: 'html', css: 'css', sql: 'sql', bash: 'sh', sh: 'sh', powershell: 'ps1', yaml: 'yml', yml: 'yml', markdown: 'md',
  md: 'md', java: 'java', go: 'go', rust: 'rs', csharp: 'cs', svg: 'svg', xml: 'xml', mermaid: 'mmd', dart: 'dart'
};

export const extensionFor = (language: string): string => EXTENSIONS[language.toLowerCase()] ?? 'txt';
