import * as THREE from 'three';
import { W, plane } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import * as worksM from './works';
const { beam } = worksM as any;

// ---- Starship, after the real one (V3): a stainless steel stack 9 m across, Super Heavy 72 m tall under the ship's 52 ----
// Models stand on their own axis: local origin at the middle of the bottom, +z up the vehicle. The ship's heat shield of
// black hexagonal tiles is on its +y side (the windward side, away from the tower when it stands on the pad).
export const R = 4.5, RING = 1.8, BARREL = 7.2, N = 28;
export const BOOSTER = { len:72, pins:66 }, SHIP = { len:52, pins:44 };

// ---- Raptor 3: full-flow staged combustion, no heat shield round it and next to no plumbing outside ----
// Built bottom up on its stand in six pieces: the regeneratively cooled bell, the combustion chamber, the main
// injector with the gimbal block on top, the oxygen turbopump with its oxidiser-rich preburner, the fuel turbopump with
// its fuel-rich preburner, and the hot-gas manifolds and the actuators that steer it. Local origin at the nozzle's exit.
export const RAPTOR = { h:3.1, exit:0.65, pieces:['the nozzle bell', 'the combustion chamber', 'the main injector and gimbal', 'the oxygen turbopump', 'the fuel turbopump', 'the manifolds and actuators'] };
const lathe = (pts: number[][], n: number) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), n);
const at = (x: number, y: number, z: number) => new THREE.Matrix4().setPosition(W(x, y, z));
export function bellInto(p: Part, x: number, y: number, z: number, s = 1, vac = false) {
  const e = vac ? 1.15 : RAPTOR.exit, L = vac ? 2.6 : 1.6;
  p.geo(lathe([[e * s, 0], [e * 0.82 * s, L * 0.35 * s], [e * 0.55 * s, L * 0.75 * s], [0.24 * s, L * s]], 10), at(x, y, z));
  return p;
}
const RAPTOR_PIECES: [string, (p: Part) => void][] = [
    ['bell', p => { bellInto(p, 0, 0, 0); for (const z of [0.5, 1.0]) { const r = 0.65 - z * 0.24; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, b = (i + 1) / 12 * Math.PI * 2; p.seg('detail', W(r * Math.cos(a), r * Math.sin(a), z), W(r * Math.cos(b), r * Math.sin(b), z)); } } }],
    ['chamber', p => { p.cylZ(0, 0, 1.6, 0.3, 0.7, 12, 'n').cylZ(0, 0, 1.58, 0.34, 0.08, 12, 'k'); }],
    ['injector', p => { p.geo(lathe([[0.36, 0], [0.42, 0.12], [0.3, 0.3], [0.12, 0.36]], 12), at(0, 0, 2.3)); p.box(-0.18, -0.18, 2.62, 0.36, 0.36, 0.42, 'k'); }],
    ['oxpump', p => { p.cylZ(0.5, 0, 1.75, 0.22, 0.75, 10, 'n').cylZ(0.5, 0, 2.5, 0.15, 0.35, 8, 'k'); beam(p, [0.5, 0, 2.2], [0.18, 0, 2.45], 0.14, 'n'); }],
    ['fuelpump', p => { p.cylZ(-0.5, 0, 1.75, 0.2, 0.7, 10, 'n').cylZ(-0.5, 0, 2.45, 0.14, 0.35, 8, 'k'); beam(p, [-0.5, 0, 2.2], [-0.18, 0, 2.45], 0.14, 'n'); }],
    ['manifold', p => { beam(p, [0.5, 0, 1.8], [0.25, 0.1, 1.62], 0.1, 'k'); beam(p, [-0.5, 0, 1.8], [-0.25, -0.1, 1.62], 0.1, 'k');
      beam(p, [0, 0.3, 1.9], [0, 0.32, 2.95], 0.07, 'k'); beam(p, [0.3, -0.05, 1.9], [0.32, -0.05, 2.95], 0.07, 'k'); }],
];
// on its build stand: each piece its own part, shown as it goes on
export function buildRaptor() {
  const g = new THREE.Group(); g.name = 'raptor';
  const parts = RAPTOR_PIECES.map(([name, f]) => { const p = new Part(); f(p); const m = p.build(name); g.add(m); return m; });
  return { g, parts };
}
// a finished one, all in one part (on its cradle, on the trolley, on the lift)
let SOLID: THREE.Group | null = null;
export function raptorSolid() { if (!SOLID) { const p = new Part(); for (const [, f] of RAPTOR_PIECES) f(p); SOLID = p.build('raptor'); } return SOLID.clone(); }

// ---- the hull, a piece at a time: rings, barrels of three, domes, the aft section, the booster's top, the ship's nose ----
const circle = (p: Part, r: number, z: number, k = 'detail', n = N) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
  p.seg(k, W(r * Math.cos(a), r * Math.sin(a), z), W(r * Math.cos(b), r * Math.sin(b), z)); } };
// a length of hull from z0 to z1, its weld seams every ring; tiles: the ship's black hexagons over the +y half
export function hullInto(p: Part, z0: number, z1: number, o: { tiles?: boolean, conduit?: boolean } = {}) {
  p.cylZ(0, 0, z0, R, z1 - z0, N, 'n');
  for (let z = z0 + RING; z < z1 - 0.2; z += RING) circle(p, R + 0.02, z);
  // the long seams between the sheets, so the hull reads as a solid from any angle in flight
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; p.seg('detail', W((R + 0.02) * Math.cos(a), (R + 0.02) * Math.sin(a), z0), W((R + 0.02) * Math.cos(a), (R + 0.02) * Math.sin(a), z1)); }
  if (o.conduit) p.box(-0.35, -R - 0.35, z0, 0.7, 0.4, z1 - z0, 'n', { seams:false });
  if (o.tiles) {
    const n = 14, rr = R + 0.05;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI, b = (i + 1) / n * Math.PI;
      const A = (z: number) => W(rr * Math.cos(a), rr * Math.sin(a), z), B = (z: number) => W(rr * Math.cos(b), rr * Math.sin(b), z);
      p.poly('kob', [A(z0), B(z0), B(z1), A(z1)]);
      for (let z = z0 + 0.9; z < z1; z += 0.9) p.seg('koline', A(z), B(z)); }
    for (const a of [0, Math.PI]) p.seg('line', W(rr * Math.cos(a), rr * Math.sin(a), z0), W(rr * Math.cos(a), rr * Math.sin(a), z1));
  }
  return p;
}
// a dome inside a barrel shows only as a weld line round the outside; the top dome caps a stack that is still growing
export function domeInto(p: Part, z: number, up = true) {
  p.geo(new THREE.SphereGeometry(R - 0.05, N, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().compose(W(0, 0, z), new THREE.Quaternion(), v3(1, up ? 0.45 : -0.45, 1)), 'n');
  return p;
}
// Super Heavy's aft section: the skirt round 33 Raptors (3 in the middle, 10 round them that steer, 20 fixed round
// the outside), the dark heat shield between their bells, the chines starting up its sides
export function boosterAftInto(p: Part, engines = 33) {
  hullInto(p, 0, 7.2, { conduit:true });
  p.poly('kob', Array.from({ length:N }, (_, i) => W(R * Math.cos(-i / N * Math.PI * 2), R * Math.sin(-i / N * Math.PI * 2), 0.6)));
  BOOSTER_ENGINES.slice(0, engines).forEach(([x, y]) => bellInto(p, x, y, -0.3, 0.95));
  return p;
}
export const BOOSTER_ENGINES = (() => { const out: number[][] = [];
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; out.push([0.95 * Math.cos(a), 0.95 * Math.sin(a)]); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; out.push([2.35 * Math.cos(a), 2.35 * Math.sin(a)]); }
  for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20 * Math.PI * 2; out.push([3.72 * Math.cos(a), 3.72 * Math.sin(a)]); }
  return out; })();
// the booster's top: the forward dome, three grid fins, the catch pins the tower's arms take it by, and the hot-staging
// ring above, open all round so the ship's engines can light before the two part
export function boosterTopInto(p: Part, z: number) {
  hullInto(p, z, z + 5.1, { conduit:true }); domeInto(p, z + 4.5);
  const hs = z + 5.1, n = 16; z += 1.5;
  p.cylZ(0, 0, hs, R, 0.3, N, 'n').cylZ(0, 0, hs + 1.8, R, 0.3, N, 'n');
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; beam(p, [R * 0.96 * Math.cos(a), R * 0.96 * Math.sin(a), hs + 0.3], [R * 0.96 * Math.cos(a + 0.2), R * 0.96 * Math.sin(a + 0.2), hs + 1.8], 0.25, 'k'); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    // a grid fin: a frame stood out from the hull on its shaft, its lattice in hairlines
    const o = (u: number, v: number, w: number) => [c * (R + u) - s * v, s * (R + u) + c * v, w];
    beam(p, o(0, 0, z + 1.6), o(0.8, 0, z + 1.6), 0.3, 'k');
    const q = [o(0.8, -1.9, z + 0.4), o(0.8, 1.9, z + 0.4), o(0.8, 1.9, z + 2.9), o(0.8, -1.9, z + 2.9)].map(a3 => W(a3[0], a3[1], a3[2]));
    p.poly('kob', q); for (let k = 0; k < 4; k++) p.seg('koline', q[k], q[(k + 1) % 4]);
    for (let u = 1; u < 6; u++) { const f = u / 6; p.seg('detail', q[0].clone().lerp(q[1], f), q[3].clone().lerp(q[2], f)); p.seg('detail', q[0].clone().lerp(q[3], f), q[1].clone().lerp(q[2], f)); } }
  for (const s of [-1, 1]) p.box(-0.5, s * R - (s < 0 ? 0.6 : 0), z + 0.6, 1.0, 0.6, 0.8, 'k');   // the catch pins
  return p;
}
// the chines: two strakes down the booster's sides
export function chinesInto(p: Part, z0: number, z1: number) { for (const s of [-1, 1]) p.box(R - 0.1, s > 0 ? 0 : -0.25, z0, 0.6, 0.25, z1 - z0, 'n', { seams:false }); return p; }

// the ship's aft section: the skirt, three sea-level Raptors in the middle and three vacuum Raptors with their wide
// bells round them, the aft flaps
export function shipAftInto(p: Part, engines = 6) {
  hullInto(p, 0, 7.2, { tiles:true });
  p.poly('kob', Array.from({ length:N }, (_, i) => W(R * Math.cos(-i / N * Math.PI * 2), R * Math.sin(-i / N * Math.PI * 2), 0.9)));
  SHIP_ENGINES.slice(0, engines).forEach(([x, y, vac]) => bellInto(p, x, y, vac ? -1.2 : -0.3, 1, !!vac));
  flapsInto(p, 0.8, 8.2, 3.6);
  return p;
}
export const SHIP_ENGINES = [0, 1, 2].map(i => { const a = i / 3 * Math.PI * 2 + 0.5; return [1.1 * Math.cos(a), 1.1 * Math.sin(a), 0]; })
  .concat([0, 1, 2].map(i => { const a = i / 3 * Math.PI * 2 + 0.5 + Math.PI / 3; return [3.05 * Math.cos(a), 3.05 * Math.sin(a), 1]; }));
// a pair of flaps on the ±x sides, square to the tiles (local x: across the vehicle), from z0 to z1, w out from the hull
function flapsInto(p: Part, z0: number, z1: number, w: number, taper = 0) {
  for (const s of [-1, 1]) { const x0 = s * (R - 0.2), x1 = s * (R + w);
    const q = [W(x0, 0, z0), W(x1, 0, z0 + 0.6), W(x1, 0, z1 - taper), W(x0, 0, z1)];
    p.extrude([[x0, -0.2, z0], [x1, -0.2, z0 + 0.6], [x1, -0.2, z1 - taper], [x0, -0.2, z1]], [0, 0.4, 0], 'n');
    p.poly('kob', q.map(v => v.clone().add(W(0, 0.22, 0)))); }
}
// the nose: the payload bay's last barrel, with its door, under the ogive and its forward flaps
export function noseInto(p: Part, z: number, hull = 8.2) {
  hullInto(p, z, z + hull, { tiles:true });
  p.fill2(plane([-1.4, -R - 0.06, z + hull - 0.4], [1, 0, 0], [0, 0, -1]), 0, 0, 2.8, 3.2, 'kob', -0.01);   // the payload door, on the leeward side
  z += hull - 4.4;
  const prof: number[][] = []; for (let i = 0; i <= 6; i++) { const f = i / 6; prof.push([R * Math.sqrt(1 - f * f * 0.97), f * 7.6]); }
  prof.push([0.05, 7.8]);
  p.geo(lathe(prof, N), at(0, 0, z + 4.4));
  // the tiles carried up the ogive's windward side
  for (let i = 0; i < 6; i++) { const r0 = prof[i][0] + 0.05, r1 = prof[i + 1][0] + 0.05, z0 = z + 4.4 + prof[i][1], z1 = z + 4.4 + prof[i + 1][1];
    for (let j = 0; j < 10; j++) { const a = j / 10 * Math.PI, b = (j + 1) / 10 * Math.PI;
      p.poly('kob', [W(r0 * Math.cos(a), r0 * Math.sin(a), z0), W(r0 * Math.cos(b), r0 * Math.sin(b), z0), W(r1 * Math.cos(b), r1 * Math.sin(b), z1), W(r1 * Math.cos(a), r1 * Math.sin(a), z1)]); } }
  flapsInto(p, z + 3.2, z + 9.0, 2.2, 1.6);
  return p;
}

// what each Mega Bay stacks, bottom up: [what it is, its height, how to draw it at z]
export type Piece = { name: string, h: number, into: (p: Part, z: number) => void };
const barrel = (name: string, tiles: boolean, dome = false): Piece => ({ name, h:BARREL, into:(p, z) => { hullInto(p, z, z + BARREL, { tiles, conduit:!tiles }); if (dome) circle(p, R + 0.03, z + 2.4, 'line'); } });
export const BOOSTER_PIECES: Piece[] = [
  { name:'the aft section', h:7.2, into:(p, z) => { hullInto(p, z, z + 7.2, { conduit:true }); p.poly('kob', Array.from({ length:N }, (_, i) => W(R * Math.cos(-i / N * Math.PI * 2), R * Math.sin(-i / N * Math.PI * 2), z + 0.6))); } },
  ...Array.from({ length:4 }, (_, i) => barrel(`oxygen tank barrel ${i + 1}`, false)),
  barrel('the common dome', false, true),
  ...Array.from({ length:3 }, (_, i) => barrel(`methane tank barrel ${i + 1}`, false)),
  { name:'the forward dome, grid fins and hot-staging ring', h:7.2, into:(p, z) => boosterTopInto(p, z) },
];
export const SHIP_PIECES: Piece[] = [
  { name:'the aft section and aft flaps', h:7.2, into:(p, z) => { hullInto(p, z, z + 7.2, { tiles:true }); p.poly('kob', Array.from({ length:N }, (_, i) => W(R * Math.cos(-i / N * Math.PI * 2), R * Math.sin(-i / N * Math.PI * 2), z + 0.9))); flapsInto(p, z + 0.8, z + 8.2, 3.6); } },
  ...Array.from({ length:2 }, (_, i) => barrel(`oxygen tank barrel ${i + 1}`, true)),
  barrel('the common dome', true, true),
  barrel('the methane tank barrel', true),
  { name:'the payload bay and nosecone', h:16, into:(p, z) => noseInto(p, z) },
];
export const zOfPiece = (list: Piece[], i: number) => list.slice(0, i).reduce((s, q) => s + q.h, 0);

// the finished vehicles, each one part
export function buildBooster() {
  const p = new Part(); boosterAftInto(p);
  let z = 7.2; for (const q of BOOSTER_PIECES.slice(1, -1)) { q.into(p, z); z += q.h; }
  boosterTopInto(p, z); chinesInto(p, 7.2, 60);
  return p.build('booster');
}
export function buildShip() {
  const p = new Part(); shipAftInto(p);
  let z = 7.2; for (const q of SHIP_PIECES.slice(1, -1)) { q.into(p, z); z += q.h; }
  noseInto(p, z);
  return p.build('ship');
}
// a stack's engines as installed so far, drawn into one part rebuilt as each goes in
export function enginesPart(ship: boolean, n: number) {
  const p = new Part();
  if (ship) SHIP_ENGINES.slice(0, n).forEach(([x, y, vac]) => bellInto(p, x, y, vac ? -1.2 : -0.3, 1, !!vac));
  else BOOSTER_ENGINES.slice(0, n).forEach(([x, y]) => bellInto(p, x, y, -0.3, 0.95));
  return p.build('engines');
}
// one piece on its own (in the factory, on the cart, on the crane's hook)
export function buildPiece(q: Piece) { const p = new Part(); q.into(p, 0); return p.build('piece'); }

// ---- the tower's chopsticks: two arms on a carriage that rides up and down the tower; they swing together and open
// and close to take a booster or a ship by its pins (local: origin at the hinge line's middle, the arms along +x) ----
export const ARMS = { len:36, hinge:4.2, carriage:[13.4, 6] };
export function buildChopsticks() {
  const g = new THREE.Group(); g.name = 'chopsticks';
  const arms = [-1, 1].map(s => {
    const a = new THREE.Group(); a.position.copy(W(0, s * ARMS.hinge, 0)); g.add(a);
    const p = new Part(); p.box(0, -0.9, -2.2, ARMS.len, 1.8, 0.6, 'n').box(0, -0.9, 1.0, ARMS.len, 1.8, 0.6, 'n');
    for (let x = 0; x < ARMS.len; x += 3) { p.seg('line', W(x, s * 0.9, -1.6), W(x + 3, s * 0.9, 1.0)); p.seg('line', W(x, s * 0.9, -1.6), W(x, s * 0.9, 1.0)); }
    p.box(ARMS.len - 1.0, -0.9, -2.6, 1.0, 1.8, 4.2, 'n');
    // the catch rails along the inner side, where the pins land
    p.box(14, -s * 1.1 - 0.2, 1.6, 16, 0.4, 0.3, 'k');
    a.add(p.build('arm')); return a; });
  return { g, arms };
}
export function buildCarriage() {
  const p = new Part(), [w, h] = ARMS.carriage;
  for (const [x, y] of [[-w / 2, -w / 2], [w / 2 - 0.8, -w / 2], [-w / 2, w / 2 - 0.8], [w / 2 - 0.8, w / 2 - 0.8]]) p.box(x, y, 0, 0.8, 0.8, h, 'k');
  p.box(-w / 2, -w / 2, h - 0.8, w, w, 0.8, 'k', { seams:false }).box(-w / 2, -w / 2, 0, w, w, 0.8, 'k', { seams:false });
  return p.build('carriage');
}
// the ship's quick disconnect arm: a truss from the tower to the ship's aft end (local: +x out from its hinge)
export function buildQdArm() {
  const p = new Part(); p.box(0, -1.0, -1.0, 17, 2.0, 2.0, 'n');
  for (let x = 0; x < 17; x += 2.5) p.seg('line', W(x, 1.0, -1.0), W(x + 2.5, 1.0, 1.0));
  p.box(16.2, -1.4, -1.4, 1.2, 2.8, 2.8, 'k');
  return p.build('qdArm');
}

// ---- the transporters ----
// an SPMT: a long low platform on many small wheels, the transport stand on top that a vehicle stands in
export const SPMT = { deck:1.6, stand:5.6 };
export function buildSpmt() {
  const p = new Part(); p.box(-6.5, -5.5, 0.5, 13, 11, 1.1, 'k');
  for (let x = -5.8; x < 6; x += 1.45) for (const y of [-5.6, -2, 2, 5.6]) p.cylY(x, y - 0.35, 0.45, 0.42, 0.7, 8, 'k');
  // the stand: a ring on four legs
  for (const [x, y] of [[-4.6, -4.6], [3.9, -4.6], [-4.6, 3.9], [3.9, 3.9]]) p.box(x, y, 1.6, 0.7, 0.7, 4.0, 'n');
  p.cylZ(0, 0, 5.0, R + 0.5, 0.6, N, 'n');
  p.box(5.2, -1.4, 1.6, 1.3, 2.8, 1.6, 'n');   // the driver's console
  return p.build('spmt');
}
// a barrel cart: a smaller SPMT with a round cradle; the engine cart: a trailer behind a tug, four cradles in a row
export function buildBarrelCart() {
  const p = new Part(); p.box(-5.5, -4.6, 0.4, 11, 9.2, 0.9, 'k');
  for (let x = -5; x < 5.5; x += 1.6) for (const y of [-4.7, 4.0]) p.cylY(x, y, 0.38, 0.36, 0.7, 8, 'k');
  p.cylZ(0, 0, 1.3, R + 0.2, 0.3, N, 'n');
  return p.build('barrelCart');
}
export function buildEngineCart() {
  const p = new Part(); p.box(0, -0.9, 0.4, 2.6, 1.8, 1.5, 'n').box(0.3, -0.75, 1.9, 1.4, 1.5, 0.9, 'g').box(-14, -1.2, 0.5, 13.6, 2.4, 0.4, 'k');
  for (const x of [1.9, 0.5, -2.2, -12]) for (const s of [-1, 1]) p.cylY(x, s > 0 ? 1.0 : -1.3, 0.35, 0.35, 0.3, 8, 'k');
  for (let i = 0; i < 6; i++) p.box(-1.6 - i * 2.1 - 0.9, -0.9, 0.9, 1.8, 1.8, 0.3, 'n');
  return p.build('engineCart');
}

// ---- fire and steam ----
// a plume: a long cone of flame and a ring of hairlines round its root, drawn live (local: pointing down -z from 0)
export function buildPlume(r: number, len: number) {
  const p = new Part();
  // (a tongue that narrows away from the bells, with the shock diamonds' rings down it)
  p.geo(new THREE.CylinderGeometry(r, r * 0.22, len, 10, 1, true), new THREE.Matrix4().setPosition(W(0, 0, -len / 2)), 'l');
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; p.seg('line', W(r * Math.cos(a), r * Math.sin(a), 0), W(r * 0.5 * Math.cos(a), r * 0.5 * Math.sin(a), -len * 0.75)); }
  for (const f of [0.18, 0.36, 0.54]) circle(p, r * (1 - 0.78 * f) + 0.05, -len * f, 'line', 10);
  return p.build('plume');
}
export const buildPuff = () => new Part().geo(new THREE.IcosahedronGeometry(1, 0), new THREE.Matrix4(), 'n').build('puff');

// ---- a Mega Bay's crane: a girder across the bay (local: from its west wall along +x, hanging below the rails), its
// trolley, the hook block on four cables (a unit length, stretched to reach) ----
export function buildCrane(span: number, at: number) {
  const g = new THREE.Group(); g.name = 'crane';
  const p = new Part(); p.box(0, -1.2, -2.2, span, 2.4, 2.2, 'k').box(at - 2, -2, -3.6, 4, 4, 1.4, 'n');
  for (let x = 2; x < span; x += 3) p.seg('line', W(x, 1.21, -2.2), W(x + 1.5, 1.21, 0));
  g.add(p.build('girder'));
  const hook = new THREE.Group(); hook.name = 'hook'; g.add(hook);
  hook.add(new Part().box(-1.6, -1.6, 0, 3.2, 3.2, 1.0, 'k').box(-0.3, -0.3, -0.8, 0.6, 0.6, 0.8, 'n').build('block'));
  const c = new Part(); for (const [x, y] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) c.seg('line', W(x, y, 0), W(x, y, 1));
  const cable = c.build('cable'); cable.position.copy(W(0, 0, 1.0)); hook.add(cable);
  return { g, hook, cable };
}
// the engine lift under a stand: a scissor platform that raises a Raptor into the aft section
export function buildLift() {
  const g = new THREE.Group(); g.name = 'lift';
  const p = new Part(); p.box(-1.2, -1.2, 0, 2.4, 2.4, 0.4, 'k');
  for (const s of [-1, 1]) p.seg('line', W(-1, s * 1.1, 0.4), W(1, s * 1.1, -2)).seg('line', W(1, s * 1.1, 0.4), W(-1, s * 1.1, -2));
  g.add(p.build('liftDeck'));
  const r = raptorSolid(); r.name = 'engine'; r.position.copy(W(0, 0, 0.4)); g.add(r);
  return g;
}
