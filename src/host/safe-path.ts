import * as path from 'path';

/** El nombre llega de la webview: solo se acepta una ruta relativa que quede dentro de `dir`. */
export function isInsideWorkspace(dir: string, file: string): boolean {
  if (!file || path.isAbsolute(file)) return false;
  return !path.relative(dir, path.resolve(dir, file)).startsWith('..');
}

/**
 * Determina si una ruta corresponde a un directorio de sistema (ej: System32, C:\Windows)
 * o al directorio de instalación/ejecución de AgentHub en lugar de un proyecto de usuario.
 */
export function isSystemOrAppDir(dir: string | undefined | null): boolean {
  if (!dir || typeof dir !== 'string') return true;
  const trimmed = dir.trim();
  if (!trimmed) return true;
  let resolved: string;
  try {
    resolved = path.resolve(trimmed);
  } catch {
    return true;
  }
  const norm = resolved.toLowerCase().replace(/\\/g, '/');

  // Raíces de disco (ej: C:/ o /)
  const root = path.parse(resolved).root.toLowerCase().replace(/\\/g, '/');
  if (norm === root || (norm.length <= 3 && norm.includes(':')) || norm === '/') return true;

  // Directorios de sistema Windows (System32, SysWOW64, Windows)
  const sysRoot = (process.env.SystemRoot || process.env.windir || 'C:/Windows').toLowerCase().replace(/\\/g, '/');
  if (norm === sysRoot || norm.startsWith(sysRoot + '/')) return true;
  if (norm.includes('/system32') || norm.includes('/syswow64')) return true;

  // Directorio de instalación o binario de AgentHub
  if (norm.includes('/appdata/local/programs/agenthub')) return true;
  try {
    const execDir = path.dirname(process.execPath).toLowerCase().replace(/\\/g, '/');
    if (norm === execDir || norm.startsWith(execDir + '/')) return true;
    if (process.resourcesPath) {
      const resDir = path.resolve(process.resourcesPath).toLowerCase().replace(/\\/g, '/');
      if (norm === resDir || norm.startsWith(resDir + '/')) return true;
    }
  } catch {}

  return false;
}

