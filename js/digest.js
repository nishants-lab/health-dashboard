// digest.js, "since last report" auto-summary.
import { latest, previous, inRange } from "./data.js";

// A marker improves when it moves toward its reference range.
// Returns {marker, from, to, kind: "improved"|"worsened"|"entered"|"left", pct}
export function computeDigest(markers) {
  const items = [];
  for (const m of markers) {
    const cur = latest(m.series);
    if (cur.value === null) continue;
    const prev = previous(m.series, cur.index);
    if (prev.value === null) continue;

    const curIn = inRange(cur.value, m.ref);
    const prevIn = inRange(prev.value, m.ref);
    const delta = cur.value - prev.value;
    if (delta === 0) continue;
    const pct = Math.abs(delta / (prev.value || 1)) * 100;

    let kind = null;
    if (!prevIn && curIn) kind = "entered";
    else if (prevIn && !curIn) kind = "left";
    else if (!curIn) {
      // still out of range: did it move toward the range?
      const target = m.ref.min != null && cur.value < m.ref.min ? m.ref.min : m.ref.max;
      const toward = Math.abs(cur.value - target) < Math.abs(prev.value - target);
      if (pct >= 4) kind = toward ? "improved" : "worsened";
    } else if (pct >= 15) {
      // big move within range is still worth surfacing
      const mid = ((m.ref.min ?? cur.value) + (m.ref.max ?? cur.value)) / 2;
      const toward = Math.abs(cur.value - mid) < Math.abs(prev.value - mid);
      kind = toward ? "improved" : "worsened";
    }
    if (!kind) continue;
    items.push({ marker: m, from: prev.value, to: cur.value, kind, pct, rising: delta > 0 });
  }
  const order = { left: 0, worsened: 1, entered: 2, improved: 3 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || b.pct - a.pct);
  return items.slice(0, 8);
}

export const digestCopy = {
  entered: { text: "back in range", good: true },
  improved: { text: "improving", good: true },
  left: { text: "out of range", good: false },
  worsened: { text: "worsening", good: false },
};