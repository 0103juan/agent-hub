import React from 'react';
import { ProtocolRole } from '../../shared/types';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { Compass, PenTool, CheckSquare, Code2, ShieldAlert, Globe2, FileText, Palette, UserRound, Network, Bug } from 'lucide-react';

interface Props {
  selectedRole?: ProtocolRole;
  onSelectRole: (role: ProtocolRole | undefined) => void;
  /** Traspasos del equipo; mandan sobre el `handoffTo` del rol. */
  handoffTo?: ProtocolRole[];
}

const ROLE_ICONS: Record<ProtocolRole, React.ReactNode> = {
  explorador: <Compass className="w-3 h-3 text-cyan-400 shrink-0" />,
  arquitecto: <PenTool className="w-3 h-3 text-purple-400 shrink-0" />,
  tester: <CheckSquare className="w-3 h-3 text-emerald-400 shrink-0" />,
  desarrollador: <Code2 className="w-3 h-3 text-blue-400 shrink-0" />,
  revisor: <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />,
  externo: <Globe2 className="w-3 h-3 text-rose-400 shrink-0" />,
  documentador: <FileText className="w-3 h-3 text-indigo-400 shrink-0" />,
  disenador: <Palette className="w-3 h-3 text-pink-400 shrink-0" />,
  coordinador: <Network className="w-3 h-3 text-sky-400 shrink-0" />,
  depurador: <Bug className="w-3 h-3 text-red-400 shrink-0" />
};

export const ProtocolRoleSelector: React.FC<Props> = ({ selectedRole, onSelectRole, handoffTo }) => {
  const role = selectedRole ? PROTOCOL_ROLES[selectedRole] : undefined;
  const next = handoffTo ?? (role?.handoffTo ? [role.handoffTo] : []);

  return (
    <label
      className="group relative flex-1 min-w-0 flex items-center gap-1.5 px-1.5 h-7 rounded bg-zinc-900 border border-zinc-800 focus-within:border-indigo-500 transition"
      title={role ? undefined : 'Sin rol del protocolo'}
    >
      {role ? ROLE_ICONS[role.id] : <UserRound className="w-3 h-3 text-zinc-400 shrink-0" />}
      <select
        aria-label="Rol del protocolo"
        value={selectedRole ?? ''}
        onChange={(event) => onSelectRole((event.target.value || undefined) as ProtocolRole | undefined)}
        className="flex-1 min-w-0 text-[11px] font-medium focus:outline-none cursor-pointer"
      >
        <option value="">Rol libre</option>
        {Object.values(PROTOCOL_ROLES).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {role && (
        <div role="tooltip" className="hidden group-hover:block group-focus-within:block absolute left-0 top-full mt-1 z-30 w-64 p-2 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl text-[11px] space-y-1">
          <div className="font-semibold text-zinc-100">{role.label}</div>
          <p className="text-zinc-300">{role.description}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-zinc-400">
            <dt>Modelo</dt><dd className="text-zinc-200">{role.recommendedModel}</dd>
            <dt>Esfuerzo</dt><dd className="text-zinc-200">{role.recommendedEffort}</dd>
            <dt>Acceso</dt><dd className="text-zinc-200">{role.readOnly ? 'Solo lectura' : 'Puede editar'}</dd>
            <dt>Pasa a</dt><dd className="text-zinc-200">{next.length > 0 ? next.map((id) => PROTOCOL_ROLES[id]?.label ?? id).join(', ') : 'Nadie'}</dd>
          </dl>
        </div>
      )}
    </label>
  );
};
