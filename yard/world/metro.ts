import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { CURB, METRO, metroAt } from '../layout';
import { DOORS, DOOR_W, FLOOR } from '../models/metro';
import { beam } from '../models/works';
import { ring } from './ground';

// ---- Sahel Metro, built: the viaducts, and the stations along them ----
// The viaduct is a concrete box girder on Y-armed piers, after Riyadh's: two slab tracks with a third rail outside
// each, a walkway and a parapet along each edge. Round a station the tracks spread apart for the island platform
// between them, and the deck widens with them.
type Line = typeof METRO.lines[number];
type Station = Line['stations'][number] & { conc?: number[], entry?: number, style?: string, central?: boolean };
type V3 = [number, number, number];
const { track:T, wide:WIDE, plat:PLAT, island:ISL } = METRO, TAN = METRO.escSlope;
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// how far the tracks have spread for a station at u: 0 on the open line, 1 alongside an island
export function spreadAt(line: Line, u: number) {
  let k = 0; for (const st of line.stations) k = Math.max(k, Math.min(smooth((u - (st.u0 - 12)) / 11), smooth((st.u0 + PLAT + 12 - u) / 11)));
  return k;
}
export const trackV = (line: Line, u: number) => T + (WIDE - T) * spreadAt(line, u);
export const deckHW = (line: Line, u: number) => trackV(line, u) + 3.0;
// across a crossover: the track on the −v side before it, the +v side after, an S between (whichever way it is run)
export const crossV = (line: Line, xo: number[], u: number) => u <= xo[0] ? -trackV(line, u) : u >= xo[1] ? trackV(line, u) : -T + 2 * T * smooth((u - xo[0]) / (xo[1] - xo[0]));
export const levels = (line: Line) => { const zd = line.deck, zr = zd + 0.3, zf = zr + FLOOR; return { zd, zr, zf, zc:line.conc, zu:zd - 1.4, zt:zf + 5.6 }; };
// the side of a line the camera sees: south of Line 1 (+v), east of Line 2 (−v)
export const visSide = (line: Line) => line.axis === 'x' ? 1 : -1;

// A line's frame: boxes, prisms and faces given in (u, v, z), drawn in the town's frame
export class Frame {
  line: Line; vis: number;
  constructor(line: Line) { this.line = line; this.vis = visSide(line); }
  at(u: number, v: number, z = 0): V3 { return metroAt(this.line, u, v, z) as V3; }
  // and back: a town point's (u, v) on this line
  uv(x: number, y: number) { return this.line.axis === 'x' ? [x, y - this.line.at] : [y, this.line.at - x]; }
  w(u: number, v: number, z = 0) { return W(...this.at(u, v, z)); }
  box(p: Part, u0: number, u1: number, v0: number, v1: number, z0: number, h: number, tone?: string, o?: any) {
    const a = this.at(u0, v0), b = this.at(u1, v1);
    p.box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), z0, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), h, tone, o);
    return this;   // so boxes chain in the line's frame
  }
  // a profile in (u, z) at v0, swept across to v1
  sweepV(p: Part, uz: number[][], v0: number, v1: number, tone = 'n', o?: any) {
    const e = this.at(0, v1 - v0), o0 = this.at(0, 0);
    return p.extrude(uz.map(([u, z]) => this.at(u, v0, z)), [e[0] - o0[0], e[1] - o0[1], 0], tone, o);
  }
  // a profile in (v, z) at u0, swept along to u1
  sweepU(p: Part, vz: number[][], u0: number, u1: number, tone = 'n', o?: any) {
    const e = this.at(u1 - u0, 0), o0 = this.at(0, 0);
    return p.extrude(vz.map(([v, z]) => this.at(u0, v, z)), [e[0] - o0[0], e[1] - o0[1], 0], tone, o);
  }
  // the long face the camera sees, at v (on its side), from u0 to u1, top at z: its matrix, and where u falls on it
  long(v: number, u0: number, u1: number, z: number) {
    if (this.line.axis === 'x') return { M:FRONT(u0, this.line.at + v, z), s:(u: number) => u - u0, w:u1 - u0 };
    return { M:SIDE(this.line.at - v, u1, z), s:(u: number) => u1 - u, w:u1 - u0 };
  }
  // the end face the camera sees, at u (the high end), across v0..v1 (v1 the camera's side for Line 1), top at z
  end(u: number, hw: number, z: number) {
    if (this.line.axis === 'x') return { M:SIDE(u, this.line.at + hw, z), s:(v: number) => hw - v, w:2 * hw };
    return { M:FRONT(this.line.at - hw, u, z), s:(v: number) => hw - v, w:2 * hw };
  }
  // the heading of a walk across the line toward side s (+v or −v)
  heading(s: number) { const a = this.at(0, s), b = this.at(0, 0); return Math.atan2(a[1] - b[1], a[0] - b[0]); }
  seg(p: Part, k: string, a: V3, b: V3) { p.seg(k, W(...a), W(...b)); }
  poly(p: Part, k: string, pts: V3[]) { p.poly(k, pts.map(q => W(...q))); }
}

// ---- the viaduct between stations ----
// the deck from u0 to u1: top, the edge and web on the camera's side, a parapet each side; the tracks on it, the
// crossovers, lamps along the parapet
function deckRun(p: Part, F: Frame, u0: number, u1: number) {
  const line = F.line, { zd } = levels(line), vis = F.vis, us: number[] = [];
  for (let u = u0; u < u1; u += 2) us.push(u); us.push(u1);
  for (let i = 1; i < us.length; i++) {
    const a = us[i - 1], b = us[i], ha = deckHW(line, a), hb = deckHW(line, b);
    F.poly(p, 'deck', [F.at(a, -ha, zd), F.at(b, -hb, zd), F.at(b, hb, zd), F.at(a, ha, zd)]);
    F.poly(p, 'body', [F.at(a, vis * ha, zd), F.at(b, vis * hb, zd), F.at(b, vis * hb, zd - 0.3), F.at(a, vis * ha, zd - 0.3)]);
    F.poly(p, 'body', [F.at(a, vis * ha, zd - 0.3), F.at(b, vis * hb, zd - 0.3), F.at(b, vis * (hb - 2.0), zd - 2.0), F.at(a, vis * (ha - 2.0), zd - 2.0)]);
    for (const s of [-1, 1]) {
      F.poly(p, 'body', [F.at(a, s * (ha - 0.15), zd), F.at(b, s * (hb - 0.15), zd), F.at(b, s * (hb - 0.15), zd + 1.1), F.at(a, s * (ha - 0.15), zd + 1.1)]);
      F.seg(p, 'line', F.at(a, s * ha, zd), F.at(b, s * hb, zd)); F.seg(p, 'line', F.at(a, s * (ha - 0.15), zd + 1.1), F.at(b, s * (hb - 0.15), zd + 1.1));
    }
    F.seg(p, 'line', F.at(a, vis * ha, zd - 0.3), F.at(b, vis * hb, zd - 0.3)); F.seg(p, 'line', F.at(a, vis * (ha - 2.0), zd - 2.0), F.at(b, vis * (hb - 2.0), zd - 2.0));
  }
  for (const s of [-1, 1]) for (const u of [u0, u1]) { const h = deckHW(line, u); F.seg(p, 'line', F.at(u, s * (h - 0.15), zd), F.at(u, s * (h - 0.15), zd + 1.1)); }
  tracks(p, F, u0, u1, (u: number, s: number) => s * trackV(line, u));
  for (let u = Math.ceil(u0 / 24) * 24; u < u1; u += 24) F.box(p, u - 0.2, u + 0.2, F.vis * (deckHW(line, u) - 0.5), F.vis * (deckHW(line, u) - 0.15), zd + 1.1, 0.25, 'l');
}
// two tracks from u0 to u1, each side s at v(u, s): a slab bed, two rails, the third rail outside; the crossovers
export function tracks(p: Part, F: Frame, u0: number, u1: number, vAt: (u: number, s: number) => number, beds = true) {
  const { zd, zr } = levels(F.line), us: number[] = [];
  for (let u = u0; u < u1; u += 1.5) us.push(u); us.push(u1);
  const run = (fv: (u: number) => number, a: number, b: number, third: number) => {
    for (let i = 1; i < us.length; i++) { const p0 = us[i - 1], p1 = us[i]; if (p1 <= a || p0 >= b) continue;
      const va = fv(p0), vb = fv(p1);
      if (beds) F.poly(p, 'road', [F.at(p0, va - 1.3, zd + 0.02), F.at(p1, vb - 1.3, zd + 0.02), F.at(p1, vb + 1.3, zd + 0.02), F.at(p0, va + 1.3, zd + 0.02)]);
      for (const r of [-0.72, 0.72]) F.seg(p, 'line', F.at(p0, va + r, zr), F.at(p1, vb + r, zr));
      if (third) F.seg(p, 'detail', F.at(p0, va + third * 1.45, zr - 0.05), F.at(p1, vb + third * 1.45, zr - 0.05));
    }
  };
  for (const s of [-1, 1]) run(u => vAt(u, s), u0, u1, s);
  for (const xo of F.line.xovers) if (xo[1] > u0 && xo[0] < u1) run(u => crossV(F.line, xo, u), xo[0] - 0.5, xo[1] + 0.5, 0);
}
// a pier: a column standing in the street's middle (or on a kerb), and two arms up to the girder like a Y
function pier(p: Part, F: Frame, u: number, z0 = 0) {
  const { zd } = levels(F.line), top = zd - 2.0 - 1.8;
  F.box(p, u - 0.8, u + 0.8, -1.1, 1.1, z0, top - z0);
  for (const s of [-1, 1]) beam(p, F.at(u, s * 0.55, top - 0.2), F.at(u, s * 2.5, zd - 2.05), 1.3, 'n');
  F.box(p, u - 0.9, u + 0.9, -2.9, 2.9, zd - 2.25, 0.25);
}
// a buffer stop at the end of a track
export function buffer(p: Part, F: Frame, u: number, s: number, dir: number) {
  const { zr } = levels(F.line), v = s * WIDE;
  F.box(p, Math.min(u, u + dir * 0.8), Math.max(u, u + dir * 0.8), v - 1.0, v + 1.0, zr - 0.3, 1.3, 'k');
  F.box(p, u - 0.15, u + 0.15, v - 0.15, v + 0.15, zr + 1.0, 0.35, 'l');
}
export const PIERS: Record<number, [number, number][]> = {
  1:[[512, 0], [526.5, CURB], [557, 0], [582, 0], [604, 0], [718, 0], [741, 0], [780, 0], [805, 0], [830, 0], [855, 0]],
  2:[[96, 0], [123.25, CURB], [138.75, CURB], [154, 0]] };
export function buildViaducts() {
  const p = new Part();
  for (const line of METRO.lines) {
    const F = new Frame(line), runs = line.id === 1 ? [[504, 612], [704, 868]] : [[90, 160]];
    for (const [a, b] of runs) deckRun(p, F, a, b);
    for (const [u, z0] of PIERS[line.id]) pier(p, F, u, z0);
  }
  return p.build('viaducts');
}

// ---- a station's plan: where its people walk, wait and board, in the town's frame ----
export type Plan = { line: Line, st: Station, F: Frame, entries: { ground: V3, foot: V3, top: V3, land: V3 }[], gates: V3[], footU: number, topU: number, zc: number,
  waits: number[][], seats: { at: number[], h: number, z: number, lz: number, by: any, u: number, v: number }[], box: number[], zf: number, mid: V3 };
export function stationPlan(line: Line, st: Station): Plan {
  const F = new Frame(line), { zf, zc } = levels(line), u0 = st.u0, e = st.entry!, [c0, c1] = st.conc!.map(c => u0 + c);
  const run = zc / TAN, cEnd = e < 0 ? c0 : c1, foot = cEnd + e * run, iRun = (zf - zc) / TAN, iFoot = cEnd - e * 9, iTop = iFoot - e * iRun;
  const entries = [-1, 1].map(s => ({ ground:F.at(foot + e * 3, s * 9.5, CURB), foot:F.at(foot, s * 9.5, CURB), top:F.at(cEnd, s * 9.5, zc), land:F.at(cEnd - e * 2, s * 7.2, zc) }));
  const gU = cEnd - e * 6.5, gates = [-3, -1.5, 0, 1.5, 3].map(v => F.at(gU, v, zc));
  const lo = Math.min(iFoot, iTop) - 1.8, hi = Math.max(iFoot, iTop) + 1.8, waits: number[][] = [], seats: Plan["seats"] = [];
  for (let u = u0 + 3; u < u0 + PLAT - 2; u += 2.6) { if (u > lo && u < hi) continue;
    for (const s of [-1, 1]) { const [x, y] = F.at(u, s * 1.7); waits.push([x, y, zf, F.heading(s), u, s * 1.7]); } }
  for (let u = u0 + 6; u < u0 + PLAT - 4; u += 13) { if (u > lo - 2 && u < hi + 2) continue;
    for (const k of [-0.5, 0.5]) for (const s of [-1, 1]) { const [x, y] = F.at(u + k, s * 0.35); seats.push({ at:[x, y], h:F.heading(s), z:0.45, lz:zf, by:null, u:u + k, v:s * 0.35 }); } }
  const b0 = F.at(u0 - 4, -10.6), b1 = F.at(u0 + 62, 10.6), bx = [Math.min(b0[0], b1[0]), Math.max(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.max(b0[1], b1[1])];
  // the box takes in the escalators down to the ground at the entry end
  const fx = F.at(foot + e * 1, 0); bx[0] = Math.min(bx[0], fx[0]); bx[1] = Math.max(bx[1], fx[0]); bx[2] = Math.min(bx[2], fx[1]); bx[3] = Math.max(bx[3], fx[1]);
  return { line, st, F, entries, gates, footU:iFoot, topU:iTop, zc, waits, seats, box:bx, zf, mid:F.at(u0 + PLAT / 2, 0, zf) };
}

// where the doors of a train standing at a platform fall (station u, from the platform's start): the same set either
// way it faces, since a train is the same from both ends
export const DOOR_US = (() => { const out: number[] = []; for (let i = 0; i < METRO.cars; i++) for (const d of DOORS) out.push(1.8 + METRO.cars * (METRO.car + METRO.gap) - METRO.gap - i * (METRO.car + METRO.gap) + d); return out.sort((a, b) => a - b); })();

// an escalator from (u0, v, z0) up to (u1, v, z1): its truss, the steps, a handrail each side over a glass balustrade
export function escalator(p: Part, F: Frame, u0: number, u1: number, v: number, z0: number, z1: number, w = 1.2) {
  F.sweepV(p, [[u0, z0 - 0.7], [u1, z1 - 0.7], [u1, z1], [u0, z0]], v - w / 2, v + w / 2, 'n', { seams:false });
  const n = Math.max(2, Math.round(Math.hypot(u1 - u0, z1 - z0) / 0.45));
  for (let i = 1; i < n; i++) { const t = i / n, u = u0 + (u1 - u0) * t, z = z0 + (z1 - z0) * t + 0.02; F.seg(p, 'detail', F.at(u, v - w / 2 + 0.1, z), F.at(u, v + w / 2 - 0.1, z)); }
  for (const s of [-1, 1]) { const vv = v + s * w / 2;
    F.seg(p, 'line', F.at(u0, vv, z0 + 0.95), F.at(u1, vv, z1 + 0.95)); F.seg(p, 'detail', F.at(u0, vv, z0 + 0.95), F.at(u0, vv, z0));
    F.seg(p, 'detail', F.at(u1, vv, z1 + 0.95), F.at(u1, vv, z1)); }
}
// the metro's sign: a ring with an M in it, on a face M at (cx, cy)
export function roundel(p: Part, M: THREE.Matrix4, cx: number, cy: number, r: number, lift = 0.05) {
  const segs: number[] = []; for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, b = (k + 1) / 20 * Math.PI * 2; segs.push(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)); }
  p.draw(M, segs, 'line', lift).text(M, 'M', cx, cy + r * 0.45, r * 1.25, 'ink', 'middle', lift + 0.005);
}
// platform screen doors along an island edge (side s): fixed panes between doors drawn as their frames, so the
// platform shows through; the door leaves are in two parts that slide apart when a train's doors open
export function screenDoors(F: Frame, u0: number, s: number, zf: number, fixed: Part) {
  const v = s * (ISL - 0.05), H = 2.5, half = 0.82, fw = new Part(), bw = new Part();
  const posts = [u0 + 0.5, ...DOOR_US.flatMap(d => [u0 + d - half, u0 + d + half]), u0 + PLAT - 0.5];
  F.seg(fixed, 'line', F.at(u0 + 0.5, v, zf + H), F.at(u0 + PLAT - 0.5, v, zf + H)); F.seg(fixed, 'detail', F.at(u0 + 0.5, v, zf + 0.08), F.at(u0 + PLAT - 0.5, v, zf + 0.08));
  for (const u of posts) F.seg(fixed, 'line', F.at(u, v, zf), F.at(u, v, zf + H));
  for (let i = 0; i < posts.length; i += 2) { const a = posts[i], b = posts[i + 1]; for (let u = a + 1.3; u < b - 0.3; u += 1.3) F.seg(fixed, 'detail', F.at(u, v, zf), F.at(u, v, zf + H)); }
  for (const d of DOOR_US) for (const [part, a] of [[bw, u0 + d - half], [fw, u0 + d]] as [Part, number][]) {
    const b = a + half, q = [F.at(a, v, zf + 0.05), F.at(b, v, zf + 0.05), F.at(b, v, zf + H - 0.1), F.at(a, v, zf + H - 0.1)];
    for (let k = 0; k < 4; k++) F.seg(part, 'line', q[k], q[(k + 1) % 4]);
    F.seg(part, 'detail', F.at(a + 0.15, v, zf + 1.6), F.at(b - 0.15, v, zf + 2.1));
  }
  return [fw.build(`psd${s}F`), bw.build(`psd${s}B`)];
}

// ---- a station on the open line: an island platform under a long hall, a concourse hung under the tracks, glass
// escalator tubes up to it from either side of the line. Three dresses: 'najdi' (a wall of the old town's colour pierced
// with rows of triangles that glow after dark, stepped crenellations), 'fins' (glass behind a screen of fins under a
// pleated roof), 'louvre' (glass behind horizontal louvres under a barrel roof).
export function buildStation(line: Line, st: Station, plan: Plan) {
  const F = new Frame(line), vis = F.vis, { zd, zf, zc, zu, zt } = levels(line), u0 = st.u0, U0 = u0 - 4, U1 = u0 + 62, HW = 7.6;
  const e = st.entry!, [c0, c1] = st.conc!.map(c => u0 + c), cEnd = e < 0 ? c0 : c1, run = zc / TAN, foot = cEnd + e * run;
  const iRun = (zf - zc) / TAN, iFoot = cEnd - e * 9, iTop = iFoot - e * iRun, oLo = Math.min(iFoot, iTop) - 0.3, oHi = Math.max(iFoot, iTop) + 0.3;
  const g = new THREE.Group(); g.name = st.id;

  // ---- always there: piers, the pavilions over the escalator feet, a totem with the sign ----
  const b = new Part();
  for (const u of [U0 + 3, (U0 + U1) / 2, U1 - 3]) { const top = zu - 1.6; F.box(b, u - 1.0, u + 1.0, -1.4, 1.4, 0, top); for (const s of [-1, 1]) beam(b, F.at(u, s * 0.7, top - 0.3), F.at(u, s * 4.6, zu - 0.05), 1.4, 'n'); }
  for (const s of [-1, 1]) {
    const v = s * 9.5, ua = foot - e * 0.6, ub = foot + e * 4.2;
    F.box(b, Math.min(ua, ub), Math.max(ua, ub), v - 1.5, v + 1.5, 3.1, 0.25, 'n');
    for (const u of [ub]) for (const dv of [-1.3, 1.3]) F.box(b, u - 0.1, u + 0.1, v + dv - 0.1, v + dv + 0.1, CURB, 3.0);
    const tu = foot + e * 5.4, tv = v + s * 1.0; F.box(b, tu - 0.15, tu + 0.15, tv - 0.15, tv + 0.15, CURB, 3.4).box(b, tu - 0.5, tu + 0.5, tv - 0.08, tv + 0.08, CURB + 3.4, 1.0, 'k');
  }
  g.add(b.build('stationBase'));

  // ---- the shell: the hall at platform level with its dress, the concourse, the escalator tubes ----
  const sh = new Part();
  F.box(sh, U0, U1, -HW, HW, zu, zd - zu);                                       // the deck the hall stands on
  for (const s of [-1, 1]) F.box(sh, U0, U1, s > 0 ? HW - 0.4 : -HW, s > 0 ? HW : -HW + 0.4, zd, zt - zd);   // the long walls
  // the end walls, open where the tracks come through, a dark mouth behind each opening
  for (const u of [U0, U1]) { const [ua, ub] = u === U0 ? [U0, U0 + 0.4] : [U1 - 0.4, U1];
    for (const [v0, v1] of [[-HW, -WIDE - 1.7], [-WIDE + 1.7, WIDE - 1.7], [WIDE + 1.7, HW]]) F.box(sh, ua, ub, v0, v1, zd, zt - zd);
    for (const s of [-1, 1]) { F.box(sh, ua, ub, s * WIDE - 1.7, s * WIDE + 1.7, zf + 3.6, zt - zf - 3.6);
      F.poly(sh, 'glass', [F.at(ua + (u === U1 ? -0.6 : 0.6), s * WIDE - 1.7, zd), F.at(ua + (u === U1 ? -0.6 : 0.6), s * WIDE + 1.7, zd), F.at(ua + (u === U1 ? -0.6 : 0.6), s * WIDE + 1.7, zf + 3.6), F.at(ua + (u === U1 ? -0.6 : 0.6), s * WIDE - 1.7, zf + 3.6)]); } }
  const LF = F.long(vis * HW, U0, U1, zt), EF = F.end(U1, HW, zt), wallH = zt - zd;
  if (st.style === 'najdi') {
    // rows of small triangles through the wall, a band of them high up and one low, alternately up and down
    for (const [M, w] of [[LF.M, LF.w], [EF.M, EF.w]] as [THREE.Matrix4, number][]) {
      for (const [v0, rows] of [[1.0, 3], [wallH - 3.2, 1]] as [number, number][]) for (let r = 0; r < rows; r++) for (let x = 1.2 + (r % 2) * 0.55; x < w - 1.2; x += 1.1) {
        const vv = v0 + r * 0.9, up = (r + Math.round(x / 1.1)) % 2 === 0;
        const tri = up ? [[x, vv + 0.7], [x + 0.6, vv + 0.7], [x + 0.3, vv]] : [[x, vv], [x + 0.6, vv], [x + 0.3, vv + 0.7]];
        const o = new THREE.Vector3().setFromMatrixColumn(M, 2).normalize().multiplyScalar(-0.03);
        sh.poly('window', tri.map(([a, c]) => new THREE.Vector3(a, c, 0).applyMatrix4(M).add(o)));
      }
      sh.draw(M, [0, 0.6, w, 0.6, 0, wallH - 3.6, w, wallH - 3.6, 0, wallH - 0.8, w, wallH - 0.8], 'line', 0.04);
    }
    // stepped crenellations along the top of the walls the camera sees, a clerestory down the middle of the roof
    for (let u = U0 + 0.3; u < U1 - 0.6; u += 1.4) F.sweepV(sh, [[u, zt], [u + 0.7, zt], [u + 0.35, zt + 0.8]], vis * (HW - 0.3), vis * HW, 'n', { seams:false });
    F.box(sh, U0 + 0.4, U1 - 0.4, -HW, HW, zt - 0.3, 0.3);
    F.box(sh, U0 + 6, U1 - 6, -2.4, 2.4, zt, 1.6);
    const CL = F.long(vis * 2.4, U0 + 6, U1 - 6, zt + 1.6); sh.fill2(CL.M, 0.4, 0.3, CL.w - 0.8, 1.0, 'window', 0.03);
    for (let x = 1.4; x < CL.w - 1; x += 1.4) sh.draw(CL.M, [x, 0.3, x, 1.3], 'line', 0.04);
  } else {
    // glass the length of the hall at platform height, some of it lit, under a band of wall
    const lit = (M: THREE.Matrix4, w: number) => { sh.fill2(M, 0.6, wallH - (zf - zd) - 4.6, w - 1.2, 4.2, 'glass', 0.03);
      for (let x = 0.6; x < w - 1.6; x += 2.4) if (rand(0, 1) < 0.55) sh.fill2(M, x + 0.1, wallH - (zf - zd) - 4.4, 2.2, 3.8, 'window', 0.035); };
    lit(LF.M, LF.w); lit(EF.M, EF.w);
    if (st.style === 'fins') {
      for (let u = U0 + 0.8; u < U1 - 0.4; u += 1.2) F.box(sh, u, u + 0.25, vis > 0 ? HW : -HW - 0.9, vis > 0 ? HW + 0.9 : -HW, zd + 0.4, wallH - 0.4);
      for (let u = U0; u < U1 - 0.1; u += 6) F.sweepV(sh, [[u, zt], [u + 6, zt], [u + 3, zt + 1.5]], -HW - 0.5, HW + 0.5, 'n');
    } else {
      for (const [M, w] of [[LF.M, LF.w], [EF.M, EF.w]] as [THREE.Matrix4, number][]) { const segs: number[] = [];
        for (let y = wallH - (zf - zd) - 4.4; y < wallH - (zf - zd) - 0.6; y += 0.55) segs.push(0.4, y, w - 0.4, y); sh.draw(M, segs, 'line', 0.06); }
      const r = HW + 0.4, len = U1 - U0, mid = F.at((U0 + U1) / 2, 0, zt - 0.2);
      const q = new THREE.Quaternion().setFromEuler(line.axis === 'x' ? new THREE.Euler(0, 0, Math.PI / 2) : new THREE.Euler(Math.PI / 2, 0, 0));
      // a half cylinder laid along the line, flattened to a shallow vault (the radial axis that ends up vertical is scaled)
      const x = line.axis === 'x';
      sh.geo(new THREE.CylinderGeometry(r, r, len, 16, 1, true, x ? 0 : Math.PI / 2, Math.PI), new THREE.Matrix4().compose(W(...mid), q, x ? v3(0.42, 1, 1) : v3(1, 1, 0.42)), 'n');
    }
    sh.draw(LF.M, [0, 0.4, LF.w, 0.4], 'line', 0.04);
  }
  // the name along the wall, the sign at the end
  sh.text(LF.M, st.id.toUpperCase(), LF.w / 2, st.style === 'najdi' ? 2.9 : 1.9, 1.5, 'ink', 'middle', 0.07);
  roundel(sh, EF.M, EF.w / 2, 1.8, 1.0, 0.07);
  // the concourse, glazed, hung under the tracks; the escalator tubes up to it
  F.box(sh, c0, c1, -10.5, 10.5, zc - 0.6, zu - zc + 0.6);
  const CF = F.long(vis * 10.5, c0, c1, zu), ch = zu - zc;
  sh.fill2(CF.M, 0.4, 0.4, CF.w - 0.8, ch - 0.7, 'glass', 0.03);
  for (let x = 0.4; x < CF.w - 1.2; x += 1.8) { if (rand(0, 1) < 0.5) sh.fill2(CF.M, x + 0.1, 0.6, 1.6, ch - 1.1, 'window', 0.035); sh.draw(CF.M, [x, 0.4, x, ch - 0.3], 'detail', 0.04); }
  for (const s of [-1, 1]) F.sweepV(sh, [[foot, 0], [cEnd, zc], [cEnd, zc + 2.7], [foot, 2.7]].map(([u, z]) => [u, z + (z < 1 ? CURB : 0)]), s * 9.5 - 1.0, s * 9.5 + 1.0, 'g');
  const shell = sh.build('stationShell'); g.add(shell);

  // ---- the cut: the floors and the island, walls cut low, the roof drawn as its outline ----
  const c = new Part();
  for (const s of [-1, 1]) F.box(c, U0, U1, s > 0 ? ISL : -HW, s > 0 ? HW : -ISL, zu, zd - zu);   // under the tracks
  for (const [a, bb] of [[U0, oLo], [oHi, U1]]) F.box(c, a, bb, -ISL, ISL, zu, zf - zu);          // the island
  for (const s of [-1, 1]) F.box(c, oLo, oHi, s > 0 ? 1.6 : -ISL, s > 0 ? ISL : -1.6, zu, zf - zu);  // beside the escalator's opening
  for (const s of [-1, 1]) F.box(c, U0, U1, s > 0 ? HW - 0.4 : -HW, s > 0 ? HW : -HW + 0.4, zd, 1.0);
  const hatch = (u0h: number, u1h: number, v: number, z: number) => { for (let u = u0h + 0.3; u < u1h - 0.3; u += 0.6) c.seg('detail', F.w(u, v - 0.2, z), F.w(Math.min(u1h, u + 0.4), v + 0.2, z)); };
  for (const s of [-1, 1]) hatch(U0, U1, s * (HW - 0.2), zd + 1.0);
  for (const s of [-1, 1]) for (const z of [zt]) { c.seg('detail', F.w(U0, s * HW, z), F.w(U1, s * HW, z)); }
  for (const u of [U0, U1]) c.seg('detail', F.w(u, -HW, zt), F.w(u, HW, zt));
  F.box(c, c0, c1, -10.5, 10.5, zc - 0.6, 0.6);
  for (const s of [-1, 1]) { F.box(c, c0, c1, s > 0 ? 10.2 : -10.5, s > 0 ? 10.5 : -10.2, zc, 1.0); hatch(c0, c1, s * 10.35, zc + 1.0); }
  for (const s of [-1, 1]) for (const k of [zu]) c.seg('detail', F.w(c0, s * 10.5, k), F.w(c1, s * 10.5, k));
  const cut = c.build('stationCut'); cut.visible = false; g.add(cut);

  // ---- inside: the tracks, the screen doors, benches, columns, signs; the escalators; the concourse's gates, ticket
  // machines and service desk ----
  const f = new Part();
  tracks(f, F, U0, U1, (u: number, s: number) => s * trackV(line, u), false);
  for (const s of [-1, 1]) { if (line.from > U0 - 1 && line.from < U1) buffer(f, F, line.from, s, 1); if (line.to > U0 && line.to < U1 + 1) buffer(f, F, line.to, s, -1); }
  const inside = new THREE.Group(); inside.name = 'stationInside';
  for (const s of [-1, 1]) for (const o of screenDoors(F, u0, s, zf, f)) { o.visible = true; inside.add(o); }
  for (const seat of plan.seats.filter((_, i) => i % 4 === 0)) { const uu = seat.u + 0.5;
    F.box(f, uu - 1.0, uu + 1.0, -0.6, 0.6, zf, 0.42).box(f, uu - 1.0, uu + 1.0, -0.06, 0.06, zf + 0.42, 0.5); }
  for (let u = u0 + 4.5; u < u0 + PLAT - 3; u += 8.6) if (u < oLo - 1 || u > oHi + 1) f.cylZ(F.at(u, 0)[0], F.at(u, 0)[1], zf, 0.18, zt - zf - 0.5, 8);
  for (const s of [-1, 1]) for (let u = u0 + 1; u < u0 + PLAT - 1; u += 2) F.seg(f, 'detail', F.at(u, s * (ISL - 0.6), zf + 0.02), F.at(u + 1, s * (ISL - 0.6), zf + 0.02));
  // signs over the island: the line and where its trains go, a screen of the next trains
  for (const u of [u0 + 10, u0 + PLAT - 12]) if (u < oLo - 3 || u > oHi + 3) {
    F.box(f, u - 1.8, u + 1.8, -0.06, 0.06, zf + 2.9, 0.65, 'k').box(f, u + 2.2, u + 3.4, -0.08, 0.08, zf + 2.95, 0.55, 'w');
    for (const dv of [-0.05, 0.05]) F.seg(f, 'line', F.at(u, dv, zf + 3.55), F.at(u, dv, zt - 0.4));
  }
  escalator(f, F, iFoot, iTop, -0.65, zc, zf); escalator(f, F, iFoot, iTop, 0.65, zc, zf);
  for (const s of [-1, 1]) { const v = s * 1.6; F.seg(f, 'line', F.at(oLo, v, zf + 1.0), F.at(oHi, v, zf + 1.0)); F.seg(f, 'detail', F.at(oLo, v, zf + 0.05), F.at(oHi, v, zf + 0.05)); }
  F.seg(f, 'line', F.at(e < 0 ? oHi : oLo, -1.6, zf + 1.0), F.at(e < 0 ? oHi : oLo, 1.6, zf + 1.0));
  for (const s of [-1, 1]) escalator(f, F, foot, cEnd, s * 9.5, CURB, zc, 1.4);
  // the gates across the concourse, ticket machines along its wall, the service desk, a map
  const gU = cEnd - e * 6.5;
  for (const v of [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75]) F.box(f, gU - 0.6, gU + 0.6, v - 0.12, v + 0.12, zc, 1.0).box(f, gU - 0.45, gU - 0.05, v - 0.12, v + 0.12, zc + 1.0, 0.06, 'k');
  for (const s of [-1, 1]) { F.box(f, gU - 0.15, gU + 0.15, s * 4.1, s * 9.9, zc, 1.0); }
  for (let k = 0; k < 4; k++) { const u = cEnd - e * (1.2 + k * 1.4); F.box(f, u - 0.5, u + 0.5, Math.min(vis * 9.6, vis * 10.2), Math.max(vis * 9.6, vis * 10.2), zc, 1.8);
    F.box(f, u - 0.35, u + 0.35, Math.min(vis * 9.5, vis * 9.6), Math.max(vis * 9.5, vis * 9.6), zc + 1.0, 0.6, 'w'); }
  const du = (c0 + c1) / 2; F.box(f, du - 2, du + 2, -vis * 10.2, -vis * 8.4, zc, 1.1).box(f, du - 2, du + 2, -vis * 10.2, -vis * 9.9, zc + 1.1, 1.4, 'w');
  inside.add(f.build('stationFurniture')); inside.visible = false; g.add(inside);
  // the doors in the screens, by side: two parts each, sliding apart along the line
  const doors: Record<string, THREE.Object3D> = {}; for (const o of inside.children) if (o.name.startsWith('psd')) doors[o.name] = o;
  g.userData.peek = { shell, cut, inside, box:plan.box, near:true, z:[0, zt], doors };
  return g;
}
