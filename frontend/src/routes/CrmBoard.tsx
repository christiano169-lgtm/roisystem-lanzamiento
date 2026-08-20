import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import LaunchPhaseSelector, { type LaunchWindow } from '../components/LaunchPhaseSelector';
import NoLocationState from '../components/NoLocationState';
import type { OutletContext } from './AppLayout';

interface ContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ownerGhlId: string | null;
  ghlCreatedAt: string | null;
  tags: { tag: { id: string; name: string } }[];
  opportunities: { monetaryValue: string | null; pipelineStage: { pipelineName: string; stageName: string } | null }[];
}

interface GhlUser {
  ghlUserId: string;
  name: string;
}

const TAG_COLORS = ['#38bdf8', '#c084fc', '#34d399', '#f59e0b', '#e879f9', '#a78bfa'];
function tagColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export default function CrmBoard() {
  const { locationId } = useOutletContext<OutletContext>();
  const [window_, setWindow] = useState<LaunchWindow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [owners, setOwners] = useState<GhlUser[]>([]);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    apiGet<{ users: GhlUser[] }>(`/api/ghl-users?locationId=${locationId}`).then((res) => setOwners(res.users));
  }, [locationId]);

  useEffect(() => {
    if (!locationId || !window_) {
      setContacts([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&from=${window_!.from}&to=${window_!.to}&pageSize=100${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`;
      try {
        const res = await apiGet<{ items: ContactRow[]; total: number }>(`/api/contacts?${qs}`);
        if (!cancelled) {
          setContacts(res.items);
          setTotal(res.total);
        }
      } catch {
        if (!cancelled) setError('No se pudieron cargar los contactos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locationId, window_, search]);

  const visibleContacts = ownerFilter ? contacts.filter((c) => c.ownerGhlId === ownerFilter) : contacts;

  async function syncNow() {
    if (!locationId) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      await apiPost(`/api/locations/${locationId}/sync`);
      setSyncMessage('Sincronización con GHL encolada — puede tardar unos minutos en reflejarse acá.');
    } catch {
      setSyncMessage('No se pudo encolar la sincronización.');
    } finally {
      setSyncing(false);
    }
  }

  const ownerName = (id: string | null) => {
    if (!id) return 'Sin asignar';
    return owners.find((o) => o.ghlUserId === id)?.name ?? id;
  };

  if (!locationId) return <NoLocationState />;

  return (
    <div className="roi-in flex flex-col gap-4">
      <LaunchPhaseSelector locationId={locationId} onChange={setWindow} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email…"
          className="w-72 rounded-md border border-border2 bg-input px-3.5 py-2.5 text-sm outline-none focus:border-accent/60"
        />
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="rounded-md border border-border2 bg-input px-3 py-2.5 text-sm outline-none focus:border-accent/60"
        >
          <option value="">Todos los asesores</option>
          {owners.map((o) => (
            <option key={o.ghlUserId} value={o.ghlUserId}>
              {o.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-gray-500">{total} contactos</span>
        {loading && <span className="text-[12px] text-gray-500">Cargando…</span>}
        <button
          onClick={syncNow}
          disabled={syncing}
          className="ml-auto rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60"
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar con GHL'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {syncMessage && <p className="text-sm text-gray-400">{syncMessage}</p>}

      <div className="overflow-x-auto rounded-[7px] border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Etiquetas</th>
              <th className="px-4 py-3 font-medium">Etapa</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Asesor</th>
              <th className="px-4 py-3 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {visibleContacts.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  {search ? 'Sin resultados para esa búsqueda.' : 'Sin contactos en este rango todavía.'}
                </td>
              </tr>
            )}
            {visibleContacts.map((c) => {
              const latestOpp = c.opportunities[0];
              return (
                <tr key={c.id} className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <span className="block font-semibold">{[c.firstName, c.lastName].filter(Boolean).join(' ') || '(sin nombre)'}</span>
                    <span className="block font-mono text-[11px] text-gray-500">{c.phone ?? c.email ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(c.tags ?? []).length === 0 && <span className="text-gray-600">—</span>}
                      {(c.tags ?? []).map(({ tag }) => (
                        <span
                          key={tag.id}
                          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                          style={{ background: `${tagColor(tag.name)}22`, color: tagColor(tag.name) }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {latestOpp?.pipelineStage ? `${latestOpp.pipelineStage.pipelineName} · ${latestOpp.pipelineStage.stageName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-emerald-400">{latestOpp?.monetaryValue ? formatCurrency(Number(latestOpp.monetaryValue)) : '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{ownerName(c.ownerGhlId)}</td>
                  <td className="px-4 py-3 text-gray-500">{c.ghlCreatedAt ? formatDate(c.ghlCreatedAt) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
