import React from 'react';
import { ProtocolRole } from '../../orchestrator/types';
import { PROTOCOL_ROLES } from '../../orchestrator/protocol-roles';
import { Compass, PenTool, CheckSquare, Code2, ShieldAlert, Globe2, FileText } from 'lucide-react';

interface Props {
  selectedRole?: ProtocolRole;
  onSelectRole: (role: ProtocolRole | undefined) => void;
}

const ROLE_ICONS: Record<ProtocolRole, React.ReactNode> = {
  explorador: <Compass className="w-3 h-3 text-cyan-400" />,
  arquitecto: <PenTool className="w-3 h-3 text-purple-400" />,
  tester: <CheckSquare className="w-3 h-3 text-emerald-400" />,
  desarrollador: <Code2 className="w-3 h-3 text-blue-400" />,
  revisor: <ShieldAlert className="w-3 h-3 text-amber-400" />,
  externo: <Globe2 className="w-3 h-3 text-rose-400" />,
  documentador: <FileText className="w-3 h-3 text-indigo-400" />
};

export const ProtocolRoleSelector: React.FC<Props> = ({ selectedRole, onSelectRole }) => {
  const roles = Object.values(PROTOCOL_ROLES);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none text-[11px]">
      <span className="text-[10px] uppercase font-semibold text-zinc-500 mr-1 shrink-0">
        Rol Protocolo:
      </span>

      <button
        type="button"
        onClick={() => onSelectRole(undefined)}
        className={`px-2 py-0.5 rounded text-[10px] transition shrink-0 ${
          !selectedRole
            ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium'
            : 'text-zinc-500 hover:text-zinc-400'
        }`}
      >
        Libre
      </button>

      {roles.map((r) => {
        const isSelected = selectedRole === r.id;
        return (
          <button
            key={r.id}
            type="button"
            title={`${r.description} (Modelo sug: ${r.recommendedModel}, Esfuerzo: ${r.recommendedEffort})`}
            onClick={() => onSelectRole(isSelected ? undefined : r.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition shrink-0 ${
              isSelected
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-medium shadow-xs'
                : 'bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-400 border border-zinc-800'
            }`}
          >
            {ROLE_ICONS[r.id]}
            <span>{r.label}</span>
          </button>
        );
      })}
    </div>
  );
};

