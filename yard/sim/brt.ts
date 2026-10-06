import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { pose } from '../kernel/part';
import { clamp, rand, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { BRT, CITY, CURB } from '../layout';
import { BRT_HINGE, BRT_REAR, buildBrtFront, buildBrtRear } from '../models/brt';
import { brtDoorX, buildBrtStations, crossingX } from '../world/brt';
import { DRIVERS, clock, kmh, night, sim } from './core';
import { FAR, Person } from './person';
import { nextRoadSeq } from './roads';
import { Citizen, cportal, nextCity } from './sahel';

// ---- the Metrobus: Line M1 along Sahel Blvd's busway ----
// Articulated buses run east along the eastbound busway, turn back in the loop at the east edge, run west and turn back
// again at Gate Av. They stop at each station on the median, with their left-hand doors to its doors; nothing else
// runs in the busway, so the only thing they wait for is a bus ahead, or someone on a crossing.
const L = CITY.lanes, [M0, M1] = CITY.median, MID = (L.bE + L.bW) / 2, VMAX = 12.5;
export const BRT_PATH = new Path([[600, L.bE], [BRT.east - 9, L.bE], [BRT.east, MID], [BRT.east - 9, L.bW], [BRT.west + 9, L.bW], [BRT.west, MID], [BRT.west + 9, L.bE], [600, L.bE]], 4.5, true);
const P = BRT_PATH;
// the stops, in the order a bus comes to them round the loop: where its front stands (10 m past the station's middle)
type Stop = { i: number, x: number, name: string, dir: number, s: number };
const STOPS: Stop[] = [];
BRT.stops.forEach(([x, name], i) => { for (const dir of [1, -1]) STOPS.push({ i, x, name, dir, s:P.project(x + dir * 10, dir > 0 ? L.bE : L.bW) }); });
STOPS.sort((a, b) => a.s - b.s);
const DOOR_OFF = [1.9, 7.1, 15.0];   // a bus's doors behind its front

let busSeq = 0;
export class Metrobus {
  kind = 'bus'; model = 'brt'; seq = nextRoadSeq(); id: string; s: number; v = 0; halfW = 1.3; driver: string; parked = false;
  stop: Stop | null = null; si = 0; state = 'run'; t = 0; doors = 0; pax: any[] = []; crowd: number; trips = 0; carried = 0;
  front = { x:0, y:0, h:0 }; points: number[][] = []; groups: THREE.Object3D[]; parts: THREE.Group[]; lites: THREE.Group[]; doorParts: THREE.Object3D[] = []; pick = [-5, 0, 2.2];
  constructor(s: number, crowd: number) {
    this.id = `MB-${101 + busSeq}`; this.driver = DRIVERS[(busSeq * 3 + 1) % DRIVERS.length]; busSeq++; this.s = s; this.crowd = crowd;
    this.parts = [buildBrtFront(), buildBrtRear()]; this.lites = [buildBrtFront(true), buildBrtRear(true)];
    for (const g of [...this.parts, ...this.lites]) { g.userData.entity = this; scene.add(g); }
    for (const g of this.parts) for (const n of ['doorways', 'leaves']) this.doorParts.push(g.getObjectByName(n)!);
    this.groups = [...this.parts, ...this.lites];
    this.si = this.nextStopIndex(); sim.trucks.push(this as any); this.place();
  }
  nextStopIndex() { const s = ((this.s % P.length) + P.length) % P.length; const k = STOPS.findIndex(st => st.s > s + 0.5); return k < 0 ? 0 : k; }
  place() {
    const a = P.at(this.s), b = P.at(this.s - 6), h = Math.atan2(a.y - b.y, a.x - b.x);
    const k = P.at(this.s - BRT_HINGE), r = P.at(this.s - BRT_HINGE - BRT_REAR), hr = Math.atan2(k.y - r.y, k.x - r.x);
    for (const [g, l] of [[this.parts[0], this.lites[0]], [this.parts[1], this.lites[1]]]) { g.visible = !FAR; l.visible = FAR; }
    pose(this.parts[0], a.x, a.y, h); pose(this.lites[0], a.x, a.y, h); pose(this.parts[1], k.x, k.y, hr); pose(this.lites[1], k.x, k.y, hr);
    this.front = { x:a.x, y:a.y, h }; this.points = [[a.x, a.y], [b.x, b.y], [k.x, k.y], [r.x, r.y]];
    const open = this.doors > 0.01 && !FAR; for (const o of this.doorParts) o.visible = open;
  }
  update(dt: number) {
    this.t += dt;
    if (this.state === 'run') {
      const st = STOPS[this.si], len = P.length, here = ((this.s % len) + len) % len;
      let room = ((st.s - here) % len + len) % len;
      // the bus ahead, a full bus length and more off; anyone on a crossing in front
      for (const o of BUSES) if (o !== this) { const d = ((o.s - this.s) % len + len) % len; if (d > 0) room = Math.min(room, d - 18.2 - 6); }
      const c = Math.cos(this.front.h), sn = Math.sin(this.front.h);
      for (const p of sim.peds) { const dx = p.x - this.front.x, dy = p.y - this.front.y, f = dx * c + dy * sn; if (f > -0.5 && f < 14 && Math.abs(dy * c - dx * sn) < 2.2) room = Math.min(room, Math.max(0, f - 2)); }
      const vT = Math.min(VMAX, Math.sqrt(2 * 1.0 * Math.max(0, room)), Math.abs(this.front.y - MID) < 3.5 ? 5 : VMAX);
      this.v = vT < this.v ? Math.max(vT, this.v - 2.0 * dt) : Math.min(vT, this.v + 1.1 * dt);
      this.s += this.v * dt;
      if (room < 0.1 && ((st.s - here) % len + len) % len < 0.15) { this.v = 0; this.stop = st; this.state = 'opening'; this.t = 0; this.trips++;
        this.crowd = clamp(Math.round(this.crowd + rand(-14, 15) * (night() > 0.5 ? 0.4 : 1)), 4, 95); }
    } else this.dwell(dt);
    this.place();
  }
  dwell(dt: number) {
    const st = this.stop!, stn = BRT_STATIONS[st.i];
    if (this.state === 'opening') { this.doors = Math.min(1, this.doors + dt / 1.2); if (this.doors >= 1) { this.state = 'alight'; this.t = 0; this.alight(st); } return; }
    if (this.state === 'alight') { if (this.t > 2.5) { this.state = 'board'; this.t = 0; } return; }
    if (this.state === 'board') {
      for (const r of stn.waiting) if (!r.boarding && r.dir === st.dir) r.toBus(this, this.doorAt(st, r));
      const coming = stn.waiting.some(r => r.boarding === this);
      if (this.t > 5 && !coming || this.t > 16) { this.state = 'closing'; this.t = 0; for (const r of [...stn.waiting]) if (r.boarding === this) r.missed(); }
      return; }
    if (this.state === 'closing') { this.doors = Math.max(0, this.doors - dt / 1.2); if (this.doors <= 0) { this.state = 'run'; this.stop = null; this.si = (this.si + 1) % STOPS.length; } }
  }
  // the station's door nearest someone, on the side the bus is on
  doorAt(st: Stop, r: any) { const xs = brtDoorX(st.x, st.dir), y = st.dir > 0 ? M1 - 0.35 : M0 + 0.35; const x = xs.reduce((b, q) => Math.abs(q - r.x) < Math.abs(b - r.x) ? q : b, xs[0]); return [x, y]; }
  alight(st: Stop) {
    for (const p of [...this.pax]) { if (p.to !== st.i) continue; this.pax.splice(this.pax.indexOf(p), 1);
      const xs = brtDoorX(st.x, st.dir), x = xs[Math.floor(rng() * xs.length)], y = st.dir > 0 ? M1 - 0.35 : M0 + 0.35;
      const r = new BusRider({ id:p.id, look:p.look, x, y, h:st.dir > 0 ? -Math.PI / 2 : Math.PI / 2, stn:BRT_STATIONS[st.i], from:p.from, to:p.to, dir:p.dir, t0:p.t0 });
      if (p.followed && hooks.isSelected(this)) hooks.handOff(this, r);
      r.offBus(); }
  }
  board(r: BusRider) {
    const stn = BRT_STATIONS[this.stop!.i]; stn.waiting.splice(stn.waiting.indexOf(r), 1);
    const followed = hooks.isSelected(r); this.pax.push({ id:r.id, look:r.look, from:r.from, to:r.to, dir:r.dir, t0:r.t0, followed }); this.carried++;
    if (followed) hooks.handOff(r, this); r.remove();
  }
  aboard() { return this.pax.length + this.crowd; }
  heading() { const s = ((this.s % P.length) + P.length) % P.length, a = P.at(s); return Math.abs(a.y - L.bE) < 1 ? 'east' : Math.abs(a.y - L.bW) < 1 ? 'west' : 'turning back'; }
  status() {
    if (this.state === 'run') return this.v < 0.3 ? 'waiting' : `${this.heading() === 'turning back' ? 'turning back' : `${this.heading()}bound`} · ${kmh(this.v)}`;
    return `at ${this.stop!.name} · ${{ opening:'doors opening', alight:'doors open', board:'boarding', closing:'doors closing' }[this.state]}`;
  }
  info() {
    const nx = this.stop ?? STOPS[this.si];
    return { kind:'Metrobus · Line M1', title:this.id, status:this.status(), bar:{ v:this.aboard(), max:110, label:`${this.aboard()} aboard · room for 110` },
      rows:[['Route', 'Sahel Blvd · Gate Av ⇄ Sahel Tower'], [this.stop ? 'At' : 'Next stop', nx.name], ['Driver', this.driver], ['Speed', kmh(this.v)], ['Bus', 'articulated, 18 m, air-conditioned'],
        ['Stops made', String(this.trips)], ['Riders followed', `${this.pax.length} aboard · ${this.carried} so far`]] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  route() { return { path:P, s:this.s, closed:true, next:(() => { const q = P.at((this.stop ?? STOPS[this.si]).s); return [q.x, q.y]; })(), stop:(this.stop ?? STOPS[this.si]).name }; }
}
export const BUSES: Metrobus[] = [];

// ---- the stations and the people who ride ----
type BrtStation = { kind: string, id: string, i: number, x: number, waiting: BusRider[], groups: THREE.Object3D[], bbox: THREE.Box3, pick: number[], info: () => any, readout: () => string };
export const BRT_STATIONS: BrtStation[] = [];
function etaBus(stn: BrtStation, dir: number) {
  let best = Infinity; const tgt = STOPS.find(s => s.i === stn.i && s.dir === dir)!;
  for (const b of BUSES) { if (b.stop === tgt) return 0; const d = ((tgt.s - b.s) % P.length + P.length) % P.length; best = Math.min(best, d / 9 + 12 * STOPS.filter(s => { const ds = ((s.s - b.s) % P.length + P.length) % P.length; return ds > 0.5 && ds < d; }).length); }
  return best;
}
const etaText = (e: number) => e === 0 ? 'at the station' : e < 10 ? 'arriving' : `in ${Math.floor(e / 60)}:${String(Math.round(e % 60)).padStart(2, '0')}`;
export class BusRider extends Person {
  [k: string]: any;
  constructor(o: any) { super({ look:'sahel', speed:rand(1.1, 1.4), ...o }); }
  // over the crossing from the pavement and into the station, to wait by the doors on the side its bus comes
  enter() {
    const stn = this.stn as BrtStation, y = this.dir > 0 ? M1 - 0.9 : M0 + 0.9, cx = crossingX(stn.x);
    this.go([[this.x, this.y], [cx, this.y < 131 ? M0 + 0.6 : M1 - 0.6]], `to the ${stn.id} stop`).walk([[cx + 2.6, (M0 + M1) / 2]], 'through the gates')
      .walk([[stn.x + rand(-9, 9), y]], `waiting for a bus ${this.dir > 0 ? 'east' : 'west'}`).face(this.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      .then((p: BusRider) => { stn.waiting.push(p); }).wait(1e6, `waiting for a bus ${this.dir > 0 ? 'east' : 'west'}`);
  }
  toBus(b: Metrobus, door: number[]) { this.boarding = b; this.steps = []; this.walk([door], `boarding ${b.id}`).then((p: BusRider) => { if (p.boarding?.state === 'board') p.boarding.board(p); else p.missed(); }); }
  missed() { this.boarding = null; this.steps = []; this.wait(1e6, `waiting for a bus ${this.dir > 0 ? 'east' : 'west'}`); }
  // off at its stop: out through the gates, over the crossing to whichever pavement is nearer where it is going next
  offBus() {
    const stn = this.stn as BrtStation, cx = crossingX(stn.x), to = nextCity(null, 'brt'), north = to.p[1] < 131;
    this.walk([[cx + 2.6, (M0 + M1) / 2]], 'off the bus').go([[cx, north ? M0 + 0.6 : M1 - 0.6], [cx, north ? 113.4 : 148.6]], 'leaving the stop')
      .then((p: BusRider) => { const c = new Citizen({ kind:'brt', name:`the ${stn.id} stop`, p:[p.x, p.y], w:1 } as any, to, { id:p.id, look:p.look }); hooks.handOff(p, c); p.remove(); });
  }
  status() { return this.label || 'at the stop'; }
  info() { return { kind:'Metrobus rider', title:this.id, status:this.status(), rows:[['From', BRT.stops[this.from][1]], ['To', BRT.stops[this.to][1]], ['Line', `M1 ${this.dir > 0 ? 'east' : 'west'}bound`], ['Set out', clock(this.t0)]] }; }
}
const RIDERS = () => sim.people.filter((p: any) => p instanceof BusRider);
// someone has come to a crossing to a stop: they ride to another stop along the boulevard
hooks.brtVisit = (p: any, otherwise: () => void) => {
  if (RIDERS().length >= (night() > 0.5 ? 6 : 16)) { otherwise(); return; }
  const stn = BRT_STATIONS.reduce((b, q) => Math.abs(crossingX(q.x) - p.x) < Math.abs(crossingX(b.x) - p.x) ? q : b, BRT_STATIONS[0]);
  let to = stn.i; while (to === stn.i) to = Math.floor(rng() * BRT_STATIONS.length);
  const r = new BusRider({ id:p.id, look:p.look, x:p.x, y:p.y, h:p.h, stn, from:stn.i, to, dir:to > stn.i ? 1 : -1, t0:sim.t });
  hooks.handOff(p, r); p.remove(); r.enter();
};

export function buildBrt() {
  const g = buildBrtStations(); scene.add(g);
  BRT.stops.forEach(([x, name], i) => {
    const stn: BrtStation = { kind:'brtstop', id:name, i, x, waiting:[], groups:[], bbox:new THREE.Box3(W(x - 13, M0 - 1, 0), W(x + 13, M1 + 1, 3.6)), pick:[x, M1, 2],
      info() { return { kind:'Metrobus station · Line M1', title:this.id, status:`next bus east ${etaText(etaBus(this, 1))}`,
        rows:[['Eastbound', etaText(etaBus(this, 1))], ['Westbound', etaText(etaBus(this, -1))], ['Waiting', String(this.waiting.length)], ['Platform', 'a cooled glass box on the median, doors both sides'],
          ...(name === 'Sahel Central' ? [['Change for', 'Sahel Metro, at Sahel Central']] as [string, string][] : [])] }; },
      readout() { return `${this.id} stop · next bus east ${etaText(etaBus(this, 1))}`.toLowerCase(); } };
    BRT_STATIONS.push(stn);
    for (const y of [113.4, 148.6]) cportal('brt', `the ${name} stop`, [crossingX(x), y], 0.45);
  });
  g.userData.entity = { kind:'brtstop', id:'Metrobus', groups:[g], resolve:(pt: THREE.Vector3) => BRT_STATIONS.reduce((b, q) => Math.abs(q.x - pt.x) < Math.abs(b.x - pt.x) ? q : b, BRT_STATIONS[0]) };
  // three buses spread round the loop
  for (let k = 0; k < 3; k++) BUSES.push(new Metrobus(k * P.length / 3 + 20, Math.round(rand(20, 60))));
  return { buses:BUSES, stations:BRT_STATIONS, update(dt: number) { void dt; } };
}
