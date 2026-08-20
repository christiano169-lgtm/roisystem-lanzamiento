import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { daysAgoISODate, formatMinutes, formatNumber } from '../../lib/format';
import RangePicker, { type RangePreset } from '../../components/RangePicker';
import type { OutletContext } from '../AppLayout';

interface SetterRow {
  ownerGhlId: string;
  name: string;
  assignados: number;
  atendidos: number;
  pendientes: number;
  primeraRespuestaMinutosPromedio: number | null;
  citas: number;
  calidadIaPromedio: number | null;
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function qualityColor(score: number): string {
  if (score >= 8) return '#34d399';
  if (score >= 6) return '#f59e0b';
  return '#ef4444';
}

export default function Setters() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [rows, setRows] = useState<SetterRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const res = await apiGet<{ summary: SetterRow[] }>(`/api/setters/summary?${qs}`);
        if (!cancelled) setRows(res.summary);
      } catch {
        if (!cancelled) setError('No se pudo cargar la productividad de setters.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  const totals = rows?.reduce(
    (acc, r) => ({ assignados: acc.assignados + r.assignados, atendidos: acc.atendidos + r.atendidos, pendientes: acc.pendientes + r.pendientes, citas: acc.citas + r.citas }),
    { assignados: 0, atendidos: 0, pendientes: 0, citas: 0 },
  );

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

      {totals && (
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Chats asignados</span>
            <div className="mt-1 text-[21px] font-bold text-accent">{formatNumber(totals.assignados)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Atendidos</span>
            <div className="mt-1 text-[21px] font-bold text-emerald-400">{formatNumber(totals.atendidos)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Pendientes</span>
            <div className="mt-1 text-[21px] font-bold text-red-400">{formatNumber(totals.pendientes)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Citas generadas</span>
            <div className="mt-1 text-[21px] font-bold text-fuchsia-400">{formatNumber(totals.citas)}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Productividad por setter</span>
        <div className="overflow-hidden rounded-[7px] border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                <th className="px-4 py-3 font-medium">Setter</th>
                <th className="px-4 py-3 font-medium">Asignados</th>
                <th className="px-4 py-3 font-medium">Atendidos</th>
                <th className="px-4 py-3 font-medium">Pendientes</th>
                <th className="px-4 py-3 font-medium">1ª respuesta</th>
                <th className="px-4 py-3 font-medium">Citas</th>
                <th className="px-4 py-3 font-medium">Calidad IA</th>
              </tr>
            </thead>
            <tbody>
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    Sin chats asignados en este rango todavía.
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.ownerGhlId} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-accent">{formatNumber(r.assignados)}</td>
                  <td className="px-4 py-3 text-emerald-400">{formatNumber(r.atendidos)}</td>
                  <td className="px-4 py-3" style={{ color: r.pendientes > 5 ? '#ef4444' : '#f59e0b' }}>
                    {formatNumber(r.pendientes)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{formatMinutes(r.primeraRespuestaMinutosPromedio)}</td>
                  <td className="px-4 py-3 text-fuchsia-400">{formatNumber(r.citas)}</td>
                  <td className="px-4 py-3">
                    {r.calidadIaPromedio !== null ? (
                      <span className="font-bold" style={{ color: qualityColor(r.calidadIaPromedio) }}>
                        {r.calidadIaPromedio.toFixed(1)}/10
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
