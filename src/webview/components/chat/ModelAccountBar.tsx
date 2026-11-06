import React, { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
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
