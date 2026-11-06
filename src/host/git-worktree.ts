import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SquadWorktree {
  path: string;
  branch: string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function errorText(error: unknown): string {
  const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
  return stderr || (error instanceof Error ? error.message : String(error));
}

const IDENTITY = ['-c', 'user.name=AgentHub', '-c', 'user.email=agent-hub@localhost'];

/**
 * Copia de trabajo aparte para un equipo, en una carpeta hermana del repo para no ensuciar `git status`.
 * Parte de HEAD: los cambios sin commit del repo principal no viajan a la copia.
 */
export function createSquadWorktree(repoDir: string, squad: string): SquadWorktree | undefined {
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) return undefined;
  const branch = `agent-hub/${squad}`;
  const target = path.join(path.dirname(repoDir), '.agent-hub-worktrees', path.basename(repoDir), squad);
  try {
    git(repoDir, 'worktree', 'add', '-b', branch, target);
    return { path: target, branch };
  } catch {
    return undefined;
  }
}

/** Repo principal al que pertenece una copia de trabajo. */
export function mainRepoOf(worktreeDir: string): string | undefined {
  try {
    return path.dirname(path.resolve(worktreeDir, git(worktreeDir, 'rev-parse', '--git-common-dir')));
  } catch {
    return undefined;
  }
}

export function removeSquadWorktree(worktreeDir: string, branch: string): void {
  const repo = mainRepoOf(worktreeDir);
  if (!repo) return;
  try { git(repo, 'worktree', 'remove', '--force', worktreeDir); } catch { /* ya no existe */ }
  try { git(repo, 'branch', '-D', branch); } catch { /* ya no existe */ }
}

/** Confirma lo que hicieron los agentes y lo fusiona al repo principal; con conflicto no cambia nada. */
export function mergeSquadWorktree(worktreeDir: string, branch: string): { ok: boolean; message: string } {
  const repo = mainRepoOf(worktreeDir);
  if (!repo) return { ok: false, message: 'No se encontró el repositorio principal.' };
  try {
    if (git(worktreeDir, 'status', '--porcelain')) {
      git(worktreeDir, 'add', '-A');
      git(worktreeDir, ...IDENTITY, 'commit', '-m', `agent-hub: ${branch}`);
    }
    git(repo, ...IDENTITY, 'merge', '--no-ff', '-m', `Fusiona ${branch}`, branch);
  } catch (error) {
    try { git(repo, 'merge', '--abort'); } catch { /* no había fusión en curso */ }
    return { ok: false, message: errorText(error) };
  }
  removeSquadWorktree(worktreeDir, branch);
  return { ok: true, message: `Fusionado ${branch}.` };
}
