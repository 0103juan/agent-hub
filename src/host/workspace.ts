import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { TerminalRequest } from '../agents/terminal-opener';

let customWorkspaceDir: string | undefined;

const RECENT_FILE = path.join(os.homedir(), '.agent-hub', 'recent-workspaces.json');

export function setCustomWorkspaceDir(dir: string): void {
  if (dir && fs.existsSync(dir)) {
    customWorkspaceDir = path.resolve(dir);
    addRecentWorkspace(customWorkspaceDir);
    if ((globalThis as any).vscode?.workspace) {
      (globalThis as any).vscode.workspace.workspaceFolders = [{ uri: { fsPath: customWorkspaceDir } }];
    }
  }
}

export function workspaceDir(): string | undefined {
  const dir = customWorkspaceDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  return dir && fs.existsSync(dir) ? dir : undefined;
}

export function workspaceDirOrHome(): string {
  return workspaceDir() ?? os.homedir();
}

export function getRecentWorkspaces(): string[] {
  try {
    if (fs.existsSync(RECENT_FILE)) {
      const data = JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8'));
      if (Array.isArray(data)) {
        return data.filter((p) => typeof p === 'string' && fs.existsSync(p));
      }
    }
  } catch {}
  const current = workspaceDir();
  return current ? [current] : [];
}

export function addRecentWorkspace(dir: string): void {
  try {
    const list = getRecentWorkspaces().filter((item) => item.toLowerCase() !== dir.toLowerCase());
    list.unshift(dir);
    const trimmed = list.slice(0, 10);
    fs.mkdirSync(path.dirname(RECENT_FILE), { recursive: true });
    fs.writeFileSync(RECENT_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Workspace] Error al guardar proyecto reciente:', err);
  }
}

export interface GitStatusItem {
  path: string;
  status: 'M' | 'A' | 'D' | '?' | 'R';
}

export function getGitBranch(dir?: string): string {
  const root = dir ?? workspaceDir();
  if (!root || !fs.existsSync(root)) return '';
  try {
    const branch = execSync('git branch --show-current', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    }).trim();
    if (branch) return branch;

    // Si está en detached HEAD o no hay rama nombrada
    const shortSha = execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    }).trim();
    return shortSha ? `HEAD (${shortSha})` : '';
  } catch {
    return '';
  }
}

export interface GitBranchSummary {
  branch: string;
  uncommittedCount: number;
  gitFiles: GitStatusItem[];
  isGit: boolean;
}

export function getGitBranchSummary(dir?: string): GitBranchSummary {
  const root = dir ?? workspaceDir();
  if (!root || !fs.existsSync(root)) {
    return { branch: '', uncommittedCount: 0, gitFiles: [], isGit: false };
  }
  const branch = getGitBranch(root);
  if (!branch) {
    return { branch: '', uncommittedCount: 0, gitFiles: [], isGit: false };
  }
  const gitFiles = getGitStatusFiles(root);
  return {
    branch,
    uncommittedCount: gitFiles.length,
    gitFiles,
    isGit: true
  };
}

export function getGitStatusFiles(dir?: string): GitStatusItem[] {
  const root = dir ?? workspaceDir();
  if (!root || !fs.existsSync(root)) return [];

  try {
    const output = execSync('git status --porcelain', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    const items: GitStatusItem[] = [];
    const lines = output.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line || line.length < 3) continue;
      const statusCode = line.slice(0, 2).trim();
      const filePath = line.slice(3).trim().replace(/^"/, '').replace(/"$/, '');

      let status: 'M' | 'A' | 'D' | '?' | 'R' = 'M';
      if (statusCode.includes('?') || statusCode === '??') status = '?';
      else if (statusCode.includes('A')) status = 'A';
      else if (statusCode.includes('D')) status = 'D';
      else if (statusCode.includes('R')) status = 'R';

      items.push({ path: filePath, status });
    }
    return items;
  } catch {
    return [];
  }
}

export interface ProjectTreeItem {
  path: string;
  name: string;
  isDir: boolean;
}

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist_package',
  '.gemini',
  'coverage',
  '.next',
  '.svelte-kit',
  'target',
  'build'
]);

export function getProjectTree(dir?: string, maxItems = 150): ProjectTreeItem[] {
  const root = dir ?? workspaceDir();
  if (!root || !fs.existsSync(root)) return [];

  const results: ProjectTreeItem[] = [];

  function scan(currentDir: string, relBase = '', depth = 0) {
    if (depth > 3 || results.length >= maxItems) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
        const isDir = entry.isDirectory();

        results.push({ path: relPath, name: entry.name, isDir });

        if (isDir && depth < 2) {
          scan(path.join(currentDir, entry.name), relPath, depth + 1);
        }
        if (results.length >= maxItems) break;
      }
    } catch {}
  }

  scan(root);
  return results;
}

/** Con el foco en la webview no hay editor activo, pero sigue el visible. */
export function currentEditor(): vscode.TextEditor | undefined {
  return vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
}

export function openTerminal(request: TerminalRequest): void {
  const terminal = vscode.window.createTerminal({
    name: request.name,
    cwd: request.cwd,
    env: request.env as Record<string, string | null>,
    shellPath: request.shellPath
  });
  terminal.show();
  if (request.command) terminal.sendText(request.command);
}
