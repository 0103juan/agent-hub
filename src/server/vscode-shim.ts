import * as fs from 'fs';
import * as path from 'path';
import { isSystemOrAppDir } from '../host/safe-path';

const initialCwd = !isSystemOrAppDir(process.cwd()) ? process.cwd() : undefined;

export const workspace = {
  workspaceFolders: initialCwd ? [{ uri: { fsPath: initialCwd } }] : [],
  asRelativePath: (p: any) => path.relative(initialCwd ?? process.cwd(), typeof p === 'string' ? p : (p?.fsPath ?? '')),
  openTextDocument: async () => ({
    lineCount: 1,
    lineAt: () => ({ text: '' })
  }),
  getConfiguration: () => ({
    get: () => undefined,
    update: async () => {}
  }),
  registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
  fs: {
    writeFile: async (uri: { fsPath: string }, content: Uint8Array) => {
      await fs.promises.mkdir(path.dirname(uri.fsPath), { recursive: true });
      await fs.promises.writeFile(uri.fsPath, content);
    },
    readFile: async (uri: { fsPath: string }) => {
      return fs.promises.readFile(uri.fsPath);
    }
  }
};

export const window = {
  showInformationMessage: async (msg: string) => console.log(`[AgentHub Info] ${msg}`),
  showWarningMessage: async (msg: string) => console.warn(`[AgentHub Warn] ${msg}`),
  showErrorMessage: async (msg: string) => console.error(`[AgentHub Error] ${msg}`),
  showQuickPick: async () => undefined,
  showSaveDialog: async (options?: any) => {
    if (process.versions?.electron) {
      try {
        const { dialog } = require('electron');
        const filters = options?.filters
          ? Object.entries(options.filters).map(([name, exts]) => ({ name, extensions: exts as string[] }))
          : undefined;
        const res = await dialog.showSaveDialog({
          defaultPath: options?.defaultUri?.fsPath,
          filters
        });
        if (!res.canceled && res.filePath) {
          return { fsPath: res.filePath };
        }
        return undefined;
      } catch {}
    }
    return options?.defaultUri ? { fsPath: options.defaultUri.fsPath } : undefined;
  },
  showOpenDialog: async (options?: any) => {
    if (process.versions?.electron) {
      try {
        const { dialog } = require('electron');
        const res = await dialog.showOpenDialog({
          properties: options?.canSelectFolders ? ['openDirectory'] : ['openFile']
        });
        if (!res.canceled && res.filePaths?.[0]) {
          return [{ fsPath: res.filePaths[0] }];
        }
      } catch {}
    }
    return undefined;
  },
  createTextEditorDecorationType: () => ({ dispose: () => {} }),
  createTerminal: (opts: any) => ({
    show: () => {},
    sendText: (cmd: string) => console.log(`[Terminal] ${opts?.name ?? 'terminal'}: ${cmd}`)
  }),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {}
  }),
  visibleTextEditors: [],
  activeTextEditor: undefined,
  registerWebviewViewProvider: () => ({ dispose: () => {} }),
  showTextDocument: async () => ({
    selection: { start: { line: 0 }, end: { line: 0 } },
    revealRange: () => {}
  })
};

export const languages = {
  getDiagnostics: () => []
};

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export class CancellationTokenSource {
  public token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} })
  };
  public cancel() {
    this.token.isCancellationRequested = true;
  }
  public dispose() {}
}

export const LanguageModelChatMessage = {
  User: (content: string) => ({ role: 1, content }),
  Assistant: (content: string) => ({ role: 2, content })
};

export const lm = {
  selectChatModels: async () => []
};

export const env = {
  openExternal: async (uri: { toString(): string }) => true
};

export const Uri = {
  file: (f: string) => ({ fsPath: f, path: f, scheme: 'file', toString: () => f }),
  parse: (s: string) => ({ fsPath: s, path: s, scheme: 'http', toString: () => s })
};

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
  Beside = -2,
  Active = -1
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3
}

export enum OverviewRulerLane {
  Left = 1,
  Center = 2,
  Right = 4,
  Full = 7
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

export class Selection extends Range {
  public anchor: Position;
  public active: Position;
  constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number) {
    super(anchorLine, anchorCharacter, activeLine, activeCharacter);
    this.anchor = new Position(anchorLine, anchorCharacter);
    this.active = new Position(activeLine, activeCharacter);
  }
}

export const commands = {
  executeCommand: async () => {},
  registerCommand: () => ({ dispose: () => {} })
};
