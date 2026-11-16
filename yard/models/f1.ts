import * as THREE from 'three';
import { SIDE, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { beam } from './works';

// ---- a Grand Prix car (local: +x forward, origin at the tip of the nose, like the road vehicles) ----
// 5.6 m long and 2 m wide: the front wing on its endplates, the nose rising to the tub, the cockpit under its halo with
// the driver's helmet, the sidepods and the engine cover swept up to the airbox, the floor, the rear wing on its pillar
// with the DRS flap, and four wheels standing out in the air on their wishbones. A team's livery is its two tones: the
// body in one, the wings in the other. One fill per tone, so a car is four draw calls and its number.
export const F1_LEN = 5.6;
const T = (t: string) => t === 'k' ? 'kb' : 'nb';
export function buildF1(body: string, wing: string, num: string, lite = false, stripe = false) {
  const b = T(body), w = T(wing), p = new Part();
  if (lite) { p.box(-5.4, -0.95, 0.08, 5.2, 1.9, 0.5, b).box(-5.6, -0.5, 0.6, 0.5, 1.0, 0.35, w); return p.build('f1Lite'); }
  // the floor and the plank
  p.box(-4.9, -0.95, 0.06, 3.4, 1.9, 0.06, 'kb');
  // the front wing: two elements across the car, endplates, the nose's pylons
  p.box(-0.75, -0.98, 0.1, 0.62, 1.96, 0.06, w).box(-0.95, -0.95, 0.2, 0.4, 1.9, 0.05, w);
  for (const y of [-0.98, 0.92]) p.box(-1.0, y, 0.08, 0.95, 0.06, 0.28, w);
  // the nose: a wedge from the tip up to the bulkhead
  p.extrude([[-0.1, -0.25, 0.2], [-1.9, -0.25, 0.2], [-1.9, -0.25, 0.62], [-0.4, -0.25, 0.34]], [0, 0.5, 0], b);
  // the tub, the cockpit's rim, the halo over it
  p.box(-3.5, -0.42, 0.16, 1.6, 0.84, 0.5, b);
  p.box(-3.25, -0.3, 0.66, 0.95, 0.6, 0.04, 'kb');
  beam(p, [-2.3, 0, 0.66], [-2.45, 0, 0.98], 0.06, 'kb'); beam(p, [-2.45, 0, 0.98], [-3.25, 0.32, 0.92], 0.06, 'kb'); beam(p, [-2.45, 0, 0.98], [-3.25, -0.32, 0.92], 0.06, 'kb');
  for (const y of [0.32, -0.32]) beam(p, [-3.25, y, 0.92], [-3.4, y, 0.66], 0.06, 'kb');
  // the driver's helmet, in the wings' colour so it shows against the body
  p.cylZ(-2.85, 0, 0.62, 0.15, 0.24, 8, w);
  // the sidepods, undercut in front and tapering to the back; the engine cover up to the airbox and its fin
  for (const s of [1, -1]) p.extrude([[-2.5, s * 0.42, 0.14], [-4.5, s * 0.42, 0.14], [-4.5, s * 0.55, 0.22], [-2.8, s * 0.95, 0.24], [-2.55, s * 0.95, 0.24]], [0, 0, 0.36], b, { seams:false });
  p.extrude([[-3.5, -0.3, 0.16], [-3.5, -0.3, 0.66], [-4.95, -0.3, 0.42], [-4.95, -0.3, 0.16]], [0, 0.6, 0], b);
  p.extrude([[-3.3, 0, 0.6], [-3.3, 0, 1.06], [-3.8, 0, 1.0], [-5.0, 0, 0.62], [-5.0, 0, 0.4]], [0, 0.04, 0], w);
  p.box(-3.6, -0.3, 0.6, 1.4, 0.6, 0.3, b).box(-3.5, -0.16, 0.9, 0.5, 0.32, 0.16, b);
  // the rear wing: main plane and flap between endplates, on a swan-neck pillar; the diffuser under it
  p.box(-5.55, -0.52, 0.86, 0.36, 1.04, 0.05, w).box(-5.35, -0.52, 0.95, 0.2, 1.04, 0.04, w);
  for (const y of [-0.55, 0.5]) p.box(-5.6, y, 0.42, 0.62, 0.05, 0.66, w);
  beam(p, [-5.0, 0, 0.45], [-5.3, 0, 0.88], 0.06, 'kb'); p.box(-5.5, -0.5, 0.08, 0.6, 1.0, 0.2, 'kb');
  // the wheels, outboard on their wishbones: wider at the back
  for (const [x, r, wd] of [[-1.15, 0.33, 0.33], [-4.55, 0.36, 0.42]]) for (const s of [1, -1]) {
    p.cylY(x, s > 0 ? 0.62 : -0.62 - wd, r, r, wd, 12, 'kb');
    for (const z of [0.22, 0.42]) beam(p, [x, s * 0.42, z], [x, s * 0.66, r], 0.035, 'kb');
  }
  // a band of the wing colour over the sidepods and round the nose, for the team whose two tones another shares
  if (stripe) { p.box(-3.3, -0.97, 0.6, 0.45, 1.94, 0.02, w).box(-1.6, -0.27, 0.56, 0.3, 0.54, 0.08, w); }
  const g = p.build('f1');
  // the car's number on the engine cover's fin, the side the viewer sees
  const n = new Part(); n.text(SIDE(-3.8, 0.04, 0.98), num, 0.45, 0.3, 0.3, 'ink', 'middle', -0.01).text(SIDE(-3.8, -0.04, 0.98), num, 0.45, 0.3, 0.3, 'ink', 'middle', 0.01);
  g.add(n.build('num'));
  return g;
}
// the pit crew at a box: a dozen of them round the car, three at each wheel, the jacks front and back, the lollipop
export function buildCrew() {
  const p = new Part(), fig = (x: number, y: number, h = 1.7, t = 'kb') => { p.box(x - 0.18, y - 0.2, 0, 0.36, 0.4, h * 0.55, t).box(x - 0.2, y - 0.22, h * 0.55, 0.4, 0.44, h * 0.3, t).cylZ(x, y, h * 0.85, 0.13, 0.22, 8, 'kb'); };
  for (const [x, r] of [[-1.15, 0.33], [-4.55, 0.36]]) for (const s of [1, -1]) { fig(x, s * 1.45, 1.1); fig(x - 0.6, s * 1.35, 1.1); fig(x + 0.6, s * 1.4, 1.7); }
  fig(0.9, 0, 1.1); fig(-6.4, 0, 1.1); fig(1.8, -1.6, 1.75, 'nb');
  p.seg('line', W(1.8, -1.6, 1.0), W(1.8, -0.4, 1.0)); p.cylY(1.8, -0.5, 1.0, 0.25, 0.04, 10, 'nb');
  beam(p, [0.9, 0, 0.3], [0.2, 0, 0.2], 0.12, 'nb'); beam(p, [-6.4, 0, 0.3], [-5.6, 0, 0.2], 0.12, 'nb');
  return p.build('crew');
}
// a trophy on its plinth, held up on the podium
export function buildTrophy() { const p = new Part(); p.box(-0.1, -0.1, 0, 0.2, 0.2, 0.12, 'nb'); p.geo(new THREE.CylinderGeometry(0.16, 0.06, 0.32, 8), new THREE.Matrix4().makeTranslation(...W(0, 0, 0.28).toArray()), 'k'); p.geo(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 4), new THREE.Matrix4().compose(W(0, 0, 0.5), new THREE.Quaternion(), v3(1, 1, 1)), 'k'); return p.build('trophy'); }
