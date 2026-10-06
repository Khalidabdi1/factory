import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { crown, lampPost, tree, yaw } from './ground';

// ---- Millbrook, the village at the end of Line 1 ----
// An English farming village on the floor of Millbrook Vale (height 0), round the metro's terminus. East of the Vale
// Road: cottages with pitched roofs, chimneys and front gardens behind picket fences along a lane north of the line and
// another south of the road; a green under the station with an old oak, a pump, benches and a farmers' market; the
// Plough Inn and the village store on the green's side of the road. West of the road: the farm. Fields north of the
// line (wheat, a hay meadow with its bales and a windpump, allotments under the road's loop, the long field the
// tractor ploughs), the millpond and its watermill, a farmyard (a red barn with a gambrel roof and two silos, a cow
// paddock, a sheep pen, a pig sty and a hen run, a paddock for the horses), and the apple orchard with its store.
type Box = [number, number, number, number];
export type House = { id: string, family: string, box: Box, h: number, door: 'e' | 's', at: number[], people: number, farm: string, kind: 'cottage' | 'pub' | 'store' };
const H = (id: string, family: string, box: Box, h: number, door: 'e' | 's', farm: string, people: number, kind: House['kind'] = 'cottage'): House => {
  const [x0, x1, y0, y1] = box, at = door === 'e' ? [x1 + 1.2, (y0 + y1) / 2] : [(x0 + x1) / 2, y1 + 1.2];
  return { id, family, box, h, door, at, people, farm, kind };
};
export const VIL = {
  green:[1788, 1842, 136, 162] as Box, oak:[1814, 149], pump:[1826, 143], stalls:[[1791.5, 143], [1791.5, 150.5], [1791.5, 158]] as number[][],
  barn:[1626, 1644, 134, 146] as Box, silos:[[1648.3, 137.6], [1648.3, 142.6]] as number[][], cows:[1652, 1674, 134, 149] as Box, sheep:[1626, 1648, 154, 170] as Box,
  sty:[1650, 1660, 154, 170] as Box, run:[1662, 1674, 154, 170] as Box, coop:[1666, 1672, 156, 162] as Box,
  horses:[1626, 1656, 175, 192] as Box, store:[1716, 1740, 212, 230] as Box, pond:[1626, 1640, 38, 50] as Box, mill:[1642, 1654, 39, 49] as Box,
  wheel:{ c:[1648, 50.2], z:3.0, r:2.6 }, windpump:[1712, 38],
  fields:[
    { id:'North Field', crop:'wheat', box:[1626, 1666, -2, 34] as Box, rows:'x' },
    { id:'the hay meadow', crop:'hay', box:[1670, 1710, -2, 34] as Box, rows:'x' },
    { id:'the vegetable plots', crop:'beans', box:[1714, 1744, -2, 30] as Box, rows:'y' },
    { id:'the allotments', crop:'vegetables', box:[1656, 1708, 54, 80] as Box, rows:'y' },
    { id:'the long field', crop:'plough', box:[1628, 1738, 86, 110] as Box, rows:'x' }],
  orchard:[[1680, 1740, 134, 210], [1626, 1680, 198, 232], [1680, 1716, 210, 232]] as Box[],
  pasture:[1609, 168], trough:[1618, 181], gates:{ sheep:[1637, 152.5], cows:[1663, 150.5], horses:[1641, 173], sty:[1655, 152.5], run:[1668, 152.5] },
  // the tractor's field: the lanes it ploughs, one after another, and where it stands at night
  plough:{ lanes:[89, 95, 101, 107], x:[1632, 1734], park:[1636, 149.6] },
};
export const HOUSES: House[] = [
  H('Rose Cottage', 'Barlow', [1766, 1790, 24, 38], 5.4, 'e', 'the long field and the orchard', 5),
  H('Brook Cottage', 'Hughes', [1766, 1790, 44, 58], 3.0, 'e', 'the vegetable plots', 3),
  H('Shepherd\'s Cottage', 'Fletcher', [1766, 1790, 64, 78], 5.4, 'e', 'the sheep', 4),
  H('Ivy Cottage', 'Cooper', [1766, 1790, 84, 98], 3.0, 'e', 'the allotments', 2),
  H('Stable Cottage', 'Turner', [1810, 1836, 22, 36], 3.0, 's', 'the horses', 3),
  H('Mill House', 'Whitaker', [1810, 1836, 42, 56], 5.4, 's', 'the mill and the hay meadow', 6),
  H('Orchard View', 'Ashworth', [1810, 1836, 62, 76], 3.0, 's', 'the market stall', 3),
  H('The Old Forge', 'Holloway', [1810, 1836, 82, 96], 5.4, 's', 'the orchard', 4),
  H('Millbrook Stores', 'Pembroke', [1764, 1782, 188, 201], 5.4, 's', 'the store and the post office', 3, 'store'),
  H('Wheat Cottage', 'Marsh', [1790, 1808, 188, 201], 3.0, 's', 'the north field', 4),
  H('The Plough Inn', 'Kendall', [1816, 1836, 188, 201], 5.4, 's', 'the inn', 4, 'pub'),
  H('Dairy Cottage', 'Brook', [1764, 1782, 212, 226], 5.4, 'e', 'the cows', 5),
  H('Hen Cottage', 'Thatcher', [1790, 1808, 212, 226], 3.0, 'e', 'the hens and the pigs', 2),
  H('Fairweather Farm', 'Fairweather', [1816, 1836, 212, 226], 5.4, 'e', 'the tractor', 5)];
// the village lanes and farm tracks, as segments (where people walk)
export const LANES: number[][][] = (() => {
  const L: number[][][] = [];
  const chain = (...pts: number[][]) => { for (let i = 1; i < pts.length; i++) L.push([pts[i - 1], pts[i]]); };
  // north of the line: the lane up the middle of the village, the lane along the line, the station's north stair
  chain([1800, 104], [1800, 20]); chain([1762, 104], [1800, 104], [1823.6, 104], [1840, 104]); chain([1823.6, 104], [1823.6, 110.5]);
  // round the green and across it; the station's south stair onto it
  chain([1790, 138], [1814, 138], [1823.6, 138], [1840, 138], [1840, 150], [1840, 160], [1814, 160], [1812, 160], [1790, 160], [1790, 150], [1790, 138]); chain([1823.6, 129.5], [1823.6, 138]);
  chain([1790, 150], [1808, 150]); chain([1820, 150], [1840, 150]); chain([1814, 138], [1814, 143]); chain([1814, 155], [1814, 160]);
  // over the road to the farm, and south over it to the lower village
  chain([1790, 150], [1764, 150], [1742, 150]); chain([1812, 160], [1812, 186], [1812, 206]);
  chain([1742, 206], [1786, 206], [1812, 206], [1842, 206]);
  // the farm tracks: round the fields and through the orchard
  chain([1742, 104], [1762, 104]); chain([1742, 82], [1742, 104], [1742, 128], [1742, 150], [1742, 206], [1742, 232]);
  chain([1621, -2], [1621, 36], [1621, 82], [1621, 128], [1621, 151], [1621, 172], [1621, 232]);
  chain([1621, 36], [1666, 36], [1712, 36], [1712, 82]); chain([1621, 82], [1712, 82], [1742, 82]); chain([1621, 128], [1676, 128], [1700, 128], [1742, 128]); chain([1621, 232], [1700, 232], [1742, 232]);
  chain([1700, 128], [1700, 232]); chain([1621, 151], [1676, 151]); chain([1621, 172], [1676, 172]); chain([1676, 128], [1676, 151], [1676, 172], [1676, 196]);
  // up onto the slope above the farm, where the flock grazes
  chain([1621, 151], [1610, 166]);
  // doors to their lanes
  for (const h of HOUSES) { const [x, y] = h.at; if (h.box[2] < 104) chain([x, y], [1800, y]); else chain([x, y], [x, 206]); }
  return L;
})();

const G = TOP(0, 0, 0);
// a cottage (or the inn, or the store): walls, a pitched roof with its tiles drawn in, a chimney, windows with white
// frames and a cross of glazing bars (some lit at night), a door under a little canopy, a front garden behind a picket
// fence; the inn has its sign on a post and benches outside, the store its shop window and a post box
function cottage(p: Part, h: House) {
  const [x0, x1, y0, y1] = h.box, w = x1 - x0, d = y1 - y0, z = 0, ov = 0.5, rh = Math.min(3.4, Math.min(w, d) * 0.32);
  // the house stands to the back of its plot: a garden in front of the door
  const [bx0, bx1, by0, by1] = h.door === 's' ? [x0 + 1, x1 - 1, y0, y1 - 4] : [x0, x1 - 4, y0 + 1, y1 - 1], bw = bx1 - bx0, bd = by1 - by0, hh = h.h;
  p.box(bx0, by0, z, bw, bd, hh);
  const ridgeX = bw >= bd;
  if (ridgeX) {
    p.extrude([[bx0 - ov, by0 - ov, hh - 0.12], [bx0 - ov, (by0 + by1) / 2, hh + rh], [bx0 - ov, by1 + ov, hh - 0.12]], [bw + 2 * ov, 0, 0]);
    for (let t = 0.2; t < 1; t += 0.2) { const yy = (by0 + by1) / 2 + t * (bd / 2 + ov), zz = hh + rh - t * (rh + 0.12); p.seg('detail', W(bx0 - ov, yy, zz), W(bx1 + ov, yy, zz)); }
  } else {
    p.extrude([[bx0 - ov, by0 - ov, hh - 0.12], [(bx0 + bx1) / 2, by0 - ov, hh + rh], [bx1 + ov, by0 - ov, hh - 0.12]], [0, bd + 2 * ov, 0]);
    for (let t = 0.2; t < 1; t += 0.2) { const xx = (bx0 + bx1) / 2 + t * (bw / 2 + ov), zz = hh + rh - t * (rh + 0.12); p.seg('detail', W(xx, by0 - ov, zz), W(xx, by1 + ov, zz)); }
  }
  p.box(bx0 + bw * 0.22, by0 + bd * 0.3, hh + rh * 0.3, 0.8, 0.8, rh * 0.95).box(bx0 + bw * 0.22 - 0.1, by0 + bd * 0.3 - 0.1, hh + rh * 1.25, 1.0, 1.0, 0.15);
  const F = FRONT(bx0, by1, hh), S = SIDE(bx1, by1, hh);
  const win = (M: THREE.Matrix4, u: number, v: number) => { p.fill2(M, u, v, 1.1, 1.2, rand(0, 1) < 0.5 ? 'window' : 'glass', 0.03).rect2(M, u, v, 1.1, 1.2, 'line', 0.035).draw(M, [u + 0.55, v, u + 0.55, v + 1.2, u, v + 0.6, u + 1.1, v + 0.6], 'detail', 0.04); };
  const floors = hh > 4 ? [hh - 2.0, 0.6] : [hh - 2.0];
  const doorU = h.door === 's' ? bw / 2 - 0.55 : bd / 2 - 0.55;
  for (const [M, fw, isDoor] of [[F, bw, h.door === 's'], [S, bd, h.door === 'e']] as [THREE.Matrix4, number, boolean][]) {
    for (const v of floors) for (let u = 0.9; u + 1.1 < fw - 0.6; u += 2.6) { if (isDoor && v === floors[0] && Math.abs(u + 0.55 - (doorU + 0.55)) < 1.5) continue; win(M, u, v); }
    if (isDoor) {
      p.fill2(M, doorU, hh - 2.2, 1.1, 2.2, 'kod', 0.04).rect2(M, doorU, hh - 2.2, 1.1, 2.2, 'line', 0.045);
      if (h.kind === 'pub') p.fill2(M, doorU - 2.4, hh - 2.0, 1.6, 1.4, 'window', 0.04).rect2(M, doorU - 2.4, hh - 2.0, 1.6, 1.4, 'line', 0.045);
    }
  }
  // the door's canopy, the garden path, the picket fence with its gate
  if (h.door === 's') {
    p.box(bx0 + doorU - 0.3, by1, 2.35, 1.7, 0.9, 0.1);
    p.fill2(G, bx0 + doorU, by1, 1.1, y1 - by1, 'deck', 0.03);
    picket(p, [x0 + 0.3, y1 - 0.3], [bx0 + doorU - 0.2, y1 - 0.3]); picket(p, [bx0 + doorU + 1.3, y1 - 0.3], [x1 - 0.3, y1 - 0.3]);
  } else {
    p.box(bx1, by0 + doorU - 0.3, 2.35, 0.9, 1.7, 0.1);
    p.fill2(G, bx1, by0 + doorU, x1 - bx1, 1.1, 'deck', 0.03);
    picket(p, [x1 - 0.3, y0 + 0.3], [x1 - 0.3, by0 + doorU - 0.2]); picket(p, [x1 - 0.3, by0 + doorU + 1.3], [x1 - 0.3, y1 - 0.3]);
  }
  // a tree in the back garden of the bigger cottages
  if (hh > 4 && h.kind === 'cottage') tree(p, h.door === 's' ? x1 - 2 : x0 + 2.5, h.door === 's' ? y0 + 2 : y1 - 2.5, 0.75);
  if (h.kind === 'pub') {
    // the inn's sign on its post, and benches out front
    const sx = x1 - 1.5, sy = y1 + 1.5; p.box(sx - 0.08, sy - 0.08, 0, 0.16, 0.16, 3.6).box(sx - 0.9, sy - 0.04, 3.4, 0.9, 0.08, 0.08);
    p.box(sx - 1.6, sy - 0.03, 2.2, 1.2, 0.06, 1.1, 'k').text(FRONT(sx - 1.6, sy + 0.03, 3.3), 'THE PLOUGH', 0.6, 0.62, 0.22, 'ink', 'middle', 0.04);
    for (const bx of [x0 + 1.5, x0 + 5]) p.box(bx, y1 + 0.6, 0, 2.2, 0.6, 0.45).box(bx, y1 + 1.4, 0, 2.2, 1.0, 0.75).box(bx, y1 + 2.6, 0, 2.2, 0.6, 0.45);
  }
  if (h.kind === 'store') {
    p.text(F, 'MILLBROOK STORES', bw / 2, hh - 2.55, 0.45, 'ink', 'middle', 0.05);
    p.cylZ(x1 - 1.2, y1 + 0.6, 0, 0.3, 1.3, 10, 'k');   // the post box
  }
}
function picket(p: Part, a: number[], b: number[]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.4) return;
  const n = Math.max(1, Math.round(L / 0.6));
  for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; p.seg('line', W(x, y, 0), W(x, y, 0.9)); }
  p.seg('line', W(a[0], a[1], 0.7), W(b[0], b[1], 0.7));
}
// a fence round a box: posts every 2.4 m, two rails, a gate gap on one side at (gx, gy)
function fence(p: Part, [x0, x1, y0, y1]: Box, gate: number[], h = 1.2) {
  const run = (a: number[], b: number[]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 2.4));
    for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; if (Math.hypot(x - gate[0], y - gate[1]) < 1.6) continue; p.seg('line', W(x, y, 0), W(x, y, h)); }
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, t = (gate[0] - a[0]) * ux + (gate[1] - a[1]) * uy, off = Math.abs((gate[0] - a[0]) * uy - (gate[1] - a[1]) * ux);
    const pieces = off < 0.5 && t > 0 && t < L ? [[0, t - 1.6], [t + 1.6, L]] : [[0, L]];
    for (const z of [h * 0.5, h]) for (const [s0, s1] of pieces) p.seg('line', W(a[0] + ux * s0, a[1] + uy * s0, z), W(a[0] + ux * s1, a[1] + uy * s1, z));
  };
  run([x0, y0], [x1, y0]); run([x1, y0], [x1, y1]); run([x1, y1], [x0, y1]); run([x0, y1], [x0, y0]);
}
function green(p: Part) {
  const [x0, x1, y0, y1] = VIL.green;
  p.fill2(G, x0, y0, x1 - x0, y1 - y0, 'grass', 0.02).draw(G, [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0], 'line', 0.03);
  // the old oak in the middle, a bench round its trunk
  const [ox, oy] = VIL.oak;
  p.box(ox - 0.35, oy - 0.35, 0, 0.7, 0.7, 3.6);
  for (const [dx, dy, s, z] of [[0, 0, 3.0, 5.8], [1.7, 1.0, 2.2, 5.0], [-1.6, -1.1, 2.0, 5.2], [0.6, -1.7, 1.8, 6.6]]) p.geo(crown, new THREE.Matrix4().compose(W(ox + dx, oy + dy, z), yaw(rand(0, 3)), v3(s, s * 0.8, s)));
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, b = (k + 1) / 8 * Math.PI * 2; p.extrude([[ox + 1.0 * Math.cos(a), oy + 1.0 * Math.sin(a), 0.42], [ox + 1.6 * Math.cos(a), oy + 1.6 * Math.sin(a), 0.42], [ox + 1.6 * Math.cos(b), oy + 1.6 * Math.sin(b), 0.42], [ox + 1.0 * Math.cos(b), oy + 1.0 * Math.sin(b), 0.42]], [0, 0, 0.08], 'n', { seams:false }); }
  // the village pump and its trough
  const [px, py] = VIL.pump; p.box(px - 0.25, py - 0.25, 0, 0.5, 0.5, 1.6).box(px - 0.3, py - 0.3, 1.6, 0.6, 0.6, 0.2, 'k').seg('line', W(px, py, 1.7), W(px + 0.7, py, 2.1)).box(px - 1.0, py + 0.5, 0, 2.0, 0.8, 0.55);
  // the farmers' market on the west side, facing east into the green: produce under striped awnings
  for (const [sx, sy] of VIL.stalls) {
    p.box(sx - 1.2, sy - 3.0, 0, 2.4, 6.0, 0.95);
    for (let k = 0; k < 4; k++) p.box(sx - 0.9 + (k % 2) * 0.9, sy - 2.6 + k * 1.3, 0.95, 0.8, 1.0, 0.3, k % 2 ? 'k' : 'n');
    for (const [dx, dy] of [[-1.4, -3.1], [-1.4, 3.1], [1.6, -3.1], [1.6, 3.1]]) p.seg('line', W(sx + dx, sy + dy, 0), W(sx + dx, sy + dy, dx < 0 ? 2.9 : 2.5));
    for (let k = 0; k < 4; k++) { const ya = sy - 3.2 + k * 1.6, yb = ya + 1.6;
      p.poly(k % 2 ? 'kob' : 'deck', [W(sx - 1.4, ya, 2.9), W(sx + 1.8, ya, 2.45), W(sx + 1.8, yb, 2.45), W(sx - 1.4, yb, 2.9)]); }
    p.seg('line', W(sx + 1.8, sy - 3.2, 2.45), W(sx + 1.8, sy + 3.2, 2.45));
  }
  // benches round the edge, lamps at the corners, a red telephone box, a notice board
  for (const [x, y] of [[1803, 141], [1829, 141], [1820, 158.5]]) p.box(x - 1, y - 0.3, 0, 2, 0.6, 0.45).box(x - 1, y + (y > 150 ? -0.4 : 0.2), 0.45, 2, 0.1, 0.45);
  for (const [x, y] of [[1789, 137], [1841, 137], [1841, 161], [1789, 161]]) lampPost(p, x, y, 0, 1, 0);
  p.box(1837.5, 156.5, 0, 1.0, 1.0, 2.5, 'k').box(1837.4, 156.4, 2.5, 1.2, 1.2, 0.2, 'k').fill2(SIDE(1838.5, 157.5, 2.3), 0.15, 0.2, 0.7, 1.4, 'window', 0.03);
  p.box(1797, 160.6, 0, 0.12, 0.12, 1.8).box(1799.4, 160.6, 0, 0.12, 0.12, 1.8).box(1796.8, 160.6, 1.0, 2.8, 0.12, 0.9, 'k');
}
function farmyard(p: Part) {
  // the red barn: a gambrel roof, big doors on its south side, a hay loft door, bales stacked by it
  const [bx0, bx1, by0, by1] = VIL.barn, bh = 4.2, ym = (by0 + by1) / 2, dd = by1 - by0;
  p.box(bx0, by0, 0, bx1 - bx0, dd, bh, 'k');
  p.extrude([[bx0 - 0.3, by0 - 0.4, bh], [bx0 - 0.3, by0 + dd * 0.18, bh + 2.4], [bx0 - 0.3, ym, bh + 3.4], [bx0 - 0.3, by1 - dd * 0.18, bh + 2.4], [bx0 - 0.3, by1 + 0.4, bh]], [bx1 - bx0 + 0.6, 0, 0], 'n');
  const F = FRONT(bx0, by1, bh);
  p.fill2(F, 4.5, 0.4, 7, 3.8, 'deck', 0.04).rect2(F, 4.5, 0.4, 7, 3.8, 'line', 0.045).draw(F, [8, 0.4, 8, 4.2, 4.5, 0.4, 8, 4.2, 8, 0.4, 11.5, 4.2], 'line', 0.045);
  p.fill2(FRONT(bx0, by1 + 0.4, bh + 2.2), 7.3, 0.2, 1.4, 1.6, 'deck', 0.04);
  for (let k = 0; k < 5; k++) p.cylY(bx1 + 1.6 + (k % 3) * 1.5, by0 + 1, 0.55 + Math.floor(k / 3) * 1.1, 0.55, 1.2, 10, 'n');
  // two silos with domed tops and a ladder
  for (const [sx, sy] of VIL.silos) {
    p.cylZ(sx, sy, 0, 2.1, 12, 14);
    p.geo(new THREE.SphereGeometry(2.1, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().compose(W(sx, sy, 12), new THREE.Quaternion(), v3(1, 0.55, 1)), 'n');
    for (let z = 3; z < 12; z += 3) for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, c = (k + 1) / 14 * Math.PI * 2; p.seg('detail', W(sx + 2.12 * Math.cos(a), sy + 2.12 * Math.sin(a), z), W(sx + 2.12 * Math.cos(c), sy + 2.12 * Math.sin(c), z)); }
    for (const dy of [-0.25, 0.25]) p.seg('line', W(sx + 2.15, sy + dy, 0.5), W(sx + 2.15, sy + dy, 12.4));
    for (let z = 1; z < 12; z += 0.6) p.seg('detail', W(sx + 2.15, sy - 0.25, z), W(sx + 2.15, sy + 0.25, z));
  }
  // the pens: fences, a shelter at the back of the sheep pen, troughs, the pig sty's hut, the hen house on legs
  fence(p, VIL.cows, VIL.gates.cows); fence(p, VIL.sheep, VIL.gates.sheep); fence(p, VIL.sty, VIL.gates.sty, 0.9); fence(p, VIL.run, VIL.gates.run, 1.0); fence(p, VIL.horses, VIL.gates.horses, 1.4);
  const [sx0, sx1, sy0] = VIL.sheep; for (const x of [sx0 + 1, sx1 - 1]) p.seg('line', W(x, sy0 + 1, 0), W(x, sy0 + 1, 2.2));
  p.box(sx0 + 0.5, sy0 + 0.4, 2.2, sx1 - sx0 - 1, 3.6, 0.12);
  for (const [x, y] of [[1663, 141], [1637, 162], [1641, 184], [1655, 166]]) p.box(x - 1.5, y - 0.4, 0, 3, 0.8, 0.5);
  // the horse trough by the farm track, filled from the ditch
  const [qx, qy] = VIL.trough; p.box(qx - 0.6, qy - 1.6, 0, 1.2, 3.2, 0.7).fill2(TOP(0, 0, 0.71), qx - 0.4, qy - 1.4, 0.8, 2.8, 'sea', 0.01);
  const [tx0, tx1, ty0] = VIL.sty; p.box(tx0 + 1, ty0 + 1, 0, tx1 - tx0 - 2, 4, 1.6).extrude([[tx0 + 0.6, ty0 + 0.6, 1.6], [tx1 - 0.6, ty0 + 0.6, 1.6], [tx1 - 0.6, ty0 + 0.6, 2.4]], [0, 4.8, 0], 'n');
  const [cx0, cx1, cy0, cy1] = VIL.coop;
  for (const [x, y] of [[cx0, cy0], [cx1, cy0], [cx0, cy1], [cx1, cy1]]) p.seg('line', W(x, y, 0), W(x, y, 0.7));
  p.box(cx0, cy0, 0.7, cx1 - cx0, cy1 - cy0, 1.6).extrude([[cx0 - 0.2, cy0 - 0.3, 2.3], [cx0 - 0.2, cy1 + 0.3, 2.3], [cx0 - 0.2, (cy0 + cy1) / 2, 3.0]], [cx1 - cx0 + 0.4, 0, 0], 'n');
  p.extrude([[cx1, cy1 - 1.5, 0], [cx1 + 1.6, cy1 - 1.5, 0], [cx1, cy1 - 1.5, 0.75]], [0, 0.6, 0], 'n', { seams:false });
  // a field shelter in the horses' paddock
  const [hx0, , , hy1] = VIL.horses; p.box(hx0 + 1, hy1 - 5, 0, 8, 4, 2.6).box(hx0 + 0.6, hy1 - 5.4, 2.6, 8.8, 4.8, 0.15);
  // the orchard's store: a timber store on posts, crates of apples stacked under it
  const [px0, px1, py0, py1] = VIL.store;
  for (let x = px0; x <= px1 + 0.01; x += 6) for (const y of [py0, py1]) p.box(x - 0.15, y - 0.15, 0, 0.3, 0.3, 4.0);
  p.extrude([[px0 - 0.6, py0 - 0.8, 4.0], [px0 - 0.6, (py0 + py1) / 2, 5.6], [px0 - 0.6, py1 + 0.8, 4.0]], [px1 - px0 + 1.2, 0, 0], 'n');
  p.text(SIDE(px1 + 0.6, py1, 4.6), 'MILLBROOK ORCHARDS', (py1 - py0) / 2, 0.28, 0.3, 'ink', 'middle', 0.04);
  for (let k = 0; k < 14; k++) { const x = px0 + 2 + (k % 5) * 3.6, y = py0 + 3 + Math.floor(k / 5) * 5; for (let l = 0; l < 1 + k % 3; l++) p.box(x, y, l * 0.5, 1.2, 0.8, 0.48, l % 2 ? 'k' : 'n'); }
}
// the fields: wheat in stripes, the hay meadow with round bales, vegetables in rows, the long field left as stubble
function fields(p: Part) {
  for (const f of VIL.fields) {
    const [x0, x1, y0, y1] = f.box;
    p.draw(G, [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0], 'line', 0.03);
    if (f.crop === 'wheat') { p.fill2(G, x0, y0, x1 - x0, y1 - y0, 'sand', 0.02); const s: number[] = []; for (let x = x0 + 0.8; x < x1; x += 0.8) s.push(x, y0 + 0.3, x, y1 - 0.3); p.draw(G, s, 'detail', 0.025); }
    else if (f.crop === 'plough') { p.fill2(G, x0, y0, x1 - x0, y1 - y0, 'sand', 0.02); for (let k = 0; k < 140; k++) { const x = rand(x0 + 1, x1 - 1), y = rand(y0 + 1, y1 - 1); p.draw(G, [x, y, x + 0.4, y], 'detail', 0.025); } }
    else if (f.crop === 'hay') {
      p.fill2(G, x0, y0, x1 - x0, y1 - y0, 'grass', 0.02);
      for (let k = 0; k < 9; k++) { const x = x0 + 5 + (k % 3) * 13 + rand(-2, 2), y = y0 + 6 + Math.floor(k / 3) * 11 + rand(-2, 2); p.cylY(x, y - 0.6, 0.75, 0.75, 1.2, 12, 'n'); }
    }
    else { for (let y = y0 + 0.6; y < y1 - 0.8; y += 1.6) p.fill2(G, x0 + 0.6, y, x1 - x0 - 1.2, 0.9, f.crop === 'beans' ? 'grass' : rand(0, 1) < 0.5 ? 'grass' : 'deck', 0.022); }
  }
  // sheds on the allotments
  for (const [x, y] of [[1660, 56], [1690, 56]]) p.box(x, y, 0, 2.4, 1.8, 2.0).extrude([[x - 0.2, y - 0.2, 2.0], [x + 2.6, y - 0.2, 2.0], [x + 2.6, y - 0.2, 2.4]], [0, 2.2, 0], 'n', { seams:false });
}
// the millpond, the mill (its wheel turns in the sim), the beck down into the pond, the ditches by the fields
function water(p: Part) {
  const [x0, x1, y0, y1] = VIL.pond;
  p.box(x0, y0, 0, x1 - x0, y1 - y0, 0.5);
  p.fill2(TOP(0, 0, 0.52), x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, 'sea', 0.01).rect2(TOP(0, 0, 0.52), x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, 'line', 0.02);
  const [mx0, mx1, my0, my1] = VIL.mill, mh = 6.2;
  p.box(mx0, my0, 0, mx1 - mx0, my1 - my0, mh);
  p.extrude([[mx0 - 0.4, my0 - 0.4, mh - 0.1], [mx0 - 0.4, (my0 + my1) / 2, mh + 3.2], [mx0 - 0.4, my1 + 0.4, mh - 0.1]], [mx1 - mx0 + 0.8, 0, 0], 'n');
  const F = FRONT(mx0, my1, mh), S = SIDE(mx1, my1, mh);
  for (const [M, w] of [[F, mx1 - mx0], [S, my1 - my0]] as [THREE.Matrix4, number][]) for (const v of [1.2, 3.8]) for (let u = 1; u + 1 < w - 0.6; u += 2.8) p.fill2(M, u, v, 1.0, 1.2, rand(0, 1) < 0.4 ? 'window' : 'glass', 0.03).rect2(M, u, v, 1.0, 1.2, 'line', 0.035);
  p.fill2(S, (my1 - my0) / 2 - 0.6, mh - 2.3, 1.2, 2.3, 'kod', 0.04);
  // the race from the pond to the wheel, and the tail water away to the ditch
  const ch = (a: number[], b: number[], w = 0.35) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L * w, ny = (b[0] - a[0]) / L * w;
    p.poly('sea', [W(a[0] - nx, a[1] - ny, 0.04), W(b[0] - nx, b[1] - ny, 0.04), W(b[0] + nx, b[1] + ny, 0.04), W(a[0] + nx, a[1] + ny, 0.04)]);
    for (const s of [-1, 1]) p.seg('detail', W(a[0] + s * nx * 1.6, a[1] + s * ny * 1.6, 0.05), W(b[0] + s * nx * 1.6, b[1] + s * ny * 1.6, 0.05)); };
  ch([1640, 49.5], [1648, 50.5], 0.6); ch([1648, 50.5], [1648, 54], 0.6);
  ch([1633, -6], [1633, 38], 0.6);
  ch([1624, 50], [1624, 232]); for (const y of [84, 112, 196, 214]) ch([1624, y], [y < 130 ? 1738 : 1740, y]);
  // the windpump by the hay meadow: a lattice tower (its fan turns in the sim)
  const [wx, wy] = VIL.windpump;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.seg('line', W(wx + a * 1.1, wy + b * 1.1, 0), W(wx + a * 0.25, wy + b * 0.25, 8.6));
  for (let z = 1.5; z < 8.6; z += 1.8) { const k = 1.1 - (1.1 - 0.25) * z / 8.6; p.seg('detail', W(wx - k, wy + k, z), W(wx + k, wy + k, z)).seg('detail', W(wx + k, wy + k, z), W(wx + k, wy - k, z)); }
  p.box(wx - 0.6, wy + 1.0, 0, 1.2, 2.6, 0.7);
}
function orchard(p: Part) {
  for (const [x0, x1, y0, y1] of VIL.orchard) for (let x = x0 + 3.5; x < x1; x += 7) for (let y = y0 + 3.5; y < y1; y += 7) {
    if (Math.abs(x - 1700) < 2.6 || inBox(x, y, VIL.store, 3) || inBox(x, y, VIL.horses, 3) || inBox(x, y, VIL.run, 2)) continue;
    // an apple tree: a short trunk, a round crown, apples drawn as a few dots in it
    const s = rand(0.62, 0.78), cx = x + rand(-0.6, 0.6), cy = y + rand(-0.6, 0.6);
    tree(p, cx, cy, s);
  }
}
const inBox = (x: number, y: number, [x0, x1, y0, y1]: Box, m = 0) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
// the lanes and tracks: gravel, edged; lamps along the village lanes
function lanes(p: Part) {
  for (const [a, b] of LANES) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const nx = -(b[1] - a[1]) / L * 1.4, ny = (b[0] - a[0]) / L * 1.4;
    p.poly('deck', [W(a[0] - nx, a[1] - ny, 0.015), W(b[0] - nx, b[1] - ny, 0.015), W(b[0] + nx, b[1] + ny, 0.015), W(a[0] + nx, a[1] + ny, 0.015)]);
  }
  for (const [x, y] of [[1801.6, 30], [1801.6, 60], [1801.6, 90], [1780, 105.6], [1835, 105.6], [1770, 207.6], [1800, 207.6], [1830, 207.6]]) lampPost(p, x, y, 0, 1, 0);
}

export function buildVillage() {
  const p = new Part();
  for (const h of HOUSES) cottage(p, h);
  green(p); farmyard(p); fields(p); water(p); orchard(p); lanes(p);
  return p.build('village');
}
// the mill's wheel: a rim, spokes and paddles in a vertical plane across y, turned about its axle by the sim
export function buildMillWheel() {
  const p = new Part(), r = VIL.wheel.r;
  for (const y of [-0.45, 0.45]) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, b = (k + 1) / 16 * Math.PI * 2; p.seg('line', W(r * Math.cos(a), y, r * Math.sin(a)), W(r * Math.cos(b), y, r * Math.sin(b))); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; for (const y of [-0.45, 0.45]) p.seg('line', W(0, y, 0), W(r * Math.cos(a), y, r * Math.sin(a))); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; p.poly('deck', [W(r * Math.cos(a), -0.45, r * Math.sin(a)), W(r * Math.cos(a), 0.45, r * Math.sin(a)), W((r - 0.6) * Math.cos(a), 0.45, (r - 0.6) * Math.sin(a)), W((r - 0.6) * Math.cos(a), -0.45, (r - 0.6) * Math.sin(a))]); }
  p.cylY(0, -0.7, 0, 0.18, 1.4, 8, 'k');
  return p.build('millWheel');
}
// the windpump's fan: a ring of blades and a tail vane, turned by the sim
export function buildWindFan() {
  const p = new Part();
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; p.poly('deck', [W(0, 0.3 * Math.cos(a), 0.3 * Math.sin(a)), W(0, 1.6 * Math.cos(a - 0.12), 1.6 * Math.sin(a - 0.12)), W(0.08, 1.6 * Math.cos(a + 0.12), 1.6 * Math.sin(a + 0.12))]); }
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, b = (k + 1) / 20 * Math.PI * 2; p.seg('line', W(0, 1.6 * Math.cos(a), 1.6 * Math.sin(a)), W(0, 1.6 * Math.cos(b), 1.6 * Math.sin(b))); }
  return p.build('windFan');
}
