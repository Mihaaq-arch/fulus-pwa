import { useState, useEffect, useCallback } from 'react';
import { fetchConfig } from './gas.js';
import { enqueue, syncQueue, getPendingCount, getAll, clearSynced } from './db.js';

// ── CONSTANTS ────────────────────────────────────────────────
const OWNER_COLORS = {
  Personal:  '#00d4aa',
  Servo:     '#60a5fa',
  House:     '#c084fc',
  ElFamilia: '#f87171',
  Investment:'#fbbf24',
  Unown:     '#6b7280',
};

const TYPE_CONFIG = {
  Expense:  { label: 'Keluar',   icon: '↓', color: '#f87171' },
  Income:   { label: 'Masuk',    icon: '↑', color: '#4ade80' },
  Transfer: { label: 'Transfer', icon: '⇄', color: '#60a5fa' },
};

const REP_OPTIONS = ['One Time', 'Monthly', 'Quarterly', 'Yearly', 'Weekly'];

// ── NUMPAD ───────────────────────────────────────────────────
function NumPad({ value, onChange }) {
  const handle = (key) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1) || '0');
    } else if (key === '000') {
      onChange(value === '0' ? '0' : value + '000');
    } else {
      onChange(value === '0' ? key : value + key);
    }
  };

  const formatted = parseInt(value || '0').toLocaleString('id-ID');
  const keys = ['1','2','3','4','5','6','7','8','9','000','0','⌫'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{
        background:'#222536', borderRadius:12, padding:'16px 20px',
        textAlign:'right', fontFamily:'DM Mono, monospace',
        fontSize: value.length > 8 ? 28 : 36, fontWeight:700,
        color:'#e8eaf0', letterSpacing:1, minHeight:60,
        display:'flex', alignItems:'center', justifyContent:'flex-end'
      }}>
        <span style={{ color:'#6b7280', fontSize:18, marginRight:4 }}>Rp</span>
        {formatted}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
        {keys.map(k => (
          <button key={k} onClick={() => handle(k)} style={{
            background: k === '⌫' ? '#2d1f1f' : '#222536',
            color: k === '⌫' ? '#f87171' : '#e8eaf0',
            border:'none', borderRadius:10, padding:'18px 0',
            fontSize: k === '000' ? 16 : 22, fontWeight:600,
            fontFamily:'DM Mono, monospace', cursor:'pointer',
            transition:'all 0.1s', active:{ background:'#2a2d40' }
          }}>{k}</button>
        ))}
      </div>
    </div>
  );
}

// ── CHIP GRID ────────────────────────────────────────────────
function ChipGrid({ items, selected, onSelect, getLabel, getColor, columns = 2 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${columns}, 1fr)`, gap:8 }}>
      {items.map((item, i) => {
        const label = getLabel ? getLabel(item) : item;
        const color = getColor ? getColor(item) : '#00d4aa';
        const isSelected = selected === item || selected === label;
        return (
          <button key={i} onClick={() => onSelect(item)} style={{
            background: isSelected ? color + '22' : '#222536',
            border: `1.5px solid ${isSelected ? color : '#2a2d40'}`,
            color: isSelected ? color : '#9ca3af',
            borderRadius:10, padding:'13px 8px',
            fontSize:13, fontWeight: isSelected ? 700 : 500,
            cursor:'pointer', transition:'all 0.15s', textAlign:'center',
            lineHeight:1.3
          }}>{label}</button>
        );
      })}
    </div>
  );
}

// ── STEP INDICATOR ───────────────────────────────────────────
function StepDots({ total, current }) {
  return (
    <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6, height:6,
          borderRadius:3, background: i === current ? '#00d4aa' : i < current ? '#00d4aa44' : '#2a2d40',
          transition:'all 0.2s'
        }} />
      ))}
    </div>
  );
}

// ── HISTORY ITEM ─────────────────────────────────────────────
function HistoryItem({ item }) {
  const typeColor = { Expense:'#f87171', Income:'#4ade80', Transfer:'#60a5fa' };
  const color = typeColor[item.type] || '#9ca3af';
  const ownerColor = OWNER_COLORS[item.owner] || '#6b7280';
  const isPending = item.status === 'pending';
  const isError   = item.status === 'error';

  return (
    <div style={{
      background:'#1a1d27', borderRadius:12, padding:'12px 16px',
      display:'flex', alignItems:'center', gap:12,
      borderLeft:`3px solid ${color}`,
      opacity: isPending ? 0.7 : 1
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
          <span style={{ fontSize:12, color:ownerColor, fontWeight:700 }}>{item.owner}</span>
          <span style={{ fontSize:11, color:'#4b5563' }}>·</span>
          <span style={{ fontSize:12, color:'#6b7280' }}>{item.category}</span>
          {isPending && <span style={{ fontSize:10, color:'#fbbf24', background:'#fbbf2422', padding:'1px 6px', borderRadius:4 }}>pending</span>}
          {isError   && <span style={{ fontSize:10, color:'#f87171', background:'#f8717122', padding:'1px 6px', borderRadius:4 }}>error</span>}
        </div>
        <div style={{ fontSize:11, color:'#4b5563', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {item.from || '—'} {item.to ? `→ ${item.to}` : ''}
          {item.notes ? ` · ${item.notes}` : ''}
        </div>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:700, color, fontFamily:'DM Mono, monospace' }}>
          {item.type === 'Expense' ? '-' : item.type === 'Income' ? '+' : ''}
          Rp{parseInt(item.amount || 0).toLocaleString('id-ID')}
        </div>
        <div style={{ fontSize:10, color:'#4b5563' }}>
          {item.rep !== 'One Time' ? item.rep : ''}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState('input'); // input | history
  const [config, setConfig]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [configErr, setConfigErr] = useState(null);

  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState('');
  const [history, setHistory]   = useState([]);

  // Form state
  const [step, setStep]         = useState(0);
  const [type, setType]         = useState('');
  const [fromAcc, setFromAcc]   = useState('');
  const [toAcc, setToAcc]       = useState('');
  const [category, setCategory] = useState('');
  const [crossOwner, setCrossOwner] = useState(false);
  const [crossTarget, setCrossTarget] = useState('');
  const [dorPerson, setDorPerson]   = useState('');
  const [dorContext, setDorContext]  = useState('');
  const [amount, setAmount]     = useState('0');
  const [rep, setRep]           = useState('One Time');
  const [notes, setNotes]       = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Load config
  useEffect(() => {
    fetchConfig()
      .then(data => { setConfig(data); setLoading(false); })
      .catch(err  => { setConfigErr(err.message); setLoading(false); });
  }, []);

  // Load pending count
  const refreshPending = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  useEffect(() => { refreshPending(); }, []);

  // Load history
  const refreshHistory = useCallback(async () => {
    const all = await getAll();
    setHistory(all.slice(0, 30));
  }, []);

  useEffect(() => {
    if (tab === 'history') refreshHistory();
  }, [tab]);

  // Derived
  const accounts    = config?.accounts || [];
  const categories  = config?.categories || [];
  const repOptions  = config?.repOptions || REP_OPTIONS;

  const filteredCats = categories.filter(c => c.type === type);
  const selectedCat  = categories.find(c => c.name === category);
  const isDOR        = selectedCat?.dor === true || selectedCat?.dor === 'true';

  const ownerOfFrom  = accounts.find(a => a.name === fromAcc)?.owner || '';
  const ownerOfTo    = accounts.find(a => a.name === toAcc)?.owner || '';
  const otherOwners  = [...new Set(accounts.map(a => a.owner))].filter(o => o !== 'Unown' && o !== ownerOfFrom);

  // Bridge account mapping
  const bridgeMap = {
    'Personal-Servo':   'A-S Balance',
    'Servo-Personal':   'A-S Balance',
    'Personal-House':   'A-H Balance',
    'House-Personal':   'A-H Balance',
    'Personal-ElFamilia': 'A-E Balance',
    'ElFamilia-Personal': 'A-E Balance',
  };

  // Steps
  const STEPS = (() => {
    const s = ['type', 'account'];
    if (type === 'Transfer') s.push('toAccount');
    s.push('category');
    if (isDOR) s.push('dor');
    if (type === 'Expense' && ownerOfFrom === 'Personal' && crossOwner) s.push('crossOwner');
    s.push('amount', 'rep', 'notes');
    return s;
  })();

  const currentStepName = STEPS[step];
  const totalSteps      = STEPS.length;

  const goBack = () => {
    if (step === 0) return;
    setStep(s => s - 1);
  };

  const goNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const reset = () => {
    setStep(0); setType(''); setFromAcc(''); setToAcc('');
    setCategory(''); setCrossOwner(false); setCrossTarget('');
    setDorPerson(''); setDorContext('');
    setAmount('0'); setRep('One Time'); setNotes('');
    setSubmitted(false);
  };

  // Auto-advance setelah pilih
  const selectType = (t) => { setType(t); setTimeout(goNext, 200); };
  const selectFrom = (a) => { setFromAcc(a); setTimeout(goNext, 200); };
  const selectTo   = (a) => { setToAcc(a); setTimeout(goNext, 200); };
  const selectCat  = (c) => { setCategory(c.name); setTimeout(goNext, 200); };
  const selectRep  = (r) => { setRep(r); setTimeout(goNext, 200); };

  // Submit
  const handleSubmit = async () => {
    const txBase = {
      type, category,
      amount: parseInt(amount) || 0,
      rep, notes,
      date: new Date().toISOString(),
    };

    const txs = [];

    if (crossOwner && crossTarget && type === 'Expense') {
      // Generate 2 transaksi: pengeluaran dari personal + adjustment ke bridge
      const bridge = bridgeMap[`${ownerOfFrom}-${crossTarget}`] || 'A-S Balance';
      txs.push({ ...txBase, from: fromAcc, to: '' });
      txs.push({
        type: 'Follow-Up', category: 'Adjust',
        amount: parseInt(amount) || 0,
        rep: 'One Time', notes: `cross-owner: ${ownerOfFrom}→${crossTarget}`,
        from: fromAcc, to: bridge,
        date: new Date().toISOString(),
      });
    } else if (type === 'Income') {
      txs.push({ ...txBase, from: '', to: toAcc || fromAcc });
    } else {
      txs.push({ ...txBase, from: fromAcc, to: toAcc || '' });
    }

    for (const tx of txs) await enqueue(tx);
    await refreshPending();
    setSubmitted(true);

    // Background sync
    try {
      await syncQueue();
      await refreshPending();
    } catch (_) {}
  };

  // Sync manual
  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const result = await syncQueue(({ synced, total }) => {
        setSyncMsg(`Syncing ${synced}/${total}...`);
      });
      await clearSynced();
      await refreshPending();
      setSyncMsg(`✓ ${result.synced} berhasil${result.failed ? `, ${result.failed} gagal` : ''}`);
    } catch (err) {
      setSyncMsg('Sync gagal: ' + err.message);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3000);
  };

  // ── RENDER ────────────────────────────────────────────────
  if (loading) return (
    <div style={{ ...styles.screen, justifyContent:'center', alignItems:'center' }}>
      <div style={{ color:'#00d4aa', fontSize:14 }}>Memuat Fulus...</div>
    </div>
  );

  if (configErr) return (
    <div style={{ ...styles.screen, justifyContent:'center', alignItems:'center', padding:32 }}>
      <div style={{ color:'#f87171', fontSize:13, textAlign:'center' }}>
        Gagal load config<br /><span style={{ color:'#6b7280', fontSize:11 }}>{configErr}</span>
      </div>
    </div>
  );

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18, fontWeight:800, color:'#e8eaf0', letterSpacing:-0.5 }}>Fulus</span>
          {pendingCount > 0 && (
            <span style={{ fontSize:10, background:'#fbbf2422', color:'#fbbf24', padding:'2px 7px', borderRadius:10, fontWeight:700 }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <button onClick={handleSync} disabled={syncing || pendingCount === 0} style={{
          background:'none', border:'none', color: pendingCount > 0 ? '#00d4aa' : '#4b5563',
          fontSize:12, cursor: pendingCount > 0 ? 'pointer' : 'default', fontWeight:600,
          padding:'4px 8px'
        }}>
          {syncing ? 'Syncing...' : syncMsg || (pendingCount > 0 ? '↑ Sync' : '✓ Synced')}
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['input','history'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...styles.tabBtn,
            color:    tab === t ? '#00d4aa' : '#6b7280',
            borderBottom: tab === t ? '2px solid #00d4aa' : '2px solid transparent',
          }}>{t === 'input' ? '💸 Catat' : '📋 Riwayat'}</button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>

        {/* ── INPUT TAB ─────────────────────────────────── */}
        {tab === 'input' && !submitted && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <StepDots total={totalSteps} current={step} />

            {/* Back button */}
            {step > 0 && (
              <button onClick={goBack} style={{ ...styles.backBtn }}>← Kembali</button>
            )}

            {/* STEP: type */}
            {currentStepName === 'type' && (
              <Section title="Jenis transaksi">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => selectType(key)} style={{
                      background: type === key ? cfg.color + '22' : '#222536',
                      border: `1.5px solid ${type === key ? cfg.color : '#2a2d40'}`,
                      color: type === key ? cfg.color : '#9ca3af',
                      borderRadius:12, padding:'18px 8px',
                      fontSize:13, fontWeight:700, cursor:'pointer',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4
                    }}>
                      <span style={{ fontSize:22 }}>{cfg.icon}</span>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* STEP: account (from / to tergantung type) */}
            {currentStepName === 'account' && (
              <Section title={type === 'Income' ? 'Masuk ke akun' : 'Dari akun'}>
                <ChipGrid
                  items={accounts.filter(a => a.owner !== 'Unown')}
                  selected={type === 'Income' ? toAcc : fromAcc}
                  onSelect={type === 'Income'
                    ? (a) => { setToAcc(a.name); setTimeout(goNext, 200); }
                    : (a) => selectFrom(a.name)
                  }
                  getLabel={a => a.name}
                  getColor={a => OWNER_COLORS[a.owner] || '#6b7280'}
                  columns={2}
                />
              </Section>
            )}

            {/* STEP: toAccount (Transfer only) */}
            {currentStepName === 'toAccount' && (
              <Section title="Ke akun">
                <ChipGrid
                  items={accounts.filter(a => a.owner !== 'Unown' && a.name !== fromAcc)}
                  selected={toAcc}
                  onSelect={a => selectTo(a.name)}
                  getLabel={a => a.name}
                  getColor={a => OWNER_COLORS[a.owner] || '#6b7280'}
                  columns={2}
                />
              </Section>
            )}

            {/* STEP: category */}
            {currentStepName === 'category' && (
              <Section title="Kategori">
                {/* Cross-owner toggle (hanya untuk Expense dari Personal) */}
                {type === 'Expense' && ownerOfFrom === 'Personal' && (
                  <div style={{ marginBottom:12 }}>
                    <button onClick={() => setCrossOwner(v => !v)} style={{
                      background: crossOwner ? '#00d4aa22' : '#222536',
                      border: `1.5px solid ${crossOwner ? '#00d4aa' : '#2a2d40'}`,
                      color: crossOwner ? '#00d4aa' : '#6b7280',
                      borderRadius:8, padding:'8px 14px',
                      fontSize:12, fontWeight:600, cursor:'pointer', width:'100%'
                    }}>
                      {crossOwner ? '✓' : '○'} Bayar untuk owner lain (generate 2 baris)
                    </button>
                    {crossOwner && (
                      <div style={{ marginTop:8 }}>
                        <ChipGrid
                          items={otherOwners}
                          selected={crossTarget}
                          onSelect={setCrossTarget}
                          getColor={o => OWNER_COLORS[o] || '#6b7280'}
                          columns={3}
                        />
                      </div>
                    )}
                  </div>
                )}
                <ChipGrid
                  items={filteredCats}
                  selected={category}
                  onSelect={selectCat}
                  getLabel={c => c.name}
                  getColor={() => '#00d4aa'}
                  columns={2}
                />
              </Section>
            )}

            {/* STEP: DOR */}
            {currentStepName === 'dor' && (
              <Section title="Detail hutang/piutang">
                <label style={styles.label}>Orang</label>
                <input
                  value={dorPerson} onChange={e => setDorPerson(e.target.value)}
                  placeholder="Nama orang..."
                  style={styles.input}
                />
                <label style={{ ...styles.label, marginTop:12 }}>Konteks</label>
                <ChipGrid
                  items={['Office', 'Personal']}
                  selected={dorContext}
                  onSelect={setDorContext}
                  getColor={() => '#00d4aa'}
                  columns={2}
                />
                <button onClick={goNext} disabled={!dorPerson || !dorContext} style={{
                  ...styles.primaryBtn,
                  marginTop:16,
                  opacity: (!dorPerson || !dorContext) ? 0.4 : 1
                }}>Lanjut</button>
              </Section>
            )}

            {/* STEP: amount */}
            {currentStepName === 'amount' && (
              <Section title="Nominal">
                <NumPad value={amount} onChange={setAmount} />
                <button
                  onClick={goNext}
                  disabled={!amount || amount === '0'}
                  style={{ ...styles.primaryBtn, marginTop:12, opacity: (!amount || amount === '0') ? 0.4 : 1 }}
                >Lanjut</button>
              </Section>
            )}

            {/* STEP: rep */}
            {currentStepName === 'rep' && (
              <Section title="Frekuensi">
                <ChipGrid
                  items={repOptions}
                  selected={rep}
                  onSelect={selectRep}
                  getColor={() => '#00d4aa'}
                  columns={3}
                />
              </Section>
            )}

            {/* STEP: notes */}
            {currentStepName === 'notes' && (
              <Section title="Catatan (opsional)">
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Keterangan tambahan..."
                  rows={3}
                  style={{ ...styles.input, resize:'none', fontFamily:'inherit' }}
                />
                <button onClick={handleSubmit} style={{ ...styles.primaryBtn, marginTop:12, background:'#00d4aa', color:'#0f1117' }}>
                  ✓ Catat
                </button>
                {notes === '' && (
                  <button onClick={handleSubmit} style={{ ...styles.ghostBtn, marginTop:8 }}>
                    Skip & Catat
                  </button>
                )}
              </Section>
            )}
          </div>
        )}

        {/* ── SUCCESS ───────────────────────────────────── */}
        {tab === 'input' && submitted && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, paddingTop:40 }}>
            <div style={{ fontSize:56 }}>✓</div>
            <div style={{ color:'#00d4aa', fontSize:22, fontWeight:800 }}>Tercatat!</div>
            <div style={{ color:'#6b7280', fontSize:13, textAlign:'center' }}>
              {pendingCount > 0
                ? `${pendingCount} transaksi menunggu sync`
                : 'Sudah tersync ke Sheets'}
            </div>
            <button onClick={reset} style={{ ...styles.primaryBtn, width:160 }}>+ Catat Lagi</button>
            <button onClick={() => { reset(); setTab('history'); }} style={{ ...styles.ghostBtn, width:160 }}>
              Lihat Riwayat
            </button>
          </div>
        )}

        {/* ── HISTORY TAB ───────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {history.length === 0
              ? <div style={{ color:'#4b5563', textAlign:'center', paddingTop:40, fontSize:13 }}>Belum ada transaksi</div>
              : history.map((item, i) => <HistoryItem key={i} item={item} />)
            }
          </div>
        )}

      </div>
    </div>
  );
}

// ── SECTION WRAPPER ──────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize:11, color:'#6b7280', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── STYLES ───────────────────────────────────────────────────
const styles = {
  screen: {
    background:'#0f1117', minHeight:'100dvh', maxWidth:430, margin:'0 auto',
    display:'flex', flexDirection:'column', fontFamily:"'Sora', sans-serif",
    color:'#e8eaf0',
  },
  header: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'16px 20px 12px', borderBottom:'1px solid #1a1d27',
  },
  tabs: {
    display:'flex', borderBottom:'1px solid #1a1d27',
  },
  tabBtn: {
    flex:1, background:'none', border:'none', padding:'12px',
    fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
  },
  content: {
    flex:1, padding:'20px 16px', overflowY:'auto',
  },
  backBtn: {
    background:'none', border:'none', color:'#6b7280',
    fontSize:12, cursor:'pointer', padding:0, textAlign:'left',
  },
  label: {
    display:'block', fontSize:11, color:'#6b7280',
    fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6,
  },
  input: {
    width:'100%', background:'#222536', border:'1.5px solid #2a2d40',
    borderRadius:10, padding:'12px 14px', color:'#e8eaf0',
    fontSize:14, outline:'none', boxSizing:'border-box',
  },
  primaryBtn: {
    width:'100%', background:'#1a1d27', border:'1.5px solid #00d4aa',
    color:'#00d4aa', borderRadius:12, padding:'15px',
    fontSize:15, fontWeight:700, cursor:'pointer',
  },
  ghostBtn: {
    width:'100%', background:'none', border:'1.5px solid #2a2d40',
    color:'#6b7280', borderRadius:12, padding:'13px',
    fontSize:13, fontWeight:600, cursor:'pointer',
  },
};
