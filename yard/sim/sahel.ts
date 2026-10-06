import * as THREE from 'three';
import { hooks, noop, scene } from '../shared';
import { W } from '../kernel/iso';
import { rand, rng } from '../kernel/math';
import { Site, dedupe } from '../kernel/graph';
import { Path } from '../kernel/path';
import { CITY, CURB, MARINA, RAB, WORLD } from '../layout';
import { hourAt, kmh, night, sim } from './core';
import { Car } from './cars';
import { Person } from './person';
import { roadVehicles, streetAt } from './roads';
import { buildSahelGround } from '../world/sahel';
import { BUILDINGS, PARK_SEATS, buildSahelBuildings } from '../world/towers';

// ---- Sahel: traffic, its people, and what a click on one of its buildings says ----
const L = CITY.lanes, X0 = WORLD.x0 - 8, X1 = WORLD.x1 + 8;

// Through traffic between the towns: in from the west along Riverside Rd, round the roundabout, out along its east arm
// and down the boulevard to the east edge; and the other way, giving way at the roundabout to what is already on it.
export const boxBusy = (v: any, x0: number, x1: number, y0: number, y1: number) =>
  roadVehicles().some((o: any) => o !== v && !o.parked && o.points.some(([x, y]: number[]) => x > x0 && x < x1 && y > y0 && y < y1));
export const THROUGH = {
  e:new Path([[X0, 134.5], [404, 134.5], [RAB.x, 143], [438, 134.5], [520, 134.5], [552, L.gE], [X1, L.gE]], 8),
  w:new Path([[X1, L.gW], [552, L.gW], [520, 127.5], [438, 127.5], [RAB.x, 119], [404, 127.5], [X0, 127.5]], 8),
  nextW:3,
};
const giveWayAtRoundabout = [{ s:THROUGH.w.project(441, 127.5), clear:(v: any) => !boxBusy(v, 423, 441, 129, 146) }];
export const throughWest = () => new Car({ path:THROUGH.w, yields:giveWayAtRoundabout, role:'through' });

// Sahel's own traffic: loops of right turns round its blocks, giving way where they join the boulevard or the Corniche
type Loop = { name: string, pts: number[][], n: number, yields: [number, number, number[]][], path?: Path, ys?: any[] };
const LOOPS: Loop[] = [
  { name:'round the Financial District', pts:[[820, 16.5], [876.5, 16.5], [876.5, L.gW], [763.5, L.gW], [763.5, 16.5], [820, 16.5]], n:2, yields:[[876.5, 109, [876, 932, 113, 124]]] },
  { name:'round the Arch', pts:[[700, 16.5], [756.5, 16.5], [756.5, L.gW], [643.5, L.gW], [643.5, 16.5], [700, 16.5]], n:2, yields:[[756.5, 109, [756, 812, 113, 124]]] },
  { name:'round Souq Sahel', pts:[[700, L.gE], [756.5, L.gE], [756.5, 201.5], [643.5, 201.5], [643.5, L.gE], [700, L.gE]], n:2, yields:[[643.5, 153, [592, 646, 138, 149]]] },
  { name:'round the mosque', pts:[[590, L.gE], [636.5, L.gE], [636.5, 201.5], [543.5, 201.5], [543.5, L.gE], [590, L.gE]], n:2, yields:[[543.5, 153, [500, 546, 129, 149]]] },
  { name:'round the Grand', pts:[[820, L.gE], [876.5, L.gE], [876.5, 201.5], [763.5, 201.5], [763.5, L.gE], [820, L.gE]], n:2, yields:[[763.5, 153, [712, 766, 138, 149]]] },
  { name:'round Wadi Park', pts:[[700, 208.5], [756.5, 208.5], [756.5, 263.5], [643.5, 263.5], [643.5, 208.5], [700, 208.5]], n:2, yields:[[756.5, 255, [756, 806, 258, 267]]] },
];
for (const lp of LOOPS) { const path = new Path(lp.pts, 6, true); lp.path = path; lp.ys = lp.yields.map(([x, y, b]) => ({ s:path.project(x, y), clear:(v: any) => !boxBusy(v, b[0], b[1], b[2], b[3]) })); }

// ---- Sahel's pavements: a ring round every block, crossings at the corners, the promenade, the marina's piers ----
const BL: number[][] = [[547, 633, 20, 115], [647, 753, 20, 115], [767, 873, 20, 115], [887, 960, 2, 115], [547, 633, 147, 198], [647, 753, 147, 198], [767, 873, 147, 198],
  [887, 960, 147, 260], [547, 633, 212, 260], [647, 753, 212, 260], [767, 873, 212, 260], [520, 533, 2, 115], [520, 533, 147, 260]];
const IN = 1.6, PROM = 276.5;
const CPED = (() => {
  const nodes: Record<string, number[]> = {}, segs: string[][] = [], key = (x: number, y: number) => { const k = `${x.toFixed(2)}|${y.toFixed(2)}`; nodes[k] = [x, y]; return k; };
  const sides = BL.map(([x0, x1, y0, y1]) => ({ xs:new Set([x0 + IN, x1 - IN]), ys:new Set([y0 + IN, y1 - IN]), b:[x0 + IN, x1 - IN, y0 + IN, y1 - IN] }));
  const link = (a: number[], b: number[]) => segs.push([key(a[0], a[1]), key(b[0], b[1])]);
  const within = (v: number, a: number, b: number) => v >= a - 1e-6 && v <= b + 1e-6;
  const crossings: number[][][] = [];
  BL.forEach((A, i) => BL.forEach((B, j) => {
    if (i === j) return;
    const a = sides[i].b, b = sides[j].b;
    if (B[0] - A[1] > 8 && B[0] - A[1] < 18) for (const y of new Set([a[2], a[3], b[2], b[3]])) if (within(y, a[2], a[3]) && within(y, b[2], b[3])) { crossings.push([[a[1], y], [b[0], y]]); sides[i].ys.add(y); sides[j].ys.add(y); }
    if (B[2] - A[3] > 8 && B[2] - A[3] < 36) for (const x of new Set([a[0], a[1], b[0], b[1]])) if (within(x, a[0], a[1]) && within(x, b[0], b[1])) { crossings.push([[x, a[3]], [x, b[2]]]); sides[i].xs.add(x); sides[j].xs.add(x); }
  }));
  // over the Corniche to the promenade from each corner of the blocks along it
  const promXs = new Set([520 + 4, MARINA.jetty[0] + 2.5, 958]);
  sides.forEach((s, i) => { if (BL[i][3] === 260) for (const x of [s.b[0], s.b[1]]) { crossings.push([[x, s.b[3]], [x, PROM]]); promXs.add(x); s.xs.add(x); } });
  for (const s of sides) {
    const [x0, x1, y0, y1] = s.b, xs = [...s.xs].sort((p, q) => p - q), ys = [...s.ys].sort((p, q) => p - q);
    for (const y of [y0, y1]) for (let k = 1; k < xs.length; k++) link([xs[k - 1], y], [xs[k], y]);
    for (const x of [x0, x1]) for (let k = 1; k < ys.length; k++) link([x, ys[k - 1]], [x, ys[k]]);
  }
  for (const [a, b] of crossings) link(a, b);
  const px = [...promXs].sort((p, q) => p - q); for (let k = 1; k < px.length; k++) link([px[k - 1], PROM], [px[k], PROM]);
  // the jetty and its fingers
  const jx = MARINA.jetty[0] + 2.5; let prev = [jx, PROM];
  for (const fy of MARINA.fingers) { link(prev, [jx, fy]); link([jx, fy], [575, fy]); link([jx, fy], [625, fy]); prev = [jx, fy]; }
  return new Site({ name:'Sahel pavements', nodes, segs });
})();
export const cityRoute = (a: number[], b: number[]) => dedupe([a, ...CPED.route(CPED.at(a[0], a[1]), CPED.at(b[0], b[1])), b]);

// places to come from and go to. Indoor ones (offices, flats, the hotel, the mall, the mosque) take people in; the
// rest keep them a while.
type Portal = { kind: string, name: string, p: number[], w: number, seat?: boolean };
export const CITY_PORTALS: Portal[] = [];
export const cportal = (kind: string, name: string, p: number[], w = 1) => { const q = { kind, name, p, w }; CITY_PORTALS.push(q); return q; };
for (const [n, p] of [['the green belt', [524, 200]], ['the promenade west', [524, PROM]], ['the east of the boulevard', [958, 113.4]], ['the east of the boulevard', [958, 148.6]]] as [string, number[]][])
  cportal('edge', n, p, 1.5);
const KIND: Record<string, string> = { Offices:'office', Flats:'home', Hotel:'hotel', 'Shopping centre':'mall', Mosque:'mosque', Library:'library', Park:'park' };
for (const b of BUILDINGS) {
  const k = Object.entries(KIND).find(([n]) => b.kind.startsWith(n))?.[1]; if (!k) continue;
  const [x0, x1, , y1] = b.box;
  cportal(k, b.id, k === 'park' ? [(x0 + x1) / 2, (b.box[2] + y1) / 2] : [(x0 + x1) / 2, y1 + 0.6], k === 'park' ? 2 : k === 'mall' ? 2 : 1);
}
for (const fy of MARINA.fingers) for (const x of [578, 622]) cportal('marina', 'Sahel Marina', [x, fy], 0.6);
for (const x of [530, 552, 574]) cportal('beach', 'the beach', [x, 287], 0.7);
const OUTDOORS = ['park', 'beach', 'marina'];
// the times of prayer, roughly, as the town's clock keeps them
export const PRAYERS: [string, number][] = [['Fajr', 4.75], ['Dhuhr', 12.0], ['Asr', 15.35], ['Maghrib', 18.1], ['Isha', 19.6]];
export const prayerNow = () => { const h = hourAt(sim.t); return PRAYERS.find(([, t]) => h >= t - 0.25 && h < t + 0.4); };
export function nextCity(from: Portal | null, avoid?: string) {
  const h = hourAt(sim.t), n = night() > 0.5, pool = CITY_PORTALS.filter(q => q !== from && q.kind !== avoid);
  const work = h > 7.5 && h < 18.5, mallOpen = h >= 10 && h < 23, pray = !!prayerNow();
  const wt = (q: Portal) => q.w * ({ office:work ? 2.2 : 0.2, home:n ? 3 : 1, hotel:1, mall:mallOpen ? 2 : 0, mosque:pray ? 5 : 0.3, library:h > 8 && h < 22 ? 0.8 : 0,
    park:n ? 0.15 : 1.4, beach:n ? 0.05 : 1.2, marina:n ? 0.2 : 1.0, edge:1, metro:n ? 0.6 : 1.6, brt:n ? 0.3 : 1.2 } as Record<string, number>)[q.kind] * (hooks.raining() && OUTDOORS.includes(q.kind) ? 0.08 : 1);
  let r = rng() * pool.reduce((s, q) => s + wt(q), 0);
  for (const q of pool) if ((r -= wt(q)) <= 0) return q;
  return pool[0];
}
const startCity = () => { const pool = CITY_PORTALS.filter(q => ['edge', 'home', 'office', 'hotel'].includes(q.kind)); return pool[Math.floor(rng() * pool.length)]; };
const SEATS = PARK_SEATS.map(([x, y, h]) => ({ at:[x, y], h, z:0.45, by:null as any }));
const NAMES_SAHEL = ['A. Al-Harbi', 'N. Al-Qahtani', 'S. Al-Otaibi', 'F. Al-Shehri', 'M. Al-Dosari', 'L. Haddad', 'R. Nasser', 'K. Al-Ghamdi', 'H. Saleh', 'Y. Al-Zahrani',
  'D. Farouk', 'J. Mansour', 'O. Khalil', 'T. Hamdan', 'W. Al-Mutairi', 'Z. Barakat', 'B. Yousef', 'I. Rahman', 'G. Kareem', 'E. Salem', 'P. Mendes', 'C. Lindqvist', 'V. Anand', 'U. Obi'];
let citizenSeq = 0;
export const CITIZENS = () => sim.people.filter((p: any) => p instanceof Citizen);
export class Citizen extends Person {
  [k: string]: any;
  constructor(from: Portal, to: Portal, o: any = {}) {
    super({ look:'sahel', id:NAMES_SAHEL[citizenSeq++ % NAMES_SAHEL.length], x:from.p[0], y:from.p[1], speed:rand(1.1, 1.45), from, ...o });
    this.trip(to);
  }
  trip(to: Portal) { this.to = to; this.go(cityRoute([this.x, this.y], to.p), `walking to ${to.name}`).then((p: Citizen) => p.arrive()); }
  arrive() {
    const t = this.to;
    if (t.kind === 'metro') { hooks.metroVisit(this, () => this.trip(nextCity(t, 'metro'))); return; }
    if (t.kind === 'brt') { hooks.brtVisit(this, () => this.trip(nextCity(t, 'brt'))); return; }
    if (!OUTDOORS.includes(t.kind)) { this.remove(); return; }   // indoors, or off the edge
    this.from = t;
    const seat = t.kind === 'park' && SEATS.filter(s => !s.by).sort((a, b) => Math.hypot(a.at[0] - this.x, a.at[1] - this.y) - Math.hypot(b.at[0] - this.x, b.at[1] - this.y))[0];
    if (seat) { seat.by = this; this.walk([seat.at]).face(seat.h).then((p: Citizen) => p.sitOn(seat)); }
    else if (t.kind === 'beach') this.face(Math.PI / 2).then((p: Citizen) => p.sitOn({ ground:true }));
    else this.face(t.kind === 'marina' ? (t.p[0] < 600 ? Math.PI : 0) : Math.PI / 2);
    this.wait(rand(14, 36), { park:'in Wadi Park', beach:'on the beach', marina:'looking at the yachts' }[t.kind as string] ?? 'out')
      .then((p: Citizen) => { p.standUp(); p.trip(nextCity(t, t.kind)); });
  }
  info() {
    return { kind:'Pedestrian · Sahel', title:this.id, status:this.status(), rows:[['From', this.from?.name ?? '—'], ['Going to', this.to.name], ['Street', streetAt(this.x, this.y)], ['Pace', kmh(this.speed)]] };
  }
  route() { const r: any = super.route(); if (r) r.stop = this.to.name; return r; }
}

// ---- what a click on a building says ----
const DISTRICT = (x: number, y: number) => y < CITY.blvd[0] ? 'the Financial District' : y < CITY.souq[1] ? 'the Souq quarter' : y < CITY.corniche[0] ? 'Wadi' : 'the waterfront';
function statusOf(b: any) {
  const h = hourAt(sim.t), lit = night() > 0.5;
  if (b.status) return b.status;
  if (b.kind.startsWith('Offices')) return h > 7.5 && h < 18.5 ? 'open · busy' : lit ? 'cleaners in · a few lights on' : 'closed';
  if (b.kind.startsWith('Flats')) return lit ? 'most lights on' : 'quiet';
  if (b.kind.startsWith('Hotel')) return lit ? 'lights on · evening' : 'guests out';
  if (b.kind.startsWith('Shopping')) return h >= 10 && h < 23 ? 'open' : 'closed';
  if (b.kind === 'Mosque') { const p = prayerNow(); if (p) return `${p[0]} prayer`;
    const nx = PRAYERS.find(([, t]) => t > h) ?? PRAYERS[0]; return `next prayer · ${nx[0]} at ${String(Math.floor(nx[1])).padStart(2, '0')}:${String(Math.round(nx[1] % 1 * 60)).padStart(2, '0')}`; }
  if (b.kind === 'Library') return h >= 8 && h < 22 ? 'open' : 'closed';
  if (b.kind === 'Park') return h > 5 && h < 24 ? 'open' : 'closed';
  return 'open';
}
function buildingEntity(b: any) {
  const [x0, x1, y0, y1, h] = b.box;
  return { kind:'building', id:b.id, groups:[], pick:[(x0 + x1) / 2, y1, h / 2], bbox:new THREE.Box3(W(x0, y0, 0), W(x1, y1, h + CURB)), b,
    info() { return { kind:`${b.kind} · Sahel`, title:b.id, status:statusOf(b), rows:[...b.rows, ['District', DISTRICT((x0 + x1) / 2, (y0 + y1) / 2)]] }; },
    readout() { return `${b.id} · ${statusOf(b)}`.toLowerCase(); } };
}

export function buildSahel() {
  const ground = buildSahelGround(); ground.traverse(o => { o.raycast = noop; }); scene.add(ground);
  const bg = buildSahelBuildings(); scene.add(bg);
  const ents = BUILDINGS.map(buildingEntity);
  // one part for every building: a click is resolved to the building whose footprint is nearest the point hit
  const city = { kind:'building', id:'Sahel', groups:[bg], pick:[740, 130, 10],
    resolve(pt: THREE.Vector3) { let best: any = null, bd = 6;
      for (const e of ents) { const [x0, x1, y0, y1] = e.b.box, d = Math.hypot(Math.max(x0 - pt.x, 0, pt.x - x1), Math.max(y0 - pt.z, 0, pt.z - y1)); if (d < bd) { bd = d; best = e; } }
      return best ?? this; },
    info() { return { kind:'City', title:'Sahel', status:night() > 0.5 ? 'lit up for the night' : 'busy', rows:[['Founded', '2019'], ['Towers', String(BUILDINGS.filter(b => b.box[4] > 45).length)], ['Tallest', 'Sahel Tower, 159 m']] }; },
    readout() { return 'sahel'; } };
  bg.userData.entity = city;
  // traffic: the loops, a car or two on each
  for (const lp of LOOPS) for (let k = 0; k < lp.n; k++) new Car({ role:'local', loop:lp, path:lp.path, yields:lp.ys, s:(k + rng() * 0.4) * lp.path!.length / lp.n, vmax:rand(9, 12) });
  const spawn = { t:0 };
  return { buildings:ents, city, citizens:CITIZENS,
    update(dt: number) {
      const late = night() > 0.5;
      if ((THROUGH.nextW -= dt) <= 0 && !boxBusy(null, X1 - 14, X1 + 2, L.gW - 3, L.gW + 3)) { throughWest(); THROUGH.nextW = late ? rand(12, 22) : rand(5, 9); }
      if ((spawn.t -= dt) <= 0) { spawn.t = rand(1.0, 2.0); if (CITIZENS().length < (late ? 8 : 22)) { const f = startCity(); new Citizen(f, nextCity(f)); } }
      for (const s of SEATS) if (s.by && !sim.people.includes(s.by)) s.by = null;
    } };
}
