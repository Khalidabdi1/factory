import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { CURB, METRO } from '../layout';
import { beam } from '../models/works';
import { Frame, buffer, escalator, levels, roundel, screenDoors, trackV, tracks } from './metro';

// ---- Sahel Central, where the lines cross ----
// After the station Zaha Hadid's office built for Riyadh's financial district: a run of white shells like dunes the
// wind has shaped, all one lattice, pierced with diamonds that glow after dark. Line 1 crosses it east to west at 12 m,
// Line 2 comes in from the north at 21 m and ends on the level above Line 1; both run through vaults in the shell. Under
// it the streets cross; a concourse spans the crossing at 5 m, reached by escalators at the four corners; from it
// escalators climb into each line's island, Line 2's a long one up past Line 1.
const L1 = METRO.lines[0], L2 = METRO.lines[1], S1 = L1.stations[1], S2 = L2.stations[1];
const [X0, X1, Y0, Y1] = [610, 706, 158, 252];
type V3 = [number, number, number];
const CZ = 5.0;
export const CENTRAL = { box:[X0, X1, Y0, Y1], z:CZ, main:[616, 700, 188, 222], wing:[650, 666, 162, 188], gates:[627, 687],
  // the corner escalators: ground foot, concourse top (each pair climbs toward the concourse)
  corners:[[620, 1], [694, 1], [620, -1], [694, -1]].map(([x, s]) => { const top = s > 0 ? 188 : 222, foot = top - s * (CZ - CURB) / METRO.escSlope;
    return { foot:[x, foot, CURB] as V3, top:[x, top, CZ] as V3, ground:[x, foot - s * 3, CURB] as V3, land:[x, top + s * 2, CZ] as V3 }; }),
};
// where each line's island escalators stand: Line 1's climbs east inside its island, Line 2's climbs south from the wing
const ESC1 = (() => { const z = levels(L1), u = 636; return { foot:u, top:u + (z.zf - CZ) / METRO.escSlope }; })();
const ESC2 = (() => { const z = levels(L2), u = 166; return { foot:u, top:u + (z.zf - CZ) / METRO.escSlope }; })();
export const centralEsc = { 1:ESC1, 2:ESC2 };

// ---- the shell: a height field over the footprint, its dunes, and vaults for the lines and streets ----
const mfun = (t: number) => Math.exp(-(t ** 4));
const bump = (x: number, y: number, cx: number, cy: number, rx: number, ry: number, h: number) => h * Math.exp(-(((x - cx) / rx) ** 2) - (((y - cy) / ry) ** 2));
export function shellZ(x: number, y: number) {
  const s = Math.max(bump(x, y, 658, 205, 34, 30, 33), bump(x, y, 628, 178, 14, 14, 18), bump(x, y, 690, 176, 14, 14, 21), bump(x, y, 626, 234, 14, 14, 21), bump(x, y, 690, 236, 14, 13, 17),
    19 * Math.exp(-(((y - 205) / 10) ** 2)) * Math.exp(-(((x - 658) / 70) ** 8)),          // Line 1's vault, end to end
    28.5 * Math.exp(-(((x - 658) / 12) ** 2)) * Math.exp(-(((y - 205) / 60) ** 8)));        // Line 2's
  // eaves: low round the edge, lifted over the lines and the streets where they pass out under it
  const eW = 3.5 + 14 * mfun((y - 205) / 9), eN = 3.5 + 23 * mfun((x - 658) / 9) + 4 * mfun((x - 640) / 7), eS = 3.5 + 4 * mfun((x - 640) / 7) + 14 * mfun((x - 658) / 9);
  const cap = Math.min(eW + 2.2 * (x - X0), eW + 2.2 * (X1 - x), eN + 2.2 * (y - Y0), eS + 2.2 * (Y1 - y));
  return Math.max(2.5, Math.min(s, cap));
}
function buildShell(p: Part) {
  const st = 2.4, nx = Math.round((X1 - X0) / st), ny = Math.round((Y1 - Y0) / st), dx = (X1 - X0) / nx, dy = (Y1 - Y0) / ny;
  const P: THREE.Vector3[][] = [];
  for (let i = 0; i <= nx; i++) { P.push([]); for (let j = 0; j <= ny; j++) { const x = X0 + i * dx, y = Y0 + j * dy; P[i].push(W(x, y, shellZ(x, y))); } }
  // each cell one tone by its slope; the lattice along the plan's axes, which the iso view turns into diamonds; a
  // smaller diamond pierced in the middle of every cell, glass by day and lit at night
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    const n = v3(0, 0, 0).crossVectors(c.clone().sub(a), d.clone().sub(b)).normalize(); if (n.y < 0) n.negate();
    const k = n.y > 0.55 ? 'deck' : 'body'; p.tri(k, a, b, c); p.tri(k, a, c, d);
    const up = n.clone().multiplyScalar(0.05), mid = a.clone().add(b).add(c).add(d).multiplyScalar(0.25).add(n.clone().multiplyScalar(0.07));
    p.seg('line', a.clone().add(up), b.clone().add(up)).seg('line', a.clone().add(up), d.clone().add(up));
    p.poly('window', [a, b, c, d].map(q => mid.clone().add(q.clone().add(up).sub(mid).multiplyScalar(0.42))));
  }
  // the edge of the shell, and glass under its eaves round the sides the camera sees; doors at the corners
  const edge = (pts: THREE.Vector3[]) => { for (let k = 1; k < pts.length; k++) p.seg('line', pts[k - 1], pts[k]); };
  edge(P.map(c => c[ny])); edge(P[nx]);
  const skirt = (pts: THREE.Vector3[], ground: (q: THREE.Vector3) => THREE.Vector3, doorAt: (q: THREE.Vector3) => boolean) => {
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; if (a.y > 9 || b.y > 9) continue;
      const ga = ground(a), gb = ground(b), door = doorAt(a) && doorAt(b);
      p.poly(door ? 'glass' : 'window', [ga, gb, b, a]); p.seg('detail', ga, a); }
  };
  skirt(P.map(c => c[ny]), q => v3(q.x, CURB, q.z), q => Math.abs(q.x - 620) < 4 || Math.abs(q.x - 694) < 4);
  skirt(P[nx], q => v3(q.x, CURB, q.z), q => Math.abs(q.z - 179) < 4 || Math.abs(q.z - 231) < 4);
}

// ---- the levels inside, the islands, escalators, gates; the trees that hold the shell up ----
export function buildCentral() {
  const g = new THREE.Group(); g.name = 'Sahel Central';
  const F1 = new Frame(L1), F2 = new Frame(L2), z1 = levels(L1), z2 = levels(L2), ISL = METRO.island;
  // ---- always there: the tree columns, piers in Souq St's middle, the skybridge to Souq Sahel, the signs ----
  const b = new Part();
  const treeCol = (x: number, y: number, zTop: number) => {
    b.cylZ(x, y, CURB, 0.75, 7.5, 10);
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const tx = x + ax * 5.5, ty = y + ay * 5.5; beam(b, [x, y, CURB + 7.3], [tx, ty, Math.min(zTop, shellZ(tx, ty)) - 0.3], 0.55, 'n'); }
  };
  for (const [x, y] of [[626, 194], [690, 194], [626, 216], [690, 216]]) treeCol(x, y, 40);
  for (const [x, y] of [[650, 170], [666, 170], [650, 240], [666, 240]]) { b.box(x - 0.8, y - 0.8, CURB, 1.6, 1.6, z2.zu - CURB - 0.2); }
  for (const x of [618, 698]) F1.box(b, x - 0.8, x + 0.8, -1.1, 1.1, 0, z1.zu - 0.2);
  b.box(700, 178, CZ + 0.4, 9, 4, 2.8, 'g').box(700, 178, CZ + 3.2, 9, 4, 0.25);   // the skybridge into Souq Sahel's upper floor
  for (const c of CENTRAL.corners) { const [x, y] = c.ground; b.box(x + 3.2, y - 0.15, CURB, 0.3, 0.3, 3.6).box(x + 2.85, y - 0.1, CURB + 3.6, 1.0, 0.1, 1.0, 'k'); }
  const sign = FRONT(668, Y1 + 0.02, 4.2); b.text(sign, 'SAHEL CENTRAL', 12, 1.2, 1.15, 'ink', 'middle', 0.06); roundel(b, sign, 2, 0.9, 0.75, 0.06);
  g.add(b.build('centralBase'));
  // ---- the shell ----
  const sh = new Part(); buildShell(sh);
  const shell = sh.build('centralShell'); g.add(shell);
  // ---- the cut: the floors, the islands, low walls round the concourse, the shell as its edge only ----
  const c = new Part();
  const [mx0, mx1, my0, my1] = CENTRAL.main, [wx0, wx1, wy0, wy1] = CENTRAL.wing;
  c.box(mx0, my0, CZ - 0.6, mx1 - mx0, my1 - my0, 0.6).box(wx0, wy0, CZ - 0.6, wx1 - wx0, wy1 - wy0, 0.6);
  for (const [x0, y0, w, d] of [[mx0, my0, 0.3, my1 - my0], [mx1 - 0.3, my0, 0.3, my1 - my0], [mx0, my1 - 0.3, mx1 - mx0, 0.3], [mx0, my0, wx0 - mx0, 0.3], [wx1, my0, mx1 - wx1, 0.3],
    [wx0, wy0, 0.3, wy1 - wy0], [wx1 - 0.3, wy0, 0.3, wy1 - wy0]]) c.box(x0, y0, CZ, w, d, 1.0);
  // Line 1 through the station: decks under its tracks, its island pierced for the escalators
  const o1 = [Math.min(ESC1.foot, ESC1.top) - 0.3, Math.max(ESC1.foot, ESC1.top) + 0.3];
  for (const s of [-1, 1]) F1.box(c, 612, 704, s > 0 ? ISL : -7.6, s > 0 ? 7.6 : -ISL, z1.zu, z1.zd - z1.zu);
  for (const [a, bb] of [[612, o1[0]], [o1[1], 704]]) F1.box(c, a, bb, -ISL, ISL, z1.zu, z1.zf - z1.zu);
  for (const s of [-1, 1]) F1.box(c, o1[0], o1[1], s > 0 ? 1.6 : -ISL, s > 0 ? ISL : -1.6, z1.zu, z1.zf - z1.zu);
  // Line 2 on its level above: the same, and its long escalator coming up through its island from the wing
  const o2 = [Math.max(S2.u0 - 4, Math.min(ESC2.foot, ESC2.top) - 0.3), Math.max(ESC2.foot, ESC2.top) + 0.3];
  for (const s of [-1, 1]) F2.box(c, 160, 240, s > 0 ? ISL : -7.6, s > 0 ? 7.6 : -ISL, z2.zu, z2.zd - z2.zu);
  for (const [a, bb] of [[160, o2[0]], [o2[1], 240]]) if (bb > a) F2.box(c, a, bb, -ISL, ISL, z2.zu, z2.zf - z2.zu);
  for (const s of [-1, 1]) F2.box(c, o2[0], o2[1], s > 0 ? 1.6 : -ISL, s > 0 ? ISL : -1.6, z2.zu, z2.zf - z2.zu);
  for (const s of [-1, 1]) { F1.box(c, 612, 704, s > 0 ? 7.2 : -7.6, s > 0 ? 7.6 : -7.2, z1.zd, 1.0); F2.box(c, 160, 240, s > 0 ? 7.2 : -7.6, s > 0 ? 7.6 : -7.2, z2.zd, 1.0); }
  // the shell's edge where it meets the ground and its ridge lines, so its shape stays readable
  for (const [ax, ay, bx2, by2] of [[X0, Y0, X1, Y0], [X1, Y0, X1, Y1], [X1, Y1, X0, Y1], [X0, Y1, X0, Y0]]) {
    const n = 40; for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, xa = ax + (bx2 - ax) * t0, ya = ay + (by2 - ay) * t0, xb = ax + (bx2 - ax) * t1, yb = ay + (by2 - ay) * t1;
      c.seg('detail', W(xa, ya, shellZ(xa, ya)), W(xb, yb, shellZ(xb, yb))); } }
  for (const [ax, ay, bx2, by2] of [[X0, 205, X1, 205], [658, Y0, 658, Y1]]) { const n = 48; for (let k = 0; k < n; k++) {
    const xa = ax + (bx2 - ax) * k / n, ya = ay + (by2 - ay) * k / n, xb = ax + (bx2 - ax) * (k + 1) / n, yb = ay + (by2 - ay) * (k + 1) / n;
    c.seg('detail', W(xa, ya, shellZ(xa, ya)), W(xb, yb, shellZ(xb, yb))); } }
  const cut = c.build('centralCut'); cut.visible = false; g.add(cut);
  // ---- inside ----
  const f = new Part(), inside = new THREE.Group(); inside.name = 'centralInside';
  tracks(f, F1, 612, 704, (u: number, s: number) => s * trackV(L1, u), false);
  tracks(f, F2, 160, 240, (u: number, s: number) => s * trackV(L2, u), false);
  for (const s of [-1, 1]) buffer(f, F2, L2.to, s, -1);
  for (const [F, st, zf] of [[F1, S1, z1.zf], [F2, S2, z2.zf]] as [Frame, typeof S1, number][]) for (const s of [-1, 1]) for (const o of screenDoors(F, st.u0, s, zf, f)) inside.add(o);
  // escalators: the corners, Line 1's pair, Line 2's long pair
  for (const cn of CENTRAL.corners) { const [x, yf] = cn.foot, yt = cn.top[1];
    for (const dx of [-0.75, 0.75]) escalator(f, new Frame({ ...L2, at:x + dx } as any), yf, yt, 0, CURB, CZ, 1.2); }
  for (const v of [-0.65, 0.65]) { escalator(f, F1, ESC1.foot, ESC1.top, v, CZ, z1.zf); escalator(f, F2, ESC2.foot, ESC2.top, v, CZ, z2.zf); }
  // gates across the concourse either side of the paid hall; ticket machines and a service desk outside them
  for (const gx of CENTRAL.gates) { for (let y = 191; y < 221; y += 1.5) if (Math.abs(y - 205) > 1) f.box(gx - 0.6, y - 0.12, CZ, 1.2, 0.24, 1.0).box(gx - 0.45, y - 0.12, CZ + 1.0, 0.4, 0.24, 0.06, 'k');
    for (const yy of [190, 220]) f.box(gx - 0.15, Math.min(yy, 205), CZ, 0.3, 0.3, 1.0); }
  for (let k = 0; k < 5; k++) { const x = 690.5 + k * 1.6; f.box(x - 0.5, 220.4, CZ, 1.0, 0.6, 1.8).box(x - 0.35, 221.0, CZ + 1.0, 0.7, 0.05, 0.6, 'w'); }
  f.box(617, 196, CZ, 4, 1.4, 1.1).box(617, 196, CZ + 1.1, 4, 0.2, 1.4, 'w');
  // a café and a kiosk in the paid hall, tables by them; the departures board hung over the hall
  f.box(668, 213, CZ, 7, 4, 2.8).box(667.6, 212.6, CZ + 2.8, 7.8, 4.8, 0.2, 'k').fill2(FRONT(668, 217, CZ + 2.8), 0.4, 0.6, 6.2, 1.4, 'window', 0.03);
  for (const [x, y] of [[670, 219.5], [673, 219.5], [676, 219.2]]) f.cylZ(x, y, CZ, 0.45, 0.75, 8).cylZ(x, y, CZ + 0.75, 0.05, 0.02, 4);
  f.box(640, 216.5, CZ, 3, 2.4, 2.4).fill2(FRONT(640, 218.9, CZ + 2.4), 0.3, 0.4, 2.4, 1.2, 'window', 0.03);
  f.box(651, 214.6, CZ + 3.2, 8, 0.2, 1.3, 'k').box(651.4, 214.55, CZ + 3.4, 7.2, 0.05, 0.9, 'w');
  for (const dx of [652, 658]) f.seg('line', W(dx, 214.7, CZ + 4.5), W(dx, 214.7, z1.zu));
  // the islands: benches back to back, columns, signs and screens
  const furnish = (F: Frame, u0: number, zf: number, zt: number, o: number[]) => {
    for (let u = u0 + 6; u < u0 + 54; u += 13) if (u < o[0] - 2 || u > o[1] + 2) F.box(f, u - 1.0, u + 1.0, -0.6, 0.6, zf, 0.42).box(f, u - 1.0, u + 1.0, -0.06, 0.06, zf + 0.42, 0.5);
    for (let u = u0 + 4.5; u < u0 + 55; u += 8.6) if (u < o[0] - 1 || u > o[1] + 1) f.cylZ(F.at(u, 0)[0], F.at(u, 0)[1], zf, 0.16, zt - zf, 8);
    for (const u of [u0 + 22, u0 + 50]) if (u < o[0] - 3 || u > o[1] + 3) F.box(f, u - 1.8, u + 1.8, -0.06, 0.06, zf + 2.9, 0.65, 'k').box(f, u + 2.2, u + 3.4, -0.08, 0.08, zf + 2.95, 0.55, 'w');
    for (const s of [-1, 1]) for (let u = u0 + 1; u < u0 + 57; u += 2) F.seg(f, 'detail', F.at(u, s * (ISL - 0.6), zf + 0.02), F.at(u + 1, s * (ISL - 0.6), zf + 0.02));
    for (const s of [-1, 1]) F.seg(f, 'line', F.at(o[0], s * 1.6, zf + 1.0), F.at(o[1], s * 1.6, zf + 1.0));
  };
  furnish(F1, S1.u0, z1.zf, z1.zf + 3.4, o1); furnish(F2, S2.u0, z2.zf, z2.zf + 4.6, o2);
  inside.add(f.build('centralFurniture')); inside.visible = false; g.add(inside);
  const doors: Record<string, THREE.Object3D> = {};
  // the screen doors' leaves, named by line and side: L1psd−1F and so on
  inside.children.forEach((o, k) => { if (o.name.startsWith('psd')) doors[`L${k < 4 ? 1 : 2}${o.name}`] = o; });
  g.userData.peek = { shell, cut, inside, box:[X0, X1, Y0, Y1], near:true, z:[0, 34], doors };
  return g;
}
