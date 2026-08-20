import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format';
import LaunchPhaseSelector, { type LaunchWindow } from '../../components/LaunchPhaseSelector';
import NoLocationState from '../../components/NoLocationState';
import type { OutletContext } from '../AppLayout';

interface SaleRow {
  id: string;
  transactionId: string;
  productName: string | null;
  buyerEmail: string | null;
  priceValue: string;
  status: string | null;
  purchaseDate: string | null;
}

const WINDOW_HOURS = 48;

function hoursSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return (Date.now() - new Date(dateStr).getTime()) / 3_600_000;
}

export default function PagosEfectivo() {
  const { locationId } = useOutletContext<OutletContext>();
  const [window_, setWindow] = useState<LaunchWindow | null>(null);
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId || !window_) {
      setSales(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<{ items: SaleRow[] }>(`/api/hotmart/sales?locationId=${locationId}&from=${window_.from}&to=${window_.to}&status=BILLET_PRINTED&pageSize=200`)
      .then((res) => !cancelled && setSales(res.items))
      .catch(() => !cancelled && setError('No se pudieron cargar los tickets pendientes.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [locationId, window_]);

  if (!locationId) return <NoLocationState />;

  const withAge = (sales ?? []).map((s) => ({ ...s, hours: hoursSince(s.purchaseDate) })).sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0));
  const expiredCount = withAge.filter((s) => (s.hours ?? 0) > WINDOW_HOURS).length;
  const totalPending = withAge.reduce((sum, s) => sum + Number(s.priceValue), 0);

  return (
    <div className="roi-in flex flex-col gap-4">
      <LaunchPhaseSelector locationId={locationId} onChange={setWindow} />
      <p className="text-[12.5px] text-gray-500">
        Tickets/boletos de Hotmart generados (pago en efectivo/transferencia) que todavía no se confirmaron aprobados —
        el comprador tiene normalmente {WINDOW_HOURS}h para pagarlos antes de que Hotmart los venza.
      </p>

      <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Tickets pendientes</span>
          <div className="mt-1 text-[21px] font-bold text-amber-400">{formatNumber(withAge.length)}</div>
        </div>
        <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Fuera de ventana (&gt;{WINDOW_HOURS}h)</span>
          <div className="mt-1 text-[21px] font-bold text-red-400">{formatNumber(expiredCount)}</div>
        </div>
        <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Valor total pendiente</span>
          <div className="mt-1 text-[21px] font-bold text-fuchsia-400">{formatCurrency(totalPending)}</div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-[12px] text-gray-500">Cargando…</p>}

      <div className="overflow-x-auto rounded-[7px] border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-3 font-medium">Comprador</th>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Generado</th>
              <th className="px-4 py-3 font-medium">Tiempo transcurrido</th>
            </tr>
          </thead>
          <tbody>
            {withAge.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Sin tickets pendientes de pago en efectivo ahora mismo.
                </td>
              </tr>
            )}
            {withAge.map((s) => {
              const expired = (s.hours ?? 0) > WINDOW_HOURS;
              return (
                <tr key={s.id} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold">{s.buyerEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{s.productName ?? '(sin producto)'}</td>
                  <td className="px-4 py-3 text-emerald-400">{formatCurrency(Number(s.priceValue))}</td>
                  <td className="px-4 py-3 text-gray-500">{s.purchaseDate ? formatDate(s.purchaseDate) : '—'}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: expired ? '#ef4444' : '#f59e0b' }}>
                    {s.hours !== null ? `${s.hours.toFixed(1)} h${expired ? ' — vencido' : ''}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
