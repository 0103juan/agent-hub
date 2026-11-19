import React from 'react';
import { ProtocolRole } from '../../shared/types';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { Compass, PenTool, CheckSquare, Code2, ShieldAlert, Globe2, FileText, Palette, UserRound, Network, Bug, ChevronDown } from 'lucide-react';
import { ROLE_COLORS } from './SquadCanvas';

interface Props {
  selectedRole?: ProtocolRole;
  onSelectRole: (role: ProtocolRole | undefined) => void;
  /** Traspasos del equipo; mandan sobre el `handoffTo` del rol. */
  handoffTo?: ProtocolRole[];
  compact?: boolean;
}

export const ROLE_ICONS: Record<ProtocolRole, React.ReactNode> = {
  explorador: <Compass className="w-3 h-3 text-cyan-400 shrink-0" />,
  arquitecto: <PenTool className="w-3 h-3 text-violet-400 shrink-0" />,
  tester: <CheckSquare className="w-3 h-3 text-emerald-400 shrink-0" />,
  desarrollador: <Code2 className="w-3 h-3 text-blue-400 shrink-0" />,
  revisor: <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />,
  externo: <Globe2 className="w-3 h-3 text-rose-400 shrink-0" />,
  documentador: <FileText className="w-3 h-3 text-teal-400 shrink-0" />,
  disenador: <Palette className="w-3 h-3 text-pink-400 shrink-0" />,
  coordinador: <Network className="w-3 h-3 text-sky-400 shrink-0" />,
  depurador: <Bug className="w-3 h-3 text-red-400 shrink-0" />
};

export const ProtocolRoleSelector: React.FC<Props> = ({ selectedRole, onSelectRole, handoffTo, compact = false }) => {
  const role = selectedRole ? PROTOCOL_ROLES[selectedRole] : undefined;
  const next = handoffTo ?? (role?.handoffTo ? [role.handoffTo] : []);

  if (compact) {
    return (
      <label
        className={`group relative flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border transition text-left shrink-0 cursor-pointer shadow-xs ${
          role
            ? `${ROLE_COLORS[role.id] ?? 'border-violet-600/50 bg-violet-950/40 text-violet-200'} hover:brightness-110`
            : 'bg-[#0a0e17] hover:bg-[#162035] border-[#202b3f] hover:border-slate-700 text-slate-300 hover:text-white'
        }`}
        title={role ? `Rol actual: ${role.label} (${role.description}) — Clic para cambiar` : 'Asignar rol a la sesión'}
      >
        {role ? ROLE_ICONS[role.id] : <UserRound className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
        <select
          aria-label="Rol del protocolo"
          value={selectedRole ?? ''}
          onChange={(event) => onSelectRole((event.target.value || undefined) as ProtocolRole | undefined)}
          className="appearance-none bg-transparent text-[11px] font-semibold focus:outline-none cursor-pointer pr-1 truncate max-w-[120px]"
        >
          <option value="" className="bg-[#0a0e17] text-slate-300">Rol libre</option>
          {Object.values(PROTOCOL_ROLES).map((option) => (
            <option key={option.id} value={option.id} className="bg-[#0a0e17] text-slate-200">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-2.5 h-2.5 text-slate-400 shrink-0 -ml-0.5 pointer-events-none group-hover:text-slate-200" />
      </label>
    );
  }

  return (
    <label
      className="group relative flex-1 min-w-0 flex items-center gap-2 px-2.5 h-7 rounded-lg bg-[#0a0e17] border border-[#202b3f] focus-within:border-cyan-500 transition shadow-xs"
      title={role ? undefined : 'Sin rol del protocolo'}
    >
      {role ? ROLE_ICONS[role.id] : <UserRound className="w-3 h-3 text-slate-400 shrink-0" />}
      <select
        aria-label="Rol del protocolo"
        value={selectedRole ?? ''}
        onChange={(event) => onSelectRole((event.target.value || undefined) as ProtocolRole | undefined)}
        className="flex-1 min-w-0 text-[11px] font-semibold text-slate-200 focus:outline-none cursor-pointer bg-transparent"
      >
        <option value="" className="bg-[#0a0e17] text-slate-300">Rol libre</option>
        {Object.values(PROTOCOL_ROLES).map((option) => (
          <option key={option.id} value={option.id} className="bg-[#0a0e17] text-slate-200">
            {option.label}
          </option>
        ))}
      </select>
      {role && (
        <div role="tooltip" className="hidden group-hover:block group-focus-within:block absolute left-0 top-full mt-1.5 z-40 w-72 p-3 rounded-xl border border-[#202b3f] bg-[#07090e] shadow-2xl shadow-black/80 text-[11px] space-y-2 animate-message-fade">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-100 flex items-center gap-1.5">
              {ROLE_ICONS[role.id]}
              <span>{role.label}</span>
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
              PROTOCOLO
            </span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">{role.description}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-slate-400 pt-1.5 border-t border-[#162035] font-mono text-[10.5px]">
            <dt className="text-slate-500">Modelo:</dt><dd className="text-cyan-300 truncate">{role.recommendedModel}</dd>
            <dt className="text-slate-500">Esfuerzo:</dt><dd className="text-cyan-300">{role.recommendedEffort}</dd>
            <dt className="text-slate-500">Acceso:</dt><dd className={role.readOnly ? 'text-amber-300' : 'text-emerald-400'}>{role.readOnly ? 'Solo lectura' : 'Puede editar'}</dd>
            <dt className="text-slate-500">Pasa a:</dt><dd className="text-violet-300 truncate">{next.length > 0 ? next.map((id) => PROTOCOL_ROLES[id]?.label ?? id).join(', ') : 'Nadie'}</dd>
          </dl>
        </div>
      )}
    </label>
  );
};
