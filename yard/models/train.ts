// @ts-nocheck
import { FRONT, SIDE, W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { BODY_LEN, beam } from './works';

// ---- FRT-7 (local: +x forward, origin at the front end, like the road vehicles) ----
export const LOCO_LEN = 16, FLAT_LEN = 13, CARRIER_LEN = 20, WDECK = 1.25, GAP = 0.6;
const bogies = (p, len) => { for (const x of [-2.2, -len + 2.2]) { p.box(x - 1.3, -1.05, 0.2, 2.6, 2.1, 0.55, 'kb'); for (const dx of [-0.75, 0.75]) for (const y of [1.05, -1.25]) p.cylY(x + dx, y, 0.45, 0.42, 0.2, 10, 'kb'); } };
// a diesel: a cab at each end, a long hood between with its grilles and roof fans, a band along the side, the number
export function buildLoco(num = 'FRT-7', side = -1) {   // side: the one that faces south as it runs
  const p = new Part(), L = LOCO_LEN;
  p.box(-L, -1.45, 1.0, L, 2.9, 0.25, 'kb');
  for (const x0 of [-3.4, -L]) { p.box(x0, -1.45, 1.25, 3.4, 2.9, 2.75, 'kb'); }
  p.box(-L + 3.4, -1.2, 1.25, L - 6.8, 2.4, 2.45, 'kb');
  for (const x of [-6.2, -9.8]) p.cylZ(x, 0, 3.7, 0.55, 0.12, 12, 'kb');
  for (const [y, s] of [[1.45, 1], [-1.45, -1]]) {
    const C = FRONT(-3.4, y, 4.0), R = FRONT(-L, y, 4.0), H = FRONT(-L + 3.4, s > 0 ? 1.2 : -1.2, 3.7);
    for (const M of [C, R]) p.fill2(M, 0.5, 0.4, 2.0, 0.9, 'glass', 0.03 * s).rect2(M, 0.5, 0.4, 2.0, 0.9, 'koline', 0.035 * s).fill2(M, 0, 1.9, 3.4, 0.3, 'deck', 0.03 * s);
    p.fill2(H, 0, 1.6, L - 6.8, 0.3, 'deck', 0.03 * s); if (s === side) p.text(H, num, (L - 6.8) / 2, 1.25, 0.42, 'ink', 'middle', 0.035 * s);   // the number on the side the camera sees
    for (let u = 0.5; u < L - 7.2; u += 1.2) p.rect2(H, u, 0.25, 0.9, 0.85, 'koline', 0.035 * s);
  }
  const N = SIDE(0, 1.45, 4.0); p.fill2(N, 0.4, 0.4, 2.1, 0.9, 'glass').rect2(N, 0.4, 0.4, 2.1, 0.9, 'koline').fill2(N, 0, 1.9, 2.9, 0.3, 'deck');
  for (const y of [0.85, -1.05]) p.box(0, y, 1.6, 0.06, 0.2, 0.22, 'l');
  bogies(p, L);
  const g = p.build('loco');
  for (const [n, y] of [['beaconF', -0.2]]) g.add(new Part().box(-1.8, y, 4.0, 0.4, 0.4, 0.25, 'l').build(n));
  return g;
}
// a flat wagon for two pallets: a deck on its frame, stanchions at the corners
export function buildFlatWagon() {
  const p = new Part(), L = FLAT_LEN;
  p.box(-L, -1.3, 0.95, L, 2.6, 0.3, 'kb');
  for (const x of [-0.3, -L + 0.1]) for (const y of [1.15, -1.35]) p.box(x, y, WDECK, 0.2, 0.2, 0.7, 'kb');
  bogies(p, L);
  return p.build('flatWagon');
}
// a car carrier: an open deck with low sides and bridge plates, four cars nose to tail
export function buildCarrier() {
  const p = new Part(), L = CARRIER_LEN;
  p.box(-L, -1.4, 0.95, L, 2.8, 0.3, 'kb');
  for (const y of [1.3, -1.4]) { p.box(-L, y, WDECK, L, 0.1, 0.35, 'kb'); for (let x = -L + 1; x < 0; x += 2.5) p.seg('line', W(x, y + 0.05, WDECK + 0.35), W(x, y + 0.05, WDECK + 1.6)); p.seg('line', W(-L + 1, y + 0.05, WDECK + 1.6), W(-1, y + 0.05, WDECK + 1.6)); }
  bogies(p, L);
  return p.build('carrier');
}
// a finished car on a carrier, drawn into a shared part in the carrier's own frame, facing forward, front at x
export function carAlong(p, x, tone, z = WDECK) {
  const L = BODY_LEN, t = tone === 'k' ? 'kb' : 'nb';
  p.box(x - L, -0.9, z + 0.32, L, 1.8, 0.62, t).box(x - 3.5, -0.8, z + 0.94, 2.25, 1.6, 0.5, t);
  beam(p, [x - 0.75, 0, z + 0.95], [x - 1.27, 0, z + 1.42], 1.5, 'g', 0.04);
  beam(p, [x - 3.48, 0, z + 1.42], [x - 3.95, 0, z + 0.95], 1.5, 'g', 0.04);
  for (const wx of [x - 0.75, x - 3.6]) for (const wy of [0.72, -0.98]) p.box(wx - 0.34, wy, z, 0.68, 0.26, 0.68, 'kb');
  return p;
}
// the portable ramp the cars drive up at Car Works, lowered behind the train while it stands there
export function buildRamp() {
  const p = new Part();
  p.extrude([[0, -1.2, 0], [7, -1.2, 0], [0, -1.2, WDECK]], [0, 2.4, 0], 'n');
  for (let u = 0.6; u < 7; u += 0.6) p.seg('detail', W(u, -1.2, WDECK * (1 - u / 7) + 0.01), W(u, 1.2, WDECK * (1 - u / 7) + 0.01));
  for (const y of [-1.25, 1.15]) p.box(0, y, 0, 0.15, 0.1, WDECK + 0.9);
  return p.build('ramp');
}
