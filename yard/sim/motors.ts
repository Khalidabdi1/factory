import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { Part, glow, pose } from '../kernel/part';
import { clamp, rand, rng, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { CITY, MOTORS, RAB, RAIL, WORKS, WORLD } from '../layout';
import { CARRIER_LEN, GAP, LOCO_LEN, WDECK, buildCarrier, buildLoco, carAlong } from '../models/train';
import { BODY_LEN } from '../models/works';
import { buildBarrierArm, buildLift, buildMotorsRamp, buildTurntable, carPart } from '../models/motors';
import { AISLE, CROSSING, DESKS, DOOR, LOUNGE, PIT, RECEPTION, SHOWN, SIDING, TRACK, TURNTABLES, WAITING, bayDir, bayFront, buildMotorsSite, levelZ } from '../world/motors';
import { PROTO as PROTO_, clock, hourAt, kmh, sim } from './core';
import { Car } from './cars';
import { Person } from './person';
import { bendLimit } from './roads';
import { CITY_PORTALS, Citizen, boxBusy } from './sahel';
import { Body, lot } from './works';

// ---- Sahel Motors ----
// Car Works' dealer. Its shuttle, CS-1, takes finished cars off the works' lot (FRT-7 and it take turns there) and runs
// them along its siding to the showroom, where a ramp rises behind it and the cars back off one by one and drive to the
// towers. A tower's lift takes each up to a bay and pushes it in. People come up from the city (the metro's Motor
// District station is just down Najd Av), look at the cars on show, take one round the test track, sit down with a
// consultant, and some buy: the lift brings their car down, it is driven round to the handover bay, and they drive it
// away over the level crossing into town.
const PROTO: any = PROTO_, SY = MOTORS.sidingY, P = SIDING, X = (x: number) => x - 400, A = MOTORS, [T0, T1] = A.towers;
const MODELS_PRICE: Record<string, number> = { 'Gull 1.2':79900, 'Gull 1.6 estate':96500, 'Petrel GT':164000 };
const sar = (n: number) => `SAR ${n.toLocaleString('en-US')}`;
const price = (b: any) => MODELS_PRICE[b.model] ?? 90000;
export const OPEN: [number, number] = [9, 22];
const isOpen = () => { const h = hourAt(sim.t); return h >= OPEN[0] && h < OPEN[1]; };
const NAME = (t: number) => `Tower ${'AB'[t]}`;

// how high a car stands: up the dock at Car Works, up the ramp at Sahel Motors, on a carrier's deck
const deckZ = (ramp: () => number) => (x: number, y: number) => Math.abs(y - SY) > 1.7 ? 0
  : x < 480 ? WDECK * clamp((x - (A.dock - 7)) / 7, 0, 1) : WDECK * clamp((x - (A.ramp - 7)) / 7, 0, 1) * (x < A.ramp ? ramp() : 1);

// ---- a car driven about by the staff: legs forward or back (a back leg's path is the track of the car's rear) ----
type Leg = { path: Path, back?: boolean, v: number, z?: (x: number, y: number) => number };
class Jockey {
  [k: string]: any;
  constructor(b: any, legs: Leg[], to: string, done: (j: Jockey) => void) { Object.assign(this, { b, legs, to, done, i:0, s:0, v:0 }); b.jockey = this; this.place(); }
  update(dt: number) {
    const L = this.legs[this.i], rem = L.path.length - this.s;
    const vT = Math.min(L.v, 0.35 + Math.sqrt(2 * 1.3 * Math.max(0, rem)));
    this.v = vT < this.v ? vT : Math.min(vT, this.v + 1.5 * dt);
    this.s = Math.min(L.path.length, this.s + this.v * dt); this.place();
    if (this.s < L.path.length - 1e-4) return false;
    if (++this.i < this.legs.length) { this.s = 0; this.v = 0; return false; }
    this.b.jockey = null; this.done(this); return true;
  }
  place() {
    const L = this.legs[this.i]; let F: any, h: number;
    if (L.back) { const R = L.path.at(this.s); F = L.path.at(this.s - BODY_LEN); h = Math.atan2(F.y - R.y, F.x - R.x); } else { F = L.path.at(this.s); h = F.h; }
    const mx = F.x - Math.cos(h) * BODY_LEN / 2, my = F.y - Math.sin(h) * BODY_LEN / 2;
    this.at = { x:F.x, y:F.y, h }; pose(this.b.group, F.x, F.y, h, L.z ? L.z(mx, my) : 0.02);
  }
  route() { const L = this.legs[this.i]; return L.back ? null : { path:L.path, s:this.s, next:null, stop:this.to }; }
}

// the apron before the towers and the drive along the front: one car is moved about on it at a time
const apron = { holder:null as any, claim(o: any) { if (this.holder && this.holder !== o) return false; this.holder = o; return true; }, release(o: any) { if (this.holder === o) this.holder = null; } };

// ---- a car tower: eight levels of eight bays round a lift ----
class Tower {
  [k: string]: any;
  constructor(t: number) {
    const [cx, cy] = A.towers[t];
    Object.assign(this, { kind:'cartower', id:NAME(t), t, cx, cy, groups:[], jobs:[], kept:new Set(), carsG:null, stored:0, served:0,
      bays:Array.from({ length:A.levels + 1 }, () => new Array(8).fill(null)), pick:[cx, cy, 14],
      bbox:new THREE.Box3(W(cx - A.towerR, cy - A.towerR, 0), W(cx + A.towerR, cy + A.towerR, (A.levels + 1) * A.levelH + 1.5)) });
    this.lift = { g:buildLift(), z:0, h:-Math.PI / 2, d:0, car:null as any };
    this.lift.g.userData.entity = this; scene.add(this.lift.g); this.groups = [this.lift.g];
  }
  cars() { const o: any[] = []; for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) if (this.bays[L][k]) o.push(this.bays[L][k]); return o; }
  free() { let n = 0; for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) if (!this.bays[L][k] && !this.jobs.some((j: any) => j.kind === 'store' && j.L === L && j.k === k)) n++; return n; }
  idle() { return !this.jobs.length; }
  // a free bay: low levels first, a little at random
  reserve() { const o: number[][] = []; for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) if (!this.bays[L][k] && !this.jobs.some((j: any) => j.kind === 'store' && j.L === L && j.k === k)) o.push([L, k]);
    if (!o.length) return null; o.sort((a, b) => a[0] - b[0]); return o[Math.floor(rng() * Math.min(o.length, 6))]; }
  where(b: any) { for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) if (this.bays[L][k] === b) return [L, k]; return null; }
  // a car put straight into a bay (the stock it opened with)
  put(b: any, L: number, k: number) { this.bays[L][k] = b; b.motors = motors; b.mstate = 'stored'; b.tower = this; }
  carPose(L: number, k: number) { const [x, y] = bayFront(this.t, k); return [x, y, bayDir(k), levelZ(L)]; }
  draw() {
    const p = new Part();
    for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) { const b = this.bays[L][k]; if (b && !this.kept.has(b)) { const [x, y, h, z] = this.carPose(L, k); p.put(carPart(b.tone), x, y, h, z); } }
    const g = p.build(`tower${this.t}Cars`); g.userData.entity = this;
    if (this.carsG) { this.carsG.traverse((o: any) => o.geometry?.dispose()); this.carsG.removeFromParent(); }
    this.carsG = g; scene.add(g);
  }
  // a click on the cars picks the one nearest where it landed
  resolve(pt: THREE.Vector3) {
    let best: any = null, bd = 3.2;
    for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) { const b = this.bays[L][k]; if (!b) continue; const [x, y, h, z] = this.carPose(L, k);
      const d = Math.hypot(x - Math.cos(h) * 2.25 - pt.x, y - Math.sin(h) * 2.25 - pt.z, z + 0.7 - pt.y); if (d < bd) { bd = d; best = b; } }
    return best ?? this;
  }
  update(dt: number) {
    // a car someone picks out stays its own model while they look at it
    let redraw = false;
    for (const b of this.cars()) if (hooks.isSelected(b) && !this.kept.has(b)) { this.kept.add(b); b.setModel('complete'); const [L, k] = this.where(b)!, [x, y, h, z] = this.carPose(L, k); pose(b.group, x, y, h, z); redraw = true; }
    for (const b of [...this.kept]) if (!hooks.isSelected(b) || b.tower !== this || !this.where(b)) { this.kept.delete(b); if (this.where(b)) b.remove(); redraw = true; }
    if (redraw) this.draw();
    const lf = this.lift, j = this.jobs[0], go = (z: number, h: number) => {
      const dz = z - lf.z, dh = wrap(h - lf.h);
      lf.z += clamp(dz, -3.4 * dt, 3.4 * dt) * Math.min(1, 0.3 + Math.abs(dz)); lf.h += clamp(dh, -1.3 * dt, 1.3 * dt);
      return Math.abs(z - lf.z) < 0.01 && Math.abs(wrap(h - lf.h)) < 0.005; };
    if (!j) go(0, -Math.PI / 2);
    else if (j.kind === 'store') {
      if (j.step === 'wait' && j.arrived) { lf.g.attach(j.b.group); pose(j.b.group, 2.25, 0, 0, 0.04); lf.d = 2.25; j.step = 'rise'; j.b.mstate = 'lift'; }
      else if (j.step === 'rise' && go(levelZ(j.L), bayDir(j.k))) j.step = 'push';
      else if (j.step === 'push') { lf.d = Math.min(7.3, lf.d + 1.8 * dt); pose(j.b.group, lf.d, 0, 0, 0.04);
        if (lf.d >= 7.3) { scene.attach(j.b.group); this.bays[j.L][j.k] = j.b; j.b.mstate = 'stored'; this.stored++;
          if (hooks.isSelected(j.b)) this.kept.add(j.b); else j.b.remove(); this.draw(); j.step = 'home'; } }
      else if (j.step === 'home' && go(0, -Math.PI / 2)) this.jobs.shift();
    } else if (j.kind === 'fetch') {
      if (j.step === 'rise' && go(levelZ(j.L), bayDir(j.k))) {
        const b = j.b; this.bays[j.L][j.k] = null; b.mstate = 'fetch';
        if (!this.kept.delete(b)) b.setModel('complete'); this.draw();
        lf.g.add(b.group); lf.d = 7.3; pose(b.group, lf.d, 0, 0, 0.04); j.step = 'pull';
      } else if (j.step === 'pull') { lf.d = Math.max(2.25, lf.d - 1.8 * dt); pose(j.b.group, lf.d, 0, 0, 0.04); if (lf.d <= 2.25) j.step = 'down'; }
      else if (j.step === 'down' && go(0, Math.PI / 2)) j.step = 'leave';
      else if (j.step === 'leave' && j.canLeave()) { scene.attach(j.b.group); j.go(j.b); j.step = 'clear'; j.t = 0; this.served++; }
      else if (j.step === 'clear' && (j.t += dt) > 3 && go(0, -Math.PI / 2)) this.jobs.shift();
    }
    pose(lf.g, this.cx, this.cy, lf.h, lf.z);
  }
  status() {
    const j = this.jobs[0], n = this.cars().length;
    if (!j) return `${n} cars · lift at the gate`;
    if (j.kind === 'store') return j.step === 'wait' ? `${n} cars · lift waiting for ${j.b.id}` : `${n} cars · taking ${j.b.id} up to level ${j.L}`;
    return j.step === 'leave' || j.step === 'clear' ? `${n} cars · ${j.b.id} down at the gate` : `${n} cars · bringing ${j.b.id} down from level ${j.L}`;
  }
  info() {
    const n = this.cars().length, cap = A.levels * 8;
    return { kind:'Car tower · Sahel Motors', title:this.id, status:this.status(), bar:{ v:n, max:cap, label:`${n} of ${cap} bays full` },
      rows:[['Levels', `${A.levels} · 8 bays each, round the lift`], ['Height', `${Math.round((A.levels + 1) * A.levelH + 1.5)} m`], ['Taken in', String(this.stored)], ['Sent down', String(this.served)],
        ['Models', ['Gull 1.2', 'Gull 1.6 estate', 'Petrel GT'].map(m => `${this.cars().filter((b: any) => b.model === m).length} ${m.split(' ')[0] === 'Gull' ? m.replace('Gull ', 'G') : 'GT'}`).join(' · ')]] };
  }
  readout() { return `${this.id.toLowerCase()} · ${this.status()}`; }
}

// ---- CS-1, the shuttle between Car Works and the showroom: a loco and two car carriers, eight cars a trip ----
const CONSIST: [string, number][] = [['loco', LOCO_LEN], ['carrier', CARRIER_LEN], ['carrier', CARRIER_LEN]];
let vOff = 0; const VEH = CONSIST.map(([kind, len]) => { const o = { kind, len, off:vOff }; vOff += len + GAP; return o; });
const LEN = vOff - GAP, S_DOCK = X(A.dock) + LEN, S_STOP = X(A.stop), PER = 4, CAP = 8;
const CAR_AT = (k: number) => 0.6 + k * 4.85;
const shuttle: any = { kind:'train', id:'CS-1', groups:[], pick:[-8, 0, 3], s:S_DOCK, v:0, state:'dock', vehicles:[], cars:[], coming:[], off:null, tStop:0, trips:0, delivered:0,
  nextCar:0, lastCar:0, nextOff:0, rampK:0, ramp:null,
  poseOf(i: number) { const F = P.at(this.s - VEH[i].off), R = P.at(this.s - VEH[i].off - VEH[i].len); return { x:F.x, y:F.y, h:Math.atan2(F.y - R.y, F.x - R.x) }; },
  placeOf(c: number, k: number) { const p = this.poseOf(c); return [p.x - Math.cos(p.h) * CAR_AT(k), p.y - Math.sin(p.h) * CAR_AT(k)]; },
  freePlace() { for (const c of [1, 2]) for (let k = 0; k < PER; k++) if (!this.cars.some((q: any) => q.c === c && q.k === k) && !this.coming.some((q: any) => q.c === c && q.k === k)) return [c, k]; return null; },
  // a car at its place: drawn into its carrier's load (or still its own model while someone follows it)
  stow(q: any) {
    this.coming.splice(this.coming.indexOf(q), 1); this.cars.push(q); q.b.mstate = 'shuttle';
    if (hooks.isSelected(q.b)) this.vehicles[q.c].attach(q.b.group); else q.b.remove();
    this.drawLoads();
  },
  drawLoads() {
    for (const c of [1, 2]) {
      const g = this.vehicles[c], old = g.getObjectByName('load'); if (old) { old.traverse((o: any) => o.geometry?.dispose()); old.removeFromParent(); }
      const p = new Part(); let n = 0;
      for (const q of this.cars) if (q.c === c && q.b.group.parent !== g) { carAlong(p, -CAR_AT(q.k), q.b.tone); n++; }
      if (n) { const o = p.build('load'); o.userData.entity = this; g.add(o); }
    }
  },
  update(dt: number) {
    if (this.state === 'east' || this.state === 'west') {
      const stop = this.state === 'east' ? S_STOP : S_DOCK, d = Math.abs(stop - this.s), dir = Math.sign(stop - this.s);
      const vT = Math.min(8, Math.sqrt(2 * 0.5 * d));
      this.v = vT < this.v ? Math.max(vT, this.v - 1.0 * dt) : Math.min(vT, this.v + 0.5 * dt);
      this.s += dir * Math.min(d, this.v * dt);
      if (d < 0.01 || Math.abs(stop - this.s) < 0.01) { this.s = stop; this.v = 0; this.state = this.state === 'east' ? 'motors' : 'dock'; this.tStop = sim.t; this.nextOff = sim.t + 2; this.nextCar = sim.t + 2; }
    }
    if (this.state === 'dock') this.load();
    if (this.state === 'motors') this.unload(dt);
    for (const q of [...this.coming]) if (q.j.update(dt)) this.stow(q);
    if (this.off && this.off.update(dt)) this.off = null;
    // a car someone was following rides as its own model; once they let it go it joins its carrier's load
    if (this.cars.some((q: any) => q.b.group.parent && q.b.group.parent !== scene && !hooks.isSelected(q.b))) { for (const q of this.cars) if (q.b.group.parent && q.b.group.parent !== scene && !hooks.isSelected(q.b)) q.b.remove(); this.drawLoads(); }
    this.ramp.userData.raise(this.rampK);
    this.place();
  },
  // at Car Works: take cars over one at a time while there are places and cars, and room for them at the showroom;
  // FRT-7 coming in has the lot after the car on its way
  load() {
    const frt = hooks.train, frtWants = frt.state === 'in' || frt.state === 'works', place = this.freePlace();
    if (frtWants) { if (!this.coming.length) lot.release(this); }
    else if (place && lot.cars.length && sim.t >= this.nextCar && motors.room() > this.cars.length + this.coming.length && lot.claim(this)) {
      const b = lot.take(); this.nextCar = sim.t + 3.8; this.lastCar = sim.t;
      if (b) {
        const [c, k] = place, x = lot.spaceX(b.space), aisle = WORKS.lot.aisle, rear = WORKS.lot.front + BODY_LEN, [tx] = this.placeOf(c, k);
        b.parked = false; b.motors = motors; b.mstate = 'toShuttle'; b.setModel('complete');
        const j = new Jockey(b, [{ path:new Path([[x, rear], [x, aisle], [x - 6, aisle]], 2.5), back:true, v:1.8 },
          { path:new Path([[x - 1.5, aisle], [404, aisle], [409.5, SY], [tx, SY]], 2.6), v:4, z:deckZ(() => 1) }], this.id, () => {});
        this.coming.push({ c, k, b, j });
      }
    }
    const idle = !this.coming.length, waited = sim.t - this.lastCar > 10;
    if (idle && this.cars.length && (!place || waited && (!lot.cars.length || frtWants || motors.room() <= this.cars.length))) {
      lot.release(this); this.state = 'east'; this.trips++;
    }
  },
  // at the showroom: the ramp up, the cars off the back one at a time to whichever tower can take one, the ramp down
  unload(dt: number) {
    const want = this.cars.length || this.off ? 1 : 0;
    this.rampK = clamp(this.rampK + (want ? 1 : -1) * dt / 2.2, 0, 1);
    if (!this.off && this.cars.length && this.rampK >= 1 && sim.t >= this.nextOff && apron.claim(this)) {
      const tw = motors.towerFor();
      if (!tw) { apron.release(this); return; }
      const q = [...this.cars].sort((a: any, b: any) => (b.c * 10 + b.k) - (a.c * 10 + a.k))[0], b = q.b;
      this.cars.splice(this.cars.indexOf(q), 1);
      if (b.group.parent && b.group.parent !== scene) scene.attach(b.group); else b.setModel('complete');
      this.drawLoads();
      const [fx] = this.placeOf(q.c, q.k), bay = tw.reserve(), job = { kind:'store', b, L:bay[0], k:bay[1], step:'wait', arrived:false };
      tw.jobs.push(job); b.mstate = 'toTower'; b.tower = tw;
      const gx = tw.cx, gy = tw.cy - 2.25, foot = A.ramp - 7 - 10.8;
      const fwd = gx > 535 ? [[foot + 4.5, SY], [gx, SY], [gx, gy]] : [[foot + 4.5, SY], [foot + 9, SY], [foot + 9, A.in], [gx, A.in], [gx, gy]];
      this.off = new Jockey(b, [{ path:new Path([[fx - BODY_LEN, SY], [foot, SY]], 2), back:true, v:2.6, z:deckZ(() => this.rampK) }, { path:new Path(fwd, 4.2), v:4.6 }], tw.id, (j: Jockey) => {
        job.arrived = true; apron.release(j); this.delivered++; motors.delivered++; this.nextOff = sim.t + 0.5; });
      apron.holder = this.off;
    }
    if (!this.cars.length && !this.off && this.rampK <= 0) { this.state = 'west'; this.tStop = sim.t; }
  },
  place() { this.vehicles.forEach((g: any, i: number) => { const p = this.poseOf(i); pose(g, p.x, p.y, p.h); }); glow(this.beacon, this.v > 0.1 && sim.t % 1 < 0.5); },
  status() {
    const n = this.cars.length;
    return { dock:lot.holder && lot.holder !== this ? `at Car Works · waiting for ${lot.holder.id}` : `at Car Works · loading (${n} on, ${this.coming.length} coming)`,
      east:`to Sahel Motors · ${n} cars · ${kmh(this.v)}`, motors:`at Sahel Motors · unloading (${n + (this.off ? 1 : 0)} to come off)`, west:`back to Car Works · ${kmh(this.v)}` }[this.state as string];
  },
  info() {
    const n = this.cars.length;
    return { kind:'Car shuttle · Car Works to Sahel Motors', title:this.id, status:this.status(), bar:{ v:n, max:CAP, label:`${n} of ${CAP} cars aboard` },
      rows:[['Next stop', { dock:'Sahel Motors', east:'Sahel Motors', motors:'Car Works', west:'Car Works' }[this.state as string]], ['Speed', kmh(this.v)],
        ['Consist', 'loco, two car carriers'], ['Trips', String(this.trips)], ['Delivered', `${this.delivered} cars`]] };
  },
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); },
  route() { return this.state === 'east' || this.state === 'west' ? { path:P, s:this.s, closed:false, next:null, stop:this.state === 'east' ? 'Sahel Motors' : 'Car Works' } : null; },
};

// ---- the level crossing where Najd Av meets the main line: lamps flash, then the barriers come down, while FRT-7
// comes through ----
const crossing: any = { kind:'crossing', id:'Najd Av level crossing', groups:[], arms:[], lamps:[], k:0, warn:false, tWarn:0, closings:0, pick:[640, RAIL.y, 1.5],
  bbox:new THREE.Box3(W(A.road[0] - 4, A.cross[0] - 1.5, 0), W(A.road[1] + 1, A.cross[1] + 1, 4.5)),
  open() { return this.k < 0.01 && !this.warn; },
  update(dt: number) {
    const sp = hooks.train.span?.(), want = !!sp && sp[0] < CROSSING.x + 170 && sp[1] > CROSSING.x - 10;
    if (want && !this.warn) { this.warn = true; this.tWarn = sim.t; this.closings++; }
    if (!want && this.k <= 0) this.warn = false;
    const down = want && sim.t - this.tWarn > 3;
    this.k = clamp(this.k + (down ? 1 : -1) * dt / 5, 0, 1);
    for (const a of this.arms) a.rotation.z = (1 - this.k) * (Math.PI / 2 - 0.06);
    const on = this.warn || this.k > 0, ph = sim.t % 1 < 0.5;
    this.lamps.forEach((l: any, i: number) => glow(l, on && (i % 2 ? ph : !ph)));
  },
  status() { return this.k >= 1 ? 'barriers down · FRT-7 passing' : this.k > 0 ? (this.warn ? 'barriers coming down' : 'barriers going up') : this.warn ? 'lamps flashing · FRT-7 coming' : 'open'; },
  info() { return { kind:'Level crossing · half barriers', title:this.id, status:this.status(), rows:[['Line', 'the main line, Car Works to the east edge'], ['Road', 'Najd Av up to Sahel Motors'], ['Closed', `${this.closings} times`]] }; },
  readout() { return `level crossing · ${this.status()}`; },
};
hooks.levelShut = (a: number[], b: number[]) => !crossing.open() && (a[1] - RAIL.y) * (b[1] - RAIL.y) <= 0 && Math.min(a[0], b[0]) > A.road[0] - 5 && Math.max(a[0], b[0]) < A.road[1] + 1;

// ---- the test track and its car ----
const S0 = TRACK.project(PIT.car[0], PIT.car[1]);
const testCar: any = { kind:'testcar', id:'Petrel GT · demonstrator', model:'Petrel GT', groups:[], pick:[-2.25, 0, 1.1], s:S0, v:0, driver:null, laps:0, lapT:0, best:0, drives:0, total:0,
  update(dt: number) {
    if (this.driver) {
      const end = S0 + 2 * TRACK.length, rem = end - this.s;
      const vT = Math.min(15, bendLimit(TRACK, this.s, 8.5), Math.sqrt(2 * 2.5 * Math.max(0, rem)) + 0.2);
      this.v = vT < this.v ? Math.max(vT, this.v - 6 * dt) : Math.min(vT, this.v + 3 * dt);
      const before = Math.floor((this.s - S0) / TRACK.length);
      this.s = Math.min(end, this.s + this.v * dt); this.lapT += dt; this.total += this.v * dt;
      if (Math.floor((this.s - S0) / TRACK.length) > before && this.s < end) { this.best = this.best ? Math.min(this.best, this.lapT) : this.lapT; this.lapT = 0; this.laps++; }
      if (this.s >= end - 1e-3) { this.best = this.best ? Math.min(this.best, this.lapT) : this.lapT; this.laps++; this.v = 0; this.s = S0; const p = this.driver; this.driver = null; motors.backFromDrive(p); }
    }
    const a = TRACK.at(this.s); pose(this.group, a.x, a.y, a.h, 0.02);
  },
  status() { return this.driver ? `on a test drive with ${this.driver.id} · ${kmh(this.v)}` : this.busy ? `waiting for ${this.busy.id}` : 'at the line · free'; },
  info() { const t = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    return { kind:'Test-drive car · Sahel Motors', title:this.id, status:this.status(), rows:[['Model', 'Petrel GT · slate, two-tone'], ['Test drives', String(this.drives)], ['Laps', String(this.laps)], ['Best lap', this.best ? t(this.best) : '—'], ['Driven', `${(this.total / 1000).toFixed(1)} km`]] }; },
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); },
  route() { return this.driver ? { path:TRACK, s:this.s, closed:true, next:null, stop:'the line' } : null; },
};

// ---- a sold car, its new owner at the wheel: out along the drive, over the crossing and down Najd Av, then west along
// Sahel Blvd and Riverside Rd for the old town ----
const OUT_PTS = (front: number[]) => [front, [front[0], A.out], [A.road[0] + 3.5, A.out], [A.road[0] + 3.5, 110], [A.road[0] - 5, CITY.lanes.gW], [552, CITY.lanes.gW], [520, 127.5],
  [438, 127.5], [RAB.x, 119], [404, 127.5], [WORLD.x0 - 8, 127.5]];
class NewCar extends Car {
  [k: string]: any;
  constructor(b: any, owner: string, front: number[]) {
    const path = new Path(OUT_PTS(front), 7);
    super({ path, proto:PROTO.body[`complete_${b.tone}`], tone:b.tone, len:BODY_LEN, id:`${b.id}`, role:'new', vmax:rand(10, 12), v:0,
      yields:[{ s:path.project(A.road[0] + 3.5, A.cross[0] - 1.6), clear:() => crossing.open() },
        { s:path.project(A.road[0] + 3.5, 109), clear:(v: any) => !boxBusy(v, A.road[0] - 4, 678, 113, 124) },
        { s:path.project(441, 127.5), clear:(v: any) => !boxBusy(v, 423, 441, 129, 146) }] });
    Object.assign(this, { b, owner, model:b.model, vin:b.vin, bought:sim.t });
    apron.claim(this);
  }
  update(dt: number) {
    if (!this.clear && !apron.claim(this)) { this.v = 0; return; }
    super.update(dt);
    if (!this.clear && this.front.x > A.bay + 16) { this.clear = true; apron.release(this); }   // clear of the bay and the towers' way to it
  }
  remove() { apron.release(this); super.remove(); }
  info() {
    return { kind:`New car · ${this.model}`, title:this.id, status:this.v < 0.3 ? (this.front.y < A.cross[0] && !crossing.open() ? 'waiting at the crossing' : 'waiting') : `${this.front.y < 0 ? 'leaving Sahel Motors' : 'driving home to the old town'} · ${kmh(this.v)}`,
      rows:[['Driver', this.owner], ['Model', this.model], ['VIN', this.vin], ['Bought', `${clock(this.bought)} · ${sar(MODELS_PRICE[this.model] ?? 90000)}`], ['Going', 'the old town, by Sahel Blvd']] };
  }
}

// ---- the people: consultants at the desks, a receptionist, and the city's customers ----
const STAFF = ['R. Al-Amri', 'S. Haddad', 'M. Okafor', 'L. Al-Sudairi'], DESK_NAME = ['desk 1', 'desk 2', 'desk 3', 'desk 4'];
class Consultant extends Person {
  [k: string]: any;
  constructor(id: string, seat: any, role: string, at: number[]) { super({ look:'teller', id, x:at[0], y:at[1], speed:1.3 }); Object.assign(this, { seat, role, sold:0, with:null }); }
  info() {
    return { kind:`${this.role} · Sahel Motors`, title:this.id, status:this.status(), rows:[['At', this.role === 'Receptionist' ? 'reception' : this.desk],
      ...(this.role === 'Receptionist' ? [] : [['With', this.with?.id ?? 'no one'], ['Sold today', String(this.sold)]]), ['Hours', `${String(OPEN[0]).padStart(2, '0')}:00–${OPEN[1]}:00`]] };
  }
}
const viewSpots = () => [...TURNTABLES.map(([x], i) => ({ x, h:Math.PI / 2, model:i ? 'Gull 1.6 estate' : 'Petrel GT' })), ...SHOWN.map(([x], i) => ({ x, h:-Math.PI / 2, model:['Gull 1.2', 'Petrel GT', 'Gull 1.6 estate'][i] }))];
const IN_DOOR = [DOOR[0] - 1.8, DOOR[1]], OUT_DOOR = [DOOR[0] + 1.8, DOOR[1]];
const BAY_GATE = [[587.5, -29.6], [584.5, -29.6]];

export const motors: any = { kind:'showroom', id:'Sahel Motors', groups:[], pick:[600, -31, 7], towers:[] as Tower[], visitors:new Set(), orders:[] as any[], bay:{ car:null as any, order:null as any },
  delivered:0, sold:0, soldDay:0, day:-1, staff:[] as Consultant[],
  room() { return this.towers.reduce((s: number, t: Tower) => s + t.free(), 0); },
  stock() { return this.towers.reduce((s: number, t: Tower) => s + t.cars().length, 0); },
  towerFor() { const ok = this.towers.filter((t: Tower) => t.idle() && t.free() > 0); return ok.sort((a: Tower, b: Tower) => b.free() - a.free())[0] ?? null; },
  carStatus(b: any) {
    const t = b.tower ? b.tower.id : '';
    switch (b.mstate) {
      case 'toShuttle': return `driving onto ${shuttle.id}`;
      case 'shuttle': return `on ${shuttle.id} · ${shuttle.status()}`;
      case 'toTower': return `off ${shuttle.id} · driving to ${t}`;
      case 'lift': return `in ${t}'s lift · going up`;
      case 'stored': { const w = b.tower?.where(b); return w ? `in ${t} · level ${w[0]} · for sale` : 'for sale'; }
      case 'fetch': return `coming down ${t}'s lift · sold to ${b.buyer}`;
      case 'toBay': return `on its way to the handover bay · sold to ${b.buyer}`;
      case 'bay': return `in the handover bay · waiting for ${b.buyer}`;
    }
    return 'at Sahel Motors';
  },
  carRows(b: any) { const w = b.mstate === 'stored' && b.tower?.where(b);
    return [['Price', sar(price(b))], ...(w ? [['Kept', `${b.tower.id} · level ${w[0]} · bay ${w[1] + 1}`]] : []), ...(b.buyer ? [['Sold to', b.buyer]] : [])]; },
  carRoute(b: any) { return b.jockey?.route() ?? null; },
  open:isOpen,
  // ---- a customer's visit, step by step ----
  visit(p: any, done: () => void) {
    if (!isOpen()) { p.forMotors = false; p.wait(1.5, 'Sahel Motors is shut').then(() => done()); return; }
    p.forMotors = false;
    this.visitors.add(p); p.mv = { done, wants:null, tries:0 };
    p.walk([OUT_DOOR, IN_DOOR, [624, AISLE]], 'going in to Sahel Motors');
    const spots = viewSpots(), n = rng() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) { const s = spots[Math.floor(rng() * spots.length)]; p.mv.wants = s.model;
      p.walk([[s.x, AISLE]], `looking at the ${s.model}`).face(s.h).wait(rand(5, 9), `looking at the ${s.model}`); }
    p.then((q: any) => this.next(q));
  },
  next(p: any) {
    if (!testCar.busy && !p.mv.drove && rng() < 0.3 && !hooks.raining()) this.testDrive(p); else this.toDesk(p);
  },
  toDesk(p: any) {
    const d = DESKS.find((d: any) => d.consultant && !d.consultant.away && !d.with && !d.chairs.some((c: any) => c.by));
    if (!d) {
      if (++p.mv.tries > 3) { this.leave(p, [[p.x, AISLE]]); return; }
      const seat = LOUNGE.find((s: any) => !s.by);
      if (seat) { seat.by = p; const way = seat.h === 0 ? [[582, -38], [575.4, -38], [575.4, seat.at[1]]] : [[582, -38], [seat.at[0], -37.2]];
        p.walk([[586.8, AISLE], [586.8, -35.4], ...way, seat.at], 'waiting for a consultant')
        .face(seat.h).then((q: any) => q.sitOn(seat)).wait(rand(8, 14), 'waiting for a consultant')
        .then((q: any) => { q.standUp(); q.walk([...[...way].reverse(), [586.8, -35.4], [586.8, AISLE]]).then((r: any) => this.toDesk(r)); }); }
      else p.wait(rand(5, 9), 'waiting for a consultant').then((q: any) => this.toDesk(q));
      return;
    }
    const c = d.chairs[rng() < 0.5 ? 0 : 1]; c.by = p; d.with = p; d.consultant.with = p;
    p.walk([[c.at[0], AISLE], [c.at[0], -35.6], c.at], `sitting down with ${d.consultant.id}`).face(c.h).then((q: any) => q.sitOn(c))
      .wait(rand(10, 18), `talking to ${d.consultant.id} about the ${p.mv.wants ?? 'Gull'}`).then((q: any) => this.decide(q, d, c));
  },
  decide(p: any, d: any, c: any) {
    p.standUp(); d.with = null; d.consultant.with = null;
    const buy = rng() < 0.5 && this.stock() > 0 && this.orders.length < 3;
    if (!buy) { this.leave(p, [[c.at[0], -35.6], [c.at[0], AISLE]]); return; }
    // a sale: the car comes down from its tower and round to the bay while they wait in the handover lounge
    d.consultant.sold++; this.sold++; this.soldDay++;
    const order = { buyer:p, b:null as any, t:sim.t, seat:WAITING.find((s: any) => !s.by) ?? null };
    this.orders.push(order); this.fetchFor(order);
    const s = order.seat; if (s) s.by = p;
    p.walk([[c.at[0], -35.6], [c.at[0], AISLE], [587.5, AISLE], ...BAY_GATE, s ? [s.at[0], s.at[1] + 1.0] : [580, -30.2], ...(s ? [s.at] : [])], 'going to the handover lounge')
      .face(Math.PI / 2).then((q: any) => { if (s) q.sitOn(s); }).wait(1e6, 'waiting for their new car');
  },
  // the car for an order: one of the model they came for if there is one, from whichever tower holds it
  fetchFor(o: any) {
    const all = this.towers.flatMap((t: Tower) => t.cars().filter((b: any) => !b.buyer).map((b: any) => [t, b]));
    const pickd = all.filter(([, b]: any) => b.model === o.buyer.mv.wants), pool = pickd.length ? pickd : all;
    if (!pool.length) return;
    const [t, b] = pool[Math.floor(rng() * pool.length)] as [Tower, any], [L, k] = t.where(b)!;
    b.buyer = o.buyer.id; o.b = b;
    t.jobs.push({ kind:'fetch', b, L, k, step:'rise', t:0,
      canLeave:() => !this.bay.car && apron.claim(t),
      go:(car: any) => {
        car.mstate = 'toBay'; const gx = t.cx, gy = t.cy + 2.25, BAY = A.bay;
        apron.holder = new Jockey(car, [{ path:new Path([[gx, gy], [gx, A.out], [BAY + 9, A.out]], 3.5), v:3.6 }, { path:new Path([[BAY + 4.5, A.out], [BAY, A.out], [BAY, -24]], 3), back:true, v:1.5 }],
          'the handover bay', (j: Jockey) => { car.mstate = 'bay'; this.bay.car = car; this.bay.order = o; apron.release(j); this.handover(o); });
        this.moving.push(apron.holder);
      } });
  },
  moving:[] as Jockey[],
  handover(o: any) {
    const p = o.buyer; p.standUp(); p.steps = []; if (o.seat?.by === p) o.seat.by = null;
    p.walk([[p.x + 0.2, -29.0], [581.6, -27.0], [580.5, -21.8]], 'going to their new car').face(Math.PI).then(() => this.driveOff(o));
  },
  driveOff(o: any) {
    const p = o.buyer, b = o.b, car = new NewCar(b, p.id, [A.bay, -19.5]);
    this.orders.splice(this.orders.indexOf(o), 1); this.bay.car = null; this.bay.order = null;
    this.visitors.delete(p);
    const followed = hooks.isSelected(p) || hooks.isSelected(b);
    if (hooks.isSelected(b)) hooks.handOff(b, car); else if (hooks.isSelected(p)) hooks.handOff(p, car);
    b.mstate = 'sold'; b.group.removeFromParent(); hooks.forget(b); p.remove();
    if (followed) car.followed = true;
  },
  leave(p: any, first: number[][]) {
    p.walk([...first, [624, AISLE], IN_DOOR, OUT_DOOR], 'leaving Sahel Motors').then((q: any) => { this.visitors.delete(q); q.mv.done(); });
  },
  testDrive(p: any) {
    testCar.busy = p; p.mv.drove = true;
    p.walk([[587.5, AISLE], ...BAY_GATE, [574.2, -27], [573.4, -20.4], [570.5, -20.4], [570.5, -18], [507, -18], PIT.door], 'walking over to the test track')
      .then((q: any) => { q.hidden = true; q.place(); testCar.driver = q; testCar.drives++; testCar.lapT = 0; q.label = 'on a test drive · Petrel GT'; }).wait(1e6, 'on a test drive · Petrel GT');
  },
  backFromDrive(p: any) {
    testCar.busy = null; p.hidden = false; p.steps = []; p.x = PIT.door[0]; p.y = PIT.door[1]; p.place();
    p.walk([[507, -18], [570.5, -18], [570.5, -20.4], [573.4, -20.4], [574.2, -27], ...[...BAY_GATE].reverse(), [587.5, AISLE]], 'walking back from the test track').then((q: any) => this.toDesk(q));
  },
  // ---- the staff come in before opening and go home after closing ----
  staffing() {
    const h = hourAt(sim.t), on = h >= OPEN[0] - 0.4 && h < OPEN[1] + 0.3;
    if (on && !this.staff.length) {
      DESKS.forEach((d: any, i: number) => this.comeIn(new Consultant(STAFF[i], d.staff, 'Sales consultant', OUT_DOOR), d, [[d.x + 1.2, AISLE], [d.x + 1.2, -41.0]]));
      this.comeIn(new Consultant('N. Faris', RECEPTION, 'Receptionist', OUT_DOOR), null, [[622, -23.0]]);
    }
    if (!on && this.staff.length && !this.visitors.size) for (const c of [...this.staff]) if (!c.going) {
      c.going = true; if (c.desk && c.d) c.d.consultant = null;
      c.standUp(); c.steps = [];
      c.walk([...(c.d ? [[c.d.x + 1.2, -41.0], [c.d.x + 1.2, AISLE]] : [[622, -23.0]]), [624, AISLE], IN_DOOR, OUT_DOOR, [A.walk, -8]], 'going home').then((q: any) => { this.staff.splice(this.staff.indexOf(q), 1); q.remove(); });
    }
  },
  comeIn(c: Consultant, d: any, way: number[][]) {
    this.staff.push(c); c.d = d; c.desk = d ? DESK_NAME[DESKS.indexOf(d)] : 'reception'; if (d) d.consultant = c;
    c.walk([IN_DOOR, [624, AISLE], ...way, c.seat.at], 'coming in to work').face(c.seat.h).then((q: any) => { c.seat.by = q; q.sitOn(c.seat); q.label = d ? 'at their desk' : 'at reception'; });
  },
  // customers on their way up from the city: most off the metro at Motor District, the rest from the boulevard
  nextCustomer:20,
  customers(dt: number) {
    if ((this.nextCustomer -= dt) > 0) return;
    this.nextCustomer = rand(10, 18);
    const h = hourAt(sim.t); if (h < OPEN[0] || h > OPEN[1] - 1.2 || this.visitors.size + sim.people.filter((p: any) => p.forMotors).length >= 6) return;
    const to = CITY_PORTALS.find(q => q.kind === 'motors'), pool = CITY_PORTALS.filter(q => q.kind === 'metro' && q.name.startsWith('Motor District'));
    const from = rng() < 0.7 && pool.length ? pool[Math.floor(rng() * pool.length)] : CITY_PORTALS.filter(q => q.kind === 'edge' && q.name.includes('boulevard'))[0];
    if (!to || !from) return;
    const c = new Citizen(from, to); c.forMotors = true;
  },
  update(dt: number) {
    this.customers(dt);
    const day = Math.floor((sim.t + (hourAt(0) / 24) * 360) / 360); if (day !== this.day) { this.day = day; this.soldDay = 0; for (const c of this.staff) c.sold = 0; }
    this.staffing();
    for (const t of this.towers) t.update(dt);
    shuttle.update(dt);
    for (const j of [...this.moving]) if (!j.b.jockey) this.moving.splice(this.moving.indexOf(j), 1); else j.update(dt);
    crossing.update(dt); testCar.update(dt);
    for (const g of this.spin) g.rotation.y += dt * 0.25;
    // the lounge's consultant label follows whoever they are with
    for (const c of this.staff) if (c.sit && c.d) c.label = c.with ? `with ${c.with.id}` : 'at their desk';
  },
  spin:[] as THREE.Object3D[],
  // a few pixels a metre out, the cars turning on their stands inside are left out
  detail(on: boolean) { for (const g of this.spin) g.visible = on; },
  status() { const n = this.visitors.size; return isOpen() ? `open · ${n} customer${n === 1 ? '' : 's'} in · ${this.stock()} cars in the towers` : `closed · opens at ${String(OPEN[0]).padStart(2, '0')}:00`; },
  info() {
    const st = this.stock(), cap = this.towers.length * A.levels * 8;
    return { kind:'Car showroom · Car Works\' dealer', title:this.id, status:this.status(), bar:{ v:st, max:cap, label:`${st} of ${cap} tower bays full` },
      rows:[['Hours', `${String(OPEN[0]).padStart(2, '0')}:00–${OPEN[1]}:00`], ['On show', '5 cars · two on turntables'], ['Sold today', String(this.soldDay)], ['Sold', String(this.sold)],
        ['By rail', `${this.delivered} cars on ${shuttle.id}`], ['Prices', 'Gull from SAR 79,900 · Petrel GT SAR 164,000']],
      actions:[['Look inside', () => hooks.lookInside(this)]] };
  },
  readout() { return `sahel motors · ${this.status()}`; },
  entities() { return [this, ...this.towers, shuttle, crossing, testCar, ...this.towers.flatMap((t: Tower) => [...t.kept]), ...shuttle.coming.map((q: any) => q.b), ...(shuttle.off ? [shuttle.off.b] : []),
    ...this.moving.map((j: Jockey) => j.b), ...(this.bay.car ? [this.bay.car] : []), ...this.towers.flatMap((t: Tower) => t.jobs.filter((j: any) => j.b && (j.step === 'rise' || j.step === 'push' || j.step === 'pull' || j.step === 'down' || j.step === 'leave') && j.b.group.parent).map((j: any) => j.b))]; },
};
hooks.motorsVisit = (p: any, done: () => void) => motors.visit(p, done);

export function buildMotors() {
  const { site, showroom } = buildMotorsSite();
  scene.add(site, showroom);
  motors.groups = [showroom]; motors.peek = showroom.userData.peek; showroom.userData.entity = motors;
  motors.towers = [new Tower(0), new Tower(1)];
  Object.assign(motors, { shuttle, crossing, testCar });
  // a click on the site's own part says which of its things it was
  site.userData.entity = { kind:'showroom', id:'Sahel Motors', groups:[], resolve:(pt: THREE.Vector3) => {
    for (const t of motors.towers) if (Math.hypot(pt.x - t.cx, pt.z - t.cy) < A.towerR + 0.8) return t;
    if (pt.x > A.track[0] - 2 && pt.x < A.track[1] + 2 && pt.z > A.track[2] - 2 && pt.z < A.track[3] + 2) return testCar;
    if (crossing.bbox.containsPoint(pt)) return crossing;
    if (pt.z > SY - 2 && pt.z < SY + 2 && pt.x < A.sidingX[1] + 1) return shuttle;
    return motors; } };
  // the stock the towers opened with: a little over half full, all three models
  let seq = 700;
  for (const t of motors.towers) { for (let L = 1; L <= A.levels; L++) for (let k = 0; k < 8; k++) if (rng() < 0.5) {
    const b = new Body(seq++, sim.t - rand(2000, 30000)); b.setModel('complete'); b.remove(); t.put(b, L, k); }
    t.draw(); }
  // the shuttle: loco first, two carriers behind, standing at Car Works' dock
  const protos: Record<string, () => THREE.Group> = { loco:() => buildLoco('CS-1', 1), carrier:() => buildCarrier() };
  shuttle.vehicles = VEH.map(v => { const g = protos[v.kind](); g.userData.entity = shuttle; scene.add(g); return g; });
  shuttle.groups = shuttle.vehicles; shuttle.beacon = shuttle.vehicles[0].getObjectByName('beaconF');
  shuttle.ramp = buildMotorsRamp(); pose(shuttle.ramp, A.ramp - 7, SY, 0, 0.04); shuttle.ramp.traverse((o: any) => { o.userData.entity = shuttle; }); scene.add(shuttle.ramp);
  shuttle.place();
  // the crossing's arms and lamps
  for (const post of CROSSING.posts) {
    for (const [len, h] of post.arms) { const outer = new THREE.Group(); pose(outer, post.x, post.y, h, 1.15); const arm = buildBarrierArm(len); outer.add(arm); scene.add(outer); crossing.arms.push(arm); arm.userData.entity = crossing; }
    if (post.lamps) for (const dx of [-0.38, 0.38]) { const l = new Part().box(post.x + dx - 0.13, post.y + 0.22, 2.58, 0.26, 0.08, 0.26, 'l').build('lamp'); l.userData.entity = crossing; scene.add(l); crossing.lamps.push(l); }
  }
  crossing.update(0);
  // the cars on the turntables, and the demonstrator at the test track's line
  for (const [i, [x, y]] of TURNTABLES.entries()) {
    const g = new THREE.Group(); pose(g, x, y, 0, 0.04); const tt = buildTurntable(); g.add(tt);
    const car = PROTO.body[`complete_${i ? 'n' : 'k'}`].clone(); pose(car, 2.25, 0, 0, 0.14); g.add(car); g.userData.entity = motors; showroom.add(g); motors.spin.push(g);
  }
  testCar.group = PROTO.body.complete_k.clone(); testCar.group.userData.entity = testCar; testCar.groups = [testCar.group]; scene.add(testCar.group); testCar.update(0);
  motors.staffing();
  // everyone already at their desk when the town starts
  for (const c of motors.staff) { c.steps = []; c.x = c.seat.at[0]; c.y = c.seat.at[1]; c.seat.by = c; c.sitOn(c.seat); c.label = c.d ? 'at their desk' : 'at reception'; c.place(); }
  return motors;
}
