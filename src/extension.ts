import { OllamaProvider } from './agents/ollama/ollama-provider';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AntigravityProvider } from './agents/antigravity/antigravity-provider';
import { CliProcessPool } from './agents/cli-process-pool';
import { ClaudeProvider } from './agents/claude/claude-provider';
import { CopilotProvider } from './agents/copilot/copilot-provider';
import { ProviderRegistry } from './agents/provider-registry';
import { ChatService, PendingHandoff, PendingStore } from './chat/chat-service';
import { addAccount } from './host/handlers/account-handlers';
import { registerProposalProvider } from './host/handlers/editor-handlers';
import { workspaceDirForSession } from './host/handlers/session-handlers';
import { runProjectTests } from './host/test-runner';
import { workspaceDir } from './host/workspace';
import { HubContext } from './host/hub-context';
import { HubViewProvider } from './host/hub-view-provider';
import { currentEditor, openTerminal } from './host/workspace';
import { MCPSyncer } from './mcp/mcp-syncer';
import { ProtocolRole, ProviderType } from './shared/types';
import { readJsonFile } from './storage/json-file';
import { SessionStore } from './storage/session-store';
import { TelemetryStore } from './storage/telemetry-store';

function sendSelectionToAgent(hub: HubContext, role: ProtocolRole, prompt: string): void {
  const editor = currentEditor();
  if (!editor) return;
  const { document, selection } = editor;
  const sessionId = hub.sessions.getActive().id;
  hub.openBesidePanel();
  void hub.chat.send({
    sessionId,
    prompt,
    role,
    workspaceDir: workspaceDirForSession(hub, sessionId),
    attachments: [
      {
        file: vscode.workspace.asRelativePath(document.uri),
        lines: `L${selection.start.line + 1}-L${selection.end.line + 1}`,
        content: document.getText(selection),
        language: document.languageId
      }
    ]
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const storageDir = path.join(os.homedir(), '.agent-hub');
  const view = new HubViewProvider(context.extensionUri);
  const post = view.post.bind(view);

  const sessions = new SessionStore(storageDir);
  const telemetry = new TelemetryStore(storageDir);
  const processPool = new CliProcessPool();
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
  const hub: HubContext = {
    sessions,
    telemetry,
    providers,
    chat: new ChatService(sessions, telemetry, providers, post, (text) => void vscode.window.showInformationMessage(`AgentHub: ${text}`), pendingStore),
    mcp: new MCPSyncer(),
    post,
    openBesidePanel: () => view.openBesidePanel()
  };
  const applySettings = () => {
    const settings = vscode.workspace.getConfiguration('agent-hub');
    hub.chat.idleTimeoutMs = Math.max(0, settings.get<number>('turnIdleTimeoutMinutes', 30)) * 60_000;
    hub.chat.maxConcurrent = Math.max(0, settings.get<number>('maxConcurrentAgents', 3));
    hub.chat.verify = settings.get<boolean>('verifyAfterDeveloper', true) ? runProjectTests : undefined;
  };
  applySettings();
  hub.chat.markInterrupted();
  view.connect(hub);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agent-hub.openBeside';
  statusBar.text = '$(circuit-board) AgentHub';
  statusBar.tooltip = 'Abrir AgentHub a la derecha';
  statusBar.show();

  /** Muestra el panel y deja el cursor en el composer. */
  const focusComposer = async () => {
    await vscode.commands.executeCommand('agent-hub.dashboardView.focus');
    post({ type: 'focusComposer' });
  };

  context.subscriptions.push(
    statusBar,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('agent-hub')) applySettings();
    }),
    vscode.commands.registerCommand('agent-hub.focusComposer', focusComposer),
    vscode.commands.registerCommand('agent-hub.newSession', async () => {
      const current = hub.sessions.getActive();
      const folder = workspaceDir();
      hub.sessions.create({
        profileId: current.profileId,
        modelId: current.modelId,
        effort: current.effort,
        projectName: current.projectName,
        projectPath: current.projectPath || folder
      });
      hub.chat.publishSessions();
      await focusComposer();
    }),
    vscode.commands.registerCommand('agent-hub.stopTurn', () => hub.chat.cancel(hub.sessions.getActive().id)),
    vscode.commands.registerCommand('agent-hub.nextAgent', () => {
      const all = hub.sessions.list();
      const next = all[(all.findIndex((candidate) => candidate.id === hub.sessions.getActive().id) + 1) % all.length];
      hub.sessions.setActive(next.id);
      hub.chat.markSeen(next.id);
      hub.chat.publishSessions();
    }),
    registerProposalProvider(),
    vscode.window.registerWebviewViewProvider('agent-hub.dashboardView', view, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerWebviewViewProvider('agent-hub.dashboardViewExplorer', view, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('agent-hub.openDashboard', () =>
      vscode.commands.executeCommand('agent-hub.dashboardView.focus')
    ),
    vscode.commands.registerCommand('agent-hub.openBeside', () => view.openBesidePanel()),
    vscode.commands.registerCommand('agent-hub.addAccount', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Claude', provider: 'claude' as ProviderType },
          { label: 'Antigravity', provider: 'google' as ProviderType }
        ],
        { placeHolder: 'Proveedor de la nueva cuenta' }
      );
      if (choice) await addAccount(hub, choice.provider);
    }),
    vscode.commands.registerCommand('agent-hub.syncMCPs', async () => {
      const result = await hub.mcp.syncMCPs();
      const notify = result.success ? vscode.window.showInformationMessage : vscode.window.showErrorMessage;
      void notify(result.message);
    }),
    vscode.commands.registerCommand('agent-hub.explainSelection', () =>
      sendSelectionToAgent(hub, 'explorador', 'Explica qué hace este código, sus dependencias y posibles riesgos.')
    ),
    vscode.commands.registerCommand('agent-hub.testSelection', () =>
      sendSelectionToAgent(hub, 'tester', 'Escribe pruebas automatizadas para esta selección.')
    ),
    vscode.commands.registerCommand('agent-hub.auditSelection', () =>
      sendSelectionToAgent(hub, 'revisor', 'Audita este código: seguridad, rendimiento y calidad de diseño.')
    ),
    vscode.commands.registerCommand('agent-hub.autoDebugTerminal', async () => {
      const activeSession = hub.sessions.getActive();
      const terminal = vscode.window.activeTerminal;
      hub.openBesidePanel();
      void hub.chat.send({
        sessionId: activeSession.id,
        prompt: `Analiza el estado de la terminal activa (${terminal?.name ?? 'terminal'}) e identifica posibles errores o fallos recientes.`,
        role: 'desarrollador',
        workspaceDir: workspaceDirForSession(hub, activeSession.id)
      });
    }),
    {
      dispose: () => {
        for (const sessionId of hub.chat.runningSessionIds()) hub.chat.cancel(sessionId);
        processPool.dispose();
        sessions.flush();
        telemetry.flush();
      }
    }
  );

  if ('onDidEndTerminalShellExecution' in (vscode.window as any)) {
    context.subscriptions.push(
      (vscode.window as any).onDidEndTerminalShellExecution(async (event: any) => {
        if (event.exitCode !== undefined && event.exitCode !== 0) {
          const commandLine = event.execution?.commandLine?.value;
          if (!commandLine || commandLine.startsWith('git status') || commandLine.startsWith('clear')) return;
          const choice = await vscode.window.showWarningMessage(
            `El comando "${commandLine.slice(0, 50)}" falló (código ${event.exitCode}). ¿Depurar con AgentHub?`,
            'Auto-Debug',
            'Ignorar'
          );
          if (choice === 'Auto-Debug') {
            const activeSession = hub.sessions.getActive();
            hub.openBesidePanel();
            void hub.chat.send({
              sessionId: activeSession.id,
              prompt: `El comando en la terminal falló con código ${event.exitCode}:\n\`\`\`bash\n${commandLine}\n\`\`\`\nAnaliza la causa del fallo y propón la solución.`,
              role: 'desarrollador',
              workspaceDir: workspaceDirForSession(hub, activeSession.id)
            });
          }
        }
      })
    );
  }
}

export function deactivate(): void {}
