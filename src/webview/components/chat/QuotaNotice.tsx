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
    <div
      className="flex flex-wrap items-center justify-between px-3.5 py-2.5 rounded-xl bg-amber-950/30 border border-amber-600/50 text-amber-200 text-xs shadow-lg shadow-amber-950/20 gap-3 shrink-0"
      role="alert"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-lg bg-amber-900/60 border border-amber-500/50 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-amber-100 flex items-center gap-1.5 flex-wrap">
            <span>Alerta de cuota ({worst}%):</span>
            <span className="text-amber-300 font-normal">
              {fiveHour >= weekly ? 'ventana de 5 h saturada.' : 'cuota semanal casi agotada.'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10.5px] text-amber-400/80 font-mono mt-0.5">
            <span>5 h: {fiveHour}%</span>
            <span>•</span>
            <span>Semanal: {weekly}%</span>
            {alternative && (
              <>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">{alternative.name} disponible para failover</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {alternative && (
          <button
            type="button"
            onClick={() => onFailover(alternative.provider)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer shadow-md shadow-amber-500/20"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Cambiar a {alternative.name}</span>
          </button>
        )}
        <button
          type="button"
          aria-label="Descartar el aviso de cuota"
          title="Descartar (vuelve si la cuota sube)"
          onClick={() => setDismissedAt(worst)}
          className="p-1 rounded-lg text-amber-400 hover:bg-amber-900/50 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
