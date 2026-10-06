// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';

// ---- Car Works models (local: +x forward, origin at the front, like the cars) ----
// A thin straight member from a to b, for pillars, rails and robot arms that are not square to the axes.
export function beam(p, a, b, w, tone, h = w) {
  const A = W(...a), B = W(...b), d = B.clone().sub(A), len = d.length();
  p.geo(new THREE.BoxGeometry(len, h, w), new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(1, 0, 0), d.normalize()), v3(1, 1, 1)), tone);
  return p;
}
export const BODY_LEN = 4.5;
// The car as it goes down the line, one model per stage:
//   blanks     steel sheets cut from the coil, stacked on a pallet
//   panels     the stamped panels, upright in a rack
//   floor      the underbody: floor pan, sills, cross members
//   frame      the floor with the sides framed on: pillars, roof rails, the bulkhead
//   shell      the body in white: the roof on, the wings and quarters
//   closed     the shell with its doors, bonnet and boot lid hung
//   painted    the same, painted (tone n or k)
//   wheels     painted, on its wheels
//   complete   glazed, its lamps in
// Bare steel is drawn in the glass fill; paint in the body or two-tone fill.
export function buildBody(stage, tone = 'g') {
  const p = new Part(), L = BODY_LEN, Y = 0.9, z0 = 0.42, steel = stage === 'painted' || stage === 'wheels' || stage === 'complete' ? tone : 'g';
  const line = steel === 'k' ? 'koline' : 'line';
  if (stage === 'blanks') {
    p.box(-3.7, -0.95, 0, 3.4, 1.9, 0.14, 'n');
    for (let i = 0; i < 9; i++) p.box(-3.6, -0.85, 0.14 + i * 0.06, 3.2, 1.7, 0.045, 'g');
    return p.build('blanks');
  }
  if (stage === 'panels') {
    p.box(-4.2, -0.95, 0, 3.9, 1.9, 0.14, 'n');
    for (const x of [-4.1, -0.4]) for (const y of [-0.9, 0.82]) p.box(x, y, 0.14, 0.08, 0.08, 1.5, 'n');
    p.box(-4.1, -0.9, 1.6, 3.8, 0.08, 0.08, 'n').box(-4.1, 0.82, 1.6, 3.8, 0.08, 0.08, 'n');
    for (let i = 0; i < 4; i++) { const y = -0.6 + i * 0.4; p.box(-3.9, y, 0.2, 3.4, 0.05, 1.15, 'g'); p.draw(FRONT(-3.9, y + 0.05, 1.35), [0.8, 0.3, 1.6, 0.3, 1.6, 0.3, 1.6, 0.8, 2.0, 0.3, 2.8, 0.3, 2.8, 0.3, 2.8, 0.8], 'line', 0.01); }
    return p.build('panels');
  }
  // the underbody
  p.box(-L + 0.2, -Y + 0.15, z0, L - 0.4, 2 * Y - 0.3, 0.1, steel).box(-L + 0.3, -Y, z0 - 0.08, L - 0.6, 0.16, 0.26, steel).box(-L + 0.3, Y - 0.16, z0 - 0.08, L - 0.6, 0.16, 0.26, steel);
  p.box(-L * 0.62, -0.18, z0 + 0.1, L * 0.4, 0.36, 0.18, steel);
  for (const x of [-0.25, -1.25, -3.2, -L + 0.25]) p.box(x - 0.08, -Y + 0.15, z0, 0.16, 2 * Y - 0.3, 0.14, steel);
  if (stage === 'floor') return p.build('floor');
  // the sides: sills up to the pillars and roof rails; the bulkhead and the back panel
  const zb = z0 + 0.4, zr = z0 + 1.12, xa = -1.15, xb = -2.35, xc = -3.55, xw = -0.95;
  for (const y of [-Y + 0.05, Y - 0.05]) {
    beam(p, [xw + 0.2, y, zb], [xa - 0.1, y * 0.94, zr], 0.09, steel);      // A pillar, raked back
    beam(p, [xb, y, zb], [xb, y * 0.94, zr], 0.1, steel);                     // B pillar
    beam(p, [xc - 0.3, y, zb], [xc + 0.15, y * 0.94, zr], 0.1, steel);        // C pillar
    beam(p, [xa - 0.1, y * 0.94, zr], [xc + 0.15, y * 0.94, zr], 0.09, steel); // roof rail
    beam(p, [-0.15, y, zb - 0.05], [-L + 0.2, y, zb - 0.05], 0.08, steel);    // waist rail
  }
  p.box(xw - 0.05, -Y + 0.1, z0, 0.1, 2 * Y - 0.2, 0.55, steel).box(-L + 0.2, -Y + 0.1, z0, 0.1, 2 * Y - 0.2, 0.42, steel);
  beam(p, [-0.15, -Y + 0.1, zb - 0.1], [-0.15, Y - 0.1, zb - 0.1], 0.1, steel);
  if (stage === 'frame') return p.build('frame');
  // the shell: roof, wings and quarters
  p.box(xa - 0.15, -Y * 0.92, zr - 0.02, xc - xa + 0.5, 2 * Y * 0.92, 0.06, steel);
  for (const y of [-Y, Y - 0.06]) { p.box(-0.95, y, z0, 0.9, 0.06, 0.45, steel); p.box(-L + 0.25, y, z0, 0.95, 0.06, 0.45, steel); }
  p.box(-0.1, -Y + 0.1, z0 - 0.05, 0.12, 2 * Y - 0.2, 0.4, steel);
  if (stage === 'shell') return p.build('shell');
  // closures: doors, bonnet, boot lid; then paint, wheels, glass and lamps
  const dy = s => s > 0 ? Y - 0.05 : -Y;
  for (const s of [1, -1]) {
    for (const [x0, x1] of [[xa - 0.05, xb + 0.02], [xb - 0.02, xc + 0.05]]) {
      p.box(x1, dy(s), z0, x0 - x1, 0.05, 0.45, steel);
      const M = FRONT(x1, s > 0 ? Y : -Y, zb + 0.05); p.draw(M, [0, 0.5, x0 - x1, 0.5, 0, 0.5, 0, 0.05, x0 - x1, 0.5, x0 - x1, 0.05], line, 0.012 * s);
    }
  }
  p.box(-0.95, -Y + 0.06, zb - 0.02, 0.85, 2 * Y - 0.12, 0.05, steel).box(-L + 0.25, -Y + 0.06, zb - 0.02, 0.9, 2 * Y - 0.12, 0.05, steel);
  if (stage === 'wheels' || stage === 'complete') for (const x of [-0.75, -3.6]) { p.cylY(x, Y - 0.12, 0.34, 0.34, 0.26, 10); p.cylY(x, -Y - 0.14, 0.34, 0.34, 0.26, 10); }
  if (stage === 'complete') {
    for (const s of [1, -1]) { const M = FRONT(xc + 0.05, s > 0 ? Y * 0.94 : -Y * 0.94, zr - 0.03);
      p.fill2(M, 0.15, 0.06, xb - xc - 0.2, 0.6, 'glass', 0.02 * s).fill2(M, xb - xc + 0.08, 0.06, xa - xb - 0.15, 0.6, 'glass', 0.02 * s); }
    beam(p, [xw, 0, zb + 0.02], [xa - 0.1, 0, zr - 0.02], 2 * Y * 0.86, 'g', 0.04);   // the windscreen
    beam(p, [xc + 0.15, 0, zr - 0.02], [-L + 0.45, 0, zb + 0.08], 2 * Y * 0.84, 'g', 0.04);       // the back window
    for (const y of [0.55, -0.55]) p.box(-0.02, y - 0.2, z0 + 0.12, 0.05, 0.4, 0.14, 'l').box(-L - 0.02, y - 0.18, z0 + 0.2, 0.05, 0.36, 0.12, 'l');
  }
  return p.build(stage);
}
// A welding robot: a white pedestal, a turret that slews, an upper arm at the shoulder, a forearm at the elbow, a
// wrist with a spot-welding gun; the spark at its tips is a separate part that flashes in the live fill.
export function buildRobot() {
  const g = new THREE.Group(); g.name = 'robot';
  const base = new Part(); base.cylZ(0, 0, 0, 0.55, 1.1, 14).cylZ(0, 0, 1.1, 0.62, 0.08, 14, 'k');
  g.add(base.build('pedestal'));
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.copy(W(0, 0, 1.18)); g.add(turret);
  turret.add(new Part().cylZ(0, 0, 0, 0.45, 0.35, 12, 'k').box(-0.35, -0.3, 0.35, 0.7, 0.6, 0.5, 'k').box(-0.62, -0.25, 0.4, 0.3, 0.5, 0.4, 'k').build('swivel'));
  const shoulder = new THREE.Group(); shoulder.name = 'shoulder'; shoulder.position.copy(W(0.05, 0, 0.75)); turret.add(shoulder);
  shoulder.add(new Part().box(0, -0.2, -0.2, 1.55, 0.4, 0.4, 'k').cylY(0, -0.28, 0, 0.26, 0.56, 10, 'k').build('upperArm'));
  const elbow = new THREE.Group(); elbow.name = 'elbow'; elbow.position.copy(W(1.55, 0, 0)); shoulder.add(elbow);
  elbow.add(new Part().box(-0.3, -0.24, -0.22, 0.55, 0.48, 0.44, 'k').box(0.2, -0.13, -0.13, 1.3, 0.26, 0.26, 'k').build('forearm'));
  const wrist = new THREE.Group(); wrist.name = 'wrist'; wrist.position.copy(W(1.5, 0, 0)); elbow.add(wrist);
  // the gun: a C of two jaws round the seam
  wrist.add(new Part().cylY(0, -0.1, 0, 0.12, 0.2, 8, 'n').box(0.05, -0.05, -0.05, 0.25, 0.1, 0.1, 'n').box(0.3, -0.06, -0.35, 0.08, 0.12, 0.7, 'n')
    .box(0.3, -0.04, 0.3, 0.32, 0.08, 0.07, 'n').box(0.3, -0.04, -0.37, 0.32, 0.08, 0.07, 'n').build('gun'));
  const spark = new Part(); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; spark.seg('line', W(0.64, 0, 0), W(0.64 + 0.28 * Math.cos(a), 0.28 * Math.sin(a) * 0.5, 0.28 * Math.sin(a))); }
  spark.box(0.6, -0.05, -0.05, 0.1, 0.1, 0.1, 'l');
  const sp = spark.build('spark'); sp.visible = false; wrist.add(sp);
  return g;
}
// A finished car drawn into a shared part (the lot draws its cars as one), facing north with its front at (x, y):
// a body, a glasshouse with windscreen and back window, wheels, lamps
export function carInto(p, x, y, tone) {
  const L = BODY_LEN;
  p.box(x - 0.9, y, 0.32, 1.8, L, 0.62, tone).box(x - 0.8, y + 1.25, 0.94, 1.6, 2.25, 0.5, tone);
  beam(p, [x, y + 0.75, 0.95], [x, y + 1.27, 1.42], 1.5, 'g', 0.04);
  beam(p, [x, y + 3.48, 1.42], [x, y + 3.95, 0.95], 1.5, 'g', 0.04);
  p.fill2(SIDE(x + 0.8, y + 3.4, 1.4), 0.1, 0.06, 2.0, 0.36, 'glass', 0.02);
  for (const wy of [y + 0.75, y + 3.6]) for (const wx of [x - 0.98, x + 0.72]) p.box(wx, wy - 0.34, 0, 0.26, 0.68, 0.68, 'k');
  for (const dx of [-0.75, 0.35]) p.box(x + dx, y - 0.03, 0.55, 0.4, 0.05, 0.14, 'l');
  return p;
}
// An AGV: a low cart that follows the floor paths with a crate of parts on it
export function buildAgv() { return new Part().box(-1.6, -0.6, 0.05, 1.6, 1.2, 0.3, 'k').box(-1.45, -0.5, 0.35, 1.3, 1.0, 0.55, 'n').box(-0.2, -0.15, 0.35, 0.15, 0.3, 0.12, 'l').build('agv'); }
