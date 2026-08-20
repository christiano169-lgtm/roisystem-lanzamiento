import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatMinutes, formatNumber, formatPct } from '../lib/format';
import KpiCard from '../components/KpiCard';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import ObjectionsWidget from '../components/ObjectionsWidget';
import type { OutletContext } from './AppLayout';

interface OperationalKpis {
  leadsGenerados: number;
  llamadas: number;
  contestadas: number;
  tasaContestacionPct: number;
  tiempoAlLeadMinutosPromedio: number | null;
  intentosPromedio: number | null;
  agendadas: number;
  asistidas: number;
  ingresos: number;
  efectivoCobrado: number;
  ticketPromedio: number;
  wonCount: number;
  ofertadaCount: number;
  noOfertadaCount: number;
}

interface AdvisorRankingRow {
  ownerGhlId: string;
  name: string;
  leads: number;
  llamadas: number;
  contestadas: number;
  agendadas: number;
  asistidas: number;
  facturacion: number;
  efectivoCobrado: number;
  tasaAgendamientoPct: number;
}

interface MetaAdsSummary {
  spend: number;
  leads: number;
  costPerLead: number | null;
}

interface HotmartSummary {
  revenue: number;
  salesCount: number;
  averageTicket: number;
}

interface TagRow {
  id: string;
  name: string;
}

interface DailyVolumeRow {
  date: string;
  llamadas: number;
  citas: number;
  cierres: number;
}

type Granularity = 'dia' | 'semana' | 'quincena';

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function pctOf(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

function VolumeChart({ days, granularity, series }: { days: DailyVolumeRow[]; granularity: Granularity; series: Record<'llamadas' | 'citas' | 'cierres', boolean> }) {
  const grouped = useMemo(() => {
    if (granularity === 'dia') return days;
    const size = granularity === 'semana' ? 7 : 15;
    const out: DailyVolumeRow[] = [];
    for (let i = 0; i < days.length; i += size) {
      const chunk = days.slice(i, i + size);
      out.push({
        date: chunk[0]!.date,
        llamadas: chunk.reduce((s, d) => s + d.llamadas, 0),
        citas: chunk.reduce((s, d) => s + d.citas, 0),
        cierres: chunk.reduce((s, d) => s + d.cierres, 0),
      });
    }
    return out;
  }, [days, granularity]);

  const max = Math.max(4, ...grouped.map((d) => Math.max(series.llamadas ? d.llamadas : 0, series.citas ? d.citas : 0, series.cierres ? d.cierres : 0)));
  const COLORS = { llamadas: '#38bdf8', citas: '#e879f9', cierres: '#34d399' };

  return (
    <div className="flex gap-2.5">
      <div className="flex h-[100px] flex-col justify-between text-[11px] text-gray-500">
        <span>{Math.round(max)}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="flex-1">
        <div className="flex h-[100px] items-end gap-1 border-b border-dashed border-[#242429]">
          {grouped.map((d, i) => (
            <div key={i} className="flex flex-1 items-end gap-[1.5px]">
              {(['llamadas', 'citas', 'cierres'] as const).map((k) =>
                series[k] ? (
                  <div
                    key={k}
                    className="roi-in flex-1 rounded-t-[1px]"
                    style={{ height: `${Math.max(2, (d[k] / max) * 100)}px`, background: COLORS[k] }}
                  />
                ) : null,
              )}
            </div>
          ))}
          {grouped.length === 0 && <span className="pb-2 text-[12px] text-gray-600">Sin actividad en el rango.</span>}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-gray-500">
          {grouped.length > 0 && (
            <>
              <span>{grouped[0]!.date}</span>
              <span>{grouped[grouped.length - 1]!.date}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [tags, setTags] = useState<TagRow[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [gran, setGran] = useState<Granularity>('dia');
  const [series, setSeries] = useState({ llamadas: true, citas: true, cierres: true });

  const [kpis, setKpis] = useState<OperationalKpis | null>(null);
  const [ranking, setRanking] = useState<AdvisorRankingRow[] | null>(null);
  const [volume, setVolume] = useState<DailyVolumeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaAds, setMetaAds] = useState<MetaAdsSummary | null>(null);
  const [hotmart, setHotmart] = useState<HotmartSummary | null>(null);

  useEffect(() => {
    apiGet<{ tags: TagRow[] }>(`/api/tags?locationId=${locationId}`).then((res) => setTags(res.tags));
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const tagsQs = activeTags.length ? `&tags=${encodeURIComponent(activeTags.join(','))}` : '';
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}${tagsQs}`;
      try {
        const [k, r, v] = await Promise.all([
          apiGet<OperationalKpis>(`/api/kpis/operational?${qs}`),
          apiGet<{ ranking: AdvisorRankingRow[] }>(`/api/kpis/ranking?${qs}`),
          apiGet<{ days: DailyVolumeRow[] }>(`/api/kpis/volume?${qs}`),
        ]);
        if (cancelled) return;
        setKpis(k);
        setRanking(r.ranking);
        setVolume(v.days);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los KPIs. Verifica que la subcuenta ya tenga datos sincronizados.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to, activeTags]);

  useEffect(() => {
    let cancelled = false;
    const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
    // Marketing widgets are best-effort/optional — a tenant with no Meta
    // Ads/Hotmart connection just won't see this section, so failures here
    // shouldn't surface an error banner like the core KPIs above do.
    Promise.all([apiGet<{ connected: boolean }>(`/api/meta-ads/connection?locationId=${locationId}`), apiGet<MetaAdsSummary>(`/api/meta-ads/summary?${qs}`)])
      .then(([status, summary]) => {
        if (!cancelled) setMetaAds(status.connected ? summary : null);
      })
      .catch(() => {
        if (!cancelled) setMetaAds(null);
      });
    Promise.all([apiGet<{ connected: boolean }>(`/api/hotmart/connection?locationId=${locationId}`), apiGet<HotmartSummary>(`/api/hotmart/summary?${qs}`)])
      .then(([status, summary]) => {
        if (!cancelled) setHotmart(status.connected ? summary : null);
      })
      .catch(() => {
        if (!cancelled) setHotmart(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  function toggleTag(name: string) {
    setActiveTags((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  return (
    <div className="roi-in flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RangePicker
          range={range}
          from={from}
          to={to}
          loading={loading}
          onChange={(r, f, t) => {
            setRange(r);
            setFrom(f);
            setTo(t);
          }}
        />
        {tags.length > 0 && (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Etiquetas:</span>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = activeTags.includes(t.name);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[10.5px] font-semibold ${
                      on ? 'border-accent/45 bg-accent/15 text-accent' : 'border-border2 bg-[#151519] text-gray-300'
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {kpis && (
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Kpis operativos</div>
          <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Leads generados" value={formatNumber(kpis.leadsGenerados)} />
            <KpiCard label="Llamadas" value={formatNumber(kpis.llamadas)} />
            <KpiCard label="Contestadas" value={formatNumber(kpis.contestadas)} sub={`Tasa ${formatPct(kpis.tasaContestacionPct)}`} accent="#f2f6fb" />
            <KpiCard label="Tiempo al lead" value={formatMinutes(kpis.tiempoAlLeadMinutosPromedio)} accent="#c084fc" />
            <KpiCard label="Intentos promedio" value={kpis.intentosPromedio !== null ? kpis.intentosPromedio.toFixed(1) : '—'} accent="#f59e0b" />
            <KpiCard label="Ingresos" value={formatCurrency(kpis.ingresos)} accent="#34d399" />
          </div>
          <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <KpiCard label="Efectivo cobrado" value={formatCurrency(kpis.efectivoCobrado)} accent="#34d399" />
            <KpiCard label="Ticket promedio" value={formatCurrency(kpis.ticketPromedio)} accent="#22d3ee" />
          </div>
        </div>
      )}

      {kpis && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Embudo de ventas</span>
          <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <KpiCard label="Cerrada" value={formatNumber(kpis.wonCount)} sub={`${formatPct(pctOf(kpis.wonCount, kpis.leadsGenerados))} del total`} accent="#34d399" />
            <KpiCard label="Ofertada" value={formatNumber(kpis.ofertadaCount)} sub={`${formatPct(pctOf(kpis.ofertadaCount, kpis.leadsGenerados))} del total`} accent="#22d3ee" />
            <KpiCard label="No ofertada" value={formatNumber(kpis.noOfertadaCount)} sub={`${formatPct(pctOf(kpis.noOfertadaCount, kpis.leadsGenerados))} del total`} accent="#f59e0b" />
          </div>
        </div>
      )}

      {(metaAds || hotmart) && (
        <div className="roi-stagger grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {metaAds && (
            <>
              <KpiCard label="Inversión Meta Ads" value={formatCurrency(metaAds.spend)} accent="#818cf8" />
              <KpiCard label="Leads (Meta Ads)" value={formatNumber(metaAds.leads)} accent="#818cf8" />
              <KpiCard label="Costo por lead" value={metaAds.costPerLead !== null ? formatCurrency(metaAds.costPerLead) : '—'} accent="#818cf8" />
            </>
          )}
          {hotmart && (
            <>
              <KpiCard label="Ingresos Hotmart" value={formatCurrency(hotmart.revenue)} accent="#fb923c" />
              <KpiCard label="Ventas Hotmart" value={formatNumber(hotmart.salesCount)} accent="#fb923c" />
              <KpiCard label="Ticket Hotmart" value={formatCurrency(hotmart.averageTicket)} accent="#fb923c" />
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ObjectionsWidget locationId={locationId} from={from} to={to} />

        <div className="flex flex-col gap-3 rounded-[7px] border border-border bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Volumen: llamadas, citas y cierres</span>
            <div className="flex gap-1.5">
              {(
                [
                  ['dia', 'Día'],
                  ['semana', 'Semana'],
                  ['quincena', 'Quincena'],
                ] as [Granularity, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setGran(id)}
                  className={`rounded px-2.5 py-1 text-[10.5px] font-semibold ${gran === id ? 'bg-accent/15 text-accent' : 'bg-card text-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <VolumeChart days={volume} granularity={gran} series={series} />
          <div className="mt-1 flex flex-wrap justify-center gap-4 text-[11px] text-gray-300">
            {(
              [
                ['llamadas', 'Llamadas', '#38bdf8'],
                ['citas', 'Citas', '#e879f9'],
                ['cierres', 'Cierres', '#34d399'],
              ] as [keyof typeof series, string, string][]
            ).map(([key, label, color]) => (
              <button
                key={key}
                onClick={() => setSeries((s) => ({ ...s, [key]: !s[key] }))}
                className="flex items-center gap-1.5"
                style={{ opacity: series[key] ? 1 : 0.35 }}
              >
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
                {label}
                <span className="font-semibold text-gray-500">{formatNumber(volume.reduce((s, d) => s + d[key], 0))}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {ranking && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ranking por asesor</span>
          <div className="overflow-hidden rounded-[7px] border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                  <th className="px-4 py-3 font-medium">Asesor</th>
                  <th className="px-4 py-3 font-medium">Leads</th>
                  <th className="px-4 py-3 font-medium">Llamadas</th>
                  <th className="px-4 py-3 font-medium">Agendadas</th>
                  <th className="px-4 py-3 font-medium">Asistidas</th>
                  <th className="px-4 py-3 font-medium">Facturación</th>
                  <th className="px-4 py-3 font-medium">Efectivo</th>
                  <th className="px-4 py-3 font-medium">Tasa agend.</th>
                </tr>
              </thead>
              <tbody>
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                      Sin datos para este rango todavía.
                    </td>
                  </tr>
                )}
                {ranking.map((row) => (
                  <tr key={row.ownerGhlId} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-semibold">
                      <Link to={`/app/advisor/${row.ownerGhlId}`} className="hover:text-accent hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatNumber(row.leads)}</td>
                    <td className="px-4 py-3 text-accent">{formatNumber(row.llamadas)}</td>
                    <td className="px-4 py-3 text-fuchsia-400">{formatNumber(row.agendadas)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatNumber(row.asistidas)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatCurrency(row.facturacion)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatCurrency(row.efectivoCobrado)}</td>
                    <td className="px-4 py-3">{formatPct(row.tasaAgendamientoPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
