import React, { useMemo, useState } from 'react';
import { BrainCircuit, Check, Cpu, Flame, Search, Sliders, Zap } from 'lucide-react';
import { ModelSelection } from '../../../shared/model-selection';
import { AccountProfile, ModelOption, ProviderType } from '../../../shared/types';
import { ModalShell } from '../ModalShell';

export type ModelFamily = 'argon' | 'flash' | 'opus' | 'sonnet' | 'haiku' | 'other';

export const PROVIDER_ROUTE_LABELS: Record<ProviderType, string> = {
  claude: 'Claude CLI',
  google: 'Antigravity',
  copilot: 'Copilot',
  ollama: 'Ollama'
};

const FAMILY_FILTERS: Array<{ id: ModelFamily | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'argon', label: 'Argon' },
  { id: 'flash', label: 'Flash' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
  { id: 'other', label: 'Otros' }
];

export function familyOf(modelId: string): ModelFamily {
  const families: ModelFamily[] = ['argon', 'flash', 'opus', 'sonnet', 'haiku'];
  return families.find((family) => modelId.includes(family)) ?? 'other';
}

export const ModelFamilyIcon: React.FC<{ family: ModelFamily }> = ({ family }) => {
  if (family === 'argon') return <BrainCircuit className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
  if (family === 'flash') return <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  if (family === 'opus') return <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
  return <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
};

interface CatalogEntry {
  account: AccountProfile;
  model: ModelOption;
}

/** Cada modelo se ofrece por la cuenta activa o por la primera conectada de su proveedor. */
function buildCatalog(accounts: AccountProfile[], activeAccount?: AccountProfile): CatalogEntry[] {
  const accountByProvider = new Map<ProviderType, AccountProfile>();
  for (const account of accounts) {
    const isActive = account.id === activeAccount?.id;
    if (isActive || (account.status === 'connected' && !accountByProvider.has(account.provider))) {
      accountByProvider.set(account.provider, account);
    }
  }
  return [...accountByProvider.values()].flatMap((account) => account.models.map((model) => ({ account, model })));
}

interface Props {
  accounts: AccountProfile[];
  selection: ModelSelection;
  onClose: () => void;
  onSelect: (profileId: string, modelId: string) => void;
}

export const ModelCatalogModal: React.FC<Props> = ({ accounts, selection, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<ModelFamily | 'all'>('all');

  const entries = useMemo(() => {
    const normalized = query.toLowerCase();
    return buildCatalog(accounts, selection.account).filter(
      ({ model }) =>
        (familyFilter === 'all' || familyOf(model.id) === familyFilter) &&
        (model.label.toLowerCase().includes(normalized) || model.id.toLowerCase().includes(normalized))
    );
  }, [accounts, selection.account, query, familyFilter]);

  return (
    <ModalShell
      title="Catálogo de modelos"
      icon={<Sliders className="w-4 h-4 text-indigo-400" />}
      widthClass="max-w-xl"
      onClose={onClose}
    >
      <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-900 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar modelo (argon, flash, opus, sonnet)..."
            aria-label="Buscar modelo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            className="w-full bg-zinc-950 border border-zinc-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {FAMILY_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setFamilyFilter(filter.id)}
              className={`px-2 py-0.5 rounded-full border transition shrink-0 ${
                familyFilter === filter.id
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-medium'
                  : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {entries.length === 0 && (
          <div className="text-center py-8 text-zinc-400 text-xs">No se encontraron modelos.</div>
        )}
        {entries.map(({ account, model }) => {
          const isSelected = account.id === selection.account?.id && model.id === selection.model?.id;
          return (
            <button
              key={`${account.id}:${model.id}`}
              type="button"
              onClick={() => onSelect(account.id, model.id)}
              className={`w-full p-2 rounded-lg text-left transition flex items-center justify-between gap-3 border ${
                isSelected
                  ? 'bg-indigo-950/40 border-indigo-500/50 text-zinc-100'
                  : 'hover:bg-zinc-800/60 text-zinc-300 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ModelFamilyIcon family={familyOf(model.id)} />
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-zinc-100 truncate">{model.label}</div>
                  <div className="text-[11px] text-zinc-400 font-mono truncate">
                    {model.id} • Vía <span className="text-zinc-300">{PROVIDER_ROUTE_LABELS[account.provider]}</span>
                  </div>
                </div>
              </div>
              {isSelected ? (
                <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </span>
              ) : (
                <span className="hidden min-[420px]:inline text-[11px] text-zinc-400 shrink-0 font-mono">Elegir →</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-2 border-t border-zinc-800 bg-zinc-950/60 text-[11px] text-zinc-400 px-3">
        Total de modelos listados: <strong>{entries.length}</strong>
      </div>
    </ModalShell>
  );
};
