import React, { useState } from 'react';
import { AccountProfile, ProviderType } from '../../orchestrator/types';
import { ChevronDown, Plus, Sparkles, Bot, LogIn, CheckCircle2, Globe } from 'lucide-react';

interface Props {
  profiles: AccountProfile[];
  activeProfileId: string;
  selectedModel: string;
  onSelectProfile: (profileId: string) => void;
  onSelectModel: (model: string) => void;
  onAddAccount: (provider: ProviderType, label: string) => void;
  onLogin: (profileId: string) => void;
}

export const ModelAccountSelector: React.FC<Props> = ({
  profiles,
  activeProfileId,
  selectedModel,
  onSelectProfile,
  onSelectModel,
  onAddAccount,
  onLogin
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('claude');
  const [accountLabel, setAccountLabel] = useState('');

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountLabel.trim()) return;
    onAddAccount(selectedProvider, accountLabel.trim());
    setAccountLabel('');
    setShowAddModal(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center justify-between hover:bg-zinc-800/60 p-1 rounded transition text-left"
        >
          <div className="flex items-center gap-2 truncate">
            {activeProfile?.provider === 'claude' && (
              <span className="w-5 h-5 rounded flex items-center justify-center bg-orange-600/20 text-orange-400 font-bold text-[10px]">
                C
              </span>
            )}
            {activeProfile?.provider === 'google' && (
              <span className="w-5 h-5 rounded flex items-center justify-center bg-blue-600/20 text-blue-400 font-bold text-[10px]">
                <Sparkles className="w-3 h-3" />
              </span>
            )}
            {activeProfile?.provider === 'openai' && (
              <span className="w-5 h-5 rounded flex items-center justify-center bg-emerald-600/20 text-emerald-400 font-bold text-[10px]">
                <Bot className="w-3 h-3" />
              </span>
            )}
            {activeProfile?.provider === 'copilot' && (
              <span className="w-5 h-5 rounded flex items-center justify-center bg-purple-600/20 text-purple-400 font-bold text-[10px]">
                GH
              </span>
            )}

            <div className="truncate">
              <div className="font-semibold text-zinc-100 truncate text-[11px] flex items-center gap-1.5">
                {activeProfile?.name}
                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {selectedModel || activeProfile?.activeModel || 'Auto'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                {activeProfile?.email ? (
                  <span className="font-mono text-emerald-400 font-medium">{activeProfile.email}</span>
                ) : (
                  <span>{activeProfile?.subscriptionType || 'Suscripción activa'}</span>
                )}
                {activeProfile?.subscriptionType && activeProfile.email && (
                  <span className="text-[9px] uppercase px-1 py-0.1 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {activeProfile.subscriptionType}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-1 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition"
          title="Vincular otra cuenta (Claude, Google o ChatGPT)"
        >
          <Plus className="w-3 h-3" />
          <span>Vincular Cuenta</span>
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-1.5 space-y-1 z-30 max-h-72 overflow-y-auto">
          <div className="text-[10px] font-semibold text-zinc-500 px-2 py-0.5 uppercase tracking-wider">
            Cuentas y Proveedores Disponibles
          </div>

          {profiles.map((profile) => (
            <div
              key={profile.id}
              onClick={() => {
                if (profile.status === 'connected') {
                  onSelectProfile(profile.id);
                  if (profile.activeModel) onSelectModel(profile.activeModel);
                  setIsOpen(false);
                }
              }}
              className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs transition ${
                profile.id === activeProfileId
                  ? 'bg-zinc-800 text-white font-medium border border-zinc-700'
                  : 'hover:bg-zinc-800/50 text-zinc-300'
              }`}
            >
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-medium truncate">{profile.name}</span>
                  {profile.subscriptionType && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-zinc-700 uppercase font-mono">
                      {profile.subscriptionType}
                    </span>
                  )}
                </div>
                {profile.email && (
                  <span className="text-[10px] text-zinc-400 font-mono truncate">
                    {profile.email}
                  </span>
                )}
              </div>

              {profile.status === 'connected' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLogin(profile.id);
                  }}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700"
                >
                  <LogIn className="w-2.5 h-2.5" />
                  <span>Login</span>
                </button>
              )}
            </div>
          ))}

          {/* Model selection if active profile has options */}
          {activeProfile?.availableModels && activeProfile.availableModels.length > 1 && (
            <div className="pt-2 border-t border-zinc-800">
              <div className="text-[10px] font-semibold text-zinc-500 px-2 py-0.5 uppercase tracking-wider">
                Variante de Modelo
              </div>
              <div className="grid grid-cols-1 gap-0.5 pt-0.5">
                {activeProfile.availableModels.map((m) => (
                  <div
                    key={m}
                    onClick={() => {
                      onSelectModel(m);
                      setIsOpen(false);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition ${
                      selectedModel === m ? 'bg-indigo-600/30 text-indigo-300' : 'hover:bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-full max-w-sm space-y-3 shadow-2xl">
            <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Vincular Nueva Cuenta / Suscripción</span>
            </h3>

            {/* Provider Selector */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setSelectedProvider('claude')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border transition ${
                  selectedProvider === 'claude'
                    ? 'bg-orange-600/20 text-orange-300 border-orange-500/50'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                Claude Pro
              </button>
              <button
                type="button"
                onClick={() => setSelectedProvider('google')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border transition ${
                  selectedProvider === 'google'
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                Google Gemini
              </button>
              <button
                type="button"
                onClick={() => setSelectedProvider('openai')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border transition ${
                  selectedProvider === 'openai'
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                ChatGPT Plus
              </button>
            </div>

            {selectedProvider === 'openai' ? (
              <div className="space-y-2 pt-1 text-[11px] text-zinc-300">
                <p>
                  Para usar tu suscripción de <strong>ChatGPT Plus / Pro</strong> sin pagar API keys:
                </p>
                <div className="p-2.5 bg-zinc-800/80 rounded border border-zinc-700 space-y-1.5">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Sesión Web de ChatGPT</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Abre ChatGPT Web con tu sesión iniciada directamente en tu navegador o panel de VS Code.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onLogin('chatgpt-plus-web');
                      setShowAddModal(false);
                    }}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition"
                  >
                    Abrir Sesión Web de ChatGPT
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddSubmit} className="space-y-3 pt-1">
                <p className="text-[11px] text-zinc-400">
                  Asigna una etiqueta para aislar esta cuenta (ej: Trabajo, Personal, Cliente B):
                </p>
                <input
                  type="text"
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  placeholder="Etiqueta (ej. Trabajo)"
                  className="w-full bg-zinc-800 text-zinc-100 text-xs rounded p-2 border border-zinc-700 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-2.5 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!accountLabel.trim()}
                    className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium shadow"
                  >
                    Crear y Autenticar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
