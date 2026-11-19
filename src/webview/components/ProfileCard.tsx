import React, { useState } from 'react';
import { AccountProfile } from '../../shared/types';
import { Check, CheckCircle2, Copy, LogIn, LogOut, Radio, Sparkles, AlertCircle } from 'lucide-react';
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
      className={`hub-card hub-lift p-3 sm:p-3.5 rounded-xl border transition relative space-y-2.5 ${
        isActive
          ? 'border-cyan-500/60 shadow-[0_0_18px_rgba(6,182,212,0.18)] ring-1 ring-cyan-500/40 bg-gradient-to-r from-cyan-950/30 via-[#0a0e17] to-[#0a0e17]'
          : isConnected
          ? 'border-[#202b3f] bg-[#0c1220]/90 hover:border-cyan-500/40 hover:bg-[#162035]/90'
          : 'border-amber-500/40 bg-amber-950/20 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ProviderBadge provider={profile.provider} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-slate-100 font-mono truncate">{profile.name}</span>
              {isActive && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold uppercase tracking-wider shrink-0">
                  ACTIVO EN ESTE CHAT
                </span>
              )}
              {profile.subscriptionType && (
                <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                  {profile.subscriptionType}
                </span>
              )}
              {!isConnected && (
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 font-mono">
                  <AlertCircle className="w-3 h-3 text-amber-400" /> No autenticado
                </span>
              )}
            </div>

            {profile.email ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-xs font-mono text-emerald-400 font-medium truncate select-all"
                  title={profile.email}
                >
                  {profile.email}
                </span>
                <button
                  type="button"
                  aria-label={`Copiar el correo de ${profile.name}`}
                  title="Copiar correo electrónico"
                  onClick={copyEmail}
                  className="text-slate-400 hover:text-cyan-300 transition p-0.5 rounded cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            ) : (
              <span className="block text-xs text-slate-400 font-mono truncate mt-0.5">
                {isConnected
                  ? profile.models[0]?.label || 'Listo para recibir mensajes'
                  : 'Requiere inicio de sesión para activar turnos'}
              </span>
            )}
          </div>
        </div>

        {/* Acciones del perfil */}
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <>
              {!isActive && (
                <button
                  type="button"
                  onClick={onSelect}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0c1220] hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-200 border border-[#202b3f] hover:border-cyan-500/40 text-xs font-mono font-medium transition cursor-pointer"
                  title="Vincular esta cuenta al chat activo"
                >
                  <Radio className="w-3 h-3 text-cyan-400" />
                  <span>Usar en chat</span>
                </button>
              )}
              <button
                type="button"
                aria-label={`Cerrar sesión de ${profile.name}`}
                title="Cerrar sesión de esta cuenta"
                onClick={onLogout}
                className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-500/30 transition text-xs font-mono cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Desconectar</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-mono font-bold text-xs shadow-md shadow-amber-600/30 transition hover:brightness-110 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Iniciar sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* Lista de modelos disponibles */}
      {isConnected && profile.models && profile.models.length > 0 && (
        <div className="pt-2 border-t border-hud-border/70 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold mr-1">
            Modelos ({profile.models.length}):
          </span>
          {profile.models.map((m) => (
            <span
              key={m.id}
              className="px-2 py-0.5 rounded-md bg-[#07090e] border border-[#202b3f] text-slate-300 font-mono text-[10px]"
              title={`Modelo ${m.label} (ID: ${m.id})`}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
