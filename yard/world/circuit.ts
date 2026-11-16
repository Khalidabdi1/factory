import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { landZ } from '../land';
import { lampPost, pine, tree } from './ground';
import { beam } from '../models/works';

// ---- Gull Bay Circuit ----
// A Grand Prix circuit on the coastal plain east of Millbrook, between the foot of the mountains and the Vale Road:
// 1.5 km of track, 11 m wide, fifteen turns. The pit straight runs east along the road; Paddock Bend and the Mill Kink
// take it north up the east side to the Knoll Hairpin; back west through the Esses and along the foot of the hills
// under the Hillside stand; round Hillside and Gorse into the infield straight; the Harbour Hairpin turns it back west,
// and Bay, the Chicane and the Last Corner bring it onto the pit straight again.
//
// The pit building faces the pit straight across the pit lane: ten garages, the hospitality floor over them with the
// podium on its balcony, Race Control in the tower at its east end. The main grandstand faces it from the road side,
// the Hillside stand climbs the slope of the hills, the Infield stand looks over the infield straight. Floodlight masts
// stand all round, for a race that goes on into the evening. Outside each corner is a run-off: a strip of asphalt, then
// gravel, then a tyre wall; along the straights a concrete wall with a catch fence on it. Kerbs at every apex. The
// main grandstand is open to the sky: a roof over it would hide the grid from the road side.
export const HALF = 5.5;
// the track's corners: (x, y, radius), in the order a car takes them, from the middle of the pit straight
const V: [number, number, number][] = [[2100, 150, 0], [2305, 150, 16], [2322, 116, 40], [2322, 30, 14], [2280, 20, 18], [2255, 46, 16], [2222, 24, 16], [2190, 46, 16],
  [2160, 26, 22], [1955, 26, 14], [1950, 62, 12], [2195, 70, 12], [2205, 94, 12], [1990, 96, 14], [1962, 120, 14], [1975, 150, 14]];
export const TURNS = [[1, 'Paddock Bend'], [2, 'the Mill Kink'], [3, 'the Knoll Hairpin'], [4, 'the Esses'], [5, 'the Esses'], [6, 'the Esses'], [7, 'the Esses'], [8, 'the Esses'],
  [9, 'Hillside'], [10, 'Gorse'], [11, 'the Harbour Hairpin'], [12, 'the Harbour Hairpin'], [13, 'Bay'], [14, 'the Chicane'], [15, 'the Last Corner']] as [number, string][];
// a closed polyline with a fillet of its own radius at each corner
function filleted(pts: [number, number, number][], step = 1.2) {
  const out: number[][] = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n], r = b[2];
    if (!r) { out.push([b[0], b[1]]); continue; }
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], d2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]), th = Math.tan(Math.abs(turn) / 2);
    const t = Math.min(r * th, l1 * 0.48, l2 * 0.48), rr = t / th, sg = Math.sign(turn);
    const p1 = [b[0] - d1[0] * t, b[1] - d1[1] * t], cx = p1[0] - d1[1] * rr * sg, cy = p1[1] + d1[0] * rr * sg, a0 = Math.atan2(p1[1] - cy, p1[0] - cx);
    const k = Math.max(2, Math.ceil(rr * Math.abs(turn) / step));
    for (let j = 0; j <= k; j++) { const a1 = a0 + turn * j / k; out.push([cx + rr * Math.cos(a1), cy + rr * Math.sin(a1)]); }
  }
  return out;
}
export const TRACK = new Path(filleted(V), 0.4, true);
export const LAP = TRACK.length;
// where a turn is: the distance along the lap nearest each corner's apex
export const TURN_S = V.slice(1).map(([x, y]) => TRACK.project(x, y));
// a point at s, off metres to the right of the racing line, and the heading there
export const trackAt = (s: number, off = 0) => { const p = TRACK.at(s); return { x:p.x - Math.sin(p.h) * off, y:p.y + Math.cos(p.h) * off, h:p.h }; };
// curvature (radians a metre, + to the right) and the fastest a car can take each metre: cornering at 4.3 g, braking at
// 4.7 g, and accelerating less hard the faster it goes
const N = Math.ceil(LAP);
export const KAPPA = new Float32Array(N), VPROF = new Float32Array(N);
const VMAX = 82, ALAT = 42, DEC = 46, acc = (v: number) => 2.5 + 15 * (1 - v / 90);
for (let i = 0; i < N; i++) KAPPA[i] = wrap(TRACK.at(i + 1.5).h - TRACK.at(i - 1.5).h) / 3;
for (let i = 0; i < N; i++) { const k = Math.max(Math.abs(KAPPA[i]), Math.abs(KAPPA[(i + 1) % N]), Math.abs(KAPPA[(i + N - 1) % N])); VPROF[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(k, 1e-5))); }
for (let pass = 0; pass < 3; pass++) {
  for (let i = N - 1; i >= 0; i--) VPROF[i] = Math.min(VPROF[i], Math.sqrt(VPROF[(i + 1) % N] ** 2 + 2 * DEC));
  for (let i = 0; i < N; i++) VPROF[(i + 1) % N] = Math.min(VPROF[(i + 1) % N], Math.sqrt(VPROF[i] ** 2 + 2 * acc(VPROF[i])));
}
export const vAt = (s: number) => { const i = ((Math.floor(s) % N) + N) % N, f = s - Math.floor(s); return VPROF[i] + (VPROF[(i + 1) % N] - VPROF[i]) * f; };
export const kAt = (s: number) => KAPPA[((Math.floor(s) % N) + N) % N];
// the start and finish line, across the pit straight at x 2140; the grid behind it, two by two, pole on the left
export const START_S = 40, START_X = 2140;
export const GRID = Array.from({ length:10 }, (_, k) => ({ s:(START_S - 7 - 8 * k + LAP) % LAP, off:k % 2 ? 2.4 : -2.4 }));
// the pit lane: in on the inside of Bay, along the front of the garages (a fast lane, and the working lane with each
// team's box in front of its garage), out on the inside of the Mill Kink. Ten garages, two to a team.
export const PITS = { y:137.5, box:133.8, x0:2030, w:20, n:10, back:113.5, front:130, wall:140.6, lane:[131.2, 140.2], limit:22 };
export const garageX = (i: number) => PITS.x0 + PITS.w * (i + 0.5);
export const GARAGE_Y = 121.5;
const PIT_IN = [[1981, 103.5], [1987, 118], [1999, 133], [2014, PITS.y]], PIT_OUT = [[2262, PITS.y], [2291, 132], [2307, 117], [2315, 98], [2318, 84]];
export const PIT_LANE = new Path([...PIT_IN, ...PIT_OUT], 8);
export const PIT_IN_S = TRACK.project(...PIT_IN[0] as [number, number]), PIT_OUT_S = TRACK.project(...PIT_OUT[PIT_OUT.length - 1] as [number, number]);
// a car's ways in the pits: out of its garage onto the lane and away; in off the track to its box; and in a race, in
// through its box and out again without going into the garage
const along = (x0: number, x1: number) => [[x0, PITS.y], [x1, PITS.y]];
export const pitPaths = (i: number) => { const gx = garageX(i);
  return { out:new Path([[gx, GARAGE_Y], [gx, 131], [gx + 6, PITS.y], ...PIT_OUT.slice(gx + 6 < PIT_OUT[0][0] ? 0 : 1)], 3.5),
    in:new Path([...PIT_IN, ...along(2014, gx - 9).slice(1), [gx - 3.5, PITS.box], [gx, PITS.box]], 4),
    through:new Path([...PIT_IN, ...along(2014, gx - 9).slice(1), [gx - 3.5, PITS.box], [gx + 3.5, PITS.box], [gx + 9, PITS.y], ...PIT_OUT.slice(gx + 9 < PIT_OUT[0][0] ? 0 : 1)], 4) }; };
// the stands: where the crowd sits (x0, x1, front edge y, rows, which way they face)
export const STANDS = { main:{ x0:2036, x1:2228, y:158.8, rows:12, face:-1 }, hill:{ x0:1986, x1:2140, y:13.6, rows:11, face:1 }, infield:{ x0:1994, x1:2118, y:49.6, rows:9, face:1 } };
export const PODIUM = { x:2130, y:131.4, z:7.4 };
export const BRIDGE_X = 2276;
export const CIRCUIT_BOX = [1936, 2340, 0, 170];
// what else stands round the track: (x0, x1, y0, y1) a run-off stops short of
const KEEP = [[2028, 2250, 112, 141.5], [1994, 2030, 102, 130], [STANDS.main.x0 - 2, STANDS.main.x1 + 2, 157, 172], [STANDS.hill.x0 - 2, STANDS.hill.x1 + 2, 1, 15],
  [STANDS.infield.x0 - 2, STANDS.infield.x1 + 2, 39, 51], [2150, 2188, 34, 58]];

// the track sampled every two metres: where it is, its right-hand normal, how sharp the corner it is in or coming to
type Sample = { s: number, x: number, y: number, h: number, rx: number, ry: number, k: number, kk: number };
const SAMPLES: Sample[] = [];
for (let s = 0; s < LAP; s += 2) {
  const p = TRACK.at(s); let kk = 0, ks = 0;
  for (let d = -6; d <= 36; d += 2) { const q = kAt(s + d); if (Math.abs(q) > Math.abs(ks)) ks = q; }
  for (let d = -4; d <= 4; d += 2) kk = Math.max(kk, Math.abs(kAt(s + d)));
  SAMPLES.push({ s, x:p.x, y:p.y, h:p.h, rx:-Math.sin(p.h), ry:Math.cos(p.h), k:ks, kk });
}
const HASH = new Map<string, Sample[]>(); for (const q of SAMPLES) { const k = `${Math.floor(q.x / 12)}|${Math.floor(q.y / 12)}`; (HASH.get(k) ?? HASH.set(k, []).get(k)!).push(q); }
// how near (x, y) comes to the track anywhere but within ds of s
function nearTrack(x: number, y: number, s: number, ds = 30) {
  let best = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of HASH.get(`${Math.floor(x / 12) + a}|${Math.floor(y / 12) + b}`) ?? []) {
    const d = Math.abs(wrap((q.s - s) / LAP * Math.PI * 2)) / (Math.PI * 2) * LAP; if (d < ds) continue; best = Math.min(best, Math.hypot(q.x - x, q.y - y)); }
  return best;
}
const blocked = (x: number, y: number) => x < CIRCUIT_BOX[0] + 1 || x > CIRCUIT_BOX[1] - 1 || y < CIRCUIT_BOX[2] + 9 || y > CIRCUIT_BOX[3] - 1 || KEEP.some(([a, b, c, d]) => x > a && x < b && y > c && y < d)
  || PIT_LANE.length > 0 && pitNear(x, y);
const PITPTS: number[][] = []; for (let s = 0; s < PIT_LANE.length; s += 2) { const p = PIT_LANE.at(s); PITPTS.push([p.x, p.y]); }
function pitNear(x: number, y: number) { for (const [px, py] of PITPTS) if (Math.abs(px - x) < 6 && Math.abs(py - y) < 6 && Math.hypot(px - x, py - y) < 5.5) return true; return false; }
// each sample's run-off on each side: [width out from the racing line, gravel from]. Outside a corner it runs wide, with
// gravel past a strip of asphalt; inside, and along the straights, a verge to a wall
const RUNOFF = SAMPLES.map(q => [-1, 1].map(side => {
  const outside = q.k !== 0 && Math.sign(q.k) !== side, corner = Math.abs(q.k) > 1 / 70;
  const wmax = outside && corner ? HALF + 2.5 + Math.min(17, 1100 * Math.abs(q.k)) : HALF + 3.2;
  let w = HALF + 1.2;
  while (w < wmax) { const x = q.x + q.rx * side * (w + 1), y = q.y + q.ry * side * (w + 1); if (nearTrack(x, y, q.s) < HALF + 2.5 || blocked(x, y)) break; w += 1; }
  return { w, gravel:outside && corner && w > HALF + 4 ? HALF + 2.5 : 0, tyres:outside && corner };
}));

export function buildCircuit() {
  const g = new THREE.Group(); g.name = 'circuit';
  const p = new Part(), G = TOP(0, 0, 0), [BX0, BX1, BY0, BY1] = CIRCUIT_BOX;
  // the grounds: mown grass inside the perimeter fence
  p.fill2(TOP(0, 0, 0.012), BX0, BY0 + 8, BX1 - BX0, BY1 - BY0 - 8, 'grass', 0);
  const at = (q: Sample, off: number, z: number) => W(q.x + q.rx * off, q.y + q.ry * off, z);
  const strip = (i: number, a0: number, a1: number, b0: number, b1: number, z: number, k: string) => {
    const q = SAMPLES[i], r = SAMPLES[(i + 1) % SAMPLES.length]; p.poly(k, [at(q, a0, z), at(r, b0, z), at(r, b1, z), at(q, a1, z)]); };
  for (let i = 0; i < SAMPLES.length; i++) {
    const q = SAMPLES[i], j = (i + 1) % SAMPLES.length, r = SAMPLES[j];
    // the track itself, its white edge lines
    strip(i, -HALF, HALF, -HALF, HALF, 0.03, 'glass');
    for (const e of [-HALF + 0.25, HALF - 0.25]) p.seg('line', at(q, e, 0.05), at(r, e, 0.05));
    // run-offs: asphalt, then gravel; a wall or a tyre wall at the far edge, a catch fence on it
    for (const [side, ro] of [[-1, RUNOFF[i][0]], [1, RUNOFF[i][1]]] as [number, any][]) {
      const ro2 = RUNOFF[j][side < 0 ? 0 : 1], w0 = ro.w, w1 = ro2.w;
      if (ro.gravel) { strip(i, side * HALF, side * ro.gravel, side * HALF, side * (ro2.gravel || ro.gravel), 0.022, 'road');
        if (ro2.gravel) strip(i, side * ro.gravel, side * w0, side * ro2.gravel, side * w1, 0.02, 'sand'); }
      else if (Math.abs(q.k) > 1 / 120 && Math.sign(q.k) !== side) strip(i, side * HALF, side * Math.min(w0, HALF + 2), side * HALF, side * Math.min(w1, HALF + 2), 0.022, 'road');
      if (pitNear(q.x + q.rx * side * (w0 + 1.5), q.y + q.ry * side * (w0 + 1.5))) continue;
      const A = at(q, side * (w0 + 0.2), 0), B = at(r, side * (w1 + 0.2), 0);
      if (ro.tyres && Math.abs(q.k) > 1 / 70) { for (const f of [0, 0.5]) { const c = A.clone().lerp(B, f); p.cylZ(c.x, c.z, 0, 0.36, 0.75, 6, 'k'); } }
      else p.extrude([[A.x, A.z, 0], [B.x, B.z, 0], [B.x + q.rx * side * 0.4, B.z + q.ry * side * 0.4, 0], [A.x + q.rx * side * 0.4, A.z + q.ry * side * 0.4, 0]], [0, 0, 0.95], 'n', { seams:false });
      const F0 = at(q, side * (w0 + 0.5), 0), F1 = at(r, side * (w1 + 0.5), 0);
      if (i % 2 === 0) p.seg('detail', F0.clone().setY(0.95), F0.clone().setY(3.6));
      p.seg('detail', F0.clone().setY(3.6), F1.clone().setY(3.6)).seg('detail', F0.clone().setY(2.3), F1.clone().setY(2.3));
    }
    // kerbs at the apexes and exits: two metres of each colour in turn, on both edges where the corner is tight
    if (q.kk > 1 / 55) for (const side of [-1, 1]) strip(i, side * HALF, side * (HALF + 1.3), side * HALF, side * (HALF + 1.3), 0.04, i % 2 ? 'kob' : 'deck');
  }
  // gravel's grain, scattered on the traps
  for (let i = 0; i < SAMPLES.length; i += 1) for (const [side, ro] of [[-1, RUNOFF[i][0]], [1, RUNOFF[i][1]]] as [number, any][]) if (ro.gravel)
    for (let k = 0; k < 3; k++) { const off = side * rand(ro.gravel + 0.5, ro.w - 0.3), q = SAMPLES[i], a = at(q, off, 0.04); p.seg('detail', a, a.clone().add(v3(0.3, 0, 0.18))); }
  // the start and finish line, chequered; the grid's slots and their numbers; the timing line's name
  const sx = START_X; for (let i = 0; i < 11; i++) for (const r of [0, 1]) p.fill2(TOP(0, 0, 0.045), sx + r * 0.6, 144.5 + i, 0.6, 1, (i + r) % 2 ? 'kob' : 'deck', 0);
  GRID.forEach((gs, k) => { const t = trackAt(gs.s, gs.off), x = t.x, y = t.y;
    p.draw(G, [x + 0.5, y - 1.1, x + 0.5, y + 1.1, x + 0.5, y - 1.1, x - 0.6, y - 1.1, x + 0.5, y + 1.1, x - 0.6, y + 1.1], 'line', 0.05).text(G, String(k + 1), x - 1.6, y + 0.4, 0.9, 'paint', 'middle', 0.05); });
  p.text(G, 'GULL BAY', 2190, 148.2, 3.2, 'paint', 'middle', 0.05);
  // DRS: detection lines, and where the flaps may open on the pit straight and the infield straight
  for (const [x0, y0, x1, y1] of [[1990, 150, 2010, 150], [1975, 64, 1995, 64.8]]) { for (const s of [-1, 1]) p.draw(G, [x0, y0 + s * 4.5, x0 + 0.01, y0 - s * 4.5], 'line', 0.05);
    p.text(G, 'DRS', (x0 + x1) / 2 + 6, y0 + 1.4, 1.6, 'paint', 'middle', 0.05); }
  // the pit lane: asphalt, the fast lane's line, the boxes with their team's name, the entry and exit lines, PIT 80
  for (let s = 0; s < PIT_LANE.length; s += 2) { const a = PIT_LANE.at(s), b = PIT_LANE.at(Math.min(PIT_LANE.length, s + 2)), w = s > 20 && s < PIT_LANE.length - 30 ? 4.6 : 3.6;
    const R0 = [-Math.sin(a.h), Math.cos(a.h)], R1 = [-Math.sin(b.h), Math.cos(b.h)];
    p.poly('road', [W(a.x - R0[0] * w, a.y - R0[1] * w, 0.032), W(b.x - R1[0] * w, b.y - R1[1] * w, 0.032), W(b.x + R1[0] * w, b.y + R1[1] * w, 0.032), W(a.x + R0[0] * w, a.y + R0[1] * w, 0.032)]); }
  for (let x = 2016; x < 2258; x += 4) p.draw(G, [x, 135.7, x + 2, 135.7], 'line', 0.05);
  for (let i = 0; i < PITS.n; i++) { const gx = garageX(i); p.rect2(G, gx - 3, PITS.box - 1.4, 6, 2.8, 'line', 0.05).text(G, ['SAHEL', 'HARROW', 'KESTREL', 'FAIRHAVEN', 'MOORLAND'][i >> 1], gx, 132.0, 0.55, 'paint', 'middle', 0.05); }
  p.draw(G, [2014, 132, 2014, 140], 'line', 0.05).draw(G, [2262, 132, 2262, 140], 'line', 0.05).text(G, 'PIT 80', 2019, 139.4, 1.2, 'paint', 'start', 0.05);
  // the pit wall, with each team's stand on it: a desk under a roof, screens, stools
  p.box(2016, PITS.wall, 0, 244, 0.5, 1.05);
  for (let i = 0; i < 5; i++) { const x = 2052 + 40 * i; p.box(x - 4, PITS.wall + 0.5, 0, 8, 1.6, 1.1).box(x - 4.2, PITS.wall + 0.3, 2.9, 8.4, 2.1, 0.12, 'k');
    for (const dx of [-4, 3.8]) p.box(x + dx, PITS.wall + 0.6, 1.1, 0.12, 0.12, 1.8); for (let k = 0; k < 4; k++) p.box(x - 3.4 + k * 1.9, PITS.wall + 0.7, 1.1, 1.2, 0.08, 0.7, 'w'); }

  // ---- the pit building: ten garages under the hospitality floor, Race Control at the east end, the podium ----
  const pb = buildPitBuilding(); g.add(pb.g);

  // ---- the stands, with their crowds drawn as a part of their own (seen while there is racing to see) ----
  const crowd = new Part();
  standBlock(p, crowd, STANDS.main, false); standBlock(p, crowd, STANDS.hill, false); standBlock(p, crowd, STANDS.infield, false);
  // the main grandstand's back on the road: its name, the stairs up, the turnstiles
  const MB = FRONT(STANDS.main.x0, STANDS.main.y + STANDS.main.rows * 0.85, 10.6);
  p.text(MB, 'GULL BAY CIRCUIT', (STANDS.main.x1 - STANDS.main.x0) / 2, 4.2, 3.0, 'ink', 'middle', 0.05);
  for (let x = 6; x < STANDS.main.x1 - STANDS.main.x0 - 6; x += 32) { p.rect2(MB, x, 7.4, 3, 3.2, 'line', 0.05); for (let k = 0; k < 4; k++) p.draw(MB, [x + 0.2, 7.6 + k * 0.8, x + 2.8, 7.6 + k * 0.8], 'detail', 0.05); }
  // the footbridge over the pit straight and the pit lane, its truss, stairs at both ends, a board on it
  footbridge(p);
  // the start gantry over the line: posts outside the walls, a beam, the five pairs of lights (lit by the race)
  for (const y of [142.4, 157.4]) p.box(sx - 0.25, y, 0, 0.5, 0.5, 6.6);
  p.box(sx - 0.4, 142.4, 5.6, 0.8, 15.5, 1.1, 'k');
  const lights = [0, 1, 2, 3, 4].map(k => { const q = new Part(); for (const dx of [-0.42, 0.42]) q.box(sx + dx - 0.04, 147.2 + k * 1.4, 5.75, 0.08, 0.8, 0.8, 'l'); const o = q.build(`light${k}`); g.add(o); return o; });
  // the floodlight masts: a lattice pole and a bank of lamps turned on the track
  for (const [x, y, a] of [[1962, 10, 0.8], [2050, 9, 1.6], [2150, 9, 1.6], [2240, 9, 1.7], [2333, 14, 2.4], [2336, 75, 3.1], [2333, 140, 3.6], [2290, 166, 4.6], [2010, 166, 4.6],
    [1940, 84, 0], [1940, 140, -0.6], [2086, 54, 1.6], [2232, 58, 2.4], [2150, 110, 4.7], [1990, 60, 0.5]]) mast(p, x, y, a);
  // marshal posts at the corners, outside the walls: a hut and a flag pole; the yellow flag is the race's own
  const posts = TURN_S.map((s, k) => { const i = Math.floor(s / 2) % SAMPLES.length, q = SAMPLES[i], side = q.k > 0 ? -1 : 1, ro = RUNOFF[i][side < 0 ? 0 : 1];
    const x = q.x + q.rx * side * (ro.w + 2.6), y = q.y + q.ry * side * (ro.w + 2.6); return { x, y, turn:TURNS[k] }; });
  for (const m of posts) { p.box(m.x - 0.9, m.y - 0.9, 0, 1.8, 1.8, 2.3).box(m.x - 1.1, m.y - 1.1, 2.3, 2.2, 2.2, 0.12, 'k'); p.seg('line', W(m.x + 0.9, m.y + 0.9, 0), W(m.x + 0.9, m.y + 0.9, 3.6)); }
  const flag = new Part(); flag.fill2(FRONT(0, 0, 3.6), 0, 0, 1.0, 0.7, 'kob', 0).rect2(FRONT(0, 0, 3.6), 0, 0, 1.0, 0.7, 'koline', 0.01);
  const yellow = flag.build('yellowFlag'); yellow.visible = false; g.add(yellow);
  // the paddock behind the garages: the teams' transporters, the medical centre and its helicopter pad in the infield
  for (let k = 0; k < 5; k++) { const x = 1997 + k * 6.4; p.box(x, 104, 0.6, 2.6, 13.4, 3.4, k % 2 ? 'k' : 'n').box(x + 0.1, 118.2, 0.5, 2.4, 3.2, 2.8, k % 2 ? 'n' : 'k');
    p.text(SIDE(x + 2.62, 117.2, 3.6), ['SAHEL', 'HARROW', 'KESTREL', 'FAIRHAVEN', 'MOORLAND'][k], 6.6, 1.6, 0.9, 'ink', 'middle', 0.04);
    for (const yy of [106, 115, 119.6]) for (const s of [-0.12, 2.5]) p.cylY(x + s + 0.06, yy, 0.5, 0.5, 0.22, 10, 'k'); }
  p.box(2152, 36, 0, 14, 9, 4.2).box(2151.6, 35.6, 4.2, 14.8, 9.8, 0.3, 'n');
  const MC = FRONT(2152, 45, 4.2); p.text(MC, 'MEDICAL CENTRE', 7, 1.4, 0.9, 'ink', 'middle', 0.04).draw(MC, [2, 2.2, 2, 3.6, 1.3, 2.9, 2.7, 2.9], 'line', 0.04);
  const pad = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pad.push(W(2178 + 7 * Math.cos(a), 49 + 7 * Math.sin(a), 0.04)); } p.poly('deck', pad);
  for (let i = 0; i < 24; i++) p.seg('line', pad[i], pad[(i + 1) % 24]);
  p.draw(G, [2176, 46.5, 2176, 51.5, 2180, 46.5, 2180, 51.5, 2176, 49, 2180, 49], 'line', 0.05);
  // the perimeter fence, its gates; the spectators' crossing over the Vale Road from the car park
  const fence = (x1: number, y1: number, x2: number, y2: number) => { const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 4));
    for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; p.seg('line', W(x, y, landZ(x, y)), W(x, y, landZ(x, y) + 2.4)); }
    for (const h of [1.2, 2.4]) p.seg('line', W(x1, y1, landZ(x1, y1) + h), W(x2, y2, landZ(x2, y2) + h)); };
  fence(BX0, BY0 + 8, BX1, BY0 + 8); fence(BX1, BY0 + 8, BX1, BY1); fence(BX0, BY0 + 8, BX0, BY1); fence(BX0, BY1, 2030, BY1); fence(2234, BY1, BX1, BY1);
  for (let y = 172; y < 180.5; y += 1.1) p.fill2(TOP(0, 0, 0.06), 2128, y, 4.4, 0.55, 'deck', 0);
  // the car park across the road: bays, cars nose to nose, lamps, a few trees between the rows
  for (let r = 0; r < 6; r++) { const y = 192 + r * 10;
    p.draw(G, [1992, y + 2.5, 2312, y + 2.5], 'detail', 0.04);
    for (let x = 1994; x < 2312; x += 2.8) { p.draw(G, [x, y, x, y + 5], 'detail', 0.04);
      if (rand(0, 1) < 0.72) { const t = rand(0, 1) < 0.4 ? 'k' : 'n', cx = x + 1.4, cy = y + (r % 2 ? 1.2 : 3.8); p.box(cx - 0.9, cy - 1.0, 0.35, 1.8, 2.0, 0.6, t).box(cx - 0.8, cy - 0.6, 0.95, 1.6, 1.2, 0.45, t); } } }
  for (let x = 2000; x < 2312; x += 40) { lampPost(p, x, 189, 0, 1, 0); tree(p, x + 20, 251, rand(0.8, 1.05)); }
  p.text(G, 'P', 1996, 189.2, 3.4, 'paint', 'start', 0.04);
  // woods between Millbrook and the circuit, and along the foot of the hills round it
  for (let gx = 1858; gx < 1934; gx += 6.2) for (let gy = 2; gy < 252; gy += 6.2) {
    const x = gx + rand(-2.2, 2.2), y = gy + rand(-2.2, 2.2), s = rand(0.78, 1.15), k = rand(0, 1);
    if (Math.abs(y - 176) < 9 || k < 0.12 || x < 1866 && y > 96 && y < 146) continue;
    if (k < 0.6) tree(p, x, y, s, landZ(x, y)); else pine(p, x, y, s, landZ(x, y));
  }
  for (let x = 1940; x < 2400; x += rand(6, 11)) { const y = rand(-3, 6), s = rand(0.75, 1.05); if (x > 1980 && x < 2146 && y > -1) continue; pine(p, x, y, s, landZ(x, y)); }
  for (let y = 12; y < 252; y += rand(7, 12)) { const x = rand(2342, 2352), s = rand(0.8, 1.1); if (Math.abs(y - 176) < 8) continue; tree(p, x, y, s, landZ(x, y)); }
  // the beach goes on east past the Starbase's spit: its grain
  for (let i = 0; i < 260; i++) { const x = rand(1900, 2418), y = rand(280, 294.5), z = y > 289 ? (y - 289) / 7 * -0.6 : 0; p.seg('detail', W(x, y, z + 0.04), W(x + 0.35, y + 0.2, z + 0.04)); }
  const base = p.build('circuitBase'); g.add(base);
  const crowdG = crowd.build('crowd'); g.add(crowdG);
  return { g, base, pits:pb, lights, yellow, posts, crowd:crowdG };
}

// a stand of stepped seating along x: the steps in section, swept from x0 to x1; rows climbing away from the track
// (face 1: the track to the south, the rows climbing north; −1: the track to the north). A roof on the main stand.
function standBlock(p: Part, crowd: Part, st: { x0: number, x1: number, y: number, rows: number, face: number }, roof: boolean) {
  const { x0, x1, y, rows, face } = st, D = 0.85, H = 0.5, z0 = 0.9, back = y - face * rows * D, top = z0 + rows * H;
  // the section, from the bottom of the back round to the front: back-bottom first, so its fan is sound
  const pts: number[][] = [[x0, back, 0], [x0, y, 0], [x0, y, z0]];
  for (let r = 0; r < rows; r++) { const yy = y - face * (r + 1) * D, z = z0 + (r + 1) * H; pts.push([x0, y - face * r * D, z]); pts.push([x0, yy, z]); }
  pts.push([x0, back, 0]); pts.pop();
  p.extrude(pts, [x1 - x0, 0, 0], 'n', { seams:false });
  for (let r = 0; r < rows; r++) { const yy = y - face * r * D, z = z0 + (r + 1) * H; p.seg('detail', W(x0, yy, z), W(x1, yy, z)); }
  for (let x = x0 + 12; x < x1 - 2; x += 24) for (let r = 0; r < rows; r++) { const yy = y - face * (r + 0.5) * D; p.seg('detail', W(x, yy, z0 + (r + 1) * H), W(x + 1.2, yy, z0 + (r + 1) * H)); }
  if (roof) { for (let x = x0 + 4; x < x1; x += 16) beam(p, [x, back, 0], [x, back, top + 4.5], 0.4, 'n');
    p.box(x0 - 1, Math.min(y, back) - 0.5, top + 4.5, x1 - x0 + 2, rows * D + 1, 0.3, 'n');
    for (let x = x0 + 4; x < x1; x += 4) p.seg('detail', W(x, Math.min(y, back) - 0.5, top + 4.82), W(x, Math.max(y, back) + 0.5, top + 4.82)); }
  // the crowd: a head and shoulders in most seats, in light and dark clothes
  for (let r = 0; r < rows; r++) for (let x = x0 + 0.5; x < x1 - 0.4; x += 0.72) {
    if (rand(0, 1) > 0.6 || ((x - x0) % 24 > 11.6 && (x - x0) % 24 < 13.4)) continue;
    const yy = y - face * (r + 0.55) * D, z = z0 + (r + 1) * H, t = rand(0, 1) < 0.22 ? 'kb' : 'nb';
    crowd.box(x - 0.22, yy - 0.16, z, 0.44, 0.32, 0.62, t).box(x - 0.11, yy - 0.11, z + 0.62, 0.22, 0.22, 0.24, t === 'kb' ? 'nb' : 'kb');
  }
}
// a floodlight mast: a tapering pole, a head with a bank of lamps on it turned toward a (a heading in the plan)
function mast(p: Part, x: number, y: number, a: number) {
  const H = 24; p.geo(new THREE.CylinderGeometry(0.22, 0.45, H, 6), new THREE.Matrix4().makeTranslation(...W(x, y, H / 2).toArray()), 'n');
  const c = Math.cos(a), s = Math.sin(a), q = (u: number, v: number, z: number) => [x + c * u - s * v, y + s * u + c * v, z];
  beam(p, q(0, -1.6, H), q(0, 1.6, H), 0.3, 'n');
  for (let k = -1; k <= 1; k++) for (const z of [H + 0.4, H + 1.3]) { const o = q(0.35, k * 1.05, z); p.box(o[0] - 0.4, o[1] - 0.4, o[2], 0.8, 0.8, 0.7, 'l'); }
}
// the footbridge across the pit straight and the pit lane, from the paddock to the grandstand, its board facing east
function footbridge(p: Part) {
  const x = BRIDGE_X, y0 = 128, y1 = 160, z = 6.6;
  p.box(x - 1.4, y0, z - 0.5, 2.8, y1 - y0, 0.5);
  for (const sx of [-1.4, 1.3]) { for (let y = y0; y < y1; y += 2.5) { p.seg('line', W(x + sx, y, z), W(x + sx, y + 2.5, z + 1.8)).seg('line', W(x + sx, y, z), W(x + sx, y, z + 1.8)); }
    p.seg('line', W(x + sx, y0, z + 1.8), W(x + sx, y1, z + 1.8)); }
  p.box(x - 1.5, y0 - 0.2, z + 1.8, 3.0, y1 - y0 + 0.4, 0.15, 'k');
  for (const y of [y0 + 1, y1 - 1]) for (const sx of [-1.2, 0.9]) p.box(x + sx, y, 0, 0.3, 0.3, z - 0.5);
  const S = SIDE(x + 1.42, (y0 + y1) / 2 + 9, z - 0.5); p.fill2(S, 0, 0, 18, 1.7, 'kob', 0.02).text(S, 'SAHEL MOTORS', 9, 1.35, 1.2, 'paint', 'middle', 0.03);
  // stairs down at each end, alongside the bridge
  for (const [ya, dir] of [[y0, -1], [y1, 1]] as [number, number][]) { const n = 14;
    for (let k = 0; k < n; k++) p.box(x + 1.4, ya + dir * (k * 0.9) - (dir < 0 ? 0.9 : 0), 0, 1.6, 0.9, z - 0.5 - k * (z - 0.5) / n); }
}

// The pit building: a long block of two storeys, x 2030–2230, the garages open to the pit lane under the glass of the
// hospitality floor, a parapet on the roof, Race Control's tower at the east end with its glass room on top, and the
// podium on a balcony over the pit lane in the middle. Opened, it is drawn as a section: walls cut low, the garages'
// partitions, each garage's kit (tool chests, tyre racks, the screens on their stands, the jacks), the offices behind.
export const RC = { x0:2232, x1:2248, y0:112, y1:130, h:19 };
function buildPitBuilding() {
  const X0 = PITS.x0, X1 = PITS.x0 + PITS.w * PITS.n, Y0 = PITS.back, Y1 = PITS.front, H = 10.4, GH = 4.6, z = 0;
  const g = new THREE.Group(); g.name = 'pitBuilding';
  const s = new Part();
  s.box(X0, Y0, z, X1 - X0, Y1 - Y0, H);
  for (const [bx, by, bw, bd] of [[X0, Y0, X1 - X0, 0.4], [X0, Y1 - 0.4, X1 - X0, 0.4], [X0, Y0, 0.4, Y1 - Y0], [X1 - 0.4, Y0, 0.4, Y1 - Y0]]) s.box(bx, by, H, bw, bd, 0.9);
  for (let x = X0 + 20; x < X1; x += 40) s.box(x - 2, Y0 + 3, H, 4, 3, 1.6, 'n');
  // the hospitality floor's glass along the front, its mullions; the garage openings, dark behind their doors
  const F = FRONT(X0, Y1, H);
  s.fill2(F, 0.4, 1.0, X1 - X0 - 0.8, 3.6, 'window').rect2(F, 0.4, 1.0, X1 - X0 - 0.8, 3.6, 'line');
  for (let u = 4.4; u < X1 - X0; u += 4) s.draw(F, [u, 1.0, u, 4.6], 'line');
  for (let i = 0; i < PITS.n; i++) { const u = PITS.w * i + 3; s.fill2(F, u, H - GH, 14, GH, 'glass').rect2(F, u - 0.15, H - GH - 0.15, 14.3, GH + 0.15, 'line').text(F, String(i + 1), u + 7, H - GH - 0.4, 0.5, 'ink', 'middle'); }
  s.text(F, 'GULL BAY GRAND PRIX', (X1 - X0) / 2, 0.75, 0.6, 'ink', 'middle');
  const SD = SIDE(X1, Y1, H); for (let v = 1.0; v < 4.6; v += 1.2) s.fill2(SD, 1, v, Y1 - Y0 - 2, 0.8, 'window');
  // Race Control: the tower, its glass room sloping out at the top, the clock
  const { x0:RX0, x1:RX1, y0:RY0, y1:RY1, h:RH } = RC;
  s.box(RX0, RY0, z, RX1 - RX0, RY1 - RY0, RH - 4).extrude([[RX0 - 0.6, RY0 - 0.6, RH - 4], [RX1 + 0.6, RY0 - 0.6, RH - 4], [RX1 + 0.6, RY1 + 0.6, RH - 4], [RX0 - 0.6, RY1 + 0.6, RH - 4]], [0, 0, 3.2], 'g');
  s.box(RX0 - 0.8, RY0 - 0.8, RH - 0.8, RX1 - RX0 + 1.6, RY1 - RY0 + 1.6, 0.4, 'n');
  const RF = FRONT(RX0, RY1, RH - 4); s.text(RF, 'RACE CONTROL', (RX1 - RX0) / 2, 1.4, 0.95, 'ink', 'middle');
  for (let v = 3; v < RH - 6; v += 3) s.fill2(RF, 2, v, RX1 - RX0 - 4, 1.2, 'window').rect2(RF, 2, v, RX1 - RX0 - 4, 1.2, 'line');
  // the podium: a balcony out over the pit lane at the first floor, three steps, the board behind
  const { x:PX, y:PY, z:PZ } = PODIUM;
  s.box(PX - 6, Y1, PZ - 0.4, 12, PY - Y1 + 1.2, 0.4);
  for (const [dx, h] of [[0, 0.9], [-2.4, 0.6], [2.4, 0.35]]) s.box(PX + dx - 1.1, PY - 0.9, PZ, 2.2, 1.8, h, 'k');
  for (let x = PX - 6; x <= PX + 6; x += 1.5) s.seg('line', W(x, PY + 1.2, PZ), W(x, PY + 1.2, PZ + 1.0)); s.seg('line', W(PX - 6, PY + 1.2, PZ + 1.0), W(PX + 6, PY + 1.2, PZ + 1.0));
  for (const dx of [-5.5, 5.4]) beam(s, [PX + dx, Y1 + 0.1, 0], [PX + dx, PY + 1.0, PZ - 0.4], 0.3, 'n');
  const shell = s.build('pitShell'); g.add(shell);
  // the garage doors, all rolled up together when the teams are working, hung from their tops
  const d = new Part(); for (let i = 0; i < PITS.n; i++) { const u = X0 + PITS.w * i + 3; d.box(u, Y1, -GH, 14, 0.15, GH); const sl = []; for (let v = 0.3; v < GH; v += 0.4) sl.push(0.1, v, 13.9, v); d.draw(FRONT(u, Y1 + 0.15, 0), sl, 'detail', 0.01); }
  const doors = d.build('garageDoors'); doors.position.copy(W(0, 0, GH)); shell.add(doors);

  // ---- the cut ----
  const c = new Part(), T = 0.4, LOW = 1.0;
  const wall = (bx: number, by: number, bw: number, bd: number) => { c.box(bx, by, z, bw, bd, LOW); const segs: number[] = [], n = Math.max(bw, bd);
    for (let u = 0.3; u < n - 0.1; u += 0.6) segs.push(...(bw > bd ? [u, 0, Math.min(n, u + T), bd] : [0, u, bw, Math.min(n, u + T)])); c.draw(TOP(bx, by, z + LOW), segs); };
  wall(X0, Y0, X1 - X0, T); wall(X0, Y0, T, Y1 - Y0); wall(X1 - T, Y0, T, Y1 - Y0);
  for (let i = 0; i < PITS.n; i++) { const u = X0 + PITS.w * i; wall(u, Y1 - T, 3, T); wall(u + 17, Y1 - T, 3, T); if (i) wall(u - 0.2, Y0, 0.4, Y1 - Y0 - 4.5); }
  for (let i = 0; i < 5; i++) wall(X0 + 40 * i, Y0, 40, 0.01);
  c.box(X0, 117.6, z, X1 - X0, T, LOW);
  const outline = (pts: number[][], zz: number) => { for (let i = 0; i < pts.length; i++) c.seg('detail', W(pts[i][0], pts[i][1], zz), W(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], zz)); };
  outline([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], H); outline([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], GH + 0.3);
  const cut = c.build('pitCut'); cut.visible = false; g.add(cut);
  // ---- inside: the garages' floors marked out, each with its kit; the offices and the teams' rooms behind ----
  const f = new Part(), Gz = TOP(0, 0, 0.02);
  f.fill2(TOP(X0, Y0, 0.02), 0, 0, X1 - X0, Y1 - Y0, 'deck', 0);
  for (let i = 0; i < PITS.n; i++) { const gx = garageX(i), u = X0 + PITS.w * i;
    f.rect2(Gz, gx - 3.2, 118.6, 6.4, 10.4, 'detail', 0.01);
    // tool chests on the walls, tyre racks of four sets, a screen on its stand, the front and rear jacks, a fuel rig
    for (const y of [119, 121.6, 124.2]) f.box(u + 0.6, y, 0, 1.0, 2.2, 1.1, 'k').box(u + PITS.w - 1.6, y, 0, 1.0, 2.2, 1.1, 'k');
    for (let k = 0; k < 4; k++) for (let t = 0; t < 2; t++) f.cylY(u + 2.6 + k * 1.0, 118.4, 0.36 + t * 0.78, 0.36, 0.38, 10, 'k');
    f.box(u + 13.4, 118.6, 0, 0.6, 0.6, 1.2).box(u + 12.9, 118.7, 1.2, 1.6, 0.1, 1.0, 'w');
    beam(f, [gx - 0.5, 128.6, 0.05], [gx + 0.5, 129.6, 0.6], 0.1, 'k'); beam(f, [gx - 0.5, 114.5 + 4.6, 0.05], [gx + 0.5, 114.5 + 3.6, 0.6], 0.1, 'k');
    // the team's room and the drivers' room behind, a table and chairs each
    f.box(u + 4, 114.6, 0, 4, 1.4, 0.75).box(u + 12, 114.6, 0, 4, 1.4, 0.75);
    for (const dx of [4.4, 6.4, 12.4, 14.4]) f.box(u + dx, 116.2, 0, 0.5, 0.5, 0.45); }
  // Race Control's floor: the desks under the screens
  f.fill2(TOP(RC.x0, RC.y0, 0.02), 0, 0, RC.x1 - RC.x0, RC.y1 - RC.y0, 'deck', 0);
  for (let k = 0; k < 3; k++) f.box(RC.x0 + 2, RC.y0 + 3 + k * 4.5, 0, RC.x1 - RC.x0 - 4, 1.0, 0.75).box(RC.x0 + 2, RC.y0 + 3 + k * 4.5, 0.75, RC.x1 - RC.x0 - 4, 0.1, 0.6, 'w');
  const inside = f.build('pitInside'); inside.visible = false; g.add(inside);
  g.userData.peek = { shell, cut, inside, box:[X0, RC.x1, Y0, Y1 + 0.5], z:[0, 6] };
  return { g, shell, cut, inside, doors };
}
