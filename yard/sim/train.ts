// @ts-nocheck
import { hooks, scene } from '../shared';
import { Part, glow, pose } from '../kernel/part';
import { clamp, rand } from '../kernel/math';
import { Path } from '../kernel/path';
import { RAIL, WORKS, WORLD, slotAt } from '../layout';
import { CARRIER_LEN, FLAT_LEN, GAP, LOCO_LEN, WDECK, buildCarrier, buildFlatWagon, buildLoco, buildRamp, carAlong } from '../models/train';
import { BODY_LEN } from '../models/works';
import { RAIL_PATH, buildRail } from '../world/rail';
import { clock, kmh, sim } from './core';
import { line, lot } from './works';

// ---- FRT-7, the freight train ----
// It comes in from the east, stops alongside Car Works' lot with the end of its car carriers at the ramp, and takes on
// finished cars: each backs out of its space, drives round to the ramp, up onto the carriers and along them to its
// place. Then it runs on to the loop in the Plant 01 yard, where the forklifts load its flat wagons from staging, and
// leaves to the west. A few minutes later the next one comes.
const CONSIST = [['loco', LOCO_LEN], ...Array(4).fill(['flat', FLAT_LEN]), ...Array(3).fill(['carrier', CARRIER_LEN])];
let off = 0; const VEH = CONSIST.map(([kind, len]) => { const o = { kind, len, off }; off += len + GAP; return o; });
const TRAIN_LEN = off - GAP, P = RAIL_PATH;
const S_WORKS = P.project(RAIL.ramp, RAIL.y) + TRAIN_LEN, S_PLANT = P.project(100, RAIL.loopY), S_GONE = P.project(WORLD.x0 - 8, RAIL.y) + TRAIN_LEN;
const LOOP = [P.project(216, RAIL.y), P.project(76, RAIL.y)];
const SLOTS_PER_CARRIER = 4, CAR_AT = k => 0.6 + k * 4.85;   // a car's front, behind its carrier's front

// a finished car on its way from the lot to the train: backing out of its space (rear first), then forward round to
// the ramp, up it and along the carriers
class Loader {
  constructor(b, carrier, k) {
    Object.assign(this, { b, carrier, k, leg:'back', s:0 });
    const x = lot.spaceX(b.space), aisle = WORKS.lot.aisle, rear = WORKS.lot.front + BODY_LEN;
    this.back = new Path([[x, rear], [x, aisle], [x - 6, aisle]], 2.5);
    const [tx] = train.carSlotWorld(carrier, k);
    this.fwd = new Path([[x - 1.5, aisle], [RAIL.ramp + 4, aisle], [RAIL.ramp + 10, aisle], [RAIL.ramp + 10, RAIL.y], [RAIL.ramp + 2, RAIL.y], [tx, RAIL.y]], 2.6);
    b.parked = false; b.loading = this; b.setModel('complete'); this.place();
  }
  place() {
    const g = this.b.group;
    if (this.leg === 'back') { const R = this.back.at(this.s), F = this.back.at(this.s - BODY_LEN); pose(g, F.x, F.y, Math.atan2(F.y - R.y, F.x - R.x), 0.02); return; }
    const a = this.fwd.at(this.s), up = a.y > RAIL.y - 1.6 ? clamp((RAIL.ramp + 7 - a.x) / 7, 0, 1) : 0;
    pose(g, a.x, a.y, a.h, 0.02 + WDECK * up);
  }
  update(dt) {
    if (this.leg === 'back') { this.s += 1.8 * dt; if (this.s >= this.back.length) { this.leg = 'fwd'; this.s = 0; } }
    else { this.s = Math.min(this.fwd.length, this.s + 4 * dt); if (this.s >= this.fwd.length) { train.stow(this); return true; } }
    this.place(); return false;
  }
}

export const train = { kind:'train', id:'FRT-7', groups:[], pick:[-8, 0, 3], s:0, v:0, state:'away', next:45, trips:0, railOut:0, carsOut:0, t0:0,
  vehicles:[], slots:[], cars:[], loaders:[], ramp:null, tStop:0,
  // where a vehicle stands, and the world position of a pallet slot or a car's place on a carrier
  poseOf(i) { const F = P.at(this.s - VEH[i].off), R = P.at(this.s - VEH[i].off - VEH[i].len); return { x:F.x, y:F.y, h:Math.atan2(F.y - R.y, F.x - R.x) }; },
  slotWorld(i) { const sl = this.slots[i], p = this.poseOf(sl.veh); return [p.x + Math.cos(p.h) * sl.local[0], p.y + Math.sin(p.h) * sl.local[0]]; },
  carSlotWorld(c, k) { const p = this.poseOf(c); return [p.x - Math.cos(p.h) * CAR_AT(k), p.y - Math.sin(p.h) * CAR_AT(k)]; },
  carriers() { return VEH.map((v, i) => i).filter(i => VEH[i].kind === 'carrier'); },
  freeCarPlace() { for (const c of this.carriers()) for (let k = 0; k < SLOTS_PER_CARRIER; k++) if (!this.cars.some(q => q.c === c && q.k === k) && !this.loaders.some(l => l.carrier === c && l.k === k)) return [c, k]; return null; },
  // a car arrives at its place: drawn into its carrier's load from now on (or still its own model while followed)
  stow(l) {
    this.loaders.splice(this.loaders.indexOf(l), 1); l.b.loading = null; l.b.onTrain = this;
    this.cars.push({ c:l.carrier, k:l.k, b:l.b });
    if (hooks.isSelected(l.b)) this.vehicles[l.carrier].attach(l.b.group); else l.b.remove();
    this.drawLoads();
  },
  drawLoads() {
    for (const c of this.carriers()) {
      const g = this.vehicles[c], old = g.getObjectByName('load'); if (old) { old.traverse(o => o.geometry?.dispose()); old.removeFromParent(); }
      const p = new Part(); let n = 0;
      for (const q of this.cars) if (q.c === c && !(q.b.group.parent === g)) { carAlong(p, -CAR_AT(q.k), q.b.tone); n++; }
      if (n) { const o = p.build('load'); o.userData.entity = this; g.add(o); }
    }
  },
  loadable() { return this.state === 'plant' && this.v === 0 ? this : null; },
  freeSlot() { return this.slots.findIndex(s => !s.pallet && !s.reserved); },
  update(dt) {
    if (this.state === 'away') { if (sim.t >= this.next) this.arrive(); return; }
    const stop = this.state === 'in' ? S_WORKS : this.state === 'toPlant' ? S_PLANT : this.state === 'out' ? S_GONE + 50 : this.s;
    const inLoop = this.s - TRAIN_LEN < LOOP[1] && this.s > LOOP[0], vmax = inLoop ? 7 : 10;
    const vT = Math.min(vmax, Math.sqrt(2 * 0.55 * Math.max(0, stop - this.s)));
    this.v = vT < this.v ? Math.max(vT, this.v - 1.2 * dt) : Math.min(vT, this.v + 0.6 * dt);
    this.s = Math.min(stop, this.s + this.v * dt);
    if (this.state === 'in' && this.s >= S_WORKS - 0.01) { this.state = 'works'; this.v = 0; this.tStop = sim.t; this.ramp.visible = true; this.nextCar = sim.t + 2; }
    if (this.state === 'works') this.loadCars();
    if (this.state === 'toPlant' && this.s >= S_PLANT - 0.01) { this.state = 'plant'; this.v = 0; this.tStop = sim.t; }
    if (this.state === 'plant') {
      const full = this.slots.every(s => s.pallet), busy = this.slots.some(s => s.reserved) || this.slots.some(s => s.pallet?.tw);
      if (!busy && (full || sim.t - this.tStop > 45)) this.state = 'out';
    }
    if (this.state === 'out' && this.s >= S_GONE) this.depart();
    for (const l of [...this.loaders]) l.update(dt);
    // a car someone was following rides as its own model; once they let it go it joins its carrier's load
    if (this.cars.some(q => q.b.group.parent && !hooks.isSelected(q.b))) { for (const q of this.cars) if (q.b.group.parent && !hooks.isSelected(q.b)) q.b.remove(); this.drawLoads(); }
    this.place();
  },
  // at Car Works: send cars over one at a time while there are places and cars, then go on
  loadCars() {
    const place = this.freeCarPlace();
    if (place && lot.cars.length && sim.t >= this.nextCar) {
      const b = lot.take(); this.nextCar = sim.t + 3.6;
      if (b) this.loaders.push(new Loader(b, ...place));
    }
    const done = !this.loaders.length && (!place || !lot.cars.length);
    if (done && sim.t - this.tStop > 6) { this.state = 'toPlant'; this.ramp.visible = false; }
  },
  arrive() {
    this.state = 'in'; this.s = 0; this.v = 10; this.t0 = sim.t; this.trips++;
    for (const g of this.vehicles) g.visible = true;
    this.place();
  },
  // off the plate to the west: what it carried goes with it
  depart() {
    for (const sl of this.slots) if (sl.pallet) { sl.pallet.remove(); sl.pallet = null; this.railOut++; sim.stats.railOut = (sim.stats.railOut ?? 0) + 1; }
    for (const q of this.cars) { q.b.group.removeFromParent(); hooks.forget(q.b); this.carsOut++; }
    this.cars = []; this.drawLoads();
    this.state = 'away'; this.v = 0; this.next = sim.t + rand(45, 75);
    for (const g of this.vehicles) g.visible = false;
    hooks.forget(this);
  },
  place() { this.vehicles.forEach((g, i) => { const p = this.poseOf(i); pose(g, p.x, p.y, p.h); }); glow(this.beacon, this.state !== 'away' && this.v > 0.1 && sim.t % 1 < 0.5); },
  status() {
    return { away:`next train at ${clock(this.next)}`, in:'arriving · for Car Works', works:`at Car Works · loading cars (${this.cars.length} on, ${this.loaders.length} coming)`,
      toPlant:'to Plant 01', plant:`at Plant 01 · loading pallets (${this.slots.filter(s => s.pallet).length} of ${this.slots.length})`, out:'leaving to the west' }[this.state];
  },
  info() {
    const pal = this.slots.filter(s => s.pallet).length, cars = this.cars.length, cap = this.carriers().length * SLOTS_PER_CARRIER;
    return { kind:'Freight train · 4 flats, 3 car carriers', title:this.id, status:this.status(), bar:{ v:pal + cars, max:this.slots.length + cap, label:`${pal} of ${this.slots.length} pallets · ${cars} of ${cap} cars` },
      rows:[['Next stop', { in:'Car Works', works:'Plant 01', toPlant:'Plant 01', plant:'west', out:'west', away:'—' }[this.state]], ['Speed', kmh(this.v)],
        ['Trips', String(this.trips)], ['Carried', `${this.railOut} pallets · ${this.carsOut} cars`]] };
  },
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); },
  route() { if (this.state === 'away') return null; return { path:P, s:this.s, closed:false, next:null, stop:this.info().rows[0][1] }; },
};
hooks.train = train;

export function buildTrain() {
  const rail = buildRail(); rail.traverse(o => { o.raycast = () => {}; }); scene.add(rail);
  const protos = { loco:buildLoco(), flat:buildFlatWagon(), carrier:buildCarrier() };
  train.vehicles = VEH.map(v => { const g = protos[v.kind].clone(); g.userData.entity = train; g.visible = false; scene.add(g); return g; });
  train.groups = train.vehicles; train.beacon = train.vehicles[0].getObjectByName('beaconF');
  // two pallets to a flat wagon
  VEH.forEach((v, i) => { if (v.kind !== 'flat') return; for (const lx of [-3.3, -9.7]) train.slots.push(slotAt({ id:`FRT-7·${train.slots.length + 1}`, label:'on FRT-7', parent:train.vehicles[i], local:[lx, 0, WDECK], owner:train, veh:i })); });
  train.ramp = buildRamp(); pose(train.ramp, RAIL.ramp, RAIL.y, 0); train.ramp.visible = false; scene.add(train.ramp);
  return train;
}
