import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { BRT, CITY, CURB } from '../layout';

// ---- Metrobus stations: glass boxes on the boulevard's median, after Riyadh's ----
// Each is 24 m of glazing between the two busways, cooled inside, with sliding doors on both sides where the buses' doors
// stop; a deep canopy over it, panels on the canopy, a lit band round its edge; ticket gates at its west end, where a
// crossing comes over from each pavement. The glass is drawn as its frames, so the people waiting show through.
const [M0, M1] = CITY.median, H = 2.7, L = 12;
export const brtDoorX = (s: number, dir: number) => [8.1, 2.9, -5.0].map(d => s + dir * d);   // where a bus's doors stop (its front 10 m past the middle)
export const crossingX = (s: number) => s - L - 2.5;
export function buildBrtStations() {
  const p = new Part(), G = TOP(0, 0, 0);
  for (const [s, name] of BRT.stops) {
    const x0 = s - L, x1 = s + L, z = CURB;
    p.box(x0, M0 + 0.1, z, x1 - x0, M1 - M0 - 0.2, 0.18);                                  // the floor, level with a bus's
    // the canopy: a slab out over the doors, panels on top, a lit band along its edges, slim posts
    // (high enough for a bus's roof and its air-conditioning to pass under its edges)
    const zc = z + 3.75;
    p.box(x0 - 1, M0 - 0.7, zc, x1 - x0 + 2, M1 - M0 + 1.4, 0.3).box(x0 - 1, M0 - 0.7, zc + 0.3, x1 - x0 + 2, 0.15, 0.12, 'l').box(x0 - 1, M1 + 0.55, zc + 0.3, x1 - x0 + 2, 0.15, 0.12, 'l');
    for (let x = x0 + 1; x < x1 - 1; x += 2.2) p.rect2(TOP(x, M0 - 0.4, zc + 0.3), 0, 0, 1.9, M1 - M0 + 0.8, 'detail', 0.02);
    for (const x of [x0 + 0.3, s, x1 - 0.3]) for (const y of [M0 + 0.25, M1 - 0.25]) p.box(x - 0.08, y - 0.08, z + H, 0.16, 0.16, zc - z - H);
    // the glass sides as frames, kick plates and a transom; doors (where a bus's doors come) drawn open-able
    for (const [y, dir] of [[M0 + 0.15, -1], [M1 - 0.15, 1]] as [number, number][]) {
      const doors = brtDoorX(s, dir);
      p.box(x0, y - 0.05, z + 0.18, x1 - x0, 0.1, 0.3, 'g').box(x0, y - 0.05, z + H - 0.35, x1 - x0, 0.1, 0.35, 'g');
      for (let x = x0; x <= x1 + 1e-6; x += 1.5) if (!doors.some(d => Math.abs(x - d) < 1.0)) p.seg('line', W(x, y, z + 0.18), W(x, y, z + H));
      p.seg('line', W(x0, y, z + H), W(x1, y, z + H));
      for (const d of doors) for (const dx of [-0.8, 0, 0.8]) p.seg(dx ? 'line' : 'detail', W(d + dx, y, z + 0.5), W(d + dx, y, z + H - 0.35));
    }
    for (const x of [x0, x1]) p.box(x - 0.05, M0 + 0.1, z + 0.18, 0.1, M1 - M0 - 0.2, H - 0.18, x === x1 ? 'n' : 'g');
    // inside: benches back to back down the middle, a screen for the next buses, a map
    for (const bx of [s - 6, s + 5]) p.box(bx - 1.5, (M0 + M1) / 2 - 0.45, z + 0.18, 3, 0.9, 0.42).box(bx - 1.5, (M0 + M1) / 2 - 0.05, z + 0.6, 3, 0.1, 0.45);
    p.box(s - 0.6, (M0 + M1) / 2 - 0.1, z + 1.9, 1.2, 0.2, 0.6, 'w');
    // the west end: gates, and a totem with the sign
    for (const v of [M0 + 0.9, (M0 + M1) / 2, M1 - 0.9]) p.box(x0 + 0.6, v - 0.12, z + 0.18, 1.0, 0.24, 0.95).box(x0 + 0.7, v - 0.12, z + 1.13, 0.4, 0.24, 0.05, 'k');
    p.box(x0 - 0.9, (M0 + M1) / 2 - 0.2, z, 0.4, 0.4, 3.4).box(x0 - 1.0, (M0 + M1) / 2 - 0.45, z + 3.4, 0.6, 0.9, 0.9, 'k');
    const F = FRONT(x0 - 1, M1 + 0.7, zc + 0.3), E = SIDE(x1 + 1, M1 + 0.7, zc + 0.3);
    p.text(F, `METROBUS · ${name.toUpperCase()}`, (x1 - x0 + 2) / 2, 0.27, 0.24, 'ink', 'middle', 0.05);
    p.text(E, 'M1', (M1 - M0 + 1.4) / 2, 0.27, 0.24, 'ink', 'middle', 0.05);
    // the crossing over to it from each pavement, on the asphalt only
    const cx = crossingX(s);
    for (const [y0, y1] of [[CITY.blvd[0], CITY.sep[0][0]], [CITY.sep[0][1], M0], [M1, CITY.sep[1][0]], [CITY.sep[1][1], CITY.blvd[1]]])
      for (let y = y0 + 0.5; y < y1 - 0.3; y += 1.1) p.poly('deck', [[cx - 1.4, y], [cx + 1.4, y], [cx + 1.4, y + 0.56], [cx - 1.4, y + 0.56]].map(([a, b]) => W(a, b, 0.04)));
    p.draw(G, [cx - 1.6, CITY.blvd[0], cx - 1.6, CITY.blvd[1], cx + 1.6, CITY.blvd[0], cx + 1.6, CITY.blvd[1]], 'detail', 0.05);
  }
  return p.build('brtStations');
}
