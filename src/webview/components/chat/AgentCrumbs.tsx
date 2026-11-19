import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Clock, UserRound } from 'lucide-react';
import { ModelSelection } from '../../../shared/model-selection';
import { PROTOCOL_ROLES } from '../../../shared/protocol-roles';
import { AccountProfile, ModelAccountTelemetry, ProtocolRole, ReasoningEffort } from '../../../shared/types';
import { postToHost } from '../../vscode-api';
import { formatTime, timeUntil } from '../../utils/format';
import { AddAccountModal } from '../AddAccountModal';
import { EFFORT_HINTS, EFFORT_LABELS } from '../EffortSelector';
import { ROLE_ICONS } from '../ProtocolRoleSelector';
import { ROLE_COLORS } from '../SquadCanvas';
import { AccountPickerModal } from './AccountPickerModal';
import { familyOf, ModelCatalogModal, ModelFamilyIcon } from './ModelCatalogModal';

interface Props {
  sessionId: string;
  accounts: AccountProfile[];
  selection: ModelSelection;
  effort: ReasoningEffort;
  supportedEfforts: ReasoningEffort[];
  onSelectEffort: (effort: ReasoningEffort) => void;
  role?: ProtocolRole;
  onSelectRole: (role: ProtocolRole | undefined) => void;
  telemetry?: ModelAccountTelemetry;
  contextPercent: number;
  contextTitle: string;
  spentUSD: number;
  /** Acciones de la sesión que van al final de la fila de métricas. */
  children?: React.ReactNode;
}

type Menu = 'none' | 'role' | 'effort' | 'quota' | 'accounts' | 'models' | 'add';
const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const toPercent = (utilization?: number) => (utilization === undefined ? undefined : Math.min(100, Math.round(utilization * 100)));
const level = (p = 0) => (p > 85 ? 'text-red-400' : p > 60 ? 'text-amber-300' : 'text-emerald-300');
const barColor = (p = 0) => (p > 85 ? 'bg-red-500' : p > 60 ? 'bg-amber-400' : 'bg-emerald-400');
const DAY_TIME = new Intl.DateTimeFormat('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const asMs = (t: number) => (t < 1e12 ? t * 1000 : t);

const crumb = 'inline-flex items-center gap-0.5 min-w-0 px-1 py-0.5 rounded-md text-[11px] transition cursor-pointer hover:bg-[#162035] hover:text-white';
const Sep = () => <span className="text-slate-600 select-none" aria-hidden>›</span>;
const shortModel = (label?: string) => (label ? label.replace(/^Claude\s+/i, '') : 'Modelo');

/** Cuenta › Modelo › Rol › Esfuerzo como una ruta; cada eslabón abre su menú. A la derecha, la cuota de 5 h y la semanal. */
export const AgentCrumbs: React.FC<Props> = ({ sessionId, accounts, selection, effort, supportedEfforts, onSelectEffort, role, onSelectRole, telemetry, contextPercent, contextTitle, spentUSD, children }) => {
  const [menu, setMenu] = useState<Menu>('none');
  const ref = useRef<HTMLDivElement>(null);
  const { account, model } = selection;
  const roleConfig = role ? PROTOCOL_ROLES[role] : undefined;
  const fiveHour = toPercent(telemetry?.fiveHourUtilization);
  const weekly = toPercent(telemetry?.weeklyUtilization);
  const close = () => setMenu('none');
  const [anchor, setAnchor] = useState<DOMRect>();
  const toggle = (next: Menu, event?: React.MouseEvent<HTMLElement>) => {
    if (event) setAnchor(event.currentTarget.getBoundingClientRect());
    setMenu(menu === next ? 'none' : next);
  };
  // La columna recorta lo que se sale (overflow-hidden): el menú va fijo a la ventana y se pega al borde si no cabe.
  const place = (width: number, alignRight = false): React.CSSProperties => {
    if (!anchor) return {};
    const left = alignRight ? anchor.right - width : anchor.left;
    return { position: 'fixed', top: anchor.bottom + 4, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), width };
  };

  useEffect(() => {
    if (!['role', 'effort', 'quota'].includes(menu)) return;
    const onEvent = (event: Event) => {
      if (event.type === 'keydown' ? (event as KeyboardEvent).key === 'Escape' : !ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onEvent);
    document.addEventListener('keydown', onEvent);
    return () => {
      document.removeEventListener('pointerdown', onEvent);
      document.removeEventListener('keydown', onEvent);
    };
  }, [menu]);

  const popover = 'z-50 rounded-xl border border-[#202b3f] bg-[#0a0e17] p-1.5 shadow-2xl shadow-black/80 animate-modal-pop text-xs';
  const option = (selected: boolean) =>
    `w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${selected ? 'bg-cyan-950/50 text-cyan-200' : 'text-slate-300 hover:bg-[#162035] hover:text-white'}`;

  const windowRow = (label: string, percent: number | undefined, resetsAt: number | undefined, when: (ms: number) => string) => (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className={`font-mono font-semibold ${percent === undefined ? 'text-slate-500' : level(percent)}`}>{percent === undefined ? 'sin datos' : `${percent}% usado`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#07090e] border border-[#202b3f] overflow-hidden">
        <div className={`h-full rounded-full ${barColor(percent)}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <div className="flex items-center gap-1 text-[11px] text-slate-400">
        <Clock className="w-3 h-3 text-cyan-400 shrink-0" aria-hidden />
        {resetsAt ? (
          <span>
            Se reinicia en <b className="text-slate-200 font-semibold">{timeUntil(resetsAt)}</b> · {when(asMs(resetsAt))}
          </span>
        ) : (
          <span>Sin hora de reinicio todavía.</span>
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative flex flex-1 flex-wrap items-center justify-between gap-x-1 gap-y-0.5 min-w-0 text-slate-300">
      {/* La ruta compacta: si la columna es estrecha, recorta correo/modelo para caber en 1 sola línea con las métricas. */}
      <nav aria-label="Configuración del agente" className="flex flex-1 items-center min-w-0">
        <button type="button" onClick={() => toggle('accounts')} className={`${crumb} font-mono shrink min-w-[56px]`} title={account ? `Cuenta: ${account.email || account.name}${account.email ? ` (${account.name})` : ''} — clic para cambiar` : 'Elegir cuenta'}>
          <span className="truncate max-w-[140px]">{account?.email || account?.name || 'Elegir cuenta'}</span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-500 shrink-0" aria-hidden />
        </button>
        <Sep />
        <button type="button" onClick={() => toggle('models')} className={`${crumb} font-mono text-slate-100 shrink min-w-[52px]`} title={model ? `Modelo: ${model.label} — clic para cambiar` : 'Elegir modelo'}>
          {model && <ModelFamilyIcon family={familyOf(model.id)} />}
          <span className="truncate max-w-[110px]">{shortModel(model?.label)}</span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-500 shrink-0" aria-hidden />
        </button>
        <Sep />
        <span className="relative shrink-0">
          <button
            type="button"
            onClick={(event) => toggle('role', event)}
            aria-expanded={menu === 'role'}
            className={`${crumb} font-semibold border ${roleConfig ? ROLE_COLORS[roleConfig.id] ?? 'border-[#202b3f]' : 'border-transparent text-slate-400'}`}
            title={roleConfig ? `Rol: ${roleConfig.label} — ${roleConfig.description}` : 'Sin rol del protocolo'}
          >
            {roleConfig ? ROLE_ICONS[roleConfig.id] : <UserRound className="w-3 h-3 shrink-0" aria-hidden />}
            <span className="truncate max-w-[88px]">{roleConfig?.label ?? 'Rol libre'}</span>
            <ChevronDown className={`w-2.5 h-2.5 shrink-0 opacity-60 transition-transform ${menu === 'role' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {menu === 'role' && (
            <div style={place(288)} className={`${popover} max-h-80 overflow-y-auto`} role="listbox" aria-label="Rol del protocolo">
              {[undefined, ...Object.values(PROTOCOL_ROLES)].map((r) => (
                <button
                  key={r?.id ?? 'libre'}
                  type="button"
                  role="option"
                  aria-selected={role === r?.id}
                  onClick={() => {
                    onSelectRole(r?.id);
                    close();
                  }}
                  className={option(role === r?.id)}
                  title={r?.description}
                >
                  {r ? ROLE_ICONS[r.id] : <UserRound className="w-3 h-3 text-slate-400 shrink-0" aria-hidden />}
                  <span className="truncate">{r?.label ?? 'Rol libre'}</span>
                  {r && <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{r.recommendedModel.replace('Claude ', '')} · {EFFORT_LABELS[r.recommendedEffort as ReasoningEffort] ?? r.recommendedEffort}</span>}
                </button>
              ))}
            </div>
          )}
        </span>
        <Sep />
        <span className="relative shrink-0">
          <button type="button" onClick={(event) => toggle('effort', event)} aria-expanded={menu === 'effort'} className={`${crumb} font-mono`} title={`Esfuerzo: ${EFFORT_HINTS[effort]}`}>
            <span>{EFFORT_LABELS[effort]}</span>
            <ChevronDown className={`w-2.5 h-2.5 text-slate-500 shrink-0 transition-transform ${menu === 'effort' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {menu === 'effort' && (
            <div style={place(256)} className={popover} role="listbox" aria-label="Esfuerzo de razonamiento">
              {EFFORTS.filter((id) => id !== 'xhigh' || supportedEfforts.includes(id)).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={effort === id}
                  disabled={!supportedEfforts.includes(id)}
                  onClick={() => {
                    onSelectEffort(id);
                    close();
                  }}
                  className={option(effort === id)}
                  title={supportedEfforts.includes(id) ? EFFORT_HINTS[id] : 'No disponible con este modelo'}
                >
                  <span className="w-12 shrink-0 font-mono font-semibold">{EFFORT_LABELS[id]}</span>
                  <span className="truncate text-[10.5px] text-slate-500">{EFFORT_HINTS[id]}</span>
                  {effort === id && <Check className="w-3 h-3 ml-auto shrink-0 text-cyan-300" aria-hidden />}
                </button>
              ))}
              {roleConfig && <p className="px-2 pt-1.5 mt-1 border-t border-[#202b3f] text-[10.5px] text-slate-500">{roleConfig.label} recomienda {EFFORT_LABELS[roleConfig.recommendedEffort as ReasoningEffort] ?? roleConfig.recommendedEffort}.</p>}
            </div>
          )}
        </span>
      </nav>

      <div className="relative ml-auto flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={(event) => toggle('quota', event)}
          aria-expanded={menu === 'quota'}
          className={`${crumb} font-mono font-semibold border border-[#202b3f] bg-[#0c1220] ${fiveHour === undefined ? 'text-slate-500' : level(fiveHour)}`}
          title="Cuota de la cuenta: clic para ver cuánto queda de la ventana de 5 h y de la semana"
        >
          <span className="text-slate-500 font-normal">5h</span>
          {fiveHour === undefined ? '—' : `${fiveHour}%`}
        </button>
        <span className={`px-0.5 font-mono text-[10.5px] font-semibold ${level(contextPercent)}`} title={contextTitle}>
          {contextPercent}%
        </span>
        <span className="px-0.5 font-mono text-[10.5px] font-semibold text-emerald-400" title={`Gasto de esta conversación: $${spentUSD.toFixed(4)}`}>
          ${spentUSD.toFixed(2)}
        </span>
        {children}
        {menu === 'quota' && (
          <div style={place(288, true)} className={`${popover} p-3 space-y-3`} role="dialog" aria-label="Cuota de la cuenta">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono truncate">Cuota de {account?.email || account?.name || 'la cuenta'}</div>
            {windowRow('Ventana de 5 h', fiveHour, telemetry?.fiveHourResetsAt, formatTime)}
            {windowRow('Semana', weekly, telemetry?.weeklyResetsAt, (ms) => DAY_TIME.format(ms))}
            {fiveHour === undefined && weekly === undefined && (
              <p className="text-[11px] text-slate-500">Los datos llegan con la próxima respuesta de esta cuenta; solo las cuentas de Claude los envían.</p>
            )}
            <div className="flex justify-between pt-2 border-t border-[#202b3f] text-[11px] text-slate-400" title={contextTitle}>
              <span>Contexto de este chat</span>
              <span className={`font-mono font-semibold ${level(contextPercent)}`}>{contextPercent}%</span>
            </div>
          </div>
        )}
      </div>

      {menu === 'models' && (
        <ModelCatalogModal
          accounts={accounts}
          selection={selection}
          onClose={close}
          onSelect={(profileId, modelId) => {
            postToHost({ command: 'updateSession', sessionId, patch: { profileId, modelId } });
            close();
          }}
        />
      )}
      {menu === 'accounts' && (
        <AccountPickerModal
          accounts={accounts}
          activeAccountId={account?.id}
          onClose={close}
          onAddAccount={() => setMenu('add')}
          onSelect={(profileId) => {
            postToHost({ command: 'updateSession', sessionId, patch: { profileId } });
            close();
          }}
        />
      )}
      {menu === 'add' && <AddAccountModal onClose={close} />}
    </div>
  );
};
