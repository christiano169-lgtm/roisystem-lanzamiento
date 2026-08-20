import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatDate } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import RegisterPaymentForm from '../components/RegisterPaymentForm';
import type { OutletContext } from './AppLayout';

interface Payment {
  id: string;
  amount: string;
  collectedAt: string;
  note: string | null;
  opportunity: { name: string | null; ownerGhlId: string | null };
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function Payments() {
  const { locationId } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const { payments: rows } = await apiGet<{ payments: Payment[] }>(`/api/payments?${qs}`);
        if (!cancelled) setPayments(rows);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los pagos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to, refreshKey]);

  const canRegister = user?.role === 'admin' || user?.role === 'manager';
  const total = payments?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  return (
    <div className="roi-in flex flex-col gap-4">
      {canRegister && <RegisterPaymentForm locationId={locationId} onRegistered={() => setRefreshKey((k) => k + 1)} />}

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
        {payments && (
          <span className="ml-auto rounded-md border border-border2 bg-card px-4 py-2 text-[13px] text-gray-400">
            Total: <span className="font-bold text-emerald-400">{formatCurrency(total)}</span>
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {payments && (
        <div className="overflow-hidden rounded-[7px] border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                <th className="px-4 py-3 font-medium">Oportunidad</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Fecha de cobro</th>
                <th className="px-4 py-3 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Sin pagos registrados en este rango.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold">{p.opportunity.name ?? '(sin nombre)'}</td>
                  <td className="px-4 py-3 text-emerald-400">{formatCurrency(Number(p.amount))}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(p.collectedAt)}</td>
                  <td className="px-4 py-3 text-gray-400">{p.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
