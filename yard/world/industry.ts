// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part, pose } from '../kernel/part';
import { CURB, SX, SY } from '../layout';
import { lampPost, ring, tree } from './ground';

export function buildFactory() {
  const p = new Part();
  p.box(14, 12, 0, 80, 36, 14);
  // sawtooth roof: four prisms, the steep glazed face of each turned to the viewer
  for (let i = 0; i < 4; i++) {
    const x0 = 14 + 20 * i;
    p.extrude([[x0, 12, 14], [x0 + 20, 12, 14], [x0 + 20, 12, 19]], [0, 36, 0]);
    const M = SIDE(x0 + 20, 48, 19);
    p.fill2(M, 1, 0.8, 34, 3.4, 'window').rect2(M, 1, 0.8, 34, 3.4, 'line');
    for (let u = 3.5; u < 35; u += 2.5) p.draw(M, [u, 0.8, u, 4.2]);
    for (let y = 15; y < 48; y += 3) p.seg('detail', W(x0 + 0.4, y, 14.15), W(x0 + 19.6, y, 18.95));
  }
  // front wall: sign band, invented glyph, doors, corrugation
  const F = FRONT(14, 48, 14);
  p.draw(F, [0, 4.2, 80, 4.2]);
  const hex = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, b = a + Math.PI / 3;
    hex.push(5 + 1.6 * Math.cos(a), 2.1 + 1.6 * Math.sin(a), 5 + 1.6 * Math.cos(b), 2.1 + 1.6 * Math.sin(b)); }
  p.draw(F, [...hex, 5, 2.1, 5, 0.5, 5, 2.1, 5 + 1.6 * Math.cos(Math.PI / 6), 2.1 + 0.8, 5, 2.1, 5 - 1.6 * Math.cos(Math.PI / 6), 2.1 + 0.8], 'line');
  p.text(F, 'PLANT 01', 8.4, 3.1, 2.3);
  const doors = [[22, 32], [44, 54], [60.5, 62.5], [69, 75]];
  for (const [a, b] of doors.slice(0, 2)) { p.rect2(F, a, 6, b - a, 8, 'line'); for (let v = 6.7; v < 14; v += 0.7) p.draw(F, [a, v, b, v]); }
  p.fill2(F, 60.5, 10, 2, 4).rect2(F, 60.5, 10, 2, 4, 'line');
  p.fill2(F, 69, 9.6, 6, 4.4, 'window').rect2(F, 69, 9.6, 6, 4.4, 'line');
  for (let u = 1.6; u < 80; u += 1.6) { if (doors.some(([a, b]) => u > a - 0.3 && u < b + 0.3)) continue; p.draw(F, [u, 4.2, u, 14]); }
  for (const [a, b] of doors.slice(0, 2)) for (let u = a + 0.2; u < b; u += 1.6) p.draw(F, [u, 4.2, u, 6]);
  const R = SIDE(94, 48, 14);
  p.draw(R, [0, 4.2, 36, 4.2]); for (let u = 1.6; u < 36; u += 1.6) p.draw(R, [u, 4.2, u, 14]);
  // chimney with rings and a warning light
  p.cylZ(26, 22, 12, 1.3, 18, 14);
  for (const z of [24, 28.6]) { const r = ring(26, 22, 1.33, z, 14); for (let i = 0; i < r.length; i += 2) p.seg('detail', r[i], r[i + 1]); }
  // office annex: windows, door, roof plant
  p.box(94, 28, 0, 22, 20, 8);
  const A = FRONT(94, 48, 8);
  for (let i = 0; i < 4; i++) p.fill2(A, 1.5 + 4 * i, 1.6, 3, 2.4, i === 2 ? 'glass' : 'window').rect2(A, 1.5 + 4 * i, 1.6, 3, 2.4, 'line');
  p.fill2(A, 18, 3.6, 2.6, 4.4).rect2(A, 18, 3.6, 2.6, 4.4, 'line');
  const AS = SIDE(116, 48, 8);
  for (let i = 0; i < 4; i++) p.fill2(AS, 1.5 + 4.6 * i, 1.6, 3, 2.4, i === 1 ? 'glass' : 'window').rect2(AS, 1.5 + 4.6 * i, 1.6, 3, 2.4, 'line');
  for (const x of [97, 101.5]) { p.box(x, 31, 8, 3.4, 2.6, 1.4); p.draw(FRONT(x, 33.6, 9.4), [0.5, 0.4, 2.9, 0.4, 0.5, 0.7, 2.9, 0.7, 0.5, 1.0, 2.9, 1.0]); }
  for (const [x, y] of FANS) p.cylZ(x, y, 8, 1.7, 0.8, 16);
  const g = p.build('factory');
  // live bits: the chimney light and the fan blades
  g.add(new Part().box(25.6, 21.6, 30, 0.8, 0.8, 0.5).build('light'));
  for (const [x, y] of FANS) {
    const b = new Part(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; b.seg('line', W(0, 0, 0), W(1.45 * Math.cos(a), 1.45 * Math.sin(a), 0)); }
    const blades = b.build('fan'); pose(blades, x, y, 0, 8.85); g.add(blades);
  }
  return g;
}
const FANS = [[107.5, 37], [111.5, 43]];

export function buildConveyor() {
  const p = new Part();
  p.box(84.5, 48, 0.6, 3, 11.5, 0.4);
  p.box(87.5, 56.5, 0.6, 62.3, 3, 0.4);
  p.box(84.5, 48, 1.0, 0.25, 11.5, 0.25); p.box(87.25, 48, 1.0, 0.25, 8.5, 0.25);
  p.box(87.5, 56.5, 1.0, 62.3, 0.25, 0.25); p.box(87.5, 59.25, 1.0, 51.5, 0.25, 0.25);
  for (let y = 48.6; y < 59.2; y += 0.8) p.seg('detail', W(84.75, y, 1.02), W(87.25, y, 1.02));
  for (let x = 88; x < 149.6; x += 0.8) p.seg('detail', W(x, 56.75, 1.02), W(x, 59.25, 1.02));
  for (let y = 50; y < 56; y += 4) for (const x of [84.6, 87.15]) p.box(x, y, 0, 0.25, 0.25, 0.6);
  for (let x = 90; x < 150; x += 4) for (const y of [56.6, 59.15]) p.box(x, y, 0, 0.25, 0.25, 0.6);
  p.box(149.8, 56.5, 0.6, 0.3, 3, 0.9);
  p.box(118, 59.6, 0.2, 1.8, 1.2, 1.2); p.draw(FRONT(118, 60.8, 1.4), [0.3, 0.3, 1.5, 0.3, 0.3, 0.55, 1.5, 0.55, 0.3, 0.8, 1.5, 0.8]);
  return p.build('conveyor');
}

export function buildGate() {
  const p = new Part();
  p.box(131, 107, 0, 4, 4, 3);
  p.box(130.6, 106.6, 3, 4.8, 4.8, 0.3);
  p.fill2(FRONT(131, 111, 3), 0.5, 0.6, 3, 1.3, 'window').rect2(FRONT(131, 111, 3), 0.5, 0.6, 3, 1.3, 'line');
  p.fill2(SIDE(135, 111, 3), 0.5, 0.6, 3, 1.3, 'window').rect2(SIDE(135, 111, 3), 0.5, 0.6, 3, 1.3, 'line');
  p.box(112.4, 118.2, 0, 0.6, 0.6, 1.3); p.box(129.4, 118.2, 0, 0.6, 0.6, 1.3);
  const g = p.build('gate');
  const arm = dir => { const a = new Part(), x0 = dir > 0 ? 0 : -8;
    a.box(x0, -0.15, -0.15, 8, 0.3, 0.3, 'k');
    for (let x = 1; x < 8; x += 1.4) a.seg('koline', W(x0 + x, 0.16, -0.15), W(x0 + x + 0.7, 0.16, 0.15));
    return a.build(dir > 0 ? 'armOut' : 'armIn'); };
  const out = arm(1), inn = arm(-1);
  pose(out, 112.7, 118.5, 0, 1.45); pose(inn, 129.7, 118.5, 0, 1.45);
  g.add(out, inn);
  return g;
}

export function bayLamp(b) {
  const g = new Part().box(b.bx - 3, 74.6, 0, 0.3, 0.3, 4.2).build('bayPost');
  b.lamp = new Part().box(b.bx - 3.25, 74.35, 4.2, 0.8, 0.8, 0.6).build('lamp'); g.add(b.lamp);
  return g;
}

// Closed buildings you can look into: the shell (full walls, a roof) hides the inside, and while the building or
// something in it is selected the shell gives way to the cut, a section drawing with the walls cut low and hatched.
export function buildWarehouse() {
  const g = new THREE.Group(); g.name = 'warehouse';
  const X0 = 228, X1 = 308, Y0 = 14, Y1 = 58, H = 10, LOW = 1.2, T = 0.6, RZ = 13.5, RY = 36;
  // always there: the floor, the two back walls and the fit-out
  const p = new Part();
  p.fill2(TOP(X0, Y0, 0), 0, 0, X1 - X0, Y1 - Y0, 'deck', 0.012);
  p.box(X0, Y0, 0, X1 - X0, T, H);
  p.box(X0, Y0 + T, 0, T, 1.6, H); p.box(X0, 23.8, 0, T, Y1 - 23.8, H); p.box(X0, 16.2, 5.8, T, 7.6, H - 5.8);
  const B = FRONT(X0 + T, Y0 + T, H);
  p.draw(B, [0, 4.6, X1 - X0 - T, 4.6]); p.text(B, 'WAREHOUSE 01', 6, 3.6, 2.6);
  for (let u = 2; u < X1 - X0; u += 2) p.draw(B, [u, 4.6, u, H]);
  const G = TOP(0, 0, 0);
  // pallet racking, two rows back to back: an upright at every bay with zig-zag bracing, two-tone beams under levels 2
  // and 3 and along the top
  for (const [y0, y1] of [[28.4, 31.0], [31.6, 34.2]]) {
    for (let j = 0; j <= 8; j++) { const x = 243 + 6 * j - 0.1; for (const y of [y0, y1]) p.box(x, y, 0, 0.2, 0.2, 8.6);
      for (let z = 0.4, k = 0; z < 8.2; z += 1.4, k++) p.seg('detail', W(x + 0.1, k % 2 ? y1 : y0 + 0.2, z), W(x + 0.1, k % 2 ? y0 + 0.2 : y1, z + 1.4)); }
    for (const z of [2.85, 5.85, 8.45]) for (const y of [y0, y1 + 0.05]) p.box(243, y, z, 48, 0.15, 0.15, 'k');
  }
  for (let b = 0; b < 8; b++) p.text(G, `A${b + 1}`, 246 + 6 * b, 36.6, 0.9, 'paint', 'middle', 0.05).text(G, `B${b + 1}`, 246 + 6 * b, 27.7, 0.9, 'paint', 'middle', 0.05);
  // the west strip, where people work: two runs of shelving stocked with cartons (picked from the aisle between them),
  // the packing bench and its outgoing parcels, stacks of empty pallets, a painted walkway
  for (const x0 of [228.8, 231.6]) {
    for (let y = 24.8; y <= 37.3; y += 3.1) p.box(x0, y - 0.05, 0, 0.1, 0.1, 3.1).box(x0 + 1.1, y - 0.05, 0, 0.1, 0.1, 3.1);
    for (const z of [0.15, 0.95, 1.75, 2.55]) {
      p.box(x0, 24.75, z, 1.2, 12.5, 0.05);
      for (let i = 0; i < 16; i++) if ((i * 7 + z * 10 + x0) % 5 > 1.2) p.box(x0 + 0.2, 25.0 + i * 0.77, z + 0.05, 0.75, 0.62, 0.38 + (i % 3) * 0.08, 'k');
    }
  }
  p.box(228.8, 39.6, 0, 1.3, 4.0, 0.9).box(229.0, 40.2, 0.9, 0.55, 0.5, 0.35, 'k').box(229.0, 42.6, 0.9, 0.25, 0.4, 0.45);
  for (let i = 0; i < 5; i++) p.box(229.0 + (i % 2) * 0.6, 44.4 + Math.floor(i / 2) * 0.62, Math.floor(i / 4) * 0.42, 0.55, 0.55, 0.4, 'k');
  for (const y of [50.2, 53.4]) for (let k = 0; k < 6; k++) p.box(229.2, y, k * 0.17, 2.4, 2.4, 0.15);
  for (const x of [234.0, 234.5]) p.draw(G, [x, 24.2, x, 57], 'detail', 0.05);
  for (let y = 25; y < 57; y += 1.2) p.draw(G, [234.0, y, 234.5, y + 0.5], 'detail', 0.05);
  p.text(G, 'PICKING', 229.0, 24.3, 0.6, 'paint', 'start', 0.05).text(G, 'PACKING', 229.0, 39.3, 0.6, 'paint', 'start', 0.05);
  // a pallet wrapper: turntable, mast and film
  p.cylZ(241.5, 54, 0, 1.4, 0.15, 16).box(243.3, 53.7, 0, 0.5, 0.6, 2.6).cylZ(243.0, 54.0, 1.0, 0.16, 0.6, 8, 'k');
  // the office in the south-east corner: partitions with a glass band, two desks with lit screens
  p.box(291, 50.5, 0, 16.4, 0.2, 2.2).box(291, 50.7, 0, 0.2, 6.7, 2.2);
  p.fill2(FRONT(291.2, 50.7, 2.2), 0.6, 0.15, 15.4, 0.9, 'window').fill2(SIDE(291.2, 57.4, 2.2), 0.6, 0.15, 5.8, 0.9, 'window');
  for (const x of [295, 301]) { p.box(x, 53.2, 0, 2.4, 1.0, 0.75).box(x + 0.9, 53.3, 0.75, 0.6, 0.08, 0.45, 'w').box(x + 0.9, 54.5, 0, 0.5, 0.5, 0.45); }
  p.text(G, 'OFFICE', 292, 51.6, 0.6, 'paint', 'start', 0.05);
  p.draw(G, [X0 + T, 17.2, X1 - T, 17.2, X0 + T, 22.8, X1 - T, 22.8], 'line', 0.05);
  for (let x = 237; x < 300; x += 4) p.draw(G, [x, 40.6, x + 2, 40.6, x, 48.5, x + 2, 48.5, x, 26, x + 2, 26], 'detail', 0.05);
  for (const x of [262, 268, 274]) { p.rect2(G, x - 1.6, 53.2, 3.2, 3.9, 'detail', 0.05); p.box(x + 1.5, 56.4, 0, 0.45, 0.45, 1.3); }
  // outside: canopies over the two forklift doorways, held by tie rods from the wall
  for (const x of [246.4, 282.4]) { p.box(x, Y1, 6.2, 7.2, 2.6, 0.15); for (const dx of [0.3, 6.9]) p.seg('line', W(x + dx, Y1, 8.8), W(x + dx, Y1 + 2.5, 6.35)); }
  g.add(p.build('whBase'));
  // the cut: low front and east walls hatched on the cut, posts, the roof as an outline with its trusses
  const c = new Part();
  const low = [[X0 + T, Y1 - T, 18.4, T], [253, Y1 - T, 30, T], [289, Y1 - T, X1 - T - 289, T], [X1 - T, Y0 + T, T, 1.6], [X1 - T, 23.8, T, Y1 - T - 23.8]];
  for (const [x, y, w, d] of low) {
    c.box(x, y, 0, w, d, LOW);
    const M = TOP(x, y, LOW), n = Math.max(w, d), segs = [];
    for (let u = 0.4; u < n; u += 0.8) segs.push(...(w > d ? [u, 0, u + T, d] : [0, u, w, u + T]));
    c.draw(M, segs);
  }
  for (const [x, y] of [[X1 - T, Y1 - T], [268, Y1 - T], [X1 - T, 36], [X1 - T, 16.2 - 0.5], [X1 - T, 23.8]]) c.box(x, y, 0, T, 0.5, H);
  c.seg('line', W(X1, 16.2, 5.8), W(X1, 23.8, 5.8));
  for (const [a, b] of [[[X0, Y1, H], [X1, Y1, H]], [[X1, Y0, H], [X1, Y1, H]], [[X0, RY, RZ], [X1, RY, RZ]],
    [[X0, Y0, H], [X0, RY, RZ]], [[X0, RY, RZ], [X0, Y1, H]], [[X1, Y0, H], [X1, RY, RZ]], [[X1, RY, RZ], [X1, Y1, H]]]) c.seg('line', W(...a), W(...b));
  for (let x = X0 + 8; x < X1; x += 8) { c.seg('detail', W(x, Y0, H), W(x, RY, RZ)); c.seg('detail', W(x, RY, RZ), W(x, Y1, H)); }
  const cut = c.build('whCut'); cut.visible = false; g.add(cut);
  // the shell: full walls with open doorways (two for forklifts, the truck door east), a gabled roof
  const s = new Part();
  for (const [a, b] of [[X0 + T, 247], [253, 283], [289, X1]]) s.box(a, Y1 - T, 0, b - a, T, H);
  for (const [a, b] of [[247, 253], [283, 289]]) s.box(a, Y1 - T, 5.6, b - a, T, H - 5.6);
  s.box(X1 - T, Y0, 0, T, 2.2, H); s.box(X1 - T, 23.8, 0, T, Y1 - T - 23.8, H); s.box(X1 - T, 16.2, 5.8, T, 7.6, H - 5.8);
  s.extrude([[X0 - 0.4, Y0 - 0.5, H - 0.12], [X0 - 0.4, Y1 + 0.5, H - 0.12], [X0 - 0.4, RY, RZ]], [X1 - X0 + 0.8, 0, 0]);
  const sl = Math.hypot(Y1 + 0.5 - RY, RZ - H + 0.12), SL = plane([X0 - 0.4, RY, RZ], [1, 0, 0], [0, (Y1 + 0.5 - RY) / sl, -(RZ - H + 0.12) / sl]);
  for (let u = 2.4; u < X1 - X0; u += 2.4) s.draw(SL, [u, 0, u, sl]);
  for (const u of [12, 30, 48, 66]) s.fill2(SL, u, 6, 5, 9, 'window', 0.03).rect2(SL, u, 6, 5, 9, 'line', 0.04);
  for (let x = X0; x <= X1; x += 2.4) s.seg('detail', W(x, Y0 - 0.5, H - 0.12), W(x, RY, RZ));
  const F = FRONT(X0, Y1, H);
  // the sign band, with an invented glyph (three stacked crates) like Plant 01's
  s.draw(F, [0, 1.8, X1 - X0, 1.8]); s.text(F, 'WAREHOUSE 01', 4.6, 1.45, 1.3);
  for (const [u, v] of [[1.4, 0.95], [2.6, 0.95], [2.0, 0.35]]) s.rect2(F, u, v, 1.0, 0.6, 'line');
  for (let u = 1.2; u < X1 - X0; u += 1.2) { if (u > 18.6 && u < 25.4 || u > 54.6 && u < 61.4) continue; s.draw(F, [u, u < 18 ? 1.8 : 0, u, H]); }
  for (const [a, b] of [[19, 25], [55, 61]]) { s.rect2(F, a, H - 5.6, b - a, 5.6, 'line'); s.box(X0 + a - 0.2, Y1 - 0.2, 5.6, b - a + 0.4, 0.5, 0.5); }
  for (const u of [32, 38, 44, 66, 72]) s.fill2(F, u, 2.4, 3.6, 1.2, 'window').rect2(F, u, 2.4, 3.6, 1.2, 'line');
  const E = SIDE(X1, Y1, H);
  for (let u = 1.2; u < Y1 - Y0; u += 1.2) { if (u > 34 - 0.1 && u < 41.9) { s.draw(E, [u, 0, u, 4.2]); continue; } s.draw(E, [u, 0, u, H]); }
  s.rect2(E, 34.2, 4.2, 7.6, 5.8, 'line');
  // roof vents along the ridge, downpipes at the front corners
  for (let x = X0 + 10; x < X1; x += 20) s.cylZ(x, RY, RZ - 0.25, 0.8, 1.1, 10).cylZ(x, RY, RZ + 0.85, 1.0, 0.12, 10);
  for (const x of [X0 + 0.3, X1 - 0.5]) s.box(x, Y1 + 0.05, 0, 0.2, 0.2, H);
  const shell = s.build('whShell'); g.add(shell);
  g.userData.peek = { shell, cut, box:[X0, X1, Y0, Y1] };
  return g;
}

// The warehouse gate: a sliding panel the guard opens from a post, and an open-sided booth.
export function buildWhGate() {
  const g = new THREE.Group(); g.name = 'whGate';
  const p = new Part();
  p.box(332, 117.6, 0, 0.5, 0.5, 2.6); p.box(313.4, 117.6, 0, 0.5, 0.5, 2.6);
  p.box(331.2, 115.8, 0, 0.45, 0.45, 1.1);   // the guard's control post
  g.add(p.build('posts'));
  const s = new Part();
  s.box(314, 117.4, 0.15, 18, 0.18, 0.18, 'k'); s.box(314, 117.4, 2.0, 18, 0.18, 0.18, 'k');
  for (let x = 314.6; x < 332; x += 0.75) s.seg('koline', W(x, 117.49, 0.33), W(x, 117.49, 2.0));
  s.box(314, 117.4, 0.15, 0.18, 0.18, 2.03, 'k'); s.box(331.82, 117.4, 0.15, 0.18, 0.18, 2.03, 'k');
  const panel = s.build('panel'); g.add(panel);
  return g;
}
export function buildBooth() {
  const p = new Part();
  for (const [x, y] of [[333, 102.6], [338.6, 102.6], [333, 105.8], [338.6, 105.8]]) p.box(x, y, 0, 0.4, 0.4, 2.8);
  p.box(332.6, 102.2, 2.8, 6.8, 4.4, 0.25);
  p.box(333.4, 102.8, 0, 5, 1.2, 1.0);   // desk under the canopy; the guard stands out front
  lampPost(p, 339.6, 108.4, -1, 0, 0);
  return p.build('booth');
}

// Corner Market, in its own frame (x 362–394, y 94–112); see SX, SY in the layout
export function buildShop() {
  const g = new THREE.Group(); g.name = 'shop';
  const X0 = 362, X1 = 394, Y0 = 94, Y1 = 112, H = 5.4, SILL = 0.9, T = 0.4;
  // always there: floor, back and west walls, shelves, counter, the stockroom corner
  const p = new Part();
  p.fill2(TOP(X0, Y0, 0), 0, 0, X1 - X0, Y1 - Y0, 'deck', 0.012);
  p.box(X0, Y0, 0, X1 - X0, T, H); p.box(X0, Y0 + T, 0, T, Y1 - Y0 - T, H);
  for (const y0 of [97.6, 102.8]) {
    p.box(366, y0, 0, 22.4, 1.6, 0.15);
    for (const z of [0.85, 1.55]) p.box(366, y0, z, 22.4, 1.6, 0.1);
    p.box(366, y0, 0, 0.15, 1.6, 2.3); p.box(388.25, y0, 0, 0.15, 1.6, 2.3);
  }
  p.box(383, 108.4, 0, 8, 1.6, 1.05); p.box(388.6, 108.6, 1.05, 1.2, 0.9, 0.5);
  p.rect2(TOP(0, 0, 0), 362.8, 94.8, 3.6, 2.8, 'detail', 0.03);
  // the back yard, between the shop and Market St: bins and empty crates by the back door, a hedge, two trees
  p.box(364, 91.4, 0, 1.2, 1.4, 1.3).box(365.6, 91.4, 0, 1.2, 1.4, 1.3);
  for (const [x, y, z] of [[368.6, 91.6, 0], [369.9, 91.6, 0], [368.6, 91.6, 0.6]]) p.box(x, y, z, 1.1, 1.1, 0.6, 'k');
  for (const x0 of [X0, X1 - 0.6]) p.box(x0, 78.4, 0, 0.6, 13.4, 1.1, 'gs');
  tree(p, 374, 84.5, 1.0); tree(p, 388, 82.6, 0.9);
  g.add(p.build('shopBase'));
  // the cut: a low sill and mullions on the street side, the fascia with its name, the roof as an outline
  const c = new Part();
  c.box(X0 + T, Y1 - T, 0, 376.5 - X0 - T, T, SILL); c.box(379.5, Y1 - T, 0, X1 - 379.5, T, SILL);
  c.box(X1 - T, Y0 + T, 0, T, Y1 - Y0 - 2 * T, SILL);
  c.box(X1 - T, Y1 - T, 0, T, T, H - 0.8); c.box(X1 - T, Y0, 0, T, T, H);
  c.box(X0, Y1 - T, H - 0.8, X1 - X0, T, 0.8);
  const F = FRONT(X0, Y1, H);
  c.text(F, 'CORNER MARKET', 1.2, 0.62, 0.56);
  for (let u = 2.6; u < X1 - X0 - 0.5; u += 2.6) { if (u > 14 && u < 18) continue; c.draw(F, [u, 0.8, u, H - SILL], 'line'); }
  c.draw(F, [14.5, H, 14.5, 2.2, 17.5, H, 17.5, 2.2, 14.5, 2.2, 17.5, 2.2], 'line');
  const S = SIDE(X1, Y1, H);
  for (let u = 3; u < Y1 - Y0 - 0.5; u += 3) c.draw(S, [u, 0.8, u, H - SILL], 'line');
  c.seg('line', W(X1, Y0, H), W(X1, Y1, H));
  for (let x = X0 + 3; x < X1; x += 3) c.seg('detail', W(x, Y0, H), W(x, Y1 - T, H));
  const cut = c.build('shopCut'); cut.visible = false; g.add(cut);
  // the shell: a shopfront of big panes either side of an open door, a glazed east wall, a flat roof with plant on it
  const s = new Part();
  s.box(X0 + T, Y1 - T, 0, 376.5 - X0 - T, T, H); s.box(379.5, Y1 - T, 0, X1 - 379.5, T, H); s.box(376.5, Y1 - T, 2.6, 3, T, H - 2.6);
  s.box(X1 - T, Y0 + T, 0, T, Y1 - Y0 - T, H);
  s.box(X0 - 0.2, Y0 - 0.2, H, X1 - X0 + 0.4, Y1 - Y0 + 0.4, 0.3);
  s.text(F, 'CORNER MARKET', 1.2, 0.62, 0.56);
  s.draw(F, [0, 0.8, X1 - X0, 0.8], 'line');
  for (const [a, b] of [[1, 13.8], [18.2, 31]]) {
    s.fill2(F, a, 1.3, b - a, H - SILL - 1.3, 'window').rect2(F, a, 1.3, b - a, H - SILL - 1.3, 'line');
    for (let u = a + 2.6; u < b - 0.5; u += 2.6) s.draw(F, [u, 1.3, u, H - SILL], 'line');
  }
  s.rect2(F, 14.5, 2.8, 3, 2.6, 'line');
  const SE = SIDE(X1, Y1, H);
  s.fill2(SE, 2, 1.3, 13.6, 2.4, 'window').rect2(SE, 2, 1.3, 13.6, 2.4, 'line');
  for (let u = 4.7; u < 15.5; u += 2.7) s.draw(SE, [u, 1.3, u, 3.7], 'line');
  for (const [x, y] of [[366, 97], [372, 97]]) { s.box(x, y, H + 0.3, 2.4, 1.8, 0.9); s.draw(FRONT(x, y + 1.8, H + 1.2), [0.3, 0.3, 2.1, 0.3, 0.3, 0.6, 2.1, 0.6]); }
  s.draw(TOP(X0, Y0, H + 0.3), [0.6, 0.6, X1 - X0 - 0.2, 0.6, X1 - X0 - 0.2, 0.6, X1 - X0 - 0.2, Y1 - Y0 - 0.2, X1 - X0 - 0.2, Y1 - Y0 - 0.2, 0.6, Y1 - Y0 - 0.2, 0.6, Y1 - Y0 - 0.2, 0.6, 0.6]);
  const shell = s.build('shopShell'); g.add(shell);
  // drawn in its own frame, the shop stands by the sea at the corner of Coast Rd and Hill Av, on the kerb like the houses
  g.position.copy(W(SX, SY, CURB));
  g.userData.peek = { shell, cut, box:[X0 + SX, X1 + SX, Y0 + SY, Y1 + SY] };
  return g;
}
export function buildShopBox() {
  const p = new Part(); p.box(-0.45, -0.4, 0, 0.9, 0.8, 0.55, 'k');
  p.draw(TOP(-0.45, -0.4, 0.55), [0.45, 0, 0.45, 0.8], 'koline');
  return p.build('shopBox');
}
