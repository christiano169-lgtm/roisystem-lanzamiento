import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { IconPanel, IconChart, IconTarget, IconInbox, IconGear, IconLogout, IconUser, IconDocs, IconTray } from '../components/icons';
import AssistantChat from '../components/AssistantChat';
import WeeklyReportButton from '../components/WeeklyReportButton';

export interface Location {
  id: string;
  name: string;
  ghlLocationId: string;
  businessLine: 'high_ticket' | 'lanzamiento';
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
}

export interface OutletContext {
  locationId: string;
}

const SELECTED_LOCATION_KEY = 'roisystem_selected_location';
const THEME_KEY = 'roisystem_theme';

const NAV = [
  { to: '/app', label: 'Panel ejecutivo', icon: IconPanel, end: true },
  { to: '/app/lanzamiento', label: 'Lanzamiento', icon: IconChart },
  { to: '/app/overview', label: 'Resumen', icon: IconChart },
  { to: '/app/rendimiento', label: 'Rendimiento', icon: IconChart },
  { to: '/app/me', label: 'Mi panel', icon: IconUser },
  { to: '/app/advisor', label: 'Panel asesor', icon: IconUser },
  { to: '/app/embudo', label: 'Embudo', icon: IconChart },
  { to: '/app/crm', label: 'CRM', icon: IconUser },
  { to: '/app/bandeja', label: 'Bandeja', icon: IconTray },
  { to: '/app/setters', label: 'Setters', icon: IconChart },
  { to: '/app/adquisicion', label: 'Adquisición', icon: IconChart },
  { to: '/app/meta-ads', label: 'Meta Ads', icon: IconChart },
  { to: '/app/quality', label: 'Calidad', icon: IconTarget },
  { to: '/app/payments', label: 'Pagos', icon: IconInbox },
  { to: '/app/docs', label: 'Documentación', icon: IconDocs },
  { to: '/app/settings', label: 'Configuración', icon: IconGear },
];

const PAGE_META: Record<string, [string, string]> = {
  '/app': ['Panel ejecutivo', 'Vista ejecutiva · Todo en 1'],
  '/app/lanzamiento': ['Lanzamiento', 'Ventas, embudo, asistencia y setters de un lanzamiento'],
  '/app/overview': ['Resumen', 'Vista general del embudo'],
  '/app/rendimiento': ['Rendimiento', 'Llamadas, videollamadas y chats'],
  '/app/me': ['Mi panel', 'Tus métricas y leads'],
  '/app/advisor': ['Panel asesor', 'Desempeño individual'],
  '/app/embudo': ['Embudo', 'Entradas reales por etapa'],
  '/app/crm': ['CRM', 'Contactos y oportunidades sincronizados con GHL'],
  '/app/bandeja': ['Bandeja', 'Leads sin gestionar'],
  '/app/setters': ['Setters', 'Productividad de chats por agente'],
  '/app/adquisicion': ['Resumen de adquisición', 'Origen / Canal / Medio'],
  '/app/meta-ads': ['Meta Ads', 'Campañas, inversión y leads de Facebook/Instagram'],
  '/app/quality': ['Calidad', 'Análisis de llamadas y videollamadas'],
  '/app/payments': ['Pagos', 'Registro manual de cobros'],
  '/app/docs': ['Documentación', 'Guías del sistema'],
  '/app/settings': ['Configuración', 'Equipo, conexión GHL y automatizaciones'],
};

const PALETTE = ['#22d3ee', '#e879f9', '#34d399', '#f59e0b', '#818cf8', '#f472b6'];
function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '??';
}

/** Fase 6: pastes a GHL Private Integration Token instead of an OAuth redirect — see README "Conexión con GHL". */
function ConnectLocationForm({ onConnected }: { onConnected: () => void }) {
  const [name, setName] = useState('');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [privateIntegrationToken, setPrivateIntegrationToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/locations', { name, ghlLocationId, privateIntegrationToken });
      setName('');
      setGhlLocationId('');
      setPrivateIntegrationToken('');
      onConnected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar la subcuenta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-left">
      <p className="text-[11px] leading-relaxed text-gray-500">
        En GHL: entra a la subcuenta → Settings → Private Integrations → crea una con permisos de contactos,
        oportunidades, calendarios/citas, conversaciones y formularios (forms.readonly — necesario para el
        módulo de Lanzamientos). Copia el token. El ID de la subcuenta está en la URL de
        GHL (app.gohighlevel.com/location/<span className="text-gray-400">ESE-ID</span>/...).
      </p>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nombre</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          ID de la subcuenta en GHL
        </label>
        <input
          required
          value={ghlLocationId}
          onChange={(e) => setGhlLocationId(e.target.value)}
          className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Private Integration Token
        </label>
        <input
          type="password"
          required
          value={privateIntegrationToken}
          onChange={(e) => setPrivateIntegrationToken(e.target.value)}
          className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60"
      >
        {saving ? 'Conectando…' : 'Conectar subcuenta'}
      </button>
    </form>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(() => localStorage.getItem(SELECTED_LOCATION_KEY));
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark');
  const pollRef = useRef<number | null>(null);

  const loadLocations = useCallback(async () => {
    try {
      const { locations: rows } = await apiGet<{ locations: Location[] }>('/api/locations');
      setLocations(rows);
      setLoadError(null);
      setSelectedLocationId((prev) => {
        if (prev && rows.some((l) => l.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch {
      setLoadError('No se pudieron cargar las subcuentas. ¿Está corriendo el backend?');
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (selectedLocationId) localStorage.setItem(SELECTED_LOCATION_KEY, selectedLocationId);
  }, [selectedLocationId]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const selectedLocation = locations?.find((l) => l.id === selectedLocationId) ?? null;

  useEffect(() => {
    if (selectedLocation?.syncStatus !== 'syncing') {
      if (pollRef.current) window.clearInterval(pollRef.current);
      return;
    }
    pollRef.current = window.setInterval(loadLocations, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [selectedLocation?.syncStatus, loadLocations]);

  async function syncLocation() {
    if (!selectedLocation) return;
    setSyncing(true);
    try {
      await apiPost(`/api/locations/${selectedLocation.id}/sync`);
      await loadLocations();
    } finally {
      setSyncing(false);
    }
  }

  const roleColor = user?.role === 'admin' ? '#22d3ee' : user?.role === 'manager' ? '#c084fc' : '#8b96a8';
  const roleLabel = user?.role === 'admin' ? 'Administrador' : user?.role === 'manager' ? 'Manager comercial' : 'Asesor (lectura)';
  const [title, subtitle] = PAGE_META[location.pathname] ??
    (location.pathname.startsWith('/app/advisor/') ? ['Panel de asesor', 'Desempeño individual'] : ['ROISystem', '']);

  return (
    <div
      className="flex min-h-screen"
      style={{ filter: theme === 'light' ? 'invert(1) hue-rotate(180deg) saturate(1.25) contrast(.94)' : 'none' }}
    >
      <aside className="flex w-[238px] shrink-0 flex-col justify-between border-r border-border bg-sidebar px-4 pb-3.5 pt-4">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5 pl-1.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[5px]"
              style={{ background: 'linear-gradient(140deg,#0ea5e9,#6366f1 48%,#a855f7)', boxShadow: '0 0 20px rgba(99,102,241,.35)' }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                <path d="M4 18V9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
                <path d="M9.5 18v-5.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".8" />
                <path d="M15 18V6.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M19.5 4.5v4.2h-4.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[18.5px] font-bold tracking-tight">ROISystem</span>
          </div>

          {locations && locations.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border2 bg-card p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Subcuenta GHL</span>
                <span className="text-[9px] text-emerald-400">{locations.length} activa{locations.length === 1 ? '' : 's'}</span>
              </div>
              <button
                type="button"
                onClick={() => setSubsOpen((v) => !v)}
                className="flex items-center gap-2.5 rounded border border-border2 bg-input px-2.5 py-2 hover:border-accent/50"
              >
                {selectedLocation && (
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-[10px] font-extrabold text-[#0a0a0c]"
                    style={{ background: colorFor(selectedLocation.id) }}
                  >
                    {initialsFor(selectedLocation.name)}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="w-full truncate text-left text-[12px] font-semibold">{selectedLocation?.name}</span>
                  <span className="font-mono text-[9px] text-gray-500">{selectedLocation?.ghlLocationId}</span>
                </span>
                <span className="text-[8px] text-gray-400">{subsOpen ? '▲' : '▼'}</span>
              </button>
              {subsOpen && (
                <div className="flex max-h-[220px] flex-col gap-0.5 overflow-auto">
                  {locations.map((l) => (
                    <button
                      type="button"
                      key={l.id}
                      onClick={() => {
                        setSelectedLocationId(l.id);
                        setSubsOpen(false);
                      }}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5 ${l.id === selectedLocationId ? 'bg-accent/10' : ''}`}
                    >
                      <span
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[8.5px] font-extrabold text-[#0a0a0c]"
                        style={{ background: colorFor(l.id) }}
                      >
                        {initialsFor(l.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[11.5px] font-semibold ${l.id === selectedLocationId ? 'text-white' : 'text-gray-300'}`}>
                          {l.name}
                        </span>
                        <span className="block truncate text-[9px] text-gray-500">{l.businessLine === 'high_ticket' ? 'High ticket' : 'Lanzamientos'}</span>
                      </span>
                      <span className={`flex items-center gap-1 text-[9px] ${l.syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        <span className={`roi-pulse h-[6px] w-[6px] rounded-full ${l.syncStatus === 'synced' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        {l.syncStatus === 'synced' ? 'live' : 'sync'}
                      </span>
                    </button>
                  ))}
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowConnectForm((v) => !v);
                        setSubsOpen(false);
                      }}
                      className="mt-0.5 rounded border border-dashed border-accent/35 py-1.5 text-center text-[10.5px] font-bold text-accent"
                    >
                      + Agregar subcuenta
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-[5px] border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    isActive ? 'border-accent/30 bg-accent/10 text-accent' : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`
                }
              >
                <item.icon width={20} height={20} className="opacity-90" />
                {item.label}
              </NavLink>
            ))}
            {user?.isPlatformAdmin && (
              <Link
                to="/platform"
                className="flex items-center gap-2.5 rounded-[5px] border border-amber-800/40 bg-amber-950/20 px-3 py-2.5 text-[13px] font-medium text-amber-300 hover:bg-amber-950/40"
              >
                <IconGear width={20} height={20} />
                Panel maestro
              </Link>
            )}
          </nav>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5 rounded-md border border-border2 bg-card px-2.5 py-2.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Rol activo</span>
            <span className="rounded border border-border2 bg-input px-2.5 py-2 text-[12px] font-semibold" style={{ color: roleColor }}>
              {roleLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="flex items-center gap-2.5 rounded-md border border-border2 bg-card px-2.5 py-2.5 text-[11.5px] font-semibold text-gray-300 hover:border-accent/40"
          >
            <span>{theme === 'light' ? '☾' : '☀'}</span>
            {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[12.5px] text-gray-400 hover:text-gray-100"
          >
            <IconLogout width={20} height={20} />
            Cerrar sesión
          </button>
          <span className="truncate px-2.5 text-[10px] text-gray-600">{user?.email}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-panel px-6 py-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[21px] font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-[11.5px] text-gray-500">{subtitle}</p>}
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 px-6 py-4 pb-28">
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}

          {showConnectForm && (
            <div className="max-w-lg rounded-lg border border-border2 bg-panel p-5">
              <ConnectLocationForm
                onConnected={() => {
                  setShowConnectForm(false);
                  loadLocations();
                }}
              />
            </div>
          )}

          {locations && locations.length === 0 && (
            <div className="mx-auto mt-10 max-w-lg rounded-lg border border-border2 bg-panel p-8 text-center">
              <h2 className="mb-2 text-lg font-semibold">Conecta tu primera subcuenta de GoHighLevel</h2>
              <p className="mb-5 text-sm text-gray-400">
                {user?.role === 'admin'
                  ? 'Pega el token de una subcuenta para empezar a sincronizar contactos, oportunidades, llamadas y citas.'
                  : 'Todavía no hay ninguna subcuenta de GHL conectada. Pide a un admin de tu agencia que la conecte.'}
              </p>
              {user?.role === 'admin' && <ConnectLocationForm onConnected={loadLocations} />}
            </div>
          )}

          {selectedLocation && (
            <>
              {selectedLocation.syncStatus !== 'synced' && (
                <div className="flex items-center justify-between rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
                  <span className="text-amber-300">
                    {selectedLocation.syncStatus === 'syncing'
                      ? 'Sincronizando datos desde GHL — esto puede tardar unos minutos…'
                      : selectedLocation.syncStatus === 'error'
                        ? 'La última sincronización falló.'
                        : 'Esta subcuenta todavía no se ha sincronizado.'}
                  </span>
                  <button
                    onClick={syncLocation}
                    disabled={syncing || selectedLocation.syncStatus === 'syncing'}
                    className="rounded border border-amber-700 px-3 py-1.5 text-amber-200 hover:bg-amber-900/40 disabled:opacity-60"
                  >
                    {selectedLocation.syncStatus === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
                  </button>
                </div>
              )}
              <Outlet context={{ locationId: selectedLocation.id } satisfies OutletContext} />
            </>
          )}
        </main>

        {selectedLocation && (
          <>
            <WeeklyReportButton locationId={selectedLocation.id} />
            <AssistantChat locationId={selectedLocation.id} />
          </>
        )}
      </div>
    </div>
  );
}
