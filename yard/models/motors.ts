import * as THREE from 'three';
import { W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { WDECK, carAlong } from './train';

// ---- Sahel Motors: what moves there (local frames: +x forward, origin at the front or the pivot) ----

// a finished car as a part of its own, front at the origin facing +x, on the ground: drawn into a shared part at any
// angle with put() (the towers draw every car they hold as one)
const CAR: Record<string, Part> = {};
export const carPart = (tone: string) => CAR[tone] ??= carAlong(new Part(), 0, tone, 0);

// a tower's lift: a round platform on the lift's carriage, a turntable ring let into it, the sled that pushes a car out
// into its bay and draws it back, guide shoes on the four columns
export function buildLift() {
  const p = new Part();
  p.cylZ(0, 0, -0.32, 2.6, 0.32, 16, 'k').cylZ(0, 0, 0, 1.6, 0.04, 16, 'n');
  for (const a of [1, 3, 5, 7]) { const x = 2.75 * Math.cos(a * Math.PI / 4), y = 2.75 * Math.sin(a * Math.PI / 4); p.box(x - 0.2, y - 0.2, -0.5, 0.4, 0.4, 0.7, 'k'); }
  p.box(-2.2, -0.3, 0.04, 4.4, 0.6, 0.06, 'n');
  return p.build('lift');
}
// a crossing barrier's arm: striped, a lamp near its tip, a counterweight behind the pivot (pivot at the origin, the
// arm along +x; the arm's group is turned up about its own axis to raise it)
export function buildBarrierArm(len: number) {
  const p = new Part();
  for (let u = 0, i = 0; u < len - 1e-6; u += 1, i++) p.box(u, -0.07, -0.07, Math.min(1, len - u), 0.14, 0.14, i % 2 ? 'nb' : 'kb');
  p.box(-0.9, -0.15, -0.2, 0.7, 0.3, 0.4, 'kb');
  const g = p.build('arm');
  const lamp = new Part().box(len - 0.6, -0.1, 0.07, 0.2, 0.2, 0.12, 'l').build('armLamp'); g.add(lamp);
  return g;
}
// the ramp that rises out of the track behind the shuttle at Sahel Motors: a steel plate hinged at its low end (the
// origin), 7 m long to its lip, with kerbs along its sides and two rams under the lip
export function buildMotorsRamp() {
  const g = new THREE.Group(), tilt = new Part();
  tilt.box(0, -1.25, -0.1, 7, 2.5, 0.1, 'n');
  for (let u = 0.5; u < 7; u += 0.5) tilt.seg('detail', W(u, -1.2, 0.01), W(u, 1.2, 0.01));
  for (const y of [-1.25, 1.1]) tilt.box(0.3, y, 0, 6.7, 0.15, 0.18, 'k');
  tilt.box(6.6, -1.25, -0.1, 0.4, 2.5, 0.14, 'k');
  const t = tilt.build('tilt'); g.add(t);
  // the rams stand on the ground under the lip; they are scaled to the plate's height
  const rams = new Part(); for (const y of [-0.8, 0.8]) rams.cylZ(6.6, y, 0, 0.12, 1, 8, 'k');
  const r = rams.build('rams'); g.add(r);
  g.userData.raise = (k: number) => { t.rotation.z = k * Math.atan2(WDECK, 7); r.scale.y = Math.max(0.01, k * WDECK); };
  g.userData.raise(0);
  return g;
}
// the display stand a car turns on in the showroom: its disc, the car on top
export function buildTurntable() {
  return new Part().cylZ(0, 0, 0, 3.1, 0.12, 20, 'k').cylZ(0, 0, 0.12, 2.9, 0.02, 20, 'n').build('turntable');
}
