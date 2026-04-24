export const APP_VERSION = "0.6.0";

export const DARK = {
  bg: '#13141f', surface: '#1c1e2e', card: '#222438',
  border: '#2e3048', text: '#e2e4f0', subtext: '#7b7f9e',
  muted: '#3a3d58', accent: '#00cfa8',
};
export const LIGHT = {
  bg: '#f4f5fb', surface: '#ffffff', card: '#f0f1fa',
  border: '#dde0f0', text: '#1a1c2e', subtext: '#6b6f8e',
  muted: '#c8cce0', accent: '#00a88a',
};
export const OWNER_COLORS = {
  Personal: '#00cfa8', Servo: '#60a5fa', House: '#c084fc',
  ElFamilia: '#f87171', Investment: '#fbbf24', Unown: '#6b7280',
};
export const TYPE_CONFIG = {
  Expense:  { label: 'Expense',  icon: '↓', color: '#f87171' },
  Income:   { label: 'Income',   icon: '↑', color: '#4ade80' },
  Transfer: { label: 'Transfer', icon: '⇄', color: '#60a5fa' },
};
export const REP_OPTIONS = ['One Time', 'Monthly', 'Quarterly', 'Yearly', 'Weekly'];

export function idr(n) {
  if (!n && n !== 0) return 'Rp0';
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? '-Rp' : 'Rp') + abs.toLocaleString('id-ID');
}

export function generatePairId() {
  const d = new Date();
  const p = (n, l=2) => String(n).padStart(l, '0');
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}