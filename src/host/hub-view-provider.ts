import * as os from 'os';
import * as vscode from 'vscode';
import { HostMessage, WebviewMessage } from '../shared/ipc';
import { accountHandlers, publishAccountsAndMcps } from './handlers/account-handlers';
import { actionHandlers } from './handlers/action-handlers';
import { contextHandlers } from './handlers/context-handlers';
import { editorHandlers } from './handlers/editor-handlers';
import { HandlerMap } from './handlers/handler-types';
import { sessionHandlers } from './handlers/session-handlers';
import { HubContext } from './hub-context';
import { renderWebviewHtml } from './webview-html';

/** Mantiene sincronizadas todas las vistas abiertas (barra lateral y panel). */
export class HubViewProvider implements vscode.WebviewViewProvider {
  private readonly webviews = new Set<vscode.Webview>();
  private besidePanel?: vscode.WebviewPanel;
  private handlers?: HandlerMap;
  private hub?: HubContext;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** El contexto necesita `post`, por eso se conecta después de construir la vista. */
  public connect(hub: HubContext): void {
    this.hub = hub;
    this.handlers = {
      ready: () => this.publishInitialState(hub),
      openBeside: () => this.openBesidePanel(),
      ...sessionHandlers(hub),
      ...accountHandlers(hub),
      ...contextHandlers(hub),
      ...editorHandlers(hub),
      ...actionHandlers(hub)
    };
  }

  public post(message: HostMessage): void {
    for (const webview of this.webviews) void webview.postMessage(message);
  }

  private publishInitialState(hub: HubContext): void {
    hub.post({ type: 'state', patch: { telemetry: hub.telemetry.getRegistry() } });
    hub.chat.publishSessions();
    void publishAccountsAndMcps(hub);
  }

  /** Además de la extensión, las carpetas donde un agente suele guardar imágenes generadas. */
  private resourceRoots(): vscode.Uri[] {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);
    return [this.extensionUri, ...folders, vscode.Uri.file(os.homedir()), vscode.Uri.file(os.tmpdir())];
  }

  private attach(webview: vscode.Webview, disposable: { onDidDispose: vscode.Event<void> }): void {
    webview.options = { enableScripts: true, localResourceRoots: this.resourceRoots() };
    webview.html = renderWebviewHtml(webview, this.extensionUri);
    this.webviews.add(webview);
    webview.onDidReceiveMessage((message: WebviewMessage) => this.dispatch(message));
    disposable.onDidDispose(() => this.webviews.delete(webview));
  }

  private async dispatch(message: WebviewMessage): Promise<void> {
    const handler = this.handlers?.[message.command] as ((message: WebviewMessage) => void | Promise<void>) | undefined;
    try {
      await handler?.(message);
    } catch (error) {
      void vscode.window.showErrorMessage(`AgentHub: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.attach(view.webview, view);
  }

  public openBesidePanel(): void {
    if (this.besidePanel) {
      this.besidePanel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel('agent-hub.besidePanel', 'AgentHub', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: this.resourceRoots()
    });
    this.besidePanel = panel;
    this.attach(panel.webview, panel);
    panel.onDidDispose(() => {
      this.besidePanel = undefined;
    });
  }
}
