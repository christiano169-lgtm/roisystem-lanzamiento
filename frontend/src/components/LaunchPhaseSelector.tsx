import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { formatDateOnly } from '../lib/format';

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

export interface LaunchWindow {
  launchId: string;
  from: string;
  to: string;
}

/**
 * Every "por lanzamiento" screen filters by the launch's (or one of its
 * phases') date window, never a free day-count picker — this is the one
 * place that logic lives, so every screen stays consistent and a launch
 * with no data yet still shows "sin lanzamientos" instead of silently
 * defaulting to the last 30 days.
 */
export default function LaunchPhaseSelector({ locationId, onChange }: { locationId: string; onChange: (window: LaunchWindow | null) => void }) {
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseId, setPhaseId] = useState<string | null>(null);

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
    if (launchId && from && to) onChange({ launchId, from, to });
    else onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchId, from, to]);

  const noLaunchesYet = launches !== null && launches.length === 0;

  return (
    <div className="flex flex-col gap-2.5">
      {noLaunchesYet && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
          <span className="text-amber-300">Todavía no hay ningún lanzamiento creado — esta pantalla está en 0.</span>
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
            {formatDateOnly(from)} → {formatDateOnly(to)}
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
    </div>
  );
}
