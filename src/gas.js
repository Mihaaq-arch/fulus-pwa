// ============================================================
// FULUS — GAS CONFIG
// Isi GAS_URL dan GAS_KEY sebelum build/deploy
// ============================================================

// Config di-load dari config.local.js (tidak di-commit ke repo)
// Salin config.example.js → config.local.js lalu isi nilainya
import { GAS_URL, GAS_KEY } from '../config.local.js';
export { GAS_URL, GAS_KEY };

const headers = { "Content-Type": "application/json" };

// Fetch config (accounts + categories) — cached 24 jam di localStorage
export async function fetchConfig(forceRefresh = false) {
  const CACHE_KEY = "fulus_config";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 jam

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

// Kirim satu transaksi ke GAS
export async function postTransaction(tx) {
  const res  = await fetch(GAS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...tx, key: GAS_KEY }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "GAS error");
  return json.id;
}
