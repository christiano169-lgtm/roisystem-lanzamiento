import { useState } from 'react';
import { apiPost } from '../lib/api';
import { formatDateOnly } from '../lib/format';
import { useActiveLaunch } from '../lib/useActiveLaunch';
import Modal from './Modal';

interface ReportResponse {
  launchName: string;
  from: string;
  to: string;
  lines: string[];
}

export default function WeeklyReportButton({ locationId }: { locationId: string }) {
  const launch = useActiveLaunch(locationId);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  async function build() {
    setOpen(true);
    setReport(null);
    setError(null);
    if (!launch) {
      setError('Todavía no hay ningún lanzamiento creado — creá uno en Configuración → Lanzamientos primero.');
      return;
    }
    try {
      const res = await apiPost<ReportResponse>('/api/assistant/report', { locationId, launchId: launch.id });
      setReport(res);
    } catch {
      setError('No se pudo generar el reporte.');
    }
  }

  function download() {
    if (!report) return;
    const body = `ROISystem · ${report.launchName} (${formatDateOnly(report.from)} — ${formatDateOnly(report.to)})\n\n${report.lines.join('\n')}`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roisystem-reporte-lanzamiento.txt';
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
        Generar reporte del lanzamiento
      </button>

      {open && (
        <Modal title={report ? `Reporte · ${report.launchName} (${formatDateOnly(report.from)} — ${formatDateOnly(report.to)})` : 'Reporte del lanzamiento'} onClose={() => setOpen(false)}>
          {!report && !error && <p className="roi-pulse text-[13px] text-gray-500">Generando…</p>}
          {error && <p className="text-[13px] text-red-400">{error}</p>}
          {report && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md border border-border2 bg-card p-4">
                {report.lines.map((l, i) => (
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
                  href={`mailto:${email}?subject=${encodeURIComponent(`ROISystem · ${report.launchName}`)}&body=${encodeURIComponent(report.lines.join('\n'))}`}
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
