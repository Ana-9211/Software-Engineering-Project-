// Money is an integer in minor currency units; it is converted to two decimals for display only (D-08).
const CURRENCY = (import.meta.env && import.meta.env.VITE_CURRENCY) || 'INR';

export function formatMoney(minor, currency = CURRENCY) {
  const value = (Number(minor) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// "12.50" -> 1250. Returns NaN when the text is not a valid amount with up to two decimals.
export function toMinorUnits(text) {
  const t = String(text).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

export function minorToInput(minor) {
  return (minor / 100).toFixed(2);
}

export const today = () => new Date().toISOString().slice(0, 10);
