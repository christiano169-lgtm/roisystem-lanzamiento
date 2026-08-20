import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { formatDate, formatMinutes, formatNumber, formatUsd } from '../lib/format';
import ObjectionsWidget from '../components/ObjectionsWidget';
import NoLocationState from '../components/NoLocationState';
import type { OutletContext } from './AppLayout';

interface Launch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'closed';
}

interface Phase {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

interface SalesKpis {
  comprasAprobadas: number;
  upgradesVip: number;
  orderBumps: number;
  leadsGestionados: number;
  ticketPromedio: number;
  ingresoBruto: number;
  netoProductor: number;
  ingresoPorUpgrade: number;
  ingresoPorBumps: number;
  pendientePorCobrar: number;
  reembolsosYDisputas: number;
}

interface SalesVolumeRow {
  date: string;
  compras: number;
  upgrades: number;
  orderBumps: number;
}

interface SalesRankingRow {
  ownerGhlId: string;
  name: string;
  leads: number;
  compras: number;
  upgrades: number;
  bumps: number;
  ingresoNeto: number;
  conversionPct: number;
}

interface SetterRow {
  ownerGhlId: string;
  atendidos: number;
  primeraRespuestaMinutosPromedio: number | null;
}

interface LaunchSummary {
  launch: Launch;
  phases: Phase[];
  embudoVentas: { cerrada: number; ofertada: number; noOfertada: number };
  salesKpis: SalesKpis;
  salesVolume: SalesVolumeRow[];
  salesRanking: SalesRankingRow[];
  setters: SetterRow[];
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1 text-[20px] font-bold" style={{ color: color ?? '#22d3ee' }}>
        {value}
      </div>
    </div>
  );
}

function VolumeChart({ days }: { days: SalesVolumeRow[] }) {
  const max = Math.max(4, ...days.map((d) => Math.max(d.compras, d.upgrades, d.orderBumps)));
  const COLORS = { compras: '#38bdf8', upgrades: '#e879f9', orderBumps: '#34d399' };

  return (
    <div className="flex gap-2.5">
      <div className="flex h-[100px] flex-col justify-between text-[11px] text-gray-500">
        <span>{Math.round(max)}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="flex-1">
        <div className="flex h-[100px] items-end gap-1 border-b border-dashed border-[#242429]">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 items-end gap-[1.5px]">
              <div className="roi-in flex-1 rounded-t-[1px]" style={{ height: `${Math.max(2, (d.compras / max) * 100)}px`, background: COLORS.compras }} />
              <div className="roi-in flex-1 rounded-t-[1px]" style={{ height: `${Math.max(2, (d.upgrades / max) * 100)}px`, background: COLORS.upgrades }} />
              <div className="roi-in flex-1 rounded-t-[1px]" style={{ height: `${Math.max(2, (d.orderBumps / max) * 100)}px`, background: COLORS.orderBumps }} />
            </div>
          ))}
          {days.length === 0 && <span className="pb-2 text-[12px] text-gray-600">Sin ventas en el rango.</span>}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-gray-500">
          {days.length > 0 && (
            <>
              <span>{days[0]!.date}</span>
              <span>{days[days.length - 1]!.date}</span>
            </>
          )}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: COLORS.compras }} /> Compras
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: COLORS.upgrades }} /> Upgrades
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: COLORS.orderBumps }} /> Order bumps
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { locationId } = useOutletContext<OutletContext>();
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [summary, setSummary] = useState<LaunchSummary | null>(null);
  const [loading, setLoading] = useState(false);
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
  }, [launchId]);

  useEffect(() => {
    if (!launchId || !locationId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}${phaseId ? `&phaseId=${phaseId}` : ''}`;
      try {
        const res = await apiGet<LaunchSummary>(`/api/launches/${launchId}/summary?${qs}`);
        if (!cancelled) setSummary(res);
      } catch {
        if (!cancelled) setError('No se pudo cargar el panel ejecutivo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [launchId, phaseId, locationId]);

  const settersByOwner = useMemo(() => new Map((summary?.setters ?? []).map((s) => [s.ownerGhlId, s])), [summary?.setters]);
  const currentRange = phaseId ? summary?.phases.find((p) => p.id === phaseId) : summary?.launch;

  // Zero-value fallback so the full layout (every card, chart and column)
  // is always visible — even with no launch created yet — instead of a
  // blocking "create a launch first" wall. Matches every screen else where
  // in the app: show the shell at 0, never a blank page.
  const zeroKpis: SalesKpis = {
    comprasAprobadas: 0,
    upgradesVip: 0,
    orderBumps: 0,
    leadsGestionados: 0,
    ticketPromedio: 0,
    ingresoBruto: 0,
    netoProductor: 0,
    ingresoPorUpgrade: 0,
    ingresoPorBumps: 0,
    pendientePorCobrar: 0,
    reembolsosYDisputas: 0,
  };
  const salesKpis = summary?.salesKpis ?? zeroKpis;
  const embudoVentas = summary?.embudoVentas ?? { cerrada: 0, ofertada: 0, noOfertada: 0 };
  const salesVolume = summary?.salesVolume ?? [];
  const salesRanking = summary?.salesRanking ?? [];
  const noLaunchesYet = launches !== null && launches.length === 0;

  if (!locationId) return <NoLocationState />;

  return (
    <div className="roi-in flex flex-col gap-4">
      {noLaunchesYet && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
          <span className="text-amber-300">
            Todavía no hay ningún lanzamiento creado — lo de abajo está en 0. Creá uno en Configuración → "Lanzamientos"
            (nombre + fecha de inicio/fin) para que empiece a llenarse con datos reales.
          </span>
          <Link to="/app/settings" className="shrink-0 rounded border border-amber-700 px-3 py-1.5 text-amber-200 hover:bg-amber-900/40">
            Ir a Configuración
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={launchId ?? ''}
          onChange={(e) => setLaunchId(e.target.value || null)}
          disabled={noLaunchesYet}
          className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60 disabled:opacity-50"
        >
          {noLaunchesYet && <option>Sin lanzamientos</option>}
          {launches?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {currentRange && (
          <span className="text-[12px] text-gray-500">
            {formatDate(currentRange.startDate)} → {formatDate(currentRange.endDate)}
          </span>
        )}
        {loading && <span className="text-[12px] text-gray-500">Cargando…</span>}
      </div>

      {summary && summary.phases.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Fase</span>
          <button
            onClick={() => setPhaseId(null)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${phaseId === null ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border2 text-gray-400 hover:bg-white/5'}`}
          >
            Todo el lanzamiento
          </button>
          {summary.phases.map((p) => (
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

      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ventas del lanzamiento</span>
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Compras aprobadas" value={formatNumber(salesKpis.comprasAprobadas)} />
          <KpiCard label="Upgrades a VIP" value={formatNumber(salesKpis.upgradesVip)} color="#c084fc" />
          <KpiCard label="Order bumps" value={formatNumber(salesKpis.orderBumps)} color="#a855f7" />
          <KpiCard label="Leads gestionados" value={formatNumber(salesKpis.leadsGestionados)} color="#818cf8" />
          <KpiCard label="Ticket promedio" value={formatUsd(salesKpis.ticketPromedio)} color="#f59e0b" />
          <KpiCard label="Ingreso bruto" value={formatUsd(salesKpis.ingresoBruto)} color="#34d399" />
          <KpiCard label="Neto del productor" value={formatUsd(salesKpis.netoProductor)} color="#34d399" />
          <KpiCard label="Ingreso por upgrade" value={formatUsd(salesKpis.ingresoPorUpgrade)} color="#c084fc" />
          <KpiCard label="Ingreso por bumps" value={formatUsd(salesKpis.ingresoPorBumps)} color="#a855f7" />
          <KpiCard label="Pendiente por cobrar" value={formatUsd(salesKpis.pendientePorCobrar)} color="#f59e0b" />
          <KpiCard label="Reembolsos y disputas" value={formatUsd(salesKpis.reembolsosYDisputas)} color="#ef4444" />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <span>↳</span> Embudo de ventas
        </span>
        <div className="roi-stagger grid grid-cols-3 gap-2.5">
          <KpiCard label="Cerrada" value={formatNumber(embudoVentas.cerrada)} color="#34d399" />
          <KpiCard label="Ofertada" value={formatNumber(embudoVentas.ofertada)} color="#38bdf8" />
          <KpiCard label="No ofertada" value={formatNumber(embudoVentas.noOfertada)} color="#f59e0b" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {locationId && (
          <ObjectionsWidget
            locationId={locationId}
            from={currentRange?.startDate ?? new Date(0).toISOString()}
            to={currentRange?.endDate ?? new Date().toISOString()}
          />
        )}
        <div className="rounded-[7px] border border-border bg-panel p-5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Volumen: compras, upgrades y order bumps</span>
          <div className="mt-4">
            <VolumeChart days={salesVolume} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ranking por asesor</span>
        <div className="overflow-x-auto rounded-[7px] border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                <th className="px-4 py-3 font-medium">Responsable</th>
                <th className="px-4 py-3 font-medium">Leads</th>
                <th className="px-4 py-3 font-medium">Chats</th>
                <th className="px-4 py-3 font-medium">1ª respuesta</th>
                <th className="px-4 py-3 font-medium">Compras</th>
                <th className="px-4 py-3 font-medium">Upgrades</th>
                <th className="px-4 py-3 font-medium">Bumps</th>
                <th className="px-4 py-3 font-medium">Ingreso neto</th>
                <th className="px-4 py-3 font-medium">Conversión</th>
              </tr>
            </thead>
            <tbody>
              {salesRanking.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                    Sin ventas atribuibles a un asesor en este rango.
                  </td>
                </tr>
              )}
              {salesRanking.map((r, i) => {
                const setterInfo = settersByOwner.get(r.ownerGhlId);
                return (
                  <tr key={r.ownerGhlId} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-semibold">
                      {i === 0 && <span className="mr-1.5">🏆</span>}
                      {r.name}
                    </td>
                    <td className="px-4 py-3">{formatNumber(r.leads)}</td>
                    <td className="px-4 py-3 text-accent">{setterInfo ? formatNumber(setterInfo.atendidos) : '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{setterInfo ? formatMinutes(setterInfo.primeraRespuestaMinutosPromedio) : '—'}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatNumber(r.compras)}</td>
                    <td className="px-4 py-3 text-fuchsia-400">{formatNumber(r.upgrades)}</td>
                    <td className="px-4 py-3 text-purple-400">{formatNumber(r.bumps)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatUsd(r.ingresoNeto)}</td>
                    <td className="px-4 py-3">{r.conversionPct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
