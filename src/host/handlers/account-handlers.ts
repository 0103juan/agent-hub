import * as vscode from 'vscode';
import { ProviderType } from '../../shared/types';
import { HubContext } from '../hub-context';
import { HandlerMap } from './handler-types';

const LOGIN_REFRESH_DELAY_MS = 2000;

/** Se publican por separado: las cuentas no deben esperar a `agy mcp list`. */
export async function publishAccountsAndMcps(hub: HubContext, forceRefresh = false): Promise<void> {
  await Promise.all([
    hub.providers.listAccounts(forceRefresh).then((accounts) => hub.post({ type: 'state', patch: { accounts } })),
    hub.mcp.getMCPList().then((mcps) => hub.post({ type: 'state', patch: { mcps } }))
  ]);
}

export async function addAccount(hub: HubContext, provider: ProviderType, knownLabel?: string): Promise<void> {
  const label = knownLabel ?? await vscode.window.showInputBox({
    title: 'Vincular cuenta',
    prompt: 'Nombre para esta cuenta (ej: Trabajo, Personal 2)'
  });
  if (!label) return;
  hub.providers.get(provider).addAccount(label);
  setTimeout(() => void publishAccountsAndMcps(hub, true), LOGIN_REFRESH_DELAY_MS);
}

export function accountHandlers(hub: HubContext): HandlerMap<'refreshAccounts' | 'loginAccount' | 'logoutAccount' | 'addAccount' | 'clearTelemetry' | 'togglePortfolioMcp' | 'syncMcps' | 'checkMcpHealth'> {
  return {
    refreshAccounts: () => publishAccountsAndMcps(hub, true),

    loginAccount: async ({ profileId }) => {
      const account = (await hub.providers.listAccounts()).find((candidate) => candidate.id === profileId);
      if (account) hub.providers.get(account.provider).openLogin(account);
    },

    logoutAccount: async ({ profileId }) => {
      const account = (await hub.providers.listAccounts()).find((candidate) => candidate.id === profileId);
      if (!account) return;
      const provider = hub.providers.get(account.provider);
      const warning = provider.describeLogout(account);
      if (warning) {
        const confirmation = 'Cerrar sesión';
        const choice = await vscode.window.showWarningMessage(warning, { modal: true }, confirmation);
        if (choice !== confirmation) return;
      }
      await provider.logout(account);
      await publishAccountsAndMcps(hub, true);
    },

    addAccount: ({ provider, label }) => addAccount(hub, provider, label),

    clearTelemetry: () => {
      hub.telemetry.clear();
      hub.post({ type: 'state', patch: { telemetry: {} } });
    },

    togglePortfolioMcp: async ({ mcpName, enable }) => {
      await hub.mcp.togglePortfolioMCP(mcpName, enable);
      hub.post({ type: 'state', patch: { mcps: await hub.mcp.getMCPList() } });
    },

    checkMcpHealth: async ({ mcpId }) => {
      const mcps = await hub.mcp.getMCPList();
      const server = mcps.find((s) => s.id === mcpId);
      if (!server) return;
      const isOk = await hub.mcp.checkHealth(server);
      server.status = isOk ? 'connected' : 'disconnected';
      server.healthMessage = isOk ? 'Servidor activo y respondiendo' : 'No responde o comando no encontrado';
      hub.post({ type: 'state', patch: { mcps } });
      void vscode.window.showInformationMessage(`${server.name}: ${server.healthMessage}`);
    },

    syncMcps: async () => {
      const result = await hub.mcp.syncMCPs();
      hub.post({ type: 'state', patch: { mcps: await hub.mcp.getMCPList() } });
      const notify = result.success ? vscode.window.showInformationMessage : vscode.window.showErrorMessage;
      void notify(result.message);
    }
  };
}
