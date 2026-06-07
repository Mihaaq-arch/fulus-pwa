import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { fetchConfig, fetchSummary, fetchBalances, fetchDOR, postDOR, fetchTransactions } from './gas.js';
import { enqueue, syncQueue, getPendingCount, getAll, clearSynced } from './db.js';
import { APP_VERSION, DARK, LIGHT, OWNER_COLORS, TYPE_CONFIG, REP_OPTIONS, idr, generatePairId } from './constants.js';
import { StepDots, Separator, Section } from './components/ui.jsx';
import NumPad from './components/NumPad.jsx';
import ChipGrid from './components/ChipGrid.jsx';
import OnboardingScreen from './components/OnboardingScreen.jsx';
import HistoryItem from './components/HistoryItem.jsx';
const SummaryView = lazy(() => import('./components/SummaryView.jsx'));

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('fulus_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const t = isDark ? DARK : LIGHT;

  const toggleTheme = () => {
    setIsDark(v => {
      localStorage.setItem('fulus_theme', !v ? 'dark' : 'light');
      return !v;
    });
  };

  const [tab, setTab] = useState('input');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(
    () => !!localStorage.getItem('fulus_spreadsheet_id')
  );
  const isGasReady = !!localStorage.getItem('fulus_url');
  const [configErr, setConfigErr] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState(null);
  const [balances, setBalances] = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balErr, setBalErr] = useState(null);

  const [dorEntries, setDorEntries] = useState([]);
  const [dorLoading, setDorLoading] = useState(false);
  const [dorErr, setDorErr] = useState(null);
  const [dorPerson2, setDorPerson2] = useState('');       // form: name
  const [dorAmount2, setDorAmount2] = useState('0');      // form: amount
  const [dorDir, setDorDir] = useState('in');     // form: in/out
  const [dorCtx, setDorCtx] = useState('');       // form: Office/Personal
  const [dorSubmitted, setDorSubmitted] = useState(false);

  const [recurringTxs, setRecurringTxs] = useState([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringErr, setRecurringErr] = useState(null);
  const [recurringMonth, setRecurringMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Form state
  const [step, setStep] = useState(0);
  const [type, setType] = useState('');
  const [fromAcc, setFromAcc] = useState('');
  const [toAcc, setToAcc] = useState('');
  const [category, setCategory] = useState('');
  const [catSearch, setCatSearch] = useState('');
  const [crossOwner, setCrossOwner] = useState(false);
  const [crossTarget, setCrossTarget] = useState('');
  const [dorPerson, setDorPerson] = useState('');
  const [dorContext, setDorContext] = useState('');
  const [amount, setAmount] = useState('0');
  const [rep, setRep] = useState('One Time');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isConfigured || !isGasReady) { setLoading(false); return; }
    fetchConfig()
      .then(data => { setConfig(data); setLoading(false); })
      .catch(err => { setConfigErr(err.message); setLoading(false); });
  }, []);

  const refreshPending = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  useEffect(() => { refreshPending(); }, []);

  const refreshHistory = useCallback(async () => {
    const all = await getAll();
    setHistory(all.slice(0, 30));
  }, []);

  useEffect(() => {
    if (tab === 'history') refreshHistory();
    if (tab === 'summary') {
      if (!isGasReady) { setSummaryErr(null); setBalErr(null); return; }
      loadSummary(); loadBalances();
    }
    if (tab === 'dor' && isGasReady) loadDOR();
    if (tab === 'recurring' && isGasReady) loadRecurring();
  }, [tab]);

  const loadBalances = async (forceRefresh = false) => {
    setBalLoading(true); setBalErr(null);
    try {
      const data = await fetchBalances(forceRefresh);
      setBalances(data);
    } catch (err) {
      setBalErr(err.message);
    }
    setBalLoading(false);
  };

  const loadSummary = async (forceRefresh = false) => {
    setSummaryLoading(true); setSummaryErr(null);
    try {
      const data = await fetchSummary(forceRefresh);
      setSummary(data);
    } catch (err) {
      setSummaryErr(err.message);
    }
    setSummaryLoading(false);
  };

  const loadDOR = async () => {
    setDorLoading(true); setDorErr(null);
    try {
      const data = await fetchDOR();
      setDorEntries(data);
    } catch (err) {
      setDorErr(err.message);
    }
    setDorLoading(false);
  };

  const loadRecurring = async () => {
    setRecurringLoading(true); setRecurringErr(null);
    try {
      const data = await fetchTransactions(200);
      setRecurringTxs(data);
    } catch (err) {
      setRecurringErr(err.message);
    }
    setRecurringLoading(false);
  };


  const accounts = config?.accounts || [];
  const categories = config?.categories || [];
  const repOptions = config?.repOptions || REP_OPTIONS;

  const filteredCats = categories
    .filter(c => c.type === type)
    .filter(c => !catSearch || c.name.toLowerCase().includes(catSearch.toLowerCase()));
  const selectedCat = categories.find(c => c.name === category);
  const isDOR = selectedCat?.dor === true || selectedCat?.dor === 'true';

  const ownerOfFrom = accounts.find(a => a.name === fromAcc)?.owner || '';
  const otherAccounts = accounts.filter(a => a.owner !== 'Unown' && a.name !== fromAcc);

  const bridgeMap = {
    'Personal-Servo': 'A-S Balance',
    'Servo-Personal': 'A-S Balance',
    'Personal-House': 'A-H Balance',
    'House-Personal': 'A-H Balance',
    'Personal-ElFamilia': 'A-E Balance',
    'ElFamilia-Personal': 'A-E Balance',
  };

  const STEPS = (() => {
    const s = ['type', 'account'];
    if (type === 'Transfer') s.push('toAccount');
    s.push('category');
    if (isDOR) s.push('dor');
    s.push('amount', 'rep', 'notes');
    return s;
  })();

  const currentStepName = STEPS[step];
  const totalSteps = STEPS.length;

  const goBack = () => { if (step > 0) setStep(s => s - 1); };
  const goNext = () => { if (step < STEPS.length - 1) setStep(s => s + 1); };

  const reset = () => {
    setStep(0); setType(''); setFromAcc(''); setToAcc('');
    setCategory(''); setCatSearch(''); setCrossOwner(false); setCrossTarget('');
    setDorPerson(''); setDorContext('');
    setAmount('0'); setRep('One Time'); setNotes('');
    setSubmitted(false);
  };

  const selectType = (txType) => { setType(txType); setTimeout(goNext, 200); };
  const selectFrom = (a) => { setFromAcc(a); setTimeout(goNext, 200); };
  const selectTo = (a) => { setToAcc(a); setTimeout(goNext, 200); };
  const selectCat = (c) => { setCategory(c.name); setTimeout(goNext, 200); };
  const selectRep = (r) => { setRep(r); setTimeout(goNext, 200); };

  const handleSubmit = async () => {
    const txBase = { type, category, amount: parseInt(amount) || 0, rep, notes, date: new Date().toISOString() };
    const txs = [];

    if (crossOwner && crossTarget && type === 'Expense') {
      const ownerOfCross = accounts.find(a => a.name === crossTarget)?.owner || '';
      const bridge = bridgeMap[`${ownerOfFrom}-${ownerOfCross}`] || bridgeMap[`${ownerOfCross}-${ownerOfFrom}`] || 'A-S Balance';
      const pairId = generatePairId();
      txs.push({ ...txBase, from: fromAcc, to: '', linkId: pairId });
      txs.push({
        type: 'Follow-Up', category: 'Adjust', amount: parseInt(amount) || 0,
        rep: 'One Time', notes: `cross-owner: ${ownerOfFrom}→${ownerOfCross}`,
        from: crossTarget, to: bridge, date: new Date().toISOString(),
        linkId: pairId,
      });

    } else if (crossOwner && crossTarget && type === 'Income') {
      const mainAcc = toAcc || fromAcc;
      const ownerMain = accounts.find(a => a.name === mainAcc)?.owner || '';
      const ownerCross = accounts.find(a => a.name === crossTarget)?.owner || '';
      const bridge = bridgeMap[`${ownerMain}-${ownerCross}`] || bridgeMap[`${ownerCross}-${ownerMain}`] || 'A-S Balance';
      const pairId = generatePairId();
      txs.push({ ...txBase, from: '', to: mainAcc, linkId: pairId });
      txs.push({
        type: 'Follow-Up', category: 'Adjust', amount: parseInt(amount) || 0,
        rep: 'One Time', notes: `cross-owner income: received by ${crossTarget}`,
        from: crossTarget, to: bridge, date: new Date().toISOString(),
        linkId: pairId,
      });

    } else if (type === 'Income') {
      txs.push({ ...txBase, from: '', to: toAcc || fromAcc });

    } else {
      txs.push({ ...txBase, from: fromAcc, to: toAcc || '' });
    }

    for (const tx of txs) await enqueue(tx);
    await refreshPending();
    setSubmitted(true);

    if (navigator.onLine) {
      try { await syncQueue(); await refreshPending(); } catch (_) { }
    }
  };

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const result = await syncQueue(({ synced, total }) => setSyncMsg(`Syncing ${synced}/${total}...`));
      await clearSynced();
      await refreshPending();
      setSyncMsg(`✓ ${result.synced} berhasil${result.failed ? `, ${result.failed} gagal` : ''}`);
    } catch (err) {
      setSyncMsg('Gagal: ' + err.message);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3000);
  };

  // ── STYLES (theme-aware) ──────────────────────────────────
  const s = {
    screen: { background: t.bg, minHeight: '100dvh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', fontFamily: "'Sora', sans-serif", color: t.text, transition: 'background 0.2s, color 0.2s' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', borderBottom: `1px solid ${t.border}`, background: t.surface },
    tabs: { display: 'flex', borderBottom: `1px solid ${t.border}`, background: t.surface },
    tabBtn: { flex: 1, background: 'none', border: 'none', padding: '12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', color: t.subtext },
    content: { flex: 1, padding: '20px 16px', overflowY: 'auto' },
    backBtn: { background: 'none', border: 'none', color: t.subtext, fontSize: 12, cursor: 'pointer', padding: 0 },
    input: { width: '100%', background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 10, padding: '12px 14px', color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
    primaryBtn: { width: '100%', background: t.card, border: `1.5px solid ${t.accent}`, color: t.accent, borderRadius: 12, padding: '15px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
    ghostBtn: { width: '100%', background: 'none', border: `1.5px solid ${t.border}`, color: t.subtext, borderRadius: 12, padding: '13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    searchBox: { width: '100%', background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', color: t.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 },
  };

  if (loading) return (
    <div style={{ ...s.screen, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ color: t.accent, fontSize: 14 }}>Loading Fulus...</div>
    </div>
  );


  if (!isConfigured) return (
    <OnboardingScreen t={t} onComplete={() => setIsConfigured(true)} />
  );

  if (configErr && isGasReady) return (
    <div style={{ ...s.screen, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>
        Failed to load config<br /><span style={{ color: t.subtext, fontSize: 11 }}>{configErr}</span>
      </div>
    </div>
  );
  return (
    <div style={s.screen}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: t.text, letterSpacing: -0.5 }}>Fulus</span>
          <span style={{ fontSize: 9, color: t.subtext, fontFamily: 'DM Mono, monospace', marginLeft: 2, marginTop: 4 }}>v{APP_VERSION}</span>
          {pendingCount > 0 && (
            <span style={{ fontSize: 10, background: '#fbbf2420', color: '#fbbf24', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px' }}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleSync} disabled={syncing || pendingCount === 0} style={{
            background: 'none', border: 'none', color: pendingCount > 0 ? t.accent : t.subtext,
            fontSize: 12, cursor: pendingCount > 0 ? 'pointer' : 'default', fontWeight: 600, padding: '4px 8px'
          }}>
            {syncing ? 'Syncing...' : syncMsg || (pendingCount > 0 ? '↑ Sync' : '✓ Synced')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {[['input', '💸 Record'], ['history', '📋 History'], ['summary', '📊 Summary'], ['dor', '🤝 DOR'], ['recurring', '🔁 Bills']].map(([tb, label]) => (
          <button key={tb} onClick={() => setTab(tb)} style={{
            ...s.tabBtn,
            color: tab === tb ? t.accent : t.subtext,
            borderBottom: tab === tb ? `2px solid ${t.accent}` : '2px solid transparent',
            fontSize: 12,
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={s.content}>

        {/* ── INPUT ─────────────────────────────────────── */}
        {tab === 'input' && !submitted && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StepDots total={totalSteps} current={step} t={t} />
            {step > 0 && <button onClick={goBack} style={s.backBtn}>← Back</button>}

            {/* TYPE */}
            {currentStepName === 'type' && (
              <Section title="Transaction type" t={t}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => selectType(key)} style={{
                      background: type === key ? cfg.color + '20' : t.card,
                      border: `1.5px solid ${type === key ? cfg.color : t.border}`,
                      color: type === key ? cfg.color : t.subtext,
                      borderRadius: 12, padding: '18px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                    }}>
                      <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* ACCOUNT */}
            {currentStepName === 'account' && (
              <Section title={type === 'Income' ? 'Into account' : 'From account'} t={t}>
                <ChipGrid
                  items={accounts.filter(a => a.owner !== 'Unown')}
                  selected={type === 'Income' ? toAcc : fromAcc}
                  onSelect={type === 'Income'
                    ? (a) => { setToAcc(a.name); setTimeout(goNext, 200); }
                    : (a) => selectFrom(a.name)
                  }
                  getLabel={a => a.name}
                  getKey={a => a.name}
                  getColor={a => OWNER_COLORS[a.owner] || '#6b7280'}
                  columns={2} t={t}
                />
              </Section>
            )}

            {/* TO ACCOUNT */}
            {currentStepName === 'toAccount' && (
              <Section title="To account" t={t}>
                <ChipGrid
                  items={accounts.filter(a => a.owner !== 'Unown' && a.name !== fromAcc)}
                  selected={toAcc}
                  onSelect={a => selectTo(a.name)}
                  getLabel={a => a.name}
                  getKey={a => a.name}
                  getColor={a => OWNER_COLORS[a.owner] || '#6b7280'}
                  columns={2} t={t}
                />
              </Section>
            )}

            {/* CATEGORY */}
            {currentStepName === 'category' && (
              <div>
                {/* Cross-owner toggle */}
                {(type === 'Expense' || type === 'Income') && (
                  <div style={{ marginBottom: 12 }}>
                    <button onClick={() => { setCrossOwner(v => !v); setCrossTarget(''); }} style={{
                      background: crossOwner ? t.accent + '20' : t.card,
                      border: `1.5px solid ${crossOwner ? t.accent : t.border}`,
                      color: crossOwner ? t.accent : t.subtext,
                      borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%'
                    }}>
                      {crossOwner ? '✓' : '○'} {type === 'Income' ? 'Received by another account' : 'Paid by another account'} (generates 2 entries)
                    </button>
                    {crossOwner && (
                      <div style={{ marginTop: 8 }}>
                        <ChipGrid
                          items={otherAccounts}
                          selected={crossTarget}
                          onSelect={a => setCrossTarget(a.name)}
                          getLabel={a => a.name}
                          getKey={a => a.name}
                          getColor={a => OWNER_COLORS[a.owner] || '#6b7280'}
                          columns={2} t={t}
                        />
                      </div>
                    )}
                  </div>
                )}

                <Separator label="Category" t={t} />

                {/* Search */}
                <input
                  value={catSearch}
                  onChange={e => setCatSearch(e.target.value)}
                  placeholder="Search category..."
                  style={s.searchBox}
                />

                <div style={{ opacity: crossOwner && !crossTarget ? 0.3 : 1, pointerEvents: crossOwner && !crossTarget ? 'none' : 'auto' }}>
                  {crossOwner && !crossTarget && (
                    <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8 }}>Select the paying account first</div>
                  )}
                  {filteredCats.length === 0
                    ? <div style={{ color: t.subtext, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No categories found</div>
                    : <ChipGrid
                      items={filteredCats}
                      selected={category}
                      onSelect={selectCat}
                      getLabel={c => c.name}
                      getColor={() => t.accent}
                      columns={2} t={t}
                    />
                  }
                </div>
              </div>
            )}

            {/* DOR */}
            {currentStepName === 'dor' && (
              <Section title="Debt / receivable detail" t={t}>
                <label style={{ display: 'block', fontSize: 11, color: t.subtext, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Person</label>
                <input value={dorPerson} onChange={e => setDorPerson(e.target.value)} placeholder="Person name..." style={s.input} />
                <label style={{ display: 'block', fontSize: 11, color: t.subtext, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 6px' }}>Context</label>
                <ChipGrid items={['Office', 'Personal']} selected={dorContext} onSelect={setDorContext} getColor={() => t.accent} columns={2} t={t} />
                <button onClick={goNext} disabled={!dorPerson || !dorContext} style={{ ...s.primaryBtn, marginTop: 16, opacity: (!dorPerson || !dorContext) ? 0.4 : 1 }}>Continue</button>
              </Section>
            )}

            {/* AMOUNT */}
            {currentStepName === 'amount' && (
              <Section title="Amount" t={t}>
                <NumPad value={amount} onChange={setAmount} t={t} />
                <button onClick={goNext} disabled={!amount || amount === '0'} style={{ ...s.primaryBtn, marginTop: 12, opacity: (!amount || amount === '0') ? 0.4 : 1 }}>Continue</button>
              </Section>
            )}

            {/* REP */}
            {currentStepName === 'rep' && (
              <Section title="Frequency" t={t}>
                <ChipGrid items={repOptions} selected={rep} onSelect={selectRep} getColor={() => t.accent} columns={3} t={t} />
              </Section>
            )}

            {/* NOTES */}
            {currentStepName === 'notes' && (
              <Section title="Notes (optional)" t={t}>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={3}
                  style={{ ...s.input, resize: 'none', fontFamily: 'inherit' }} />
                <button onClick={handleSubmit} style={{ ...s.primaryBtn, marginTop: 12, background: t.accent, color: isDark ? '#13141f' : '#fff' }}>
                  ✓ Save
                </button>
                {!notes && (
                  <button onClick={handleSubmit} style={{ ...s.ghostBtn, marginTop: 8 }}>Skip & Save</button>
                )}
              </Section>
            )}
          </div>
        )}

        {/* ── SUCCESS ───────────────────────────────────── */}
        {tab === 'input' && submitted && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 40 }}>
            <div style={{ fontSize: 56 }}>✓</div>
            <div style={{ color: t.accent, fontSize: 22, fontWeight: 800 }}>Saved!</div>
            <div style={{ color: t.subtext, fontSize: 13, textAlign: 'center' }}>
              {pendingCount > 0 ? `${pendingCount} transaction(s) pending sync` : 'Synced to Sheets'}
            </div>
            <button onClick={reset} style={{ ...s.primaryBtn, width: 160 }}>+ Record Again</button>
            <button onClick={() => { reset(); setTab('history'); }} style={{ ...s.ghostBtn, width: 160 }}>View History</button>
          </div>
        )}

        {/* ── HISTORY ───────────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.length === 0
              ? <div style={{ color: t.subtext, textAlign: 'center', paddingTop: 40, fontSize: 13 }}>No transactions yet</div>
              : history.map((item, i) => <HistoryItem key={i} item={item} t={t} />)
            }
          </div>
        )}

        {/* ── SUMMARY ───────────────────────────────────── */}
        {tab === 'summary' && (
          <Suspense fallback={<div style={{ color: t.subtext, textAlign: 'center', paddingTop: 40, fontSize: 13 }}>Loading...</div>}>
            <SummaryView summary={summary} loading={summaryLoading} err={summaryErr} balances={balances} balLoading={balLoading} balErr={balErr} onRefresh={() => { loadSummary(true); loadBalances(true); }} t={t} />
          </Suspense>
        )}
        {/* ── DOR ──────────────────────────────────────── */}
        {tab === 'dor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Form input */}
            {!dorSubmitted ? (
              <div style={{ background: t.surface, borderRadius: 14, border: `1px solid ${t.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, color: t.subtext, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>New Entry</div>

                {/* Person */}
                <input
                  value={dorPerson2}
                  onChange={e => setDorPerson2(e.target.value)}
                  placeholder="Person name..."
                  style={s.input}
                />

                {/* Direction */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { key: 'in', label: 'They owe me', color: '#4ade80' },
                    { key: 'out', label: 'I owe them', color: '#f87171' },
                  ].map(({ key, label, color }) => (
                    <button key={key} onClick={() => setDorDir(key)} style={{
                      background: dorDir === key ? color + '20' : t.card,
                      border: `1.5px solid ${dorDir === key ? color : t.border}`,
                      color: dorDir === key ? color : t.subtext,
                      borderRadius: 10, padding: '12px 8px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                    }}>{label}</button>
                  ))}
                </div>

                {/* Amount */}
                <NumPad value={dorAmount2} onChange={setDorAmount2} t={t} />

                {/* Context */}
                <ChipGrid
                  items={['Office', 'Personal']}
                  selected={dorCtx}
                  onSelect={setDorCtx}
                  getColor={() => t.accent}
                  columns={2} t={t}
                />

                <button
                  disabled={!dorPerson2 || !dorCtx || !dorAmount2 || dorAmount2 === '0'}
                  onClick={async () => {
                    await postDOR({ person: dorPerson2, amount: dorAmount2, direction: dorDir, context: dorCtx });
                    setDorEntries(prev => [{
                      id: 'pending',
                      date: new Date().toISOString(),
                      person: dorPerson2,
                      amount: dorDir === 'out' ? -parseInt(dorAmount2) : parseInt(dorAmount2),
                      context: dorCtx,
                    }, ...prev]);
                    setDorPerson2(''); setDorAmount2('0'); setDorDir('in'); setDorCtx('');
                    setDorSubmitted(true);
                  }}
                  style={{
                    ...s.primaryBtn, background: t.accent, color: isDark ? '#13141f' : '#fff',
                    opacity: (!dorPerson2 || !dorCtx || !dorAmount2 || dorAmount2 === '0') ? 0.4 : 1
                  }}
                >✓ Save</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40 }}>✓</div>
                <div style={{ color: t.accent, fontWeight: 700, marginTop: 8 }}>Saved!</div>
                <button onClick={() => setDorSubmitted(false)} style={{ ...s.primaryBtn, width: 160, marginTop: 16 }}>+ Add Another</button>
              </div>
            )}

            {/* Net per person */}
            {(() => {
              const nets = {};
              for (const e of dorEntries) {
                if (!nets[e.person]) nets[e.person] = { Office: 0, Personal: 0 };
                nets[e.person][e.context] = (nets[e.person][e.context] || 0) + e.amount;
              }
              const people = Object.entries(nets);
              if (people.length === 0) return null;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: t.subtext, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Net per Person</div>
                  {people.map(([person, ctx]) => {
                    const total = (ctx.Office || 0) + (ctx.Personal || 0);
                    const color = total > 0 ? '#4ade80' : total < 0 ? '#f87171' : t.subtext;
                    return (
                      <div key={person} style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{person}</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'DM Mono, monospace' }}>
                            {total > 0 ? '+' : ''}{idr(total)}
                          </span>
                        </div>
                        {(ctx.Office !== 0 || ctx.Personal !== 0) && (
                          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                            {ctx.Office !== 0 && <span style={{ fontSize: 11, color: t.subtext }}>Office: {idr(ctx.Office)}</span>}
                            {ctx.Personal !== 0 && <span style={{ fontSize: 11, color: t.subtext }}>Personal: {idr(ctx.Personal)}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Entry list */}
            {dorLoading && <div style={{ color: t.subtext, fontSize: 12, textAlign: 'center' }}>Loading...</div>}
            {dorErr && <div style={{ color: '#f87171', fontSize: 12 }}>Error: {dorErr}</div>}
            {dorEntries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: t.subtext, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>History</div>
                {dorEntries.map((e, i) => {
                  const color = e.amount >= 0 ? '#4ade80' : '#f87171';
                  return (
                    <div key={i} style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: color }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{e.person}</div>
                        <div style={{ fontSize: 11, color: t.subtext }}>{e.context} · {new Date(e.date).toLocaleDateString('id-ID')}</div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'DM Mono, monospace' }}>
                        {e.amount >= 0 ? '+' : ''}{idr(e.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── RECURRING ────────────────────────────────── */}
        {tab === 'recurring' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Month selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, padding: '10px 14px' }}>
              <button onClick={() => {
                const [y, m] = recurringMonth.split('-').map(Number);
                const d = new Date(y, m - 2, 1);
                setRecurringMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 18, cursor: 'pointer', padding: '0 8px' }}>‹</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                {new Date(recurringMonth + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => {
                const [y, m] = recurringMonth.split('-').map(Number);
                const d = new Date(y, m, 1);
                setRecurringMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 18, cursor: 'pointer', padding: '0 8px' }}>›</button>
            </div>

            {recurringLoading && <div style={{ color: t.subtext, fontSize: 12, textAlign: 'center' }}>Loading...</div>}
            {recurringErr && <div style={{ color: '#f87171', fontSize: 12 }}>Error: {recurringErr}</div>}

            {(() => {
              if (!recurringTxs.length) return null;

              const [selYear, selMonth] = recurringMonth.split('-').map(Number);

              // Helper: apakah transaksi ini expected di bulan yang dipilih?
              const isExpectedThisMonth = (tx) => {
                const txDate = new Date(tx.date);
                const txMonth = txDate.getMonth() + 1;
                if (tx.rep === 'Monthly' || tx.rep === 'Weekly') return true;
                if (tx.rep === 'Quarterly') {
                  // expected kalau selisih bulan dari txMonth habis dibagi 3
                  const diff = (selMonth - txMonth + 12) % 12;
                  return diff % 3 === 0;
                }
                if (tx.rep === 'Yearly') return txMonth === selMonth;
                return false;
              };

              // Kumpulkan unique recurring items (dedup by category+owner+rep+type)
              const seen = new Set();
              const recurring = recurringTxs.filter(tx => {
                if (tx.rep === 'One Time') return false;
                if (!isExpectedThisMonth(tx)) return false;
                const key = `${tx.category}_${tx.owner}_${tx.rep}_${tx.type}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });

              if (!recurring.length) return (
                <div style={{ color: t.subtext, fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
                  Tidak ada tagihan recurring bulan ini
                </div>
              );

              // Cek mana yang sudah ada di bulan ini
              const paidKeys = new Set(
                recurringTxs
                  .filter(tx => {
                    const d = new Date(tx.date);
                    return (d.getFullYear() === selYear && d.getMonth() + 1 === selMonth && tx.rep !== 'One Time');
                  })
                  .map(tx => `${tx.category}_${tx.owner}_${tx.rep}_${tx.type}`)
              );

              // Group by owner
              const byOwner = {};
              for (const tx of recurring) {
                if (!byOwner[tx.owner]) byOwner[tx.owner] = [];
                byOwner[tx.owner].push(tx);
              }

              const totalCount = recurring.length;
              const paidCount = recurring.filter(tx => paidKeys.has(`${tx.category}_${tx.owner}_${tx.rep}_${tx.type}`)).length;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Progress */}
                  <div style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: t.subtext }}>Checked off</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{paidCount} / {totalCount}</span>
                    </div>
                    <div style={{ height: 6, background: t.border, borderRadius: 3 }}>
                      <div style={{ height: 6, borderRadius: 3, background: t.accent, width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%`, transition: 'width 0.4s' }} />
                    </div>
                  </div>

                  {/* Per owner */}
                  {Object.entries(byOwner).map(([owner, items]) => {
                    const color = OWNER_COLORS[owner] || '#6b7280';
                    return (
                      <div key={owner} style={{ background: t.surface, borderRadius: 14, border: `1px solid ${t.border}`, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', background: t.card, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{owner}</span>
                        </div>
                        {items.map((tx, i) => {
                          const key = `${tx.category}_${tx.owner}_${tx.rep}_${tx.type}`;
                          const isPaid = paidKeys.has(key);
                          const typeColor = { Expense: '#f87171', Income: '#4ade80', Transfer: '#60a5fa' };
                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 16px', borderTop: `1px solid ${t.border}`,
                              opacity: isPaid ? 0.5 : 1,
                            }}>
                              {/* Checkbox visual — read only, driven by data */}
                              <div style={{
                                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                background: isPaid ? t.accent : 'none',
                                border: `2px solid ${isPaid ? t.accent : t.muted}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {isPaid && <span style={{ fontSize: 11, color: '#13141f', fontWeight: 700 }}>✓</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: isPaid ? t.subtext : t.text, textDecoration: isPaid ? 'line-through' : 'none' }}>
                                  {tx.category}
                                </div>
                                <div style={{ fontSize: 11, color: t.subtext }}>
                                  {tx.rep} · {tx.from || tx.to || ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: typeColor[tx.type] || t.subtext, fontFamily: 'DM Mono, monospace' }}>
                                  {idr(tx.amount)}
                                </div>
                                {isPaid && <div style={{ fontSize: 10, color: t.accent }}>✓ recorded</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

          </div>
        )}
      </div>
    </div>
  );
}
