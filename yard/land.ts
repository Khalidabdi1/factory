import { Path } from './kernel/path';
import { ease } from './kernel/math';

// ---- the land east of Sahel ----
// Past the woods east of the city the ground rises to Harrow Ridge, a ridge running down from the mountains almost to
// the coast. Beyond it the Raven Beck has cut a gorge from the mountains to the sea; east of the gorge lies the plateau of
// High Moor, Beacon Hill standing up out of it, then a second ridge, and below that Millbrook Vale, a valley of farms
// opening south to the coast. Line 1 of the metro runs out to the valley (over the woods, through Harrow Ridge, over the
// gorge on an arch, across the plateau, through the second ridge and down a viaduct to the village), the Vale Road
// climbs the ridge's west face in hairpins, crosses the gorge on a suspension bridge and drops into the valley, and
// the freight line comes out of the ridge in a tunnel.
//
// This module is plain arithmetic: heights, the corridors and how they are cut through the land. The builders in
// world/east*.ts draw it, layout's zAt reads it, and the metro, the traffic and the train follow its lines.
export const EAST = { x0:1000, x1:1900, y0:-84, y1:244, step:[5, 4] as [number, number],
  gorge:{ half:10, rim:[29, 25] }, saddle:{ y:96, depth:11 }, qamar:[1440, 45] as [number, number] };
const ss = (a: number, b: number, v: number) => { const t = (v - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : ease(t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// the hills along the north edge of the plate: a ridge of peaks, its foot at y −4 (the old town's Grey Peaks, the lower
// Sahel hills behind the city, and the mountains east of it, higher again)
const PEAKS = [[-42, 26], [30, 30], [95, 44], [160, 33], [228, 48], [300, 38], [362, 46], [425, 34], [496, 28], [574, 24], [652, 32], [738, 27], [818, 36], [898, 30], [978, 38],
  [1062, 44], [1132, 52], [1210, 58], [1296, 50], [1364, 62], [1446, 66], [1522, 56], [1604, 64], [1684, 70], [1766, 60], [1842, 68], [1904, 58]];
export function hillNatural(x: number, y: number, t: number) {
  const ridge = Math.max(...PEAKS.map(([px, ph]) => ph * Math.exp(-(((x - px) / 34) ** 2)))) + 7;
  const s = t < 0.72 ? ease(t / 0.72) : 1 - 0.3 * (t - 0.72) / 0.28;
  return Math.max(0, ridge * s + (2.4 * Math.sin(x * 0.19 + y * 0.31) + 1.8 * Math.sin(x * 0.07 - y * 0.23)) * Math.min(1, t * 2));
}
// the middle of the gorge, which wanders a little
export const gorgeC = (y: number) => 1272 + 6 * Math.sin(y * 0.02);

// the land as it lies, before anything is cut through it
export function natural(x: number, y: number) {
  const t = (-4 - y) / 80, band = t > 0 ? hillNatural(x, y, t) : 0;
  // Harrow Ridge: a long west face, a broad back with a saddle where the road crosses, a bluff over the coast
  const hy = y <= 60 ? 44 : y <= 150 ? 44 - 6 * (y - 60) / 90 : y <= 190 ? 38 - 6 * (y - 150) / 40 : 32 * (1 - ss(190, 238, y));
  const sad = EAST.saddle.depth * Math.exp(-(((y - EAST.saddle.y) / 22) ** 2)) * ss(1140, 1165, x);
  const r1 = Math.max(0, hy * ss(1060, 1165, x) - sad) * (1 - ss(1262, 1280, x));
  // High Moor, a table of land 26 m up, gently rolling, Beacon Hill standing on it
  const und = 1.6 * Math.sin(x * 0.045 + 1.3) * Math.sin(y * 0.05);
  const dq = Math.hypot(x - EAST.qamar[0], (y - EAST.qamar[1]) * 1.15), qamar = 30 * Math.max(0, 1 - (dq / 58) ** 2) ** 1.4;
  const pl = 26 * (1 - ss(186, 232, y)) * ss(1262, 1282, x) * (1 - ss(1548, 1564, x)), plat = pl > 0 ? pl + (und + qamar) * Math.min(1, pl / 26) : 0;
  // the second ridge, its east face falling into Millbrook Vale
  const ry = 42 * (1 - ss(150, 232, y)), r2 = ry * (x < 1556 ? ss(1500, 1556, x) : 1 - ss(1556, 1622, x));
  // low hills at the east edge, north of the coast
  const eh = 34 * ss(1840, 1900, x) * (1 - ss(110, 170, y));
  let east = Math.max(r1, plat, r2, eh);
  if (east > 1) east += (1.3 * Math.sin(x * 0.11 + y * 0.07) + 1.0 * Math.sin(x * 0.05 - y * 0.13)) * Math.min(1, (east - 1) / 6);
  // Raven Gorge cuts through all of it, down to its floor
  const c = gorgeC(y), g = x < c ? 1 - ss(c - EAST.gorge.rim[0], c - EAST.gorge.half, x) : ss(c + EAST.gorge.half, c + EAST.gorge.rim[1], x);
  return Math.max(0, Math.max(band, east) * g);
}

// ---- lines through the land: a filleted plan, a height along it, and what the land does about it ----
// A corridor is sampled every metre: where it lies under more than `tunnel` metres of land it goes through in a
// tunnel; where it stands more than `above` metres over the land it is carried (a viaduct, a bridge); anywhere else
// the land is cut down or built up to it: flat `flat` metres either side of it, easing back to the land as it lies
// beyond that at a slope of one in one.
type Mode = 'tunnel' | 'carried' | 'cut';
export type Sample = { s: number, x: number, y: number, h: number, z: number, n: number, mode: Mode };
export class Corridor {
  name: string; path: Path; samples: Sample[] = []; flat: number; bed: number;
  constructor(name: string, path: Path, zAt: (s: number) => number, o: { tunnel: number, above: number, flat: number, bed?: number, from?: number, to?: number }) {
    this.name = name; this.path = path; this.flat = o.flat; this.bed = o.bed ?? 0;
    const s0 = o.from ?? 0, s1 = o.to ?? path.length;
    for (let s = s0; s <= s1; s += 1) { const p = path.at(s), z = zAt(s), n = natural(p.x, p.y);
      this.samples.push({ s, x:p.x, y:p.y, h:p.h, z, n, mode:n - z > o.tunnel ? 'tunnel' : z - n > o.above ? 'carried' : 'cut' }); }
    // runs shorter than a few metres are noise in the land: they take the mode either side of them
    const S = this.samples;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < S.length;) {
      let j = i; while (j < S.length && S[j].mode === S[i].mode) j++;
      if (j - i < 8 && i > 0 && j < S.length && S[i - 1].mode === S[j].mode) for (let k = i; k < j; k++) S[k].mode = S[i - 1].mode;
      i = j;
    }
  }
  // the stretches of each mode, in order: [mode, from s, to s]
  runs() { const out: [Mode, number, number][] = []; for (const q of this.samples) { const r = out[out.length - 1]; if (r && r[0] === q.mode) r[2] = q.s; else out.push([q.mode, q.s, q.s]); } return out; }
  modeAt(s: number) { const S = this.samples, i = Math.max(0, Math.min(S.length - 1, Math.round(s - S[0].s))); return S[i].mode; }
}

// ---- Line 1 out to Millbrook ----
// The line runs on east from Port (u 932) along the viaduct, swings north-east over the woods into Harrow Ridge, comes
// out of the ridge's east cliff onto an arch over the gorge, crosses High Moor in a shallow cutting, tunnels through the
// second ridge and comes down a viaduct to the terminus, which stands level on a straight along y 120. Its deck climbs
// at about 1 in 21 from the woods to the gorge, and comes down as steeply into the valley.
export const L1X = { u0:932, path:new Path([[932, 205], [1030, 205], [1120, 165], [1300, 165], [1460, 165], [1560, 120], [1660, 120], [1846, 120]], 120) };
const ux = (x: number, y: number) => L1X.u0 + L1X.path.project(x, y);
export const MILLBROOK = { u0:Math.round(ux(1758, 120)), xo:[Math.round(ux(1712, 120)), Math.round(ux(1732, 120))], to:Math.round(ux(1830, 120)) };
const RISE = 12.5, PROF: [number, number][] = [[ux(1000, 205), 0], [ux(1252, 165), RISE], [ux(1462, 165), RISE], [ux(1696, 120), 0]];
// the deck's rise over the town's viaduct height (10.5), every metre, eased round the changes of grade
const profAt = (u: number) => { if (u <= PROF[0][0]) return 0;
  for (let i = 1; i < PROF.length; i++) { const [a, za] = PROF[i - 1], [b, zb] = PROF[i]; if (u <= b) return lerp(za, zb, (u - a) / (b - a)); }
  return PROF[PROF.length - 1][1]; };
const DZ = (() => { const n = Math.ceil(MILLBROOK.to + 60), out = new Float32Array(n);
  for (let u = 0; u < n; u++) { let s = 0; for (let d = -15; d <= 15; d++) s += profAt(u + d); out[u] = s / 31; }
  return out; })();
export const l1Rise = (u: number) => { if (u <= PROF[0][0] - 16) return 0; const i = Math.max(0, Math.min(DZ.length - 2, Math.floor(u))), f = u - i; return lerp(DZ[i], DZ[i + 1], Math.max(0, Math.min(1, f))); };
export const L1_DECK = 10.5;
export const LINE_EAST = new Corridor('Line 1', L1X.path, s => L1_DECK + l1Rise(L1X.u0 + s), { tunnel:7, above:2.5, flat:8.5, bed:0.1, from:60, to:MILLBROOK.to + 14 - L1X.u0 });

// ---- the Vale Road ----
// On from the end of Sahel Blvd: four hairpins up Harrow Ridge's west face, over the saddle and straight onto a
// suspension bridge across the gorge, along the plateau past the turning for Beacon Hill, through the second ridge,
// round and down a curving viaduct into Millbrook Vale, through the village and off east. Points are (x, y, height).
export const ROAD_PTS: [number, number, number][] = [[1000, 131, 0], [1040, 131, 0], [1076, 126, 1.0], [1084, 44, 6.6],
  [1084, 36, 7.1], [1099, 36, 7.6], [1099, 118, 13.4], [1099, 126, 13.9], [1114, 126, 14.4], [1114, 44, 20.2], [1114, 36, 20.7], [1129, 36, 21.2], [1129, 106, 26.4],
  [1140, 112, 27.4], [1172, 100, 29.6], [1214, 94, 30.6], [1252, 90, 31.0], [1304, 86, 29.2], [1380, 84, 27.6], [1470, 80, 27.4], [1514, 78, 27.8], [1582, 76, 22.6],
  [1640, 48, 17.0], [1700, 34, 12.0], [1748, 64, 7.6], [1754, 112, 3.6], [1756, 156, 0.4], [1790, 172, 0], [1908, 176, 0]];
export const ROAD_HW = 4.6, LANE = 1.75;
// a height along a polyline of (x, y, z): the z of the nearest point on it
export function zAlong(pts: number[][]) {
  return (x: number, y: number) => {
    let best = Infinity, z = 0;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
      if (d < best) { best = d; z = lerp(a[2], b[2], t); } }
    return z;
  };
}
export const roadZ = zAlong(ROAD_PTS);
export const ROAD_PATH = new Path(ROAD_PTS.map(([x, y]) => [x, y]), 9);
export const ROAD_EAST = new Corridor('Vale Road', ROAD_PATH, s => { const p = ROAD_PATH.at(s); return roadZ(p.x, p.y); }, { tunnel:12, above:6, flat:8, bed:0.05 });
// a lane of it: the centre line moved d to the right of the way it is driven (the points in driving order)
export function offsetLine(pts: number[][], d: number) {
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], h0 = Math.atan2(p[1] - a[1], p[0] - a[0]), h1 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    const ha = i === 0 ? h1 : i === pts.length - 1 ? h0 : Math.atan2(Math.sin(h0) + Math.sin(h1), Math.cos(h0) + Math.cos(h1)), k = d / Math.max(0.35, Math.cos((h1 - h0) / 2));
    return [p[0] - Math.sin(ha) * k, p[1] + Math.cos(ha) * k]; });
}

// ---- the coast road over the mouth of Raven Gorge: a low bridge, ramps either side ----
export const COAST_BRIDGE = { x:[1252, 1286], ramp:16, z:1.6 };
export const coastZ = (x: number) => { const [a, b] = COAST_BRIDGE.x, r = COAST_BRIDGE.ramp; return x < a - r || x > b + r ? 0 : x < a ? COAST_BRIDGE.z * ease((x - a + r) / r) : x > b ? COAST_BRIDGE.z * ease((b + r - x) / r) : COAST_BRIDGE.z; };

// ---- the freight line, out of Harrow Ridge ----
export const RAIL_EAST = { y:-1.5, from:1186 };
export const RAIL_CUT = new Corridor('freight line', new Path([[1000, RAIL_EAST.y], [RAIL_EAST.from, RAIL_EAST.y]], 1), () => 0, { tunnel:8, above:99, flat:6, bed:0 });
export const RAIL_PORTAL = 1000 + RAIL_CUT.runs().find(r => r[0] === 'tunnel')![1];

// ---- the land as cut: a grid of heights, read back between its points ----
const [SX, SY] = EAST.step, NX = Math.round((EAST.x1 - EAST.x0) / SX) + 1, NY = Math.round((EAST.y1 - EAST.y0) / SY) + 1;
export const GRID = { nx:NX, ny:NY, sx:SX, sy:SY, h:new Float32Array(NX * NY) };
(() => {
  const H = GRID.h;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) H[j * NX + i] = natural(EAST.x0 + i * SX, EAST.y0 + j * SY);
  // along the seam with the old hills (x 1000) heights follow the old mesh, whose rows fall every 8 m
  for (let j = 0; j < NY; j++) { const y = EAST.y0 + j * SY, k = Math.floor((y - EAST.y0) / 8), y0 = EAST.y0 + k * 8;
    if (y < -4) H[j * NX] = lerp(natural(EAST.x0, y0), natural(EAST.x0, Math.min(-4, y0 + 8)), (y - y0) / 8); }
  // cut each corridor through it: the road, then the line, then the freight line
  for (const C of [ROAD_EAST, LINE_EAST, RAIL_CUT]) {
    const cell = 12, hash = new Map<string, Sample[]>();
    for (const q of C.samples) { const k = `${Math.floor(q.x / cell)}|${Math.floor(q.y / cell)}`; (hash.get(k) ?? hash.set(k, []).get(k)!).push(q); }
    const reach = C.flat + 20;
    for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) {
      const x = EAST.x0 + i * SX, y = EAST.y0 + j * SY; let best: Sample | null = null, bd = reach;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const q of hash.get(`${Math.floor(x / cell) + a}|${Math.floor(y / cell) + b}`) ?? []) {
        const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q; } }
      if (!best || best.mode !== 'cut') continue;
      const z = best.z - C.bed, h = H[j * NX + i], B = Math.min(18, 2 + Math.abs(h - z));
      if (bd < C.flat) H[j * NX + i] = Math.max(0, z); else if (bd < C.flat + B) H[j * NX + i] = Math.max(0, lerp(z, h, ss(C.flat, C.flat + B, bd)));
    }
  }
})();
// the height of the land at (x, y), east of x0 (0 beyond its grid): on the mesh's own faces, each cell split along
// its diagonal from (i, j) to (i + 1, j + 1)
export function landZ(x: number, y: number) {
  if (x < EAST.x0 || x > EAST.x1 || y < EAST.y0 || y > EAST.y1) return 0;
  const fx = (x - EAST.x0) / SX, fy = (y - EAST.y0) / SY, i = Math.min(NX - 2, Math.floor(fx)), j = Math.min(NY - 2, Math.floor(fy)), u = fx - i, v = fy - j, H = GRID.h;
  const a = H[j * NX + i], b = H[j * NX + i + 1], c = H[(j + 1) * NX + i + 1], d = H[(j + 1) * NX + i];
  return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
}
export const gridH = (i: number, j: number) => GRID.h[j * NX + i];
