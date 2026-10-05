// @ts-nocheck
import { scene } from '../shared';
import { pose } from '../kernel/part';
import { clamp, ease } from '../kernel/math';
import { Path } from '../kernel/path';
import { BAYS, BOXES, DOCKS, RAB, slotAt } from '../layout';
import { BUS_LEN, DECK, FLAT_SLOTS, VAN_DECK, VAN_LEN, VAN_SLOTS } from '../models/vehicles';
import { PROTO, kmh, sim } from './core';
import { bendLimit, clearAhead, gapE, gapW, nextRoadSeq, roadBusy, turningIn } from './roads';
import { PLANT, WH } from './forklifts';
import { busArrive, shop, whGate } from './people';

// ---- trucks and the bus: each drives a closed loop and stops at "holds" until that hold lets it go ----
// A soft hold (give way, the truck park) is passed without stopping when it is already clear.
function settled(t, site, dt) { t.calm = t.near(site) ? 0 : t.calm + dt; return t.calm > 1.2; }
export class Truck {
  constructor(o) {
    Object.assign(this, { kind:'truck', seq:nextRoadSeq(), v:0, doors:0, doorsTo:0, at:null, hi:0, base:0, calm:0, boxes:0, boxRes:0, boxMax:0, trips:0, pax:0, dwell:0, t0:sim.t }, o);
    if (this.model === 'flatbed') {
      this.tractor = PROTO.tractor.clone(); this.trailer = PROTO.trailer.clone(); this.groups = [this.tractor, this.trailer]; this.halfW = 2.4;
      this.slots = FLAT_SLOTS.map(([lx, ly], i) => slotAt({ id:`${this.id}·${i + 1}`, label:`on ${this.id}`, parent:this.trailer, local:[lx, ly, DECK], owner:this, i }));
      this.pick = [-1.5, 0, 3.0];
    } else if (this.model === 'van') {
      this.body = PROTO.van.clone(); this.groups = [this.body]; this.halfW = 1.4;
      this.doorL = this.body.getObjectByName('doorL'); this.doorR = this.body.getObjectByName('doorR');
      this.slots = VAN_SLOTS.map((lx, i) => slotAt({ id:`${this.id}·${i + 1}`, label:`in ${this.id}`, parent:this.body, local:[lx, 0, VAN_DECK], owner:this, i }));
      this.pick = [-1.5, 0, 2.2];
    } else {
      this.body = PROTO.bus.clone(); this.groups = [this.body]; this.halfW = 1.3; this.slots = []; this.pick = [-BUS_LEN / 2, 0, 2.0];
    }
    for (const g of this.groups) { g.userData.entity = this; scene.add(g); }
    this.holds.sort((a, b) => a.s - b.s);
    this.hi = this.holds.findIndex(h => h.s >= this.s - 0.01); if (this.hi < 0) { this.hi = 0; this.base = this.path.length; }
    sim.trucks.push(this); this.place();
  }
  get hold() { return this.holds[this.hi]; }
  get target() { return this.hold.s + this.base; }
  loaded() { return this.slots.filter(s => s.pallet).length; }
  freeSlot() { return this.slots.findIndex(s => !s.pallet && !s.reserved); }
  place() {
    const a = this.path.at(this.s);
    if (this.model === 'flatbed') {
      const b = this.path.at(this.s - 6), th = Math.atan2(a.y - b.y, a.x - b.x);
      pose(this.tractor, a.x, a.y, th);
      const k = this.path.at(this.s - 4.6), r = this.path.at(this.s - 16.3), tt = Math.atan2(k.y - r.y, k.x - r.x);
      pose(this.trailer, k.x, k.y, tt);
      this.pose = { x:k.x, y:k.y, h:tt }; this.front = { x:a.x, y:a.y, h:th };
      const c = Math.cos(tt), s = Math.sin(tt), at = d => [k.x + c * d, k.y + s * d];
      this.points = [[a.x, a.y], [a.x - Math.cos(th) * 6, a.y - Math.sin(th) * 6], at(0), at(-7.2), at(-14.4)];
    } else {
      const L = this.model === 'van' ? VAN_LEN : BUS_LEN;
      const b = this.path.at(this.s - 8), th = Math.atan2(a.y - b.y, a.x - b.x), c = Math.cos(th), s = Math.sin(th);
      pose(this.body, a.x, a.y, th);
      this.pose = { x:a.x, y:a.y, h:th }; this.front = this.pose;
      this.points = [[a.x, a.y], [a.x - c * L / 2, a.y - s * L / 2], [a.x - c * L, a.y - s * L]];
    }
  }
  slotWorld(i) { const [lx, ly] = this.slots[i].local, p = this.pose, c = Math.cos(p.h), s = Math.sin(p.h); return [p.x + c * lx - s * ly, p.y + s * lx + c * ly]; }
  // is a forklift from this site working at the truck? (alongside a flatbed, behind a van)
  near(site) {
    const p = this.pose, c = Math.cos(p.h), s = Math.sin(p.h);
    return site.forklifts.some(f => { const dx = f.x - p.x, dy = f.y - p.y, lx = c * dx + s * dy, ly = c * dy - s * dx;
      return this.model === 'flatbed' ? lx > -16.5 && lx < 2 && Math.abs(ly) < 7 : lx > -VAN_LEN - 7 && lx < 1 && Math.abs(ly) < 3.5; });
  }
  inLane() { return this.front.x > 200 && this.front.x < 312 && Math.abs(this.front.y - 20) < 3; }
  limit() {
    const f = this.front;
    if (Math.hypot(f.x - RAB.x, f.y - RAB.y) < 20) return 6;
    if (f.x > 228 && f.x < 312 && f.y > 14 && f.y < 58) return 4;
    return Math.min(this.model === 'bus' ? 10 : f.y < 119 ? 5.5 : 9, bendLimit(this.path, this.s, 5.5));
  }
  update(dt) {
    if (this.model === 'van') {
      this.doors = clamp(this.doors + Math.sign(this.doorsTo - this.doors) * dt / 1.3, 0, 1);
      const a = ease(this.doors) * 1.85; this.doorL.rotation.y = a; this.doorR.rotation.y = -a;   // swung open behind the truck
    }
    if (this.at) {
      this.blocker = null;
      if (this.at.release(this, dt)) this.pass(); else { this.v = 0; return; }
    }
    let h = this.hold;
    while (h.soft && this.target - this.s < h.soft) { this.at = h; if (!h.release(this, dt)) { this.at = null; break; } this.pass(); h = this.hold; }
    if (h.gate && this.target - this.s < 70) h.gate.want(this);
    const room = Math.min(this.target - this.s, clearAhead(this, 24, 3, dt));
    const vT = Math.min(this.limit(), Math.sqrt(5 * Math.max(0, room)));
    this.v = vT < this.v ? vT : Math.min(vT, this.v + 2.2 * dt);
    this.s += this.v * dt;
    if (this.target - this.s < 0.08) { this.s = this.target; this.v = 0; this.at = h; this.calm = 0; h.arrive?.(this); }
    // the same last resort as for cars: held up for half a minute, slip past whatever is in the way
    this.stopT = this.v < 0.1 && !this.at ? (this.stopT ?? 0) + dt : 0;
    if (this.stopT > 45) { this.ghostT = 2; this.stopT = 0; }
    this.place();
  }
  pass() {
    const h = this.at; this.at = null; if (h.gate) h.gate.passed++;
    h.left?.(this);
    if (++this.hi >= this.holds.length) { this.hi = 0; this.base += this.path.length; }
  }
  // a flatbed's loop depends on its bay and dock; switch loops in place, keeping where it is along the road
  reroute(bay, dock) {
    const v = flatVariant(bay, dock), name = this.at?.name;
    this.bay = bay; this.dock = dock; this.path = v.path; this.holds = v.holds; this.base = 0;
    this.s = v.path.project(this.front.x, this.front.y);
    if (name) { this.hi = this.holds.findIndex(h => h.name === name); this.at = this.holds[this.hi]; }
    else { this.hi = this.holds.findIndex(h => h.s >= this.s - 0.01); if (this.hi < 0) { this.hi = 0; this.base = this.path.length; } }
  }
  // the next hold that is a real stop (give-way lines don't count)
  nextHold() { for (let k = 0; k < this.holds.length; k++) { const h = this.holds[(this.hi + k) % this.holds.length]; if (h.name !== 'yield') return h; } return this.hold; }
  // where it goes next: the hold after this one while it waits at a stop
  upcoming() { if (!this.at) return this.nextHold(); for (let k = 1; k <= this.holds.length; k++) { const h = this.holds[(this.hi + k) % this.holds.length]; if (h.name !== 'yield' && h.stop !== this.at.stop) return h; } return this.nextHold(); }
  status() { return this.at && this.at.name !== 'yield' ? (this.at.wait?.(this) ?? this.at.label) : this.at ? this.at.label : this.nextHold().toward; }
  doorText() { return this.doors === 0 ? 'closed' : this.doors === 1 ? 'open' : this.doorsTo ? 'opening' : 'closing'; }
  info() {
    const n = this.loaded(), kg = this.slots.reduce((s, x) => s + (x.pallet?.kg ?? 0), 0), next = this.upcoming().stop;
    if (this.model === 'flatbed') return { kind:'Truck · flatbed', title:this.id, status:this.status(), bar:{ v:n, max:6, label:`cargo ${n}/6 pallets · ${(kg / 1000).toFixed(1)} t` },
      rows:[['Route', 'Plant 01 ⇄ Warehouse 01'], ['Next stop', next], ['Plant bay', this.bay.truck === this ? `Bay ${this.bay.id}` : 'when one is free'],
        ['Warehouse dock', this.dock.truck === this ? `Dock ${this.dock.id}` : 'when one is free'], ['Driver', this.driver], ['Speed', kmh(this.v)], ['Trips', String(this.trips)]] };
    if (this.model === 'bus') return { kind:'Bus · Line 1', title:this.id, status:this.status(), bar:{ v:this.pax, max:40, label:`${this.pax} on board` },
      rows:[['Route', 'Market St · Harbour View · Villas · Beach · Park'], ['Next stop', next], ['Driver', this.driver], ['Speed', kmh(this.v)], ['Stops made', String(this.trips)]] };
    const atShop = this.at?.name === 'shop';
    return { kind:'Truck · box, rear doors', title:this.id, status:this.status(),
      bar:atShop ? { v:this.boxes, max:Math.max(1, this.boxMax), label:`${this.boxes} boxes left to unload` } : { v:n, max:4, label:`cargo ${n}/4 pallets` },
      rows:[['Route', 'Warehouse 01 ⇄ Corner Market'], ['Next stop', next], ['Rear doors', this.doorText()], ['Driver', this.driver], ['Speed', kmh(this.v)], ['Deliveries', String(this.trips)]] };
  }
  readout() {
    const tail = this.model === 'bus' ? `${this.pax} on board` : this.model === 'van' && this.at?.name === 'shop' ? `${this.boxes} boxes left` : `${this.loaded()}/${this.slots.length} pallets`;
    return `${this.id} · ${this.status()} · ${tail}`.toLowerCase();
  }
  route() { const h = this.upcoming(), q = this.path.at(h.s); return { path:this.path, s:this.s, closed:true, next:[q.x, q.y], stop:h.stop }; }
}
const holdOn = (path, x, y, o) => ({ s:path.project(x, y), ...o });
// Flatbeds share two bays and two docks: a truck takes a dock when it is loaded and a bay when it gets back,
// and waits (at the bay, or in the truck park) while none is free. One loop per bay and dock pairing.
const FLAT = new Map();
export function flatVariant(bay, dock) {
  const key = `${bay.id}·${dock.id}`; if (FLAT.has(key)) return FLAT.get(key);
  const path = new Path([[200, 134.5], [404, 134.5], [RAB.x, 143], [434, RAB.y], [RAB.x, 119], [404, 127.5],
    [326, 127.5], [326, 94], [dock.bx + 40, 94], [dock.bx + 30, 80], [dock.bx - 4, 80], [dock.bx - 14, 94], [212, 94], [212, 110], [320, 110], [320, 127.5],
    [196, 127.5], [188, 121], [146, 121], [138, 127.5],
    [124, 127.5], [124, 94], [bay.bx + 40, 94], [bay.bx + 30, 80], [bay.bx - 4, 80], [bay.bx - 14, 94], [8, 94], [8, 112], [118, 112], [118, 134.5], [200, 134.5]], 6, true);
  const holds = [
    holdOn(path, bay.bx, 80, { name:'bay', stop:`Plant 01 · bay ${bay.id}`, toward:`to Plant 01 · bay ${bay.id}`, label:`loading · bay ${bay.id}`,
      release:(t, dt) => {
        if (t.loaded() < 6 || !settled(t, PLANT, dt)) return false;
        if (t.dock.truck !== t) { const d = DOCKS.find(d => !d.truck); if (!d) return false; d.truck = t; t.reroute(t.bay, d); }
        return true; },
      wait:t => t.loaded() === 6 && t.dock.truck !== t && DOCKS.every(d => d.truck) ? 'loaded · waiting for a free dock' : null,
      left:t => { sim.stats.plantOut++; t.bay.truck = null; } }),
    holdOn(path, 118, 121, { name:'plantGate', stop:'the plant gate', toward:'to the plant gate', label:'waiting for a gap in traffic',
      release:t => gapW(t, 108, 162, turningIn) && gapE(t, 66, 126, turningIn) }),   // look well along the road both ways: a flatbed is slow to clear it
    holdOn(path, 326, 120.5, { name:'gateIn', stop:'the warehouse gate', gate:whGate, toward:'to Warehouse 01', label:'waiting at the warehouse gate', release:() => whGate.isOpen() }),
    holdOn(path, dock.bx, 80, { name:'dock', stop:`Warehouse 01 · dock ${dock.id}`, toward:`to dock ${dock.id}`, label:`unloading · dock ${dock.id}`,
      release:(t, dt) => t.loaded() === 0 && settled(t, WH, dt), left:t => { t.trips++; sim.stats.flatTrips++; t.dock.truck = null; } }),
    holdOn(path, 320, 116, { name:'gateOut', stop:'the warehouse gate', gate:whGate, toward:'to the warehouse gate', label:'waiting at the warehouse gate',
      release:t => whGate.isOpen() && gapW(t, 316, 374) }),
    holdOn(path, 150, 121, { name:'park', soft:30, stop:'the truck park', toward:'back to Plant 01', label:'in the truck park · waiting for a free bay',
      release:t => { if (t.bay.truck === t) return true; const b = BAYS.find(b => !b.truck); if (!b) return false; b.truck = t; t.reroute(b, t.dock); return true; } }),
    holdOn(path, 150, 121, { name:'parkOut', soft:12, stop:'the truck park', toward:'back to Plant 01', label:'waiting for a gap in traffic', release:t => gapW(t, 138, 204) }),
  ];
  holds.sort((a, b) => a.s - b.s);
  const v = { path, holds }; FLAT.set(key, v); return v;
}
export const VAN_LOOP = new Path([[350, 134.5], [404, 134.5], [RAB.x, 143], [434, RAB.y], [RAB.x, 119], [404, 127.5], [390, 127.5], [382, 121], [352, 121], [344, 127.5],
  [326, 127.5], [326, 20], [212, 20], [212, 110], [320, 110], [320, 134.5], [350, 134.5]], 6, true);
export function vanHolds() {
  const P = VAN_LOOP;
  return [
    holdOn(P, 356, 121, { name:'shop', stop:'Corner Market', toward:'to Corner Market', label:'unloading at Corner Market · rear doors open',
      arrive:t => { t.doorsTo = 1; t.boxes = t.boxMax = t.loaded() * BOXES; t.boxRes = 0; },
      release:t => { if (t.boxes > 0 || t.boxRes > 0 || shop.staffAt(t)) return false; t.doorsTo = 0; return t.doors === 0; },
      wait:t => t.boxes || t.boxRes || shop.staffAt(t) ? null : 'closing the rear doors', left:t => t.trips++ }),
    holdOn(P, 326, 120.5, { name:'gateIn', stop:'the warehouse gate', gate:whGate, toward:'back to Warehouse 01', label:'waiting at the warehouse gate', release:() => whGate.isOpen() }),
    holdOn(P, 317, 20, { name:'enter', stop:'the loading lane', toward:'to the loading lane', label:'waiting for the loading lane to clear',
      release:t => !sim.trucks.some(o => o !== t && o.model === 'van' && o.inLane()) && !WH.forklifts.some(f => Math.abs(f.y - 20) < 4.5 && f.x > 230 && f.x < 312) }),
    holdOn(P, 240, 20, { name:'load', stop:'the loading spot', toward:'to the loading spot', label:'loading · rear doors open', arrive:t => { t.doorsTo = 1; },
      release:(t, dt) => { if (t.loaded() < 4 || !settled(t, WH, dt) || shop.room() < BOXES * 4) return false; t.doorsTo = 0; return t.doors === 0; },
      wait:t => t.loaded() === 4 && shop.room() < BOXES * 4 ? 'loaded · waiting until the shop has room' : null }),
    holdOn(P, 320, 116, { name:'gateOut', stop:'the warehouse gate', gate:whGate, toward:'to the warehouse gate', label:'waiting at the warehouse gate',
      release:t => whGate.isOpen() && gapW(t, 312, 374) && gapE(t, 268, 328) }),
  ];
}
// Line 1 runs round the two southern blocks, stopping for 5 s at each shelter (longer while people board).
export const BUS_PATH = new Path([[180, 208.5], [296.5, 208.5], [296.5, 263.5], [63.5, 263.5], [63.5, 208.5], [180, 208.5]], 6, true);
export const BUS_STOPS = [
  { name:'Market St', at:[122, 208.5], wait:[122.6, 213.6] }, { name:'Harbour View', at:[248, 208.5], wait:[248.6, 213.6] },
  { name:'Villas', at:[296.5, 236], wait:[291.4, 236.6] }, { name:'Beach', at:[150, 263.5], wait:[149.4, 258.4] }, { name:'Park', at:[63.5, 236], wait:[68.6, 235.4] }];
for (const st of BUS_STOPS) st.queue = [];
export function busHolds() {
  return [
    ...BUS_STOPS.map(st => holdOn(BUS_PATH, ...st.at, { name:'stop', bus:st, stop:st.name, toward:`to ${st.name}`, label:`at ${st.name}`,
      arrive:t => busArrive(t, st), release:(t, dt) => (t.dwell += dt) > 5 && !st.boarding, left:t => { t.trips++; } })),
    holdOn(BUS_PATH, 296.5, 256.5, { name:'yield', soft:14, toward:'', label:'giving way', release:t => !roadBusy(t, 290, 332, 263.5) }),
  ];
}
