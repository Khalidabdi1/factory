import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { SEA_Z } from '../layout';
import * as worksM from '../models/works';
import { BARREL, R, RAPTOR, SHIP_PIECES, buildRaptor, hullInto, noseInto, shipAftInto } from '../models/starship';
const { beam, buildRobot } = worksM as any;

// ---- Gull Spit Starbase: a Starship factory and launch site on land made out over the sea east of Millbrook ----
// The production site at the spit's west end: the Starfactory, where steel coil is rolled into rings, the rings welded
// into barrels and the barrels tiled; the Engine Shop, where Raptors are built up piece by piece; Mega Bay 1, where
// Super Heavy boosters are stacked, and Mega Bay 2, glass-walled, where ships are. A road runs east along the spit past
// the Rocket Garden and the tank farm to the pad at its tip: the launch tower with its chopsticks, the launch mount
// over its flame trench, and the deluge tanks. Like Starbase in Texas, squeezed: a pad 2.5 km from its factory there
// is 300 m from it here.
export const SB = {
  spit:[1296, 1892, 286, 406] as number[],
  road:{ y:352, lanes:[349, 355], x0:1300, x1:1784, half:6 },
  // the cart's way along the front of the bays, and the alley between them the engines go in by
  apron:341, alley:1498,
  access:{ x:1440, y0:270.5 },
  factory:{ x0:1310, x1:1432, y0:300, y1:340, h:28, door:[316, 330], doorH:18 },
  shop:{ x0:1310, x1:1354, y0:364, y1:386, h:10, stands:[[1321, 373.5], [1332, 373.5], [1343, 373.5]] as number[][], stock:{ x0:1314, dx:4.4, y:361.2, n:8 } },
  bay1:{ x0:1452, x1:1492, y0:300, y1:336, h:92, c:[1472, 316], drop:[1472, 329], door:[1463, 1481], doorH:84, name:'Mega Bay 1' },
  bay2:{ x0:1504, x1:1540, y0:302, y1:336, h:74, c:[1522, 317], drop:[1522, 329], door:[1514, 1530], doorH:66, name:'Mega Bay 2' },
  garden:{ R:[[1564, 318], [1584, 318]] as number[][], D:[1604, 318], monument:[1624, 312] },
  farm:{ x0:1690, x1:1766, y0:298, y1:342 },
  tower:{ c:[1800, 330], half:6, h:146 },
  hinge:[1800, 336], reach:24,
  mount:{ c:[1800, 360], half:9, h:20 },
  trench:[1794, 1806, 351, 402] as number[],
  deluge:[[1744, 384], [1758, 384], [1772, 384]] as number[][],
  parking:{ x0:1362, x1:1430, y0:366, y1:388 },
};
// the stand a vehicle is stacked on in a bay (and stands on, on its transporter): its bottom this high
export const STAND_Z = 5.6;
// where the SPMT stops at the pad, on the road, within the chopsticks' reach
export const SPMT_AT = (() => { const [hx, hy] = SB.hinge, s = (SB.road.y - hy) / SB.reach, a = Math.PI - Math.asin(s); return { x:hx + SB.reach * Math.cos(a), y:SB.road.y, a }; })();
export const MOUNT_A = Math.PI / 2;

// a cylinder lying along x
const cylX = (p: Part, x: number, cy: number, cz: number, r: number, len: number, n: number, tone: string) => {
  const pts: number[][] = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([x, cy + r * Math.cos(a), cz + r * Math.sin(a)]); }
  return p.extrude(pts, [len, 0, 0], tone, { seams:false }); };
const box = (p: Part, b: { x0: number, x1: number, y0: number, y1: number }, z: number, h: number, tone = 'n') => p.box(b.x0, b.y0, z, b.x1 - b.x0, b.y1 - b.y0, h, tone);
// a building in section: its walls cut low all round and hatched, door gaps left, the roof's edge dashed at its height
function section(c: Part, b: { x0: number, x1: number, y0: number, y1: number }, h: number, gaps: { s?: number[], e?: number[], w?: number[] } = {}) {
  const T = 0.5, lz = 1.6, hs: number[] = [];
  const run = (a0: number, a1: number, gap: number[] | undefined, f: (u0: number, u1: number) => void) => {
    if (!gap) return f(a0, a1); if (gap[0] > a0) f(a0, gap[0]); if (gap[1] < a1) f(gap[1], a1); };
  run(b.x0, b.x1, gaps.s, (u0, u1) => { c.box(u0, b.y1 - T, 0, u1 - u0, T, lz, 'n'); for (let u = u0 + 0.3; u < u1 - 0.4; u += 0.9) hs.push(u, b.y1 - T, u + 0.4, b.y1); });
  run(b.x0, b.x1, undefined, (u0, u1) => { c.box(u0, b.y0, 0, u1 - u0, T, lz, 'n'); for (let u = u0 + 0.3; u < u1 - 0.4; u += 0.9) hs.push(u, b.y0, u + 0.4, b.y0 + T); });
  run(b.y0, b.y1, gaps.e, (v0, v1) => { c.box(b.x1 - T, v0, 0, T, v1 - v0, lz, 'n'); for (let v = v0 + 0.3; v < v1 - 0.4; v += 0.9) hs.push(b.x1 - T, v, b.x1, v + 0.4); });
  run(b.y0, b.y1, gaps.w, (v0, v1) => { c.box(b.x0, v0, 0, T, v1 - v0, lz, 'n'); for (let v = v0 + 0.3; v < v1 - 0.4; v += 0.9) hs.push(b.x0, v, b.x0 + T, v + 0.4); });
  c.draw(TOP(0, 0, lz), hs, 'detail', 0.01);
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  for (let i = 0; i < 4; i++) { const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4], L = Math.hypot(bx - ax, by - ay);
    for (let u = 0; u < L; u += 3) { const f0 = u / L, f1 = Math.min(1, (u + 1.6) / L); c.seg('detail', W(ax + (bx - ax) * f0, ay + (by - ay) * f0, h), W(ax + (bx - ax) * f1, ay + (by - ay) * f1, h)); } }
  return c;
}

// ---- the ground: the spit, its revetment, roads, the car park ----
function ground(p: Part) {
  const [x0, x1, y0, y1] = SB.spit, z = 0.02, r = 14;
  // the spit's edge: a rounded oblong, the rocks of the revetment sloping from it into the sea
  const pts: number[][] = [[x0, y0], [x0, y1 - r]];
  for (let i = 1; i <= 6; i++) { const a = Math.PI - i / 6 * Math.PI / 2; pts.push([x0 + r + r * Math.cos(a), y1 - r + r * Math.sin(a)]); }
  pts.push([x1 - 40, y1]);
  for (let i = 1; i <= 8; i++) { const a = Math.PI / 2 - i / 8 * Math.PI / 2; pts.push([x1 - 40 + 40 * Math.cos(a), y1 - 40 + 40 * Math.sin(a)]); }
  pts.push([x1, y0]);
  p.poly('ground', pts.map(([x, y]) => W(x, y, z)));
  // each corner pushed out along the mean of its two edges' outward normals (the chain runs clockwise on the plan)
  const nrm = (i: number) => { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay); return [-(by - ay) / L, (bx - ax) / L]; };
  const out = (i: number) => { const a = nrm(Math.max(0, i - 1)), b = nrm(Math.min(pts.length - 2, i)), m = [a[0] + b[0], a[1] + b[1]], L = Math.hypot(m[0], m[1]) || 1;
    return [pts[i][0] + m[0] / L * 4, pts[i][1] + m[1] / L * 4]; };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [ox, oy] = out(i - 1), [qx, qy] = out(i);
    p.poly('body', [W(ax, ay, z), W(bx, by, z), W(qx, qy, SEA_Z - 0.2), W(ox, oy, SEA_Z - 0.2)]);
    p.seg('line', W(ax, ay, z), W(bx, by, z));
    const L = Math.hypot(bx - ax, by - ay);
    for (let u = 0.8; u < L; u += 1.7) { const f = u / L, mx = ax + (bx - ax) * f, my = ay + (by - ay) * f, nx = ox + (qx - ox) * f, ny = oy + (qy - oy) * f;
      p.seg('detail', W(mx + (nx - mx) * 0.3, my + (ny - my) * 0.3, z - 0.25), W(mx + (nx - mx) * 0.55, my + (ny - my) * 0.55, (z + SEA_Z) * 0.55)); }
  }
  const G = TOP(0, 0, 0.03), R0 = SB.road;
  // the access road down from the coast road across the beach, and the road along the spit
  p.fill2(G, SB.access.x - 4.5, SB.access.y0 + 3.5, 9, 296 - SB.access.y0, 'road', 0.01);
  p.fill2(G, SB.access.x - 4.5, 290, 9, R0.y - 290 + R0.half, 'road', 0.01);
  p.fill2(G, R0.x0, R0.y - R0.half, R0.x1 - R0.x0 + 8, R0.half * 2, 'road', 0.01);
  for (let x = R0.x0 + 2; x < R0.x1; x += 6) p.draw(G, [x, R0.y, x + 3, R0.y], 'detail', 0.02);
  for (const y of [R0.y - R0.half, R0.y + R0.half]) p.draw(G, [R0.x0, y, R0.x1 + 8, y], 'line', 0.02);
  // aprons before the bays' doors, the factory's east door and the garden's stands
  for (const b of [SB.bay1, SB.bay2]) p.fill2(G, b.door[0] - 3, b.y1, b.door[1] - b.door[0] + 6, R0.y - R0.half - b.y1, 'road', 0.012);
  p.fill2(G, SB.factory.x1, SB.factory.door[0] - 2, SB.access.x - SB.factory.x1 + 4.5, SB.factory.door[1] - SB.factory.door[0] + 4, 'road', 0.012);
  p.fill2(G, SB.access.x - 4.5, SB.factory.door[1] + 2, 9, R0.y - R0.half - SB.factory.door[1] - 2, 'road', 0.012);
  p.fill2(G, SB.garden.R[0][0] - 7, 308, SB.garden.D[0] - SB.garden.R[0][0] + 14, R0.y - R0.half - 308, 'road', 0.012);
  // the pad's apron: concrete from the tank farm to the spit's tip
  p.fill2(G, 1680, 296, 196, 100, 'road', 0.008);
  // staff parking behind the Engine Shop's neighbour, its cars
  const P = SB.parking; p.fill2(G, P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 'road', 0.012);
  for (let x = P.x0 + 3; x < P.x1 - 2; x += 3) { p.draw(G, [x, P.y0 + 0.5, x, P.y0 + 5.5], 'detail', 0.02); p.draw(G, [x, P.y1 - 5.5, x, P.y1 - 0.5], 'detail', 0.02); }
  for (let i = 0; i < 14; i++) { const x = P.x0 + 4.5 + i * 3 + (i > 6 ? 3 : 0), y = i % 2 ? P.y0 + 3 : P.y1 - 3; if (x > P.x1 - 3) continue;
    p.box(x - 0.85, y - 2.1, 0.03, 1.7, 4.2, 0.75, i % 3 ? 'n' : 'k').box(x - 0.75, y - 1.1, 0.78, 1.5, 2.2, 0.55, i % 3 ? 'n' : 'k'); }
  p.text(TOP(P.x0 + 1, P.y0 + 9, 0.05), 'STAFF', 2.2, 0.5, 0.5, 'paint', 'start', 0.01);
  // the gate where the access road comes onto the spit, and the sign
  p.box(SB.access.x - 6.5, 288, 0, 1.2, 1.2, 3.2, 'k').box(SB.access.x + 5.3, 288, 0, 1.2, 1.2, 3.2, 'k');
  p.box(SB.access.x + 8, 288.4, 0, 14, 0.4, 3.4, 'n').text(FRONT(SB.access.x + 8, 288.82, 3.2), 'GULL SPIT STARBASE', 7, 1.1, 1.0, 'ink', 'middle', 0.02);
}

// ---- the Starfactory: a long hall, its glazed band along the south side and its name along the top ----
function factoryShell(p: Part) {
  const F = SB.factory; box(p, F, 0, F.h, 'n');
  const S = FRONT(F.x0, F.y1, F.h);
  for (let u = 4; u < F.x1 - F.x0 - 3; u += 6) p.fill2(S, u, F.h - 7, 4.6, 2.2, 'window', 0.02);
  for (let u = 6; u < F.x1 - F.x0; u += 12) p.draw(S, [u, 0.5, u, F.h], 'detail', 0.02);
  p.text(FRONT(F.x0, F.y1 + 0.03, F.h), 'STARFACTORY', (F.x1 - F.x0) / 2, 3.6, 3.4, 'ink', 'middle', 0.02);
  const E = SIDE(F.x1, F.y1, F.h); p.fill2(E, F.y1 - F.door[1], F.h - F.doorH, F.door[1] - F.door[0], F.doorH, 'kob', 0.02).rect2(E, F.y1 - F.door[1], F.h - F.doorH, F.door[1] - F.door[0], F.doorH, 'line', 0.025);
  for (let x = F.x0 + 8; x < F.x1; x += 16) p.box(x, F.y0 + 4, F.h, 6, 4, 2.2, 'n');   // the roof's vents
}
// inside: the coil store, the ring line (uncoiler and roll former, seam welder), the barrel cell (turntable, welding
// mast), the tiling cell, a dome on its jig, a nosecone waiting; an overhead crane's rails down the hall
function factoryInside(f: Part) {
  const F = SB.factory, y = 320;
  for (let i = 0; i < 4; i++) f.cylY(1316 + i * 3.4, 304, 1.3, 1.25, 2.4, 14, i % 2 ? 'n' : 'k');
  // the uncoiler and the roll former the strip runs through
  f.box(1328, 314, 0, 4, 4, 3, 'k').cylY(1330, 313.8, 3.6, 1.0, 4.4, 12, 'n');
  f.poly('deck', [W(1332, 315.2, 1.4), W(1339, 315.2, 1.4), W(1339, 316.8, 1.4), W(1332, 316.8, 1.4)]);
  f.box(1339, 313, 0, 3, 6, 4, 'k').cylY(1340.5, 312.8, 2.2, 0.6, 6.4, 10, 'n').cylY(1340.5, 312.8, 3.6, 0.6, 6.4, 10, 'n');
  // the seam welder's gantry over the ring
  f.box(1342, 309, 0, 0.6, 0.6, 12, 'k').box(1355, 309, 0, 0.6, 0.6, 12, 'k').box(1342, 309, 11.4, 13.6, 0.6, 0.6, 'k');
  // the barrel cell: its turntable and the mast the welding head rides up and down
  f.cylZ(1376, y, 0, R + 1.2, 0.4, 28, 'k').box(1383, y - 1, 0, 1.2, 2, 18, 'k').box(1381.5, y - 0.6, 17.4, 3.4, 1.2, 0.6, 'k');
  // the tiling cell: a barrel on its stand
  f.cylZ(1404, y, 0, R + 0.8, 1.0, 28, 'n');
  { const q = new Part(); hullInto(q, 1.0, 1.0 + BARREL, { tiles:true }); f.put(q, 1404, y, 0, 0); }
  // a dome on its jig, a nosecone waiting by the door
  f.box(1350, 330, 0, 10, 8, 1.2, 'k');
  f.geo(new THREE.SphereGeometry(R, 24, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().compose(W(1355, 334, 1.2), new THREE.Quaternion(), v3(1, 0.45, 1)), 'n');
  { const q = new Part(); noseInto(q, 1.0, 1.0); f.put(q, 1420, 306, 0, 0); }
  // crane rails down the hall, and the floor's painted lanes
  for (const yy of [F.y0 + 1, F.y1 - 1.6]) f.box(F.x0 + 1, yy, 22, F.x1 - F.x0 - 2, 0.5, 0.6, 'n');
  const G = TOP(0, 0, 0.02); f.draw(G, [F.x0 + 2, 327.5, F.x1, 327.5, F.x0 + 2, 312.5, F.x1, 312.5], 'detail', 0.01);
}

// ---- the Engine Shop: a low shed with three build stands; finished engines wait on cradles along its north side ----
function shopShell(p: Part) {
  const S = SB.shop; box(p, S, 0, S.h, 'n');
  const F = FRONT(S.x0, S.y1, S.h); for (let u = 2; u < S.x1 - S.x0 - 2; u += 4) p.fill2(F, u, 3.2, 2.6, 1.8, 'window', 0.02);
  p.text(FRONT(S.x0, S.y1 + 0.03, S.h), 'ENGINE SHOP · RAPTOR', (S.x1 - S.x0) / 2, 1.2, 1.3, 'ink', 'middle', 0.02);
  const E = SIDE(S.x1, S.y1, S.h); p.fill2(E, 6, 3, 8, 7, 'kob', 0.02);
  for (let x = S.x0 + 1; x < S.x1 - 4; x += 6) p.box(x, S.y0 + 2, S.h, 4, 18, 1.2, 'n', { seams:false });
}
function shopInside(f: Part) {
  const S = SB.shop;
  for (const [x, y] of S.stands) {
    // a stand: a ring frame on four posts that holds the engine by its gimbal block, a platform round it
    for (const [dx, dy] of [[-1.6, -1.6], [1.3, -1.6], [-1.6, 1.3], [1.3, 1.3]]) f.box(x + dx, y + dy, 0, 0.3, 0.3, 4.6, 'n');
    for (const [bx, by, bw, bd] of [[-1.6, -1.6, 3.2, 0.3], [-1.6, 1.3, 3.2, 0.3], [-1.6, -1.6, 0.3, 3.2], [1.3, -1.6, 0.3, 3.2]]) f.box(x + bx, y + by, 4.3, bw, bd, 0.3, 'n');
    f.box(x - 2.6, y + 1.8, 0, 5.2, 1.2, 0.9, 'n');
  }
  // the jib crane, the parts racks along the north wall, a test bench
  f.box(S.x0 + 1, S.y0 + 1, 0, 0.6, 0.6, 8, 'k').box(S.x0 + 1, S.y0 + 1, 7.4, 14, 0.6, 0.5, 'k');
  for (let x = S.x0 + 4; x < S.x1 - 4; x += 5) f.box(x, S.y0 + 0.8, 0, 4, 1.4, 3.2, 'n');
  f.box(S.x1 - 7, S.y1 - 5, 0, 5, 3, 1.0, 'k');
}

// ---- the Mega Bays: tall slabs, a door the height of a vehicle in the south face; the second clad in glass ----
function bayShell(p: Part, b: typeof SB.bay1, glass: boolean) {
  box(p, b, 0, b.h, glass ? 'g' : 'n');
  const F = FRONT(b.x0, b.y1, b.h), d0 = b.door[0] - b.x0, dw = b.door[1] - b.door[0];
  p.fill2(F, d0, b.h - b.doorH, dw, b.doorH, 'kob', 0.02).rect2(F, d0, b.h - b.doorH, dw, b.doorH, 'line', 0.025);
  for (let z = 6; z < b.h; z += 6) p.draw(F, [0, z, d0, z, d0 + dw, z, b.x1 - b.x0, z], 'detail', 0.02);
  for (let u = 4; u < b.x1 - b.x0; u += 4) if (u < d0 - 0.5 || u > d0 + dw + 0.5) p.draw(F, [u, 0, u, b.h], glass ? 'line' : 'detail', 0.02);
  const E = SIDE(b.x1, b.y1, b.h); for (let z = 6; z < b.h; z += 6) p.draw(E, [0, z, b.y1 - b.y0, z], 'detail', 0.02);
  if (!glass) p.fill2(E, b.y1 - 323, b.h - 7, 10, 7, 'kob', 0.025);   // the side door the engines go in by
  if (glass) for (let v = 4; v < b.y1 - b.y0; v += 4) p.draw(E, [v, 0, v, b.h], 'line', 0.02);
  p.box(b.x0 + 4, b.y0 + 4, b.h, b.x1 - b.x0 - 8, b.y1 - b.y0 - 8, 3.5, 'n');   // the cranes' housing on the roof
  p.text(FRONT(b.x0, b.y1 + 0.03, b.h - 2), b.name.toUpperCase(), (b.x1 - b.x0) / 2, 2.4, 2.4, 'ink', 'middle', 0.02);
}
// inside: the stand the stack grows on, work platforms round it every ten metres, the crane's runway at the top
function bayInside(f: Part, b: typeof SB.bay1, levels: number) {
  const [cx, cy] = b.c;
  for (const [dx, dy] of [[-5.5, -5.5], [4.7, -5.5], [-5.5, 4.7], [4.7, 4.7]]) f.box(cx + dx, cy + dy, 0, 0.8, 0.8, STAND_Z, 'n');
  f.cylZ(cx, cy, STAND_Z - 0.6, R + 0.6, 0.6, 28, 'n');
  for (let k = 1; k <= levels; k++) { const z = STAND_Z + k * 10;
    // a platform: a C round the stack open toward the door, on posts from the floor
    const ring: THREE.Vector3[] = [], inner: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) { const a = -Math.PI * 0.25 - i / 20 * Math.PI * 1.5, c = Math.cos(a), s = Math.sin(a); ring.push(W(cx + (R + 3.4) * c, cy - (R + 3.4) * s, z)); inner.push(W(cx + (R + 0.8) * c, cy - (R + 0.8) * s, z)); }
    for (let i = 1; i < ring.length; i++) { f.poly('deck', [inner[i - 1], ring[i - 1], ring[i], inner[i]]); f.seg('line', ring[i - 1], ring[i]).seg('line', inner[i - 1], inner[i]); f.seg('detail', ring[i - 1], ring[i - 1].clone().add(v3(0, 1.1, 0))); }
  }
  for (const [dx, dy] of [[-R - 3.2, -R - 3.2], [R + 2.8, -R - 3.2], [-R - 3.2, 0], [R + 2.8, 0]]) f.box(cx + dx, cy + dy, 0, 0.4, 0.4, STAND_Z + levels * 10, 'k');
  for (const x of [b.x0 + 1, b.x1 - 1.6]) f.box(x, b.y0 + 1, b.h - 6, 0.6, b.y1 - b.y0 - 2, 0.8, 'k');
}

// ---- the Rocket Garden: a ship from an older flight on show on its stand; the flown boosters' stands ----
function garden(p: Part) {
  const G = SB.garden;
  for (const [x, y] of [...G.R, G.D]) { for (const [dx, dy] of [[-4.6, -4.6], [3.9, -4.6], [-4.6, 3.9], [3.9, 3.9]]) p.box(x + dx, y + dy, 0, 0.7, 0.7, STAND_Z - 0.6, 'n'); p.cylZ(x, y, STAND_Z - 0.6, R + 0.5, 0.6, 28, 'n'); }
  const [mx, my] = G.monument;
  for (const [dx, dy] of [[-4.6, -4.6], [3.9, -4.6], [-4.6, 3.9], [3.9, 3.9]]) p.box(mx + dx, my + dy, 0, 0.7, 0.7, 3, 'k');
  const q = new Part(); shipAftInto(q); let z = 7.2; for (const s of SHIP_PIECES.slice(1, -1)) { s.into(q, z); z += s.h; } noseInto(q, z);
  p.put(q, mx, my, 0, 3);
  p.box(mx + 7, my + 6, 0, 3.2, 0.3, 1.2, 'k').text(FRONT(mx + 7, my + 6.32, 1.15), 'S-20 · 2027', 1.6, 0.35, 0.4, 'paint', 'middle', 0.01);
}

// ---- the tank farm: the tall tanks of liquid oxygen, methane and nitrogen, rows of smaller ones on their sides, the
// pipe rack out to the tower ----
function farm(p: Part) {
  const F = SB.farm;
  for (let i = 0; i < 5; i++) { const x = F.x0 + 8 + i * 13, y = F.y0 + 9; p.cylZ(x, y, 0, 5, 30, 20, i < 2 ? 'n' : 'n').cylZ(x, y, 30, 4, 1.2, 20, 'n'); p.seg('detail', W(x, y + 5.02, 0.5), W(x, y + 5.02, 30)); }
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const x = F.x0 + 3 + i * 18.5, y = F.y0 + 24 + r * 6;
    cylX(p, x, y, 2.6, 2.2, 15, 14, 'n'); p.box(x + 2, y - 1.5, 0, 0.6, 3, 1.2, 'k').box(x + 12.4, y - 1.5, 0, 0.6, 3, 1.2, 'k'); }
  // the pipe rack to the tower's foot, the ship's lines carried up the tower
  for (let x = F.x1; x < SB.tower.c[0] - 6; x += 6) p.box(x, 329, 0, 0.5, 0.5, 4, 'k');
  p.box(F.x1, 328.6, 4, SB.tower.c[0] - 6 - F.x1, 1.4, 0.5, 'k');
  beam(p, [F.x1, 329.3, 4.9], [SB.tower.c[0] - 6, 329.3, 4.9], 0.5, 'n');
  beam(p, [F.x1, 330.1, 4.9], [SB.tower.c[0] - 6, 330.1, 4.9], 0.4, 'n');
}

// ---- the launch tower: a square steel truss, braced on every face, a crane and lightning rod on top; the launch mount,
// a steel block on four legs over the flame trench with a ring of hold-down clamps round its opening; the deluge tanks ----
function tower(p: Part) {
  const [cx, cy] = SB.tower.c, h = SB.tower.h, s = SB.tower.half;
  const C = [[cx - s, cy - s], [cx + s - 1.4, cy - s], [cx - s, cy + s - 1.4], [cx + s - 1.4, cy + s - 1.4]];
  for (const [x, y] of C) p.box(x, y, 0, 1.4, 1.4, h, 'n', { seams:false });
  for (let z = 0; z < h; z += 9) {
    p.box(cx - s, cy + s - 1, z, 2 * s, 1, 0.7, 'n', { seams:false }).box(cx + s - 1, cy - s, z, 1, 2 * s, 0.7, 'n', { seams:false });
    p.seg('line', W(cx - s, cy + s, z), W(cx + s, cy + s, z + 9)).seg('line', W(cx + s, cy + s, z), W(cx - s, cy + s, z + 9));
    p.seg('line', W(cx + s, cy + s, z), W(cx + s, cy - s, z + 9)).seg('line', W(cx + s, cy - s, z), W(cx + s, cy + s, z + 9));
  }
  p.box(cx - s, cy - s, h, 2 * s, 2 * s, 1.0, 'n').box(cx - 1, cy - 1, h + 1, 2, 2, 6, 'k');
  beam(p, [cx, cy, h + 6], [cx + 3, cy + 16, h + 4], 0.6, 'k');
  p.seg('line', W(cx - 3, cy - 3, h + 1), W(cx - 3, cy - 3, h + 16));
  // the lift shaft and the stair up the tower's west face, the ship's propellant lines up its south-west corner
  p.box(cx - s - 3, cy - 3, 0, 3, 6, h - 2, 'n');
  for (let z = 3; z < h - 2; z += 3) p.draw(SIDE(cx - s - 3, cy + 3, z), [0, 0, 6, 0], 'detail', 0.02);
  for (const dx of [0.4, 1.0]) p.box(cx - s + dx, cy + s + 0.2, 0, 0.35, 0.35, 104, 'k', { seams:false });
  // the launch mount
  const [mx, my] = SB.mount.c, mh = SB.mount.h, ms = SB.mount.half;
  for (const [x, y] of [[mx - ms, my - ms], [mx + ms - 4, my - ms], [mx - ms, my + ms - 4], [mx + ms - 4, my + ms - 4]]) p.box(x, y, 0, 4, 4, mh - 4, 'n');
  const ring: THREE.Vector3[] = [], hole: THREE.Vector3[] = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; hole.push(W(mx + (R + 0.8) * Math.cos(a), my + (R + 0.8) * Math.sin(a), mh)); }
  for (const [x, y] of [[mx - ms, my - ms], [mx + ms, my - ms], [mx + ms, my + ms], [mx - ms, my + ms]]) ring.push(W(x, y, mh));
  // the deck: four slabs round the hole, the block's sides below it
  p.box(mx - ms, my - ms, mh - 4, 2 * ms, 2 * ms, 4, 'n', { lines:true });
  for (let i = 0; i < 28; i++) p.seg('line', hole[i].clone().add(v3(0, 0.05, 0)), hole[(i + 1) % 28].clone().add(v3(0, 0.05, 0)));
  { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; pts.push(W(mx + (R + 0.8) * Math.cos(a), my + (R + 0.8) * Math.sin(a), mh + 0.03)); }
    for (let i = 1; i < pts.length; i++) p.poly('kob', [W(mx, my, mh + 0.03), pts[i - 1], pts[i]]); }
  for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20 * Math.PI * 2; p.box(mx + (R + 1.5) * Math.cos(a) - 0.5, my + (R + 1.5) * Math.sin(a) - 0.5, mh, 1.0, 1.0, 1.4, 'k'); }
  // the booster's quick disconnect: a hood on the deck's north side
  p.box(mx - 2.5, my - ms - 1.5, mh - 2, 5, 3, 3.5, 'k');
  // the flame trench: a channel from under the mount to the sea, its walls, the water-cooled diverter under the mount
  const [tx0, tx1, ty0, ty1] = SB.trench;
  p.fill2(TOP(0, 0, 0.04), tx0, ty0, tx1 - tx0, ty1 - ty0, 'kob', 0.01);
  for (const x of [tx0 - 1, tx1]) p.box(x, ty0, 0, 1, ty1 - ty0, 2.2, 'n');
  p.poly('body', [W(tx0, my - 4, 0.05), W(tx1, my - 4, 0.05), W(tx1, my + 1, 3.6), W(tx0, my + 1, 3.6)]);
  for (const [x, y] of SB.deluge) { p.cylZ(x, y, 0, 5, 14, 20, 'n').cylZ(x, y, 14, 3, 1.4, 16, 'n'); p.seg('detail', W(x, y + 5.02, 0.4), W(x, y + 5.02, 14)); }
  beam(p, [SB.deluge[2][0] + 5, 384, 3], [tx0 - 1, 384, 3], 0.8, 'n');
  // a lightning mast at each corner of the pad
  for (const [x, y] of [[1690, 392], [1872, 392], [1872, 300]]) { p.box(x - 0.6, y - 0.6, 0, 1.2, 1.2, 60, 'n', { seams:false }); p.seg('line', W(x, y, 60), W(x, y, 66)); }
}

// what the sim fills: the buildings' groups (shell, cut, inside), the spit's static parts, the raptors on the stands
export function buildStarbase() {
  const g = new THREE.Group(); g.name = 'starbase';
  const p = new Part(); ground(p); garden(p); farm(p); tower(p);
  const statics = p.build('starbaseGround'); g.add(statics);
  const building = (name: string, b: { x0: number, x1: number, y0: number, y1: number, h: number }, shellF: (p: Part) => void, insideF: (f: Part) => void, gaps: { s?: number[], e?: number[], w?: number[] }) => {
    const bg = new THREE.Group(); bg.name = name;
    const sp = new Part(); shellF(sp); const shell = sp.build(`${name}Shell`); bg.add(shell);
    const cp = new Part(); section(cp, b, b.h, gaps); const cut = cp.build(`${name}Cut`); cut.visible = false; bg.add(cut);
    const ip = new Part(); insideF(ip); const inside = ip.build(`${name}Inside`); inside.visible = false; bg.add(inside);
    bg.userData.peek = { shell, cut, inside, box:[b.x0, b.x1, b.y0, b.y1], near:true, z:[0, Math.min(30, b.h)], hides:() => false };
    g.add(bg); return bg;
  };
  const F = SB.factory, S = SB.shop;
  const factory = building('starfactory', F, factoryShell, factoryInside, { e:F.door });
  const shop = building('engineShop', S, shopShell, shopInside, { e:[S.y0 + 6, S.y0 + 14] });
  const bay1 = building('megaBay1', SB.bay1, q => bayShell(q, SB.bay1, false), f => bayInside(f, SB.bay1, 6), { s:SB.bay1.door, e:[313, 323] });
  const bay2 = building('megaBay2', SB.bay2, q => bayShell(q, SB.bay2, true), f => bayInside(f, SB.bay2, 5), { s:SB.bay2.door, w:[317, 327] });
  bay1.userData.peek.z = [0, 60]; bay2.userData.peek.z = [0, 50];
  // a robot that lays the tiles in the tiling cell
  const robot = buildRobot(); robot.scale.setScalar(2.2); robot.position.copy(W(1404 + R + 4.5, 320 + 1.5, 0)); robot.rotation.y = Math.PI * 0.85; factory.userData.peek.inside.add(robot);
  return { g, statics, factory, shop, bay1, bay2, robot };
}
// the moving machines in the factory: the ring as it is rolled (in eight arcs), the barrel on the turntable, the welding
// head on its mast; a raptor on each stand in the Engine Shop (its pieces shown as they go on)
export function buildFactoryMachines(inside: THREE.Object3D) {
  const ring = new THREE.Group(); ring.position.copy(W(1348.5, 313.5, 1.4)); inside.add(ring);
  const arcs = Array.from({ length:8 }, (_, i) => { const q = new Part(), a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2, n = 4;
    for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / n, b = a0 + (a1 - a0) * (k + 1) / n;
      // the ring stands on edge in the roll former: its axis along y
      const A = (r: number, y: number) => W(r * Math.cos(a), y, R + r * Math.sin(a)), B = (r: number, y: number) => W(r * Math.cos(b), y, R + r * Math.sin(b));
      q.poly('body', [A(R, -0.9), B(R, -0.9), B(R, 0.9), A(R, 0.9)]); q.seg('line', A(R, -0.9), B(R, -0.9)).seg('line', A(R, 0.9), B(R, 0.9)); }
    const m = q.build(`arc${i}`); ring.add(m); return m; });
  const table = new THREE.Group(); table.position.copy(W(1376, 320, 0.4)); inside.add(table);
  { const q = new Part(); hullInto(q, 0, BARREL, {}); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; q.seg('line', W((R + 0.03) * Math.cos(a), (R + 0.03) * Math.sin(a), 0), W((R + 0.03) * Math.cos(a), (R + 0.03) * Math.sin(a), BARREL)); } table.add(q.build('barrel')); }
  const head = new THREE.Group(); head.position.copy(W(1376 + R + 0.6, 320, 2)); inside.add(head);
  { const q = new Part(); q.box(0, -0.6, -0.5, 6.5, 1.2, 1.0, 'k').box(-0.4, -0.3, -0.3, 0.6, 0.6, 0.6, 'n'); head.add(q.build('weldHead')); }
  const spark = new Part(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; spark.seg('line', W(-0.3, 0, 0), W(-0.3 - 0.5 * Math.cos(a), 0.5 * Math.sin(a), 0.4 * Math.sin(a * 2))); }
  const sp = spark.build('spark'); head.add(sp);
  return { ring, arcs, table, head, spark:sp };
}
export function buildShopStands(inside: THREE.Object3D) {
  return SB.shop.stands.map(([x, y]) => { const r = buildRaptor(); r.g.position.copy(W(x, y, 1.0)); inside.add(r.g); for (const m of r.parts) m.visible = false; return r; });
}
export const RAPTOR_H = RAPTOR.h;
