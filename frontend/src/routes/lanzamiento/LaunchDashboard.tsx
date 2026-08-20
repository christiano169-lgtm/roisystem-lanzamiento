import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { formatCurrency, formatDate, formatMinutes, formatNumber } from '../../lib/format';
import NoLocationState from '../../components/NoLocationState';
import type { OutletContext } from '../AppLayout';

interface Launch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'closed';
}

interface AttendanceRow {
  ruleId: string;
  label: string;
  matchType: 'tag' | 'form';
  count: number;
}

interface SetterRow {
  ownerGhlId: string;
  name: string;
  assignados: number;
  atendidos: number;
  pendientes: number;
  primeraRespuestaMinutosPromedio: number | null;
  citas: number;
}

interface LaunchSummary {
  launch: Launch;
  ventas: {
    ingresos: number;
    efectivoCobrado: number;
    ticketPromedio: number;
    wonCount: number;
    hotmart: { revenue: number; salesCount: number; averageTicket: number; byProduct: Array<{ productName: string; revenue: number; salesCount: number }> };
  };
  funnel: Array<{ pipelineStageId: string | null; pipelineName: string; stageName: string; count: number; percentageOfTotalPct: number }>;
  asistencia: AttendanceRow[];
  setters: SetterRow[];
}

const STATUS_LABEL: Record<Launch['status'], string> = { planned: 'Planeado', active: 'Activo', closed: 'Cerrado' };
const STATUS_COLOR: Record<Launch['status'], string> = { planned: '#8b96a8', active: '#34d399', closed: '#f59e0b' };

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[7px] border border-border bg-panel px-3.5 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1 text-[21px] font-bold" style={{ color: color ?? '#22d3ee' }}>
        {value}
      </div>
    </div>
  );
}

export default function LaunchDashboard() {
  const { locationId } = useOutletContext<OutletContext>();
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<LaunchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    apiGet<{ launches: Launch[] }>(`/api/launches?locationId=${locationId}`).then((res) => {
      if (cancelled) return;
      setLaunches(res.launches);
      setLaunchId((prev) => (prev && res.launches.some((l) => l.id === prev) ? prev : (res.launches[0]?.id ?? null)));
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  useEffect(() => {
    if (!launchId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<LaunchSummary>(`/api/launches/${launchId}/summary?locationId=${locationId}`);
        if (!cancelled) setSummary(res);
      } catch {
        if (!cancelled) setError('No se pudo cargar el resumen del lanzamiento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [launchId, locationId]);

  if (!locationId) return <NoLocationState />;

  if (launches && launches.length === 0) {
    return (
      <div className="roi-in mx-auto mt-10 max-w-lg rounded-lg border border-border2 bg-panel p-8 text-center">
        <h2 className="mb-2 text-lg font-semibold">Todavía no hay lanzamientos creados</h2>
        <p className="mb-5 text-sm text-gray-400">
          Crea uno en Configuración → pestaña "Lanzamientos" (nombre + fecha de inicio/fin) para ver ventas, embudo,
          asistencia a clases y gestión de setters de ese lanzamiento en un solo lugar.
        </p>
        <Link to="/app/settings" className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b]">
          Ir a Configuración
        </Link>
      </div>
    );
  }

  return (
    <div className="roi-in flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={launchId ?? ''}
          onChange={(e) => setLaunchId(e.target.value || null)}
          className="rounded border border-border2 bg-input px-3 py-2 text-sm outline-none focus:border-accent/60"
        >
          {launches?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {summary && (
          <>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: `${STATUS_COLOR[summary.launch.status]}22`, color: STATUS_COLOR[summary.launch.status] }}>
              {STATUS_LABEL[summary.launch.status]}
            </span>
            <span className="text-[12px] text-gray-500">
              {formatDate(summary.launch.startDate)} → {formatDate(summary.launch.endDate)}
            </span>
          </>
        )}
        {loading && <span className="text-[12px] text-gray-500">Cargando…</span>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {summary && (
        <>
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ventas</span>
            <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <Card label="Ingresos (oportunidades)" value={formatCurrency(summary.ventas.ingresos)} />
              <Card label="Efectivo cobrado" value={formatCurrency(summary.ventas.efectivoCobrado)} color="#34d399" />
              <Card label="Ventas Hotmart" value={formatCurrency(summary.ventas.hotmart.revenue)} color="#f472b6" />
              <Card label="Ticket promedio Hotmart" value={formatCurrency(summary.ventas.hotmart.averageTicket)} color="#f59e0b" />
            </div>
            {summary.ventas.hotmart.byProduct.length > 0 && (
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
                    {summary.ventas.hotmart.byProduct.map((p) => (
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
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Embudo</span>
            <div className="overflow-hidden rounded-[7px] border border-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Etapa</th>
                    <th className="px-4 py-2.5 font-medium">Contactos</th>
                    <th className="px-4 py-2.5 font-medium">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.funnel.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                        Sin oportunidades en este rango todavía.
                      </td>
                    </tr>
                  )}
                  {summary.funnel.map((s) => (
                    <tr key={`${s.pipelineName}-${s.stageName}`} className="border-t border-[#1e1e23]">
                      <td className="px-4 py-2.5 font-semibold">
                        {s.pipelineName} · {s.stageName}
                      </td>
                      <td className="px-4 py-2.5 text-accent">{formatNumber(s.count)}</td>
                      <td className="px-4 py-2.5 text-gray-300">{s.percentageOfTotalPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Asistencia a clases</span>
            {summary.asistencia.length === 0 ? (
              <p className="rounded-[7px] border border-border bg-panel px-4 py-4 text-[12.5px] text-gray-500">
                Sin reglas de asistencia configuradas — agrega el tag o formulario de GHL que marca "entró a la clase" en
                Configuración → Lanzamientos → esta ventana → "Reglas de asistencia".
              </p>
            ) : (
              <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {summary.asistencia.map((a) => (
                  <Card key={a.ruleId} label={a.label} value={formatNumber(a.count)} color="#818cf8" />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Gestión de setters</span>
              <Link to="/app/setters" className="text-[11px] text-accent hover:underline">
                Ver detalle completo →
              </Link>
            </div>
            <div className="overflow-hidden rounded-[7px] border border-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#141418] text-left text-[12px] text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Setter</th>
                    <th className="px-4 py-2.5 font-medium">Asignados</th>
                    <th className="px-4 py-2.5 font-medium">Atendidos</th>
                    <th className="px-4 py-2.5 font-medium">Pendientes</th>
                    <th className="px-4 py-2.5 font-medium">1ª respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.setters.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                        Sin chats asignados en este rango todavía.
                      </td>
                    </tr>
                  )}
                  {summary.setters.map((s) => (
                    <tr key={s.ownerGhlId} className="border-t border-[#1e1e23]">
                      <td className="px-4 py-2.5 font-semibold">{s.name}</td>
                      <td className="px-4 py-2.5 text-accent">{formatNumber(s.assignados)}</td>
                      <td className="px-4 py-2.5 text-emerald-400">{formatNumber(s.atendidos)}</td>
                      <td className="px-4 py-2.5" style={{ color: s.pendientes > 5 ? '#ef4444' : '#f59e0b' }}>
                        {formatNumber(s.pendientes)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-300">{formatMinutes(s.primeraRespuestaMinutosPromedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
