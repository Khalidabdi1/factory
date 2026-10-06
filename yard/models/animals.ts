import * as THREE from 'three';
import { W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { beam } from './works';

// ---- the village's animals and machines ----
// Each animal is one part in the single-fill tones (two draw calls: its fill and its hairlines), facing +x with its
// feet at z 0. They do not move their legs: a walking animal bobs, a grazing one tips its nose to the ground.
const T = (k: boolean) => k ? 'kb' : 'nb';
// a sheep: a woolly body, a dark face and legs (the flock's are blackfaced, hill sheep)
export function buildSheep() {
  const p = new Part();
  p.box(-0.55, -0.3, 0.38, 1.0, 0.6, 0.5, 'nb').box(-0.5, -0.26, 0.86, 0.9, 0.52, 0.08, 'nb');
  p.box(0.42, -0.13, 0.62, 0.28, 0.26, 0.3, 'kb').box(0.46, -0.2, 0.84, 0.1, 0.4, 0.06, 'kb');
  for (const [x, y] of [[-0.45, -0.2], [-0.45, 0.13], [0.26, -0.2], [0.26, 0.13]]) p.box(x, y, 0, 0.08, 0.08, 0.4, 'kb');
  return p.build('sheep');
}
// a cow: a deep body, patches, a broad head, horns
export function buildCow() {
  const p = new Part();
  p.box(-1.0, -0.38, 0.7, 1.9, 0.76, 0.75, 'nb');
  p.box(-0.6, -0.39, 1.0, 0.5, 0.01, 0.35, 'kb').box(0.2, 0.38, 0.85, 0.45, 0.01, 0.4, 'kb').box(-0.3, -0.3, 1.45, 0.6, 0.5, 0.01, 'kb');
  p.box(0.86, -0.2, 0.95, 0.5, 0.4, 0.42, 'nb').box(1.32, -0.16, 0.95, 0.12, 0.32, 0.2, 'kb');
  for (const s of [-1, 1]) p.seg('line', W(1.0, s * 0.18, 1.35), W(0.98, s * 0.38, 1.5));
  p.seg('line', W(-1.0, 0, 1.3), W(-1.15, 0, 0.6));
  for (const [x, y] of [[-0.9, -0.3], [-0.9, 0.18], [0.62, -0.3], [0.62, 0.18]]) p.box(x, y, 0, 0.13, 0.13, 0.72, 'nb');
  return p.build('cow');
}
// a horse: a long body on long legs, a neck raised forward, a mane, a tail
export function buildHorse() {
  const p = new Part();
  p.box(-0.85, -0.28, 1.0, 1.65, 0.56, 0.62, 'nb');
  beam(p, [0.62, 0, 1.45], [1.0, 0, 2.05], 0.36, 'nb');
  p.box(0.9, -0.12, 1.86, 0.62, 0.24, 0.28, 'nb').box(0.98, -0.05, 2.12, 0.08, 0.1, 0.14, 'kb');
  beam(p, [0.62, 0, 1.68], [0.98, 0, 2.2], 0.08, 'kb');
  p.seg('koline', W(-0.85, 0, 1.55), W(-1.1, 0, 0.95)).seg('koline', W(-0.86, 0.04, 1.5), W(-1.08, 0.05, 1.0));
  for (const [x, y] of [[-0.75, -0.2], [-0.75, 0.1], [0.55, -0.2], [0.55, 0.1]]) p.box(x, y, 0, 0.1, 0.1, 1.02, 'nb');
  return p.build('horse');
}
// a pig: a round body low on short legs, a snout, ears forward, a curl of tail
export function buildPig() {
  const p = new Part();
  p.box(-0.55, -0.27, 0.22, 1.05, 0.54, 0.5, 'nb').box(0.5, -0.16, 0.3, 0.22, 0.32, 0.3, 'nb').box(0.72, -0.09, 0.34, 0.06, 0.18, 0.14, 'kb');
  for (const s of [-1, 1]) p.box(0.5, s * 0.12 - 0.05, 0.6, 0.12, 0.1, 0.08, 'nb');
  p.seg('line', W(-0.55, 0, 0.6), W(-0.66, 0.06, 0.66)).seg('line', W(-0.66, 0.06, 0.66), W(-0.62, -0.04, 0.72));
  for (const [x, y] of [[-0.45, -0.2], [-0.45, 0.12], [0.3, -0.2], [0.3, 0.12]]) p.box(x, y, 0, 0.09, 0.09, 0.24, 'nb');
  return p.build('pig');
}
// a hen: a small body, a tail up, a comb
export function buildHen() {
  const p = new Part();
  p.box(-0.16, -0.09, 0.16, 0.3, 0.18, 0.18, 'nb').box(0.1, -0.05, 0.3, 0.12, 0.1, 0.12, 'nb').box(0.13, -0.015, 0.42, 0.06, 0.03, 0.05, 'kb');
  p.box(-0.22, -0.06, 0.28, 0.08, 0.12, 0.14, 'kb');
  for (const y of [-0.05, 0.04]) p.box(-0.01, y, 0, 0.02, 0.02, 0.16, 'kb');
  return p.build('hen');
}
// a small farm tractor towing a plough: big rear wheels, small front ones, a cab frame over the seat, an exhaust
export function buildFarmTractor() {
  const g = new THREE.Group(); g.name = 'farmTractor';
  const p = new Part();
  p.box(-0.4, -0.45, 0.55, 2.3, 0.9, 0.7, 'kb').box(1.2, -0.38, 1.25, 0.7, 0.76, 0.35, 'kb');   // the body and its bonnet
  for (const s of [-1, 1]) {
    p.geo(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 12), new THREE.Matrix4().compose(W(0, s * 0.72, 0.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), v3(1, 1, 1)), 'nb');
    p.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), new THREE.Matrix4().compose(W(1.55, s * 0.6, 0.42), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), v3(1, 1, 1)), 'nb');
  }
  // the cab: four posts and a roof
  for (const [x, y] of [[-0.35, -0.45], [-0.35, 0.45], [0.55, -0.45], [0.55, 0.45]]) p.seg('line', W(x, y, 1.25), W(x, y, 2.45));
  p.box(-0.45, -0.55, 2.45, 1.1, 1.1, 0.08, 'nb');
  p.box(0.0, -0.18, 1.25, 0.4, 0.36, 0.3, 'nb');
  p.seg('line', W(1.6, 0.25, 1.6), W(1.6, 0.25, 2.3));
  // the plough behind: a frame and four shares
  p.box(-2.4, -0.9, 0.35, 1.6, 1.8, 0.12, 'nb').box(-0.85, -0.08, 0.4, 0.5, 0.16, 0.12, 'nb');
  for (let k = 0; k < 4; k++) p.box(-2.3 + k * 0.38, -0.8 + k * 0.45, 0, 0.3, 0.12, 0.38, 'kb');
  g.add(p.build('tractorBody'));
  return g;
}
