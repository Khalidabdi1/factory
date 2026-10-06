import * as THREE from 'three';
import { FRONT, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';
import { METRO } from '../layout';

// ---- Sahel Metro's cars (local: +x forward, origin at the car's front end, +y to the right, z up from the rail top) ----
// A driverless car after Riyadh's: a smooth white body (it takes the two-tone colour's place in the dark theme), a band
// of windows that light up after dusk, the line's stripe low along the side and round the nose, three sliding doors a
// side. An end car has its cab at the front: a raked windscreen with the destination above it, headlamps below.
const L = METRO.car, Y = 1.4;
export const FLOOR = 1.3;   // the car floor and the platforms, above the rail top
export const DOORS = [-2.3, -6.5, -10.7], DOOR_W = 1.4;
// the window panes along a side: the stretches between the doors (and behind the cab)
function panes(cab: boolean) {
  const edges = [cab ? -1.7 : -0.25, ...DOORS.flatMap(d => [d + DOOR_W / 2 + 0.15, d - DOOR_W / 2 - 0.15]), -L + 0.25], out: [number, number][] = [];
  for (let i = 0; i < edges.length; i += 2) { const a = edges[i], b = edges[i + 1], n = Math.max(1, Math.round((a - b) / 1.6)), w = (a - b) / n;
    for (let k = 0; k < n; k++) out.push([b + k * w + 0.08, w - 0.16]); }
  return out;
}
// cab: 'front' (a cab at x 0), 'rear' (a cab at x −L) or null (a middle car)
export function buildMetroCar(cab: 'front' | 'rear' | null, lite = false) {
  const p = new Part(), front = cab === 'front', rear = cab === 'rear';
  // the body in side profile, swept across: square ends between cars, a raked nose at a cab. Round the outline: the
  // floor line from the back to the front, up the front, the roof back, down the back.
  const outline = [[-L - (rear ? 0.15 : 0), 1.05], [front ? 0.15 : 0, 1.05], ...(front ? [[0.55, 1.6], [0.35, 2.9], [-0.85, 4.3]] : [[0, 3.95], [-0.25, 4.3]]),
    ...(rear ? [[-L + 0.85, 4.3], [-L - 0.35, 2.9], [-L - 0.55, 1.6]] : [[-L + 0.25, 4.3], [-L, 3.95]])];
  p.extrude(outline.map(([x, z]) => [x, -Y, z]), [0, 2 * Y, 0], 'nb');
  if (lite) {
    for (const [s, k] of [[Y, 1], [-Y, -1]] as [number, number][]) p.fill2(FRONT(-L, s, 3.45), 0.4, 0, L - 0.8, 1.3, 'window', 0.03 * k);
    if (front) for (const y of [0.85, -0.85]) p.box(0.42, y - 0.18, 1.8, 0.1, 0.36, 0.2, 'l');
    if (rear) for (const y of [0.85, -0.85]) p.box(-L - 0.52, y - 0.18, 1.8, 0.1, 0.36, 0.2, 'l');
    return p.build('metroCarLite');
  }
  // both sides: the stripe, the window band, the doors, a line under the roof
  for (const [s, k] of [[Y, 1], [-Y, -1]] as [number, number][]) {
    const M = FRONT(-L, s, 4.3), lift = 0.03 * k;
    p.fill2(M, 0, 2.22, L, 0.26, 'kob', lift).draw(M, [0, 0.35, L, 0.35], 'line', lift * 1.3);   // the line's stripe, under the windows
    for (const [u, w] of panes(front).map(([x, w]) => [x + L, w] as [number, number])) {
      if (rear && u < 1.7) continue;   // behind the rear cab
      p.fill2(M, u, 0.85, w, 1.3, 'window', lift).rect2(M, u, 0.85, w, 1.3, 'line', lift * 1.2);
    }
    for (const d of DOORS) { const u = d + L - DOOR_W / 2;
      p.rect2(M, u, 0.75, DOOR_W, 2.4, 'line', lift * 1.2).draw(M, [u + DOOR_W / 2, 0.75, u + DOOR_W / 2, 3.15], 'line', lift * 1.2);
      for (const du of [0.12, DOOR_W / 2 + 0.12]) p.fill2(M, u + du, 0.95, DOOR_W / 2 - 0.24, 1.0, 'window', lift); }
  }
  // the cab: windscreen, destination sign, headlamps, the stripe round the nose
  const cabAt = (s: number, x0: number) => {
    const a = W(x0 + s * 0.35, -Y + 0.12, 2.9), b = W(x0 + s * 0.35, Y - 0.12, 2.9), c = W(x0 - s * 0.85, Y - 0.12, 4.3), d = W(x0 - s * 0.85, -Y + 0.12, 4.3);
    const out = v3(s * 0.06, 0.05, 0); p.poly('glass', [a, b, c, d].map(q => q.clone().add(out)));
    for (const [q, r] of [[a, b], [b, c], [c, d], [d, a]]) p.seg('line', q.clone().add(out), r.clone().add(out));
    const e = W(x0 + s * 0.55, -Y + 0.1, 1.6), f = W(x0 + s * 0.55, Y - 0.1, 1.6), g = W(x0 + s * 0.42, Y - 0.1, 2.25), h = W(x0 + s * 0.42, -Y + 0.1, 2.25);
    p.poly('kob', [e, f, g, h].map(q => q.clone().add(v3(s * 0.03, 0, 0))));
    for (const y of [0.85, -0.85]) p.box(x0 + s * 0.45 - 0.05, y - 0.18, 1.72, 0.1, 0.36, 0.18, 'l');
    p.box(x0 - s * 0.95 - 0.05, -0.7, 4.0, 0.1, 1.4, 0.22, 'w');
  };
  if (front) cabAt(1, 0); if (rear) cabAt(-1, -L);
  // under the floor: equipment, two bogies; on the roof the air-conditioning; a bellows to the next car
  p.box(-L + 2.6, -1.1, 0.55, L - 5.2, 2.2, 0.5, 'kb');
  for (const x of [-2.3, -L + 2.3]) { p.box(x - 1.2, -1.15, 0.2, 2.4, 2.3, 0.45, 'kb'); for (const dx of [-0.75, 0.75]) for (const y of [1.15, -1.35]) p.cylY(x + dx, y, 0.42, 0.42, 0.2, 10, 'kb'); }
  for (const x of [-3.2, -L + 5.2]) p.box(x - 1.6, -0.9, 4.3, 3.2, 1.8, 0.35);
  if (!front) p.box(0, -1.0, 1.25, 0.4, 2.0, 2.7, 'nb');
  if (!rear) p.box(-L - 0.4, -1.0, 1.25, 0.4, 2.0, 2.7, 'nb');
  const g = p.build('metroCar');
  // the doors, in three parts a side that show only while they open: the dark doorways, and the leaves that slide
  // forward and back off them. A train runs on the right, so the island is on its left; but after it turns back at the
  // end of the line it stands with the island on its right, so both sides have them.
  for (const [sy, k, tag] of [[-Y, -1, ''], [Y, 1, 'R']] as [number, number, string][]) {
    const dark = new Part(), fw = new Part(), bw = new Part(), M = FRONT(-L, sy, 4.3), lift = 0.05 * k;
    for (const d of DOORS) { const u = d + L - DOOR_W / 2;
      dark.fill2(M, u, 0.75, DOOR_W, 2.4, 'glass', 0.035 * k);
      for (const [part, u0] of [[bw, u], [fw, u + DOOR_W / 2]] as [Part, number][])
        part.fill2(M, u0, 0.75, DOOR_W / 2, 2.4, 'body', lift).rect2(M, u0, 0.75, DOOR_W / 2, 2.4, 'line', lift + 0.01 * k).fill2(M, u0 + 0.12, 0.95, DOOR_W / 2 - 0.24, 1.0, 'window', lift + 0.005 * k);
    }
    for (const [part, n] of [[dark, 'doorways'], [fw, 'doorsF'], [bw, 'doorsB']] as [Part, string][]) { const o = part.build(n + tag); o.visible = false; g.add(o); }
  }
  return g;
}
