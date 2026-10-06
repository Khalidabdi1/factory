// @ts-nocheck
import * as THREE from 'three';
import { hooks, noop, scene } from '../shared';
import { W } from '../kernel/iso';
import { Part, glow, pose, v3 } from '../kernel/part';
import { ease, pick, rand } from '../kernel/math';
import { Path } from '../kernel/path';
import { STATION, zAt } from '../layout';
import { ENGINE_LEN, buildFireEngine } from '../models/vehicles';
import { SEATS, buildFireStation } from '../world/station';
import { PROTO, clock, kmh, sim } from './core';
import { Car } from './cars';
import { Person } from './person';
import { homes } from './homes';
import { kerbStop, locate, trip } from './roadnet';
import { kerbward, laneClear, pullIn, roadVehicles, streetAt } from './roads';

// ---- Riverside Fire Station, ENG-1 and the chimney fires ----
// Now and then a chimney catches: smoke and then flames at the top of the stack, the household out on the pavement.
// A neighbour calls it in; the bell goes at the station, the bay door rolls up, the watch runs to the engine and
// ENG-1 drives out with its lights going, by the shortest way, and pulls in at the kerb. The officer stands at the
// gate, the driver at the pump; two firefighters run a hose up the garden path and put a jet on the chimney until it
// is out. They make up the hose, the household goes back in, and ENG-1 drives home and backs into its bay.
const L = ENGINE_LEN, PARK = STATION.park, EDGE = [PARK[0], 120.5], REVERSE = new Path(STATION.reverse, 5);
const HOME_AT = [STATION.reverse[0][0] - L, STATION.reverse[0][1]];   // where ENG-1's front is when it starts to back in
const TANK = 1800;
const parked = () => new Path([[PARK[0], PARK[1] - 6], PARK]);
const lenOf = pts => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
const quiet = o => o.traverse(m => { m.raycast = noop; });   // smoke, hose and jet never take a click from what is behind them

// The watch: where each is while the engine is in, the way out to the hall, and the last steps to their door of the
// cab (the west doors are reached round the back of the engine)
const BACK = [[367.2, 99.9], [362.8, 99.9]];
const CREW = [
  { name:'S. Mensah', role:'officer', at:[381.2, 109.6], h:Math.PI / 2, label:'in the watch room', via:[[383, 107.2], [383, 105.2], [377.6, 104.2], [367.2, 104.2]], cab:[...BACK, [362.8, 108.6]] },
  { name:'L. Novak', role:'driver', hall:true, label:'checking the engine', via:[], cab:[[367.2, 108.6]] },
  { name:'A. Byrne', role:'firefighter', seat:SEATS[0], label:'at the mess table', via:[[387, 104.5], [377.6, 104.2], [367.2, 104.2]], cab:[[367.2, 106.2]] },
  { name:'J. Ito', role:'firefighter', seat:SEATS[3], label:'at the mess table', via:[[390.6, 108], [390.6, 104.5], [377.6, 104.2], [367.2, 104.2]], cab:[...BACK, [362.8, 106.2]] },
];
const HALL = [[[368.3, 104.5], Math.PI], [[368.3, 108.4], Math.PI], [[367.4, 99.8], Math.PI * 0.8]];
const ROLE = { officer:'watch officer', driver:'driver · pump operator', firefighter:'firefighter' };

class Firefighter extends Person {
  constructor(c, x, y, h) { super({ look:'fire', id:c.name, crew:c, x, y, h, speed:1.4 }); c.p = this; }
  // at the station, between calls: the officer at the watch desk, the driver round the engine, the others at the mess table
  think() {
    const c = this.crew;
    if (!this.home) { this.wait(1, this.label || 'standing by'); return; }
    if (c.hall) { const [at, h] = HALL[this.done++ % HALL.length]; this.walk([at], c.label).face(h).wait(rand(4, 9), c.label); return; }
    if (c.seat) { if (this.sit) this.wait(6, c.label); else this.walk([c.seat.at]).face(c.seat.h).then(p => { c.seat.by = p; p.sitOn(c.seat); }); return; }
    this.walk([c.at]).face(c.h).wait(6, c.label);
  }
  // the bell: up and to the engine at a run
  turnOut() {
    const c = this.crew; this.standUp(); this.steps = []; this.speed = 4.0; this.home = false;
    const from = c.hall && this.y < 101 ? [[367.4, 99.8]] : [];
    this.walk([...from, ...c.via, ...c.cab], 'turning out').then(p => p.board());
  }
  board() { engine.aboard++; this.crew.p = null; this.remove(); }
  info() {
    return { kind:`Firefighter · ${ROLE[this.crew.role]}`, title:this.id, status:this.status(),
      rows:[['Station', station.id], ['Watch', 'Red Watch'], ['Engine', engine.id], ...(this.carrying ? [['Carrying', this.carrying]] : [])] };
  }
}
// back from a call: off at the cab and back to their places
function crewHome() {
  engine.aboard = 0;
  for (const c of CREW) {
    const at = c.cab[c.cab.length - 1], p = new Firefighter(c, at[0], at[1], -Math.PI / 2);
    p.walk([...c.cab.slice(0, -1).reverse(), ...[...c.via].reverse()], 'back from a call').then(q => { q.home = true; q.speed = 1.4; });
  }
}

// The household, out on the pavement watching, and back in once it is out
class Evacuee extends Person {
  constructor(name, house, i) {
    const [dx, dy] = house.door, [kx, ky] = house.kerb;
    super({ look:'walker', id:name, house, x:dx, y:dy, h:Math.PI / 2, speed:1.6 });
    this.walk([[dx, dy + 1.2], [kx, ky - 1.6], [kx, ky - 0.1], [kx + 3.4 + 0.95 * i, ky - 0.1]], 'out of the house').face(-Math.PI / 2);
  }
  think() { this.wait(3, 'watching the fire'); }
  goHome() { const [dx, dy] = this.house.door, [kx, ky] = this.house.kerb; this.steps = []; this.walk([[kx, ky - 0.1], [kx, ky - 1.6], [dx, dy + 1.2], [dx, dy]], 'going back in').then(p => p.remove()); }
  info() { return { kind:'Resident · out of the house', title:this.id, status:this.status(), rows:[['Lives at', this.house.id], ['Household', this.house.household.text]] }; }
}

// ---- ENG-1 ----
export let engine = null;
export class FireEngine extends Car {
  constructor() {
    super({ kind:'fire', role:'fire', id:'ENG-1', proto:PROTO.fireEngine, len:L, vmax:14, v:0, path:parked() });
    this.halfW = 1.3; this.state = 'in'; this.aboard = 0; this.calls = 0; this.water = TANK; this.lights = false; this.parked = true;
    this.barL = this.group.getObjectByName('barL'); this.barR = this.group.getObjectByName('barR');
    this.s = this.path.length; this.park(); this.place(); engine = hooks.engine = this;
  }
  park() { this.stops = [{ s:this.path.length, name:station.id, label:'in the station', release:() => false }]; this.si = 0; this.at = null; }
  drive(pts, name, arrive) { this.path = new Path(pts, 5); this.s = 0; this.si = 0; this.at = null; this.parked = false; this.stops = [{ s:this.path.length, name, label:name, release:() => false, arrive }]; }
  // backing in, the rear end leads along REVERSE and the front follows it. A body this long, at an angle across a lane,
  // is seen by the traffic at four points along it, not just its two ends
  place() {
    if (this.state !== 'reversing') super.place();
    else { const R = REVERSE.at(this.rs), F = REVERSE.at(this.rs - L), h = Math.atan2(F.y - R.y, F.x - R.x); pose(this.group, F.x, F.y, h); this.front = { x:F.x, y:F.y, h }; }
    const { x, y, h } = this.front, c = Math.cos(h), s = Math.sin(h);   // the body is rigid, straight back from the front
    this.points = [0, 1 / 3, 2 / 3, 1].map(t => [x - c * L * t, y - s * L * t]);
  }
  alert() { this.state = 'boarding'; this.lights = true; this.exit = null; for (const c of CREW) c.p?.turnOut(); }
  // out of the bay to the edge of the apron, then right into the westbound lane, or left over it into the eastbound
  // one, whichever way is shorter, once the lanes it takes are clear
  leave() {
    const H = blaze.house; H.stop ??= kerbStop(...H.kerb);
    this.exit = [[{ x:358, y:127.5, h:Math.PI }, [[PARK[0], 127.5]], 0], [{ x:372, y:134.5, h:0 }, [[PARK[0], 134.5]], 8]]
      .map(([from, lead, extra]) => { const pts = trip(from, H.stop); return pts && { from, lead, pts, len:lenOf(pts) + extra }; }).filter(Boolean).sort((a, b) => a.len - b.len)[0];
    if (!this.exit) { this.state = 'in'; this.lights = false; crewHome(); blaze.stand(); return; }
    this.state = 'toEdge'; this.drive([PARK, EDGE], 'the edge of the apron', () => { this.state = 'atEdge'; });
  }
  pullOut() {
    const e = this.exit, west = e.from.h !== 0;
    if (!(west ? laneClear(this, 358, 127.5, Math.PI, 40, 6) : laneClear(this, 372, 134.5, 0, 36, 6) && laneClear(this, PARK[0], 127.5, Math.PI, 40, 10))) return;
    this.state = 'out'; this.calls++; blaze.tOut = sim.t;
    this.drive([EDGE, ...e.lead, ...pullIn(e.pts, 2.2)], blaze.house.id, () => this.arrive());
  }
  arrive() { this.state = 'scene'; this.parked = true; blaze.onScene(); }
  // all aboard: back out into the lane once it is clear, home by the shortest way, to the stop past the bay
  merge() {
    const f = this.front, m = kerbward([f.x + Math.cos(f.h) * 9, f.y + Math.sin(f.h) * 9], f.h, -2.2);
    if (!laneClear(this, m[0], m[1], f.h, 45, 10)) return;
    const back = trip({ x:m[0], y:m[1], h:f.h }, locate(...HOME_AT, Math.PI));
    this.lights = false;
    if (!back) { this.home(); return; }
    this.state = 'back'; this.drive([[f.x, f.y], m, ...back.slice(1)], station.id, () => { this.state = 'waitReverse'; this.v = 0; });
  }
  // nothing in the westbound lane where the back of the engine will swing
  clearBehind() { return !roadVehicles().some(o => o !== this && !o.parked && o.points.some(([x, y]) => Math.abs(y - 127.5) < 2.6 && x > 356 && x < 368)); }
  home() { this.state = 'in'; this.lights = false; this.path = parked(); this.s = this.path.length; this.park(); this.parked = true; super.place(); crewHome(); }
  update(dt) {
    const ph = sim.t % 0.5 < 0.25; glow(this.barL, this.lights && ph); glow(this.barR, this.lights && !ph);
    // backing up: those behind it are asked to stop well short
    this.keepBack = this.state === 'waitReverse' || this.state === 'reversing' || this.state === 'back' && this.path.length - this.s < 45 ? 9 : 0;
    if (this.state === 'in') this.water = Math.min(TANK, this.water + 40 * dt);
    if (this.state === 'boarding' && this.aboard === CREW.length && station.door > 0.98) this.state = 'leaving';
    if (this.state === 'leaving') this.leave();
    if (this.state === 'atEdge') this.pullOut();
    if (this.state === 'scene' && blaze.phase === 'clear' && this.aboard === CREW.length) this.merge();
    if (this.state === 'waitReverse') { if (station.door > 0.98 && this.clearBehind()) { this.state = 'reversing'; this.rs = 0; } else { this.v = 0; return; } }
    if (this.state === 'reversing') { this.v = 2.4; this.rs += 2.4 * dt; if (this.rs >= REVERSE.length) this.home(); else this.place(); return; }
    super.update(dt);
  }
  status() {
    const b = blaze.house?.id;
    return { in:'in the station · ready', boarding:'turning out · crew boarding', leaving:'turning out', toEdge:'turning out', atEdge:'turning out · pulling out', out:`on a call · to ${b}`,
      scene:blaze.phase === 'attack' ? `at ${b} · fighting a chimney fire` : `at ${b}`, back:'returning to the station', waitReverse:'backing into the station', reversing:'backing into the station' }[this.state];
  }
  info() {
    const left = this.path.length - this.s;
    return { kind:'Fire engine · pump', title:this.id, status:this.status(), bar:{ v:this.water, max:TANK, label:`water ${Math.round(this.water)} of ${TANK} l` },
      rows:[['Crew', this.state === 'in' ? `${CREW.length} in the station` : this.aboard ? `${this.aboard} aboard` : `${CREW.length} out at work`], ['Street', streetAt(this.front.x, this.front.y)],
        ['Lights', this.lights ? 'flashing' : 'off'], ['Speed', kmh(this.v)], ...(this.state === 'out' ? [['To go', `${Math.round(left)} m`]] : []), ['Call-outs', String(this.calls)]] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
}

// ---- the station: its doors and its call light ----
export const station = { kind:'station', id:'Riverside Fire Station', groups:[], pick:[369, 112, 9], door:0, last:null,
  update(dt) {
    const e = engine, want = ['boarding', 'leaving', 'toEdge', 'atEdge', 'waitReverse', 'reversing'].includes(e.state) || e.state === 'out' && e.front.y < 125 || e.state === 'back' && e.path.length - e.s < 60;
    this.door = Math.max(0, Math.min(1, this.door + (want ? 1 : -1) * dt / 2.6));
    this.door1.scale.y = 1 - 0.93 * ease(this.door);
    glow(this.call, ['boarding', 'leaving', 'toEdge', 'atEdge'].includes(e.state) && sim.t % 0.6 < 0.3);
  },
  info() {
    const e = engine, l = this.last;
    return { kind:'Fire station', title:this.id, status:e.state === 'in' ? blaze.phase === 'quiet' ? 'quiet · Red Watch on duty' : 'a call coming in' : `${e.id} ${e.status()}`,
      rows:[['Watch', `Red Watch · ${CREW.length} on duty`], ['Crew', CREW.map(c => c.name).join(', ')], ['Call-outs', String(e.calls)],
        ['Last call', l ? `${l.house} · ${clock(l.t)} · chimney fire` : 'none yet'], ['ENG-1', e.status()], ['RSQ-1', 'in the station']],
      actions:[...(e.state !== 'in' ? [['Follow ENG-1', () => hooks.track(e)]] : []), ['Look inside', () => hooks.lookInside(this)]] };
  },
  readout() { return `${this.id} · ${this.info().status}`.toLowerCase(); },
};

// ---- the fire ----
export const blaze = { phase:'quiet', next:0, house:null, heat:0, t0:0, tCall:0, tOut:0, tPhase:0, evac:[], fx:null, jet:null, hose:null, posts:null,
  update(dt) {
    const P = this.phase;
    if (P === 'quiet' && sim.t >= this.next) this.start();
    else if (P === 'burning' || P === 'called') {
      this.heat = Math.min(1, this.heat + dt / 12);
      if (P === 'burning' && sim.t >= this.tCall) this.call();
      if (P === 'called' && engine.state === 'in') engine.alert();   // the watch turns out as soon as the engine is in
    }
    else if (P === 'attack') { this.heat = Math.max(0, this.heat - dt / 17); engine.water = Math.max(0, engine.water - 26 * dt); if (this.heat <= 0) this.to('steam'); }
    else if (P === 'steam' && sim.t - this.tPhase > 5) { this.to('makeup'); this.dropJet(); for (const c of CREW) if (c.p?.hose) c.p.wait(6.5, 'making up the hose'); }
    else if (P === 'makeup' && sim.t - this.tPhase > 7) this.allClear();
    else if (P === 'clear' && !this.evac.some(p => sim.people.includes(p)) && engine.state !== 'scene') this.stand();
    this.draw();
  },
  to(phase) { this.phase = phase; this.tPhase = sim.t; },
  // a chimney catches: whoever is home comes out
  start(house) {
    const pool = homes.filter(h => h.groups[0].userData.chimney);
    const H = this.house = house ?? pick(pool);
    this.to('burning'); this.heat = 0; this.t0 = sim.t; this.tCall = sim.t + rand(4, 8);
    this.evac = H.plan().map((r, i) => new Evacuee(r.name, H, i)); H.evacuated = true;
    return H;
  },
  call() { this.to('called'); station.last = { house:this.house.id, t:sim.t }; },
  // ENG-1 at the kerb: the crew get down on the kerb side and go to their posts
  onScene() {
    const e = engine, f = e.front, c = Math.cos(f.h), s = Math.sin(f.h), H = this.house, [kx, ky] = H.kerb, [dx, dy] = H.door, [cx, cy] = H.groups[0].userData.chimney;
    const side = (back, k) => kerbward([f.x - c * back, f.y - s * back], f.h, k);
    const n1 = [kx - 0.9, dy + 2.6], n2 = [kx - 0.9, dy + 3.9], aim = Math.atan2(cy - n1[1], cx - n1[0]), pump = side(5.6, 2.0);
    const garden = [[kx, ky - 0.1], [kx, ky - 2.6]];
    this.posts = { pump, n1, n2, hose:[side(5.6, 1.3), [side(5.6, 1.3)[0], ky - 0.1], ...garden, n2, n1] };
    let ready = 0;
    CREW.forEach((cr, i) => {
      const [x, y] = side([1.6, 4.6, 3.2, 6.2][i], 1.75), p = new Firefighter(cr, x, y, f.h + Math.PI / 2);
      p.speed = 2.4; e.aboard--;
      // the way back to the engine, for when it is over
      p.back = cr.role === 'driver' ? [[x, y]] : cr.role === 'officer' ? [[x, ky - 0.1], [x, y]] : [[kx, ky - 2.6], [kx, ky - 0.1], [x, ky - 0.1], [x, y]];
      if (cr.role === 'officer') p.walk([[x, ky - 0.1], [kx + 1.6, ky - 0.1]], 'to the gate').face(-Math.PI / 2).then(q => { q.label = 'in charge at the gate'; });
      else if (cr.role === 'driver') p.walk([pump], 'to the pump').face(f.h - Math.PI / 2).then(q => { q.label = 'at the pump'; });
      else { p.hose = true; p.carrying = 'a length of hose';
        p.walk([[x, ky - 0.1], ...garden, ...(i === 2 ? [n2, n1] : [n2])], 'running out the hose').face(aim)
          .then(q => { q.carrying = null; q.label = i === 2 ? 'on the branch' : 'backing up the branch'; if (++ready === 2) this.attack(); }); }
    });
  },
  // water on: a hose from the pump up the garden path, a jet arcing onto the chimney
  attack() {
    this.to('attack');
    const P = this.posts, [cx, cy, cz] = this.house.groups[0].userData.chimney, n = P.n1, a = Math.atan2(cy - n[1], cx - n[0]);
    const h = new Part(); for (let i = 1; i < P.hose.length; i++) { const [a0, b0] = P.hose[i - 1], [a1, b1] = P.hose[i]; h.seg('line', W(a0, b0, zAt(a0, b0) + 0.06), W(a1, b1, zAt(a1, b1) + 0.06)); }
    this.hose = h.build('hose'); quiet(this.hose); scene.add(this.hose);
    const from = [n[0] + Math.cos(a) * 0.7, n[1] + Math.sin(a) * 0.7, zAt(...n) + 1.25], to = [cx, cy, cz + 0.4], N = 18;
    const at = t => W(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t + 3.4 * 4 * t * (1 - t));
    const g = new THREE.Group(); g.name = 'jet';
    for (let k = 0; k < 3; k++) { const p = new Part(); for (let i = 0; i < N; i++) { const t0 = (i + k / 3) / N; p.seg('line', at(t0), at(Math.min(1, t0 + 0.45 / N))); } const o = p.build(`jet${k}`); o.visible = false; g.add(o); }
    quiet(g); scene.add(g); this.jet = g;
  },
  dropJet() { if (this.jet) { this.jet.traverse(o => o.geometry?.dispose()); this.jet.removeFromParent(); this.jet = null; } },
  // out and made up: the crew back to the engine, the household back in
  allClear() {
    this.to('clear');
    if (this.hose) { this.hose.traverse(o => o.geometry?.dispose()); this.hose.removeFromParent(); this.hose = null; }
    for (const c of CREW) { const p = c.p; if (!p) continue; p.steps = []; p.hose = false; p.walk(p.back, 'back to the engine').then(q => q.board()); }
    for (const p of this.evac) p.goHome?.();
  },
  stand() { if (this.house) this.house.evacuated = false; this.to('quiet'); this.house = null; this.heat = 0; this.evac = []; this.next = sim.t + rand(240, 480); },
  // smoke and flames at the stack (steam once it is out); the jet's dashes run toward the chimney
  draw() {
    const f = this.fx, on = !!this.house && (this.heat > 0.01 || this.phase === 'steam');
    f.g.visible = on;
    if (this.jet) { const k = Math.floor(sim.t * 9) % 3; this.jet.children.forEach((o, i) => { o.visible = i === k && (this.phase === 'attack' || this.phase === 'steam' && sim.t - this.tPhase < 2); }); }
    if (!on) return;
    const [cx, cy, cz] = this.house.groups[0].userData.chimney, k = this.heat, steam = this.phase === 'steam' ? 0.7 * (1 - (sim.t - this.tPhase) / 5) : 0;
    pose(f.g, cx, cy, 0, cz);
    // each tongue of flame flickers on its own
    f.flames.forEach((m, i) => { const fl = 0.75 + 0.3 * Math.sin(sim.t * (13 + i * 3.1) + i) * Math.sin(sim.t * (4.7 + i) + i * 2);
      m.visible = k > 0.08; m.scale.set(0.45 + 0.6 * k, (0.35 + k) * fl, 0.45 + 0.6 * k); glow(m, true); });
    // a plume that billows as it rises and leans away on the breeze: dark smoke, or white steam
    const amt = Math.max(k, steam), set = this.phase === 'steam' ? f.steam : f.smoke, other = set === f.steam ? f.smoke : f.steam;
    for (const m of other) m.visible = false;
    set.forEach((m, i) => { const a = (sim.t * 0.28 + i / set.length) % 1, sc = (0.3 + 1.9 * a) * amt, w = Math.sin(i * 2.3 + sim.t * 0.7) * 0.5 * a;
      m.visible = sc > 0.05; pose(m, a * 4.6 + w, -a * 1.6 + Math.cos(i * 1.7) * 0.4 * a, i * 0.9, 0.6 + a * 8.5); m.scale.set(sc, sc * 0.85, sc); });
  },
};

hooks.fireFor = h => {
  if (h !== blaze.house || blaze.phase === 'quiet') return null;
  const e = engine, P = blaze.phase;
  const status = P === 'burning' ? 'chimney fire · a neighbour is calling it in' : P === 'called' ? `chimney fire · ${e.id} ${e.state === 'scene' ? 'here, running out the hose' : e.state === 'out' ? 'on the way' : 'turning out'}`
    : P === 'attack' ? `chimney fire · ${e.id} has water on it` : P === 'steam' ? 'fire out · damping down' : P === 'makeup' ? 'fire out · making up' : 'fire out · all clear';
  return { status, rows:[['Chimney fire', `${P === 'attack' || P === 'burning' || P === 'called' ? 'burning' : 'out'} · since ${clock(blaze.t0)}`], ['Fire brigade', e.status()]],
    actions:e.state !== 'in' ? [['Track ENG-1', () => hooks.track(e)]] : [] };
};

// the station, the engine and its watch; the smoke and flames, drawn once and moved to whichever chimney is alight
export function buildFireService() {
  const g = buildFireStation(); g.userData.entity = station; station.groups = [g]; scene.add(g);
  station.door1 = g.getObjectByName('door1'); station.call = g.getObjectByName('callLight');
  PROTO.fireEngine = buildFireEngine();
  new FireEngine();
  CREW.forEach(c => { const p = new Firefighter(c, ...(c.seat ? c.seat.at : c.hall ? HALL[0][0] : c.at), c.seat ? c.seat.h : c.hall ? HALL[0][1] : c.h); p.home = true;
    if (c.seat) { c.seat.by = p; p.sitOn(c.seat); } });
  const fx = new THREE.Group(); fx.name = 'chimneyFire';
  const flames = [[0, 0, 1], [0.22, 0.12, 0.72], [-0.18, -0.12, 0.8], [0.06, -0.24, 0.6]].map(([dx, dy, k], i) => {
    const m = new Part().geo(new THREE.ConeGeometry(0.34 * k, 1.5 * k, 6), new THREE.Matrix4().compose(W(0, 0, 0.75 * k), new THREE.Quaternion(), v3(1, 1, 1)), 'l').build(`flame${i}`);
    pose(m, dx, dy); fx.add(m); return m; });
  const puff = tone => new Part().geo(new THREE.IcosahedronGeometry(1, 0), new THREE.Matrix4(), tone).build('puff');
  const [smoke, steam] = ['k', 'n'].map(t => { const P = puff(t); return Array.from({ length:8 }, () => { const m = P.clone(); fx.add(m); return m; }); });
  quiet(fx); fx.visible = false; scene.add(fx);
  blaze.fx = { g:fx, flames, smoke, steam }; blaze.next = sim.t + rand(150, 260);
  return { station, engine, blaze, update(dt) { blaze.update(dt); station.update(dt); } };
}
