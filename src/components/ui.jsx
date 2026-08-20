import { C } from "../lib/theme.js";

export const Card = ({ children, className = "" }) => (
  <div className={`rounded-xl border p-4 ${className}`} style={{ background: C.card, borderColor: C.border }}>
    {children}
  </div>
);

export const Tag = ({ label, color }) => (
  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
    {label}
  </span>
);

export const KPI = ({ label, value, sub, color }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: C.muted }}>{label}</span>
    <span className="text-2xl font-black"
          style={{ color: color || C.text, fontFamily: "'DM Serif Display', Georgia, serif" }}>{value}</span>
    {sub && <span className="text-xs" style={{ color: C.muted }}>{sub}</span>}
  </div>
);

export const SectionTitle = ({ children, color }) => (
  <h2 className="text-xs font-bold tracking-widest uppercase mb-4"
      style={{ color: color || C.accent, fontFamily: "monospace" }}>
    ◈ {children}
  </h2>
);

export const CustomTip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg p-3 text-xs shadow-xl"
         style={{ background: "#1E2535", border: `1px solid ${C.border}`, color: C.text }}>
      <p className="font-bold mb-1" style={{ color: C.accent }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt ? fmt(p.value) : p.value}</p>
      ))}
    </div>
  );
};

/* Shown when a panel's underlying column is absent from the loaded dataset. */
export const Empty = ({ children }) => (
  <div className="flex items-center justify-center text-xs py-10 px-4 text-center"
       style={{ color: C.muted }}>
    {children}
  </div>
);

export const TOOLTIP_STYLE = {
  background: "#1E2535",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 11,
};
