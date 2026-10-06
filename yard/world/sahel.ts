import * as THREE from 'three';
import { FRONT, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { BRT_STOPS, CITY, CURB, MARINA, SEA_Z } from '../layout';
import { crown, lampPost, palm, tree, yaw } from './ground';

// Sahel's streets: the asphalt and its paint, the kerbs' furniture (lamps, palms, parked cars), the boulevard with its
// busway, and the marina off the beach. The blocks themselves are kerbed with the old town's (layout's BLOCKS); what
// stands on them is in sahelBuildings.
const G = TOP(0, 0, 0), AV = CITY.av, [NY0, NY1] = CITY.north, [BY0, BY1] = CITY.blvd, [SY0, SY1] = CITY.souq, [CY0, CY1] = CITY.corniche;
const L = CITY.lanes;
// ground the stations will stand on, kept clear of street furniture: Central over Najd Av and Souq St, Motor District
// over Najd Av at the north end, Port over Souq St's east end
export const STATION_SITES: [number, number, number, number][] = [[612, 704, 160, 250], [646, 670, 16, 110], [866, 952, 190, 222]];
const onSite = (x: number, y: number) => STATION_SITES.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
const nearAv = (x: number, m = 9) => AV.some(a => Math.abs(x - a) < m);

// zebra stripes across a street from (x0, y0) to (x1, y1)
function zebra(p: Part, x0: number, y0: number, x1: number, y1: number, z = 0.04) {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  for (let d = 0.9; d < len - 0.6; d += 1.1) { const cx = x0 + ux * d, cy = y0 + uy * d;
    p.poly('deck', [[-0.28, -1.4], [0.28, -1.4], [0.28, 1.4], [-0.28, 1.4]].map(([a, b]) => W(cx + ux * a - uy * b, cy + uy * a + ux * b, z))); }
}
// centre dashes along a line, missing out where skip says (junctions)
function dashes(p: Part, x0: number, y0: number, x1: number, y1: number, skip: (x: number, y: number) => boolean, k = 'line') {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  for (let d = 1; d < len - 3; d += 6) { const x = x0 + ux * d, y = y0 + uy * d; if (!skip(x, y) && !skip(x + ux * 3, y + uy * 3)) p.draw(G, [x, y, x + ux * 3, y + uy * 3], k, 0.05); }
}
// Sahel's lamps: a tall pole, a slim arm out over the street (one each way on the median), a lamp head at its end
export function cityLamp(p: Part, x: number, y: number, double = false, ax = 0, ay = 1, z = CURB) {
  p.box(x - 0.11, y - 0.11, z, 0.22, 0.22, 7.2);
  const [hw, hd] = ax ? [0.9, 0.4] : [0.4, 0.9];
  for (const s of double ? [1, -1] : [1]) {
    const hx = x + ax * 1.8 * s, hy = y + ay * 1.8 * s;
    p.seg('line', W(x, y, z + 7.0), W(hx, hy, z + 7.25)).box(hx - hw / 2, hy - hd / 2, z + 7.05, hw, hd, 0.16, 'l');
  }
}
// a date palm: straighter and taller than the seafront's, a heavier crown of fronds
export function datePalm(p: Part, x: number, y: number, s = 1, z = CURB) {
  const top = W(x, y, z + 7.2 * s);
  p.geo(new THREE.CylinderGeometry(0.2, 0.3, 7.2 * s, 7), new THREE.Matrix4().compose(W(x, y, z + 3.6 * s), new THREE.Quaternion(), v3(1, 1, 1)));
  const a0 = rand(0, 1);
  for (let i = 0; i < 9; i++) { const a = a0 + i / 9 * Math.PI * 2, c = Math.cos(a), d = Math.sin(a), up = i % 2 ? 0.5 : 0.2;
    const m = top.clone().add(v3(c * 1.6 * s, up * s, d * 1.6 * s)), e = top.clone().add(v3(c * 3.0 * s, (up - 1.2) * s, d * 3.0 * s));
    p.seg('line', top, m).seg('line', m, e); }
  p.geo(crown, new THREE.Matrix4().compose(top, yaw(a0), v3(0.5 * s, 0.45 * s, 0.5 * s)));
}
// a car parked at the kerb, drawn into the street's part, along x or along y
export function parkedCar(p: Part, x: number, y: number, alongX = true, tone = 'n') {
  const [l, w] = alongX ? [4.2, 1.9] : [1.9, 4.2], [l2, w2] = alongX ? [2.1, 1.7] : [1.7, 2.1];
  p.box(x - l / 2, y - w / 2, 0.35, l, w, 0.75, tone).box(x - l2 / 2, y - w2 / 2, 1.1, l2, w2, 0.62, tone);
  for (const a of [-1.3, 1.3]) for (const b of [-0.97, 0.97]) {
    const [wx, wy] = alongX ? [x + a, y + b] : [x + b, y + a];
    p.box(wx - (alongX ? 0.34 : 0.13), wy - (alongX ? 0.13 : 0.34), 0, alongX ? 0.68 : 0.26, alongX ? 0.26 : 0.68, 0.68, 'kb');
  }
}

export function buildSahelGround() {
  const p = new Part(), GC = TOP(0, 0, CURB);
  // ---- asphalt: the boulevard (busways a shade lighter), the streets and avenues ----
  p.fill2(G, 520, BY0, 480, BY1 - BY0, 'glass', 0.02);
  for (const [y0, y1] of [[CITY.sep[0][1], CITY.median[0]], [CITY.median[1], CITY.sep[1][0]]]) p.fill2(G, 547, y0, 453, y1 - y0, 'road', 0.022);
  p.fill2(G, 533, NY0, 354, NY1 - NY0, 'glass', 0.02).fill2(G, 533, SY0, 354, SY1 - SY0, 'glass', 0.02);
  for (const a of AV) { const y0 = a === 640 ? 2 : NY0; p.fill2(G, a - 7, y0, 14, CY0 - y0, 'glass', 0.02); }
  // kerb lines where no block kerbs the asphalt: the boulevard's flare from the east arm, the edges at the plate's east
  p.draw(G, [520, BY0, 520, 124, 520, 138, 520, BY1, 960, BY0, 1000, BY0, 960, BY1, 1000, BY1], 'line', 0.05);
  // ---- paint ----
  const jn = (x: number, y: number) => nearAv(x) && (y > NY0 - 2 && y < NY1 + 2 || y > BY0 - 2 && y < BY1 + 2 || y > SY0 - 2 && y < SY1 + 2 || y > CY0 - 2);
  dashes(p, 533, 13, 887, 13, jn); dashes(p, 533, 205, 887, 205, jn);
  for (const a of AV) dashes(p, a, a === 640 ? 2 : NY0, a, CY0, (x, y) => y < NY1 + 2 && y > NY0 - 2 || y > BY0 - 2 && y < BY1 + 2 || y > SY0 - 2 && y < SY1 + 2);
  // the busways: a solid line along each, BUS on the asphalt, a stop line before each avenue
  for (const y of [CITY.sep[0][1] + 0.25, CITY.median[0] - 0.25, CITY.median[1] + 0.25, CITY.sep[1][0] - 0.25]) p.draw(G, [547, y, 1000, y], 'detail', 0.05);
  for (const x of [668, 900]) p.text(G, 'BUS', x, L.bW + 0.6, 1.4, 'paint', 'middle').text(G, 'BUS', x + 60, L.bE + 0.6, 1.4, 'paint', 'middle');
  // zebras: across each avenue either side of each street, across each street either side of each avenue (the
  // boulevard's only on its asphalt, with the strips and median as refuges)
  const streets = [[NY0, NY1], [SY0, SY1]];
  for (const a of AV) {
    for (const [y0, y1] of [...streets, [BY0, BY1]]) for (const y of [y0 - 1.7, y1 + 1.7]) if (y > NY0 || a === 640) zebra(p, a - 7, y, a + 7, y);
    zebra(p, a - 7, CY0 - 1.7, a + 7, CY0 - 1.7);
    for (const x of [a - 8.7, a + 8.7]) {
      for (const [y0, y1] of streets) if (x > 533 && x < 887) zebra(p, x, y0, x, y1);
      for (const [y0, y1] of [[BY0, CITY.sep[0][0]], [CITY.sep[0][1], CITY.median[0]], [CITY.median[1], CITY.sep[1][0]], [CITY.sep[1][1], BY1]]) zebra(p, x, y0, x, y1);
      zebra(p, x, CY0, x, CY1);
    }
  }
  // street names on the asphalt
  p.text(G, 'SAHEL BLVD', 552, L.gE + 0.6, 1.3, 'paint').text(G, 'SAHEL BLVD', 770, L.gW + 0.6, 1.3, 'paint').text(G, 'NORTH ST', 552, 16.9, 1.2, 'paint')
    .text(G, 'SOUQ ST', 690, 209, 1.2, 'paint').text(G, 'CORNICHE', 552, 271, 1.3, 'paint');
  // ---- the boulevard's strips and median: palms on the strips, double lamps down the median (clear of the stops) ----
  for (const [x0, x1] of [[547, 633], [647, 753], [767, 873], [887, 1000]]) {
    for (let x = x0 + 5; x < x1 - 3; x += 12) for (const [y0, y1] of CITY.sep) if (Math.abs(x - 658) > 3 && !BRT_STOPS.some(q => Math.abs(x - q) < 15)) datePalm(p, x, (y0 + y1) / 2, rand(0.85, 1.05), CURB); else rand(0, 1);
    const m1 = Math.min(x1, 962);
    for (let x = x0 + 12; x < m1 - 4; x += 24) if (!BRT_STOPS.some(s => Math.abs(x - s) < 16) && Math.abs(x - 658) > 5) cityLamp(p, x, (CITY.median[0] + CITY.median[1]) / 2, true, 0, 1);
    p.draw(GC, [x0 + 0.6, CITY.median[0] + 0.6, m1 - 0.6, CITY.median[0] + 0.6, x0 + 0.6, CITY.median[1] - 0.6, m1 - 0.6, CITY.median[1] - 0.6], 'detail', 0.03);
  }
  // ---- pavements: an inner line round every block, lamps along the kerbs, parked cars on North St ----
  for (const [x0, x1, y0, y1] of [[547, 633, 20, 115], [647, 753, 20, 115], [767, 873, 20, 115], [887, 960, 2, 115], [547, 633, 147, 198], [647, 753, 147, 198],
    [767, 873, 147, 198], [547, 633, 212, 260], [647, 753, 212, 260], [767, 873, 212, 260], [887, 960, 147, 260]]) {
    p.rect2(GC, x0 + 3.2, y0 + 3.2, x1 - x0 - 6.4, y1 - y0 - 6.4, 'detail', 0.03);
    for (let x = x0 + 10; x < x1 - 4; x += 24) for (const [y, ay] of [[y0 + 0.9, 1], [y1 - 0.9, -1]]) if (!onSite(x, y)) cityLamp(p, x, y, false, 0, -ay);
  }
  for (let x = 552; x < 870; x += 6.2) { if (nearAv(x, 11) || onSite(x, 18)) continue; if (rand(0, 1) < 0.72) parkedCar(p, x, 18.6, true, rand(0, 1) < 0.4 ? 'k' : 'n'); }
  p.draw(G, [547, 17.4, 633, 17.4, 647, 17.4, 753, 17.4, 767, 17.4, 873, 17.4], 'detail', 0.05);
  // the railway's fence along the north side of North St
  for (let x = 534; x < 960; x += 4) if (x < 632 || x > 648) p.seg('line', W(x, 3.2, CURB), W(x, 3.2, CURB + 2.2));
  for (const k of [1.0, 2.1]) p.seg('line', W(534, 3.2, CURB + k), W(632, 3.2, CURB + k)).seg('line', W(648, 3.2, CURB + k), W(960, 3.2, CURB + k));
  // the west verge, where the city meets the green belt: palms along it, a gateway pylon each side of the boulevard
  for (let y = 26; y < 258; y += 11) if (y < 112 || y > 150) { if (y > 194 && y < 216) continue; datePalm(p, 526.5, y, rand(0.85, 1.05)); }
  for (const y of [110.5, 151.5]) { p.box(524, y - 1.2, CURB, 2.4, 2.4, 9).box(523.6, y - 1.6, CURB + 9, 3.2, 3.2, 0.4, 'k').fill2(FRONT(524, y + 1.2, CURB + 8.4), 0.3, 0.3, 1.8, 7.4, 'window', 0.03); }
  p.text(FRONT(524, 152.7, CURB + 8.6), 'SAHEL', 1.2, 1.2, 0.7, 'ink', 'middle', 0.04);
  buildMarina(p);
  return p.build('sahelGround');
}

// The marina: the promenade's rail and palms, a beach west of it, the jetty and its finger piers over the water,
// yachts in their berths, and a mole of rocks round the basin
function buildMarina(p: Part) {
  const M = MARINA, [j0, j1] = M.jetty, z = M.deck;
  for (let x = 522; x < 640; x += 4) p.seg('line', W(x, 278.7, CURB), W(x, 278.7, CURB + 1.0));
  p.seg('line', W(520, 278.7, CURB + 0.46), W(j0 - 0.4, 278.7, CURB + 0.46)).seg('line', W(j1 + 0.4, 278.7, CURB + 0.46), W(640, 278.7, CURB + 0.46));
  p.seg('line', W(520, 278.7, CURB + 0.96), W(j0 - 0.4, 278.7, CURB + 0.96)).seg('line', W(j1 + 0.4, 278.7, CURB + 0.96), W(640, 278.7, CURB + 0.96));
  for (let x = 530; x < 640; x += 22) palm(p, x, 275.1, rand(0.9, 1.05), CURB);
  for (let x = 541; x < 640; x += 44) lampPost(p, x, 274.8, 0, -1);
  // the beach, and the shelf of sand down to the water under the jetty
  p.fill2(G, 520, 279, 120, 10, 'sand', 0.015).poly('sand', [W(520, 289, 0.015), W(640, 289, 0.015), W(640, 296, SEA_Z + 0.015), W(520, 296, SEA_Z + 0.015)]);
  for (let i = 0; i < 70; i++) { const x = rand(521, 638), y = rand(280, 294.5), zz = y > 289 ? (y - 289) / 7 * SEA_Z : 0; p.seg('detail', W(x, y, zz + 0.04), W(x + 0.35, y + 0.2, zz + 0.04)); }
  // sun loungers and shades on the beach west of the jetty
  for (let x = 526; x < 590; x += 7) { p.box(x, 283, 0, 0.7, 1.9, 0.32).box(x + 1.4, 283, 0, 0.7, 1.9, 0.32);
    p.seg('line', W(x + 1.05, 285.6, 0), W(x + 1.05, 285.6, 2.3)); p.geo(new THREE.ConeGeometry(1.4, 0.45, 4), new THREE.Matrix4().compose(W(x + 1.05, 285.6, 2.45), yaw(Math.PI / 4), v3(1, 1, 1)), 'k'); }
  // the jetty, on piles, with a ramp up from the promenade, and three pairs of finger piers
  p.box(j0, 281, z - 0.25, j1 - j0, 46, 0.25).extrude([[j0, 278.7, 0.15], [j0, 281, z], [j0, 281, z - 0.25], [j0, 278.7, 0.01]], [j1 - j0, 0, 0]);
  for (let y = 281; y < 327; y += 4.5) for (const x of [j0 + 0.2, j1 - 0.5]) p.box(x, y, SEA_Z - 0.4, 0.3, 0.3, z - SEA_Z + 0.15);
  for (const fy of M.fingers) {
    p.box(571, fy - 1.2, z - 0.25, 58, 2.4, 0.25);
    for (let x = 573; x < 629; x += 5) for (const y of [fy - 1.1, fy + 0.8]) p.box(x, y, SEA_Z - 0.4, 0.3, 0.3, z - SEA_Z + 0.1);
    for (const x of [571.2, 628.4]) p.box(x, fy - 0.2, z, 0.4, 0.4, 0.5, 'k');   // bollards at the ends
  }
  lampPost(p, j1 - 0.4, 326.2, -1, 0, z);
  // yachts alongside the fingers, west of the jetty bows east and east of it bows west
  const yacht = (stern: number, y: number, len: number, dir: number, sail: boolean) => {
    const b = len * 0.3, at = (u: number, v: number) => [stern + dir * u, y + v, SEA_Z + 0.1];
    p.extrude([at(0, -b / 2), at(len * 0.78, -b / 2), at(len, 0), at(len * 0.78, b / 2), at(0, b / 2)], [0, 0, 0.9], 'n');
    const c0 = stern + dir * len * 0.22, c1 = stern + dir * len * 0.6;
    p.box(Math.min(c0, c1), y - b * 0.3, SEA_Z + 1.0, Math.abs(c1 - c0), b * 0.6, 0.7, 'k');
    if (sail) p.seg('line', W(stern + dir * len * 0.55, y, SEA_Z + 1.7), W(stern + dir * len * 0.55, y, SEA_Z + 1.0 + len * 1.1));
  };
  for (const fy of M.fingers) for (const dy of [-2.6, 2.6]) for (const [stern, dir] of [[574.5, 1], [585.5, 1], [625.5, -1], [614.5, -1]])
    if (rand(0, 1) < 0.78) yacht(stern, fy + dy, rand(7, 8.6), dir, rand(0, 1) < 0.5);
  // the mole: rocks round the basin's south and east sides, a light at its end
  for (let x = 562; x < 640; x += 1.7) p.geo(crown, new THREE.Matrix4().compose(W(x + rand(-0.5, 0.5), M.mole, SEA_Z + 0.2), yaw(rand(0, 3)), v3(rand(1.3, 1.9), rand(0.8, 1.3), rand(1.3, 1.9))));
  for (let y = 298; y < M.mole; y += 1.7) p.geo(crown, new THREE.Matrix4().compose(W(639 + rand(-0.5, 0.5), y, SEA_Z + 0.2), yaw(rand(0, 3)), v3(rand(1.3, 1.9), rand(0.8, 1.3), rand(1.3, 1.9))));
  p.cylZ(562, M.mole, SEA_Z, 1.1, 2.6, 10).cylZ(562, M.mole, SEA_Z + 2.6, 0.75, 1.6, 10, 'k').box(561.6, M.mole - 0.4, SEA_Z + 4.2, 0.8, 0.8, 0.5, 'l');
  // the harbour master's hut at the head of the jetty, and the marina's name on the promenade's edge
  p.box(603.2, 276.4, CURB, 4.2, 2.4, 2.8).box(602.9, 276.1, CURB + 2.8, 4.8, 3.0, 0.2, 'k');
  p.fill2(FRONT(603.2, 278.8, CURB + 2.8), 0.4, 0.6, 1.6, 1.0, 'window').fill2(FRONT(603.2, 278.8, CURB + 2.8), 2.4, 0.5, 1.0, 2.2, 'glass');
  p.text(G, 'SAHEL MARINA', 606, 277.6, 0.9, 'paint', 'start', CURB + 0.03);
}
