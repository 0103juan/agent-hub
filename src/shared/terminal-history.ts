const HISTORY_KEY = 'agent-hub.terminalHistory';

/** Clave de localStorage del historial: una por proyecto (ruta en minúsculas, `/` y sin barra final). */
export function terminalHistoryKey(cwd?: string): string {
  const project = (cwd ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return project ? `${HISTORY_KEY}:${project}` : HISTORY_KEY;
}
