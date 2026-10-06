import * as THREE from 'three';
import { hooks, noop, scene } from '../shared';
import { glow, pose } from '../kernel/part';
import { clamp, rand, rng } from '../kernel/math';
import { CURB, METRO, metroAt } from '../layout';
import { buildMetroCar } from '../models/metro';
import { CENTRAL, buildCentral, centralEsc } from '../world/central';
import { DOOR_US, Frame, buildStation, buildViaducts, crossV, levels, stationPlan, trackV } from '../world/metro';
import { clock, hourAt, kmh, night, sim } from './core';
import { FAR, Person } from './person';
import { Walker, nextPortal, portal } from './people';
import { Citizen, cportal, nextCity } from './sahel';

// ---- Sahel Metro: the trains, the stations, and the people who ride it ----
type Line = typeof METRO.lines[number];
type V3 = [number, number, number];
const LEN = METRO.cars * (METRO.car + METRO.gap) - METRO.gap, PITCH = METRO.car + METRO.gap;
const VMAX = 15, ACC = 0.9, DEC = 1.1;
const stopU = (st: any, dir: number) => dir > 0 ? st.u0 + 1.8 + LEN : st.u0 + 1.8;
const STYLE: Record<string, string> = { najdi:'walls pierced with Najdi triangles that glow at night', fins:'glass behind a screen of fins, a pleated roof', louvre:'glass behind louvres, a shallow vault for a roof',
  central:'a lattice of white dune-like shells, pierced with diamonds that light up after dark' };

// ---- stations ----
// One per stop; Sahel Central is one station on both lines. For each line it serves, an island: where its escalator
// climbs into it (an up lane and a down lane), where to wait, its benches, and the riders waiting there.
type Island = { line: Line, st: any, F: Frame, zc: number, zf: number, footU: number, topU: number, waits: number[][], seats: any[], waiting: Rider[] };
type Entry = { ground: V3, foot: V3, top: V3, land: V3 };
const lane = (isl: Island, u: number, up: boolean, z: number) => isl.F.at(u, up ? -0.65 : 0.65, z);
const offU = (isl: Island) => isl.topU + Math.sign(isl.topU - isl.footU) * 1.8;
// a walk along an island from (u, v) to (u, v), round the escalator's opening along the platform's edge if it is in the way
function islandWalk(isl: Island, a: number[], b: number[]): V3[] {
  const lo = Math.min(isl.footU, isl.topU) - 0.5, hi = Math.max(isl.footU, isl.topU) + 0.5, side = Math.sign(b[1] || a[1] || 1), edge = side * 2.25;
  const blocked = Math.min(a[0], b[0]) < hi && Math.max(a[0], b[0]) > lo;
  const pts = blocked ? [[a[0], edge], [b[0], edge], b] : [b];
  return pts.map(([u, v]) => isl.F.at(u, v, isl.zf));
}
export class MetroStation {
  kind = 'station'; id: string; groups: THREE.Group[] = []; pick: number[]; islands: Record<number, Island> = {}; entries: Entry[] = []; gates: V3[] = [];
  central: boolean; style: string; entered = 0; left = 0; peek: any;
  constructor(id: string, central: boolean, style: string) { this.id = id; this.central = central; this.style = style; this.pick = [0, 0, 0]; }
  lines() { return Object.values(this.islands).map(i => i.line); }
  waitingCount() { return Object.values(this.islands).reduce((n, i) => n + i.waiting.length, 0); }
  info() {
    const rows: [string, string][] = [['Lines', this.lines().map(l => `${l.name} (${l.colour})`).join(' · ')]];
    for (const isl of Object.values(this.islands)) for (const dir of [1, -1]) { const to = terminusOf(isl.line, dir); if (to === this.id) continue; rows.push([`${isl.line.name} to ${to}`, etaText(this, isl.line, dir)]); }
    rows.push(['Waiting on the platforms', String(this.waitingCount())], ['Through the gates today', `${this.entered} in · ${this.left} out`],
      ['Platforms', this.central ? 'two islands, one above the other, 58 m, screen doors' : 'an island, 58 m, screen doors'], ['The building', STYLE[this.central ? 'central' : this.style]]);
    return { kind:this.central ? 'Metro interchange · Lines 1 and 2' : `Metro station · ${this.lines()[0].name}`, title:this.id, status:nextText(this), rows,
      actions:[['Look inside', () => hooks.lookInside(this)]] };
  }
  readout() { return `${this.id} station · ${nextText(this)}`.toLowerCase(); }
}
export const STATIONS: Record<string, MetroStation> = {};
const terminusOf = (line: Line, dir: number) => dir > 0 ? line.stations[line.stations.length - 1].id : line.stations[0].id;

// ---- trains ----
type Pax = { id: string, look: string, hops: Hop[], t0: number, origin?: string, followed?: boolean };
type Hop = { line: Line, dir: number, from: string, to: string };
const trainSeq: Record<number, number> = {}; let PROTOS: THREE.Group[][] | null = null;
export class MetroTrain {
  kind = 'metro'; id: string; line: Line; s: number; dir: number; v = 0; state = 'run'; t = 0; doors = 0; side = 0; xover: number[] | null = null;
  cars: THREE.Group[] = []; lites: THREE.Group[] = []; groups: THREE.Group[] = []; pick = [-6, 0, 3]; pax: Pax[] = []; crowd: number; trips = 0; carried = 0;
  at: MetroStation | null = null; stopI = 0; front = { x:0, y:0, h:0 }; points: number[][] = []; doorParts: [THREE.Object3D, number, boolean][] = []; scanT = 0;
  constructor(line: Line, s: number, dir: number, crowd: number) {
    this.line = line; this.s = s; this.dir = dir; this.crowd = crowd; this.side = dir; this.id = `M${line.id}-${line.id}0${trainSeq[line.id] = (trainSeq[line.id] ?? 0) + 1}`;
    PROTOS ??= [[buildMetroCar('front'), buildMetroCar(null), buildMetroCar(null), buildMetroCar('rear')], [buildMetroCar('front', true), buildMetroCar(null, true), buildMetroCar(null, true), buildMetroCar('rear', true)]];
    for (let i = 0; i < METRO.cars; i++) { const g = PROTOS[0][i].clone(), l = PROTOS[1][i].clone(); g.userData.entity = this; l.userData.entity = this; scene.add(g, l); this.cars.push(g); this.lites.push(l);
      for (const [n, k] of [['doorways', 0], ['doorsF', 1], ['doorsB', -1]] as [string, number][]) for (const tag of ['', 'R']) this.doorParts.push([g.getObjectByName(n + tag)!, k, tag === 'R']); }
    this.groups = [...this.cars, ...this.lites];
    this.stopI = this.nextStopIndex();
    this.place();
  }
  // the stops this way, in order; the one it is heading for next
  stops() { const st = this.line.stations; return this.dir > 0 ? st : [...st].reverse(); }
  nextStopIndex() { const ss = this.stops(); return Math.max(0, ss.findIndex(st => (stopU(st, this.dir) - this.s) * this.dir > 0.5)); }
  nextStop() { return this.stops()[this.stopI]; }
  // across the line at u: on its own track, or through a crossover after turning back
  vAt(u: number) { return this.xover ? crossV(this.line, this.xover, u) : this.side * trackV(this.line, u); }
  place() {
    const F = new Frame(this.line), { zr } = levels(this.line), far = FAR;
    this.points = [];
    for (let i = 0; i < METRO.cars; i++) {
      const uf = this.s - this.dir * i * PITCH, ur = uf - this.dir * METRO.car;
      const a = F.at(uf, this.vAt(uf)), b = F.at(ur, this.vAt(ur)), h = Math.atan2(a[1] - b[1], a[0] - b[0]);
      for (const g of [this.cars[i], this.lites[i]]) pose(g, a[0], a[1], h, zr);
      this.cars[i].visible = !far; this.lites[i].visible = far;
      if (i === 0) this.front = { x:a[0], y:a[1], h };
      this.points.push([a[0], a[1]], [b[0], b[1]]);
    }
    // the doors on the island's side: the left, unless it has just turned back
    const open = this.doors > 0.001 && !far, right = this.side === -this.dir, k = 0.68 * this.doors;
    for (const [o, dir, r] of this.doorParts) { o.visible = open && r === right; o.position.x = dir * k; }
  }
  // the screen doors of the platform it stands at, opened as far as its own
  psd(open: number) {
    const st = this.at; if (!st) return; const pk = st.peek, F = new Frame(this.line), sgn = this.side, base = `${st.central ? `L${this.line.id}` : ''}psd${sgn}`;
    for (const [n, k] of [['F', 1], ['B', -1]] as [string, number][]) { const o = pk.doors[base + n]; if (!o) continue;
      const d = F.at(k * 0.75 * open, 0), o0 = F.at(0, 0); o.position.set(d[0] - o0[0], 0, d[1] - o0[1]); }
  }
  update(dt: number) {
    this.t += dt;
    if (this.state === 'run' || this.state === 'hold') {
      const st = this.nextStop(), stop = stopU(st, this.dir);
      let room = (stop - this.s) * this.dir;
      // signals: at the end of the line only one train at a time in the station and over its crossover; on the way, keep
      // a train's length and more behind the one ahead on the same track
      const hold = this.holdPoint(); if (hold !== null) room = Math.min(room, (hold - this.s) * this.dir);
      for (const o of TRAINS) if (o !== this && o.line === this.line && o.dir === this.dir && (o.s - this.s) * this.dir > 0) room = Math.min(room, (o.s - this.s) * this.dir - LEN - 40);
      this.state = hold !== null && room < 1 ? 'hold' : 'run';
      const vmax = this.xover || Math.abs(this.vAt(this.s)) > METRO.track + 0.2 ? 9 : VMAX;
      const vT = Math.min(vmax, Math.sqrt(2 * DEC * Math.max(0, room)));
      this.v = vT < this.v ? Math.max(vT, this.v - DEC * 1.6 * dt) : Math.min(vT, this.v + ACC * dt);
      this.s += this.dir * this.v * dt;
      if ((stop - this.s) * this.dir < 0.05 && this.v < 0.4) { this.s = stop; this.v = 0; this.arrive(STATIONS[st.id]); }
      if (this.xover && (this.s - this.dir * LEN - (this.dir > 0 ? this.xover[1] + 1 : this.xover[0] - 1)) * this.dir > 0) { this.xover = null; this.side = this.dir; }
    } else this.dwell(dt);
    this.place();
  }
  // where it must wait for the way into the end of the line to be clear (no other train standing there or crossing over
  // on its way out), if it must
  holdPoint() {
    const ss = this.stops(), st = this.nextStop(); if (st !== ss[ss.length - 1]) return null;
    const xo = this.dir > 0 ? this.line.xovers[this.line.xovers.length - 1] : this.line.xovers[0], sig = this.dir > 0 ? xo[0] - 8 : xo[1] + 8;
    if ((sig - this.s) * this.dir < -1) return null;
    return TRAINS.some(o => o !== this && o.line === this.line && (o.at === STATIONS[st.id] || o.xover === xo)) ? sig : null;
  }
  arrive(st: MetroStation) { this.at = st; this.state = 'opening'; this.t = 0; this.trips++; this.crowd = clamp(Math.round(this.crowd + rand(-28, 30) * (night() > 0.5 ? 0.4 : 1)), 6, 380); }
  // at a platform: doors open, those for here get off, the train turns back if this is the end of the line, those
  // waiting get on, doors close, away
  dwell(dt: number) {
    const st = this.at!, isl = st.islands[this.line.id];
    if (this.state === 'opening') { this.doors = Math.min(1, this.doors + dt / 1.6); this.psd(this.doors); if (this.doors >= 1) { this.state = 'alight'; this.t = 0; this.alight(st, isl); } return; }
    if (this.state === 'alight') { if (this.t > 4.5) { if (st.id === terminusOf(this.line, this.dir)) this.turnBack(); this.state = 'board'; this.t = 0; this.scanT = 0; } return; }
    if (this.state === 'board') {
      if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.boardStart(isl); }   // anyone who has come up the escalator since
      const coming = isl.waiting.some(r => r.boarding === this), atEnd = st.id === terminusOf(this.line, -this.dir);
      if (this.t > (atEnd ? 14 : 7) && !coming || this.t > 22) { this.state = 'closing'; this.t = 0; for (const r of [...isl.waiting]) if (r.boarding === this) r.missed(); }
      return; }
    if (this.state === 'closing') { this.doors = Math.max(0, this.doors - dt / 1.6); this.psd(this.doors); if (this.doors <= 0) { this.at = null; this.state = 'run'; this.stopI = this.nextStopIndex(); } }
  }
  turnBack() {
    this.s -= this.dir * LEN; this.dir = -this.dir;   // the far end leads now: the train is the same either way round
    this.xover = this.dir > 0 ? this.line.xovers[0] : this.line.xovers[this.line.xovers.length - 1];
    this.stopI = this.nextStopIndex();
  }
  // the doors along the island where this train stands, in the island's (u, v)
  doorSpots(isl: Island) { return DOOR_US.map(u => [isl.st.u0 + u, this.side * (METRO.island - 0.45)]); }
  alight(st: MetroStation, isl: Island) {
    const spots = this.doorSpots(isl);
    for (const p of [...this.pax]) { const leg = p.hops[0]; if (leg.to !== st.id) continue;
      this.pax.splice(this.pax.indexOf(p), 1); p.hops.shift();
      const [u, v] = spots[Math.floor(rng() * spots.length)], at = isl.F.at(u, v, isl.zf);
      const r = new Rider({ id:p.id, look:p.look, x:at[0], y:at[1], lz:at[2], h:this.front.h, hops:p.hops, station:st, t0:p.t0, origin:p.origin });
      if (p.followed && hooks.isSelected(this)) hooks.handOff(this, r);
      r.offTrain(isl, [u, v]); }
  }
  boardStart(isl: Island) {
    const spots = this.doorSpots(isl), dirTo = terminusOf(this.line, this.dir);
    for (const r of isl.waiting) if (!r.boarding && r.hops[0] && r.hops[0].line === this.line && terminusOf(r.hops[0].line, r.hops[0].dir) === dirTo) {
      const me = isl.F.uv(r.x, r.y), d = spots.reduce((b, q) => Math.abs(q[0] - me[0]) < Math.abs(b[0] - me[0]) ? q : b, spots[0]);
      r.toTrain(this, isl, me, d); }
  }
  board(r: Rider) {
    const isl = this.at!.islands[this.line.id]; isl.waiting.splice(isl.waiting.indexOf(r), 1);
    const followed = hooks.isSelected(r); this.pax.push({ id:r.id, look:r.look, hops:r.hops, t0:r.t0, origin:r.origin, followed }); this.carried++;
    if (followed) hooks.handOff(r, this);
    r.remove();
  }
  aboard() { return this.pax.length + this.crowd; }
  status() {
    if (this.state === 'run') return `to ${terminusOf(this.line, this.dir)} · ${kmh(this.v)}`;
    if (this.state === 'hold') return 'waiting at a signal';
    return `at ${this.at!.id} · ${{ opening:'doors opening', alight:'doors open', board:'boarding', closing:'doors closing' }[this.state]}`;
  }
  info() {
    const next = this.at ? this.at.id : this.nextStop().id;
    return { kind:`Metro · ${this.line.name} (${this.line.colour})`, title:this.id, status:this.status(), bar:{ v:this.aboard(), max:520, label:`${this.aboard()} aboard · room for 520` },
      rows:[['Towards', terminusOf(this.line, this.dir)], [this.at ? 'At' : 'Next station', next], ['Speed', kmh(this.v)], ['Cars', '4 · driverless, fully automatic'],
        ['Classes', 'first, family and single'], ['Stops made', String(this.trips)], ['Riders followed', `${this.pax.length} aboard · ${this.carried} so far`]] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  route() { const st = this.nextStop(), end = stopU(st, this.dir), a = metroAt(this.line, this.s, this.vAt(this.s)), b = metroAt(this.line, end, this.side * trackV(this.line, end));
    return { pts:[[a[0], a[1]], [b[0], b[1]]], next:[b[0], b[1]], stop:st.id }; }
}
export const TRAINS: MetroTrain[] = [];

// ---- when the next trains come ----
function etaOf(st: MetroStation, line: Line, dir: number) {
  let best = Infinity;
  for (const tr of TRAINS) { if (tr.line !== line) continue;
    if (tr.at === st && tr.dir === dir) return 0;
    // the way it still has to go to stand at this station heading dir: on to the end of the line and back if need be
    const here = line.stations.find(s => s.id === st.id)!, target = stopU(here, dir);
    let d: number, stops: number;
    if (tr.dir === dir && (target - tr.s) * dir >= 0) { d = (target - tr.s) * dir; stops = line.stations.filter(s => (stopU(s, dir) - tr.s) * dir > 0.5 && (target - stopU(s, dir)) * dir > 0.5).length; }
    else { const end = stopU(tr.dir > 0 ? line.stations[line.stations.length - 1] : line.stations[0], tr.dir); d = Math.abs(end - tr.s) + LEN + Math.abs(target - (end - tr.dir * LEN)); stops = line.stations.length; }
    best = Math.min(best, d / 10 + stops * 20 + (tr.at ? 12 : 0));
  }
  return best;
}
function etaText(st: MetroStation, line: Line, dir: number) {
  const e = etaOf(st, line, dir); if (e === 0) return 'at the platform'; if (e < 12) return 'arriving';
  return e === Infinity ? '—' : `in ${Math.floor(e / 60)}:${String(Math.round(e % 60)).padStart(2, '0')}`;
}
function nextText(st: MetroStation) {
  let best: [number, Line, number] | null = null;
  for (const isl of Object.values(st.islands)) for (const dir of [1, -1]) { if (terminusOf(isl.line, dir) === st.id) continue; const e = etaOf(st, isl.line, dir); if (!best || e < best[0]) best = [e, isl.line, dir]; }
  if (!best) return 'closed';
  const [e, line, dir] = best, to = terminusOf(line, dir);
  return e === 0 ? `${line.name} to ${to} at the platform` : e < 12 ? `${line.name} to ${to} arriving` : `next ${line.name} to ${to} ${etaText(st, line, dir)}`;
}

// ---- riders: people inside the metro, from the street door to the train and from the train out again ----
const ROUTE: Record<string, Record<number, number>> = {};   // station → line → index along it
for (const l of METRO.lines) l.stations.forEach((s, i) => { (ROUTE[s.id] ??= {})[l.id] = i; });
function hopsFor(from: string, to: string): Hop[] {
  const common = METRO.lines.find(l => ROUTE[from][l.id] !== undefined && ROUTE[to][l.id] !== undefined);
  if (common) return [{ line:common, dir:ROUTE[to][common.id] > ROUTE[from][common.id] ? 1 : -1, from, to }];
  const la = METRO.lines.find(l => ROUTE[from][l.id] !== undefined)!, lb = METRO.lines.find(l => ROUTE[to][l.id] !== undefined)!, X = 'Sahel Central';
  return [...hopsFor(from, X).map(g => ({ ...g, line:la })), ...hopsFor(X, to).map(g => ({ ...g, line:lb }))];
}
export const RIDERS = () => sim.people.filter((p: any) => p instanceof Rider);
let riderCap = 44;
export class Rider extends Person {
  [k: string]: any;
  constructor(o: any) { super({ speed:rand(1.15, 1.45), ...o }); }
  // in from the street: up to the concourse, through the gates, up into the island, to a place to wait
  enter(st: MetroStation) {
    this.station = st; st.entered++;
    const isl = st.islands[this.hops[0].line.id], e = nearest(st.entries, [this.x, this.y], q => q.ground), gate = nearest(st.gates, e.land, q => q);
    this.walk([[e.ground[0], e.ground[1]], [e.foot[0], e.foot[1]]], `into ${st.id} station`).walk([e.top], 'up the escalator', true)
      .walk([e.land, gate], 'through the gates').walk([lane(isl, isl.footU, true, isl.zc)], `to the ${isl.line.name} platform`)
      .walk([lane(isl, isl.topU, true, isl.zf)], 'up the escalator', true).walk([isl.F.at(offU(isl), 0, isl.zf)]).then((p: Rider) => p.waitFor(isl));
  }
  waitFor(isl: Island) {
    isl.waiting.push(this); this.boarding = null; this.ready = false;
    // a free place to stand, one of the nearer ones: most people wait close to where they came up
    const me = isl.F.uv(this.x, this.y), free = isl.waits.filter(w => !isl.waiting.some(r => r !== this && r.spot === w)).sort((a, b) => Math.abs(a[4] - me[0]) - Math.abs(b[4] - me[0]));
    const w = free.length ? free[Math.floor(rng() * Math.min(free.length, 10))] : isl.waits[0];
    this.spot = w;
    const seat = rng() < 0.4 && isl.seats.find(s => !s.by), label = `waiting for ${this.toward()}`;
    if (seat) { seat.by = this; this.walk(islandWalk(isl, me, [seat.u, seat.v]), label).face(seat.h).then((p: Rider) => { p.sitOn(seat); p.ready = true; }); }
    else this.walk(islandWalk(isl, me, [w[4], w[5]]), label).face(w[3]).then((p: Rider) => { p.ready = true; });
    this.wait(1e6, label);
  }
  toward() { const g = this.hops[0]; return `${g.line.name} to ${terminusOf(g.line, g.dir)}`; }
  toTrain(tr: MetroTrain, isl: Island, me: number[], door: number[]) {
    this.boarding = tr; this.standUp(); this.steps = [];
    this.walk(islandWalk(isl, me, door), `boarding ${tr.id}`).then((p: Rider) => { if (p.boarding?.state === 'board') p.boarding.board(p); else p.missed(); });
  }
  missed() { this.boarding = null; this.steps = []; const isl = this.station.islands[this.hops[0].line.id]; isl.waiting.splice(isl.waiting.indexOf(this), 1); this.waitFor(isl); }
  // off a train: on to the next line through the concourse, or down and out to the street
  offTrain(isl: Island, at: number[]) {
    const st = this.station as MetroStation;
    this.walk([...islandWalk(isl, at, [offU(isl), 0.65]), lane(isl, isl.topU, false, isl.zf)], 'off the train').walk([lane(isl, isl.footU, false, isl.zc)], 'down the escalator', true);
    if (this.hops.length) { const nx = st.islands[this.hops[0].line.id];
      this.walk([CENTRAL_MID, lane(nx, nx.footU, true, nx.zc)], `changing to ${this.hops[0].line.name}`).walk([lane(nx, nx.topU, true, nx.zf)], 'up the escalator', true)
        .walk([nx.F.at(offU(nx), 0, nx.zf)]).then((p: Rider) => p.waitFor(nx)); return; }
    const e = st.entries[Math.floor(rng() * st.entries.length)], gate = nearest(st.gates, e.land, q => q); st.left++;
    this.walk([gate, e.land, e.top], 'out through the gates').walk([e.foot], 'down to the street', true)
      .then((p: Rider) => { p.lz = undefined; }).walk([[e.ground[0], e.ground[1]]]).then((p: Rider) => p.outside(st, e));
  }
  // back on the street: a walker in the old town, one of Sahel's people in Sahel
  outside(st: MetroStation, e: Entry) {
    const from = { kind:'metro', name:`${st.id} station`, p:[e.ground[0], e.ground[1]], w:1 }, o = { id:this.id, look:this.look };
    const p = st.id === 'Market St' ? new Walker(from, nextPortal(from, 'metro'), o) : new Citizen(from as any, nextCity(from as any, 'metro'), o);
    hooks.handOff(this, p); this.remove();
  }
  status() { return this.label || 'in the station'; }
  info() {
    const g = this.hops[0], dest = this.hops.length ? this.hops[this.hops.length - 1].to : this.station.id;
    return { kind:'Metro rider', title:this.id, status:this.status(), rows:[['From', this.origin ?? '—'], ['To', dest], ...(g ? [['Line', `${g.line.name} to ${terminusOf(g.line, g.dir)}`] as [string, string]] : []),
      ...(this.hops.length > 1 ? [['Changing at', this.hops[0].to] as [string, string]] : []), ['Set out', clock(this.t0)]] };
  }
}
const CENTRAL_MID: V3 = [650, 196, CENTRAL.z];
function nearest<T>(list: T[], p: number[], get: (q: T) => number[]) { return list.reduce((b, q) => Math.hypot(get(q)[0] - p[0], get(q)[1] - p[1]) < Math.hypot(get(b)[0] - p[0], get(b)[1] - p[1]) ? q : b, list[0]); }

// someone has walked up to a station's door: they become a rider, bound for somewhere on the other side
hooks.metroVisit = (p: any, otherwise: () => void) => {
  if (RIDERS().length >= riderCap || p.dog || p.jog) { otherwise(); return; }   // no dogs on the metro; joggers run on
  const st = Object.values(STATIONS).reduce((b, s) => { const d = (q: MetroStation) => Math.min(...q.entries.map(e => Math.hypot(e.ground[0] - p.x, e.ground[1] - p.y))); return d(s) < d(b) ? s : b; });
  const dests: [string, number][] = st.id === 'Market St' ? [['Sahel Central', 5], ['Port', 2.5], ['Motor District', 2]] : [['Market St', 5], ...Object.keys(STATIONS).filter(k => k !== st.id && k !== 'Market St').map(k => [k, 2] as [string, number])];
  let r = rng() * dests.reduce((s, d) => s + d[1], 0), to = dests[0][0]; for (const [k, w] of dests) if ((r -= w) <= 0) { to = k; break; }
  const rider = new Rider({ id:p.id, look:p.look, x:p.x, y:p.y, h:p.h, hops:hopsFor(st.id, to), origin:st.id, t0:sim.t });
  hooks.handOff(p, rider); p.remove(); rider.enter(st);
};

export function buildMetro() {
  const vg = buildViaducts(); scene.add(vg);
  // the viaducts answer a click with their line
  const lineEnt = (line: Line) => ({ kind:'line', id:`${line.name} · ${line.colour}`, groups:[vg], line, pick:[0, 0, 0],
    info() { return { kind:'Metro line · Sahel Metro', title:`${line.name} · ${line.colour}`, status:`${TRAINS.filter(t => t.line === line).length} trains running`,
      rows:[['Stations', line.stations.map(s => s.id).join(' · ')], ['Length', `${line.to - line.from} m on viaduct`], ['Trains', '4 cars, driverless'], ['Track', 'slab track, third rail']] }; },
    readout() { return `${line.name} · ${line.colour}`.toLowerCase(); } });
  const ents = METRO.lines.map(lineEnt);
  vg.userData.entity = { kind:'line', id:'Sahel Metro', groups:[vg], resolve:(pt: THREE.Vector3) => Math.abs(pt.z - 205) < 9 ? ents[0] : ents[1], info:() => ents[0].info(), readout:() => 'sahel metro' };
  // the stations
  for (const line of METRO.lines) for (const st of line.stations) {
    const id = st.id; let S = STATIONS[id];
    if ((st as any).central) {
      if (!S) { S = STATIONS[id] = new MetroStation(id, true, 'central'); const g = buildCentral(); S.groups = [g]; S.peek = g.userData.peek; S.pick = [658, 252, 6]; g.userData.entity = S; scene.add(g);
        S.entries = CENTRAL.corners.map(c => ({ ground:c.ground, foot:c.foot, top:c.top, land:c.land }));
        S.gates = CENTRAL.gates.flatMap(x => [196, 205.5, 214].map(y => [x, y, CENTRAL.z] as V3)); }
      const F = new Frame(line), z = levels(line), esc = (centralEsc as any)[line.id], isl: Island = { line, st, F, zc:CENTRAL.z, zf:z.zf, footU:esc.foot, topU:esc.top, waits:[], seats:[], waiting:[] };
      const lo = Math.min(esc.foot, esc.top) - 1.8, hi = Math.max(esc.foot, esc.top) + 1.8;
      for (let u = st.u0 + 3; u < st.u0 + 56; u += 2.6) if (u < lo || u > hi) for (const sg of [-1, 1]) { const [x, y] = F.at(u, sg * 1.7); isl.waits.push([x, y, z.zf, F.heading(sg), u, sg * 1.7]); }
      S.islands[line.id] = isl;
    } else {
      const plan = stationPlan(line, st as any), g = buildStation(line, st as any, plan);
      S = STATIONS[id] = new MetroStation(id, false, (st as any).style); S.groups = [g]; S.peek = g.userData.peek; g.userData.entity = S; scene.add(g);
      const m = plan.mid; S.pick = [m[0], m[1], m[2]];
      S.entries = plan.entries; S.gates = plan.gates;
      S.islands[line.id] = { line, st, F:plan.F, zc:plan.zc, zf:plan.zf, footU:plan.footU, topU:plan.topU, waits:plan.waits, seats:plan.seats, waiting:[] };
    }
    S.peek.hides = (x: number, y: number, p: any) => p?.lz !== undefined;
  }
  // their street doors are places to walk to, in the old town and in Sahel
  for (const e of STATIONS['Market St'].entries) portal('metro', 'Market St station', [e.ground[0], e.ground[1]], { w:3 });
  for (const id of ['Sahel Central', 'Port', 'Motor District']) for (const e of STATIONS[id].entries) cportal('metro', `${id} station`, [e.ground[0], e.ground[1]], id === 'Sahel Central' ? 0.55 : 0.6);
  // the trains: two on Line 1, one at each end of it; one on Line 2
  const [L1, L2] = METRO.lines;
  const a = new MetroTrain(L1, stopU(L1.stations[0], 1), 1, 40); a.side = -1; a.xover = L1.xovers[0];
  const b = new MetroTrain(L1, 800, -1, 120);
  const c = new MetroTrain(L2, stopU(L2.stations[0], 1), 1, 60); c.side = -1; c.xover = L2.xovers[0];
  TRAINS.push(a, b, c);
  for (const t of [a, c]) { t.at = STATIONS[t.stops()[0].id]; t.state = 'board'; t.doors = 1; t.t = 0; }
  return { trains:TRAINS, stations:STATIONS, viaducts:vg, hopsFor,
    update(dt: number) { riderCap = night() > 0.5 ? 16 : 44; for (const t of TRAINS) t.update(dt); } };
}
