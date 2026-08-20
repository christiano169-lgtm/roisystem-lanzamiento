import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

interface ObjectionRow {
  category: string;
  count: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  precio: 'Precio',
  tiempo: 'Tiempo',
  competencia: 'Competencia',
  confianza: 'Confianza',
  necesidad: 'Necesidad',
  otro: 'Otro',
};

const CATEGORY_COLOR: Record<string, string> = {
  precio: '#ef4444',
  competencia: '#f97316',
  confianza: '#eab308',
  tiempo: '#a78bfa',
  necesidad: '#38bdf8',
  otro: '#8b96a8',
};

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function ObjectionsWidget({ locationId, from, to }: { locationId: string; from: string; to: string }) {
  const [rows, setRows] = useState<ObjectionRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
    apiGet<{ breakdown: ObjectionRow[] }>(`/api/quality/objections?${qs}`)
      .then((res) => {
        if (!cancelled) setRows(res.breakdown);
      })
      .catch(() => {
        if (!cancelled) setRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, from, to]);

  if (!rows || rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  let cumulative = 0;
  const gradientStops = rows
    .map((r) => {
      const startPct = (cumulative / total) * 100;
      cumulative += r.count;
      const endPct = (cumulative / total) * 100;
      const color = CATEGORY_COLOR[r.category] ?? '#8b96a8';
      return `${color} ${startPct}% ${endPct}%`;
    })
    .join(', ');

  return (
    <div className="rounded-[7px] border border-border bg-panel p-5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">Objeciones más comunes</span>
      <div className="mt-4 flex items-center gap-7">
        <div
          className="roi-pop flex h-[130px] w-[130px] shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${gradientStops})` }}
        >
          <div className="h-[78px] w-[78px] rounded-full bg-panel" />
        </div>
        <div className="roi-stagger flex flex-1 flex-col gap-2.5">
          {rows.map((r) => {
            const color = CATEGORY_COLOR[r.category] ?? '#8b96a8';
            return (
              <div
                key={r.category}
                className="flex items-center gap-3 rounded-md border border-border2 bg-card px-3 py-2.5 transition-colors hover:border-white/20"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="flex-1 text-[13px] font-semibold">{CATEGORY_LABEL[r.category] ?? r.category}</span>
                <span className="rounded px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}26`, color }}>
                  {r.count}x
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
