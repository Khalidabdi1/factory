import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { rand } from '../kernel/math';
import { CURB } from '../layout';
import { beam } from '../models/works';
import { crown, ring, tree, yaw } from './ground';
import { cityLamp, datePalm, parkedCar } from './sahel';

// Sahel's buildings. The skyline climbs towards the hills: the towers of the Financial District stand north of the
// boulevard; south of it buildings keep low along the streets and step up behind, so the busway, the metro and the
// showroom up on its terrace are never hidden behind them. All of it is one part; a click finds the building under the
// pointer from BUILDINGS.
export type Building = { id: string, kind: string, box: [number, number, number, number, number], rows: [string, string][], status?: string };
export const BUILDINGS: Building[] = [];
type M4 = THREE.Matrix4;
const Z = CURB;

// A curtain wall over one face (w wide, h high, drawn through M from its top left): glass, a mullion every bay, a line at
// every floor, and some bays lit after dark
function curtain(p: Part, M: M4, w: number, h: number, { bay = 1.8, floor = 3.8, lit = 0.32, glass = true, skip = 0 } = {}) {
  if (glass) p.fill2(M, 0, skip, w, h - skip, 'glass', 0.03);
  const nb = Math.max(1, Math.round(w / bay)), bw = w / nb, nf = Math.floor((h - skip) / floor), segs: number[] = [];
  for (let i = 1; i < nb; i++) segs.push(i * bw, skip, i * bw, h);
  for (let f = 1; f <= nf; f++) segs.push(0, skip + f * floor, w, skip + f * floor);
  p.draw(M, segs, 'detail', 0.04);
  for (let f = 0; f < nf; f++) for (let i = 0; i < nb; i++) if (rand(0, 1) < lit) p.fill2(M, i * bw + 0.15, skip + f * floor + 0.45, bw - 0.3, floor - 0.95, 'window', 0.035);
}
// punched windows in a wall: a grid, some lit
function windows(p: Part, M: M4, w: number, h: number, { col = 3, floor = 3.2, ww = 1.4, wh = 1.5, top = 1.0, lit = 0.4 } = {}) {
  const nc = Math.floor(w / col), off = (w - nc * col) / 2 + (col - ww) / 2;
  for (let v = top; v + wh < h - 0.4; v += floor) for (let i = 0; i < nc; i++) { const u = off + i * col;
    p.fill2(M, u, v, ww, wh, rand(0, 1) < lit ? 'window' : 'glass', 0.03).rect2(M, u, v, ww, wh, 'line', 0.035); }
}
// the two faces the camera sees of a box at (x, y) w × d, from z0 for h: the south face and the east face
const faces = (x: number, y: number, w: number, d: number, z0: number, h: number) =>
  [[FRONT(x, y + d, z0 + h), w], [SIDE(x + w, y + d, z0 + h), d]] as [M4, number][];
// a roof: a parapet line, plant boxes, and maybe an aerial with a warning lamp
function roof(p: Part, x: number, y: number, w: number, d: number, z: number, { plant = true, aerial = 0, heli = false } = {}) {
  p.rect2(TOP(x, y, z), 0.6, 0.6, w - 1.2, d - 1.2, 'detail', 0.03);
  if (plant) { p.box(x + w * 0.2, y + d * 0.25, z, w * 0.3, d * 0.3, 2.2).box(x + w * 0.6, y + d * 0.55, z, w * 0.18, d * 0.2, 1.4); }
  if (aerial) { p.box(x + w * 0.75 - 0.15, y + d * 0.25 - 0.15, z, 0.3, 0.3, aerial).box(x + w * 0.75 - 0.25, y + d * 0.25 - 0.25, z + aerial, 0.5, 0.5, 0.4, 'l'); }
  if (heli) { const cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) * 0.36;
    for (const rr of [r, r - 0.4]) { const q = ring(cx, cy, rr, z + 0.05, 32); for (let i = 0; i < q.length; i += 2) p.seg('line', q[i], q[i + 1]); }
    p.draw(TOP(cx, cy, z), [-1.6, -2.2, -1.6, 2.2, 1.6, -2.2, 1.6, 2.2, -1.6, 0, 1.6, 0], 'line', 0.05); }
}
function add(id: string, kind: string, box: Building['box'], rows: [string, string][], status?: string) { BUILDINGS.push({ id, kind, box, rows, status }); }

// ---- the tower kinds ----
// a glass office tower: body, curtain walls, a crown, roof works
function glassTower(p: Part, x: number, y: number, w: number, d: number, h: number, o: { crown?: string, lit?: number, base?: number, heli?: boolean, bay?: number } = {}) {
  p.box(x, y, Z, w, d, h);
  for (const [M, fw] of faces(x, y, w, d, Z, h)) curtain(p, M, fw, h, { lit:o.lit ?? 0.3, bay:o.bay ?? 1.8, skip:0 });
  if (o.base) { p.box(x - 2, y - 2, Z, w + 4, d + 4, o.base, 'n'); for (const [M, fw] of faces(x - 2, y - 2, w + 4, d + 4, Z, o.base)) p.fill2(M, 0.4, 1.0, fw - 0.8, o.base - 1.3, 'window', 0.03).draw(M, [0, 0.6, fw, 0.6], 'line', 0.04); }
  const top = Z + h;
  if (o.crown === 'slant') { p.extrude([[x, y + d, top], [x, y, top], [x, y, top + d * 0.55]], [w, 0, 0], 'g'); }
  else if (o.crown === 'fins') { for (let u = 1; u < w; u += 3) p.box(x + u, y + d - 0.2, top - 10, 0.3, 1.0, 16); roof(p, x, y, w, d, top, { aerial:8 }); }
  else if (o.crown === 'halo') { p.box(x + 1, y + 1, top, w - 2, d - 2, 4.5, 'g'); p.box(x - 0.4, y - 0.4, top + 4.5, w + 0.8, d + 0.8, 1.2, 'l'); roof(p, x + 1, y + 1, w - 2, d - 2, top + 5.7, { plant:false, heli:o.heli }); }
  else if (o.crown === 'step') { p.box(x + w * 0.15, y + d * 0.15, top, w * 0.7, d * 0.7, 9); for (const [M, fw] of faces(x + w * 0.15, y + d * 0.15, w * 0.7, d * 0.7, top, 9)) curtain(p, M, fw, 9, { lit:0.3 });
    p.box(x + w * 0.3, y + d * 0.3, top + 9, w * 0.4, d * 0.4, 6); roof(p, x + w * 0.3, y + d * 0.3, w * 0.4, d * 0.4, top + 15, { plant:false, aerial:10 }); }
  else roof(p, x, y, w, d, top, { aerial:o.heli ? 0 : 6, heli:o.heli });
}
// Sahel Tower: the landmark. A chamfered square in plan, glass all the way up, its top cut into a crystal that leans
// north-east to a point, lit at night; a glass lobby round its foot.
function sahelTower(p: Part, x: number, y: number, s: number, h: number) {
  const c = 6, at = (u: number, v: number, z: number) => [x + u, y + v, z];
  const plan = [[c, 0], [s - c, 0], [s, c], [s, s - c], [s - c, s], [c, s], [0, s - c], [0, c]];
  p.extrude(plan.map(([u, v]) => at(u, v, Z)), [0, 0, h], 'n');
  // the faces the camera sees: south, south-east (the chamfer), east
  const S = FRONT(x + c, y + s, Z + h), E = SIDE(x + s, y + s - c, Z + h), SE = plane([x + s - c, y + s, Z + h], [Math.SQRT1_2, -Math.SQRT1_2, 0], [0, 0, -1]);
  curtain(p, S, s - 2 * c, h, { bay:1.6, floor:3.9, lit:0.36 }); curtain(p, E, s - 2 * c, h, { bay:1.6, floor:3.9, lit:0.36 }); curtain(p, SE, c * Math.SQRT2, h, { bay:1.4, floor:3.9, lit:0.4 });
  // the crown: a crystal from the top of the shaft to a point 38 m above it, its facets lit
  const top = Z + h, cx = x + s / 2, cy = y + s / 2, pts = plan.map(([u, v]) => W(x + u, y + v, top));
  pts.push(W(cx + 3, cy - 3, top + 16), W(cx + 9, cy - 9, top + 24), W(cx + 7, cy - 7, top + 38), W(cx - 4, cy + 4, top + 12));
  p.geo(new ConvexGeometry(pts), new THREE.Matrix4(), 'l');
  p.seg('line', W(cx + 7, cy - 7, top + 38), W(cx + 7.2, cy - 7.2, top + 47));
  // the lobby: a glass box round the foot, a deep canopy over the door on the boulevard's side
  p.box(x - 4, y - 4, Z, s + 8, s + 8, 10, 'g');
  for (const [M, fw] of faces(x - 4, y - 4, s + 8, s + 8, Z, 10)) { const segs: number[] = []; for (let u = 2; u < fw; u += 2) segs.push(u, 0, u, 10); p.draw(M, segs, 'detail', 0.04).fill2(M, 0, 2.5, fw, 7.5, 'window', 0.035); }
  p.box(x + s / 2 - 8, y - 9, Z + 6, 16, 5, 0.6, 'k');
}
// The arch: a tower whose top opens in an upturned parabola, two horns and a skybridge across the opening near the top
// (after a tower in Riyadh with the same trick)
function archTower(p: Part, x: number, y: number, w: number, d: number, h: number, open: number) {
  const z0 = Z + open, cx = x + w / 2, H = Z + h;
  p.box(x, y, Z, w, d, open);
  for (const [M, fw] of faces(x, y, w, d, Z, open)) curtain(p, M, fw, open, { bay:1.7, lit:0.33 });
  const ow = (z: number) => w / 2 * (1 - 0.32 * ((z - z0) / (H - z0)) ** 2), iw = (z: number) => w / 2 * 0.64 * Math.sqrt(Math.max(0, (z - z0) / (H - z0)));
  for (let z = z0; z < H - 0.01; z += 3.2) { const z1 = Math.min(H, z + 3.2);
    for (const sg of [-1, 1]) p.extrude([[cx + sg * ow(z), y, z], [cx + sg * iw(z), y, z], [cx + sg * iw(z1), y, z1], [cx + sg * ow(z1), y, z1]], [0, d, 0], 'g');
    if (rand(0, 1) < 0.5) for (const sg of [-1, 1]) { const a = cx + sg * ow(z), b = cx + sg * iw(z); p.fill2(FRONT(Math.min(a, b), y + d, z1), 0.4, 0.5, Math.abs(a - b) - 0.8, 2.0, 'window', 0.035); }
  }
  const zb = H - 9, half = iw(zb) + 0.6;
  p.box(cx - half, y + d * 0.25, zb, 2 * half, d * 0.5, 3.4, 'w');
  for (const sg of [-1, 1]) p.box(cx + sg * ow(H) - (sg > 0 ? 1.2 : 0), y + d / 2 - 0.3, H, 1.2, 0.6, 3, 'l');   // a lamp on each horn
}
// The globe: a tapering glass shaft, its four corner columns running on up to a point, a lit globe held between them
// (after a tower in Riyadh with the same trick)
function globeTower(p: Part, cx: number, cy: number, s: number, h: number) {
  const top = Z + h * 0.62, hb = s / 2, ht = s * 0.3, apex = Z + h;
  const pts: THREE.Vector3[] = []; for (const [hw, z] of [[hb, Z], [ht, top]]) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(W(cx + a * hw, cy + b * hw, z));
  p.geo(new ConvexGeometry(pts), new THREE.Matrix4(), 'g');
  // floors traced round the faces the camera sees, and some lit windows on them
  for (let z = Z + 4; z < top - 1; z += 4) { const k = hb + (ht - hb) * (z - Z) / (top - Z) + 0.03;
    p.seg('detail', W(cx - k, cy + k, z), W(cx + k, cy + k, z)).seg('detail', W(cx + k, cy + k, z), W(cx + k, cy - k, z));
    if (rand(0, 1) < 0.5) { const k2 = k + 0.01, u0 = rand(-0.8, 0.2) * k; p.poly('window', [W(cx + u0, cy + k2, z + 0.5), W(cx + u0 + k * 0.5, cy + k2, z + 0.5), W(cx + u0 + k * 0.5, cy + k2, z + 3.2), W(cx + u0, cy + k2, z + 3.2)]); } }
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { beam(p, [cx + a * hb, cy + b * hb, Z], [cx + a * ht, cy + b * ht, top], 1.3, 'k'); beam(p, [cx + a * ht, cy + b * ht, top], [cx, cy, apex], 1.1, 'k'); }
  p.geo(new THREE.IcosahedronGeometry(s * 0.2, 1), new THREE.Matrix4().compose(W(cx, cy, top + (apex - top) * 0.36), new THREE.Quaternion(), v3(1, 1, 1)), 'w');
  beam(p, [cx, cy, apex], [cx, cy, apex + 11], 0.35, 'n');
}
// a tower that turns as it climbs: a square plan turned a little more on every floor; some floors lit whole at night
function twistTower(p: Part, cx: number, cy: number, s: number, floors: number, turn: number) {
  const r = s / Math.SQRT2, fh = 3.6;
  for (let f = 0; f < floors; f++) { const a = Math.PI / 4 + f * turn, z = Z + f * fh;
    const sq = [0, 1, 2, 3].map(k => [cx + r * Math.cos(a + k * Math.PI / 2), cy + r * Math.sin(a + k * Math.PI / 2), z]);
    p.extrude(sq, [0, 0, fh], f % 5 === 4 ? 'n' : rand(0, 1) < 0.3 ? 'w' : 'g', { seams:f % 2 === 0 }); }
  const a = Math.PI / 4 + floors * turn, zt = Z + floors * fh, r2 = r * 0.6;
  p.extrude([0, 1, 2, 3].map(k => [cx + r2 * Math.cos(a + k * Math.PI / 2), cy + r2 * Math.sin(a + k * Math.PI / 2), zt]), [0, 0, 5], 'l');
}
// flats: a slab with a balcony on every floor of its south face, punched windows on the east
function flatsTower(p: Part, x: number, y: number, w: number, d: number, h: number, fh = 3.2) {
  p.box(x, y, Z, w, d, h);
  const F = FRONT(x, y + d, Z + h);
  for (let z = fh; z < h - 0.5; z += fh) { p.box(x + 0.6, y + d, Z + z - 0.2, w - 1.2, 1.3, 0.2);
    p.seg('line', W(x + 0.6, y + d + 1.3, Z + z + 1.0), W(x + w - 0.6, y + d + 1.3, Z + z + 1.0)); }
  windows(p, F, w, h, { col:2.6, floor:fh, ww:1.6, wh:1.9, top:0.9, lit:0.42 });
  windows(p, SIDE(x + w, y + d, Z + h), d, h, { col:3, floor:fh, ww:1.2, wh:1.5, top:1.1, lit:0.38 });
  roof(p, x, y, w, d, Z + h);
}
// offices or shops a few floors high: ribbon windows on every floor, a glass shopfront at the bottom lit at night
function midRise(p: Part, x: number, y: number, w: number, d: number, h: number, fh = 3.8) {
  p.box(x, y, Z, w, d, h);
  for (const [M, fw] of faces(x, y, w, d, Z, h)) {
    p.fill2(M, 0.3, h - 3.6, fw - 0.6, 3.2, 'window', 0.03).draw(M, [0, h - 3.9, fw, h - 3.9], 'line', 0.04);
    for (let v = 1.0; v < h - 4.2; v += fh) { p.fill2(M, 0.6, v, fw - 1.2, 1.6, 'glass', 0.03).rect2(M, 0.6, v, fw - 1.2, 1.6, 'line', 0.035);
      for (let u = 0.6; u < fw - 1.4; u += rand(2.4, 5)) if (rand(0, 1) < 0.45) p.fill2(M, u + 0.1, v + 0.1, Math.min(2.2, fw - 1.3 - u), 1.4, 'window', 0.036); }
  }
  roof(p, x, y, w, d, Z + h, { plant:w > 18 });
}

// ---- City Hall: a hall behind a colonnade under one deep flat roof, on a plinth over a forecourt with a long pool ----
function cityHall(p: Part, x: number, y: number) {
  const px = x + 2, py = y + 2, pw = 38, pd = 24, ph = 0.9, z0 = Z + ph, hh = 11;
  // the plinth, and two steps down to the forecourt along its south side
  p.box(px, py, Z, pw, pd, ph);
  for (let k = 0; k < 2; k++) p.box(px + 6, py + pd + k * 0.6, Z, pw - 12, 0.6, ph - (k + 1) * 0.3);
  // the hall, set back behind the colonnade: tall slit windows, some lit after dark, a band of little triangles under
  // the roof (an old Najd motif), glass doors in the middle of the south front
  const hx = px + 3, hy = py + 2, hw = pw - 6, hd = pd - 6;
  p.box(hx, hy, z0, hw, hd, hh);
  for (const [M, fw] of faces(hx, hy, hw, hd, z0, hh)) {
    const tri: number[] = []; for (let u = 0.4; u < fw - 1.0; u += 1.2) tri.push(u, 1.5, u + 0.5, 0.7, u + 0.5, 0.7, u + 1.0, 1.5);
    p.draw(M, tri, 'detail', 0.04);
    for (let u = 1.4, i = 0; u < fw - 1.6; u += 2.4, i++) { if (fw === hw && Math.abs(u + 0.45 - fw / 2) < 4) continue;
      p.fill2(M, u, 2.4, 0.9, hh - 3.4, i % 3 === 1 ? 'glass' : 'window', 0.03).rect2(M, u, 2.4, 0.9, hh - 3.4, 'line', 0.035); }
  }
  const D = FRONT(hx, hy + hd, z0 + hh);
  p.fill2(D, hw / 2 - 3, hh - 4.6, 6, 4.6, 'window', 0.03).draw(D, [hw / 2 - 3, hh - 4.6, hw / 2 + 3, hh - 4.6, hw / 2, hh - 4.6, hw / 2, hh, hw / 2 - 3, hh - 4.6, hw / 2 - 3, hh, hw / 2 + 3, hh - 4.6, hw / 2 + 3, hh], 'line', 0.035);
  // the colonnade along the south and east sides, and the roof slab it holds out over them, its edge lit at night
  for (let k = 0; k <= 12; k++) p.box(px + 0.6 + k * (pw - 1.7) / 12, py + pd - 1.1, z0, 0.5, 0.5, hh);
  for (let k = 0; k < 7; k++) p.box(px + pw - 1.1, py + 0.6 + k * (pd - 1.7) / 7, z0, 0.5, 0.5, hh);
  const rx = px - 1.5, ry = py - 1.5, rw = pw + 3, rd = pd + 3, rz = z0 + hh;
  p.box(rx, ry, rz, rw, rd, 1.1);
  p.box(rx, ry + rd - 0.1, rz - 0.12, rw, 0.12, 0.12, 'l', { lines:false }).box(rx + rw - 0.1, ry, rz - 0.12, 0.12, rd, 0.12, 'l', { lines:false });
  p.text(FRONT(rx, ry + rd, rz + 1.1), 'SAHEL CITY HALL', rw / 2, 0.85, 0.62, 'ink', 'middle', 0.05);
  roof(p, rx, ry, rw, rd, rz + 1.1);
  // the forecourt down to Souq St: paving, a long pool with a rim, benches beside it, a palm at each corner
  const T = TOP(0, 0, Z), fy0 = py + pd + 1.2, fy1 = y + 42, fx0 = x, fx1 = x + 42;
  p.fill2(T, fx0, fy0, fx1 - fx0, fy1 - fy0, 'deck', 0.02);
  const pave: number[] = []; for (let u = fx0 + 2.4; u < fx1; u += 2.4) pave.push(u, fy0, u, fy1); p.draw(T, pave, 'detail', 0.025);
  const qy = (fy0 + fy1) / 2;
  p.box(x + 11, qy - 1.9, Z, 20, 3.8, 0.35);
  p.fill2(TOP(0, 0, Z + 0.36), x + 11.4, qy - 1.5, 19.2, 3.0, 'sea', 0.02).rect2(TOP(0, 0, Z + 0.36), x + 11.4, qy - 1.5, 19.2, 3.0, 'line', 0.03);
  for (const bx of [x + 13, x + 25]) for (const by of [qy - 3.4, qy + 2.8]) p.box(bx, by, Z, 3, 0.6, 0.45);
  for (const [a, b, t] of [[x + 5, qy - 3, 0.2], [x + 37, qy - 3, 0.5], [x + 5, qy + 3.5, 0.7], [x + 37, qy + 3.5, 0.9]]) datePalm(p, a, b, 0.95, Z, t);
}

// ---- Souq Sahel, the mall: two floors under a glass barrel vault, its name over the doors on Souq St ----
function mall(p: Part, x: number, y: number, w: number, d: number) {
  const h = 12.5;
  p.box(x, y, Z, w, d, h);
  for (const [M, fw] of faces(x, y, w, d, Z, h)) { p.fill2(M, 0, h - 4.6, fw, 4.2, 'window', 0.03).draw(M, [0, h - 4.8, fw, h - 4.8, 0, 3.4, fw, 3.4], 'line', 0.04);
    for (let u = 4; u < fw; u += 4) p.draw(M, [u, h - 4.6, u, h - 0.4], 'detail', 0.04); }
  // the vault along the middle, ribbed
  const vy = y + d / 2, r = 6;
  p.geo(new THREE.CylinderGeometry(r, r, w - 10, 14, 1, true, 0, Math.PI), new THREE.Matrix4().compose(W(x + w / 2, vy, Z + h), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), v3(1, 1, 1)), 'g');
  // the screen and the name on the south front, entrances under canopies
  const F = FRONT(x, y + d, Z + h);
  p.fill2(F, w / 2 - 9, 0.6, 18, 3.0, 'kob', 0.04).text(F, 'SOUQ SAHEL', w / 2, 2.85, 1.7, 'ink', 'middle', 0.05);
  p.fill2(F, 3, 0.8, 9, 3.4, 'window', 0.05).rect2(F, 3, 0.8, 9, 3.4, 'line', 0.055);
  for (const u of [8, w - 14]) p.box(x + u, y + d, Z + 3.6, 7, 2.6, 0.35, 'k');
  roof(p, x, y, w * 0.4, d * 0.3, Z + h, { plant:true });
}

// ---- a plaza: paving in a grid, a fountain, palms and benches ----
function plaza(p: Part, x0: number, y0: number, x1: number, y1: number, { fountain = true, palms = 6 } = {}) {
  const T = TOP(0, 0, Z);
  p.fill2(T, x0, y0, x1 - x0, y1 - y0, 'deck', 0.02);
  const segs: number[] = []; for (let x = x0 + 2.4; x < x1; x += 2.4) segs.push(x, y0, x, y1); for (let y = y0 + 2.4; y < y1; y += 2.4) segs.push(x0, y, x1, y);
  p.draw(T, segs, 'detail', 0.025);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (fountain) { p.cylZ(cx, cy, Z, 4.2, 0.55, 24).cylZ(cx, cy, Z + 0.55, 1.4, 0.5, 12, 'k');
    const w = ring(cx, cy, 3.8, Z + 0.58, 24); p.poly('sea', w.filter((_, i) => i % 2 === 0)); }
  for (let i = 0; i < palms; i++) { const a = i / palms * Math.PI * 2 + 0.3, rr = Math.min(x1 - x0, y1 - y0) * 0.36; datePalm(p, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rand(0.85, 1.05)); }
}

export function buildSahelBuildings() {
  const p = new Part();
  // ---- the Financial District, north of the boulevard ----
  // Najd Av west: a car park and offices by Motor District station
  p.box(552, 28, Z, 38, 36, 12);
  for (let k = 1; k < 4; k++) p.box(551.6, 27.6, Z + k * 3 - 0.3, 38.8, 36.8, 0.3);
  for (const [M, fw] of faces(552, 28, 38, 36, Z, 12)) for (let k = 0; k < 4; k++) p.draw(M, [0, 12 - k * 3 - 1.2, fw, 12 - k * 3 - 1.2], 'detail', 0.04);
  for (let k = 0; k < 10; k++) parkedCar(p, 556 + (k % 5) * 6.5, 33 + Math.floor(k / 5) * 22, false, rand(0, 1) < 0.4 ? 'k' : 'n');
  p.text(FRONT(552, 64, Z + 12), 'P', 3, 3.2, 2.6, 'ink', 'middle', 0.05);
  add('Najd Car Park', 'Car park · 4 levels', [552, 590, 28, 64, 12], [['Spaces', '410'], ['Open', 'all day and all night'], ['Street', 'North St']]);
  midRise(p, 552, 74, 52, 34, 22);
  add('Motor House', 'Offices', [552, 604, 74, 108, 22], [['Floors', '6'], ['Tenants', 'Sahel Motors, a bank, two consultancies'], ['Street', 'Sahel Blvd']]);
  plaza(p, 596, 26, 624, 66, { fountain:false, palms:4 });
  // Najd Av east: two office blocks, a plaza with a sculpture, the arch tower
  midRise(p, 672, 26, 32, 34, 22); midRise(p, 712, 26, 36, 36, 26);
  add('Najd Court', 'Offices', [672, 704, 26, 60, 22], [['Floors', '6'], ['Street', 'North St']]);
  add('Al Rawda House', 'Offices', [712, 748, 26, 62, 26], [['Floors', '7'], ['Street', 'North St']]);
  plaza(p, 670, 66, 688, 110, { palms:4 });
  archTower(p, 692, 82, 34, 22, 94, 62);
  add('Sahel Arch', 'Offices · 24 floors', [692, 726, 82, 104, 94], [['Height', '94 m'], ['The opening', 'from floor 17 to the top'], ['Skybridge', 'a lit walk 85 m up'], ['Street', 'Tower Av']]);
  // Tower Av to Port Av: the twisting tower, the globe, two glass towers
  twistTower(p, 790, 46, 22, 26, 0.038);
  add('Al Dawama', 'Flats · 26 floors', [775, 805, 31, 61, 98], [['Height', '98 m'], ['Turn', '57° from bottom to top'], ['Flats', '208'], ['Street', 'North St']]);
  globeTower(p, 840, 50, 30, 104);
  add('The Globe', 'Offices · 18 floors and a globe', [825, 855, 35, 65, 115], [['Height', '115 m with the spire'], ['The globe', 'a restaurant, 79 m up'], ['Street', 'Tower Av']]);
  glassTower(p, 776, 78, 30, 28, 62, { crown:'slant', lit:0.3 });
  add('Tower Av One', 'Offices · 16 floors', [776, 806, 78, 106, 78], [['Height', '78 m'], ['Street', 'Sahel Blvd']]);
  glassTower(p, 818, 82, 48, 24, 46, { crown:'fins', base:8, lit:0.34 });
  add('Corniche Capital', 'Offices · 12 floors', [816, 868, 80, 108, 52], [['Height', '52 m'], ['Street', 'Sahel Blvd']]);
  // Port Av east: Sahel Tower, a tower with a lit halo, flats
  sahelTower(p, 906, 62, 32, 112);
  add('Sahel Tower', 'Offices · 30 floors', [902, 942, 58, 98, 159], [['Height', '150 m to the crown, 159 m to the tip'], ['Crown', 'a crystal of glass, lit after dark'], ['Lobby', 'on Sahel Blvd'],
    ['Observation deck', 'floor 29'], ['Street', 'Sahel Blvd']], 'the tallest in Sahel');
  glassTower(p, 896, 12, 28, 30, 70, { crown:'halo', heli:true, lit:0.3 });
  add('Al Faris Tower', 'Hotel · 19 floors', [894, 926, 10, 44, 76], [['Height', '76 m'], ['Rooms', '280'], ['Roof', 'a helipad inside a lit halo'], ['Street', 'Port Av']]);
  flatsTower(p, 936, 14, 18, 36, 54);
  add('North Gate Flats', 'Flats · 17 floors', [936, 954, 14, 50, 54], [['Flats', '102'], ['Street', 'Port Av']]);
  // ---- between the boulevard and Souq St ----
  cityHall(p, 550, 150);
  add('Sahel City Hall', 'City hall', [550, 592, 150, 192, 15], [['Inside', 'the council chamber, and counters for permits, licences and records'], ['Hours', '08:00–16:00'],
    ['The roof', 'one flat slab held out over a colonnade, for shade'], ['Street', 'Souq St']]);
  mall(p, 708, 152, 44, 42);
  add('Souq Sahel', 'Shopping centre', [708, 752, 152, 194, 19], [['Shops', '140 on two floors'], ['Hours', '10:00–23:00'], ['Under the vault', 'a food court'], ['Street', 'Souq St']]);
  midRise(p, 772, 152, 96, 18, 11);
  flatsTower(p, 788, 174, 64, 20, 33);
  add('Sahel Grand', 'Hotel · 10 floors', [772, 868, 152, 194, 33], [['Rooms', '320'], ['Below', 'shops along the boulevard'], ['Street', 'Tower Av']]);
  midRise(p, 892, 152, 62, 22, 12); glassTower(p, 920, 176, 34, 18, 26, { lit:0.35 });
  add('Port Av Exchange', 'Offices', [892, 954, 152, 194, 28], [['Floors', '7'], ['Street', 'Port Av']]);
  // ---- between Souq St and the Corniche ----
  // Wadi Gardens: courtyard flats, a taller block behind
  for (const [x, y, w, d] of [[552, 218, 22, 14], [578, 218, 18, 14]]) midRise(p, x, y, w, d, 13, 3.2);
  flatsTower(p, 552, 238, 44, 16, 34);
  add('Wadi Gardens', 'Flats', [552, 598, 218, 254, 34], [['Flats', '180'], ['Street', 'Gate Av']]);
  // Wadi Park: lawns, a dry river of stones, palms, a pergola and a kiosk
  buildPark(p, 708, 216, 750, 256);
  add('Wadi Park', 'Park', [708, 753, 214, 258, 4], [['Open', 'dawn to midnight'], ['The wadi', 'a dry riverbed that runs after rain'], ['Street', 'Souq St']]);
  // Sahel Library, a box held out over its plaza, and flats stepping up behind
  p.box(776, 230, Z, 18, 20, 5).box(772, 224, Z + 5, 42, 24, 10);
  for (const [M, fw] of faces(772, 224, 42, 24, Z + 5, 10)) { const segs: number[] = []; for (let u = 1.2; u < fw; u += 1.2) segs.push(u, 0, u, 10); p.fill2(M, 0, 2, fw, 6, 'window', 0.03).draw(M, segs, 'detail', 0.04); }
  p.text(FRONT(772, 248, Z + 15), 'LIBRARY', 21, 1.4, 1.1, 'ink', 'middle', 0.05);
  plaza(p, 798, 228, 822, 256, { fountain:false, palms:3 });
  add('Sahel Library', 'Library', [772, 814, 224, 250, 15], [['Books', '400,000'], ['Hours', '08:00–22:00'], ['The building', 'a reading room held out over the plaza'], ['Street', 'Tower Av']]);
  midRise(p, 828, 218, 40, 14, 12, 3.2); flatsTower(p, 828, 236, 40, 18, 30);
  add('Corniche Heights', 'Flats', [828, 868, 218, 254, 30], [['Flats', '120'], ['Street', 'Port Av']]);
  // Port Av to the edge: the Corniche Hotel
  flatsTower(p, 900, 232, 54, 22, 24, 3.4);
  add('Corniche Hotel', 'Hotel · 7 floors', [900, 954, 232, 254, 24], [['Rooms', '160'], ['Looks out over', 'the port'], ['Street', 'Corniche']]);
  // trees round the edges of the blocks that have room
  for (const [x, y] of [[560, 112], [576, 112], [658, 112], [744, 112], [870, 112], [770, 112], [892, 196], [952, 196], [552, 200], [600, 120],
    [770, 196], [866, 196], [552, 256], [632, 256], [770, 256], [870, 256], [892, 222], [956, 222]]) datePalm(p, x, y, rand(0.85, 1.05));
  for (const [x, y] of [[602, 230], [612, 248], [622, 232]]) tree(p, x, y, 1.0, Z);
  return p.build('sahelBuildings');
}

// Wadi Park: lawns either side of a winding dry riverbed of stones, palms, a pergola over benches, a kiosk
export const PARK_SEATS: [number, number, number][] = [];
function buildPark(p: Part, x0: number, y0: number, x1: number, y1: number) {
  const T = TOP(0, 0, Z);
  p.fill2(T, x0, y0, x1 - x0, y1 - y0, 'grass', 0.015);
  // the wadi: a band that winds west to east, stones along it
  const bank = (k: number) => { const pts = []; for (let x = x0; x <= x1 + 0.01; x += 2.5) pts.push([x, (y0 + y1) / 2 + Math.sin((x - x0) * 0.09) * 6 + k]); return pts; };
  const a = bank(-2.2), b = bank(2.2);
  for (let i = 1; i < a.length; i++) p.poly('sand', [W(a[i - 1][0], a[i - 1][1], Z + 0.03), W(a[i][0], a[i][1], Z + 0.03), W(b[i][0], b[i][1], Z + 0.03), W(b[i - 1][0], b[i - 1][1], Z + 0.03)]);
  for (const e of [a, b]) for (let i = 1; i < e.length; i++) p.seg('line', W(e[i - 1][0], e[i - 1][1], Z + 0.04), W(e[i][0], e[i][1], Z + 0.04));
  for (let i = 0; i < 40; i++) { const x = rand(x0 + 1, x1 - 1), y = (y0 + y1) / 2 + Math.sin((x - x0) * 0.09) * 6 + rand(-1.6, 1.6);
    p.geo(crown, new THREE.Matrix4().compose(W(x, y, Z + 0.1), yaw(rand(0, 3)), v3(rand(0.25, 0.5), rand(0.15, 0.3), rand(0.25, 0.5)))); }
  // paths across it on little bridges
  for (const x of [x0 + 18, x1 - 20]) { p.fill2(T, x - 1, y0, 2, y1 - y0, 'deck', 0.025); p.box(x - 1.2, (y0 + y1) / 2 + Math.sin((x - x0) * 0.09) * 6 - 2.8, Z, 2.4, 5.6, 0.35); }
  // palms in groves, a pergola with benches under it, a kiosk
  for (let i = 0; i < 18; i++) { const x = rand(x0 + 2, x1 - 2), y = rand(y0 + 2, y1 - 2), off = Math.abs(y - ((y0 + y1) / 2 + Math.sin((x - x0) * 0.09) * 6));
    if (off > 4.5) datePalm(p, x, y, rand(0.8, 1.05)); else rand(0, 1); }
  const px = x1 - 12, py = y0 + 4;
  for (const [dx, dy] of [[0, 0], [8, 0], [0, 6], [8, 6]]) p.box(px + dx, py + dy, Z, 0.3, 0.3, 2.8);
  for (let u = 0; u <= 8; u += 1) p.box(px + u, py, Z + 2.8, 0.15, 6.3, 0.15);
  for (const dx of [1.5, 5.5]) { p.box(px + dx, py + 2.6, Z + 0.4, 1.8, 0.5, 0.08).box(px + dx, py + 2.6, Z + 0.48, 1.8, 0.08, 0.4); PARK_SEATS.push([px + dx + 0.45, py + 2.85, Math.PI / 2], [px + dx + 1.35, py + 2.85, Math.PI / 2]); }
  p.box(x0 + 4, y1 - 9, Z, 5, 4, 3).box(x0 + 3.6, y1 - 9.4, Z + 3, 5.8, 4.8, 0.3, 'k').fill2(FRONT(x0 + 4, y1 - 5, Z + 3), 0.5, 0.8, 4, 1.2, 'window', 0.03);
  cityLamp(p, x0 + 30, y0 + 3, false, 0, 1); cityLamp(p, x1 - 30, y1 - 3, false, 0, -1);
}
