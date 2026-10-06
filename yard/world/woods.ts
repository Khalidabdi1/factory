import * as THREE from 'three';
import { TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { CITY, CURB, MOTORS, SEA_Z, WOODS, WORLD } from '../layout';
import { crown, lampPost, palm, pine, tree, yaw } from './ground';
import { hillHeight, onTerrace } from './range';

// The woods round both towns. West of the old town a strip of mixed wood runs from the foot of the hills to the
// promenade, with Riverside Rd, Coast Rd and the railway cut through it and a footpath out from Mill Park's gate.
// Between the towns lies the green belt, and east of Sahel a last strip of wood before the edge of the plate. On the
// hills above both towns, pines climb the lower slopes as far as the snow line.

type Rect = [number, number, number, number];
const [WX0, WX1] = WOODS.west, [BX0, BX1] = WOODS.belt, [EX0, EX1] = WOODS.east;
export const FOOT_Y = 200;   // the footpaths through the woods run along this line, east and west

// ground the trees keep off: roads and their verges, the railway, the footpaths, the promenade and beach, and the
// clearing in the green belt for Market St station and the metro's viaduct
const CLEAR: Rect[] = [
  [WX0 - 10, 410, 119.5, 142.5], [430, BX1 + 4, 119.5, 142.5],
  [WX0 - 10, WORLD.x1 + 10, 255.5, 300],
  [WX0 - 10, WORLD.x1 + 10, -4.5, 2.6], [400, MOTORS.sidingX[1] + 30, -11.5, 2.6],
  [WX0 - 10, 4, FOOT_Y - 2.6, FOOT_Y + 2.6], [436, BX1 + 4, FOOT_Y - 2.6, FOOT_Y + 2.6],
  [426, 516, 184, 226], [436, BX1 + 4, 194, 216],
  [EX0 - 4, WORLD.x1 + 10, CITY.blvd[0] - 4, CITY.blvd[1] + 4], [EX0 - 4, WORLD.x1 + 10, CITY.north[0] - 4, CITY.north[1] + 4],
];
export const inClearing = (x: number, y: number) => CLEAR.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1);

// a broad-leaved tree with two crowns, one a little higher and to the side of the other
function oak(p: Part, x: number, y: number, s = 1) {
  p.box(x - 0.26 * s, y - 0.26 * s, 0, 0.52 * s, 0.52 * s, 2.0 * s);
  p.geo(crown, new THREE.Matrix4().compose(W(x, y, 3.6 * s), yaw(rand(0, 3)), v3(2.3 * s, 2.0 * s, 2.3 * s)));
  const a = rand(0, Math.PI * 2);
  p.geo(crown, new THREE.Matrix4().compose(W(x + Math.cos(a) * 1.1 * s, y + Math.sin(a) * 1.1 * s, 5.0 * s), yaw(rand(0, 3)), v3(1.5 * s, 1.4 * s, 1.5 * s)));
}
// a poplar: tall and narrow, a stretched crown
function poplar(p: Part, x: number, y: number, s = 1) {
  p.box(x - 0.16 * s, y - 0.16 * s, 0, 0.32 * s, 0.32 * s, 1.6 * s);
  p.geo(crown, new THREE.Matrix4().compose(W(x, y, 4.6 * s), yaw(rand(0, 3)), v3(1.1 * s, 3.4 * s, 1.1 * s)));
}

// a stretch of wood over a rectangle: a jittered grid of trees, a few kinds mixed, leaving the clearings
function wood(p: Part, [x0, x1, y0, y1]: Rect, step = 6.4) {
  for (let gx = x0 + step / 2; gx < x1; gx += step) for (let gy = y0 + step / 2; gy < y1; gy += step) {
    const x = gx + rand(-2.4, 2.4), y = gy + rand(-2.4, 2.4), kind = rand(0, 1), s = rand(0.78, 1.25);
    if (x < x0 + 0.8 || x > x1 - 0.8 || y < y0 + 0.8 || y > y1 - 0.8 || inClearing(x, y) || kind < 0.06) { rand(0, 3); continue; }
    if (kind < 0.42) tree(p, x, y, s); else if (kind < 0.66) pine(p, x, y, s * 1.1); else if (kind < 0.86) oak(p, x, y, s * 0.9); else poplar(p, x, y, s);
  }
}

// a road through the woods: asphalt, a kerb line each side, the centre dashes (lined up with the old town's)
function road(p: Part, x0: number, x1: number, y0: number, y1: number, skip: (x: number) => boolean = () => false) {
  const G = TOP(0, 0, 0), yc = (y0 + y1) / 2;
  p.fill2(G, x0, y0, x1 - x0, y1 - y0, 'glass', 0.02).draw(G, [x0, y0, x1, y0, x0, y1, x1, y1], 'line', 0.05);
  for (let x = Math.ceil((x0 - 1) / 6) * 6 + 1; x + 3 < x1; x += 6) if (!skip(x) && !skip(x + 3)) p.draw(G, [x, yc, x + 3, yc], 'line', 0.05);
}

// the promenade's run through the woods: its rail, palms and lamps, and the beach below it
function seafront(p: Part, x0: number, x1: number) {
  const G = TOP(0, 0, 0);
  const n = Math.max(1, Math.round((x1 - x0) / 4));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; p.seg('line', W(x, 278.7, CURB), W(x, 278.7, CURB + 1.0)); }
  for (const k of [0.46, 0.96]) p.seg('line', W(x0, 278.7, CURB + k), W(x1, 278.7, CURB + k));
  for (let x = Math.ceil((x0 - 10) / 22) * 22 + 10; x < x1; x += 22) palm(p, x, 275.1, rand(0.85, 1.05), CURB);
  for (let x = Math.ceil((x0 - 21) / 44) * 44 + 21; x < x1; x += 44) lampPost(p, x, 274.8, 0, -1);
  p.fill2(G, x0, 279, x1 - x0, 10, 'sand', 0.015);
  p.poly('sand', [W(x0, 289, 0.015), W(x1, 289, 0.015), W(x1, 296, SEA_Z + 0.015), W(x0, 296, SEA_Z + 0.015)]);
  for (let i = 0; i < (x1 - x0) * 0.6; i++) { const x = rand(x0 + 1, x1 - 1), y = rand(280, 294.5), z = y > 289 ? (y - 289) / 7 * SEA_Z : 0; p.seg('detail', W(x, y, z + 0.04), W(x + 0.35, y + 0.2, z + 0.04)); }
}

export function buildWoods() {
  const p = new Part(), G = TOP(0, 0, 0);
  // roads: Riverside Rd and Coast Rd west to the edge, Riverside Rd's east arm through the green belt, Coast Rd east
  const nearAv = (x: number) => CITY.av.some(a => Math.abs(x - a) < 8);
  road(p, WX0, 0, 124, 138); road(p, WX0, 0, 260, 274);
  road(p, 436, BX1, 124, 138); road(p, 440, WORLD.x1, 260, 274, nearAv);
  p.text(G, 'COAST RD', BX0 + 8, 269.6, 1.3, 'paint').text(G, 'RIVERSIDE RD', BX0 + 6, 133.6, 1.3, 'paint');
  // footpaths: out of Mill Park's west gate, and across the green belt from the end of Market St
  p.fill2(G, WX0, FOOT_Y - 0.9, -WX0, 1.8, 'deck', 0.025).fill2(G, 436, FOOT_Y - 0.9, BX1 - 436, 1.8, 'deck', 0.025);
  seafront(p, WX0, 0); seafront(p, BX0, BX1);
  // the woods
  wood(p, [WX0, -1.5, -4, 256]); wood(p, [BX0, BX1, -4, 256]); wood(p, [EX0, EX1, -4, 256]);
  // pines over the hills, thick on the lower slopes and thinning out towards the snow line; none on the terraces,
  // nor on the levelled strip along the railway
  for (let gx = WORLD.x0 + 3; gx < WORLD.x1 - 2; gx += 7) for (let gy = -70; gy < -7; gy += 7) {
    const x = gx + rand(-2.6, 2.6), y = gy + rand(-2.6, 2.6), s = rand(0.7, 1.15), r = rand(0, 1), z = hillHeight(x, y);
    const keep = z < 16 ? 0.62 : z < 24 ? 0.3 : z < 30 ? 0.08 : 0;
    if (r > keep || y > -8 || onTerrace(x - 2, y) || onTerrace(x + 2, y + 2) || inClearing(x, y) || x > 400 && x < MOTORS.sidingX[1] + 30 && y > -13) { rand(0, 3); continue; }
    pine(p, x, y, s, z - 0.2);
  }
  return p.build('woods');
}
