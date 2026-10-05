// @ts-nocheck
import { hooks } from '../shared';
import { glow } from '../kernel/part';
import { pick, rand, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { PROTO, clock, hourAt, kmh, sim } from './core';
import { Car } from './cars';
import { Person } from './person';
import { homes } from './homes';
import { kerbStop, locate, trip } from './roadnet';
import { kerbward, laneClear } from './roads';

// the last few metres of a drive, swung in to the kerb
const pullIn = pts => { const n = pts.length, P = pts[n - 1], Q = pts[n - 2], h = Math.atan2(P[1] - Q[1], P[0] - Q[0]), c = Math.cos(h), s = Math.sin(h);
  const k = Math.min(7, Math.hypot(P[0] - Q[0], P[1] - Q[1]) * 0.6);   // swing in over the last straight, never back round a corner
  return [...pts.slice(0, -1), [P[0] - c * k, P[1] - s * k], kerbward([P[0] - c * k * 0.35, P[1] - s * k * 0.35], h, 1.9), kerbward(P, h, 1.9)]; };   // ending parallel to the kerb

// Online orders from Corner Market. A home orders; a shop assistant picks the boxes, packs the parcel at the counter and
// carries it over the zebra to the parcel van in the shop parking; the van drives to the house, the courier walks it to
// the door, and the van comes back. Every step is timed, so an order can be tracked from the house or the van.
export const orders = hooks.orders = { list:[], seq:1001, next:30, delivered:0 };
export const STAGES = { placed:'ordered', packing:'being packed', packed:'packed', out:'out for delivery', arriving:'at the door', delivered:'delivered' };
// the van's spot in the shop parking, entered from the eastbound lane like the customers' spots
const SPOT = [376, 140.3], IN = [[361, 134.5], [369, 140.3], SPOT], OUT = [SPOT, [381, 140.3], [388, 134.5]];
const AVG = 8.5;   // m/s, the van's typical speed through town, for the estimate

export function tickOrders(dt) {
  const h = hourAt(sim.t);
  if ((orders.next -= dt) > 0 || h < 8 || h > 20) return;
  // one van does a round trip in two to four minutes: a new order every one to two, and none while two are waiting
  orders.next = rand(70, 140);
  if (orders.list.filter(q => q.state === 'placed').length >= 2) return;
  const open = homes.filter(o => !orders.list.some(q => q.house === o && q.state !== 'delivered'));
  if (open.length) placeOrder(pick(open));
}
export function placeOrder(house) {
  const o = { id:`ORD-${orders.seq++}`, house, items:rng() < 0.35 ? 2 : 1, state:'placed', t0:sim.t };
  orders.list.push(o); if (orders.list.length > 40) orders.list.splice(0, orders.list.findIndex(q => q.state === 'delivered') + 1);
  return o;
}

// the order's line on a home's card, and a Track button while it is on its way
hooks.orderFor = house => {
  const o = [...orders.list].reverse().find(q => q.house === house && (q.state !== 'delivered' || sim.t - q.tDone < 30));
  if (!o) return null;
  const going = o.state === 'out' || o.state === 'arriving';
  return { row:['Order', `${o.id} · ${STAGES[o.state]}${o.state === 'out' ? ` · ETA ${clock(sim.t + courier.eta())}` : ''}`], actions:going || o.state === 'packed' || o.state === 'packing' ? [['Track', () => hooks.track(courier)]] : [] };
};

export let courier = null;
export class Courier extends Car {
  constructor() {
    super({ kind:'courier', role:'courier', id:'PKG-1', proto:PROTO.parcelVan, len:5.4, vmax:12, v:0, path:new Path([[SPOT[0] - 6, SPOT[1]], SPOT]) });
    this.state = 'base'; this.order = null; this.driver = 'J. Okafor'; this.hazard = this.group.getObjectByName('hazard');
    this.s = this.path.length; this.parked = true; this.park(); this.place(); courier = hooks.courier = this;
  }
  park() { this.stops = [{ s:this.path.length, name:'Corner Market', label:'parked at Corner Market', release:() => false }]; this.si = 0; this.at = null; }
  drive(pts, name, arrive) { this.path = new Path(pts, 5); this.s = 0; this.si = 0; this.at = null; this.stops = [{ s:this.path.length, name, label:name, release:() => false, arrive }]; }
  // a packed parcel is in the van: it waits for a gap, pulls out of the parking into the eastbound lane, drives through
  // town to the house, and pulls in to the kerb there, out of the traffic's way
  dispatch(o) {
    const h = o.house; h.stop ??= kerbStop(...h.kerb);
    const pts = trip({ x:OUT[2][0], y:OUT[2][1], h:0 }, h.stop);
    if (!pts) { o.state = 'placed'; return; }
    this.order = o; o.state = 'out'; o.tOut = sim.t; this.state = 'leaving'; this.pending = [...OUT, ...pullIn(pts).slice(1)];
  }
  // the parcel is in: wait for a gap, back into the lane, back to the shop round whichever streets are shortest
  done() { this.state = 'waiting'; this.order = null; }
  merge() {
    const f = this.front, m = kerbward([f.x + Math.cos(f.h) * 7, f.y + Math.sin(f.h) * 7], f.h, -1.9);
    if (!laneClear(this, m[0], m[1], f.h)) return;
    const back = trip({ x:m[0], y:m[1], h:f.h }, locate(...IN[0], 0));
    this.state = 'back'; this.parked = false;
    this.drive([[f.x, f.y], m, ...(back ?? []).slice(1), ...IN.slice(1)], 'Corner Market', () => this.home());
  }
  home() { this.state = 'base'; this.parked = true; this.path = new Path([[SPOT[0] - 6, SPOT[1]], SPOT]); this.s = this.path.length; this.park(); this.place(); }
  eta() { const left = this.path.length - this.s; return this.state === 'out' ? left / AVG + 2 : 0; }
  update(dt) {
    glow(this.hazard, (this.state === 'delivering' || this.state === 'waiting') && sim.t % 0.8 < 0.4);
    if (this.state === 'leaving' && laneClear(this, OUT[2][0], OUT[2][1], 0)) {
      const o = this.order; this.state = 'out'; this.parked = false;
      this.drive(this.pending, o.house.id, () => { this.state = 'delivering'; this.parked = true; o.state = 'arriving'; new Courierman(this, o); });
    }
    if (this.state === 'waiting') this.merge();
    super.update(dt);
  }
  status() {
    const o = this.order, waiting = orders.list.filter(q => q.state === 'placed' || q.state === 'packing' || q.state === 'packed').length;
    return { leaving:'pulling out · waiting for a gap', waiting:'pulling out · waiting for a gap',
      base:waiting ? `at Corner Market · ${waiting} ${waiting > 1 ? 'orders' : 'order'} to go` : 'at Corner Market · waiting for orders',
      out:`out for delivery · ${o?.house.id}`, delivering:`at ${o?.house.id} · delivering`, back:'returning to Corner Market' }[this.state];
  }
  info() {
    const o = this.order, left = this.path.length - this.s, rows = [];
    if (o) rows.push(['Order', o.id], ['For', `${o.house.id} · ${o.house.household.text}`], ['Contents', `${o.items} ${o.items > 1 ? 'boxes' : 'box'} · ${o.sku ?? 'groceries'}`],
      ['Ordered', clock(o.t0)], ['Packed', o.tPacked ? clock(o.tPacked) : '—'], ['Out for delivery', o.tOut ? clock(o.tOut) : '—'], ['Delivered', o.tDone ? clock(o.tDone) : 'not yet']);
    rows.push(['Driver', this.driver], ['Speed', kmh(this.v)], ['Delivered today', String(orders.delivered)]);
    const bar = this.state === 'out' ? { v:this.s, max:this.path.length, label:`ETA ${clock(sim.t + this.eta())} · ${Math.round(left)} m to go` }
      : this.state === 'back' ? { v:this.s, max:this.path.length, label:`back at the shop in ${Math.round(left)} m` } : null;
    return { kind:'Courier · Corner Market', title:this.id, status:this.status(), bar, rows };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
}

// the courier on foot: from the van's kerb side along the pavement to the garden path, up to the door, and back
class Courierman extends Person {
  constructor(van, o) {
    const f = van.front, c = Math.cos(f.h), s = Math.sin(f.h), side = [f.x - c * 2.6 - s * 1.6, f.y - s * 2.6 + c * 1.6];
    super({ look:'courier', id:van.driver, x:side[0], y:side[1], h:f.h + Math.PI / 2, speed:1.8, van, order:o, carrying:'parcel' });
    const d = o.house.door, gate = [d[0], o.house.kerb[1]];
    this.walk([[side[0], gate[1]], gate, d], `taking ${o.id} to the door`).wait(1.6, 'ringing the bell').wait(1.2, 'handing over the parcel')
      .then(p => { p.carrying = null; o.state = 'delivered'; o.tDone = sim.t; orders.delivered++; o.house.parcels.push({ id:o.id, t:sim.t }); })
      .walk([gate, [side[0], gate[1]], side], 'walking back to the van').then(p => { p.remove(); van.done(); });
  }
  info() { return { kind:'Courier · on foot', title:this.id, status:this.status(), rows:[['Order', this.order.id], ['For', this.order.house.id], ['Van', this.van.id]] }; }
}
