import { GAS_URL, GAS_KEY } from '../config.local.js';
export { GAS_URL, GAS_KEY };

export async function fetchConfig(forceRefresh = false) {
  const CACHE_KEY = "fulus_config";
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return data;
      }
    } catch (_) {}
  }

  const res  = await fetch(`${GAS_URL}?action=config&key=${GAS_KEY}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "GAS error");

  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
  return json.data;
}

// Kirim transaksi — pakai no-cors karena GAS redirect
// Data tetap masuk ke Sheets, kita skip baca response
export async function postTransaction(tx) {
  const payload = encodeURIComponent(JSON.stringify(tx));
  await fetch(
    `${GAS_URL}?action=insert&key=${GAS_KEY}&data=${payload}`,
    { method: 'GET', mode: 'no-cors' }
  );
  // no-cors = response opaque, tidak bisa dibaca
  // tapi request tetap terkirim dan GAS tetap proses
  return 'sent';
}

// Fetch summary — cache 15 menit
export async function fetchSummary(forceRefresh = false) {
  const CACHE_KEY = "fulus_summary";
  const CACHE_TTL = 15 * 60 * 1000;

  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return data;
      }
    } catch (_) {}
  }

  const res  = await fetch(`${GAS_URL}?action=summary&key=${GAS_KEY}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "GAS error");

  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
  return json.data;
}