interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

export default function KpiCard({ label, value, sub, accent = '#22d3ee' }: KpiCardProps) {
  return (
    <div
      className="roi-in flex min-h-[64px] flex-col gap-2 rounded-[7px] border border-border px-3.5 py-3 transition-transform duration-200 hover:-translate-y-0.5"
      style={{ borderLeft: `3px solid ${accent}`, background: `linear-gradient(140deg, ${accent}18 0%, #08090f 65%)` }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className="text-[21.5px] font-bold leading-none tracking-tight" style={{ color: accent }}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-gray-500">{sub}</span>}
    </div>
  );
}
