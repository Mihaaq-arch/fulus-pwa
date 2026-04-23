import { useState, useEffect, useCallback } from 'react';
import { fetchConfig, fetchSummary, fetchBalances } from './gas.js';
import { enqueue, syncQueue, getPendingCount, getAll, clearSynced } from './db.js';

// ── VERSION ───────────────────────────────────────────────────
const APP_VERSION = "0.4.0";

// ── THEME ─────────────────────────────────────────────────────
const DARK = {
  bg:       '#13141f',
  surface:  '#1c1e2e',
  card:     '#222438',
  border:   '#2e3048',
  text:     '#e2e4f0',
  subtext:  '#7b7f9e',
  muted:    '#3a3d58',
  accent:   '#00cfa8',
};
const LIGHT = {
  bg:       '#f4f5fb',
  surface:  '#ffffff',
  card:     '#f0f1fa',
  border:   '#dde0f0',
  text:     '#1a1c2e',
  subtext:  '#6b6f8e',
  muted:    '#c8cce0',
  accent:   '#00a88a',
};

const OWNER_COLORS = {
  Personal:  '#00cfa8',
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

// ── NUMPAD ────────────────────────────────────────────────────
function NumPad({ value, onChange, t }) {
  const handle = (key) => {
    if (key === '⌫') onChange(value.slice(0, -1) || '0');
    else if (key === '000') onChange(value === '0' ? '0' : value + '000');
    else onChange(value === '0' ? key : value + key);
  };
  const formatted = parseInt(value || '0').toLocaleString('id-ID');
  const keys = ['1','2','3','4','5','6','7','8','9','000','0','⌫'];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{
        background: t.card, borderRadius:14, padding:'16px 20px',
        textAlign:'right', fontFamily:'DM Mono, monospace',
        fontSize: value.length > 8 ? 28 : 36, fontWeight:700,
        color: t.text, letterSpacing:1, minHeight:64,
        display:'flex', alignItems:'center', justifyContent:'flex-end',
        border: `1.5px solid ${t.border}`
      }}>
        <span style={{ color: t.subtext, fontSize:18, marginRight:4 }}>Rp</span>
        {formatted}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
        {keys.map(k => (
          <button key={k} onClick={() => handle(k)} style={{
            background: k === '⌫' ? '#2d1f1f' : t.card,
            color: k === '⌫' ? '#f87171' : t.text,
            border: `1.5px solid ${k === '⌫' ? '#4a2020' : t.border}`,
            borderRadius:12, padding:'18px 0',
            fontSize: k === '000' ? 16 : 22, fontWeight:600,
            fontFamily:'DM Mono, monospace', cursor:'pointer',
            transition:'all 0.1s'
          }}>{k}</button>
        ))}
      </div>
    </div>
  );
}

// ── CHIP GRID ─────────────────────────────────────────────────
function ChipGrid({ items, selected, onSelect, getLabel, getColor, getKey, columns = 2, t }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${columns}, 1fr)`, gap:8 }}>
      {items.map((item, i) => {
        const label = getLabel ? getLabel(item) : String(item);
        const color = getColor ? getColor(item) : t?.accent || '#00cfa8';
        const key   = getKey ? getKey(item) : label;
        const isSel = selected === item || selected === label || selected === key;
        return (
          <button key={i} onClick={() => onSelect(item)} style={{
            background: isSel ? color + '20' : t?.card || '#222438',
            border: `1.5px solid ${isSel ? color : t?.border || '#2e3048'}`,
            color: isSel ? color : t?.subtext || '#7b7f9e',
            borderRadius:10, padding:'13px 8px',
            fontSize:13, fontWeight: isSel ? 700 : 500,
            cursor:'pointer', transition:'all 0.15s', textAlign:'center', lineHeight:1.3
          }}>{label}</button>
        );
      })}
    </div>
  );
}

// ── STEP DOTS ─────────────────────────────────────────────────
function StepDots({ total, current, t }) {
  return (
    <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6, height:6, borderRadius:3,
          background: i === current ? t.accent : i < current ? t.accent + '44' : t.muted,
          transition:'all 0.2s'
        }} />
      ))}
    </div>
  );
}

// ── SEPARATOR ─────────────────────────────────────────────────
function Separator({ label, t }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'16px 0 12px' }}>
      <div style={{ flex:1, height:1, background: t.border }} />
      {label && <span style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>{label}</span>}
      <div style={{ flex:1, height:1, background: t.border }} />
    </div>
  );
}

// ── HISTORY ITEM ──────────────────────────────────────────────
function HistoryItem({ item, t }) {
  const typeColor = { Expense:'#f87171', Income:'#4ade80', Transfer:'#60a5fa' };
  const color = typeColor[item.type] || '#9ca3af';
  const ownerColor = OWNER_COLORS[item.owner] || '#6b7280';
  const isPending = item.status === 'pending';
  const isError   = item.status === 'error';
  return (
    <div style={{
      background: t.surface, borderRadius:14, padding:'12px 16px',
      display:'flex', alignItems:'center', gap:12,
      borderLeft:`3px solid ${color}`, opacity: isPending ? 0.7 : 1,
      border: `1px solid ${t.border}`, borderLeftWidth:3, borderLeftColor: color,
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color: ownerColor, fontWeight:700 }}>{item.owner}</span>
          <span style={{ fontSize:11, color: t.muted }}>·</span>
          <span style={{ fontSize:12, color: t.subtext }}>{item.category}</span>
          {isPending && <span style={{ fontSize:10, color:'#fbbf24', background:'#fbbf2420', padding:'1px 6px', borderRadius:4 }}>pending</span>}
          {isError   && <span style={{ fontSize:10, color:'#f87171', background:'#f8717120', padding:'1px 6px', borderRadius:4 }}>error</span>}
        </div>
        <div style={{ fontSize:11, color: t.subtext, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {item.from || '—'} {item.to ? `→ ${item.to}` : ''}{item.notes ? ` · ${item.notes}` : ''}
        </div>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:700, color, fontFamily:'DM Mono, monospace' }}>
          {item.type === 'Expense' ? '-' : item.type === 'Income' ? '+' : ''}Rp{parseInt(item.amount || 0).toLocaleString('id-ID')}
        </div>
        <div style={{ fontSize:10, color: t.subtext }}>{item.rep !== 'One Time' ? item.rep : ''}</div>
      </div>
    </div>
  );
}

// ── SECTION ───────────────────────────────────────────────────
function Section({ title, children, t }) {
  return (
    <div>
      <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, marginBottom:10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}


// ── SUMMARY VIEW ──────────────────────────────────────────────
const OWNER_COLORS_SUMMARY = {
  Personal:  '#00cfa8',
  Servo:     '#60a5fa',
  House:     '#c084fc',
  ElFamilia: '#f87171',
  Investment:'#fbbf24',
};

function idr(n) {
  if (!n && n !== 0) return 'Rp0';
  const abs = Math.abs(Math.round(n));
  const fmt = abs.toLocaleString('id-ID');
  return (n < 0 ? '-Rp' : 'Rp') + fmt;
}

function SummaryView({ summary, loading, err, balances, balLoading, balErr, onRefresh, t }) {
  const [openOwner, setOpenOwner] = useState(null);

  if (loading) return (
    <div style={{ textAlign:'center', paddingTop:60, color: t.subtext, fontSize:13 }}>
      Memuat summary...
    </div>
  );

  if (err) return (
    <div style={{ textAlign:'center', paddingTop:40 }}>
      <div style={{ color:'#f87171', fontSize:13, marginBottom:12 }}>Gagal load: {err}</div>
      <button onClick={onRefresh} style={{ background:'none', border:`1px solid ${t.border}`, color: t.subtext, borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12 }}>Coba lagi</button>
    </div>
  );

  if (!summary) return (
    <div style={{ textAlign:'center', paddingTop:60, color: t.subtext, fontSize:13 }}>
      Belum ada data
    </div>
  );

  const { owners, summary: data, bridges } = summary;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Refresh */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color: t.subtext }}>Cache 15 menit</span>
        <button onClick={onRefresh} style={{ background:'none', border:`1px solid ${t.border}`, color: t.accent, borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Saldo terkini per owner */}
      {balLoading && <div style={{ color: t.subtext, fontSize:12, textAlign:'center' }}>Memuat saldo...</div>}
      {balErr && <div style={{ color:'#f87171', fontSize:12 }}>Gagal load saldo: {balErr}</div>}
      {balances && (
        <div style={{ background: t.surface, borderRadius:14, border:`1px solid ${t.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${t.border}` }}>
            <span style={{ fontSize:12, fontWeight:700, color: t.text }}>💰 Saldo Terkini</span>
          </div>
          {Object.entries(balances.byOwner).map(([owner, { accounts, total }]) => {
            const color = OWNER_COLORS_SUMMARY[owner] || '#6b7280';
            const est   = balances.estimates?.[owner] || 0;
            const sisa  = total - est;
            return (
              <div key={owner} style={{ borderBottom:`1px solid ${t.border}` }}>
                {/* Owner header */}
                <div style={{ padding:'10px 16px', background: t.card, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background: color }} />
                    <span style={{ fontSize:12, fontWeight:700, color: t.text }}>{owner}</span>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:13, fontWeight:700, color: total >= 0 ? t.text : '#f87171', fontFamily:'DM Mono, monospace' }}>
                      {idr(total)}
                    </div>
                    <div style={{ fontSize:10, color: sisa >= 0 ? '#4ade80' : '#f87171' }}>
                      sisa ~{idr(sisa)} setelah est. pengeluaran
                    </div>
                  </div>
                </div>
                {/* Per akun */}
                {accounts.map(({ name, balance }) => (
                  <div key={name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 16px 8px 28px', borderTop:`1px solid ${t.border}` }}>
                    <span style={{ fontSize:12, color: t.subtext }}>{name}</span>
                    <span style={{ fontSize:12, fontFamily:'DM Mono, monospace', color: balance >= 0 ? t.text : '#f87171' }}>
                      {idr(balance)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Per owner cards */}
      {owners.map(owner => {
        const s = data[owner];
        if (!s) return null;
        const color = OWNER_COLORS_SUMMARY[owner] || '#6b7280';
        const isOpen = openOwner === owner;
        const net = s.thisMonth.net;
        const sortedCats = Object.entries(s.cats || {}).sort((a,b) => b[1]-a[1]).slice(0, 5);

        return (
          <div key={owner} style={{ background: t.surface, borderRadius:14, border:`1px solid ${t.border}`, overflow:'hidden' }}>
            {/* Header */}
            <button onClick={() => setOpenOwner(isOpen ? null : owner)} style={{
              width:'100%', background:'none', border:'none', cursor:'pointer',
              padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between'
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: color }} />
                <span style={{ fontSize:14, fontWeight:700, color: t.text }}>{owner}</span>
                <span style={{ fontSize:11, color: t.subtext, background: t.card, padding:'2px 8px', borderRadius:6 }}>
                  Est. {idr(s.estimatedMonthly)}/bln
                </span>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:14, fontWeight:700, color: net >= 0 ? '#4ade80' : '#f87171', fontFamily:'DM Mono, monospace' }}>
                  {net >= 0 ? '+' : ''}{idr(net)}
                </div>
                <div style={{ fontSize:10, color: t.subtext }}>bulan ini</div>
              </div>
            </button>

            {/* Expanded */}
            {isOpen && (
              <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${t.border}` }}>
                {/* Bulan ini */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:12 }}>
                  {[
                    { label:'Masuk', value: s.thisMonth.income, color:'#4ade80' },
                    { label:'Keluar', value: s.thisMonth.expense, color:'#f87171' },
                    { label:'Net', value: s.thisMonth.net, color: s.thisMonth.net >= 0 ? '#4ade80' : '#f87171' },
                  ].map(({ label, value, color: c }) => (
                    <div key={label} style={{ background: t.card, borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color: t.subtext, marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:13, fontWeight:700, color: c, fontFamily:'DM Mono, monospace' }}>{idr(value)}</div>
                    </div>
                  ))}
                </div>

                {/* 3 bulan terakhir */}
                {s.months && s.months.length > 0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>3 Bulan Terakhir</div>
                    {s.months.map(m => (
                      <div key={m.month} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${t.border}` }}>
                        <span style={{ fontSize:12, color: t.subtext }}>{m.month}</span>
                        <div style={{ display:'flex', gap:12 }}>
                          <span style={{ fontSize:12, color:'#4ade80', fontFamily:'DM Mono, monospace' }}>+{idr(m.income)}</span>
                          <span style={{ fontSize:12, color:'#f87171', fontFamily:'DM Mono, monospace' }}>-{idr(m.expense)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Top kategori */}
                {sortedCats.length > 0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Top Pengeluaran</div>
                    {sortedCats.map(([cat, val]) => {
                      const total = Object.values(s.cats).reduce((a,b) => a+b, 0);
                      const pct = total > 0 ? ((val/total)*100).toFixed(0) : 0;
                      return (
                        <div key={cat} style={{ marginBottom:6 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                            <span style={{ fontSize:12, color: t.text }}>{cat}</span>
                            <span style={{ fontSize:12, color: t.subtext, fontFamily:'DM Mono, monospace' }}>{idr(val)} ({pct}%)</span>
                          </div>
                          <div style={{ height:4, background: t.border, borderRadius:2 }}>
                            <div style={{ height:4, background: color, borderRadius:2, width:`${pct}%`, transition:'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pola impulsif */}
                {(s.impulsive + s.routine) > 0 && (
                  <div style={{ marginTop:12, background: t.card, borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Pola Pengeluaran</div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, color: t.text }}>One-time (impulsif)</span>
                      <span style={{ fontSize:12, fontFamily:'DM Mono, monospace', color: '#fbbf24' }}>{idr(s.impulsive)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                      <span style={{ fontSize:12, color: t.text }}>Recurring (rutin)</span>
                      <span style={{ fontSize:12, fontFamily:'DM Mono, monospace', color: '#4ade80' }}>{idr(s.routine)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Bridge balances */}
      {bridges && Object.keys(bridges).length > 0 && (
        <div style={{ background: t.surface, borderRadius:14, border:`1px solid ${t.border}`, padding:'14px 16px' }}>
          <div style={{ fontSize:11, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Bridge Accounts</div>
          {Object.entries(bridges).map(([bridge, net]) => (
            <div key={bridge} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${t.border}` }}>
              <span style={{ fontSize:12, color: t.text }}>{bridge}</span>
              <span style={{
                fontSize:12, fontFamily:'DM Mono, monospace',
                color: Math.abs(net) < 1000 ? '#4ade80' : '#fbbf24'
              }}>
                {Math.abs(net) < 1000 ? '✓ Settled' : idr(net)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const [tab, setTab]           = useState('input');
  const [config, setConfig]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [configErr, setConfigErr] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState('');
  const [history, setHistory]   = useState([]);
  const [summary, setSummary]   = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState(null);
  const [balances, setBalances]     = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balErr, setBalErr]         = useState(null);

  // Form state
  const [step, setStep]         = useState(0);
  const [type, setType]         = useState('');
  const [fromAcc, setFromAcc]   = useState('');
  const [toAcc, setToAcc]       = useState('');
  const [category, setCategory] = useState('');
  const [catSearch, setCatSearch] = useState('');
  const [crossOwner, setCrossOwner] = useState(false);
  const [crossTarget, setCrossTarget] = useState('');
  const [dorPerson, setDorPerson]   = useState('');
  const [dorContext, setDorContext]  = useState('');
  const [amount, setAmount]     = useState('0');
  const [rep, setRep]           = useState('One Time');
  const [notes, setNotes]       = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchConfig()
      .then(data => { setConfig(data); setLoading(false); })
      .catch(err  => { setConfigErr(err.message); setLoading(false); });
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
    if (tab === 'summary') { loadSummary(); loadBalances(); }
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

  const accounts   = config?.accounts || [];
  const categories = config?.categories || [];
  const repOptions = config?.repOptions || REP_OPTIONS;

  const filteredCats = categories
    .filter(c => c.type === type)
    .filter(c => !catSearch || c.name.toLowerCase().includes(catSearch.toLowerCase()));
  const selectedCat  = categories.find(c => c.name === category);
  const isDOR        = selectedCat?.dor === true || selectedCat?.dor === 'true';

  const ownerOfFrom   = accounts.find(a => a.name === fromAcc)?.owner || '';
  const otherAccounts = accounts.filter(a => a.owner !== 'Unown' && a.name !== fromAcc);

  const bridgeMap = {
    'Personal-Servo':     'A-S Balance',
    'Servo-Personal':     'A-S Balance',
    'Personal-House':     'A-H Balance',
    'House-Personal':     'A-H Balance',
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
  const totalSteps      = STEPS.length;

  const goBack = () => { if (step > 0) setStep(s => s - 1); };
  const goNext = () => { if (step < STEPS.length - 1) setStep(s => s + 1); };

  const reset = () => {
    setStep(0); setType(''); setFromAcc(''); setToAcc('');
    setCategory(''); setCatSearch(''); setCrossOwner(false); setCrossTarget('');
    setDorPerson(''); setDorContext('');
    setAmount('0'); setRep('One Time'); setNotes('');
    setSubmitted(false);
  };

  const selectType = (t) => { setType(t); setTimeout(goNext, 200); };
  const selectFrom = (a) => { setFromAcc(a); setTimeout(goNext, 200); };
  const selectTo   = (a) => { setToAcc(a); setTimeout(goNext, 200); };
  const selectCat  = (c) => { setCategory(c.name); setTimeout(goNext, 200); };
  const selectRep  = (r) => { setRep(r); setTimeout(goNext, 200); };

  const handleSubmit = async () => {
    const txBase = { type, category, amount: parseInt(amount) || 0, rep, notes, date: new Date().toISOString() };
    const txs = [];

    if (crossOwner && crossTarget && type === 'Expense') {
      const ownerOfCross = accounts.find(a => a.name === crossTarget)?.owner || '';
      const bridge = bridgeMap[`${ownerOfFrom}-${ownerOfCross}`] || bridgeMap[`${ownerOfCross}-${ownerOfFrom}`] || 'A-S Balance';
      txs.push({ ...txBase, from: fromAcc, to: '' });
      txs.push({
        type: 'Follow-Up', category: 'Adjust', amount: parseInt(amount) || 0,
        rep: 'One Time', notes: `cross-owner: ${ownerOfFrom}→${ownerOfCross}`,
        from: crossTarget, to: bridge, date: new Date().toISOString(),
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
      try { await syncQueue(); await refreshPending(); } catch (_) {}
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
    screen:  { background: t.bg, minHeight:'100dvh', maxWidth:430, margin:'0 auto', display:'flex', flexDirection:'column', fontFamily:"'Sora', sans-serif", color: t.text, transition:'background 0.2s, color 0.2s' },
    header:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px 12px', borderBottom:`1px solid ${t.border}`, background: t.surface },
    tabs:    { display:'flex', borderBottom:`1px solid ${t.border}`, background: t.surface },
    tabBtn:  { flex:1, background:'none', border:'none', padding:'12px', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.15s', color: t.subtext },
    content: { flex:1, padding:'20px 16px', overflowY:'auto' },
    backBtn: { background:'none', border:'none', color: t.subtext, fontSize:12, cursor:'pointer', padding:0 },
    input:   { width:'100%', background: t.card, border:`1.5px solid ${t.border}`, borderRadius:10, padding:'12px 14px', color: t.text, fontSize:14, outline:'none', boxSizing:'border-box' },
    primaryBtn: { width:'100%', background: t.card, border:`1.5px solid ${t.accent}`, color: t.accent, borderRadius:12, padding:'15px', fontSize:15, fontWeight:700, cursor:'pointer' },
    ghostBtn:   { width:'100%', background:'none', border:`1.5px solid ${t.border}`, color: t.subtext, borderRadius:12, padding:'13px', fontSize:13, fontWeight:600, cursor:'pointer' },
    searchBox: { width:'100%', background: t.card, border:`1.5px solid ${t.border}`, borderRadius:10, padding:'10px 14px', color: t.text, fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:10 },
  };

  if (loading) return (
    <div style={{ ...s.screen, justifyContent:'center', alignItems:'center' }}>
      <div style={{ color: t.accent, fontSize:14 }}>Memuat Fulus...</div>
    </div>
  );

  if (configErr) return (
    <div style={{ ...s.screen, justifyContent:'center', alignItems:'center', padding:32 }}>
      <div style={{ color:'#f87171', fontSize:13, textAlign:'center' }}>
        Gagal load config<br /><span style={{ color: t.subtext, fontSize:11 }}>{configErr}</span>
      </div>
    </div>
  );

  return (
    <div style={s.screen}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18, fontWeight:800, color: t.text, letterSpacing:-0.5 }}>Fulus</span>
          <span style={{ fontSize:9, color: t.subtext, fontFamily:'DM Mono, monospace', marginLeft:2, marginTop:4 }}>v{APP_VERSION}</span>
          {pendingCount > 0 && (
            <span style={{ fontSize:10, background:'#fbbf2420', color:'#fbbf24', padding:'2px 7px', borderRadius:10, fontWeight:700 }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={toggleTheme} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, padding:'4px' }}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleSync} disabled={syncing || pendingCount === 0} style={{
            background:'none', border:'none', color: pendingCount > 0 ? t.accent : t.subtext,
            fontSize:12, cursor: pendingCount > 0 ? 'pointer' : 'default', fontWeight:600, padding:'4px 8px'
          }}>
            {syncing ? 'Syncing...' : syncMsg || (pendingCount > 0 ? '↑ Sync' : '✓ Synced')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {[['input','💸 Catat'],['history','📋 Riwayat'],['summary','📊 Summary']].map(([tb, label]) => (
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
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <StepDots total={totalSteps} current={step} t={t} />
            {step > 0 && <button onClick={goBack} style={s.backBtn}>← Kembali</button>}

            {/* TYPE */}
            {currentStepName === 'type' && (
              <Section title="Jenis transaksi" t={t}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => selectType(key)} style={{
                      background: type === key ? cfg.color + '20' : t.card,
                      border: `1.5px solid ${type === key ? cfg.color : t.border}`,
                      color: type === key ? cfg.color : t.subtext,
                      borderRadius:12, padding:'18px 8px', fontSize:13, fontWeight:700, cursor:'pointer',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4
                    }}>
                      <span style={{ fontSize:22 }}>{cfg.icon}</span>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* ACCOUNT */}
            {currentStepName === 'account' && (
              <Section title={type === 'Income' ? 'Masuk ke akun' : 'Dari akun'} t={t}>
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
              <Section title="Ke akun" t={t}>
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
                {type === 'Expense' && (
                  <div style={{ marginBottom:12 }}>
                    <button onClick={() => { setCrossOwner(v => !v); setCrossTarget(''); }} style={{
                      background: crossOwner ? t.accent + '20' : t.card,
                      border: `1.5px solid ${crossOwner ? t.accent : t.border}`,
                      color: crossOwner ? t.accent : t.subtext,
                      borderRadius:10, padding:'10px 14px', fontSize:12, fontWeight:600, cursor:'pointer', width:'100%'
                    }}>
                      {crossOwner ? '✓' : '○'} Dibayar akun lain (generate 2 baris)
                    </button>
                    {crossOwner && (
                      <div style={{ marginTop:8 }}>
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

                <Separator label="Kategori" t={t} />

                {/* Search */}
                <input
                  value={catSearch}
                  onChange={e => setCatSearch(e.target.value)}
                  placeholder="Cari kategori..."
                  style={s.searchBox}
                />

                <div style={{ opacity: crossOwner && !crossTarget ? 0.3 : 1, pointerEvents: crossOwner && !crossTarget ? 'none' : 'auto' }}>
                  {crossOwner && !crossTarget && (
                    <div style={{ fontSize:11, color:'#fbbf24', marginBottom:8 }}>Pilih akun yang bayar dulu</div>
                  )}
                  {filteredCats.length === 0
                    ? <div style={{ color: t.subtext, fontSize:13, textAlign:'center', padding:'20px 0' }}>Tidak ada kategori</div>
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
              <Section title="Detail hutang/piutang" t={t}>
                <label style={{ display:'block', fontSize:11, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Orang</label>
                <input value={dorPerson} onChange={e => setDorPerson(e.target.value)} placeholder="Nama orang..." style={s.input} />
                <label style={{ display:'block', fontSize:11, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, margin:'12px 0 6px' }}>Konteks</label>
                <ChipGrid items={['Office', 'Personal']} selected={dorContext} onSelect={setDorContext} getColor={() => t.accent} columns={2} t={t} />
                <button onClick={goNext} disabled={!dorPerson || !dorContext} style={{ ...s.primaryBtn, marginTop:16, opacity: (!dorPerson || !dorContext) ? 0.4 : 1 }}>Lanjut</button>
              </Section>
            )}

            {/* AMOUNT */}
            {currentStepName === 'amount' && (
              <Section title="Nominal" t={t}>
                <NumPad value={amount} onChange={setAmount} t={t} />
                <button onClick={goNext} disabled={!amount || amount === '0'} style={{ ...s.primaryBtn, marginTop:12, opacity: (!amount || amount === '0') ? 0.4 : 1 }}>Lanjut</button>
              </Section>
            )}

            {/* REP */}
            {currentStepName === 'rep' && (
              <Section title="Frekuensi" t={t}>
                <ChipGrid items={repOptions} selected={rep} onSelect={selectRep} getColor={() => t.accent} columns={3} t={t} />
              </Section>
            )}

            {/* NOTES */}
            {currentStepName === 'notes' && (
              <Section title="Catatan (opsional)" t={t}>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Keterangan tambahan..." rows={3}
                  style={{ ...s.input, resize:'none', fontFamily:'inherit' }} />
                <button onClick={handleSubmit} style={{ ...s.primaryBtn, marginTop:12, background: t.accent, color: isDark ? '#13141f' : '#fff' }}>
                  ✓ Catat
                </button>
                {!notes && (
                  <button onClick={handleSubmit} style={{ ...s.ghostBtn, marginTop:8 }}>Skip & Catat</button>
                )}
              </Section>
            )}
          </div>
        )}

        {/* ── SUCCESS ───────────────────────────────────── */}
        {tab === 'input' && submitted && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, paddingTop:40 }}>
            <div style={{ fontSize:56 }}>✓</div>
            <div style={{ color: t.accent, fontSize:22, fontWeight:800 }}>Tercatat!</div>
            <div style={{ color: t.subtext, fontSize:13, textAlign:'center' }}>
              {pendingCount > 0 ? `${pendingCount} transaksi menunggu sync` : 'Sudah tersync ke Sheets'}
            </div>
            <button onClick={reset} style={{ ...s.primaryBtn, width:160 }}>+ Catat Lagi</button>
            <button onClick={() => { reset(); setTab('history'); }} style={{ ...s.ghostBtn, width:160 }}>Lihat Riwayat</button>
          </div>
        )}

        {/* ── HISTORY ───────────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {history.length === 0
              ? <div style={{ color: t.subtext, textAlign:'center', paddingTop:40, fontSize:13 }}>Belum ada transaksi</div>
              : history.map((item, i) => <HistoryItem key={i} item={item} t={t} />)
            }
          </div>
        )}

        {/* ── SUMMARY ───────────────────────────────────── */}
        {tab === 'summary' && (
          <SummaryView summary={summary} loading={summaryLoading} err={summaryErr} balances={balances} balLoading={balLoading} balErr={balErr} onRefresh={() => { loadSummary(true); loadBalances(true); }} t={t} />
        )}

      </div>
    </div>
  );
}