import * as THREE from 'three';
import { W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { crown } from '../world/ground';
import { beam } from './works';

// ---- a knight for the joust (local: +x forward, origin on the ground under the horse's middle) ----
// After the German tournament books of the sixteenth century: a destrier in a caparison that hangs almost to its
// hooves, cut in its rider's colours (bendy, barry, paly, or plain with a border), a steel chanfron on its head with a
// plume, another plume on its rump, a long flowing tail. In the high war saddle a knight in full plate: a frog-mouthed
// tilting helm crowned with a great crest of feathers, a targe on the left breast, the reins in the left hand, and the
// lance, striped like a barber's pole, with a vamplate over the hand and a three-pronged coronel at its tip.
// Its pieces are groups so the sim can move them: the four legs (galloping), the rider (who can be unhorsed), and the
// lance (raised, couched, or broken off at the vamplate, with a spray of splinters).
export type Livery = { cap: string, stripe: string, pattern: 'bendy' | 'barry' | 'paly' | 'plain' };
const T = (t: string) => t === 'k' ? 'kb' : 'nb';
export const SEAT = 1.62, GRIP: [number, number, number] = [0.15, 0.36, 2.1], LANCE = 4.6;
// a plume: a cluster of feathers, a few crowns of different sizes
function plume(p: Part, x: number, y: number, z: number, s: number, tones: string[]) {
  const pts = [[0, 0, 0, 1], [-0.18, 0.12, 0.14, 0.8], [-0.2, -0.13, 0.1, 0.78], [-0.36, 0, 0.24, 0.7], [0.1, 0, 0.22, 0.6]];
  pts.forEach(([dx, dy, dz, k], i) => p.geo(crown, new THREE.Matrix4().compose(W(x + dx * s, y + dy * s, z + dz * s), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), i * 1.3), v3(0.22 * s * k, 0.2 * s * k, 0.22 * s * k)), tones[i % tones.length]));
}
export function buildDestrier(L: Livery) {
  const g = new THREE.Group(); g.name = 'destrier';
  const p = new Part(), c = T(L.cap), st = T(L.stripe);
  // the caparison: a body of cloth, wider at its hem, from the breast to the crupper
  const X0 = -1.25, X1 = 1.0, ZT = 1.6, ZB = 0.42, YT = 0.44, YB = 0.66;
  const sec = [[0, -YT, ZT], [0, YT, ZT], [0, YB, ZB], [0, -YB, ZB]];
  p.extrude(sec.map(([, y, z]) => [X0, y, z]), [X1 - X0, 0, 0], c);
  // its colours on the sides (and the breast and the rump), drawn on the cloth
  const side = (s: number, x: number, t: number, lift = 0.012) => W(x, s * (YT + (YB - YT) * t + lift), ZT - (ZT - ZB) * t);
  const end = (x: number, u: number, t: number, lift: number) => { const hw = YT + (YB - YT) * t; return W(x + lift, u * hw, ZT - (ZT - ZB) * t); };
  for (const s of [1, -1]) {
    if (L.pattern === 'paly') for (let x = X0 + 0.25; x < X1 - 0.1; x += 0.5) p.poly(st, [side(s, x, 0), side(s, x + 0.25, 0), side(s, x + 0.25, 1), side(s, x, 1)]);
    if (L.pattern === 'barry') for (let t = 0.14; t < 1; t += 0.28) p.poly(st, [side(s, X0, t), side(s, X1, t), side(s, X1, t + 0.14), side(s, X0, t + 0.14)]);
    if (L.pattern === 'bendy') for (let x = X0 - 1.1; x < X1; x += 0.56) {
      const q = [[x, 1], [x + 0.28, 1], [x + 0.28 + 1.1, 0], [x + 1.1, 0]].map(([xx, t]) => [Math.max(X0, Math.min(X1, xx)), t]);
      p.poly(st, q.map(([xx, t]) => side(s, xx, t))); }
    // a border round the hem, and its scallops
    p.poly(st, [side(s, X0, 0.88), side(s, X1, 0.88), side(s, X1, 1), side(s, X0, 1)]);
    for (let x = X0; x < X1 - 0.05; x += 0.25) p.seg('detail', side(s, x, 1, 0.02), side(s, x + 0.125, 0.94, 0.02)).seg('detail', side(s, x + 0.125, 0.94, 0.02), side(s, x + 0.25, 1, 0.02));
  }
  for (const [x, lift] of [[X1, 0.012], [X0, -0.012]]) { p.poly(st, [end(x, -1, 0.88, lift), end(x, 1, 0.88, lift), end(x, 1, 1, lift), end(x, -1, 1, lift)]);
    if (L.pattern === 'paly' || L.pattern === 'bendy') p.poly(st, [end(x, -0.2, 0, lift), end(x, 0.2, 0, lift), end(x, 0.2, 0.88, lift), end(x, -0.2, 0.88, lift)]); }
  // the neck in its cloth, the crinet's plates over it, the head in its chanfron, the ears, the bridle and reins
  beam(p, [0.7, 0, 1.45], [1.15, 0, 2.15], 0.46, c);
  for (let k = 0; k < 4; k++) { const f = k / 4; beam(p, [0.74 + 0.38 * f, 0, 1.73 + 0.6 * f], [0.82 + 0.38 * f, 0, 1.86 + 0.6 * f], 0.36, 'nb', 0.1); }
  p.box(1.0, -0.15, 1.98, 0.75, 0.3, 0.32, 'nb').box(1.62, -0.11, 1.9, 0.22, 0.22, 0.24, 'nb');
  for (const s of [-1, 1]) { p.box(1.2, s * 0.155 - 0.04, 2.1, 0.12, 0.08, 0.1, 'kb'); p.box(1.05, s * 0.1 - 0.03, 2.3, 0.06, 0.06, 0.14, 'nb'); }
  p.seg('line', W(1.6, 0.16, 2.0), W(0.45, 0.28, 2.0)).seg('line', W(1.6, -0.16, 2.0), W(0.45, -0.28, 2.0));
  plume(p, 1.12, 0, 2.42, 0.9, [st, c]);
  // the war saddle: a high cantle behind, a high pommel in front, a steel plate over the pommel
  p.box(-0.35, -0.38, ZT, 0.8, 0.76, 0.12, c).box(-0.42, -0.36, ZT + 0.1, 0.12, 0.72, 0.62, 'nb').box(0.3, -0.36, ZT + 0.1, 0.14, 0.72, 0.42, 'nb');
  // the crupper's plume, the tail
  plume(p, -1.15, 0, 1.78, 0.8, [st, c]);
  for (let k = 0; k < 7; k++) { const dy = (k - 3) * 0.05; p.seg('line', W(-1.25, dy, 1.5), W(-1.55, dy * 2.4, 0.95)).seg('line', W(-1.55, dy * 2.4, 0.95), W(-1.7 - (k % 3) * 0.08, dy * 3, 0.4)); }
  g.add(p.build('horse'));
  // the legs, from the shoulder and the hip, below the hem: shanks and hooves
  const legs = ([[0.62, 0.22], [0.62, -0.22], [-0.85, 0.22], [-0.85, -0.22]] as number[][]).map(([x, y], i) => {
    const q = new Part(); q.box(-0.08, -0.08, -1.0, 0.16, 0.16, 0.98, 'nb').box(-0.1, -0.1, -1.08, 0.2, 0.2, 0.12, 'kb');
    const lg = q.build(`leg${i}`); lg.position.copy(W(x, y, 1.08)); g.add(lg); return lg; });
  return { g, legs };
}
// the knight: seated with his origin at the saddle's seat, facing +x
export function buildKnight(L: Livery) {
  const p = new Part(), c = T(L.cap), st = T(L.stripe), z = 0;
  // the legs in plate down either side of the horse, the sabatons in the stirrups
  for (const s of [1, -1]) { beam(p, [0.0, s * 0.2, z + 0.05], [0.28, s * 0.5, z - 0.35], 0.2, 'nb'); beam(p, [0.28, s * 0.5, z - 0.35], [0.18, s * 0.56, z - 0.95], 0.17, 'nb');
    p.box(0.1, s * 0.56 - 0.08, z - 1.05, 0.34, 0.16, 0.1, 'nb').seg('line', W(0.2, s * 0.5, z - 0.95), W(0.12, s * 0.42, z - 0.3)); }
  // the tassets, the breastplate and backplate, the gorget
  p.extrude([[-0.2, -0.3, z], [0.24, -0.3, z], [0.26, -0.3, z + 0.18], [-0.22, -0.3, z + 0.18]], [0, 0.6, 0], 'nb');
  p.extrude([[-0.18, -0.26, z + 0.18], [0.2, -0.26, z + 0.18], [0.26, -0.3, z + 0.7], [-0.2, -0.3, z + 0.72]], [0, 0.6, 0], 'nb');
  p.cylZ(0, 0, z + 0.72, 0.18, 0.12, 8, 'nb');
  // a surcoat's skirt in his colours below the plate
  p.box(-0.24, -0.34, z - 0.08, 0.5, 0.68, 0.18, c);
  // the pauldrons, the left arm forward to the reins, the right bent under the lance
  for (const s of [1, -1]) p.cylZ(0, s * 0.33, z + 0.58, 0.16, 0.16, 8, 'nb');
  beam(p, [0, -0.33, z + 0.58], [0.3, -0.3, z + 0.28], 0.12, 'nb'); beam(p, [0.3, -0.3, z + 0.28], [0.55, -0.15, z + 0.3], 0.11, 'nb');
  beam(p, [0, 0.33, z + 0.58], [0.05, 0.38, z + 0.3], 0.12, 'nb'); beam(p, [0.05, 0.38, z + 0.3], [0.25, 0.36, z + 0.45], 0.11, 'nb');
  // the targe on the left breast, with his colours on it
  p.extrude([[0.24, -0.36, z + 0.25], [0.3, -0.06, z + 0.3], [0.3, -0.06, z + 0.66], [0.24, -0.36, z + 0.66]], [0.05, 0, 0], c);
  p.seg('line', W(0.36, -0.33, z + 0.3), W(0.36, -0.08, z + 0.62)).seg('line', W(0.36, -0.08, z + 0.3), W(0.36, -0.33, z + 0.62));
  // the tilting helm: a long skull, the frog's mouth jutting forward over the sight, bolted to the breastplate
  p.extrude([[-0.2, -0.17, z + 0.82], [0.24, -0.17, z + 0.82], [0.3, -0.17, z + 1.02], [0.12, -0.17, z + 1.08], [0.18, -0.17, z + 1.16], [-0.04, -0.17, z + 1.26], [-0.22, -0.17, z + 1.12]], [0, 0.34, 0], 'nb');
  p.seg('detail', W(0.13, -0.18, z + 1.075), W(0.13, 0.18, z + 1.075));
  // the crest: a cap of mantling and a great plume of feathers, in his colours
  p.box(-0.12, -0.1, z + 1.24, 0.22, 0.2, 0.08, st);
  plume(p, -0.02, 0, z + 1.42, 1.2, [st, c, st]);
  for (let k = 0; k < 5; k++) p.seg('line', W(-0.2, (k - 2) * 0.06, z + 1.2), W(-0.6, (k - 2) * 0.11, z + 0.75));
  return p.build('knight');
}
// the lance, from its butt (behind the grip) to its tip, along +x from the grip: a pole striped in a spiral, the
// vamplate, the coronel; and the stub left in the hand when it breaks, and the splinters
export function buildLance(L: Livery) {
  const g = new THREE.Group(); g.name = 'lance';
  const p = new Part(), c = T(L.cap), st = T(L.stripe);
  p.geo(new THREE.CylinderGeometry(0.05, 0.085, LANCE, 8), new THREE.Matrix4().compose(W(LANCE / 2 - 0.9, 0, 0), new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), -Math.PI / 2), v3(1, 1, 1)), st);
  for (let x = -0.7; x < LANCE - 1.1; x += 0.24) { const r = 0.09 - x * 0.007, a = x * 5; p.seg('line', W(x, r * Math.cos(a), r * Math.sin(a)), W(x + 0.24, r * Math.cos(a + 1.6), r * Math.sin(a + 1.6))); }
  for (const a of [0, 2.1, 4.2]) p.seg('line', W(LANCE - 0.9, 0, 0), W(LANCE - 0.82, 0.07 * Math.cos(a), 0.07 * Math.sin(a)));
  const whole = p.build('whole'); g.add(whole);
  const v = new Part(); v.geo(new THREE.ConeGeometry(0.2, 0.32, 10), new THREE.Matrix4().compose(W(0.3, 0, 0), new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), -Math.PI / 2), v3(1, 1, 1)), c);
  g.add(v.build('vamplate'));
  const sp = new Part(); sp.geo(new THREE.CylinderGeometry(0.07, 0.085, 1.5, 8), new THREE.Matrix4().compose(W(-0.15, 0, 0), new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), -Math.PI / 2), v3(1, 1, 1)), st);
  for (let k = 0; k < 6; k++) { const a = k; sp.seg('line', W(0.6, 0, 0), W(0.75 + 0.1 * (k % 2), 0.06 * Math.cos(a), 0.06 * Math.sin(a))); }
  const stub = sp.build('stub'); stub.visible = false; g.add(stub);
  // the splinters, flying from where it broke
  const f = new Part(); for (let k = 0; k < 14; k++) { const a = k * 2.39, b = (k % 5) * 0.3 - 0.6, r = 0.5 + (k % 4) * 0.35;
    f.seg('line', W(1.0 + 0.2 * Math.cos(a), 0.2 * Math.sin(a), 0.1 * b), W(1.0 + r * Math.cos(a) + 0.6, r * Math.sin(a), r * b)); }
  const splinters = f.build('splinters'); splinters.visible = false; g.add(splinters);
  return { g, whole, stub, splinters };
}
// a whole knight on his horse as one block, for the far view
export function buildKnightLite(L: Livery) {
  const p = new Part(), c = T(L.cap);
  p.box(-1.25, -0.6, 0.2, 2.25, 1.2, 1.4, c).box(0.7, -0.2, 1.4, 0.9, 0.4, 0.7, c).box(-0.3, -0.3, 1.6, 0.6, 0.6, 1.3, 'nb');
  return p.build('knightLite');
}
