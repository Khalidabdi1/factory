// @ts-nocheck
import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { pose } from '../kernel/part';
import { rand, rng } from '../kernel/math';
import { PIER } from '../layout';
import { COASTER, GONDOLAS, HORSES, buildCarousel, buildCoasterCar, buildPier, buildWheel, coasterZ } from '../world/pier';
import { lookOf } from '../models/people';
import { PROTO, hourAt, kmh, sim } from './core';
import { PORTALS, Walker, nextPortal, portal } from './people';

// The rides on Sunset Pier and the people on them. Visitors come up the neck, queue at a ride, ride, and either queue
// again or buy something from a kiosk and go. A rider is drawn as a small figure on the ride (the walker is hidden
// meanwhile). Open 10:00–23:00; in rain (when there is weather) the rides stop and everyone goes.
const D = PIER.deck, NECK_END = [330, 297.6], tmp = new THREE.Vector3();
export const fair = { tickets:0, open:() => { const h = hourAt(sim.t); return h >= 10 && h < 23 && !hooks.raining(); } };
hooks.fairOpen = fair.open;
const figure = id => { const { variant, scale } = lookOf('walker', id), f = PROTO.personLite.walker[variant].clone(); f.scale.setScalar(scale); f.raycast = () => {}; f.traverse(o => { o.raycast = () => {}; }); return f; };
const visitors = () => sim.people.filter(p => p.fair);

class Ride {
  constructor(o) { Object.assign(this, { queue:[], riders:[], rides:0, state:'loading', t:0 }, o); }
  // the k-th place in the queue
  spot(k) { return [this.q0[0] + this.qd[0] * k, this.q0[1] + this.qd[1] * k]; }
  join(p) {
    this.queue.push(p); const at = this.spot(this.queue.length - 1);
    p.steps = []; p.walk([...this.via, at], `to the ${this.name}`).face(this.qh).then(q => { q.queued = true; }).wait(1e9, `queueing for the ${this.name}`);
  }
  // on: the walker vanishes onto a seat; off: they reappear at the exit and choose what next
  board(p, seat, at) {
    this.queue.splice(this.queue.indexOf(p), 1); p.queued = false; p.steps = [{ do:'wait', t:1e9, label:`riding the ${this.name}` }]; p.label = `riding the ${this.name}`; p.hidden = true; p.place();
    const f = figure(p.id); seat.add(f); f.position.copy(at); this.riders.push({ p, f, seat, lap:0 }); fair.tickets++; this.rides++;
    this.queue.forEach((q, k) => { if (q.queued) { const s = this.spot(k); q.x = s[0]; q.y = s[1]; } });
  }
  alight(r) {
    r.f.removeFromParent(); this.riders.splice(this.riders.indexOf(r), 1);
    const p = r.p; p.hidden = false; [p.x, p.y] = this.exit; p.steps = []; p.place(); afterRide(p);
  }
  leaveAll() { for (const r of [...this.riders]) this.alight(r); for (const p of [...this.queue]) { this.queue.splice(this.queue.indexOf(p), 1); p.queued = false; p.steps = []; goHome(p); } }
  info() {
    return { kind:`${this.title} · Sunset Pier`, title:this.id, status:this.status(), rows:[...this.rows(), ['Riding', String(this.riders.length)], ['Queue', String(this.queue.length)], ['Rides today', String(this.rides)]] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
}

// The Ferris wheel turns slowly and stops for a moment whenever a gondola at the bottom has someone to let off or on.
// A rider goes round once.
class Wheel extends Ride {
  constructor(g) {
    super({ kind:'ride', id:'Big Wheel', title:'Ferris wheel', name:'Big Wheel', groups:[g], pick:[PIER.wheel.x, PIER.wheel.y, 12], q0:[340.4, 307.5], qd:[-0.9, 0], qh:0,
      via:[NECK_END, [338, 303]], exit:[341, 305.6] });
    this.rotor = g.getObjectByName('rotor'); this.gond = Array.from({ length:GONDOLAS }, (_, i) => this.rotor.getObjectByName(`gondola${i}`));
    this.seats = this.gond.map(() => null); this.th = 0; this.hold = 0; this.turned = this.gond.map(() => 0);
  }
  bottom() { let best = 0, lo = Infinity; this.gond.forEach((q, i) => { q.getWorldPosition(tmp); if (tmp.y < lo) { lo = tmp.y; best = i; } }); return [best, lo]; }
  update(dt) {
    if (!fair.open()) { if (this.riders.length || this.queue.length) this.leaveAll(); this.state = 'closed'; return; }
    this.rotor.updateMatrixWorld(true);
    const [i, lo] = this.bottom(), atBottom = lo < PIER.wheel.z - PIER.wheel.r + 0.15;
    if (this.hold > 0) { this.hold -= dt; this.state = 'stopped to load'; }
    else {
      const r = this.riders.find(q => q.i === i), next = this.queue.find(p => p.queued);
      if (atBottom && r && this.turned[i] > Math.PI * 1.7) { this.alight(r); this.seats[i] = null; this.hold = 2.2; }
      else if (atBottom && !this.seats[i] && next && this.turned[i] > 0.6) { this.board(next, this.gond[i], new THREE.Vector3(0, -2.23, 0)); this.riders[this.riders.length - 1].i = i; this.seats[i] = next; this.turned[i] = 0; this.hold = 2.2; }
      else { const w = 0.12 * dt; this.th += w; this.turned = this.turned.map(t => t + w); this.state = 'turning'; }
    }
    this.rotor.rotation.x = this.th; for (const q of this.gond) q.rotation.x = -this.th;
  }
  status() { return this.state === 'closed' ? 'closed' : `${this.state} · ${this.riders.length} riding`; }
  rows() { return [['Height', '21 m'], ['Gondolas', String(GONDOLAS)]]; }
}
// The carousel loads for a few seconds, then turns for twenty, the horses rising and falling.
class Carousel extends Ride {
  constructor(g) {
    super({ kind:'ride', id:'Carousel', title:'Carousel', name:'carousel', groups:[g], pick:[PIER.carousel.x, PIER.carousel.y, 3], q0:[322, 299.2], qd:[0.9, 0], qh:Math.PI / 2,
      via:[NECK_END, [326, 299.2]], exit:[326.8, 300.6] });
    this.rotor = g.getObjectByName('rotor'); this.horses = Array.from({ length:HORSES }, (_, i) => this.rotor.getObjectByName(`horse${i}`)); this.phi = 0;
  }
  update(dt) {
    if (!fair.open()) { if (this.riders.length || this.queue.length) this.leaveAll(); this.state = 'closed'; return; }
    this.t += dt;
    if (this.state === 'loading' || this.state === 'closed') {
      if (this.state === 'closed') { this.state = 'loading'; this.t = 0; }
      for (const r of [...this.riders]) this.alight(r);
      const free = this.horses.filter(h => !this.riders.some(r => r.seat === h));
      for (const p of this.queue.filter(q => q.queued).slice(0, free.length)) this.board(p, free.shift(), new THREE.Vector3(-0.05, -0.55, 0));
      if (this.t > 6 && this.riders.length) { this.state = 'turning'; this.t = 0; }
    } else if (this.t > 20) { this.state = 'loading'; this.t = 0; }
    if (this.state === 'turning') this.phi += dt * 0.55;
    this.rotor.rotation.y = -this.phi;
    this.horses.forEach((h, i) => { h.position.y = 1.0 + (this.state === 'turning' ? 0.3 * Math.sin(sim.t * 2.4 + i * 1.7) : 0); });
  }
  status() { return this.state === 'closed' ? 'closed' : `${this.state === 'turning' ? 'turning' : 'loading'} · ${this.riders.length} riding`; }
  rows() { return [['Horses', String(HORSES)]]; }
}
// The coaster: three cars, a chain lift, then gravity; it waits at the station to let riders off and on.
class Coaster extends Ride {
  constructor() {
    const cars = [0, 1, 2].map(() => { const c = PROTO.coasterCar.clone(); c.rotation.order = 'YZX'; scene.add(c); return c; });
    super({ kind:'coaster', id:'Gull Dipper', title:'Roller coaster', name:'coaster', groups:cars, pick:[-0.8, 0, 0.6], q0:[314.4, 306.9], qd:[-0.9, 0], qh:Math.PI / 2,
      via:[NECK_END, [312, 299], [313.5, 305.5]], exit:[311.5, 305] });
    this.cars = cars; this.s = 2.2; this.v = 0; this.lap = 0; this.L = COASTER.path.length; this.state = 'loading';
    for (const c of cars) c.userData.entity = this;
  }
  update(dt) {
    const open = fair.open();
    if (!open && this.state === 'loading') { if (this.riders.length || this.queue.length) this.leaveAll(); this.state = 'closed'; }
    if (this.state === 'closed') { if (open) { this.state = 'loading'; this.t = 0; } }
    else if (this.state === 'loading') {
      this.t += dt;
      for (const r of [...this.riders]) this.alight(r);
      const seated = new Set(this.riders.map(r => r.k)), slots = [0, 1, 2, 3, 4, 5].filter(k => !seated.has(k));
      for (const p of this.queue.filter(q => q.queued).slice(0, slots.length)) { const k = slots.shift(); this.board(p, this.cars[k >> 1], new THREE.Vector3(-0.55 - (k & 1) * 0.0, -0.2, (k & 1 ? 0.25 : -0.25))); this.riders[this.riders.length - 1].k = k; }
      if (this.t > 5 && this.riders.length) { this.state = 'running'; this.t = 0; this.lap = 0; }
    } else {
      const f = ((this.s % this.L) + this.L) % this.L / this.L, [l0, l1] = COASTER.lift;
      // the chain pulls it up the lift; after that it runs on what the height gives it
      this.v = f >= l0 && f <= l1 ? 1.6 : Math.max(2.2, Math.sqrt(Math.max(0, 2 * 9.81 * (D + 5.8 - coasterZ(this.s)) * 0.6)));
      this.s += this.v * dt; this.lap += this.v * dt;
      if (this.lap >= this.L) { this.s = 2.2; this.v = 0; this.state = 'loading'; this.t = 0; }   // round once, back at the station
    }
    this.cars.forEach((c, k) => {
      const s = this.s - k * 1.85, a = COASTER.path.at(s), z = coasterZ(s), pitch = Math.atan2(coasterZ(s + 0.4) - coasterZ(s - 0.4), 0.8);
      pose(c, a.x, a.y, a.h, z + 0.05); c.rotation.z = pitch;
    });
  }
  status() { return this.state === 'closed' ? 'closed' : this.state === 'loading' ? `at the station · ${this.riders.length} aboard` : `running · ${kmh(this.v)} · ${this.riders.length} aboard`; }
  rows() { return [['Track', `${Math.round(this.L)} m`], ['Top of the lift', `${(5.8 + D).toFixed(1)} m`], ['Speed', kmh(this.state === 'running' ? this.v : 0)]]; }
  route() { return { path:COASTER.path, s:this.s, closed:true }; }
}

// after a ride: another one, sometimes; otherwise something from a kiosk, a look at the sea, and off
const KIOSKS = [[310.2, 300.6, 'buying an ice cream'], [349.8, 300.6, 'buying candy floss'], [318, 299.6, 'sitting on a bench'], [338, 299.6, 'sitting on a bench']];
function afterRide(p) {
  if (fair.open() && rng() < 0.35) { pickRide().join(p); return; }
  const [x, y, label] = KIOSKS[Math.floor(rng() * KIOSKS.length)];
  p.walk([[x, y]], label).face(-Math.PI / 2).wait(rand(5, 10), label).then(q => goHome(q));
}
function goHome(p) { p.fair = false; p.walk([NECK_END], 'leaving the pier').then(q => { q.from = PIER_PORTAL; q.trip(nextPortal(PIER_PORTAL, 'fair')); }); }
let RIDES = [];
const pickRide = () => RIDES[Math.floor(rng() * RIDES.length)];
let PIER_PORTAL = null;
hooks.fairVisit = w => { w.fair = true; if (!fair.open()) { goHome(w); return; } pickRide().join(w); };

// build the pier and its rides, and the entities to click
export function buildFair() {
  PROTO.coasterCar = buildCoasterCar();
  const pierG = buildPier(), wheelG = buildWheel(), carouselG = buildCarousel();
  scene.add(pierG, wheelG, carouselG);
  const wheel = new Wheel(wheelG), carousel = new Carousel(carouselG), coaster = new Coaster();
  wheelG.userData.entity = wheel; carouselG.userData.entity = carousel;
  RIDES = [wheel, carousel, coaster];
  PIER_PORTAL = portal('fair', 'Sunset Pier', [330, 290], { w:8 });   // a busy place: about one walk in ten ends here while it is open
  const pier = { kind:'pier', id:'Sunset Pier', groups:[pierG], pick:[330, 300, 3], rides:RIDES,
    info() {
      const open = fair.open(), on = visitors().length, riding = RIDES.reduce((n, r) => n + r.riders.length, 0);
      return { kind:'Pleasure pier', title:'Sunset Pier', status:open ? `open · ${on} on the pier` : hooks.raining() ? 'rides stopped for the rain' : 'closed · opens at 10:00',
        rows:[['Hours', '10:00–23:00'], ['Riding now', String(riding)], ['Tickets today', String(fair.tickets)], ...RIDES.map(r => [r.title, r.status()])] };
    },
    readout() { return `sunset pier · ${this.info().status}`; } };
  pierG.userData.entity = pier;
  // day-trippers come up off the beach nearby, or in from the east end of the promenade, straight for the pier
  const ends = PORTALS.filter(q => q.kind === 'beach' && q.p[0] > 220 || q.kind === 'edge' && /east end of the promenade/.test(q.name)); let next = 4;
  return { pier, rides:RIDES, update(dt) {
    for (const r of RIDES) r.update(dt);
    if ((next -= dt) > 0) return;
    next = rand(7, 13);
    if (fair.open() && sim.people.filter(p => p.fair || p.to === PIER_PORTAL).length < 14) new Walker(ends[Math.floor(rng() * ends.length)], PIER_PORTAL);
  } };
}
