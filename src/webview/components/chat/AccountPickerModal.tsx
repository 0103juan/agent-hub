import React from 'react';
import { Bot, CheckCircle2, LogIn, Plus } from 'lucide-react';
import { AccountProfile } from '../../../shared/types';
import { postToHost } from '../../vscode-api';
import { ModalShell } from '../ModalShell';

interface Props {
  accounts: AccountProfile[];
  activeAccountId?: string;
  onClose: () => void;
  onSelect: (profileId: string) => void;
  onAddAccount: () => void;
}

export const AccountPickerModal: React.FC<Props> = ({ accounts, activeAccountId, onClose, onSelect, onAddAccount }) => (
  <ModalShell title="Cuentas y suscripciones" icon={<Bot className="w-4 h-4 text-indigo-400" />} onClose={onClose}>
    <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto">
      {accounts.map((account) => {
        const isConnected = account.status === 'connected';
        return (
          <div
            key={account.id}
            className={`flex items-center justify-between rounded-lg text-xs transition border ${
              account.id === activeAccountId
                ? 'bg-zinc-800 text-white font-medium border-indigo-500/40'
                : 'hover:bg-zinc-800/50 text-zinc-300 border-zinc-800/60'
            }`}
          >
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => onSelect(account.id)}
              className="flex-1 min-w-0 flex flex-col p-2 text-left truncate disabled:cursor-default"
            >
              <span className="flex items-center gap-1.5 truncate">
                <span className="font-medium truncate">{account.name}</span>
                {account.subscriptionType && (
                  <span className="text-[11px] px-1 rounded bg-zinc-800 text-emerald-400 border border-zinc-700 uppercase font-mono">
                    {account.subscriptionType}
                  </span>
                )}
              </span>
              {account.email && <span className="text-[11px] text-zinc-400 font-mono truncate">{account.email}</span>}
            </button>

            {isConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mr-2" />
            ) : (
              <button
                type="button"
                onClick={() => postToHost({ command: 'loginAccount', profileId: account.id })}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 mr-2 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 shrink-0"
              >
                <LogIn className="w-2.5 h-2.5" />
                <span>Iniciar sesión</span>
              </button>
            )}
          </div>
        );
      })}
    </div>

    <div className="p-2.5 border-t border-zinc-800 bg-zinc-950/60">
      <button
        type="button"
        onClick={onAddAccount}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition shadow"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Vincular nueva cuenta</span>
      </button>
    </div>
  </ModalShell>
);
