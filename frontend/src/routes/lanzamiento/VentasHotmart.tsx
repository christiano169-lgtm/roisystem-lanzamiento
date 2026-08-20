import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format';
import NoLocationState from '../../components/NoLocationState';
import type { OutletContext } from '../AppLayout';

interface Launch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface HotmartConnectionStatus {
  connected: boolean;
  webhookConnected: boolean;
}

interface HotmartSummary {
  revenue: number;
  salesCount: number;
  averageTicket: number;
  byProduct: Array<{ productName: string; revenue: number; salesCount: number }>;
}

interface SaleRow {
  id: string;
  transactionId: string;
  productName: string | null;
  buyerEmail: string | null;
  priceValue: string;
  currency: string | null;
  status: string | null;
  purchaseDate: string | null;
}

const STATUS_TABS = [
  { id: '', label: 'Todas' },
  { id: 'APPROVED', label: 'Aprobadas' },
  { id: 'COMPLETE', label: 'Completadas' },
  { id: 'BILLET_PRINTED', label: 'Tickets pendientes' },
  { id: 'REFUNDED', label: 'Reembolsadas' },
  { id: 'CHARGEBACK', label: 'Disputas' },
  { id: 'CANCELED', label: 'Canceladas' },
];

const STATUS_COLOR: Record<string, string> = {
  APPROVED: '#34d399',
  COMPLETE: '#34d399',
  BILLET_PRINTED: '#f59e0b',
  REFUNDED: '#ef4444',
  CHARGEBACK: '#ef4444',
  CANCELED: '#8b96a8',
};

export default function VentasHotmart() {
  const { locationId } = useOutletContext<OutletContext>();
  const [connection, setConnection] = useState<HotmartConnectionStatus | null>(null);
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<HotmartSummary | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    apiGet<HotmartConnectionStatus>(`/api/hotmart/connection?locationId=${locationId}`).then(setConnection);
    apiGet<{ launches: Launch[] }>(`/api/launches?locationId=${locationId}`).then((res) => {
      setLaunches(res.launches);
      setLaunchId((prev) => (prev && res.launches.some((l) => l.id === prev) ? prev : (res.launches[0]?.id ?? null)));
    });
  }, [locationId]);

  const activeLaunch = launches?.find((l) => l.id === launchId);
  const from = activeLaunch?.startDate;
  const to = activeLaunch?.endDate;

  useEffect(() => {
    if (!locationId || !from || !to) return;
    apiGet<HotmartSummary>(`/api/hotmart/summary?locationId=${locationId}&from=${from}&to=${to}`).then(setSummary);
  }, [locationId, from, to]);

  useEffect(() => {
    if (!locationId || !from || !to) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = `locationId=${locationId}&from=${from}&to=${to}&pageSize=100${statusFilter ? `&status=${statusFilter}` : ''}`;
    apiGet<{ items: SaleRow[] }>(`/api/hotmart/sales?${qs}`)
      .then((res) => !cancelled && setSales(res.items))
      .catch(() => !cancelled && setError('No se pudieron cargar las ventas.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to, statusFilter]);

  if (!locationId) return <NoLocationState />;

  return (
    <div className="roi-in flex flex-col gap-4">
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
            {formatDate(from)} → {formatDate(to)}
          </span>
        )}
        <span
          className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
          style={{ background: connection?.webhookConnected ? '#34d39922' : '#f59e0b22', color: connection?.webhookConnected ? '#34d399' : '#f59e0b' }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: connection?.webhookConnected ? '#34d399' : '#f59e0b' }} />
          {connection?.connected ? (connection.webhookConnected ? 'Webhook activo' : 'Conectado, sin webhook') : 'Hotmart sin conectar'}
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {summary && (
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-3">
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Ingresos aprobados</span>
            <div className="mt-1 text-[21px] font-bold text-emerald-400">{formatCurrency(summary.revenue)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Ventas aprobadas</span>
            <div className="mt-1 text-[21px] font-bold text-accent">{formatNumber(summary.salesCount)}</div>
          </div>
          <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Ticket promedio</span>
            <div className="mt-1 text-[21px] font-bold text-fuchsia-400">{formatCurrency(summary.averageTicket)}</div>
          </div>
        </div>
      )}

      {summary && summary.byProduct.length > 0 && (
        <div className="overflow-hidden rounded-[7px] border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 font-medium">Ventas</th>
                <th className="px-4 py-2.5 font-medium">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {summary.byProduct.map((p) => (
                <tr key={p.productName} className="border-t border-[#1e1e23]">
                  <td className="px-4 py-2.5 font-semibold">{p.productName}</td>
                  <td className="px-4 py-2.5 text-gray-300">{formatNumber(p.salesCount)}</td>
                  <td className="px-4 py-2.5 text-emerald-400">{formatCurrency(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setStatusFilter(t.id)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${statusFilter === t.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border2 text-gray-400 hover:bg-white/5'}`}
          >
            {t.label}
          </button>
        ))}
        {loading && <span className="self-center text-[12px] text-gray-500">Cargando…</span>}
      </div>

      <div className="overflow-x-auto rounded-[7px] border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Comprador</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Sin ventas en este rango/estado.
                </td>
              </tr>
            )}
            {sales.map((s) => (
              <tr key={s.id} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold">{s.productName ?? '(sin producto)'}</td>
                <td className="px-4 py-3 text-gray-300">{s.buyerEmail ?? '—'}</td>
                <td className="px-4 py-3 text-emerald-400">{formatCurrency(Number(s.priceValue))}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `${STATUS_COLOR[s.status ?? ''] ?? '#8b96a8'}22`, color: STATUS_COLOR[s.status ?? ''] ?? '#8b96a8' }}>
                    {s.status ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{s.purchaseDate ? formatDate(s.purchaseDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
