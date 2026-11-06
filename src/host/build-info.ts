import * as fs from 'fs';
import * as path from 'path';

/** Archivos que la extensión y el panel cargan; si cambian en disco, lo que corre es una versión anterior. */
export function buildFiles(distDir: string): string[] {
  return [path.join(distDir, 'extension.js'), path.join(distDir, 'webview', 'assets', 'index.js')];
}

/** Fecha (ms) de la compilación más reciente en disco; 0 si no hay ninguna. */
export function newestBuildMs(distDir: string): number {
  return buildFiles(distDir).reduce((newest, file) => {
    try {
      return Math.max(newest, fs.statSync(file).mtimeMs);
    } catch {
      return newest;
    }
  }, 0);
}

/** `2026-11-06 02:53`, en hora local; vacío si no hay compilación. */
export function formatBuildStamp(ms: number): string {
  if (!ms) return '';
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
