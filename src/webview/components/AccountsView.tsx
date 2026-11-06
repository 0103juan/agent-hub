import React, { useState } from 'react';
import { Plus } from 'lucide-react';
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
  const activeAccount = session ? resolveSelection(session, accounts).account : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold text-zinc-200">Cuentas ({accounts.length})</h2>
          <p className="text-[11px] text-zinc-400">Suscripciones usadas por las CLIs</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Vincular cuenta</span>
        </button>
      </div>

      {PROVIDER_SECTIONS.map(({ provider, title, note }) => {
        const sectionAccounts = accounts.filter((account) => account.provider === provider);
        if (sectionAccounts.length === 0) return null;
        return (
          <section key={provider} className="space-y-1.5">
            <div>
              <h3 className="text-[11px] font-semibold text-zinc-300">{title}</h3>
              {note && <p className="text-[11px] text-zinc-400">{note}</p>}
            </div>
            {sectionAccounts.map((account) => (
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
    </div>
  );
};
