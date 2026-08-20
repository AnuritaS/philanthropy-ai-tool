/* ─── Colour system ──────────────────────────────────────────────────────
   Chrome colours only. Series colours belong to funders and are assigned in
   lib/funders.js, so no funder identity is baked in here.
   ──────────────────────────────────────────────────────────────────────── */

export const C = {
  bg:      "#0A0D14",
  surface: "#12161F",
  card:    "#181D28",
  border:  "#252B3B",
  accent:  "#4ECDC4",
  gold:    "#F5C842",
  text:    "#E8EAF0",
  muted:   "#6B7590",
  /* Categorical ramp for slices of a single funder's portfolio. */
  sectors: ["#E8651A", "#1A7BC4", "#4ECDC4", "#F5C842", "#E04F7B", "#8B5CF6", "#10B981"],
};

export default C;
