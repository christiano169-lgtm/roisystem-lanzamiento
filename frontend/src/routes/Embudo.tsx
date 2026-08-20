import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatNumber, formatPct } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import type { OutletContext } from './AppLayout';

interface FunnelStage {
  pipelineStageId: string | null;
  pipelineName: string;
  stageName: string;
  count: number;
  percentageOfTotalPct: number;
}

interface OperationalKpis {
  leadsGenerados: number;
  wonCount: number;
  ingresos: number;
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function Embudo() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [funnel, setFunnel] = useState<FunnelStage[] | null>(null);
  const [kpis, setKpis] = useState<OperationalKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
    Promise.all([
      apiGet<{ stages: FunnelStage[] }>(`/api/kpis/funnel?${qs}`),
      apiGet<OperationalKpis>(`/api/kpis/operational?${qs}`),
    ])
      .then(([f, k]) => {
        if (cancelled) return;
        setFunnel(f.stages);
        setKpis(k);
      })
      .catch(() => !cancelled && setError('No se pudo cargar el embudo.'));
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  const top = funnel?.[0]?.count || 1;
  const worst = funnel && funnel.length > 1 ? [...funnel].sort((a, b) => a.percentageOfTotalPct - b.percentageOfTotalPct)[0] : null;

  return (
    <div className="roi-in flex flex-col gap-4">
      <RangePicker
        range={range}
        from={from}
        to={to}
        onChange={(r, f, t) => {
          setRange(r);
          setFrom(f);
          setTo(t);
        }}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {kpis && funnel && (
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-5">
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Entran al embudo</span>
            <div className="mt-1 text-[20px] font-bold text-sky-400">{formatNumber(kpis.leadsGenerados)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Cierres</span>
            <div className="mt-1 text-[20px] font-bold text-emerald-400">{formatNumber(kpis.wonCount)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Conversión total</span>
            <div className="mt-1 text-[20px] font-bold text-accent">{formatPct(kpis.leadsGenerados > 0 ? (kpis.wonCount / kpis.leadsGenerados) * 100 : 0)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Cuello de botella</span>
            <div className="mt-1 truncate text-[16px] font-bold text-amber-400">{worst ? `${worst.stageName} · ${formatPct(worst.percentageOfTotalPct)}` : '—'}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Valor del embudo</span>
            <div className="mt-1 text-[20px] font-bold text-fuchsia-400">{formatCurrency(kpis.ingresos)}</div>
          </div>
        </div>
      )}

      {funnel && funnel.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[7px] border border-border bg-panel p-5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Embudo por etapa</span>
          <div className="flex flex-col gap-2.5">
            {funnel.map((stage) => {
              const width = Math.max(3, (stage.count / top) * 100);
              return (
                <div key={`${stage.pipelineStageId}-${stage.stageName}`} className="roi-in grid grid-cols-[200px_1fr_90px_90px_90px] items-center gap-3">
                  <span className="flex items-center gap-2 truncate text-[13px] font-semibold">
                    <span className="roi-pulse h-[7px] w-[7px] shrink-0 rounded-full bg-sky-400" />
                    {stage.stageName}
                  </span>
                  <div className="relative h-[26px] overflow-hidden rounded border border-border bg-[#101014]">
                    <div className="roi-grow-x absolute inset-y-0 left-0 rounded bg-gradient-to-r from-sky-500/30 to-sky-400" style={{ width: `${width}%` }} />
                    <div className="roi-flow absolute inset-y-0 left-0" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right text-[14px] font-bold text-sky-400">{formatNumber(stage.count)}</span>
                  <span className="text-right text-[13px] text-gray-400">{formatPct(stage.percentageOfTotalPct)}</span>
                  <span className="text-right text-[12px] text-gray-500">{top - stage.count > 0 ? `−${formatNumber(top - stage.count)}` : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
