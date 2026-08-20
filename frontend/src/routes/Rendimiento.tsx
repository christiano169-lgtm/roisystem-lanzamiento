import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatDate, formatNumber } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import Modal from '../components/Modal';
import type { OutletContext } from './AppLayout';

type Tab = 'videollamadas' | 'llamadas' | 'chats';

interface QualityAnalysis {
  interestScorePct: number;
  qualityScore: string;
  objections: unknown;
  objectionCategories: string[];
  summary: string | null;
  improvementNotes: string | null;
}

interface CallRow {
  id: string;
  contactGhlId: string | null;
  ownerGhlId: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  ghlCreatedAt: string | null;
  qualityAnalysis: QualityAnalysis | null;
}

interface VideoCallRow {
  id: string;
  contactGhlId: string | null;
  ownerGhlId: string | null;
  title: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  occurredAt: string | null;
  qualityAnalysis: QualityAnalysis | null;
}

interface ConversationRow {
  id: string;
  contactGhlId: string | null;
  ownerGhlId: string | null;
  lastMessageAt: string | null;
  messages: { body: string | null }[];
  qualityAnalysis: QualityAnalysis | null;
}

interface GhlUser {
  ghlUserId: string;
  name: string;
}

interface UnifiedRecord {
  id: string;
  ownerGhlId: string | null;
  contactGhlId: string | null;
  date: string | null;
  meta: string;
  transcript: string | null;
  analysis: QualityAnalysis | null;
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function qualityColor(score: number): string {
  if (score >= 8) return '#34d399';
  if (score >= 6) return '#f59e0b';
  return '#ef4444';
}

const TABS: { id: Tab; label: string; endpoint: string }[] = [
  { id: 'videollamadas', label: 'Videollamadas', endpoint: '/api/video-calls' },
  { id: 'llamadas', label: 'Llamadas', endpoint: '/api/calls' },
  { id: 'chats', label: 'Chats', endpoint: '/api/conversations' },
];

export default function Rendimiento() {
  const { locationId } = useOutletContext<OutletContext>();
  const [tab, setTab] = useState<Tab>('llamadas');
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));

  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [owners, setOwners] = useState<GhlUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openOwner, setOpenOwner] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: 'transcript' | 'analysis'; record: UnifiedRecord } | null>(null);

  useEffect(() => {
    apiGet<{ users: GhlUser[] }>(`/api/ghl-users?locationId=${locationId}`).then((res) => setOwners(res.users));
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const endpoint = TABS.find((t) => t.id === tab)!.endpoint;
      const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}&pageSize=200`;
      try {
        const res = await apiGet<{ items: CallRow[] | VideoCallRow[] | ConversationRow[] }>(`${endpoint}?${qs}`);
        if (cancelled) return;
        let unified: UnifiedRecord[];
        if (tab === 'llamadas') {
          unified = (res.items as CallRow[]).map((r) => ({
            id: r.id,
            ownerGhlId: r.ownerGhlId,
            contactGhlId: r.contactGhlId,
            date: r.ghlCreatedAt,
            meta: formatDuration(r.durationSeconds),
            transcript: r.transcript,
            analysis: r.qualityAnalysis,
          }));
        } else if (tab === 'videollamadas') {
          unified = (res.items as VideoCallRow[]).map((r) => ({
            id: r.id,
            ownerGhlId: r.ownerGhlId,
            contactGhlId: r.contactGhlId,
            date: r.occurredAt,
            meta: formatDuration(r.durationSeconds),
            transcript: r.transcript,
            analysis: r.qualityAnalysis,
          }));
        } else {
          unified = (res.items as ConversationRow[]).map((r) => ({
            id: r.id,
            ownerGhlId: r.ownerGhlId,
            contactGhlId: r.contactGhlId,
            date: r.lastMessageAt,
            meta: r.messages.length > 0 ? 'con mensajes' : 'sin mensajes',
            transcript: null,
            analysis: r.qualityAnalysis,
          }));
        }
        setRecords(unified);
      } catch {
        if (!cancelled) setError('No se pudo cargar este canal.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, tab, from, to]);

  const ownerName = useMemo(() => {
    const map = new Map(owners.map((o) => [o.ghlUserId, o.name]));
    return (ghlUserId: string | null) => (ghlUserId ? (map.get(ghlUserId) ?? ghlUserId) : 'Sin asignar');
  }, [owners]);

  const groups = useMemo(() => {
    const byOwner = new Map<string, UnifiedRecord[]>();
    for (const r of records) {
      const key = r.ownerGhlId ?? '__none__';
      const list = byOwner.get(key) ?? [];
      list.push(r);
      byOwner.set(key, list);
    }
    return Array.from(byOwner.entries())
      .map(([ownerGhlId, rows]) => {
        const analyzed = rows.filter((r) => r.analysis);
        const avgInterest = analyzed.length ? analyzed.reduce((s, r) => s + (r.analysis?.interestScorePct ?? 0), 0) / analyzed.length : null;
        const avgQuality = analyzed.length ? analyzed.reduce((s, r) => s + Number(r.analysis?.qualityScore ?? 0), 0) / analyzed.length : null;
        return {
          ownerGhlId: ownerGhlId === '__none__' ? null : ownerGhlId,
          rows: rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
          avgInterest,
          avgQuality,
        };
      })
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [records]);

  return (
    <div className="roi-in flex flex-col gap-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-3 text-[13.5px] font-semibold ${
              tab === t.id ? 'border-b-2 border-accent text-accent' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {TABS.find((t) => t.id === tab)!.label.toUpperCase()} POR ASESOR
        </span>
        {groups.length === 0 && !loading && (
          <p className="rounded-[7px] border border-border bg-panel p-6 text-center text-[13px] text-gray-500">
            Sin registros en este rango todavía.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.ownerGhlId ?? 'none'} className="roi-in rounded-[7px] border border-border bg-panel">
            <button
              onClick={() => setOpenOwner(openOwner === (g.ownerGhlId ?? 'none') ? null : (g.ownerGhlId ?? 'none'))}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-semibold">{ownerName(g.ownerGhlId)}</span>
                <span className="text-[11px] text-gray-500">{formatNumber(g.rows.length)} registros</span>
              </div>
              <div className="flex items-center gap-6 text-[13px]">
                {g.avgInterest !== null && (
                  <span>
                    Interés <span className="font-bold text-accent">{g.avgInterest.toFixed(0)}%</span>
                  </span>
                )}
                {g.avgQuality !== null && (
                  <span>
                    Calidad <span className="font-bold" style={{ color: qualityColor(g.avgQuality) }}>{g.avgQuality.toFixed(1)}/10</span>
                  </span>
                )}
                <span className="text-gray-500">{openOwner === (g.ownerGhlId ?? 'none') ? '▲' : '▼'}</span>
              </div>
            </button>
            {openOwner === (g.ownerGhlId ?? 'none') && (
              <div className="border-t border-[#1e1e23]">
                <div className="grid grid-cols-[1.3fr_1fr_.9fr_1fr_1.3fr] px-4 py-2.5 text-[11px] text-gray-500">
                  <span>Fecha</span>
                  <span>Contacto</span>
                  <span>Duración</span>
                  <span>Resultado</span>
                  <span>Acciones</span>
                </div>
                {g.rows.map((r) => (
                  <div key={r.id} className="roi-in grid grid-cols-[1.3fr_1fr_.9fr_1fr_1.3fr] items-center border-t border-[#1e1e23] px-4 py-3 text-[12.5px]">
                    <span className="text-gray-300">{r.date ? formatDate(r.date) : '—'}</span>
                    <span className="truncate font-mono text-[11px] text-gray-500">{r.contactGhlId ?? '—'}</span>
                    <span>{r.meta}</span>
                    <span>
                      {r.analysis ? (
                        <span className="font-bold" style={{ color: qualityColor(Number(r.analysis.qualityScore)) }}>
                          {Number(r.analysis.qualityScore).toFixed(1)}/10
                        </span>
                      ) : (
                        <span className="text-gray-600">sin analizar</span>
                      )}
                    </span>
                    <span className="flex gap-3 text-[11px]">
                      {r.transcript && (
                        <button onClick={() => setModal({ kind: 'transcript', record: r })} className="font-semibold text-accent hover:underline">
                          Transcripción
                        </button>
                      )}
                      {r.analysis && (
                        <button onClick={() => setModal({ kind: 'analysis', record: r })} className="font-semibold text-fuchsia-300 hover:underline">
                          Análisis IA
                        </button>
                      )}
                      {!r.transcript && !r.analysis && <span className="text-gray-600">—</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {modal?.kind === 'transcript' && (
        <Modal title={`Transcripción · ${ownerName(modal.record.ownerGhlId)}`} onClose={() => setModal(null)}>
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-gray-300">{modal.record.transcript}</p>
        </Modal>
      )}

      {modal?.kind === 'analysis' && modal.record.analysis && (
        <Modal title={`Análisis IA · ${ownerName(modal.record.ownerGhlId)}`} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border2 bg-card p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Interés del lead</span>
                <div className="mt-1 text-[20px] font-bold text-accent">{modal.record.analysis.interestScorePct}%</div>
              </div>
              <div className="rounded-md border border-border2 bg-card p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Calidad de ejecución</span>
                <div className="mt-1 text-[20px] font-bold" style={{ color: qualityColor(Number(modal.record.analysis.qualityScore)) }}>
                  {Number(modal.record.analysis.qualityScore).toFixed(1)}/10
                </div>
              </div>
            </div>
            {modal.record.analysis.summary && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Resumen</span>
                <p className="mt-1 text-[13.5px] leading-relaxed text-gray-300">{modal.record.analysis.summary}</p>
              </div>
            )}
            {modal.record.analysis.improvementNotes && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Aspectos de mejora</span>
                <p className="mt-1 text-[13.5px] leading-relaxed text-gray-300">{modal.record.analysis.improvementNotes}</p>
              </div>
            )}
            {modal.record.analysis.objectionCategories.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Objeciones detectadas</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {modal.record.analysis.objectionCategories.map((c, i) => (
                    <span key={i} className="rounded-full border border-border2 bg-card px-3 py-1 text-[11px] text-gray-300">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
