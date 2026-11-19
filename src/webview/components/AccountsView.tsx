import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, RefreshCw, KeyRound, Sparkles, Bot, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';
import { resolveSelection } from '../../shared/model-selection';
import { AccountProfile, ConversationSession, ProviderType } from '../../shared/types';
import { postToHost } from '../vscode-api';
import { AddAccountModal } from './AddAccountModal';
import { ProfileCard } from './ProfileCard';
import { ProviderBadge } from './ProviderBadge';

const PROVIDER_SECTIONS: Array<{ provider: ProviderType; title: string; subtitle: string; note?: string }> = [
  {
    provider: 'claude',
    title: 'Claude',
    subtitle: 'Claude Code CLI · OAuth browser session',
    note: 'Soporta rotación automática entre múltiples cuentas Pro/Team ante límites de cuota.'
  },
  {
    provider: 'google',
    title: 'Google Antigravity',
    subtitle: 'agy CLI oficial · Modelos Gemini 3.8',
    note: 'Comparten un solo inicio de sesión del sistema; las cuentas adicionales son etiquetas de entorno.'
  },
  {
    provider: 'copilot',
    title: 'GitHub Copilot',
    subtitle: 'Suscripción GitHub · Modelos GPT y Claude integrados',
    note: 'Usa la autenticación nativa de GitHub Copilot para despachar turnos.'
  },
  {
    provider: 'ollama',
    title: 'Ollama Local',
    subtitle: 'Servidor local http://localhost:11434 · Modo offline',
    note: 'Modelos ejecutados 100% en tu máquina sin necesidad de internet ni claves de API.'
  }
];

interface Props {
  accounts: AccountProfile[];
  session?: ConversationSession;
}

export const AccountsView: React.FC<Props> = ({ accounts, session }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const connected = accounts.filter((account) => account.status === 'connected').length;
  const activeAccount = session ? resolveSelection(session, accounts).account : undefined;

  const handleRefresh = () => {
    setIsRefreshing(true);
    postToHost({ command: 'refreshAccounts' });
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  return (
    <div className="space-y-3.5 w-full max-w-4xl min-w-0 pb-6">
      {/* Cabecera Táctica */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-hud-surface/95 border border-[#202b3f] shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-500/25 shrink-0">
            <KeyRound className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 font-mono tracking-wide">Gestor de Cuentas y Suscripciones</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Suscripciones y credenciales usadas por las CLIs · Conmutación automática ante cuota
            </p>
          </div>
        </div>

        {/* Acciones e Indicadores */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#07090e] border border-[#202b3f] text-xs font-mono font-semibold">
            <span
              className={`w-2 h-2 rounded-full ${
                connected === accounts.length && accounts.length > 0
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className={connected === accounts.length && accounts.length > 0 ? 'text-emerald-300' : 'text-amber-300'}>
              {connected} de {accounts.length} conectadas
            </span>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0a0e17] hover:bg-[#162035] text-slate-200 border border-[#202b3f] font-mono transition cursor-pointer"
            title="Volver a consultar el estado y cuota de las cuentas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refrescar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-mono font-bold transition shadow-md shadow-cyan-500/30 hover:brightness-110 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Vincular cuenta</span>
          </button>
        </div>
      </div>

      {/* Secciones por Proveedor */}
      <div className="space-y-4">
        {PROVIDER_SECTIONS.map(({ provider, title, subtitle, note }) => {
          const sectionAccounts = accounts
            .filter((account) => account.provider === provider)
            .sort((a, b) => Number(b.status === 'connected') - Number(a.status === 'connected'));

          if (sectionAccounts.length === 0) return null;

          const isCollapsed = Boolean(collapsed[provider]);
          const connectedCount = sectionAccounts.filter((a) => a.status === 'connected').length;

          return (
            <section
              key={provider}
              className="hub-card p-3 sm:p-3.5 rounded-xl bg-[#0c1220]/80 border border-[#202b3f] space-y-2.5 transition"
            >
              {/* Cabecera de la sección de proveedor */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#202b3f] pb-2">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed((current) => ({ ...current, [provider]: !current[provider] }))}
                  className="flex items-center gap-2 text-left hover:opacity-90 transition min-w-0 cursor-pointer"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <ProviderBadge provider={provider} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-100 font-mono">{title}</span>
                      <span className="font-mono text-[10px] px-2 py-0.2 rounded-full bg-[#07090e] border border-[#202b3f] text-slate-400">
                        {sectionAccounts.length} {sectionAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">{subtitle}</div>
                  </div>
                </button>

                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span className={connectedCount > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                    {connectedCount}/{sectionAccounts.length} activas
                  </span>
                </div>
              </div>

              {note && !isCollapsed && (
                <p className="text-[11px] text-slate-400 font-mono px-1 italic">
                  ℹ {note}
                </p>
              )}

              {/* Lista de perfiles */}
              {!isCollapsed && (
                <div className="space-y-2 pt-1">
                  {sectionAccounts.map((account) => (
                    <ProfileCard
                      key={account.id}
                      profile={account}
                      isActive={account.id === activeAccount?.id}
                      onSelect={() =>
                        session &&
                        postToHost({
                          command: 'updateSession',
                          sessionId: session.id,
                          patch: { profileId: account.id }
                        })
                      }
                      onLogin={() => postToHost({ command: 'loginAccount', profileId: account.id })}
                      onLogout={() => postToHost({ command: 'logoutAccount', profileId: account.id })}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {isAdding && <AddAccountModal onClose={() => setIsAdding(false)} />}

      <footer className="pt-2 text-center text-[10px] text-slate-500 font-mono">
        AgentHub · Compilación:{' '}
        {document.querySelector<HTMLMetaElement>('meta[name="agent-hub-build"]')?.content || 'desarrollo activo'}
      </footer>
    </div>
  );
};
