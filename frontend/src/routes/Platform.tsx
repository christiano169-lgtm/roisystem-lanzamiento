import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet, apiPatch, apiPost, ApiError } from '../lib/api';
import { formatNumber } from '../lib/format';

type SubscriptionStatus = 'trial' | 'active' | 'overdue' | 'suspended';

interface TenantSummary {
  id: string;
  name: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: string | null;
  subscriptionNotes: string | null;
  createdAt: string;
  usersCount: number;
  locationsCount: number;
  adminEmail: string | null;
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Prueba',
  active: 'Activo',
  overdue: 'Atrasado',
  suspended: 'Suspendido',
};

const STATUS_COLOR: Record<SubscriptionStatus, string> = {
  trial: '#38bdf8',
  active: '#34d399',
  overdue: '#f59e0b',
  suspended: '#ef4444',
};

const inputCls = 'rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60';
const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500';
const primaryBtnCls = 'rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60';

function NewTenantForm({ onCreated }: { onCreated: () => void }) {
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subscriptionPlan, setSubscriptionPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/platform/tenants', { tenantName, email, password, subscriptionPlan: subscriptionPlan || undefined });
      setTenantName('');
      setEmail('');
      setPassword('');
      setSubscriptionPlan('');
      setMessage(`Cuenta creada. Comparte estas credenciales con tu cliente: ${email} / ${password}`);
      onCreated();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo crear la agencia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[7px] border border-border bg-panel p-5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Nueva agencia</span>
      <p className="mb-4 mt-1 text-[12px] text-gray-500">
        El registro público está cerrado — así es como das de alta a un nuevo cliente. Tú eliges su contraseña inicial
        y se la compartes.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>Nombre de la agencia</label>
          <input required value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={`w-52 ${inputCls}`} />
        </div>
        <div>
          <label className={labelCls}>Email del admin</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`w-56 ${inputCls}`} />
        </div>
        <div>
          <label className={labelCls}>Contraseña inicial</label>
          <input type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`w-40 ${inputCls}`} />
        </div>
        <div>
          <label className={labelCls}>Plan (opcional)</label>
          <input value={subscriptionPlan} onChange={(e) => setSubscriptionPlan(e.target.value)} placeholder="ej. Pro mensual" className={`w-40 ${inputCls}`} />
        </div>
        <button type="submit" disabled={saving} className={primaryBtnCls}>
          {saving ? 'Creando…' : 'Crear agencia'}
        </button>
      </form>
      {message && <p className="mt-3 text-xs text-gray-300">{message}</p>}
    </div>
  );
}

function TenantRow({ tenant, onUpdated }: { tenant: TenantSummary; onUpdated: () => void }) {
  const [status, setStatus] = useState<SubscriptionStatus>(tenant.subscriptionStatus);
  const [plan, setPlan] = useState(tenant.subscriptionPlan ?? '');
  const [notes, setNotes] = useState(tenant.subscriptionNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/platform/tenants/${tenant.id}`, {
        subscriptionStatus: status,
        subscriptionPlan: plan || null,
        subscriptionNotes: notes || null,
      });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr className="roi-in border-t border-[#1e1e23] transition-colors hover:bg-white/[0.03]">
        <td className="px-4 py-3 font-semibold">
          {tenant.name}
          <div className="text-[11px] font-normal text-gray-500">{tenant.adminEmail}</div>
        </td>
        <td className="px-4 py-3">{formatNumber(tenant.usersCount)}</td>
        <td className="px-4 py-3">{formatNumber(tenant.locationsCount)}</td>
        <td className="px-4 py-3">
          <span className="font-bold" style={{ color: STATUS_COLOR[tenant.subscriptionStatus] }}>
            {STATUS_LABEL[tenant.subscriptionStatus]}
          </span>
        </td>
        <td className="px-4 py-3">{tenant.subscriptionPlan ?? '—'}</td>
        <td className="px-4 py-3">
          <button onClick={() => setExpanded((v) => !v)} className="text-[12px] font-semibold text-accent hover:underline">
            {expanded ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-[#1e1e23] bg-white/[0.02]">
          <td colSpan={6} className="px-4 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={labelCls}>Estado</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)} className={`w-40 ${inputCls}`}>
                  {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Plan</label>
                <input value={plan} onChange={(e) => setPlan(e.target.value)} className={`w-40 ${inputCls}`} />
              </div>
              <div className="flex-1">
                <label className={labelCls}>Notas (ej. "paga por transferencia el 5")</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`w-full ${inputCls}`} />
              </div>
              <button onClick={save} disabled={saving} className={primaryBtnCls}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {status === 'suspended' && (
              <p className="mt-2 text-xs text-amber-400">
                Suspendido bloquea el próximo inicio de sesión de esta agencia — si ya tienen una sesión abierta, sigue
                activa hasta que expire (hasta 7 días).
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Platform() {
  const { user, logout } = useAuth();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiGet<{ tenants: TenantSummary[] }>('/api/platform/tenants');
      setTenants(res.tenants);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el panel maestro.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-panel px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[5px]"
            style={{ background: 'linear-gradient(140deg,#0ea5e9,#6366f1 48%,#a855f7)' }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M4 18V9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
              <path d="M9.5 18v-5.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".8" />
              <path d="M15 18V6.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[17px] font-bold tracking-tight">ROISystem</span>
          <span className="rounded-full border border-amber-800/40 bg-amber-950/30 px-3 py-1 text-[11px] font-bold text-amber-300">Panel maestro</span>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-gray-400">
          <Link to="/app" className="hover:text-accent hover:underline">
            Ir a mi agencia
          </Link>
          <span>{user?.email}</span>
          <button onClick={logout} className="rounded-md border border-border2 px-3 py-2 hover:bg-card">
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="roi-in flex flex-col gap-4 px-6 py-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[19px] font-bold">Tus clientes</h2>
          <p className="text-[12px] text-gray-500">Todas las agencias que has dado de alta en ROISystem.</p>
        </div>

        <NewTenantForm onCreated={load} />

        {error && <p className="text-sm text-red-400">{error}</p>}

        {tenants && (
          <div className="overflow-hidden rounded-[7px] border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                  <th className="px-4 py-3 font-medium">Agencia</th>
                  <th className="px-4 py-3 font-medium">Usuarios</th>
                  <th className="px-4 py-3 font-medium">Subcuentas</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Todavía no has creado ninguna agencia cliente.
                    </td>
                  </tr>
                )}
                {tenants.map((t) => (
                  <TenantRow key={t.id} tenant={t} onUpdated={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
