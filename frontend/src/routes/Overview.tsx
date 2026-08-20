import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatNumber } from '../lib/format';
import KpiCard from '../components/KpiCard';
import RangePicker, { type RangePreset } from '../components/RangePicker';

interface OperationalKpis {
  leadsGenerados: number;
  ingresos: number;
  efectivoCobrado: number;
  ticketPromedio: number;
}

interface LocationRow {
  locationId: string;
  locationName: string;
  kpis: OperationalKpis;
}

interface MultiLocationResponse {
  totals: OperationalKpis;
  byLocation: LocationRow[];
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function Overview() {
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [data, setData] = useState<MultiLocationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const res = await apiGet<MultiLocationResponse>(`/api/kpis/operational-multi?${qs}`);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setError('No se pudo cargar el resumen de todas las subcuentas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

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

      {data && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Totales de la agencia</span>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <KpiCard label="Leads generados" value={formatNumber(data.totals.leadsGenerados)} />
            <KpiCard label="Ingresos" value={formatCurrency(data.totals.ingresos)} accent="#34d399" />
            <KpiCard label="Efectivo cobrado" value={formatCurrency(data.totals.efectivoCobrado)} accent="#34d399" />
            <KpiCard label="Ticket promedio" value={formatCurrency(data.totals.ticketPromedio)} accent="#22d3ee" />
          </div>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Por subcuenta</span>
          <div className="overflow-hidden rounded-[7px] border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                  <th className="px-4 py-3 font-medium">Subcuenta</th>
                  <th className="px-4 py-3 font-medium">Leads</th>
                  <th className="px-4 py-3 font-medium">Ingresos</th>
                  <th className="px-4 py-3 font-medium">Efectivo</th>
                </tr>
              </thead>
              <tbody>
                {data.byLocation.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      No hay subcuentas conectadas todavía.
                    </td>
                  </tr>
                )}
                {data.byLocation.map((row) => (
                  <tr key={row.locationId} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-semibold">{row.locationName}</td>
                    <td className="px-4 py-3">{formatNumber(row.kpis.leadsGenerados)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatCurrency(row.kpis.ingresos)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatCurrency(row.kpis.efectivoCobrado)}</td>
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
