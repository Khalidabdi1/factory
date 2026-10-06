import * as THREE from 'three';
import { FRONT, SIDE, TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { rand } from '../kernel/math';
import { CURB, PORT, SEA_Z } from '../layout';
import { BOX, boxInto } from '../models/port';
import { beam } from '../models/works';
import { cityLamp, datePalm } from './sahel';

// ---- Sahel Container Terminal: the ground and everything on it that stays put ----
// A deck of land made out over the beach, its quay wall to the south with fenders and bollards along it, the cranes'
// rails, the apron's lanes; the yard's three blocks marked out for their stacks; reefer racks and the empties' stack;
// the gate at the top of the ramp from Port Av, the control tower, the workshop, the tugs' pontoon; out in the water
// the breakwater with a light at each head, and the buoys that mark the way in.
const { x0:X0, x1:X1, y0:Y0, y1:Y1, z:PZ, rails:[RL, RW], lane:LANE, pass:PASS, road:ROAD, loop:[LX0, LX1], blocks:BLOCKS, row0:ROW0, pitch:PITCH, rows:ROWS, bay:BAY, bays:BAYS } = PORT;
export const rowY = (r: number) => ROW0 + r * PITCH + BOX.W / 2;   // a stack row's middle
export const bayX = (b: number, k: number) => BLOCKS[b][0] + 0.6 + BAY * k + BOX.L / 2;   // a stack's middle along its block
export const LIGHTS: number[][] = [];   // the breakwater's lights and the buoys' lamps, for the simulation to flash

export function buildPortGround() {
  const p = new Part(), G = TOP(0, 0, PZ + 0.01);
  // the deck: its wall down to the sea, its capping beam, its paving (concrete apron, asphalt yard)
  p.box(X0, Y0, SEA_Z - 3, X1 - X0, Y1 - Y0, PZ - SEA_Z + 3, 'n');
  p.fill2(G, X0, Y0 + 2, X1 - X0, RL - 2 - Y0 - 2, 'road', 0.003);
  // the apron under the cranes: concrete by day, floodlit from the masts and the cranes after dark
  p.fill2(G, X0 + 2, RL + 0.6, X1 - X0 - 4, RW - RL - 1.2, 'lamp', 0.002);
  p.box(X0, Y1 - 0.8, PZ, X1 - X0, 0.8, 0.35, 'n');
  for (let x = X0 + 16; x < X1; x += 16) p.draw(FRONT(X0, Y1 + 0.01, PZ), [x - X0, 0.3, x - X0, PZ - SEA_Z - 0.2], 'line', 0.01);
  // fenders on the wall, a cell behind each panel; bollards on the cope between them
  for (let x = X0 + 10; x < X1 - 4; x += 16) {
    p.box(x - 1.3, Y1, SEA_Z + 0.5, 2.6, 0.5, PZ - SEA_Z - 0.9, 'kb').cylY(x, Y1 - 0.2, (PZ + SEA_Z) / 2, 0.75, 0.3, 10, 'kb');
    p.cylZ(x + 8, Y1 - 0.45, PZ + 0.35, 0.32, 0.55, 10, 'kb').cylZ(x + 8, Y1 - 0.45, PZ + 0.9, 0.45, 0.14, 10, 'kb');
  }
  // the east end: a slope of rock armour down to the water
  p.poly('body', [W(X1, Y0, PZ), W(X1, Y1, PZ), W(X1 + 5, Y1, SEA_Z), W(X1 + 5, Y0, SEA_Z)]);
  for (let i = 0; i < 70; i++) { const y = rand(Y0 + 1, Y1 - 1), u = rand(0.3, 4.6), x = X1 + u, z = PZ + (SEA_Z - PZ) * u / 5;
    p.seg('detail', W(x, y, z + 0.05), W(x + 0.5, y + 0.6, z - 0.5 + 0.05)); }
  // the cranes' rails, the power trench beside the water-side rail, the lanes under the cranes, the hatch-cover park
  for (const y of [RL, RW]) for (const d of [-0.08, 0.08]) p.draw(G, [X0 + 4, y + d, X1 - 3, y + d], 'line', 0.01);
  for (let x = X0 + 4; x < X1 - 4; x += 3) p.draw(G, [x, RW - 1.3, x + 1.6, RW - 1.3], 'detail', 0.01);
  for (const y of [LANE - PASS - 1.6, LANE - PASS / 2, LANE + 1.8]) for (let x = LX0; x < LX1; x += 4) p.draw(G, [x, y, x + 2.2, y], 'line', 0.012);
  p.text(G, 'SAHEL CONTAINER TERMINAL · BERTH 1', (X0 + X1) / 2, RW - 2.6, 1.6, 'paint', 'middle', 0.012);
  for (const [x, w] of [[688, 22], [714, 22], [854, 22], [880, 22]]) { p.box(x, 313, PZ, w, 7.2, 0.7, 'n'); p.draw(TOP(x, 313, PZ + 0.71), [0, 3.6, w, 3.6], 'line', 0.01); }
  for (let x = 742; x < 852; x += 6) p.box(x, 314.2, PZ, 4.2, 2.6, 2.0, 'k');   // lashing cages
  // bay numbers along the cope where the ship lies
  for (let k = 0; k < PORT.ship.bays; k++) p.text(TOP(PORT.ship.x + PORT.ship.bay0 + k * PORT.ship.pitch, Y1 - 1.6, PZ + 0.36), String(2 * k + 1).padStart(2, '0'), 0, 0, 0.9, 'paint', 'middle', 0.01);
  // the yard: each block's slots, its letter, the gantry's tyre lanes; the road under the gantries
  BLOCKS.forEach(([bx0, bx1], b) => {
    const segs: number[] = [];
    for (let r = 0; r <= ROWS; r++) { const y = ROW0 + r * PITCH - 0.23; segs.push(bx0, y, bx1, y); }
    for (let k = 0; k <= BAYS; k++) { const x = bx0 + 0.3 + k * BAY; segs.push(x, ROW0 - 0.23, x, ROW0 + ROWS * PITCH - 0.23); }
    p.draw(G, segs, 'line', 0.01);
    for (const y of PORT.rtg) for (let x = bx0 - 6; x < bx1 + 6; x += 2.4) p.draw(G, [x, y, x + 1.4, y], 'detail', 0.01);
    p.text(TOP(bx0 - 3.6, ROW0 + 6.5, PZ + 0.02), 'ABC'[b], 0, 0, 3.2, 'paint', 'middle', 0.01);
  });
  for (let x = LX0; x < LX1; x += 4) p.draw(G, [x, ROAD + PASS / 2, x + 2.2, ROAD + PASS / 2], 'line', 0.012);
  // light masts between the yard and the quay, their lamps lit after dark
  for (const x of [682, 741, 800, 859, 918]) {
    p.cylZ(x, 316, PZ, 0.45, 32, 8, 'n').box(x - 1.8, 316 - 1.8, PZ + 32, 3.6, 3.6, 0.5, 'n');
    for (const [dx, dy] of [[-1.5, -1.5], [0.7, -1.5], [-1.5, 0.7], [0.7, 0.7]]) p.box(x + dx, 316 + dy, PZ + 31.4, 0.8, 0.8, 0.6, 'l');
    for (let z = PZ + 1; z < PZ + 31; z += 1.2) p.seg('detail', W(x + 0.46, 316 - 0.3, z), W(x + 0.46, 316 + 0.3, z));
  }
  // the reefer racks at the west end: two bays of boxes on their ends, steel stairs and walkways up the racks, the
  // reefer units' panels lit at night
  const [RX0] = PORT.reefer;
  for (let i = 0; i < 6; i++) for (const yb of [Y0 + 4, Y0 + 18]) for (let t = 0; t < 2; t++) {
    const x = RX0 + 2 + i * 3.6, y = yb + BOX.L / 2, z = PZ + t * BOX.H, tone = (i + t) % 3 ? 'n' : 'k';
    boxInto(p, x, y, z, false, tone); p.fill2(FRONT(x - 0.9, yb + BOX.L + 0.01, z + 2.2), 0, 0, 1.8, 1.2, 'window', 0.02);
  }
  for (let i = 0; i <= 6; i++) { const x = RX0 + 0.2 + i * 3.6; for (const y of [Y0 + 4 + BOX.L + 0.4, Y0 + 18 + BOX.L + 0.4]) {
    p.box(x - 0.1, y, PZ, 0.2, 0.2, 2 * BOX.H + 1.2, 'k'); } }
  for (const y of [Y0 + 4 + BOX.L + 0.4, Y0 + 18 + BOX.L + 0.4]) for (const z of [PZ + BOX.H, PZ + 2 * BOX.H]) p.box(RX0, y - 0.6, z, 6 * 3.6 + 0.4, 1.2, 0.1, 'k').seg('line', W(RX0, y + 0.6, z + 1.0), W(RX0 + 22, y + 0.6, z + 1.0));
  // the empties, stacked five high east of the circuit, and the reach stacker that works them
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { const n = 5 - ((r + k) % 3 === 0 ? 2 : 0) - (r === 3 && k === 1 ? 3 : 0);
    for (let t = 0; t < n; t++) boxInto(p, 920 + 6.3 + k * 12.6, 304 + r * 2.8 + 1.22, PZ + t * BOX.H, true, (r * 3 + k + t) % 4 === 1 ? 'k' : 'n'); }
  p.box(940, 318.6, PZ, 7, 3.2, 1.8, 'k').box(941, 319.0, PZ + 1.8, 2.2, 2.4, 2.0, 'k');
  beam(p, [944, 320.2, PZ + 2.6], [935, 320.2, PZ + 9], 0.8, 'k');
  p.box(931.2, 318.8, PZ + 8.4, 3.6, 2.8, 0.4, 'kb');
  // the gate at the top of the ramp from Port Av: the ramp, the canopy over four lanes, booths, barriers, the OCR
  // portal, the scanner's arch on the way out; the name over it
  const [rx0, rx1, ry0, ry1] = PORT.ramp, [gx0, gx1] = PORT.gate;
  p.poly('road', [W(rx0, ry0, CURB), W(rx1, ry0, CURB), W(rx1, ry1, PZ + 0.01), W(rx0, ry1, PZ + 0.01)]);
  p.poly('body', [W(rx1, ry0, CURB), W(rx1, ry1, PZ), W(rx1, ry1, CURB)]);
  for (const x of [rx0 - 0.4, rx1]) p.seg('line', W(x, ry0, CURB + 0.9), W(x, ry1, PZ + 0.9));
  const cz = PZ + 6.2;
  for (const x of [gx0, gx0 + 7, gx0 + 14, gx0 + 21, gx1]) for (const y of [ry1 + 1, ry1 + 8]) p.box(x - 0.25, y - 0.25, PZ, 0.5, 0.5, cz - PZ, 'n');
  p.box(gx0 - 1, ry1, cz, gx1 - gx0 + 2, 10, 0.8, 'n').box(gx0 - 1, ry1 + 9.6, cz + 0.8, gx1 - gx0 + 2, 0.4, 1.4, 'n');
  p.text(FRONT(gx0 - 1, ry1 + 10.01, cz + 2.2), 'SAHEL CONTAINER TERMINAL · ميناء سهل', (gx1 - gx0 + 2) / 2, 0.8, 0.62, 'ink', 'middle', 0.02);
  for (let k = 0; k < 4; k++) { const x = gx0 + 3.5 + k * 7;
    p.box(x + 2.0, ry1 + 4, PZ, 1.4, 2.2, 2.6, 'n').fill2(FRONT(x + 2.05, ry1 + 6.21, PZ + 2.3), 0, 0, 1.3, 1.0, 'window', 0.02);
    p.box(x - 1.5, ry1 + 3.2, PZ + 0.9, 3.4, 0.12, 0.12, 'k');
    for (let y = ry1 + 0.5; y < ry1 + 9.5; y += 1.4) p.draw(G, [x, y, x, y + 0.7], 'line', 0.01); }
  for (const x of [gx0 - 0.5, gx1 + 0.5]) p.box(x - 0.3, ry1 - 0.6, PZ, 0.6, 0.6, 5, 'k');
  p.box(gx0 - 0.5, ry1 - 0.6, PZ + 5, gx1 - gx0 + 1, 0.6, 0.6, 'k');
  for (let x = gx0 + 1; x < gx1; x += 3) p.box(x, ry1 - 0.4, PZ + 4.6, 0.6, 0.3, 0.3, 'l');
  // the control tower: a shaft, the glass cab on top that sees the whole quay, its roof and aerials
  const [tx, ty] = [925, 288];
  p.box(tx - 2.5, ty - 2.5, PZ, 5, 5, 24, 'n');
  for (let z = PZ + 3; z < PZ + 23; z += 3) p.fill2(FRONT(tx - 1.5, ty + 2.51, z + 1.2), 0, 0, 3, 0.9, 'window', 0.02);
  p.box(tx - 5, ty - 5, PZ + 24, 10, 10, 0.5, 'n').box(tx - 4.6, ty - 4.6, PZ + 24.5, 9.2, 9.2, 3.2, 'g');
  p.fill2(FRONT(tx - 4.6, ty + 4.61, PZ + 27.5), 0, 0, 9.2, 2.6, 'window', 0.02).fill2(SIDE(tx + 4.61, ty + 4.6, PZ + 27.5), 0, 0, 9.2, 2.6, 'window', 0.02);
  for (let u = 1.15; u < 9.2; u += 2.3) { p.draw(FRONT(tx - 4.6, ty + 4.62, PZ + 27.5), [u, 0, u, 2.6], 'line', 0.02); p.draw(SIDE(tx + 4.62, ty + 4.6, PZ + 27.5), [u, 0, u, 2.6], 'line', 0.02); }
  p.box(tx - 5.6, ty - 5.6, PZ + 27.7, 11.2, 11.2, 0.6, 'n').seg('line', W(tx + 2, ty - 2, PZ + 28.3), W(tx + 2, ty - 2, PZ + 33)).box(tx - 2.3, ty + 1.5, PZ + 28.3, 0.8, 0.8, 0.8, 'n');
  p.text(SIDE(tx + 2.51, ty + 2.5, PZ + 22), 'SCT', 2.5, 0.8, 1.0, 'ink', 'middle', 0.02);
  // the workshop: a hall with a north-light roof, its doors to the south, a spare spreader on the apron outside
  const [wx0, wx1, wy0, wy1] = [934, 956, 281.5, 300];
  p.box(wx0, wy0, PZ, wx1 - wx0, wy1 - wy0, 8, 'n');
  for (let y = wy0; y < wy1 - 0.1; y += 3.7) p.extrude([[wx0, y, PZ + 8], [wx0, y + 3.7, PZ + 8], [wx0, y + 3.7, PZ + 10]], [wx1 - wx0, 0, 0], 'n');
  for (const x of [wx0 + 2, wx0 + 12]) { p.fill2(FRONT(x, wy1 + 0.01, PZ + 6.2), 0, 0, 8, 6.2, 'kob', 0.02); for (let z = 0.6; z < 6.2; z += 0.6) p.draw(FRONT(x, wy1 + 0.02, PZ + 6.2), [0, z, 8, z], 'koline', 0.02); }
  p.text(FRONT(wx0, wy1 + 0.02, PZ + 7.6), 'WORKSHOP', (wx1 - wx0) / 2, 0.5, 0.75, 'ink', 'middle', 0.02);
  p.box(938, 301, PZ, BOX.L, BOX.W, 0.35, 'kb').box(943.6, 301.6, PZ + 0.35, 1.0, 1.3, 0.7, 'kb');
  // the tugs' pontoon off the east end of the quay, and its gangway
  p.box(921, Y1 + 1.4, SEA_Z, 34, 2.6, 0.9, 'n');
  for (let x = 923; x < 955; x += 5) p.cylZ(x, Y1 + 2.7, SEA_Z - 0.4, 0.25, 2.6, 6, 'k');
  beam(p, [951, Y1 - 0.2, PZ + 0.1], [951, Y1 + 2.4, SEA_Z + 0.95], 1.0, 'n', 0.15);
  // the fence along the promenade, the gate's gap left open; lamps and palms along it outside
  for (let x = X0 + 1; x < X1; x += 2.5) if (x < PORT.ramp[0] - 1 || x > PORT.ramp[1] + 1) p.seg('line', W(x, Y0 + 0.6, PZ), W(x, Y0 + 0.6, PZ + 2.4));
  for (const [a, b] of [[X0 + 1, PORT.ramp[0] - 1], [PORT.ramp[1] + 1, X1]]) for (const z of [PZ + 1.2, PZ + 2.4]) p.seg('line', W(a, Y0 + 0.6, z), W(b, Y0 + 0.6, z));
  // the breakwater: a mound of rock, its crest wall, a light tower at each head
  const [bx0, bx1, by0, by1] = PORT.breakwater, bm = (by0 + by1) / 2;
  p.extrude([[bx0, by0 - 3, SEA_Z - 0.4], [bx0, by0, 2.2], [bx0, by1, 2.2], [bx0, by1 + 3, SEA_Z - 0.4]], [bx1 - bx0, 0, 0], 'n');
  p.box(bx0, bm - 0.6, 2.2, bx1 - bx0, 1.2, 1.4, 'n');
  for (let i = 0; i < 420; i++) { const x = rand(bx0, bx1), u = rand(0, 1), y = by1 + 3 * u, z = 2.2 + (SEA_Z - 0.4 - 2.2) * u, s = rand(0.4, 0.9);
    p.seg('detail', W(x, y, z + 0.05), W(x + s, y + s * 0.4, z - s * 0.5 + 0.05)); }
  for (const [x, dark] of [[bx0, true], [bx1, false]] as [number, boolean][]) {
    p.cylZ(x, bm, SEA_Z - 0.4, 4.6, 2.6 - SEA_Z, 16, 'n').cylZ(x, bm, 2.2, 1.2, 9, 10, dark ? 'k' : 'n').cylZ(x, bm, 11.2, 1.7, 0.3, 10, 'n');
    p.fill2(FRONT(x - 1.2, bm + 1.21, 6.6), 0, 0, 2.4, 1.0, dark ? 'body' : 'kob', 0.02);
    LIGHTS.push([x, bm, 11.5, dark ? 1 : 0]);
  }
  // the buoys that mark the way in from the west: cans to the north, cones to the south, a lamp on each
  for (const [x, y, can] of [[560, 357, true], [560, 384, false], [640, 357, true], [640, 384, false]] as [number, number, boolean][]) {
    p.cylZ(x, y, SEA_Z - 0.3, 1.0, 1.4, 10, can ? 'k' : 'n').box(x - 0.15, y - 0.15, SEA_Z + 1.1, 0.3, 0.3, 2.2, can ? 'k' : 'n');
    if (can) p.box(x - 0.45, y - 0.45, SEA_Z + 3.3, 0.9, 0.9, 0.9, 'k'); else p.geo(new THREE.ConeGeometry(0.6, 1.0, 4), new THREE.Matrix4().makeTranslation(x, SEA_Z + 3.8, y), 'n');
    LIGHTS.push([x, y, SEA_Z + 4.6, can ? 1 : 0]);
  }
  // lamps and palms along the promenade side of the fence
  for (let x = 664; x < 950; x += 26) if (Math.abs(x - (PORT.ramp[0] + PORT.ramp[1]) / 2) > 12) datePalm(p, x, 277.6, 0.9, CURB);
  for (const x of [700, 760, 820, 930]) cityLamp(p, x, Y0 + 2.6, false, 0, -1, PZ);
  return p.build('portGround');
}
