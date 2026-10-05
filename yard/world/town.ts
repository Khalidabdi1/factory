// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part, pose, v3 } from '../kernel/part';
import { rand, rng } from '../kernel/math';
import { CURB } from '../layout';
import { palm, roof4, tree, yaw } from './ground';
import { buildCar } from '../models/vehicles';

// ---- town buildings ----
// windows on one face, in rows from the top; at night only some of them light up
function windows(p, M, w, h, { x0 = 1.2, y0 = 1.0, ww = 1.4, wh = 1.5, dx = 3, dy = 3, skip = () => false, lit = 0.6 } = {}) {
  for (let v = y0; v + wh <= h - 0.4; v += dy) for (let u = x0; u + ww <= w - 0.3; u += dx) {
    if (skip(u, v)) continue;
    p.fill2(M, u, v, ww, wh, rng() < lit ? 'window' : 'glass').rect2(M, u, v, ww, wh, 'line', 0.04);
  }
}
export function buildFlats(name, x, y, w, d, h, door) {
  const p = new Part(), z = CURB;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.25, y - 0.25, z + h, w + 0.5, d + 0.5, 0.45);
  const F = FRONT(x, y + d, z + h), S = SIDE(x + w, y + d, z + h);
  windows(p, F, w, h, { skip:(u, v) => v > h - 3.5 && Math.abs(u + 0.7 - door) < 2.6 });
  windows(p, S, d, h, { x0:1.4 });
  for (let v = 3; v < h; v += 3) { p.draw(F, [0, v - 0.25, w, v - 0.25]); p.draw(S, [0, v - 0.25, d, v - 0.25]); }
  p.fill2(F, door - 1.1, h - 2.7, 2.2, 2.7).rect2(F, door - 1.1, h - 2.7, 2.2, 2.7, 'line');
  p.box(x + door - 1.8, y + d, z + 2.8, 3.6, 1.4, 0.18);
  p.text(F, name.toUpperCase(), door + 2.2, h - 2.0, 0.55);
  for (const [dx, dy] of [[3, 3], [w - 7, 4]]) { p.box(x + dx, y + dy, z + h + 0.45, 3.6, 2.6, 1.3); p.draw(FRONT(x + dx, y + dy + 2.6, z + h + 1.75), [0.4, 0.4, 3.2, 0.4, 0.4, 0.75, 3.2, 0.75]); }
  p.cylZ(x + w / 2, y + d / 2, z + h + 0.45, 1.3, 2.2, 12);
  return p.build('flats');
}
export function buildBank() {
  const p = new Part(), z = CURB, x = 102, y = 168, w = 28, d = 24, h = 9;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.3, y - 0.3, z + h, w + 0.6, d + 0.6, 0.5);
  for (let i = 0; i < 3; i++) p.box(x + 3, y + d, z, w - 6, 2.4 - 0.8 * i, 0.15 * (i + 1));
  for (let i = 0; i < 7; i++) p.box(x + 3.6 + i * 3.4, y + d, z + 0.45, 0.8, 0.6, h - 2.05);
  p.box(x + 2.8, y + d - 0.1, z + h - 1.6, w - 5.6, 0.9, 1.6);
  p.extrude([[x + 8, y + d + 0.8, z + h + 0.5], [x + w - 8, y + d + 0.8, z + h + 0.5], [x + w / 2, y + d + 0.8, z + h + 2.6]], [0, -3, 0]);
  const E = FRONT(x + 2.8, y + d + 0.8, z + h);
  p.text(E, 'HARBOUR BANK', (w - 5.6) / 2, 1.05, 0.8, 'ink', 'middle');
  const F = FRONT(x, y + d, z + h);
  for (let i = 0; i < 6; i++) { const u = 4.6 + i * 3.4; if (i === 2 || i === 3) continue; p.fill2(F, u, 2.4, 1.8, 4.6, rng() < 0.4 ? 'window' : 'glass').rect2(F, u, 2.4, 1.8, 4.6, 'line'); }
  p.fill2(F, 12.5, 4.6, 3, 3.95).rect2(F, 12.5, 4.6, 3, 3.95, 'line').draw(F, [14, 4.6, 14, 8.55], 'line');
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:2, ww:1.6, wh:2.4, dx:3.6, dy:4, y0:1.6, lit:0.3 });
  const g = p.build('bank');
  g.add(new Part().box(x + w - 2.4, y + d + 0.02, z + h - 3.4, 1.2, 0.4, 0.7, 'k').build('alarm'));
  return g;
}
// the café's terrace tables (x), each with a chair either side
export const CAFE_TABLES = [140, 147, 155, 162];
export function buildCafe() {
  const p = new Part(), z = CURB, x = 136, y = 174, w = 30, d = 12, h = 4.6;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.2, y - 0.2, z + h, w + 0.4, d + 0.4, 0.3);
  const F = FRONT(x, y + d, z + h);
  p.fill2(F, 1.2, 1.4, 11, 2.6, 'window').rect2(F, 1.2, 1.4, 11, 2.6, 'line').fill2(F, 17, 1.4, 11.8, 2.6, 'window').rect2(F, 17, 1.4, 11.8, 2.6, 'line');
  for (const u of [4.9, 8.6, 20.9, 24.8]) p.draw(F, [u, 1.4, u, 4.0], 'line');
  p.fill2(F, 13.2, 1.4, 2.8, 3.2).rect2(F, 13.2, 1.4, 2.8, 3.2, 'line');
  p.text(F, 'CAFÉ MIRA', 1.2, 0.95, 0.7);
  p.extrude([[x + 0.5, y + d, z + 3.7], [x + 0.5, y + d + 2.4, z + 2.9], [x + 0.5, y + d + 2.4, z + 2.75], [x + 0.5, y + d, z + 3.55]], [w - 1, 0, 0], 'k');
  for (let u = 1.5; u < w - 1; u += 1.5) p.seg('koline', W(x + u, y + d, z + 3.71), W(x + u, y + d + 2.4, z + 2.91));
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:1.5, ww:2, wh:1.8, dx:3.5, y0:1.2, lit:0.9 });
  // terrace: tables under umbrellas
  const um = new THREE.ConeGeometry(1.2, 0.5, 8);
  for (const tx of CAFE_TABLES) {
    p.cylZ(tx, 191.4, z, 0.5, 0.75, 8); p.seg('line', W(tx, 191.4, z + 0.75), W(tx, 191.4, z + 2.3));
    p.geo(um, new THREE.Matrix4().compose(W(tx, 191.4, z + 2.45), yaw(0.2), v3(1, 1, 1)), 'k');
    for (const dx of [-0.95, 0.65]) p.box(tx + dx, 191.2, z, 0.3, 0.4, 0.45);
  }
  return p.build('cafe');
}
export function buildPolice() {
  const p = new Part(), z = CURB, x = 190, y = 164, w = 27, d = 28, h = 8;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.25, y - 0.25, z + h, w + 0.5, d + 0.5, 0.4);
  const F = FRONT(x, y + d, z + h);
  p.draw(F, [0, 1.8, w, 1.8], 'line'); p.text(F, 'POLICE', w / 2, 1.35, 1.1, 'ink', 'middle');
  windows(p, F, w, h, { y0:2.5, dy:2.9, skip:(u, v) => v > 4 && u > 10.5 && u < 16, lit:0.85 });
  p.fill2(F, 12, h - 2.7, 3, 2.7).rect2(F, 12, h - 2.7, 3, 2.7, 'line');
  p.box(x + 11.4, y + d, z + 2.9, 4.2, 1.4, 0.16);
  p.box(x + 13, y + d + 0.02, z + 3.25, 1.0, 0.35, 0.55, 'l');
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:1.6, y0:2.5, dy:2.9, lit:0.85 });
  // flag pole, and the yard beside the station: a low wall, bays for the two cars
  p.box(x + 23.4, y + d + 1.6, z, 0.16, 0.16, 9.5);
  p.fill2(plane([x + 23.5, y + d + 1.7, z + 9.4], [1, 0, 0], [0, 0, -1]), 0.1, 0, 2.6, 1.6, 'kob', 0).rect2(plane([x + 23.5, y + d + 1.7, z + 9.4], [1, 0, 0], [0, 0, -1]), 0.1, 0, 2.6, 1.6, 'koline', 0.01);
  p.box(226.5, 194.6, 0, 27, 0.5, 0.9);
  const G = TOP(0, 0, 0);
  for (const xx of [225.4, 235.4, 245.4]) p.draw(G, [xx, 181.4, xx, 186.6], 'line', 0.05);
  p.text(G, 'POLICE', 228, 189.6, 1.2, 'paint');
  return p.build('police');
}
export function buildTownHall() {
  const p = new Part(), z = CURB, x = 222, y = 146, w = 38, d = 26, h = 10;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.3, y - 0.3, z + h, w + 0.6, d + 0.6, 0.5);
  const F = FRONT(x, y + d, z + h);
  windows(p, F, w, h, { x0:1.8, ww:1.6, wh:2.4, dx:3.6, y0:1.4, dy:4.4, skip:(u) => u > 13 && u < 24, lit:0.5 });
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:1.8, ww:1.6, wh:2.4, dx:3.6, y0:1.4, dy:4.4, lit:0.5 });
  // the clock tower in the middle of the front
  const tx = x + 15, ty = y + 18, tw = 8, th = 21;
  p.box(tx, ty, z, tw, 8, th);
  p.geo(roof4, new THREE.Matrix4().compose(W(tx + tw / 2, ty + 4, z + th + 2.2), yaw(Math.PI / 4), v3(6.2, 4.4, 6.2)));
  const TF = FRONT(tx, ty + 8, z + th), TS = SIDE(tx + tw, ty + 8, z + th);
  for (const M of [TF, TS]) {
    const face = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; face.push(v3(4 + 2 * Math.cos(a), 3 + 2 * Math.sin(a), 0).applyMatrix4(M).add(v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-0.03))); }
    p.poly('deck', face); for (let i = 0; i < 24; i++) p.seg('line', face[i], face[(i + 1) % 24]);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; p.draw(M, [4 + 1.6 * Math.cos(a), 3 + 1.6 * Math.sin(a), 4 + 1.85 * Math.cos(a), 3 + 1.85 * Math.sin(a)], 'line'); }
  }
  p.fill2(TF, 2.6, 9, 2.8, 4.6, 'window').rect2(TF, 2.6, 9, 2.8, 4.6, 'line');
  p.fill2(F, 16.2, h - 3.4, 5.6, 3.4).rect2(F, 16.2, h - 3.4, 5.6, 3.4, 'line');
  for (let i = 0; i < 3; i++) p.box(x + 14.5, y + d, z, 9, 2.1 - 0.7 * i, 0.15 * (i + 1));
  p.text(F, 'TOWN HALL', 19, 1.0, 0.75, 'ink', 'middle');
  const g = p.build('townHall');
  // clock hands, turned by the simulated time
  const hand = (n, len) => new Part().seg('line', v3(0, 0, 0), v3(0, len, 0)).build(n);
  for (const [M, n] of [[TF, 'F'], [TS, 'S']]) {
    const c = v3(4, 3, 0).applyMatrix4(M).add(v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-0.06));
    for (const [k, len] of [['hour', 1.0], ['min', 1.55]]) { const hnd = hand(`${k}${n}`, len); hnd.position.copy(c); g.add(hnd); }
  }
  return g;
}
// a house with a gabled roof, its front to the south; a garden with a path, a fence, a tree, sometimes a car
export function buildHouse(o) {
  const { x, y, w, d, h, rh = 3, ridgeY = false, door = 2, lotY1, lotX0, lotX1, car } = o, p = new Part(), z = CURB, ov = 0.5;
  p.box(x, y, z, w, d, h);
  if (ridgeY) {
    p.extrude([[x - ov, y - ov, z + h - 0.12], [x + w / 2, y - ov, z + h + rh], [x + w + ov, y - ov, z + h - 0.12]], [0, d + 2 * ov, 0]);
    for (let t = 0.2; t < 1; t += 0.2) { const xx = x + w / 2 + t * (w / 2 + ov), zz = z + h + rh - t * (rh + 0.12); p.seg('detail', W(xx, y - ov, zz), W(xx, y + d + ov, zz)); }
    const gf = FRONT(x, y + d + ov, z + h);
    p.fill2(gf, w / 2 - 0.6, -1.6, 1.2, 1.0, rng() < 0.5 ? 'window' : 'glass').rect2(gf, w / 2 - 0.6, -1.6, 1.2, 1.0, 'line');
  } else {
    p.extrude([[x - ov, y - ov, z + h - 0.12], [x - ov, y + d / 2, z + h + rh], [x - ov, y + d + ov, z + h - 0.12]], [w + 2 * ov, 0, 0]);
    for (let t = 0.2; t < 1; t += 0.2) { const yy = y + d / 2 + t * (d / 2 + ov), zz = z + h + rh - t * (rh + 0.12); p.seg('detail', W(x - ov, yy, zz), W(x + w + ov, yy, zz)); }
  }
  p.box(x + w * 0.72, y + d * 0.3, z + h + rh * 0.35, 0.7, 0.7, rh * 0.85);
  const F = FRONT(x, y + d, z + h), S = SIDE(x + w, y + d, z + h);
  p.fill2(F, door, h - 2.2, 1.1, 2.2).rect2(F, door, h - 2.2, 1.1, 2.2, 'line');
  for (let u = 0.9; u + 1.3 < w - 0.4; u += 2.6) { if (Math.abs(u - door) < 1.6) continue; p.fill2(F, u, h - 1.9, 1.3, 1.1, rng() < 0.55 ? 'window' : 'glass').rect2(F, u, h - 1.9, 1.3, 1.1, 'line'); }
  if (h > 4.5) for (let u = 0.9; u + 1.3 < w - 0.4; u += 2.6) p.fill2(F, u, 0.8, 1.3, 1.1, rng() < 0.4 ? 'window' : 'glass').rect2(F, u, 0.8, 1.3, 1.1, 'line');
  for (let u = 1.2; u + 1.3 < d - 0.4; u += 3) p.fill2(S, u, h - 1.9, 1.3, 1.1, rng() < 0.5 ? 'window' : 'glass').rect2(S, u, h - 1.9, 1.3, 1.1, 'line');
  // garden: a path to the pavement, a picket fence with a gap, a hedge at the back, a tree
  const px = x + door + 0.55, L = TOP(0, 0, z);
  p.fill2(L, px - 0.6, y + d, 1.2, lotY1 - y - d, 'deck', 0.03);
  for (const [a, b] of [[lotX0 + 0.4, px - 0.9], [px + 0.9, lotX1 - 0.4]]) {
    if (b - a < 0.5) continue;
    const n = Math.max(1, Math.round((b - a) / 1.2));
    for (let i = 0; i <= n; i++) p.seg('line', W(a + (b - a) * i / n, lotY1 - 0.4, z), W(a + (b - a) * i / n, lotY1 - 0.4, z + 0.9));
    p.seg('line', W(a, lotY1 - 0.4, z + 0.7), W(b, lotY1 - 0.4, z + 0.7));
  }
  p.box(lotX0 + 0.4, y - 7.5, z, lotX1 - lotX0 - 0.8, 0.9, 1.2, 'gs');
  tree(p, rand(lotX0 + 2.5, lotX1 - 2.5), y - 3.5, rand(0.8, 1.1), z);
  if (car) { const c = buildCar(rng() < 0.3, rng() < 0.4 ? 'k' : 'n'); p.fill2(L, car[0] - 1.6, car[1] - 5.6, 3.2, lotY1 - car[1] + 5.6, 'road', 0.03);
    const g = p.build('house'); pose(c, car[0], car[1], Math.PI / 2, z); g.add(c); return g; }
  return p.build('house');
}
// a villa: two flat-roofed storeys, glass bands, a pool, palms
export function buildVilla(o) {
  const { x, y, w, bw, bd, pool, lotY1 } = o, p = new Part(), z = CURB;
  const bx = x + 3, by = y + 7;
  p.box(bx, by, z, bw, bd, 3.6);
  p.box(bx - 0.4, by - 0.4, z + 3.6, bw + 0.8, bd + 0.8, 0.3);
  p.box(bx + 5, by + 1.5, z + 3.9, bw - 8, bd - 4, 3.1);
  p.box(bx + 4.6, by + 1.1, z + 7.0, bw - 7.2, bd - 3.2, 0.3);
  const F1 = FRONT(bx, by + bd, z + 3.6), F2 = FRONT(bx + 5, by + 1.5 + bd - 4, z + 7.0);
  p.fill2(F1, 1.2, 0.5, bw - 6, 2.7, 'window').rect2(F1, 1.2, 0.5, bw - 6, 2.7, 'line');
  for (let u = 3.2; u < bw - 5; u += 2) p.draw(F1, [u, 0.5, u, 3.2], 'line');
  p.fill2(F1, bw - 3.6, 0.9, 1.4, 2.7).rect2(F1, bw - 3.6, 0.9, 1.4, 2.7, 'line');
  p.fill2(F2, 1, 0.5, bw - 10, 2.0, rng() < 0.6 ? 'window' : 'glass').rect2(F2, 1, 0.5, bw - 10, 2.0, 'line');
  const S1 = SIDE(bx + bw, by + bd, z + 3.6);
  p.fill2(S1, 1.5, 0.6, bd - 3, 1.6, rng() < 0.5 ? 'window' : 'glass').rect2(S1, 1.5, 0.6, bd - 3, 1.6, 'line');
  // terrace and pool
  const L = TOP(0, 0, z);
  p.box(pool[0] - 0.8, pool[1] - 0.8, z, pool[2] + 1.6, pool[3] + 1.6, 0.12);
  p.fill2(TOP(0, 0, z + 0.12), pool[0], pool[1], pool[2], pool[3], 'sea', 0.02).rect2(TOP(0, 0, z + 0.12), pool[0], pool[1], pool[2], pool[3], 'line', 0.03);
  for (let k = 0; k < 3; k++) p.draw(TOP(0, 0, z + 0.12), [pool[0] + 1 + k * 2.6, pool[1] + pool[3] * 0.4, pool[0] + 2.2 + k * 2.6, pool[1] + pool[3] * 0.4], 'detail', 0.04);
  for (const k of [0, 1]) p.box(pool[0] + pool[2] + 1.4, pool[1] + 0.6 + k * 2, z, 1.8, 0.7, 0.35);
  p.fill2(L, bx + bw - 3.8, by + bd, 1.2, lotY1 - by - bd, 'deck', 0.03);
  // a low wall along the street with a gate, palms
  p.box(x + 0.4, lotY1 - 0.7, z, bw - 3.8 + 2.6, 0.35, 0.8); p.box(bx + bw - 1.9, lotY1 - 0.7, z, x + w - 0.4 - (bx + bw - 1.9), 0.35, 0.8);
  for (const [px, py] of o.palms) palm(p, px, py, rand(0.9, 1.15), z);
  p.box(x + 0.4, y + 1.2, z, w - 0.8, 0.9, 1.3, 'gs');
  return p.build('villa');
}
