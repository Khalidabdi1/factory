// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, pose } from '../kernel/part';
import { WORKS } from '../layout';
import { buildAgv, buildRobot } from '../models/works';
import { lampPost, ring } from './ground';

// Car Works: one long hall on its terrace in the foothills, under a sawtooth roof like Plant 01's, CAR WORKS on its
// sign band and a stack over the paint shop. It opens to its section like the other buildings. The line runs down
// the middle, east from the coils to the door: the press shop (blanking, a tandem press), the body shop (a welding
// line of robots on pedestals either side, after the owner's photograph: fixtures, fences, a catwalk with a caged
// ladder, cable trays, an overhead buffer of shells), the paint shop (the dip, the booth, the oven), assembly (a
// hanger, the marriage of body and powertrain, wheels and glass by robot, seats by hand) and the end of the line
// (fluids, the lights test, the rolling road, the light tunnel). Moving parts are named for the simulation.
export const ROBOTS = [];   // { g, x, y, h, station, kind } in the order they are built
export function buildCarWorks() {
  const { x0:X0, x1:X1, y0:Y0, y1:Y1, h:H, ly:LY, exit:[EX] } = WORKS, D = Y1 - Y0, z = 0;
  const g = new THREE.Group(); g.name = 'carWorks';

  // ---- always there: the retaining wall at the back of the terrace, the apron, the lot, its lamps ----
  const p = new Part(), G = TOP(0, 0, 0), [TX0, TX1, TY0] = WORKS.terrace;
  p.box(TX0, TY0 - 0.6, 0, TX1 - TX0, 0.6, 3.2);
  const RW = FRONT(TX0, TY0, 3.2); for (let u = 6; u < TX1 - TX0; u += 6) p.draw(RW, [u, 0, u, 3.2], 'detail', 0.01);
  p.fill2(G, X0 - 2, Y1, X1 - X0 + 4, 3, 'deck', 0.012).fill2(G, 314, -17, 86, 11.5, 'road', 0.012).fill2(G, EX - 3, Y1 + 3, 6, 2, 'road', 0.012);
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
  f.fill2(TOP(X0, Y0, z), 0, 0, X1 - X0, D, 'deck', 0.012);
  for (const [, name, a, b] of WORKS.shops) { f.draw(Gz, [b, Y0 + 0.6, b, Y1 - 0.6], 'detail', lift).text(Gz, name.toUpperCase(), (a + b) / 2, Y1 - 1.6, 1.3, 'paint', 'middle', lift); }
  // the line: two rails and the slats of the conveyor between them, the whole length
  f.box(220, LY - 1.15, z, EX + 2 - 220, 0.15, 0.5, 'k').box(220, LY + 1.0, z, EX + 2 - 220, 0.15, 0.5, 'k');
  const sl = []; for (let x = 220.3; x < EX + 2; x += 0.6) sl.push(x, LY - 1.0, x, LY + 1.0); f.draw(TOP(0, 0, 0.5), sl, 'detail', 0.01);
  // aisles: walkways painted either side
  f.draw(Gz, [220, LY - 4.6, X1 - 2, LY - 4.6, 220, LY + 4.6, X1 - 2, LY + 4.6], 'line', lift);
  // press shop: three coils, the uncoiler and the blanking press, the tandem press frame over the line, die carts
  for (let i = 0; i < 3; i++) { f.cylY(219.5 + i * 2.6, Y0 + 1.5, 1.0, 1.0, 1.4, 16, 'g'); f.cylY(219.5 + i * 2.6, Y0 + 1.4, 1.0, 0.35, 1.6, 10, 'k'); }
  f.box(218.6, LY - 2.4, z, 3.2, 4.8, 1.2, 'k').cylY(220.2, LY - 1.3, 2.2, 1.0, 2.6, 14, 'g');
  for (const x of [229, 236.4]) { f.box(x, LY - 3.4, z, 1.4, 1.4, 7.6, 'k').box(x, LY + 2.0, z, 1.4, 1.4, 7.6, 'k'); }
  f.box(228.6, LY - 3.6, 7.6, 9.6, 7.2, 1.8, 'k').box(229, LY - 2.0, z, 8.8, 4.0, 0.45);
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
  const inside = f.build('worksInside'); inside.visible = false; g.add(inside);

  // ---- inside: what moves (all of it hidden with the inside) ----
  const ram = new Part().box(229.2, LY - 1.9, 0, 8.4, 3.8, 1.4, 'k').box(229.2, LY - 1.9, 1.4, 8.4, 0.3, 4.6).box(229.2, LY + 1.6, 1.4, 8.4, 0.3, 4.6).build('ram');
  ram.position.y = 5.0; inside.add(ram);
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
  g.userData.peek = { shell, cut, inside, box:[X0, X1, Y0, Y1] };
  return g;
}
