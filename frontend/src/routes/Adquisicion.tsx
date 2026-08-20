import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatNumber, formatPct } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import NoLocationState from '../components/NoLocationState';
import type { OutletContext } from './AppLayout';

interface AcquisitionRow {
  source: string;
  leads: number;
  llamados: number;
  contestaron: number;
  agendaron: number;
  asistieron: number;
  facturacion: number;
  tasaContactoPct: number;
  tasaAgendamientoPct: number;
  tasaAsistenciaPct: number;
  tasaCierrePct: number;
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function Adquisicion() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [rows, setRows] = useState<AcquisitionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const res = await apiGet<{ rows: AcquisitionRow[] }>(`/api/kpis/acquisition?${qs}`);
        if (!cancelled) setRows(res.rows);
      } catch {
        if (!cancelled) setError('No se pudo cargar el resumen de adquisición.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  if (!locationId) return <NoLocationState />;

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

      <div className="overflow-x-auto rounded-[7px] border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              <th className="px-4 py-3 font-medium">Llamados</th>
              <th className="px-4 py-3 font-medium">Contestaron</th>
              <th className="px-4 py-3 font-medium">Agendaron</th>
              <th className="px-4 py-3 font-medium">Asistieron</th>
              <th className="px-4 py-3 font-medium">Facturación</th>
              <th className="px-4 py-3 font-medium">Tasa contacto</th>
              <th className="px-4 py-3 font-medium">Tasa agend.</th>
              <th className="px-4 py-3 font-medium">Tasa asist.</th>
              <th className="px-4 py-3 font-medium">Tasa cierre</th>
            </tr>
          </thead>
          <tbody>
            {rows?.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-gray-500">
                  Sin leads con origen registrado en este rango.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.source} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold">{r.source}</td>
                <td className="px-4 py-3 text-accent">{formatNumber(r.leads)}</td>
                <td className="px-4 py-3 text-accent">{formatNumber(r.llamados)}</td>
                <td className="px-4 py-3">{formatNumber(r.contestaron)}</td>
                <td className="px-4 py-3 text-fuchsia-400">{formatNumber(r.agendaron)}</td>
                <td className="px-4 py-3">{formatNumber(r.asistieron)}</td>
                <td className="px-4 py-3 text-emerald-400">{formatCurrency(r.facturacion)}</td>
                <td className="px-4 py-3">{formatPct(r.tasaContactoPct)}</td>
                <td className="px-4 py-3">{formatPct(r.tasaAgendamientoPct)}</td>
                <td className="px-4 py-3">{formatPct(r.tasaAsistenciaPct)}</td>
                <td className="px-4 py-3 text-emerald-400">{formatPct(r.tasaCierrePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
