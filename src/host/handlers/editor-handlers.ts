import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { currentEditor, workspaceDir } from '../workspace';
import { rollbackCheckpoint } from '../git-checkpoint';
import { HubContext } from '../hub-context';
import { HandlerMap } from './handler-types';

const PROPOSAL_SCHEME = 'agent-hub-proposal';

let latestProposal = '';

export function registerProposalProvider(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, {
    provideTextDocumentContent: () => latestProposal
  });
}

const addedDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(46, 160, 67, 0.22)',
  isWholeLine: true,
  overviewRulerColor: 'rgba(46, 160, 67, 0.8)',
  overviewRulerLane: vscode.OverviewRulerLane.Left
});

let activeDecoratedEditor: vscode.TextEditor | undefined;

export function editorHandlers(hub?: HubContext): HandlerMap<
  'insertCode' | 'openDiff' | 'openAttachment' | 'saveCodeToFile' | 'rollbackTurn' | 'applyInlineDiff' | 'clearInlineDiff'
> {
  return {
    insertCode: async ({ code }) => {
      const editor = currentEditor();
      if (!editor) {
        void vscode.window.showWarningMessage('Abre un archivo para insertar el código.');
        return;
      }
      await editor.edit((edit) => edit.replace(editor.selection, code));
    },

    openAttachment: async ({ fsPath, line, endLine }: { fsPath: string; line?: number; endLine?: number }) => {
      let targetPath = fsPath;
      let startL = line;
      let endL = endLine;

      const hashIndex = targetPath.indexOf('#');
      if (hashIndex !== -1) {
        const fragment = targetPath.slice(hashIndex + 1);
        targetPath = targetPath.slice(0, hashIndex);
        const match = fragment.match(/^L?(\d+)(?:-L?(\d+))?$/i);
        if (match) {
          startL = parseInt(match[1], 10);
          endL = match[2] ? parseInt(match[2], 10) : startL;
        }
      }

      const root = workspaceDir();
      const resolved = path.isAbsolute(targetPath) ? targetPath : (root ? path.resolve(root, targetPath) : targetPath);

      try {
        const uri = vscode.Uri.file(resolved);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        if (startL !== undefined && startL > 0) {
          const startIdx = Math.max(0, startL - 1);
          const endIdx = endL !== undefined && endL > 0 ? Math.max(0, endL - 1) : startIdx;
          const endCol = doc.lineAt(Math.min(endIdx, Math.max(0, doc.lineCount - 1))).text.length;
          const selection = new vscode.Selection(startIdx, 0, endIdx, endCol);
          editor.selection = selection;
          editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
        }
      } catch {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(resolved));
      }
    },

    openDiff: async ({ code }) => {
      const editor = currentEditor();
      if (!editor) {
        void vscode.window.showWarningMessage('Abre un archivo para comparar.');
        return;
      }
      latestProposal = code;
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
      const proposalUri = vscode.Uri.parse(`${PROPOSAL_SCHEME}:${relativePath}?${Date.now()}`);
      await vscode.commands.executeCommand('vscode.diff', editor.document.uri, proposalUri, `${relativePath} ↔ Propuesta`);
    },

    applyInlineDiff: async ({ code, filePath }) => {
      let editor = currentEditor();
      if (!editor && filePath) {
        const root = workspaceDir();
        if (root) {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
          if (fs.existsSync(fullPath)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
            editor = await vscode.window.showTextDocument(doc);
          }
        }
      }
      if (!editor) {
        void vscode.window.showWarningMessage('Abre un archivo activo para visualizar el diff inline.');
        return;
      }

      // Limpia decoraciones previas si las hubiera
      if (activeDecoratedEditor) {
        activeDecoratedEditor.setDecorations(addedDecorationType, []);
      }

      activeDecoratedEditor = editor;
      const doc = editor.document;
      const fullRange = new vscode.Range(0, 0, Math.max(0, doc.lineCount - 1), 0);
      editor.setDecorations(addedDecorationType, [fullRange]);

      const choice = await vscode.window.showInformationMessage(
        `Revisión Inline activa en ${path.basename(doc.fileName)}. ¿Deseas aplicar la propuesta?`,
        'Aplicar reemplazo',
        'Descartar'
      );

      if (choice === 'Aplicar reemplazo') {
        const entireRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        await editor.edit((edit) => edit.replace(entireRange, code));
        void vscode.window.showInformationMessage('Cambios aplicados exitosamente.');
      }

      editor.setDecorations(addedDecorationType, []);
      activeDecoratedEditor = undefined;
    },

    clearInlineDiff: () => {
      if (activeDecoratedEditor) {
        activeDecoratedEditor.setDecorations(addedDecorationType, []);
        activeDecoratedEditor = undefined;
      }
    },

    saveCodeToFile: async ({ filePath, code }) => {
      const root = workspaceDir();
      if (!root) {
        void vscode.window.showWarningMessage('No hay ningún espacio de trabajo abierto.');
        return;
      }
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
      if (!fullPath.startsWith(root)) {
        void vscode.window.showErrorMessage('La ruta no pertenece al espacio de trabajo.');
        return;
      }
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, code, 'utf8');
      const uri = vscode.Uri.file(fullPath);
      await vscode.window.showTextDocument(uri);
      void vscode.window.showInformationMessage(`Guardado: ${vscode.workspace.asRelativePath(uri)}`);
    },

    rollbackTurn: async ({ sessionId, checkpointHash }) => {
      const root = (hub && hub.sessions.get(sessionId)?.projectPath) || workspaceDir();
      if (!root) {
        void vscode.window.showWarningMessage('No se encontró la carpeta del proyecto para revertir.');
        return;
      }
      const success = rollbackCheckpoint(root, checkpointHash);
      if (success) {
        void vscode.window.showInformationMessage('Cambios del turno revertidos exitosamente.');
        hub?.chat.addNote(sessionId, '↩ Cambios del turno revertidos al estado previo.');
      } else {
        void vscode.window.showErrorMessage('No se pudieron revertir los cambios del turno.');
      }
    }
  };
}
