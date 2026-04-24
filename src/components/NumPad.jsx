export default function NumPad({ value, onChange, t }) {
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