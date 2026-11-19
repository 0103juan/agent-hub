import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execFile, execFileSync } from 'child_process';
import * as vscode from 'vscode';
import { findSecrets } from '../../analysis/secret-scanner';
import { auditEnvSync } from '../../analysis/code-audits';
import { findDestructiveStatements, findQueryIssues } from '../../analysis/sql-review';
import { currentEditor, workspaceDir, setCustomWorkspaceDir, getRecentWorkspaces, getGitStatusFiles, getProjectTree, getGitBranch, getGitBranchSummary, isSystemOrAppDir } from '../workspace';
import { rollbackCheckpoint } from '../git-checkpoint';
import { listDocuments, readDocument, saveDocument } from '../documents';
import { HubContext } from '../hub-context';
import { HandlerMap } from './handler-types';

const PROPOSAL_SCHEME = 'agent-hub-proposal';

let latestProposal = '';

/** Lista blanca de shells permitidas desde la vista para evitar inyección de ejecutables arbitrarios. */
export function resolveShellOption(shell?: string): string | boolean {
  switch (shell) {
    case 'pwsh':
      return process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
    case 'cmd':
      return process.platform === 'win32' ? 'cmd.exe' : true;
    case 'bash':
      return 'bash';
    case 'wsl':
      return process.platform === 'win32' ? 'wsl.exe' : true;
    default:
      return true;
  }
}

/** Un proceso activo por pestaña de terminal (`terminalId`), p. ej. `npm run dev` en paralelo a `npm test`. */
const terminalProcs = new Map<string, ReturnType<typeof spawn>>();
/** Directorio de trabajo persistente por pestaña tras ejecutar `cd`. */
const terminalCwds = new Map<string, string>();

const SNIPPETS_REL_PATH = path.join('.agent-hub', 'terminal-snippets.json');

function resolveCdCommand(commandLine: string): string | undefined {
  const match = commandLine.trim().match(/^cd(?:\s+\/d)?\s+(.+)$/i);
  if (!match) return undefined;
  const raw = match[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

/** Con `shell: true`, `kill()` en Windows solo cierra cmd.exe y deja vivo al proceso hijo. */
function killTree(proc: ReturnType<typeof spawn>): void {
  if (!proc.pid) return;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }
}

/** Sin shell: rutas, ramas y mensajes llegan de la vista y no deben interpretarse. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
}

/** Un nombre que empieza por `-` git lo tomaría como opción. */
function assertBranchName(branch: string): void {
  if (!branch || branch.startsWith('-')) throw new Error(`Nombre de rama no válido: ${branch}`);
}

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

/** Carpeta GitHub que contiene los proyectos: el ancestro llamado GitHub del espacio actual, o ~/Documents/GitHub. */
function githubRoot(): string {
  let cur = workspaceDir() ?? '';
  while (cur && path.dirname(cur) !== cur) {
    if (path.basename(cur).toLowerCase() === 'github') return cur;
    cur = path.dirname(cur);
  }
  return path.join(os.homedir(), 'Documents', 'GitHub');
}

export function editorHandlers(hub?: HubContext): HandlerMap<
  | 'insertCode'
  | 'openDiff'
  | 'openAttachment'
  | 'saveCodeToFile'
  | 'rollbackTurn'
  | 'applyInlineDiff'
  | 'clearInlineDiff'
  | 'previewFile'
  | 'setWorkspaceDir'
  | 'chooseWorkspaceDir'
  | 'listDirs'
  | 'listDocuments'
  | 'readDocument'
  | 'saveDocument'
  | 'startSystemDictation'
  | 'getWorkspaceOverview'
  | 'openFolderInExplorer'
  | 'runTerminalCommand'
  | 'sendTerminalInput'
  | 'stopTerminalCommand'
  | 'loadTerminalSnippets'
  | 'saveTerminalSnippets'
  | 'gitDiffFile'
  | 'gitRevertFile'
  | 'gitCommitQuick'
  | 'searchContent'
  | 'getGitBranches'
  | 'getDirGitStatus'
  | 'checkoutBranch'
  | 'createBranch'
  | 'deleteBranch'
  | 'initGitRepo'
  | 'runSecurityAudit'
  | 'loadScratchpad'
  | 'saveScratchpad'
> {
  const resolveTargetDir = (dir?: string, sessionId?: string): string => {
    if (dir && !isSystemOrAppDir(dir) && fs.existsSync(dir)) return dir;
    if (sessionId) {
      const sessionDir = hub?.sessions?.get(sessionId)?.projectPath;
      if (sessionDir && !isSystemOrAppDir(sessionDir) && fs.existsSync(sessionDir)) return sessionDir;
    }
    const activeDir = hub?.sessions?.getActive()?.projectPath;
    if (activeDir && !isSystemOrAppDir(activeDir) && fs.existsSync(activeDir)) return activeDir;
    return workspaceDir() ?? os.homedir();
  };
  const resolveCurrentRoot = () => resolveTargetDir();

  const emitGitBranches = (dir?: string) => {
    const root = resolveTargetDir(dir);
    const branch = getGitBranch(root);
    const isGit = Boolean(branch);
    const currentBranch = branch;
    const branches: string[] = [];
    const squadBranches: string[] = [];
    const seen = new Set<string>();

    if (isGit) {
      try {
        // Usar -a para listar ramas locales y remotas disponibles
        const rawBranches = git(root, 'branch', '-a', '--no-color');
        for (const line of rawBranches.split('\n')) {
          let clean = line.replace(/^[*+\s]+/, '').trim();
          if (!clean || clean.includes('->')) continue;

          if (clean.startsWith('remotes/')) {
            clean = clean.replace(/^remotes\/[^/]+\//, '');
          }

          if (!clean || seen.has(clean)) continue;
          seen.add(clean);

          if (clean.startsWith('agent-hub/') || clean.startsWith('squad-') || clean.startsWith('squad/') || clean.startsWith('pipeline-')) {
            squadBranches.push(clean);
          } else {
            branches.push(clean);
          }
        }
      } catch {}
    }

    hub?.post({
      type: 'gitBranches',
      dir: root,
      isGit,
      currentBranch,
      branches,
      squadBranches
    });
  };

  const emitWorkspaceOverview = () => {
    const root = resolveCurrentRoot();
    const branch = getGitBranch(root);
    const isGit = Boolean(branch);
    hub?.post({
      type: 'workspaceOverview',
      workspaceDir: root,
      isGit,
      currentBranch: branch,
      recentWorkspaces: getRecentWorkspaces(),
      gitFiles: isGit ? getGitStatusFiles(root) : [],
      projectTree: getProjectTree(root)
    });
    emitGitBranches(root);
  };

  // Documentos puede abrirse sobre la carpeta de una conversación y no la global.
  const docRoot = (root?: string) => (root && !isSystemOrAppDir(root) && fs.existsSync(root) && fs.statSync(root).isDirectory() ? root : resolveCurrentRoot());

  return {
    setWorkspaceDir: async ({ dir }: { dir: string }) => {
      setCustomWorkspaceDir(dir);
      emitWorkspaceOverview();
    },

    getWorkspaceOverview: async () => {
      emitWorkspaceOverview();
    },

    listDocuments: async ({ all, root: requested }: { all?: boolean; root?: string }) => {
      const root = docRoot(requested);
      hub?.post({ type: 'documents', root, ...listDocuments(root, all) });
    },

    readDocument: async ({ file, root }: { file: string; root?: string }) => {
      const result = readDocument(docRoot(root), file);
      hub?.post('error' in result ? { type: 'documentContent', file, error: result.error } : { type: 'documentContent', ...result });
    },

    saveDocument: async ({ file, content, expectedMtime, force, root }: { file: string; content: string; expectedMtime?: number; force?: boolean; root?: string }) => {
      const result = saveDocument(docRoot(root), file, content, expectedMtime, force);
      hub?.post({ type: 'documentSaved', file, ...result });
    },

    listDirs: async ({ dir }: { dir?: string }) => {
      const root = githubRoot();
      const target = dir && fs.existsSync(dir) ? dir : root;
      let entries: Array<{ name: string; path: string; isGit: boolean }> = [];
      try {
        entries = fs.readdirSync(target, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
          .map((e) => {
            const full = path.join(target, e.name);
            return { name: e.name, path: full, isGit: fs.existsSync(path.join(full, '.git')) };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {}
      hub?.post({ type: 'dirListing', root, dir: target, entries });
    },

    // Electron (sin servicio de voz de Google) y los webviews de VS Code no soportan Web Speech: se usa el dictado de Windows (Win+H) sobre el campo enfocado.
    startSystemDictation: async () => {
      if (process.platform !== 'win32') return;
      const ps = "Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, int e);';" +
        "[W.K]::keybd_event(0x5B,0,0,0);[W.K]::keybd_event(0x48,0,0,0);[W.K]::keybd_event(0x48,0,2,0);[W.K]::keybd_event(0x5B,0,2,0)";
      execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true }, () => {});
    },

    chooseWorkspaceDir: async () => {
      if (process.versions?.electron) {
        try {
          const electron = require('electron');
          const result = await electron.dialog.showOpenDialog({
            title: 'Seleccionar Carpeta de Proyecto',
            properties: ['openDirectory', 'createDirectory']
          });
          if (!result.canceled && result.filePaths?.[0]) {
            setCustomWorkspaceDir(result.filePaths[0]);
            emitWorkspaceOverview();
            return;
          }
        } catch (err) {
          console.warn('[Workspace] Error al abrir diálogo de Electron:', err);
        }
      }

      try {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Seleccionar proyecto'
        });
        if (uris?.[0]) {
          setCustomWorkspaceDir(uris[0].fsPath);
          emitWorkspaceOverview();
        }
      } catch {}
    },

    openFolderInExplorer: async ({ dir }: { dir?: string }) => {
      const target = dir ?? workspaceDir();
      if (!target || !fs.existsSync(target)) return;
      if (process.versions?.electron) {
        try {
          const { shell } = require('electron');
          await shell.openPath(target);
          return;
        } catch {}
      }
      if (process.platform === 'win32') {
        const { execFile } = require('child_process');
        execFile('explorer.exe', [target], () => {});
      } else {
        void vscode.env.openExternal(vscode.Uri.file(target));
      }
    },
    previewFile: async ({ file, line }: { file: string; line?: number }) => {
      const root = workspaceDir();
      const resolved = path.isAbsolute(file) ? file : (root ? path.resolve(root, file) : file);
      if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
        try {
          const content = fs.readFileSync(resolved, 'utf8');
          hub?.post({ type: 'filePreview', file: resolved, content, line });
        } catch (err) {
          void vscode.window.showErrorMessage(`No se pudo leer ${file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    },

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
        const visibleEditors = vscode.window.visibleTextEditors;
        const targetColumn = visibleEditors.length > 0
          ? (visibleEditors[0].viewColumn ?? vscode.ViewColumn.Beside)
          : vscode.ViewColumn.Beside;
        const editor = await vscode.window.showTextDocument(doc, { viewColumn: targetColumn, preserveFocus: false });
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
      const relative = path.relative(root, fullPath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
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
    },

    stopTerminalCommand: ({ terminalId = 'default' }: { terminalId?: string } = {}) => {
      const proc = terminalProcs.get(terminalId);
      if (!proc) return;
      hub?.post({ type: 'terminalOutput', terminalId, output: '\n[Deteniendo…]\n' });
      killTree(proc);
    },

    sendTerminalInput: ({ terminalId = 'default', data }: { terminalId?: string; data: string }) => {
      const proc = terminalProcs.get(terminalId);
      if (!proc || !proc.stdin?.writable) return;
      proc.stdin.write(`${data}\n`);
      hub?.post({ type: 'terminalOutput', terminalId, output: `> ${data}\n` });
    },

    loadTerminalSnippets: ({ cwd }: { cwd?: string } = {}) => {
      const root = cwd && fs.existsSync(cwd) ? cwd : (workspaceDir() ?? process.cwd());
      const file = path.join(root, SNIPPETS_REL_PATH);
      let snippets: Array<{ label: string; cmd: string }> = [];
      try {
        if (fs.existsSync(file)) {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (Array.isArray(parsed)) {
            snippets = parsed.filter((s) => s && typeof s.label === 'string' && typeof s.cmd === 'string');
          }
        }
      } catch {}
      hub?.post({ type: 'terminalSnippets', snippets });
    },

    saveTerminalSnippets: ({ cwd, snippets }: { cwd?: string; snippets: Array<{ label: string; cmd: string }> }) => {
      const root = cwd && fs.existsSync(cwd) ? cwd : (workspaceDir() ?? process.cwd());
      const file = path.join(root, SNIPPETS_REL_PATH);
      const clean = (Array.isArray(snippets) ? snippets : [])
        .filter((s) => s && typeof s.label === 'string' && typeof s.cmd === 'string' && s.cmd.trim())
        .map((s) => ({ label: s.label.trim() || s.cmd.trim(), cmd: s.cmd.trim() }))
        .slice(0, 50);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(clean, null, 2), 'utf8');
      hub?.post({ type: 'terminalSnippets', snippets: clean });
    },

    runTerminalCommand: async ({
      terminalId = 'default',
      commandLine,
      cwd,
      shell
    }: {
      terminalId?: string;
      commandLine: string;
      cwd?: string;
      shell?: string;
    }) => {
      if (terminalProcs.has(terminalId)) {
        hub?.post({ type: 'terminalOutput', terminalId, output: '\n[Ya hay un comando en ejecución en esta pestaña: detenlo antes de lanzar otro]\n' });
        return;
      }
      const fallbackRoot = workspaceDir() ?? process.cwd();
      const baseCwd = cwd && fs.existsSync(cwd) ? cwd : fallbackRoot;
      const savedCwd = terminalCwds.get(terminalId);
      const root = savedCwd && fs.existsSync(savedCwd) ? savedCwd : baseCwd;

      const cdTarget = resolveCdCommand(commandLine);
      if (cdTarget !== undefined && !/[&|;<>]/.test(commandLine)) {
        hub?.post({ type: 'terminalOutput', terminalId, output: `\n$ ${commandLine}\n`, command: commandLine, cwd: root });
        const nextDir = cdTarget === '~' ? os.homedir() : path.resolve(root, cdTarget);
        if (fs.existsSync(nextDir) && fs.statSync(nextDir).isDirectory()) {
          terminalCwds.set(terminalId, nextDir);
          hub?.post({
            type: 'terminalOutput',
            terminalId,
            output: `${nextDir}\n`,
            exitCode: 0,
            command: commandLine,
            cwd: nextDir
          });
        } else {
          hub?.post({
            type: 'terminalOutput',
            terminalId,
            output: `cd: no existe el directorio: ${nextDir}\n`,
            exitCode: 1,
            command: commandLine,
            cwd: root
          });
        }
        return;
      }

      hub?.post({ type: 'terminalOutput', terminalId, output: `\n$ ${commandLine}\n`, command: commandLine, cwd: root });
      try {
        // `detached` en Unix crea un grupo de procesos para poder matarlo entero.
        const proc = spawn(commandLine, {
          shell: resolveShellOption(shell),
          cwd: root,
          windowsHide: true,
          detached: process.platform !== 'win32'
        });
        terminalProcs.set(terminalId, proc);
        proc.stdout?.on('data', (data: Buffer) => {
          hub?.post({ type: 'terminalOutput', terminalId, output: data.toString('utf8'), command: commandLine });
        });
        proc.stderr?.on('data', (data: Buffer) => {
          hub?.post({ type: 'terminalOutput', terminalId, output: data.toString('utf8'), command: commandLine });
        });
        proc.on('close', (code: number | null) => {
          if (terminalProcs.get(terminalId) === proc) terminalProcs.delete(terminalId);
          hub?.post({
            type: 'terminalOutput',
            terminalId,
            output: `\n[Proceso terminado con código ${code ?? 0}]\n`,
            exitCode: code ?? 0,
            command: commandLine
          });
          emitWorkspaceOverview();
        });
        proc.on('error', (err: Error) => {
          if (terminalProcs.get(terminalId) === proc) terminalProcs.delete(terminalId);
          hub?.post({
            type: 'terminalOutput',
            terminalId,
            output: `\nError al ejecutar: ${err.message}\n`,
            exitCode: 1,
            command: commandLine
          });
        });
      } catch (err) {
        hub?.post({
          type: 'terminalOutput',
          terminalId,
          output: `\nError al iniciar: ${err instanceof Error ? err.message : String(err)}\n`,
          exitCode: 1,
          command: commandLine
        });
      }
    },

    gitDiffFile: async ({ file }: { file: string }) => {
      const root = workspaceDir() ?? process.cwd();
      const resolved = path.isAbsolute(file) ? file : path.resolve(root, file);
      const relative = path.relative(root, resolved).replace(/\\/g, '/');
      let original = '';
      let modified = '';
      let rawDiff = '';

      if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
        try {
          modified = fs.readFileSync(resolved, 'utf8');
        } catch {}
      }

      try {
        original = git(root, 'show', `HEAD:${relative}`);
      } catch {
        original = '';
      }

      try {
        rawDiff = git(root, 'diff', 'HEAD', '--', relative);
      } catch {
        rawDiff = '';
      }

      hub?.post({
        type: 'gitDiffResult',
        file: relative,
        original,
        modified,
        rawDiff
      });
    },

    gitRevertFile: async ({ file }: { file: string }) => {
      const root = workspaceDir() ?? process.cwd();
      const resolved = path.isAbsolute(file) ? file : path.resolve(root, file);
      const relative = path.relative(root, resolved).replace(/\\/g, '/');
      // El respaldo borra el archivo: nunca fuera del proyecto.
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return;

      try {
        git(root, 'checkout', 'HEAD', '--', relative);
      } catch {
        try {
          if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
          }
        } catch {}
      }
      emitWorkspaceOverview();
      hub?.post({
        type: 'notice',
        notice: {
          id: `revert-${Date.now()}`,
          sessionId: '',
          text: `Archivo ${path.basename(file)} revertido al estado original.`,
          at: Date.now()
        }
      });
    },

    gitCommitQuick: async ({ message }: { message: string }) => {
      const root = workspaceDir() ?? process.cwd();
      try {
        git(root, 'add', '-A');
        git(root, 'commit', '-m', message || 'chore: actualización');
        emitWorkspaceOverview();
        hub?.post({
          type: 'notice',
          notice: {
            id: `commit-${Date.now()}`,
            sessionId: '',
            text: `Commit creado: "${message}"`,
            at: Date.now()
          }
        });
      } catch (err) {
        hub?.post({
          type: 'notice',
          notice: {
            id: `commit-err-${Date.now()}`,
            sessionId: '',
            text: `No se pudo crear commit: ${err instanceof Error ? err.message : String(err)}`,
            at: Date.now()
          }
        });
      }
    },

    searchContent: async ({ query }: { query: string }) => {
      const root = workspaceDir() ?? process.cwd();
      const trimmed = query.trim();
      if (!trimmed || trimmed.length < 2) {
        hub?.post({ type: 'contentSearchResults', query, results: [] });
        return;
      }
      const results: Array<{ file: string; line: number; text: string }> = [];
      try {
        const output = git(root, 'grep', '-n', '-I', '--max-depth', '5', '-F', '-e', trimmed);
        for (const line of output.split('\n')) {
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (match && results.length < 100) {
            results.push({
              file: match[1].replace(/\\/g, '/'),
              line: parseInt(match[2], 10),
              text: match[3].trim().slice(0, 150)
            });
          }
        }
      } catch {
        try {
          const searchInDir = (dir: string, depth: number) => {
            if (depth > 4 || results.length >= 100) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (results.length >= 100) break;
              if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                searchInDir(full, depth + 1);
              } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|md|html|css|py|rs|go|txt)$/i.test(entry.name)) {
                try {
                  const content = fs.readFileSync(full, 'utf8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(trimmed.toLowerCase())) {
                      results.push({
                        file: path.relative(root, full).replace(/\\/g, '/'),
                        line: i + 1,
                        text: lines[i].trim().slice(0, 150)
                      });
                      if (results.length >= 100) break;
                    }
                  }
                } catch {}
              }
            }
          };
          searchInDir(root, 0);
        } catch {}
      }
      hub?.post({ type: 'contentSearchResults', query, results });
    },

    getDirGitStatus: async ({ dir, sessionId }: { dir?: string; sessionId?: string }) => {
      const targetDir = resolveTargetDir(dir, sessionId);
      const summary = getGitBranchSummary(targetDir);
      hub?.post({
        type: 'dirGitStatus',
        dir: targetDir,
        sessionId,
        branch: summary.branch,
        uncommittedCount: summary.uncommittedCount,
        gitFiles: summary.gitFiles
      });
      emitGitBranches(targetDir);
    },

    getGitBranches: async ({ dir, sessionId }: { dir?: string; sessionId?: string } = {}) => {
      const targetDir = resolveTargetDir(dir, sessionId);
      emitGitBranches(targetDir);
    },

    checkoutBranch: async ({ branch, dir, sessionId }: { branch: string; dir?: string; sessionId?: string }) => {
      const root = resolveTargetDir(dir, sessionId);
      try {
        assertBranchName(branch);
        git(root, 'checkout', branch);
        emitGitBranches(root);
        const summary = getGitBranchSummary(root);
        hub?.post({
          type: 'dirGitStatus',
          dir: root,
          sessionId,
          branch: summary.branch,
          uncommittedCount: summary.uncommittedCount,
          gitFiles: summary.gitFiles
        });
        hub?.post({
          type: 'notice',
          notice: { id: `branch-${Date.now()}`, sessionId: sessionId || '', text: `Cambiado a rama ${branch}`, at: Date.now() }
        });
      } catch (err) {
        hub?.post({
          type: 'notice',
          notice: { id: `branch-err-${Date.now()}`, sessionId: sessionId || '', text: `Error al cambiar de rama: ${err instanceof Error ? err.message : String(err)}`, at: Date.now() }
        });
      }
    },

    createBranch: async ({ branch, dir, sessionId }: { branch: string; dir?: string; sessionId?: string }) => {
      const root = resolveTargetDir(dir, sessionId);
      const safeBranch = branch.trim().replace(/\s+/g, '-');
      try {
        assertBranchName(safeBranch);
        git(root, 'checkout', '-b', safeBranch);
        emitGitBranches(root);
        const summary = getGitBranchSummary(root);
        hub?.post({
          type: 'dirGitStatus',
          dir: root,
          sessionId,
          branch: summary.branch,
          uncommittedCount: summary.uncommittedCount,
          gitFiles: summary.gitFiles
        });
        hub?.post({
          type: 'notice',
          notice: { id: `branch-create-${Date.now()}`, sessionId: sessionId || '', text: `Rama ${safeBranch} creada exitosamente`, at: Date.now() }
        });
      } catch (err) {
        hub?.post({
          type: 'notice',
          notice: { id: `branch-create-err-${Date.now()}`, sessionId: sessionId || '', text: `Error al crear rama: ${err instanceof Error ? err.message : String(err)}`, at: Date.now() }
        });
      }
    },

    deleteBranch: async ({ branch, dir, sessionId }: { branch: string; dir?: string; sessionId?: string }) => {
      const root = resolveTargetDir(dir, sessionId);
      try {
        assertBranchName(branch);
        git(root, 'branch', '-D', branch);
        emitGitBranches(root);
        hub?.post({
          type: 'notice',
          notice: { id: `branch-del-${Date.now()}`, sessionId: sessionId || '', text: `Rama ${branch} eliminada`, at: Date.now() }
        });
      } catch (err) {
        hub?.post({
          type: 'notice',
          notice: { id: `branch-del-err-${Date.now()}`, sessionId: sessionId || '', text: `No se pudo eliminar la rama: ${err instanceof Error ? err.message : String(err)}`, at: Date.now() }
        });
      }
    },

    initGitRepo: async ({ dir, sessionId }: { dir?: string; sessionId?: string } = {}) => {
      const root = resolveTargetDir(dir, sessionId);
      try {
        git(root, 'init');
        emitGitBranches(root);
        const summary = getGitBranchSummary(root);
        hub?.post({
          type: 'dirGitStatus',
          dir: root,
          sessionId,
          branch: summary.branch,
          uncommittedCount: summary.uncommittedCount,
          gitFiles: summary.gitFiles
        });
        hub?.post({
          type: 'notice',
          notice: { id: `git-init-${Date.now()}`, sessionId: sessionId || '', text: `Repositorio Git inicializado en ${root}`, at: Date.now() }
        });
      } catch (err) {
        hub?.post({
          type: 'notice',
          notice: { id: `git-init-err-${Date.now()}`, sessionId: sessionId || '', text: `Error al inicializar Git: ${err instanceof Error ? err.message : String(err)}`, at: Date.now() }
        });
      }
    },

    runSecurityAudit: async () => {
      const root = workspaceDir() ?? process.cwd();
      const secretIssues: Array<{ file: string; line: number; type: string; snippet: string }> = [];
      const sqlIssues: Array<{ file: string; line: number; issue: string }> = [];
      let envCodeAccumulator = '';
      let envExampleContent = '';

      const envExamplePath = path.join(root, '.env.example');
      if (fs.existsSync(envExamplePath)) {
        try { envExampleContent = fs.readFileSync(envExamplePath, 'utf8'); } catch {}
      }

      const scanDir = (dir: string, depth: number) => {
        if (depth > 4 || secretIssues.length >= 50) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist_package') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(full, depth + 1);
            } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|py|sql|env|yaml|yml|sh|md)$/i.test(entry.name)) {
              try {
                const content = fs.readFileSync(full, 'utf8');
                const relPath = path.relative(root, full).replace(/\\/g, '/');
                if (/\.(ts|tsx|js|jsx|py)$/i.test(entry.name)) {
                  envCodeAccumulator += '\n' + content;
                }

                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  const lineText = lines[i];
                  const detected = findSecrets(lineText);
                  for (const secretType of detected) {
                    secretIssues.push({
                      file: relPath,
                      line: i + 1,
                      type: secretType,
                      snippet: lineText.trim().slice(0, 100)
                    });
                  }

                  if (/\.sql$/i.test(entry.name) || lineText.toUpperCase().includes('SELECT ') || lineText.toUpperCase().includes('UPDATE ') || lineText.toUpperCase().includes('DELETE ')) {
                    const destructives = findDestructiveStatements(lineText);
                    for (const d of destructives) {
                      sqlIssues.push({ file: relPath, line: i + 1, issue: `Sentencia DDL/destructiva: ${d}` });
                    }
                    const queryFlaws = findQueryIssues(lineText);
                    for (const f of queryFlaws) {
                      sqlIssues.push({ file: relPath, line: i + 1, issue: f });
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
      };

      scanDir(root, 0);

      const envSync = auditEnvSync(envCodeAccumulator, envExampleContent);

      hub?.post({
        type: 'securityAuditResult',
        secretIssues,
        undocumentedEnvVars: envSync.undocumentedVars,
        sqlIssues
      });
    },

    loadScratchpad: async () => {
      const root = workspaceDir() ?? process.cwd();
      const scratchpadPath = path.join(root, '.agent-hub', 'scratchpad.md');
      let content = '# Borrador de Trabajo (Scratchpad)\n\n- [ ] Anota tareas, código temporal o ideas aquí.\n- Puedes enviarlo directamente al agente en cualquier momento.\n';
      if (fs.existsSync(scratchpadPath)) {
        try { content = fs.readFileSync(scratchpadPath, 'utf8'); } catch {}
      }
      hub?.post({ type: 'scratchpadContent', content });
    },

    saveScratchpad: async ({ content }: { content: string }) => {
      const root = workspaceDir() ?? process.cwd();
      const dir = path.join(root, '.agent-hub');
      const scratchpadPath = path.join(dir, 'scratchpad.md');
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(scratchpadPath, content, 'utf8');
      } catch {}
    }
  };
}
