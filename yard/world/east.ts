import * as THREE from 'three';
import { FRONT, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { METRO, SEA_Z } from '../layout';
import { COAST_BRIDGE, DISH, EAST, GRID, L1X, LINE_EAST, MILLBROOK, OBS, OBS_ROAD, RAIL_EAST, RAIL_PORTAL, ROAD_EAST, ROAD_HW, ROAD_PATH, coastZ, gorgeC, gridH, l1Rise, landZ, natural, roadZ } from '../land';
import { Frame, buffer, deckRun, levels } from './metro';
import { beam } from '../models/works';
import { crown, pine, tree, yaw } from './ground';

// ---- the east country, built: the land, the gorge, the woods and scrub, Line 1's way out to Millbrook, the Vale Road
// and its bridges, the coast road's bridge over the gorge's mouth, and the freight line's tunnel mouth ----
type V3 = [number, number, number];
const L1 = METRO.lines[0], F = new Frame(L1), { zd: ZD } = levels(L1);
const STATION_SPAN = [MILLBROOK.u0 - 4, MILLBROOK.u0 + 62];   // Millbrook's own deck

// ---- the land: one mesh from the grid in land.ts, faceted, grid lines every 10 m by 8 m off the flat ----
function terrain(p: Part) {
  const { nx, ny, sx, sy } = GRID, P: THREE.Vector3[][] = [];
  for (let i = 0; i < nx; i++) { P[i] = []; for (let j = 0; j < ny; j++) P[i][j] = W(EAST.x0 + i * sx, EAST.y0 + j * sy, gridH(i, j)); }
  const flat = (...q: THREE.Vector3[]) => q.every(v => v.y < 0.02);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    if (flat(a, b, c)) return;
    const n = v3(0, 0, 0).crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(); if (n.y < 0) n.negate();
    // (Beacon Hill's top was levelled for the observatory: no snow lies on its pad and apron)
    const summit = Math.hypot((a.x + b.x + c.x) / 3 - OBS.c[0], (a.z + b.z + c.z) / 3 - OBS.c[1]) < OBS.r + OBS.apron;
    p.tri((a.y + b.y + c.y) / 3 > 52 && !summit ? 'snow' : n.y > 0.72 ? 'deck' : 'body', a, b, c);
  };
  // each cell split along its (i, j)–(i + 1, j + 1) diagonal, as landZ reads it
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) { const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1]; tri(a, b, c); tri(a, c, d); }
  for (let i = 0; i < nx; i += 4) for (let j = 0; j < ny - 1; j++) if (!flat(P[i][j], P[i][j + 1])) p.seg('detail', P[i][j], P[i][j + 1]);
  for (let j = 1; j < ny; j += 4) for (let i = 0; i < nx - 1; i++) if (!flat(P[i][j], P[i + 1][j])) p.seg('detail', P[i][j], P[i + 1][j]);
  // the cut face along the plate's east edge
  const E = P[nx - 1];
  for (let j = 0; j < ny - 1; j++) { const a = E[j], b = E[j + 1]; if (flat(a, b)) continue;
    p.poly('body', [W(EAST.x1, EAST.y0 + j * sy, 0), a, b, W(EAST.x1, EAST.y0 + (j + 1) * sy, 0)]); p.seg('line', a, b); }
}

// ---- Raven Gorge's floor: sand and gravel between the cliffs, the Raven Beck winding down it to the sea; the beach ----
const STREAM = (() => { const pts: number[][] = []; for (let y = EAST.y0; y <= 297; y += 3) pts.push([gorgeC(y) + 3.4 * Math.sin(y * 0.085), y]); return pts; })();
const beachZ = (y: number) => y <= 289 ? 0 : (y - 289) / 7 * SEA_Z;
function gorgeFloor(p: Part) {
  const G = TOP(0, 0, 0);
  for (let i = 1; i < STREAM.length; i++) {
    const [xa, ya] = STREAM[i - 1], [xb, yb] = STREAM[i], ca = gorgeC(ya), cb = gorgeC(yb);
    if (yb <= 279) p.poly('sand', [W(ca - 9, ya, 0.012), W(cb - 9, yb, 0.012), W(cb + 9, yb, 0.012), W(ca + 9, ya, 0.012)]);
    const w = 2.3, za = beachZ(ya) + 0.035, zb = beachZ(yb) + 0.035;
    p.poly('sea', [W(xa - w, ya, za), W(xb - w, yb, zb), W(xb + w, yb, zb), W(xa + w, ya, za)]);
    for (const s of [-1, 1]) p.seg('detail', W(xa + s * w, ya, za + 0.01), W(xb + s * w, yb, zb + 0.01));
  }
  // boulders fallen from the cliffs
  for (let k = 0; k < 46; k++) { const y = rand(-80, 236), c = gorgeC(y), x = c + rand(-8.5, 8.5) * (rand(0, 1) < 0.5 ? 1 : 0.6);
    if (Math.abs(x - (c + 3.4 * Math.sin(y * 0.085))) < 3.2) { rand(0, 1); continue; }
    p.geo(crown, new THREE.Matrix4().compose(W(x, y, 0.3), yaw(rand(0, 3)), v3(rand(0.6, 1.5), rand(0.4, 0.9), rand(0.6, 1.5)))); }
  // the beach from the woods to the east edge, shelving into the sea, the stream running out across it
  p.fill2(G, EAST.x0, 279, EAST.x1 - EAST.x0, 10, 'sand', 0.015);
  p.poly('sand', [W(EAST.x0, 289, 0.015), W(EAST.x1, 289, 0.015), W(EAST.x1, 296, SEA_Z + 0.015), W(EAST.x0, 296, SEA_Z + 0.015)]);
  for (let i = 0; i < 520; i++) { const x = rand(EAST.x0 + 1, EAST.x1 - 1), y = rand(280, 294.5); p.seg('detail', W(x, y, beachZ(y) + 0.04), W(x + 0.35, y + 0.2, beachZ(y) + 0.04)); }
}

// ---- what the trees keep off: the corridors as cut, the coast road, the beach, the gorge's floor ----
const KEEP: { x: number, y: number, r: number }[] = [];
for (const C of [LINE_EAST, ROAD_EAST, OBS_ROAD.corridor]) for (const q of C.samples) if (q.mode !== 'tunnel' && q.s % 3 === 0) KEEP.push({ x:q.x, y:q.y, r:C.flat + (q.mode === 'cut' ? 6 : 3) });
const KH = new Map<string, typeof KEEP>(); for (const k of KEEP) { const key = `${Math.floor(k.x / 20)}|${Math.floor(k.y / 20)}`; (KH.get(key) ?? KH.set(key, []).get(key)!).push(k); }
export const kept = (x: number, y: number) => {
  if (y > 254 || (x < 1070 && y > 110 && y < 152) || (Math.abs(y - RAIL_EAST.y) < 6 && x < RAIL_PORTAL + 4)) return true;
  // the observatory's summit and the radio dish's ground
  if (Math.hypot(x - OBS.c[0], y - OBS.c[1]) < OBS.r + 6 || Math.hypot(x - DISH.x, y - DISH.y) < 17) return true;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of KH.get(`${Math.floor(x / 20) + a}|${Math.floor(y / 20) + b}`) ?? []) if (Math.hypot(k.x - x, k.y - y) < k.r) return true;
  return false;
};
const slope = (x: number, y: number) => Math.hypot(landZ(x + 1, y) - landZ(x - 1, y), landZ(x, y + 1) - landZ(x, y - 1)) / 2;
// a hawthorn on the moor: a thin trunk bent by the wind, a crown spread wide and flat
function hawthorn(p: Part, x: number, y: number, s: number, z: number) {
  const top = W(x + 0.4 * s, y, z + 3.3 * s);
  p.seg('line', W(x, y, z), top).seg('line', top, W(x - 0.9 * s, y + 0.3 * s, z + 3.7 * s));
  p.geo(crown, new THREE.Matrix4().compose(W(x, y, z + 4.0 * s), yaw(rand(0, 3)), v3(2.8 * s, 0.6 * s, 2.4 * s)));
}
function trees(p: Part) {
  // the last of the woods east of Sahel, to the foot of Harrow Ridge
  for (let gx = 1003; gx < 1060; gx += 6.4) for (let gy = -1; gy < 254; gy += 6.4) {
    const x = gx + rand(-2.4, 2.4), y = gy + rand(-2.4, 2.4), s = rand(0.78, 1.2), k = rand(0, 1);
    if (kept(x, y) || k < 0.1 || landZ(x, y) > 3) continue;
    if (k < 0.55) tree(p, x, y, s, landZ(x, y)); else pine(p, x, y, s * 1.1, landZ(x, y));
  }
  // pines up the slopes, thinning with height; none on cliffs, on the snow, in the gorge or on the valley floor
  for (let gx = 1062; gx < EAST.x1 - 2; gx += 7) for (let gy = -80; gy < 236; gy += 7) {
    const x = gx + rand(-2.6, 2.6), y = gy + rand(-2.6, 2.6), s = rand(0.7, 1.12), r = rand(0, 1), z = landZ(x, y), sl = slope(x, y);
    const keep = z < 3 ? 0.04 : z < 20 ? 0.5 : z < 34 ? 0.26 : z < 46 ? 0.08 : 0;
    if (r > keep || sl > 1.15 || kept(x, y) || Math.abs(x - gorgeC(y)) < 31) continue;
    // the moor is bare: a few windswept hawthorns there instead
    if (z > 21 && z < 33 && sl < 0.25 && x > 1290 && x < 1550) { if (r < 0.1) hawthorn(p, x, y, s * 1.1, z); continue; }
    pine(p, x, y, s, z - 0.2);
  }
  // alders and willows along the beck in the gorge
  for (let y = -60; y < 270; y += 7) { const c = gorgeC(y) + 3.4 * Math.sin(y * 0.085);
    for (const sd of [-1, 1]) { const x = c + sd * rand(3.8, 7.5), yy = y + rand(-2, 2);
      if (rand(0, 1) < 0.55 && !kept(x, yy)) tree(p, x, yy, rand(0.75, 1.0), 0); } }
}

// ---- Line 1 out to Millbrook ----
// the stretches of the line by what it is doing, in u (from Port's end, which is carried on the viaduct)
const LINE_RUNS = (() => { const r = LINE_EAST.runs().map(([m, a, b]) => [m, L1X.u0 + a, Math.min(MILLBROOK.to + 3, L1X.u0 + b)] as [string, number, number]); r[0][1] = Math.min(r[0][1], 934); return r; })();
const mid = (u: number) => F.at(u, 0);
// a pier from the ground to the girder: a column, two arms up like a Y, a cap (as the town's, but standing on the land)
function pier(p: Part, u: number) {
  const c = mid(u), g = landZ(c[0], c[1]), top = ZD + l1Rise(u) - 3.8;
  if (top - g < 1.2) return;
  beam(p, [c[0], c[1], g], [c[0], c[1], top], 1.7, 'n', 2.1);
  for (const s of [-1, 1]) beam(p, F.at(u, s * 0.55, ZD - 4.0), F.at(u, s * 2.5, ZD - 2.05), 1.3, 'n');
  F.box(p, u - 0.9, u + 0.9, -2.9, 2.9, ZD - 2.25, 0.25);
}
// the arch over Raven Gorge: two ribs springing from the cliffs below the deck, rising to just under the girder,
// columns standing on them to carry the deck
function arch(p: Part, a: number, b: number) {
  const zOf = (u: number) => ZD + l1Rise(u), um = (a + b) / 2, crownZ = zOf(um) - 2.4, zs = 7;
  // where the ribs spring: the points along the line, out from the middle, where the cliff stands at their height
  const spring = (dir: number) => { let u = um; while (Math.abs(u - um) < 60) { const c = mid(u); if (landZ(c[0], c[1]) >= zs) return u; u += dir * 0.5; } return u; };
  const ua = spring(-1) - 1.5, ub = spring(1) + 1.5, half = (ub - ua) / 2, um2 = (ua + ub) / 2;
  const az = (u: number) => zs + (crownZ - zs) * (1 - ((u - um2) / half) ** 2);
  for (const v of [-2.2, 2.2]) {
    for (let u = ua; u < ub - 0.01; u += 2) { const u2 = Math.min(ub, u + 2), A = F.at(u, v, 0), B = F.at(u2, v, 0); beam(p, [A[0], A[1], az(u)], [B[0], B[1], az(u2)], 1.0, 'n', 1.4); }
    for (let u = ua + 3.5; u < ub - 3; u += 3.5) { const A = F.at(u, v, 0), top = zOf(u) - 2.0; if (top - az(u) > 0.6) beam(p, [A[0], A[1], az(u) + 0.5], [A[0], A[1], top], 0.45, 'n'); }
    // a bearing block where each rib meets the rock
    for (const u of [ua, ub]) { const A = F.at(u, v, 0); p.box(A[0] - 1.4, A[1] - 1.4, zs - 2.5, 2.8, 2.8, 2.6); }
  }
}
// a portal: a headwall across the line where it goes into the land, a mouth for the two tracks (dir +1: the tunnel
// lies ahead in u, its face looking back down the line; −1: behind, the face looking on up it)
function portalAt(p: Part, P0: (v: number, z: number) => V3, along: V3, hw: number, mh: number, top: number, bottom: number, depth = 1.0) {
  // a box in the wall's own frame: v across, z up, t into the hill (a hood as deep as depth, back to the rock)
  const slab = (v0: number, v1: number, z0: number, z1: number, t = depth) => {
    const q = [P0(v0, z0), P0(v1, z0), P0(v1, z1), P0(v0, z1)];
    p.extrude(q, [along[0] * t, along[1] * t, 0], 'n');
  };
  slab(-hw - 2.4, -hw, bottom, top); slab(hw, hw + 2.4, bottom, top); slab(-hw, hw, mh, top);
  slab(-hw - 2.8, hw + 2.8, top, top + 0.45, depth + 0.3);
  // the mouth's shoulders, and a hairline arch over it
  for (const s of [-1, 1]) p.extrude([P0(s * hw, mh), P0(s * (hw - 1.6), mh), P0(s * hw, mh - 1.6)], [along[0], along[1], 0], 'n');
  const arc: THREE.Vector3[] = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; arc.push(W(...P0(-Math.cos(a) * (hw - 0.2), mh - 1.6 + Math.sin(a) * 1.4))); }
  for (let k = 1; k < arc.length; k++) p.seg('line', arc[k - 1], arc[k]);
  // the dark of the tunnel, a little way in
  const back = (v: number, z: number) => { const q = P0(v, z); return W(q[0] + along[0] * 2.5, q[1] + along[1] * 2.5, q[2]); };
  p.poly('road', [back(-hw, bottom + 0.2), back(hw, bottom + 0.2), back(hw, mh), back(-hw, mh)]);
}
// where a tunnel's mouth goes: from the end of the tunnel on out of it (step −dir) until the land over the line has come
// down to about the line itself, so the mouth stands clear of the hill; a hood runs back from it into the rock (a cliff
// is too steep for the land's grid to cut a clean notch in)
function faceU(u: number, dir: number, z: (u: number) => number, ground: (u: number) => number) {
  for (let k = 0; k < 30; k += 0.5) { const q = u - dir * k; if (ground(q) <= z(q) + 2) return q; }
  return u;
}
function linePortal(p: Part, u0: number, dir: number) {
  const g = (q: number) => { const c = mid(q); return landZ(c[0], c[1]); };
  const u = faceU(u0, dir, q => ZD + l1Rise(q), g), a = F.at(u, 0), b = F.at(u + dir, 0), al: V3 = [b[0] - a[0], b[1] - a[1], 0];
  portalAt(p, (v, z) => F.at(u, v, z), al, 4.9, ZD + 6.4, ZD + 8.6, ZD - 2.4, Math.max(6, Math.abs(u - u0) + 2.5));
  return u;
}
function lineOut(p: Part) {
  const clip = (a: number, b: number) => [[a, Math.min(b, STATION_SPAN[0])], [Math.max(a, STATION_SPAN[1]), b]].filter(([x, y]) => y - x > 0.5);
  LINE_RUNS.forEach(([m, a, b], i) => {
    if (m === 'tunnel') {
      // its mouths: a headwall at each end, the track a few metres into the dark
      if (i > 0) { const f = linePortal(p, a, 1); deckRun(p, F, Math.min(f, a), a + 6); }
      if (i < LINE_RUNS.length - 1) { const f = linePortal(p, b, -1); deckRun(p, F, b - 6, Math.max(f, b)); }
      return;
    }
    for (const [x, y] of clip(a, b)) deckRun(p, F, x, y);
    if (m !== 'carried') return;
    const c = mid((a + b) / 2);
    if (Math.abs(c[0] - gorgeC(c[1])) < 25) { arch(p, a, b); return; }
    for (let u = a + 10; u < b - 6; u += 26) if (u < STATION_SPAN[0] - 3 || u > STATION_SPAN[1] + 3) pier(p, u);
  });
  // the end of the line past the terminus: buffer stops on both tracks
  for (const s of [-1, 1]) buffer(p, F, MILLBROOK.to, s, -1);
}

// ---- the Vale Road ----
const RP = ROAD_PATH;
const rAt = (s: number) => { const a = RP.at(s); return { x:a.x, y:a.y, h:a.h, z:roadZ(a.x, a.y) }; };
const rSide = (q: { x: number, y: number, h: number }, k: number) => [q.x - Math.sin(q.h) * k, q.y + Math.cos(q.h) * k];
const ROAD_RUNS = ROAD_EAST.runs();
const deepIn = (s: number) => ROAD_RUNS.some(([m, a, b]) => m === 'tunnel' && s > a + 9 && s < b - 9);
function roadPortal(p: Part, s0: number, dir: number) {
  const s = faceU(s0, dir, t => rAt(t).z, t => { const q = rAt(t); return landZ(q.x, q.y); });
  const q = rAt(s), al: V3 = [Math.cos(q.h) * dir, Math.sin(q.h) * dir, 0];
  portalAt(p, (v, z) => { const [x, y] = rSide(q, v); return [x, y, z]; }, al, ROAD_HW + 0.4, q.z + 5.6, q.z + 7.6, q.z - 0.6, Math.max(6, Math.abs(s - s0) + 2.5));
  // a lamp over the mouth
  const [lx, ly] = rSide(q, 0); p.box(lx - 0.6, ly - 0.6, q.z + 5.0, 1.2, 1.2, 0.25, 'l', { lines:false });
}
function suspension(p: Part, a: number, b: number) {
  // two pylons on the rims, the main cables slung between them and anchored behind, hangers down to the deck
  const ta = a - 7, tb = b + 7, A = rAt(ta), B = rAt(tb), top = Math.max(A.z, B.z) + 22, sag = (A.z + B.z) / 2 + 2.6;
  for (const T of [A, B]) {
    const g = landZ(T.x, T.y);
    for (const k of [-1, 1]) { const [x, y] = rSide(T, k * (ROAD_HW + 0.9)); beam(p, [x, y, g - 0.5], [x, y, top + 1.2], 1.4, 'n'); }
    for (const z of [T.z - 1.6, top - 2.5, top + 0.6]) { const [x0, y0] = rSide(T, -(ROAD_HW + 0.9)), [x1, y1] = rSide(T, ROAD_HW + 0.9); beam(p, [x0, y0, z], [x1, y1, z], 1.0, 'n', 1.2); }
  }
  for (const k of [-1, 1]) {
    const off = k * (ROAD_HW + 0.9), cable: THREE.Vector3[] = [];
    for (let s = a + 4; s < b - 2; s += 9) { const q = rAt(s), [x, y] = rSide(q, k * (ROAD_HW - 0.2)); p.seg('line', W(x, y, q.z), W(x, y, q.z + 4.2)).box(x - 0.3, y - 0.3, q.z + 4.2, 0.6, 0.6, 0.18, 'l'); }
    { const [x, y] = rSide(A, off); p.box(x - 0.5, y - 0.5, top + 1.2, 1.0, 1.0, 0.5, 'l'); const [x2, y2] = rSide(B, off); p.box(x2 - 0.5, y2 - 0.5, top + 1.2, 1.0, 1.0, 0.5, 'l'); }
    for (let s = ta; s <= tb + 1e-6; s += 2) { const q = rAt(s), [x, y] = rSide(q, off), t = (s - ta) / (tb - ta), z = sag + (top - sag) * (2 * t - 1) ** 2;
      cable.push(W(x, y, z)); if (s > ta + 1 && s < tb - 1) p.seg('detail', W(x, y, z), W(x, y, q.z + 0.9)); }
    for (let i = 1; i < cable.length; i++) p.seg('line', cable[i - 1], cable[i]);
    // backstays down to anchor blocks on the land behind each pylon
    for (const [s, d] of [[ta, -1], [tb, 1]] as [number, number][]) {
      const q = rAt(s), [x, y] = rSide(q, off), q2 = rAt(s + d * 26), [x2, y2] = rSide(q2, off), g = landZ(x2, y2);
      p.seg('line', W(x, y, top), W(x2, y2, g + 1.6)); p.box(x2 - 1.4, y2 - 1.4, g - 0.3, 2.8, 2.8, 2.0);
    }
  }
}
function valeRoad(p: Part) {
  const G = TOP(0, 0, 0);
  // the asphalt, its edges, the centre dashes; guard rails where the road stands over or below the land, a parapet
  // and a fascia where it is carried; deep in its tunnel there is nothing to see
  let prev: { L: number[], R: number[], z: number, q: any } | null = null;
  for (let s = 0; s <= RP.length + 1e-6; s += 2) {
    const q = rAt(s), L = rSide(q, -ROAD_HW), R = rSide(q, ROAD_HW), z = q.z + 0.04, m = ROAD_EAST.modeAt(s);
    if (prev && !deepIn(s)) {
      const z0 = prev.z;
      p.poly('glass', [W(prev.L[0], prev.L[1], z0), W(prev.R[0], prev.R[1], z0), W(R[0], R[1], z), W(L[0], L[1], z)]);
      p.seg('line', W(prev.L[0], prev.L[1], z0 + 0.01), W(L[0], L[1], z + 0.01)).seg('line', W(prev.R[0], prev.R[1], z0 + 0.01), W(R[0], R[1], z + 0.01));
      if (Math.floor(s / 2) % 3 === 0) { const c0 = rSide(prev.q, 0); p.seg('line', W(c0[0], c0[1], z0 + 0.02), W(q.x, q.y, z + 0.02)); }
      if (m === 'carried') for (const [e0, e1] of [[prev.L, L], [prev.R, R]]) {
        p.poly('body', [W(e0[0], e0[1], z0), W(e1[0], e1[1], z), W(e1[0], e1[1], z + 0.95), W(e0[0], e0[1], z0 + 0.95)]);
        p.poly('body', [W(e0[0], e0[1], z0), W(e1[0], e1[1], z), W(e1[0], e1[1], z - 1.3), W(e0[0], e0[1], z0 - 1.3)]);
        p.seg('line', W(e0[0], e0[1], z0 + 0.95), W(e1[0], e1[1], z + 0.95)).seg('line', W(e0[0], e0[1], z0 - 1.3), W(e1[0], e1[1], z - 1.3));
      } else if (m === 'cut' && Math.abs(q.z - natural(q.x, q.y)) > 1.8) for (const [e0, e1] of [[prev.L, L], [prev.R, R]]) {
        p.seg('line', W(e0[0], e0[1], z0 + 0.75), W(e1[0], e1[1], z + 0.75));
        if (Math.floor(s / 2) % 2 === 0) p.seg('detail', W(e1[0], e1[1], z), W(e1[0], e1[1], z + 0.75));
      }
    }
    prev = { L, R, z, q };
  }
  // piers under the curving viaduct, the suspension bridge over the gorge, the tunnel's mouths
  ROAD_RUNS.forEach(([m, a, b], i) => {
    if (m === 'tunnel') { roadPortal(p, a, 1); roadPortal(p, b, -1); return; }
    if (m !== 'carried') return;
    const c = rAt((a + b) / 2);
    if (Math.abs(c.x - gorgeC(c.y)) < 25) { suspension(p, a, b); return; }
    for (let s = a + 8; s < b - 4; s += 22) { const q = rAt(s), g = landZ(q.x, q.y); if (q.z - g < 2) continue;
      beam(p, [q.x, q.y, g], [q.x, q.y, q.z - 1.5], 1.5, 'n');
      const [x0, y0] = rSide(q, -ROAD_HW + 0.6), [x1, y1] = rSide(q, ROAD_HW - 0.6); beam(p, [x0, y0, q.z - 1.6], [x1, y1, q.z - 1.6], 1.1, 'n'); }
  });
  // where the boulevard narrows into it, and a sign at the start
  p.poly('glass', [W(1000, 115, 0.02), W(1032, 126.2, 0.02), W(1032, 135.8, 0.02), W(1000, 147, 0.02)]);
  p.draw(G, [1000, 115, 1032, 126.2, 1000, 147, 1032, 135.8], 'line', 0.05);
  for (const x of [1012, 1022]) p.box(x - 0.09, 150.3, 0, 0.18, 0.18, 4.6);
  const S = FRONT(1010, 150.2, 4.9);
  p.box(1010, 150, 2.4, 14, 0.2, 2.5);
  p.text(S, 'VALE ROAD', 0.5, 0.9, 0.62, 'ink', 'start', 0.06).text(S, 'BEACON HILL 1   MILLBROOK 2', 0.5, 1.9, 0.5, 'ink', 'start', 0.06);
  // hairpin boards at the turns, a lamp over each
  for (const [x, y] of [[1091.5, 31.2], [1106.5, 130.6], [1121.5, 31.2]]) { const z = landZ(x, y);
    p.box(x - 1.6, y - 0.1, z, 3.2, 0.2, 1.0, 'k').seg('line', W(x + 2.2, y, z), W(x + 2.2, y, z + 5.5)).box(x + 1.7, y - 0.3, z + 5.5, 1.0, 0.6, 0.18, 'l'); }
}

// ---- the coast road over the mouth of the gorge ----
function coastBridge(p: Part) {
  const [a, b] = COAST_BRIDGE.x, r = COAST_BRIDGE.ramp, x0 = a - r, x1 = b + r;
  for (let x = x0; x < x1 - 0.01; x += 2) {
    const xb = Math.min(x1, x + 2), za = coastZ(x) + 0.03, zb = coastZ(xb) + 0.03;
    p.poly('glass', [W(x, 260, za), W(xb, 260, zb), W(xb, 274, zb), W(x, 274, za)]);
    for (const y of [260, 274]) p.seg('line', W(x, y, za + 0.01), W(xb, y, zb + 0.01));
    if (Math.round(x) % 6 === 0) p.seg('line', W(x, 267, za + 0.02), W(x + 3, 267, coastZ(x + 3) + 0.05));
    if (x >= a - 0.5 && x < b) for (const y of [260, 274]) {
      p.poly('body', [W(x, y, za), W(xb, y, zb), W(xb, y, zb - 0.9), W(x, y, za - 0.9)]);
      p.seg('line', W(x, y, za + 1.0), W(xb, y, zb + 1.0)).seg('detail', W(x, y, za), W(x, y, za + 1.0));
    }
  }
  for (const x of [1264, 1274]) p.box(x - 0.6, 261, 0, 1.2, 12, COAST_BRIDGE.z - 0.9);
}

// ---- the freight line's tunnel into Harrow Ridge ----
function railPortal(p: Part) {
  const y = RAIL_EAST.y, x = RAIL_PORTAL;
  portalAt(p, (v, z) => [x, y + v, z], [1, 0, 0], 2.6, 5.4, 7.2, -0.4, 3);
}

export function buildEast() {
  const land = new Part(); terrain(land); gorgeFloor(land);
  const green = new Part(); trees(green);
  const line = new Part(); lineOut(line);
  const road = new Part(); valeRoad(road); coastBridge(road); railPortal(road);
  const g = new THREE.Group(); g.name = 'east';
  const parts = { land:land.build('eastLand'), green:green.build('eastGreen'), line:line.build('eastLine'), road:road.build('eastRoad') };
  g.add(...Object.values(parts));
  return { group:g, ...parts };
}
