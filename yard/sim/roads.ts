// @ts-nocheck
import { hooks } from '../shared';
import { clamp, wrap } from '../kernel/math';
import { CITY, RAB } from '../layout';
import { sim } from './core';

// ---- road rules ----
// Room along v's heading before it reaches the body of another road vehicle in its corridor, or a person
// on the road, less a gap. Vehicles that wait on each other in a ring would wait forever, so the senior one
// (police first, then trucks, then whoever came first) looks past the one in front for a moment and drives on.
let roadSeq = 0;
export const nextRoadSeq = () => roadSeq++;
const rank = v => (v.kind === 'police' ? -1e7 : v.kind === 'truck' ? 0 : 1e6) + v.seq;
export const roadVehicles = () => sim.cars.concat(sim.trucks);
export function clearAhead(v, look, gap, dt) {
  if (v.blocker && !v.blocker.isPerson) {
    const ring = [v]; let o = v.blocker;
    while (o && !o.isPerson && o !== v && ring.length < 8) { ring.push(o); o = o.blocker; }
    if (o === v && ring.every(r => rank(v) <= rank(r))) { v.ignore = v.blocker; v.ignoreT = 3; }
  }
  if ((v.ignoreT = (v.ignoreT ?? 0) - dt) <= 0) v.ignore = null;
  v.ghostT = Math.max(0, (v.ghostT ?? 0) - dt);
  const { x, y, h } = v.front, c = Math.cos(h), s = Math.sin(h);
  let best = Infinity, who = null;
  if (!v.ghostT) for (const o of roadVehicles()) if (o !== v && o !== v.ignore && !o.parked) for (const p of o.points) {
    const dx = p[0] - x, dy = p[1] - y, f = dx * c + dy * s;
    // keepBack: a vehicle about to back up asks those behind it to stop further off
    const k = o.halfW + (o.keepBack ?? 0);
    if (f > 0 && f < look && Math.abs(dy * c - dx * s) < v.halfW + 1.2 && f - k < best) { best = f - k; who = o; }
  }
  for (const p of sim.peds) { const dx = p.x - x, dy = p.y - y, f = dx * c + dy * s;
    if (f > -0.3 && f < look && Math.abs(dy * c - dx * s) < v.halfW + 0.7 && f - 0.6 < best) { best = Math.max(0, f - 0.6); who = p; } }
  v.blocker = best - gap < 0.3 ? who : null;
  return best - gap;
}
export const roadBusy = (v, x0, x1, y, skip) => roadVehicles().some(o => o !== v && !o.parked && !skip?.(o) && o.points.some(p => Math.abs(p[1] - y) < 2.6 && p[0] > x0 && p[0] < x1));
export const gapW = (t, x0, x1, skip) => !roadBusy(t, x0, x1, 127.5, skip), gapE = (t, x0, x1, skip) => !roadBusy(t, x0, x1, 134.5, skip);
// may a vehicle at the kerb pull out into the lane at (x, y), heading h? nothing moving in the lane from back metres
// behind that point to ahead metres past it
export const laneClear = (v, x, y, h, back = 28, ahead = 8) => { const c = Math.cos(h), s = Math.sin(h);
  return !roadVehicles().some(o => o !== v && !o.parked && o.points.some(([px, py]) => { const dx = px - x, dy = py - y, f = dx * c + dy * s; return Math.abs(dy * c - dx * s) < 2.6 && f > -back && f < ahead; })); };
// the kerb side of a lane: right of the way it runs, by k metres
export const kerbward = ([x, y], h, k) => [x - Math.sin(h) * k, y + Math.cos(h) * k];
// the last few metres of a drive, swung in to the kerb (kk: how far right of the lane's middle it ends)
export const pullIn = (pts, kk = 1.9) => { const n = pts.length, P = pts[n - 1], Q = pts[n - 2], h = Math.atan2(P[1] - Q[1], P[0] - Q[0]), c = Math.cos(h), s = Math.sin(h);
  const k = Math.min(7, Math.hypot(P[0] - Q[0], P[1] - Q[1]) * 0.6);   // swing in over the last straight, never back round a corner
  return [...pts.slice(0, -1), [P[0] - c * k, P[1] - s * k], kerbward([P[0] - c * k * 0.35, P[1] - s * k * 0.35], h, kk), kerbward(P, h, kk)]; };   // ending parallel to the kerb
// a flatbed already turning in at the plant gate is no reason for one at the exit to wait
export const turningIn = o => o.model === 'flatbed' && o.nextHold().name === 'bay' && o.front.x > 112 && o.front.x < 136 && o.front.y < 129;
// slow down for bends: the speed allowed now, given the first bend within reach
export function bendLimit(path, s, vBend = 6.5) {
  const h0 = path.at(s).h;
  for (let d = 2; d <= 24; d += 2) if (Math.abs(wrap(path.at(s + d).h - h0)) > 0.3) return Math.sqrt(vBend ** 2 + 8 * (d - 2));
  return Infinity;
}
const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); };
// may a walker step out from a to b? nothing moving will reach the crossing in the next 3 s, nothing stands on it
export function crossClear(a, b) {
  if (hooks.levelShut?.(a, b)) return false;   // the level crossing's barriers are down
  for (const v of roadVehicles()) {
    if (v.parked) continue;
    if (v.points.some(([x, y]) => segDist(x, y, a, b) < 1.6)) return false;
    if (v.v < 0.3) continue;
    const f = v.front, c = Math.cos(f.h), s = Math.sin(f.h);
    for (let k = 0; k <= 1; k += 0.25) { const d = (v.v * 3 + 3) * k; if (segDist(f.x + c * d, f.y + s * d, a, b) < 2.6) return false; }
  }
  return true;
}
export const compass = h => { const c = Math.cos(h), s = Math.sin(h); return c > 0.7 ? 'eastbound' : c < -0.7 ? 'westbound' : s > 0.7 ? 'southbound' : s < -0.7 ? 'northbound' : 'turning'; };
export function streetAt(x, y) {
  if (Math.hypot(x - RAB.x, y - RAB.y) < 16) return 'the roundabout';
  if (x > 436) return sahelStreet(x, y);
  if (y > 138 && y < 142.7 && x > 345 && x < 384) return 'the parking on Riverside Rd';
  if (y > 117 && y < 140) return x > 136 && x < 198 && y < 124 ? 'the truck park' : 'Riverside Rd';
  if (y > 196 && y < 214 && x > 50) return 'Market St';
  // Corner Market: its lay-by and forecourt on the north side of Coast Rd, its parking bays on the seafront
  if (x > 374 && x < 413 && y > 255.5 && y < 260) return 'the Corner Market lay-by';
  if (x > 377 && x < 413 && y > 249 && y < 256) return 'the Corner Market forecourt';
  if (x > 374 && x < 409 && y > 273.9 && y < 276.7) return 'the shop parking';
  if (y > 258 && y < 274) return 'Coast Rd';
  if (y >= 274) return y < 279 ? 'the promenade' : y < 296 ? 'the beach' : 'the sea';
  if (y < -4) return 'the hills';
  const av = [['Park Av', 60], ['Mill Av', 180], ['Harbour Av', 300], ['Hill Av', 420]].find(([, a]) => Math.abs(x - a) < 9);
  if (av && y > 138) return av[0];
  if (x > 218 && x < 263 && y > 176 && y < 199) return 'the police yard';
  if (x > 356 && (y < 93 || x > 404 && y < 117)) return x > 360 && x < 403 && y > 72 && y < 91 ? 'Orchard Green' : 'Orchard Ln';
  if (y < 118) return x < 200 ? 'the Plant 01 yard' : x < 358 ? 'the Warehouse 01 yard' : 'Riverside Rd';
  return 'town';
}
// east of the roundabout: the green belt, and Sahel's streets
function sahelStreet(x, y) {
  const { av, names, north, blvd, souq, corniche, lanes } = CITY, a = av.findIndex(c => Math.abs(x - c) < 7.5);
  if (y >= 274) return y < 279 ? 'the promenade' : y < 296 ? 'the beach' : 'the sea';
  if (y > corniche[0] - 0.5) return x < 520 ? 'Coast Rd' : 'the Corniche';
  if (y < -4) return 'the hills';
  if (x < 520) return y > 123 && y < 139 ? 'Riverside Rd' : 'the green belt';
  if (y > blvd[0] && y < blvd[1]) return Math.abs(y - lanes.bW) < 2.2 || Math.abs(y - lanes.bE) < 2.2 ? 'the busway, Sahel Blvd' : 'Sahel Blvd';
  if (a >= 0 && y > north[0]) return names[a];
  if (y > north[0] && y < north[1]) return 'North St';
  if (y > souq[0] && y < souq[1]) return 'Souq St';
  if (y < 4) return 'the railway';
  return 'Sahel';
}
