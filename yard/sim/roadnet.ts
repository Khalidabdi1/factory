// @ts-nocheck
import { ORCHARD, RAB } from '../layout';

// The street map, for vehicles that go wherever they are sent (the courier, the fire engine): every street as a pair
// of right-hand lanes between junctions, the roundabout as its one-way movements, the end of Orchard Lane as a turning
// loop. A trip is the shortest run of lanes that never turns back on itself, except round the turning loop.
const N = {
  R60:[60, 131], R180:[180, 131], R300:[300, 131], RW:[404, 131], RS:[420, 153], RN:[422, 112],
  M60:[60, 205], M180:[180, 205], M300:[300, 205], M420:[420, 205], C60:[60, 267], C180:[180, 267], C300:[300, 267], C420:[420, 267],
  OC:[ORCHARD.ax, ORCHARD.ey], OE:[ORCHARD.turn.x, ORCHARD.ey],
};
// two-way streets: [from, to, lane offset from the centre line]
const STREETS = [['R60', 'R180', 3.5], ['R180', 'R300', 3.5], ['R300', 'RW', 3.5], ['R60', 'M60', 3.5], ['M60', 'C60', 3.5], ['R180', 'M180', 3.5], ['M180', 'C180', 3.5],
  ['R300', 'M300', 3.5], ['M300', 'C300', 3.5], ['RS', 'M420', 3.5], ['M420', 'C420', 3.5], ['M60', 'M180', 3.5], ['M180', 'M300', 3.5], ['M300', 'M420', 3.5],
  ['C60', 'C180', 3.5], ['C180', 'C300', 3.5], ['C300', 'C420', 3.5], ['RN', 'OC', 2.5], ['OC', 'OE', 2.5]];
// the roundabout: each way through it, drawn on the same circle as the town's traffic
const R = RAB, ring = [[R.x, R.y + 12], [R.x + 12, R.y], [R.x, R.y - 12]];
const MOVES = [['RW', 'RS', [[404, 134.5], ring[0], [416.5, 153]]], ['RW', 'RN', [[404, 134.5], ...ring.slice(0, 2), [424.5, 119], [424.5, 112]]],
  ['RS', 'RW', [[423.5, 153], [430, 143.5], ring[1], ring[2], [404, 127.5]]], ['RS', 'RN', [[423.5, 153], [430, 143.5], ring[1], [424.5, 119], [424.5, 112]]],
  ['RN', 'RW', [[419.5, 112], [419.5, 118], [404, 127.5]]], ['RN', 'RS', [[419.5, 112], [419.5, 118], [410, 125], [410, 137], [416.5, 146], [416.5, 153]]]];
// the turning circle at the end of Orchard Lane, from the westbound lane round to the eastbound one
const T = ORCHARD.turn, LOOP = [['OE', 'OE', [[T.x + 2, T.y - 2.5], [T.x - 1.5, T.y - 3.6], [T.x - 3.6, T.y], [T.x - 1.5, T.y + 3.6], [T.x + 2, T.y + 2.5]]]];

const len = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
export const EDGES = [];
const edge = (a, b, pts, ring = false) => EDGES.push({ a, b, pts, len:len(pts), ring, i:EDGES.length });
for (const [a, b, k] of STREETS) for (const [p, q] of [[a, b], [b, a]]) {
  const [x0, y0] = N[p], [x1, y1] = N[q], l = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / l, dy = (y1 - y0) / l;
  edge(p, q, [[x0 - dy * k, y0 + dx * k], [x1 - dy * k, y1 + dx * k]]);   // the right-hand lane: offset to the right of travel
}
for (const [a, b, pts] of MOVES) edge(a, b, pts, true);
for (const [a, b, pts] of LOOP) edge(a, b, pts);
const reverse = e => EDGES.find(o => o.a === e.b && o.b === e.a && o !== e);
const out = n => EDGES.filter(e => e.a === n);

// the nearest point on a lane to (x, y): { e, s (distance along it), d (how far off), h (its heading there) }
function onEdge(e, x, y) {
  let best = null, s0 = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const [ax, ay] = e.pts[i - 1], [bx, by] = e.pts[i], L = Math.hypot(bx - ax, by - ay), t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L)));
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t, d = Math.hypot(px - x, py - y);
    if (!best || d < best.d) best = { e, s:s0 + t * L, d, h:Math.atan2(by - ay, bx - ax), p:[px, py] };
    s0 += L;
  }
  return best;
}
// where a vehicle is: the lane closest to it that runs the way it faces
export function locate(x, y, h) {
  let best = null;
  for (const e of EDGES) { if (e.a === e.b) continue; const o = onEdge(e, x, y); if (h !== undefined && Math.cos(o.h - h) < 0.5) continue; if (!best || o.d < best.d) best = o; }
  return best;
}
// where to stop for a door: the nearest lane, which is the one on the door's side of the street
export const kerbStop = (x, y) => locate(x, y);

// the points of a lane between two distances along it
function slice(e, s0, s1) {
  const pts = []; let s = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const [ax, ay] = e.pts[i - 1], [bx, by] = e.pts[i], L = Math.hypot(bx - ax, by - ay), at = t => [ax + (bx - ax) * t, ay + (by - ay) * t];
    if (s + L >= s0 && s <= s1) { if (!pts.length) pts.push(at(Math.max(0, (s0 - s) / L))); if (s1 <= s + L) { pts.push(at((s1 - s) / L)); return pts; } pts.push([bx, by]); }
    s += L;
  }
  return pts;
}
// join two runs of points at a junction: where their lanes cross, unless they run straight on
function join(pts, next) {
  const tidy = q => q.filter((p, i) => i === 0 || Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]) > 0.05);
  pts = tidy(pts); next = tidy(next);
  if (!pts.length) return next.slice();
  if (pts.length < 2 || next.length < 2) return tidy(pts.concat(next));
  const [p, q] = [pts[pts.length - 2] ?? pts[pts.length - 1], pts[pts.length - 1]], [r, t] = [next[0], next[1] ?? next[0]];
  const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [t[0] - r[0], t[1] - r[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2) || Math.hypot(q[0] - r[0], q[1] - r[1]) < 0.05) {
    return Math.hypot(q[0] - r[0], q[1] - r[1]) < 0.05 ? pts.concat(next.slice(1)) : pts.concat(next);
  }
  const k = ((r[0] - p[0]) * d2[1] - (r[1] - p[1]) * d2[0]) / den, X = [p[0] + d1[0] * k, p[1] + d1[1] * k];
  return pts.slice(0, -1).concat([X], next.slice(1));
}

// The lanes from where a vehicle is to a stop on a lane, as points to drive: Dijkstra over lanes. A vehicle never goes
// straight back the way it came, and never from one way through the roundabout into another (that would be a U-turn
// at its mouth); the turning loop at the end of Orchard Lane is the one place it turns round.
export function trip(from, to) {
  const A = locate(from.x, from.y, from.h), B = to;
  if (!A || !B) return null;
  if (A.e === B.e && B.s > A.s) return slice(A.e, A.s, B.s);
  const dist = new Map([[A.e, A.e.len - A.s]]), prev = new Map(), open = new Set([A.e]);
  let goal = Infinity, last = null;
  while (open.size) {
    let e = null; for (const o of open) if (!e || dist.get(o) < dist.get(e)) e = o;
    if (dist.get(e) >= goal) break;
    open.delete(e);
    const back = reverse(e);
    for (const n of out(e.b)) {
      if (n === back || e.ring && n.ring) continue;
      if (n === B.e && dist.get(e) + B.s < goal) { goal = dist.get(e) + B.s; last = e; }
      const d = dist.get(e) + n.len;
      if (n !== A.e && d < (dist.get(n) ?? Infinity)) { dist.set(n, d); prev.set(n, e); open.add(n); }
    }
  }
  if (!last) return null;
  const chain = [B.e]; for (let e = last; e && e !== A.e; e = prev.get(e)) chain.unshift(e);
  let pts = slice(A.e, A.s, A.e.len);
  for (const e of chain) pts = join(pts, e === B.e ? slice(e, 0, B.s) : e.pts);
  return pts;
}
