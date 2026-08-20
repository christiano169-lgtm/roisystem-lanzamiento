import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet, apiPatch, ApiError } from '../lib/api';
import { daysAgoISODate, formatNumber } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import Modal from '../components/Modal';
import NoLocationState from '../components/NoLocationState';
import type { OutletContext } from './AppLayout';

interface ContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  source: string | null;
  ownerGhlId: string | null;
  ghlCreatedAt: string | null;
  opportunities: { pipelineStage: { stageName: string } | null }[];
}

interface GhlUser {
  ghlUserId: string;
  name: string;
}

interface Message {
  id: string;
  direction: string | null;
  body: string | null;
  ghlCreatedAt: string | null;
}

interface ConversationResponse {
  conversation: { id: string; messages: Message[] } | null;
}

type Filter = 'todos' | 'sin' | 'sla';

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function waitLabel(ghlCreatedAt: string | null): { label: string; minutes: number } {
  if (!ghlCreatedAt) return { label: '—', minutes: 0 };
  const minutes = Math.round((Date.now() - new Date(ghlCreatedAt).getTime()) / 60000);
  if (minutes < 60) return { label: `${minutes} min`, minutes };
  if (minutes < 60 * 24) return { label: `${Math.round(minutes / 60)} h`, minutes };
  return { label: `${Math.round(minutes / (60 * 24))} d`, minutes };
}

function ConversationModal({ contact, onClose }: { contact: ContactRow; onClose: () => void }) {
  const [data, setData] = useState<ConversationResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ConversationResponse>(`/api/contacts/${contact.id}/conversation`)
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setData({ conversation: null }));
    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '(sin nombre)';

  return (
    <Modal title={`Conversación — ${name}`} onClose={onClose}>
      {!data && <p className="text-[13px] text-gray-500">Cargando…</p>}
      {data && !data.conversation && <p className="text-[13px] text-gray-500">Sin conversación registrada para este contacto.</p>}
      {data?.conversation && data.conversation.messages.length === 0 && <p className="text-[13px] text-gray-500">La conversación existe pero no tiene mensajes sincronizados.</p>}
      {data?.conversation && (
        <div className="flex flex-col gap-2.5">
          {data.conversation.messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3.5 py-2.5 text-[13px] ${m.direction === 'outbound' ? 'bg-accent/15 text-accent' : 'bg-card text-gray-200'}`}
              >
                <p>{m.body ?? <span className="italic text-gray-500">(sin texto — adjunto o llamada)</span>}</p>
                {m.ghlCreatedAt && <p className="mt-1 text-[10px] text-gray-500">{new Date(m.ghlCreatedAt).toLocaleString('es-CO')}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Bandeja() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [filter, setFilter] = useState<Filter>('todos');
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [owners, setOwners] = useState<GhlUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openConversationFor, setOpenConversationFor] = useState<ContactRow | null>(null);

  useEffect(() => {
    if (!locationId) return;
    apiGet<{ users: GhlUser[] }>(`/api/ghl-users?locationId=${locationId}`).then((res) => setOwners(res.users));
  }, [locationId]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}&pageSize=200`;
      try {
        const res = await apiGet<{ items: ContactRow[] }>(`/api/contacts?${qs}`);
        if (!cancelled) setContacts(res.items.filter((c) => c.opportunities.length === 0));
      } catch {
        if (!cancelled) setError('No se pudo cargar la bandeja.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  const ownerName = useMemo(() => {
    const map = new Map(owners.map((o) => [o.ghlUserId, o.name]));
    return (id: string | null) => (id ? (map.get(id) ?? id) : null);
  }, [owners]);

  const rows = contacts
    .map((c) => ({ ...c, wait: waitLabel(c.ghlCreatedAt) }))
    .filter((c) => {
      if (filter === 'sin') return !c.ownerGhlId;
      if (filter === 'sla') return c.wait.minutes > 30;
      return true;
    })
    .sort((a, b) => b.wait.minutes - a.wait.minutes);

  async function assignOwner(contactId: string, ownerGhlId: string) {
    setSavingId(contactId);
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, ownerGhlId: ownerGhlId || null } : c)));
    try {
      await apiPatch(`/api/contacts/${contactId}/owner`, { ownerGhlId: ownerGhlId || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar el asesor.');
    } finally {
      setSavingId(null);
    }
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'sin', label: 'Sin asignar' },
    { id: 'sla', label: 'Fuera de SLA (>30 min)' },
  ];

  if (!locationId) return <NoLocationState />;

  return (
    <div className="roi-in flex flex-col gap-4">
      <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Sin asignar</span>
          <div className="mt-1 text-[21px] font-bold text-amber-400">{formatNumber(contacts.filter((c) => !c.ownerGhlId).length)}</div>
        </div>
        <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Fuera de SLA</span>
          <div className="mt-1 text-[21px] font-bold text-red-400">
            {formatNumber(contacts.filter((c) => waitLabel(c.ghlCreatedAt).minutes > 30).length)}
          </div>
        </div>
        <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">En bandeja</span>
          <div className="mt-1 text-[21px] font-bold text-accent">{formatNumber(contacts.length)}</div>
        </div>
      </div>

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
        <div className="flex overflow-hidden rounded-md border border-border2 bg-card">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`whitespace-nowrap border-l border-border2 px-4 py-2 text-[13px] font-semibold first:border-l-0 ${
                filter === f.id ? 'bg-accent/10 text-accent' : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-[7px] border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Espera</th>
              <th className="px-4 py-3 font-medium">Asesor</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Sin leads en esta vista.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <span className="block font-semibold">{[c.firstName, c.lastName].filter(Boolean).join(' ') || '(sin nombre)'}</span>
                  <span className="block font-mono text-[11px] text-gray-500">{c.phone ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-gray-300">{c.source ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: c.wait.minutes > 30 ? '#ef4444' : '#34d399' }}>
                  {c.wait.label}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={c.ownerGhlId ?? ''}
                    disabled={savingId === c.id}
                    onChange={(e) => assignOwner(c.id, e.target.value)}
                    className="rounded border border-border2 bg-input px-2.5 py-1.5 text-[12px] outline-none focus:border-accent/60"
                  >
                    <option value="">Sin asignar</option>
                    {owners.map((o) => (
                      <option key={o.ghlUserId} value={o.ghlUserId}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  {c.ownerGhlId && !ownerName(c.ownerGhlId) && <span className="ml-2 text-[10px] text-gray-600">{c.ownerGhlId}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setOpenConversationFor(c)} className="text-[11px] text-accent hover:underline">
                    Ver conversación
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openConversationFor && <ConversationModal contact={openConversationFor} onClose={() => setOpenConversationFor(null)} />}
    </div>
  );
}
