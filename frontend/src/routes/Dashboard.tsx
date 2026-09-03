import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { formatDateOnly, formatMinutes, formatNumber, formatUsd } from '../lib/format';
import ObjectionsWidget from '../components/ObjectionsWidget';
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

interface StatusBreakdownBucket {
  plus: number;
  general: number;
}

interface LaunchStatusBreakdown {
  aprobadas: StatusBreakdownBucket;
  abandonados: StatusBreakdownBucket;
  canceladas: StatusBreakdownBucket;
  ticketsEmitidos: StatusBreakdownBucket;
  recovery: { total: number; recuperados: number; pendientes: number };
}

interface TribeRow {
  tagName: string;
  label: string;
  count: number;
}

interface CountryRow {
  country: string;
  count: number;
}

interface LaunchSummary {
  launch: Launch;
  phases: Phase[];
  embudoVentas: { cerrada: number; ofertada: number; noOfertada: number };
  salesKpis: SalesKpis;
  salesVolume: SalesVolumeRow[];
  salesRanking: SalesRankingRow[];
  statusBreakdown: LaunchStatusBreakdown;
  tribes: TribeRow[];
  countries: CountryRow[];
  setters: SetterRow[];
}

// Validated dark-mode categorical palette (see dataviz skill / references/palette.md)
// — slots 1-3 (blue/orange/aqua) clear every adjacent AND all-pairs CVD gate, so
// they're safe together in the same legend. The previous sky-blue/fuchsia pair
// used here had a deutan ΔE of 0.3 (effectively indistinguishable).
const SERIES = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500', magenta: '#d55181', violet: '#9085e9', red: '#e66767' };

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const accent = color ?? SERIES.blue;
  return (
    <div className="group relative overflow-hidden rounded-[10px] border border-border bg-panel px-4 py-3.5 transition-colors hover:border-[color:var(--accent,theme(colors.border2))]" style={{ ['--accent' as string]: `${accent}55` }}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1.5 text-[22px] font-bold leading-none tracking-tight" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function VolumeChart({ days }: { days: SalesVolumeRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...days.map((d) => Math.max(d.compras, d.upgrades, d.orderBumps)));
  const COLORS = { compras: SERIES.blue, upgrades: SERIES.orange, orderBumps: SERIES.aqua };
  const hovered = hover !== null ? days[hover] : null;

  return (
    <div className="flex gap-2.5">
      <div className="flex h-[110px] flex-col justify-between text-[11px] text-gray-500">
        <span>{Math.round(max)}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="relative flex-1">
        {hovered && (
          <div className="roi-in pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-md border border-border2 bg-[#0e0e11] px-3 py-2 text-[11px] shadow-xl" style={{ left: `${((hover! + 0.5) / Math.max(1, days.length)) * 100}%`, transform: 'translate(-50%, -100%)' }}>
            <div className="mb-1 font-semibold text-gray-300">{hovered.date}</div>
            <div className="flex items-center gap-1.5" style={{ color: COLORS.compras }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS.compras }} /> Compras: {hovered.compras}
            </div>
            <div className="flex items-center gap-1.5" style={{ color: COLORS.upgrades }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS.upgrades }} /> Upgrades: {hovered.upgrades}
            </div>
            <div className="flex items-center gap-1.5" style={{ color: COLORS.orderBumps }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS.orderBumps }} /> Order bumps: {hovered.orderBumps}
            </div>
          </div>
        )}
        <div className="flex h-[110px] items-end gap-1 border-b border-dashed border-[#242429]">
          {days.map((d, i) => (
            <div
              key={i}
              className="flex flex-1 items-end gap-[1.5px] rounded-sm py-0.5 transition-colors"
              style={{ background: hover === i ? '#ffffff08' : 'transparent' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            >
              <div className="roi-in flex-1 rounded-t-[2px]" style={{ height: `${Math.max(2, (d.compras / max) * 100)}px`, background: COLORS.compras }} />
              <div className="roi-in flex-1 rounded-t-[2px]" style={{ height: `${Math.max(2, (d.upgrades / max) * 100)}px`, background: COLORS.upgrades }} />
              <div className="roi-in flex-1 rounded-t-[2px]" style={{ height: `${Math.max(2, (d.orderBumps / max) * 100)}px`, background: COLORS.orderBumps }} />
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

function StatusBreakdownCard({ label, bucket, color }: { label: string; bucket: StatusBreakdownBucket; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-border bg-panel px-4 py-3.5">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1.5 flex items-baseline gap-3">
        <div>
          <span className="text-[22px] font-bold leading-none" style={{ color }}>
            {formatNumber(bucket.plus)}
          </span>
          <span className="ml-1 text-[10px] text-gray-500">Plus</span>
        </div>
        <div>
          <span className="text-[17px] font-semibold leading-none text-gray-300">{formatNumber(bucket.general)}</span>
          <span className="ml-1 text-[10px] text-gray-500">General</span>
        </div>
      </div>
    </div>
  );
}

function HorizontalBarChart({ title, rows, emptyLabel }: { title: string; rows: { label: string; count: number }[]; emptyLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="rounded-[7px] border border-border bg-panel p-5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</span>
      <div className="mt-4 flex flex-col gap-2.5">
        {rows.length === 0 && <span className="text-[12px] text-gray-600">{emptyLabel}</span>}
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[12px] text-gray-400">{r.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-white/5">
              <div className="roi-in h-full rounded-sm bg-gradient-to-r from-sky-500 to-accent" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-[12px] font-semibold text-gray-300">{formatNumber(r.count)}</span>
            <span className="w-12 shrink-0 text-right text-[11px] text-gray-500">{total > 0 ? `${((r.count / total) * 100).toFixed(1)}%` : '—'}</span>
          </div>
        ))}
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
  const zeroBucket: StatusBreakdownBucket = { plus: 0, general: 0 };
  const statusBreakdown =
    summary?.statusBreakdown ?? { aprobadas: zeroBucket, abandonados: zeroBucket, canceladas: zeroBucket, ticketsEmitidos: zeroBucket, recovery: { total: 0, recuperados: 0, pendientes: 0 } };
  const tribes = summary?.tribes ?? [];
  const countries = summary?.countries ?? [];
  const noLocation = !locationId;
  const noLaunchesYet = !noLocation && launches !== null && launches.length === 0;

  return (
    <div className="roi-in flex flex-col gap-4">
      {noLocation && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
          <span className="text-amber-300">
            Todavía no hay ninguna subcuenta de GHL conectada — lo de abajo está en 0. Conectala en Configuración → "Conexión GHL".
          </span>
          <Link to="/app/settings" className="shrink-0 rounded border border-amber-700 px-3 py-1.5 text-amber-200 hover:bg-amber-900/40">
            Ir a Configuración
          </Link>
        </div>
      )}

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
            {formatDateOnly(currentRange.startDate)} → {formatDateOnly(currentRange.endDate)}
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
          <KpiCard label="Compras aprobadas" value={formatNumber(salesKpis.comprasAprobadas)} color={SERIES.aqua} />
          <KpiCard label="Upgrades a VIP" value={formatNumber(salesKpis.upgradesVip)} color={SERIES.violet} />
          <KpiCard label="Order bumps" value={formatNumber(salesKpis.orderBumps)} color={SERIES.magenta} />
          <KpiCard label="Leads gestionados" value={formatNumber(salesKpis.leadsGestionados)} color={SERIES.blue} />
          <KpiCard label="Ticket promedio" value={formatUsd(salesKpis.ticketPromedio)} color={SERIES.yellow} />
          <KpiCard label="Ingreso bruto" value={formatUsd(salesKpis.ingresoBruto)} color={SERIES.aqua} />
          <KpiCard label="Neto del productor" value={formatUsd(salesKpis.netoProductor)} color={SERIES.aqua} />
          <KpiCard label="Ingreso por upgrade" value={formatUsd(salesKpis.ingresoPorUpgrade)} color={SERIES.violet} />
          <KpiCard label="Ingreso por bumps" value={formatUsd(salesKpis.ingresoPorBumps)} color={SERIES.magenta} />
          <KpiCard label="Pendiente por cobrar" value={formatUsd(salesKpis.pendientePorCobrar)} color={SERIES.yellow} />
          <KpiCard label="Reembolsos y disputas" value={formatUsd(salesKpis.reembolsosYDisputas)} color={SERIES.red} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <span>↳</span> Embudo de ventas
        </span>
        <div className="roi-stagger grid grid-cols-3 gap-2.5">
          <KpiCard label="Cerrada" value={formatNumber(embudoVentas.cerrada)} color={SERIES.aqua} />
          <KpiCard label="Ofertada" value={formatNumber(embudoVentas.ofertada)} color={SERIES.blue} />
          <KpiCard label="No ofertada" value={formatNumber(embudoVentas.noOfertada)} color={SERIES.yellow} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <span>↳</span> Dinero sobre la mesa
        </span>
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatusBreakdownCard label="Compras aprobadas" bucket={statusBreakdown.aprobadas} color={SERIES.aqua} />
          <StatusBreakdownCard label="Carritos abandonados" bucket={statusBreakdown.abandonados} color={SERIES.yellow} />
          <StatusBreakdownCard label="Canceladas" bucket={statusBreakdown.canceladas} color={SERIES.red} />
          <StatusBreakdownCard label="Ticket pago en efectivo" bucket={statusBreakdown.ticketsEmitidos} color={SERIES.blue} />
        </div>
        <div className="rounded-[7px] border border-border bg-panel px-4 py-3 text-[13px]">
          De <span className="font-bold text-amber-400">{formatNumber(statusBreakdown.recovery.total)}</span> personas con dinero sobre la mesa
          (canceladas + abandonados + ticket en efectivo),{' '}
          <span className="font-bold text-emerald-400">{formatNumber(statusBreakdown.recovery.recuperados)}</span> ya completaron la compra y{' '}
          <span className="font-bold text-red-400">{formatNumber(statusBreakdown.recovery.pendientes)}</span> todavía no.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <HorizontalBarChart
          title="Leads por tribu"
          rows={tribes.map((t) => ({ label: t.label, count: t.count }))}
          emptyLabel="Sin tribus configuradas — mapealas en Configuración → Lanzamientos → Tribus."
        />
        <HorizontalBarChart
          title="Leads por país"
          rows={countries.slice(0, 10).map((c) => ({ label: c.country, count: c.count }))}
          emptyLabel="Sin datos de país todavía."
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {locationId && (
          <ObjectionsWidget
            locationId={locationId}
            // ObjectionsWidget expects a plain yyyy-mm-dd date (it appends
            // its own time-of-day before parsing) — currentRange's dates are
            // full ISO datetimes, so they need truncating or the parse blows
            // up with "Invalid time value" (this crashed the whole page in
            // production once real launch dates started flowing through).
            from={(currentRange?.startDate ?? new Date(0).toISOString()).slice(0, 10)}
            to={(currentRange?.endDate ?? new Date().toISOString()).slice(0, 10)}
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
