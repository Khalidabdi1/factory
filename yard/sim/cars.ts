// @ts-nocheck
import { hooks, scene } from '../shared';
import { pose } from '../kernel/part';
import { rand, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { RAB } from '../layout';
import { PROTO, kmh, sim } from './core';
import { bendLimit, clearAhead, compass, gapE, nextRoadSeq, roadBusy, streetAt } from './roads';
import { Customer } from './people';

// ---- cars ----
// Through traffic comes in from the west and goes round the roundabout; town traffic drives closed loops of
// right turns round the blocks, giving way where it joins a busier street; customers park opposite the shop.
export const ROAD = { path:new Path([[-8, 134.5], [404, 134.5], [RAB.x, 143], [434, RAB.y], [RAB.x, 119], [404, 127.5], [-8, 127.5]], 8), next:0 };
export const COAST = { e:new Path([[-8, 270.5], [448, 270.5]]), w:new Path([[448, 263.5], [-8, 263.5]]), nextE:2, nextW:5 };
const plate = () => `${String.fromCharCode(65 + Math.floor(rng() * 26))}${String.fromCharCode(65 + Math.floor(rng() * 26))} ${Math.floor(rand(100, 999))}`;
const ROLE = { through:'passing through', local:'town traffic', coast:'on the coast road', customer:'shopping' };
export class Car {
  constructor(o) {
    Object.assign(this, { kind:'car', seq:nextRoadSeq(), s:0, v:null, stops:[], si:0, yields:[], role:'through', t0:sim.t, parked:false, stopT:0 }, o);
    this.van ??= rng() < 0.3; this.len ??= this.van ? 5.2 : 4.2; this.halfW = 1.05;
    this.tone ??= rng() < 0.4 ? 'k' : 'n'; this.id ??= plate();
    this.vmax ??= rand(10, 14); this.v ??= this.vmax * 0.8;
    this.group = (this.proto ?? (this.van ? PROTO.carVan : PROTO.car)[this.tone]).clone(); this.group.userData.entity = this; this.groups = [this.group];
    this.pick ??= [-this.len / 2, 0, this.van ? 1.6 : 1.2];
    scene.add(this.group); sim.cars.push(this); this.place();
  }
  place() {
    const a = this.path.at(this.s); pose(this.group, a.x, a.y, a.h);
    this.front = a; this.points = [[a.x, a.y], [a.x - Math.cos(a.h) * this.len, a.y - Math.sin(a.h) * this.len]];
  }
  update(dt) {
    if (this.at) {
      if (!this.at.release(this, dt)) { this.v = 0; this.blocker = null; return; }
      const st = this.at; this.at = null; this.si++; st.left?.(this);
    }
    const st = this.stops[this.si];
    let room = Math.min(clearAhead(this, 30, 2, dt), this.yieldRoom());
    if (st) room = Math.min(room, st.s - this.s);
    const vT = Math.min(this.limit(), Math.sqrt(12 * Math.max(0, room)));
    this.v = vT < this.v ? vT : Math.min(vT, this.v + 3 * dt);
    this.s += this.v * dt;
    if (st && st.s - this.s < 0.08) { this.s = st.s; this.v = 0; this.at = st; st.arrive?.(this); }
    // stuck for a long time, a car slips past whatever holds it rather than freeze the town
    this.stopT = this.v < 0.1 && !this.at ? this.stopT + dt : 0;
    if (this.stopT > 25) { this.ghostT = 2; this.stopT = 0; }
    this.place();
    if (!this.path.closed && this.s - this.len > this.path.length) this.remove();
  }
  limit() { const f = this.front; return Math.min(Math.hypot(f.x - RAB.x, f.y - RAB.y) < 22 ? 7 : this.vmax, bendLimit(this.path, this.s)); }
  // a give-way line ahead holds the car until the street it joins is clear
  yieldRoom() {
    if (!this.yields.length) return Infinity;
    const L = this.path.length, s = ((this.s % L) + L) % L; let room = Infinity;
    for (const y of this.yields) { const d = (y.s - s + L) % L; if (d > 0.05 && d < 16 && !y.clear(this)) room = Math.min(room, d - 0.2); }
    return room;
  }
  dir() { return compass(this.front.h); }
  status() { return this.at ? this.at.wait?.(this) ?? this.at.label : this.v < 0.2 ? `waiting · ${streetAt(this.front.x, this.front.y)}` : `${this.dir()} · ${kmh(this.v)}`; }
  info() {
    const rows = [['Street', streetAt(this.front.x, this.front.y)], ['Direction', this.dir()], ['Speed', kmh(this.v)]];
    if (this.loop) rows.push(['Route', this.loop.name], ['Laps', String(Math.floor(this.s / this.path.length))]);
    if (this.role === 'customer') rows.push(['Driver', this.driver?.id ?? 'in the car']);
    return { kind:`${this.van ? 'Van' : 'Car'} · ${ROLE[this.role]}`, title:this.id, status:this.status(), rows };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  route() { const st = !this.at && this.stops[this.si], q = st && this.path.at(st.s); return { path:this.path, s:this.s, closed:this.path.closed, next:q && [q.x, q.y], stop:st?.name }; }
  remove() { sim.cars.splice(sim.cars.indexOf(this), 1); for (const g of this.groups) g.removeFromParent(); hooks.forget(this); }
}
export const LOOPS = [
  { name:'round the market', pts:[[120, 134.5], [176.5, 134.5], [176.5, 201.5], [63.5, 201.5], [63.5, 134.5], [120, 134.5]], n:3,
    yields:[[63.5, 141.5, 28, 72, 134.5], [176.5, 194.5, 172, 216, 201.5]] },
  { name:'round the harbour blocks', pts:[[240, 208.5], [296.5, 208.5], [296.5, 263.5], [183.5, 263.5], [183.5, 208.5], [240, 208.5]], n:3,
    yields:[[183.5, 215.5, 150, 190, 208.5], [296.5, 256.5, 290, 332, 263.5]] },
  { name:'round Hill Av', pts:[[330, 134.5], [404, 134.5], [RAB.x, 143], [416.5, 153], [416.5, 201.5], [303.5, 201.5], [303.5, 134.5], [330, 134.5]], n:3,
    yields:[[303.5, 141.5, 262, 310, 134.5]] },
  { name:'round the beach blocks', pts:[[120, 208.5], [176.5, 208.5], [176.5, 263.5], [63.5, 263.5], [63.5, 208.5], [120, 208.5]], n:3,
    yields:[[176.5, 256.5, 170, 214, 263.5]] },
];
for (const L of LOOPS) { L.path = new Path(L.pts, 6, true); L.ys = L.yields.map(([x, y, x0, x1, ly]) => ({ s:L.path.project(x, y), clear:v => !roadBusy(v, x0, x1, ly) })); }
// customer parking: three spots in the parking lane opposite the shop, entered from the eastbound lane
export const SPOTS = [348, 358, 368].map(S => ({ S, car:null }));
export const custNext = { t:6 };
export function customerCar(spot) {
  const S = spot.S, path = new Path([[-8, 134.5], [S - 7, 134.5], [S + 1, 140.3], [S + 8, 140.3], [S + 16, 134.5], [404, 134.5], [RAB.x, 143], [434, RAB.y], [RAB.x, 119], [404, 127.5], [-8, 127.5]], 6);
  const stop = { s:path.project(S + 8, 140.3), name:'shop parking', label:'parked · driver shopping',
    arrive:car => { car.parked = true; car.driver = new Customer(car, spot); },
    release:car => car.back && gapE(car, S - 34, S + 12),
    wait:car => car.back ? 'pulling out · waiting for a gap' : null,
    left:car => { car.parked = false; spot.car = null; } };
  const car = new Car({ role:'customer', path, stops:[stop] }); spot.car = car; return car;
}
