// @ts-nocheck
import { W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { ease, rand } from '../kernel/math';
import { pine } from './ground';
import { WORKS } from '../layout';

// The hills behind the plant: a height field, faceted and gridded, snow on the tops and pines low down. Car Works
// stands on a terrace cut into them: flat inside it, the slopes easing back up over a couple of grid cells around it.
const [TX0, TX1, TY0] = WORKS.terrace;
const cut = (x, y) => { const k = v => v <= 0 ? 0 : v >= 1 ? 1 : ease(v); return Math.max(k((TX0 - x) / 22), k((x - TX1) / 22), k((TY0 - y) / 24)); };
export const onTerrace = (x, y) => x > TX0 && x < TX1 && y > TY0;
export function hillHeight(x, y) {
  const t = (-4 - y) / 80; if (t <= 0) return 0;
  if (x > TX0 - 22 && x < TX1 + 22 && y > TY0 - 24) return hillNatural(x, y, t) * cut(x, y);
  return hillNatural(x, y, t);
}
function hillNatural(x, y, t) {
  const peaks = [[30, 30], [95, 44], [160, 33], [228, 48], [300, 38], [362, 46], [425, 34]];
  const ridge = Math.max(...peaks.map(([px, ph]) => ph * Math.exp(-(((x - px) / 34) ** 2)))) + 7;
  const s = t < 0.72 ? ease(t / 0.72) : 1 - 0.3 * (t - 0.72) / 0.28;
  return Math.max(0, ridge * s + (2.4 * Math.sin(x * 0.19 + y * 0.31) + 1.8 * Math.sin(x * 0.07 - y * 0.23)) * Math.min(1, t * 2));
}
export function buildRange() {
  const p = new Part(), X = [], Y = [];
  for (let x = 0; x <= 440; x += 11) X.push(x);
  for (let y = -84; y <= -4; y += 8) Y.push(y);
  const P = X.map(x => Y.map(y => W(x, y, hillHeight(x, y))));
  const tri = (a, b, c) => {
    const n = v3(0, 0, 0).crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(); if (n.y < 0) n.negate();
    const zc = (a.y + b.y + c.y) / 3;
    p.tri(zc > 31 ? 'snow' : n.y > 0.72 ? 'deck' : 'body', a, b, c);
  };
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  }
  for (let i = 0; i < X.length; i++) for (let j = 0; j < Y.length - 1; j++) p.seg('detail', P[i][j], P[i][j + 1]);
  for (let j = 0; j < Y.length; j++) for (let i = 0; i < X.length - 1; i++) p.seg(j === 3 ? 'line' : 'detail', P[i][j], P[i + 1][j]);
  // the cut face at the plate's east edge
  const E = P[X.length - 1];
  for (let j = 0; j < Y.length - 1; j++) { const a = E[j], b = E[j + 1]; p.poly('body', [W(440, Y[j], 0), a, b, W(440, Y[j + 1], 0)]); p.seg('line', a, b); }
  for (let k = 0, n = 0; k < 400 && n < 90; k++) { const x = rand(3, 437), y = rand(-46, -6), z = hillHeight(x, y); if (z < 15 && !onTerrace(x - 2, y) && !onTerrace(x + 2, y + 2)) { pine(p, x, y, rand(0.7, 1.1), z - 0.2); n++; } }
  return p.build('range');
}
