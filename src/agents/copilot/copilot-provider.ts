import * as vscode from 'vscode';
import { AccountProfile, ProviderType } from '../../shared/types';
import { AgentEvent, AgentProvider, AgentRun, AgentTurnRequest, TurnOutcome } from '../agent-provider';

/** Copilot corre dentro de VS Code por la Language Model API, sin CLI. */
export class CopilotProvider implements AgentProvider {
  public readonly type: ProviderType = 'copilot';

  public async discoverAccounts(): Promise<AccountProfile[]> {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) return [];
    return [
      {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        provider: 'copilot',
        status: 'connected',
        models: models.map((m) => ({ id: m.id, label: m.name || m.family, efforts: [] }))
      }
    ];
  }

  public startTurn(request: AgentTurnRequest, onEvent: (event: AgentEvent) => void): AgentRun {
    const cancellation = new vscode.CancellationTokenSource();
    return {
      outcome: this.streamResponse(request, onEvent, cancellation.token),
      cancel: () => cancellation.cancel()
    };
  }

  private async streamResponse(
    request: AgentTurnRequest,
    onEvent: (event: AgentEvent) => void,
    token: vscode.CancellationToken
  ): Promise<TurnOutcome> {
    try {
      const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', id: request.modelId });
      if (!model) return { status: 'failed', error: `Copilot ya no ofrece el modelo ${request.modelId}.` };

      const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(request.prompt)], {}, token);
      let outputChars = 0;
      for await (const text of response.text) {
        outputChars += text.length;
        onEvent({ kind: 'text', text });
      }
      // La API no reporta tokens: se estiman a 4 caracteres por token.
      onEvent({
        kind: 'usage',
        usage: { inputTokens: Math.round(request.prompt.length / 4), outputTokens: Math.round(outputChars / 4) }
      });
      return { status: 'completed' };
    } catch (error) {
      if (token.isCancellationRequested) return { status: 'cancelled' };
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  public openLogin(): void {
    void vscode.commands.executeCommand('workbench.action.chat.open');
  }

  public describeLogout(): undefined {
    return undefined;
  }

  public async logout(): Promise<void> {
    void vscode.window.showInformationMessage('Copilot usa tu cuenta de GitHub en VS Code: ciérrala desde el ícono de Cuentas de la barra de actividad.');
  }

  public addAccount(): void {
    void vscode.commands.executeCommand('workbench.action.chat.open');
  }
}
