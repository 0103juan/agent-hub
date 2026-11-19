import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ProviderType } from '../../shared/types';
import { postToHost } from '../vscode-api';
import { ModalShell } from './ModalShell';

const PROVIDER_OPTIONS: Array<{ provider: ProviderType; label: string; sub: string; hint: string; selectedClass: string }> = [
  { provider: 'claude', label: 'Claude', sub: 'Anthropic', hint: 'Se abre el inicio de sesión de Claude Code en el navegador para autenticar la CLI.', selectedClass: 'bg-orange-950/40 text-orange-200 border-orange-500/60 ring-1 ring-orange-500/30' },
  { provider: 'google', label: 'Antigravity', sub: 'Google Hub', hint: 'Antigravity comparte una sesión unificada: la etiqueta ayuda a identificarla en el selector.', selectedClass: 'bg-blue-950/40 text-blue-200 border-blue-500/60 ring-1 ring-blue-500/30' },
  { provider: 'ollama', label: 'Ollama', sub: 'LLM Local', hint: 'Detecta los modelos instalados en http://localhost:11434 sin requerir API keys ni conexión a internet.', selectedClass: 'bg-emerald-950/40 text-emerald-200 border-emerald-500/60 ring-1 ring-emerald-500/30' }
];

export const AddAccountModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [provider, setProvider] = useState<ProviderType>('claude');
  const [label, setLabel] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    postToHost({ command: 'addAccount', provider, label: label.trim() });
    onClose();
  };

  return (
    <ModalShell title="Vincular nueva cuenta" icon={<Plus className="w-4 h-4 text-cyan-400" />} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-4 bg-[#0a0e17]">
        <div className="grid grid-cols-3 gap-2">
          {PROVIDER_OPTIONS.map((option) => (
            <button
              key={option.provider}
              type="button"
              onClick={() => setProvider(option.provider)}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition text-center cursor-pointer ${
                provider === option.provider
                  ? option.selectedClass
                  : 'bg-[#07090e] hover:bg-[#162035] text-slate-400 border-[#202b3f]'
              }`}
            >
              <div className="text-slate-200 font-bold">{option.label}</div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{option.sub}</div>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 bg-[#07090e] p-2.5 rounded-lg border border-[#202b3f] leading-relaxed" role="note">
          {PROVIDER_OPTIONS.find((option) => option.provider === provider)?.hint}
        </p>

        <label className="block">
          <span className="block text-[11px] text-slate-400 font-semibold mb-1.5 uppercase font-mono tracking-wider">
            Etiqueta identificadora (ej: Trabajo, Personal 2, Cliente):
          </span>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="ej. Trabajo - Principal"
            maxLength={40}
            autoFocus
            className="w-full bg-[#07090e] border border-[#202b3f] focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition font-sans"
          />
        </label>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#202b3f]">
          <span className="font-mono text-[10px] text-slate-500">{label.length}/40 caracteres</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg hover:bg-[#162035] text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="px-3.5 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold transition disabled:opacity-40 cursor-pointer shadow-md shadow-cyan-500/20"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
};
