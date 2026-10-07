import * as THREE from 'three';
import { hooks, noop, scene, sky } from '../shared';
import { W } from '../kernel/iso';
import { glow, pose, v3 } from '../kernel/part';
import { BOOSTER, BOOSTER_ENGINES, BOOSTER_PIECES, RAPTOR, SHIP, SHIP_ENGINES, SHIP_PIECES, SPMT, buildBarrelCart, buildBooster, buildCarriage, buildChopsticks, buildCrane,
  buildEngineCart, buildLift, buildPiece, buildPlume, buildPuff, buildQdArm, buildRaptor, buildShip, buildSpmt, enginesPart, raptorSolid, zOfPiece, type Piece } from '../models/starship';
import { MOUNT_A, SB, SPMT_AT, STAND_Z, buildFactoryMachines, buildShopStands, buildStarbase } from '../world/starbase';
import * as core from './core';
import * as people from './person';
import { weather } from './weather';
const { clock, hourAt, sim } = core as any, { Person } = people as any;

// ---- Gull Spit Starbase: what is built, how it gets to the pad, and the flight ----
// The Starfactory turns out one piece at a time, for whichever Mega Bay asked first: steel from the coil is rolled into a
// ring and its seam welded, three rings are welded into a barrel on the turntable, a ship's barrel has its tiles laid.
// The barrel cart carries each piece to its bay, and the bay's crane sets it on the stack. In the Engine Shop Raptors are
// built up piece by piece on three stands; the engine trolley takes them to the bays, where they go into the aft section
// one at a time from the lift beneath it. A finished booster or ship is lifted onto the SPMT and driven to the pad, where
// the tower's chopsticks set the booster on the launch mount and the ship on top of it. The tanks are filled, the count
// runs down, and it flies: up off the mount, the ship lights its engines while still on the booster and goes on to orbit;
// the booster turns back, burns for home, falls, lights its engines again and is caught by the chopsticks. It is set
// back on the mount and taken to the Rocket Garden to be readied for its next flight; after four it is put on show.
const D2R = Math.PI / 180, ease = (t: number) => t * t * (3 - 2 * t), lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (cur: number, to: number, v: number) => cur + Math.max(-v, Math.min(v, to - cur));
const [MX, MY] = SB.mount.c, MZ = SB.mount.h, [HX, HY] = SB.hinge, REACH = SB.reach;
// open, the arms splay; shut, they pass either side of a vehicle with a hand's breadth to spare
const OPEN = 0.36, SHUT = Math.atan2(4.5 + 0.75 - 4.2, REACH);
const PARK = { th:Math.PI - 0.12, op:OPEN, zc:100 };
const PIECE_T = 20, ENGINE_T = 16, INSTALL_T = 2.6, LOAD_T = 30, COUNT_T = 20, TS = 24;
const quiet = (o: THREE.Object3D) => o.traverse(m => { (m as any).raycast = noop; });

type Veh = Rocket;
// ---- a booster or a ship ----
class Rocket {
  kind = 'rocket'; isShip: boolean; id: string; g: THREE.Group; model: THREE.Group; plume: THREE.Group; groups: THREE.Object3D[]; pick: number[];
  flights: number; state = 'stacking'; where = ''; len: number; pins: number; x = 0; y = 0; z = 0; u = v3(0, 0, 1); v = v3(0, 0, 0); throttle = 0; built = ''; readyAt = 0;
  constructor(isShip: boolean, id: string, flights = 0) {
    this.isShip = isShip; this.id = id; this.flights = flights; this.len = isShip ? SHIP.len : BOOSTER.len; this.pins = isShip ? SHIP.pins : BOOSTER.pins;
    this.g = new THREE.Group(); this.g.userData.entity = this; this.model = (isShip ? P.ship : P.booster).clone(); this.g.add(this.model);
    this.plume = (isShip ? P.shipPlume : P.boosterPlume).clone(); quiet(this.plume); glow(this.plume, true); this.plume.visible = false; this.g.add(this.plume);
    this.groups = [this.g]; this.pick = [0, 0, this.len * 0.55];
  }
  // standing upright with its bottom at (x, y, z), or flying along u
  place(x = this.x, y = this.y, z = this.z) {
    this.x = x; this.y = y; this.z = z; this.g.position.copy(W(x, y, z));
    this.g.quaternion.setFromUnitVectors(v3(0, 1, 0), W(this.u.x, this.u.y, this.u.z).normalize());
  }
  top() { return v3(this.x, this.y, this.z).addScaledVector(this.u, this.len); }
  info() {
    const rows: [string, string][] = [['Vehicle', this.isShip ? 'Starship · the upper stage, 52 m' : 'Super Heavy · the booster, 72 m'],
      ['Engines', this.isShip ? '6 Raptors · 3 sea-level, 3 vacuum' : '33 Raptors · 13 that steer, 20 fixed']];
    if (this.state === 'stacking') { const b = this.isShip ? bays[1] : bays[0];
      rows.push(['Stack', `${b.placed} of ${b.list.length} pieces · next ${b.list[b.placed]?.name ?? '—'}`], ['Engines in', `${b.installed} of ${b.need}`]); }
    if (fl && (fl.booster === this || fl.ship === this)) rows.push(['Flight time', `T+${Math.floor(fl.t)} s`], ['Altitude', `${Math.max(0, Math.round(this.z))} m`], ['Speed', `${Math.round(this.v.length() * 3.6)} km/h`]);
    if (!this.isShip) rows.push(['Flights', String(this.flights)]);
    rows.push(['Where', this.where || '—']);
    if (this.built) rows.push(['Finished', this.built]);
    const acts: [string, () => void][] = [];
    if (fl && (fl.booster === this || fl.ship === this) || pad.phase === 'count' || pad.phase === 'loading') acts.push(['Track', () => hooks.track(this)]);
    return { kind:this.isShip ? 'Starship · ship' : 'Super Heavy · booster', title:this.id, status:this.status(), rows, actions:acts };
  }
  status() { return this.state; }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  aloft() { return !!fl && (fl.booster === this && !fl.caught || fl.ship === this) ; }
}
let P: any;

// ---- the movers: SPMT, the barrel cart, the engine trolley; they crab where they go and take turns on the road ----
const road: { by: Mover, a: number, b: number }[] = [];
const onRoad = (y: number) => Math.abs(y - SB.road.y) <= SB.road.half + 0.5;
class Mover {
  kind = 'transporter'; id: string; what: string; g: THREE.Group; groups: THREE.Object3D[]; pick: number[]; x: number; y: number; h: number; speed: number; v = 0;
  steps: any[] = []; label = 'parked'; load: any = null; deck: number;
  constructor(id: string, what: string, model: THREE.Group, x: number, y: number, speed: number, deck: number) {
    Object.assign(this, { id, what, x, y, h:0, speed, deck }); this.g = model; this.g.userData.entity = this; this.groups = [this.g]; this.pick = [0, 0, 2]; scene.add(this.g); this.place();
  }
  go(pts: number[][], label: string) { for (const to of pts) this.steps.push({ do:'go', to, label }); return this; }
  until(f: () => boolean, label: string) { this.steps.push({ do:'until', f, label }); return this; }
  then(f: (m: Mover) => void) { this.steps.push({ do:'call', f }); return this; }
  update(dt: number) {
    const st = this.steps[0]; if (!st) { this.v = 0; return; }
    if (st.label) this.label = st.label;
    if (st.do === 'call') { this.steps.shift(); st.f(this); return; }
    if (st.do === 'until') { this.v = 0; if (st.f()) this.steps.shift(); return; }
    const [tx, ty] = st.to, d = Math.hypot(tx - this.x, ty - this.y);
    if (!st.res) {   // a leg along the road waits until no one else is on that stretch of it
      if (onRoad(this.y) && onRoad(ty)) { const a = Math.min(this.x, tx) - 10, b = Math.max(this.x, tx) + 10;
        if (road.some(r => r.by !== this && r.a < b && r.b > a)) { this.v = 0; this.label = 'waiting for the road'; return; }
        st.res = { by:this, a, b }; road.push(st.res); } else st.res = true; }
    if (d < 0.05) { this.x = tx; this.y = ty; this.v = 0; if (st.res !== true) road.splice(road.indexOf(st.res), 1); this.steps.shift(); this.place(); return; }
    const acc = this.what.startsWith('self') ? 1.5 : 2.5;
    this.v = Math.min(this.speed, Math.sqrt(2 * acc * d), this.v + acc * dt);
    const s = Math.min(d, this.v * dt); this.x += (tx - this.x) / d * s; this.y += (ty - this.y) / d * s; this.place();
  }
  place() { pose(this.g, this.x, this.y, this.h, 0); if (this.load?.ride) this.load.ride(this); }
  info() { return { kind:`Transporter · ${this.what}`, title:this.id, status:this.label, rows:[['Carrying', this.load ? this.load.name : 'nothing'], ['Speed', `${(this.v * 3.6).toFixed(1)} km/h`]] }; }
  status() { return this.label; }
  readout() { return `${this.id} · ${this.label}`.toLowerCase(); }
}

// ---- the bays ----
type Bay = { b: typeof SB.bay1, ship: boolean, list: Piece[], need: number, veh: Rocket | null, placed: number, asked: number, installed: number, engines: number, stack: THREE.Group,
  pieces: THREE.Group[], eng: THREE.Group | null, crane: any, ent: any, lift: THREE.Group, liftT: number, next: number, seq: number };
let bays: Bay[] = [];

// ---- the pad ----
const pad: any = { phase:'idle', booster:null, ship:null, t:0, hold:'' };
let fl: any = null;
const arms: any = { th:PARK.th, op:PARK.op, zc:PARK.zc, held:null as Rocket | null, steps:[] as any[], label:'parked' };
const qd: any = { a:Math.PI, to:Math.PI };

export function buildStarbaseSys() {
  const w = buildStarbase(); scene.add(w.g);
  P = { booster:buildBooster(), ship:buildShip(), boosterPlume:buildPlume(4.0, 34), shipPlume:buildPlume(3.0, 20), raptor:buildRaptor() };
  // the raptors waiting for the trolley, on their cradles north of the shop
  const S = SB.shop, stockG = Array.from({ length:S.stock.n }, (_, i) => { const r = raptorSolid(); pose(r, S.stock.x0 + i * S.stock.dx, S.stock.y, 0, 0.4); r.visible = false; scene.add(r); return r; });
  const machines = buildFactoryMachines(w.factory.userData.peek.inside), stands = buildShopStands(w.shop.userData.peek.inside);

  // ---- production ----
  // engines are not drawn from far off (a few pixels each, and three draw calls)
  let far = false; const carried: THREE.Object3D[] = [];
  const factory: any = { t:0, queue:[] as any[], cur:null as any, out:[] as any[], made:0, cycleBy:'' };
  const shop: any = { stock:4, made:0, seq:412, stands:stands.map(r => ({ r, t:0, on:false, id:'' })), trolleyLoad:0 };
  const mkBay = (b: typeof SB.bay1, ship: boolean, level: number): Bay => {
    const inside = (b === SB.bay1 ? w.bay1 : w.bay2).userData.peek.inside, stack = new THREE.Group(); stack.position.copy(W(b.c[0], b.c[1], STAND_Z)); inside.add(stack);
    // the crane: a girder across the bay riding north and south, the hook on its cables; the engine lift under the stand
    const cr = buildCrane(b.x1 - b.x0, b.c[0] - b.x0), girder = cr.g, hook = cr.hook, cable = cr.cable; inside.add(girder);
    const lift = buildLift(); lift.position.copy(W(b.c[0], b.c[1], 0)); inside.add(lift);
    return { b, ship, list:ship ? SHIP_PIECES : BOOSTER_PIECES, need:ship ? 6 : 33, veh:null, placed:level, asked:level, installed:0, engines:0, stack, pieces:[], eng:null,
      crane:{ y:b.c[1], z:b.h - 8, girder, hook, cable, load:null as any, loadH:0, lifted:null as any, steps:[] as any[] }, ent:null, lift, liftT:0, next:0, seq:0 };
  };
  bays = [mkBay(SB.bay1, false, 0), mkBay(SB.bay2, true, 0)];
  // the cart, the trolley, the SPMT
  const cart = new Mover('BC-2', 'barrel cart', buildBarrelCart(), SB.access.x, 323, 10, 1.6);
  const trolley = new Mover('ET-1', 'engine trolley', buildEngineCart(), S.x0 + 46, SB.road.lanes[1], 10, 1.2);
  const spmt = new Mover('SPMT-1', 'self-propelled modular transporter', buildSpmt(), 1620, SB.road.y, 8, SPMT.stand);
  spmt.pick = [0, 0, 6];
  const movers = [cart, trolley, spmt];

  // the tower's moving parts
  const chop = buildChopsticks(), carriage = buildCarriage(), qdArm = buildQdArm(); scene.add(chop.g, carriage, qdArm);
  const tower = { kind:'starbase', id:'the Launch Tower', groups:[chop.g, carriage, qdArm], pick:[0, 0, 4],
    info() { return { kind:'Launch tower · 146 m', title:this.id, status:arms.label, rows:[['Chopsticks', arms.held ? `holding ${arms.held.id}` : arms.op > 0.2 ? 'open' : 'closed'],
      ['Carriage', `${Math.round(arms.zc)} m up`], ['Swung', `${Math.round(arms.th / D2R - 90)}° from the mount`], ['Ship QD arm', qd.a < 2 ? 'on the ship' : 'stowed'], ['On the mount', mountText()]] }; },
    readout() { return `the launch tower · ${arms.label}`; } };
  for (const g of tower.groups) g.userData.entity = tower;
  const mountText = () => pad.booster ? pad.ship ? `${pad.booster.id} and ${pad.ship.id}` : pad.booster.id : 'nothing';

  // puffs of steam and smoke, and the trail
  const puffP = buildPuff(), puffs = Array.from({ length:30 }, () => { const m = puffP.clone(); quiet(m); m.visible = false; sky.add(m); return { m, x:0, y:0, z:0, vx:0, vy:0, vz:0, r:1, R:1, t:0, life:0 }; });
  let pi = 0;
  const puff = (x: number, y: number, z: number, R: number, life: number, vx = 0, vy = 0, vz = 0) => { const q = puffs[pi = (pi + 1) % puffs.length]; Object.assign(q, { x, y, z, vx, vy, vz, R, r:R * 0.3, t:0, life }); q.m.visible = true; };

  // ---- the vehicles at the start: B-20 and S-41 stacked on the mount; B-21 half built; S-42 begun; B-9 on show ----
  const fleet: Rocket[] = [];
  const add = (r: Rocket) => { fleet.push(r); scene.add(r.g); return r; };
  const b20 = add(new Rocket(false, 'Booster 20', 3)), s41 = add(new Rocket(true, 'Ship 41'));
  b20.place(MX, MY, MZ); b20.state = 'on the launch mount'; b20.where = 'the launch mount';
  s41.place(MX, MY, MZ + BOOSTER.len); s41.state = 'stacked on Booster 20'; s41.where = 'the launch mount';
  Object.assign(pad, { booster:b20, ship:s41, phase:'stacked', t:0, from:130 });
  const b9 = add(new Rocket(false, 'Booster 9', 4)); b9.place(SB.garden.D[0], SB.garden.D[1], STAND_Z); b9.state = 'retired · on show'; b9.where = 'the Rocket Garden';
  const garden: (Rocket | null)[] = [null, null]; let shown: Rocket | null = b9;
  qd.a = qd.to = 1.32;
  const seq = { booster:21, ship:42 };
  const startStack = (bay: Bay, placed: number) => {
    const r = new Rocket(bay.ship, bay.ship ? `Ship ${seq.ship++}` : `Booster ${seq.booster++}`); fleet.push(r); bay.veh = r; r.state = 'stacking'; r.where = bay.b.name;
    bay.placed = bay.asked = 0; bay.installed = bay.engines = 0; bay.pieces.forEach(m => m.removeFromParent()); bay.pieces = []; if (bay.eng) { bay.eng.removeFromParent(); bay.eng = null; }
    for (let i = 0; i < placed; i++) setPiece(bay, i);
    bay.placed = bay.asked = placed;
  };
  const setPiece = (bay: Bay, i: number) => { const m = P.pieces[bay.ship ? 1 : 0][i].clone(); m.userData.entity = bay.veh; pose(m, 0, 0, 0, zOfPiece(bay.list, i)); bay.stack.add(m); bay.pieces.push(m); };
  P.pieces = [BOOSTER_PIECES.map(buildPiece), SHIP_PIECES.map(buildPiece)];
  startStack(bays[0], 4); startStack(bays[1], 0);

  // ---- the factory's cycle: a piece every PIECE_T s for whichever bay asked first ----
  const want = (bay: Bay) => { if (!bay.veh || bay.veh.state !== 'stacking') return; if (bay.asked < bay.list.length && bay.asked - bay.placed < 2) { factory.queue.push({ bay, i:bay.asked++ }); } };
  const factoryStep = (dt: number) => {
    for (const b of bays) want(b);
    if (!factory.cur && factory.queue.length) { factory.cur = factory.queue.shift(); factory.t = 0; }
    if (factory.cur) { factory.t += dt; if (factory.t >= PIECE_T) { factory.out.push(factory.cur); factory.made++; factory.cur = null; } }
  };
  // ---- the engine shop: three stands, a piece at a time ----
  const engineNeed = () => bays.reduce((s, b) => s + (b.veh && b.veh.state === 'stacking' ? b.need - b.installed - b.engines : 0), 0) - shop.trolleyLoad;
  const shopStep = (dt: number) => {
    const building = shop.stands.filter((s: any) => s.on).length;
    for (const s of shop.stands) {
      if (!s.on) { if (engineNeed() - shop.stock - shop.stands.filter((x: any) => x.on).length > 0 && shop.stock < SB.shop.stock.n) { s.on = true; s.t = 0; s.id = `R3-${String(shop.seq++).padStart(4, '0')}`; } }
      if (!s.on) continue;
      if (s.t < 1) s.t = Math.min(1, s.t + dt / ENGINE_T);
      const n = Math.min(6, Math.floor(s.t * 6.999) + 1); s.r.parts.forEach((m: THREE.Object3D, k: number) => { m.visible = k < n; });
      if (s.t >= 1 && shop.stock < SB.shop.stock.n) { shop.stock++; shop.made++; s.on = false; s.r.parts.forEach((m: THREE.Object3D) => { m.visible = false; }); }
    }
    void building;
    stockG.forEach((r, i) => { r.visible = i < shop.stock && !far; });
  };

  // ---- the barrel cart: from the factory's door to a bay's crane and back ----
  const DOOR = [SB.access.x, 323];
  const cartStep = () => {
    if (cart.steps.length || cart.load || !factory.out.length) return;
    const job = factory.out.shift(), bay: Bay = job.bay, q = bay.list[job.i], [dx, dy] = bay.b.drop, m = P.pieces[bay.ship ? 1 : 0][job.i].clone(); quiet(m);
    cart.load = { name:`${q.name} for ${bay.veh?.id}`, m, ride:(c: Mover) => pose(m, c.x, c.y, 0, c.deck) }; scene.add(m); cart.place();
    // the bay's crane comes down to meet it
    if (!bay.crane.load) bay.crane.steps.push({ y:dy, z:1.6 + q.h });
    cart.go([[DOOR[0], SB.apron], [dx, SB.apron], [dx, dy]], `taking ${q.name} to ${bay.b.name}`)
      .until(() => craneTake(bay, job.i, m), `waiting for ${bay.b.name}'s crane`)
      .until(() => bay.crane.lifted === m, `${q.name} going onto the hook`)
      .then(c => { c.load = null; })
      .go([[dx, SB.apron], [DOOR[0], SB.apron], DOOR], 'back to the Starfactory').then(c => { c.label = 'at the Starfactory door'; });
  };
  // ---- the crane: lift the piece off the cart, over the stack, down onto it ----
  const craneTake = (bay: Bay, i: number, m: THREE.Group) => {
    const c = bay.crane; if (c.load || c.steps.length) return false;
    const [cx, cy] = bay.b.c, [, dy] = bay.b.drop, top = STAND_Z + zOfPiece(bay.list, i), h = bay.list[i].h;
    c.load = m; c.loadH = h; const lz = 1.6;
    c.steps.push({ y:dy, z:lz + h }, { call:() => { c.lifted = m; } }, { y:dy, z:top + h + 2, carry:true }, { y:cy, z:top + h + 2, carry:true }, { y:cy, z:top + h, carry:true },
      { call:() => { m.removeFromParent(); c.load = null; c.lifted = null; setPiece(bay, i); bay.placed++; } }, { y:cy, z:bay.b.h - 8 });
    return true;
  };
  const craneStep = (bay: Bay, dt: number) => {
    const c = bay.crane, st = c.steps[0];
    if (st) {
      if (st.call) { c.steps.shift(); st.call(); }
      else { c.y = approach(c.y, st.y, 3.5 * dt); c.z = approach(c.z, st.z, 11 * dt); if (Math.abs(c.y - st.y) < 1e-3 && Math.abs(c.z - st.z) < 1e-3) c.steps.shift(); }
    }
    // the hook block hangs at c.z (the load's top), its cables up to the trolley
    const { b } = bay; pose(c.girder, b.x0, c.y, 0, b.h - 6); pose(c.hook, b.c[0] - b.x0, 0, 0, c.z - (b.h - 6));
    c.cable.scale.y = Math.max(0.1, b.h - 6 - 3.6 - c.z - 1.0);
    if (c.load && st?.carry) { if (c.load instanceof Rocket) c.load.place(b.c[0], c.y, c.z - c.load.len); else pose(c.load, b.c[0], c.y, 0, c.z - c.loadH); }
  };
  // ---- the trolley takes engines from the shop's cradles to whichever bay is short of them ----
  const trolleyStep = () => {
    if (trolley.steps.length) return;
    const bay = bays.find(b => b.veh?.state === 'stacking' && b.placed > 0 && b.need - b.installed - b.engines > 0);
    if (!bay || !shop.stock) return;
    const n = Math.min(6, shop.stock, bay.need - bay.installed - bay.engines); shop.stock -= n; shop.trolleyLoad = n;
    const ms = Array.from({ length:n }, (_, k) => { const r = raptorSolid(); quiet(r); r.visible = !far; scene.add(r); carried.push(r); return [r, k] as [THREE.Group, number]; });
    trolley.load = { name:`${n} Raptor${n > 1 ? 's' : ''} for ${bay.veh!.id}`, ride:(c: Mover) => { for (const [r, k] of ms) pose(r, c.x - 1.6 - k * 2.1, c.y, 0, c.deck); } }; trolley.place();
    // in by the alley between the bays, to the side door of the bay that wants them
    const ax = SB.alley, ay = bay === bays[0] ? 318 : 322;
    trolley.go([[S.x0 + 46, SB.road.lanes[1]], [ax, SB.road.lanes[1]], [ax, ay]], `taking ${n} Raptors to ${bay.b.name}`)
      .then(c => { for (const [r] of ms) { r.removeFromParent(); carried.splice(carried.indexOf(r), 1); } bay.engines += n; shop.trolleyLoad = 0; c.load = null; })
      .go([[ax, SB.road.lanes[1]], [S.x0 + 46, SB.road.lanes[1]]], 'back to the Engine Shop').then(c => { c.label = 'at the Engine Shop'; });
  };
  // ---- a bay fits its engines one at a time from the lift, and finishes the vehicle ----
  const bayStep = (bay: Bay, dt: number) => {
    craneStep(bay, dt);
    const r = bay.veh; if (!r || r.state !== 'stacking') return;
    if (bay.placed > 0 && bay.engines > 0 && bay.installed < bay.need) {
      bay.liftT += dt; const k = Math.min(1, bay.liftT / INSTALL_T), [ex, ey] = (bay.ship ? SHIP_ENGINES : BOOSTER_ENGINES)[bay.installed];
      bay.lift.position.copy(W(bay.b.c[0] + ex, bay.b.c[1] + ey, k * (STAND_Z - 3.9))); bay.lift.getObjectByName('engine')!.visible = true;
      if (k >= 1) { bay.installed++; bay.engines--; bay.liftT = 0; if (bay.eng) bay.eng.removeFromParent(); bay.eng = enginesPart(bay.ship, bay.installed); bay.eng.userData.entity = r; bay.stack.add(bay.eng); }
    } else { bay.lift.position.copy(W(bay.b.c[0], bay.b.c[1], 0)); bay.lift.getObjectByName('engine')!.visible = false; }
    if (bay.placed === bay.list.length && bay.installed === bay.need && !bay.crane.steps.length) {
      // done: the pieces give way to the whole vehicle, standing where they were
      for (const m of bay.pieces) m.removeFromParent(); bay.pieces = []; if (bay.eng) { bay.eng.removeFromParent(); bay.eng = null; }
      bay.stack.parent!.add(r.g); r.u.set(0, 0, 1); r.place(bay.b.c[0], bay.b.c[1], STAND_Z); r.state = 'ready · in its bay'; r.built = clock(sim.t);
    }
  };

  // ---- the SPMT's jobs ----
  const pickUpFromBay = (bay: Bay) => {
    const r = bay.veh!, c = bay.crane, [cx, cy] = bay.b.c, [dx, dy] = bay.b.drop;
    spmt.go([[spmt.x, SB.road.y], [dx, SB.road.y], [dx, dy]], `to ${bay.b.name} for ${r.id}`)
      .until(() => { if (c.steps.length || c.load) return false;
        c.load = r; c.steps.push({ y:cy, z:STAND_Z + r.len }, { y:cy, z:STAND_Z + r.len + 1, carry:true }, { y:dy, z:STAND_Z + r.len + 1, carry:true }, { y:dy, z:STAND_Z + r.len, carry:true },
          { call:() => { c.load = null; scene.add(r.g); r.g.visible = true; bay.veh = null; spmt.load = { name:r.id, r, ride:(m: Mover) => r.place(m.x, m.y, STAND_Z) }; r.state = 'on the SPMT'; } }, { y:cy, z:bay.b.h - 8 });
        r.state = 'being lifted onto the SPMT'; return true; }, `waiting for ${bay.b.name}'s crane`)
      .until(() => !!spmt.load, `${r.id} going onto the transport stand`);
    return r;
  };
  const toPad = (r: Rocket) => spmt.then(() => { r.state = r.isShip ? 'rolling out to the pad' : 'rolling out to the pad'; r.where = 'the road to the pad'; })
    .go([[spmt.x, SB.road.y], [SPMT_AT.x, SPMT_AT.y]], `rolling ${r.id} out to the pad`);
  const job = () => {
    if (spmt.steps.length) return;
    // with nothing to do while a stack stands on the pad, it waits well back from it
    if (spmt.x > 1700 && pad.ship) { spmt.go([[1640, SB.road.y]], 'back from the pad').then(m => { m.label = 'parked'; }); return; }
    // a booster back on the mount after its flight goes first, to the garden (or on show after its fourth)
    if (pad.booster && pad.phase === 'landed' && !arms.steps.length) {
      const r = pad.booster as Rocket, retire = r.flights >= 4, slot = retire ? -1 : garden.findIndex(g => !g), at = retire ? SB.garden.D : SB.garden.R[Math.max(0, slot)];
      spmt.go([[spmt.x, SB.road.y], [SPMT_AT.x, SPMT_AT.y]], `to the pad for ${r.id}`)
        .until(() => { if (arms.steps.length) return false; transfer(r, 'down'); return true; }, 'waiting for the chopsticks').until(() => spmt.load?.r === r, `${r.id} coming down off the mount`)
        .then(() => { r.where = 'the road'; r.state = retire ? 'going on show in the Rocket Garden' : 'going back to be readied'; })
        .go([[at[0], SB.road.y], [at[0], at[1]]], `taking ${r.id} to the Rocket Garden`)
        .then(m => { m.load = null; r.place(at[0], at[1], STAND_Z); r.where = 'the Rocket Garden';
          if (retire) { if (shown) { shown.g.removeFromParent(); fleet.splice(fleet.indexOf(shown), 1); hooks.forget(shown); } shown = r; r.state = `retired after ${r.flights} flights · on show`; }
          else { garden[slot] = r; r.state = 'being readied for its next flight'; r.readyAt = sim.t + 90; } })
        .go([[at[0], SB.road.y]], 'back to its bay');
      pad.phase = 'clearing'; return;
    }
    if (!pad.booster && pad.phase === 'idle') {
      // the next booster: a new one finished in Mega Bay 1, or a flown one readied in the garden
      const bay = bays[0], fresh = bay.veh?.state.startsWith('ready') ? bay.veh : null, gi = garden.findIndex(g => g && g.state === 'ready for its next flight');
      if (!fresh && gi < 0) return;
      let r: Rocket;
      if (fresh) r = pickUpFromBay(bay);
      else { r = garden[gi]!; const [gx, gy] = SB.garden.R[gi]; garden[gi] = null;
        spmt.go([[spmt.x, SB.road.y], [gx, SB.road.y], [gx, gy]], `to the Rocket Garden for ${r.id}`).then(m => { m.load = { name:r.id, r, ride:(q: Mover) => r.place(q.x, q.y, STAND_Z) }; r.state = 'on the SPMT'; }); }
      toPad(r).until(() => { if (arms.steps.length) return false; transfer(r, 'up'); return true; }, 'waiting for the chopsticks').until(() => !spmt.load, `${r.id} going up onto the mount`);
      pad.booster = r; pad.phase = 'booster'; return;
    }
    if (pad.booster && !pad.ship && pad.phase === 'booster' && pad.boosterOn) {
      const bay = bays[1]; if (!bay.veh?.state.startsWith('ready')) return;
      const r = pickUpFromBay(bay);
      toPad(r).until(() => { if (arms.steps.length) return false; transfer(r, 'up'); return true; }, 'waiting for the chopsticks').until(() => !spmt.load, `${r.id} going up onto ${pad.booster.id}`)
        .go([[1620, SB.road.y]], 'back from the pad');
      pad.ship = r; pad.phase = 'ship';
    }
  };
  // the chopsticks' moves for a vehicle between the SPMT and the mount (up: onto the mount or the booster; down: off it)
  const transfer = (r: Rocket, way: 'up' | 'down') => {
    const onSpmt = STAND_Z + r.pins, onMount = (r.isShip ? MZ + BOOSTER.len : MZ) + r.pins, A = SPMT_AT.a, s = arms.steps;
    const take = () => { arms.held = r; spmt.load = way === 'up' ? null : spmt.load; },
      drop = (where: string) => { arms.held = null; if (where === 'spmt') spmt.load = { name:r.id, r, ride:(m: Mover) => r.place(m.x, m.y, STAND_Z) };
        else { r.state = r.isShip ? `stacked on ${pad.booster.id}` : 'on the launch mount'; r.where = 'the launch mount'; if (r.isShip) { pad.shipOn = true; qd.to = 1.32; } else pad.boosterOn = true; } };
    if (way === 'up') s.push({ th:A, op:OPEN, zc:onSpmt + 1, label:`reaching for ${r.id}` }, { zc:onSpmt, label:`reaching for ${r.id}` }, { op:SHUT, label:`taking ${r.id} by its pins` }, { call:take },
      { zc:onMount + 2, label:`lifting ${r.id}` }, { th:MOUNT_A, label:`swinging ${r.id} over the mount` }, { zc:onMount, label:`setting ${r.id} down` }, { call:() => drop('mount') },
      { op:OPEN, label:'letting go' }, { zc:onMount + 4 }, { ...PARK, label:'stowing the chopsticks' }, { label:'parked' });
    else s.push({ th:MOUNT_A, op:OPEN, zc:onMount + 1, label:`reaching for ${r.id}` }, { zc:onMount }, { op:SHUT, label:`taking ${r.id} by its pins` }, { call:() => { arms.held = r; pad.booster = null; pad.boosterOn = false; } },
      { zc:onMount + 2, label:`lifting ${r.id} off the mount` }, { th:A, label:`swinging ${r.id} over the SPMT` }, { zc:onSpmt, label:`setting ${r.id} down` }, { call:() => drop('spmt') },
      { op:OPEN, label:'letting go' }, { zc:onSpmt + 6 }, { ...PARK, label:'stowing the chopsticks' }, { call:() => { pad.phase = 'idle'; } }, { label:'parked' });
  };
  const armsStep = (dt: number) => {
    const st = arms.steps[0];
    if (st) {
      if (st.label) arms.label = st.label;
      if (st.call) { arms.steps.shift(); st.call(); }
      else {
        if (st.th !== undefined) arms.th = approach(arms.th, st.th, 0.16 * dt);
        if (st.op !== undefined) arms.op = approach(arms.op, st.op, 0.3 * dt);
        if (st.zc !== undefined) arms.zc = approach(arms.zc, st.zc, 7 * dt);
        if ((st.th === undefined || Math.abs(arms.th - st.th) < 1e-4) && (st.op === undefined || Math.abs(arms.op - st.op) < 1e-4) && (st.zc === undefined || Math.abs(arms.zc - st.zc) < 1e-3)) arms.steps.shift();
      }
    }
    pose(chop.g, HX, HY, arms.th, arms.zc); chop.arms.forEach((a: THREE.Group, i: number) => { a.rotation.y = (i ? -1 : 1) * arms.op; });
    pose(carriage, SB.tower.c[0], SB.tower.c[1], 0, arms.zc - 3.2);
    if (arms.held) { const r = arms.held as Rocket; r.u.set(0, 0, 1); r.place(HX + REACH * Math.cos(arms.th), HY + REACH * Math.sin(arms.th), arms.zc - r.pins); }
    qd.a = approach(qd.a, qd.to, 0.35 * dt); pose(qdArm, SB.tower.c[0] - 6, SB.tower.c[1] + 6.4, qd.a, MZ + BOOSTER.len + 4.5);
  };

  // ---- the launch: fill the tanks, count down, fly ----
  const padStep = (dt: number) => {
    pad.t += dt;
    if (pad.phase === 'ship' && pad.shipOn && !arms.steps.length) { pad.phase = 'stacked'; pad.t = 0; pad.from = sim.t + 8; }
    if (pad.phase === 'stacked' && sim.t >= pad.from && !arms.steps.length) { pad.phase = 'loading'; pad.t = 0; for (const r of [pad.booster, pad.ship]) r.state = 'filling its tanks'; }
    if (pad.phase === 'loading') {
      // the tanks fill: vapour off the vents, then the count starts if the weather allows
      if ((pad.vent = (pad.vent ?? 0) - dt) <= 0) { pad.vent = 0.7; puff(MX + 3, MY - 2, MZ + 70, 2.2, 6, 0.6, 0.4, 0.8); puff(MX - 2, MY + 3, MZ + BOOSTER.len + 46, 1.8, 6, 0.5, 0.3, 0.6); }
      if (pad.t >= LOAD_T) { pad.hold = weather.raining() ? 'rain' : ''; if (!pad.hold) { pad.phase = 'count'; pad.t = 0; qd.to = Math.PI; } }
    }
    if (pad.phase === 'count') {
      if (weather.raining()) { pad.phase = 'loading'; pad.t = LOAD_T - 6; pad.hold = 'rain'; return; }
      const T = COUNT_T - pad.t;
      for (const r of [pad.booster, pad.ship]) r.state = `T−${Math.ceil(T)} s`;
      if (T < 3) { const b = pad.booster as Rocket; b.plume.visible = true; b.throttle = Math.min(1, (3 - T) / 2); setPlume(b, 0.55 * b.throttle);
        if ((pad.vent = (pad.vent ?? 0) - dt) <= 0) { pad.vent = 0.12; for (const s of [-1, 1]) puff(MX + s * 4, MY + 12, 2, 6, 7, s * 3, 6, 1.2); puff(MX, SB.trench[3] - 2, 1.5, 7, 8, 0, 9, 1.4); } }
      if (T <= 0) { launch(); }
    }
    if (pad.phase === 'flight') flightStep(dt);
  };
  const setPlume = (r: Rocket, k: number) => { r.plume.visible = k > 0.02; r.plume.scale.set(0.6 + 0.4 * Math.min(1, k * 1.5), Math.max(0.02, k) * (0.92 + 0.08 * Math.sin(sim.t * 41 + r.len)), 0.6 + 0.4 * Math.min(1, k * 1.5)); };
  const launch = () => {
    const b = pad.booster as Rocket, s = pad.ship as Rocket;
    pad.phase = 'flight'; pad.t = 0; pad.shipOn = pad.boosterOn = false;
    fl = { t:0, booster:b, ship:s, staged:false, caught:false, shipGone:false, p0:v3(MX, MY, MZ), trail:0, launchedAt:sim.t };
    // in flight they leave the plate behind: drawn in the sky, past its edges
    sky.add(b.g, s.g);
    b.flights++; b.state = 'lifting off'; s.state = 'lifting off'; b.where = s.where = 'in flight'; pad.booster = null; pad.ship = null;
  };
  // the booster's way home after staging: [time after staging, where (east, south, up of the mount's foot), how fast]
  const K = [[0, 0, 0, 0], [14, 240, 20, 1000, -14, -1.2, 0], [34, 22, 2, 300, -4, -0.3, -44], [42, 0, 0, 0, 0, 0, -0.6]];
  // straight up off the mount, then leaning east over the sea more and more (the horizontal grows with the cube of time)
  const ascent = (t: number) => v3(MX + 0.0122 * t ** 3, MY + 0.003 * t ** 3, MZ + 1.25 * t * t), ascentV = (t: number) => v3(0.0366 * t * t, 0.009 * t * t, 2.5 * t);
  const hermite = (p0: THREE.Vector3, v0: THREE.Vector3, p1: THREE.Vector3, v1: THREE.Vector3, T: number, s: number) => {
    const t = s / T, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return p0.clone().multiplyScalar(h00).addScaledVector(v0, h10 * T).addScaledVector(p1, h01).addScaledVector(v1, h11 * T); };
  const CATCH_Z = 106 - BOOSTER.pins;
  const homeAt = (tau: number) => {
    const knots = K.map((k, i) => i === 0 ? { t:0, p:ascent(TS), v:ascentV(TS) } : { t:k[0], p:i === 3 ? v3(MX, MY, CATCH_Z) : v3(MX + k[1], MY + k[2], k[3]), v:v3(k[4], k[5], k[6]) });
    const j = Math.max(1, knots.findIndex(k => k.t >= tau)); if (tau >= 42) return { p:knots[3].p.clone(), v:v3(0, 0, 0) };
    const a = knots[j - 1], b = knots[j], T = b.t - a.t, s = tau - a.t, e = 1e-3;
    const p = hermite(a.p, a.v, b.p, b.v, T, s), q = hermite(a.p, a.v, b.p, b.v, T, Math.min(T, s + e));
    return { p, v:q.sub(p).multiplyScalar(1 / e) };
  };
  const att = (keys: [number, THREE.Vector3][], t: number) => { let i = keys.findIndex(k => k[0] > t); if (i < 0) return keys[keys.length - 1][1].clone(); if (i === 0) return keys[0][1].clone();
    const [ta, a] = keys[i - 1], [tb, b] = keys[i], f = ease((t - ta) / (tb - ta)); return a.clone().lerp(b, f).normalize(); };
  const UP = v3(0, 0, 1);
  const flightStep = (dt: number) => {
    const f = fl, b = f.booster as Rocket, s = f.ship as Rocket; f.t += dt; const t = f.t;
    if (t < TS) {
      const p = ascent(t), v = ascentV(t); b.v.copy(v); b.u.copy(t < 2 ? UP : v.clone().normalize()); b.place(p.x, p.y, p.z);
      s.u.copy(b.u); s.v.copy(v); const top = b.top(); s.place(top.x, top.y, top.z);
      b.throttle = t > TS - 0.6 ? 0.2 : 1; setPlume(b, b.throttle); b.state = t < 4 ? 'lifting off' : t < 12 ? 'climbing · max Q' : t < TS - 0.6 ? 'climbing' : 'engines cut · hot staging';
      s.state = t > TS - 0.5 ? 'hot staging · engines lit' : b.state; if (t > TS - 0.5) { s.plume.visible = true; setPlume(s, 0.6); }
      // steam boils out of the trench and round the mount at first, then a trail of smoke behind it
      if ((f.trail -= dt) <= 0) { f.trail = t < 3 ? 0.08 : 0.5;
        if (t < 3) { for (const sd of [-1, 1]) puff(MX + sd * 6, MY + 10, 3, 8, 9, sd * 5, 6, 1.5); puff(MX, SB.trench[3] - 1, 2, 9, 10, 0, 12, 2); }
        else if (p.z < 900) puff(p.x, p.y, p.z - 6, 3.5 + p.z / 160, 18, 0.4, 0.2, -0.3); }
      return;
    }
    if (!f.staged) { f.staged = true; f.sepAt = t; f.sp = s.top().clone().sub(b.u.clone().multiplyScalar(SHIP.len)); f.sv = b.v.clone(); s.state = 'on its way to orbit'; b.state = 'turning back'; }
    // the ship: on and up, out of sight (the observatory keeps it until then)
    const tau = t - TS;
    if (!f.shipGone) {
      const a = v3(9, 0.8, 6.5), p = f.sp.clone().addScaledVector(f.sv, tau).addScaledVector(a, 0.5 * tau * tau), v = f.sv.clone().addScaledVector(a, tau);
      s.v.copy(v); s.u.copy(v.clone().normalize()); s.place(p.x, p.y, p.z); setPlume(s, Math.min(1, 0.6 + tau)); s.state = tau < 6 ? 'on its way to orbit' : 'climbing out of sight';
      if (tau > 20) { f.shipGone = true; s.g.removeFromParent(); fleet.splice(fleet.indexOf(s), 1); hooks.forget(s); s.state = 'in orbit'; pad.lastShip = s.id; pad.launches = (pad.launches ?? 0) + 1; }
    }
    // the booster: flip, boostback, coast home, fall, the landing burn, into the arms
    if (!f.caught) {
      const { p, v } = homeAt(tau); b.v.copy(v);
      b.u.copy(att([[0, f.sv.clone().normalize()], [1, f.sv.clone().normalize()], [5, v3(-1, -0.05, 0.3).normalize()], [12, v3(-1, -0.05, 0.3).normalize()], [18, v3(0.06, 0, 1).normalize()], [42, UP.clone()]], tau));
      b.place(p.x, p.y, p.z);
      const burn = tau > 5 && tau < 12 ? 0.55 : tau > 34 && tau < 42 ? (tau < 38 ? 0.7 : 0.35) : 0;
      setPlume(b, burn);
      b.state = tau < 5 ? 'flipping for the boostback burn' : tau < 12 ? 'boostback burn · heading home' : tau < 34 ? 'falling back toward the tower' : tau < 42 ? 'landing burn' : 'in the chopsticks';
      // the chopsticks go out to meet it
      if (tau > 22 && !f.armsOut) { f.armsOut = true; arms.steps.push({ th:MOUNT_A, op:OPEN, zc:106, label:`waiting to catch ${b.id}` }); }
      if (tau >= 42) { f.caught = true; b.place(MX, MY, CATCH_Z); setPlume(b, 0); scene.add(b.g);
        for (let k = 0; k < 6; k++) puff(MX + (k - 2.5) * 3, MY + 4, CATCH_Z + 2, 5, 8, (k - 2.5) * 0.8, 1.5, -1);
        arms.steps.push({ op:SHUT, label:`caught ${b.id}` }, { call:() => { arms.held = b; b.state = 'caught by the chopsticks'; } }, { label:'holding the booster' }, { zc:106.01 },
          { zc:MZ + BOOSTER.pins, label:`setting ${b.id} back on the mount` }, { call:() => { arms.held = null; pad.booster = b; pad.boosterOn = false; b.state = 'back on the launch mount'; b.where = 'the launch mount'; } },
          { op:OPEN, label:'letting go' }, { zc:MZ + BOOSTER.pins + 4 }, { ...PARK, label:'stowing the chopsticks' }, { call:() => { pad.phase = 'landed'; fl = null; } }, { label:'parked' }); }
    }
  };

  // ---- puffs, plumes ----
  const fxStep = (dt: number) => {
    for (const q of puffs) { if (!q.m.visible) continue; q.t += dt; const k = q.t / q.life;
      if (k >= 1) { q.m.visible = false; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z = Math.max(0.5, q.z + q.vz * dt); q.vx *= 0.985; q.vy *= 0.985; q.vz *= 0.99;
      const r = q.R * (k < 0.25 ? 0.3 + 2.8 * k : 1 - Math.max(0, (k - 0.6) / 0.4) * 0.95); q.m.position.copy(W(q.x, q.y, q.z)); q.m.scale.setScalar(r); }
  };

  // ---- the factory and shop machines ----
  const machinesStep = () => {
    const k = factory.cur ? factory.t / PIECE_T : 0, on = !!factory.cur;
    // the roll former makes three rings (0–0.45), the seam welder closes each; the barrel turns on the table (0.45–0.85)
    const rk = on && k < 0.45 ? (k / 0.1125) % 1 : on ? 1 : 0;
    machines.arcs.forEach((m, i) => { m.visible = on && i < Math.ceil(rk * 8); });
    machines.table.rotation.y = on && k > 0.45 && k < 0.85 ? sim.t * 0.5 : machines.table.rotation.y;
    const wz = on && k > 0.45 && k < 0.85 ? 1.8 + Math.floor((k - 0.45) / 0.4 * 2.999) * 1.8 : 3;
    machines.head.position.copy(W(1376 + 4.5 + 0.6, 320, 0.4 + wz));
    machines.spark.visible = on && k > 0.45 && k < 0.85 && (sim.t * 7) % 1 < 0.5; if (machines.spark.visible) glow(machines.spark, true);
    const rb = w.robot as any, tk = on && k > 0.85 ? 1 : 0.2;
    rb.getObjectByName('turret').rotation.y = -0.4 * Math.sin(sim.t * 0.8) * tk; rb.getObjectByName('shoulder').rotation.z = 0.7 + 0.2 * Math.sin(sim.t * 1.3) * tk; rb.getObjectByName('elbow').rotation.z = -1.4 + 0.2 * Math.sin(sim.t * 1.7) * tk;
  };

  // ---- the people: two at the ring line, one at the barrel cell, one tiling; one at each stand; one on each bay's lift ----
  class Hand extends Person {
    constructor(id: string, x: number, y: number, h: number, job: () => string, where: string) { super({ look:'worker', id, x, y, h, speed:1.2 }); Object.assign(this, { jobF:job, whereT:where, home:[x, y, h] }); }
    think() { this.face(this.home[2]).wait(2, (this as any).jobF()); }
    info() { return { kind:`Technician · ${(this as any).whereT}`, title:this.id, status:this.status(), rows:[['Works in', (this as any).whereT], ['Shift', 'days and nights, by turns']] }; }
  }
  const cur = () => factory.cur ? `${factory.cur.bay.list[factory.cur.i].name} for ${factory.cur.bay.veh?.id}` : null;
  const crew = [
    new Hand('T. Okonjo', 1334, 318.5, 0, () => cur() ? `rolling a ring · ${cur()}` : 'waiting for the next order', 'the Starfactory'),
    new Hand('L. Brennan', 1350, 318.5, Math.PI / 2, () => cur() ? `welding a ring's seam · ${cur()}` : 'checking the welder', 'the Starfactory'),
    new Hand('M. Ferreira', 1369, 326.5, -Math.PI / 4, () => cur() ? `welding a barrel · ${cur()}` : 'cleaning the turntable', 'the Starfactory'),
    new Hand('J. Haddad', 1398, 327, -Math.PI / 3, () => cur()?.includes('Ship') ? `laying tiles · ${cur()}` : 'sorting tiles', 'the Starfactory'),
    ...shop.stands.map((s: any, i: number) => new Hand(['R. Iyer', 'K. Novak', 'D. Mensah'][i], SB.shop.stands[i][0], SB.shop.stands[i][1] + 2.6, -Math.PI / 2,
      () => s.on ? `fitting ${RAPTOR.pieces[Math.min(5, Math.floor(s.t * 6))]} · ${s.id}` : 'waiting for parts', 'the Engine Shop')),
    ...bays.map((b, i) => new Hand(['P. Lindqvist', 'A. Sato'][i], b.b.c[0] + 7.5, b.b.c[1] + 6, -Math.PI * 0.75,
      () => b.veh?.state === 'stacking' ? b.engines > 0 && b.placed > 0 ? `fitting engine ${b.installed + 1} of ${b.need} · ${b.veh.id}` : `stacking ${b.veh.id}` : b.veh ? `${b.veh.id} is ready` : 'waiting for the next stack', b.b.name)),
  ];

  // ---- entities: the buildings, the raptors on the stands, the places on the ground ----
  const building = (g: THREE.Group, id: string, kind: string, info: () => any) => { const e: any = { kind:'starbase', id, groups:[g], pick:[0, 0, 0],
    info() { const i = info(); return { kind, title:id, ...i, actions:[...(i.actions ?? []), ['Look inside', () => hooks.lookInside(e)]] }; }, readout() { return `${id} · ${info().status}`.toLowerCase(); } };
    g.userData.entity = e; return e; };
  const bayInfo = (bay: Bay) => () => { const r = bay.veh;
    return { status:!r ? 'empty · waiting for the next stack' : r.state === 'stacking' ? `stacking ${r.id}` : `${r.id} ready to roll out`,
      bar:r ? { v:bay.placed, max:bay.list.length, label:`${bay.placed} of ${bay.list.length} pieces · engines ${bay.installed} of ${bay.need}` } : undefined,
      rows:[['Builds', bay.ship ? 'ships' : 'boosters'], ['On the stand', r ? r.id : 'nothing'], ['Next piece', r && bay.placed < bay.list.length ? bay.list[bay.placed].name : '—'],
        ['Engines waiting', String(bay.engines)], ['Crane', bay.crane.steps.length ? 'lifting' : 'idle']], actions:r ? [['The vehicle', () => hooks.select(r)]] : [] }; };
  bays[0].ent = building(w.bay1, 'Mega Bay 1', 'Booster stacking bay · 92 m', bayInfo(bays[0]));
  bays[1].ent = building(w.bay2, 'Mega Bay 2', 'Ship stacking bay · glass-walled', bayInfo(bays[1]));
  const factoryEnt = building(w.factory, 'the Starfactory', 'Starship factory · rings, barrels, domes, tiles', () => ({
    status:factory.cur ? `making ${cur()}` : 'waiting for an order',
    bar:factory.cur ? { v:Math.round(factory.t), max:PIECE_T, label:factory.t / PIECE_T < 0.45 ? 'rolling and welding rings' : factory.t / PIECE_T < 0.85 ? 'welding the barrel' : 'finishing' } : undefined,
    rows:[['Orders waiting', String(factory.queue.length)], ['Ready at the door', String(factory.out.length)], ['Pieces made', String(factory.made)], ['Steel', '30X stainless, from the coil']] }));
  const shopEnt = building(w.shop, 'the Engine Shop', 'Raptor engine shop', () => ({
    status:shop.stands.some((s: any) => s.on) ? `building ${shop.stands.filter((s: any) => s.on).map((s: any) => s.id).join(', ')}` : shop.stock >= SB.shop.stock.n ? 'cradles full · waiting' : 'waiting for orders',
    rows:[['Ready on the cradles', `${shop.stock} of ${SB.shop.stock.n}`], ['Built', String(shop.made)], ['Engine', 'Raptor 3 · full-flow staged combustion, about 280 t of thrust'],
      ...shop.stands.map((s: any, i: number) => [`Stand ${i + 1}`, s.on ? `${s.id} · ${RAPTOR.pieces[Math.min(5, Math.floor(s.t * 6))]}` : 'empty'] as [string, string])] }));
  // the engines on the stands
  const engineEnts = shop.stands.map((s: any, i: number) => { const e: any = { kind:'engine', id:`Raptor on stand ${i + 1}`, groups:[s.r.g], pick:[0, 0, 2],
    info() { const n = Math.min(6, Math.floor(s.t * 6.999) + 1); return { kind:'Raptor 3 · being built', title:s.on ? s.id : `stand ${i + 1}`, status:s.on ? `fitting ${RAPTOR.pieces[n - 1]}` : 'empty',
      bar:s.on ? { v:n, max:6, label:`${n} of 6 pieces` } : undefined, rows:RAPTOR.pieces.map((q, k) => [q, s.on && k < n ? 'on' : '—'] as [string, string]) }; },
    readout() { return `stand ${i + 1} · ${this.info().status}`; } }; s.r.g.userData.entity = e; return e; });
  // the spit's ground: the tank farm, the mount, the garden, the rest
  const placeE = (id: string, kind: string, rows: () => [string, string][], status: () => string) => ({ kind:'starbase', id, groups:[w.statics], pick:[0, 0, 0],
    info() { return { kind, title:id, status:status(), rows:rows(), actions:[['Watch the next launch', () => { const r = fl?.booster ?? pad.booster; if (r) hooks.track(r); }]] }; }, readout() { return `${id} · ${status()}`.toLowerCase(); } });
  const site = placeE('Gull Spit Starbase', 'Starship factory and launch site', () => [['Launches', String(pad.launches ?? 0)], ['Last ship', pad.lastShip ?? '—'], ['On the mount', mountText()],
    ['Mega Bay 1', bays[0].veh ? `${bays[0].veh.id} · ${bays[0].veh.state}` : 'empty'], ['Mega Bay 2', bays[1].veh ? `${bays[1].veh.id} · ${bays[1].veh.state}` : 'empty'],
    ['Boosters', fleet.filter(r => !r.isShip).map(r => `${r.id} (${r.flights})`).join(', ')]], () => padStatus());
  const mountE = placeE('the Launch Mount', 'Launch mount and flame trench', () => [['On it', mountText()], ['Hold-down clamps', '20'], ['Deluge', pad.phase === 'count' && COUNT_T - pad.t < 8 ? 'on' : 'off'],
    ['Trench', 'water-cooled, out to the sea']], () => padStatus());
  const farmE = placeE('the Tank Farm', 'Propellant tank farm', () => [['Liquid oxygen', pad.phase === 'loading' ? 'flowing to the pad' : 'full'], ['Liquid methane', pad.phase === 'loading' ? 'flowing to the pad' : 'full'], ['Nitrogen', 'for purging']],
    () => pad.phase === 'loading' ? 'loading the vehicle' : 'standing by');
  const gardenE = placeE('the Rocket Garden', 'Flown boosters and a ship on show', () => [['Being readied', garden.filter(Boolean).map(r => `${r!.id} · ${r!.state}`).join(', ') || 'nothing'],
    ['On show', [shown?.id, 'Ship 20 (2027)'].filter(Boolean).join(', ')]], () => garden.some(Boolean) ? 'boosters being readied' : 'quiet');
  const inBox = (x: number, y: number, b: number[]) => x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3];
  (w.statics.userData as any).entity = { kind:'starbase', id:'Gull Spit Starbase', groups:[w.statics],
    resolve(pt: THREE.Vector3) { const x = pt.x, y = pt.z, F = SB.farm;
      if (inBox(x, y, [F.x0, F.x1, F.y0, F.y1])) return farmE;
      if (inBox(x, y, [MX - 12, MX + 12, MY - 12, SB.trench[3]])) return mountE;
      if (inBox(x, y, [1554, 1640, 300, 336])) return gardenE;
      site.pick = [x, y, pt.y]; return site; } };
  const padStatus = () => pad.phase === 'flight' ? `flight · T+${Math.floor(fl?.t ?? 0)} s` : pad.phase === 'count' ? `T−${Math.ceil(COUNT_T - pad.t)} s` : pad.phase === 'loading' ? pad.hold ? 'holding · rain' : 'filling the tanks'
    : pad.phase === 'stacked' ? `stacked · the count starts at ${clock(pad.from)}` : pad.phase === 'landed' || pad.phase === 'clearing' ? 'booster back · making the pad safe' : pad.booster ? 'stacking on the mount' : 'waiting for the next vehicles';

  // the peek hooks: machines and stacks run only while their building is open
  factoryEnt.whileOpen = machinesStep;
  for (const bay of bays) { bay.ent.peeked = (on: boolean) => { if (bay.veh && bay.veh.g.parent === bay.stack.parent) bay.veh.g.visible = on; }; }

  // ---- each step ----
  const update = (dt: number) => {
    factoryStep(dt); shopStep(dt); cartStep(); trolleyStep();
    for (const b of bays) bayStep(b, dt);
    // a new stack begins when a bay is empty (a booster only while there are fewer than two flying)
    // (not while the SPMT is still in its doorway)
    const clear = (b: Bay) => Math.hypot(spmt.x - b.b.drop[0], spmt.y - b.b.drop[1]) > 22;
    if (!bays[1].veh && clear(bays[1])) startStack(bays[1], 0);
    if (!bays[0].veh && clear(bays[0]) && fleet.filter(r => !r.isShip && !r.state.startsWith('retired')).length < 2) startStack(bays[0], 0);
    for (const [i, r] of garden.entries()) if (r && r.state === 'being readied for its next flight' && sim.t >= r.readyAt) { r.state = 'ready for its next flight'; void i; }
    job(); for (const m of movers) m.update(dt);
    armsStep(dt); padStep(dt); fxStep(dt);
    for (const b of bays) if (b.veh && b.veh.g.parent === b.stack.parent) b.veh.g.visible = !!b.stack.parent!.visible;
  };
  // what the observatory follows: the stack in its last minutes, the ship until it is gone, then the booster
  hooks.skyTarget = () => {
    if (pad.phase === 'count' && pad.ship) return { x:MX, y:MY, z:MZ + 100, name:`${pad.ship.id} on the pad` };
    if (!fl) return null;
    const r: Rocket = !fl.shipGone ? fl.ship : fl.booster; if (fl.caught) return null;
    return { x:r.x, y:r.y, z:r.z + r.len / 2, name:!fl.shipGone ? `${r.id} on its way to orbit` : `${r.id} coming home` };
  };
  // debug: the count now, if a stack stands ready
  const launchNow = () => { if (pad.phase === 'stacked' || pad.phase === 'loading') { pad.phase = 'loading'; pad.t = LOAD_T; pad.from = sim.t; return 'counting down'; } return pad.phase; };
  update(0);
  const detail = (f: boolean) => { far = f; for (const r of carried) r.visible = !f; stockG.forEach((r, i) => { r.visible = i < shop.stock && !f; }); };
  return { update, launchNow, detail, pad, bays, fleet, movers, crew, tower, engineEnts, factory, shop, arms, groups:{ factory:w.factory, shop:w.shop, bay1:w.bay1, bay2:w.bay2 },
    ents:{ factory:factoryEnt, shop:shopEnt, bay1:bays[0].ent, bay2:bays[1].ent, site, mount:mountE, farm:farmE, garden:gardenE },
    entities:() => [site, mountE, farmE, gardenE, factoryEnt, shopEnt, bays[0].ent, bays[1].ent, tower, ...engineEnts, ...fleet, ...movers], aloft:() => !!fl };
}
