// @ts-nocheck
import { TOP, W } from '../kernel/iso';
import { CURB, ORCHARD, RAB, ZEBRA_X } from '../layout';

// Orchard Lane, on what was a wood behind Corner Market: a lane from the roundabout's north side that turns west to a
// turning circle, its pavement, the footway up from the shop's zebra, and a playground between the lane and the shop.
// The six houses are built with the other homes.
export const PLAY_BENCHES = [[400.6, 77, 'w'], [400.6, 85, 'w']];
// where a random wood point is kept clear (a tree's yaw is still drawn, so the town's random sequence is unchanged)
export const orchardClear = (x, y) => {
  const O = ORCHARD;
  return y > 32 && y < 62 && x > 356 || x > 414 && x < 430 && y > 60 && y < 119 || y > 58 && y < 74 && x > 365 && x < 430
    || Math.hypot(x - O.turn.x, y - O.turn.y) < O.turn.r + 2.5 || x > 360 && x < 403 && y > 72 && y < 91 || Math.abs(x - O.walkX) < 2.5 && y > 70 && y < 119;
};
export function buildOrchard(p, G, dashes, fence, bench) {
  const O = ORCHARD, L = TOP(0, 0, CURB);
  // asphalt: the north arm (into the roundabout's disc), the west arm, the turning circle
  p.fill2(G, O.ax - 5, O.ay0, 10, O.ay1 - O.ay0 + 1, 'glass', 0.02);
  p.fill2(G, O.ex0, O.ey - 5, O.ex1 - O.ex0, 10, 'glass', 0.02);
  const disc = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; disc.push(W(O.turn.x + O.turn.r * Math.cos(a), O.turn.y + O.turn.r * Math.sin(a), 0.02)); }
  p.poly('glass', disc);
  dashes(O.ax, O.ay0 + 4, O.ax, O.ay1 - 4); dashes(O.ex0 + 6, O.ey, O.ex1 - 6, O.ey);
  // give way where the lane meets the roundabout
  for (let x = O.ax - 4.6; x < O.ax - 0.3; x += 0.9) p.draw(G, [x, RAB.y - 15.2, x + 0.5, RAB.y - 15.2], 'line', 0.05);
  p.text(G, 'ORCHARD LN', 388, 69.4, 1.3, 'paint');
  // the footway: from the zebra past the shop's east side, up to the lane (on the ground, then on the green)
  p.fill2(G, ZEBRA_X - 0.8, 116.4, O.walkX - ZEBRA_X + 1.6, 1.6, 'deck', 0.012);
  p.fill2(G, O.walkX - 0.8, 92, 1.6, 25.2, 'deck', 0.012);
  p.fill2(L, O.walkX - 0.8, 71, 1.6, 21, 'deck', 0.015);
  // the playground: swings, a slide, a climbing frame, a see-saw, a sandpit, benches for the grown-ups, a low fence
  const z = CURB;
  for (const x of [364, 370.4]) { p.seg('line', W(x, 74.8, z), W(x, 76.7, z + 2.4)).seg('line', W(x, 78.6, z), W(x, 76.7, z + 2.4)); }
  p.seg('line', W(364, 76.7, z + 2.4), W(370.4, 76.7, z + 2.4));
  for (const x of [365.8, 368.6]) { for (const dx of [-0.25, 0.25]) p.seg('line', W(x + dx, 76.7, z + 2.4), W(x + dx, 76.7, z + 0.55)); p.box(x - 0.35, 76.5, z + 0.5, 0.7, 0.4, 0.06, 'k'); }
  p.box(377, 76, z, 1.2, 1.2, 1.6).box(376.9, 75.9, z + 1.6, 1.4, 1.4, 0.1);
  for (const y of [76, 77.2]) p.seg('line', W(377, y, z), W(377, y, z + 1.6));
  p.extrude([[378.2, 76.1, z + 1.6], [378.2, 77.1, z + 1.6], [382.6, 77.1, z + 0.2], [382.6, 76.1, z + 0.2]], [0, 0, 0.08], 'k');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) p.seg('line', W(386 + 1.2 * i, 75 + 1.2 * j, z), W(386 + 1.2 * i, 75 + 1.2 * j, z + 2.4));
  for (const zz of [0.8, 1.6, 2.4]) for (let k = 0; k < 3; k++) p.seg('line', W(386, 75 + 1.2 * k, z + zz), W(388.4, 75 + 1.2 * k, z + zz)).seg('line', W(386 + 1.2 * k, 75, z + zz), W(386 + 1.2 * k, 77.4, z + zz));
  p.box(379.6, 84.6, z, 0.3, 0.6, 0.45).extrude([[376.6, 84.7, z + 0.2], [376.6, 85.1, z + 0.2], [383.2, 85.1, z + 0.7], [383.2, 84.7, z + 0.7]], [0, 0, 0.08], 'k');
  p.box(392, 82, z, 4, 0.25, 0.3).box(392, 85.75, z, 4, 0.25, 0.3).box(392, 82.25, z, 0.25, 3.5, 0.3).box(395.75, 82.25, z, 0.25, 3.5, 0.3);
  p.fill2(L, 392.25, 82.25, 3.5, 3.5, 'sand', 0.05);
  for (const [x, y, f] of PLAY_BENCHES) bench(p, x, y, f);
  fence(361, 73, 403, 73, z, 0.8); fence(361, 90.5, 403, 90.5, z, 0.8); fence(361, 73, 361, 90.5, z, 0.8);
  fence(403, 73, 403, 78.6, z, 0.8); fence(403, 80.4, 403, 90.5, z, 0.8);
  p.text(L, 'ORCHARD GREEN', 365, 72.2, 0.9, 'paint', 'start', 0.05);
}
