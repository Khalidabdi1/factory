import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { Part, pose } from '../kernel/part';
import { clamp, rand, rng, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { Site, dedupe } from '../kernel/graph';
import { zAt } from '../layout';
import { HOUSES, LANES, VIL, buildMillWheel, buildVillage, buildWindFan, type House } from '../world/village';
import { buildCow, buildFarmTractor, buildHen, buildHorse, buildPig, buildSheep } from '../models/animals';
import { hourAt, kmh, night, sim } from './core';
import { FAR, Person } from './person';
import { STATIONS } from './metro';

// ---- Millbrook's people, animals and machines ----
// The villagers keep farmers' hours: out to the fields and the orchard from first light, home for their dinner at
// midday, back out in the afternoon, and on the green, at the market, in the store and in the Plough in the evening.
// They pick apples and carry them to the store, hoe the vegetables, weed the allotments, turn the hay, feed the pigs and
// the hens. The shepherd and his dog take the flock up to the foothills in the morning and bring it down at dusk; the
// stable hand leads the horses to the millpond twice a day; the cows, pigs and hens keep to their paddock, sty and run.
// The tractor ploughs the long field, a lane at a time; the mill wheel and the windpump turn. Visitors come off the
// metro for the market and the inn.
type P2 = number[];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inBox = (x: number, y: number, b: number[], m = 0) => x > b[0] - m && x < b[1] + m && y > b[2] - m && y < b[3] + m;

// ---- the lanes as a graph: segments split wherever another one ends on them ----
const VPED = (() => {
  const segs = LANES.map(([a, b]) => [a, b]), ends = segs.flat();
  const split: P2[][] = [];
  for (const [a, b] of segs) {
    const L = dist(a, b), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const cuts = ends.map(p => [(p[0] - a[0]) * ux + (p[1] - a[1]) * uy, Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux), p] as [number, number, P2])
      .filter(([t, off]) => off < 0.05 && t > 0.05 && t < L - 0.05).sort((p, q) => p[0] - q[0]).map(c => c[2]);
    const pts = [a, ...cuts, b]; for (let i = 1; i < pts.length; i++) split.push([pts[i - 1], pts[i]]);
  }
  const nodes: Record<string, P2> = {}, key = (p: P2) => { const k = `${p[0].toFixed(2)}|${p[1].toFixed(2)}`; nodes[k] = p; return k; };
  return new Site({ name:'Millbrook lanes', nodes, segs:split.map(([a, b]) => [key(a), key(b)]) });
})();
export const vRoute = (a: P2, b: P2) => dedupe([a, ...VPED.route(VPED.at(a[0], a[1]), VPED.at(b[0], b[1])), b]);

// ---- places to go to ----
type Spot = { kind: string, name: string, p: P2, w: number, h?: number, house?: House, field?: any, seat?: any };
const SPOTS: Spot[] = [];
const spot = (kind: string, name: string, p: P2, w = 1, o: Partial<Spot> = {}) => { const s = { kind, name, p, w, ...o }; SPOTS.push(s); return s; };
for (const h of HOUSES) spot(h.kind === 'cottage' ? 'home' : h.kind, h.id, h.at, h.kind === 'cottage' ? h.people / 3 : 1, { house:h });
const FIELD_DOORS: Record<string, P2> = { 'North Field':[1645, 35], 'the hay meadow':[1690, 35], 'the vegetable plots':[1716, 31], 'the allotments':[1668, 81] };
for (const f of VIL.fields) if (FIELD_DOORS[f.id]) spot('field', f.id, FIELD_DOORS[f.id], 1.2, { field:f });
for (let y = 137.5; y <= 200; y += 14) { spot('orchard', 'the orchard', [1697.4, y], 1, { h:Math.PI }); spot('orchard', 'the orchard', [1702.6, y + 7], 1, { h:0 }); }
for (const x of [1636.5, 1650.5, 1664.5]) spot('orchard', 'the orchard', [x, 229.6], 1, { h:-Math.PI / 2 });
spot('pens', 'the sheep pen', [1637, 150.8], 0.6, { h:Math.PI / 2 }); spot('pens', 'the cow paddock', [1663, 152.2], 0.6, { h:-Math.PI / 2 });
spot('pens', 'the pig sty', [1655, 151.2], 0.6, { h:Math.PI / 2 }); spot('pens', 'the hen run', [1668, 151.2], 0.6, { h:Math.PI / 2 });
spot('pens', 'the horses\' paddock', [1641, 171.4], 0.4, { h:Math.PI / 2 });
spot('apples', 'the apple store', [1742.2, 221], 0.6, { h:Math.PI });
spot('pond', 'the millpond', [1623.4, 44], 0.5, { h:0 });
const BARN_DOOR: P2 = [1635, 147.6];
spot('barn', 'the barn', BARN_DOOR, 1);
const SEATS = [[1803, 141], [1829, 141], [1820, 158.5]].flatMap(([x, y]) => [-0.5, 0.5].map(k => ({ at:[x + k, y + (y > 150 ? 0.4 : -0.4)], h:y > 150 ? -Math.PI / 2 : Math.PI / 2, z:0.45, by:null as any })));
for (const s of SEATS) spot('green', 'the green', s.at, 0.5, { seat:s });
for (const p of [[1806, 145], [1822, 155], [1832, 146]]) spot('green', 'the green', p, 0.6);
for (const [x, y] of VIL.stalls) spot('market', 'the market', [x + 3.4, y], 1, { h:Math.PI });
for (const e of [[1823.6, 110.5], [1823.6, 129.5]]) spot('station', 'Millbrook station', e, 0.8);
const COUNTS = { crates:0, rows:0, fed:0, pints:0, visitors:0 };
const PUB = HOUSES.find(h => h.kind === 'pub')!, STORE = HOUSES.find(h => h.kind === 'store')!;
// where to go next. Farm hands work the fields, the orchard and the pens from first light, break for dinner at midday
// and go in at dusk (they come and go by the barn); villagers keep to the village: the green, the market, the store,
// the Plough in the evening, home at night; visitors off the metro see the green, the market and the inn and go back.
// Nearer places are likelier: a day here is six minutes, and a walk across the vale would take the best part of it.
type Role = 'farm' | 'village' | 'visitor';
function nextSpot(from: Spot | null, role: Role, at: P2, avoid?: string) {
  const h = hourAt(sim.t), work = h >= 5.5 && h < 11.5 || h >= 13.5 && h < 18.5, late = h >= 13.5 && h < 18.5, eve = h >= 18 && h < 23, dinner = h >= 11.5 && h < 13.5, dark = h >= 23 || h < 5.5;
  const pubOpen = h >= 11 && h < 23, storeOpen = h >= 7 && h < 19, market = h >= 8 && h < 18;
  const Wt: Record<string, number> = role === 'visitor' ? { green:3, market:market ? 4 : 0, pub:pubOpen ? 3 : 0, store:storeOpen ? 1 : 0, station:2.4 }
    : role === 'farm' ? { barn:work ? 0.15 : 8, field:work ? 3 : 0, orchard:work ? 3.5 : 0, pens:work ? 1.4 : 0.3, apples:late ? 0.8 : 0.2, pond:work ? 0.3 : 0 }
    : { home:dark ? 6 : dinner ? 3 : eve ? 1.2 : 0.5, green:eve ? 2.5 : 1, market:market ? 1.5 : 0, pub:pubOpen ? (eve ? 3 : 0.6) : 0, store:storeOpen ? 1 : 0, station:dark ? 0.1 : 0.8 };
  const pool = SPOTS.filter(s => s !== from && s.kind !== avoid && (Wt[s.kind] ?? 0) > 0 && !(s.seat && s.seat.by));
  const wt = (s: Spot) => s.w * Wt[s.kind] / (1 + dist(at, s.p) / 45);
  let r = rng() * pool.reduce((t, s) => t + wt(s), 0);
  for (const s of pool) if ((r -= wt(s)) <= 0) return s;
  return pool[0];
}
const FIRST = ['Tom', 'Mary', 'Jack', 'Ellen', 'Harry', 'Alice', 'George', 'Lucy', 'Will', 'Grace', 'Sam', 'Rose', 'Ben', 'Kate', 'Fred', 'Annie', 'Joe', 'Molly', 'Dan', 'Ivy'];
let vSeq = 0;
const WORK: Record<string, string> = { 'North Field':'checking the wheat', 'the hay meadow':'turning the hay', 'the vegetable plots':'hoeing the beans', 'the allotments':'weeding the allotment' };
const CHORE: Record<string, string> = { 'the sheep pen':'filling the sheep\'s trough', 'the cow paddock':'feeding the cows', 'the pig sty':'feeding the pigs', 'the hen run':'collecting the eggs', 'the horses\' paddock':'filling the horses\' hay rack' };
export class Villager extends Person {
  [k: string]: any;
  constructor(at: P2, role: Role, o: any = {}) {
    super({ look:'village', speed:rand(1.0, 1.35), x:at[0], y:at[1], ...o });
    this.role = role; this.visitor = role === 'visitor'; this.stops = 0; this.trip(o.to ?? nextSpot(null, role, at));
  }
  trip(to: Spot) { this.to = to; this.go(vRoute([this.x, this.y], to.p), this.carrying ? 'carrying apples to the store' : `walking to ${to.name}`).then((p: Villager) => p.arrive()); }
  next(avoid?: string) {
    this.stops++;
    if (this.visitor && this.stops > 2 + (this.id.length % 2)) { this.trip(SPOTS.find(s => s.kind === 'station')!); return; }
    this.trip(nextSpot(this.to, this.role, [this.x, this.y], avoid));
  }
  slow(to: P2, label: string, speed = 0.4) { this.steps.push({ do:'walk', to, label, speed }); return this; }
  // indoors for a while (the inn, the store): not drawn, then out again
  inside(t: number, label: string, after: () => void) { this.then((p: Villager) => { p.hidden = true; }).wait(t, label).then((p: Villager) => { p.hidden = false; after(); }); }
  arrive() {
    const t = this.to as Spot;
    switch (t.kind) {
      case 'home': if (t.house === this.home) { this.remove(); return; } this.next(); return;
      case 'barn': this.remove(); return;   // in at the barn: off home across the fields, out of sight
      case 'station': hooks.metroVisit(this, () => this.next('station')); return;
      case 'pub': this.inside(rand(20, 40), 'in the Plough', () => { COUNTS.pints++; this.next('pub'); }); return;
      case 'store': this.inside(rand(6, 12), 'in the store', () => this.next('store')); return;
      case 'field': {
        // into the field and along a row, slowly, and back
        const [x0, x1, y0, y1] = t.field.box, along = t.field.rows === 'x';
        const a = along ? [rand(x0 + 2, x1 - 12), Math.round(rand(y0 + 2, y1 - 2) / 1.6) * 1.6 + 0.3] : [rand(x0 + 2, x1 - 2), rand(y0 + 2, y1 - 12)];
        const b = along ? [a[0] + rand(6, 10), a[1]] : [a[0], a[1] + rand(6, 10)];
        this.walk([a], `walking into ${t.name}`).slow(b, WORK[t.name]).wait(rand(3, 6), WORK[t.name]).slow(a, WORK[t.name]).then(() => { COUNTS.rows++; })
          .walk([t.p]).then((p: Villager) => p.next('field'));
        return; }
      case 'orchard':
        if (this.visitor) { this.face(t.h ?? 0).wait(rand(5, 9), 'walking in the orchard').then((p: Villager) => p.next('orchard')); return; }
        this.face(t.h ?? 0).wait(rand(10, 18), 'picking apples').then((p: Villager) => { p.carrying = true; p.trip(SPOTS.find(s => s.kind === 'apples')!); });
        return;
      case 'apples':
        this.face(t.h ?? 0);
        if (this.carrying) { this.wait(2, 'stacking the crate').then((p: Villager) => { p.carrying = false; COUNTS.crates++; p.next('apples'); }); return; }
        this.wait(rand(8, 14), 'sorting apples').then((p: Villager) => p.next('apples')); return;
      case 'pens': this.face(t.h ?? 0).wait(rand(6, 10), CHORE[t.name]).then((p: Villager) => { COUNTS.fed++; p.next('pens'); }); return;
      case 'pond': this.face(t.h ?? 0).wait(6, 'feeding the ducks').then((p: Villager) => p.next('pond')); return;
      case 'market': this.face(t.h ?? 0).wait(rand(5, 10), `buying ${rng() < 0.5 ? 'apples' : 'vegetables'}`).then((p: Villager) => p.next('market')); return;
      case 'green':
        if (t.seat && !t.seat.by) { t.seat.by = this; this.face(t.seat.h).then((p: Villager) => p.sitOn(t.seat)).wait(rand(14, 30), 'sitting on the green').then((p: Villager) => { p.standUp(); p.next('green'); }); return; }
        this.wait(rand(10, 22), 'chatting on the green').then((p: Villager) => p.next('green')); return;
    }
    this.next();
  }
  status() { return this.label || 'in the village'; }
  info() {
    return { kind:this.visitor ? 'Visitor · Millbrook' : this.role === 'farm' ? 'Farm hand · Millbrook' : 'Villager · Millbrook', title:this.id, status:this.status(),
      rows:[['Home', this.home ? this.home.id : 'came on the metro'], ['Going to', this.to?.name ?? '—'], ...(this.carrying ? [['Carrying', 'a crate of apples'] as [string, string]] : [])] };
  }
}
export const VILLAGERS = () => sim.people.filter((p: any) => p instanceof Villager);
const COTTAGES = HOUSES.filter(h => h.kind === 'cottage');
const pickHouse = () => { let r = rng() * COTTAGES.reduce((t, h) => t + h.people, 0); for (const h of COTTAGES) if ((r -= h.people) <= 0) return h; return COTTAGES[0]; };
const nameFor = (h: House) => `${FIRST[(vSeq++ * 7) % FIRST.length]} ${h.family}`;
// in off the metro: a visitor (or someone coming home) at the station's foot
hooks.villageArrive = (from: any, o: any) => {
  COUNTS.visitors++;
  const home = COTTAGES.find(h => o.id?.endsWith(` ${h.family}`));
  return new Villager(from.p, home ? 'village' : 'visitor', { ...o, home, to:home ? SPOTS.find(s => s.house === home) : undefined });
};

// ---- animals ----
type Mode = 'pen' | 'follow' | 'graze' | 'trail';
const SPECIES: Record<string, { name: string, speed: number, proto?: THREE.Group, build: () => THREE.Group, pick: number, gap: number }> = {
  sheep:{ name:'Sheep', speed:1.6, build:buildSheep, pick:0.7, gap:1.1 }, cow:{ name:'Cow', speed:1.0, build:buildCow, pick:1.2, gap:2.2 },
  horse:{ name:'Horse', speed:1.6, build:buildHorse, pick:1.6, gap:2.2 }, pig:{ name:'Pig', speed:0.9, build:buildPig, pick:0.5, gap:1.1 }, hen:{ name:'Hen', speed:0.9, build:buildHen, pick:0.3, gap:0.5 } };
export class Animal {
  kind = 'animal'; id: string; sp: string; group: THREE.Group; groups: THREE.Group[]; pick: number[]; x: number; y: number; h = rand(0, 6.28); v = 0;
  mode: Mode = 'pen'; tx: number; ty: number; wait = rand(0, 6); graze = 0; bob = 0; area: number[]; hidden = false; herd: any;
  constructor(sp: string, id: string, area: number[], herd: any) {
    const S = SPECIES[sp]; S.proto ??= S.build();
    this.sp = sp; this.id = id; this.area = area; this.herd = herd;
    this.group = S.proto.clone(); this.group.userData.entity = this; this.groups = [this.group]; this.pick = [0, 0, S.pick]; scene.add(this.group);
    this.x = this.tx = rand(area[0] + 1.5, area[1] - 1.5); this.y = this.ty = rand(area[2] + 1.5, area[3] - 1.5); this.place();
  }
  // walk toward (tx, ty): turn, then go, slowing as it gets there; true once there
  steer(dt: number, speed: number) {
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    if (d < 0.15) { this.v = 0; return true; }
    const e = wrap(Math.atan2(dy, dx) - this.h); this.h += clamp(e, -3 * dt, 3 * dt);
    this.v = Math.abs(e) > 1.2 ? 0.2 : Math.min(speed, d * 1.2);
    this.x += Math.cos(this.h) * this.v * dt; this.y += Math.sin(this.h) * this.v * dt; return false;
  }
  update(dt: number, flock: Animal[]) {
    const S = SPECIES[this.sp];
    if (this.mode === 'pen' || this.mode === 'graze') {
      // wander about the pen (or the grazing ground), stopping to graze
      if ((this.wait -= dt) > 0) { this.v = 0; this.graze = 1; }
      else if (this.steer(dt, S.speed * 0.4)) { this.wait = rand(4, 14); const a = this.area;
        if (this.mode === 'graze') { const [cx, cy] = VIL.pasture; const ang = rand(0, 6.28), rr = rand(1.5, 9); this.tx = cx + Math.cos(ang) * rr * 0.6; this.ty = cy + Math.sin(ang) * rr; }
        else { this.tx = rand(a[0] + 1.2, a[1] - 1.2); this.ty = rand(a[2] + 1.2, a[3] - 1.2); } }
      else this.graze = 0;
    } else {
      const [tx, ty] = this.herd.slotFor(this); this.tx = tx; this.ty = ty; this.graze = 0;
      const d = Math.hypot(tx - this.x, ty - this.y); this.steer(dt, d > 6 ? S.speed * 1.3 : d > 1.5 ? S.speed : S.speed * 0.5);
    }
    // keep a little apart from the others
    for (const o of flock) if (o !== this) { const dx = this.x - o.x, dy = this.y - o.y, d = Math.hypot(dx, dy), m = S.gap;
      if (d > 0.01 && d < m) { this.x += dx / d * (m - d) * 0.5 * Math.min(1, dt * 4); this.y += dy / d * (m - d) * 0.5 * Math.min(1, dt * 4); } }
    if (this.v > 0.05) this.bob += dt * this.v * 6;
    this.place();
  }
  place() {
    const z = (zAt(this.x, this.y) as number) + (this.v > 0.05 ? Math.abs(Math.sin(this.bob)) * 0.05 : 0);
    pose(this.group, this.x, this.y, this.h, z); this.group.rotation.z = this.graze && this.v < 0.05 ? -0.2 : 0;
    this.group.visible = !FAR && !this.hidden;
  }
  info() {
    const S = SPECIES[this.sp], doing = this.mode === 'follow' || this.mode === 'trail' ? (this.v > 0.1 ? 'following' : 'standing') : this.v > 0.05 ? 'walking' : this.graze ? (this.sp === 'hen' ? 'pecking' : this.sp === 'pig' ? 'rooting' : 'grazing') : 'resting';
    return { kind:`${S.name} · Millbrook`, title:this.id, status:doing, rows:[['With', this.herd.name], ['Where', this.herd.where(this)], ['Speed', kmh(this.v)]] };
  }
  readout() { return `${this.id} · ${this.info().status}`.toLowerCase(); }
}

// a herd and whoever looks after it: the flock with its shepherd, the horses with their stable hand
function herd(name: string, place: string, area: number[], keeper: any) {
  const H: any = { name, area, animals:[] as Animal[], keeper, trail:[] as P2[], state:'in',
    at() { return keeper ? [keeper.x, keeper.y] : [(area[0] + area[1]) / 2, (area[2] + area[3]) / 2]; },
    where(a: Animal) { return inBox(a.x, a.y, area) ? `in ${place}` : a.mode === 'graze' ? 'grazing on the slope above the farm' : 'on the way'; },
    // the flock trails its shepherd in a loose crowd; the horses walk in line on their leader's footsteps
    slotFor(a: Animal) {
      const k = H.animals.indexOf(a), K = keeper!;
      if (a.mode === 'trail') return pointBack(H.trail, 3.4 * (k + 1));
      const c = Math.cos(K.h), s = Math.sin(K.h), back = 2.4 + Math.floor(k / 4) * 1.4 + (k % 2) * 0.4, side = (k % 4 - 1.5) * 1.15;
      return [K.x - c * back - s * side, K.y - s * back + c * side];
    },
    record() { const K = keeper!, t = H.trail; if (!t.length || dist(t[t.length - 1], [K.x, K.y]) > 0.4) { t.push([K.x, K.y]); if (t.length > 120) t.shift(); } },
    set(mode: Mode) { for (const a of H.animals) { a.mode = mode; a.wait = rand(0, 3); } },
  };
  return H;
}
// a point on a trail of footsteps, d metres back from its newest end
function pointBack(t: P2[], d: number): P2 {
  for (let i = t.length - 1; i > 0; i--) { const L = dist(t[i], t[i - 1]); if (d <= L) { const f = d / L; return [t[i][0] + (t[i - 1][0] - t[i][0]) * f, t[i][1] + (t[i - 1][1] - t[i][1]) * f]; } d -= L; }
  return t[0] ?? [0, 0];
}
// the shepherd and the stable hand: people with a day of their own
class Keeper extends Person {
  [k: string]: any;
  status() { return this.label || (this.hidden ? 'at home' : 'standing'); }
  info() { return { kind:`${this.job} · Millbrook`, title:this.id, status:this.status(), rows:[['Looks after', this.herd.name], ...(this.dog ? [['Dog', 'Bess, a border collie'] as [string, string]] : []), ['Home', this.home.id], ['Out today', this.outToday ? 'yes' : 'not yet']] }; }
}

export function buildVillageSys() {
  const g = buildVillage(); scene.add(g);
  // the mill wheel on the mill's south wall, turning in the race; the windpump's fan on its tower
  const wheel = buildMillWheel(); wheel.position.copy(W(VIL.wheel.c[0], VIL.wheel.c[1], VIL.wheel.z)); scene.add(wheel);
  const fan = buildWindFan(); fan.position.copy(W(VIL.windpump[0] + 0.3, VIL.windpump[1], 8.9)); scene.add(fan);
  const mill = { kind:'mill', id:'Millbrook Mill', groups:[wheel], pick:[0, 0, 2.6], turns:0,
    info() { return { kind:'Watermill · Millbrook', title:'Millbrook Mill', status:'the wheel turning', rows:[['Wheel', 'undershot, 5 m across'], ['Grinds', 'the north field\'s wheat'], ['Fed by', 'the millpond, and the beck off the hills']] }; },
    readout() { return 'millbrook mill · the wheel turning'; } };
  wheel.userData.entity = mill;

  // the shepherd (and his dog) with the flock; the stable hand with the horses; the cows; the pigs; the hens
  const fletcher = HOUSES.find(h => h.family === 'Fletcher')!, turner = HOUSES.find(h => h.family === 'Turner')!;
  // (they start and end their day at the barn: their cottages are across the vale)
  const shepherd = new Keeper({ look:'village', id:'John Fletcher', x:BARN_DOOR[0], y:BARN_DOOR[1], speed:1.15, job:'Shepherd', home:fletcher, dog:true }); shepherd.hidden = true;
  const groom = new Keeper({ look:'village', id:'Emma Turner', x:BARN_DOOR[0], y:BARN_DOOR[1], speed:1.35, job:'Stable hand', home:turner }); groom.hidden = true;
  const flock = herd('the flock', 'the sheep pen', VIL.sheep, shepherd), horses = herd('the horses', 'the paddock', VIL.horses, groom);
  const cows = herd('the cows', 'the paddock', VIL.cows, null), pigs = herd('the pigs', 'the sty', VIL.sty, null), hens = herd('the hens', 'the run', VIL.run, null);
  shepherd.herd = flock; groom.herd = horses;
  for (let k = 0; k < 11; k++) flock.animals.push(new Animal('sheep', `Ewe ${k + 1}`, VIL.sheep, flock));
  for (const n of ['Duchess', 'Captain', 'Willow']) horses.animals.push(new Animal('horse', n, VIL.horses, horses));
  for (const n of ['Daisy', 'Buttercup', 'Clover']) cows.animals.push(new Animal('cow', n, VIL.cows, cows));
  for (const n of ['Hamlet', 'Truffle', 'Pudding']) pigs.animals.push(new Animal('pig', n, VIL.sty, pigs));
  for (let k = 0; k < 7; k++) hens.animals.push(new Animal('hen', `Hen ${k + 1}`, VIL.run, hens));
  const herds = [flock, horses, cows, pigs, hens];

  // the shepherd's day: from his cottage before dawn, the flock out onto the slope above the farm, back before dusk
  const PASTURE = VIL.pasture, GATE = VIL.gates.sheep, INSIDE = [(VIL.sheep[0] + VIL.sheep[1]) / 2, (VIL.sheep[2] + VIL.sheep[3]) / 2];
  shepherd.think = () => {
    const h = hourAt(sim.t), out = h >= 4.5 && h < 17.5;
    if (flock.state === 'in' && out && !shepherd.outToday) {
      shepherd.hidden = false; shepherd.outToday = true; flock.state = 'leaving';
      shepherd.go(vRoute([shepherd.x, shepherd.y], GATE), 'walking to the sheep pen').walk([INSIDE], 'opening the pen')
        .then(() => { flock.set('follow'); }).walk([GATE]).go(vRoute(GATE, PASTURE).slice(1), 'taking the flock up onto the slope')
        .then(() => { flock.state = 'out'; flock.set('graze'); });
      return;
    }
    if (flock.state === 'out' && !out) {
      flock.state = 'returning'; flock.set('follow');
      shepherd.go(vRoute([shepherd.x, shepherd.y], GATE), 'bringing the flock home').walk([INSIDE], 'putting the flock in the pen')
        .then(() => { flock.set('pen'); flock.state = 'in'; }).walk([GATE]).go(vRoute(GATE, BARN_DOOR).slice(1), 'going in').then(() => { shepherd.hidden = true; });
      return;
    }
    // with the flock on the slope: a slow walk round it, a while leaning on his crook
    if (flock.state === 'out') { const a = rand(0, 6.28); shepherd.walk([[PASTURE[0] + 4 + Math.cos(a) * 3, PASTURE[1] + Math.sin(a) * 7]], 'watching the flock').wait(rand(8, 16), 'watching the flock'); return; }
    shepherd.wait(2);
  };
  // the stable hand: the horses out to the trough by the farm track in the morning, in line behind her, and back
  const HG = VIL.gates.horses, HIN = [(VIL.horses[0] + VIL.horses[1]) / 2, (VIL.horses[2] + VIL.horses[3]) / 2], DRINK: P2 = [VIL.trough[0] + 2.8, VIL.trough[1]];
  groom.think = () => {
    const h = hourAt(sim.t), slot = h >= 6 && h < 9 ? 1 : 0;
    if (slot && groom.done !== slot && horses.state === 'in') {
      groom.done = slot; groom.hidden = false; groom.outToday = true; horses.state = 'out'; horses.trail = [];
      groom.go(vRoute([groom.x, groom.y], HG), 'walking to the paddock').walk([HIN], 'haltering the horses').then(() => { horses.trail = [[HIN[0], HIN[1]]]; horses.set('trail'); })
        .walk([HG]).go(vRoute(HG, DRINK).slice(1), 'leading the horses to the trough').face(Math.PI).wait(12, 'watering the horses')
        .go(vRoute(DRINK, HG).slice(1), 'leading the horses back').walk([HIN], 'turning the horses out').then(() => { horses.set('pen'); horses.state = 'in'; })
        .walk([HG]).go(vRoute(HG, BARN_DOOR).slice(1), 'going in').then(() => { groom.hidden = true; });
      return;
    }
    groom.wait(2);
  };

  // ---- the tractor: from the barn to the long field, a lane at a time, and back ----
  const { lanes, x:[px0, px1], park } = VIL.plough, PP: P2[] = [park, [1621, 151], [1621, lanes[lanes.length - 1]]];
  const order = [...lanes].reverse(); order.forEach((y, k) => { const [a, b] = k % 2 ? [px1, px0] : [px0, px1]; PP.push([a, y], [b, y]); });
  PP.push([px0 - 9, order[order.length - 1]], [1621, 82], [1621, 151], park);
  const TPATH = new Path(PP, 3), laneEnd = order.map((y, k) => TPATH.project(k % 2 ? px0 : px1, y)), workFrom = TPATH.project(px0, order[0]), workTo = laneEnd[laneEnd.length - 1];
  const tg = buildFarmTractor(); scene.add(tg);
  const furrows = new THREE.Group(); furrows.name = 'furrows'; scene.add(furrows);
  const tractor: any = { kind:'tractor', id:'the tractor', groups:[tg], pick:[0.4, 0, 1.6], s:0, v:0, state:'parked', done:0, day:false, front:{ x:park[0], y:park[1], h:0 },
    redraw() {
      for (const c of [...furrows.children]) furrows.remove(c);
      if (!this.done) return; const p = new Part();
      for (let k = 0; k < this.done; k++) { const y = order[k];
        p.poly('road', [W(px0, y - 3, 0.025), W(px1, y - 3, 0.025), W(px1, y + 3, 0.025), W(px0, y + 3, 0.025)]);
        for (let d = -2.6; d <= 2.61; d += 0.65) p.seg('detail', W(px0, y + d, 0.04), W(px1, y + d, 0.04)); }
      furrows.add(p.build('furrowLines')); },
    place() { const a = TPATH.at(this.s); this.front = a; pose(tg, a.x, a.y, a.h, 0); tg.visible = !FAR; },
    update(dt: number) {
      const h = hourAt(sim.t);
      if (h < 4 && this.day) { this.day = false; this.done = 0; this.redraw(); }   // overnight the field is harrowed and sown
      if (this.state === 'parked') { this.v = 0; if (h >= 6 && h < 12 && !this.day) { this.day = true; this.state = 'out'; this.s = 0; } }
      else {
        const working = this.s >= workFrom && this.s < workTo, vT = working ? 3.4 : 5;
        this.v += clamp(vT - this.v, -2 * dt, 1.2 * dt); this.s += this.v * dt;
        while (this.done < order.length && this.s >= laneEnd[this.done]) { this.done++; COUNTS.rows++; this.redraw(); }
        if (this.s >= TPATH.length - 0.1) { this.s = TPATH.length - 0.1; this.state = 'parked'; this.v = 0; }
      }
      this.place();
    },
    status() { if (this.state === 'parked') return this.day ? 'done for the day · by the barn' : 'by the barn';
      const working = this.s >= workFrom && this.s < workTo; return working ? `ploughing · lane ${Math.min(order.length, this.done + 1)} of ${order.length}` : this.done ? 'going back to the barn' : 'going out to the long field'; },
    info() { return { kind:'Tractor · Millbrook', title:'the tractor', status:this.status(), bar:{ v:this.done, max:order.length, label:`${this.done} of ${order.length} lanes ploughed` },
      rows:[['Driver', 'Arthur Fairweather'], ['Field', 'the long field'], ['Plough', 'four furrows'], ['Speed', kmh(this.v)]] }; },
    readout() { return `the tractor · ${this.status()}`; },
    route() { if (this.state === 'parked') return null; return { path:TPATH, s:this.s, closed:false, next:null, stop:'the barn' }; } };
  tg.userData.entity = tractor; tractor.place();

  // ---- what a click on the village says ----
  const hr = () => hourAt(sim.t);
  const atHome = (house: House) => !VILLAGERS().some((v: any) => v.home === house) && !(shepherd.home === house && !shepherd.hidden) && !(groom.home === house && !groom.hidden);
  const fieldStatus = (f: any) => {
    if (f.crop === 'plough') return tractor.state !== 'parked' ? tractor.status() : tractor.done ? `ploughed · ${tractor.done} of ${order.length} lanes` : 'stubble, waiting for the plough';
    const n = VILLAGERS().filter((v: any) => v.to?.field === f && v.label === WORK[f.id]).length;
    return n ? `${n} at work` : f.crop === 'wheat' ? 'ripening' : f.crop === 'hay' ? 'baled, drying' : 'growing';
  };
  const station = () => STATIONS['Millbrook'];
  const inside = (house: House) => VILLAGERS().filter((v: any) => v.hidden && v.to?.house === house).length;
  const PLACES: any[] = [
    ...HOUSES.map(house => ({ box:house.box, m:1, info:() => house.kind === 'pub'
      ? { kind:'Inn · Millbrook', title:'The Plough Inn', status:hr() >= 11 && hr() < 23 ? `open · ${inside(house)} in` : 'closed', rows:[['Landlord', 'Peter Kendall'], ['Hours', '11:00–23:00'], ['Served today', `${COUNTS.pints} pints`], ['Rooms', 'three, over the bar']] }
      : house.kind === 'store' ? { kind:'Shop · Millbrook', title:'Millbrook Stores', status:hr() >= 7 && hr() < 19 ? `open · ${inside(house)} in` : 'closed', rows:[['Keeps', 'the post office, bread, milk, papers'], ['Hours', '07:00–19:00'], ['Run by', 'the Pembrokes']] }
      : { kind:'Home · Millbrook', title:house.id, status:night() > 0.5 ? (atHome(house) ? 'lights on' : 'lights on · someone out') : atHome(house) ? 'everyone in' : 'out at work',
        rows:[['Family', `the ${house.family}s`], ['Household', `${house.people}`], ['Farms', house.farm], ['House', `${house.h > 4 ? 'two floors' : 'one floor'}, stone, a slate roof`]] } })),
    { box:VIL.green, info:() => ({ kind:'Village green · Millbrook', title:'the green', status:hr() >= 18 && hr() < 22.5 ? 'busy for the evening' : hr() >= 8 && hr() < 18 ? 'market day' : 'quiet',
      rows:[['The oak', 'about 300 years old'], ['Market', '3 stalls: apples, vegetables, honey'], ['People here', String(VILLAGERS().filter((v: any) => inBox(v.x, v.y, VIL.green)).length)],
        ['Next train', station()?.info().status ?? '—']] }) },
    { box:VIL.barn, info:() => ({ kind:'Barn · Millbrook', title:'the red barn', status:tractor.state === 'parked' ? 'tractor in the yard' : 'tractor out', rows:[['Holds', 'hay, feed, tools'], ['Silos', 'two, for the wheat']] }) },
    ...[[VIL.sheep, flock, 'the sheep pen'], [VIL.horses, horses, 'the horses\' paddock'], [VIL.cows, cows, 'the cow paddock'], [VIL.sty, pigs, 'the pig sty'], [VIL.run, hens, 'the hen run']].map(([box, H, name]: any) => ({ box, info:() => ({ kind:'Pen · Millbrook', title:name,
      status:`${H.animals.filter((a: Animal) => inBox(a.x, a.y, box, 0.5)).length} of ${H.animals.length} in`, rows:[['Animals', H.animals.map((a: Animal) => a.id).join(', ')], ...(H.keeper ? [['Kept by', H.keeper.id]] : []), ['Fed today', `${COUNTS.fed} times`]] }) })),
    { box:VIL.store, info:() => ({ kind:'Apple store · Millbrook', title:'Millbrook Orchards', status:`${COUNTS.crates} ${COUNTS.crates === 1 ? 'crate' : 'crates'} in today`, rows:[['Varieties', 'Cox, Bramley, Egremont Russet'], ['Goes to', 'the market in Sahel, by the morning train']] }) },
    { box:VIL.pond, m:3, info:() => ({ kind:'Millpond · Millbrook', title:'the millpond', status:'full', rows:[['Fed by', 'the beck off the hills'], ['Turns', 'Millbrook Mill\'s wheel'], ['Ducks', 'a family of mallards']] }) },
    { box:VIL.mill, info:() => mill.info() },
    ...VIL.fields.map(f => ({ box:f.box, info:() => ({ kind:'Field · Millbrook', title:f.id, status:fieldStatus(f), rows:[['Crop', f.crop === 'plough' ? 'wheat next, after ploughing' : f.crop === 'hay' ? 'hay, in round bales' : f.crop],
      ['Size', `${Math.round((f.box[1] - f.box[0]) * (f.box[3] - f.box[2]) / 100) / 10} thousand m²`]] }) })),
    ...VIL.orchard.map(b => ({ box:b, info:() => ({ kind:'Orchard · Millbrook', title:'the orchard', status:hr() >= 5.5 && hr() < 18.5 ? 'picking under way' : 'quiet',
      rows:[['Trees', 'about 160 apple trees'], ['Varieties', 'Cox, Bramley, Egremont Russet'], ['Crates today', String(COUNTS.crates)], ['Pickers out', String(VILLAGERS().filter((v: any) => v.label === 'picking apples').length)]] }) })),
  ];
  const village: any = { kind:'building', id:'Millbrook', groups:[g], pick:[1800, 150, 2],
    info() { const out = VILLAGERS().filter((v: any) => !v.visitor && !v.hidden).length;
      return { kind:'Village', title:'Millbrook', status:night() > 0.5 ? 'asleep but for the Plough' : hr() >= 11.5 && hr() < 13.5 ? 'home for dinner' : 'out in the fields',
        rows:[['Households', String(COTTAGES.length)], ['People', String(COTTAGES.reduce((t, h) => t + h.people, 0))], ['Out and about', String(out)], ['Visitors today', String(COUNTS.visitors)],
          ['Apples in today', `${COUNTS.crates} crates`], ['Rows worked today', String(COUNTS.rows)], ['Animals', `${flock.animals.length} sheep, 3 horses, 3 cows, 3 pigs, ${hens.animals.length} hens`]] }; },
    readout() { return 'millbrook'; },
    resolve(pt: THREE.Vector3) {
      const x = pt.x, y = pt.z; let best: any = null, bd = 2.5;
      for (const q of PLACES) { const [x0, x1, y0, y1] = q.box, m = q.m ?? 0, d = Math.hypot(Math.max(x0 - m - x, 0, x - x1 - m), Math.max(y0 - m - y, 0, y - y1 - m)); if (d < bd) { bd = d; best = q; } }
      if (!best) return this;
      if (!best.ent) best.ent = { kind:'building', id:best.info().title, groups:[g], pick:[(best.box[0] + best.box[1]) / 2, (best.box[2] + best.box[3]) / 2, 2], info:best.info, readout() { return `${this.id} · ${best.info().status}`.toLowerCase(); } };
      return best.ent;
    } };
  g.userData.entity = village;

  // the market's stall holders keep their stalls by day
  const holders = VIL.stalls.map(([x, y], k) => { const p: any = new Person({ look:'village', id:`${['Martha', 'Walter', 'Edith'][k]} Ashworth`, x:x - 2.2, y, h:0 });
    p.info = () => ({ kind:'Stall holder · Millbrook', title:p.id, status:p.hidden ? 'packed up' : 'selling', rows:[['Stall', ['apples', 'vegetables', 'honey and eggs'][k]], ['Home', 'Orchard View']] });
    p.status = () => p.hidden ? 'packed up' : 'selling'; return p; });
  const spawn = { t:0 }; let lastH = hourAt(sim.t);
  const animals = herds.flatMap(H => H.animals);
  return { group:g, village, mill, tractor, shepherd, groom, herds, animals, holders, villagers:VILLAGERS, counts:COUNTS,
    entities:() => [village, mill, tractor, shepherd, groom, ...animals, ...holders],
    // the view's level of detail has changed: the animals and machines show or hide with it
    detail() { for (const a of animals) a.place(); tractor.place(); wheel.visible = fan.visible = !FAR; },
    update(dt: number) {
      const h = hourAt(sim.t), dark = h >= 23 || h < 5.5;
      if (h < lastH) { COUNTS.crates = COUNTS.rows = COUNTS.fed = COUNTS.pints = COUNTS.visitors = 0; shepherd.outToday = groom.outToday = false; groom.done = 0; }
      lastH = h;
      // farm hands out of the barn in working hours; villagers out of their cottages by day and in the evening
      const work = h >= 5.5 && h < 11.5 || h >= 13.5 && h < 18.5, farmCap = work ? 9 : 0, vilCap = dark ? 2 : h >= 18 ? 12 : 9;
      if ((spawn.t -= dt) <= 0) { spawn.t = rand(1.2, 2.4);
        const vs = VILLAGERS(), farm = vs.filter((v: any) => v.role === 'farm').length, vil = vs.filter((v: any) => v.role === 'village').length;
        if (farm < farmCap && rng() < 0.6) { const house = pickHouse(); new Villager(BARN_DOOR, 'farm', { id:nameFor(house), home:house }); }
        else if (vil < vilCap) { const house = pickHouse(); new Villager(house.at, 'village', { id:nameFor(house), home:house }); } }
      for (const p of holders) p.hidden = h < 8 || h >= 18;
      for (const s of SEATS) if (s.by && !sim.people.includes(s.by)) s.by = null;
      // the mill wheel turns all day and night; the windpump's fan with the wind (faster in rain)
      wheel.rotation.z -= dt * 0.9; fan.rotation.x += dt * (hooks.raining() ? 4.5 : 2.6);
      wheel.visible = fan.visible = !FAR;
      flock.record(); horses.record();
      for (const H of herds) for (const a of H.animals) a.update(dt, H.animals);
      for (const a of hens.animals) a.hidden = night() > 0.6;   // the hens go in at dusk
      tractor.update(dt);
    } };
}
