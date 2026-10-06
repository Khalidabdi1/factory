import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part } from '../kernel/part';
import { Path } from '../kernel/path';
import { rand } from '../kernel/math';
import { MOTORS, RAIL } from '../layout';
import { carPart } from '../models/motors';
import { WDECK } from '../models/train';
import { trackOn } from './rail';
import { cityLamp, datePalm } from './sahel';

// ---- Sahel Motors: the showroom Car Works sells through, on its terrace at the foot of the hills ----
// After Volkswagen's Autostadt: the cars come from the works by rail and wait in two glass towers, each a lift in a
// ring of bays eight levels high, until one is sold and comes down to the handover bay in the showroom. The towers
// are drawn as their frames, so every car in them can be seen; their floors' edges are lit after dark.
const { sidingY:SY, towers:TOWERS, towerR:R, levels:NL, levelH:LH, hall:[X0, X1, Y0, Y1], bay:BAY, out:OUT, road:[RX0, RX1], walk:WALK } = MOTORS;
export const SIDING = new Path([[400, SY], [630, SY]]);
export const TOP_Z = (NL + 1) * LH;
// the eight corners of an octagon with its flat sides facing the compass points (apothem a)
const oct = (cx: number, cy: number, a: number, z = 0) => Array.from({ length:8 }, (_, j) => {
  const r = a / Math.cos(Math.PI / 8), f = Math.PI / 8 + j * Math.PI / 4; return [cx + r * Math.cos(f), cy + r * Math.sin(f), z]; });
// a thin band along the line a→b, set in from it toward (cx, cy) (a lamp line, a parapet)
function band(p: Part, a: number[], b: number[], cx: number, cy: number, inset: number, z: number, h: number, tone: string, lines = true) {
  const m = [(a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy], l = Math.hypot(m[0], m[1]), nx = -m[0] / l * inset, ny = -m[1] / l * inset;
  p.extrude([[a[0], a[1], z], [b[0], b[1], z], [b[0] + nx, b[1] + ny, z], [a[0] + nx, a[1] + ny, z]], [0, 0, h], tone, { seams:false, lines });
}
// where a car stands in a tower's bay k on level L (front out at the glass, facing out), and its lift's middle
export const bayDir = (k: number) => k * Math.PI / 4;
export const bayFront = (t: number, k: number) => { const [cx, cy] = TOWERS[t], a = bayDir(k); return [cx + Math.cos(a) * 7.3, cy + Math.sin(a) * 7.3]; };
export const levelZ = (L: number) => L * LH;

// ---- one car tower: plinth, corner columns, the lift's guides, eight floors of bays, the crown with the name ----
function tower(p: Part, t: number) {
  const [cx, cy] = TOWERS[t], O = (a: number, z: number) => oct(cx, cy, a, z), top = TOP_Z;
  p.extrude(O(R + 0.7, 0), [0, 0, 0.05], 'n');
  for (const [x, y] of O(R, 0)) p.box(x - 0.18, y - 0.18, 0.05, 0.36, 0.36, top - 0.05, 'n');
  for (const k of [1, 3, 5, 7]) { const x = cx + 2.75 * Math.cos(k * Math.PI / 4), y = cy + 2.75 * Math.sin(k * Math.PI / 4); p.box(x - 0.12, y - 0.12, 0.05, 0.24, 0.24, top + 0.9, 'k'); }
  for (let L = 1; L <= NL; L++) {
    const z = levelZ(L), I = O(2.85, z - 0.24), Q = O(R, z - 0.24);
    for (let j = 0; j < 8; j++) { const k = (j + 1) % 8; p.extrude([I[j], I[k], Q[k], Q[j]], [0, 0, 0.24], 'n', { seams:false }); }
    for (let j = 0; j < 8; j++) {
      const a = Q[j], b = Q[(j + 1) % 8];
      band(p, a, b, cx, cy, -0.04, z - 0.34, 0.34, 'l', false);   // the floor's edge, a line of light after dark (no outline, or it would hide it)
      // the glazing between this floor and the next, as its mullions: one at the middle of each face
      const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2; p.seg('line', W(x, y, z), W(x, y, z + LH - 0.24));
    }
    // the bays' wheel stops, a short bar across each bay near the glass
    for (let k = 0; k < 8; k++) { const a = bayDir(k), c = Math.cos(a), s = Math.sin(a), r = 7.6;
      p.seg('detail', W(cx + c * r - s * 0.9, cy + s * r + c * 0.9, z + 0.02), W(cx + c * r + s * 0.9, cy + s * r - c * 0.9, z + 0.02)); }
  }
  // the crown: a roof slab, a lit band round it, the name on the faces the town sees
  p.extrude(O(R + 0.35, top), [0, 0, 0.45], 'n');
  const C = O(R + 0.35, top + 0.45); for (let j = 0; j < 8; j++) band(p, C[j], C[(j + 1) % 8], cx, cy, 0.25, top + 0.45, 1.1, j === 1 || j === 0 || j === 7 ? 'w' : 'n');
  const fw = 2 * (R + 0.35) * Math.tan(Math.PI / 8);
  p.text(FRONT(cx - fw / 2, cy + R + 0.36, top + 1.5), 'SAHEL MOTORS', fw / 2, 0.82, 0.5, 'ink', 'middle', 0.03);
  p.text(SIDE(cx + R + 0.36, cy + fw / 2, top + 1.5), `TOWER ${'AB'[t]}`, fw / 2, 0.82, 0.5, 'ink', 'middle', 0.03);
  // the gate the cars come in by and go out by, on the south face: a portal, its sign, lamps either side
  const gy = cy + R + 0.4;
  for (const dx of [-2.3, 2.1]) p.box(cx + dx, gy - 0.2, 0.05, 0.2, 0.4, 3.0, 'k');
  p.box(cx - 2.3, gy - 0.2, 3.0, 4.6, 0.4, 0.7, 'k').fill2(FRONT(cx - 2.0, gy + 0.21, 2.95), 0, 0.12, 4.0, 0.42, 'window', 0.02);
  p.text(FRONT(cx - 2.0, gy + 0.21, 2.95), `${'AB'[t]} · DELIVERY`, 2.0, 0.42, 0.3, 'paint', 'middle', 0.04);
  for (const dx of [-2.6, 2.6]) p.box(cx + dx - 0.1, gy + 0.1, 2.2, 0.2, 0.2, 0.3, 'l');
  // the ground floor's checker of stop lines, and the turntable ring the lift sits in
  p.draw(TOP(0, 0, 0.06), [cx - 1.6, cy + 2.8, cx + 1.6, cy + 2.8], 'line', 0.01);
  const ring: number[] = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2; ring.push(cx + 2.65 * Math.cos(a), cy + 2.65 * Math.sin(a), cx + 2.65 * Math.cos(b), cy + 2.65 * Math.sin(b)); }
  p.draw(TOP(0, 0, 0.06), ring, 'line', 0.01);
}

// ---- the showroom: a long glass hall under a roof that lifts toward the town ----
// Its north and west walls are solid, its south and east all glass (drawn as mullions, so the floor shows through);
// the roof is one plane, highest over the entrance, reaching out over the drive. In section the roof goes and the
// walls are cut low: the handover bay with its dais, the lounge and coffee bar, the cars on show (two of them turning),
// the sales desks, reception and the offices on the mezzanine.
export const RX = [570, 632], RY = [-48, -11];
export const roofZ = (x: number, y: number) => 8 + 3 * (x - RX[0]) / (RX[1] - RX[0]) + 2 * (y - RY[0]) / (RY[1] - RY[0]);
// the furniture the people use: desks (the consultant's chair north of it, two for customers south), the lounge's
// seats, the handover lounge, reception, the turntables, the cars on show and the places to stand and look at them
export const DESKS = [594.5, 603.5, 612.5, 621.5].map(x => ({ x, consultant:null as any, with:null as any, staff:{ at:[x, -41.0], h:Math.PI / 2, z:0.48, by:null as any }, chairs:[-0.55, 0.55].map(dx => ({ at:[x + dx, -37.9], h:-Math.PI / 2, z:0.48, by:null as any })) }));
export const LOUNGE = [[574.2, -43.4, 0], [574.2, -41.6, 0], [574.2, -39.8, 0], [578.6, -36.2, -Math.PI / 2], [580.4, -36.2, -Math.PI / 2]].map(([x, y, h]) => ({ at:[x, y], h, z:0.45, by:null as any }));
export const WAITING = [[574.6, -31.6], [576.4, -31.6], [583.6, -31.6]].map(([x, y]) => ({ at:[x, y], h:Math.PI / 2, z:0.48, by:null as any }));
export const RECEPTION = { at:[622, -21.9], h:Math.PI / 2, z:0.48, by:null as any };
export const TURNTABLES = [[596, -23], [614, -23]];
export const SHOWN: [number, number, number, string][] = [[590.5, -31.5, 0.3, 'k'], [608, -31.5, Math.PI - 0.3, 'n'], [617, -31.5, 0.3, 'n']];
export const AISLE = -27.4, DOOR = [X1, MOTORS.door] as number[], WEST_DOOR = [X0, -20] as number[];
export const HANDOVER = { rear:[BAY, -24], front:[BAY, -19.5], door:[BAY - 2, BAY + 2] };

function showroom() {
  const g = new THREE.Group(); g.name = 'showroom';
  const zr = roofZ, MZ = 4.4;
  // ---- always there: the floor, everything on it, the mezzanine ----
  const f = new Part(), G = TOP(0, 0, 0.04);
  f.box(X0, Y0, 0, X1 - X0, Y1 - Y0, 0.04, 'l');   // a pale floor by day, lit from above after dark (it glows through the glass)
  const tiles: number[] = []; for (let x = X0 + 2; x < X1; x += 2) tiles.push(x, Y0, x, Y1); for (let y = Y0 + 2; y < Y1; y += 2) tiles.push(X0, y, X1, y);
  f.draw(G, tiles, 'detail', 0.005);
  // the handover bay: a glass partition (frames), the dais the sold car stands on, a ring of lamps, its lounge
  for (let y = -34; y <= Y1; y += 2) if (y < -31.2 || y > -28) f.seg('line', W(586, y, 0.04), W(586, y, 3.2));
  f.seg('line', W(586, -34, 3.2), W(586, Y1, 3.2)).seg('line', W(X0, -34, 3.2), W(586, -34, 3.2));
  for (let x = X0; x <= 586; x += 2) f.seg('line', W(x, -34, 0.04), W(x, -34, 3.2));
  f.cylZ(HANDOVER.rear[0], -21.75, 0.04, 3.1, 0.08, 24, 'n');
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; f.box(BAY + 3.4 * Math.cos(a) - 0.08, -21.75 + 3.4 * Math.sin(a) - 0.08, 0.04, 0.16, 0.16, 0.06, 'l'); }
  f.text(FRONT(X0 + 0.5, -33.9, 3.0), 'HANDOVER', 0, 0.2, 0.42, 'paint', 'start', 0.02);
  for (const s of WAITING) f.box(s.at[0] - 0.4, s.at[1] - 0.35, 0.04, 0.8, 0.7, 0.44, 'k').box(s.at[0] - 0.4, s.at[1] - 0.45, 0.48, 0.8, 0.12, 0.5, 'k');
  // the lounge: a long sofa against the west wall, two chairs, a low table, the coffee bar and a screen on the wall
  f.box(X0 + 1.0, -44.4, 0.04, 1.0, 5.6, 0.42, 'k').box(X0 + 0.6, -44.4, 0.04, 0.4, 5.6, 0.9, 'k');
  for (const s of LOUNGE.slice(3)) f.box(s.at[0] - 0.4, s.at[1] - 0.4, 0.04, 0.8, 0.8, 0.42, 'k').box(s.at[0] - 0.4, s.at[1] + 0.3, 0.04, 0.8, 0.14, 0.85, 'k');
  f.box(576.6, -42.0, 0.04, 2.6, 1.2, 0.38, 'n');
  f.box(578.5, -45.8, 0.04, 6.6, 0.9, 1.05, 'n').box(578.5, -45.8, 1.05, 6.6, 0.9, 0.06, 'k').box(583.4, -45.6, 1.11, 0.6, 0.5, 0.45, 'k').box(580.0, -45.6, 1.11, 0.3, 0.3, 0.25, 'n');
  f.fill2(FRONT(579, -45.95, 3.4), 0, 0, 3.6, 1.6, 'window', 0.01).rect2(FRONT(579, -45.95, 3.4), 0, 0, 3.6, 1.6, 'line', 0.015);
  // reception, by the door: a curved front (in three straight pieces), a screen, the receptionist's chair behind it
  f.box(619.6, -21.1, 0.04, 4.8, 0.7, 1.05, 'n').box(619.6, -21.1, 1.09, 4.8, 0.7, 0.05, 'k').box(621.6, -21.0, 1.14, 0.8, 0.08, 0.5, 'w');
  f.box(RECEPTION.at[0] - 0.35, RECEPTION.at[1] - 0.35, 0.04, 0.7, 0.7, 0.44, 'k');
  f.text(FRONT(619.6, -20.39, 1.0), 'WELCOME · أهلاً', 2.4, 0.5, 0.28, 'paint', 'middle', 0.015);
  // the sales desks: a desk, a screen on it, a chair either side
  for (const d of DESKS) {
    f.box(d.x - 0.95, -40.1, 0.04, 1.9, 0.95, 0.74, 'n').box(d.x - 0.95, -40.1, 0.78, 1.9, 0.95, 0.04, 'k').box(d.x - 0.3, -40.0, 0.82, 0.6, 0.06, 0.42, 'w');
    for (const s of [d.staff, ...d.chairs]) { const back = s.h > 0 ? -0.45 : 0.31;
      f.box(s.at[0] - 0.3, s.at[1] - 0.3, 0.04, 0.6, 0.6, 0.44, 'k').box(s.at[0] - 0.3, s.at[1] + back, 0.48, 0.6, 0.14, 0.5, 'k'); }
  }
  // the cars on show that stand still, and the turntables (their cars are the simulation's, turning)
  for (const [x, y, h, t] of SHOWN) { const c = Math.cos(h), s = Math.sin(h); f.put(carPart(t), x + c * 2.25, y + s * 2.25, h, 0.04); f.cylZ(x, y, 0.04, 2.9, 0.03, 20, 'k'); }
  for (const [x, y] of TURNTABLES) f.text(TOP(x - 2, y + 3.6, 0.05), 'PETREL GT · GULL', 2, 0, 0.3, 'paint', 'middle', 0.01);
  // pendant lights over the floor, which light the glass up after dark
  for (let x = 592; x < X1 - 2; x += 6) for (const y of [-37, -29, -21]) { const z = zr(x, y) - 2.2; f.seg('line', W(x + 0.6, y, z + 0.1), W(x + 0.6, y, zr(x, y))).box(x, y - 0.15, z, 1.2, 0.3, 0.1, 'l'); }
  // round columns up to the roof, potted palms in the corners
  for (const [x, y] of [[599, -34.6], [624, -34.6], [589, -18.4], [605, -18.4]]) f.cylZ(x, y, 0.04, 0.22, zr(x, y) - 0.04, 10, 'n');
  for (const [x, y] of [[626.6, -44.6], [587.4, -17.2], [626.6, -17.4]]) { f.cylZ(x, y, 0.04, 0.45, 0.6, 10, 'k'); datePalm(f, x, y, 0.42, 0.64); }
  // the mezzanine: a deck along the north wall, a glass balustrade, offices behind glass, the stair up from the floor
  f.box(588, Y0, MZ - 0.3, X1 - 588, 3.6, 0.3, 'n');
  for (let x = 588; x <= X1; x += 1.5) f.seg('line', W(x, Y0 + 3.6, MZ), W(x, Y0 + 3.6, MZ + 1.05));
  f.seg('line', W(588, Y0 + 3.6, MZ + 1.05), W(X1, Y0 + 3.6, MZ + 1.05));
  for (const x of [598, 608, 618]) { f.seg('line', W(x, Y0, MZ), W(x, Y0 + 3.0, MZ)).seg('line', W(x, Y0 + 3.0, MZ), W(x, Y0 + 3.0, MZ + 2.6)); f.box(x - 6.5, Y0 + 0.5, MZ, 1.6, 0.8, 0.74, 'n').box(x - 6.2, Y0 + 0.6, MZ + 0.74, 0.6, 0.06, 0.4, 'w'); }
  for (let k = 0; k < 15; k++) f.box(625.4, -34.5 - k * 0.55, 0.04, 1.6, 0.55, 0.3 * (k + 1) * MZ / 4.8, 'n');
  g.add(f.build('showroomFloor'));

  // ---- the shell: walls, glazing, the roof ----
  const s = new Part(), roof = (x: number, y: number) => W(x, y, zr(x, y));
  s.box(X0, Y0, 0, X1 - X0, 0.35, 7.6, 'n').box(X0, Y0, 0, 0.35, Y1 - Y0, 7.6, 'n');
  // the glass: mullions up to the roof along the south and east faces, a transom at the mezzanine's height
  for (let x = X0 + 0.35; x <= X1 + 1e-6; x += 2.8) if (x < HANDOVER.door[0] - 0.1 || x > HANDOVER.door[1] + 0.1) s.box(x - 0.06, Y1 - 0.06, 0, 0.12, 0.12, zr(x, Y1) - 0.1, 'n');
  for (let y = Y1; y >= Y0 + 0.35 - 1e-6; y -= 2.6) if (Math.abs(y - MOTORS.door) > 1.6) s.box(X1 - 0.06, y - 0.06, 0, 0.12, 0.12, zr(X1, y) - 0.1, 'n');
  s.seg('line', W(X0, Y1, MZ + 0.4), W(X1, Y1, MZ + 0.4)).seg('line', W(X1, Y1, MZ + 0.4), W(X1, Y0, MZ + 0.4));
  // the handover bay's door (a sliding glass panel, drawn open) and the entrance's revolving door under its canopy
  s.box(HANDOVER.door[0] - 0.15, Y1 - 0.15, 0, 0.3, 0.3, 3.8, 'k').box(HANDOVER.door[1] - 0.15, Y1 - 0.15, 0, 0.3, 0.3, 3.8, 'k').box(HANDOVER.door[0] - 0.15, Y1 - 0.15, 3.8, 4.3, 0.3, 0.4, 'k');
  s.cylZ(X1, MOTORS.door, 0, 1.4, 2.6, 16, 'g').cylZ(X1, MOTORS.door, 2.6, 1.5, 0.2, 16, 'n');
  // the roof: a plane over it all, its edge a deep band lit underneath along the two faces the town sees
  const [a, b] = RX, [c, d] = RY;
  s.poly('deck', [roof(a, c), roof(b, c), roof(b, d), roof(a, d)]);
  const edge = (x0: number, y0: number, x1: number, y1: number) => { s.poly('body', [roof(x0, y0), roof(x1, y1), W(x1, y1, zr(x1, y1) - 0.7), W(x0, y0, zr(x0, y0) - 0.7)]);
    s.seg('line', roof(x0, y0), roof(x1, y1)).seg('line', W(x0, y0, zr(x0, y0) - 0.7), W(x1, y1, zr(x1, y1) - 0.7)); };
  edge(a, d, b, d); edge(b, d, b, c); s.seg('line', roof(a, c), roof(b, c)).seg('line', roof(a, c), roof(a, d));
  s.seg('line', roof(a, d), W(a, d, zr(a, d) - 0.7)).seg('line', roof(b, c), W(b, c, zr(b, c) - 0.7));
  for (let x = a + 1; x < b - 0.5; x += 3) s.box(x, d - 0.25, zr(x, d) - 0.95, 2, 0.12, 0.12, 'l');
  for (let y = d - 1; y > c + 0.5; y -= 3) s.box(b - 0.25, y - 2, zr(b, y) - 0.95, 0.12, 2, 0.12, 'l');
  // the name along the glass, on a fascia at the mezzanine's height
  s.box(588, Y1 - 0.08, 5.3, 36, 0.16, 1.0, 'n');
  s.text(FRONT(588, Y1 + 0.09, 6.2), 'SAHEL MOTORS', 18, 0.78, 0.62, 'ink', 'middle', 0.02);
  s.box(X1 - 0.08, -44, 5.3, 0.16, 16, 1.0, 'n').text(SIDE(X1 + 0.09, -28, 6.2), 'SHOWROOM · معرض', 8, 0.78, 0.55, 'ink', 'middle', 0.02);
  // panels on the roof: a field of solar cells over the north half
  for (let x = a + 3; x < b - 4; x += 4.2) for (let y = c + 3; y < -30; y += 3.4) { const M = plane([x, y, zr(x, y) + 0.06], [3.6, 0, 3 * 3.6 / (b - a)], [0, 2.8, 2 * 2.8 / (d - c)]);
    s.fill2(M, 0, 0, 1, 1, 'glass', 0.01).rect2(M, 0, 0, 1, 1, 'line', 0.012); }
  const shell = s.build('showroomShell'); g.add(shell);

  // ---- in section: walls cut low and hatched, stubs of the glazing, the roof's edge in outline ----
  const t = new Part(), hz = 1.2, H = TOP(0, 0, hz);
  t.box(X0, Y0, 0, X1 - X0, 0.35, hz, 'n').box(X0, Y0, 0, 0.35, Y1 - Y0, hz, 'n');
  const hs: number[] = []; for (let u = 0.3; u < X1 - X0; u += 0.7) hs.push(X0 + u, Y0, X0 + Math.min(X1 - X0, u + 0.3), Y0 + 0.35);
  for (let v = 0.3; v < Y1 - Y0; v += 0.7) hs.push(X0, Y0 + v, X0 + 0.35, Y0 + Math.min(Y1 - Y0, v + 0.3));
  t.draw(H, hs, 'detail', 0.01);
  for (let x = X0 + 0.35; x <= X1 + 1e-6; x += 2.8) if (x < HANDOVER.door[0] - 0.1 || x > HANDOVER.door[1] + 0.1) t.box(x - 0.06, Y1 - 0.06, 0, 0.12, 0.12, hz, 'n');
  for (let y = Y1; y >= Y0 + 0.35 - 1e-6; y -= 2.6) if (Math.abs(y - MOTORS.door) > 1.6) t.box(X1 - 0.06, y - 0.06, 0, 0.12, 0.12, hz, 'n');
  for (const [x0, y0, x1, y1] of [[a, c, b, c], [b, c, b, d], [b, d, a, d], [a, d, a, c]]) for (let k = 0; k < 1; k += 0.08) {
    const u = Math.min(1, k + 0.04); t.seg('detail', roof(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k), roof(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)); }
  const cut = t.build('showroomCut'); cut.visible = false; g.add(cut);
  g.userData.peek = { shell, cut, box:[X0, X1, Y0, Y1], near:true, z:[0, 13], hides:() => false };
  return g;
}

// ---- the test track: an oval with kerbs on its bends, a slalom in the infield, a gantry over the line ----
const [TX0, TX1, TY0, TY1] = MOTORS.track, TCY = (TY0 + TY1) / 2, TR = 11.5, TXA = TX0 + 14.5, TXB = TX1 - 14.5;
// the way round, clockwise on the plan from the start line on the south straight (heading west)
export const TRACK = (() => { const pts: number[][] = [];
  pts.push([TXB + 2, TCY + TR]); for (let i = 0; i <= 24; i++) { const a = Math.PI / 2 + i / 24 * Math.PI; pts.push([TXA + Math.cos(a) * TR, TCY + Math.sin(a) * TR]); }
  for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + i / 24 * Math.PI; pts.push([TXB + Math.cos(a) * TR, TCY + Math.sin(a) * TR]); }
  return new Path(pts, 1, true); })();
export const PIT = { car:[TXB, TCY + TR], door:[TXB + 2.2, TCY + TR + 1.5] };
function testTrack(p: Part) {
  const G = TOP(0, 0, 0.03), L = TRACK.length, n = Math.ceil(L / 1.2);
  let prev: number[][] | null = null;
  for (let i = 0; i <= n; i++) {
    const a = TRACK.at(i / n * L), c = Math.cos(a.h), s = Math.sin(a.h), q = [[a.x + s * 3, a.y - c * 3], [a.x - s * 3, a.y + c * 3]];
    if (prev) { p.poly('road', [W(prev[0][0], prev[0][1], 0.03), W(q[0][0], q[0][1], 0.03), W(q[1][0], q[1][1], 0.03), W(prev[1][0], prev[1][1], 0.03)]);
      p.seg('line', W(prev[0][0], prev[0][1], 0.04), W(q[0][0], q[0][1], 0.04)).seg('line', W(prev[1][0], prev[1][1], 0.04), W(q[1][0], q[1][1], 0.04));
      if (i % 3 === 0) p.seg('detail', W(a.x, a.y, 0.05), W(a.x - c * 1.2, a.y - s * 1.2, 0.05)); }
    prev = q;
  }
  // kerbs round the outside of each bend, two-tone
  for (const [cx, a0] of [[TXA, Math.PI / 2], [TXB, -Math.PI / 2]] as [number, number][]) for (let i = 0; i < 18; i++) {
    const u = a0 + i / 18 * Math.PI, v = a0 + (i + 1) / 18 * Math.PI, P = (a: number, r: number) => W(cx + Math.cos(a) * r, TCY + Math.sin(a) * r, 0.06);
    p.poly(i % 2 ? 'body' : 'kob', [P(u, TR + 3), P(v, TR + 3), P(v, TR + 3.8), P(u, TR + 3.8)]); }
  // the infield: grass, a slalom of cones, the maker's mark
  p.fill2(G, TXA, TCY - TR + 3, TXB - TXA, 2 * TR - 6, 'grass', 0.01);
  for (const [cx] of [[TXA], [TXB]]) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 16; i++) { const a = (cx === TXA ? Math.PI / 2 : -Math.PI / 2) + i / 16 * Math.PI; pts.push(W(cx + Math.cos(a) * (TR - 3), TCY + Math.sin(a) * (TR - 3), 0.04)); }
    p.poly('grass', pts); }
  for (let k = 0; k < 6; k++) p.cylZ(TXA + 2 + k * 3.6, TCY + (k % 2 ? 1.4 : -1.4), 0.03, 0.22, 0.6, 6, 'k');
  p.text(TOP(TXA, TCY + 4.2, 0.05), 'SAHEL MOTORS · TEST TRACK', (TXB - TXA) / 2, 0, 0.8, 'paint', 'middle', 0.01);
  // the line and the gantry over it, its timing board lit
  const lx = TXB + 4; for (let k = 0; k < 6; k++) p.fill2(G, lx, TCY + TR - 3 + k, 0.5, 0.5, k % 2 ? 'kob' : 'body', 0.012);
  for (const y of [TCY + TR - 3.4, TCY + TR + 3.4]) p.box(lx - 0.15, y - 0.15, 0, 0.3, 0.3, 5.2, 'k');
  p.box(lx - 0.25, TCY + TR - 3.4, 5.2, 0.5, 6.8, 0.8, 'k').fill2(SIDE(lx + 0.26, TCY + TR + 3.0, 5.9), 0, 0, 6.0, 0.6, 'window', 0.02);
  p.text(SIDE(lx + 0.26, TCY + TR + 3.0, 5.9), 'LAP · 0:42.6', 3.0, 0.45, 0.36, 'paint', 'middle', 0.03);
  // a low grandstand by the bend at the east end, a fence round the outside
  for (let k = 0; k < 4; k++) p.box(TX1 - 2.6 + k * 0.6, TCY - 9, 0, 0.6, 7, 0.45 * (k + 1), 'n');
  const fence: number[] = []; for (const [cx, a0] of [[TXA, Math.PI / 2], [TXB, -Math.PI / 2]] as [number, number][]) for (let i = 0; i < 18; i++) {
    const u = a0 + i / 18 * Math.PI, v = a0 + (i + 1) / 18 * Math.PI; fence.push(cx + Math.cos(u) * (TR + 4.6), TCY + Math.sin(u) * (TR + 4.6), cx + Math.cos(v) * (TR + 4.6), TCY + Math.sin(v) * (TR + 4.6)); }
  p.draw(TOP(0, 0, 1.0), fence, 'line', 0);
}

// ---- the level crossing where Najd Av comes up over the main line ----
// its posts: the arms each carries ([length, heading]), and whether it has the lamps and crossbuck
export const CROSSING = { x:(RX0 + RX1) / 2, posts:[{ x:RX0 - 0.2, y:-5.2, arms:[[7.4, 0], [3.0, Math.PI]], lamps:true }, { x:RX1 + 0.2, y:2.4, arms:[[7.0, Math.PI]], lamps:true },
  { x:RX0 - 0.2, y:2.6, arms:[[3.0, Math.PI]], lamps:false }] };
function crossing(p: Part) {
  const [y0, y1] = MOTORS.cross, G = TOP(0, 0, 0.17);
  // the deck over the rails: panels between and beside them, the flangeways as lines
  p.box(RX0 - 3.5, RAIL.y - 1.8, 0, RX1 - RX0 + 3.5, 3.6, 0.16, 'n');
  const panels: number[] = []; for (let x = RX0 - 3.5; x < RX1; x += 1.8) panels.push(x, RAIL.y - 1.8, x, RAIL.y + 1.8);
  p.draw(G, panels, 'detail', 0.005).draw(G, [RX0 - 3.5, RAIL.y - 0.78, RX1, RAIL.y - 0.78, RX0 - 3.5, RAIL.y + 0.78, RX1, RAIL.y + 0.78], 'line', 0.01);
  // the access road up to the terrace, its markings, the stop lines either side
  const R0 = TOP(0, 0, 0.02);
  p.fill2(R0, RX0, -20, RX1 - RX0, RAIL.y - 1.8 + 20, 'road', 0.004).fill2(R0, RX0, RAIL.y + 1.8, RX1 - RX0, y1 - RAIL.y - 1.8, 'road', 0.004);
  const mid: number[] = []; for (let y = -19; y < -5; y += 3) mid.push((RX0 + RX1) / 2, y, (RX0 + RX1) / 2, y + 1.5);
  p.draw(R0, mid, 'line', 0.01).draw(R0, [RX0 + 0.3, y0 - 1.0, (RX0 + RX1) / 2, y0 - 1.0, (RX0 + RX1) / 2, y1 + 0.6, RX1 - 0.3, y1 + 0.6], 'line', 0.01);
  p.text(TOP(RX0 + 3.5, y0 - 4.5, 0.03), 'X', 0, 0, 2.2, 'paint', 'middle', 0.01);
  // the footway beside it, up from the city to the showroom's door
  p.fill2(R0, WALK - 1.1, -20, 2.4, 22, 'deck', 0.006);
  // the barriers' posts, their lamps and crossbucks (the arms are the simulation's, to lower)
  for (const { x, y, lamps } of CROSSING.posts) {
    p.box(x - 0.25, y - 0.25, 0, 0.5, 0.5, 1.3, 'k');
    if (!lamps) continue;
    p.box(x - 0.08, y - 0.08, 1.3, 0.16, 0.16, 2.6, 'n');
    const C = FRONT(x - 0.9, y + 0.1, 3.9); p.draw(C, [0, 0, 1.8, 0.7, 0, 0.7, 1.8, 0], 'koline', 0.01);
    p.box(x - 0.6, y + 0.1, 2.5, 1.2, 0.12, 0.42, 'k');
  }
  // a fence along the line either side of the crossing, so the only way over is the crossing
  for (const y of [RAIL.y - 2.6, RAIL.y + 2.6]) for (const [xa, xb] of [[RX0 - 14, RX0 - 3.6], [RX1 + 0.4, RX1 + 14]]) {
    for (let x = xa; x <= xb + 1e-6; x += 2.1) p.seg('line', W(x, y, 0), W(x, y, 1.1));
    p.seg('line', W(xa, y, 1.1), W(xb, y, 1.1)).seg('line', W(xa, y, 0.6), W(xb, y, 0.6)); }
}

// ---- the whole site but what moves: siding, dock, drive and apron, towers, court, test track, crossing, car park ----
export function buildMotorsSite() {
  const p = new Part(), G = TOP(0, 0, 0.02);
  // the siding, from the dock at Car Works to its buffer stop short of the crossing
  trackOn(p, SIDING, MOTORS.dock - 1 - 400, MOTORS.sidingX[1] - 400, MOTORS.dock - 400 - 8, MOTORS.sidingX[1] - 400);
  // the dock at Car Works: a concrete ramp up to the carriers' decks, low walls along it, a lamp at its top
  const D = MOTORS.dock;
  p.extrude([[D - 7, SY - 1.4, 0], [D, SY - 1.4, 0], [D, SY - 1.4, WDECK]], [0, 2.8, 0], 'n');
  for (let u = 0.6; u < 7; u += 0.6) p.seg('detail', W(D - 7 + u, SY - 1.4, WDECK * u / 7 + 0.01), W(D - 7 + u, SY + 1.4, WDECK * u / 7 + 0.01));
  for (const y of [SY - 1.55, SY + 1.4]) p.box(D - 7, y, 0, 7, 0.15, WDECK + 0.5, 'k');
  p.fill2(G, 403, -9.6, D - 403, 5.0, 'road', 0.004).text(TOP(404.5, SY + 0.8, 0.03), 'SAHEL MOTORS', 0, 0, 0.55, 'paint', 'start', 0.01);
  // the buffer stop at the far end: a beam on two posts, buffers, its lamp
  const BX = MOTORS.sidingX[1];
  for (const y of [SY - 0.9, SY + 0.9]) p.box(BX - 0.2, y - 0.2, 0, 0.4, 0.4, 1.2, 'k');
  p.box(BX - 0.3, SY - 1.3, 1.0, 0.6, 2.6, 0.5, 'k').box(BX - 0.25, SY - 0.15, 1.5, 0.3, 0.3, 0.3, 'l');
  for (const y of [SY - 0.85, SY + 0.85]) p.cylY(BX - 0.8, y - 0.15, 1.25, 0.18, 0.3, 8, 'n');
  // the drive along the front and the apron before the towers: asphalt, lane lines, arrows, the walkway's zebra
  p.fill2(G, 509, -24, 556 - 509, 24 - 8.3, 'road', 0.004).fill2(G, 556, -16.4, RX0 - 556, 16.4 - 8.3, 'road', 0.004);
  const lanes: number[] = []; for (let x = 556; x < RX0 - 2; x += 3) lanes.push(x, (OUT + MOTORS.in) / 2, x + 1.6, (OUT + MOTORS.in) / 2);
  p.draw(G, lanes, 'line', 0.01);
  for (let x = 512; x < 552; x += 1.1) p.fill2(G, x, -18.9, 0.55, 1.4, 'deck', 0.008);
  for (const [x, y] of [[565, OUT], [600, OUT]]) p.draw(G, [x - 1.5, y, x + 1.5, y, x + 1.5, y, x + 0.6, y - 0.6, x + 1.5, y, x + 0.6, y + 0.6], 'line', 0.012);
  p.text(G, 'DELIVERIES', 530, -10.5, 1.0, 'paint', 'middle', 0.01);
  // the towers, and the glass bridge between their top floors
  TOWERS.forEach((_, t) => tower(p, t));
  { const [ax, ay] = TOWERS[0], bx = TOWERS[1][0], z = levelZ(NL), x0 = ax + R, x1 = bx - R;
    p.box(x0, ay - 1.6, z - 0.24, x1 - x0, 3.2, 0.24, 'n').box(x0, ay - 1.6, z + 2.6, x1 - x0, 3.2, 0.2, 'n');
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 4) for (const y of [ay - 1.6, ay + 1.6]) p.seg('line', W(x, y, z), W(x, y, z + 2.6)); }
  // the court between the towers and the showroom: lawn, a long pool with its jets, palms, benches
  p.fill2(G, 556.5, -45, 14, 27, 'grass', 0.006).box(560, -40, 0, 7, 18, 0.35, 'n').fill2(TOP(560.3, -39.7, 0.36), 0, 0, 6.4, 17.4, 'glass', 0.005);
  for (let y = -38; y < -23; y += 3) p.seg('line', W(563.5, y, 0.36), W(563.5, y, 1.6));
  for (const [x, y] of [[558, -42], [569, -42], [558, -30], [569, -30], [558, -19.6]]) datePalm(p, x, y, 0.95, 0.02);
  for (const y of [-36, -26]) { p.box(557.6, y, 0, 0.8, 2.4, 0.45, 'k'); p.box(568.6, y, 0, 0.8, 2.4, 0.45, 'k'); }
  // the walk from the showroom's west door along the front of the towers to the test track
  p.fill2(G, 506, -19.2, 66, 2.4, 'deck', 0.007);
  // the test track
  testTrack(p);
  // the crossing, the access road, the footway, and the car park east of the road with customers' cars in it
  crossing(p);
  const PK = [649, 666, -46, -12];
  p.fill2(G, PK[0], PK[2], PK[1] - PK[0], PK[3] - PK[2], 'road', 0.004).fill2(G, RX1, -16, PK[0] - RX1, 4, 'road', 0.004);
  const bays: number[] = [];
  for (let y = PK[2] + 1; y <= PK[3] - 4; y += 2.7) { bays.push(PK[0], y, PK[0] + 5.2, y, PK[1] - 5.2, y, PK[1], y); }
  p.draw(G, bays, 'line', 0.01);
  for (let y = PK[2] + 1, i = 0; y < PK[3] - 6.4; y += 2.7, i++) for (const side of [0, 1]) {
    if (rand(0, 1) < 0.35) continue;
    const t = rand(0, 1) < 0.45 ? 'k' : 'n', yy = y + 1.35;
    if (side === 0) p.put(carPart(t), PK[0] + 4.9, yy, 0, 0); else p.put(carPart(t), PK[1] - 4.9, yy, Math.PI, 0);
  }
  // the sign by the crossing, which the city sees: a tall pylon, the name, the mark
  const SX = RX1 + 3.5, SYg = -4.5;
  p.box(SX - 1.3, SYg - 0.35, 0, 2.6, 0.7, 14, 'k').fill2(FRONT(SX - 1.1, SYg + 0.36, 13.6), 0, 0, 2.2, 9.4, 'window', 0.02);
  p.text(FRONT(SX - 1.1, SYg + 0.36, 13.6), 'SAHEL', 1.1, 1.4, 0.62, 'paint', 'middle', 0.03).text(FRONT(SX - 1.1, SYg + 0.36, 13.6), 'MOTORS', 1.1, 2.4, 0.56, 'paint', 'middle', 0.03);
  p.text(FRONT(SX - 1.1, SYg + 0.36, 13.6), 'سهل', 1.1, 4.4, 0.9, 'paint', 'middle', 0.03);
  { const M = FRONT(SX - 1.1, SYg + 0.36, 13.6), ring: number[] = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, b = (i + 1) / 20 * Math.PI * 2; ring.push(1.1 + 0.75 * Math.cos(a), 7.0 + 0.75 * Math.sin(a), 1.1 + 0.75 * Math.cos(b), 7.0 + 0.75 * Math.sin(b)); }
    p.draw(M, ring, 'line', 0.03); }
  // flags along the plaza by the road, lamps along the drive and the access road, palms on the plaza
  for (let y = -44; y <= -30; y += 3.5) { p.seg('line', W(RX0 - 1.0, y, 0), W(RX0 - 1.0, y, 8.5)); p.fill2(FRONT(RX0 - 1.0, y + 0.01, 8.4), 0, 0, 1.9, 1.1, 'kob', 0.01).rect2(FRONT(RX0 - 1.0, y + 0.01, 8.4), 0, 0, 1.9, 1.1, 'line', 0.012); }
  for (const x of [580, 600, 620]) cityLamp(p, x, -8.6, false, 0, -1, 0.02);
  for (const y of [-18, -9]) cityLamp(p, RX1 + 0.6, y, false, -1, 0, 0.02);
  for (const [x, y] of [[631, -46.5], [656, -8.6], [664, -8.6]]) datePalm(p, x, y, 0.9, 0.02);
  const g = p.build('motorsSite');
  return { site:g, showroom:showroom() };
}
