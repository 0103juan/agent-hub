import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, ShieldAlert, X } from 'lucide-react';
import { AccountProfile, ModelAccountTelemetry, ProviderType } from '../../../shared/types';

const SATURATED_PERCENT = 90;

interface Props {
  telemetry?: ModelAccountTelemetry;
  accounts: AccountProfile[];
  activeAccount?: AccountProfile;
  onFailover: (provider: ProviderType) => void;
}

const toPercent = (utilization?: number) => (utilization === undefined ? 0 : Math.min(100, Math.round(utilization * 100)));

export const QuotaNotice: React.FC<Props> = ({ telemetry, accounts, activeAccount, onFailover }) => {
  const fiveHour = toPercent(telemetry?.fiveHourUtilization);
  const weekly = toPercent(telemetry?.weeklyUtilization);
  const worst = Math.max(fiveHour, weekly);
  const [dismissedAt, setDismissedAt] = useState<number>();
  // Si la cuota sube después de descartar el aviso, vuelve a aparecer.
  useEffect(() => {
    if (dismissedAt !== undefined && worst > dismissedAt) setDismissedAt(undefined);
  }, [worst, dismissedAt]);

  if (worst < SATURATED_PERCENT || dismissedAt !== undefined) return null;

  const alternative = accounts.find(
    (account) => account.status === 'connected' && account.provider !== activeAccount?.provider
  );

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-950/50 border border-amber-600/60 text-amber-200 text-xs shadow-md shrink-0" role="alert">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Alerta de cuota ({worst}%):</strong> {fiveHour >= weekly ? 'ventana de 5 h saturada.' : 'cuota semanal casi agotada.'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {alternative && (
          <button
            onClick={() => onFailover(alternative.provider)}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-[11px] transition shadow"
          >
            <ArrowRightLeft className="w-3 h-3" />
            <span>Cambiar a {alternative.name}</span>
          </button>
        )}
        <button type="button" aria-label="Descartar el aviso de cuota" title="Descartar (vuelve si la cuota sube)" onClick={() => setDismissedAt(worst)} className="p-1 rounded text-amber-300 hover:bg-amber-900/60">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
