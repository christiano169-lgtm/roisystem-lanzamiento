import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatMinutes, formatNumber, formatPct } from '../lib/format';
import KpiCard from '../components/KpiCard';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import type { OutletContext } from './AppLayout';

interface AdvisorPanelData {
  ownerGhlId: string;
  name: string;
  leads: number;
  llamadas: number;
  contestadas: number;
  tiempoAlLeadMinutosPromedio: number | null;
  agendadas: number;
  asistidas: number;
  facturacion: number;
  efectivoCobrado: number;
  tasaAgendamientoPct: number;
}

interface GhlUser {
  ghlUserId: string;
  name: string;
}

interface PipelineStage {
  id: string;
  pipelineName: string;
  stageName: string;
  position: number;
}

interface OpportunityRow {
  id: string;
  name: string | null;
  monetaryValue: string | null;
  ownerGhlId: string | null;
  pipelineStageId: string | null;
  contact: { firstName: string | null; lastName: string | null } | null;
}

const STAGE_COLORS = ['#8b96a8', '#38bdf8', '#22d3ee', '#c084fc', '#f59e0b', '#34d399'];

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function AdvisorPanel() {
  const { locationId } = useOutletContext<OutletContext>();
  const { ownerGhlId } = useParams<{ ownerGhlId: string }>();
  const navigate = useNavigate();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [data, setData] = useState<AdvisorPanelData | null>(null);
  const [owners, setOwners] = useState<GhlUser[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ users: GhlUser[] }>(`/api/ghl-users?locationId=${locationId}`).then((res) => {
      setOwners(res.users);
      if (!ownerGhlId && res.users[0]) navigate(`/app/advisor/${res.users[0].ghlUserId}`, { replace: true });
    });
    apiGet<{ stages: PipelineStage[] }>(`/api/pipeline-stages?locationId=${locationId}`).then((res) => setStages(res.stages));
  }, [locationId, ownerGhlId, navigate]);

  useEffect(() => {
    if (!ownerGhlId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `locationId=${locationId}&ownerGhlId=${encodeURIComponent(ownerGhlId as string)}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const [panel, opps] = await Promise.all([
          apiGet<AdvisorPanelData>(`/api/kpis/advisor?${qs}`),
          apiGet<{ items: OpportunityRow[] }>(`/api/opportunities?locationId=${locationId}&pageSize=200`),
        ]);
        if (cancelled) return;
        setData(panel);
        setOpportunities(opps.items.filter((o) => o.ownerGhlId === ownerGhlId));
      } catch {
        if (!cancelled) setError('No se pudo cargar el panel de este asesor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, ownerGhlId, from, to]);

  const columns = useMemo(() => {
    const primaryPipeline = stages[0]?.pipelineName;
    return stages.filter((s) => s.pipelineName === primaryPipeline).sort((a, b) => a.position - b.position);
  }, [stages]);

  return (
    <div className="roi-in flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-gray-400">Asesor:</span>
        <select
          value={ownerGhlId ?? ''}
          onChange={(e) => navigate(`/app/advisor/${e.target.value}`)}
          className="rounded-md border border-border2 bg-card px-3 py-2 text-[13px] font-semibold outline-none focus:border-accent/60"
        >
          {owners.map((o) => (
            <option key={o.ghlUserId} value={o.ghlUserId}>
              {o.name}
            </option>
          ))}
        </select>
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
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-7">
          <KpiCard label="Leads" value={formatNumber(data.leads)} />
          <KpiCard label="Llamadas" value={formatNumber(data.llamadas)} />
          <KpiCard label="Contestadas" value={formatNumber(data.contestadas)} accent="#f2f6fb" />
          <KpiCard label="Tiempo al lead" value={formatMinutes(data.tiempoAlLeadMinutosPromedio)} accent="#c084fc" />
          <KpiCard
            label="Agendadas"
            value={formatNumber(data.agendadas)}
            accent="#e879f9"
            sub={`Tasa ${formatPct(data.tasaAgendamientoPct)}`}
          />
          <KpiCard label="Asistidas" value={formatNumber(data.asistidas)} accent="#34d399" />
          <KpiCard
            label="Facturación"
            value={formatCurrency(data.facturacion)}
            accent="#34d399"
            sub={`Efectivo ${formatCurrency(data.efectivoCobrado)}`}
          />
        </div>
      )}

      {columns.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">CRM — leads por etapa</span>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))` }}>
            {columns.map((stage, i) => {
              const color = STAGE_COLORS[i % STAGE_COLORS.length];
              const cards = opportunities.filter((o) => o.pipelineStageId === stage.id);
              return (
                <div key={stage.id} className="roi-in flex min-h-[140px] flex-col rounded-[7px] border border-border bg-panel">
                  <div className="flex items-center justify-between px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${color}22, transparent)` }}>
                    <span className="text-[11px] font-bold" style={{ color }}>
                      {stage.stageName}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-bold text-gray-300">{cards.length}</span>
                  </div>
                  <div className="roi-stagger flex flex-col gap-2 p-2.5">
                    {cards.map((o) => (
                      <div key={o.id} className="rounded-md border border-border2 bg-card p-2.5">
                        <span className="block truncate text-[12px] font-semibold">
                          {o.name || [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(' ') || '(sin nombre)'}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-400">{o.monetaryValue ? formatCurrency(Number(o.monetaryValue)) : '—'}</span>
                      </div>
                    ))}
                    {cards.length === 0 && <span className="px-1 py-2 text-center text-[11px] text-gray-600">Sin leads</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
