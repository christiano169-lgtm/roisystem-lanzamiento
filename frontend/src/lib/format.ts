export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

/** Hotmart-sourced sale amounts (priceValue) aren't FX-converted to one currency yet — this just formats them as USD, matching what Hotmart's own dashboard shows by default. */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

export function formatMinutes(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)} min`;
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** yyyy-mm-dd, N days ago — for default date-range inputs. */
export function daysAgoISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Launch/phase start-end dates are calendar days (picked via <input
 * type="date">, serialized as UTC midnight) — running them through
 * toLocaleString/toLocaleDateString converts to the browser's timezone and
 * can roll the displayed day back by one (e.g. "2025-01-01T00:00:00.000Z"
 * showing as "31/12/2024" for anyone west of UTC). Read the date parts
 * straight off the ISO string instead of converting.
 */
export function formatDateOnly(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
