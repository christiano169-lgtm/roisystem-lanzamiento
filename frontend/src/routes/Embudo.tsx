import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { formatCurrency, formatDate, formatNumber, formatPct } from '../lib/format';
import NoLocationState from '../components/NoLocationState';
import type { OutletContext } from './AppLayout';

interface Launch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface Phase {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

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

export default function Embudo() {
  const { locationId } = useOutletContext<OutletContext>();
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[] | null>(null);
  const [kpis, setKpis] = useState<OperationalKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    apiGet<{ launches: Launch[] }>(`/api/launches?locationId=${locationId}`).then((res) => {
      if (cancelled) return;
      setLaunches(res.launches);
      setLaunchId((prev) => (prev && res.launches.some((l) => l.id === prev) ? prev : (res.launches[0]?.id ?? null)));
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  useEffect(() => {
    setPhaseId(null);
    setPhases([]);
    if (!launchId) return;
    apiGet<{ phases: Phase[] }>(`/api/launches/${launchId}/phases`).then((res) => setPhases(res.phases));
  }, [launchId]);

  const activeLaunch = launches?.find((l) => l.id === launchId);
  const activePhase = phases.find((p) => p.id === phaseId);
  const from = activePhase?.startDate ?? activeLaunch?.startDate;
  const to = activePhase?.endDate ?? activeLaunch?.endDate;

  useEffect(() => {
    if (!locationId || !from || !to) {
      setFunnel(null);
      setKpis(null);
      return;
    }
    let cancelled = false;
    const qs = `locationId=${locationId}&from=${from}&to=${to}`;
    Promise.all([apiGet<{ stages: FunnelStage[] }>(`/api/kpis/funnel?${qs}`), apiGet<OperationalKpis>(`/api/kpis/operational?${qs}`)])
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
  const noLaunchesYet = locationId && launches !== null && launches.length === 0;

  if (!locationId) return <NoLocationState />;

  return (
    <div className="roi-in flex flex-col gap-4">
      {noLaunchesYet && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
          <span className="text-amber-300">Todavía no hay ningún lanzamiento creado — el embudo está en 0.</span>
          <Link to="/app/settings" className="shrink-0 rounded border border-amber-700 px-3 py-1.5 text-amber-200 hover:bg-amber-900/40">
            Ir a Configuración
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={launchId ?? ''}
          onChange={(e) => setLaunchId(e.target.value || null)}
          disabled={!launches?.length}
          className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60 disabled:opacity-50"
        >
          {!launches?.length && <option>Sin lanzamientos</option>}
          {launches?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {from && to && (
          <span className="text-[12px] text-gray-500">
            {formatDate(from)} → {formatDate(to)}
          </span>
        )}
      </div>

      {phases.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Fase</span>
          <button
            onClick={() => setPhaseId(null)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${phaseId === null ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border2 text-gray-400 hover:bg-white/5'}`}
          >
            Todo el lanzamiento
          </button>
          {phases.map((p) => (
            <button
              key={p.id}
              onClick={() => setPhaseId(p.id)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${phaseId === p.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border2 text-gray-400 hover:bg-white/5'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

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

      <div className="flex flex-col gap-3 rounded-[7px] border border-border bg-panel p-5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Embudo por etapa</span>
        {(!funnel || funnel.length === 0) && <p className="text-[12px] text-gray-500">Sin oportunidades en este rango todavía.</p>}
        <div className="flex flex-col gap-2.5">
          {funnel?.map((stage) => {
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
    </div>
  );
}
