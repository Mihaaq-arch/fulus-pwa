import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { OWNER_COLORS, idr } from '../constants.js';

const OWNER_COLORS_SUMMARY = OWNER_COLORS;

// ── SUMMARY VIEW ──────────────────────────────────────────────
export default function SummaryView({ summary, loading, err, balances, balLoading, balErr, onRefresh, t }) {
  const [openOwner, setOpenOwner] = useState(null);

  if (loading) return (
    <div style={{ textAlign:'center', paddingTop:60, color: t.subtext, fontSize:13 }}>
      Loading summary...
    </div>
  );

  if (err) return (
    <div style={{ textAlign:'center', paddingTop:40 }}>
      <div style={{ color:'#f87171', fontSize:13, marginBottom:12 }}>Failed to load: {err}</div>
      <button onClick={onRefresh} style={{ background:'none', border:`1px solid ${t.border}`, color: t.subtext, borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12 }}>Coba lagi</button>
    </div>
  );

  if (!summary) return (
    <div style={{ textAlign:'center', paddingTop:60, color: t.subtext, fontSize:13 }}>
      No data yet
    </div>
  );

  const { owners, summary: data, bridges } = summary;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Refresh */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color: t.subtext }}>Cached for 15 min</span>
        <button onClick={onRefresh} style={{ background:'none', border:`1px solid ${t.border}`, color: t.accent, borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Net chart */}
      {summary && (
        <NetChart owners={summary.owners} data={summary.summary} t={t} />
      )}

      {/* Saldo terkini per owner */}
      {balLoading && <div style={{ color: t.subtext, fontSize:12, textAlign:'center' }}>Loading balances...</div>}
      {balErr && <div style={{ color:'#f87171', fontSize:12 }}>Failed to load balances: {balErr}</div>}
      {balances && (
        <div style={{ background: t.surface, borderRadius:14, border:`1px solid ${t.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${t.border}` }}>
            <span style={{ fontSize:12, fontWeight:700, color: t.text }}>💰 Current Balances</span>
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
                      est. remaining ~{idr(sisa)} after projected expenses
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
                <div style={{ fontSize:10, color: t.subtext }}>this month</div>
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
                    <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Last 3 Months</div>
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
                    <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Top Expenses</div>
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
                    <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Spending Pattern</div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, color: t.text }}>One-time (unplanned)</span>
                      <span style={{ fontSize:12, fontFamily:'DM Mono, monospace', color: '#fbbf24' }}>{idr(s.impulsive)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                      <span style={{ fontSize:12, color: t.text }}>Recurring (planned)</span>
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

// ── NET CHART ─────────────────────────────────────────────────
export function NetChart({ owners, data, t }) {
  // gather all unique months from all owners, sorted
  const allMonths = [...new Set(
    owners.flatMap(o => (data[o]?.months || []).map(m => m.month))
  )].sort().slice(-6);

  if (allMonths.length === 0) return null;

  // reshape: per month, each owner as a field
  const chartData = allMonths.map(month => {
    const entry = { month: month.slice(2) }; // "2025-04" → "25-04"
    for (const owner of owners) {
      const found = data[owner]?.months?.find(m => m.month === month);
      entry[owner] = found ? found.net : 0;
    }
    return entry;
  });

  const OWNER_CHART_COLORS = {
    Personal:  '#00cfa8',
    Servo:     '#60a5fa',
    House:     '#c084fc',
    ElFamilia: '#f87171',
    Investment:'#fbbf24',
  };

  const formatY = (val) => {
    if (Math.abs(val) >= 1000000) return `${(val/1000000).toFixed(1)}jt`;
    if (Math.abs(val) >= 1000)    return `${(val/1000).toFixed(0)}rb`;
    return String(val);
  };

  return (
    <div style={{ background: t.surface, borderRadius:14, border:`1px solid ${t.border}`, padding:'16px 8px 8px' }}>
      <div style={{ fontSize:11, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:12, paddingLeft:8 }}>
        Net per Month (last 6 months)
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }} barCategoryGap="25%" barGap={2}>
          <XAxis
            dataKey="month"
            tick={{ fontSize:10, fill: t.subtext }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={formatY}
            tick={{ fontSize:9, fill: t.subtext }}
            axisLine={false} tickLine={false}
            width={36}
          />
          <ReferenceLine y={0} stroke={t.border} strokeWidth={1} />
          <Tooltip
            formatter={(val, name) => [idr(val), name]}
            contentStyle={{ background: t.card, border:`1px solid ${t.border}`, borderRadius:8, fontSize:11 }}
            labelStyle={{ color: t.subtext, fontSize:10 }}
            cursor={{ fill: t.muted + '30' }}
          />
          <Legend
            wrapperStyle={{ fontSize:10, paddingTop:8 }}
            formatter={(val) => <span style={{ color: t.subtext }}>{val}</span>}
          />
          {owners.map(owner => (
            <Bar
              key={owner}
              dataKey={owner}
              fill={OWNER_CHART_COLORS[owner] || '#6b7280'}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}