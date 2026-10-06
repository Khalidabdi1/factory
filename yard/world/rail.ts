// @ts-nocheck
import { TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { Path } from '../kernel/path';
import { RAIL, WORLD } from '../layout';
import { lampPost } from './ground';

// The railway: ballast, sleepers and two rails, the length of the plate along the foot of the hills and round the
// loop through the Plant 01 yard; the loading platform there; a signal at each end of the loop.
export const RAIL_PATH = new Path(RAIL.route, 25);
// a stretch of track along a path, between two distances on it: a bed of ballast (edge to edge, never overlapping
// itself, so it cannot flicker against the ground), a sleeper every 0.65 m, two rails
export function trackOn(p, path, s0, s1, b0 = s0, b1 = s1) {
  const at = s => { const a = path.at(s), c = Math.cos(a.h), n = Math.sin(a.h); return k => [a.x - n * k, a.y + c * k]; };
  const L = [], R = []; let prev = null;
  for (let s = s0; s <= s1 + 1e-6; s += 0.65) {
    const side = at(s), [x0, y0] = side(-1.25), [x1, y1] = side(1.25);
    p.seg('detail', W(x0, y0, 0.08), W(x1, y1, 0.08)); L.push(side(-0.72)); R.push(side(0.72));
    const bed = [side(-1.6), side(1.6)];
    if (prev && s > b0 && s <= b1 + 1e-6) p.poly('road', [W(...prev[0], 0.025), W(...prev[1], 0.025), W(...bed[1], 0.025), W(...bed[0], 0.025)]);
    prev = bed;
  }
  for (const rail of [L, R]) for (let i = 1; i < rail.length; i++) p.seg('line', W(...rail[i - 1], 0.14), W(...rail[i], 0.14));
}
export function buildRail() {
  const p = new Part(), G = TOP(0, 0, 0);
  const track = (path, s0, s1, b0 = s0, b1 = s1) => trackOn(p, path, s0, s1, b0, b1);
  // the main line, straight along y, and the loop where the route leaves it
  const main = new Path([[WORLD.x1 + 8, RAIL.y], [WORLD.x0 - 8, RAIL.y]]);
  track(main, 0, main.length);
  // the loop's rails from switch to switch, its bed only from where it has left the main line's
  track(RAIL_PATH, RAIL_PATH.project(214, RAIL.y), RAIL_PATH.project(78, RAIL.y), RAIL_PATH.project(207, RAIL.y + 3.4), RAIL_PATH.project(85, RAIL.y + 3.4));
  // the platform: paving the forklifts work from, its edge, a line for the lane they keep to
  p.fill2(G, 114, RAIL.loopY + 1.6, 58, 2.6, 'deck', 0.02).draw(G, [114, RAIL.loopY + 1.6, 172, RAIL.loopY + 1.6], 'line', 0.03).text(G, 'RAIL LOADING', 116, RAIL.loopY + 3.6, 0.9, 'paint', 'start', 0.03);
  for (let x = 110; x < 188; x += 4) p.draw(G, [x, RAIL.lane + 1.8, x + 2, RAIL.lane + 1.8], 'detail', 0.03);
  // signals at the switches: a post and a lamp head
  for (const [x, y] of [[218, RAIL.y + 2.4], [74, RAIL.y + 2.4]]) { p.box(x - 0.1, y - 0.1, 0, 0.2, 0.2, 4.2).box(x - 0.3, y - 0.25, 4.2, 0.6, 0.5, 0.9, 'k').box(x - 0.15, y + 0.25, 4.6, 0.3, 0.05, 0.3, 'l'); }
  for (const x of [111, 175]) lampPost(p, x, RAIL.loopY + 3.4, 0, -1);   // at the ends of the platform, clear of the forklifts
  return p.build('rail');
}
