// @ts-nocheck
import * as THREE from 'three';
import { FRONT, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { AV, BAYS, BLOCKS, CURB, DOCKS, RAB, SEA_Z, STAGE, WORLD, ZEBRA_X } from '../layout';
import { buildOrchard, orchardClear } from './orchard';

// ---- static scene ----
export const crown = new THREE.IcosahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 1, 7), roof4 = new THREE.ConeGeometry(1, 1, 4);
export const yaw = a => new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), a);
export function tree(p, x, y, s = 1, z = 0) {
  p.box(x - 0.22 * s, y - 0.22 * s, z, 0.44 * s, 0.44 * s, 2.2 * s);
  p.geo(crown, new THREE.Matrix4().compose(W(x, y, z + 2.2 * s + 1.7 * s), yaw(rand(0, 3)), v3(2 * s, 2.2 * s, 2 * s)));
}
export function pine(p, x, y, s = 1, z = 0) {
  p.box(x - 0.15 * s, y - 0.15 * s, z, 0.3 * s, 0.3 * s, 1.2 * s);
  p.geo(cone, new THREE.Matrix4().compose(W(x, y, z + 3.2 * s), yaw(rand(0, 3)), v3(1.5 * s, 4.4 * s, 1.5 * s)));
}
// a palm: a leaning trunk and hairline fronds
export function palm(p, x, y, s = 1, z = 0) {
  const lean = rand(-0.6, 0.6), top = W(x + lean * s, y + lean * 0.4 * s, z + 5.4 * s);
  p.geo(new THREE.CylinderGeometry(0.14, 0.22, 5.4 * s, 6), new THREE.Matrix4().compose(W(x + lean * s / 2, y + lean * 0.2 * s, z + 2.7 * s),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 0.04, 0, -lean * 0.18 / s)), v3(1, 1, 1)));
  const a0 = rand(0, 1);
  for (let i = 0; i < 7; i++) { const a = a0 + i / 7 * Math.PI * 2, c = Math.cos(a), d = Math.sin(a);
    const m = top.clone().add(v3(c * 1.5 * s, 0.35 * s, d * 1.5 * s)), e = top.clone().add(v3(c * 2.7 * s, -0.9 * s, d * 2.7 * s));
    p.seg('line', top, m).seg('line', m, e); }
  p.geo(crown, new THREE.Matrix4().compose(top, yaw(a0), v3(0.38 * s, 0.32 * s, 0.38 * s)));
}
export function lampPost(p, x, y, ax, ay, z = CURB) {
  p.box(x - 0.08, y - 0.08, z, 0.16, 0.16, 4.4);
  const hx = x + ax * 1.1, hy = y + ay * 1.1;
  p.seg('line', W(x, y, z + 4.3), W(hx, hy, z + 4.3));
  p.box(hx - 0.3, hy - 0.18, z + 4.05, 0.6, 0.36, 0.18, 'l');
}
// a bench facing n, s, e or w: seat, backrest on the far side, two legs
// Mill Park's benches; walkers who stop in the park sit on them
export const PARK_BENCHES = [[11, 175, 'e'], [11, 225, 'e'], [39, 225, 'w'], [25, 252.4, 'n'], [25, 147.6, 's']];
function bench(p, x, y, face = 's', z = CURB) {
  if (face === 'n' || face === 's') { const b = face === 's' ? -0.28 : 0.2;
    p.box(x - 0.9, y - 0.25, z + 0.4, 1.8, 0.5, 0.08); p.box(x - 0.9, y + b, z + 0.48, 1.8, 0.08, 0.45); for (const dx of [-0.75, 0.65]) p.box(x + dx, y - 0.2, z, 0.1, 0.4, 0.4); }
  else { const b = face === 'e' ? -0.28 : 0.2;
    p.box(x - 0.25, y - 0.9, z + 0.4, 0.5, 1.8, 0.08); p.box(x + b, y - 0.9, z + 0.48, 0.08, 1.8, 0.45); for (const dy of [-0.75, 0.65]) p.box(x - 0.2, y + dy, z, 0.4, 0.1, 0.4); }
}
export const ring = (cx, cy, r, z, n = 40) => { const s = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
  s.push(W(cx + r * Math.cos(a), cy + r * Math.sin(a), z), W(cx + r * Math.cos(b), cy + r * Math.sin(b), z)); } return s; };
export function buildWorld() {
  const p = new Part(), G = TOP(0, 0, 0);
  // the slab in section: land to the beach crest, the beach shelving into the sea, the sea floor
  p.extrude([[0, WORLD.y0, -4], [0, WORLD.y1, -4], [0, WORLD.y1, SEA_Z], [0, 296, SEA_Z], [0, 289, 0], [0, WORLD.y0, 0]], [WORLD.x1, 0, 0], 'gr');
  // asphalt: the main road, the roundabout, the two lay-bys, the yards' own roads, then the town's streets
  p.fill2(G, 0, 124, 404, 14, 'glass', 0.02);
  const disk = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; disk.push(W(RAB.x + 14.5 * Math.cos(a), RAB.y + 14.5 * Math.sin(a), 0.02)); }
  p.poly('glass', disk);
  p.fill2(G, 344, 118.5, 40, 5.5, 'glass', 0.02); p.fill2(G, 136, 118.5, 62, 5.5, 'glass', 0.02);
  for (const r of [[113, 89, 16, 35], [4, 89, 125, 10], [4, 89, 8.5, 28], [4, 107, 125, 10], [20, 76, 42, 13], [66, 76, 42, 13],
    [314, 89, 16, 35], [322.6, 17, 6.8, 72], [208, 89, 122, 10], [208, 17, 8, 100], [208, 105, 122, 10], [216, 17, 12, 6], [308, 17, 15, 6],
    [224, 76, 42, 13], [268, 76, 42, 13], [219, 178, 43, 20]]) p.fill2(G, ...r, 'road', 0.02);
  for (const r of [[53, 138, 14, 136], [173, 138, 14, 136], [293, 138, 14, 136], [413, 138, 14, 136], [405, 138, 8, 4.6], [53, 198, 374, 14], [0, 260, 440, 14],
    [345, 138, 39, 4.6]]) p.fill2(G, ...r, 'glass', 0.02);
  // road paint: the main road's north kerb (gaps for the gates and lay-bys), centre lines, the roundabout's edges
  const kx = RAB.x - Math.sqrt(14.5 ** 2 - 7 ** 2);
  p.draw(G, [0, 124, 112, 124, 130, 124, 136, 124, 198, 124, 314, 124, 332, 124, 340, 124, 390, 124, kx, 124,
    344, 118.5, 384, 118.5, 340, 124, 344, 118.5, 384, 118.5, 390, 124, 136, 124, 140, 118.5, 140, 118.5, 194, 118.5, 194, 118.5, 198, 124], 'line', 0.05);
  const dashes = (x0, y0, x1, y1, skip = () => false) => { const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    for (let d = 1; d < L - 3; d += 6) { const x = x0 + ux * d, y = y0 + uy * d; if (!skip(x, y) && !skip(x + ux * 3, y + uy * 3)) p.draw(G, [x, y, x + ux * 3, y + uy * 3], 'line', 0.05); } };
  const nearAv = x => AV.some(a => Math.abs(x - a) < 8);
  dashes(0, 131, 404, 131); dashes(53, 205, 427, 205, nearAv); dashes(0, 267, 440, 267, nearAv);
  for (const a of AV) dashes(a, a === 420 ? 146 : 139, a, 260, (x, y) => y > 197 && y < 213);
  const outer = ring(RAB.x, RAB.y, 14.5, 0.05, 48); for (let i = 0; i < outer.length; i += 2) {
    const m = outer[i].clone().add(outer[i + 1]).multiplyScalar(0.5);
    if (m.x < kx + 0.5 && Math.abs(m.z - RAB.y) < 7.2 || m.z > RAB.y + 6 && m.x > 412.5 && m.x < 427.5 || m.z < RAB.y - 6 && m.x > 416.5 && m.x < 427.5) continue; p.seg('line', outer[i], outer[i + 1]); }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) { const r0 = 8.5, r1 = 10; p.draw(G, [RAB.x + r0 * Math.cos(a), RAB.y + r0 * Math.sin(a), RAB.x + r1 * Math.cos(a + 0.12), RAB.y + r1 * Math.sin(a + 0.12)], 'detail', 0.05); }
  p.cylZ(RAB.x, RAB.y, 0, 5, 0.35, 24); tree(p, RAB.x, RAB.y, 1.1);
  p.text(G, 'DELIVERIES', 348, 123.3, 1.1, 'paint').text(G, 'TRUCKS', 146, 123.3, 1.1, 'paint');
  p.text(G, 'RIVERSIDE RD', 6, 133.6, 1.3, 'paint').text(G, 'MARKET ST', 76, 207.6, 1.3, 'paint').text(G, 'MARKET ST', 316, 207.6, 1.3, 'paint')
    .text(G, 'COAST RD', 8, 269.6, 1.3, 'paint').text(G, 'COAST RD', 316, 269.6, 1.3, 'paint');
  // zebra crossings: wherever the pavements meet across a street, and the one in front of the shop
  const zebra = (x0, y0, x1, y1) => { const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    for (let d = 0.9; d < L - 0.6; d += 1.1) { const cx = x0 + ux * d, cy = y0 + uy * d;
      p.poly('deck', [[-0.28, -1.4], [0.28, -1.4], [0.28, 1.4], [-0.28, 1.4]].map(([a, b]) => W(cx + ux * a - uy * b, cy + uy * a + ux * b, 0.04))); } };
  zebra(ZEBRA_X, 124, ZEBRA_X, 138);
  for (const a of AV) for (const r of a === 420 ? [196.7, 213.3, 258.7] : [139.3, 196.7, 213.3, 258.7]) zebra(a - 7, r, a + 7, r);
  for (const c of [68.3, 171.7, 188.3, 291.7, 308.3, 411.7]) zebra(c, 198, c, 212);
  for (const c of [51.7, 68.3, 171.7, 188.3, 291.7, 308.3, 411.7, 428.3]) zebra(c, 260, c, 274);
  // customer parking in front of the houses opposite the shop
  for (const x of [349.5, 359.5, 369.5, 379.5]) p.draw(G, [x, 138.4, x, 142.6], 'line', 0.05);
  p.text(G, 'SHOP PARKING', 350, 141.4, 0.8, 'paint');
  // plant yard paint: stop line, lane words, bays, staging, chargers, forklift ways, belt pickup stations
  p.draw(G, [113, 121.4, 121, 121.4], 'line', 0.05);
  p.text(G, 'OUT', 118, 104, 1.6, 'paint', 'middle').text(G, 'IN', 124.6, 104, 1.6, 'paint', 'middle');
  for (const b of BAYS) { p.rect2(G, b.bx - 1, 77, 23, 6, 'line', 0.05); p.text(G, `BAY ${b.id}`, b.bx, 86.6, 1.5, 'paint'); }
  for (const s of STAGE) p.rect2(G, s.x - 1.7, s.y - 1.7, 3.4, 3.4, 'detail', 0.05);
  p.text(G, 'STAGING', 132.4, 98.6, 1.5, 'paint').text(G, 'A', 129.5, 72.6, 1.5, 'paint').text(G, 'B', 129.5, 90.6, 1.5, 'paint');
  for (const x of [16, 21.5, 27]) p.rect2(G, x - 1.6, 49, 3.2, 6.6, 'detail', 0.05);
  for (let x = 15; x < 186; x += 4) p.draw(G, [x, 66, x + 2, 66], 'detail', 0.05);
  for (let i = 0; i < 3; i++) p.rect2(G, 142.3 + 3.1 * i, 60, 2.4, 2.6, 'detail', 0.05);
  for (let x = 129; x < 187; x += 4) p.draw(G, [x, 81, x + 2, 81], 'detail', 0.05);
  // warehouse yard paint
  p.draw(G, [316, 115.4, 324, 115.4], 'line', 0.05);
  p.text(G, 'OUT', 320, 122.6, 1.3, 'paint', 'middle').text(G, 'IN', 326.4, 122.6, 1.3, 'paint', 'middle');
  for (const d of DOCKS) { p.rect2(G, d.bx - 1, 77, 23, 6, 'line', 0.05); p.text(G, `DOCK ${d.id}`, d.bx, 86.6, 1.5, 'paint'); }
  for (let x = 233; x < 304; x += 4) p.draw(G, [x, 65, x + 2, 65], 'detail', 0.05);
  // fences: hairline posts and two rails
  const fence = (x1, y1, x2, y2, z = 0, h = 2.4) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 4));
    for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; p.seg('line', W(x, y, z), W(x, y, z + h)); }
    for (const k of [0.46, 0.96]) p.seg('line', W(x1, y1, z + h * k), W(x2, y2, z + h * k));
  };
  fence(2, 4, 196, 4); fence(2, 4, 2, 118); fence(196, 4, 196, 118); fence(2, 118, 112, 118); fence(130, 118, 196, 118);
  fence(206, 4, 356, 4); fence(206, 4, 206, 118); fence(356, 4, 356, 118); fence(206, 118, 314, 118); fence(332, 118, 356, 118);
  // plant parking: stalls for the staff cars
  for (let i = 0; i <= 14; i++) { const x = 140 + i * 3.4; p.draw(G, [x, 10, x, 15.5, x, 31.5, x, 37], 'detail', 0.05); }
  p.draw(G, [140, 15.5, 187.6, 15.5, 140, 31.5, 187.6, 31.5], 'detail', 0.05);
  p.text(G, 'STAFF', 140, 24.4, 1.5, 'paint');
  // shop forecourt paving
  for (let x = 358; x <= 398; x += 2) p.draw(G, [x, 112, x, 118.4], 'detail', 0.05);
  for (let y = 113.6; y < 118.4; y += 1.6) p.draw(G, [358, y, 398, y], 'detail', 0.05);
  // yard-side trees
  for (const [x, y] of [[136, 46], [146, 46], [190, 46], [192, 10], [134, 8], [121, 22], [124, 8], [8, 70], [8, 30], [184, 108], [140, 108], [160, 110],
    [201, 30], [201, 80], [220, 8], [342, 12], [350, 32], [344, 52], [350, 72], [342, 92], [359.5, 86], [372, 86], [388, 84], [402, 98], [414, 104], [432, 100], [436, 86]]) tree(p, x, y, rand(0.8, 1.1));
  // the wood behind the shop, less what Orchard Lane cleared (a cleared tree still draws its yaw, keeping the random sequence)
  for (let i = 0; i < 26; i++) { const x = rand(362, 436), y = rand(6, 78), s = rand(0.75, 1.15); if (orchardClear(x, y)) rand(0, 3); else tree(p, x, y, s); }
  for (let x = 8; x < 196; x += rand(9, 14)) tree(p, x, rand(-2.4, 1.6), rand(0.8, 1.05));
  buildTown(p, G, fence);
  buildOrchard(p, G, dashes, fence, bench);
  buildCoast(p, G);
  return p.build('world');
}

// The town's ground: kerbed blocks, lots and gardens, the park, lamps, trees and the promenade.
function buildTown(p, G, fence) {
  for (const [x0, x1, y0, y1] of BLOCKS) p.box(x0, y0, 0, x1 - x0, y1 - y0, CURB);
  const L = TOP(0, 0, CURB);
  const lot = (x0, y0, x1, y1, k) => { if (k) p.fill2(L, x0, y0, x1 - x0, y1 - y0, k, 0.015); p.rect2(L, x0, y0, x1 - x0, y1 - y0, 'detail', 0.03); };
  lot(69.6, 140.6, 170.4, 195.4);
  p.draw(L, [189.6, 140.6, 290.4, 140.6, 290.4, 140.6, 290.4, 195.4, 290.4, 195.4, 262, 195.4, 219, 195.4, 189.6, 195.4, 189.6, 195.4, 189.6, 140.6], 'detail', 0.03);
  lot(309.6, 145.2, 410.4, 195.4, 'grass');
  for (const x0 of [69.6, 189.6, 309.6]) lot(x0, 214.6, x0 + 100.8, 257.4, 'grass');
  p.fill2(L, 429.6, 148.6, 10.4, 108.8, 'grass', 0.015);
  // Mill Park: lawns, a pond inside a loop of paths, a bandstand
  p.fill2(L, 0, 140.6, 50.4, 116.8, 'grass', 0.015);
  for (const r of [[7.1, 149.1, 35.8, 1.8], [7.1, 249.1, 35.8, 1.8], [7.1, 149.1, 1.8, 101.8], [41.1, 149.1, 1.8, 101.8], [0, 199.1, 7.1, 1.8],
    [42.9, 195.8, 7.5, 1.8], [41.1, 140.6, 1.8, 8.5], [41.1, 250.9, 1.8, 6.5]]) p.fill2(L, ...r, 'deck', 0.025);
  const pond = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; pond.push(W(25 + 11 * Math.cos(a), 200 + 26 * Math.sin(a), CURB + 0.03)); }
  p.poly('sea', pond); for (let i = 0; i < 40; i++) p.seg('line', pond[i], pond[(i + 1) % 40]);
  for (let i = 0; i < 6; i++) { const y = 186 + i * 5; p.draw(L, [21 + (i % 2) * 2, y, 25 + (i % 2) * 2, y], 'detail', 0.04); }
  p.cylZ(25, 160, CURB, 2.8, 0.3, 8);
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; p.box(25 + 2.4 * Math.cos(a) - 0.08, 160 + 2.4 * Math.sin(a) - 0.08, CURB + 0.3, 0.16, 0.16, 2.4); }
  p.geo(new THREE.ConeGeometry(3.2, 1.6, 8), new THREE.Matrix4().compose(W(25, 160, CURB + 3.5), yaw(Math.PI / 8), v3(1, 1, 1)));
  for (const [x, y, f] of PARK_BENCHES) bench(p, x, y, f);
  const inPark = (x, y) => ((x - 25) / 14) ** 2 + ((y - 200) / 29) ** 2 < 1 || Math.hypot(x - 25, y - 160) < 5.5 ||
    (y > 146 && y < 253 && (Math.abs(x - 8) < 3 || Math.abs(x - 42) < 3)) || (x > 4 && x < 46 && (Math.abs(y - 150) < 3 || Math.abs(y - 250) < 3)) || (Math.abs(y - 200) < 3 && (x < 9 || x > 40));
  for (let i = 0, n = 0; i < 200 && n < 30; i++) { const x = rand(2.5, 48), y = rand(143, 255); if (!inPark(x, y)) { tree(p, x, y, rand(0.8, 1.25), CURB); n++; } }
  // block E and the plaza in B1: trees; gardens get theirs with their houses
  for (let y = 152; y < 256; y += rand(9, 13)) tree(p, rand(431.5, 437.5), y, rand(0.8, 1.1), CURB);
  for (const x of [106, 118, 160]) for (const y of [146, 160]) tree(p, x, y, 0.95, CURB);
  // pavement lamps: along the main road, Market St on both sides, the avenues and the promenade
  for (const x of [8, 30, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288, 312, 336, 392]) lampPost(p, x, 138.7, 0, -1);
  for (const x of [20, 60, 100, 214, 254, 294, 404]) lampPost(p, x, 123.4, 0, 1, 0);
  for (const x of [80, 104, 132, 156, 196, 274, 318, 344, 368, 394]) lampPost(p, x, 197.4, 0, 1);
  for (const x of [92, 142, 212, 262, 330, 382]) lampPost(p, x, 212.6, 0, -1);
  for (const y of [152, 178, 226, 248]) { lampPost(p, 52.4, y, 1, 0); lampPost(p, 187.6, y, -1, 0); lampPost(p, 307.6, y, -1, 0); lampPost(p, 412.4, y, 1, 0); }
  // the promenade: a rail on the beach side (gaps for the stairs and the pier), palms, lamps and benches
  for (const [a, b] of [[0, 98.5], [103.5, 195.5], [202.5, 298.5], [303.5, 440]]) fence(a, 278.7, b, 278.7, CURB, 1.0);
  for (let x = 10; x < 440; x += 22) palm(p, x, 275.1, rand(0.85, 1.05), CURB);
  for (let x = 21; x < 440; x += 44) lampPost(p, x, 274.8, 0, -1);
  for (const x of [40, 140, 250, 350]) bench(p, x, 277.8, 's');
}

// The beach, the pier, the breakwater and its lighthouse; the sea itself is part of the slab.
function buildCoast(p, G) {
  p.fill2(G, 0, 279, 440, 10, 'sand', 0.015);
  for (let i = 0; i < 260; i++) { const x = rand(1, 438), y = rand(280, 294.5), z = y > 289 ? (y - 289) / 7 * SEA_Z : 0; p.seg('detail', W(x, y, z + 0.04), W(x + 0.35, y + 0.2, z + 0.04)); }
  p.poly('sand', [W(0, 289, 0.015), W(440, 289, 0.015), W(440, 296, SEA_Z + 0.015), W(0, 296, SEA_Z + 0.015)]);
  p.fill2(TOP(0, 296, SEA_Z), 0, 0, 440, 40, 'sea', 0.02);
  p.fill2(FRONT(0, WORLD.y1, SEA_Z), 0, 0, 440, 3.4, 'sea', 0.02);
  for (const x of [99, 299]) for (let i = 0; i < 3; i++) p.box(x + 0.5, 279 + i * 0.5, 0, 4, 0.5, CURB * (3 - i) / 3);
  // beach umbrellas and towels
  const um = new THREE.ConeGeometry(1.5, 0.6, 8);
  for (const [x, y] of [[30, 284], [52, 286], [118, 283.5], [160, 286], [232, 284], [262, 286.5], [330, 284.5], [372, 286]]) {
    p.seg('line', W(x, y, 0), W(x, y, 2.1));
    p.geo(um, new THREE.Matrix4().compose(W(x, y, 2.3), yaw(rand(0, 1)), v3(1, 1, 1)), 'k');
    p.fill2(TOP(x + 0.6, y + 0.4, 0), 0, 0, 0.9, 1.8, 'kod', 0.03);
  }
  // lifeguard tower
  for (const [dx, dy] of [[0, 0], [1.6, 0], [0, 1.6], [1.6, 1.6]]) p.box(250 + dx, 290 + dy, 0, 0.14, 0.14, 2.2);
  p.box(249.8, 289.8, 2.2, 2.1, 2.1, 1.4); p.box(249.6, 289.6, 3.6, 2.5, 2.5, 0.16);
  // the town pier: a deck on piles, rails, a lamp at the end, a dinghy tied up
  p.box(196, 279, 0.9, 6, 34, 0.25);
  for (let y = 281; y < 313; y += 4.5) for (const x of [196.2, 201.5]) p.box(x, y, SEA_Z - 0.4, 0.3, 0.3, 1.5 - SEA_Z);
  for (const x of [196.1, 201.9]) { p.seg('line', W(x, 279, 2.05), W(x, 313, 2.05)); for (let y = 279; y <= 313; y += 3.4) p.seg('line', W(x, y, 1.15), W(x, y, 2.05)); }
  lampPost(p, 201.3, 312.4, -1, 0, 1.15);
  // breakwater rocks
  for (let y = 294; y < 311; y += 1.6) p.geo(crown, new THREE.Matrix4().compose(W(402 + rand(-0.8, 0.8), y, SEA_Z + 0.2), yaw(rand(0, 3)), v3(rand(1.4, 2), rand(0.9, 1.4), rand(1.4, 2))));
}

