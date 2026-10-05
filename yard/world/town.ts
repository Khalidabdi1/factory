// @ts-nocheck
import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part, pose, v3 } from '../kernel/part';
import { rand, rng } from '../kernel/math';
import { CURB } from '../layout';
import { crown, palm, ring, roof4, tree, yaw } from './ground';
import { buildCar } from '../models/vehicles';
import { houseSection, villaSection } from './interiors';

// ---- town buildings ----
// windows on one face, in rows from the top; at night only some of them light up
function windows(p, M, w, h, { x0 = 1.2, y0 = 1.0, ww = 1.4, wh = 1.5, dx = 3, dy = 3, skip = () => false, lit = 0.6 } = {}) {
  for (let v = y0; v + wh <= h - 0.4; v += dy) for (let u = x0; u + ww <= w - 0.3; u += dx) {
    if (skip(u, v)) continue;
    p.fill2(M, u, v, ww, wh, rng() < lit ? 'window' : 'glass').rect2(M, u, v, ww, wh, 'line', 0.04);
  }
}
export function buildFlats(name, x, y, w, d, h, door) {
  const p = new Part(), z = CURB;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.25, y - 0.25, z + h, w + 0.5, d + 0.5, 0.45);
  const F = FRONT(x, y + d, z + h), S = SIDE(x + w, y + d, z + h);
  windows(p, F, w, h, { skip:(u, v) => v > h - 3.5 && Math.abs(u + 0.7 - door) < 2.6 });
  windows(p, S, d, h, { x0:1.4 });
  for (let v = 3; v < h; v += 3) { p.draw(F, [0, v - 0.25, w, v - 0.25]); p.draw(S, [0, v - 0.25, d, v - 0.25]); }
  p.fill2(F, door - 1.1, h - 2.7, 2.2, 2.7).rect2(F, door - 1.1, h - 2.7, 2.2, 2.7, 'line');
  p.box(x + door - 1.8, y + d, z + 2.8, 3.6, 1.4, 0.18);
  p.text(F, name.toUpperCase(), door + 2.2, h - 2.0, 0.55);
  for (const [dx, dy] of [[3, 3], [w - 7, 4]]) { p.box(x + dx, y + dy, z + h + 0.45, 3.6, 2.6, 1.3); p.draw(FRONT(x + dx, y + dy + 2.6, z + h + 1.75), [0.4, 0.4, 3.2, 0.4, 0.4, 0.75, 3.2, 0.75]); }
  p.cylZ(x + w / 2, y + d / 2, z + h + 0.45, 1.3, 2.2, 12);
  return p.build('flats');
}
// Harbour Bank: a portico of columns under a pediment, steps up to the door. Like the homes it opens to its section:
// the banking hall with its counter and screens, the back office, the vault with a round door that swings open.
export const BANK = { x0:102, x1:130, y0:168, y1:192, door:[116, 194.9], back:[108.3, 165.2], vault:[122.2, 176.2] };
export function buildBank() {
  const p = new Part(), s = new Part(), z = CURB, x = 102, y = 168, w = 28, d = 24, h = 9;
  s.box(x, y, z, w, d, h);
  s.box(x - 0.3, y - 0.3, z + h, w + 0.6, d + 0.6, 0.5);
  for (let i = 0; i < 3; i++) p.box(x + 3, y + d, z, w - 6, 2.4 - 0.8 * i, 0.15 * (i + 1));
  for (let i = 0; i < 7; i++) s.box(x + 3.6 + i * 3.4, y + d, z + 0.45, 0.8, 0.6, h - 2.05);
  s.box(x + 2.8, y + d - 0.1, z + h - 1.6, w - 5.6, 0.9, 1.6);
  s.extrude([[x + 8, y + d + 0.8, z + h + 0.5], [x + w - 8, y + d + 0.8, z + h + 0.5], [x + w / 2, y + d + 0.8, z + h + 2.6]], [0, -3, 0]);
  const E = FRONT(x + 2.8, y + d + 0.8, z + h);
  s.text(E, 'HARBOUR BANK', (w - 5.6) / 2, 1.05, 0.8, 'ink', 'middle');
  const F = FRONT(x, y + d, z + h);
  for (let i = 0; i < 6; i++) { const u = 4.6 + i * 3.4; if (i === 2 || i === 3) continue; s.fill2(F, u, 2.4, 1.8, 4.6, rng() < 0.4 ? 'window' : 'glass').rect2(F, u, 2.4, 1.8, 4.6, 'line'); }
  s.fill2(F, 12.5, 4.6, 3, 3.95).rect2(F, 12.5, 4.6, 3, 3.95, 'line').draw(F, [14, 4.6, 14, 8.55], 'line');
  windows(s, SIDE(x + w, y + d, z + h), d, h, { x0:2, ww:1.6, wh:2.4, dx:3.6, dy:4, y0:1.6, lit:0.3 });
  const g = new THREE.Group(); g.name = 'bank';
  const shell = s.build('bankShell'); g.add(p.build('bankBase'), shell);
  shell.add(new Part().box(x + w - 2.4, y + d + 0.02, z + h - 3.4, 1.2, 0.4, 0.7, 'k').build('alarm'));
  // the cut: walls low and hatched, the front door and the back door open, column stubs, the roof as an outline
  const c = new Part(), T = 0.5, LOW = 1.0;
  for (const [bx, by, bw, bd] of [[x, y, 107.5 - x, T], [109, y, x + w - 109, T], [x, y, T, d], [x + w - T, y, T, d], [x, y + d - T, 114.5 - x, T], [117.5, y + d - T, x + w - 117.5, T]]) {
    c.box(bx, by, z, bw, bd, LOW); const segs = [], n = Math.max(bw, bd);
    for (let u = 0.3; u < n - 0.1; u += 0.6) segs.push(...(bw > bd ? [u, 0, Math.min(n, u + T), bd] : [0, u, bw, Math.min(n, u + T)]));
    c.draw(TOP(bx, by, z + LOW), segs);
  }
  for (let i = 0; i < 7; i++) c.box(x + 3.6 + i * 3.4, y + d, z + 0.45, 0.8, 0.6, LOW);
  for (const [a, b] of [[[x, y, z + h], [x + w, y, z + h]], [[x + w, y, z + h], [x + w, y + d, z + h]], [[x + w, y + d, z + h], [x, y + d, z + h]], [[x, y + d, z + h], [x, y, z + h]]]) c.seg('detail', W(...a), W(...b));
  c.seg('detail', W(x + 8, y + d + 0.8, z + h + 0.5), W(x + w / 2, y + d + 0.8, z + h + 2.6)).seg('detail', W(x + w / 2, y + d + 0.8, z + h + 2.6), W(x + w - 8, y + d + 0.8, z + h + 0.5));
  const cut = c.build('bankCut'); cut.visible = false; g.add(cut);
  // Inside. The walls are cut to a metre, so everything stands free: it is on the floor, on the furniture or on the
  // inner walls (the manager's glass office and the vault, which are drawn full height).
  const f = new Part(), Gz = TOP(0, 0, z), lift = 0.02;
  f.fill2(TOP(x, y, z), 0, 0, w, d, 'deck', 0.012);
  // the hall's floor: tiles inside a border, a compass medallion in the middle, a line to wait behind
  for (let u = 103.6; u < 129; u += 1.2) f.draw(Gz, [u, 179.6, u, 191.2], 'detail', lift);
  for (let v = 180.4; v < 191.4; v += 1.2) f.draw(Gz, [103.2, v, 128.8, v], 'detail', lift);
  f.rect2(Gz, 103.2, 179.6, 25.6, 11.6, 'line', lift + 0.005).rect2(Gz, 103.6, 180.0, 24.8, 10.8, 'line', lift + 0.005);
  for (const r of [1.6, 1.1]) { const q = ring(116, 186.2, r, z + lift + 0.01, 24); for (let i = 0; i < q.length; i += 2) f.seg('line', q[i], q[i + 1]); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r = k % 2 ? 0.7 : 1.5; f.draw(Gz, [116, 186.2, 116 + r * Math.cos(a), 186.2 + r * Math.sin(a)], 'line', lift + 0.01); }
  f.draw(Gz, [104.5, 182.8, 112.6, 182.8, 119.4, 182.8, 126.5, 182.8], 'line', lift + 0.01).text(Gz, 'PLEASE WAIT HERE', 116, 182.3, 0.32, 'paint', 'middle', lift + 0.01);
  // two columns, a rope queue with a gap in the middle, a stand with the queue display
  for (const [cx, cy] of [[106.6, 188.6], [125.4, 188.6]]) f.cylZ(cx, cy, z, 0.42, 0.3, 12).cylZ(cx, cy, z + 0.3, 0.3, 3.2, 12).cylZ(cx, cy, z + 3.5, 0.42, 0.25, 12);
  for (const px of [110.6, 112.6, 119.4, 121.4]) { f.cylZ(px, 184.0, z, 0.18, 0.05, 8).box(px - 0.04, 183.96, z, 0.08, 0.08, 0.95).box(px - 0.07, 183.93, z + 0.95, 0.14, 0.14, 0.08, 'k'); }
  for (const [a, b] of [[110.6, 112.6], [119.4, 121.4]]) for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 1) / 6, sag = t => 0.9 - Math.sin(t * Math.PI) * 0.18;
    f.seg('koline', W(a + (b - a) * t0, 184.0, z + sag(t0)), W(a + (b - a) * t1, 184.0, z + sag(t1))); }
  f.box(127.6, 184.6, z, 0.12, 0.12, 2.0).box(127.0, 184.5, z + 2.0, 1.4, 0.3, 0.75, 'k');
  const Q = FRONT(127.0, 184.8, z + 2.75); f.fill2(Q, 0.12, 0.1, 1.16, 0.55, 'window').text(Q, 'NOW SERVING', 0.7, 0.32, 0.16, 'ink', 'middle', 0.05).text(Q, 'A 27', 0.7, 0.6, 0.22, 'ink', 'middle', 0.05);
  // waiting: two sofas either side of a low table with magazines; a stand-up desk for forms; plants
  for (const [sy, face] of [[182.6, 1], [189.4, -1]]) { f.box(102.9, sy - 0.45, z, 3.6, 0.9, 0.42).box(102.9, face > 0 ? sy - 0.45 : sy + 0.25, z, 3.6, 0.2, 0.85).box(102.9, sy - 0.45, z, 0.2, 0.9, 0.6).box(106.3, sy - 0.45, z, 0.2, 0.9, 0.6); }
  f.box(103.4, 185.2, z, 2.6, 1.2, 0.4);
  for (const [mx, my] of [[103.7, 185.5], [104.6, 185.7], [105.3, 185.4]]) f.box(mx, my, z + 0.4, 0.5, 0.36, 0.02, 'k');
  f.box(109.4, 186.6, z, 1.8, 0.7, 1.1).box(109.5, 186.7, z + 1.1, 1.6, 0.5, 0.02, 'k');
  for (const px of [109.8, 110.6]) f.seg('koline', W(px, 186.95, z + 1.13), W(px + 0.18, 186.95, z + 1.2));
  for (const [px, py] of [[103.8, 190.8], [128.6, 180.2], [113.2, 190.8]]) f.cylZ(px, py, z, 0.32, 0.45, 8).geo(crown, new THREE.Matrix4().compose(W(px, py, z + 0.95), yaw(0.4), v3(0.5, 0.6, 0.5)), 'gs');
  // the counter: three numbered windows, each with a screen, a keypad and a stool behind; glass between and above
  f.box(104.5, 178.6, z, 22, 0.8, 1.05).box(104.4, 178.5, z + 1.05, 22.2, 1.0, 0.06, 'k');
  for (let k = 0; k < 4; k++) f.box(104.5 + k * 7.0 + 0.2, 178.95, z + 1.11, 0.08, 0.1, 1.0, 'k');
  for (let k = 0; k < 3; k++) {
    const cx = 109 + k * 7, M = FRONT(cx - 2.6, 178.96, z + 2.11);
    f.fill2(M, 0, 0, 5.2, 0.98, 'glass', 0.02).rect2(M, 0, 0, 5.2, 0.98, 'line', 0.025).text(M, String(k + 1), 2.6, 0.3, 0.26, 'ink', 'middle', 0.04);
    f.box(cx - 0.45, 178.75, z + 1.11, 0.9, 0.08, 0.6).box(cx - 0.4, 178.83, z + 1.17, 0.8, 0.02, 0.48, 'w');
    f.box(cx + 0.7, 178.9, z + 1.11, 0.36, 0.26, 0.05, 'k').cylZ(cx, 176.3, z, 0.22, 0.62, 8).cylZ(cx, 176.3, z + 0.62, 0.3, 0.06, 10);
  }
  // the cash machines, side by side in a lit panel by the door
  for (const ay of [189.0, 190.3]) { f.box(128.9, ay, z, 0.7, 1.1, 1.75).box(128.85, ay + 0.2, z + 1.0, 0.06, 0.7, 0.45, 'w').box(128.75, ay + 0.15, z + 0.85, 0.15, 0.8, 0.08, 'k'); }
  // the manager's office: glass walls with a door, a desk with a screen, chairs, a cabinet and framed certificates
  for (const [bx, by, bw, bd] of [[111.2, 173.9, 1.8, 0.12], [114.5, 173.9, 4.0, 0.12], [111.2, 168.5, 0.12, 5.4]]) {
    f.box(bx, by, z, bw, bd, 0.9).box(bx, by, z + 2.5, bw, bd, 0.12);
    const gl = bw > bd ? FRONT(bx, by + bd, z + 2.5) : SIDE(bx + bw, by + bd, z + 2.5); f.fill2(gl, 0, 0, Math.max(bw, bd), 1.6, 'glass', 0.02).rect2(gl, 0, 0, Math.max(bw, bd), 1.6, 'line', 0.025);
  }
  f.box(113.6, 169.6, z, 3.2, 1.3, 0.75).box(114.9, 169.7, z + 0.75, 0.7, 0.08, 0.45, 'w').box(114.3, 171.4, z, 0.6, 0.6, 0.48).box(114.0, 172.6, z, 0.5, 0.5, 0.45).box(115.6, 172.6, z, 0.5, 0.5, 0.45);
  f.box(117.4, 168.6, z, 1.0, 0.5, 1.4);
  for (const u of [0.6, 2.0]) f.rect2(FRONT(111.6, 168.55, z + 2.4), u, 0.1, 1.0, 0.7, 'line', -0.03).rect2(FRONT(111.6, 168.55, z + 2.4), u + 0.12, 0.22, 0.76, 0.46, 'detail', -0.03);
  // the staff corner by the back door: a kitchenette, a coffee machine, a water cooler, lockers, a copier
  f.box(102.6, 172.2, z, 0.62, 3.4, 0.9).box(102.7, 172.5, z + 0.9, 0.45, 0.4, 0.45, 'k').box(102.7, 173.4, z + 0.9, 0.36, 0.34, 0.3);
  f.box(102.6, 176.0, z, 0.4, 0.4, 1.2).cylZ(102.8, 176.2, z + 1.2, 0.15, 0.4, 8, 'g');
  for (let k = 0; k < 4; k++) f.box(103.2 + k * 0.62, y + 0.55, z, 0.6, 0.5, 1.9).draw(FRONT(103.2 + k * 0.62, y + 1.05, z + 1.9), [0.45, 0.6, 0.45, 0.8], 'detail');
  f.box(106.8, 175.4, z, 1.1, 0.7, 1.05).box(106.85, 175.45, z + 1.05, 1.0, 0.6, 0.12, 'k');
  // the vault: a strong room in the north-east corner with a sign and a camera over its door, deposit boxes on two
  // walls, a table of cash, gold bars, sacks and a trolley
  f.box(119, y + 0.5, z, 0.5, 6.1, 2.8).box(119, 174.6, z, 2.0, 0.5, 2.8).box(123.4, 174.6, z, x + w - 0.5 - 123.4, 0.5, 2.8);
  f.box(119, 174.6, z + 2.8, x + w - 0.5 - 119, 0.5, 0.25, 'k');
  const V = FRONT(119.6, 175.12, z + 2.75); f.fill2(V, 0.3, 0.12, 1.4, 0.42, 'kob', 0.02).text(V, 'VAULT', 1.0, 0.43, 0.3, 'ink', 'middle', 0.04);
  for (const cx of [119.3, x + w - 0.8]) f.box(cx - 0.12, 175.1, z + 2.45, 0.24, 0.35, 0.2, 'k').cylY(cx, 175.45, z + 2.55, 0.06, 0.12, 6);
  for (const M of [FRONT(119.5, y + 0.55, z + 2.4), SIDE(x + w - 0.55, 174.5, z + 2.4)]) for (let u = 0.2; u < 6; u += 0.5) for (let v = 0.1; v < 2.2; v += 0.45) f.rect2(M, u, v, 0.42, 0.38, 'detail', -0.03).draw(M, [u + 0.17, v + 0.19, u + 0.25, v + 0.19], 'line', -0.03);
  f.box(123.6, 170.4, z, 3.0, 1.2, 0.85);
  for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) f.box(123.8 + k * 0.7, 170.55 + j * 0.5, z + 0.85, 0.6, 0.42, 0.12 + (k + j) % 2 * 0.12, 'k');
  for (let k = 0; k < 6; k++) f.extrude([[120.4 + (k % 3) * 0.42, 169.2 + Math.floor(k / 3) * 0.3, z + Math.floor(k / 3) * 0.1], [120.4 + (k % 3) * 0.42 + 0.36, 169.2 + Math.floor(k / 3) * 0.3, z + Math.floor(k / 3) * 0.1],
    [120.4 + (k % 3) * 0.42 + 0.3, 169.2 + Math.floor(k / 3) * 0.3, z + Math.floor(k / 3) * 0.1 + 0.1], [120.4 + (k % 3) * 0.42 + 0.06, 169.2 + Math.floor(k / 3) * 0.3, z + Math.floor(k / 3) * 0.1 + 0.1]], [0, 0.22, 0], 'k');
  for (const [sx, sy] of [[127.6, 169.4], [128.4, 170.3], [127.7, 171.3]]) { f.geo(new THREE.CylinderGeometry(0.22, 0.3, 0.55, 8), new THREE.Matrix4().compose(W(sx, sy, z + 0.28), new THREE.Quaternion(), v3(1, 1, 1)), 'kb'); f.cylZ(sx, sy, z + 0.55, 0.08, 0.12, 6, 'kb'); }
  f.box(120.4, 172.6, z + 0.25, 1.6, 0.8, 0.6, 'kb').seg('line', W(120.3, 172.6, z + 0.85), W(120.3, 173.4, z + 0.85));
  for (const [wx, wy] of [[120.6, 172.6], [121.8, 172.6], [120.6, 173.4], [121.8, 173.4]]) f.cylY(wx, wy - 0.05, z + 0.12, 0.12, 0.1, 6);
  const inside = f.build('bankInside'); inside.visible = false; g.add(inside);
  // the vault door, hinged at its west edge: a heavy disc with a ring of bolts and a wheel on its face
  const vd = new Part();
  vd.geo(new THREE.CylinderGeometry(1.15, 1.15, 0.45, 18), new THREE.Matrix4().compose(W(1.2, 0.25, 1.3), new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), v3(1, 1, 1)), 'k');
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; vd.seg('line', W(1.2 + 0.95 * Math.cos(a), 0.49, 1.3 + 0.95 * Math.sin(a)), W(1.2 + 1.08 * Math.cos(a), 0.49, 1.3 + 1.08 * Math.sin(a))); }
  const wheel = ring(0, 0, 0.42, 0, 16).map(p => W(1.2 + p.x, 0.52, 1.3 + p.z));
  for (let i = 0; i < wheel.length; i += 2) vd.seg('line', wheel[i], wheel[i + 1]);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; vd.seg('line', W(1.2, 0.52, 1.3), W(1.2 + 0.42 * Math.cos(a), 0.52, 1.3 + 0.42 * Math.sin(a))); }
  vd.box(1.1, 0.45, 1.2, 0.2, 0.1, 0.2, 'k');
  const vault = vd.build('vaultDoor'); vault.position.copy(W(121, 174.6, z)); inside.add(vault);
  g.userData.peek = { shell, cut, inside, box:[x, x + w, y, y + d] };
  return g;
}
// the café's terrace tables (x), each with a chair either side
export const CAFE_TABLES = [140, 147, 155, 162];
export function buildCafe() {
  const p = new Part(), z = CURB, x = 136, y = 174, w = 30, d = 12, h = 4.6;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.2, y - 0.2, z + h, w + 0.4, d + 0.4, 0.3);
  const F = FRONT(x, y + d, z + h);
  p.fill2(F, 1.2, 1.4, 11, 2.6, 'window').rect2(F, 1.2, 1.4, 11, 2.6, 'line').fill2(F, 17, 1.4, 11.8, 2.6, 'window').rect2(F, 17, 1.4, 11.8, 2.6, 'line');
  for (const u of [4.9, 8.6, 20.9, 24.8]) p.draw(F, [u, 1.4, u, 4.0], 'line');
  p.fill2(F, 13.2, 1.4, 2.8, 3.2).rect2(F, 13.2, 1.4, 2.8, 3.2, 'line');
  p.text(F, 'CAFÉ MIRA', 1.2, 0.95, 0.7);
  p.extrude([[x + 0.5, y + d, z + 3.7], [x + 0.5, y + d + 2.4, z + 2.9], [x + 0.5, y + d + 2.4, z + 2.75], [x + 0.5, y + d, z + 3.55]], [w - 1, 0, 0], 'k');
  for (let u = 1.5; u < w - 1; u += 1.5) p.seg('koline', W(x + u, y + d, z + 3.71), W(x + u, y + d + 2.4, z + 2.91));
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:1.5, ww:2, wh:1.8, dx:3.5, y0:1.2, lit:0.9 });
  // terrace: tables under umbrellas
  const um = new THREE.ConeGeometry(1.2, 0.5, 8);
  for (const tx of CAFE_TABLES) {
    p.cylZ(tx, 191.4, z, 0.5, 0.75, 8); p.seg('line', W(tx, 191.4, z + 0.75), W(tx, 191.4, z + 2.3));
    p.geo(um, new THREE.Matrix4().compose(W(tx, 191.4, z + 2.45), yaw(0.2), v3(1, 1, 1)), 'k');
    for (const dx of [-0.95, 0.65]) p.box(tx + dx, 191.2, z, 0.3, 0.4, 0.45);
  }
  return p.build('cafe');
}
export function buildPolice() {
  const p = new Part(), z = CURB, x = 190, y = 164, w = 27, d = 28, h = 8;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.25, y - 0.25, z + h, w + 0.5, d + 0.5, 0.4);
  const F = FRONT(x, y + d, z + h);
  p.draw(F, [0, 1.8, w, 1.8], 'line'); p.text(F, 'POLICE', w / 2, 1.35, 1.1, 'ink', 'middle');
  windows(p, F, w, h, { y0:2.5, dy:2.9, skip:(u, v) => v > 4 && u > 10.5 && u < 16, lit:0.85 });
  p.fill2(F, 12, h - 2.7, 3, 2.7).rect2(F, 12, h - 2.7, 3, 2.7, 'line');
  p.box(x + 11.4, y + d, z + 2.9, 4.2, 1.4, 0.16);
  p.box(x + 13, y + d + 0.02, z + 3.25, 1.0, 0.35, 0.55, 'l');
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:1.6, y0:2.5, dy:2.9, lit:0.85 });
  // flag pole, and the yard beside the station: a low wall, bays for the two cars
  p.box(x + 23.4, y + d + 1.6, z, 0.16, 0.16, 9.5);
  p.fill2(plane([x + 23.5, y + d + 1.7, z + 9.4], [1, 0, 0], [0, 0, -1]), 0.1, 0, 2.6, 1.6, 'kob', 0).rect2(plane([x + 23.5, y + d + 1.7, z + 9.4], [1, 0, 0], [0, 0, -1]), 0.1, 0, 2.6, 1.6, 'koline', 0.01);
  p.box(226.5, 194.6, 0, 27, 0.5, 0.9);
  const G = TOP(0, 0, 0);
  for (const xx of [225.4, 235.4, 245.4]) p.draw(G, [xx, 181.4, xx, 186.6], 'line', 0.05);
  p.text(G, 'POLICE', 228, 189.6, 1.2, 'paint');
  return p.build('police');
}
export function buildTownHall() {
  const p = new Part(), z = CURB, x = 222, y = 146, w = 38, d = 26, h = 10;
  p.box(x, y, z, w, d, h);
  p.box(x - 0.3, y - 0.3, z + h, w + 0.6, d + 0.6, 0.5);
  const F = FRONT(x, y + d, z + h);
  windows(p, F, w, h, { x0:1.8, ww:1.6, wh:2.4, dx:3.6, y0:1.4, dy:4.4, skip:(u) => u > 13 && u < 24, lit:0.5 });
  windows(p, SIDE(x + w, y + d, z + h), d, h, { x0:1.8, ww:1.6, wh:2.4, dx:3.6, y0:1.4, dy:4.4, lit:0.5 });
  // the clock tower in the middle of the front
  const tx = x + 15, ty = y + 18, tw = 8, th = 21;
  p.box(tx, ty, z, tw, 8, th);
  p.geo(roof4, new THREE.Matrix4().compose(W(tx + tw / 2, ty + 4, z + th + 2.2), yaw(Math.PI / 4), v3(6.2, 4.4, 6.2)));
  const TF = FRONT(tx, ty + 8, z + th), TS = SIDE(tx + tw, ty + 8, z + th);
  for (const M of [TF, TS]) {
    const face = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; face.push(v3(4 + 2 * Math.cos(a), 3 + 2 * Math.sin(a), 0).applyMatrix4(M).add(v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-0.03))); }
    p.poly('deck', face); for (let i = 0; i < 24; i++) p.seg('line', face[i], face[(i + 1) % 24]);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; p.draw(M, [4 + 1.6 * Math.cos(a), 3 + 1.6 * Math.sin(a), 4 + 1.85 * Math.cos(a), 3 + 1.85 * Math.sin(a)], 'line'); }
  }
  p.fill2(TF, 2.6, 9, 2.8, 4.6, 'window').rect2(TF, 2.6, 9, 2.8, 4.6, 'line');
  p.fill2(F, 16.2, h - 3.4, 5.6, 3.4).rect2(F, 16.2, h - 3.4, 5.6, 3.4, 'line');
  for (let i = 0; i < 3; i++) p.box(x + 14.5, y + d, z, 9, 2.1 - 0.7 * i, 0.15 * (i + 1));
  p.text(F, 'TOWN HALL', 19, 1.0, 0.75, 'ink', 'middle');
  const g = p.build('townHall');
  // clock hands, turned by the simulated time
  const hand = (n, len) => new Part().seg('line', v3(0, 0, 0), v3(0, len, 0)).build(n);
  for (const [M, n] of [[TF, 'F'], [TS, 'S']]) {
    const c = v3(4, 3, 0).applyMatrix4(M).add(v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-0.06));
    for (const [k, len] of [['hour', 1.0], ['min', 1.55]]) { const hnd = hand(`${k}${n}`, len); hnd.position.copy(c); g.add(hnd); }
  }
  return g;
}
// a house with a gabled roof, its front to the south; a garden with a path, a fence, a tree, sometimes a car;
// on Orchard Lane also a garage, a porch or a dormer. The walls and roof are its shell; opening the house swaps them
// for its section (cut walls, furnished rooms), drawn the first time it is opened. Gardens go into o.gardens, one
// part shared by every home, so a street of homes costs a few draw calls more than its shells.
export function buildHouse(o) {
  const { x, y, w, d, h, rh = 3, ridgeY = false, door = 2, lotY1, lotX0, lotX1, car, garage = 0, porch = false, dormer = false } = o, z = CURB, ov = 0.5;
  const p = o.gardens ?? new Part(), s = new Part();
  s.box(x, y, z, w, d, h);
  if (ridgeY) {
    s.extrude([[x - ov, y - ov, z + h - 0.12], [x + w / 2, y - ov, z + h + rh], [x + w + ov, y - ov, z + h - 0.12]], [0, d + 2 * ov, 0]);
    for (let t = 0.2; t < 1; t += 0.2) { const xx = x + w / 2 + t * (w / 2 + ov), zz = z + h + rh - t * (rh + 0.12); s.seg('detail', W(xx, y - ov, zz), W(xx, y + d + ov, zz)); }
    const gf = FRONT(x, y + d + ov, z + h);
    s.fill2(gf, w / 2 - 0.6, -1.6, 1.2, 1.0, rng() < 0.5 ? 'window' : 'glass').rect2(gf, w / 2 - 0.6, -1.6, 1.2, 1.0, 'line');
  } else {
    s.extrude([[x - ov, y - ov, z + h - 0.12], [x - ov, y + d / 2, z + h + rh], [x - ov, y + d + ov, z + h - 0.12]], [w + 2 * ov, 0, 0]);
    for (let t = 0.2; t < 1; t += 0.2) { const yy = y + d / 2 + t * (d / 2 + ov), zz = z + h + rh - t * (rh + 0.12); s.seg('detail', W(x - ov, yy, zz), W(x + w + ov, yy, zz)); }
  }
  s.box(x + w * 0.72, y + d * 0.3, z + h + rh * 0.35, 0.7, 0.7, rh * 0.85);
  const F = FRONT(x, y + d, z + h), S = SIDE(x + w, y + d, z + h);
  s.fill2(F, door, h - 2.2, 1.1, 2.2).rect2(F, door, h - 2.2, 1.1, 2.2, 'line');
  for (let u = 0.9; u + 1.3 < w - 0.4; u += 2.6) { if (Math.abs(u - door) < 1.6) continue; s.fill2(F, u, h - 1.9, 1.3, 1.1, rng() < 0.55 ? 'window' : 'glass').rect2(F, u, h - 1.9, 1.3, 1.1, 'line'); }
  if (h > 4.5) for (let u = 0.9; u + 1.3 < w - 0.4; u += 2.6) s.fill2(F, u, 0.8, 1.3, 1.1, rng() < 0.4 ? 'window' : 'glass').rect2(F, u, 0.8, 1.3, 1.1, 'line');
  for (let u = 1.2; u + 1.3 < d - 0.4; u += 3) s.fill2(S, u, h - 1.9, 1.3, 1.1, rng() < 0.5 ? 'window' : 'glass').rect2(S, u, h - 1.9, 1.3, 1.1, 'line');
  // a dormer on the front slope of the roof, with a lit window at night
  if (dormer && !ridgeY) {
    const roofAt = yy => z + h + rh - (yy - y - d / 2) / (d / 2 + ov) * (rh + 0.12), yf = y + d * 0.8, dx = x + w * 0.3 - 0.9, zb = roofAt(yf), zt = z + h + rh - 0.35;
    s.box(dx, y + d / 2 + 0.3, zb, 1.8, yf - y - d / 2 - 0.3, zt - zb).box(dx - 0.15, y + d / 2 + 0.2, zt, 2.1, yf - y - d / 2 - 0.1, 0.12);
    s.fill2(FRONT(dx, yf, zt), 0.4, 0.25, 1.0, zt - zb - 0.5, 'window').rect2(FRONT(dx, yf, zt), 0.4, 0.25, 1.0, zt - zb - 0.5, 'line');
  }
  // a porch roof on two posts over the front door
  if (porch) { p.box(x + door - 0.5, y + d, z + 2.45, 2.1, 1.5, 0.12); for (const dx of [-0.4, 1.4]) p.box(x + door + dx, y + d + 1.3, z, 0.12, 0.12, 2.45); }
  // a flat-roofed garage beside the house, its roller door to the street
  if (garage) {
    const gx = x + w + 0.2, G = FRONT(gx, y + d, z + 2.8);
    p.box(gx, y + 1.5, z, garage, d - 1.5, 2.8).box(gx - 0.1, y + 1.4, z + 2.8, garage + 0.2, d - 1.3, 0.12);
    p.rect2(G, 0.35, 0.5, garage - 0.7, 2.3, 'line'); for (let v = 0.8; v < 2.8; v += 0.3) p.draw(G, [0.35, v, garage - 0.35, v]);
  }
  // garden: a path to the pavement, a picket fence with a gap, a hedge at the back, a tree
  const px = x + door + 0.55, L = TOP(0, 0, z);
  p.fill2(L, px - 0.6, y + d, 1.2, lotY1 - y - d, 'deck', 0.03);
  for (const [a, b] of [[lotX0 + 0.4, px - 0.9], [px + 0.9, lotX1 - 0.4]]) {
    if (b - a < 0.5) continue;
    const n = Math.max(1, Math.round((b - a) / 1.2));
    for (let i = 0; i <= n; i++) p.seg('line', W(a + (b - a) * i / n, lotY1 - 0.4, z), W(a + (b - a) * i / n, lotY1 - 0.4, z + 0.9));
    p.seg('line', W(a, lotY1 - 0.4, z + 0.7), W(b, lotY1 - 0.4, z + 0.7));
  }
  p.box(lotX0 + 0.4, y - 7.5, z, lotX1 - lotX0 - 0.8, 0.9, 1.2, 'gs');
  tree(p, rand(lotX0 + 2.5, lotX1 - 2.5), y - 3.5, rand(0.8, 1.1), z);
  let c = null;
  if (car) { c = buildCar(rng() < 0.3, rng() < 0.4 ? 'k' : 'n'); p.fill2(L, car[0] - 1.6, car[1] - 5.6, 3.2, lotY1 - car[1] + 5.6, 'road', 0.03); }
  const g = new THREE.Group(); g.name = 'house';
  const shell = s.build('houseShell'); g.add(shell); if (!o.gardens) g.add(p.build('houseBase'));
  if (c) { pose(c, car[0], car[1], Math.PI / 2, z); g.add(c); }
  g.userData.peek = { shell, box:[x, x + w, y, y + d], section:extra => houseSection({ x, y, z, w, d, h, rh, ov, ridgeY, door, ...extra }) };
  return g;
}
// a villa: two flat-roofed storeys, glass bands, a pool, palms; like a house, it opens to its ground floor
export function buildVilla(o) {
  const { x, y, w, bw, bd, pool, lotY1 } = o, p = o.gardens ?? new Part(), s = new Part(), z = CURB;
  const bx = x + 3, by = y + 7;
  s.box(bx, by, z, bw, bd, 3.6);
  s.box(bx - 0.4, by - 0.4, z + 3.6, bw + 0.8, bd + 0.8, 0.3);
  s.box(bx + 5, by + 1.5, z + 3.9, bw - 8, bd - 4, 3.1);
  s.box(bx + 4.6, by + 1.1, z + 7.0, bw - 7.2, bd - 3.2, 0.3);
  const F1 = FRONT(bx, by + bd, z + 3.6), F2 = FRONT(bx + 5, by + 1.5 + bd - 4, z + 7.0);
  s.fill2(F1, 1.2, 0.5, bw - 6, 2.7, 'window').rect2(F1, 1.2, 0.5, bw - 6, 2.7, 'line');
  for (let u = 3.2; u < bw - 5; u += 2) s.draw(F1, [u, 0.5, u, 3.2], 'line');
  s.fill2(F1, bw - 3.6, 0.9, 1.4, 2.7).rect2(F1, bw - 3.6, 0.9, 1.4, 2.7, 'line');
  s.fill2(F2, 1, 0.5, bw - 10, 2.0, rng() < 0.6 ? 'window' : 'glass').rect2(F2, 1, 0.5, bw - 10, 2.0, 'line');
  const S1 = SIDE(bx + bw, by + bd, z + 3.6);
  s.fill2(S1, 1.5, 0.6, bd - 3, 1.6, rng() < 0.5 ? 'window' : 'glass').rect2(S1, 1.5, 0.6, bd - 3, 1.6, 'line');
  // terrace and pool
  const L = TOP(0, 0, z);
  p.box(pool[0] - 0.8, pool[1] - 0.8, z, pool[2] + 1.6, pool[3] + 1.6, 0.12);
  p.fill2(TOP(0, 0, z + 0.12), pool[0], pool[1], pool[2], pool[3], 'sea', 0.02).rect2(TOP(0, 0, z + 0.12), pool[0], pool[1], pool[2], pool[3], 'line', 0.03);
  for (let k = 0; k < 3; k++) p.draw(TOP(0, 0, z + 0.12), [pool[0] + 1 + k * 2.6, pool[1] + pool[3] * 0.4, pool[0] + 2.2 + k * 2.6, pool[1] + pool[3] * 0.4], 'detail', 0.04);
  for (const k of [0, 1]) p.box(pool[0] + pool[2] + 1.4, pool[1] + 0.6 + k * 2, z, 1.8, 0.7, 0.35);
  p.fill2(L, bx + bw - 3.8, by + bd, 1.2, lotY1 - by - bd, 'deck', 0.03);
  // a low wall along the street with a gate, palms
  p.box(x + 0.4, lotY1 - 0.7, z, bw - 3.8 + 2.6, 0.35, 0.8); p.box(bx + bw - 1.9, lotY1 - 0.7, z, x + w - 0.4 - (bx + bw - 1.9), 0.35, 0.8);
  for (const [px, py] of o.palms) palm(p, px, py, rand(0.9, 1.15), z);
  p.box(x + 0.4, y + 1.2, z, w - 0.8, 0.9, 1.3, 'gs');
  const g = new THREE.Group(); g.name = 'villa';
  const shell = s.build('villaShell'); g.add(shell); if (!o.gardens) g.add(p.build('villaBase'));
  g.userData.peek = { shell, box:[bx, bx + bw, by, by + bd], section:() => villaSection({ bx, by, z, bw, bd }) };
  return g;
}
