export function StepDots({ total, current, t }) {
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

export function Separator({ label, t }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'16px 0 12px' }}>
      <div style={{ flex:1, height:1, background: t.border }} />
      {label && <span style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>{label}</span>}
      <div style={{ flex:1, height:1, background: t.border }} />
    </div>
  );
}

export function Section({ title, children, t }) {
  return (
    <div>
      <div style={{ fontSize:10, color: t.subtext, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, marginBottom:10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}