import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { resolveSelection } from '../../shared/model-selection';
import { AccountProfile, ConversationSession, ProviderType } from '../../shared/types';
import { postToHost } from '../vscode-api';
import { AddAccountModal } from './AddAccountModal';
import { ProfileCard } from './ProfileCard';

const PROVIDER_SECTIONS: Array<{ provider: ProviderType; title: string; note?: string }> = [
  { provider: 'claude', title: 'Claude' },
  {
    provider: 'google',
    title: 'Antigravity',
    note: 'Comparten un solo inicio de sesión; las cuentas adicionales son etiquetas.'
  },
  { provider: 'copilot', title: 'GitHub Copilot' }
];

interface Props {
  accounts: AccountProfile[];
  session?: ConversationSession;
}

export const AccountsView: React.FC<Props> = ({ accounts, session }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const connected = accounts.filter((account) => account.status === 'connected').length;
  const activeAccount = session ? resolveSelection(session, accounts).account : undefined;

  return (
    <div className="space-y-3 w-full max-w-3xl min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold text-zinc-200">Cuentas ({accounts.length})</h2>
          <p className="text-[11px] text-zinc-400">
            Suscripciones usadas por las CLIs · <span className={connected === accounts.length ? 'text-emerald-400' : 'text-amber-300'}>{connected} de {accounts.length} conectadas</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => postToHost({ command: 'refreshAccounts' })}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 shrink-0"
          title="Volver a consultar el estado de las cuentas"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden min-[420px]:inline">Refrescar</span>
        </button>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Vincular cuenta</span>
        </button>
        </div>
      </div>

      {PROVIDER_SECTIONS.map(({ provider, title, note }) => {
        const sectionAccounts = accounts
          .filter((account) => account.provider === provider)
          .sort((a, b) => Number(b.status === 'connected') - Number(a.status === 'connected'));
        if (sectionAccounts.length === 0) return null;
        return (
          <section key={provider} className="space-y-1.5">
            <div>
              <button
                type="button"
                aria-expanded={!collapsed[provider]}
                onClick={() => setCollapsed((current) => ({ ...current, [provider]: !current[provider] }))}
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300 hover:text-zinc-100"
              >
                {collapsed[provider] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {title} <span className="font-mono text-zinc-500">({sectionAccounts.length})</span>
              </button>
              {note && !collapsed[provider] && <p className="text-[11px] text-zinc-400">{note}</p>}
            </div>
            {!collapsed[provider] && sectionAccounts.map((account) => (
              <ProfileCard
                key={account.id}
                profile={account}
                isActive={account.id === activeAccount?.id}
                onSelect={() => session && postToHost({ command: 'updateSession', sessionId: session.id, patch: { profileId: account.id } })}
                onLogin={() => postToHost({ command: 'loginAccount', profileId: account.id })}
                onLogout={() => postToHost({ command: 'logoutAccount', profileId: account.id })}
              />
            ))}
          </section>
        );
      })}

      {isAdding && <AddAccountModal onClose={() => setIsAdding(false)} />}

      <p className="pt-1 text-[10px] text-zinc-500" title="Fecha de la compilación que cargó este panel. Si es vieja, recarga la ventana.">
        Compilación: {document.querySelector<HTMLMetaElement>('meta[name="agent-hub-build"]')?.content || 'desconocida'}
      </p>
    </div>
  );
};
