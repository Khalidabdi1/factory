// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { SEA_Z } from '../layout';
import { ring, yaw } from '../world/ground';

export function buildSailboat() {
  const p = new Part();
  p.extrude([[-3, -0.9, -0.3], [1.6, -0.9, -0.3], [3, 0, -0.3], [1.6, 0.9, -0.3], [-3, 0.9, -0.3]], [0, 0, 0.8]);
  p.box(-2.3, -0.6, 0.5, 1.9, 1.2, 0.35);
  p.box(0.2, -0.06, 0.5, 0.12, 0.12, 6.6);
  const sail = [W(0.2, 0, 1.1), W(0.2, 0, 7.0), W(-2.8, 0, 1.1)], jib = [W(0.42, 0, 6.6), W(2.85, 0, 0.62), W(0.42, 0, 0.9)];
  for (const q of [sail, jib]) { p.poly('kob', q); for (let i = 0; i < 3; i++) p.seg('koline', q[i], q[(i + 1) % 3]); }
  return p.build('sailboat');
}
export function buildMotorboat() {
  const p = new Part();
  p.extrude([[-3.2, -1.1, -0.3], [2, -1.1, -0.3], [3.8, 0, -0.3], [2, 1.1, -0.3], [-3.2, 1.1, -0.3]], [0, 0, 0.9]);
  p.box(-1.8, -0.85, 0.6, 2.4, 1.7, 0.9);
  p.box(-2.0, -0.95, 1.5, 2.8, 1.9, 0.12);
  const f = SIDE(0.6, 0.85, 1.5); p.fill2(f, 0.15, 0.1, 1.4, 0.55).rect2(f, 0.15, 0.1, 1.4, 0.55, 'line');
  for (const y of [-0.9, 0.9]) p.seg('detail', W(-3.2, y, -0.3), W(-9, y * 3.2, -0.3));
  return p.build('motorboat');
}
export function buildLighthouse() {
  const p = new Part(), x = 402, y = 311.5;
  p.cylZ(x, y, SEA_Z - 0.4, 2.6, 2.2, 16);
  for (let i = 0; i < 4; i++) p.cylZ(x, y, 1.6 + i * 2.3, 1.45 - i * 0.12, 2.3, 14, i % 2 ? 'k' : 'n');
  const top = 1.6 + 4 * 2.3;
  p.cylZ(x, y, top, 1.55, 0.2, 16);
  const r = ring(x, y, 1.5, top + 1.0, 16); for (let i = 0; i < r.length; i += 2) p.seg('line', r[i], r[i + 1]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p.seg('line', W(x + 1.5 * Math.cos(a), y + 1.5 * Math.sin(a), top + 0.2), W(x + 1.5 * Math.cos(a), y + 1.5 * Math.sin(a), top + 1.0)); }
  p.cylZ(x, y, top + 0.2, 0.85, 1.4, 12, 'l');
  p.geo(new THREE.ConeGeometry(1.1, 1.2, 12), new THREE.Matrix4().compose(W(x, y, top + 2.2), yaw(0), v3(1, 1, 1)));
  p.fill2(FRONT(x - 0.4, y + 1.43, 4.6), 0, 0, 0.8, 1.6).rect2(FRONT(x - 0.4, y + 1.43, 4.6), 0, 0, 0.8, 1.6, 'line');
  const g = p.build('lighthouse');
  const b = new Part();
  for (const s of [1, -1]) for (const a of [-0.05, 0, 0.05]) b.seg('live', W(0, 0, 0), W(s * 36 * Math.cos(a), s * 36 * Math.sin(a), 0));
  const beam = b.build('beam'); beam.position.copy(W(x, y, top + 0.9)); beam.visible = false; g.add(beam);
  return g;
}
