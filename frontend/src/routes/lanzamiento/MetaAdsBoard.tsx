import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { daysAgoISODate, formatCurrency, formatNumber, formatPct } from '../../lib/format';
import KpiCard from '../../components/KpiCard';
import RangePicker, { type RangePreset } from '../../components/RangePicker';
import type { OutletContext } from '../AppLayout';

interface MetaAdsSummary {
  spend: number;
  leads: number;
  costPerLead: number | null;
  clicks: number;
  impressions: number;
  ctr: number;
  byCampaign: { campaignId: string; campaignName: string | null; spend: number; leads: number }[];
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function MetaAdsBoard() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));

  const [connected, setConnected] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<MetaAdsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ connected: boolean }>(`/api/meta-ads/connection?locationId=${locationId}`).then((res) => setConnected(res.connected));
  }, [locationId]);

  useEffect(() => {
    if (connected !== true) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const res = await apiGet<MetaAdsSummary>(`/api/meta-ads/summary?${qs}`);
        if (!cancelled) setSummary(res);
      } catch {
        if (!cancelled) setError('No se pudo cargar el resumen de Meta Ads.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, connected, from, to]);

  if (connected === false) {
    return (
      <div className="roi-in flex flex-col gap-4">
        <div className="rounded-[7px] border border-border bg-panel p-8 text-center">
          <h2 className="mb-2 text-[16px] font-semibold">Meta Ads no está conectado en esta subcuenta</h2>
          <p className="text-[13px] text-gray-500">
            Ve a Configuración → Meta Ads para conectar la cuenta publicitaria y ver inversión, leads y campañas aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="roi-in flex flex-col gap-4">
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      {summary && (
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Inversión" value={formatCurrency(summary.spend)} accent="#f59e0b" />
          <KpiCard label="Leads" value={formatNumber(summary.leads)} accent="#38bdf8" />
          <KpiCard label="Costo por lead" value={summary.costPerLead !== null ? formatCurrency(summary.costPerLead) : '—'} accent="#818cf8" />
          <KpiCard label="Clics" value={formatNumber(summary.clicks)} accent="#22d3ee" />
          <KpiCard label="Impresiones" value={formatNumber(summary.impressions)} accent="#e879f9" />
          <KpiCard label="CTR" value={formatPct(summary.ctr)} accent="#34d399" />
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Campañas</span>
        <div className="overflow-hidden rounded-[7px] border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                <th className="px-4 py-3 font-medium">Campaña</th>
                <th className="px-4 py-3 font-medium">Inversión</th>
                <th className="px-4 py-3 font-medium">Leads</th>
                <th className="px-4 py-3 font-medium">Costo por lead</th>
              </tr>
            </thead>
            <tbody>
              {(!summary || summary.byCampaign.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Sin datos de campañas en este rango todavía.
                  </td>
                </tr>
              )}
              {summary?.byCampaign.map((c) => (
                <tr key={c.campaignId} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold">{c.campaignName ?? c.campaignId}</td>
                  <td className="px-4 py-3 text-gray-300">{formatCurrency(c.spend)}</td>
                  <td className="px-4 py-3 text-accent">{formatNumber(c.leads)}</td>
                  <td className="px-4 py-3 text-gray-300">{c.leads > 0 ? formatCurrency(c.spend / c.leads) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
