import * as path from 'path';

/** El nombre llega de la webview: solo se acepta una ruta relativa que quede dentro de `dir`. */
export function isInsideWorkspace(dir: string, file: string): boolean {
  if (!file || path.isAbsolute(file)) return false;
  return !path.relative(dir, path.resolve(dir, file)).startsWith('..');
}
