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

// Send transaction via no-cors — GAS redirects block CORS
// Request still reaches GAS and is processed; we skip reading the opaque response
export async function postTransaction(tx) {
  const payload = encodeURIComponent(JSON.stringify(tx));
  await fetch(
    `${GAS_URL}?action=insert&key=${GAS_KEY}&data=${payload}`,
    { method: 'GET', mode: 'no-cors' }
  );
  // no-cors = opaque response, unreadable by browser
  // but the request is delivered and GAS processes it
  return 'sent';
}

// Fetch summary stats — cached for 15 min
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

// Fetch account balances — cached for 10 min
export async function fetchBalances(forceRefresh = false) {
  const CACHE_KEY = "fulus_balances";
  const CACHE_TTL = 10 * 60 * 1000;

  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return data;
      }
    } catch (_) {}
  }

  const res  = await fetch(`${GAS_URL}?action=balances&key=${GAS_KEY}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "GAS error");

  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
  return json.data;
}