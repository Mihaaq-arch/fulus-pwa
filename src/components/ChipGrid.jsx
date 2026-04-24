export default function ChipGrid({ items, selected, onSelect, getLabel, getColor, getKey, columns = 2, t }) {
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