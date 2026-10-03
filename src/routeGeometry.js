const EPS = 1e-9;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Split a world-space polyline at every exact intersection with every note's
// local rectangle. getLocal(note, point) must use the rendered affine CTM.
export function splitOwnedPolyline(points, notes, getLocal, isInside) {
  if (!points?.length) return [];
  const ownerAt = (p) => [...notes].reverse().find(n => isInside(getLocal(p, n)))?.id || null;
  const out = [];
  let active = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], cuts = [0, 1];
    for (const n of notes) {
      const qa = getLocal(a, n), qb = getLocal(b, n);
      const dx = qb.x - qa.x, dy = qb.y - qa.y;
      const edges = [[0, 'x'], [306, 'x'], [0, 'y'], [226.2, 'y']];
      for (const [edge, axis] of edges) {
        const d = axis === 'x' ? dx : dy, s = axis === 'x' ? qa.x : qa.y;
        if (Math.abs(d) <= EPS) continue;
        const t = (edge - s) / d;
        if (t > EPS && t < 1 - EPS) {
          const q = lerp(qa, qb, t);
          if (q.x >= -EPS && q.x <= 306 + EPS && q.y >= -EPS && q.y <= 226.2 + EPS) cuts.push(t);
        }
      }
    }
    cuts.sort((x, y) => x - y);
    const unique = cuts.filter((t, j) => !j || t - cuts[j - 1] > EPS);
    for (let j = 0; j < unique.length - 1; j++) {
      const t0 = unique[j], t1 = unique[j + 1];
      if (t1 - t0 <= EPS) continue;
      const p0 = lerp(a, b, t0), p1 = lerp(a, b, t1);
      const owner = ownerAt(lerp(a, b, (t0 + t1) / 2));
      const last = out.at(-1);
      if (last && last.note_id === owner && Math.hypot(last.points.at(-1).x - p0.x, last.points.at(-1).y - p0.y) <= 1e-7) last.points.push(p1);
      else out.push({ note_id: owner, points: [p0, p1] });
      active = owner;
    }
  }
  return out.filter(x => x.points.length > 1);
}
