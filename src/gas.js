const getGasConfig = () => ({
  url: localStorage.getItem('fulus_gas_url') || '',
  key: localStorage.getItem('fulus_gas_key') || '',
});

export async function fetchConfig(forceRefresh = false) {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const CACHE_KEY = 'fulus_config', CACHE_TTL = 24 * 60 * 60 * 1000;
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < CACHE_TTL) return data; }
    } catch (_) { }
  }
  const res = await fetch(`${url}?action=config&key=${key}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'GAS error');
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
  return json.data;
}

export async function postTransaction(tx) {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const payload = encodeURIComponent(JSON.stringify(tx));
  await fetch(`${url}?action=insert&key=${key}&data=${payload}`, { method: 'GET', mode: 'no-cors' });
  return 'sent';
}

export async function fetchSummary(forceRefresh = false) {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const CACHE_KEY = 'fulus_summary', CACHE_TTL = 15 * 60 * 1000;
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < CACHE_TTL) return data; }
    } catch (_) { }
  }
  const res = await fetch(`${url}?action=summary&key=${key}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'GAS error');
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
  return json.data;
}

export async function fetchBalances(forceRefresh = false) {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const CACHE_KEY = 'fulus_balances', CACHE_TTL = 10 * 60 * 1000;
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) { const { data, ts } = JSON.parse(cached); if (Date.now() - ts < CACHE_TTL) return data; }
    } catch (_) { }
  }
  const res = await fetch(`${url}?action=balances&key=${key}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'GAS error');
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
  return json.data;
}

export async function fetchDOR() {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const res = await fetch(`${url}?action=dor&key=${key}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'GAS error');
  return json.data;
}

export async function postDOR(entry) {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const payload = encodeURIComponent(JSON.stringify(entry));
  await fetch(`${url}?action=insertDor&key=${key}&data=${payload}`, { method: 'GET', mode: 'no-cors' });
  return 'sent';
}

export async function fetchTransactions(limit = 200) {
  const { url, key } = getGasConfig();
  if (!url) throw new Error('GAS not configured');
  const res = await fetch(`${url}?action=transactions&limit=${limit}&key=${key}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'GAS error');
  return json.data;
}