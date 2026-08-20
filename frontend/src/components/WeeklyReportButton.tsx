import { useState } from 'react';
import { apiGet } from '../lib/api';
import { daysAgoISODate, formatCurrency, formatNumber, formatPct } from '../lib/format';
import Modal from './Modal';

interface OperationalKpis {
  leadsGenerados: number;
  llamadas: number;
  contestadas: number;
  tasaContestacionPct: number;
  agendadas: number;
  asistidas: number;
  ingresos: number;
  efectivoCobrado: number;
}

interface AdvisorRankingRow {
  name: string;
  llamadas: number;
  agendadas: number;
  tasaAgendamientoPct: number;
}

interface ObjectionRow {
  category: string;
  count: number;
}

function toRangeParam(dateOnly: string, endOfDay: boolean): string {
  return new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).toISOString();
}

export default function WeeklyReportButton({ locationId }: { locationId: string }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [email, setEmail] = useState('');
  const from = daysAgoISODate(7);
  const to = daysAgoISODate(0);

  async function build() {
    setOpen(true);
    setLines(null);
    const qs = `locationId=${locationId}&from=${toRangeParam(from, false)}&to=${toRangeParam(to, true)}`;
    const [kpis, ranking, objections] = await Promise.all([
      apiGet<OperationalKpis>(`/api/kpis/operational?${qs}`),
      apiGet<{ ranking: AdvisorRankingRow[] }>(`/api/kpis/ranking?${qs}`).then((r) => r.ranking),
      apiGet<{ breakdown: ObjectionRow[] }>(`/api/quality/objections?${qs}`).then((r) => r.breakdown),
    ]);
    const best = [...ranking].sort((a, b) => b.tasaAgendamientoPct - a.tasaAgendamientoPct)[0];
    const topObjection = objections[0];
    setLines(
      [
        `• Leads generados: ${formatNumber(kpis.leadsGenerados)} · Llamadas: ${formatNumber(kpis.llamadas)} · Contestadas: ${formatNumber(kpis.contestadas)} (${formatPct(kpis.tasaContestacionPct)}).`,
        `• Citas agendadas: ${formatNumber(kpis.agendadas)} · Asistidas: ${formatNumber(kpis.asistidas)}.`,
        `• Ingresos: ${formatCurrency(kpis.ingresos)} · Efectivo cobrado: ${formatCurrency(kpis.efectivoCobrado)}.`,
        best ? `• Mejor asesor: ${best.name} (${formatNumber(best.llamadas)} llamadas, ${formatNumber(best.agendadas)} citas, ${formatPct(best.tasaAgendamientoPct)} de agendamiento).` : '• Sin datos de ranking en el período.',
        topObjection ? `• Objeción más repetida: ${topObjection.category} (${topObjection.count}x).` : '• Sin objeciones detectadas en el período.',
      ],
    );
  }

  function download() {
    if (!lines) return;
    const body = `ROISystem · Reporte semanal ${from} a ${to}\n\n${lines.join('\n')}`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roisystem-reporte-semanal.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        onClick={build}
        className="fixed bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-md bg-gradient-to-r from-fuchsia-600 to-pink-500 px-7 py-3.5 text-[15.5px] font-bold text-white shadow-[0_10px_34px_rgba(219,39,119,.35)]"
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
        Generar reporte semanal
      </button>

      {open && (
        <Modal title={`Reporte semanal · ${from} — ${to}`} onClose={() => setOpen(false)}>
          {!lines && <p className="roi-pulse text-[13px] text-gray-500">Generando…</p>}
          {lines && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md border border-border2 bg-card p-4">
                {lines.map((l, i) => (
                  <p key={i} className="text-[13.5px] leading-relaxed text-gray-200">
                    {l}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Enviar por correo a</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="direccion@empresa.com"
                    className="w-full rounded border border-border2 bg-input px-3 py-2 text-[13px] outline-none focus:border-accent/60"
                  />
                </div>
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(`ROISystem · Reporte semanal ${from} a ${to}`)}&body=${encodeURIComponent(lines.join('\n'))}`}
                  className="rounded-md bg-gradient-to-r from-fuchsia-600 to-pink-500 px-5 py-2 text-[13px] font-bold text-white"
                >
                  Enviar
                </a>
                <button onClick={download} className="rounded-md border border-border2 px-5 py-2 text-[13px] font-semibold hover:bg-card">
                  Descargar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
