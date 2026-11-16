import React, { useState } from 'react';
import { AccountProfile } from '../../shared/types';
import { Check, CheckCircle2, Copy, LogIn, LogOut } from 'lucide-react';
import { ProviderBadge } from './ProviderBadge';

interface Props {
  profile: AccountProfile;
  isActive: boolean;
  onSelect: () => void;
  onLogin: () => void;
  onLogout: () => void;
}

export const ProfileCard: React.FC<Props> = ({ profile, isActive, onSelect, onLogin, onLogout }) => {
  const isConnected = profile.status === 'connected';
  const [copied, setCopied] = useState(false);
  const copyEmail = async () => {
    if (!profile.email) return;
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      className={`hub-lift p-2.5 rounded-lg border ${
        isActive
          ? 'bg-zinc-800/90 border-indigo-500 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!isConnected}
          aria-pressed={isActive}
          onClick={onSelect}
          className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-default"
        >
          <ProviderBadge provider={profile.provider} />

          <span className="block min-w-0">
            <span className="font-medium text-xs text-zinc-100 flex items-center gap-1.5">
              <span className="truncate">{profile.name}</span>
              {isActive && (
                <span className="text-[11px] px-1.5 py-px rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold shrink-0">
                  ACTIVO
                </span>
              )}
            </span>
            {profile.email ? (
              <span className="block text-[11px] font-mono text-emerald-400 font-medium truncate" title={profile.email}>
                {profile.email}
              </span>
            ) : (
              <span className="block text-[11px] text-zinc-400 truncate">
                {isConnected ? `${profile.models[0]?.label || 'Listo'}${profile.models.length > 1 ? ` · ${profile.models.length} modelos` : ''}` : 'No autenticado'}
              </span>
            )}
          </span>
        </button>

        <div className="shrink-0">
          {isConnected ? (
            <div className="flex items-center gap-1">
              {profile.subscriptionType && (
                <span className="text-[11px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {profile.subscriptionType}
                </span>
              )}
              {profile.email && (
                <button
                  type="button"
                  aria-label={`Copiar el correo de ${profile.name}`}
                  title="Copiar el correo"
                  onClick={copyEmail}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <button
                type="button"
                aria-label={`Cerrar sesión de ${profile.name}`}
                title="Cerrar sesión"
                onClick={onLogout}
                className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
            >
              <LogIn className="w-3 h-3 text-amber-400" />
              <span>Iniciar sesión</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
