import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { AntigravityProvider } from '../agents/antigravity/antigravity-provider';
import { CliProcessPool } from '../agents/cli-process-pool';
import { ClaudeProvider } from '../agents/claude/claude-provider';
import { CopilotProvider } from '../agents/copilot/copilot-provider';
import { OllamaProvider } from '../agents/ollama/ollama-provider';
import { ProviderRegistry } from '../agents/provider-registry';
import { TerminalRequest } from '../agents/terminal-opener';
import { ChatService, PendingHandoff, PendingStore } from '../chat/chat-service';
import { HubContext } from '../host/hub-context';
import { accountHandlers, publishAccountsAndMcps } from '../host/handlers/account-handlers';
import { actionHandlers } from '../host/handlers/action-handlers';
import { contextHandlers } from '../host/handlers/context-handlers';
import { editorHandlers } from '../host/handlers/editor-handlers';
import { HandlerMap } from '../host/handlers/handler-types';
import { libraryHandlers } from '../host/handlers/library-handlers';
import { sessionHandlers } from '../host/handlers/session-handlers';
import { MCPSyncer } from '../mcp/mcp-syncer';
import { HostMessage, WebviewMessage } from '../shared/ipc';
import { readJsonFile } from '../storage/json-file';
import { SessionStore } from '../storage/session-store';
import { TelemetryStore } from '../storage/telemetry-store';
import { runProjectTests } from '../host/test-runner';
import { isSystemOrAppDir } from '../host/safe-path';
import { HubServer } from './hub-server';

// Shim global de VS Code para permitir ejecución headless fuera del editor
if (typeof (globalThis as any).vscode === 'undefined') {
  const initialCwd = !isSystemOrAppDir(process.cwd()) ? process.cwd() : undefined;
  (globalThis as any).vscode = {
    workspace: {
      workspaceFolders: initialCwd ? [{ uri: { fsPath: initialCwd } }] : [],
      asRelativePath: (p: any) => path.relative(initialCwd ?? process.cwd(), typeof p === 'string' ? p : (p?.fsPath ?? '')),
      openTextDocument: async () => ({}),
      getConfiguration: () => ({ get: () => undefined }),
      registerTextDocumentContentProvider: () => ({ dispose: () => {} })
    },
    window: {
      showInformationMessage: async (msg: string) => console.log(`[AgentHub Info] ${msg}`),
      showWarningMessage: async (msg: string) => console.warn(`[AgentHub Warn] ${msg}`),
      showErrorMessage: async (msg: string) => console.error(`[AgentHub Error] ${msg}`),
      createTextEditorDecorationType: () => ({ dispose: () => {} }),
      visibleTextEditors: [],
      activeTextEditor: undefined
    },
    env: {
      openExternal: async (uri: { toString(): string }) => {
        openUrlInBrowser(uri.toString());
        return true;
      }
    },
    Uri: {
      file: (f: string) => ({ fsPath: f, path: f, scheme: 'file', toString: () => f }),
      parse: (s: string) => ({ fsPath: s, path: s, scheme: 'http', toString: () => s })
    },
    ViewColumn: { One: 1, Beside: -2, Active: -1 },
    TextEditorRevealType: { InCenter: 1 }
  };
}

function openUrlInBrowser(url: string): void {
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, () => {});
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`, () => {});
  } else {
    exec(`xdg-open "${url}"`, () => {});
  }
}

function findAppBrowser(): string | undefined {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    return candidates.find((p) => fs.existsSync(p));
  } else if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    return candidates.find((p) => fs.existsSync(p));
  } else {
    // Linux
    return ['google-chrome', 'microsoft-edge', 'chromium'].find((cmd) => {
      try {
        require('child_process').execSync(`which ${cmd}`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    });
  }
}

function openDesktopApp(url: string): void {
  const browser = findAppBrowser();
  if (browser) {
    exec(`"${browser}" --app="${url}" --window-size=1280,850`, (err) => {
      if (err) openUrlInBrowser(url);
    });
  } else {
    openUrlInBrowser(url);
  }
}

export interface StandaloneOptions {
  port?: number;
  openBrowser?: boolean;
  asApp?: boolean;
  workspaceDir?: string;
  staticDir?: string;
  onPopOutWindow?: (url?: string) => void | Promise<void>;
  onToggleAlwaysOnTop?: () => void | Promise<void>;
  onOpenBeside?: () => void | Promise<void>;
  onOpenMain?: () => void | Promise<void>;
}

export interface StandaloneInstance {
  port: number;
  url: string;
  server: HubServer;
  hub: HubContext;
  cleanup: () => Promise<void>;
}

export function startStandalone(options: StandaloneOptions = {}): Promise<StandaloneInstance> {
  const port = options.port ?? 3710;
  const storageDir = path.join(os.homedir(), '.agent-hub');
  const sessions = new SessionStore(storageDir);
  const telemetry = new TelemetryStore(storageDir);
  const processPool = new CliProcessPool();

  const openTerminal = (req: TerminalRequest) => {
    console.log(`[Terminal] ${req.name}: ${req.command ?? req.shellPath ?? ''}`);
  };

  const providers = new ProviderRegistry(
    [new ClaudeProvider(openTerminal, processPool), new AntigravityProvider(openTerminal, processPool), new CopilotProvider(), new OllamaProvider()],
    path.join(storageDir, 'accounts-cache.json'),
    (accounts) => post({ type: 'state', patch: { accounts } })
  );

  const pendingFile = path.join(storageDir, 'pending-handoffs.json');
  const pendingStore: PendingStore = {
    load: () => readJsonFile<PendingHandoff[]>(pendingFile, []),
    save: (items) => fs.writeFileSync(pendingFile, JSON.stringify(items))
  };

  const post = (message: HostMessage) => {
    server.broadcast(message);
  };

  const hub: HubContext = {
    sessions,
    telemetry,
    providers,
    chat: new ChatService(sessions, telemetry, providers, post, (text) => console.log(`[AgentHub Notice] ${text}`), pendingStore),
    mcp: new MCPSyncer(),
    post,
    openBesidePanel: () => {
      options.onOpenBeside?.();
    },
    openMainPanel: () => {
      options.onOpenMain?.();
    },
    popOutWindow: async () => {
      if (options.onPopOutWindow) {
        await options.onPopOutWindow(server.url);
      } else {
        openUrlInBrowser(server.url);
      }
    }
  };
  hub.chat.verify = runProjectTests;

  const resolvedStaticDir = options.staticDir && fs.existsSync(options.staticDir)
    ? options.staticDir
    : [
        path.join(__dirname, '..', 'dist', 'webview'),
        path.join(__dirname, '..', 'webview'),
        path.join(__dirname, 'webview')
      ].find((d) => fs.existsSync(d)) ?? path.join(__dirname, 'webview');

  const handlers: HandlerMap = {
    ready: () => {
      post({ type: 'state', patch: { telemetry: hub.telemetry.getRegistry() } });
      hub.chat.publishSessions();
      void publishAccountsAndMcps(hub);
      void (handlers.getWorkspaceOverview as any)?.({});
    },
    openBeside: () => {
      options.onOpenBeside?.();
    },
    openMain: () => {
      options.onOpenMain?.();
    },
    popOutWindow: async (msg: any) => {
      const targetUrl = typeof msg?.url === 'string' && msg.url.trim() ? msg.url : server.url;
      if (options.onPopOutWindow) {
        await options.onPopOutWindow(targetUrl);
      } else {
        openUrlInBrowser(targetUrl);
      }
    },
    toggleAlwaysOnTop: async () => {
      if (options.onToggleAlwaysOnTop) {
        await options.onToggleAlwaysOnTop();
      }
    },
    openExternalBrowser: () => openUrlInBrowser(server.url),
    ...sessionHandlers(hub),
    ...libraryHandlers(hub),
    ...accountHandlers(hub),
    ...contextHandlers(hub),
    ...editorHandlers(hub),
    ...actionHandlers(hub)
  };

  const server = new HubServer({
    port,
    staticDir: resolvedStaticDir,
    onMessage: async (message: WebviewMessage) => {
      const handler = handlers[message.command] as ((msg: WebviewMessage) => void | Promise<void>) | undefined;
      await handler?.(message);
    },
    onClientConnected: () => {
      post({ type: 'state', patch: { telemetry: hub.telemetry.getRegistry() } });
      hub.chat.publishSessions();
      void publishAccountsAndMcps(hub);
      void (handlers.getWorkspaceOverview as any)?.({});
    }
  });

  const cleanup = async () => {
    console.log('\nCerrando AgentHub Daemon...');
    for (const sessionId of hub.chat.runningSessionIds()) hub.chat.cancel(sessionId);
    processPool.dispose();
    sessions.flush();
    telemetry.flush();
    await server.stop();
  };

  process.once('SIGINT', () => { cleanup().then(() => process.exit(0)); });
  process.once('SIGTERM', () => { cleanup().then(() => process.exit(0)); });

  return server.start().then((actualPort) => {
    console.log(`\n┌────────────────────────────────────────────────────────┐`);
    console.log(`│  AgentHub Daemon Server v0.1.0                         │`);
    console.log(`│  URL: http://127.0.0.1:${actualPort}                            │`);
    console.log(`│  Modo: Standalone (Headless Backend)                   │`);
    console.log(`│  Cuentas y MCPs sincronizados en ~/.agent-hub          │`);
    console.log(`└────────────────────────────────────────────────────────┘\n`);

    if (options.asApp) {
      openDesktopApp(`http://127.0.0.1:${actualPort}`);
    } else if (options.openBrowser) {
      openUrlInBrowser(`http://127.0.0.1:${actualPort}`);
    }

    return {
      port: actualPort,
      url: `http://127.0.0.1:${actualPort}`,
      server,
      hub,
      cleanup
    };
  }).catch((err) => {
    console.error('Error al iniciar AgentHub Server:', err);
    throw err;
  });
}

// Auto-run if executed directly as main script (never inside Electron runtime)
// bin/agent-hub.js lo carga con require, así que require.main es bin y no este módulo.
const launchedFromCli = require.main === module || /[\\/]bin[\\/]agent-hub\.js$/.test(require.main?.filename ?? '');
if (launchedFromCli && !process.versions.electron) {
  const args = process.argv.slice(2);
  const portArg = args.indexOf('--port');
  const port = portArg !== -1 ? parseInt(args[portArg + 1], 10) : 3710;
  const asApp = args.includes('--desktop') || args.includes('--app') || args.includes('app');
  const openBrowser = asApp || args.includes('--open') || !args.includes('--no-open');
  startStandalone({ port, openBrowser, asApp });
}
