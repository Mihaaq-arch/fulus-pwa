import { OWNER_COLORS, idr } from '../constants.js';

export default function HistoryItem({ item, t }) {
  const typeColor = { Expense:'#f87171', Income:'#4ade80', Transfer:'#60a5fa' };
  const color = typeColor[item.type] || '#9ca3af';
  const ownerColor = OWNER_COLORS[item.owner] || '#6b7280';
  const isPending = item.status === 'pending';
  const isError   = item.status === 'error';
  return (
    <div style={{
      background: t.surface, borderRadius:14, padding:'12px 16px',
      display:'flex', alignItems:'center', gap:12,
      border: `1px solid ${t.border}`, borderLeftWidth:3, borderLeftColor: color,
      opacity: isPending ? 0.7 : 1,
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