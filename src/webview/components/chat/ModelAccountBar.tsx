import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, LogIn, Plus } from 'lucide-react';
import { ModelSelection } from '../../../shared/model-selection';
import { AccountProfile } from '../../../shared/types';
import { postToHost } from '../../vscode-api';
import { AddAccountModal } from '../AddAccountModal';
import { ProviderBadge } from '../ProviderBadge';
import { AccountPickerModal } from './AccountPickerModal';
import { familyOf, ModelCatalogModal, ModelFamilyIcon, PROVIDER_ROUTE_LABELS } from './ModelCatalogModal';

interface Props {
  sessionId: string;
  accounts: AccountProfile[];
  selection: ModelSelection;
}

/** Aviso con el siguiente paso cuando no hay una cuenta conectada con la que chatear. */
export const AccountNotice: React.FC<{ accounts: AccountProfile[]; account?: AccountProfile }> = ({ accounts, account }) => {
  const anyConnected = accounts.some((a) => a.status === 'connected');
  const [text, label, action] = !account
    ? ['No hay cuentas vinculadas. Vincula una suscripción (y su CLI) para empezar a chatear.', 'Vincular Claude', () => postToHost({ command: 'addAccount', provider: 'claude' })] as const
    : !anyConnected
      ? [`Ninguna cuenta tiene sesión iniciada. Inicia sesión en ${account.name}; si el terminal dice que no encuentra el comando, instala su CLI primero.`, `Iniciar sesión en ${account.name}`, () => postToHost({ command: 'loginAccount', profileId: account.id })] as const
      : [`${account.name} está desconectada. Inicia sesión de nuevo o elige otra cuenta en la barra de arriba.`, 'Iniciar sesión', () => postToHost({ command: 'loginAccount', profileId: account.id })] as const;
  return (
    <div role="alert" className="shrink-0 flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/40 bg-zinc-900 text-xs text-zinc-300">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="flex-1 min-w-0">{text}</span>
      <button
        type="button"
        onClick={action}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shrink-0"
      >
        {account ? <LogIn className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        <span>{label}</span>
      </button>
    </div>
  );
};

type OpenModal = 'none' | 'accounts' | 'models' | 'add';

export const ModelAccountBar: React.FC<Props> = ({ sessionId, accounts, selection }) => {
  const [openModal, setOpenModal] = useState<OpenModal>('none');
  const { account, model } = selection;
  const close = () => setOpenModal('none');

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
        <button
          type="button"
          onClick={() => setOpenModal('accounts')}
          className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 transition text-left min-w-0 max-w-[48%]"
          title="Cambiar de cuenta o suscripción"
        >
          {account && <ProviderBadge provider={account.provider} />}
          <div className="truncate">
            <div className="font-semibold text-zinc-100 truncate text-[11px] leading-tight">{account?.name ?? 'Buscando cuentas…'}</div>
            <div className="text-[11px] text-zinc-400 font-mono truncate leading-tight">
              {account?.email || account?.subscriptionType || (account?.status === 'connected' ? 'Conectado' : 'Sin sesión')}
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-zinc-400 ml-auto shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('models')}
          className="flex-1 min-w-0 flex items-center justify-between gap-1.5 px-2.5 py-1 rounded bg-indigo-950/30 hover:bg-indigo-950/50 border border-indigo-700/40 text-left transition group"
          title="Abrir catálogo de modelos"
        >
          <div className="flex items-center gap-2 truncate">
            {model && <ModelFamilyIcon family={familyOf(model.id)} />}
            <div className="font-medium text-zinc-100 text-[11px] flex items-center gap-1.5 truncate">
              <span className="truncate">{model?.label ?? 'Cargando…'}</span>
              {account && (
                <span className="hidden sm:inline text-[11px] px-1 rounded bg-zinc-800 text-indigo-300 font-mono border border-indigo-500/20 shrink-0">
                  {PROVIDER_ROUTE_LABELS[account.provider]}
                </span>
              )}
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-indigo-300 transition shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('add')}
          className="hidden min-[420px]:flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition shrink-0"
          aria-label="Vincular otra cuenta"
          title="Vincular otra cuenta"
        >
          <Plus className="w-3 h-3 text-indigo-400" />
          <span className="hidden sm:inline">Vincular</span>
        </button>
      </div>

      {openModal === 'models' && (
        <ModelCatalogModal
          accounts={accounts}
          selection={selection}
          onClose={close}
          onSelect={(profileId, modelId) => {
            postToHost({ command: 'updateSession', sessionId, patch: { profileId, modelId } });
            close();
          }}
        />
      )}
      {openModal === 'accounts' && (
        <AccountPickerModal
          accounts={accounts}
          activeAccountId={account?.id}
          onClose={close}
          onAddAccount={() => setOpenModal('add')}
          onSelect={(profileId) => {
            postToHost({ command: 'updateSession', sessionId, patch: { profileId } });
            close();
          }}
        />
      )}
      {openModal === 'add' && <AddAccountModal onClose={close} />}
    </div>
  );
};
