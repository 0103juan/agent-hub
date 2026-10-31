import React from 'react';
import { AccountProfile } from '../../orchestrator/types';
import { CheckCircle2, AlertCircle, LogIn, Sparkles, Bot } from 'lucide-react';

interface Props {
  profile: AccountProfile;
  isActive: boolean;
  onSelect: () => void;
  onLogin: () => void;
}

export const ProfileCard: React.FC<Props> = ({ profile, isActive, onSelect, onLogin }) => {
  const isClaude = profile.provider === 'claude';
  const isGoogle = profile.provider === 'google';
  const isOpenAI = profile.provider === 'openai';
  const isConnected = profile.status === 'connected';

  return (
    <div
      onClick={isConnected ? onSelect : undefined}
      className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
        isActive
          ? 'bg-zinc-800/90 border-indigo-500 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isClaude && (
            <div className="w-6 h-6 rounded flex items-center justify-center bg-orange-600/20 text-orange-400 font-bold text-xs">
              C
            </div>
          )}
          {isGoogle && (
            <div className="w-6 h-6 rounded flex items-center justify-center bg-blue-600/20 text-blue-400 font-bold text-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          )}
          {isOpenAI && (
            <div className="w-6 h-6 rounded flex items-center justify-center bg-emerald-600/20 text-emerald-400 font-bold text-xs">
              <Bot className="w-3.5 h-3.5" />
            </div>
          )}

          <div>
            <div className="font-medium text-xs text-zinc-100 flex items-center gap-1.5">
              <span>{profile.name}</span>
              {isActive && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  ACTIVO
                </span>
              )}
            </div>
            {profile.email ? (
              <div className="text-[11px] font-mono text-emerald-400 font-medium truncate max-w-[220px]" title={profile.email}>
                {profile.email}
              </div>
            ) : (
              <div className="text-[11px] text-zinc-400 truncate max-w-[220px]">
                {isConnected ? profile.activeModel || 'Listo' : 'No autenticado'}
              </div>
            )}
          </div>
        </div>

        <div>
          {isConnected ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {profile.subscriptionType || 'PRO'}
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLogin();
              }}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
            >
              <LogIn className="w-3 h-3 text-amber-400" />
              <span>Login</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
