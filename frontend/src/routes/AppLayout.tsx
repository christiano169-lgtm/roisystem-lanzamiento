import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { IconPanel, IconChart, IconInbox, IconGear, IconLogout, IconUser, IconDocs, IconTray } from '../components/icons';
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

// locationId is '' when no subcuenta is connected/selected yet — every page
// under /app renders regardless (Configuración → Conexión GHL is where you
// fix that), so each page's own data-fetching guards against an empty id
// the same way it already handles "no data yet".
export interface OutletContext {
  locationId: string;
  locations: Location[];
  refreshLocations: () => Promise<void>;
}

const SELECTED_LOCATION_KEY = 'roisystem_selected_location';
const THEME_KEY = 'roisystem_theme';

// Exported so Configuración → Equipo can offer the exact same list of pages
// as checkboxes when restricting an asesor's access (see User.allowedPages).
export const NAV = [
  { to: '/app', label: 'Panel ejecutivo', icon: IconPanel, end: true },
  { to: '/app/overview', label: 'Resumen', icon: IconChart },
  { to: '/app/me', label: 'Mi panel', icon: IconUser },
  { to: '/app/embudo', label: 'Embudo', icon: IconChart },
  { to: '/app/rendimiento', label: 'Rendimiento', icon: IconChart },
  { to: '/app/ventas-hotmart', label: 'Ventas Hotmart', icon: IconChart },
  { to: '/app/pagos-efectivo', label: 'Pagos en efectivo', icon: IconInbox },
  { to: '/app/crm', label: 'CRM', icon: IconUser },
  { to: '/app/bandeja', label: 'Bandeja', icon: IconTray },
  { to: '/app/setters', label: 'Setters', icon: IconChart },
  { to: '/app/adquisicion', label: 'Adquisición', icon: IconChart },
  { to: '/app/payments', label: 'Pagos', icon: IconInbox },
  { to: '/app/docs', label: 'Documentación', icon: IconDocs },
  { to: '/app/settings', label: 'Configuración', icon: IconGear },
];

const PAGE_META: Record<string, [string, string]> = {
  '/app': ['Panel ejecutivo', 'Vista ejecutiva · Todo en 1'],
  '/app/overview': ['Resumen', 'Vista general del embudo'],
  '/app/me': ['Mi panel', 'Tus métricas y leads'],
  '/app/embudo': ['Embudo', 'Entradas reales por etapa'],
  '/app/ventas-hotmart': ['Ventas Hotmart', 'Ventas, estado del webhook y detalle por transacción'],
  '/app/pagos-efectivo': ['Pagos en efectivo', 'Tickets de Hotmart pendientes de pago (ventana de 48h)'],
  '/app/crm': ['CRM', 'Contactos y oportunidades sincronizados con GHL'],
  '/app/bandeja': ['Bandeja', 'Leads sin gestionar'],
  '/app/setters': ['Setters', 'Productividad de chats por agente'],
  '/app/adquisicion': ['Resumen de adquisición', 'Origen / Canal / Medio'],
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

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(() => localStorage.getItem(SELECTED_LOCATION_KEY));
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [title, subtitle] = PAGE_META[location.pathname] ?? ['ROISystem', ''];

  // Only role `asesor` can be restricted — admins/managers always see the
  // full nav (see prisma schema comment on User.allowedPages). An asesor
  // with an empty allowedPages list is unrestricted too (nobody's configured
  // it for them yet), so existing teammates aren't silently locked out.
  const visibleNav = user?.role === 'asesor' && user.allowedPages.length > 0 ? NAV.filter((item) => user.allowedPages.includes(item.to)) : NAV;

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
                    <Link
                      to="/app/settings"
                      onClick={() => setSubsOpen(false)}
                      className="mt-0.5 block rounded border border-dashed border-accent/35 py-1.5 text-center text-[10.5px] font-bold text-accent"
                    >
                      + Agregar subcuenta
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          <nav className="flex flex-col gap-1">
            {visibleNav.map((item) => (
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

          {locations && locations.length === 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm">
              <span className="text-amber-300">
                Todavía no hay ninguna subcuenta de GHL conectada — las pantallas de acá abajo están vacías hasta que
                conectes una.
              </span>
              {user?.role === 'admin' ? (
                <Link to="/app/settings" className="shrink-0 rounded border border-amber-700 px-3 py-1.5 text-amber-200 hover:bg-amber-900/40">
                  Conectar en Configuración
                </Link>
              ) : (
                <span className="shrink-0 text-amber-400/80">Pide a un admin que la conecte.</span>
              )}
            </div>
          )}

          {selectedLocation && selectedLocation.syncStatus !== 'synced' && (
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

          <Outlet context={{ locationId: selectedLocation?.id ?? '', locations: locations ?? [], refreshLocations: loadLocations } satisfies OutletContext} />
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
