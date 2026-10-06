import { hooks } from '../shared';
import { Path, withHeights } from '../kernel/path';
import { pose } from '../kernel/part';
import { BAYS, CITY, CURB, DOCKS, PORT, RAB } from '../layout';
import { buildPallet } from '../models/vehicles';
import { buildSkeletal, TRAILER } from '../models/port';
import * as core from './core';
import * as roads from './roads';
import { BOX_SLOTS, Truck, holdOn, settledAt } from './trucks';
import { PLANT, WH } from './forklifts';
import { whGate } from './people';
// (the town's modules are untyped)
const { PROTO, Pallet, SKUS, kmh, putIn, sim } = core as any, { gapE, gapW, roadBusy, streetAt } = roads as any;

// ---- freight by box: Plant 01 → the container terminal → Warehouse 01 ----
// CTR-01 carries a forty-foot box on a skeletal trailer round a triangle. At a Plant 01 bay the forklifts load five
// pallets into it through its side doors; out along Riverside Rd, round the roundabout's east arm, along Sahel Blvd and
// down Port Av, over the Corniche and up the ramp to the terminal's gate. Inside it joins the tractors' circuit, and
// block C's gantry lifts its box off (into the stack, to go out on a ship) and sets an import on; round the circuit
// and out by the gate, west along the Corniche and Coast Rd, up Harbour Av and over Riverside Rd into the warehouse,
// where the import is unloaded into the racks. The empty box goes back to the plant to be filled.
const L = CITY.lanes, [LX0, LX1] = PORT.loop, ROAD_IN = 850, ROAD_OUT = 893, RAMP = PORT.ramp;
// the ramp up to the terminal's deck, and the deck
const rampZ = (x: number, y: number) => x > RAMP[0] - 2 && x < RAMP[1] + 2 && y > RAMP[2] && y < RAMP[3] ? CURB + (y - RAMP[2]) / (RAMP[3] - RAMP[2]) * (PORT.z - CURB)
  : y >= RAMP[3] && x > PORT.x0 && x < PORT.x1 ? PORT.z : 0;
const IMPORTS = { name:'Imported goods', code:'IM-40', units:[20, 60], kg:[300, 700] };

const BOXV = new Map<string, any>();
function boxVariant(bay: any, dock: any) {
  const key = `${bay.id}·${dock.id}`; if (BOXV.has(key)) return BOXV.get(key);
  const path = withHeights(new Path([[200, 134.5], [404, 134.5], [RAB.x, 143], [438, 134.5], [520, 134.5], [552, L.gE],
    [876.5, L.gE], [876.5, 304], [ROAD_IN, 304],
    // (inside, the tractors' circuit: the terminal drives it; here only for the dashed route)
    [LX0, 304], [LX0, 330], [LX1, 330], [LX1, 304], [ROAD_OUT, 304],
    [883.5, 304], [883.5, 263.5], [303.5, 263.5], [303.5, 141.5], [326, 124],
    [326, 94], [dock.bx + 40, 94], [dock.bx + 30, 80], [dock.bx - 4, 80], [dock.bx - 14, 94], [212, 94], [212, 110], [320, 110], [320, 127.5],
    [196, 127.5], [188, 121], [146, 121], [138, 127.5], [124, 127.5], [124, 94], [bay.bx + 40, 94], [bay.bx + 30, 80], [bay.bx - 4, 80], [bay.bx - 14, 94],
    [8, 94], [8, 112], [118, 112], [118, 134.5], [200, 134.5]], 6, true), rampZ);
  const exitS = path.project(ROAD_OUT, 304);
  const holds = [
    holdOn(path, bay.bx, 80, { name:'bay', stop:`Plant 01 · bay ${bay.id}`, toward:`to Plant 01 · bay ${bay.id}`, label:`loading the box · bay ${bay.id}`,
      release:(t: any, dt: number) => t.loaded() === t.slots.length && settledAt(t, PLANT, dt),
      left:(t: any) => { sim.stats.plantOut++; t.bay.truck = null; Object.assign(t.box, { goods:'parts from Plant 01', from:'Plant 01', to:'the terminal', tonnes:Math.round(t.kg() / 1000) }); } }),
    holdOn(path, 118, 121, { name:'plantGate', stop:'the plant gate', toward:'to the plant gate', label:'waiting for a gap in traffic',
      release:(t: any) => gapW(t, 108, 162) && gapE(t, 66, 126) }),
    holdOn(path, 876.5, 254, { name:'yield', soft:14, toward:'', label:'waiting to cross the Corniche', release:(t: any) => !roadBusy(t, 846, 906, 263.5) && !roadBusy(t, 846, 906, 270.5) }),
    holdOn(path, 876.5, 296.5, { name:'portGate', stop:'the terminal gate', toward:'to the container terminal', label:'at the terminal gate · checking in',
      arrive:(t: any) => { t.dwell = 0; }, release:(t: any, dt: number) => (t.dwell += dt) > 2.5 && t.port.laneFree(),
      wait:(t: any) => t.dwell > 2.5 ? 'at the terminal gate · waiting for the road to clear' : null, left:(t: any) => t.port.reserve(t) }),
    holdOn(path, ROAD_IN, 304, { name:'terminal', stop:'the container terminal', toward:'into the terminal', label:'in the terminal',
      arrive:(t: any) => t.port.admit(t), release:(t: any) => t.portDone, wait:(t: any) => t.inPort ?? 'in the terminal',
      left:(t: any) => { t.portDone = false; t.inPort = null; t.s = t.base + exitS + 0.1; } }),
    // down the ramp and left into the Corniche's westbound lane; a dock at the warehouse first
    holdOn(path, 883.5, 276, { name:'portOut', stop:'the foot of the ramp', toward:'out of the terminal', label:'waiting to turn onto the Corniche',
      release:(t: any) => {
        if (roadBusy(t, 860, 960, 270.5) || roadBusy(t, 820, 900, 263.5)) return false;
        if (t.dock.truck !== t) { const d = DOCKS.find((d: any) => !d.truck); if (!d) return false; d.truck = t; t.reroute(t.bay, d); }
        return true; },
      wait:(t: any) => t.dock.truck !== t && DOCKS.every((d: any) => d.truck) ? 'waiting for a free dock at Warehouse 01' : null }),
    holdOn(path, 303.5, 219.5, { name:'yield', soft:14, toward:'', label:'giving way', release:(t: any) => !roadBusy(t, 300, 340, 201.5) && !roadBusy(t, 262, 310, 208.5) }),
    holdOn(path, 303.5, 145, { name:'yield', soft:14, toward:'', label:'waiting to cross to the warehouse gate',
      release:(t: any) => { whGate.want(t); return whGate.isOpen() && gapE(t, 262, 318) && gapW(t, 300, 362); } }),
    holdOn(path, 326, 120.5, { name:'gateIn', stop:'the warehouse gate', gate:whGate, toward:'to Warehouse 01', label:'waiting at the warehouse gate', release:() => whGate.isOpen() }),
    holdOn(path, dock.bx, 80, { name:'dock', stop:`Warehouse 01 · dock ${dock.id}`, toward:`to dock ${dock.id}`, label:`unloading the box · dock ${dock.id}`,
      release:(t: any, dt: number) => t.loaded() === 0 && settledAt(t, WH, dt),
      left:(t: any) => { t.trips++; t.dock.truck = null; Object.assign(t.box, { goods:'nothing (empty)', to:'Plant 01', tonnes:4 }); } }),
    holdOn(path, 320, 116, { name:'gateOut', stop:'the warehouse gate', gate:whGate, toward:'to the warehouse gate', label:'waiting at the warehouse gate',
      release:(t: any) => whGate.isOpen() && gapW(t, 316, 374) }),
    holdOn(path, 150, 121, { name:'park', soft:30, stop:'the truck park', toward:'back to Plant 01', label:'in the truck park · waiting for a free bay',
      release:(t: any) => { if (t.bay.truck === t) return true; const b = BAYS.find((b: any) => !b.truck); if (!b) return false; b.truck = t; t.reroute(b, t.dock); return true; } }),
    holdOn(path, 150, 121, { name:'parkOut', soft:12, stop:'the truck park', toward:'back to Plant 01', label:'waiting for a gap in traffic', release:(t: any) => gapW(t, 138, 204) }),
  ];
  holds.sort((a: any, b: any) => a.s - b.s);
  const v = { path, holds }; BOXV.set(key, v); return v;
}

// the box on it, and the pallets in the box: an export out (they go into the stack with it), an import on (five
// pallets of imported goods, for the warehouse's racks)
const boxer = {
  boxOn(this: any, c: any) {
    this.box = c; c.where = { at:'truck', t:this };
    for (const sl of this.slots) { const p: any = new Pallet(); p.sku = IMPORTS; putIn(sl, p); sim.stats.imported++; }
    c.goods = `${c.goods} · for Warehouse 01`; c.tonnes = Math.round(this.kg() / 1000) + 2;
  },
  boxOff(this: any, c: any) {
    for (const sl of this.slots) if (sl.pallet) { sl.pallet.remove(); sl.pallet = null; sim.stats.exported++; }
    if (this.box === c) this.box = null;
  },
  fromPort(this: any) { this.portDone = true; },
  kg(this: any) { return this.slots.reduce((s: number, x: any) => s + (x.pallet?.kg ?? 0), 0); },
  boxInfo(this: any) {
    const n = this.loaded(), next = this.upcoming().stop, b = this.box;
    return { kind:'Truck · container, side doors', title:this.id, status:this.status(), bar:{ v:n, max:this.slots.length, label:`in the box ${n}/${this.slots.length} pallets · ${(this.kg() / 1000).toFixed(1)} t` },
      rows:[['Route', 'Plant 01 → the terminal → Warehouse 01'], ['Box', b ? b.id : 'none'], ['In it', b ? b.goods : '—'], ['Next stop', next], ['Street', this.inPort ? 'the container terminal' : streetAt(this.front.x, this.front.y)],
        ['Driver', this.driver], ['Speed', kmh(this.v)], ['Round trips', String(this.trips)], ['Pallets exported', String(sim.stats.exported)], ['Pallets imported', String(sim.stats.imported)]],
      actions:b ? [['The box', () => hooks.select(b)]] : [] };
  },
};

// made last: its box's number comes from the town's random sequence
export function buildFreight(port: any) {
  PROTO.skeletal = buildSkeletal(); PROTO.pallet[3] = buildPallet(1); SKUS.push(IMPORTS);
  const v = boxVariant(BAYS[0], DOCKS[0]);
  const t: any = new Truck({ model:'boxer', id:'CTR-01', driver:'B. Okafor', bay:BAYS[0], dock:DOCKS[0], path:v.path, holds:v.holds, s:v.path.project(198, 127.5), variant:boxVariant, port });
  Object.assign(t, boxer);
  const c = port.newBox({ goods:'nothing (empty)', from:'Sahel', to:'Plant 01', tonnes:4 });
  t.box = c; c.where = { at:'truck', t }; const g = c.own(); t.trailer.add(g); pose(g, -TRAILER.len / 2 + 0.15, 0, 0, TRAILER.deck);
  return { trucks:[t] };
}
