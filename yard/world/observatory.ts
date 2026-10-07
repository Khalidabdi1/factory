import * as THREE from 'three';
import { FRONT, SIDE, TOP, W, plane } from '../kernel/iso';
import { Part } from '../kernel/part';
import { DISH, OBS, OBS_ROAD, landZ } from '../land';
import { carInto } from '../models/works';

// ---- Beacon Hill Observatory ----
// On the levelled summit of Beacon Hill (OBS), the darkest sky for miles: the main telescope's building, a drum with
// its dome on top; two smaller domes (the public dome and a survey camera); a solar tower; the astronomers' residence;
// the visitor centre with its planetarium; a car park; a weather mast. Out on the moor west of the hill, the radio
// telescope's dish on its mount. The domes turn on their drums, their shutters slide up and over the top to open the
// slit, and the telescopes inside point out of it; the dish turns and tips. Those are groups of their own; the rest is
// one part.
const Z = OBS.z;
export const MAIN = { x:1440, y:36, r:9, h:9.5 }, PUBLIC = { x:1413, y:47, r:4.2, h:4.5 }, CAMERA = { x:1467, y:41, r:3.6, h:4 };
export const SOLAR = { x:1424, y:24 }, HOUSE = { x0:1452, x1:1466, y0:16, y1:24 }, CENTRE = { x0:1427, x1:1442, y0:55, y1:65, px:1421.5, py:60 };
// the car park: bays nose to the north off an aisle along its south side, a lane out along the north side and down
// the west side to the road
export const PARK = { bays:[1446.5, 1449.5, 1452.5, 1455.5, 1458.5], front:61.5, aisle:71, back:57.5, west:1444.5 };

// a dome on its drum: { g, az (turns), shell (the dome's own faces), shutter (slides over the top), alt (the telescope,
// tipped up out of the slit), drum }
export function buildDome(o: { r: number, h: number, name: string, tube: number }) {
  const { r, h } = o, w = r > 6 ? 0.3 : 0.42, g = new THREE.Group(); g.name = o.name;
  const d = new Part(); d.cylZ(0, 0, 0, r, h, 28, 'n');
  for (const zz of [h - 0.5, 1.2]) for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, b = (i + 1) / 28 * Math.PI * 2;
    d.seg('detail', W(r * 1.002 * Math.cos(a), r * 1.002 * Math.sin(a), zz), W(r * 1.002 * Math.cos(b), r * 1.002 * Math.sin(b), zz)); }
  d.box(-1.1, r - 0.3, 0, 2.2, 1.0, 2.5, 'n').fill2(FRONT(-0.7, r + 0.71, 2.2), 0, 0, 1.4, 2.2, 'kob', 0.02);   // the porch, its door to the south
  if (r > 6) for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i - 2.5) * 0.32; d.fill2(plane([r * Math.cos(a), r * Math.sin(a), h - 2.2], [Math.sin(a), -Math.cos(a), 0], [0, 0, -1]), -0.5, 0, 1.0, 0.9, 'window', 0.03); }
  const drum = d.build('drum'); g.add(drum);
  const az = new THREE.Group(); az.name = 'az'; az.position.y = h; g.add(az);
  // three.js's sphere runs its phi from -x round by +z: the slit is centred at phi = pi, which is +x (east) before it turns
  const s = new Part(); s.geo(new THREE.SphereGeometry(r * 1.02, 28, 7, Math.PI + w / 2, Math.PI * 2 - w, 0, Math.PI / 2), new THREE.Matrix4(), 'n');
  s.cylZ(0, 0, -0.25, r * 1.04, 0.3, 28, 'k');
  const shell = s.build('domeShell'); az.add(shell);
  const sh = new Part(); sh.geo(new THREE.SphereGeometry(r * 1.045, 3, 7, Math.PI - w / 2 - 0.03, w + 0.06, 0, Math.PI / 2), new THREE.Matrix4(), 'n');
  const shutter = sh.build('shutter'); az.add(shutter);
  // the telescope: a fork on a turntable, an open tube of struts between the mirror cell and the top ring
  const mount = new Part(), L = o.tube, rr = L * 0.18;
  mount.cylZ(0, 0, -h + 0.2, r * 0.18, h - 0.2 + r * 0.02, 12, 'k');   // the pier, from the floor
  mount.cylZ(0, 0, 0, rr * 1.5, 0.3, 14, 'k').box(-rr * 0.5, -rr * 1.4, 0.3, rr, rr * 0.35, rr * 2.4, 'k').box(-rr * 0.5, rr * 1.05, 0.3, rr, rr * 0.35, rr * 2.4, 'k');
  az.add(mount.build('mount'));
  const alt = new THREE.Group(); alt.name = 'alt'; alt.position.y = 0.3 + rr * 2.2; az.add(alt);
  const t = new Part();
  cylX(t, -L * 0.3, 0, 0, rr, L * 0.12, 'k'); cylX(t, L * 0.66, 0, 0, rr * 1.05, L * 0.06, 'k');
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2;
    t.seg('koline', W(-L * 0.18, rr * Math.cos(a), rr * Math.sin(a)), W(L * 0.66, rr * Math.cos(b), rr * Math.sin(b))); }
  alt.add(t.build('tube'));
  return { g, az, shell, shutter, alt, drum, w };
}

// the radio telescope: a pedestal, a head that turns, a yoke, and the dish on its elevation axis (built facing east)
export function buildDish() {
  const g = new THREE.Group(), R = 11, F = 8, AX = 13; g.name = 'dish';
  const p = new Part(); p.cylZ(0, 0, 0, 2.2, 1.2, 16, 'n').cylZ(0, 0, 1.2, 1.6, 8.3, 16, 'n').fill2(FRONT(-0.5, 1.61, 2.4), 0, 0, 1.0, 2.0, 'kob', 0.02);
  g.add(p.build('pedestal'));
  const az = new THREE.Group(); az.name = 'az'; az.position.y = 9.5; g.add(az);
  const y = new Part(); y.cylZ(0, 0, 0, 2.4, 0.6, 16, 'k').box(-2.2, -1.4, 0.6, 4.4, 2.8, 1.0, 'n');
  for (const s of [-1, 1]) y.box(-0.9, s * 5.2 - 0.5, 0.6, 1.8, 1.0, AX - 9.5 + 0.6, 'n').box(-1.3, s * 5.2 - 0.6, AX - 9.5 - 0.6, 2.6, 1.2, 1.2, 'n');
  y.box(-0.9, -5.2, 1.6, 1.8, 10.4, 0.6, 'n');
  az.add(y.build('yoke'));
  const el = new THREE.Group(); el.name = 'el'; el.position.y = AX - 9.5; az.add(el);
  // the reflector: a paraboloid turned on its axis (three.js's lathe turns about y), laid over to face +x
  const prof: THREE.Vector2[] = []; for (let i = 0; i <= 6; i++) { const q = i / 6 * R; prof.push(new THREE.Vector2(q, q * q / (4 * F))); }
  const d = new Part(), M = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(1.2, 0, 0);
  d.geo(new THREE.LatheGeometry(prof, 28), M, 'n');
  const rim = R * R / (4 * F) + 1.2, fz = F + 1.2;
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; d.seg('line', W(rim, R * 0.92 * Math.cos(a), R * 0.92 * Math.sin(a)), W(fz - 0.6, 0, 0)); }
  d.box(fz - 0.9, -0.6, -0.6, 1.4, 1.2, 1.2, 'k');
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; d.seg('detail', W(1.2, 0, 0), W(-0.6, 4 * Math.cos(a), 4 * Math.sin(a))).seg('detail', W(-0.6, 4 * Math.cos(a), 4 * Math.sin(a)), W(rim - 0.3, R * Math.cos(a), R * Math.sin(a))); }
  d.box(-3.4, -1.4, -1.4, 2.4, 2.8, 2.8, 'k');   // the counterweight behind
  el.add(d.build('reflector'));
  return { g, az, el };
}

export function buildObservatory() {
  const g = new THREE.Group(); g.name = 'observatory';
  const p = new Part(), G = TOP(0, 0, Z);
  // the road's surface, its edges and centre dashes, up from the Vale Road to the pad
  { const P = OBS_ROAD.path, n = Math.floor(P.length), hw = 2.9;
    for (let s = 6; s < n; s++) { const a = P.at(s), b = P.at(s + 1), za = OBS_ROAD.zAt(s) + 0.06, zb = OBS_ROAD.zAt(s + 1) + 0.06;
      const L = (q: any, k: number) => [q.x - Math.sin(q.h) * k, q.y + Math.cos(q.h) * k];
      const [a0, a1, b0, b1] = [L(a, -hw), L(a, hw), L(b, -hw), L(b, hw)];
      p.poly('road', [W(a0[0], a0[1], za), W(a1[0], a1[1], za), W(b1[0], b1[1], zb), W(b0[0], b0[1], zb)]);
      if (s % 2 === 0) { p.seg('detail', W(a0[0], a0[1], za + 0.02), W(b0[0], b0[1], zb + 0.02)).seg('detail', W(a1[0], a1[1], za + 0.02), W(b1[0], b1[1], zb + 0.02)); }
      if (s % 6 === 0) p.seg('detail', W(a.x, a.y, za + 0.03), W(b.x, b.y, zb + 0.03));
      if (s % 7 === 0) { const [qx, qy] = L(a, hw + 0.6), zq = landZ(qx, qy); p.seg('line', W(qx, qy, zq), W(qx, qy, zq + 0.9)); }   // marker posts
    } }
  // the pad: the car park, paths, a low wall round its edge
  p.fill2(G, PARK.west - 1.6, PARK.back - 1.6, PARK.bays[4] + 3.2 - PARK.west, PARK.aisle + 2.4 - PARK.back, 'road', 0.02);
  for (const x of [...PARK.bays.map(b => b - 1.5), PARK.bays[4] + 1.5]) p.draw(G, [x, PARK.front - 0.4, x, PARK.front + 4.6], 'detail', 0.04);
  { const c = new Part(); for (let k = 0; k < 2; k++) carInto(c, PARK.bays[k * 3 + 1], PARK.front, k ? 'k' : 'n'); const cg = c.build('staffCars'); cg.position.y = Z; g.add(cg); }   // two cars that stay: the night staff's
  p.draw(G, [1440, 66, 1440, 69, 1440, 69, 1446, 69, 1413, 51, 1413, 58, 1413, 58, 1427, 60, 1440, 45.4, 1440, 52, 1440, 52, 1434, 55, 1459, 24.4, 1459, 30, 1459, 30, 1447, 40], 'line', 0.03);
  for (let a = 0; a < Math.PI * 2; a += 0.09) { if (Math.abs(a - 1.5) < 0.24) continue; const x = OBS.c[0] + 33 * Math.cos(a), y = OBS.c[1] + 33 * Math.sin(a), z = landZ(x, y); p.seg('detail', W(x, y, z), W(x, y, z + 0.8)); }
  // the solar tower: a white shaft, the heliostat's two mirrors on top, a slanted light hood
  { const { x, y } = SOLAR; p.box(x - 1.7, y - 1.7, Z, 3.4, 3.4, 15, 'n').box(x - 2.2, y - 2.2, Z + 15, 4.4, 4.4, 0.4, 'n');
    for (let k = 4; k < 15; k += 3) p.fill2(FRONT(x - 0.4, y + 1.71, Z + k + 1.0), 0, 0, 0.8, 1.0, 'window', 0.02);
    for (const dx of [-0.9, 0.9]) p.box(x + dx - 0.15, y - 0.15, Z + 15.4, 0.3, 0.3, 1.0, 'k');
    beamPart(p, [x - 0.9, y, Z + 16.4], [x - 0.9, y + 1.0, Z + 17.6], 1.4, 'g', 0.08); beamPart(p, [x + 0.9, y, Z + 16.4], [x + 0.9, y - 0.8, Z + 17.4], 1.2, 'g', 0.08);
    p.text(SIDE(x + 1.71, y + 1.7, Z + 13), 'SOLAR', 1.7, 0.6, 0.6, 'ink', 'middle', 0.02); }
  // the residence: a long low block, the astronomers' rooms lit at night, the workshop at its east end
  { const { x0, x1, y0, y1 } = HOUSE; p.box(x0, y0, Z, x1 - x0, y1 - y0, 4, 'n').box(x0 - 0.2, y0 - 0.2, Z + 4, x1 - x0 + 0.4, y1 - y0 + 0.4, 0.3, 'n');
    const F = FRONT(x0, y1, Z + 4); for (let i = 0; i < 5; i++) p.fill2(F, 0.8 + i * 2.3, 1.2, 1.4, 1.3, 'window', 0.02);
    p.fill2(F, 7.2, 1.6, 1.0, 2.4, 'kob', 0.02).fill2(F, 11.6, 0.5, 2.0, 3.5, 'glass', 0.02).rect2(F, 11.6, 0.5, 2.0, 3.5, 'line', 0.02); }
  // the visitor centre: the hall with its glass front and sign, the planetarium's dome at its west end
  { const C = CENTRE; p.box(C.x0, C.y0, Z, C.x1 - C.x0, C.y1 - C.y0, 4.5, 'n').box(C.x0 - 0.3, C.y0 - 0.3, Z + 4.5, C.x1 - C.x0 + 0.6, C.y1 - C.y0 + 0.6, 0.3, 'n');
    const F = FRONT(C.x0, C.y1, Z + 4.5); for (let u = 0.6; u < C.x1 - C.x0 - 0.5; u += 2.2) p.fill2(F, u, 0.9, 1.9, 3.3, 'glass', 0.02).rect2(F, u, 0.9, 1.9, 3.3, 'line', 0.02);
    p.text(FRONT(C.x0, C.y1 + 0.32, Z + 4.8), 'BEACON HILL OBSERVATORY', (C.x1 - C.x0) / 2, 0.24, 0.62, 'ink', 'middle', 0.02);
    p.cylZ(C.px, C.py, Z, 5.4, 3.6, 28, 'n').geo(new THREE.SphereGeometry(5.5, 28, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().setPosition(W(C.px, C.py, Z + 3.6)), 'n');
    p.text(FRONT(C.px - 4, C.py + 5.42, Z + 3.2), 'PLANETARIUM', 4, 0.6, 0.55, 'ink', 'middle', 0.02); }
  // the weather mast and the all-sky camera
  p.seg('line', W(1408, 32, Z), W(1408, 32, Z + 10)).box(1407.6, 31.6, Z + 10, 0.8, 0.8, 0.3, 'k').seg('line', W(1407.2, 32, Z + 9.2), W(1408.8, 32, Z + 9.2));
  p.cylZ(1410.5, 35, Z, 0.25, 1.4, 8, 'k').geo(new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().setPosition(W(1410.5, 35, Z + 1.4)), 'g');
  // the radio telescope's track off the Vale Road, and its control hut
  { const z0 = landZ(DISH.x, 84), z1 = landZ(DISH.x, DISH.y + 14);
    p.poly('road', [W(DISH.x - 1.6, 80, z0 + 0.04), W(DISH.x + 1.6, 80, z0 + 0.04), W(DISH.x + 1.6, DISH.y + 12, z1 + 0.04), W(DISH.x - 1.6, DISH.y + 12, z1 + 0.04)]);
    const zh = landZ(DISH.x + 9, DISH.y + 10); p.box(DISH.x + 6, DISH.y + 8, zh, 6, 4, 3, 'n').fill2(FRONT(DISH.x + 6, DISH.y + 12, zh + 3), 1, 0.8, 1.4, 1.0, 'window', 0.02).fill2(FRONT(DISH.x + 6, DISH.y + 12, zh + 3), 3.4, 0.8, 1.0, 2.2, 'kob', 0.02); }
  const ground = p.build('observatory'); g.add(ground);
  return { g, ground };
}
// a round member along x (a tube's rings)
function cylX(p: Part, x0: number, y: number, z: number, r: number, len: number, tone: string, n = 12) {
  const q: number[][] = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; q.push([x0, y + r * Math.cos(a), z + r * Math.sin(a)]); }
  return p.extrude(q, [len, 0, 0], tone, { seams:false });
}
// a thin straight member (as in models/works' beam), kept here so the world module has no models import cycle
function beamPart(p: Part, a: number[], b: number[], w: number, tone: string, h = w) {
  const A = W(a[0], a[1], a[2]), B = W(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length();
  p.geo(new THREE.BoxGeometry(len, h, w), new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()), new THREE.Vector3(1, 1, 1)), tone);
}
