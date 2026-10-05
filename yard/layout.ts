// @ts-nocheck
import { scene } from './shared';

// ---- layout (skill coords: +x east, +y south toward the sea, +z up) ----
// thing           | x              | y          | notes
// world           | 0–440          | −84–336    | slab z −4–0; hills on y −84 to −4, the sea from y 296 (surface z −0.6)
// main road       | 0–404          | 124–138    | Riverside Rd: westbound lane y 127.5, eastbound 134.5, roundabout at (422,131)
// plant yard      | 2–196          | 4–118      | gate gap x 112–130 (out lane x 118, in lane x 124), automatic barriers
// plant           | 14–94          | 12–48      | walls 14, sawtooth roof to 19; office annex 94–116
// conveyor        | 86 → 150       | 44 → 58    | belt top z 1.0, side pickup on its last 6 m
// staging         | 134–176        | 72 & 90    | two rows of 8 slots facing an aisle at y 81
// plant bays      | 28 / 74        | 80         | flatbeds park heading west, forklifts load from the north
// truck park      | 136–198        | 118.5–124  | a lay-by where flatbeds wait for a free bay
// warehouse yard  | 206–356        | 4–118      | gate gap x 314–332 (out lane x 320, in lane x 326), sliding gate, guard
// warehouse       | 228–308        | 14–58      | drive lane y 20, racks y 33, aisle y 40.6, receiving y 48.5
// docks           | 232 / 276      | 80         | flatbeds unload here, forklifts work from the north
// shop            | 362–394        | 94–112     | delivery lay-by y 118.5–124 (x 344–384), zebra at x 394.5, customer parking y 138–142.6
// avenues         | 60·180·300·420 | 138–274    | Park, Mill, Harbour and Hill Av, 14 wide; southbound lane x − 3.5, northbound x + 3.5
// Market St       | 53–427         | 198–212    | eastbound lane y 208.5, westbound 201.5
// Coast Rd        | 0–440          | 260–274    | eastbound lane y 270.5, westbound 263.5; promenade 274–279, beach to 296
// town blocks     | 67–413         | 138–198    | B1 flats, bank, café · B2 police, town hall, flats · B3 houses
// south blocks    | 67–413         | 212–260    | C1 houses · C2, C3 villas · Mill Park at x 0–53
const SLAB = { w:440, d:150 };
export const WORLD = { x0:0, x1:440, y0:-84, y1:336 };
export const RAB = { x:422, y:131 };   // roundabout centre
export const BAYS = [{ id:1, bx:28, truck:null }, { id:2, bx:74, truck:null }];
export const DOCKS = [{ id:1, bx:232, truck:null }, { id:2, bx:276, truck:null }];
export const slotAt = o => ({ pallet:null, reserved:null, parent:scene, ...o });
export const STAGE = []; for (const row of [0, 1]) for (let c = 0; c < 8; c++) { const x = 134 + 6 * c, y = row ? 90 : 72, id = `${'AB'[row]}${c + 1}`;
  STAGE.push(slotAt({ id, label:`staging ${id}`, x, y, row, local:[x, y, 0] })); }
export const RACK = []; for (const level of [0, 1]) for (let b = 0; b < 8; b++) { const x = 246 + 6 * b;
  RACK.push(slotAt({ id:`R${b + 1}·${level + 1}`, label:`rack R${b + 1} · level ${level + 1}`, x, y:33, level, local:[x, 33, level ? 3.0 : 0] })); }
// shop shelves: two units, two boards each, six boxes a board; staff stand in the aisle south of each unit
export const SHELF = []; for (const [y, sy] of [[98.4, 100.6], [103.6, 105.8]]) for (const z of [0.95, 1.65]) for (let i = 0; i < 6; i++)
  SHELF.push({ x:367.6 + 3.5 * i, y, z, stand:[367.6 + 3.5 * i, sy], sku:null, reserved:null, mesh:null });
export const STOCK_CAP = 12, BOXES = 4;
export const SHOP = { in:[378, 109.6], out:[378, 114.2], counter:[387, 111], stockStand:[364.8, 100.6] };
export const ZEBRA_X = 394.5;
export const CURB = 0.15, SEA_Z = -0.6;
export const AV = [60, 180, 300, 420];
// asphalt people only cross: a walker on it is an obstacle to traffic, and waits for a gap before stepping out
const ROADS = [[0, 404, 124, 138], [53, 67, 138, 274], [173, 187, 138, 274], [293, 307, 138, 274], [413, 427, 138, 274], [405, 413, 138, 142.6],
  [53, 427, 198, 212], [0, 440, 260, 274], [345, 384, 138, 142.6], [219, 262, 178, 198]];
export const onRoad = (x, y) => ROADS.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1) || Math.hypot(x - RAB.x, y - RAB.y) < 14.5;
// raised blocks: a pavement round the edge, lots inside; the promenade is one too
export const BLOCKS = [[67, 173, 138, 198], [187, 293, 138, 178], [187, 219, 178, 198], [262, 293, 178, 198], [307, 413, 142.6, 198], [307, 345, 138, 142.6], [384, 405, 138, 142.6],
  [67, 173, 212, 260], [187, 293, 212, 260], [307, 413, 212, 260], [427, 440, 146, 260], [0, 53, 138, 260], [0, 440, 274, 279]];
export const zAt = (x, y) => BLOCKS.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1) ? CURB : 0;
