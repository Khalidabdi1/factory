import { FRONT, SIDE } from '../kernel/iso';
import { Part } from '../kernel/part';

// ---- the Metrobus: an articulated bus in two sections (local: +x forward, origin at each section's front) ----
// Low floor, a deep windscreen and the route over it, windows the length of both sections lit after dark, the metro's
// stripe, doors on both sides (it stops at stations on the boulevard's median, so its left-hand doors are the ones it
// uses). The rear section hangs from a turntable behind the front one's last axle.
export const BRT_FRONT = 11.2, BRT_REAR = 6.8, BRT_HINGE = 11.6;
// the doors' middles, front-section and rear-section frames (the rear's door is behind the hinge)
export const BRT_DOORS = { front:[-1.9, -7.1], rear:[-3.4] };
const Y = 1.27, Z0 = 0.35, Z1 = 3.25;
function section(len: number, front: boolean, doors: number[], lite: boolean) {
  const p = new Part();
  p.box(-len, -Y, Z0, len, 2 * Y, Z1 - Z0, 'nb');
  for (const x of front ? [-6.0] : [-2.8]) p.box(x - 1.3, -0.8, Z1, 2.6, 1.6, 0.35, 'nb');   // air-conditioning on the roof
  for (const [s, k] of [[Y, 1], [-Y, -1]] as [number, number][]) {
    const M = FRONT(-len, s, Z1), lift = 0.03 * k;
    p.fill2(M, 0.3, 0.45, len - 0.6, 1.25, 'window', lift);
    if (lite) continue;
    p.fill2(M, 0, 1.95, len, 0.22, 'kob', lift).draw(M, [0, 0.35, len, 0.35], 'line', lift * 1.3);
    for (let u = 0.3 + 1.6; u < len - 0.4; u += 1.6) p.draw(M, [u, 0.45, u, 1.7], 'line', lift * 1.3);
    for (const d of doors) { const u = d + len - 0.65; p.fill2(M, u, 0.4, 1.3, 2.45, 'glass', lift * 1.1).rect2(M, u, 0.4, 1.3, 2.45, 'line', lift * 1.4).draw(M, [u + 0.65, 0.4, u + 0.65, 2.85], 'line', lift * 1.4); }
  }
  if (front) {
    // the windscreen, the route's sign over it, headlamps, the stripe across the front
    const F = SIDE(0, Y, Z1);
    p.fill2(F, 0.15, 0.25, 2 * Y - 0.3, 0.55, 'w', 0.03).fill2(F, 0.12, 0.9, 2 * Y - 0.24, 1.55, 'glass', 0.03).rect2(F, 0.12, 0.9, 2 * Y - 0.24, 1.55, 'line', 0.035);
    if (!lite) p.text(F, 'M1  SAHEL BLVD', Y, 0.68, 0.26, 'ink', 'middle', 0.04).fill2(F, 0, 2.55, 2 * Y, 0.2, 'kob', 0.03);
    for (const y of [0.85, -0.85]) p.box(-0.04, y - 0.2, 0.55, 0.08, 0.4, 0.18, 'l');
  }
  if (!lite) for (const x of front ? [-2.3, -9.4] : [-5.2]) { p.cylY(x, Y - 0.25, 0.48, 0.48, 0.3, 12, 'kb'); p.cylY(x, -Y - 0.05, 0.48, 0.48, 0.3, 12, 'kb'); }
  if (!front) p.box(-len - 0.05, -0.9, 1.0, 0.1, 1.8, 1.5, 'kb');   // the engine's grille at the back
  const g = p.build(front ? 'brtFront' : 'brtRear');
  if (!lite) {
    // the left-hand doors (−y), in parts that show only while they open: dark doorways, leaves folding in
    const dark = new Part(), leaves = new Part(), M = FRONT(-len, -Y, Z1);
    for (const d of doors) { const u = d + len - 0.65; dark.fill2(M, u, 0.4, 1.3, 2.45, 'glass', -0.05);
      for (const du of [0, 1.15]) leaves.box(-len + u + du, -Y - 0.6, Z0 + 0.05, 0.15, 0.6, 2.4, 'nb'); }
    for (const [part, n] of [[dark, 'doorways'], [leaves, 'leaves']] as [Part, string][]) { const o = part.build(n); o.visible = false; g.add(o); }
  }
  return g;
}
export const buildBrtFront = (lite = false) => section(BRT_FRONT, true, BRT_DOORS.front, lite);
export const buildBrtRear = (lite = false) => {
  const g = section(BRT_REAR, false, BRT_DOORS.rear, lite);
  // the bellows at the joint, ahead of the rear section
  if (!lite) g.add(new Part().box(0, -1.1, Z0 + 0.1, 0.45, 2.2, Z1 - Z0 - 0.2, 'kb').build('bellows'));
  return g;
};
