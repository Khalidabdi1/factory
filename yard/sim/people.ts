// @ts-nocheck
import { hooks } from '../shared';
import { ease, rand, rng } from '../kernel/math';
import { Site, dedupe } from '../kernel/graph';
import { BOXES, ORCHARD, SHELF, SHOP, STOCK_CAP, SX, SY, WOODS, WORLD, ZEBRA_X, sx } from '../layout';
import { NAMES, STAFF, clock, kmh, night, sim } from './core';
import { streetAt } from './roads';
import { SPOTS } from './cars';
import { Person } from './person';
import { PARK_BENCHES } from '../world/ground';
import { CAFE_TABLES } from '../world/town';
import { PLAY_BENCHES } from '../world/orchard';

let shopperSeq = 1, walkerSeq = 0;
// the warehouse guard, created with the rest of the yard
let guard = null;
export const setGuard = g => { guard = g; };

// The shop: shelves, a stockroom stack, and the staff who carry boxes in from the delivery truck.
// Its aisles are worked out in the frame the shop was drawn in (L turns a town point into it, sx turns it back).
const L = p => [p[0] - SX, p[1] - SY];
export const shop = {
  kind:'shop', id:'Corner Market', pick:[370, 112, 5.0], stock:[], next:3,
  // where a person walks from the door to reach a spot in the aisle south of a shelf unit
  routeTo(stand) {
    const [x, y] = L(stand), back = y < 102;   // the back unit is reached round the end of the front one
    const side = x < 377 ? 364.2 : 392.2;
    return (back ? [[x < 377 ? 372 : 381, 106.8], [side, 106.8], [side, 101], [x, y]] : [[x, 107.2], [x, y]]).map(q => sx(...q));
  },
  routeOut(from) {
    const [x, y] = L(from), side = x < 377 ? 364.2 : 392.2;
    return [...(y < 102 ? [[side, 101], [side, 106.8], [x < 377 ? 372 : 381, 106.8]] : [[x, 107.2]]).map(q => sx(...q)), SHOP.in];
  },
  onShelf() { return SHELF.filter(s => s.sku).length; },
  freeShelf() { const f = SHELF.filter(s => !s.sku && !s.reserved); return f[Math.floor(rng() * f.length)] ?? null; },
  stockFree() { return STOCK_CAP - this.stock.length; },
  // boxes the shop can still take, less boxes already on their way
  room() {
    const coming = sim.trucks.filter(t => t.model === 'van' && (t.at?.name === 'shop' || t.hold.name === 'shop')).reduce((n, t) => n + (t.at?.name === 'shop' ? t.boxes : t.loaded() * BOXES), 0);
    return SHELF.filter(s => !s.sku).length + STOCK_CAP - this.stock.length - coming;
  },
  truckReady() { return sim.trucks.find(t => t.at?.name === 'shop' && t.doors === 1 && t.boxes - t.boxRes > 0); },
  staffAt(t) { return STAFFERS.some(p => p.truck === t); },
  takeBox(t) {
    const i = t.slots.findLastIndex(s => s.pallet), sku = t.slots[i].pallet.sku.name;
    t.boxes--; t.boxRes--;
    if (t.boxes % BOXES === 0) t.slots[i].pallet.remove(), t.slots[i].pallet = null;
    return sku;
  },
  put(sh, sku) { sh.sku = sku; sh.reserved = null; sh.mesh.visible = true; sim.stats.shopIn++; },
  stockPush(sku) { this.stock.push(sku); sim.stats.shopIn++; this.drawStock(); },
  drawStock() { this.stockMeshes.forEach((m, i) => { m.visible = i < this.stock.length; }); },
  info() {
    const t = sim.trucks.find(t => t.at?.name === 'shop');
    return { kind:'Shop', title:'Corner Market', status:t ? `delivery from ${t.id} · ${t.boxes} boxes to go` : 'open',
      bar:{ v:this.onShelf(), max:SHELF.length, label:`shelves ${this.onShelf()}/${SHELF.length} boxes` },
      rows:[['Stockroom', `${this.stock.length}/${STOCK_CAP} boxes`], ['Received', `${sim.stats.shopIn} boxes this session`], ['Sold', `${sim.stats.sold} boxes this session`],
        ['Shoppers inside', String(SHOPPERS().filter(p => p.inside()).length)], ['Parked customers', String(SPOTS.filter(s => s.car?.parked).length)],
        ['Online orders', `${hooks.orders.delivered} delivered · ${hooks.orders.list.filter(o => o.state !== 'delivered').length} on the way`]] };
  },
  readout() { return `corner market · ${this.onShelf()}/${SHELF.length} on the shelves`; },
};
const STAFFERS = [];
export class Staff extends Person {
  constructor(k) { const home = sx(...[[387, 106.2], [372, 106.2], [367, 106.6], [384.5, 106.4]][k]); super({ look:'staff', id:STAFF[k], k, home, x:home[0], y:home[1], h:-Math.PI / 2, speed:2.0 }); STAFFERS.push(this); }
  think() {
    const t = shop.truckReady();
    if (t && (shop.freeShelf() || shop.stockFree() > 0)) {
      t.boxRes++; this.truck = t; this.task = `unloading ${t.id}`;
      // behind the truck in the lay-by, its rear doors open
      const spot = [395.6, 256.2 + 0.8 * this.k];
      this.walk([SHOP.in, SHOP.out, [395.6, 253.6], spot], `to ${t.id}`).face(Math.PI).wait(0.5, 'taking a box')
        .then(p => { p.carrying = shop.takeBox(t); })
        .walk([[395.6, 253.6]], 'carrying a box in').then(p => { p.truck = null; })
        .walk([SHOP.out, SHOP.in]).then(p => p.stockBox());
      return;
    }
    // an online order, while the parcel van is in: pick it, pack it at the counter, carry it over to the van
    const { courier, orders } = hooks;
    const ord = courier?.state === 'base' && !orders.list.some(o => o.state === 'packing' || o.state === 'packed') && orders.list.find(o => o.state === 'placed');
    if (ord && (shop.onShelf() || shop.stock.length)) { this.packOrder(ord); return; }
    const sh = shop.stock.length && shop.freeShelf();
    if (sh) {
      sh.reserved = this; this.task = 'restocking from the stockroom';
      this.walk(shop.routeTo(SHOP.stockStand), 'to the stockroom').face(-Math.PI / 2).wait(0.6, 'taking a box')
        .then(p => { p.carrying = shop.stock.pop(); shop.drawStock(); })
        .walk([...shop.routeOut(SHOP.stockStand), ...shop.routeTo(sh.stand)], 'restocking the shelves').face(-Math.PI / 2).wait(0.5)
        .then(p => { sh.sku = p.carrying; sh.reserved = null; sh.mesh.visible = true; p.carrying = null; p.done++; })
        .walk(shop.routeOut(sh.stand));
      return;
    }
    this.task = null;
    this.walk([this.home], 'back to the counter').face(-Math.PI / 2).wait(rand(1.5, 3), 'waiting for a delivery');
  }
  packOrder(o) {
    o.state = 'packing'; this.task = `packing ${o.id} for ${o.house.id}`;
    const sh = SHELF.find(s => s.sku && !s.reserved), toCounter = from => [...shop.routeOut(from).slice(0, -1), sx(381.5, 111), SHOP.counter];
    if (sh) { sh.reserved = this;
      this.walk(shop.routeTo(sh.stand), `picking ${o.id}`).face(-Math.PI / 2).wait(0.8, `picking ${o.id}`)
        .then(p => { p.carrying = o.sku = sh.sku; sh.sku = null; sh.reserved = null; sh.mesh.visible = false; }).walk(toCounter(sh.stand), `carrying ${o.id} to the counter`); }
    else this.walk(shop.routeTo(SHOP.stockStand), `picking ${o.id}`).face(-Math.PI / 2).wait(0.6)
      .then(p => { p.carrying = o.sku = shop.stock.pop(); shop.drawStock(); }).walk(toCounter(SHOP.stockStand), `carrying ${o.id} to the counter`);
    // over the zebra to the van's kerb side in the seafront bays, and back
    const Z = SHOP.zebra, toVan = [sx(381.5, 111), SHOP.in, SHOP.out, SHOP.front, [Z, 254.6], [Z, 277.7], [380.4, 277.7], [380.4, 277.3]];
    this.face(-Math.PI / 2).wait(2.5, `packing ${o.id}`).then(() => { o.state = 'packed'; o.tPacked = sim.t; })
      .go(toVan, `taking ${o.id} to the van`).face(-Math.PI / 2).wait(1.2, 'loading the van')
      .then(p => { p.carrying = null; p.done++; hooks.courier.dispatch(o); p.task = null; })
      .go([...toVan].reverse().slice(1), 'back to the shop');
  }
  stockBox() {
    const sh = shop.freeShelf();
    if (sh) {
      sh.reserved = this;
      this.walk(shop.routeTo(sh.stand), 'stocking the shelves').face(-Math.PI / 2).wait(0.5)
        .then(p => { shop.put(sh, p.carrying); p.carrying = null; p.done++; }).walk(shop.routeOut(sh.stand));
    } else {
      this.walk(shop.routeTo(SHOP.stockStand), 'to the stockroom').face(-Math.PI / 2).wait(0.5)
        .then(p => { shop.stockPush(p.carrying); p.carrying = null; p.done++; }).walk(shop.routeOut(SHOP.stockStand));
    }
  }
  info() {
    return { kind:'Staff · Corner Market', title:this.id, status:this.status(),
      rows:[['Task', this.task ?? 'none'], ['Carrying', this.carrying ? `1 box · ${this.carrying}` : 'nothing'], ['Boxes moved', String(this.done)]] };
  }
}
// Pickers in Warehouse 01: they take parts off the shelving in the west strip and pack them into parcels at the bench.
const PICK_FACES = [[230.8, 26.2, Math.PI], [230.8, 29.6, 0], [230.8, 32.4, Math.PI], [230.8, 35.8, 0], [230.8, 27.8, 0], [230.8, 34.2, Math.PI]];
export const PICKERS = [];
export class Picker extends Person {
  constructor(k) { super({ look:'staff', id:['H. Brandt', 'Y. Okafor'][k], k, x:230.8, y:41.6 + k * 1.2, h:Math.PI, speed:1.3 }); PICKERS.push(this); }
  think() {
    const [x, y, h] = PICK_FACES[(this.done * 2 + this.k * 3) % PICK_FACES.length];
    this.task = 'picking an order';
    this.walk([[x, y]], 'to the shelves').face(h).wait(2.2, 'picking parts').then(p => { p.carrying = 'parts'; })
      .walk([[230.8, 41.6 + this.k * 1.2]], 'carrying parts to the bench').face(Math.PI).wait(3.2, 'packing a parcel')
      .then(p => { p.carrying = null; p.done++; p.task = null; });
  }
  info() { return { kind:'Picker · Warehouse 01', title:this.id, status:this.status(),
    rows:[['Task', this.task ?? 'between orders'], ['Carrying', this.carrying ? 'parts for an order' : 'nothing'], ['Parcels packed', String(this.done)]] }; }
}
export const SHOPPERS = () => sim.people.filter(p => p instanceof Shopper);
export class Shopper extends Person {
  constructor(o = {}) {
    // on foot, from up Hill Av or along the promenade
    const start = o.car ? null : rng() < 0.5 ? EAST_PATH : [EAST, PROM];
    super({ look:'shopper', id:`Shopper ${shopperSeq++}`, x:start?.[0], y:start?.[1], h:Math.PI, speed:rand(1.2, 1.5), want:1 + Math.floor(rng() * 3), got:[], start, ...o });
    if (!this.car) this.go(pedRoute(start, SHOP.front), 'walking to Corner Market').walk([SHOP.out, SHOP.in], 'walking in').then(p => p.choose());
  }
  inside() { return this.x > 377.5 && this.x < 409.5 && this.y > 231 && this.y < 249; }
  choose() {
    const shelf = SHELF.filter(s => s.sku && !s.reserved), sh = shelf[Math.floor(rng() * shelf.length)];
    if (!sh) {
      if (this.got.length) { this.pay(this.from); return; }
      this.walk([sx(372, 107)], 'looking for stock').wait(2.5, 'nothing on the shelves').walk([sx(378, 107.2), SHOP.in]).then(p => p.leave()); return;
    }
    sh.reserved = this;
    this.walk(this.from ? [...shop.routeOut(this.from).slice(0, -1), ...shop.routeTo(sh.stand).slice(1)] : shop.routeTo(sh.stand), 'browsing')
      .face(-Math.PI / 2).wait(rand(1.2, 2.4), 'choosing')
      .then(p => { p.got.push(sh.sku); p.carrying = sh.sku; sh.sku = null; sh.reserved = null; sh.mesh.visible = false; p.from = sh.stand;
        if (p.got.length < p.want) p.choose(); else p.pay(sh.stand); });
  }
  pay(from) {
    this.walk([...shop.routeOut(from).slice(0, -1), sx(381.5, 111), SHOP.counter], 'to the counter').face(-Math.PI / 2).wait(2, 'paying')
      .then(p => { sim.stats.sold += p.got.length; p.paid = true; p.walk([sx(381.5, 111), SHOP.in]).then(q => q.leave()); });
  }
  leave() { this.walk([SHOP.out, SHOP.front], 'leaving').go(pedRoute(SHOP.front, this.start).slice(1), 'leaving').then(p => p.remove()); }
  info() {
    return { kind:'Shopper', title:this.id, status:this.status(),
      rows:[['Arrived', clock(this.t0)], ['Shopping for', `${this.want} ${this.want > 1 ? 'boxes' : 'box'}`], [this.paid ? 'Bought' : 'Basket', this.got.length ? this.got.join(', ') : 'empty']] };
  }
}
// A customer who drove: from the seafront bay along the promenade, over the zebra to the shop, and back to the car.
export class Customer extends Shopper {
  constructor(car, spot) {
    const door = [spot.S + 5.6, 277.2], Z = SHOP.zebra;
    super({ car, spot, door, x:door[0], y:door[1], h:Math.PI / 2 });
    this.way = [door, [door[0], 277.7], [Z, 277.7], [Z, 254.6], SHOP.front, SHOP.out];
    this.go(this.way, 'walking to Corner Market').walk([SHOP.in]).then(p => p.choose());
  }
  leave() {
    this.go([SHOP.in, ...[...this.way].reverse()], 'walking back to the car')
      .then(p => { p.car.back = true; p.car.driver = null; p.remove(); });
  }
  info() { const i = super.info(); i.kind = 'Customer · drove here'; i.rows.unshift(['Car', this.car.id]); return i; }
}

// The warehouse gate: whoever comes near asks for it; the guard walks out, opens it, closes it again.
export const whGate = {
  kind:'gate', id:'Warehouse gate', open:0, phase:'closed', lastWant:-99, passed:0, forId:'', pick:[323, 117.49, 2.09],
  want(t) { if (sim.t - this.lastWant > 3 || !this.forId) this.forId = t.id; this.lastWant = sim.t; },
  isOpen() { return this.open >= 1; },
  update(dt) {
    if (sim.trucks.some(t => t.points.some(([x, y]) => x > 311 && x < 335 && y > 112 && y < 125))) this.lastWant = sim.t;
    const wanted = sim.t - this.lastWant < 2.5;
    switch (this.phase) {
      case 'closed': case 'guardBack': if (wanted) { this.phase = 'guardOut'; guard.toPost(); } break;
      case 'opening': this.open = Math.min(1, this.open + dt / 2.2); if (this.open === 1) this.phase = 'open'; break;
      case 'open': if (!wanted) this.phase = 'closing'; break;
      case 'closing': if (wanted) { this.phase = 'opening'; break; }
        this.open = Math.max(0, this.open - dt / 2.2); if (this.open === 0) { this.phase = 'guardBack'; this.forId = ''; guard.toBooth(); } break;
    }
    this.panel.position.x = -18 * ease(this.open);
  },
  state() { return { closed:'closed', guardOut:'closed · guard on the way', opening:'opening', open:'open', closing:'closing', guardBack:'closed' }[this.phase]; },
  info() { return { kind:'Gate · sliding', title:'Warehouse gate', status:this.state(), rows:[['Opened by', guard.id], ['For', this.forId || '—'], ['Vehicles through', String(this.passed)]] }; },
  readout() { return `warehouse gate · ${this.state()}`; },
};
export class Guard extends Person {
  constructor() { super({ look:'guard', id:'P. Adeyemi', x:336, y:108, h:Math.PI / 2, speed:1.6 }); }
  toPost() { this.steps = []; this.walk([[333.6, 110.4], [331.4, 114.6]], 'walking to the gate').face(Math.PI).then(() => { whGate.phase = 'opening'; }); }
  toBooth() { this.steps = []; this.walk([[333.6, 110.4], [336, 108]], 'walking back to the booth').face(Math.PI / 2).then(() => { if (whGate.phase === 'guardBack') whGate.phase = 'closed'; }); }
  status() {
    return { closed:'in the booth', guardOut:'walking to the gate', opening:`opening the gate for ${whGate.forId}`, open:`holding the gate for ${whGate.forId}`,
      closing:'closing the gate', guardBack:'walking back to the booth' }[whGate.phase];
  }
  info() { return { kind:'Guard · Warehouse 01', title:this.id, status:this.status(), rows:[['Gate', whGate.state()], ['Vehicles let through', String(whGate.passed)], ['Post', 'east side of the gate']] }; }
}

// ---- walkers: a graph of pavements and crossings, places to come from and go to ----
export const PC = [51.7, 68.3, 171.7, 188.3, 291.7, 308.3, 411.7, 428.3], PR = [139.3, 196.7, 213.3, 258.7], PROM = 276.5;
// where people come in from and go out to: the west edge through the woods, and east along the promenade or the footpath
// through the green belt
const WEST = WORLD.x0 - 4, EAST = WOODS.belt[1] + 4, EAST_PATH = [EAST, 200];
const PED = (() => {
  const nodes = {}, segs = [], add = (x, y) => { const k = `${x}|${y}`; nodes[k] = [x, y]; return k; };
  const link = (a, b) => segs.push([add(...a), add(...b)]);
  // along each row, inside the blocks and over the avenues (B3's north side is set back, block E starts further south)
  for (const y of PR) for (let i = 0; i < PC.length - 1; i++) { if (y === 139.3 && PC[i] >= 308.3 || y === 258.7 && PC[i] === 308.3) continue; link([PC[i], y], [PC[i + 1], y]); }
  // Corner Market: the pavement steps up onto the forecourt round the lay-by, the promenade steps back behind the seafront
  // bays, and a zebra over Coast Rd joins the two
  const Z = SHOP.zebra, F = SHOP.front[1];
  for (const [a, b] of [[[308.3, 258.7], [373.4, 258.7]], [[373.4, 258.7], [377.4, 256.4]], [[377.4, 256.4], [377.4, F]], [[377.4, F], [SHOP.front[0], F]],
    [[SHOP.front[0], F], [Z, F]], [[Z, F], [411.7, F]], [[411.7, F], [411.7, 258.7]], [[Z, F], [Z, 277.7]]]) link(a, b);
  link([308.3, 139.3], [308.3, 143.9]); link([308.3, 143.9], [ZEBRA_X, 143.9]); link([ZEBRA_X, 143.9], [411.7, 143.9]); link([411.7, 143.9], [428.3, 147.3]);
  // up to Orchard Lane: over Riverside Rd at the shop's zebra, up the footway, over the lane to the houses' pavement
  const O = ORCHARD;
  for (const [a, b] of [[[ZEBRA_X, 143.9], [ZEBRA_X, 117.2]], [[ZEBRA_X, 117.2], [O.walkX, 117.2]], [[O.walkX, 117.2], [O.walkX, 72.6]], [[O.walkX, 72.6], [O.walkX, O.pave]],
    [[O.walkX, O.pave], [360, O.pave]], [[O.walkX, O.pave], [438, O.pave]]]) link(a, b);
  // down each column, over Market St and Coast Rd
  for (const x of PC) {
    link([x, x === 308.3 || x === 411.7 ? 143.9 : x === 428.3 ? 147.3 : 139.3], [x, 196.7]);
    link([x, 196.7], [x, 213.3]); link([x, 213.3], x === 411.7 ? [x, F] : [x, 258.7]); link([x, 258.7], [x, PROM]);
  }
  const prom = [WEST, ...PC, EAST]; for (let i = 0; i < prom.length - 1; i++) if (prom[i] !== 308.3) link([prom[i], PROM], [prom[i + 1], PROM]);
  for (const [a, b] of [[[308.3, PROM], [373, PROM]], [[373, PROM], [374.6, 277.7]], [[374.6, 277.7], [Z, 277.7]], [[Z, 277.7], [409.6, 277.7]], [[409.6, 277.7], [411.7, PROM]]]) link(a, b);
  // Mill Park: the loop round the pond, the west gate, links to the pavements
  for (const [a, b] of [[[8, 150], [42, 150]], [[42, 150], [42, 196.7]], [[42, 196.7], [42, 250]], [[42, 250], [8, 250]], [[8, 250], [8, 200]], [[8, 200], [8, 150]],
    [[WEST, 200], [8, 200]], [[428.3, 196.7], [436, 200]], [[436, 200], EAST_PATH], [[42, 196.7], [51.7, 196.7]], [[42, 150], [42, 139.3]], [[42, 139.3], [51.7, 139.3]], [[42, 250], [42, 258.7]], [[42, 258.7], [51.7, 258.7]]]) link(a, b);
  return new Site({ name:'pavements', nodes, segs });
})();
export const pedRoute = (a, b) => dedupe([a, ...PED.route(PED.at(...a), PED.at(...b)), b]);
export const PORTALS = [];
export const portal = (kind, name, p, o = {}) => { const q = { kind, name, p, w:1, ...o }; PORTALS.push(q); return q; };
for (const [n, p, w] of [['the west end of the promenade', [WEST, PROM], 3], ['the east end of the promenade', [EAST, PROM], 3], ['the woods west of the park', [WEST, 200], 2], ['the green belt', EAST_PATH, 1]])
  portal('edge', n, p, { w });
portal('cafe', 'Café Mira', [151, 193.2], { w:2 }); portal('pier', 'the pier', [199, 309]);
for (const x of [40, 92, 136, 226, 280, 336, 384]) portal('beach', 'the beach', [x, 285.5]);
for (const p of [[12.3, 175], [12.3, 225], [37.7, 225], [25, 251.4]]) portal('park', 'Mill Park', p);
portal('park', 'Orchard Green', [401.4, 79.5]);
const LEISURE = ['cafe', 'pier', 'beach', 'park'];
// somewhere to go next: by night mostly home, by day anywhere
// places out in the open; when it rains people leave them and few set out for them
const OUTDOORS = ['beach', 'park', 'pier'];
hooks.onRain = () => { for (const p of sim.people) if (p instanceof Walker && OUTDOORS.includes(p.to?.kind) && p.steps[0]?.do === 'wait') p.steps[0].t = Math.min(p.steps[0].t, 1 + Math.abs(Math.sin(p.x)) * 3); };
export function nextPortal(from, avoid) {
  const n = night() > 0.5, pool = PORTALS.filter(q => q !== from && q.kind !== avoid);
  const w = q => q.w * (n && q.kind === 'home' ? 4 : 1) * (n && LEISURE.includes(q.kind) ? 0.1 : 1) * (q.kind === 'bank' && !hooks.bankOpen() ? 0 : 1) * (q.kind === 'fair' && !hooks.fairOpen() ? 0 : 1) * (hooks.raining() && OUTDOORS.includes(q.kind) ? 0.08 : 1);
  let r = rng() * pool.reduce((s, q) => s + w(q), 0);
  for (const q of pool) if ((r -= w(q)) <= 0) return q;
  return pool[0];
}
export const startPortal = () => { const pool = PORTALS.filter(q => q.kind === 'edge' || q.kind === 'home'); return pool[Math.floor(rng() * pool.length)]; };
export const WALKERS = () => sim.people.filter(p => p instanceof Walker);
export const walkSpawn = { t:0 };
// seats: café chairs facing their table, park benches facing away from their backrests; z is the seat height
const SEATS = { cafe:[], park:[] };
for (const tx of CAFE_TABLES) for (const [dx, h] of [[-0.8, 0], [0.8, Math.PI]]) SEATS.cafe.push({ at:[tx + dx, 191.4], h, z:0.45, by:null });
for (const [x, y, f] of [...PARK_BENCHES, ...PLAY_BENCHES]) for (const k of [-0.45, 0.45])
  SEATS.park.push({ at:f === 'e' || f === 'w' ? [x, y + k] : [x + k, y], h:{ e:0, w:Math.PI, n:-Math.PI / 2, s:Math.PI / 2 }[f], z:0.48, by:null });
const freeSeat = (kind, x, y) => (SEATS[kind] ?? []).filter(s => !s.by && Math.hypot(s.at[0] - x, s.at[1] - y) < 12)
  .sort((a, b) => Math.hypot(a.at[0] - x, a.at[1] - y) - Math.hypot(b.at[0] - x, b.at[1] - y))[0];
export class Walker extends Person {
  constructor(from, to, o = {}) {
    const jog = o.jog ?? (from.kind === 'edge' && rng() < 0.14);
    super({ look:'walker', id:NAMES[walkerSeq++ % NAMES.length], x:from.p[0], y:from.p[1], speed:jog ? rand(2.6, 3.1) : rand(1.1, 1.5), jog, dog:!jog && rng() < 0.18, from, ...o });
    this.trip(to);
  }
  trip(to) {
    this.to = to;
    this.go(pedRoute([this.x, this.y], to.p), this.jog ? 'out for a run' : this.dog ? 'walking the dog' : `walking to ${to.name}`).then(p => p.arrive());
  }
  arrive() {
    const t = this.to;
    if (t.kind === 'edge' || t.kind === 'home') { this.remove(); return; }   // indoors, or off the edge of the map
    if (t.kind === 'stop') { t.stop.queue.push(this); this.wait(150, 'waiting for the bus').then(p => p.giveUp()); return; }
    if (t.kind === 'bank') { this.from = t; hooks.bankVisit(this); return; }
    if (t.kind === 'fair') { this.from = t; hooks.fairVisit(this); return; }
    this.from = t;
    // take a free chair or bench nearby; on the beach sit on the sand, on the pier stand at the rail, both facing the sea
    const seat = freeSeat(t.kind, this.x, this.y);
    if (seat) { seat.by = this; this.walk([seat.at]).face(seat.h).then(p => p.sitOn(seat)); }
    else if (t.kind === 'beach') this.face(Math.PI / 2).then(p => p.sitOn({ ground:true }));
    else if (t.kind === 'pier') this.face(Math.PI / 2);
    this.wait(rand(14, 40), { cafe:'having a coffee', beach:'on the beach', park:'sitting in the park', pier:'looking out to sea' }[t.kind]).then(p => { p.standUp(); p.trip(nextPortal(t, t.kind)); });
  }
  giveUp() { const q = this.to.stop.queue; q.splice(q.indexOf(this), 1); this.from = this.to; this.trip(nextPortal(this.to, 'stop')); }
  info() {
    return { kind:this.jog ? 'Jogger' : this.dog ? 'Pedestrian · with a dog' : 'Pedestrian', title:this.id, status:this.status(),
      rows:[['From', this.from.name], ['Going to', this.to.name], ['Street', streetAt(this.x, this.y)], ['Pace', kmh(this.speed)]] };
  }
  route() { const r = super.route(); if (r) r.stop = this.to.name; return r; }
}
// The bus at a stop: riders get off first, then the queue walks to the door and boards.
const busDoor = t => { const f = t.front, c = Math.cos(f.h), s = Math.sin(f.h); return [f.x - c * 1.3 - s * 1.7, f.y - s * 1.3 + c * 1.7]; };
export function busArrive(t, st) {
  t.dwell = 0; st.boarding = 0;
  const door = busDoor(t), off = Math.min(t.pax, Math.floor(rng() * 3) + (st.name === 'Beach' && night() < 0.5 ? 1 : 0));
  for (let i = 0; i < off; i++) { t.pax--; new Walker({ kind:'stop', name:`the ${st.name} stop`, p:[door[0] + rand(-0.6, 0.6), door[1]] }, nextPortal(null, 'stop')); }
  for (const w of st.queue.splice(0)) {
    st.boarding++; w.steps = [];
    w.walk([door], 'boarding the bus').then(p => { st.boarding--; t.pax++; sim.stats.riders++; p.remove(); });
  }
}
