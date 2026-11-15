import * as THREE from 'three';
import { W, plane } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { MILL, landZ } from '../land';
import { beam } from '../models/works';

// ---- Knoll Mill, the windmill above Millbrook's hay meadow ----
// An English tower mill of 1814: an eight-sided tower of brick, limewashed white, tapering from 8.8 m across at the foot
// to 5.7 m at the curb, its windows and doors in black frames, a reefing stage round it at the stone floor, and on top a
// tarred boat-shaped cap that the fantail at its back winds round to face the wind. Four patent sails, 21 m across, with shutters that
// open to spill the wind, turn on a windshaft tilted up a little toward them.
//
// Inside, five floors: the ground floor where the flour is weighed and stacked, the meal floor where it runs from the
// stones into sacks (a governor there keeps the stones the right distance apart), the stone floor with two pairs of
// stones in their tuns under the hoppers, the bin floor with the grain bins, and the dust floor under the cap. The
// sails' brake wheel turns the wallower on the upright shaft, which runs down the middle of the tower to the great spur
// wheel; that drives a stone nut for each pair. A sack hoist lifts the grain up through trapdoors to the bin floor.
//
// Opened, the tower is drawn as a section: the half toward the viewer taken away down the middle (along the line from
// north-east to south-west), the cut ends hatched, every floor with what stands on it, and the cap's shell lifted off so
// its gearing shows. All of it is drawn in the mill's own frame: origin on the tower's axis at its floor (MILL.z), +x east.
export const TOWER = { rb:4.4, rt:2.85, h:17.6, wall:0.55 };
export const FLOORS = [0, 3.5, 7.0, 10.6, 14.1];
export const FLOOR_NAMES = ['the ground floor', 'the meal floor', 'the stone floor', 'the bin floor', 'the dust floor'];
export const CAP_Z = TOWER.h, AXIS = 1.55, SAIL_X = 5.7, SAIL_R = 10.5, TILT = 0.14;
export const STAGE = { z:FLOORS[2], out:1.4 };
// the great spur wheel, under the bin floor's joists
const SPUR = FLOORS[3] - 0.85;
const C8 = Math.cos(Math.PI / 8);
export const R = (z: number) => TOWER.rb + (TOWER.rt - TOWER.rb) * z / TOWER.h;
// the inside face of the wall, measured to the middle of a side
export const inner = (z: number) => R(z) * C8 - TOWER.wall;
// the section's frame: b runs back from the cut, away from the viewer (north-west), l along the cut (south-west to
// north-east, as the viewer sees it left to right)
const BV = [-Math.SQRT1_2, -Math.SQRT1_2], LV = [Math.SQRT1_2, -Math.SQRT1_2];
export const bl = (b: number, l: number) => [BV[0] * b + LV[0] * l, BV[1] * b + LV[1] * l];
// where things stand inside, as (b, l): the stones (and the stone nuts over them, the meal spouts and sacks under
// them), the ladders (all one above the other, each climbing from b0 on its floor to b1 at the floor above), the sack
// hoist's line through the trapdoors, the governor, the flour stacks
export const SPOT = { stones:[[1.1, -1.55], [1.1, 1.55]], ladder:[1.5, 2.3], hoist:[0.05, -2.2], governor:[0.5, 0.95], stack:[[2.65, -1.55], [2.65, 1.45]], scales:[0.35, 2.2],
  bins:[[2.05, -1.5], [2.05, 1.5]] };
export const DOOR = [0, R(0) * C8 + 0.6];   // outside the door, on the south face
export const STAGE_DOOR = [0, R(STAGE.z) * C8 + 0.7];
// the cart by the door, and the sacks of grain it brought up, a row of four, three high
export const CART = { x:3.9, y:6.2 };

// a point on side k of the tower (its middle faces the heading kπ/4), u along it to the viewer's right, at height z,
// lifted off its face by lift
const N = (k: number) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)];
const T = (k: number) => [Math.sin(k * Math.PI / 4), -Math.cos(k * Math.PI / 4)];
const onSide = (k: number, u: number, z: number, lift = 0) => { const n = N(k), t = T(k), a = R(z) * C8 + lift; return W(n[0] * a + t[0] * u, n[1] * a + t[1] * u, z); };
const sideM = (k: number, u: number, z: number, lift = 0.03) => { const n = N(k), t = T(k), a = R(z) * C8 + lift, k8 = (TOWER.rb - TOWER.rt) / TOWER.h * C8;
  return plane([n[0] * a + t[0] * u, n[1] * a + t[1] * u, z], [t[0], t[1], 0], [n[0] * k8, n[1] * k8, -1]); };
const corner = (i: number, z: number, r = R(z)) => { const a = Math.PI / 8 + i * Math.PI / 4; return W(r * Math.cos(a), r * Math.sin(a), z); };
// a framed opening on a side: a white frame, glass (lit at night) or a white door, its glazing bars
function opening(p: Part, k: number, u: number, z0: number, w: number, h: number, door = false) {
  const q = (uu: number, zz: number, l: number) => onSide(k, uu, zz, l);
  p.poly('kob', [q(u - w / 2 - 0.12, z0 - 0.12, 0.02), q(u + w / 2 + 0.12, z0 - 0.12, 0.02), q(u + w / 2 + 0.12, z0 + h + 0.12, 0.02), q(u - w / 2 - 0.12, z0 + h + 0.12, 0.02)]);
  p.poly(door ? 'deck' : 'window', [q(u - w / 2, z0, 0.04), q(u + w / 2, z0, 0.04), q(u + w / 2, z0 + h, 0.04), q(u - w / 2, z0 + h, 0.04)]);
  const L = (a: number[], b: number[]) => p.seg('line', q(a[0], a[1], 0.05), q(b[0], b[1], 0.05));
  L([u - w / 2, z0], [u + w / 2, z0]); L([u + w / 2, z0], [u + w / 2, z0 + h]); L([u + w / 2, z0 + h], [u - w / 2, z0 + h]); L([u - w / 2, z0 + h], [u - w / 2, z0]);
  if (door) { L([u, z0], [u, z0 + h]); for (const f of [0.3, 0.7]) L([u - w / 2, z0 + h * f], [u + w / 2, z0 + h * f]); }
  else { L([u, z0], [u, z0 + h]); L([u - w / 2, z0 + h / 2], [u + w / 2, z0 + h / 2]); }
}
// a disc on edge or flat: a wheel with spokes and cogs. axis 'x' (in the y–z plane) or 'z' (flat)
function wheel(p: Part, c: number[], r: number, th: number, axis: 'x' | 'z', spokes: number, cogs: number, tone = 'n', n = 24) {
  const ring: number[][] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2;
    ring.push(axis === 'z' ? [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2] - th / 2] : [c[0] - th / 2, c[1] + r * Math.cos(a), c[2] + r * Math.sin(a)]); }
  p.extrude(ring, axis === 'z' ? [0, 0, th] : [th, 0, 0], tone, { seams:false });
  const at = (a: number, rr: number, d: number) => axis === 'z' ? W(c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a), c[2] + d) : W(c[0] + d, c[1] + rr * Math.cos(a), c[2] + rr * Math.sin(a));
  const f = th / 2 + 0.02;
  for (let i = 0; i < spokes; i++) { const a = i / spokes * Math.PI * 2; p.seg('line', at(a, r * 0.12, f), at(a, r * 0.9, f)).seg('line', at(a, r * 0.12, -f), at(a, r * 0.9, -f)); }
  for (let i = 0; i < cogs; i++) { const a = i / cogs * Math.PI * 2; p.seg('detail', at(a, r, f), at(a, r + 0.12, f)); }
  return p;
}
const cylX = (p: Part, x0: number, y: number, z: number, r: number, len: number, n = 10, tone = 'n') => {
  const q: number[][] = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; q.push([x0, y + r * Math.cos(a), z + r * Math.sin(a)]); }
  return p.extrude(q, [len, 0, 0], tone, { seams:false });
};
// a sack standing on the floor: a box with its neck tied
export function sack(p: Part, x: number, y: number, z: number, tone: string, h = 0.82) {
  p.box(x - 0.27, y - 0.22, z, 0.54, 0.44, h, tone).box(x - 0.08, y - 0.08, z + h, 0.16, 0.16, 0.12, tone);
  return p;
}

export function buildWindmill() {
  const [cx, cy] = MILL.c, Z = MILL.z;
  const g = new THREE.Group(); g.name = 'windmill'; g.position.copy(W(cx, cy, Z));

  // ---- always there: the knoll's gravel, the path to the door, the cart track up from the fields, the cart, two worn
  // out stones leaning on the tower, the reefing stage ----
  const p = new Part();
  const pad: THREE.Vector3[] = []; for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2; pad.push(W(7.2 * Math.cos(a), 7.2 * Math.sin(a), 0.02)); }
  p.poly('deck', pad); for (let i = 0; i < 16; i++) p.seg('detail', pad[i], pad[(i + 1) % 16]);
  for (let y = DOOR[1] - 0.6; y < 7.4; y += 0.7) p.seg('detail', W(-0.7, y, 0.04), W(0.7, y, 0.04));
  p.seg('detail', W(-0.7, DOOR[1] - 0.6, 0.04), W(-0.7, 7.1, 0.04)).seg('detail', W(0.7, DOOR[1] - 0.6, 0.04), W(0.7, 7.1, 0.04));
  // the track: two ruts in the grass, up from the lane along the fields' edge and round onto the knoll, on the land
  const track = [[1668, 36], [1668, -4], [1676, -9], [1688, -10.5]].map(([x, y]) => [x - cx, y - cy]);
  for (const side of [-0.7, 0.7]) for (let i = 1; i < track.length; i++) {
    const [ax, ay] = track[i - 1], [bx, by] = track[i], L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L * side, ny = (bx - ax) / L * side;
    for (let s = 0; s < L; s += 1.2) { const s1 = Math.min(L, s + 1.2), P = (t: number) => { const x = ax + (bx - ax) * t / L + nx, y = ay + (by - ay) * t / L + ny; return W(x, y, landZ(x + cx, y + cy) - Z + 0.06); };
      p.seg('detail', P(s), P(s1)); }
  }
  // the cart, its shafts down on the ground to the east
  const { x:kx, y:ky } = CART;
  p.box(kx - 1.4, ky - 0.75, 0.7, 2.8, 1.5, 0.12).box(kx - 1.4, ky - 0.75, 0.82, 2.8, 0.08, 0.38).box(kx - 1.4, ky + 0.67, 0.82, 2.8, 0.08, 0.38).box(kx - 1.48, ky - 0.75, 0.82, 0.08, 1.5, 0.38);
  for (const s of [-1, 1]) { p.cylY(kx - 0.1, ky + s * 0.8 - (s > 0 ? 0 : 0.14), 0.62, 0.62, 0.14, 14, 'n'); beam(p, [kx + 1.4, ky + s * 0.5, 0.78], [kx + 3.4, ky + s * 0.42, 0.1], 0.1, 'n'); }
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI; for (const s of [-1, 1]) p.seg('line', W(kx - 0.1, ky + s * 0.87, 0.62), W(kx - 0.1 + 0.6 * Math.cos(a), ky + s * 0.87, 0.62 + 0.6 * Math.sin(a))); }
  // two old stones, worn out and leaning on the east side of the tower, and a water butt
  for (const [u, lean] of [[-1.4, 0.32], [0.9, 0.26]]) {
    const n = N(0), t = T(0), a = R(0.6) * C8 + 0.45;
    p.geo(new THREE.CylinderGeometry(0.62, 0.62, 0.24, 16), new THREE.Matrix4().compose(W(n[0] * a + t[0] * u, n[1] * a + t[1] * u, 0.62),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 - lean)), v3(1, 1, 1)), 'n');
  }
  p.cylZ(-2.6, 4.0, 0, 0.42, 0.95, 10, 'k');
  // a bench against the tower by the door, for a pipe in the sun
  p.box(1.3, 4.35, 0.42, 1.6, 0.42, 0.08).box(1.35, 4.42, 0, 0.1, 0.3, 0.42).box(2.75, 4.42, 0, 0.1, 0.3, 0.42);
  // the reefing stage: a deck round the tower at the stone floor, on brackets, with a rail
  const sz = STAGE.z, rIn = R(sz), rOut = rIn + STAGE.out / C8;
  for (let i = 0; i < 8; i++) {
    const a = corner(i, sz - 0.18, rIn - 0.05), b = corner(i + 1, sz - 0.18, rIn - 0.05), c = corner(i + 1, sz - 0.18, rOut), d = corner(i, sz - 0.18, rOut);
    p.extrude([[a.x, a.z, sz - 0.18], [b.x, b.z, sz - 0.18], [c.x, c.z, sz - 0.18], [d.x, d.z, sz - 0.18]], [0, 0, 0.18], 'n', { seams:false });
    const o0 = corner(i, sz, rOut - 0.05), o1 = corner(i + 1, sz, rOut - 0.05);
    for (const h of [0.5, 1.0]) p.seg('line', o0.clone().setY(sz + h), o1.clone().setY(sz + h));
    for (const f of [0, 0.5]) { const q = o0.clone().lerp(o1, f); p.seg('line', q.clone(), q.clone().setY(sz + 1.0)); }
    // a bracket from the wall a metre and a half down to the stage's edge, at every corner
    const w0 = corner(i, sz - 1.6, R(sz - 1.6) + 0.02), e0 = corner(i, sz - 0.2, rOut - 0.2);
    beam(p, [w0.x, w0.z, sz - 1.6], [e0.x, e0.z, sz - 0.2], 0.1, 'n');
  }
  // the stage's deck boards
  for (let i = 0; i < 8; i++) for (const f of [0.35, 0.7]) { const r = rIn + (rOut - rIn) * f; p.seg('detail', corner(i, sz + 0.01, r), corner(i + 1, sz + 0.01, r)); }
  const base = p.build('millBase'); g.add(base);

  // ---- the shell: the tower, its windows and doors, the date stone ----
  const s = new Part();
  for (let i = 0; i < 8; i++) {
    const a0 = corner(i, 0), a1 = corner(i + 1, 0), b1 = corner(i + 1, TOWER.h), b0 = corner(i, TOWER.h);
    s.poly('body', [a0, a1, b1, b0]); s.seg('line', a0, b0).seg('line', a0, a1).seg('line', b0, b1);
    // a tarred plinth, a string course at each floor
    for (const z of [0.6, ...FLOORS.slice(1)]) s.seg('detail', corner(i, z, R(z) + 0.02), corner(i + 1, z, R(z) + 0.02));
  }
  opening(s, 2, 0, 0.05, 1.15, 2.15, true);                   // the door
  s.text(sideM(2, -0.42, 2.85), '1814', 0.42, 0.36, 0.34, 'ink', 'middle', 0.05);
  opening(s, 0, 0, 1.0, 0.62, 0.9); opening(s, 1, 0.2, FLOORS[1] + 1.0, 0.6, 0.9); opening(s, 3, 0, FLOORS[1] + 1.0, 0.6, 0.9);
  opening(s, 2, 0, sz + 0.02, 1.0, 2.0, true);                // the door out onto the stage
  opening(s, 0, 0, sz + 1.0, 0.6, 0.9); opening(s, 1, 0, FLOORS[3] + 1.0, 0.56, 0.85); opening(s, 7, 0, FLOORS[3] + 1.0, 0.56, 0.85); opening(s, 2, 0, FLOORS[4] + 0.9, 0.5, 0.8);
  // the curb on top, that the cap turns on
  for (let i = 0; i < 8; i++) { const a = corner(i, TOWER.h, R(TOWER.h) + 0.18), b = corner(i + 1, TOWER.h, R(TOWER.h) + 0.18);
    s.extrude([[a.x, a.z, TOWER.h - 0.3], [b.x, b.z, TOWER.h - 0.3], [b.x * 0.92, b.z * 0.92, TOWER.h - 0.3], [a.x * 0.92, a.z * 0.92, TOWER.h - 0.3]], [0, 0, 0.3], 'n', { seams:false }); }
  const shell = s.build('millShell'); g.add(shell);

  // ---- the cap: turned to face the wind. Its own frame: +x toward the wind, origin on the tower's axis at the curb ----
  const cap = new THREE.Group(); cap.name = 'cap'; cap.position.copy(W(0, 0, CAP_Z)); g.add(cap);
  const cs = new Part(), prof = [[-3.2, 0], [3.4, 0], [3.4, 0.55], [2.9, 1.75], [1.9, 2.6], [0.4, 3.05], [-1.3, 2.95], [-2.6, 2.25], [-3.2, 1.1]];
  cs.extrude(prof.map(([x, z]) => [x, -3.05, z]), [0, 6.1, 0], 'k');
  // weatherboards on the sides, the gablet over the windshaft, the finial
  for (const zz of [0.55, 1.15, 1.75, 2.35]) {
    const xs: number[] = []; for (let i = 0; i < prof.length; i++) { const [x0, z0] = prof[i], [x1, z1] = prof[(i + 1) % prof.length]; if ((z0 - zz) * (z1 - zz) < 0) xs.push(x0 + (x1 - x0) * (zz - z0) / (z1 - z0)); }
    if (xs.length === 2) for (const y of [3.07, -3.07]) cs.seg('koline', W(Math.min(...xs), y, zz), W(Math.max(...xs), y, zz));
  }
  cs.cylZ(0.4, 0, 3.0, 0.22, 0.35, 8, 'n').cylZ(0.4, 0, 3.35, 0.1, 0.4, 6, 'n');
  const capShell = cs.build('capShell'); cap.add(capShell);
  // the fan stage at the back, the fantail on it
  const fs = new Part();
  for (const sd of [-1, 1]) {
    beam(fs, [-2.9, sd * 1.5, 0.3], [-6.0, sd * 0.7, 0.3], 0.14, 'n'); beam(fs, [-6.0, sd * 0.7, 0.3], [-6.0, sd * 0.3, 2.5], 0.12, 'n');
    beam(fs, [-2.95, sd * 1.0, 2.0], [-6.0, sd * 0.32, 2.45], 0.1, 'n'); beam(fs, [-4.4, sd * 1.1, 0.3], [-4.4, sd * 0.55, 2.2], 0.08, 'n');
  }
  for (let x = -3.4; x > -5.9; x -= 0.5) fs.seg('line', W(x, -1.3 + (x + 2.9) * -0.26, 0.42), W(x, 1.3 - (x + 2.9) * -0.26, 0.42));
  cap.add(fs.build('fanStage'));
  const fan = new THREE.Group(); fan.name = 'fantail'; fan.position.copy(W(-6.0, 0, 2.55)); cap.add(fan);
  const ff = new Part(); ff.cylY(0, -0.35, 0, 0.16, 0.7, 8, 'n');
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), q = (r: number, w: number, y: number) => W(c * r - sn * w, y, sn * r + c * w);
    const blade = [q(0.3, -0.1, 0.1), q(1.8, -0.26, 0.12), q(1.8, 0.26, -0.12), q(0.3, 0.1, -0.1)];
    ff.poly('body', blade); for (let k = 0; k < 4; k++) ff.seg('line', blade[k], blade[(k + 1) % 4]); }
  fan.add(ff.build('fanBlades'));
  // the windshaft, tilted up toward the sails, and what turns on it
  const shaft = new THREE.Group(); shaft.name = 'windshaft'; shaft.position.copy(W(0, 0, AXIS)); shaft.rotation.z = TILT; cap.add(shaft);
  const spin = new THREE.Group(); spin.name = 'sails'; shaft.add(spin);
  const sp = new Part();
  cylX(sp, -2.2, 0, 0, 0.25, SAIL_X + 0.6 + 2.2, 10, 'k');
  sp.box(SAIL_X - 0.42, -0.42, -0.42, 0.84, 0.84, 0.84, 'k');
  // two stocks through the canister, each carrying a sail at either end; then the sails' frames: a whip along each,
  // shutter bars across it, hemlaths along the edges, narrow on the leading side and broad on the trailing
  for (const [a, b] of [[[0, -SAIL_R, 0], [0, SAIL_R, 0]], [[0, 0, -SAIL_R], [0, 0, SAIL_R]]]) beam(sp, [SAIL_X - 0.1, a[1], a[2]], [SAIL_X - 0.1, b[1], b[2]], 0.3, 'n', 0.3);
  const cloth = new Part();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, d = [Math.cos(a), Math.sin(a)], e = [-Math.sin(a), Math.cos(a)];
    const P = (r: number, w: number, x = SAIL_X + 0.22) => W(x, d[0] * r + e[0] * w, d[1] * r + e[1] * w);
    const r0 = 2.1, r1 = SAIL_R, wl = 0.55, wt = -1.55;
    beam(sp, [SAIL_X + 0.18, d[0] * 0.6, d[1] * 0.6], [SAIL_X + 0.18, d[0] * r1, d[1] * r1], 0.16, 'n');
    for (const w of [wl, wt]) sp.seg('line', P(r0, w), P(r1, w));
    for (let r = r0; r <= r1 + 1e-6; r += (r1 - r0) / 13) sp.seg('line', P(r, wt), P(r, wl));
    // the shutters themselves, drawn shut: a face per bay on each side of the whip, lines down their middles
    for (let i = 0; i < 13; i++) { const ra = r0 + (r1 - r0) * i / 13, rb = r0 + (r1 - r0) * (i + 1) / 13;
      for (const [w0, w1] of [[0.08, wl], [wt, -0.08]]) { cloth.poly('body', [P(ra, w0, SAIL_X + 0.2), P(rb, w0, SAIL_X + 0.2), P(rb, w1, SAIL_X + 0.2), P(ra, w1, SAIL_X + 0.2)]);
        cloth.seg('detail', P((ra + rb) / 2, w0, SAIL_X + 0.24), P((ra + rb) / 2, w1, SAIL_X + 0.24)); } }
    // the spider at the poll end, and the cranks from it to each sail's shutter bars
    sp.seg('detail', P(0.5, 0, SAIL_X + 0.45), P(r0 + 0.4, wt * 0.5, SAIL_X + 0.3));
  }
  spin.add(sp.build('sailFrames'));
  const clothG = cloth.build('shutters'); spin.add(clothG);
  // the brake wheel on the windshaft inside the cap, with its band; seen only when the cap is lifted off
  const bw = new Part(); wheel(bw, [0.9, 0, 0], 1.45, 0.24, 'x', 8, 48, 'n');
  const brakeWheel = bw.build('brakeWheel'); brakeWheel.visible = false; spin.add(brakeWheel);
  const band = new Part(); for (let i = 0; i < 20; i++) { const a = Math.PI * 0.2 + i / 20 * Math.PI * 1.1, b = a + Math.PI * 1.1 / 20;
    band.seg('line', W(0.9, 1.56 * Math.cos(a), AXIS + 1.56 * Math.sin(a)), W(0.9, 1.56 * Math.cos(b), AXIS + 1.56 * Math.sin(b))); }
  const brakeBand = band.build('brakeBand'); brakeBand.visible = false; cap.add(brakeBand);

  // ---- the cut: the far half of the tower down the middle, the cut ends hatched, the floors ----
  const c = new Part();
  // the far half's outline in plan at height z (a wall's outer face, or its inner one): from the middle of side 3, round
  // the back by sides 4, 5 and 6, to the middle of side 7
  const half = (z: number, r: number) => { const pts = [[3 * Math.PI / 4, r * C8]];
    for (let i = 3; i <= 6; i++) pts.push([Math.PI / 8 + i * Math.PI / 4, r]); pts.push([7 * Math.PI / 4, r * C8]);
    return pts.map(([a, rr]) => W(rr * Math.cos(a), rr * Math.sin(a), z)); };
  const rin = (z: number) => R(z) - TOWER.wall / C8;
  for (let i = 0; i < 5; i++) {
    const o0 = half(0, R(0))[i], o1 = half(0, R(0))[i + 1], O0 = half(TOWER.h, R(TOWER.h))[i], O1 = half(TOWER.h, R(TOWER.h))[i + 1];
    const n0 = half(0, rin(0))[i], n1 = half(0, rin(0))[i + 1], N0 = half(TOWER.h, rin(TOWER.h))[i], N1 = half(TOWER.h, rin(TOWER.h))[i + 1];
    c.poly('body', [o0, o1, O1, O0]); c.poly('body', [n0, n1, N1, N0]);
    c.seg('line', o0, O0).seg('line', n0, N0).seg('line', O0, O1).seg('line', N0, N1).seg('line', N0, O0);
    if (i === 4) c.seg('line', o1, O1).seg('line', n1, N1).seg('line', N1, O1);
    // the walls' inside, whitewashed: a line where each floor meets it
    for (const z of FLOORS.slice(1)) c.seg('detail', half(z, rin(z))[i], half(z, rin(z))[i + 1]);
  }
  // the cut ends of the wall, hatched
  for (const end of [0, 5]) {
    const lo = half(0, R(0))[end], hi = half(TOWER.h, R(TOWER.h))[end], li = half(0, rin(0))[end], hi2 = half(TOWER.h, rin(TOWER.h))[end];
    c.poly('deck', [lo, li, hi2, hi]);
    for (let z = 0.3; z < TOWER.h - 0.3; z += 0.45) { const f = z / TOWER.h, a = lo.clone().lerp(hi, f), b = li.clone().lerp(hi2, Math.min(1, f + 0.03)); c.seg('line', a, b); }
  }
  // the floors: the far half of each, its boards, its cut edge
  for (const z of FLOORS.slice(1)) {
    const q = half(z, rin(z) + 0.02); c.extrude(q.map(v => [v.x, v.z, z - 0.18]), [0, 0, 0.18], 'n', { seams:false });
    for (let k = -3; k <= 3; k += 0.6) { const r2 = inner(z) ** 2 - k * k; if (r2 < 0.4) continue; const A = bl(0.05, k), B = bl(Math.sqrt(r2) * 0.97, k); c.seg('detail', W(A[0], A[1], z + 0.01), W(B[0], B[1], z + 0.01)); }
  }
  const cut = c.build('millCut'); cut.visible = false; g.add(cut);

  // ---- inside ----
  const f = new Part(), F = FLOORS, at = (b: number, l: number) => bl(b, l);
  // the ladders, one above the other: rails and rungs from b0 on one floor to b1 at the next
  for (let i = 0; i < 4; i++) { const z0 = F[i], z1 = F[i + 1], A0 = at(SPOT.ladder[0], 0), A1 = at(SPOT.ladder[1], 0);
    for (const w of [-0.28, 0.28]) { const L0 = at(SPOT.ladder[0], w), L1 = at(SPOT.ladder[1], w); f.seg('line', W(L0[0], L0[1], z0), W(L1[0], L1[1], z1)); }
    for (let t = 0.1; t < 1; t += 0.12) { const x = A0[0] + (A1[0] - A0[0]) * t, y = A0[1] + (A1[1] - A0[1]) * t, z = z0 + (z1 - z0) * t, o = at(0, 0.28);
      f.seg('line', W(x - o[0], y - o[1], z), W(x + o[0], y + o[1], z)); }
    // a hand rail round the ladder's hole above it
    const H0 = at(SPOT.ladder[0] - 0.1, -0.5), H1 = at(SPOT.ladder[1] + 0.1, -0.5); f.seg('detail', W(H0[0], H0[1], z1 + 0.9), W(H1[0], H1[1], z1 + 0.9));
  }
  // the sack hoist's trapdoors on every floor, their flaps standing open
  for (const z of F.slice(1)) { const [hx, hy] = at(...SPOT.hoist as [number, number]);
    for (const sd of [-1, 1]) { const a = at(SPOT.hoist[0] + 0.35 * sd, SPOT.hoist[1] - 0.35), b = at(SPOT.hoist[0] + 0.35 * sd, SPOT.hoist[1] + 0.35);
      f.seg('line', W(a[0], a[1], z + 0.02), W(b[0], b[1], z + 0.02)).seg('line', W(a[0], a[1], z + 0.02), W(a[0], a[1], z + 0.6)).seg('line', W(b[0], b[1], z + 0.02), W(b[0], b[1], z + 0.6)).seg('line', W(a[0], a[1], z + 0.6), W(b[0], b[1], z + 0.6)); }
    f.seg('detail', W(hx - 0.3, hy, z + 0.02), W(hx + 0.3, hy, z + 0.02)); }
  // ground floor: the sack scales with their weights, a sack barrow
  { const [x, y] = at(...SPOT.scales as [number, number]); f.box(x - 0.45, y - 0.35, 0, 0.9, 0.7, 0.18).box(x - 0.08, y - 0.3, 0.18, 0.16, 0.16, 1.1).box(x - 0.45, y - 0.25, 1.2, 0.9, 0.08, 0.08);
    for (const k of [-0.36, 0.3]) f.seg('line', W(x + k, y - 0.21, 1.2), W(x + k, y - 0.21, 0.85)); f.box(x + 0.22, y - 0.28, 0.72, 0.16, 0.16, 0.14, 'k');
    const [bx, by] = at(0.6, -2.4); beam(f, [bx, by, 0.05], [bx + 0.6, by + 0.6, 1.2], 0.08, 'n'); beam(f, [bx + 0.5, by - 0.5, 0.05], [bx + 1.1, by + 0.1, 1.2], 0.08, 'n'); }
  // meal floor: a meal spout down from each pair of stones over a sack on its hook, the governor's frame, a bin of bran
  for (const [b, l] of SPOT.stones) { const [x, y] = at(b, l);
    f.box(x - 0.11, y - 0.11, F[1] + 1.15, 0.22, 0.22, F[2] - F[1] - 1.15, 'n'); sack(f, x, y + 0.02, F[1], 'n', 1.0);
    f.seg('line', W(x, y, F[1] + 1.15), W(x, y, F[1] + 1.02)); }
  { const [x, y] = at(2.2, 0.9); f.box(x - 0.5, y - 0.4, F[1], 1.0, 0.8, 0.8, 'n').box(x - 0.42, y - 0.32, F[1] + 0.62, 0.84, 0.64, 0.2, 'k'); }
  // stone floor: the tuns round the stones, the horse and the hopper over each, the shoe that feeds the grain, the
  // stone crane on the back wall, a spare runner stone dressed and leaning
  for (const [b, l] of SPOT.stones) { const [x, y] = at(b, l), z = F[2];
    f.cylZ(x, y, z, 0.78, 0.55, 8, 'n').cylZ(x, y, z + 0.55, 0.22, 0.04, 8, 'k');
    for (const [dx, dy] of [[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42]]) f.box(x + dx - 0.04, y + dy - 0.04, z + 0.55, 0.08, 0.08, 0.6);
    f.geo(new THREE.CylinderGeometry(0.62, 0.16, 0.7, 4), new THREE.Matrix4().compose(W(x, y, z + 1.5), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), Math.PI / 4), v3(1, 1, 1)), 'n');
    beam(f, [x, y, z + 1.15], [x + 0.15, y + 0.15, z + 0.72], 0.12, 'n'); }
  { const [x, y] = at(2.45, 0); f.box(x - 0.1, y - 0.1, F[2], 0.2, 0.2, 2.6); beam(f, [x, y, F[2] + 2.4], [x + 1.1, y + 1.1, F[2] + 2.4], 0.14, 'n'); f.seg('line', W(x + 1.0, y + 1.0, F[2] + 2.4), W(x + 1.0, y + 1.0, F[2] + 1.6));
    const [sx, sy] = at(2.25, -2.0); f.geo(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 14), new THREE.Matrix4().compose(W(sx, sy, F[2] + 0.62), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, Math.PI / 2 - 0.25)), v3(1, 1, 1)), 'n'); }
  // bin floor: the two grain bins, their chutes down to the hoppers; a sack of grain or two standing by the trapdoor
  for (const [b, l] of SPOT.bins) { const [x, y] = at(b, l); f.box(x - 0.6, y - 0.55, F[3], 1.2, 1.1, 1.5, 'n'); f.seg('detail', W(x - 0.6, y + 0.55, F[3] + 1.0), W(x + 0.6, y + 0.55, F[3] + 1.0)); }
  for (const [b, l] of SPOT.stones) { const [x, y] = at(b, l); f.box(x - 0.07, y - 0.07, F[2] + 1.85, 0.14, 0.14, F[3] - F[2] - 1.85, 'n'); }
  // dust floor: the hoist's drum on its frame, driven off the upright by a belt that the miller slips on to lift
  { const [x, y] = at(SPOT.hoist[0], SPOT.hoist[1] + 0.2); for (const sd of [-0.5, 0.5]) f.box(x - 0.06 + sd, y - 0.06, F[4], 0.12, 0.12, 1.2);
    cylX(f, x - 0.55, y, F[4] + 1.05, 0.22, 1.1, 10, 'n'); f.seg('detail', W(x + 0.4, y, F[4] + 1.27), W(0.2, 0, F[4] + 1.5)); }
  // a lamp on each floor, lit after dark
  for (const z of F.slice(0, 4)) { const [x, y] = at(2.6, 0.9); f.box(x - 0.1, y - 0.1, z + 2.2, 0.2, 0.2, 0.25, 'l'); }
  const inside = f.build('millInside'); inside.visible = false; g.add(inside);

  // what turns inside: the upright shaft with the wallower on top and the great spur wheel; a stone nut and its spindle
  // over each pair of stones; the governor on the meal floor; and the sack on the hoist's chain
  const upright = new THREE.Group(); upright.name = 'upright';
  const up = new Part(); up.cylZ(0, 0, SPUR - 0.3, 0.18, CAP_Z + 0.75 - SPUR + 0.3, 8, 'n');
  wheel(up, [0, 0, SPUR], 1.5, 0.22, 'z', 8, 40, 'n'); wheel(up, [0, 0, CAP_Z + 0.45], 0.75, 0.2, 'z', 6, 20, 'n', 16);
  upright.add(up.build('uprightParts')); inside.add(upright);
  const nuts = SPOT.stones.map(([b, l]) => { const [x, y] = at(b, l), gN = new THREE.Group(); gN.position.copy(W(x, y, 0));
    const q = new Part(); wheel(q, [0, 0, SPUR], 0.38, 0.18, 'z', 4, 10, 'n', 12); q.cylZ(0, 0, F[2] + 0.6, 0.05, SPUR - F[2] - 0.6, 6, 'k'); gN.add(q.build('stoneNut')); inside.add(gN); return gN; });
  const governor = new THREE.Group(); { const [x, y] = at(...SPOT.governor as [number, number]); governor.position.copy(W(x, y, F[1])); }
  const gv = new Part(); gv.cylZ(0, 0, 0, 0.05, 1.5, 6, 'k').box(-0.15, -0.15, 0, 0.3, 0.3, 0.25, 'n'); governor.add(gv.build('govSpindle'));
  const balls = new THREE.Group(); balls.position.copy(W(0, 0, 1.45)); const bp = new Part();
  for (const sd of [-1, 1]) { bp.seg('line', W(0, 0, 0), W(sd * 0.35, 0, -0.45)); bp.cylZ(sd * 0.35, 0, -0.55, 0.1, 0.18, 8, 'k'); }
  balls.add(bp.build('govBalls')); governor.add(balls); inside.add(governor);
  const hoistSack = new THREE.Group(); { const [x, y] = at(...SPOT.hoist as [number, number]); hoistSack.position.copy(W(x, y, 0)); }
  hoistSack.add(sack(new Part(), 0, 0, 0, 'k').build('hoistSack')); inside.add(hoistSack);
  const chain = new THREE.Group(); chain.add(new Part().seg('line', W(0, 0, 0), W(0, 0, 1)).build('chain')); inside.add(chain);
  // the flour stacked on the ground floor and the grain on the cart, redrawn as they change
  const stackG = new THREE.Group(); inside.add(stackG); const cartG = new THREE.Group(); g.add(cartG);

  g.userData.peek = { shell, cut, inside, box:[cx - R(0) - 0.4, cx + R(0) + 0.4, cy - R(0) - 0.4, cy + R(0) + 0.4], z:[Z, Z + CAP_Z + 4],
    // shut, only those inside the tower walls are hidden, not someone out on the stage or at the door
    hides:(x: number, y: number) => Math.hypot(x - cx, y - cy) < inner(0) + 0.3 };
  return { g, base, shell, cut, inside, cap, capShell, fan, shaft, spin, cloth:clothG, brakeWheel, brakeBand, upright, nuts, governor, balls, hoistSack, chain, stackG, cartG };
}
// a stack of flour sacks (n) on the ground floor, rows of three against the wall either side of the ladder
export function drawStack(n: number) {
  const p = new Part();
  for (let i = 0; i < n; i++) { const side = i % 2, k = Math.floor(i / 2), row = k % 3, tier = Math.floor(k / 3), [b, l] = SPOT.stack[side];
    const [x, y] = bl(b - (tier % 2) * 0.05, l + (row - 1) * 0.58 * (side ? 1 : -1)); sack(p, x, y, tier * 0.86, 'n', 0.82); }
  return n ? p.build('flourStack') : null;
}
// the grain still on the cart: up to twelve sacks lying in it
export function drawCart(n: number) {
  const p = new Part(), { x, y } = CART;
  for (let i = 0; i < n; i++) { const r = i % 4, t = Math.floor(i / 4); p.box(x - 1.25 + r * 0.62, y - 0.6 + (t % 2) * 0.1, 0.82 + t * 0.34, 0.56, 1.2, 0.32, 'k'); }
  return n ? p.build('cartSacks') : null;
}
