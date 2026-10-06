import * as THREE from 'three';
import { FRONT, SIDE, W } from '../kernel/iso';
import { Part } from '../kernel/part';
import { PORT, SEA_Z } from '../layout';
import { beam } from './works';

// ---- Sahel Container Terminal: what moves there ----
// Frames: a crane or a yard gantry is posed at its x along the quay with y and z left as the town's (its parts are
// drawn at their real y and height); a vehicle or a ship is drawn with +x forward, from its front or its middle.
const PZ = PORT.z;
export const BOX = { L:12.19, W:2.44, H:2.59 };

// A forty-foot box: its corrugations on the long side the town sees, the door end's locking bars. Centred on (x, y),
// along x or along y, bottom at z. n and k boxes are drawn with a deck-toned top, nb and kb with one fill (cheaper).
export function boxInto(p: Part, x: number, y: number, z: number, alongX: boolean, tone: string) {
  const [l, w] = alongX ? [BOX.L, BOX.W] : [BOX.W, BOX.L], line = tone[0] === 'k' ? 'koline' : 'detail', H = BOX.H;
  p.box(x - l / 2, y - w / 2, z, l, w, H, tone);
  const ribs: number[] = []; for (let u = 0.45; u < (alongX ? l : w) - 0.3; u += 0.6) ribs.push(u, 0.14, u, H - 0.14);
  const doors = [0.35, 0.14, 0.35, H - 0.14, 0.8, 0.14, 0.8, H - 0.14, (alongX ? w : l) / 2, 0.08, (alongX ? w : l) / 2, H - 0.08];
  if (alongX) { p.draw(FRONT(x - l / 2, y + w / 2, z + H), ribs, line, 0.012); p.draw(SIDE(x + l / 2, y + w / 2, z + H), doors, line, 0.012); }
  else { p.draw(SIDE(x + l / 2, y + w / 2, z + H), ribs, line, 0.012); p.draw(FRONT(x - l / 2, y + w / 2, z + H), doors, line, 0.012); }
  return p;
}
// a box of its own, for one on the move: centred on its origin along x, bottom at 0
export function buildBox(tone: string) { return boxInto(new Part(), 0, 0, 0, true, tone === 'k' ? 'kb' : 'nb').build('box'); }

// the spreader that takes a box by its corner castings, and the head block it hangs from (origin at its underside,
// where a box's top meets it); and four hoist ropes a metre long, to be stretched to the drop
function buildSpreader() {
  const p = new Part();
  p.box(-BOX.L / 2, -BOX.W / 2, 0, BOX.L, BOX.W, 0.32, 'kb').box(-1.0, -0.65, 0.32, 2.0, 1.3, 0.7, 'kb');
  for (const x of [-BOX.L / 2, BOX.L / 2 - 0.3]) for (const y of [-BOX.W / 2 - 0.15, BOX.W / 2]) p.box(x, y, -0.35, 0.3, 0.15, 0.6, 'kb');
  return p.build('spreader');
}
function buildRopes() {
  const p = new Part(); for (const x of [-0.7, 0.7]) for (const y of [-0.45, 0.45]) p.seg('line', W(x, y, 0), W(x, y, 1));
  return p.build('ropes');
}
// a trolley on a crane's girders, its operator's cab hung under it (windows lit after dark)
function buildTrolley(w: number) {
  const p = new Part();
  p.box(-w, -1.8, 0, 2 * w, 3.6, 1.3, 'nb');
  for (const x of [-w + 0.4, w - 0.9]) for (const y of [-1.9, 1.6]) p.box(x, y, -0.25, 0.5, 0.3, 0.3, 'kb');
  p.box(w - 1.8, -1.2, -2.7, 1.8, 2.4, 2.4, 'nb');
  p.fill2(FRONT(w - 1.7, 1.21, -0.5), 0, 0, 1.6, 1.3, 'window', 0.02).fill2(SIDE(w + 0.01, 1.1, -0.5), 0, 0, 2.2, 1.3, 'window', 0.02);
  return p.build('trolley');
}

// ---- the ship-to-shore crane ----
// Four legs on bogies on the quay's two rails, a portal across the top, the backreach over the quay with the machinery
// house on it, the A-frame over the water-side legs, and the boom out over the ship (hinged, raised when there is no
// ship at the berth). The trolley runs the length of boom and backreach; the spreader hangs from it on its ropes.
export const STS = { half:6.2, top:PZ + 26, apex:PZ + 46, back:310, reach:38, trolleyZ:PZ + 28.8 };
export function buildSTS(name: string) {
  const g = new THREE.Group(), p = new Part(), [yl, yw] = PORT.rails, H = STS.half, top = STS.top;
  for (const y of [yl, yw]) {
    for (const x of [-H, H]) {
      p.box(x - 1.8, y - 0.65, PZ, 3.6, 1.3, 1.2, 'k');
      for (const dx of [-1.1, 0, 1.1]) p.cylY(x + dx, y - 0.75, PZ + 0.45, 0.42, 1.5, 10, 'k');
      p.box(x - 0.65, y - 0.65, PZ + 1.2, 1.3, 1.3, top - PZ - 1.2, 'n');
    }
    p.box(-H, y - 0.5, PZ + 11.6, 2 * H, 1.0, 1.3, 'n');                     // the sill beam
    beam(p, [-H + 0.6, y, PZ + 12.9], [H - 0.6, y, top - 1.8], 0.5, 'n');      // a diagonal brace above it
    p.box(-H - 0.7, y - 0.75, top - 1.8, 2 * H + 1.4, 1.5, 1.8, 'n');         // the portal's cross beam
  }
  for (const x of [-H, H]) p.box(x - 0.75, yl + 0.75, top - 1.8, 1.5, yw - yl - 1.5, 1.8, 'n');
  // stairs up a land-side leg, landings at the sill and the portal
  for (let z = PZ + 1.6; z < top - 2; z += 0.9) p.seg('detail', W(H + 0.66, yl - 0.65, z), W(H + 0.66, yl + 0.65, z + 0.45));
  // the backreach girders, the machinery house on them, the A-frame and its backstays
  for (const x of [-2.3, 2.3]) p.box(x - 0.6, STS.back, top, 1.2, yw - STS.back, 2.6, 'n');
  const hy0 = STS.back + 0.6, hy1 = hy0 + 8.6;
  p.box(-4.2, hy0, top + 2.6, 8.4, hy1 - hy0, 4.0, 'n');
  for (let x = -3.4; x < 3.6; x += 1.4) p.fill2(FRONT(x, hy1 + 0.01, top + 5.8), 0, 0, 0.8, 0.5, 'kob', 0.02);
  p.text(FRONT(-4.2, hy1 + 0.02, top + 4.6), name, 4.2, 0.95, 0.9, 'ink', 'middle', 0.03);
  const ay = yw - 1.6, az = STS.apex;
  for (const x of [-2.3, 2.3]) { beam(p, [x, yw, top + 2.6], [x * 0.45, ay, az], 0.75, 'n'); beam(p, [x, yl + 2, top + 2.6], [x * 0.45, ay, az], 0.6, 'n'); }
  p.box(-1.6, ay - 0.7, az - 0.3, 3.2, 1.4, 1.0, 'n');
  for (const x of [-1.3, 1.3]) p.seg('line', W(x, ay, az), W(x * 1.7, STS.back + 0.3, top + 2.6));
  p.box(-0.25, ay - 0.25, az + 0.7, 0.5, 0.5, 0.45, 'l');                    // the aircraft-warning lamp
  // floodlights under the portal, over the lanes where the tractors stop
  for (const x of [-H + 1, H - 1]) p.box(x - 0.4, (yl + yw) / 2 - 0.3, top - 2.1, 0.8, 0.6, 0.3, 'l');
  g.add(p.build('stsFrame'));
  // the boom, hinged at the water-side legs' top
  const boom = new THREE.Group(); boom.name = 'boom'; boom.position.copy(W(0, yw, top)); g.add(boom);
  const b = new Part(), L = STS.reach;
  for (const x of [-2.3, 2.3]) b.box(x - 0.6, 0, 0, 1.2, L, 2.6, 'n');
  for (let u = 2.5; u < L; u += 2.5) b.seg('detail', W(-2.3, u, 2.6), W(2.3, u, 2.6));
  b.box(-3.0, L - 0.7, 0, 6.0, 0.7, 2.9, 'n');
  for (let u = 7; u < L; u += 10) b.box(-0.4, u, -0.32, 0.8, 0.5, 0.32, 'l');
  boom.add(b.build('boomPart'));
  // trolley, spreader, ropes; the forestays (redrawn as the boom goes up and down)
  const trolley = buildTrolley(2.7), spreader = buildSpreader(), ropes = buildRopes(), stays = new THREE.Group();
  stays.name = 'stays'; g.add(trolley, spreader, ropes, stays);
  return { g, boom, trolley, spreader, ropes, stays };
}
// the forestays from the A-frame's head down to the boom, at its present angle (0 down, 1 raised)
export function staysPart(raise: number) {
  const p = new Part(), [, yw] = PORT.rails, a = raise * 1.35, top = STS.top, ay = PORT.rails[1] - 1.6;
  for (const u of [16, STS.reach - 1]) for (const x of [-2.3, 2.3]) p.seg('line', W(x * 0.45, ay, STS.apex), W(x, yw + Math.cos(a) * u, top + 2.6 + Math.sin(a) * u));
  return p.build('stays');
}

// ---- the yard's gantry crane on rubber tyres ----
// Two sills on their wheels either side of a block, two legs up from each, girders across the top for the trolley;
// the diesel's house on one sill. It drives along the block (x); the trolley crosses it (y).
export const RTG = { half:3.8, top:PZ + 16.2, trolleyZ:PZ + 17.5 };
export function buildRTG(name: string) {
  const g = new THREE.Group(), p = new Part(), [ya, yb] = PORT.rtg, H = RTG.half, top = RTG.top;
  for (const y of [ya, yb]) {
    p.box(-H - 1.3, y - 0.6, PZ + 0.55, 2 * H + 2.6, 1.2, 1.1, 'n');
    for (const x of [-H - 0.7, -H + 0.7, H - 0.7, H + 0.7]) p.cylY(x, y - 0.55, PZ + 0.55, 0.55, 1.1, 10, 'k');
    for (const x of [-H, H]) p.box(x - 0.45, y - 0.45, PZ + 1.65, 0.9, 0.9, top - PZ - 1.65, 'n');
    beam(p, [-H + 0.4, y, PZ + 2.0], [H - 0.4, y, top - 0.9], 0.35, 'n');
    p.box(-H - 0.5, y - 0.55, top - 0.9, 2 * H + 1.0, 1.1, 0.9, 'n');
  }
  for (const x of [-H + 1.3, H - 1.3]) p.box(x - 0.55, ya - 0.6, top, 1.1, yb - ya + 1.2, 1.3, 'n');
  p.box(-2.2, yb + 0.6, PZ + 1.65, 4.4, 1.8, 2.4, 'n');
  for (let x = -1.6; x < 2; x += 0.8) p.seg('detail', W(x, yb + 2.41, PZ + 2.0), W(x, yb + 2.41, PZ + 3.0));
  p.text(FRONT(-2.2, yb + 2.42, PZ + 4.0), name, 2.2, 0.62, 0.5, 'ink', 'middle', 0.02);
  for (const x of [-H, H]) for (const y of [ya, yb]) p.box(x - 0.2, y - 0.2, top + 1.3, 0.4, 0.4, 0.3, 'l');
  g.add(p.build('rtgFrame'));
  const trolley = buildTrolley(2.6), spreader = buildSpreader(), ropes = buildRopes();
  g.add(trolley, spreader, ropes);
  return { g, trolley, spreader, ropes };
}

// ---- the terminal tractor and its skeletal trailer ----
// The tractor: a one-man cab off to one side, the engine beside it, the fifth wheel behind (origin at its front bumper).
// The trailer: two beams and a gooseneck, twistlocks at the corners, a bogie at the back (origin at the king pin).
export const TRAILER = { pin:-3.5, len:12.8, deck:1.45 };
export function buildYardTractor() {
  const p = new Part();
  p.box(-4.4, -1.2, 0.5, 4.4, 2.4, 0.5, 'kb').box(-2.1, -1.2, 1.0, 2.0, 1.45, 1.9, 'kb').box(-1.3, 0.35, 1.0, 1.25, 0.85, 0.75, 'kb');
  p.fill2(SIDE(-0.09, 0.24, 2.75), 0, 0, 1.4, 0.8, 'window', 0.02).fill2(FRONT(-2.0, 0.26, 2.75), 0, 0, 1.8, 0.8, 'window', 0.02);
  p.cylZ(-2.3, 0.6, 1.0, 0.09, 2.3, 6, 'kb').cylZ(-3.5, 0, 1.0, 0.55, 0.12, 10, 'kb');
  for (const x of [-0.9, -3.5]) for (const y of [-1.25, 0.85]) p.cylY(x, y, 0.5, 0.5, 0.4, 10, 'kb');
  p.box(-1.3, -0.75, 2.9, 0.35, 0.35, 0.22, 'l');
  return p.build('yardTractor');
}
export function buildSkeletal() {
  const p = new Part(), L = TRAILER.len, z = TRAILER.deck;
  for (const y of [-0.55, 0.45]) p.box(-L + 0.3, y, z - 0.45, L - 0.3, 0.1, 0.45, 'kb');
  p.box(-1.2, -1.22, z - 0.25, 1.6, 2.44, 0.25, 'kb').box(-L + 0.3, -1.22, z - 0.25, 0.4, 2.44, 0.25, 'kb');
  for (let x = -3; x > -L + 1; x -= 3) p.box(x, -1.0, z - 0.3, 0.2, 2.0, 0.2, 'kb');
  for (const x of [0.15, -L + 0.3]) for (const y of [-1.22, 1.07]) p.box(x, y, z, 0.15, 0.15, 0.12, 'nb');
  for (const x of [-L + 2.2, -L + 3.4]) for (const y of [-1.2, 0.8]) p.cylY(x, y, 0.5, 0.5, 0.4, 10, 'kb');
  for (const y of [-0.9, 0.7]) p.box(-2.0, y, 0.2, 0.2, 0.2, z - 0.65, 'kb');
  return p.build('skeletal');
}

// ---- the ship ----
// A feeder of some 150 m: a transom stern, the bow drawn fine to its stem, the boot-top above the water; hatch
// covers and lashing bridges bay by bay; the house aft, five decks and the bridge with its wings, the funnel behind,
// the radar mast; the freefall lifeboat on its ramp over the stern; the forecastle, the foremast. Origin amidships at
// the waterline's level, +x forward. The cargo on deck is drawn by the simulation; the mooring ropes show at the berth.
export const SHIP = { deck:6.4, hatch:7.1 };
export function buildShip(name: string, port: string) {
  const g = new THREE.Group(), p = new Part(), Lh = PORT.ship.half, B = PORT.ship.beam, zd = SHIP.deck, zb = SEA_Z - 1.2;
  const plan = [[-Lh, -B + 1.5], [-Lh + 2, -B], [Lh - 26, -B], [Lh - 12, -B + 3.6], [Lh - 4, -B + 8.4], [Lh, -1.6], [Lh, 1.6], [Lh - 4, B - 8.4], [Lh - 12, B - 3.6], [Lh - 26, B], [-Lh + 2, B], [-Lh, B - 1.5]];
  p.extrude(plan.map(([x, y]) => [x, y, zb]), [0, 0, zd - zb], 'n');
  const S = FRONT(-Lh + 2, B + 0.01, SEA_Z + 1.6);
  p.fill2(S, 0, 0, 2 * Lh - 28, 1.6, 'kob', 0.02).draw(FRONT(-Lh + 2, B + 0.02, zd - 0.6), [0, 0, 2 * Lh - 28, 0], 'line', 0.02);
  p.text(FRONT(Lh - 44, B + 0.03, zd - 1.0), name, 8, 1.3, 1.25, 'ink', 'middle', 0.03);
  p.text(FRONT(-Lh + 3, B + 0.03, zd - 1.0), port, 0, 1.3, 0.9, 'ink', 'start', 0.03);
  for (let k = 0; k < 6; k++) p.draw(FRONT(Lh - 24, B + 0.03, SEA_Z + 4.2), [0, k * 0.5, 0.5, k * 0.5], 'line', 0.02);   // draught marks
  // the forecastle, its bulwark, the windlasses; the foremast and its lamp
  const fx = Lh - 16, fb = B - 2.57;
  p.extrude([[fx, -fb, zd], [Lh - 12, -B + 3.6, zd], [Lh - 4, -B + 8.4, zd], [Lh, -1.6, zd], [Lh, 1.6, zd], [Lh - 4, B - 8.4, zd], [Lh - 12, B - 3.6, zd], [fx, fb, zd]], [0, 0, 2.4], 'n');
  for (const y of [-4, 4]) p.cylZ(Lh - 9, y, zd + 2.4, 0.8, 0.9, 10, 'kb');
  p.box(Lh - 7.2, -0.15, zd + 2.4, 0.3, 0.3, 9, 'k').box(Lh - 7.35, -0.3, zd + 11.4, 0.6, 0.6, 0.4, 'l');
  // hatch covers and the lashing bridges between the bays
  for (let k = 0; k < PORT.ship.bays; k++) {
    const x = PORT.ship.bay0 + k * PORT.ship.pitch;
    p.box(x - 6.3, -B + 1.2, zd, 12.6, 2 * B - 2.4, SHIP.hatch - zd, 'n');
    p.box(x - 6.75, -B + 0.6, zd, 0.6, 2 * B - 1.2, 2.9, 'k');
    for (let y = -B + 1.6; y < B - 1; y += 2.6) p.seg('koline', W(x - 6.45, y, zd + 0.7), W(x - 6.45, y, zd + 2.9));
  }
  // the house: five decks, rows of windows (lit at night), the bridge and its wings, the wheelhouse windows forward
  const hx0 = -Lh + 5, hx1 = -Lh + 17, hz = zd + 14;
  p.box(hx0, -9, zd, hx1 - hx0, 18, hz - zd, 'n');
  for (let d = 0; d < 5; d++) { const z = zd + 2.8 * (d + 1) - 0.6;
    for (let x = hx0 + 0.8; x < hx1 - 1; x += 1.6) p.fill2(FRONT(x, 9.01, z), 0, 0, 0.9, 0.8, 'window', 0.02);
    for (let y = 8; y > -8.5; y -= 1.8) p.fill2(SIDE(hx1 + 0.01, y, z), 0, 0, 1.0, 0.8, 'window', 0.02); }
  p.box(hx1 - 5, -B - 0.6, hz, 5.4, 2 * B + 1.2, 2.6, 'n').fill2(SIDE(hx1 + 0.41, B + 0.5, hz + 2.2), 0, 0, 2 * B + 1.0, 1.1, 'window', 0.02);
  p.fill2(FRONT(hx1 - 5, B + 0.61, hz + 2.2), 0, 0, 5.2, 1.1, 'window', 0.02);
  // the radar mast on the wheelhouse roof, its scanners; the funnel with its band
  p.box(hx1 - 3, -0.2, hz + 2.6, 0.4, 0.4, 5, 'k').box(hx1 - 4.5, -1.6, hz + 5.0, 3.4, 3.2, 0.12, 'k').box(hx1 - 3.6, -1.8, hz + 6.4, 2.2, 0.15, 0.15, 'kb').box(hx1 - 3.6, 1.0, hz + 4.6, 2.2, 0.15, 0.15, 'kb');
  p.box(hx1 - 3.25, -0.25, hz + 7.6, 0.5, 0.5, 0.35, 'l');
  p.box(-Lh + 1.2, -3.2, hz - 2, 5, 6.4, 9, 'k').fill2(FRONT(-Lh + 1.2, 3.21, hz + 5.2), 0, 0, 5, 1.2, 'body', 0.02).fill2(SIDE(-Lh + 6.21, 3.2, hz + 5.2), 0, 0, 6.4, 1.2, 'body', 0.02);
  // the freefall lifeboat, nose down on its ramp over the stern; liferafts in their canisters by the house
  beam(p, [-Lh - 1.8, 0, zd + 4.6], [-Lh + 4.8, 0, zd + 8.6], 2.3, 'n', 2.4);
  for (const y of [-6.5, 6.5]) beam(p, [-Lh - 2.4, y * 0.25, zd + 3.4], [-Lh + 5.4, y * 0.25, zd + 8.2], 0.2, 'k');
  for (const y of [-10.5, 10.5]) p.cylY(hx0 + 2, y - 0.5, zd + 0.6, 0.45, 1.0, 8, 'n');
  // bitts and a winch at the stern for the ropes
  for (const y of [-7, 7]) p.cylZ(-Lh + 3, y, zd, 0.35, 0.8, 8, 'kb');
  g.add(p.build('hull'));
  // the mooring ropes, bow and stern, head and breast, to the quay's bollards (shown at the berth)
  const m = new Part(), qy = -(PORT.ship.y - PORT.quay) - 0.4;
  for (const [x0, x1] of [[Lh - 9, Lh + 12], [Lh - 9, Lh - 22], [-Lh + 3, -Lh - 14], [-Lh + 3, -Lh + 18]]) m.seg('line', W(x0, -B + 1, zd + 0.6), W(x1, qy, PZ + 0.5));
  const ropes = m.build('moorings'); ropes.visible = false; g.add(ropes);
  const cargo = new THREE.Group(); cargo.name = 'cargo'; g.add(cargo);
  return g;
}

// ---- a harbour tug, 22 m: a fendered hull, the wheelhouse with windows all round, the towing winch and staple aft ----
export function buildTug(name: string) {
  const p = new Part(), L = 11, B = 4.6;
  const plan = [[-L, -B + 1], [-L + 1.5, -B], [L - 8, -B], [L - 3, -B + 1.8], [L, -1.2], [L, 1.2], [L - 3, B - 1.8], [L - 8, B], [-L + 1.5, B], [-L, B - 1]];
  p.extrude(plan.map(([x, y]) => [x, y, SEA_Z - 1]), [0, 0, 2.4 - SEA_Z + 1], 'k');
  for (const [x, y] of plan) p.box(x - 0.4, y - 0.4, 0.6, 0.8, 0.8, 0.8, 'kb');
  p.box(-1, -3, 2.4, 7, 6, 2.6, 'n').box(1, -2.4, 5.0, 4.4, 4.8, 2.0, 'n');
  for (let y = 2.0; y > -2.6; y -= 1.0) p.fill2(SIDE(5.41, y, 6.6), 0, 0, 0.8, 0.9, 'window', 0.02);
  for (let x = 1.4; x < 5; x += 1.0) p.fill2(FRONT(x, 2.41, 6.6), 0, 0, 0.8, 0.9, 'window', 0.02);
  p.text(FRONT(-1, 3.02, 4.4), name, 3.5, 0.8, 0.7, 'paint', 'middle', 0.03);
  p.box(2.8, -0.2, 7.0, 0.4, 0.4, 3.4, 'k').box(2.65, -0.35, 10.4, 0.7, 0.7, 0.35, 'l');
  p.cylY(-5.0, -1.4, 3.2, 0.7, 2.8, 10, 'kb').box(-8.6, -2.4, 2.4, 0.4, 4.8, 2.0, 'kb');
  return p.build('tug');
}
