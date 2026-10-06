// @ts-nocheck
import { W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { ease, rand } from '../kernel/math';
import { pine } from './ground';
import { MOTORS, WORKS, WORLD } from '../layout';
import { EAST, hillNatural } from '../land';

// The hills behind the towns: a height field, faceted and gridded, snow on the tops and pines low down. Car Works and
// Sahel Motors stand on terraces cut into them: flat inside, the slopes easing back up over a couple of grid cells
// around. East of Car Works the foot of the hills is levelled for the siding to Sahel Motors.
const TERRACES = [WORKS.terrace, MOTORS.terrace];
const k = v => v <= 0 ? 0 : v >= 1 ? 1 : ease(v);
const cut = ([X0, X1, Y0], x, y) => Math.max(k((X0 - x) / 22), k((x - X1) / 22), k((Y0 - y) / 24));
export const onTerrace = (x, y) => TERRACES.some(([X0, X1, Y0]) => x > X0 && x < X1 && y > Y0);
export function hillHeight(x, y) {
  const t = (-4 - y) / 80; if (t <= 0) return 0;
  let h = hillNatural(x, y, t);
  for (const T of TERRACES) if (x > T[0] - 22 && x < T[1] + 22 && y > T[2] - 24) h *= cut(T, x, y);
  if (x > 400 && x < MOTORS.sidingX[1] + 30 && y > -20) h *= Math.max(k((-12 - y) / 8), k((x - MOTORS.sidingX[1] - 8) / 22));
  return h;
}
export function buildRange() {
  const p = new Part(), X = [], Y = [];
  X.push(WORLD.x0); for (let x = Math.ceil(WORLD.x0 / 11 + 1e-9) * 11; x < EAST.x0; x += 11) X.push(x); X.push(EAST.x0);   // the east country's own mesh takes over at x0
  for (let y = -84; y <= -4; y += 8) Y.push(y);
  const P = X.map(x => Y.map(y => W(x, y, hillHeight(x, y))));
  // on the terrace the hills are flat at the slab's own height: those faces and grid lines would fight the slab's top
  // for the same pixels (the floor seen to flicker as the view moves), so they are left to the slab
  const flat = (...q) => q.every(v => Math.abs(v.y) < 0.01);
  const tri = (a, b, c) => {
    if (flat(a, b, c)) return;
    const n = v3(0, 0, 0).crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(); if (n.y < 0) n.negate();
    const zc = (a.y + b.y + c.y) / 3;
    p.tri(zc > 31 ? 'snow' : n.y > 0.72 ? 'deck' : 'body', a, b, c);
  };
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  }
  const off = x => TERRACES.every(([X0, X1]) => x < X0 || x > X1), offSeg = (a, b) => TERRACES.every(([X0, X1]) => b <= X0 || a >= X1);
  for (let i = 0; i < X.length; i++) for (let j = 0; j < Y.length - 1; j++) if (!flat(P[i][j], P[i][j + 1]) || off(X[i])) p.seg('detail', P[i][j], P[i][j + 1]);
  for (let j = 0; j < Y.length; j++) for (let i = 0; i < X.length - 1; i++) if (!flat(P[i][j], P[i + 1][j]) || offSeg(X[i], X[i + 1])) p.seg(j === 3 ? 'line' : 'detail', P[i][j], P[i + 1][j]);
  for (let k = 0, n = 0; k < 400 && n < 90; k++) { const x = rand(3, 437), y = rand(-46, -6), z = hillHeight(x, y); if (z < 15 && !onTerrace(x - 2, y) && !onTerrace(x + 2, y + 2)) { pine(p, x, y, rand(0.7, 1.1), z - 0.2); n++; } }
  return p.build('range');
}
