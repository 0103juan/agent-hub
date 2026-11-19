import React from 'react';
import { Bot, CheckCircle2, LogIn, Plus } from 'lucide-react';
import { AccountProfile } from '../../../shared/types';
import { postToHost } from '../../vscode-api';
import { ModalShell } from '../ModalShell';
import { ProviderBadge } from '../ProviderBadge';

interface Props {
  accounts: AccountProfile[];
  activeAccountId?: string;
  onClose: () => void;
  onSelect: (profileId: string) => void;
  onAddAccount: () => void;
}

export const AccountPickerModal: React.FC<Props> = ({ accounts, activeAccountId, onClose, onSelect, onAddAccount }) => (
  <ModalShell title="Cuentas y suscripciones" icon={<Bot className="w-4 h-4 text-cyan-400" />} onClose={onClose}>
    <div className="p-3 space-y-2 max-h-80 overflow-y-auto bg-[#0a0e17]">
      {accounts.map((account) => {
        const isConnected = account.status === 'connected';
        const isActive = account.id === activeAccountId;
        return (
          <div
            key={account.id}
            className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition border ${
              isActive
                ? 'bg-cyan-950/40 text-cyan-100 font-semibold border-cyan-500/60 ring-1 ring-cyan-500/30'
                : isConnected
                ? 'bg-[#07090e] hover:bg-[#162035] text-slate-300 border-[#202b3f]'
                : 'bg-amber-950/15 border-amber-900/40 text-slate-400'
            }`}
          >
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => onSelect(account.id)}
              className="flex-1 min-w-0 flex items-center gap-2.5 text-left truncate disabled:cursor-default cursor-pointer"
            >
              <ProviderBadge provider={account.provider} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-xs truncate text-slate-100">{account.name}</span>
                  {isActive && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      ACTIVA
                    </span>
                  )}
                  {account.subscriptionType && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#07090e] text-emerald-400 border border-emerald-500/30 uppercase font-mono">
                      {account.subscriptionType}
                    </span>
                  )}
                </div>
                {account.email && <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{account.email}</div>}
              </div>
            </button>

            {isConnected ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
            ) : (
              <button
                type="button"
                onClick={() => postToHost({ command: 'loginAccount', profileId: account.id })}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 ml-2 rounded-lg bg-[#0c1220] hover:bg-[#202b3f] text-amber-300 border border-amber-500/30 shrink-0 cursor-pointer transition font-medium"
              >
                <LogIn className="w-3 h-3" />
                <span>Iniciar sesión</span>
              </button>
            )}
          </div>
        );
      })}
    </div>

    <div className="p-3 border-t border-[#202b3f] bg-[#07090e]">
      <button
        type="button"
        onClick={onAddAccount}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-md shadow-cyan-950/40"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Vincular nueva cuenta</span>
      </button>
    </div>
  </ModalShell>
);
