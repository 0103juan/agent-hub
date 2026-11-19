import React, { useMemo, useState } from 'react';
import { Atom, BrainCircuit, Check, Cpu, Flame, Search, Sliders, Sparkles, Star, Zap } from 'lucide-react';
import { ModelSelection } from '../../../shared/model-selection';
import { AccountProfile, ModelOption, ProviderType } from '../../../shared/types';
import { ModalShell } from '../ModalShell';
import { normalizeText } from '../../../shared/workspace-actions';

const FAVORITE_MODELS_KEY = 'agent-hub.favoriteModels';
/** El favorito es por ruta: el mismo modelo por la CLI de Claude y por Antigravity son dos entradas. */
const favoriteKey = (account: AccountProfile, model: ModelOption) => `${account.provider}:${model.id}`;

export type ModelFamily = 'argon' | 'neon' | 'hydrogen' | 'flash' | 'opus' | 'sonnet' | 'haiku' | 'other';

export const PROVIDER_ROUTE_LABELS: Record<ProviderType, string> = {
  claude: 'Claude CLI',
  google: 'Antigravity',
  copilot: 'Copilot',
  ollama: 'Ollama'
};

const FAMILY_FILTERS: Array<{ id: ModelFamily | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'argon', label: 'Argon' },
  { id: 'neon', label: 'Neon' },
  { id: 'hydrogen', label: 'Hydrogen' },
  { id: 'flash', label: 'Flash' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
  { id: 'other', label: 'Otros' }
];

export function familyOf(modelId: string): ModelFamily {
  const normalized = modelId.toLowerCase();
  const families: ModelFamily[] = ['argon', 'neon', 'hydrogen', 'flash', 'opus', 'sonnet', 'haiku'];
  return families.find((family) => normalized.includes(family)) ?? 'other';
}

export const ModelFamilyIcon: React.FC<{ family: ModelFamily }> = ({ family }) => {
  if (family === 'argon') return <BrainCircuit className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
  if (family === 'neon') return <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
  if (family === 'hydrogen') return <Atom className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  if (family === 'flash') return <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  if (family === 'opus') return <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
  return <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
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
  const [providerFilter, setProviderFilter] = useState<ProviderType | 'all'>('all');
  const [cursor, setCursor] = useState(0);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITE_MODELS_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const toggleFavorite = (modelId: string) =>
    setFavorites((current) => {
      const next = current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId];
      try {
        localStorage.setItem(FAVORITE_MODELS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const entries = useMemo(() => {
    const normalized = normalizeText(query);
    return buildCatalog(accounts, selection.account)
      .filter(
        ({ account, model }) =>
          (familyFilter === 'all' || familyOf(model.id) === familyFilter) &&
          (providerFilter === 'all' || account.provider === providerFilter) &&
          (normalizeText(model.label).includes(normalized) || normalizeText(model.id).includes(normalized))
      )
      .sort((a, b) => Number(favorites.includes(favoriteKey(b.account, b.model))) - Number(favorites.includes(favoriteKey(a.account, a.model))));
  }, [accounts, selection.account, query, familyFilter, providerFilter, favorites]);
  const providers = [...new Set(buildCatalog(accounts, selection.account).map(({ account }) => account.provider))];
  const active = Math.min(cursor, Math.max(0, entries.length - 1));

  return (
    <ModalShell
      title="Catálogo de modelos"
      icon={<Sliders className="w-4 h-4 text-cyan-400" />}
      widthClass="max-w-xl"
      onClose={onClose}
    >
      <div className="p-3 border-b border-[#202b3f] bg-[#07090e] space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar modelo (argon, neon, hydrogen, flash, opus, sonnet)..."
            aria-label="Buscar modelo"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor(Math.min(active + 1, entries.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor(Math.max(active - 1, 0));
              } else if (event.key === 'Enter' && entries[active]) {
                onSelect(entries[active].account.id, entries[active].model.id);
              }
            }}
            autoFocus
            className="w-full bg-[#0a0e17] border border-[#202b3f] focus:border-cyan-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
        </div>
        {providers.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500 font-mono text-[10px] uppercase">Vía:</span>
            {(['all', ...providers] as Array<ProviderType | 'all'>).map((provider) => (
              <button
                key={provider}
                type="button"
                aria-pressed={providerFilter === provider}
                onClick={() => setProviderFilter(provider)}
                className={`px-2.5 py-0.5 rounded-full border transition shrink-0 cursor-pointer text-[10.5px] ${
                  providerFilter === provider
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.25)] font-bold'
                    : 'bg-[#0c1220] hover:bg-[#162035] text-slate-400 border-[#202b3f]'
                }`}
              >
                {provider === 'all' ? 'Todas' : PROVIDER_ROUTE_LABELS[provider]}
              </button>
            ))}
            <span className="ml-auto font-mono text-[10px] text-slate-500">{entries.length} modelos · ↑↓ ⏎</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-500 font-mono text-[10px] uppercase">Familia:</span>
          {FAMILY_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setFamilyFilter(filter.id)}
              className={`px-2.5 py-0.5 rounded-md border transition shrink-0 cursor-pointer text-[10.5px] ${
                familyFilter === filter.id
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.25)] font-bold'
                  : 'bg-[#0c1220] hover:bg-[#162035] text-slate-400 border-[#202b3f]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 max-h-80 bg-[#0a0e17]">
        {entries.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs font-mono">No se encontraron modelos.</div>
        )}
        {entries.map(({ account, model }, index) => {
          const isSelected = account.id === selection.account?.id && model.id === selection.model?.id;
          return (
            <button
              key={`${account.id}:${model.id}`}
              type="button"
              onClick={() => onSelect(account.id, model.id)}
              className={`w-full p-2.5 rounded-xl text-left transition flex items-center justify-between gap-3 border cursor-pointer ${
                index === active ? 'ring-1 ring-cyan-400/60 ' : ''
              }${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-100 font-semibold ring-1 ring-cyan-500/30'
                  : 'bg-[#07090e] hover:bg-[#162035] text-slate-300 border-[#202b3f]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ModelFamilyIcon family={familyOf(model.id)} />
                <span
                  role="button"
                  aria-pressed={favorites.includes(favoriteKey(account, model))}
                  aria-label={favorites.includes(favoriteKey(account, model)) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                  title={favorites.includes(favoriteKey(account, model)) ? 'Quitar de favoritos' : 'Añadir a favoritos (sube al principio)'}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavorite(favoriteKey(account, model));
                  }}
                  className="shrink-0 text-slate-500 hover:text-amber-300 p-0.5 cursor-pointer"
                >
                  <Star className={`w-3.5 h-3.5 ${favorites.includes(favoriteKey(account, model)) ? 'text-amber-400 fill-amber-400' : ''}`} />
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-xs text-slate-100 truncate flex items-center gap-2">
                    <span>{model.label}</span>
                    {isSelected && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        ACTIVO
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    {model.id} • Vía <span className="text-slate-200">{PROVIDER_ROUTE_LABELS[account.provider]}</span>
                  </div>
                </div>
              </div>
              {isSelected ? (
                <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </span>
              ) : (
                <span className="hidden min-[420px]:inline text-[11px] text-slate-500 shrink-0 font-mono">Elegir →</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-[#202b3f] bg-[#07090e] text-[11px] text-slate-400 px-3 flex items-center justify-between font-mono">
        <span>Total de modelos: <strong>{entries.length}</strong></span>
        <span className="text-slate-500">Navega con flechas y Enter</span>
      </div>
    </ModalShell>
  );
};
