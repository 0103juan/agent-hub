import React from 'react';
import { ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { AccountProfile, ModelAccountTelemetry, ProviderType } from '../../../shared/types';

const SATURATED_PERCENT = 90;

interface Props {
  telemetry?: ModelAccountTelemetry;
  accounts: AccountProfile[];
  activeAccount?: AccountProfile;
  onFailover: (provider: ProviderType) => void;
}

export const QuotaNotice: React.FC<Props> = ({ telemetry, accounts, activeAccount, onFailover }) => {
  if (telemetry?.fiveHourUtilization === undefined) return null;
  const utilization = Math.min(100, Math.round(telemetry.fiveHourUtilization * 100));
  if (utilization < SATURATED_PERCENT) return null;

  const alternative = accounts.find(
    (account) => account.status === 'connected' && account.provider !== activeAccount?.provider
  );

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-950/50 border border-amber-600/60 text-amber-200 text-xs shadow-md shrink-0">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span><strong>Alerta de cuota ({utilization}%):</strong> Ventana saturada.</span>
      </div>
      {alternative && (
        <button
          onClick={() => onFailover(alternative.provider)}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-[11px] transition shrink-0 ml-2 shadow"
        >
          <ArrowRightLeft className="w-3 h-3" />
          <span>Cambiar a {alternative.name}</span>
        </button>
      )}
    </div>
  );
};
