import * as THREE from 'three';
import { FRONT, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { beam } from './works';

// ---- POL-AIR, the police helicopter ----
// A twin-engined police helicopter, nose to +x, its skids at z 0: a rounded cabin with a glazed nose, the engine
// cowling and exhausts on top, a tail boom to a fin and a tail rotor, a searchlight and a camera ball under the nose,
// POLICE along its side. The main rotor and the tail rotor are groups of their own, turned by the sim.
export function buildHeli() {
  const g = new THREE.Group(); g.name = 'heli';
  const p = new Part();
  // the cabin: a profile in x–z swept across, its nose glazed
  const prof: [number, number][] = [[-1.6, 0.55], [1.2, 0.55], [2.2, 0.85], [2.75, 1.35], [2.6, 1.95], [1.6, 2.35], [-1.2, 2.35], [-1.9, 1.7]];
  p.extrude(prof.map(([x, z]) => [x, -0.75, z]), [0, 1.5, 0], 'k');
  p.extrude([[1.25, -0.77, 1.15], [2.15, -0.77, 0.95], [2.55, -0.77, 1.45], [2.45, -0.77, 1.9], [1.55, -0.77, 2.2]], [0, 1.54, 0], 'g', { seams:false });
  p.fill2(FRONT(-1.2, 0.76, 2.1), 0.2, 0.05, 1.2, 0.8, 'glass', 0.02).text(FRONT(-1.4, 0.77, 1.35), 'POLICE', 1.1, 0.42, 0.34, 'ink', 'middle', 0.03);
  // the engine cowling and the rotor mast
  p.box(-1.0, -0.5, 2.35, 2.0, 1.0, 0.45, 'k').cylZ(0, 0, 2.8, 0.14, 0.45, 8, 'k');
  for (const s of [-1, 1]) p.box(-1.3, s * 0.42 - 0.08, 2.5, 0.35, 0.16, 0.16, 'n');
  // the tail boom, the fin and its stabiliser, the tail rotor's hub
  beam(p, [-1.8, 0, 1.75], [-6.2, 0, 1.95], 0.42, 'k', 0.38);
  p.extrude([[-5.7, 0, 1.9], [-6.5, 0, 1.9], [-6.9, 0, 3.0], [-6.4, 0, 3.0]], [0, 0.12, 0], 'k');
  p.box(-6.1, -0.9, 1.85, 0.5, 1.8, 0.08, 'k');
  // the skids on their struts, the searchlight and the camera ball under the nose, the beacon on the tail
  for (const s of [-1, 1]) { p.seg('line', W(-1.6, s * 0.95, 0.05), W(1.9, s * 0.95, 0.05)).seg('line', W(1.9, s * 0.95, 0.05), W(2.2, s * 0.95, 0.25));
    for (const x of [-0.9, 1.0]) p.seg('line', W(x, s * 0.95, 0.05), W(x, s * 0.6, 0.6)); }
  p.cylZ(1.9, 0.35, 0.3, 0.17, 0.25, 8, 'l');
  p.geo(new THREE.SphereGeometry(0.2, 8, 5), new THREE.Matrix4().compose(W(2.1, -0.3, 0.45), new THREE.Quaternion(), v3(1, 1, 1)), 'n');
  p.box(-6.55, -0.08, 3.0, 0.16, 0.16, 0.14, 'l');
  g.add(p.build('heliBody'));
  // the main rotor: four blades on the hub, turned about the mast
  const r = new Part(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    r.extrude([[0.3 * c - 0.14 * s, 0.3 * s + 0.14 * c, 0], [5.3 * c - 0.14 * s, 5.3 * s + 0.14 * c, 0], [5.3 * c + 0.14 * s, 5.3 * s - 0.14 * c, 0], [0.3 * c + 0.14 * s, 0.3 * s - 0.14 * c, 0]], [0, 0, 0.05], 'k', { seams:false }); }
  r.cylZ(0, 0, -0.1, 0.32, 0.22, 8, 'k');
  const rotor = r.build('rotor'); rotor.position.copy(W(0, 0, 3.28)); g.add(rotor);
  const t = new Part(); for (const s of [-1, 1]) t.box(-0.05, -0.04, 0, 0.1, 0.08, s * 0.75);
  const tail = t.build('tailRotor'); tail.position.copy(W(-6.45, 0.2, 2.45)); g.add(tail);
  return g;
}
// the helipad on the station's roof: a ring and an H
export function buildHelipad(p: Part, cx: number, cy: number, z: number) {
  const segs: THREE.Vector3[] = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * Math.PI * 2; segs.push(W(cx + 5.2 * Math.cos(a), cy + 5.2 * Math.sin(a), z)); }
  for (let k = 1; k < segs.length; k++) p.seg('line', segs[k - 1], segs[k]);
  for (const [a, b] of [[[-1.6, -2.2], [-1.6, 2.2]], [[1.6, -2.2], [1.6, 2.2]], [[-1.6, 0], [1.6, 0]]]) p.seg('line', W(cx + a[0], cy + a[1], z), W(cx + b[0], cy + b[1], z));
}
