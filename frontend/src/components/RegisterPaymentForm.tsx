import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { formatCurrency } from '../lib/format';

interface OpportunityOption {
  id: string;
  name: string | null;
  monetaryValue: string | null;
}

export default function RegisterPaymentForm({ locationId, onRegistered }: { locationId: string; onRegistered: () => void }) {
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OpportunityOption | null>(null);
  const [amount, setAmount] = useState('');
  const [collectedAt, setCollectedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ items: OpportunityOption[] }>(`/api/opportunities?locationId=${locationId}&page=1&pageSize=100`)
      .then((res) => setOpportunities(res.items))
      .catch(() => setOpportunities([]));
  }, [locationId]);

  const matches = useMemo(() => {
    if (!search.trim() || selected) return [];
    const q = search.trim().toLowerCase();
    return opportunities.filter((o) => (o.name ?? '').toLowerCase().includes(q)).slice(0, 8);
  }, [search, selected, opportunities]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      setMessage('Selecciona una oportunidad de la lista.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/payments', {
        opportunityId: selected.id,
        amount: Number(amount),
        collectedAt: new Date(collectedAt).toISOString(),
        note: note.trim() || undefined,
      });
      setSelected(null);
      setSearch('');
      setAmount('');
      setNote('');
      setMessage('Pago registrado.');
      onRegistered();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[7px] border border-border bg-panel p-5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Registrar pago</span>
      <p className="mb-4 mt-1 text-[12px] text-gray-500">
        Efectivo cobrado manualmente contra una oportunidad — no hay integración de pasarela de pago todavía.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="relative">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Oportunidad</label>
          <input
            value={selected ? (selected.name ?? '(sin nombre)') : search}
            onChange={(e) => {
              setSelected(null);
              setSearch(e.target.value);
            }}
            placeholder="Buscar por nombre…"
            className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded border border-border2 bg-card shadow-lg">
              {matches.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => {
                    setSelected(o);
                    setSearch('');
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  {o.name ?? '(sin nombre)'}
                  {o.monetaryValue && <span className="ml-2 text-xs text-gray-500">{formatCurrency(Number(o.monetaryValue))}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Monto (COP)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Fecha de cobro</label>
            <input
              type="datetime-local"
              required
              value={collectedAt}
              onChange={(e) => setCollectedAt(e.target.value)}
              className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-gradient-to-r from-sky-500 to-accent px-5 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nota (opcional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
      </form>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </div>
  );
}
