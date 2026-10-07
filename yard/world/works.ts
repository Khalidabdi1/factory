// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, pose } from '../kernel/part';
import { WORKS } from '../layout';
import { beam, buildAgv, buildRobot, carInto } from '../models/works';
import { lampPost, ring } from './ground';

// Car Works: one long hall on its terrace in the foothills, under a sawtooth roof like Plant 01's, CAR WORKS on its
// sign band and a stack over the paint shop. It opens to its section like the other buildings. The line runs down
// the middle, east from the coils to the door: the press shop (blanking, a tandem press), the body shop (a welding
// line of robots on pedestals either side, after the owner's photograph: fixtures, fences, a catwalk with a caged
// ladder, cable trays, an overhead buffer of shells), the paint shop (the dip, the booth, the oven), assembly (a
// hanger, the marriage of body and powertrain, wheels and glass by robot, seats by hand) and the end of the line
// (fluids, the lights test, the rolling road, the light tunnel). Moving parts are named for the simulation.
export const ROBOTS = [];   // { g, x, y, h, station, kind } in the order they are built
const PRESSES = [227.0, 231.2, 235.4], CELLS = [256, 270, 284];
// a round member along x: ducts and pipes
const cylX = (p, x0, y, z, r, len, n = 10, tone) => { const q = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; q.push([x0, y + r * Math.cos(a), z + r * Math.sin(a)]); } return p.extrude(q, [len, 0, 0], tone, { seams:false }); };
export function buildCarWorks() {
  const { x0:X0, x1:X1, y0:Y0, y1:Y1, h:H, ly:LY, exit:[EX] } = WORKS, D = Y1 - Y0, z = 0;
  const g = new THREE.Group(); g.name = 'carWorks';

  // ---- always there: the retaining wall at the back of the terrace, the apron, the lot, its lamps ----
  const p = new Part(), G = TOP(0, 0, 0), [TX0, TX1, TY0] = WORKS.terrace;
  p.box(TX0, TY0 - 0.6, 0, TX1 - TX0, 0.6, 3.2);
  const RW = FRONT(TX0, TY0, 3.2); for (let u = 6; u < TX1 - TX0; u += 6) p.draw(RW, [u, 0, u, 3.2], 'detail', 0.01);
  // the apron along the front, the lot and its turning space east of it (no two fills on top of each other)
  p.fill2(G, X0 - 2, Y1, X1 - X0 + 4, 3, 'deck', 0.02).fill2(G, 314, -17, 86, 11.5, 'road', 0.02).fill2(G, 400, -12, 13, 9, 'road', 0.02);
  const L = WORKS.lot;
  for (let k = 0; k <= L.n; k++) { const x = L.x0 + L.pitch / 2 - k * L.pitch; p.draw(G, [x, L.front - 0.6, x, L.front + 4.9], 'detail', 0.03); }
  p.text(G, 'FINISHED CARS', 330, -7.4, 1.0, 'paint', 'start', 0.03);
  for (const x of [318, 344, 370, 396]) lampPost(p, x, -6.4, 0, -1);
  g.add(p.build('worksBase'));

  // ---- the shell ----
  const s = new Part();
  s.box(X0, Y0, z, X1 - X0, D, H);
  for (let i = 0; i < 9; i++) {
    const x0 = X0 + 20 * i;
    s.extrude([[x0, Y0, H], [x0 + 20, Y0, H], [x0 + 20, Y0, H + 5]], [0, D, 0]);
    const M = SIDE(x0 + 20, Y1, H + 5);
    s.fill2(M, 1, 0.8, D - 2, 3.4, 'window').rect2(M, 1, 0.8, D - 2, 3.4, 'line');
    for (let u = 3.5; u < D - 1; u += 2.5) s.draw(M, [u, 0.8, u, 4.2]);
    for (let y = Y0 + 3; y < Y1; y += 3) s.seg('detail', W(x0 + 0.4, y, H + 0.15), W(x0 + 19.6, y, H + 4.95));
  }
  // the front: sign band with the name and a glyph (a car in profile), doors, corrugation, offices at the west end
  const F = FRONT(X0, Y1, H);
  s.draw(F, [0, 3.2, X1 - X0, 3.2]).text(F, 'CAR WORKS', 9.5, 2.3, 2.3);
  s.draw(F, [2.5, 2.2, 3.1, 1.4, 3.1, 1.4, 5.6, 1.1, 5.6, 1.1, 6.8, 1.6, 6.8, 1.6, 7.6, 1.7, 7.6, 1.7, 7.7, 2.3, 7.7, 2.3, 2.5, 2.3, 2.5, 2.3, 2.5, 2.2], 'line');
  for (const cx of [3.7, 6.6]) { const q = ring(0, 0, 0.32, 0, 12); for (let i = 0; i < q.length; i += 2) s.draw(F, [cx + q[i].x, 2.3 + q[i].z, cx + q[i + 1].x, 2.3 + q[i + 1].z], 'line'); }
  const DOORS = [[4, 12], [EX - 216 - 3, EX - 216 + 3], [60, 61.6]];
  for (const [a, b] of DOORS) { s.rect2(F, a, b - a > 3 ? 4.6 : 7.6, b - a, b - a > 3 ? 5.4 : 2.4, 'line'); if (b - a > 3) for (let v = 5.2; v < H; v += 0.6) s.draw(F, [a, v, b, v]); }
  for (let u = 1.6; u < X1 - X0; u += 1.6) { if (DOORS.some(([a, b]) => u > a - 0.3 && u < b + 0.3) || u > 20 && u < 46) continue; s.draw(F, [u, 3.2, u, H]); }
  s.box(X0 + 20, Y1, z, 26, 6, 7);   // offices against the front
  const O = FRONT(X0 + 20, Y1 + 6, 7);
  for (let i = 0; i < 6; i++) for (const v of [1.0, 4.2]) s.fill2(O, 1.2 + 4.1 * i, v, 3, 1.8, (i + (v > 2 ? 1 : 0)) % 3 ? 'window' : 'glass').rect2(O, 1.2 + 4.1 * i, v, 3, 1.8, 'line');
  s.fill2(SIDE(X0 + 46, Y1 + 6, 7), 1.5, 4.4, 2.2, 2.6).rect2(SIDE(X0 + 46, Y1 + 6, 7), 1.5, 4.4, 2.2, 2.6, 'line');
  const E = SIDE(X1, Y1, H);
  s.draw(E, [0, 3.2, D, 3.2]); for (let u = 1.6; u < D; u += 1.6) { if (u > 8 && u < 14) continue; s.draw(E, [u, 3.2, u, H]); }
  s.rect2(E, 8, 3.6, 6, 6.4, 'line'); for (let v = 4.2; v < H; v += 0.6) s.draw(E, [8, v, 14, v]);
  // the paint shop's stack and the roof fans
  s.cylZ(307, Y0 + 6, H + 4, 1.0, 10, 12);
  for (const zz of [H + 9, H + 12.5]) { const r = ring(307, Y0 + 6, 1.03, zz, 12); for (let i = 0; i < r.length; i += 2) s.seg('detail', r[i], r[i + 1]); }
  for (const x of [236, 276, 356, 386]) s.cylZ(x, Y0 + 13, H + 2.3, 1.3, 0.7, 12);
  const shell = s.build('worksShell'); g.add(shell);

  // ---- the cut ----
  const c = new Part(), T = 0.5, LOW = 1.2;
  const wall = (bx, by, bw, bd) => { c.box(bx, by, z, bw, bd, LOW); const segs = [], n = Math.max(bw, bd);
    for (let u = 0.4; u < n - 0.1; u += 0.8) segs.push(...(bw > bd ? [u, 0, Math.min(n, u + T), bd] : [0, u, bw, Math.min(n, u + T)])); c.draw(TOP(bx, by, z + LOW), segs); };
  for (const r of [[X0, Y0, X1 - X0, T], [X0, Y0, T, D], [X1 - T, Y0, T, D], [X0, Y1 - T, 4, T], [X0 + 12, Y1 - T, EX - 3 - X0 - 12, T], [EX + 3, Y1 - T, X1 - EX - 3, T]]) wall(...r);
  for (let i = 0; i < 9; i++) { const x0 = X0 + 20 * i; c.seg('detail', W(x0, Y0, H), W(x0 + 20, Y0, H + 5)).seg('detail', W(x0, Y1, H), W(x0 + 20, Y1, H + 5)).seg('detail', W(x0 + 20, Y0, H + 5), W(x0 + 20, Y1, H + 5)); }
  c.seg('detail', W(X0, Y0, H), W(X1, Y0, H)).seg('detail', W(X0, Y1, H), W(X1, Y1, H)).seg('detail', W(X0, Y0, H), W(X0, Y1, H)).seg('detail', W(X1, Y0, H), W(X1, Y1, H));
  const cut = c.build('worksCut'); cut.visible = false; g.add(cut);

  // ---- inside: what stands still ----
  const f = new Part(), Gz = TOP(0, 0, z), lift = 0.02;
  f.fill2(TOP(X0, Y0, z), 0, 0, X1 - X0, D, 'deck', 0.02);
  for (const [, name, a, b] of WORKS.shops) { f.draw(Gz, [b, Y0 + 0.6, b, Y1 - 0.6], 'detail', lift).text(Gz, name.toUpperCase(), (a + b) / 2, Y1 - 1.6, 1.3, 'paint', 'middle', lift); }
  // the line: two rails and the slats of the conveyor between them, the whole length
  f.box(220, LY - 1.15, z, EX + 2 - 220, 0.15, 0.5, 'k').box(220, LY + 1.0, z, EX + 2 - 220, 0.15, 0.5, 'k');
  const sl = []; for (let x = 220.3; x < EX + 2; x += 0.6) sl.push(x, LY - 1.0, x, LY + 1.0); f.draw(TOP(0, 0, 0.5), sl, 'detail', 0.01);
  // aisles: walkways painted either side
  f.draw(Gz, [220, LY - 4.6, X1 - 2, LY - 4.6, 220, LY + 4.6, X1 - 2, LY + 4.6], 'line', lift);
  // press shop: three coils, the uncoiler and the blanking press, the tandem press frame over the line, die carts
  for (let i = 0; i < 3; i++) { f.cylY(219.5 + i * 2.6, Y0 + 1.5, 1.0, 1.0, 1.4, 16, 'g'); f.cylY(219.5 + i * 2.6, Y0 + 1.4, 1.0, 0.35, 1.6, 10, 'k'); }
  f.box(218.6, LY - 2.4, z, 3.2, 4.8, 1.2, 'k').cylY(220.2, LY - 1.3, 2.2, 1.0, 2.6, 14, 'g');
  // the tandem line: three presses in a row over the line, each a crown on four uprights with its flywheel housing on
  // top and a bolster on the floor; crossbar transfer rails run through them at waist height
  for (const a of PRESSES) {
    for (const x of [a, a + 2.8]) for (const y of [LY - 2.6, LY + 2.0]) f.box(x, y, z, 0.6, 0.6, 6.0, 'k');
    f.box(a - 0.2, LY - 2.9, 6.0, 3.8, 5.5, 1.6, 'k').box(a + 0.4, LY - 2.2, 7.6, 2.6, 2.4, 0.9, 'n').cylY(a + 1.7, LY + 0.3, 8.0, 0.55, 0.5, 12, 'k');
    f.box(a, LY - 1.6, z, 3.4, 3.2, 0.45, 'k');
    f.draw(TOP(a, LY + 2.65, 0), [0, 0, 3.4, 0, 0, 0.9, 3.4, 0.9], 'line', 0.02);
    for (let u = 0.2; u < 3.4; u += 0.5) f.draw(TOP(a, LY + 2.65, 0), [u, 0, u + 0.4, 0.9], 'line', 0.02);   // the hatched danger zone at its feet
  }
  for (const y of [LY - 2.3, LY + 1.75]) f.box(PRESSES[0] - 0.6, y, 2.0, PRESSES[2] - PRESSES[0] + 4.6, 0.12, 0.12, 'k');
  for (let i = 0; i < 3; i++) f.box(239.6 + i * 2.4, Y0 + 1.0, z, 2.0, 3.2, 0.5, 'n').box(239.8 + i * 2.4, Y0 + 1.3, 0.5, 1.6, 2.6, 0.9, 'k');
  // body shop: a fixture under each station, fences either side with gaps for the robots' cells, the catwalk
  for (let k = 3; k <= 7; k++) { const sx = WORKS.stations[k][0]; for (const dx of [-1.7, 1.5]) f.box(sx + dx, LY - 1.4, z, 0.25, 2.8, 0.95, 'k'); f.box(sx - 1.7, LY - 0.12, 0.95, 3.45, 0.24, 0.12, 'k');
    for (const y of [LY - 1.3, LY + 1.1]) f.box(sx - 0.6, y, 0.95, 0.2, 0.2, 0.55, 'k'); }
  const fence = (x0, x1, y) => { for (let x = x0; x <= x1; x += 2) f.seg('line', W(x, y, z), W(x, y, 2.2)); for (const h of [1.1, 2.2]) f.seg('line', W(x0, y, h), W(x1, y, h)); for (let x = x0; x < x1; x += 0.5) f.seg('detail', W(x, y, 0.2), W(x, y, 2.1)); };
  fence(248, 290, LY - 6.2); fence(248, 290, LY + 6.2);
  // the catwalk along the north wall, railed, with a caged ladder at its west end and stairs at its east end
  const CW = Y0 + 1.2, CZ = 4.4;
  f.box(248, CW - 0.9, CZ, 42, 1.8, 0.15);
  for (let x = 248; x <= 290; x += 3) { f.seg('line', W(x, CW + 0.9, z), W(x, CW + 0.9, CZ)).seg('line', W(x, CW + 0.9, CZ), W(x, CW + 0.9, CZ + 1.1)); }
  for (const h of [0.55, 1.1]) f.seg('line', W(248, CW + 0.9, CZ + h), W(290, CW + 0.9, CZ + h));
  for (const zz of [0.4, 1.0, 1.6, 2.2, 2.8, 3.4, 4.0]) { f.seg('line', W(248.6, CW + 0.95, zz), W(249.4, CW + 0.95, zz)); }
  for (const xx of [248.6, 249.4]) f.seg('line', W(xx, CW + 0.95, 0), W(xx, CW + 0.95, CZ + 1.1));
  for (let zz = 2.2; zz < CZ + 1.1; zz += 0.6) { const q = ring(249, CW + 1.35, 0.5, zz, 10); for (let i = 0; i < q.length; i += 2) if (q[i].z > W(0, CW + 1.0, 0).z) f.seg('line', q[i], q[i + 1]); }
  for (let k = 0; k < 9; k++) f.box(286.4 + k * 0.4, CW - 0.5, z, 0.4, 1.0, (k + 1) * CZ / 9);
  // cable trays over the robots' cells, cables dropping to each robot
  for (const y of [LY - 4.2, LY + 4.2]) { f.box(248, y - 0.2, 5.6, 42, 0.4, 0.08); for (let x = 250; x < 290; x += 6) f.seg('detail', W(x, y, 5.6), W(x, y, 1.4)); }
  // the buffer conveyor's lift towers, above the body shop
  for (const x of [250, 290]) f.box(x - 1.2, Y0 + 3.4, z, 2.4, 3.2, 7.2, 'k');
  f.box(250, Y0 + 4.6, 6.2, 40, 0.15, 0.2).box(250, Y0 + 5.8, 6.2, 40, 0.15, 0.2);
  // paint shop: walls round it, the dip tank, the booth's frame, the oven
  // its walls: the far one full height, the near one cut low like the hall's, so the dip and the booth can be seen
  f.box(292, LY - 5.4, z, 30, 0.3, 4.2, 'n').box(292, LY + 5.1, z, 30, 0.3, 1.2, 'n');
  { const hs = []; for (let u = 0.4; u < 29.9; u += 0.8) hs.push(292 + u, LY + 5.1, 292 + Math.min(30, u + 0.3), LY + 5.4); f.draw(TOP(0, 0, 1.2), hs, 'detail', 0.01); }
  f.box(293, LY - 1.6, z, 8.4, 0.3, 1.1).box(293, LY + 1.3, z, 8.4, 0.3, 1.1).box(293, LY - 1.3, z, 0.3, 2.6, 1.1).box(301.1, LY - 1.3, z, 0.3, 2.6, 1.1);
  f.fill2(TOP(293.3, LY - 1.3, 0.75), 0, 0, 7.8, 2.6, 'glass', 0.01);
  for (const x of [302.5, 311.5]) for (const y of [LY - 2.8, LY + 2.8]) f.box(x - 0.15, y - 0.15, z, 0.3, 0.3, 4.6);
  for (const y of [LY - 2.8, LY + 2.8]) f.box(302.35, y - 0.15, 4.6, 9.3, 0.3, 0.25); f.box(302.35, LY - 2.8, 4.6, 0.3, 5.6, 0.25).box(311.35, LY - 2.8, 4.6, 0.3, 5.6, 0.25);
  for (let x = 303; x < 311.4; x += 0.9) f.seg('detail', W(x, LY - 2.8, 4.85), W(x, LY + 2.8, 4.85));
  f.box(312.5, LY - 2.6, z, 9, 1.2, 3.6).box(312.5, LY + 1.4, z, 9, 1.2, 3.6).box(312.5, LY - 2.6, 3.6, 9, 5.2, 0.5);
  const OV = FRONT(312.5, LY + 2.6, 3.6); for (let u = 0.6; u < 9; u += 1.2) f.fill2(OV, u, 0.5, 0.5, 2.2, 'lamp', 0.02);
  // assembly: the hanger rail, the marriage pit, wheel and glass racks, parts racks lineside, the AGVs' paths
  f.box(323, LY - 0.15, 4.8, 18, 0.3, 0.3, 'k');
  for (const sx of [327, 336]) { f.seg('line', W(sx - 1.6, LY - 1.1, 4.8), W(sx - 1.6, LY - 1.1, 1.8)).seg('line', W(sx + 1.6, LY - 1.1, 4.8), W(sx + 1.6, LY - 1.1, 1.8))
    .seg('line', W(sx - 1.6, LY + 1.1, 4.8), W(sx - 1.6, LY + 1.1, 1.8)).seg('line', W(sx + 1.6, LY + 1.1, 4.8), W(sx + 1.6, LY + 1.1, 1.8)); }
  f.box(333, LY - 1.5, z, 6, 3, 0.1, 'k');
  for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) f.cylY(342 + j * 1.3, LY + 3.6, 0.34 + k * 0.42, 0.34, 0.24, 10, 'k');
  for (let k = 0; k < 4; k++) f.box(351.5 + k * 0.5, LY - 4.2, z, 0.08, 1.4, 1.1, 'g');
  for (let x = 324; x < 366; x += 3.4) { f.box(x, LY + 5.0, z, 2.6, 1.2, 1.6).box(x + 0.2, LY + 5.2, 0.5, 2.2, 0.8, 0.05, 'k').box(x + 0.2, LY + 5.2, 1.1, 2.2, 0.8, 0.05, 'k'); }
  for (let x = 362; x < 365; x += 1.1) f.box(x, LY + 3.4, z, 0.6, 0.7, 1.0, 'n');
  for (let x = 324; x < 366; x += 1.2) f.draw(Gz, [x, LY + 7.4, x + 0.6, LY + 7.4, x, LY - 7.2, x + 0.6, LY - 7.2], 'detail', lift);
  // end of line: the fluids rig, the lights test frame, the rolling road's pit and desk, the light tunnel
  f.box(369.5, LY - 3.4, z, 3, 1.0, 2.2, 'k'); for (const dx of [0.4, 1.2, 2.0]) f.seg('line', W(369.5 + dx, LY - 2.4, 1.8), W(370.6 + dx * 0.3, LY - 0.8, 1.2));
  for (const y of [LY - 2.4, LY + 2.4]) f.box(376, y - 0.15, z, 0.3, 0.3, 3.2).box(380, y - 0.15, z, 0.3, 0.3, 3.2); f.box(376, LY - 2.4, 3.2, 4.3, 4.8, 0.2, 'k');
  f.box(383, LY - 1.4, z, 4.2, 2.8, 0.1, 'k').box(384, LY + 2.6, z, 1.6, 0.9, 1.1).box(384.1, LY + 2.7, 1.1, 1.4, 0.06, 0.6, 'w');
  for (const dx of [-0.9, 0, 0.9]) { const q = []; for (let a = 0; a <= Math.PI; a += Math.PI / 8) q.push([392 + dx, LY + 2.3 * Math.cos(a), 0.2 + 3.0 * Math.sin(a)]); for (let i = 1; i < q.length; i++) f.seg('line', W(...q[i - 1]), W(...q[i])); }
  // ---- the works round the line ----
  // the hall's steel: columns down the north wall, high-bay lamps in two rows (lit after dark), the main air duct on
  // its hangers, a cable tray down the south side
  for (let x = X0 + 10; x < X1 - 2; x += 10) f.box(x - 0.25, Y0 + 0.5, z, 0.5, 0.5, H, 'n');
  for (let x = X0 + 6; x < X1 - 2; x += 8) for (const y of [LY - 7.5, LY + 6]) { f.seg('detail', W(x, y, H), W(x, y, 8.75)); f.cylZ(x, y, 8.4, 0.4, 0.35, 8, 'l'); }
  cylX(f, X0 + 1, Y0 + 3.2, 8.0, 0.55, X1 - X0 - 2, 12, 'n');
  for (let x = X0 + 4; x < X1 - 2; x += 6) f.seg('detail', W(x, Y0 + 3.2, 8.55), W(x, Y0 + 3.2, H));
  f.box(X0 + 2, LY + 4.7, 7.2, X1 - X0 - 4, 0.6, 0.1, 'k');
  for (let x = X0 + 5; x < X1 - 2; x += 7) f.seg('detail', W(x, LY + 5.0, 7.3), W(x, LY + 5.0, H));
  // press shop: the overhead crane's runway along both walls, dies stored under it, coils on saddles by the south
  // wall, racks of stamped panels after the line, a check table under a lamp
  for (const y of [Y0 + 0.9, Y1 - 1.4]) f.box(X0 + 0.5, y, 8.6, 30.5, 0.4, 0.5, 'k');
  for (let i = 0; i < 4; i++) { const x = 226.4 + i * 3.1; f.box(x, Y0 + 2.4, z, 2.6, 2.0, 1.0, 'k').box(x, Y0 + 2.4, 1.0, 2.6, 2.0, 0.7, 'n'); f.draw(FRONT(x, Y0 + 4.4, 1.7), [0.3, 0.35, 2.3, 0.35], 'line', 0.02); }
  for (let i = 0; i < 3; i++) { const x = 218.6 + i * 2.6; f.box(x - 0.9, Y1 - 4.9, z, 1.8, 1.6, 0.35, 'k'); f.cylY(x, Y1 - 4.95, 1.25, 1.0, 1.5, 16, 'g'); f.cylY(x, Y1 - 5.05, 1.25, 0.35, 1.7, 10, 'k'); }
  for (let r = 0; r < 3; r++) { const x = 238.4 + r * 2.9;
    for (const dx of [0, 2.4]) for (const y of [LY + 3.2, LY + 6.6]) f.box(x + dx, y, z, 0.12, 0.12, 2.0, 'k');
    for (const y of [LY + 3.2, LY + 6.6]) f.box(x, y, 2.0, 2.52, 0.12, 0.12, 'k');
    for (let k = 0; k < 5; k++) f.box(x + 0.25, LY + 3.6 + k * 0.6, 0.15, 2.0, 0.05, 1.5, 'g'); }
  f.box(229.5, LY + 3.4, z, 4.0, 1.6, 0.9, 'n').box(230, LY + 3.7, 0.9, 3.0, 1.0, 0.04, 'g').seg('line', W(231.5, LY + 4.2, 0.95), W(231.5, LY + 4.2, 2.6)).box(231, LY + 3.7, 2.6, 1.0, 1.0, 0.25, 'l');
  // body shop: the framing gate round station 5, fume hoods over the welding, the robots' controllers in a row
  // behind the south fence, a lamp arch to check the shell before paint
  { const fx0 = 256.4, fx1 = 263.6;
    for (const x of [fx0, fx1]) for (const y of [LY - 4.9, LY + 4.3]) f.box(x - 0.3, y, z, 0.6, 0.6, 5.4, 'k');
    for (const y of [LY - 4.9, LY + 4.3]) f.box(fx0 - 0.3, y, 5.4, fx1 - fx0 + 0.6, 0.6, 0.6, 'k');
    for (const x of [fx0, fx1]) f.box(x - 0.3, LY - 4.9, 5.4, 0.6, 9.8, 0.6, 'k');
    for (const y of [LY - 1.55, LY + 1.15]) { f.box(fx0 + 0.6, y, 0.5, fx1 - fx0 - 1.2, 0.4, 0.25, 'n').box(fx0 + 0.6, y, 2.35, fx1 - fx0 - 1.2, 0.4, 0.25, 'n');
      for (let x = fx0 + 0.8; x < fx1 - 0.4; x += 1.6) f.box(x, y, 0.75, 0.3, 0.4, 1.6, 'n'); } }
  for (let k = 3; k <= 7; k++) { const sx = WORKS.stations[k][0]; f.box(sx - 1.4, LY - 1.6, 6.9, 2.8, 3.2, 0.5, 'n'); f.seg('detail', W(sx, LY, 7.4), W(sx, LY, H)); }
  for (let k = 3; k <= 6; k++) { const sx = WORKS.stations[k][0] + 1.2; f.box(sx - 0.5, LY + 6.6, z, 1.0, 0.8, 1.9, 'k').fill2(FRONT(sx - 0.5, LY + 7.4, 1.9), 0.2, 0.3, 0.6, 0.45, 'window', 0.02); }
  for (const dx of [-0.8, 0.8]) { const q = []; for (let a = 0; a <= Math.PI; a += Math.PI / 8) q.push([290.4 + dx, LY + 2.4 * Math.cos(a), 0.2 + 3.1 * Math.sin(a)]); for (let i = 1; i < q.length; i++) f.seg('line', W(...q[i - 1]), W(...q[i])); }
  for (let i = 1; i < 8; i++) { const a = i / 8 * Math.PI; f.box(290.3, LY + 2.35 * Math.cos(a) - 0.1, 0.15 + 3.05 * Math.sin(a), 0.2, 0.2, 0.2, 'l'); }
  // the sub-assembly cells north of the line: a fence, a two-sided turntable (built with what moves) and a robot each
  for (const cx of CELLS) { fence(cx - 3.4, cx + 3.4, Y0 + 2.6); for (const x of [cx - 3.4, cx + 3.4]) for (let y = Y0 + 2.6; y < LY - 6.2; y += 2) f.seg('line', W(x, y, z), W(x, y, 2.2));
    for (const x of [cx - 3.4, cx + 3.4]) for (const h of [1.1, 2.2]) f.seg('line', W(x, Y0 + 2.6, h), W(x, LY - 6.2, h));
    f.box(cx + 2.3, Y0 + 3.0, z, 0.9, 0.7, 1.7, 'k'); }
  // paint shop: the booth's air plenum and its ducts up to the roof; a bunded drum store and the paint kitchen's
  // mixing tanks by the south wall
  f.box(302.35, LY - 2.8, 5.0, 9.3, 5.6, 1.3, 'n');
  for (const x of [304.2, 309.8]) f.cylZ(x, LY, 6.3, 0.5, H - 6.3, 10, 'n');
  f.box(293, LY + 6.1, z, 7.4, 4.2, 0.2, 'k');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) f.cylZ(294.2 + i * 1.6, LY + 7.2 + j * 1.6, 0.2, 0.55, 0.95, 10, (i + j) % 2 ? 'k' : 'n');
  for (let i = 0; i < 4; i++) { const x = 303.6 + i * 2.2; f.box(x - 0.7, LY + 6.4, z, 1.4, 1.4, 0.3, 'k').cylZ(x, LY + 7.1, 0.3, 0.6, 1.7, 12, 'n').box(x - 0.25, LY + 6.85, 2.0, 0.5, 0.5, 0.45, 'k'); }
  f.seg('line', W(302.6, LY + 7.1, 2.6), W(311.4, LY + 7.1, 2.6)); for (let i = 0; i < 4; i++) f.seg('line', W(303.6 + i * 2.2, LY + 7.1, 2.45), W(303.6 + i * 2.2, LY + 7.1, 2.6));
  f.text(TOP(0, 0, 0), 'PAINT KITCHEN', 307, LY + 9.9, 0.7, 'paint', 'middle', 0.02);
  // assembly: tool balancers on rails over both sides, the engine dress area with its jib crane, a seat-lift arm,
  // the parts supermarket's shelving along the south wall, the andon board over the line
  for (const y of [LY - 2.3, LY + 2.1]) { f.box(323, y, 4.2, 43, 0.2, 0.2, 'k'); for (let k = 11; k <= 15; k++) for (const dx of [-1.2, 1.2]) { const x = WORKS.stations[k][0] + dx; f.seg('detail', W(x, y + 0.1, 4.2), W(x, y + 0.1, 2.3)).box(x - 0.08, y, 2.0, 0.16, 0.2, 0.3, 'k'); } }
  for (let i = 0; i < 4; i++) { const x = 327 + i * 4.2, y = Y0 + 4.6; f.box(x - 0.6, y - 0.45, z, 1.2, 0.9, 0.6, 'k').box(x - 0.5, y - 0.4, 0.6, 1.0, 0.8, 0.75, 'n').cylY(x - 0.15, y - 0.55, 1.25, 0.18, 1.1, 8, 'k').box(x + 0.5, y - 0.3, 0.7, 0.6, 0.6, 0.5, 'k'); }
  f.cylZ(324.6, Y0 + 2.0, z, 0.2, 4.2, 8, 'k'); beam(f, [324.6, Y0 + 2.0, 4.0], [336, Y0 + 2.0, 4.0], 0.25, 'k', 0.3); f.seg('line', W(331, Y0 + 2.0, 3.85), W(331, Y0 + 2.0, 2.4)).box(330.7, Y0 + 1.7, 2.1, 0.6, 0.6, 0.3, 'k');
  f.text(TOP(0, 0, 0), 'ENGINE DRESS', 333, Y0 + 7.2, 0.7, 'paint', 'middle', 0.02);
  f.cylZ(360.4, LY + 3.9, z, 0.18, 3.4, 8, 'k'); beam(f, [360.4, LY + 3.9, 3.3], [363.4, LY + 0.6, 3.3], 0.18, 'k', 0.22); f.seg('line', W(363.4, LY + 0.6, 3.2), W(363.4, LY + 0.6, 2.2)).box(363.0, LY + 0.2, 1.9, 0.8, 0.8, 0.3, 'k');
  for (let x = 324; x < 366; x += 4.2) { f.box(x, Y1 - 1.6, z, 3.8, 1.0, 0.1, 'n'); for (const zz of [0.8, 1.5, 2.2]) f.box(x, Y1 - 1.6, zz, 3.8, 1.0, 0.06, 'n');
    for (const dx of [0, 3.7]) f.box(x + dx, Y1 - 1.6, z, 0.1, 1.0, 2.3, 'k'); for (let b = 0; b < 4; b++) [0.1, 0.86, 1.56].forEach((zz, j) => f.box(x + 0.2 + b * 0.9, Y1 - 1.45, zz, 0.7, 0.7, 0.45, (b + j + Math.round(x)) % 4 ? 'n' : 'k')); }
  f.text(TOP(0, 0, 0), 'SUPERMARKET', 345, Y1 - 2.6, 0.7, 'paint', 'middle', 0.02);
  f.box(343, LY - 0.1, 6.0, 10, 0.2, 1.4, 'n'); f.seg('detail', W(344, LY, 7.4), W(344, LY, H)).seg('detail', W(352, LY, 7.4), W(352, LY, H));
  f.text(FRONT(343, LY + 0.11, 7.4), 'LINE 1 · ANDON', 5, 0.42, 0.34, 'ink', 'middle', 0.01);
  for (let i = 0; i < 5; i++) f.fill2(FRONT(343, LY + 0.11, 7.4), 0.7 + i * 1.8, 0.65, 1.2, 0.5, 'lamp', 0.01).text(FRONT(343, LY + 0.11, 7.4), String(11 + i), 1.3 + i * 1.8, 1.32, 0.25, 'ink', 'middle', 0.012);
  // end of line: the water test booth with a car in it and its spray arches, the quality audit bay under lamps, a
  // safety board
  { const bx = 371, by = Y0 + 1.4;
    for (const x of [bx, bx + 13]) for (const y of [by, by + 7.6]) f.box(x - 0.15, y - 0.15, z, 0.3, 0.3, 3.6, 'k');
    f.box(bx, by - 0.15, z, 13, 0.3, 1.2, 'n').box(bx - 0.15, by, 3.6, 13.3, 0.3, 0.2, 'k').box(bx - 0.15, by + 7.45, 3.6, 13.3, 0.3, 0.2, 'k');
    for (let x = bx + 2; x < bx + 12; x += 2.5) { const q = []; for (let a = 0; a <= Math.PI; a += Math.PI / 6) q.push([x, by + 3.8 + 3.2 * Math.cos(a), 0.3 + 2.8 * Math.sin(a)]); for (let i = 1; i < q.length; i++) f.seg('detail', W(...q[i - 1]), W(...q[i])); }
    carInto(f, bx + 6.5, by + 1.6, 'n'); f.text(TOP(0, 0, 0), 'WATER TEST', bx + 6.5, by + 9.6, 0.7, 'paint', 'middle', 0.02); }
  f.box(377, Y1 - 6.6, z, 7, 5.6, 0.15, 'n'); carInto(f, 380.5, Y1 - 6.1, 'k');
  for (const x of [377.4, 383.6]) for (const y of [Y1 - 6.2, Y1 - 1.4]) f.seg('line', W(x, y, 0.15), W(x, y, 2.6)).box(x - 0.2, y - 0.2, 2.6, 0.4, 0.4, 0.2, 'l');
  f.box(386, Y1 - 3.2, z, 1.6, 0.8, 1.0, 'n').box(386.2, Y1 - 3.1, 1.0, 1.2, 0.05, 0.7, 'w');
  f.text(TOP(0, 0, 0), 'QUALITY AUDIT', 380.5, Y1 - 7.4, 0.7, 'paint', 'middle', 0.02);
  f.box(369, LY - 4.1, 6.0, 12, 0.2, 1.3, 'n').text(FRONT(369, LY - 3.89, 7.3), 'SAFETY FIRST · 412 DAYS', 6, 0.5, 0.42, 'ink', 'middle', 0.01);
  for (const x of [370, 380]) f.seg('detail', W(x, LY - 4.0, 7.3), W(x, LY - 4.0, H));
  const inside = f.build('worksInside'); inside.visible = false; g.add(inside);

  // ---- inside: what moves (all of it hidden with the inside) ----
  PRESSES.forEach((a, i) => { const ram = new Part().box(a + 0.15, LY - 1.7, 0, 3.1, 3.4, 1.0, 'k').box(a + 0.15, LY - 1.7, 1.0, 3.1, 0.25, 0.8).box(a + 0.15, LY + 1.45, 1.0, 3.1, 0.25, 0.8).build(`ram${i}`);
    ram.position.y = 4.6; inside.add(ram); });
  // the buffer: shells riding high across the body shop, between the lift towers
  const buffer = new THREE.Group(); buffer.name = 'buffer'; inside.add(buffer);
  // the marriage: the powertrain on its lift, under the station
  const pt = new Part().box(-1.2, -0.7, 0, 2.4, 1.4, 0.25, 'k').box(-0.6, -0.4, 0.25, 1.2, 0.8, 0.7, 'k').cylY(-0.2, -0.45, 0.55, 0.2, 0.9, 8, 'n').build('powertrain');
  pose(pt, 336, LY, 0, 0.1); inside.add(pt);
  // rollers in the rolling road, and the lamps of the lights test and the light tunnel
  const rollers = new Part(); for (const dx of [-1.25, 1.35]) rollers.cylY(385 + dx, LY - 1.2, 0.12, 0.22, 2.4, 10, 'n'); const rl = rollers.build('rollers'); inside.add(rl);
  const lamps = new Part(); for (const y of [LY - 2.3, LY + 2.3]) lamps.box(376.4, y - 0.1, 0.6, 3.5, 0.2, 0.4, 'l'); for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI; lamps.box(392 - 0.1, LY + 2.25 * Math.cos(a) - 0.1, 0.15 + 2.95 * Math.sin(a), 0.2, 0.2, 0.2, 'l'); }
  inside.add(lamps.build('testLamps'));
  // two AGVs on the assembly floor
  for (let i = 0; i < 2; i++) { const a = buildAgv(); a.name = `agv${i}`; inside.add(a); }
  // the robots: four pairs along the body shop, two in the booth, one each for wheels and glass
  ROBOTS.length = 0;
  const robot = (x, y, station, kind) => { const r = buildRobot(); const h = y < LY ? Math.PI / 2 : -Math.PI / 2; pose(r, x, y, h); inside.add(r); ROBOTS.push({ g:r, x, y, h, station, kind,
    turret:r.getObjectByName('turret'), shoulder:r.getObjectByName('shoulder'), elbow:r.getObjectByName('elbow'), wrist:r.getObjectByName('wrist'), spark:r.getObjectByName('spark') }); };
  for (let k = 3; k <= 6; k++) { const sx = WORKS.stations[k][0]; robot(sx - 1.2, LY - 3.4, k, 'weld'); robot(sx + 1.2, LY + 3.4, k, 'weld'); }
  robot(307, LY - 2.2, 9, 'paint'); robot(307, LY + 2.2, 9, 'paint');
  robot(345, LY + 3.0, 13, 'wheel'); robot(354, LY - 3.0, 14, 'glass');
  // the sub-assembly cells' robots, and two sealing robots at the last body-shop station
  CELLS.forEach((cx, i) => robot(cx + 0.2, Y0 + 3.6, 4 + i, 'weld'));
  robot(287, LY - 3.2, 7, 'paint'); robot(287, LY + 3.2, 7, 'paint');
  // the press shop's overhead crane: a bridge along its runways, a trolley across it, a die on the hook
  const crane = new Part().box(-0.7, Y0 + 0.9, 8.1, 0.35, Y1 - Y0 - 2.3, 0.9, 'k').box(0.35, Y0 + 0.9, 8.1, 0.35, Y1 - Y0 - 2.3, 0.9, 'k')
    .box(-1.0, Y0 + 0.7, 8.6, 2.0, 0.8, 0.6, 'k').box(-1.0, Y1 - 1.6, 8.6, 2.0, 0.8, 0.6, 'k').build('crane');
  const trolley = new Part().box(-0.9, -0.8, 9.0, 1.8, 1.6, 0.6, 'k').build('craneTrolley');
  const hook = new Part().box(-0.3, -0.3, 0, 0.6, 0.6, 0.5, 'k').box(-1.3, -1.0, -1.25, 2.6, 2.0, 1.0, 'k').box(-1.3, -1.0, -0.25, 2.6, 2.0, 0.2, 'n').build('craneHook');
  const cable = new Part().seg('line', W(-0.2, 0, 0), W(-0.2, 0, 1)).seg('line', W(0.2, 0, 0), W(0.2, 0, 1)).build('craneCable');
  trolley.add(hook, cable); crane.add(trolley); inside.add(crane);
  // the cells' turntables: a divider down the middle, a side frame clamped on either half
  CELLS.forEach((cx, i) => { const t = new Part().cylZ(0, 0, 0, 1.7, 0.45, 16, 'k').box(-1.6, -0.08, 0.45, 3.2, 0.16, 1.6, 'n');
    for (const s of [-1, 1]) { t.box(-1.3, s * 0.75 - 0.04, 0.6, 2.6, 0.08, 1.0, 'g'); t.box(-1.4, s * 0.75 - 0.1, 0.45, 0.2, 0.2, 0.5, 'k').box(1.2, s * 0.75 - 0.1, 0.45, 0.2, 0.2, 0.5, 'k'); }
    const tt = t.build(`turntable${i}`); pose(tt, cx, Y0 + 6.4, 0, 0); inside.add(tt); });
  // the tugger train: a tug and three carts of parts round the assembly floor
  const tug = new Part().box(-1.4, -0.55, 0.15, 1.4, 1.1, 0.5, 'k').box(-1.2, -0.4, 0.65, 0.6, 0.8, 0.5, 'n').box(-0.45, -0.1, 0.65, 0.1, 0.2, 0.6, 'k').build('tug'); inside.add(tug);
  for (let i = 0; i < 3; i++) { const c = new Part().box(-1.9, -0.55, 0.2, 1.8, 1.1, 0.1, 'n').box(-1.8, -0.45, 0.3, 1.6, 0.9, 0.6, i % 2 ? 'k' : 'n').box(-0.1, -0.05, 0.25, 0.3, 0.1, 0.05, 'k').build(`cart${i}`); inside.add(c); }
  // the andon board's lamps, one a station, lit live while its station works
  const andon = new Part(); for (let i = 0; i < 5; i++) andon.fill2(FRONT(343, LY + 0.13, 7.4), 0.7 + i * 1.8, 0.65, 1.2, 0.5, 'lamp', 0.012); const ag = andon.build('andon'); inside.add(ag);
  g.userData.peek = { shell, cut, inside, box:[X0, X1, Y0, Y1] };
  return g;
}
