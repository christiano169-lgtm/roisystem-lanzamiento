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
