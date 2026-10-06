// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { rng } from '../kernel/math';
import { STATION } from '../layout';
import { ring } from './ground';

// Riverside Fire Station, on the old shop site off Riverside Rd: an engine hall under a gable with two roller doors to
// the street, a two-storey crew wing, and a drill tower at the back where the hoses hang to dry. Like the bank it
// opens to its section: the bays (ENG-1 is its own model, the rescue tender is drawn in), kit lockers and breathing
// sets, the sliding pole, the watch room, the mess with its kitchen, and the lounge.
export const SEATS = [[387, 105.4, Math.PI / 2], [389, 105.4, Math.PI / 2], [387, 108.0, -Math.PI / 2], [389, 108.0, -Math.PI / 2]].map(([x, y, h]) => ({ at:[x, y], h, z:0.45, by:null }));
export function buildFireStation() {
  const { x0:X0, x1:X1, y0:Y0, y1:Y1, hall:HX } = STATION, H = 7.4, CY = 99, CH = 7.0, TX = 394, TY = 99, TH = 17, z = 0;
  const DOORS = [[362.6, 367.4], [371.6, 376.4]], DH = 4.8;
  const g = new THREE.Group(); g.name = 'fireStation';

  // ---- always there: the apron before the bays, the lawn with its flagpole, the crew's parking, the yard behind ----
  const p = new Part(), G = TOP(0, 0, 0);
  p.fill2(G, X0, Y1, HX - X0, 12, 'deck', 0.02);
  const hatch = []; for (let x = X0 + 1; x < HX - 1; x += 1.2) hatch.push(x, 114, x + 1.6, 116.4);
  p.draw(G, hatch, 'detail', 0.03).rect2(G, X0 + 0.6, 113.6, HX - X0 - 1.2, 3.2, 'line', 0.03).text(G, 'KEEP CLEAR', (X0 + HX) / 2, 119.6, 0.9, 'paint', 'middle', 0.03);
  for (const [a, b] of DOORS) p.draw(G, [a + 0.3, Y1, a + 0.3, 123.6, b - 0.3, Y1, b - 0.3, 123.6], 'detail', 0.03);
  p.fill2(G, HX, Y1, X1 - HX, 2.8, 'grass', 0.02);
  p.seg('line', W(397.4, 113.3, 0), W(397.4, 113.3, 9.2)).cylZ(397.4, 113.3, 0, 0.35, 0.25, 8);
  p.fill2(FRONT(397.45, 113.3, 9.1), 0, 0, 1.5, 0.95, 'kob', 0.02).rect2(FRONT(397.45, 113.3, 9.1), 0, 0, 1.5, 0.95, 'line', 0.025);
  for (const x of [380, 384.3, 388.6, 392.9]) p.draw(G, [x, 116.2, x, 123.2], 'detail', 0.03);
  p.fill2(G, HX, Y0, TX - HX, CY - Y0, 'road', 0.02);
  // two of the watch's cars, nose in, drawn into the base rather than as cars of their own
  for (const [x, t] of [[382.15, 'n'], [390.75, 'k']]) {
    p.box(x - 0.95, 117.0, 0.35, 1.9, 4.2, 0.75, t).box(x - 0.85, 118.0, 1.1, 1.7, 2.1, 0.62, t);
    for (const y of [117.8, 120.4]) for (const wx of [x - 1.04, x + 0.72]) p.box(wx, y - 0.36, 0, 0.32, 0.72, 0.72, 'k');
  }
  g.add(p.build('stationBase'));

  // ---- the shell: hall, crew wing, tower ----
  const s = new Part();
  s.box(X0, Y0, z, HX - X0, Y1 - Y0, H);
  s.extrude([[X0 - 0.3, Y1 + 0.3, H - 0.1], [(X0 + HX) / 2, Y1 + 0.3, H + 2.4], [HX + 0.3, Y1 + 0.3, H - 0.1]], [0, -(Y1 - Y0 + 0.6), 0]);
  for (let t = 0.2; t < 1; t += 0.2) { const xx = (X0 + HX) / 2 + t * ((HX - X0) / 2 + 0.3), zz = H + 2.4 - t * 2.5; s.seg('detail', W(xx, Y1 + 0.3, zz), W(xx, Y0 - 0.3, zz)); }
  s.box(HX, CY, z, X1 - HX, Y1 - CY, CH).box(HX - 0.2, CY - 0.2, z + CH, X1 - HX + 0.4, Y1 - CY + 0.4, 0.35);
  s.box(TX, Y0, z, X1 - TX, TY - Y0, TH).box(TX - 0.25, Y0 - 0.25, z + TH, X1 - TX + 0.5, TY - Y0 + 0.5, 0.4).box(396.7, TY, z + TH - 0.6, 0.3, 1.6, 0.3, 'k');
  // the hall's front: pilasters, the name over the doors, a roundel in the gable, the door frames
  const F = FRONT(X0, Y1, H);
  s.draw(F, [0.35, 0, 0.35, H, 8.6, 2.6, 8.6, H, 9.4, 2.6, 9.4, H, HX - X0 - 0.35, 0, HX - X0 - 0.35, H], 'line').text(F, 'FIRE STATION', 9, 1.25, 0.95, 'ink', 'middle');
  // the doorways, dark behind the doors, so a bay stands open when its door rolls up
  for (const [a, b] of DOORS) s.fill2(F, a - X0, H - DH, b - a, DH, 'glass').rect2(F, a - X0 - 0.15, H - DH - 0.15, b - a + 0.3, DH + 0.15, 'line');
  for (const r of [0.75, 0.55]) { const q = ring(0, 0, r, 0, 20); for (let i = 0; i < q.length; i += 2) s.seg('line', W((X0 + HX) / 2 + q[i].x, Y1 + 0.31, H + 1.0 + q[i].z), W((X0 + HX) / 2 + q[i + 1].x, Y1 + 0.31, H + 1.0 + q[i + 1].z)); }
  // the crew wing: the watch room's window, the door under a canopy, an upper floor of rooms
  const C = FRONT(HX, Y1, CH), S = SIDE(X1, Y1, CH);
  s.fill2(C, 0.8, 3.9, 4.8, 2.3, 'window').rect2(C, 0.8, 3.9, 4.8, 2.3, 'line').draw(C, [2.4, 3.9, 2.4, 6.2, 4.0, 3.9, 4.0, 6.2], 'line');
  s.fill2(C, 10.2, 4.6, 1.8, 2.4).rect2(C, 10.2, 4.6, 1.8, 2.4, 'line').box(HX + 9.8, Y1, z + 2.55, 2.6, 1.2, 0.14);
  for (const u of [6.6, 13.4, 16.4, 19.4]) s.fill2(C, u, 4.4, 1.6, 1.5, rng() < 0.5 ? 'window' : 'glass').rect2(C, u, 4.4, 1.6, 1.5, 'line');
  for (let u = 1.0; u < X1 - HX - 1; u += 3) s.fill2(C, u, 1.0, 1.6, 1.4, rng() < 0.55 ? 'window' : 'glass').rect2(C, u, 1.0, 1.6, 1.4, 'line');
  s.draw(C, [0, 3.5, X1 - HX, 3.5], 'detail');
  for (const v of [1.0, 4.4]) for (let u = 1.2; u < Y1 - CY - 1; u += 3.2) s.fill2(S, u, v, 1.6, 1.4, rng() < 0.5 ? 'window' : 'glass').rect2(S, u, v, 1.6, 1.4, 'line');
  // the drill tower: an opening on each floor, front and side, for ladder drills
  for (const [M, low] of [[FRONT(TX, TY, TH), TH - CH - 2], [SIDE(X1, TY, TH), TH - 2]]) for (let v = 1.2; v < low; v += 3) s.fill2(M, 1.8, v, 1.6, 1.7, 'glass').rect2(M, 1.8, v, 1.6, 1.7, 'line');
  const shell = s.build('stationShell'); g.add(shell);
  // the roller doors, hung from their tops so they roll up; the call light over them
  DOORS.forEach(([a, b], i) => {
    const d = new Part(), w = b - a, M = FRONT(0, 0.12, 0);
    d.box(0, 0, -DH, w, 0.12, DH); const sl = []; for (let v = 0.3; v < DH; v += 0.3) sl.push(0.1, v, w - 0.1, v); d.draw(M, sl, 'detail', 0.01);
    const o = d.build(`door${i + 1}`); o.position.copy(W(a, Y1, DH)); shell.add(o);
  });
  shell.add(new Part().box((X0 + HX) / 2 - 0.5, Y1, H - 1.95, 1.0, 0.3, 0.4, 'k').build('callLight'));

  // ---- the cut: walls low and hatched (door gaps in the street wall and between hall and crew wing), roofs as outlines ----
  const c = new Part(), T = 0.4, LOW = 1.0;
  const wall = (bx, by, bw, bd) => { c.box(bx, by, z, bw, bd, LOW); const segs = [], n = Math.max(bw, bd);
    for (let u = 0.3; u < n - 0.1; u += 0.6) segs.push(...(bw > bd ? [u, 0, Math.min(n, u + T), bd] : [0, u, bw, Math.min(n, u + T)])); c.draw(TOP(bx, by, z + LOW), segs); };
  for (const r of [[X0, Y0, HX - X0, T], [X0, Y0, T, Y1 - Y0], [X0, Y1 - T, DOORS[0][0] - X0, T], [DOORS[0][1], Y1 - T, DOORS[1][0] - DOORS[0][1], T], [DOORS[1][1], Y1 - T, HX - DOORS[1][1], T],
    [HX - T / 2, Y0, T, 103.4 - Y0], [HX - T / 2, 105, T, Y1 - 105], [HX, CY, TX - HX, T], [HX, Y1 - T, 388.2 - HX, T], [390, Y1 - T, X1 - 390, T], [X1 - T, Y0, T, Y1 - Y0],
    [TX, Y0, X1 - TX, T], [TX, Y0, T, TY - Y0]]) wall(...r);
  const outline = (pts, zz) => { for (let i = 0; i < pts.length; i++) c.seg('detail', W(...pts[i], zz), W(...pts[(i + 1) % pts.length], zz)); };
  outline([[X0, Y0], [HX, Y0], [HX, Y1], [X0, Y1]], H); outline([[HX, CY], [X1, CY], [X1, Y1], [HX, Y1]], CH); outline([[TX, Y0], [X1, Y0], [X1, TY], [TX, TY]], TH);
  c.seg('detail', W(X0, Y1, H), W((X0 + HX) / 2, Y1, H + 2.4)).seg('detail', W((X0 + HX) / 2, Y1, H + 2.4), W(HX, Y1, H)).seg('detail', W((X0 + HX) / 2, Y1, H + 2.4), W((X0 + HX) / 2, Y0, H + 2.4));
  for (const [a, b] of DOORS) c.seg('detail', W(a, Y1, DH), W(b, Y1, DH));
  const cut = c.build('stationCut'); cut.visible = false; g.add(cut);

  // ---- inside ----
  const f = new Part(), Gz = TOP(0, 0, z), lift = 0.02;
  f.fill2(TOP(X0, Y0, z), 0, 0, HX - X0, Y1 - Y0, 'deck', 0.02).fill2(TOP(HX, CY, z), 0, 0, X1 - HX, Y1 - CY, 'deck', 0.02).fill2(TOP(TX, Y0, z), 0, 0, X1 - TX, TY - Y0, 'deck', 0.02);
  // the bays: outlines and names on the floor
  for (const [x, n] of [[365, 'ENG-1'], [374, 'RSQ-1']]) f.rect2(Gz, x - 3, 99.4, 6, 12.2, 'detail', lift).text(Gz, n, x, 98.9, 0.6, 'paint', 'middle', lift);
  // the rescue tender in bay 2, nose out like the engine
  f.box(372.8, 100.9, 0.45, 2.4, 6.6, 2.55, 'k').box(372.8, 107.6, 0.45, 2.4, 2.9, 2.25, 'k');
  f.fill2(FRONT(372.8, 110.5, 2.7), 0.2, 0.2, 2.0, 0.8, 'glass', 0.03).fill2(FRONT(372.8, 110.5, 2.7), 0.1, 1.2, 2.2, 0.28, 'deck', 0.03);
  const RS = SIDE(375.2, 107.5, 3.0); f.fill2(RS, 0.2, 1.0, 6.2, 0.3, 'deck', 0.03).text(RS, 'RESCUE', 3.3, 1.25, 0.26, 'ink', 'middle', 0.035);
  for (let k = 0; k < 3; k++) f.rect2(RS, 0.4 + k * 2.0, 1.45, 1.8, 1.3, 'koline', 0.035);
  for (const y of [102.2, 108.9]) for (const x of [372.6, 375.0]) f.box(x, y, 0, 0.3, 0.9, 0.9, 'k');
  // the west wall: kit lockers with helmets on top and tunics hanging; breathing sets on a rack; hose coils
  for (let k = 0; k < 8; k++) { const ly = 96.2 + k * 1.4; f.box(X0 + 0.4, ly, z, 0.6, 1.3, 2.0).cylZ(X0 + 0.7, ly + 0.65, z + 2.0, 0.16, 0.14, 8, 'k').box(X0 + 1.0, ly + 0.35, z + 0.9, 0.08, 0.6, 0.9, 'k'); }
  for (let k = 0; k < 6; k++) { const bx = 362.2 + k * 1.05; f.box(bx, Y0 + 0.4, z + 0.85, 0.9, 0.5, 0.06).cylZ(bx + 0.45, Y0 + 0.65, z + 0.91, 0.14, 0.64, 8, 'k'); }
  f.box(362, Y0 + 0.4, z, 6.4, 0.5, 0.85);
  for (let k = 0; k < 6; k++) f.cylY(369.6 + k * 0.9, Y0 + 0.45, z + 0.75, 0.32, 0.14, 12, 'k');
  f.box(369.1, Y0 + 0.4, z, 5.6, 0.3, 0.42);
  // the sliding pole down from the rest room, a mat under it
  f.cylZ(376.6, 97.4, z, 0.06, H - 0.3, 6);
  for (const [r, zz] of [[0.7, z + lift], [0.5, H - 0.25]]) { const q = ring(376.6, 97.4, r, zz, 20); for (let i = 0; i < q.length; i += 2) f.seg('line', q[i], q[i + 1]); }
  // the watch room: glass on the hall side, a desk under the window with screens and the turnout printer, a map
  for (const [bx, by, bw, bd] of [[HX, 105.9, 4.4, 0.1], [383.6, 105.9, 0.4, 0.1]]) f.box(bx, by, z, bw, bd, 2.6);
  const WG = FRONT(HX, 106, 2.6); f.fill2(WG, 0.1, 0.2, 4.2, 1.6, 'glass', 0.02).rect2(WG, 0.1, 0.2, 4.2, 1.6, 'line', 0.025);
  f.box(378.6, 110.4, z, 4.8, 0.9, 0.75);
  for (const sx of [379.3, 380.6, 381.9]) f.box(sx, 110.8, z + 0.75, 0.9, 0.08, 0.55, 'w');
  f.box(382.9, 110.6, z + 0.75, 0.42, 0.36, 0.22, 'k').box(380.5, 109.0, z, 0.5, 0.5, 0.45);
  f.rect2(FRONT(HX + 0.6, 106.1, 2.4), 0, 0.1, 2.6, 1.3, 'line', -0.03);
  for (const [mx, my] of [[0.5, 0.4], [1.2, 0.7], [2.0, 0.5], [0.8, 1.0]]) f.draw(FRONT(HX + 0.6, 106.1, 2.4), [mx, my, mx + 0.4, my + 0.15], 'detail', -0.03);
  // the mess: a table for four, the kitchen along the back wall, a fridge, a noticeboard
  f.box(386, 106.0, z, 4, 1.4, 0.75);
  for (const st of SEATS) { const [sx, sy] = st.at, b = st.h > 0 ? -0.28 : 0.2; f.box(sx - 0.24, sy - 0.24, z, 0.48, 0.48, 0.45).box(sx - 0.24, sy + b, z + 0.45, 0.48, 0.08, 0.5); }
  for (const [mx, my] of [[386.6, 106.4], [388.4, 106.7], [389.3, 106.3]]) f.cylZ(mx, my, z + 0.75, 0.12, 0.1, 8, 'k');
  f.box(384.2, CY + 0.4, z, 8.8, 0.7, 0.9).box(384.2, CY + 0.4, z + 0.9, 8.8, 0.7, 0.05, 'k').box(393.2, CY + 0.4, z, 0.7, 0.7, 1.9);
  for (const hx of [386.0, 386.7]) f.cylZ(hx, CY + 0.75, z + 0.95, 0.18, 0.02, 10);
  f.rect2(FRONT(388.6, CY + 0.42, 2.3), 0, 0, 1.6, 0.9, 'line', 0.02);
  // the stairs up to the rest room, cut a metre up
  for (let k = 0; k < 6; k++) f.box(HX + 0.6 + k * 0.6, CY + 0.4, z, 0.6, 1.4, 0.17 * (k + 1));
  // the lounge: a sofa facing the television, a low table
  f.box(394.6, 109.9, z, 4.2, 0.9, 0.42).box(394.6, 110.6, z, 4.2, 0.2, 0.85).box(394.6, 109.9, z, 0.2, 0.9, 0.6).box(398.6, 109.9, z, 0.2, 0.9, 0.6);
  f.box(395.4, 107.4, z, 2.4, 1.0, 0.4).box(395.4, 103.0, z, 2.6, 0.5, 0.5).box(395.6, 103.2, z + 0.5, 2.2, 0.1, 1.2, 'w');
  // the drill tower: hoses hung full length to dry
  for (let k = 0; k < 5; k++) { const hx = 395.0 + k * 0.95; f.seg('line', W(hx, 96.5, TH - 1.2), W(hx, 96.5, 1.6)).box(hx - 0.08, 96.42, 1.35, 0.16, 0.16, 0.25, 'k'); }
  f.box(TX + 0.4, Y0 + 0.4, TH - 1.2, X1 - TX - 0.8, 0.2, 0.2);
  const inside = f.build('stationInside'); inside.visible = false; g.add(inside);
  g.userData.peek = { shell, cut, inside, box:[X0, X1, Y0, Y1] };
  return g;
}
