import { useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from '../lib/api';
import { formatDateOnly } from '../lib/format';
import { NAV } from './AppLayout';
import type { OutletContext } from './AppLayout';

interface Location {
  id: string;
  name: string;
}

interface PipelineStageOption {
  id: string;
  pipelineName: string;
  stageName: string;
}

type InterestBucket = 'alto' | 'medio' | 'bajo';

interface StageAutomationRule {
  interestBucket: InterestBucket;
  targetStageId: string;
  enabled: boolean;
}

interface ProfileResponse {
  user: { id: string; email: string; role: string; ghlUserId: string | null };
}

interface OpenAiKeyStatus {
  configured: boolean;
  model: string | null;
}

interface FathomConnectionStatus {
  connected: boolean;
  locationId: string | null;
  lastSyncedAt: string | null;
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[7px] border border-border bg-panel p-5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-accent">{title}</span>
      <p className="mb-4 mt-1 text-[12px] text-gray-500">{description}</p>
      {children}
    </div>
  );
}

/** Fase 6: pastes a GHL Private Integration Token instead of an OAuth redirect — see README "Conexión con GHL". Moved here (from AppLayout) so connecting a subcuenta lives in one place instead of blocking the rest of the app. */
function ConnectionSection() {
  const { locations, refreshLocations } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canSync = isAdmin || user?.role === 'manager';

  const [name, setName] = useState('');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [privateIntegrationToken, setPrivateIntegrationToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function connect(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/locations', { name, ghlLocationId, privateIntegrationToken });
      setName('');
      setGhlLocationId('');
      setPrivateIntegrationToken('');
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar la subcuenta.');
    } finally {
      setSaving(false);
    }
  }

  async function syncNow(id: string) {
    setSyncingId(id);
    try {
      await apiPost(`/api/locations/${id}/sync`);
      await refreshLocations();
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <SectionCard
      title="Conexión GHL"
      description="Todas las subcuentas de GoHighLevel conectadas a esta agencia. Cada una se conecta pegando su propio Private Integration Token — no hace falta instalar ninguna app en GHL."
    >
      <div className="mb-4 flex flex-col gap-2">
        {locations.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border2 bg-card px-3.5 py-3">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{l.name}</span>
            <span className="font-mono text-[11px] text-gray-500">{l.ghlLocationId}</span>
            <span className={`flex items-center gap-1.5 text-[11px] ${l.syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`roi-pulse h-[6px] w-[6px] rounded-full ${l.syncStatus === 'synced' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {l.syncStatus}
            </span>
            {canSync && (
              <button
                onClick={() => syncNow(l.id)}
                disabled={syncingId === l.id || l.syncStatus === 'syncing'}
                className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-60"
              >
                {syncingId === l.id || l.syncStatus === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
            )}
          </div>
        ))}
        {locations.length === 0 && <p className="text-[12px] text-gray-500">Sin subcuentas conectadas todavía.</p>}
      </div>

      {isAdmin ? (
        <form onSubmit={connect} className="flex max-w-lg flex-col gap-3 text-left">
          <p className="text-[11px] leading-relaxed text-gray-500">
            En GHL: entra a la subcuenta → Settings → Private Integrations → crea una con permisos de contactos,
            oportunidades, calendarios/citas, conversaciones y formularios (forms.readonly — necesario para el
            módulo de Lanzamientos). Copia el token. El ID de la subcuenta está en la URL de GHL
            (app.gohighlevel.com/location/<span className="text-gray-400">ESE-ID</span>/...).
          </p>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nombre</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">ID de la subcuenta en GHL</label>
            <input required value={ghlLocationId} onChange={(e) => setGhlLocationId(e.target.value)} className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Private Integration Token</label>
            <input
              type="password"
              required
              value={privateIntegrationToken}
              onChange={(e) => setPrivateIntegrationToken(e.target.value)}
              className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={saving} className="w-fit rounded bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
            {saving ? 'Conectando…' : '+ Conectar subcuenta'}
          </button>
        </form>
      ) : (
        <p className="text-[12px] text-gray-500">Solo un administrador puede conectar subcuentas nuevas.</p>
      )}
    </SectionCard>
  );
}

function OpenAiKeySection() {
  const [status, setStatus] = useState<OpenAiKeyStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<OpenAiKeyStatus>('/api/settings/openai-key').then(setStatus).catch(() => setStatus(null));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiPut<OpenAiKeyStatus>('/api/settings/openai-key', { apiKey, model });
      setStatus(res);
      setApiKey('');
      setMessage('Clave guardada.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo guardar la clave.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Clave de OpenAI (agencia)"
      description="Una sola clave para toda la agencia — se usa para transcribir llamadas (Whisper) y analizar la calidad de las conversaciones. Solo administradores."
    >
      <p className="mb-3 text-xs text-gray-400">
        Estado: {status?.configured ? <span className="text-emerald-400">configurada ({status.model})</span> : <span className="text-amber-400">sin configurar</span>}
      </p>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">API key</label>
          <input
            type="password"
            required
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-64 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Modelo</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} className="w-40 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60" />
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

function AiWriteBackSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ enabled: boolean }>('/api/settings/ai-writeback').then((res) => setEnabled(res.enabled));
  }, []);

  async function toggle() {
    if (enabled === null) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiPut<{ enabled: boolean }>('/api/settings/ai-writeback', { enabled: !enabled });
      setEnabled(res.enabled);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Escritura automática a GHL"
      description="Cuando un análisis de calidad termina, agrega en el contacto de GHL una etiqueta con el nivel de interés detectado (ia-interes-alto/medio/bajo), una etiqueta por cada objeción, y una nota con el resumen y los aspectos de mejora. No mueve la etapa del pipeline — arma tu propia automatización en GHL usando esas etiquetas si quieres ese paso."
    >
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={enabled ?? false} disabled={enabled === null || saving} onChange={toggle} className="h-4 w-4" />
        {enabled === null ? 'Cargando…' : enabled ? 'Activado' : 'Desactivado'}
      </label>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

const BUCKET_LABEL: Record<InterestBucket, string> = { alto: 'Interés alto', medio: 'Interés medio', bajo: 'Interés bajo' };
const BUCKETS: InterestBucket[] = ['alto', 'medio', 'bajo'];

function StageAutomationSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [stages, setStages] = useState<PipelineStageOption[]>([]);
  const [selection, setSelection] = useState<Record<InterestBucket, { targetStageId: string; enabled: boolean }>>({
    alto: { targetStageId: '', enabled: true },
    medio: { targetStageId: '', enabled: true },
    bajo: { targetStageId: '', enabled: true },
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ stages: PipelineStageOption[] }>(`/api/pipeline-stages?locationId=${locationId}`).then((res) => setStages(res.stages));
    apiGet<{ rules: StageAutomationRule[] }>(`/api/settings/stage-automation?locationId=${locationId}`).then((res) => {
      setSelection((prev) => {
        const next = { ...prev };
        for (const rule of res.rules) next[rule.interestBucket] = { targetStageId: rule.targetStageId, enabled: rule.enabled };
        return next;
      });
    });
  }, [locationId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const rules = BUCKETS.map((bucket) => ({
        interestBucket: bucket,
        targetStageId: selection[bucket].targetStageId || null,
        enabled: selection[bucket].enabled,
      }));
      await apiPut('/api/settings/stage-automation', { locationId, rules });
      setMessage('Reglas guardadas.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudieron guardar las reglas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Mover etapa automáticamente"
      description="Cuando la IA detecta este nivel de interés en una llamada/videollamada/chat, mueve la oportunidad abierta más reciente del contacto a la etapa que elijas. Necesita que 'Escritura automática a GHL' esté activado arriba. Deja 'Sin etapa' en un nivel para no mover nada en ese caso."
    >
      <form onSubmit={save} className="flex flex-col gap-3">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className="flex flex-wrap items-center gap-3">
            <span className="w-32 shrink-0 text-sm">{BUCKET_LABEL[bucket]}</span>
            <select
              value={selection[bucket].targetStageId}
              onChange={(e) => setSelection((prev) => ({ ...prev, [bucket]: { ...prev[bucket], targetStageId: e.target.value } }))}
              className="w-64 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            >
              <option value="">Sin etapa (no mover)</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.pipelineName} · {s.stageName}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={selection[bucket].enabled}
                onChange={(e) => setSelection((prev) => ({ ...prev, [bucket]: { ...prev[bucket], enabled: e.target.checked } }))}
                className="h-3.5 w-3.5"
              />
              Activa
            </label>
          </div>
        ))}
        <button type="submit" disabled={saving} className="w-fit rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar reglas'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

interface HotmartConnectionStatus {
  connected: boolean;
  clientId: string | null;
  lastSyncedAt: string | null;
  webhookConnected: boolean;
  webhookUrl: string;
}

function HotmartSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [status, setStatus] = useState<HotmartConnectionStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hottok, setHottok] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function reload() {
    return apiGet<HotmartConnectionStatus>(`/api/hotmart/connection?locationId=${locationId}`).then(setStatus);
  }

  useEffect(() => {
    reload();
  }, [locationId]);

  async function connectWebhook(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/hotmart/connection/webhook', { locationId, hottok });
      setHottok('');
      await reload();
      setMessage('Webhook conectado — las ventas nuevas llegarán en tiempo real.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo conectar el webhook.');
    } finally {
      setSaving(false);
    }
  }

  async function connect(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/hotmart/connection', { locationId, clientId, clientSecret });
      setClientSecret('');
      await reload();
      setMessage('Hotmart conectado.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo conectar Hotmart.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      await apiDelete(`/api/hotmart/connection?locationId=${locationId}`);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/hotmart/sync', { locationId });
      setMessage('Sincronización de Hotmart encolada.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Hotmart"
      description="Conecta la cuenta de Hotmart de esta subcuenta para ver ventas de cursos/infoproductos. Genera client_id y client_secret desde Hotmart en Herramientas > Credenciales de desarrollador."
    >
      <p className="mb-3 text-xs text-gray-400">
        Estado: {status?.connected ? <span className="text-emerald-400">conectado</span> : <span className="text-amber-400">sin conectar</span>}
      </p>
      {status?.connected ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <button onClick={syncNow} disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
              Sincronizar ahora
            </button>
            <button onClick={disconnect} disabled={saving} className="rounded-md border border-border2 px-4 py-2 text-sm hover:bg-card disabled:opacity-60">
              Desconectar
            </button>
          </div>
          <div className="rounded-md border border-border2 bg-card p-3.5">
            <span className="text-[11.5px] font-semibold text-gray-300">Webhook (ventas en tiempo real)</span>
            <p className="mb-2 mt-1 text-[11px] text-gray-500">
              "Sincronizar ahora" trae hasta 90 días hacia atrás cuando lo presionas — el webhook avisa al instante de
              cada venta nueva. En Hotmart: Herramientas → Webhook → agrega esta URL y copia el "Hottok" que te
              muestra ahí.
            </p>
            <div className="mb-3 flex items-center gap-2 rounded border border-border2 bg-input px-3 py-2">
              <code className="flex-1 truncate text-[11.5px] text-accent">{status.webhookUrl}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(status.webhookUrl)}
                className="shrink-0 text-[11px] text-gray-400 hover:text-gray-200"
              >
                Copiar
              </button>
            </div>
            <p className="mb-2 text-[11px]">
              Estado: {status.webhookConnected ? <span className="text-emerald-400">conectado</span> : <span className="text-amber-400">sin conectar</span>}
            </p>
            <form onSubmit={connectWebhook} className="flex flex-wrap items-end gap-2.5">
              <input
                type="password"
                required
                value={hottok}
                onChange={(e) => setHottok(e.target.value)}
                placeholder="Hottok"
                className="w-56 rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
              />
              <button type="submit" disabled={saving} className="rounded border border-accent/40 px-3 py-1.5 text-[12px] font-bold text-accent disabled:opacity-60">
                {status.webhookConnected ? 'Actualizar Hottok' : 'Conectar webhook'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Client ID</label>
            <input required value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-48 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Client Secret</label>
            <input type="password" required value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="w-64 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60" />
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
            {saving ? 'Conectando…' : 'Conectar'}
          </button>
        </form>
      )}
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

function FathomSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [status, setStatus] = useState<FathomConnectionStatus | null>(null);
  const [locationId, setLocationId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ locations: Location[] }>('/api/locations').then((res) => {
      setLocations(res.locations);
      setLocationId((prev) => prev || res.locations[0]?.id || '');
    });
    apiGet<FathomConnectionStatus>('/api/fathom/connection').then(setStatus);
  }, []);

  async function connect(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/fathom/connection', { locationId, apiKey });
      setApiKey('');
      setStatus(await apiGet<FathomConnectionStatus>('/api/fathom/connection'));
      setMessage('Fathom conectado.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo conectar Fathom.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      await apiDelete('/api/fathom/connection');
      setStatus({ connected: false, locationId: null, lastSyncedAt: null });
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/fathom/sync');
      setMessage('Sincronización de videollamadas encolada.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Tu conexión de Fathom" description="Cada closer conecta su propia cuenta de Fathom (API key personal) para que sus videollamadas se analicen.">
      <p className="mb-3 text-xs text-gray-400">
        Estado:{' '}
        {status?.connected ? (
          <span className="text-emerald-400">
            conectado ({locations.find((l) => l.id === status.locationId)?.name ?? status.locationId})
          </span>
        ) : (
          <span className="text-amber-400">sin conectar</span>
        )}
      </p>

      {status?.connected ? (
        <div className="flex gap-3">
          <button onClick={syncNow} disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
            Sincronizar ahora
          </button>
          <button onClick={disconnect} disabled={saving} className="rounded-md border border-border2 px-4 py-2 text-sm hover:bg-card disabled:opacity-60">
            Desconectar
          </button>
        </div>
      ) : (
        <form onSubmit={connect} className="flex flex-wrap items-end gap-3">
          <p className="w-full text-xs text-gray-500">
            Consigue tu clave en{' '}
            <a href="https://fathom.video" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              fathom.video
            </a>{' '}
            → tu perfil → Settings → Integrations → API Access → "Generate API Key". Pégala tal cual, sin espacios.
          </p>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Subcuenta</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-52 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">API key de Fathom</label>
            <input
              type="password"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-64 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
            {saving ? 'Conectando…' : 'Conectar'}
          </button>
        </form>
      )}
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const [ghlUserId, setGhlUserId] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ProfileResponse>('/api/profile/me').then((res) => setCurrent(res.user.ghlUserId));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiPut<ProfileResponse>('/api/profile/me/ghl-user', { ghlUserId });
      setCurrent(res.user.ghlUserId);
      setMessage('Vínculo guardado.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Tu identidad en GHL"
      description="Vincula tu cuenta del dashboard con tu usuario de GoHighLevel — necesario para que el ranking y el reporte de calidad te atribuyan tus llamadas, citas y videollamadas."
    >
      <p className="mb-3 text-xs text-gray-400">
        {user?.email} — GHL user id actual: <span className="text-gray-200">{current || 'sin vincular'}</span>
      </p>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">GHL user id</label>
          <input
            required
            value={ghlUserId}
            onChange={(e) => setGhlUserId(e.target.value)}
            placeholder="Consúltalo en la tabla GhlUser tras sincronizar"
            className="w-72 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

interface TeamMember {
  id: string;
  email: string;
  username: string | null;
  role: 'admin' | 'manager' | 'asesor';
  ghlUserId: string | null;
  allowedPages: string[];
}

const ROLE_LABEL: Record<TeamMember['role'], string> = { admin: 'Administrador', manager: 'Manager', asesor: 'Asesor' };

/** Checkbox grid of nav pages — reused by both the create form (for a new asesor) and the per-member edit panel. Empty selection = unrestricted (see User.allowedPages). */
function PageAccessCheckboxes({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  function toggle(to: string) {
    onChange(selected.includes(to) ? selected.filter((p) => p !== to) : [...selected, to]);
  }
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {NAV.map((item) => (
        <label key={item.to} className="flex items-center gap-2 text-[12px] text-gray-300">
          <input type="checkbox" checked={selected.includes(item.to)} onChange={() => toggle(item.to)} className="h-3.5 w-3.5" />
          {item.label}
        </label>
      ))}
    </div>
  );
}

function EditMemberRow({ member, onSaved }: { member: TeamMember; onSaved: () => void }) {
  const [role, setRole] = useState(member.role);
  const [allowedPages, setAllowedPages] = useState<string[]>(member.allowedPages);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/team/${member.id}`, { role, allowedPages });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[#1e1e23] bg-card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rol</label>
        <select value={role} onChange={(e) => setRole(e.target.value as TeamMember['role'])} className="rounded border border-border2 bg-input px-2.5 py-1.5 text-[12px] outline-none">
          <option value="admin">Administrador</option>
          <option value="manager">Manager</option>
          <option value="asesor">Asesor</option>
        </select>
      </div>
      {role === 'asesor' && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Pantallas visibles {allowedPages.length === 0 && <span className="normal-case text-gray-600">(sin marcar = ve todas)</span>}
          </p>
          <PageAccessCheckboxes selected={allowedPages} onChange={setAllowedPages} />
        </div>
      )}
      <button onClick={save} disabled={saving} className="w-fit rounded border border-accent/40 px-3 py-1.5 text-[12px] font-bold text-accent disabled:opacity-60">
        {saving ? 'Guardando…' : 'Guardar permisos'}
      </button>
    </div>
  );
}

function TeamSection() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'asesor' as TeamMember['role'], ghlUserId: '', allowedPages: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    apiGet<{ users: TeamMember[] }>('/api/team').then((res) => setMembers(res.users));
  }

  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/team', { ...form, username: form.username || undefined, ghlUserId: form.ghlUserId || undefined });
      setMessage(`Cuenta creada. Comparte estas credenciales: ${form.username || form.email} / ${form.password}`);
      setForm({ email: '', username: '', password: '', role: 'asesor', ghlUserId: '', allowedPages: [] });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiDelete(`/api/team/${id}`);
    load();
  }

  return (
    <SectionCard title="Equipo y asesores" description="Da de alta a tus closers, setters y managers — tú eliges su contraseña inicial y se la compartes. Para un asesor podés elegir exactamente qué pantallas del menú puede ver.">
      <form onSubmit={submit} className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-56 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Usuario (opcional)</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="ej: christiano169"
              className="w-40 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Contraseña inicial</label>
            <input
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-40 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rol</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as TeamMember['role'] })}
              className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            >
              <option value="admin">Administrador</option>
              <option value="manager">Manager</option>
              <option value="asesor">Asesor</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">GHL user id (opcional)</label>
            <input
              value={form.ghlUserId}
              onChange={(e) => setForm({ ...form, ghlUserId: e.target.value })}
              className="w-48 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
            {saving ? 'Creando…' : '+ Añadir'}
          </button>
        </div>
        {form.role === 'asesor' && (
          <div className="max-w-xl rounded-md border border-border2 bg-card p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Pantallas visibles {form.allowedPages.length === 0 && <span className="normal-case text-gray-600">(sin marcar = ve todas)</span>}
            </p>
            <PageAccessCheckboxes selected={form.allowedPages} onChange={(allowedPages) => setForm({ ...form, allowedPages })} />
          </div>
        )}
      </form>
      {message && <p className="mb-3 text-xs text-gray-300">{message}</p>}
      <div className="overflow-hidden rounded-md border border-border2">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">GHL user id</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <>
                <tr key={m.id} className="border-t border-[#1e1e23]">
                  <td className="px-4 py-2.5">
                    <span className="block font-semibold">{m.email}</span>
                    {m.username && <span className="block text-[11px] text-gray-500">@{m.username}</span>}
                  </td>
                  <td className="px-4 py-2.5">{ROLE_LABEL[m.role]}</td>
                  <td className="px-4 py-2.5 text-gray-400">{m.ghlUserId ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setEditingId((prev) => (prev === m.id ? null : m.id))} className="mr-3 text-[11px] text-accent hover:underline">
                      {editingId === m.id ? 'Cerrar' : 'Permisos'}
                    </button>
                    <button onClick={() => remove(m.id)} className="text-[11px] text-gray-500 hover:text-red-400">
                      Eliminar
                    </button>
                  </td>
                </tr>
                {editingId === m.id && (
                  <tr key={`${m.id}-edit`}>
                    <td colSpan={4} className="p-0">
                      <EditMemberRow member={m} onSaved={() => { setEditingId(null); load(); }} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function PromptSection() {
  const [aiCompanyContext, setAiCompanyContext] = useState('');
  const [aiEvaluationInstructions, setAiEvaluationInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ aiCompanyContext: string | null; aiEvaluationInstructions: string | null }>('/api/settings/prompt').then((res) => {
      setAiCompanyContext(res.aiCompanyContext ?? '');
      setAiEvaluationInstructions(res.aiEvaluationInstructions ?? '');
    });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPut('/api/settings/prompt', { aiCompanyContext: aiCompanyContext || null, aiEvaluationInstructions: aiEvaluationInstructions || null });
      setMessage('Guardado — se aplica a los próximos análisis.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Prompt de análisis con IA"
      description="Se agrega al prompt base que usa la IA para evaluar cada llamada/videollamada/chat — así el análisis conoce tu negocio y tus criterios."
    >
      <form onSubmit={save} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Contexto de la empresa</label>
          <textarea
            value={aiCompanyContext}
            onChange={(e) => setAiCompanyContext(e.target.value)}
            rows={3}
            placeholder="Ej: Somos una empresa de formación en ventas, programas de 90 días con mentoría."
            className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Instrucciones de evaluación</label>
          <textarea
            value={aiEvaluationInstructions}
            onChange={(e) => setAiEvaluationInstructions(e.target.value)}
            rows={3}
            placeholder="Ej: Evalúa apertura, diagnóstico, manejo de objeciones y cierre."
            className="w-full rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button type="submit" disabled={saving} className="w-fit rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

function GoalsSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [dailyCallGoal, setDailyCallGoal] = useState<number | ''>('');
  const [weeklyMeetingGoal, setWeeklyMeetingGoal] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ dailyCallGoal: number | null; weeklyMeetingGoal: number | null }>(`/api/settings/goals?locationId=${locationId}`).then((res) => {
      setDailyCallGoal(res.dailyCallGoal ?? '');
      setWeeklyMeetingGoal(res.weeklyMeetingGoal ?? '');
    });
  }, [locationId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPut('/api/settings/goals', {
        locationId,
        dailyCallGoal: dailyCallGoal === '' ? null : Number(dailyCallGoal),
        weeklyMeetingGoal: weeklyMeetingGoal === '' ? null : Number(weeklyMeetingGoal),
      });
      setMessage('Metas guardadas.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Metas del equipo" description="Se comparan contra los datos reales sincronizados — visibles en Mi panel de cada asesor.">
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Llamadas / día (por asesor)</label>
          <input
            type="number"
            min={0}
            value={dailyCallGoal}
            onChange={(e) => setDailyCallGoal(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-32 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Citas / semana (por asesor)</label>
          <input
            type="number"
            min={0}
            value={weeklyMeetingGoal}
            onChange={(e) => setWeeklyMeetingGoal(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-32 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-gray-400">{message}</p>}
    </SectionCard>
  );
}

const TRIGGER_DEFS = [
  { key: 'triggerStaleChatEnabled', title: 'Chat sin respuesta > 15 min', desc: 'Marca la conversación como pendiente de atención urgente en Setters.' },
  { key: 'triggerKeywordPriceEnabled', title: 'Palabra clave "precio"', desc: 'Prioriza la conversación para seguimiento cuando el lead pregunta por precio.' },
  { key: 'triggerRescheduleEnabled', title: 'Lead pide reagendar', desc: 'Señala la cita para reprogramar en el reporte del equipo.' },
  { key: 'triggerNoOfferClosedEnabled', title: 'Chat cerrado sin oferta', desc: 'Marca la conversación como oportunidad perdida sin oferta presentada.' },
] as const;

function TriggersSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [values, setValues] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Record<string, boolean>>(`/api/settings/triggers?locationId=${locationId}`).then(setValues);
  }, [locationId]);

  async function toggle(key: string) {
    if (!values) return;
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    setSaving(true);
    try {
      await apiPut('/api/settings/triggers', { locationId, ...next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Disparadores de chat" description="Preferencias guardadas para priorizar conversaciones en Setters y Bandeja.">
      <div className="flex flex-col gap-2.5">
        {TRIGGER_DEFS.map((t) => {
          const on = !!values?.[t.key];
          return (
            <div key={t.key} className="flex items-center gap-4 rounded-md border border-border2 bg-card p-3.5">
              <button
                type="button"
                disabled={!values || saving}
                onClick={() => toggle(t.key)}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                style={{ background: on ? '#22d3ee' : '#33333b' }}
              >
                <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: on ? 21 : 3 }} />
              </button>
              <div>
                <div className="text-[13px] font-semibold">{t.title}</div>
                <div className="text-[11.5px] text-gray-500">{t.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  format: string;
}

function MetricsSection() {
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [form, setForm] = useState({ name: '', formula: '', format: 'Porcentaje' });
  const [saving, setSaving] = useState(false);

  function load() {
    apiGet<{ metrics: MetricDefinition[] }>('/api/settings/metrics').then((res) => setMetrics(res.metrics));
  }

  useEffect(load, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.formula.trim()) return;
    setSaving(true);
    try {
      await apiPost('/api/settings/metrics', form);
      setForm({ name: '', formula: '', format: 'Porcentaje' });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiDelete(`/api/settings/metrics/${id}`);
    load();
  }

  return (
    <SectionCard title="Métricas personalizadas" description="Definiciones que el equipo acuerda usar — quedan documentadas aquí (todavía no se calculan automáticamente en el dashboard).">
      <div className="mb-3 flex flex-col gap-2">
        {metrics.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-md border border-border2 bg-card px-3.5 py-2.5">
            <span className="w-40 shrink-0 truncate text-[13px] font-semibold">{m.name}</span>
            <span className="flex-1 truncate font-mono text-[12px] text-accent">{m.formula}</span>
            <span className="w-24 shrink-0 text-[11px] text-gray-500">{m.format}</span>
            <button onClick={() => remove(m.id)} className="text-[11px] text-gray-500 hover:text-red-400">
              Eliminar
            </button>
          </div>
        ))}
        {metrics.length === 0 && <p className="text-[12px] text-gray-500">Sin métricas definidas todavía.</p>}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="nombre_metrica"
          className="w-44 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
        <input
          value={form.formula}
          onChange={(e) => setForm({ ...form, formula: e.target.value })}
          placeholder="ej. leads con tag caliente / leads"
          className="flex-1 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
        <select
          value={form.format}
          onChange={(e) => setForm({ ...form, format: e.target.value })}
          className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        >
          <option>Porcentaje</option>
          <option>Número</option>
          <option>Moneda</option>
          <option>Minutos</option>
        </select>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          + Nueva métrica
        </button>
      </form>
    </SectionCard>
  );
}

interface Launch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'closed';
}

interface AttendanceRule {
  id: string;
  label: string;
  matchType: 'tag' | 'form';
  tagName: string | null;
  formName: string | null;
}

function toDateTimeIso(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function AttendanceRulesEditor({ launch }: { launch: Launch }) {
  const [rules, setRules] = useState<AttendanceRule[]>([]);
  const [form, setForm] = useState({ label: '', matchType: 'tag' as 'tag' | 'form', value: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiGet<{ rules: AttendanceRule[] }>(`/api/launches/${launch.id}/attendance-rules`).then((res) => setRules(res.rules));
  }

  useEffect(load, [launch.id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.value.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiPost(`/api/launches/${launch.id}/attendance-rules`, {
        label: form.label,
        matchType: form.matchType,
        ...(form.matchType === 'tag' ? { tagName: form.value } : { formName: form.value }),
      });
      setForm({ label: '', matchType: 'tag', value: '' });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo agregar la regla.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(ruleId: string) {
    await apiDelete(`/api/launches/${launch.id}/attendance-rules/${ruleId}`);
    load();
  }

  return (
    <div className="rounded-md border border-border2 bg-card p-3.5">
      <span className="text-[11.5px] font-semibold text-gray-300">Reglas de asistencia — {launch.name}</span>
      <p className="mb-3 mt-1 text-[11px] text-gray-500">
        El tag o formulario de GHL que ya usan para marcar que alguien entró a cada clase. Se cuenta por nombre exacto
        (como aparece en GHL), sin nada hardcodeado por cuenta.
      </p>
      <div className="mb-3 flex flex-col gap-1.5">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded border border-border2 bg-input px-3 py-2 text-[12.5px]">
            <span className="w-32 shrink-0 font-semibold">{r.label}</span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase text-gray-400">{r.matchType === 'tag' ? 'Tag' : 'Formulario'}</span>
            <span className="flex-1 truncate font-mono text-accent">{r.tagName ?? r.formName}</span>
            <button onClick={() => remove(r.id)} className="text-[11px] text-gray-500 hover:text-red-400">
              Eliminar
            </button>
          </div>
        ))}
        {rules.length === 0 && <p className="text-[11.5px] text-gray-500">Sin reglas todavía.</p>}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2.5">
        <input
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Ej: Clase 1"
          className="w-32 rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        />
        <select
          value={form.matchType}
          onChange={(e) => setForm({ ...form, matchType: e.target.value as 'tag' | 'form' })}
          className="rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        >
          <option value="tag">Tag</option>
          <option value="form">Formulario</option>
        </select>
        <input
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          placeholder={form.matchType === 'tag' ? 'nombre-del-tag-en-ghl' : 'Nombre del formulario en GHL'}
          className="w-56 rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        />
        <button type="submit" disabled={saving} className="rounded border border-accent/40 px-3 py-1.5 text-[12px] font-bold text-accent disabled:opacity-60">
          + Agregar
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}
    </div>
  );
}

interface Phase {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

function PhasesEditor({ launch }: { launch: Launch }) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [form, setForm] = useState({ label: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiGet<{ phases: Phase[] }>(`/api/launches/${launch.id}/phases`).then((res) => setPhases(res.phases));
  }

  useEffect(load, [launch.id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.startDate || !form.endDate) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiPost(`/api/launches/${launch.id}/phases`, {
        label: form.label,
        startDate: toDateTimeIso(form.startDate, false),
        endDate: toDateTimeIso(form.endDate, true),
        position: phases.length,
      });
      setForm({ label: '', startDate: '', endDate: '' });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo agregar la fase.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(phaseId: string) {
    await apiDelete(`/api/launches/${launch.id}/phases/${phaseId}`);
    load();
  }

  return (
    <div className="rounded-md border border-border2 bg-card p-3.5">
      <span className="text-[11.5px] font-semibold text-gray-300">Fases — {launch.name}</span>
      <p className="mb-3 mt-1 text-[11px] text-gray-500">
        Ej: Early bird, Precio medio, Cierre de carrito. El Panel ejecutivo muestra una pestaña por fase para filtrar
        ventas y embudo a ese rango exacto.
      </p>
      <div className="mb-3 flex flex-col gap-1.5">
        {phases.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded border border-border2 bg-input px-3 py-2 text-[12.5px]">
            <span className="w-32 shrink-0 font-semibold">{p.label}</span>
            <span className="flex-1 text-gray-400">
              {formatDateOnly(p.startDate)} → {formatDateOnly(p.endDate)}
            </span>
            <button onClick={() => remove(p.id)} className="text-[11px] text-gray-500 hover:text-red-400">
              Eliminar
            </button>
          </div>
        ))}
        {phases.length === 0 && <p className="text-[11.5px] text-gray-500">Sin fases todavía.</p>}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2.5">
        <input
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Ej: Early bird"
          className="w-32 rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        />
        <input
          type="date"
          value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          className="rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        />
        <input
          type="date"
          value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          className="rounded border border-border2 bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        />
        <button type="submit" disabled={saving} className="rounded border border-accent/40 px-3 py-1.5 text-[12px] font-bold text-accent disabled:opacity-60">
          + Agregar fase
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}
    </div>
  );
}

const LAUNCH_STATUS_LABEL: Record<Launch['status'], string> = { planned: 'Planeado', active: 'Activo', closed: 'Cerrado' };

function LaunchesSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    apiGet<{ launches: Launch[] }>(`/api/launches?locationId=${locationId}`).then((res) => setLaunches(res.launches));
  }

  useEffect(load, [locationId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.endDate) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/launches', {
        locationId,
        name: form.name,
        startDate: toDateTimeIso(form.startDate, false),
        endDate: toDateTimeIso(form.endDate, true),
      });
      setForm({ name: '', startDate: '', endDate: '' });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo crear el lanzamiento.');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: Launch['status']) {
    await apiPut(`/api/launches/${id}`, { locationId, status });
    load();
  }

  async function remove(id: string) {
    await apiDelete(`/api/launches/${id}?locationId=${locationId}`);
    load();
  }

  return (
    <SectionCard
      title="Lanzamientos"
      description="Cada lanzamiento tiene sus propias fechas — el Panel ejecutivo se filtra a ese rango (y a cada fase, si definís alguna). Define aquí también qué tag o formulario de GHL marca la asistencia a cada clase."
    >
      <div className="mb-4 flex flex-col gap-2">
        {launches.map((l) => (
          <div key={l.id} className="rounded-md border border-border2 bg-card">
            <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{l.name}</span>
              <span className="text-[11px] text-gray-500">
                {formatDateOnly(l.startDate)} → {formatDateOnly(l.endDate)}
              </span>
              <select
                value={l.status}
                onChange={(e) => setStatus(l.id, e.target.value as Launch['status'])}
                className="rounded border border-border2 bg-input px-2 py-1 text-[11.5px] outline-none"
              >
                {(Object.keys(LAUNCH_STATUS_LABEL) as Launch['status'][]).map((s) => (
                  <option key={s} value={s}>
                    {LAUNCH_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setExpandedId((prev) => (prev === l.id ? null : l.id))}
                className="text-[11px] text-accent hover:underline"
              >
                {expandedId === l.id ? 'Ocultar detalles' : 'Fases y asistencia'}
              </button>
              <button onClick={() => remove(l.id)} className="text-[11px] text-gray-500 hover:text-red-400">
                Eliminar
              </button>
            </div>
            {expandedId === l.id && (
              <div className="flex flex-col gap-3 border-t border-border2 p-3.5">
                <PhasesEditor launch={l} />
                <AttendanceRulesEditor launch={l} />
              </div>
            )}
          </div>
        ))}
        {launches.length === 0 && <p className="text-[12px] text-gray-500">Sin lanzamientos creados todavía.</p>}
      </div>
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nombre</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Lanzamiento Septiembre"
            className="w-52 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Fecha inicio</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Fecha fin</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Creando…' : '+ Nuevo lanzamiento'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}
    </SectionCard>
  );
}

interface HotmartOffer {
  id: string;
  name: string;
  hotmartProductName: string;
  offerType: 'general' | 'vip' | 'upgrade' | 'order_bump';
}

const OFFER_TYPE_LABEL: Record<HotmartOffer['offerType'], string> = {
  general: 'General',
  vip: 'VIP',
  upgrade: 'Upgrade',
  order_bump: 'Order bump',
};

function HotmartOffersSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [offers, setOffers] = useState<HotmartOffer[]>([]);
  const [form, setForm] = useState({ name: '', hotmartProductName: '', offerType: 'general' as HotmartOffer['offerType'] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiGet<{ offers: HotmartOffer[] }>(`/api/hotmart/offers?locationId=${locationId}`).then((res) => setOffers(res.offers));
  }

  useEffect(load, [locationId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.hotmartProductName.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/hotmart/offers', { locationId, ...form });
      setForm({ name: '', hotmartProductName: '', offerType: 'general' });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo agregar la oferta.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiDelete(`/api/hotmart/offers/${id}?locationId=${locationId}`);
    load();
  }

  return (
    <SectionCard
      title="Ofertas Hotmart"
      description="Hotmart no distingue qué producto es 'la oferta general' vs. un upgrade a VIP o un order bump — mapealo acá para que el Panel ejecutivo separe compras, upgrades y order bumps en vez de contarlo todo junto. El nombre del producto debe coincidir exactamente con el que llega de Hotmart (visible en Ventas Hotmart una vez sincronizado)."
    >
      <div className="mb-4 flex flex-col gap-1.5">
        {offers.map((o) => (
          <div key={o.id} className="flex items-center gap-3 rounded-md border border-border2 bg-card px-3.5 py-2.5 text-[12.5px]">
            <span className="w-40 shrink-0 truncate font-semibold">{o.name}</span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase text-gray-400">{OFFER_TYPE_LABEL[o.offerType]}</span>
            <span className="flex-1 truncate font-mono text-accent">{o.hotmartProductName}</span>
            <button onClick={() => remove(o.id)} className="text-[11px] text-gray-500 hover:text-red-400">
              Eliminar
            </button>
          </div>
        ))}
        {offers.length === 0 && <p className="text-[12px] text-gray-500">Sin ofertas mapeadas — todas las ventas se cuentan como "General" por ahora.</p>}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nombre interno</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: VIP con bonos"
            className="w-44 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Tipo</label>
          <select
            value={form.offerType}
            onChange={(e) => setForm({ ...form, offerType: e.target.value as HotmartOffer['offerType'] })}
            className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          >
            {(Object.keys(OFFER_TYPE_LABEL) as HotmartOffer['offerType'][]).map((t) => (
              <option key={t} value={t}>
                {OFFER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nombre del producto en Hotmart</label>
          <input
            value={form.hotmartProductName}
            onChange={(e) => setForm({ ...form, hotmartProductName: e.target.value })}
            placeholder="Team Management Week VIP"
            className="w-64 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : '+ Agregar oferta'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}
    </SectionCard>
  );
}

interface TribeTag {
  id: string;
  tagName: string;
  label: string;
}

function TribeTagsSection() {
  const { locationId } = useOutletContext<OutletContext>();
  const [tribes, setTribes] = useState<TribeTag[]>([]);
  const [form, setForm] = useState({ tagName: '', label: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiGet<{ tribes: TribeTag[] }>(`/api/launches/tribes?locationId=${locationId}`).then((res) => setTribes(res.tribes));
  }

  useEffect(load, [locationId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.tagName.trim() || !form.label.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/api/launches/tribes', { locationId, ...form });
      setForm({ tagName: '', label: '' });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo agregar la tribu.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiDelete(`/api/launches/tribes/${id}?locationId=${locationId}`);
    load();
  }

  return (
    <SectionCard
      title="Tribus"
      description="GHL no tiene un concepto de 'tribu' propio — mapeá acá qué etiqueta (tag) de GHL representa a cada tribu para que el Panel ejecutivo muestre cuántos leads van en cada una. El nombre del tag debe coincidir exactamente con el que existe en GHL."
    >
      <div className="mb-4 flex flex-col gap-1.5">
        {tribes.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-md border border-border2 bg-card px-3.5 py-2.5 text-[12.5px]">
            <span className="w-40 shrink-0 truncate font-semibold">{t.label}</span>
            <span className="flex-1 truncate font-mono text-accent">{t.tagName}</span>
            <button onClick={() => remove(t.id)} className="text-[11px] text-gray-500 hover:text-red-400">
              Eliminar
            </button>
          </div>
        ))}
        {tribes.length === 0 && <p className="text-[12px] text-gray-500">Sin tribus mapeadas todavía.</p>}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nombre de la tribu</label>
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Ej: Tribu Fuego"
            className="w-44 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Tag en GHL</label>
          <input
            value={form.tagName}
            onChange={(e) => setForm({ ...form, tagName: e.target.value })}
            placeholder="tribu-fuego"
            className="w-52 rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b] disabled:opacity-60">
          {saving ? 'Guardando…' : '+ Agregar tribu'}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}
    </SectionCard>
  );
}

const WIZARD_STEPS = [
  { id: 'conexion', label: 'Conexión GHL' },
  { id: 'equipo', label: 'Equipo y asesores' },
  { id: 'lanzamientos', label: 'Lanzamientos' },
  { id: 'ia', label: 'Prompts / IA' },
  { id: 'reglas', label: 'Reglas de etiquetas' },
  { id: 'metas', label: 'Metas' },
  { id: 'metricas', label: 'Métricas' },
  { id: 'disparadores', label: 'Disparadores de chat' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'perfil', label: 'Tu perfil' },
] as const;

export default function Settings() {
  const { user } = useAuth();
  const [step, setStep] = useState<(typeof WIZARD_STEPS)[number]['id']>('conexion');
  const isAdmin = user?.role === 'admin';

  return (
    <div className="roi-in flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {WIZARD_STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`whitespace-nowrap rounded-md border px-4 py-2.5 text-[12.5px] font-semibold ${
              step === s.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border2 bg-card text-gray-300 hover:bg-white/5'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {step === 'conexion' && <ConnectionSection />}
        {step === 'equipo' && isAdmin && <TeamSection />}
        {step === 'lanzamientos' && (isAdmin || user?.role === 'manager') && (
          <>
            <LaunchesSection />
            <HotmartOffersSection />
            <TribeTagsSection />
          </>
        )}
        {step === 'ia' && isAdmin && (
          <>
            <OpenAiKeySection />
            <PromptSection />
            <AiWriteBackSection />
          </>
        )}
        {step === 'reglas' && isAdmin && <StageAutomationSection />}
        {step === 'metas' && (isAdmin || user?.role === 'manager') && <GoalsSection />}
        {step === 'metricas' && (isAdmin || user?.role === 'manager') && <MetricsSection />}
        {step === 'disparadores' && (isAdmin || user?.role === 'manager') && <TriggersSection />}
        {step === 'integraciones' && (
          <>
            {isAdmin && <HotmartSection />}
            <FathomSection />
          </>
        )}
        {step === 'perfil' && <ProfileSection />}
        {!isAdmin && ['equipo', 'ia', 'reglas'].includes(step) && (
          <p className="rounded-[7px] border border-border bg-panel p-6 text-center text-[13px] text-gray-500">
            Solo un administrador puede ver esta sección.
          </p>
        )}
      </div>
    </div>
  );
}
