import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { execFileSync } from 'child_process';
import { readAttachment } from '../attachments';
import { HubContext } from '../hub-context';
import { currentEditor, workspaceDir } from '../workspace';
import { HandlerMap } from './handler-types';

const PASTED_FILES_DIR = path.join(os.homedir(), '.agent-hub', 'media_cache');
const SEARCH_EXCLUDES = '{**/node_modules/**,**/.git/**,**/dist/**}';
const MAX_SEARCH_RESULTS = 15;
const GIT_OPTS = { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 } as const; // el tope por defecto (1 MB) hacía fallar `git diff` en cambios grandes

export function contextHandlers(hub: HubContext): HandlerMap<
  'attachActiveEditor' | 'attachFiles' | 'savePastedFile' | 'searchFiles' | 'attachFile' | 'attachProblems' | 'attachGit'
> {
  return {
    attachActiveEditor: () => {
      const editor = currentEditor();
      if (!editor) {
        void vscode.window.showWarningMessage('No hay ningún archivo abierto.');
        return;
      }
      const { document, selection } = editor;
      hub.post({
        type: 'attachmentAdded',
        attachment: {
          file: vscode.workspace.asRelativePath(document.uri),
          lines: selection.isEmpty ? undefined : `L${selection.start.line + 1}-L${selection.end.line + 1}`,
          content: document.getText(selection.isEmpty ? undefined : selection),
          language: document.languageId
        }
      });
    },

    attachFiles: async () => {
      const uris = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Adjuntar' });
      for (const uri of uris ?? []) {
        hub.post({ type: 'attachmentAdded', attachment: await readAttachment(uri.fsPath) });
      }
    },

    savePastedFile: async ({ dataUri, fileName }) => {
      await fs.promises.mkdir(PASTED_FILES_DIR, { recursive: true });
      const fsPath = path.join(PASTED_FILES_DIR, `${Date.now()}-${path.basename(fileName)}`);
      await fs.promises.writeFile(fsPath, Buffer.from(dataUri.replace(/^data:[^;]*;base64,/, ''), 'base64'));
      hub.post({ type: 'attachmentAdded', attachment: await readAttachment(fsPath, path.basename(fileName)) });
    },

    searchFiles: async ({ query }) => {
      const pattern = query ? `**/*${query}*` : '**/*';
      const files = await vscode.workspace.findFiles(pattern, SEARCH_EXCLUDES, MAX_SEARCH_RESULTS);
      hub.post({ type: 'workspaceFiles', files: files.map((file) => vscode.workspace.asRelativePath(file)) });
    },

    attachFile: async ({ file }) => {
      const root = workspaceDir();
      if (!root) return;
      const fullPath = path.resolve(root, file);
      if (!fullPath.startsWith(root + path.sep)) return;
      hub.post({ type: 'attachmentAdded', attachment: await readAttachment(fullPath, file) });
    },

    attachProblems: () => {
      const allDiagnostics = vscode.languages.getDiagnostics();
      const relevant: string[] = [];
      for (const [uri, diags] of allDiagnostics) {
        const file = vscode.workspace.asRelativePath(uri);
        for (const d of diags) {
          if (d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning) {
            const type = d.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Aviso';
            const line = d.range.start.line + 1;
            relevant.push(`- \`${file}:${line}\`: [${type}] ${d.message}`);
          }
        }
      }
      if (relevant.length === 0) {
        void vscode.window.showInformationMessage('No hay errores ni avisos detectados en el espacio de trabajo.');
        return;
      }
      const content = relevant.slice(0, 30).join('\n');
      hub.post({
        type: 'attachmentAdded',
        attachment: {
          file: 'Problemas del Workspace',
          content: `### Diagnósticos activos (${relevant.length}):\n${content}`,
          language: 'markdown'
        }
      });
    },

    attachGit: () => {
      const root = workspaceDir();
      if (!root) {
        void vscode.window.showWarningMessage('No hay ningún espacio de trabajo abierto.');
        return;
      }
      try {
        const status = execFileSync('git', ['status', '-s'], { cwd: root, ...GIT_OPTS }).trim();
        const diffStat = execFileSync('git', ['diff', '--stat'], { cwd: root, ...GIT_OPTS }).trim();
        const diff = execFileSync('git', ['diff'], { cwd: root, ...GIT_OPTS }).slice(0, 4000);
        if (!status && !diff) {
          void vscode.window.showInformationMessage('El repositorio no tiene cambios pendientes.');
          return;
        }
        hub.post({
          type: 'attachmentAdded',
          attachment: {
            file: 'Git Status & Diff',
            content: `### Estado de Git\n\`\`\`text\n${status}\n\`\`\`\n\n### Resumen de cambios\n\`\`\`text\n${diffStat}\n\`\`\`\n\n### Diff parcial\n\`\`\`diff\n${diff}\n\`\`\``,
            language: 'markdown'
          }
        });
      } catch (err: any) {
        void vscode.window.showErrorMessage('Error consultando git: ' + err.message);
      }
    }
  };
}
