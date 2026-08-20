import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
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

interface Goals {
  dailyCallGoal: number | null;
  weeklyMeetingGoal: number | null;
}

const STAGE_COLORS = ['#8b96a8', '#38bdf8', '#22d3ee', '#c084fc', '#f59e0b', '#34d399'];

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function MyPanel() {
  const { locationId } = useOutletContext<OutletContext>();
  const [ghlUserId, setGhlUserId] = useState<string | null | undefined>(undefined);
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));

  const [data, setData] = useState<AdvisorPanelData | null>(null);
  const [todayCalls, setTodayCalls] = useState<number | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ user: { ghlUserId: string | null } }>('/api/profile/me').then((res) => setGhlUserId(res.user.ghlUserId));
  }, []);

  useEffect(() => {
    if (!locationId) return;
    apiGet<Goals>(`/api/settings/goals?locationId=${locationId}`).then(setGoals);
    apiGet<{ stages: PipelineStage[] }>(`/api/pipeline-stages?locationId=${locationId}`).then((res) => setStages(res.stages));
  }, [locationId]);

  useEffect(() => {
    if (!ghlUserId || !locationId) return;
    let cancelled = false;
    async function load() {
      setError(null);
      const qs = `locationId=${locationId}&ownerGhlId=${encodeURIComponent(ghlUserId!)}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
      try {
        const [panel, opps] = await Promise.all([
          apiGet<AdvisorPanelData>(`/api/kpis/advisor?${qs}`),
          apiGet<{ items: OpportunityRow[] }>(`/api/opportunities?locationId=${locationId}&pageSize=200`),
        ]);
        if (cancelled) return;
        setData(panel);
        setOpportunities(opps.items.filter((o) => o.ownerGhlId === ghlUserId));
      } catch {
        if (!cancelled) setError('No se pudo cargar tu panel.');
      }
    }
    load();
    const todayQs = `locationId=${locationId}&ownerGhlId=${encodeURIComponent(ghlUserId)}&from=${startOfTodayISO()}&to=${new Date().toISOString()}`;
    apiGet<AdvisorPanelData>(`/api/kpis/advisor?${todayQs}`)
      .then((res) => !cancelled && setTodayCalls(res.llamadas))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locationId, ghlUserId, from, to]);

  const columns = useMemo(() => {
    const primaryPipeline = stages[0]?.pipelineName;
    return stages.filter((s) => s.pipelineName === primaryPipeline).sort((a, b) => a.position - b.position);
  }, [stages]);

  if (ghlUserId === undefined) return null;

  if (ghlUserId === null) {
    return (
      <div className="roi-in rounded-[7px] border border-border bg-panel p-8 text-center">
        <h2 className="mb-2 text-[16px] font-semibold">Vincula tu usuario de GHL para ver tu panel</h2>
        <p className="text-[13px] text-gray-500">Ve a Configuración → Tu identidad en GHL y guarda tu GHL user id.</p>
      </div>
    );
  }

  const callProgress = goals?.dailyCallGoal && todayCalls !== null ? Math.min(100, Math.round((todayCalls / goals.dailyCallGoal) * 100)) : null;

  return (
    <div className="roi-in flex flex-col gap-4">
      <RangePicker
        range={range}
        from={from}
        to={to}
        onChange={(r, f, t) => {
          setRange(r);
          setFrom(f);
          setTo(t);
        }}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <div className="roi-stagger grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-7">
          <KpiCard label="Leads" value={formatNumber(data.leads)} />
          <KpiCard label="Llamadas" value={formatNumber(data.llamadas)} />
          <KpiCard label="Contestadas" value={formatNumber(data.contestadas)} accent="#f2f6fb" />
          <KpiCard label="Tiempo al lead" value={formatMinutes(data.tiempoAlLeadMinutosPromedio)} accent="#c084fc" />
          <KpiCard label="Agendadas" value={formatNumber(data.agendadas)} accent="#e879f9" sub={`Tasa ${formatPct(data.tasaAgendamientoPct)}`} />
          <KpiCard label="Asistidas" value={formatNumber(data.asistidas)} accent="#34d399" />
          <KpiCard label="Facturación" value={formatCurrency(data.facturacion)} accent="#34d399" sub={`Efectivo ${formatCurrency(data.efectivoCobrado)}`} />
        </div>
      )}

      {goals?.dailyCallGoal && (
        <div className="rounded-[7px] border border-border bg-panel p-5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            <span className="roi-pulse h-2 w-2 rounded-full bg-emerald-400" />
            Meta de llamadas — hoy
          </div>
          <div className="mb-2 flex items-center justify-between text-[13px] text-gray-300">
            <span>Progreso de hoy</span>
            <span>
              {todayCalls ?? 0} / {goals.dailyCallGoal}
            </span>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-[#1a1a1f]">
            <div
              className="roi-grow-x h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
              style={{ width: `${callProgress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {columns.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Mis leads por etapa</span>
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
