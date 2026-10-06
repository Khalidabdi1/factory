import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { CURB, METRO } from '../layout';
import { beam } from '../models/works';
import { Frame, buffer, escalator, levels, roundel, screenDoors, trackV, tracks } from './metro';
import { datePalm } from './sahel';

// ---- Sahel Central, where the lines cross ----
// After the station Zaha Hadid's office built for Riyadh's financial district (KAFD): a long run of white lobes, low
// at the west end and rising to the east, each a pillow of shell with lenses of diamond lattice let into its sides and
// its roof. Smooth ribbons run between the lenses and braid together in the valleys between the lobes; the eaves lift
// over a recessed glass base into tall eyes at the lobes' middles and swoop down between them. Line 1 runs through it
// end to end at 12 m and comes out of the east end through a flowing white mouth; Line 2 comes in from the north at
// 21 m through another and ends on the level above Line 1. The lattice glows after dark. Under it the streets cross; a
// concourse spans the crossing at 5 m, reached by escalators at the four corners; from it escalators climb into each
// line's island, Line 2's a long one up past Line 1.
const L1 = METRO.lines[0], L2 = METRO.lines[1], S1 = L1.stations[1], S2 = L2.stations[1];
const [X0, X1, Y0, Y1] = [601, 705, 158, 242];
type V3 = [number, number, number];
const CZ = 5.0;
export const CENTRAL = { box:[X0, X1, Y0, Y1], z:CZ, main:[616, 700, 188, 222], wing:[650, 666, 162, 188], gates:[627, 687],
  // the corner escalators: ground foot, concourse top (each pair climbs toward the concourse)
  corners:[[620, 1], [694, 1], [620, -1], [694, -1]].map(([x, s]) => { const top = s > 0 ? 188 : 222, foot = top - s * (CZ - CURB) / METRO.escSlope;
    return { foot:[x, foot, CURB] as V3, top:[x, top, CZ] as V3, ground:[x, foot - s * 3, CURB] as V3, land:[x, top + s * 2, CZ] as V3 }; }),
};
// where each line's island escalators stand: Line 1's climbs east inside its island, Line 2's climbs south from the wing
const ESC1 = (() => { const z = levels(L1), u = 636; return { foot:u, top:u + (z.zf - CZ) / METRO.escSlope }; })();
const ESC2 = (() => { const z = levels(L2), u = 166; return { foot:u, top:u + (z.zf - CZ) / METRO.escSlope }; })();
export const centralEsc = { 1:ESC1, 2:ESC2 };

// ---- the shell ----
// The real building's motif: white ribbons that run the whole length as waves, in pairs out of step with each other, so
// that each pair crosses itself every so often like a braid, and between its crossings opens into an eye of lattice.
// One row of eyes runs along each side, a second over the roof, half an eye along from the first (its eyes over the
// first row's crossings). The body is a long boxy-round section, rising to the tall east end, its roof domed a little
// over the upper eyes and its sides bulging a little at the lower ones; the eaves lift over the glass base in the
// middle of each lower eye and come down at the crossings.
const PX = 3.2, EYE = 15, MZ = levels(METRO.lines[0]).zu - 1.6;   // MZ: the foot of Line 1's mouths                                       // the section's squareness; an eye's length
export const phase = (x: number) => Math.PI / 2 + (x - 640) * Math.PI / EYE;   // 0, π, 2π… at the lower row's crossings
const sm = (v: number) => { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); };
export function section(x: number) {
  const f = phase(x), s2 = Math.sin(f) ** 2, c2 = Math.cos(f) ** 2, l2 = Math.exp(-(((x - 658) / 11.5) ** 2));
  let H = 19 + 13 * sm((x - X0) / (X1 - X0)) ** 0.85 + 1.5 * c2 + 2.5 * l2;
  const e = 3.2 + 4.3 * s2 + 3.2 * Math.exp(-(((x - 640) / 9) ** 4));        // (and lifted over Najd Av)
  const ys = 225.6 + 1.6 * s2 + 9 * l2, yn = 185 - 1.6 * s2 - l2;               // (and out over the end of Line 2)
  const end = Math.min(1, (x - X0) / 8, (X1 - x) / 8), r = Math.sqrt(Math.max(0, 1 - (1 - end) ** 2));
  H = e + (H - e) * (0.88 + 0.12 * r);
  return { e, H, mid:(ys + yn) / 2, half:(ys - yn) / 2 * (0.86 + 0.14 * r), f };
}
// a point of the shell: at x, at angle th round its section (-90° the north eave, 0 the crown, 90° the south eave)
const pw = (v: number, k: number) => Math.sign(v) * Math.abs(v) ** k;
export const shellAt = (x: number, th: number): [number, number, number] => { const S = section(x);
  return [x, S.mid + S.half * pw(Math.sin(th), 2 / PX), S.e + (S.H - S.e) * Math.abs(Math.cos(th)) ** (2 / PX)]; };
export function shellZ(x: number, y: number) {
  const S = section(x), v = Math.abs(y - S.mid) / S.half; if (v >= 1) return S.e;
  return S.e + (S.H - S.e) * (1 - v ** PX) ** (1 / PX);
}
// angles round a section spaced evenly along its arc (worked out once on a unit section), and, for each, how far up
// it is from eave (0) to crown (1)
const ARC = (() => { const n = 400, th: number[] = [], len: number[] = [0];
  for (let k = 0; k <= n; k++) th.push(k / n * Math.PI / 2);
  const P = th.map(a => [Math.sin(a) ** (2 / PX), Math.cos(a) ** (2 / PX) * 0.9]);
  for (let k = 1; k <= n; k++) len.push(len[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const L = len[n], at = (f: number) => { let k = 0; while (k < n && len[k + 1] < f * L) k++; return th[k] + (th[k + 1] - th[k]) * ((f * L - len[k]) / (len[k + 1] - len[k] || 1)); };
  const half = 24, out: { th: number, q: number }[] = [];
  for (let j = -half; j <= half; j++) { const f = Math.abs(j) / half; out.push({ th:Math.sign(j) * at(f), q:1 - f }); }
  return out; })();
// The ribbons, as heights up a side (q: 0 the eave, 1 the crown) along x: two pairs of waves out of step, the lower
// pair's eyes on the side, the upper's on the roof, a quarter-wave along. The lattice fills each eye between its pair's
// ribbons (1 inside, falling off at the ribbons' edges, 0 on a ribbon or in the white between the eyes).
const WAVES = [{ c:0.365, a:0.21, ph:0 }, { c:0.785, a:0.17, ph:Math.PI / 2 }], RW = 0.03;
const ribbons = (x: number) => WAVES.flatMap(w => { const s = w.a * Math.sin(phase(x) + w.ph); return [w.c + s, w.c - s]; });
function lattice(x: number, q: number) {
  const f = phase(x); let m = -1;
  for (const w of WAVES) { const s = Math.abs(w.a * Math.sin(f + w.ph)); m = Math.max(m, Math.min(q - (w.c - s + RW), (w.c + s - RW) - q)); }
  return Math.max(0, Math.min(1, m / 0.022, (Math.min(x - X0, X1 - x) - 3) / 2));
}
const mid2 = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);
const m4 = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
function buildShell(p: Part) {
  const hole = (o: THREE.Vector3, q: THREE.Vector3[], n: THREE.Vector3, D: number) => { const lift = n.clone().multiplyScalar(0.06), sz = 0.8 * Math.sqrt(D);
    p.poly('screen', q.map(v => o.clone().add(v.clone().sub(o).multiplyScalar(sz)).add(lift))); };
  const nx = 96, xs = Array.from({ length:nx + 1 }, (_, i) => X0 + (X1 - X0) * i / nx);
  const P = xs.map(x => ARC.map(a => W(...shellAt(x, a.th))));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ARC.length - 1; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    const n = v3(0, 0, 0).crossVectors(c.clone().sub(a), d.clone().sub(b)).normalize(); if (n.y < 0) n.negate();
    const k = n.y > 0.55 ? 'deck' : 'body'; p.tri(k, a, b, c); p.tri(k, a, c, d);
    // a diamond pierced in the cell, as big as the lattice is open there: dark by day, lit after dark
    const D = lattice((xs[i] + xs[i + 1]) / 2, (ARC[j].q + ARC[j + 1].q) / 2);
    // a diamond hole in the net over the cell's middle, showing the dark inner skin by day (lit after dark)
    if (D > 0.06) hole(m4(a, b, c, d), [mid2(a, b), mid2(b, c), mid2(c, d), mid2(d, a)], n, D);
  }
  // and one over every corner between four cells: the holes at the middles and the corners together leave only thin
  // white strips between them, crossing on the diagonals, which is the net
  for (let i = 1; i < nx; i++) for (let j = 1; j < ARC.length - 1; j++) {
    const D = lattice(xs[i], ARC[j].q); if (D <= 0.06) continue;
    const o = P[i][j], n = v3(0, 0, 0).crossVectors(P[i + 1][j].clone().sub(P[i - 1][j]), P[i][j + 1].clone().sub(P[i][j - 1])).normalize(); if (n.y < 0) n.negate();
    hole(o, [mid2(o, P[i][j - 1]), mid2(o, P[i + 1][j]), mid2(o, P[i][j + 1]), mid2(o, P[i - 1][j])], n, D);
  }
  const curve = (pts: THREE.Vector3[], k = 'line') => { for (let i = 1; i < pts.length; i++) p.seg(k, pts[i - 1], pts[i]); };
  // the eaves and the crown; the ribbons' edges, each wave's two, both sides, crossing in the braid; the end rims
  const along = (th: number, k: string, lift = 0.05) => curve(xs.map(x => { const [px, py, pz] = shellAt(x, th); return W(px, py, pz + lift); }), k);
  along(-Math.PI / 2, 'line', 0); along(Math.PI / 2, 'line', 0); along(0, 'detail');
  const HA = (ARC.length - 1) / 2, thAt = (q: number) => { const f = 1 - Math.min(1, Math.max(0, q)), k = f * HA, i = Math.min(HA - 1, Math.floor(k)), a = ARC[HA + i].th, b = ARC[HA + i + 1].th; return a + (b - a) * (k - i); };
  for (let w = 0; w < 4; w++) for (const side of [-1, 1]) for (const d of [-RW, RW]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 260; k++) { const x = X0 + 2.5 + (X1 - X0 - 5) * k / 260, [px, py, pz] = shellAt(x, side * thAt(ribbons(x)[w] + d)); pts.push(W(px, py, pz + 0.07)); }
    curve(pts, 'line');
  }
  for (const [x, dx] of [[X0, 1.2], [X1, -1.2]]) {
    const A = ARC.map(a => W(...shellAt(x, a.th))), B = ARC.map(a => { const [px, py, pz] = shellAt(x + dx, a.th); return W(px, py, pz + 0.35); });
    for (let j = 1; j < A.length; j++) { p.poly('deck', [A[j - 1], A[j], B[j], B[j - 1]]); }
    curve(A); curve(B);
  }
  // the glass base under the eaves along the south side, recessed; doors where the corner escalators come in; the
  // avenue passing under it in the open
  const g0 = CURB, mull: number[] = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const xa = xs[k], xb = xs[k + 1]; if (xa < X0 + 2 || xb > X1 - 2 || (xb > 629 && xa < 651)) continue;
    const A = section(xa), B = section(xb), ya = A.mid + A.half - 1.5, yb = B.mid + B.half - 1.5, door = [620, 694].some(d => Math.abs((xa + xb) / 2 - d) < 3.4);
    p.poly(door ? 'glass' : 'window', [W(xa, ya, g0), W(xb, yb, g0), W(xb, yb, B.e - 0.15), W(xa, ya, A.e - 0.15)]);
    p.seg('line', W(xa, ya, A.e - 0.15), W(xb, yb, B.e - 0.15)).seg('line', W(xa, ya, g0), W(xb, yb, g0));
    if (k % 2 === 0) p.seg('line', W(xa, ya + 0.02, g0), W(xa, ya + 0.02, A.e - 0.15));
  }
  // the east end's glass, round the street and the line coming out under the mouth
  { const x = X1 - 1.3, S = section(x);
    for (let k = 0; k < 24; k++) { const ya = S.mid - S.half + 1.5 + k * (2 * S.half - 3) / 24, yb = ya + (2 * S.half - 3) / 24;
      const za = shellZ(x + 1.3, ya) - 0.3, zb = shellZ(x + 1.3, yb) - 0.3;
      // over the line's mouth the glass comes down only to the tube's back; over the street beside it, to the street's
      // headroom; elsewhere to the ground
      const tube = (y: number) => { const v = Math.abs(y - 205) / 7.6; return v < 1 ? MZ + 10.4 * (1 - v ** 2.6) ** (1 / 2.6) : -1; };
      const fa = Math.max(tube(ya), yb > 197 && ya < 213 ? MZ : (yb > 195.5 && ya < 214.5 ? 6 : g0)), fb = Math.max(tube(yb), fa);
      p.poly('window', [W(x, ya, fa), W(x, yb, fb), W(x, yb, zb), W(x, ya, za)]); p.seg('line', W(x + 0.02, ya, fa), W(x + 0.02, ya, za)); } }
  // Line 2's concourse wing under its mouth, glazed
  p.box(650, 162, CURB, 16, 20, 0.2, 'n');
  for (let y = 162; y < 182; y += 2) p.poly('window', [W(666, y, CURB), W(666, y + 2, CURB), W(666, y + 2, 16.6), W(666, y, 16.6)]), p.seg('line', W(666.02, y, CURB), W(666.02, y, 16.6));
}
// a mouth: the shell drawn out round a line as a tube that flares where it opens, its lip rolled, its inside dark
// (axis x or y; from u0 inside the building to u1 at the mouth; c the line's middle across; zb the tube's foot)
function mouth(p: Part, axis: 'x' | 'y', u0: number, u1: number, c: number, zb: number, a0: number, a1: number, h0: number, h1: number) {
  const n = 12, m = 18, pt = (u: number, v: number, z: number) => axis === 'x' ? W(u, c + v, z) : W(c - v, u, z);
  const ring = (u: number, a: number, h: number, inset: number) => Array.from({ length:m + 1 }, (_, k) => { const th = -Math.PI / 2 + Math.PI * k / m;
    return pt(u, (a - inset) * pw(Math.sin(th), 2 / 2.6), zb + (h - inset) * Math.abs(Math.cos(th)) ** (2 / 2.6)); });
  const R: THREE.Vector3[][] = [], I: THREE.Vector3[][] = [];
  for (let i = 0; i <= n; i++) { const f = i / n, e = f ** 2.2, u = u0 + (u1 - u0) * f, a = a0 + (a1 - a0) * e, h = h0 + (h1 - h0) * e; R.push(ring(u, a, h, 0)); I.push(ring(u, a, h, 0.8)); }
  for (let i = 0; i < n; i++) for (let k = 0; k < m; k++) {
    const q = [R[i][k], R[i + 1][k], R[i + 1][k + 1], R[i][k + 1]], nrm = v3(0, 0, 0).crossVectors(q[2].clone().sub(q[0]), q[3].clone().sub(q[1])).normalize();
    p.poly(Math.abs(nrm.y) > 0.55 ? 'deck' : 'body', q); p.poly('glass', [I[i][k], I[i + 1][k], I[i + 1][k + 1], I[i][k + 1]]);
  }
  for (let k = 0; k < m; k++) p.poly('deck', [R[n][k], R[n][k + 1], I[n][k + 1], I[n][k]]);
  for (let k = 1; k <= m; k++) p.seg('line', R[n][k - 1], R[n][k]).seg('line', I[n][k - 1], I[n][k]);
  for (const k of [0, m]) for (let i = 1; i <= n; i++) p.seg('line', R[i - 1][k], R[i][k]);
  p.poly('glass', I[0]);   // the dark inside, where the tube meets the building
}

// ---- the levels inside, the islands, escalators, gates; the trees that hold the shell up ----
export function buildCentral() {
  const g = new THREE.Group(); g.name = 'Sahel Central';
  const F1 = new Frame(L1), F2 = new Frame(L2), z1 = levels(L1), z2 = levels(L2), ISL = METRO.island;
  // ---- always there: the tree columns, piers in Souq St's middle, the skybridge to Souq Sahel, the signs ----
  const b = new Part();
  const treeCol = (x: number, y: number, zTop: number) => {
    b.cylZ(x, y, CURB, 0.75, 7.5, 10);
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const tx = x + ax * 5.5, ty = y + ay * 5.5; beam(b, [x, y, CURB + 7.3], [tx, ty, Math.min(zTop, shellZ(tx, ty)) - 0.3], 0.55, 'n'); }
  };
  for (const [x, y] of [[626, 194], [690, 194], [626, 216], [690, 216]]) treeCol(x, y, 40);
  for (const [x, y] of [[650, 170], [666, 170], [650, 224], [666, 224]]) { b.box(x - 0.8, y - 0.8, CURB, 1.6, 1.6, z2.zu - CURB - 0.2); }
  for (const x of [618, 698]) F1.box(b, x - 0.8, x + 0.8, -1.1, 1.1, 0, z1.zu - 0.2);
  b.box(700, 178, CZ + 0.4, 9, 4, 2.8, 'g').box(700, 178, CZ + 3.2, 9, 4, 0.25);   // the skybridge into Souq Sahel's upper floor
  for (const c of CENTRAL.corners) { const [x, y] = c.ground; b.box(x + 3.2, y - 0.15, CURB, 0.3, 0.3, 3.6).box(x + 2.85, y - 0.1, CURB + 3.6, 1.0, 0.1, 1.0, 'k'); }
  for (const x of [611, 681]) { b.box(x - 0.4, 238.6, CURB, 0.8, 0.5, 4.6, 'n'); const sign = FRONT(x - 4, 239.12, 4.6);
    b.box(x - 4, 238.6, CURB + 3.2, 8, 0.5, 1.4, 'n').text(sign, 'SAHEL CENTRAL', 4.6, 0.95, 0.62, 'ink', 'middle', 0.04); roundel(b, sign, 0.75, 0.7, 0.5, 0.04); }
  for (let x = 604; x < 703; x += 7.2) if (x < 627 || x > 653) { if (Math.abs(x - 620) > 4 && Math.abs(x - 694) > 4) datePalm(b, x, 243.5, 0.9, CURB); }
  for (const [a, bb] of [[603, 627], [653, 703]]) b.box(a, 245.6, CURB, bb - a, 0.35, 0.5, 'n');
  g.add(b.build('centralBase'));
  // ---- the shell ----
  const sh = new Part(); buildShell(sh);
  mouth(sh, 'x', X1 - 3, X1 + 11, 205, MZ, 7.6, 8.8, 10.4, 11.6);    // Line 1 out to the east
  mouth(sh, 'x', X0 + 3, X0 - 11, 205, MZ, 7.6, 8.8, 10.4, 11.6);    // and in from the west
  mouth(sh, 'y', 185, 159, 658, z2.zu - 1.6, 7.4, 8.6, 10.2, 11.4);           // Line 2 in from the north
  const shell = sh.build('centralShell'); g.add(shell);
  // ---- the cut: the floors, the islands, low walls round the concourse, the shell as its edge only ----
  const c = new Part();
  const [mx0, mx1, my0, my1] = CENTRAL.main, [wx0, wx1, wy0, wy1] = CENTRAL.wing;
  c.box(mx0, my0, CZ - 0.6, mx1 - mx0, my1 - my0, 0.6).box(wx0, wy0, CZ - 0.6, wx1 - wx0, wy1 - wy0, 0.6);
  for (const [x0, y0, w, d] of [[mx0, my0, 0.3, my1 - my0], [mx1 - 0.3, my0, 0.3, my1 - my0], [mx0, my1 - 0.3, mx1 - mx0, 0.3], [mx0, my0, wx0 - mx0, 0.3], [wx1, my0, mx1 - wx1, 0.3],
    [wx0, wy0, 0.3, wy1 - wy0], [wx1 - 0.3, wy0, 0.3, wy1 - wy0]]) c.box(x0, y0, CZ, w, d, 1.0);
  // Line 1 through the station: decks under its tracks, its island pierced for the escalators
  const o1 = [Math.min(ESC1.foot, ESC1.top) - 0.3, Math.max(ESC1.foot, ESC1.top) + 0.3];
  for (const s of [-1, 1]) F1.box(c, 612, 704, s > 0 ? ISL : -7.6, s > 0 ? 7.6 : -ISL, z1.zu, z1.zd - z1.zu);
  for (const [a, bb] of [[612, o1[0]], [o1[1], 704]]) F1.box(c, a, bb, -ISL, ISL, z1.zu, z1.zf - z1.zu);
  for (const s of [-1, 1]) F1.box(c, o1[0], o1[1], s > 0 ? 1.6 : -ISL, s > 0 ? ISL : -1.6, z1.zu, z1.zf - z1.zu);
  // Line 2 on its level above: the same, and its long escalator coming up through its island from the wing
  const o2 = [Math.max(S2.u0 - 4, Math.min(ESC2.foot, ESC2.top) - 0.3), Math.max(ESC2.foot, ESC2.top) + 0.3];
  for (const s of [-1, 1]) F2.box(c, 160, 230, s > 0 ? ISL : -7.6, s > 0 ? 7.6 : -ISL, z2.zu, z2.zd - z2.zu);
  for (const [a, bb] of [[160, o2[0]], [o2[1], 230]]) if (bb > a) F2.box(c, a, bb, -ISL, ISL, z2.zu, z2.zf - z2.zu);
  for (const s of [-1, 1]) F2.box(c, o2[0], o2[1], s > 0 ? 1.6 : -ISL, s > 0 ? ISL : -1.6, z2.zu, z2.zf - z2.zu);
  for (const s of [-1, 1]) { F1.box(c, 612, 704, s > 0 ? 7.2 : -7.6, s > 0 ? 7.6 : -7.2, z1.zd, 1.0); F2.box(c, 160, 230, s > 0 ? 7.2 : -7.6, s > 0 ? 7.6 : -7.2, z2.zd, 1.0); }
  // the shell in outline: its eaves, its crown, the valleys' folds and the ends, so its shape stays readable
  { const xs = Array.from({ length:53 }, (_, i) => X0 + (X1 - X0) * i / 52), line = (pts: number[][]) => { for (let i = 1; i < pts.length; i++) c.seg('line', W(...pts[i - 1] as [number, number, number]), W(...pts[i] as [number, number, number])); };
    for (const th of [-Math.PI / 2, 0, Math.PI / 2]) line(xs.map(x => shellAt(x, th)));
    for (let x = 602.5; x < X1; x += EYE) line(ARC.map(a => shellAt(x, a.th))); line(ARC.map(a => shellAt(X0, a.th))); line(ARC.map(a => shellAt(X1, a.th))); }
  const cut = c.build('centralCut'); cut.visible = false; g.add(cut);
  // ---- inside ----
  const f = new Part(), inside = new THREE.Group(); inside.name = 'centralInside';
  tracks(f, F1, 612, 704, (u: number, s: number) => s * trackV(L1, u), false);
  tracks(f, F2, 160, 230, (u: number, s: number) => s * trackV(L2, u), false);
  for (const s of [-1, 1]) buffer(f, F2, L2.to, s, -1);
  for (const [F, st, zf] of [[F1, S1, z1.zf], [F2, S2, z2.zf]] as [Frame, typeof S1, number][]) for (const s of [-1, 1]) for (const o of screenDoors(F, st.u0, s, zf, f)) inside.add(o);
  // escalators: the corners, Line 1's pair, Line 2's long pair
  for (const cn of CENTRAL.corners) { const [x, yf] = cn.foot, yt = cn.top[1];
    for (const dx of [-0.75, 0.75]) escalator(f, new Frame({ ...L2, at:x + dx } as any), yf, yt, 0, CURB, CZ, 1.2); }
  for (const v of [-0.65, 0.65]) { escalator(f, F1, ESC1.foot, ESC1.top, v, CZ, z1.zf); escalator(f, F2, ESC2.foot, ESC2.top, v, CZ, z2.zf); }
  // gates across the concourse either side of the paid hall; ticket machines and a service desk outside them
  for (const gx of CENTRAL.gates) { for (let y = 191; y < 221; y += 1.5) if (Math.abs(y - 205) > 1) f.box(gx - 0.6, y - 0.12, CZ, 1.2, 0.24, 1.0).box(gx - 0.45, y - 0.12, CZ + 1.0, 0.4, 0.24, 0.06, 'k');
    for (const yy of [190, 220]) f.box(gx - 0.15, Math.min(yy, 205), CZ, 0.3, 0.3, 1.0); }
  for (let k = 0; k < 5; k++) { const x = 690.5 + k * 1.6; f.box(x - 0.5, 220.4, CZ, 1.0, 0.6, 1.8).box(x - 0.35, 221.0, CZ + 1.0, 0.7, 0.05, 0.6, 'w'); }
  f.box(617, 196, CZ, 4, 1.4, 1.1).box(617, 196, CZ + 1.1, 4, 0.2, 1.4, 'w');
  // a café and a kiosk in the paid hall, tables by them; the departures board hung over the hall
  f.box(668, 213, CZ, 7, 4, 2.8).box(667.6, 212.6, CZ + 2.8, 7.8, 4.8, 0.2, 'k').fill2(FRONT(668, 217, CZ + 2.8), 0.4, 0.6, 6.2, 1.4, 'window', 0.03);
  for (const [x, y] of [[670, 219.5], [673, 219.5], [676, 219.2]]) f.cylZ(x, y, CZ, 0.45, 0.75, 8).cylZ(x, y, CZ + 0.75, 0.05, 0.02, 4);
  f.box(640, 216.5, CZ, 3, 2.4, 2.4).fill2(FRONT(640, 218.9, CZ + 2.4), 0.3, 0.4, 2.4, 1.2, 'window', 0.03);
  f.box(651, 214.6, CZ + 3.2, 8, 0.2, 1.3, 'k').box(651.4, 214.55, CZ + 3.4, 7.2, 0.05, 0.9, 'w');
  for (const dx of [652, 658]) f.seg('line', W(dx, 214.7, CZ + 4.5), W(dx, 214.7, z1.zu));
  // the islands: benches back to back, columns, signs and screens
  const furnish = (F: Frame, u0: number, zf: number, zt: number, o: number[]) => {
    for (let u = u0 + 6; u < u0 + 54; u += 13) if (u < o[0] - 2 || u > o[1] + 2) F.box(f, u - 1.0, u + 1.0, -0.6, 0.6, zf, 0.42).box(f, u - 1.0, u + 1.0, -0.06, 0.06, zf + 0.42, 0.5);
    for (let u = u0 + 4.5; u < u0 + 55; u += 8.6) if (u < o[0] - 1 || u > o[1] + 1) f.cylZ(F.at(u, 0)[0], F.at(u, 0)[1], zf, 0.16, zt - zf, 8);
    for (const u of [u0 + 22, u0 + 50]) if (u < o[0] - 3 || u > o[1] + 3) F.box(f, u - 1.8, u + 1.8, -0.06, 0.06, zf + 2.9, 0.65, 'k').box(f, u + 2.2, u + 3.4, -0.08, 0.08, zf + 2.95, 0.55, 'w');
    for (const s of [-1, 1]) for (let u = u0 + 1; u < u0 + 57; u += 2) F.seg(f, 'detail', F.at(u, s * (ISL - 0.6), zf + 0.02), F.at(u + 1, s * (ISL - 0.6), zf + 0.02));
    for (const s of [-1, 1]) F.seg(f, 'line', F.at(o[0], s * 1.6, zf + 1.0), F.at(o[1], s * 1.6, zf + 1.0));
  };
  furnish(F1, S1.u0, z1.zf, z1.zf + 3.4, o1); furnish(F2, S2.u0, z2.zf, z2.zf + 4.6, o2);
  inside.add(f.build('centralFurniture')); inside.visible = false; g.add(inside);
  const doors: Record<string, THREE.Object3D> = {};
  // the screen doors' leaves, named by line and side: L1psd−1F and so on
  inside.children.forEach((o, k) => { if (o.name.startsWith('psd')) doors[`L${k < 4 ? 1 : 2}${o.name}`] = o; });
  g.userData.peek = { shell, cut, inside, box:[X0, X1, Y0, Y1], near:true, z:[0, 34], doors };
  return g;
}
