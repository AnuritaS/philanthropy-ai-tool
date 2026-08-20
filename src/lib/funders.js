/* ─── Funder identity & colour assignment ────────────────────────────────
   Funders are discovered from the data, never hard-coded. Each gets a
   chart-safe key and a stable colour.
   ──────────────────────────────────────────────────────────────────────── */

/* Recharts treats "." in a dataKey as a path separator and chokes on odd
   characters, so series are addressed by a synthetic key and labelled by name. */
export const funderKey = (index) => `f${index}`;

export const PALETTE = [
  "#E8651A", // orange
  "#1A7BC4", // blue
  "#4ECDC4", // teal
  "#F5C842", // gold
  "#E04F7B", // rose
  "#8B5CF6", // violet
  "#10B981", // emerald
  "#F97316", // amber
  "#38BDF8", // sky
  "#A3E635", // lime
];

/* deriveFunders(grants) -> [{ key, name, color, count }]
   Ordered by grant count, ties broken by first appearance in the data, so
   colours stay stable across filters and match the source ordering. */
export function deriveFunders(grants) {
  const counts = new Map();
  const firstSeen = new Map();
  grants.forEach((g, i) => {
    if (!g.funder) return;
    counts.set(g.funder, (counts.get(g.funder) || 0) + 1);
    if (!firstSeen.has(g.funder)) firstSeen.set(g.funder, i);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || firstSeen.get(a[0]) - firstSeen.get(b[0]))
    .map(([name, count], i) => ({
      key: funderKey(i),
      name,
      color: PALETTE[i % PALETTE.length],
      count,
    }));
}

/* Colours must not shuffle when a filter narrows the data, so the funder
   list is derived once from the full dataset and reused for every view. */
export function funderColorMap(funders) {
  return Object.fromEntries(funders.map(f => [f.name, f.color]));
}
