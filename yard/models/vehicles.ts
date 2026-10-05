// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';

// ---- models (local: +x forward, origin at the front) ----
// headlights are lamp-toned, so they light up after dusk
const lights = (p, x, ys, z, h = 0.24, w = 0.42) => { for (const y of ys) p.box(x, y - w / 2, z, 0.07, w, h, 'l'); return p; };
export function buildTractor() {
  const p = new Part();
  p.box(-5.8, -1.1, 0.55, 5.6, 2.2, 0.45);
  p.box(-0.5, -2.05, 0.45, 0.5, 4.1, 0.65);
  p.box(-3.0, -2.05, 1.0, 2.9, 4.1, 3.3);
  p.box(-3.1, -2.15, 4.3, 3.1, 4.3, 0.22);
  p.box(-5.6, -1.3, 1.0, 2.4, 2.6, 0.22);
  for (const y of [1.25, -1.95]) p.box(-4.4, y, 0.6, 1.2, 0.7, 0.6);
  p.box(-3.35, 1.55, 1.0, 0.24, 0.24, 4.4);
  for (const x of [-1.2, -4.6]) { p.cylY(x, 1.5, 0.62, 0.62, 0.55, 12); p.cylY(x, -2.05, 0.62, 0.62, 0.55, 12); }
  const front = SIDE(-0.1, 2.05, 4.3);
  p.fill2(front, 0.3, 0.35, 3.5, 1.5).rect2(front, 0.3, 0.35, 3.5, 1.5, 'line');
  p.draw(front, [0.6, 2.4, 3.5, 2.4, 0.6, 2.7, 3.5, 2.7, 0.6, 3.0, 3.5, 3.0]);
  p.fill2(FRONT(-3.0, 2.05, 4.3), 1.5, 0.35, 1.2, 1.3).rect2(FRONT(-3.0, 2.05, 4.3), 1.5, 0.35, 1.2, 1.3, 'line');
  p.fill2(FRONT(-3.0, -2.05, 4.3), 1.5, 0.35, 1.2, 1.3, 'glass', -0.03).rect2(FRONT(-3.0, -2.05, 4.3), 1.5, 0.35, 1.2, 1.3, 'line', -0.04);
  lights(p, 0, [1.55, -1.55], 0.62);
  return p.build('tractor');
}
export const FLAT_SLOTS = [[-2.6, -1.3], [-7.2, -1.3], [-11.8, -1.3], [-2.6, 1.3], [-7.2, 1.3], [-11.8, 1.3]]; // far row first when parked heading west
export const DECK = 1.6;
export function buildTrailer() {
  const p = new Part();
  p.box(-14.4, -2.4, 1.15, 15.2, 4.8, 0.45);
  p.box(-14.0, -0.9, 0.62, 14.6, 1.8, 0.53);
  p.box(0.55, -2.4, DECK, 0.25, 4.8, 1.7);
  p.draw(SIDE(0.8, 2.4, DECK + 1.7), [0.8, 0, 0.8, 1.7, 2.4, 0, 2.4, 1.7, 4.0, 0, 4.0, 1.7]);
  for (const x of [-0.5, -4.9, -9.5, -14.2]) for (const y of [2.2, -2.4]) p.box(x, y, DECK, 0.2, 0.2, 0.35);
  for (const y of [2.3, -2.3]) p.seg('line', W(-14.2, y, DECK + 0.35), W(0.55, y, DECK + 0.35));
  const T = TOP(-14.4, -2.4, DECK);
  for (let v = 0.8; v < 4.8; v += 0.8) p.draw(T, [0, v, 15.2, v]);
  for (const y of [-1.5, 1.25]) p.box(-1.9, y, 0.15, 0.25, 0.25, 1.0);
  for (const x of [-11.0, -12.5]) { p.cylY(x, 1.7, 0.62, 0.62, 0.6, 12); p.cylY(x, -2.3, 0.62, 0.62, 0.6, 12); }
  return p.build('trailer');
}
// The covered delivery truck: a box body open at the back, closed by two swing doors.
// Pallets ride in one row, loaded from the rear.
export const VAN_SLOTS = [-4.4, -6.9, -9.4, -11.9], VAN_DECK = 1.3, VAN_LEN = 13.4, VAN_BH = 2.85;
export function buildVan() {
  const g = new THREE.Group(); g.name = 'van';
  const p = new Part(), B0 = -VAN_LEN, BL = 10.4, D = VAN_DECK, BH = VAN_BH;
  p.box(-12.9, -0.8, 0.5, 12.6, 1.6, 0.4);
  p.box(-0.4, -1.3, 0.35, 0.4, 2.6, 0.55);
  p.box(-2.8, -1.25, 0.85, 2.6, 2.5, 2.25);
  p.box(-2.9, -1.3, 3.1, 2.7, 2.6, 0.18);
  const fr = SIDE(-0.2, 1.25, 3.1);
  p.fill2(fr, 0.25, 0.25, 2.0, 0.95).rect2(fr, 0.25, 0.25, 2.0, 0.95, 'line').draw(fr, [0.4, 1.7, 2.1, 1.7, 0.4, 1.95, 2.1, 1.95]);
  p.fill2(FRONT(-2.8, 1.25, 3.1), 1.2, 0.3, 1.1, 0.85).rect2(FRONT(-2.8, 1.25, 3.1), 1.2, 0.3, 1.1, 0.85, 'line');
  p.fill2(FRONT(-2.8, -1.25, 3.1), 1.2, 0.3, 1.1, 0.85, 'glass', -0.03).rect2(FRONT(-2.8, -1.25, 3.1), 1.2, 0.3, 1.1, 0.85, 'line', -0.04);
  p.box(B0, -1.4, D - 0.35, BL, 2.8, 0.35);
  p.box(B0, 1.25, D, BL, 0.15, BH); p.box(B0, -1.4, D, BL, 0.15, BH);
  p.box(-3.15, -1.4, D, 0.15, 2.8, BH);
  p.box(B0, -1.4, D + BH, BL, 2.8, 0.15);
  const ribs = []; for (let u = 1.3; u < BL - 0.2; u += 1.3) ribs.push(u, 0.1, u, BH + 0.1);
  p.draw(FRONT(B0, 1.4, D + BH + 0.15), ribs).draw(FRONT(B0, -1.4, D + BH + 0.15), ribs, 'detail', -0.04);
  p.draw(TOP(B0, -1.4, D + BH + 0.15), [0, 1.4, BL, 1.4]);
  for (const x of [-1.7, -10.7]) { p.cylY(x, 1.0, 0.55, 0.55, 0.42, 12); p.cylY(x, -1.42, 0.55, 0.55, 0.42, 12); }
  lights(p, 0, [0.9, -0.9], 0.5);
  g.add(p.build('vanBody'));
  for (const [n, y, s] of [['doorL', 1.4, -1], ['doorR', -1.4, 1]]) {
    const d = new Part(), y0 = s < 0 ? -1.4 : 0;
    d.box(-0.08, y0, 0, 0.08, 1.4, BH + 0.12);
    for (const k of [0.35, 1.05]) d.seg('line', W(-0.09, y0 + k, 0.2), W(-0.09, y0 + k, BH - 0.1));
    const dg = d.build(n); dg.position.copy(W(B0, y, D)); g.add(dg);
  }
  return g;
}
// The town bus: a long box with a band of windows, doors on the kerb side, the line number up front.
export const BUS_LEN = 11.4;
export function buildBus() {
  const p = new Part(), L = BUS_LEN, H = 2.9, Z = 0.45, Y = 1.25;
  p.box(-L, -Y, Z, L, 2 * Y, H);
  p.box(-L + 0.3, -Y + 0.15, Z + H, L - 0.6, 2 * Y - 0.3, 0.16);
  p.box(-L + 2, -0.7, Z + H + 0.16, 2.6, 1.4, 0.35);
  const R = FRONT(-L, Y, Z + H), Lf = FRONT(-L, -Y, Z + H);
  for (let u = 0.5; u + 1.4 < L - 0.6; u += 1.75) {
    const door = u > L - 2.4 || (u > 4.6 && u < 6.4);
    if (!door) p.fill2(R, u, 0.35, 1.4, 1.05, 'window').rect2(R, u, 0.35, 1.4, 1.05, 'line');
    p.fill2(Lf, u, 0.35, 1.4, 1.05, 'window', -0.03).rect2(Lf, u, 0.35, 1.4, 1.05, 'line', -0.04);
  }
  for (const u of [L - 1.75, 5.25]) p.rect2(R, u - 0.55, 0.3, 1.3, H - 0.4, 'line').draw(R, [u + 0.1, 0.3, u + 0.1, H - 0.1]);
  p.draw(R, [0, 1.75, L, 1.75]).draw(Lf, [0, 1.75, L, 1.75], 'detail', -0.04);
  const F = SIDE(0, Y, Z + H);
  p.fill2(F, 0.2, 0.55, 2.1, 1.25, 'window').rect2(F, 0.2, 0.55, 2.1, 1.25, 'line');
  p.fill2(F, 0.5, 0.08, 1.5, 0.38, 'kob').text(F, 'LINE 1', 1.25, 0.39, 0.3, 'ink', 'middle', 0.05);
  for (const x of [-2.0, -8.8]) { p.cylY(x, 1.0, 0.5, 0.5, 0.36, 12); p.cylY(x, -1.36, 0.5, 0.5, 0.36, 12); }
  lights(p, 0, [0.85, -0.85], 0.6);
  return p.build('bus');
}
export function buildPoliceCar() {
  const p = new Part();
  p.box(-4.6, -1.0, 0.35, 4.6, 2.0, 0.75);
  p.box(-3.4, -0.9, 1.1, 2.3, 1.8, 0.62);
  for (const [y, s] of [[1.0, 1], [-1.0, -1]]) { const M = FRONT(-4.6, y, 1.1); p.fill2(M, 0.2, 0.2, 4.2, 0.28, 'kob', 0.03 * s).draw(M, [0.2, 0.2, 4.4, 0.2, 0.2, 0.48, 4.4, 0.48], 'koline', 0.04 * s); }
  const f = SIDE(-1.1, 0.9, 1.72); p.fill2(f, 0.15, 0.1, 1.5, 0.42).rect2(f, 0.15, 0.1, 1.5, 0.42, 'line');
  p.fill2(FRONT(-3.4, 0.9, 1.72), 0.3, 0.12, 1.7, 0.4).rect2(FRONT(-3.4, 0.9, 1.72), 0.3, 0.12, 1.7, 0.4, 'line');
  for (const x of [-0.85, -3.6]) { p.cylY(x, 0.72, 0.37, 0.37, 0.32, 10); p.cylY(x, -1.04, 0.37, 0.37, 0.32, 10); }
  lights(p, 0, [0.62, -0.62], 0.62, 0.2, 0.36);
  p.box(-2.75, -0.75, 1.72, 0.95, 1.5, 0.08);
  const g = p.build('police');
  for (const [n, y] of [['barL', 0.05], ['barR', -0.7]]) g.add(new Part().box(-2.65, y, 1.8, 0.75, 0.65, 0.2).build(n));
  return g;
}
export function buildForklift() {
  const p = new Part();
  p.box(-3.5, -1.0, 0.35, 3.1, 2.0, 0.85);
  p.box(-3.75, -1.05, 0.35, 0.9, 2.1, 1.45);
  p.box(-2.5, -0.55, 1.2, 0.7, 1.1, 0.45);
  p.box(-2.6, -0.55, 1.65, 0.18, 1.1, 0.6);
  for (const [x, y] of [[-0.85, -0.95], [-0.85, 0.8], [-2.75, -0.95], [-2.75, 0.8]]) p.box(x, y, 1.2, 0.15, 0.15, 2.2);
  p.box(-2.9, -1.05, 3.4, 2.2, 2.1, 0.12);
  p.draw(TOP(-2.9, -1.05, 3.52), [0.55, 0, 0.55, 2.1, 1.1, 0, 1.1, 2.1, 1.65, 0, 1.65, 2.1]);
  p.box(-0.4, -0.85, 0.2, 0.22, 0.25, 4.6); p.box(-0.4, 0.6, 0.2, 0.22, 0.25, 4.6); p.box(-0.4, -0.85, 4.62, 0.22, 1.7, 0.18);
  for (const x of [-0.95, -3.05]) { p.cylY(x, 0.72, 0.42, 0.42, 0.42, 10); p.cylY(x, -1.14, 0.42, 0.42, 0.42, 10); }
  const g = p.build('forklift');
  const c = new Part(); c.box(-0.2, -0.9, 0, 0.16, 1.8, 1.1);
  for (const y of [-0.62, 0.38]) c.box(-0.04, y, 0, 2.2, 0.24, 0.1);
  g.add(c.build('carriage'));
  // the inner mast, which rises out of the outer one when the forks go above it
  g.add(new Part().box(-0.3, -0.75, 0.4, 0.14, 0.18, 4.15).box(-0.3, 0.57, 0.4, 0.14, 0.18, 4.15).box(-0.3, -0.75, 4.4, 0.14, 1.5, 0.15).build('mast2'));
  g.add(new Part().box(-1.95, -0.15, 3.52, 0.3, 0.3, 0.25).build('beacon'));
  return g;
}
export function buildCar(van, tone, lit = true) {
  const p = new Part();
  if (van) {
    p.box(-5.2, -1.05, 0.35, 5.2, 2.1, 2.1, tone);
    const f = SIDE(0, 1.05, 2.45); p.fill2(f, 0.2, 0.25, 1.7, 0.8).rect2(f, 0.2, 0.25, 1.7, 0.8, tone === 'k' ? 'koline' : 'line');
    p.draw(FRONT(-5.2, 1.05, 2.45), [1.2, 0, 1.2, 2.1], tone === 'k' ? 'koline' : 'detail');
  } else {
    p.box(-4.2, -0.95, 0.35, 4.2, 1.9, 0.75, tone);
    p.box(-3.2, -0.85, 1.1, 2.1, 1.7, 0.62, tone);
    const f = SIDE(-1.1, 0.85, 1.72); p.fill2(f, 0.15, 0.1, 1.4, 0.42).rect2(f, 0.15, 0.1, 1.4, 0.42, tone === 'k' ? 'koline' : 'line');
  }
  for (const x of van ? [-0.9, -4.3] : [-0.8, -3.4]) { p.cylY(x, 0.72, 0.36, 0.36, 0.32, 10); p.cylY(x, -1.04, 0.36, 0.36, 0.32, 10); }
  if (lit) lights(p, 0, [0.6, -0.6], van ? 0.6 : 0.58, 0.2, 0.36);
  return p.build(van ? 'van' : 'car');
}
// Corner Market's parcel van: a tall box van with a two-tone band and PARCELS on both sides, and hazard lamps at the
// corners that blink while the courier is at a door
export function buildParcelVan() {
  const p = new Part();
  p.box(-5.4, -1.05, 0.35, 5.4, 2.1, 2.35);
  p.box(-4.3, -1.0, 2.7, 3.2, 2.0, 0.12, 'k');
  for (const [y, s] of [[1.05, 1], [-1.05, -1]]) {
    const M = FRONT(-5.4, y, 2.7);
    p.fill2(M, 0.15, 1.55, 5.1, 0.3, 'kob', 0.03 * s).text(M, 'PARCELS', 1.0, 1.15, 0.5, 'ink', 'start', 0.035 * s).draw(M, [1.3, 0, 1.3, 2.35], 'detail', 0.04 * s);
  }
  const f = SIDE(0, 1.05, 2.7); p.fill2(f, 0.2, 0.25, 1.7, 0.8).rect2(f, 0.2, 0.25, 1.7, 0.8, 'line');
  for (const x of [-0.9, -4.5]) { p.cylY(x, 0.72, 0.36, 0.36, 0.32, 10); p.cylY(x, -1.04, 0.36, 0.36, 0.32, 10); }
  lights(p, 0, [0.6, -0.6], 0.6, 0.2, 0.36);
  const g = p.build('parcelVan');
  const h = new Part(); for (const [x, y] of [[0.0, 0.88], [0.0, -1.06], [-5.47, 0.8], [-5.47, -1.05]]) h.box(x, y, 1.0, 0.07, 0.25, 0.16, 'l');
  g.add(h.build('hazard'));
  return g;
}
export function buildPallet(v) {
  const p = new Part();
  p.box(-1.2, -1.2, 0, 2.4, 2.4, 0.35);
  const slats = [0, 0.12, 2.4, 0.12, 0.55, 0.12, 0.55, 0.35, 1.85, 0.12, 1.85, 0.35];
  p.draw(FRONT(-1.2, 1.2, 0.35), slats).draw(SIDE(1.2, 1.2, 0.35), slats);
  p.draw(FRONT(-1.2, -1.2, 0.35), slats, 'detail', -0.04).draw(SIDE(-1.2, 1.2, 0.35), slats, 'detail', -0.04);
  if (v === 0) {
    p.box(-1.1, -1.1, 0.35, 2.2, 2.2, 1.5, 'k');
    p.draw(TOP(-1.1, -1.1, 1.85), [1.1, 0, 1.1, 2.2, 0, 1.1, 0.5, 1.1, 1.7, 1.1, 2.2, 1.1], 'koline');
  } else if (v === 1) {
    for (let l = 0; l < 2; l++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) p.box(-1.1 + 1.12 * i, -1.1 + 1.12 * j, 0.35 + 0.78 * l, 1.08, 1.08, 0.76, 'k');
  } else {
    for (let l = 0; l < 6; l++) p.box(-1.15, -1.0, 0.35 + 0.22 * l, 2.3, 2.0, 0.2, 'k');
    for (const x of [-0.5, 0.5]) p.seg('koline', W(x, 1.03, 0.35), W(x, 1.03, 1.67)).seg('koline', W(x, 1.03, 1.67), W(x, -1.03, 1.67));
  }
  return p.build('pallet');
}
