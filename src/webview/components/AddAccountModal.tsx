import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ProviderType } from '../../shared/types';
import { postToHost } from '../vscode-api';
import { ModalShell } from './ModalShell';

const PROVIDER_OPTIONS: Array<{ provider: ProviderType; label: string; selectedClass: string }> = [
  { provider: 'claude', label: 'Claude', selectedClass: 'bg-orange-600/20 text-orange-300 border-orange-500/50' },
  { provider: 'google', label: 'Antigravity', selectedClass: 'bg-blue-600/20 text-blue-300 border-blue-500/50' }
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
    <ModalShell title="Vincular nueva cuenta" icon={<Plus className="w-4 h-4 text-indigo-400" />} onClose={onClose}>
      <form onSubmit={submit} className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          {PROVIDER_OPTIONS.map((option) => (
            <button
              key={option.provider}
              type="button"
              onClick={() => setProvider(option.provider)}
              className={`p-2 rounded-lg border text-xs font-medium transition ${
                provider === option.provider ? option.selectedClass : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="block text-[11px] text-zinc-400 font-medium mb-1">
            Etiqueta identificadora (ej: Trabajo, Personal 2, Cliente):
          </span>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="ej. Trabajo"
            autoFocus
            className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg hover:bg-zinc-800 text-zinc-400 transition">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!label.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50 shadow"
          >
            Iniciar sesión
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
