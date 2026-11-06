import { randomBytes } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { formatBuildStamp, newestBuildMs } from './build-info';

export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.js'));
  const nonce = randomBytes(16).toString('hex');
  const buildStamp = formatBuildStamp(newestBuildMs(path.join(extensionUri.fsPath, 'dist')));
  // El webview no puede llamar a asWebviewUri: recibe las bases para resolver imágenes locales.
  const filesBase = webview.asWebviewUri(vscode.Uri.file('/')).toString();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceBase = workspaceFolder ? webview.asWebviewUri(workspaceFolder.uri).toString() : '';
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} https: data:`,
    'media-src data:',
    `font-src ${webview.cspSource}`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="agent-hub-files" content="${filesBase}" />
    <meta name="agent-hub-workspace" content="${workspaceBase}" />
    <meta name="agent-hub-build" content="${buildStamp}" />
    <title>AgentHub</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
