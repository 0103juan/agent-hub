import * as os from 'os';
import * as vscode from 'vscode';
import { TerminalRequest } from '../agents/terminal-opener';

export function workspaceDir(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function workspaceDirOrHome(): string {
  return workspaceDir() ?? os.homedir();
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
