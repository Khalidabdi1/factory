// @ts-nocheck
import * as THREE from 'three';
import { FRONT, TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { ease } from '../kernel/math';
import { Path } from '../kernel/path';
import { CURB, PIER, SEA_Z } from '../layout';

// Sunset Pier: a pleasure pier east of the town pier. An arch on the promenade, a neck over the beach, and a platform
// over the sea with three rides: a Ferris wheel whose gondolas stay level as it turns, a carousel, a little coaster.
// Bulbs on the wheel, the light strings and the kiosks' windows come on at dusk by themselves.
const D = PIER.deck, [NX0, NX1] = PIER.neck, [PX0, PX1, PY0, PY1] = PIER.platform;

// the coaster: a closed oval over the west of the platform, its height along the way (above the deck) as key points
export const COASTER = { path:new Path([[316, 310], [333, 310], [333, 315.5], [312, 315.5], [312, 310], [316, 310]], 2.2, true),
  keys:[[0, 0.8], [0.06, 0.8], [0.32, 5.8], [0.37, 5.8], [0.5, 1.0], [0.62, 3.2], [0.72, 1.2], [0.85, 2.4], [0.95, 0.8], [1, 0.8]], lift:[0.06, 0.32] };
export const coasterZ = s => {
  const L = COASTER.path.length, f = ((s % L) + L) % L / L, K = COASTER.keys;
  for (let i = 1; i < K.length; i++) if (f <= K[i][0]) { const t = (f - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return D + K[i - 1][1] + (K[i][1] - K[i - 1][1]) * ease(t); }
  return D + K[0][1];
};

export function buildPier() {
  const p = new Part();
  // decks: the neck with its ramp from the promenade, the platform; piles down into the sea
  p.box(NX0, 281, D - 0.25, NX1 - NX0, PY0 - 281, 0.25).extrude([[NX0, 278.7, CURB], [NX0, 281, D], [NX0, 281, D - 0.25], [NX0, 278.7, 0.01]], [NX1 - NX0, 0, 0]);
  p.box(PX0, PY0, D - 0.3, PX1 - PX0, PY1 - PY0, 0.3);
  for (let y = 284; y < PY0; y += 4) for (const x of [NX0 + 0.3, NX1 - 0.6]) p.box(x, y, SEA_Z - 0.4, 0.3, 0.3, D - 0.25 - SEA_Z + 0.4);
  for (let x = PX0 + 1; x < PX1; x += 5) for (const y of [PY0 + 0.6, (PY0 + PY1) / 2, PY1 - 0.9]) p.box(x, y, SEA_Z - 0.4, 0.3, 0.3, D - 0.3 - SEA_Z + 0.4);
  const T = TOP(0, 0, D);
  for (let y = 283; y < PY0; y += 1.2) p.draw(T, [NX0, y, NX1, y], 'detail', 0.02);
  for (let x = PX0 + 1.2; x < PX1; x += 1.2) p.draw(T, [x, PY0, x, PY1], 'detail', 0.02);
  // rails round the edges, a light string of bulbs above them
  const rail = (x0, y0, x1, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; p.seg('line', W(x, y, D), W(x, y, D + 1.0)); }
    p.seg('line', W(x0, y0, D + 1.0), W(x1, y1, D + 1.0)).seg('line', W(x0, y0, D + 0.5), W(x1, y1, D + 0.5)); };
  rail(NX0, 281, NX0, PY0); rail(NX1, 281, NX1, PY0);
  rail(PX0, PY0, NX0, PY0); rail(NX1, PY0, PX1, PY0); rail(PX1, PY0, PX1, PY1); rail(PX1, PY1, PX0, PY1); rail(PX0, PY1, PX0, PY0);
  for (const x of [NX0, NX1]) for (let y = 283; y < PY0; y += 4) {
    p.box(x - 0.08, y - 0.08, D, 0.16, 0.16, 3.2);
    for (let k = 0; k < 4; k++) { const ya = y + k, yb = y + k + 1, za = D + 3.0 - 0.35 * Math.sin(k / 4 * Math.PI), zb = D + 3.0 - 0.35 * Math.sin((k + 1) / 4 * Math.PI);
      if (yb <= PY0) { p.seg('detail', W(x, ya, za), W(x, yb, zb)); p.box(x - 0.09, yb - 0.09, zb - 0.2, 0.18, 0.18, 0.18, 'l'); } }
  }
  // the arch over the way in, with the pier's name
  for (const x of [NX0 - 0.4, NX1]) p.box(x, 279.0, CURB, 0.4, 0.4, 4.6);
  p.box(NX0 - 0.6, 278.9, CURB + 4.6, NX1 - NX0 + 1.2, 0.6, 1.1);
  const A = FRONT(NX0 - 0.6, 279.5, CURB + 5.7);
  p.text(A, 'SUNSET PIER', (NX1 - NX0 + 1.2) / 2, 0.82, 0.62, 'ink', 'middle');
  for (let u = 0.4; u < NX1 - NX0 + 1; u += 0.9) p.box(NX0 - 0.6 + u, 279.45, CURB + 4.62, 0.14, 0.12, 0.14, 'l');
  // a ticket booth and two kiosks with lit windows and striped awnings
  p.box(332.0, 282.4, D, 1.6, 1.6, 2.2).box(331.8, 282.2, D + 2.2, 2.0, 2.0, 0.12, 'k');
  p.fill2(FRONT(332.0, 284.0, D + 2.2), 0.3, 0.6, 1.0, 0.7, 'window');
  for (const [x, name] of [[309.0, 'ICE CREAM'], [348.6, 'CANDY FLOSS']]) {
    p.box(x, 298.0, D, 2.4, 2.0, 2.4).extrude([[x - 0.2, 300.0, D + 2.4], [x - 0.2, 301.1, D + 1.9], [x - 0.2, 301.1, D + 1.8], [x - 0.2, 300.0, D + 2.3]], [2.8, 0, 0], 'k');
    const F = FRONT(x, 300.0, D + 2.4); p.fill2(F, 0.3, 0.7, 1.8, 0.8, 'window').text(F, name, 1.2, 0.5, 0.26, 'ink', 'middle');
  }
  for (const [x, y] of [[318, 299], [338, 299]]) p.box(x - 0.9, y - 0.25, D + 0.4, 1.8, 0.5, 0.08).box(x - 0.9, y - 0.28, D + 0.48, 1.8, 0.08, 0.45).box(x - 0.75, y - 0.2, D, 0.1, 0.4, 0.4).box(x + 0.65, y - 0.2, D, 0.1, 0.4, 0.4);
  // the coaster's track: two rails, ties, posts down to the deck; its station
  const P = COASTER.path, L = P.length;
  let prev = null;
  for (let s = 0; s <= L + 0.01; s += 0.6) {
    const a = P.at(s), z = coasterZ(s), nx = -Math.sin(a.h) * 0.45, ny = Math.cos(a.h) * 0.45, l = W(a.x + nx, a.y + ny, z), r = W(a.x - nx, a.y - ny, z);
    if (prev) p.seg('line', prev[0], l).seg('line', prev[1], r);
    p.seg('detail', l, r);
    if (Math.round(s / 0.6) % 4 === 0 && z > D + 0.3) p.seg('line', W(a.x, a.y, z - 0.05), W(a.x, a.y, D)).seg('detail', W(a.x + nx, a.y + ny, z - 0.05), W(a.x, a.y, z - 0.6));
    prev = [l, r];
  }
  p.box(314.2, 307.6, D, 4.6, 1.3, 0.75).text(TOP(0, 0, D + 0.76), 'COASTER', 316.5, 308.5, 0.45, 'paint', 'middle', 0.02);
  return p.build('pier');
}

// The wheel: a stand of two A-frames and an axle; the rotor (rims, spokes, bulbs) turns about the axle, and twelve
// open gondolas hang from it, turned back each frame so they stay level.
export const GONDOLAS = 12;
export function buildWheel() {
  const H = PIER.wheel, g = new THREE.Group(); g.name = 'wheel';
  const st = new Part();
  for (const dx of [-1.6, 1.6]) { for (const dy of [-5.6, 5.6]) st.box(H.x + dx - 0.12, H.y + dy - 0.12, D, 0.24, 0.24, 0.3).seg('line', W(H.x + dx, H.y + dy, D + 0.3), W(H.x + dx * 0.55, H.y, H.z));
    for (const t of [0.35, 0.65]) st.seg('detail', W(H.x + dx, H.y - 5.6 * (1 - t), D + (H.z - D) * t), W(H.x + dx, H.y + 5.6 * (1 - t), D + (H.z - D) * t)); }
  st.seg('line', W(H.x - 1.6, H.y, H.z), W(H.x + 1.6, H.y, H.z)).box(H.x - 2.2, H.y - 1.6, D, 4.4, 3.2, 0.25);
  g.add(st.build('wheelStand'));
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.copy(W(H.x, H.y, H.z));
  const r = new Part(), R = H.r;
  for (const dx of [-0.55, 0.55]) for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, b = (i + 1) / 48 * Math.PI * 2;
    r.seg('line', W(dx, R * Math.cos(a), R * Math.sin(a)), W(dx, R * Math.cos(b), R * Math.sin(b))); }
  for (let i = 0; i < GONDOLAS * 2; i++) { const a = i / (GONDOLAS * 2) * Math.PI * 2, y = R * Math.cos(a), z = R * Math.sin(a);
    for (const dx of [-0.55, 0.55]) r.seg('detail', W(dx * 0.4, 0, 0), W(dx, y, z));
    r.box(-0.12, y - 0.12, z - 0.12, 0.24, 0.24, 0.24, 'l'); }
  r.geo(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12), new THREE.Matrix4().compose(W(0, 0, 0), new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), Math.PI / 2), v3(1, 1, 1)), 'k');
  rotor.add(r.build('rim'));
  // an open cabin tall enough to stand in (2.1 m inside), hanging from its pivot on the rim
  const cab = new Part();
  cab.box(-0.65, -0.65, -2.35, 1.3, 1.3, 0.12, 'kb').box(-0.75, -0.75, -0.35, 1.5, 1.5, 0.1, 'kb');
  for (const [x, y] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) cab.seg('koline', W(x, y, -2.23), W(x, y, -0.35));
  cab.seg('koline', W(0, 0, -0.25), W(0, 0, 0));
  for (const z of [-1.3]) for (const [a, b] of [[[-0.6, -0.6], [0.6, -0.6]], [[0.6, -0.6], [0.6, 0.6]], [[0.6, 0.6], [-0.6, 0.6]], [[-0.6, 0.6], [-0.6, -0.6]]]) cab.seg('koline', W(a[0], a[1], z), W(b[0], b[1], z));
  const proto = cab.build('gondola');
  for (let i = 0; i < GONDOLAS; i++) { const a = i / GONDOLAS * Math.PI * 2, q = proto.clone(); q.name = `gondola${i}`; q.position.copy(W(0, R * Math.cos(a), R * Math.sin(a))); rotor.add(q); }
  g.add(rotor);
  return g;
}

// The carousel: a stepped base and a centre pole that stay still; the platform, its poles, the roof and eight
// horses turn, and the horses rise and fall on their poles.
export const HORSES = 8;
export function buildCarousel() {
  const C = PIER.carousel, g = new THREE.Group(); g.name = 'carousel';
  g.add(new Part().cylZ(C.x, C.y, D, C.r + 0.4, 0.3, 20).cylZ(C.x, C.y, D + 0.3, 0.35, 4.4, 10).build('carouselBase'));
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.copy(W(C.x, C.y, D + 0.3));
  const r = new Part();
  r.cylZ(0, 0, 0, C.r, 0.15, 20);
  r.geo(new THREE.ConeGeometry(C.r + 0.5, 1.7, 16), new THREE.Matrix4().compose(W(0, 0, 4.9), new THREE.Quaternion(), v3(1, 1, 1)), 'k');
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, b = (i + 1) / 32 * Math.PI * 2; r.seg('line', W((C.r + 0.5) * Math.cos(a), (C.r + 0.5) * Math.sin(a), 4.05), W((C.r + 0.5) * Math.cos(b), (C.r + 0.5) * Math.sin(b), 4.05)); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; r.box((C.r + 0.45) * Math.cos(a) - 0.1, (C.r + 0.45) * Math.sin(a) - 0.1, 3.9, 0.2, 0.2, 0.2, 'l'); }
  for (let i = 0; i < HORSES; i++) { const a = i / HORSES * Math.PI * 2; r.seg('line', W(3.0 * Math.cos(a), 3.0 * Math.sin(a), 0.15), W(3.0 * Math.cos(a), 3.0 * Math.sin(a), 4.05)); }
  rotor.add(r.build('platform'));
  const hp = new Part();
  hp.box(-0.55, -0.15, 0, 1.1, 0.3, 0.42, 'kb').box(0.4, -0.11, 0.3, 0.28, 0.22, 0.45, 'kb').box(0.55, -0.1, 0.62, 0.38, 0.2, 0.18, 'kb');
  for (const [x, y] of [[-0.45, -0.1], [-0.45, 0.1], [0.4, -0.1], [0.4, 0.1]]) hp.seg('koline', W(x, y, 0), W(x + (x > 0 ? 0.15 : -0.15), y, -0.42));
  const proto = hp.build('horse');
  for (let i = 0; i < HORSES; i++) { const a = i / HORSES * Math.PI * 2, h = proto.clone(); h.name = `horse${i}`;
    h.position.copy(W(3.0 * Math.cos(a), 3.0 * Math.sin(a), 1.0)); h.rotation.y = -(a + Math.PI / 2); rotor.add(h); }
  g.add(rotor);
  return g;
}
// a coaster car: a tub with a two-tone band and a lap bar
export function buildCoasterCar() {
  const p = new Part();
  p.box(-1.6, -0.55, 0, 1.6, 1.1, 0.55, 'kb').box(-1.65, -0.6, 0.55, 1.7, 1.2, 0.08, 'kb');
  p.seg('koline', W(-0.9, -0.5, 0.95), W(-0.9, 0.5, 0.95)).seg('koline', W(-0.9, -0.5, 0.63), W(-0.9, -0.5, 0.95)).seg('koline', W(-0.9, 0.5, 0.63), W(-0.9, 0.5, 0.95));
  return p.build('coasterCar');
}
