import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { beam } from '../models/works';

// ---- Millbrook tiltyard ----
// On the common east of the Plough, between the Vale Road and the shore: a ground fenced with a palisade, a gate from
// the village lane at its west end, and in it the lists: a field of sand inside a low rail, the tilt down its middle (a
// barrier of posts and rails hung with cloth in stripes) and an opening at each end where the knights come in. On the
// north side the royal stand faces the tilt: a raised gallery of benches under a canopy with a scalloped valance, the
// lord's and lady's chairs in the middle, banners over it and hangings in stripes along its front; at its east end the
// board where the herald keeps the score, a cheque of the courses. At the four corners of the ground the knights'
// pavilions, round tents in gores of two colours with a pennant on top; at each end of the lists a rack of lances; by the
// gate a quintain for practice; banners along the south rail, where the village stands to watch.
export const JOUST = { ground:[1846, 1940, 188, 252], lists:[1854, 1934, 206, 232], tilt:{ y:219, x0:1864, x1:1924 }, lanes:{ east:220.8, west:217.2 },
  ends:[1857.5, 1930.5], stand:[1872, 1916, 190, 203], gate:[1846, 206], board:[1918, 1928, 196, 200],
  tents:[[1851.5, 196], [1851.5, 244], [1934.5, 196], [1934.5, 244]] as number[][], racks:[[1856, 233.5], [1932, 204.5]] as number[][], quintain:[1862, 244] };
export function buildJoust() {
  const g = new THREE.Group(); g.name = 'tiltyard';
  const p = new Part(), G = TOP(0, 0, 0);
  const [GX0, GX1, GY0, GY1] = JOUST.ground, [LX0, LX1, LY0, LY1] = JOUST.lists, { y:TY, x0:TX0, x1:TX1 } = JOUST.tilt;
  p.fill2(TOP(0, 0, 0.012), GX0, GY0, GX1 - GX0, GY1 - GY0, 'grass', 0);
  p.fill2(TOP(0, 0, 0.02), LX0, LY0, LX1 - LX0, LY1 - LY0, 'sand', 0);
  for (let i = 0; i < 360; i++) { const x = rand(LX0 + 0.5, LX1 - 0.5), y = rand(LY0 + 0.5, LY1 - 0.5); p.seg('detail', W(x, y, 0.04), W(x + 0.3, y + 0.15, 0.04)); }
  // the hoof-beaten lanes either side of the tilt
  for (const y of [JOUST.lanes.east, JOUST.lanes.west]) for (const d of [-0.6, 0.6]) p.draw(G, [TX0 - 4, y + d, TX1 + 4, y + d], 'detail', 0.05);
  // the palisade round the ground, a gate in its west side with an arch and two banners
  const pal = (x1: number, y1: number, x2: number, y2: number) => { const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 1.2));
    for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; p.box(x - 0.1, y - 0.1, 0, 0.2, 0.2, 1.8); p.seg('line', W(x, y, 1.8), W(x, y, 2.0)); }
    for (const h of [0.5, 1.5]) p.seg('line', W(x1, y1, h), W(x2, y2, h)); };
  pal(GX0, GY0, GX1, GY0); pal(GX1, GY0, GX1, GY1); pal(GX0, GY1, GX1, GY1); pal(GX0, GY0, GX0, 203.5); pal(GX0, 208.5, GX0, GY1);
  for (const y of [203.5, 208.5]) { p.box(GX0 - 0.2, y - 0.2, 0, 0.4, 0.4, 4.6); p.seg('line', W(GX0, y, 4.6), W(GX0, y, 6.4)); p.fill2(FRONT(GX0, y, 6.3), 0.05, 0, 1.1, 1.6, 'kob', 0.02); }
  p.box(GX0 - 0.25, 203.3, 4.6, 0.5, 5.4, 0.5).text(SIDE(GX0 + 0.26, 208.6, 5.05), 'MILLBROOK TOURNEY', 2.6, 0.36, 0.3, 'ink', 'middle', 0.02);
  // the lists' rail, open at the ends where the knights ride in
  const rail = (x1: number, y1: number, x2: number, y2: number) => { const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 3));
    for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; p.box(x - 0.08, y - 0.08, 0, 0.16, 0.16, 1.1); }
    for (const h of [0.55, 1.05]) p.seg('line', W(x1, y1, h), W(x2, y2, h)); };
  rail(LX0, LY0, LX1, LY0); rail(LX0, LY1, LX1, LY1); rail(LX0, LY0, LX0, 212); rail(LX0, 226, LX0, LY1); rail(LX1, LY0, LX1, 212); rail(LX1, 226, LX1, LY1);
  // the tilt: posts every two metres, a rail at the top, cloth hung on both sides in stripes
  for (let x = TX0; x <= TX1 + 1e-6; x += 2) p.box(x - 0.1, TY - 0.1, 0, 0.2, 0.2, 1.6);
  p.box(TX0 - 0.15, TY - 0.15, 1.5, TX1 - TX0 + 0.3, 0.3, 0.16);
  for (const s of [-1, 1]) for (let x = TX0, k = 0; x < TX1; x += 2, k++) {
    const y = TY + s * 0.14, q = [W(x, y, 0.3), W(x + 2, y, 0.3), W(x + 2, y, 1.48), W(x, y, 1.48)];
    p.poly(k % 2 ? 'kob' : 'body', q); for (let i = 0; i < 4; i++) p.seg(k % 2 ? 'koline' : 'line', q[i], q[(i + 1) % 4]);
    for (let u = 0.25; u < 2; u += 0.5) p.seg('detail', W(x + u, y + s * 0.01, 0.3), W(x + u + 0.1, y + s * 0.01, 0.35)); }
  // the royal stand: a gallery on posts, benches climbing north, the canopy, the valance, the hangings, the banners
  const [SX0, SX1, SY0, SY1] = JOUST.stand, PZ = 1.6;
  p.box(SX0, SY0, 0, SX1 - SX0, SY1 - SY0, PZ);
  for (let r = 0; r < 4; r++) { const y = SY0 + 1 + r * 1.6, z = PZ + 0.45 * (4 - r); p.box(SX0 + 0.5, y, PZ, SX1 - SX0 - 1, 1.6, z - PZ); }
  for (let x = SX0; x <= SX1 + 1e-6; x += (SX1 - SX0) / 8) for (const y of [SY0 + 0.3, SY1 - 0.4]) p.box(x - 0.12, y - 0.12, PZ, 0.24, 0.24, 5.4);
  p.extrude([[SX0 - 0.6, SY0 - 0.6, PZ + 5.4], [SX1 + 0.6, SY0 - 0.6, PZ + 5.4], [SX1 + 0.6, (SY0 + SY1) / 2, PZ + 7.0], [SX0 - 0.6, (SY0 + SY1) / 2, PZ + 7.0]], [0, 0, 0.12], 'n');
  p.extrude([[SX0 - 0.6, SY1 + 0.6, PZ + 5.4], [SX1 + 0.6, SY1 + 0.6, PZ + 5.4], [SX1 + 0.6, (SY0 + SY1) / 2, PZ + 7.0], [SX0 - 0.6, (SY0 + SY1) / 2, PZ + 7.0]], [0, 0, 0.12], 'n');
  // the canopy's canvas in stripes, down its slope toward the lists
  for (let x = SX0 - 0.6, k = 0; x < SX1 + 0.6; x += 2, k++) if (k % 2) p.poly('kob', [W(x, SY1 + 0.6, PZ + 5.54), W(Math.min(SX1 + 0.6, x + 2), SY1 + 0.6, PZ + 5.54), W(Math.min(SX1 + 0.6, x + 2), (SY0 + SY1) / 2, PZ + 7.14), W(x, (SY0 + SY1) / 2, PZ + 7.14)]);
  const V = FRONT(SX0 - 0.6, SY1 + 0.6, PZ + 5.4); const scal: number[] = [];
  for (let u = 0; u < SX1 - SX0 + 1.2; u += 0.8) scal.push(u, 0, u + 0.4, 0.5, u + 0.4, 0.5, u + 0.8, 0);
  p.fill2(V, 0, 0, SX1 - SX0 + 1.2, 0.3, 'kob', 0.01).draw(V, scal, 'line', 0.02);
  const H = FRONT(SX0, SY1, PZ); for (let u = 0, k = 0; u < SX1 - SX0; u += 2, k++) if (k % 2) p.fill2(H, u, 0.05, 2, PZ - 0.1, 'kob', 0.01);
  p.text(H, 'THE LISTS OF MILLBROOK', (SX1 - SX0) / 2, 1.0, 0.5, 'ink', 'middle', 0.02);
  // the lord's and lady's chairs in the middle, high-backed, and the two of them in them
  const MX = (SX0 + SX1) / 2;
  for (const dx of [-1.1, 1.1]) { p.box(MX + dx - 0.4, SY1 - 3.4, PZ + 1.35, 0.8, 0.8, 0.45, 'k').box(MX + dx - 0.4, SY1 - 3.5, PZ + 1.8, 0.8, 0.12, 1.3, 'k');
    p.box(MX + dx - 0.25, SY1 - 3.2, PZ + 1.8, 0.5, 0.4, 0.62, dx < 0 ? 'k' : 'n').cylZ(MX + dx, SY1 - 3.0, PZ + 2.42, 0.13, 0.24, 8, 'n'); }
  p.cylZ(MX - 1.1, SY1 - 3.0, PZ + 2.66, 0.16, 0.08, 8, 'k');   // his crown, or near enough
  for (const x of [SX0, MX, SX1]) { p.seg('line', W(x, (SY0 + SY1) / 2, PZ + 7.0), W(x, (SY0 + SY1) / 2, PZ + 9.6)); p.fill2(FRONT(x, (SY0 + SY1) / 2, PZ + 9.5), 0, 0, 1.6, 0.9, x === MX ? 'kob' : 'body', 0.02); }
  // the crowd in the gallery
  for (let r = 0; r < 4; r++) for (let x = SX0 + 1.0; x < SX1 - 0.8; x += 0.7) { if (Math.abs(x - MX) < 2.2 && r === 1 || rand(0, 1) > 0.7) continue;
    const y = SY0 + 1.5 + r * 1.6, z = PZ + 0.45 * (4 - r), t = rand(0, 1) < 0.35 ? 'kb' : 'nb';
    p.box(x - 0.2, y - 0.15, z, 0.4, 0.3, 0.6, t).box(x - 0.1, y - 0.1, z + 0.6, 0.2, 0.2, 0.22, t === 'kb' ? 'nb' : 'kb'); }
  // the score board: the cheque, a grid of courses for each knight
  const [BX0, BX1, BY0] = JOUST.board;
  for (const x of [BX0 + 0.5, BX1 - 0.5]) p.box(x - 0.1, BY0 + 1.9, 0, 0.2, 0.2, 4.2);
  const B = FRONT(BX0, BY0 + 2.2, 4.4); p.fill2(B, 0, 0, BX1 - BX0, 2.8, 'body', 0.0).rect2(B, 0, 0, BX1 - BX0, 2.8, 'line', 0.01).text(B, 'THE CHEQUE', (BX1 - BX0) / 2, 0.5, 0.36, 'ink', 'middle', 0.02);
  for (let r = 0; r < 4; r++) { p.draw(B, [0.3, 0.9 + r * 0.45, BX1 - BX0 - 0.3, 0.9 + r * 0.45], 'detail', 0.02); }
  for (let c = 0; c <= 6; c++) p.draw(B, [2.6 + c * 1.0, 0.75, 2.6 + c * 1.0, 2.55], 'detail', 0.02);
  // the pavilions: round, in gores of two colours, a scalloped rim, a pennant on the pole
  JOUST.tents.forEach(([x, y], k) => {
    const n = 12, r = 2.6, h = 2.2;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, t = (i + k) % 2 ? 'kob' : 'body';
      const q = [W(x + r * Math.cos(a), y + r * Math.sin(a), 0), W(x + r * Math.cos(b), y + r * Math.sin(b), 0), W(x + r * Math.cos(b), y + r * Math.sin(b), h), W(x + r * Math.cos(a), y + r * Math.sin(a), h)];
      p.poly(t, q); p.seg('line', q[3], q[2]).seg('line', q[0], q[3]);
      const R = [W(x + (r + 0.25) * Math.cos(a), y + (r + 0.25) * Math.sin(a), h), W(x + (r + 0.25) * Math.cos(b), y + (r + 0.25) * Math.sin(b), h), W(x, y, h + 2.3)];
      p.poly(t === 'kob' ? 'kod' : 'deck', R); p.seg('line', R[0], R[2]).seg('line', R[0], R[1]);
      p.seg('detail', R[0], W(x + (r + 0.25) * Math.cos((a + b) / 2), y + (r + 0.25) * Math.sin((a + b) / 2), h - 0.35)).seg('detail', W(x + (r + 0.25) * Math.cos((a + b) / 2), y + (r + 0.25) * Math.sin((a + b) / 2), h - 0.35), R[1]); }
    p.fill2(FRONT(x - 0.5, y + r * 0.98 + 0.02, 1.9), 0, 0, 1.0, 1.9, 'glass', 0.01);
    p.seg('line', W(x, y, h + 2.3), W(x, y, h + 3.6)).poly('kob', [W(x, y, h + 3.6), W(x + 1.3, y, h + 3.35), W(x, y, h + 3.1)]); });
  // the lance racks: a frame with a dozen lances standing in it, striped
  for (const [x, y] of JOUST.racks) { p.box(x - 1.6, y - 0.3, 0, 3.2, 0.6, 0.2).box(x - 1.6, y - 0.05, 1.6, 3.2, 0.1, 0.1);
    for (const dx of [-1.6, 1.5]) p.box(x + dx, y - 0.05, 0, 0.1, 0.1, 1.7);
    for (let k = 0; k < 9; k++) { const lx = x - 1.4 + k * 0.35; p.geo(new THREE.CylinderGeometry(0.04, 0.07, 4.4, 6), new THREE.Matrix4().makeTranslation(...W(lx, y, 2.4).toArray()), k % 2 ? 'k' : 'n');
      p.geo(new THREE.ConeGeometry(0.14, 0.24, 8), new THREE.Matrix4().compose(W(lx, y, 1.0), new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI), v3(1, 1, 1)), 'n'); } }
  // the quintain: a post, a beam turning on it with a shield at one end and a sandbag on a chain at the other
  { const [x, y] = JOUST.quintain; p.box(x - 0.15, y - 0.15, 0, 0.3, 0.3, 2.4); beam(p, [x - 1.6, y, 2.3], [x + 1.6, y, 2.3], 0.14, 'n');
    p.extrude([[x + 1.5, y - 0.3, 1.7], [x + 1.5, y + 0.3, 1.7], [x + 1.5, y + 0.3, 2.3], [x + 1.5, y - 0.3, 2.3]], [0.06, 0, 0], 'k');
    p.seg('line', W(x - 1.6, y, 2.3), W(x - 1.6, y, 1.6)).cylZ(x - 1.6, y, 1.1, 0.25, 0.5, 8, 'k'); }
  // banners on poles along the south rail
  for (let x = 1862; x < 1930; x += 11) { p.seg('line', W(x, LY1 + 1.2, 0), W(x, LY1 + 1.2, 5)); p.fill2(SIDE(x, LY1 + 1.2, 5), 0, 0, 1.0, 1.5, (x / 11) % 2 > 1 ? 'kob' : 'body', -0.02); }
  g.add(p.build('tiltyardBase'));
  return g;
}
