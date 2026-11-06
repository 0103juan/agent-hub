import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Crea un checkpoint ligero usando `git stash create`.
 * No modifica el árbol de trabajo ni ensucia la lista de stashes del usuario.
 */
export function createCheckpoint(workspaceDir: string): string | undefined {
  if (!workspaceDir || !fs.existsSync(path.join(workspaceDir, '.git'))) return undefined;
  try {
    const hash = execFileSync('git', ['stash', 'create', `agenthub-turn-${Date.now()}`], {
      cwd: workspaceDir,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    // Con el árbol limpio `stash create` no crea nada: el punto de partida es HEAD.
    return hash || headCommit(workspaceDir);
  } catch {
    return undefined;
  }
}

function headCommit(workspaceDir: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: workspaceDir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Archivos nuevos que git aún no sigue (respeta .gitignore). */
export function listUntracked(workspaceDir: string): string[] {
  if (!workspaceDir || !fs.existsSync(path.join(workspaceDir, '.git'))) return [];
  try {
    return execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: workspaceDir, encoding: 'utf8', windowsHide: true })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Revierte los archivos al estado del checkpoint.
 */
export function rollbackCheckpoint(workspaceDir: string, checkpointHash: string): boolean {
  if (!workspaceDir || !checkpointHash) return false;
  try {
    execFileSync('git', ['checkout', checkpointHash, '--', '.'], {
      cwd: workspaceDir,
      windowsHide: true,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve el resumen de diferencias respecto al checkpoint.
 */
export function getCheckpointDiff(workspaceDir: string, checkpointHash: string): string {
  if (!workspaceDir || !checkpointHash) return '';
  try {
    return execFileSync('git', ['diff', '--stat', checkpointHash], {
      cwd: workspaceDir,
      encoding: 'utf8',
      windowsHide: true
    }).trim();
  } catch {
    return '';
  }
}

/** Archivos con cambios respecto al checkpoint. */
export function getCheckpointFiles(workspaceDir: string, checkpointHash: string): string[] {
  if (!workspaceDir || !checkpointHash) return [];
  try {
    return execFileSync('git', ['diff', '--name-only', checkpointHash], {
      cwd: workspaceDir,
      encoding: 'utf8',
      windowsHide: true
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Restaura un solo archivo al estado del checkpoint. */
export function revertCheckpointFile(workspaceDir: string, checkpointHash: string, file: string): boolean {
  if (!workspaceDir || !checkpointHash || !file) return false;
  try {
    execFileSync('git', ['checkout', checkpointHash, '--', file], { cwd: workspaceDir, windowsHide: true, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const MAX_FILE_DIFF_CHARS = 20000;

/** Diff de un archivo respecto al checkpoint, recortado para no saturar la webview. */
export function getCheckpointFileDiff(workspaceDir: string, checkpointHash: string, file: string): string {
  if (!workspaceDir || !checkpointHash || !file) return '';
  try {
    return execFileSync('git', ['diff', checkpointHash, '--', file], { cwd: workspaceDir, encoding: 'utf8', windowsHide: true }).slice(0, MAX_FILE_DIFF_CHARS);
  } catch {
    return '';
  }
}
