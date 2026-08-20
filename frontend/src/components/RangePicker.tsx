import { daysAgoISODate } from '../lib/format';

export type RangePreset = 'hoy' | '7' | '30' | 'custom';

interface RangePickerProps {
  range: RangePreset;
  from: string;
  to: string;
  onChange: (range: RangePreset, from: string, to: string) => void;
  loading?: boolean;
}

export default function RangePicker({ range, from, to, onChange, loading }: RangePickerProps) {
  function applyPreset(preset: RangePreset) {
    const days = preset === 'hoy' ? 0 : preset === '7' ? 7 : preset === '30' ? 30 : null;
    if (days !== null) {
      onChange(preset, daysAgoISODate(days), daysAgoISODate(0));
    } else {
      onChange(preset, from, to);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex overflow-hidden rounded-md border border-border2 bg-card">
        {(
          [
            ['hoy', 'Hoy'],
            ['7', 'Últimos 7 días'],
            ['30', '30 días'],
          ] as [RangePreset, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => applyPreset(id)}
            className={`whitespace-nowrap border-l border-border2 px-4 py-2 text-[13px] font-semibold first:border-l-0 ${
              range === id ? 'bg-accent/10 text-accent' : 'text-gray-300 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-md border border-border2 bg-card px-3.5 py-2 text-[13px]">
        <input type="date" value={from} onChange={(e) => onChange('custom', e.target.value, to)} className="bg-transparent text-sm outline-none" />
        <span className="text-gray-600">—</span>
        <input type="date" value={to} onChange={(e) => onChange('custom', from, e.target.value)} className="bg-transparent text-sm outline-none" />
      </div>
      <button
        onClick={() => applyPreset('7')}
        className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-2 text-[13px] font-semibold text-red-300 hover:bg-red-900/40"
      >
        Restablecer
      </button>
      {loading && <span className="text-xs text-gray-500">Cargando…</span>}
    </div>
  );
}
