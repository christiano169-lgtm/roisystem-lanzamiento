import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet, apiPatch, ApiError } from '../lib/api';
import { daysAgoISODate, formatCurrency } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import type { OutletContext } from './AppLayout';

interface PipelineStage {
  id: string;
  ghlPipelineId: string;
  ghlStageId: string;
  pipelineName: string;
  stageName: string;
  position: number;
}

interface OpportunityRow {
  id: string;
  name: string | null;
  monetaryValue: string | null;
  status: string | null;
  ownerGhlId: string | null;
  pipelineStageId: string | null;
  ghlUpdatedAt: string | null;
  contact: { firstName: string | null; lastName: string | null; phone: string | null } | null;
}

interface GhlUser {
  ghlUserId: string;
  name: string;
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

const STAGE_COLORS = ['#8b96a8', '#a78bfa', '#c084fc', '#a855f7', '#f59e0b', '#34d399', '#ef4444'];

export default function CrmBoard() {
  const { locationId } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const canMove = user?.role === 'admin' || user?.role === 'manager';

  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [pipelineName, setPipelineName] = useState<string>('');
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [owners, setOwners] = useState<GhlUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    apiGet<{ stages: PipelineStage[] }>(`/api/pipeline-stages?locationId=${locationId}`).then((res) => {
      setStages(res.stages);
      setPipelineName((prev) => prev || res.stages[0]?.pipelineName || '');
    });
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
        const res = await apiGet<{ items: OpportunityRow[] }>(`/api/opportunities?${qs}`);
        if (!cancelled) setOpportunities(res.items);
      } catch {
        if (!cancelled) setError('No se pudieron cargar las oportunidades.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  const pipelines = useMemo(() => Array.from(new Set(stages.map((s) => s.pipelineName))), [stages]);
  const columns = useMemo(
    () => stages.filter((s) => s.pipelineName === pipelineName).sort((a, b) => a.position - b.position),
    [stages, pipelineName],
  );
  const ownerName = useMemo(() => {
    const map = new Map(owners.map((o) => [o.ghlUserId, o.name]));
    return (ghlUserId: string | null) => (ghlUserId ? (map.get(ghlUserId) ?? ghlUserId) : 'Sin asignar');
  }, [owners]);

  async function moveOpportunity(opp: OpportunityRow, targetStageId: string) {
    setMoveError(null);
    const prevStageId = opp.pipelineStageId;
    setOpportunities((prev) => prev.map((o) => (o.id === opp.id ? { ...o, pipelineStageId: targetStageId } : o)));
    try {
      await apiPatch(`/api/opportunities/${opp.id}/stage`, { pipelineStageId: targetStageId });
    } catch (err) {
      setOpportunities((prev) => prev.map((o) => (o.id === opp.id ? { ...o, pipelineStageId: prevStageId } : o)));
      setMoveError(err instanceof ApiError ? err.message : 'No se pudo mover la oportunidad en GHL.');
    }
  }

  return (
    <div className="roi-in flex flex-col gap-4">
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
        {pipelines.length > 1 && (
          <select
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="rounded-md border border-border2 bg-card px-3 py-2 text-[13px]"
          >
            {pipelines.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        {!canMove && <span className="text-[11px] text-gray-500">Modo lectura — pide a un admin o manager para mover etapas.</span>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {moveError && <p className="text-sm text-red-400">{moveError}</p>}

      {columns.length === 0 && !loading && (
        <p className="rounded-[7px] border border-border bg-panel p-6 text-center text-[13px] text-gray-500">
          Esta subcuenta todavía no tiene pipelines/etapas sincronizados desde GHL.
        </p>
      )}

      {columns.length > 0 && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
          {columns.map((stage, colIndex) => {
            const color = STAGE_COLORS[colIndex % STAGE_COLORS.length];
            const cards = opportunities.filter((o) => o.pipelineStageId === stage.id);
            return (
              <div key={stage.id} className="roi-in flex min-h-[200px] flex-col rounded-[7px] border border-border bg-panel">
                <div
                  className="flex items-center justify-between gap-2 border-b border-[#1e1e23] px-3 py-2.5"
                  style={{ background: `linear-gradient(90deg, ${color}22, transparent)` }}
                >
                  <span className="flex items-center gap-2 truncate text-[11px] font-bold" style={{ color }}>
                    <span className="roi-pulse h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: color }} />
                    {stage.stageName}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-bold text-gray-300">{cards.length}</span>
                </div>
                <div className="roi-stagger flex flex-col gap-2 p-2.5">
                  {cards.map((opp) => {
                    const label = opp.name || [opp.contact?.firstName, opp.contact?.lastName].filter(Boolean).join(' ') || '(sin nombre)';
                    return (
                      <div
                        key={opp.id}
                        className="flex flex-col gap-1.5 rounded-md border border-border2 bg-card p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-white/25"
                      >
                        <span className="truncate text-[12.5px] font-semibold">{label}</span>
                        <span className="truncate text-[10.5px] text-gray-500">{ownerName(opp.ownerGhlId)}</span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-emerald-400">
                            {opp.monetaryValue ? formatCurrency(Number(opp.monetaryValue)) : '—'}
                          </span>
                        </div>
                        {canMove && (
                          <div className="flex gap-2 border-t border-[#1e1e23] pt-1.5 text-[10px]">
                            <button
                              disabled={colIndex === 0}
                              onClick={() => moveOpportunity(opp, columns[colIndex - 1]!.id)}
                              className="text-gray-400 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ← atrás
                            </button>
                            <button
                              disabled={colIndex === columns.length - 1}
                              onClick={() => moveOpportunity(opp, columns[colIndex + 1]!.id)}
                              className="ml-auto text-[#c084fc] hover:text-[#c084fc]/80 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              avanzar →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && <span className="px-1 py-2 text-center text-[11px] text-gray-600">Sin oportunidades</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
