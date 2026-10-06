// @ts-nocheck
import { scene } from './shared';

// ---- layout (skill coords: +x east, +y south toward the sea, +z up) ----
// thing           | x              | y          | notes
// world           | −60–1000       | −84–420    | slab z −4–0; hills on y −84 to −4, the sea from y 296 (surface z −0.6); the old town
//                 |                |            | on x 0–440, woods to the west of it (x −60–0), a green belt x 440–520, woods east of x 960
// main road       | −60–404        | 124–138    | Riverside Rd: westbound lane y 127.5, eastbound 134.5, roundabout at (422,131); its east
//                 |                |            | arm (x 436–520) runs on through the green belt
// plant yard      | 2–196          | 4–118      | gate gap x 112–130 (out lane x 118, in lane x 124), automatic barriers
// plant           | 14–94          | 12–48      | walls 14, sawtooth roof to 19; office annex 94–116
// conveyor        | 86 → 150       | 44 → 58    | belt top z 1.0, side pickup on its last 6 m
// staging         | 134–176        | 72 & 90    | two rows of 8 slots facing an aisle at y 81
// plant bays      | 28 / 74        | 80         | flatbeds park heading west, forklifts load from the north
// truck park      | 136–198        | 118.5–124  | a lay-by where flatbeds wait for a free bay
// warehouse yard  | 206–356        | 4–118      | gate gap x 314–332 (out lane x 320, in lane x 326), sliding gate, guard
// warehouse       | 228–308        | 14–58      | drive lane y 20, rack rows B (y 29.8) and A (y 33), aisles y 26 and 40.6, receiving y 48.5;
//                 |                |            | shelving, packing and pickers in the west strip x 228–235, office in the south-east corner
// docks           | 232 / 276      | 80         | flatbeds unload here, forklifts work from the north
// shop            | 377.5–409.5    | 231–249    | Corner Market at Coast Rd and Hill Av: forecourt y 249–255.6, a lay-by y 255.6–260 (x 378–413,
//                 |                |            | entered from Hill Av), seafront bays y 274–276.6 (x 374–409) across the road, a zebra at x 399;
// car works       | 216–400        | −46 – −20  | a hall on a terrace cut into the foothills (x 209–407, y −52 – −4); the line runs east along
//                 |                |            | y −31 through press, body, paint, assembly and end-of-line shops; the lot y −15.3 – −11, x 320–390
// fire station    | 360–400        | 94–112     | engine hall x 360–378 (bays at x 365 and 374, doors on Riverside Rd), crew wing x 378–400,
//                 |                |            | drill tower x 394–400 y 94–99; apron y 112–124 before the bays, crew parking x 380–393
// avenues         | 60·180·300·420 | 138–274    | Park, Mill, Harbour and Hill Av, 14 wide; southbound lane x − 3.5, northbound x + 3.5
// Market St       | 53–427         | 198–212    | eastbound lane y 208.5, westbound 201.5
// Coast Rd        | −60–1000       | 260–274    | eastbound lane y 270.5, westbound 263.5; promenade 274–279, beach to 296
// town blocks     | 67–413         | 138–198    | B1 flats, bank, café · B2 police, town hall, flats · B3 houses
// south blocks    | 67–413         | 212–260    | C1 houses · C2, C3 villas · Mill Park at x 0–53
// Orchard Lane    | 358–440        | 4–117      | north from the roundabout (x 417–427), west along y 61–71 to a turning circle at (373,66);
//                 |                |            | six houses on lots y 4–61 facing it, a playground y 71–92, a footway up from the shop zebra at x 407
// Sunset Pier     | 308–352        | 279–317    | neck x 326–334 from the promenade, platform y 297–317: Ferris wheel, carousel, coaster (deck z 1.2)
export const WORLD = { x0:-60, x1:1000, y0:-84, y1:420 };
// the woods round both towns: a strip west of the old town, the green belt between the towns, a strip east of Sahel
export const WOODS = { west:[-60, 0], belt:[440, 520], east:[960, 1000] };
export const RAB = { x:422, y:131 };   // roundabout centre
export const BAYS = [{ id:1, bx:28, truck:null }, { id:2, bx:74, truck:null }];
export const DOCKS = [{ id:1, bx:232, truck:null }, { id:2, bx:276, truck:null }];
export const slotAt = o => ({ pallet:null, reserved:null, parent:scene, ...o });
export const STAGE = []; for (const row of [0, 1]) for (let c = 0; c < 8; c++) { const x = 134 + 6 * c, y = row ? 90 : 72, id = `${'AB'[row]}${c + 1}`;
  STAGE.push(slotAt({ id, label:`staging ${id}`, x, y, row, local:[x, y, 0] })); }
// pallet racking: two rows back to back, eight bays, three levels. Row A is worked from the aisle south of it (y 40.6),
// row B from the lane north of it (y 26). Listed A level 1, A level 2, then the rest, so the opening stock keeps its places.
export const RACK = []; for (const [row, level] of [['A', 0], ['A', 1], ['A', 2], ['B', 0], ['B', 1], ['B', 2]]) for (let b = 0; b < 8; b++) {
  const x = 246 + 6 * b, y = row === 'A' ? 33 : 29.8;
  RACK.push(slotAt({ id:`${row}${b + 1}·${level + 1}`, label:`rack ${row}${b + 1} · level ${level + 1}`, x, y, row, level, local:[x, y, level * 3.0] })); }
// shop shelves: two units, two boards each, six boxes a board; staff stand in the aisle south of each unit
// Corner Market's inside is drawn in its own frame (x 362–394, y 94–112) and stands at SX, SY from it: sx() turns a
// point of that frame into the town's
export const SX = 15.5, SY = 137, sx = (x, y) => [x + SX, y + SY];
export const SHELF = []; for (const [y, sy] of [[98.4, 100.6], [103.6, 105.8]]) for (const z of [0.95, 1.65]) for (let i = 0; i < 6; i++)
  SHELF.push({ x:367.6 + SX + 3.5 * i, y:y + SY, z, stand:sx(367.6 + 3.5 * i, sy), sku:null, reserved:null, mesh:null });
export const STOCK_CAP = 12, BOXES = 4;
export const SHOP = { in:sx(378, 109.6), out:sx(378, 114.2), counter:sx(387, 111), stockStand:sx(364.8, 100.6), front:[393.5, 254.6], zebra:399 };
export const ZEBRA_X = 394.5;
// Car Works. The line runs east along ly; a station every few metres (x, name, shop). A finished car leaves by the
// door at exit and parks nose-in on the lot, the first space at lot.x0 and each next one a pitch further west.
export const WORKS = { x0:216, x1:400, y0:-46, y1:-20, h:10, ly:-31, terrace:[209, 407, -52, -4], exit:[393, -20],
  shops:[['press', 'Press shop', 216, 247], ['body', 'Body shop', 247, 292], ['paint', 'Paint shop', 292, 322], ['assembly', 'Assembly', 322, 367], ['eol', 'End of line', 367, 400]],
  stations:[[224, 'blanking'], [233, 'tandem press'], [242, 'panel racks'], [251, 'underbody welding'], [260, 'framing'], [269, 'respot welding'], [278, 'doors and lids'],
    [287, 'metal finish'], [297, 'pretreatment dip'], [307, 'paint booth'], [317, 'curing oven'], [327, 'trim'], [336, 'marriage'], [345, 'wheels'], [354, 'glazing'],
    [363, 'seats'], [371, 'fluids and first start'], [378, 'lights test'], [385, 'rolling road'], [392, 'quality check']],
  lot:{ x0:388, pitch:2.7, n:26, front:-15.3, aisle:-8.6 } };
// The railway: one track along the foot of the hills, and a loop through the Plant 01 yard where the train stands at
// the loading platform (its flat wagons along x 116–170, forklifts working from the lane at y 12.5). Trains come in
// from the east, stop at Car Works' lot with the car carriers' end at the ramp, take the loop, and leave to the west.
// Sahel, the new city east of the green belt: four avenues (14 wide, like the old town's), North St along the railway,
// Sahel Blvd with its busway in the middle (the old town's Riverside Rd runs on into it), Souq St under the metro, and the
// Corniche (Coast Rd's run through Sahel). The waterfront and the port lie south of the Corniche.
export const CITY = { x0:520, x1:960, av:[540, 640, 760, 880], north:[6, 20], blvd:[115, 147], souq:[198, 212], corniche:[260, 274],
  names:['Gate Av', 'Najd Av', 'Tower Av', 'Port Av'],
  // Sahel Blvd in section, north to south: a general lane each side, a planted strip, the busways, and the median the
  // Metrobus stations stand on. Its lanes: general westbound/eastbound, busway westbound/eastbound.
  lanes:{ gW:118.5, gE:143.5, bW:126.5, bE:135.5 }, sep:[[122, 124.5], [137.5, 140]], median:[128.5, 133.5] };
// Sahel's blocks: kerbed like the old town's. The columns between the avenues and the rows between the streets; the
// last column runs on east past Port Av, where North St and Souq St end.
const CB = (() => { const c = [[547, 633], [647, 753], [767, 873]], r = [[20, 115], [147, 198], [212, 260]], b = [];
  for (const [x0, x1] of c) for (const [y0, y1] of r) b.push([x0, x1, y0, y1]);
  b.push([887, 960, 2, 115], [887, 960, 147, 260], [520, 533, 2, 115], [520, 533, 147, 260], [533, 633, 2, 6], [647, 873, 2, 6], [520, 1000, 274, 279]);
  // the boulevard's planted strips and median, broken at each avenue
  // (the median stops short of the edge, where the Metrobus turns back)
  for (const [x0, x1] of [[547, 633], [647, 753], [767, 873], [887, 1000]]) for (const [y0, y1] of [[122, 124.5], [128.5, 133.5], [137.5, 140]]) b.push([x0, y0 === 128.5 && x1 === 1000 ? 962 : x1, y0, y1]);
  return b; })();
// Sahel Marina, between the beach and the port: a jetty out from the promenade, finger piers off it either side, a
// mole of rocks round the basin
export const MARINA = { x0:566, x1:636, jetty:[597.5, 602.5], fingers:[302, 312, 322], deck:1.15, mole:334 };
// the Metrobus: its route along the busways, turning back at Gate Av and at the east edge; its stops on the median
export const BRT = { west:540, east:972, stops:[[592, 'Al Noor Mosque'], [704, 'Sahel Central'], [818, 'Financial District'], [930, 'Sahel Tower']] as [number, string][], len:18.2 };
export const BRT_STOPS = BRT.stops.map(s => s[0]);
// Sahel Metro: two lines on viaducts, driverless four-car trains, island platforms behind glass between the tracks.
// Line 1 runs east along y 205 from Market St, at the old town's end of Market St, through Sahel Central to Port; Line 2
// south along x 658 from Motor District to Sahel Central, where it ends on the level above Line 1. Along a line, u is the
// distance down it (x for Line 1, y for Line 2) and v the offset across it to the right of travel in the +u direction
// (south of Line 1, west of Line 2); the tracks run at v ±2.2 and spread to ±4.4 round a station's island. A station's
// platform starts at u0 and is 58 m long; its concourse hangs under the tracks over conc (station u), its entrance
// escalators climb to it from the ground at its entry end (−1 the low-u end, 1 the high-u end) either side of the line.
export const METRO = { track:2.2, wide:4.4, island:2.85, plat:58, car:13, gap:0.8, cars:4, escSlope:Math.tan(Math.PI / 6),
  lines:[
    { id:1, name:'Line 1', colour:'Blue', axis:'x', at:205, from:438, to:932, deck:10.5, conc:5.0,
      stations:[{ id:'Market St', u0:442, conc:[4, 24], entry:-1, style:'najdi' }, { id:'Sahel Central', u0:629, central:true }, { id:'Port', u0:872, conc:[34, 54], entry:1, style:'fins' }],
      xovers:[[516, 536], [840, 860]] },
    { id:2, name:'Line 2', colour:'Red', axis:'y', at:658, from:26, to:236, deck:19.5, conc:11.5,
      stations:[{ id:'Motor District', u0:28, conc:[36, 56], entry:1, style:'louvre' }, { id:'Sahel Central', u0:176, central:true }],
      xovers:[[100, 118], [144, 162]] }] };
// a point of a line's frame (u along, v across, z up) in the town's
export const metroAt = (line, u, v, z = 0) => line.axis === 'x' ? [u, line.at + v, z] : [line.at - v, u, z];
// Sahel Motors, the showroom Car Works sells through, on a terrace cut into the foothills north of the railway. Its car
// shuttle runs on a siding of its own north of the main line: from the dock at Car Works' lot (the shuttle's tail at
// dock) to the showroom (its loco's nose at stop), where a ramp rises out of the track behind it (high end at ramp).
// The cars wait in twin glass towers, eight levels of eight bays round a lift (gates on their south faces); the hall
// has a handover bay at its west end (bay: its door's x) and its entrance on the east (door: its y), off the footway
// at walk. A drive runs along the front (out: the lane east to Najd Av; in: the lane to the towers), and Najd Av comes
// up over the main line on the level (road: the access road's x span, cross: the crossing's y span). West of the
// towers, the test track.
export const MOTORS = { terrace:[452, 668, -52, -9], sidingY:-6.5, sidingX:[411, 614], dock:420, stop:608, ramp:550.8,
  towers:[[518, -31], [542, -31]], towerR:8, levels:8, levelH:3.2, hall:[572, 628, -46, -16], bay:579,
  out:-10.5, in:-13.5, road:[633, 647], cross:[-4.5, 2], walk:630.6, door:-24, track:[456, 506, -46, -16] };
// Sahel Container Terminal, on land made out over the beach east of the marina, its deck at z. The quay faces south
// (edge at quay); the ship-to-shore cranes run on two rails (rails) and work the ship at its berth (ship: its middle,
// its beam, the line it comes in and goes out along). Tractors go round one circuit, eastbound under the cranes (lane,
// pass the passing lane's offset), up the east end, westbound along the yard road under the yard gantries (road), and
// down the west end (x0, x1 of the circuit). The yard: three blocks of five rows, four 40-footers long, each with its
// gantry (RTG); the breakwater beyond the berth (its two heads lit) and the gate off the end of Port Av.
export const PORT = { x0:650, x1:958, y0:279, y1:340, z:2.0, quay:340, rails:[323, 339], lane:330, pass:3.6, road:304, loop:[678, 912],
  blocks:[[686, 737], [745, 796], [804, 855]], row0:285.0, pitch:2.9, rows:5, bay:12.8, bays:4, rtg:[283.2, 310.2],
  cranes:[760, 800, 840], ship:{ x:790, y:354, half:74, beam:12, in:370, bays:8, bay0:-46, pitch:13 },
  breakwater:[700, 950, 410, 416], gate:[866, 894], ramp:[873, 887, 279, 293], reefer:[652, 676], tugs:[[931, 346], [955, 346]] };
export const RAIL = { y:-1.5, loopY:7, lane:12.5, ramp:400, route:[[WORLD.x1 + 12, -1.5], [212, -1.5], [200, 7], [96, 7], [80, -1.5], [WORLD.x0 - 30, -1.5]] };
// Riverside Fire Station. ENG-1 stands nose out in bay 1 (front at park); it drives out forward and comes home by
// stopping in the westbound lane past the bay and backing in along reverse (the path its rear end takes).
export const STATION = { x0:360, x1:400, y0:94, y1:112, hall:378, bays:[365, 374], park:[365, 110.6], reverse:[[359, 127.5], [365, 127.5], [365, 101]] };
export const CURB = 0.15, SEA_Z = -0.6;
export const AV = [60, 180, 300, 420];
// Orchard Lane: the lane's two arms, its turning circle, the pavement its houses open onto, and the six lots (x0, width)
export const ORCHARD = { ax:422, ay0:71, ay1:117, ey:66, ex0:373, ex1:427, turn:{ x:373, y:66, r:5.5 }, pave:60.2, lotY1:59.4, walkX:407,
  lots:[0, 1, 2, 3, 4, 5].map(i => [358.4 + 13.6 * i, 13.6]) };
// asphalt people only cross: a walker on it is an obstacle to traffic, and waits for a gap before stepping out
const ROADS = [[-60, 404, 124, 138], [436, 520, 124, 138], [520, 1000, 115, 147], [533, 887, 6, 20], [533, 887, 198, 212],
  [533, 547, 6, 274], [633, 647, 2, 274], [753, 767, 6, 274], [873, 887, 6, 274], [53, 67, 138, 274], [173, 187, 138, 274], [293, 307, 138, 274], [413, 427, 138, 274], [405, 413, 138, 142.6],
  [53, 427, 198, 212], [-60, 1000, 260, 274], [345, 384, 138, 142.6], [219, 262, 178, 198], [417, 427, 71, 117], [373, 427, 61, 71], [378, 413, 255.6, 260], [374, 378, 257.4, 260], [374, 409, 274, 276.6],
  [633, 647, -20, 2], [629.5, 633, -4.5, 2]];
// (the boulevard's median and planted strips are kerbed islands inside its asphalt: standing there is off the road)
export const onRoad = (x, y) => (ROADS.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1) || Math.hypot(x - RAB.x, y - RAB.y) < 14.5
  || Math.hypot(x - ORCHARD.turn.x, y - ORCHARD.turn.y) < ORCHARD.turn.r) && !BLOCKS.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
// raised blocks: a pavement round the edge, lots inside; the promenade is one too
export const BLOCKS = [[67, 173, 138, 198], [187, 293, 138, 178], [187, 219, 178, 198], [262, 293, 178, 198], [307, 413, 142.6, 198], [307, 345, 138, 142.6], [384, 405, 138, 142.6],
  [67, 173, 212, 260], [187, 293, 212, 260], [307, 413, 212, 255.6], [307, 374, 255.6, 260], [374, 378, 255.6, 257.4], [427, 440, 146, 260], [0, 53, 138, 260],
  [-60, 374, 274, 279], [374, 409, 276.6, 279], [409, 520, 274, 279],
  [358, 440, 4, 61], [358, 417, 71, 92], [427, 440, 71, 117], ...CB];
// the piers' decks, people walk on them: [x0, x1, y0, y1, height, ramp] (a ramp rises from the promenade over its first 2.3 m)
export const PIER = { neck:[326, 334], y0:278.7, platform:[308, 352, 297, 317], deck:1.2, wheel:{ x:344, y:307.5, z:11.85, r:8 }, carousel:{ x:322, y:304, r:4.2 } };
export const DECKS = [[196, 202, 278.7, 313, 1.15, true], [326, 334, 278.7, 297.1, 1.2, true], [308, 352, 297, 317, 1.2, false],
  [597.5, 602.5, 278.7, 327, 1.15, true], [571, 629, 300.8, 303.2, 1.15, false], [571, 629, 310.8, 313.2, 1.15, false], [571, 629, 320.8, 323.2, 1.15, false]];
export const zAt = (x, y) => {
  for (const [x0, x1, y0, y1, z, ramp] of DECKS) if (x > x0 && x < x1 && y > y0 && y < y1) return ramp ? Math.min(z, CURB + (y - y0) * 0.45) : z;
  return BLOCKS.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1) ? CURB : 0;
};
