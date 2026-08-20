import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiGet, ApiError } from '../lib/api';
import { daysAgoISODate, formatNumber } from '../lib/format';
import RangePicker, { type RangePreset } from '../components/RangePicker';
import type { OutletContext } from './AppLayout';

interface ImprovementTheme {
  theme: string;
  affectedClosers: string[];
  recommendation: string;
}

type Channel = 'call' | 'video_call' | 'chat';

interface QualitySummaryRow {
  ownerGhlId: string;
  name: string;
  analyzedCount: number;
  avgInterestScorePct: number;
  avgQualityScore: number;
  recentImprovementNotes: string[];
}

const CHANNELS: { value: Channel | ''; label: string }[] = [
  { value: '', label: 'Todos los canales' },
  { value: 'call', label: 'Llamadas' },
  { value: 'video_call', label: 'Videollamadas' },
  { value: 'chat', label: 'Chats' },
];

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

function qualityColor(score: number): string {
  if (score >= 8) return '#34d399';
  if (score >= 6) return '#f59e0b';
  return '#ef4444';
}

export default function Quality() {
  const { locationId } = useOutletContext<OutletContext>();
  const [range, setRange] = useState<RangePreset>('30');
  const [from, setFrom] = useState(() => daysAgoISODate(30));
  const [to, setTo] = useState(() => daysAgoISODate(0));
  const [channel, setChannel] = useState<Channel | ''>('');
  const [summary, setSummary] = useState<QualitySummaryRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [themes, setThemes] = useState<ImprovementTheme[] | null>(null);
  const [themesLoading, setThemesLoading] = useState(false);
  const [themesError, setThemesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({
        locationId,
        from: toRangeParam(from, false),
        to: toRangeParam(to, true),
        ...(channel ? { channel } : {}),
      });
      try {
        const { summary: rows } = await apiGet<{ summary: QualitySummaryRow[] }>(`/api/quality/summary?${qs}`);
        if (!cancelled) setSummary(rows);
      } catch {
        if (!cancelled) setError('No se pudo cargar el reporte de calidad.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to, channel]);

  async function loadThemes() {
    setThemesLoading(true);
    setThemesError(null);
    const qs = new URLSearchParams({
      locationId,
      from: toRangeParam(from, false),
      to: toRangeParam(to, true),
      ...(channel ? { channel } : {}),
    });
    try {
      const { themes: rows } = await apiGet<{ themes: ImprovementTheme[] }>(`/api/quality/themes?${qs}`);
      setThemes(rows);
    } catch (err) {
      setThemesError(err instanceof ApiError ? err.message : 'No se pudieron sintetizar los temas del equipo.');
    } finally {
      setThemesLoading(false);
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
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel | '')}
          className="rounded-md border border-border2 bg-card px-3 py-2 text-[13px]"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-3 rounded-[7px] border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">Temas comunes del equipo</span>
            <p className="text-[12px] text-gray-500">La IA agrupa patrones de mejora que se repiten entre varios asesores en el rango.</p>
          </div>
          <button
            onClick={loadThemes}
            disabled={themesLoading}
            className="shrink-0 rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-[13px] font-bold text-[#04212b] disabled:opacity-60"
          >
            {themesLoading ? 'Analizando…' : 'Analizar temas del equipo'}
          </button>
        </div>
        {themesError && <p className="text-sm text-red-400">{themesError}</p>}
        {themes && themes.length === 0 && (
          <p className="text-[13px] text-gray-500">No hay suficientes conversaciones analizadas en este rango para encontrar patrones de equipo.</p>
        )}
        {themes && themes.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {themes.map((t, i) => (
              <div key={i} className="rounded-md border border-border2 bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{t.theme}</span>
                  <span className="text-[11px] text-gray-500">{t.affectedClosers.join(', ')}</span>
                </div>
                <p className="mt-1 text-[13px] text-gray-300">{t.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {summary && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Por asesor</span>
          {summary.length === 0 && (
            <p className="rounded-[7px] border border-border bg-panel p-6 text-center text-[13px] text-gray-500">
              Todavía no hay conversaciones analizadas en este rango. Conecta Fathom, sincroniza llamadas con grabación, o espera a
              que los chats se analicen automáticamente.
            </p>
          )}
          {summary.map((row) => (
            <div key={row.ownerGhlId} className="rounded-[7px] border border-border bg-panel p-4">
              <button
                onClick={() => setExpanded(expanded === row.ownerGhlId ? null : row.ownerGhlId)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[14px] font-semibold">{row.name}</span>
                  <span className="text-[11px] text-gray-500">{formatNumber(row.analyzedCount)} analizadas</span>
                </div>
                <div className="flex items-center gap-6 text-[13px]">
                  <span>
                    Interés <span className="font-bold text-accent">{row.avgInterestScorePct.toFixed(0)}%</span>
                  </span>
                  <span>
                    Calidad{' '}
                    <span className="font-bold" style={{ color: qualityColor(row.avgQualityScore) }}>
                      {row.avgQualityScore.toFixed(1)}/10
                    </span>
                  </span>
                  <span className="text-gray-500">{expanded === row.ownerGhlId ? '▲' : '▼'}</span>
                </div>
              </button>
              {expanded === row.ownerGhlId && (
                <div className="mt-4 flex flex-col gap-2 border-t border-[#1e1e23] pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Aspectos de mejora recientes</span>
                  {row.recentImprovementNotes.length === 0 && <span className="text-[13px] text-gray-500">Sin notas todavía.</span>}
                  {row.recentImprovementNotes.map((note, i) => (
                    <p key={i} className="text-[13px] text-gray-300">
                      • {note}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
