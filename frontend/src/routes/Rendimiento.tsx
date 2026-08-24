import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { formatDateOnly, formatNumber, formatUsd } from '../lib/format';
import type { OutletContext } from './AppLayout';

interface ComparisonRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'closed';
  comprasAprobadas: number;
  ingresoBruto: number;
  netoProductor: number;
  ticketPromedio: number;
  leadsGestionados: number;
  conversionPct: number;
  aprobadasPlus: number;
  aprobadasGeneral: number;
}

const STATUS_LABEL: Record<ComparisonRow['status'], string> = { planned: 'Planeado', active: 'Activo', closed: 'Cerrado' };
const STATUS_COLOR: Record<ComparisonRow['status'], string> = { planned: '#818cf8', active: '#34d399', closed: '#8b96a8' };

function RevenueBars({ rows }: { rows: ComparisonRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.ingresoBruto));
  return (
    <div className="rounded-[7px] border border-border bg-panel p-5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ingreso bruto por lanzamiento</span>
      <div className="mt-4 flex flex-col gap-2.5">
        {rows.length === 0 && <span className="text-[12px] text-gray-600">Sin lanzamientos todavía.</span>}
        {[...rows].reverse().map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-[12px] text-gray-400">{r.name}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-white/5">
              <div className="roi-in h-full rounded-sm bg-gradient-to-r from-sky-500 to-accent" style={{ width: `${(r.ingresoBruto / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-[12px] font-semibold text-emerald-400">{formatUsd(r.ingresoBruto)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Rendimiento() {
  const { locationId } = useOutletContext<OutletContext>();
  const [rows, setRows] = useState<ComparisonRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<{ rows: ComparisonRow[] }>(`/api/launches/comparison?locationId=${locationId}`)
      .then((res) => {
        if (!cancelled) setRows(res.rows);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el rendimiento.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const list = rows ?? [];
  const noLaunchesYet = rows !== null && rows.length === 0;

  return (
    <div className="roi-in flex flex-col gap-4">
      {noLaunchesYet && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
          <span className="text-amber-300">Todavía no hay ningún lanzamiento creado — creá al menos dos para comparar rendimiento.</span>
          <Link to="/app/settings" className="shrink-0 rounded border border-amber-700 px-3 py-1.5 text-amber-200 hover:bg-amber-900/40">
            Ir a Configuración
          </Link>
        </div>
      )}
      {loading && <span className="text-[12px] text-gray-500">Cargando…</span>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <RevenueBars rows={list} />

      <div className="overflow-x-auto rounded-[7px] border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-3 font-medium">Lanzamiento</th>
              <th className="px-4 py-3 font-medium">Fechas</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              <th className="px-4 py-3 font-medium">Compras (Plus / General)</th>
              <th className="px-4 py-3 font-medium">Conversión</th>
              <th className="px-4 py-3 font-medium">Ticket promedio</th>
              <th className="px-4 py-3 font-medium">Ingreso bruto</th>
              <th className="px-4 py-3 font-medium">Neto productor</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  Sin lanzamientos todavía.
                </td>
              </tr>
            )}
            {list.map((r) => (
              <tr key={r.id} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {formatDateOnly(r.startDate)} → {formatDateOnly(r.endDate)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `${STATUS_COLOR[r.status]}22`, color: STATUS_COLOR[r.status] }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3">{formatNumber(r.leadsGestionados)}</td>
                <td className="px-4 py-3">
                  {formatNumber(r.aprobadasPlus)} / {formatNumber(r.aprobadasGeneral)}
                </td>
                <td className="px-4 py-3">{r.conversionPct.toFixed(1)}%</td>
                <td className="px-4 py-3">{formatUsd(r.ticketPromedio)}</td>
                <td className="px-4 py-3 text-emerald-400">{formatUsd(r.ingresoBruto)}</td>
                <td className="px-4 py-3 text-emerald-400">{formatUsd(r.netoProductor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
