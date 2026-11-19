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
  compact?: boolean;
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
    <div role="alert" className="shrink-0 flex items-center gap-2.5 p-3 rounded-xl border border-amber-500/40 bg-[#0a0e17] text-xs text-slate-200 shadow-md">
      <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-500/40 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
      </div>
      <span className="flex-1 min-w-0 font-medium">{text}</span>
      <button
        type="button"
        onClick={action}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-semibold transition shrink-0 cursor-pointer shadow-md shadow-cyan-600/30"
      >
        {account ? <LogIn className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </button>
    </div>
  );
};

type OpenModal = 'none' | 'accounts' | 'models' | 'add';

export const ModelAccountBar: React.FC<Props> = ({ sessionId, accounts, selection, compact = false }) => {
  const [openModal, setOpenModal] = useState<OpenModal>('none');
  const { account, model } = selection;
  const close = () => setOpenModal('none');

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={() => setOpenModal('accounts')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] hover:border-cyan-500/40 transition text-left shrink-0 cursor-pointer shadow-xs"
          title={account ? `Cambiar cuenta (actual: ${account.name})` : 'Seleccionar cuenta'}
        >
          {account && <ProviderBadge provider={account.provider} />}
          <span className="font-semibold text-slate-200 truncate max-w-[100px] text-[11px] font-mono">
            {account?.name ?? 'Cuenta'}
          </span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('models')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 text-left transition shrink-0 cursor-pointer group shadow-xs"
          title={model ? `Cambiar modelo (actual: ${model.label})` : 'Abrir catálogo de modelos'}
        >
          {model && <ModelFamilyIcon family={familyOf(model.id)} />}
          <span className="font-semibold text-slate-100 truncate max-w-[130px] text-[11px] group-hover:text-white font-mono">
            {model?.label ?? 'Modelo'}
          </span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-400 group-hover:text-cyan-300 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('add')}
          className="p-1 rounded-lg bg-[#0c1220] hover:bg-[#162035] border border-[#202b3f] text-slate-400 hover:text-cyan-300 shrink-0 cursor-pointer hidden min-[480px]:inline-flex transition"
          title="Vincular nueva cuenta"
          aria-label="Vincular nueva cuenta"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>

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
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0c1220] border border-[#202b3f] text-xs shadow-sm">
        <button
          type="button"
          onClick={() => setOpenModal('accounts')}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#07090e] hover:bg-[#162035] border border-[#202b3f] hover:border-cyan-500/40 transition text-left min-w-0 max-w-[48%] cursor-pointer"
          title="Cambiar de cuenta o suscripción"
        >
          {account && <ProviderBadge provider={account.provider} />}
          <div className="truncate min-w-0">
            <div className="font-bold text-slate-100 truncate text-[11px] leading-tight font-mono">{account?.name ?? 'Buscando cuentas…'}</div>
            <div className="text-[10px] text-slate-400 font-mono truncate leading-tight mt-0.5">
              {account?.email || account?.subscriptionType || (account?.status === 'connected' ? 'Conectado' : 'Sin sesión')}
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-slate-400 ml-auto shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('models')}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/30 hover:bg-cyan-950/50 border border-cyan-500/40 text-left transition group cursor-pointer"
          title="Abrir catálogo de modelos"
        >
          <div className="flex items-center gap-2 truncate">
            {model && <ModelFamilyIcon family={familyOf(model.id)} />}
            <div className="font-medium text-slate-100 text-[11px] flex items-center gap-1.5 truncate">
              <span className="truncate font-semibold font-mono">{model?.label ?? 'Cargando…'}</span>
              {account && (
                <span className="hidden sm:inline text-[10px] px-1.5 py-0.2 rounded bg-[#07090e] text-cyan-300 font-mono border border-cyan-500/20 shrink-0">
                  {PROVIDER_ROUTE_LABELS[account.provider]}
                </span>
              )}
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-cyan-300 transition shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('add')}
          className="hidden min-[420px]:flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#07090e] hover:bg-[#162035] text-slate-200 border border-[#202b3f] hover:border-cyan-500/50 transition shrink-0 cursor-pointer font-mono"
          aria-label="Vincular otra cuenta"
          title="Vincular otra cuenta"
        >
          <Plus className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline font-medium">Vincular</span>
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
