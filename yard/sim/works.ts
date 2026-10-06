// @ts-nocheck
import { hooks, scene } from '../shared';
import { Part, glow, pose } from '../kernel/part';
import { ease, pick, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { WORKS } from '../layout';
import { BODY_LEN, buildBody, carInto } from '../models/works';
import { ROBOTS, buildCarWorks } from '../world/works';
import { PROTO, clock, sim } from './core';
import { Person } from './person';

// ---- Car Works: the line ----
// Every TAKT seconds the line indexes: every body moves on one station together, a new one comes off the blanking
// press, and the car at the end drives out of the door to a space on the lot. In between, each station does its work
// on the body in it, the robots weld, paint, fit wheels or glass, and when that work is done the body becomes what
// the station makes of it. If the lot is full the line waits, the last car at the quality check, until the train
// takes some away.
const ST = WORKS.stations, N = ST.length, TAKT = 14, MOVE = 4, WORK = TAKT - MOVE, LY = WORKS.ly, LOT = WORKS.lot, HALF = BODY_LEN / 2;
const MAKES = { 1:'panels', 3:'floor', 4:'frame', 5:'shell', 6:'closed', 9:'painted', 13:'wheels', 14:'complete' };
const STAGE = { blanks:'steel blanks', panels:'stamped panels', floor:'the underbody', frame:'a framed body', shell:'a body in white', closed:'a body in white, doors on',
  painted:'a painted body', wheels:'a painted body on its wheels', complete:'a finished car' };
const MODELS = ['Gull 1.2', 'Gull 1.6 estate', 'Petrel GT'], COLOUR = { n:'chalk white', k:'slate, two-tone' };
const xOf = k => k < 0 ? ST[0][0] - 6 : ST[Math.min(k, N - 1)][0];
const zOf = k => k === 11 || k === 12 ? 1.5 : k === 18 ? 0.3 : k >= 15 ? 0.06 : 0.55;
const shopAt = x => WORKS.shops.find(([, , a, b]) => x >= a && x < b) ?? WORKS.shops[WORKS.shops.length - 1];
const spaceX = k => LOT.x0 - k * LOT.pitch;

class Body {
  constructor(seq, t0 = sim.t) {
    Object.assign(this, { kind:'carbody', seq, id:`CW-${seq}`, si:-1, t0, groups:[], pick:[-HALF, 0, 1.1] });
    this.model = pick(MODELS); this.tone = rng() < 0.5 ? 'n' : 'k';
    this.vin = `WCW${'GHP'[MODELS.indexOf(this.model)]}${this.tone.toUpperCase()}26${String(seq).padStart(7, '0')}`;
    this.setModel('blanks');
  }
  setModel(stage) {
    this.stage = stage;
    const g = PROTO.body[['painted', 'wheels', 'complete'].includes(stage) ? `${stage}_${this.tone}` : stage].clone(); g.userData.entity = this;
    if (this.group) { g.position.copy(this.group.position); g.rotation.copy(this.group.rotation); g.visible = this.group.visible; this.group.removeFromParent(); }
    this.group = g; this.groups = [g]; scene.add(g);
  }
  where() {
    if (this.parked) return { shop:'the lot', status:'on the lot · waiting for the train' };
    if (this.drive) return { shop:'the yard', status:'driving out to the lot' };
    const st = ST[Math.max(0, this.si)], shop = shopAt(st[0])[1];
    return { shop, st, status:`${shop.toLowerCase()} · ${line.phase === 'move' ? `moving to the ${st[1]}` : st[1]}` };
  }
  info() {
    const w = this.where(), k = this.si, done = this.parked || this.drive ? 100 : Math.round(Math.max(0, k) / (N - 1) * 95);
    const painted = ['painted', 'wheels', 'complete'].includes(this.stage);
    return { kind:`Car · ${this.model}`, title:this.id, status:w.status, bar:{ v:done, max:100, label:`${done}% built · now ${STAGE[this.stage]}` },
      rows:[['VIN', this.vin], ['Model', this.model], ['Colour', painted ? COLOUR[this.tone] : `to be ${COLOUR[this.tone]}`], ['Shop', w.shop],
        ...(w.st ? [['Station', `${k + 1} of ${N} · ${w.st[1]}`], ['Next', k + 1 < N ? ST[k + 1][1] : 'out to the lot']] : []), ['Started', clock(this.t0)]] };
  }
  readout() { return `${this.id} · ${this.where().status}`.toLowerCase(); }
  // the rest of the line, and the way out to the lot
  route() {
    if (this.parked) return null;
    if (this.drive) return { path:this.drive.path, s:this.drive.s, next:this.drive.to, stop:'the lot' };
    const pts = [[this.group.position.x, this.group.position.z]];
    for (let k = Math.max(0, this.si + 1); k < N; k++) pts.push([xOf(k) + HALF, LY]);
    const sp = lot.free(); if (sp !== null) pts.push(...exitPts(sp).slice(1));
    return { path:new Path(pts, 2.5), s:0, next:this.si + 1 < N ? [xOf(this.si + 1) + HALF, LY] : null, stop:this.si + 1 < N ? ST[this.si + 1][1] : 'the lot' };
  }
  place(x, z) { pose(this.group, x + HALF, LY, 0, z); }
  remove() { this.group.removeFromParent(); hooks.forget(this); }
}
// out of the door at the east end, along the aisle, and nose in to a space
const exitPts = k => { const x = spaceX(k); return [[ST[N - 1][0] + HALF, LY], [WORKS.exit[0] + 2, LY], [WORKS.exit[0] + 2, LOT.aisle], [x + 3.6, LOT.aisle], [x, LOT.aisle - 3.4], [x, LOT.front]]; };

// ---- the lot: the cars on it are drawn as one part, but for a car someone is following, which stays its own car to
// click until they let it go ----
export const lot = { cars:[], kept:new Set(), group:null, entity:null,
  // a space is taken from the moment a car sets off for it
  free() { for (let k = 0; k < LOT.n; k++) if (!this.cars.some(c => c.space === k) && !line.driving.some(c => c.drive.space === k)) return k; return null; },
  park(b, space) {
    b.parked = true; b.drive = null; b.space = space; this.cars.push(b); pose(b.group, spaceX(space), LOT.front, -Math.PI / 2, 0);
    if (hooks.isSelected(b)) this.kept.add(b); else b.remove();
    this.draw();
  },
  update() { let n = 0; for (const b of this.kept) if (!hooks.isSelected(b)) { this.kept.delete(b); b.remove(); n++; } if (n) this.draw(); },
  get last() { return [...this.kept].pop() ?? null; },
  // a car off the lot (onto the train): the oldest first
  take() { const b = this.cars.shift(); if (!b) return null; if (this.kept.delete(b)) b.remove(); this.draw(); return b; },
  draw() {
    const p = new Part();
    for (const b of this.cars) if (!this.kept.has(b)) carInto(p, spaceX(b.space), LOT.front, b.tone);
    const g = p.build('lotCars'); g.userData.entity = this.entity;
    if (this.group) { this.group.traverse(o => o.geometry?.dispose()); this.group.removeFromParent(); }
    this.group = g; scene.add(g);
  },
};

// ---- the line itself ----
export const line = { bodies:new Array(N).fill(null), phase:'dwell', t:0, seq:1001, built:0, worked:false, hold:false, driving:[], lastVin:'', tLast:0,
  update(dt) {
    this.t += dt;
    if (this.phase === 'dwell' && this.t >= WORK) {
      // the work is done: each body becomes what its station makes of it (once), then the line moves if it can
      if (!this.worked) { this.worked = true; this.bodies.forEach((b, k) => { if (b && MAKES[k]) b.setModel(MAKES[k]); }); }
      const last = this.bodies[N - 1], sp = last ? lot.free() : null;
      this.hold = !!last && sp === null;
      if (!this.hold) {
        if (last) { last.drive = { path:new Path(exitPts(sp), 2.5), s:0, to:[spaceX(sp), LOT.front], space:sp }; last.si = N; this.driving.push(last); this.built++; this.lastVin = last.vin; this.tLast = sim.t; }
        for (let k = N - 1; k > 0; k--) { this.bodies[k] = this.bodies[k - 1]; if (this.bodies[k]) this.bodies[k].si = k; }
        const b = this.bodies[0] = new Body(this.seq++); b.si = 0;
        this.phase = 'move'; this.t = 0;
      }
    } else if (this.phase === 'move' && this.t >= MOVE) { this.phase = 'dwell'; this.t = 0; this.worked = false; }
    // the cars driving out, nose in to their spaces
    for (const b of [...this.driving]) {
      const d = b.drive; d.s = Math.min(d.path.length, d.s + 3 * dt); const a = d.path.at(d.s); pose(b.group, a.x, a.y, a.h, 0.06); b.group.visible = true;
      if (d.s >= d.path.length) { this.driving.splice(this.driving.indexOf(b), 1); lot.park(b, d.space); }
    }
  },
  // where each body stands now, and whether it shows (inside the hall only while the hall is open)
  draw(open) {
    const f = this.phase === 'move' ? ease(Math.min(1, this.t / MOVE)) : 1, w = this.phase === 'dwell' ? Math.min(1, this.t / WORK) : 0;
    this.bodies.forEach((b, k) => { if (!b) return; b.group.visible = open; if (!open) return;
      const from = this.phase === 'move' ? k - 1 : k, x = xOf(from) + (xOf(k) - xOf(from)) * f;
      let z = zOf(from) + (zOf(k) - zOf(from)) * f;
      if (k === 8 && this.phase === 'dwell') z -= 1.05 * Math.sin(Math.PI * w);   // down into the dip and out
      b.place(x, z); });
  },
};

// The people on the line: a press operator, trimmers, a fitter at the fluids rig, an inspector in the light tunnel
class Worker extends Person {
  constructor(id, x, y, h, station, job) { super({ look:'worker', id, x, y, h, speed:1.2, station, job }); this.home = [x, y, h]; }
  think() { const b = line.bodies[this.station], busy = b && line.phase === 'dwell' && line.t < WORK;
    this.face(this.home[2]).wait(1.5, busy ? `${this.job} · ${b.id}` : 'waiting for the next car'); }
  info() { return { kind:'Line worker · Car Works', title:this.id, status:this.status(), rows:[['Station', ST[this.station][1]], ['Shop', shopAt(ST[this.station][0])[1]], ['Shift', 'days']] }; }
}

export const works = { kind:'works', id:'Car Works', groups:[], pick:[308, -20, 13],
  info() {
    const on = line.bodies.filter(Boolean), by = WORKS.shops.map(([, , a, b]) => on.filter(x => xOf(x.si) >= a && xOf(x.si) < b).length);
    const welding = ROBOTS.filter(r => line.bodies[r.station] && line.phase === 'dwell' && line.t < WORK).length;
    return { kind:'Car factory', title:this.id, status:line.hold ? 'lot full · the line waits for the train' : `line running · a car every ${TAKT} s`,
      bar:{ v:lot.cars.length, max:LOT.n, label:`lot ${lot.cars.length} of ${LOT.n} · ${line.hold ? 'full' : 'waiting for the train'}` },
      rows:[['Built', `${line.built} this session`], ['On the line', `${on.length} · press ${by[0]}, body ${by[1]}, paint ${by[2]}, assembly ${by[3]}, end ${by[4]}`],
        ['Robots', `${ROBOTS.length} · ${welding} at work`], ['Last off the line', line.lastVin ? `${line.lastVin} · ${clock(line.tLast)}` : '—']],
      actions:[['Follow a new car', () => { const b = line.bodies[0]; if (b) hooks.track(b); }], ['Look inside', () => hooks.lookInside(this)]] };
  },
  readout() { return `car works · ${this.info().status}`; },
  // while it is open: the bodies on the line, the robots, the press, the buffer of shells overhead, the lift, the lamps, the AGVs
  whileOpen() { line.draw(true); animate(); },
  peeked(on) { line.draw(on); },
};

let A = null;
function animate() {
  const t = sim.t, dwell = line.phase === 'dwell' && line.t < WORK, w = Math.min(1, line.t / WORK);
  for (const r of ROBOTS) {
    const on = dwell && !!line.bodies[r.station], ph = r.x * 0.7 + r.y;
    r.k = (r.k ?? 0) + ((on ? 1 : 0) - (r.k ?? 0)) * 0.08;
    const k = r.k, rest = [0, 1.15, -2.25, -0.5];
    const work = r.kind === 'weld' ? [0.35 * Math.sin(t * 0.9 + ph), 0.62 + 0.12 * Math.sin(t * 2.1 + ph), -1.35 + 0.18 * Math.sin(t * 2.9 + ph), -0.3 + 0.3 * Math.sin(t * 3.3 + ph)]
      : r.kind === 'paint' ? [0.5 * Math.sin(t * 1.4 + ph), 0.8 + 0.25 * Math.sin(t * 1.9 + ph), -1.6 + 0.3 * Math.sin(t * 1.9 + ph + 1), -0.6]
      : [0.25 * Math.sin(t * 0.6 + ph), 0.45 + 0.1 * Math.sin(t * 1.2), -1.0 + 0.1 * Math.sin(t * 1.5), -0.6];
    const q = rest.map((v, i) => v + (work[i] - v) * k);
    r.turret.rotation.y = -q[0]; r.shoulder.rotation.z = q[1]; r.elbow.rotation.z = q[2]; r.wrist.rotation.z = q[3];
    r.spark.visible = on && k > 0.7 && (r.kind === 'weld' ? (t * 6 + ph) % 1 < 0.35 : r.kind === 'paint'); if (r.spark.visible) glow(r.spark, true);
  }
  // the press: two strokes while there are blanks under it
  A.ram.position.y = 5.0 - (dwell && line.bodies[1] ? 3.6 * Math.pow(Math.sin(Math.PI * 2 * w), 2) : 0);
  // the powertrain rises into the body over the first half of its stop
  pose(A.pt, ST[12][0], LY, 0, 0.1 + (line.phase === 'dwell' && line.bodies[12] ? 1.15 * ease(Math.min(1, w * 2)) : 0));
  A.buffer.children.forEach((m, i) => { const x = 250 + ((i * 8 + t * 1.3) % 40); m.visible = x > 251.5 && x < 288.5; pose(m, x + HALF, WORKS.y0 + 5.2, 0, 6.45); });
  glow(A.lamps, dwell && (line.bodies[17] && (t * 2) % 1 < 0.5 || !!line.bodies[19]));
  A.agvs.forEach((g, i) => { const a = A.loop.at(t * 1.2 + i * A.loop.length / 2); pose(g, a.x, a.y, a.h); });
}

export function buildWorks() {
  const g = buildCarWorks(); g.userData.entity = works; works.groups = [g]; scene.add(g);
  PROTO.body = {};
  for (const s of ['blanks', 'panels', 'floor', 'frame', 'shell', 'closed']) PROTO.body[s] = buildBody(s);
  for (const s of ['painted', 'wheels', 'complete']) for (const t of ['n', 'k']) PROTO.body[`${s}_${t}`] = buildBody(s, t);
  const inside = g.userData.peek.inside, buffer = inside.getObjectByName('buffer');
  for (let i = 0; i < 5; i++) buffer.add(PROTO.body.shell.clone());
  A = { ram:inside.getObjectByName('ram'), pt:inside.getObjectByName('powertrain'), buffer, lamps:inside.getObjectByName('testLamps'),
    agvs:[0, 1].map(i => inside.getObjectByName(`agv${i}`)), loop:new Path([[324, LY + 7.4], [366, LY + 7.4], [366, LY - 7.2], [324, LY - 7.2], [324, LY + 7.4]], 2, true) };
  lot.entity = { kind:'lot', id:'Car Works lot', groups:[], pick:[354, -12, 1.5],
    info() { return { kind:'Car park · finished cars', title:this.id, status:`${lot.cars.length} of ${LOT.n} spaces taken`, bar:{ v:lot.cars.length, max:LOT.n, label:'waiting for the train' },
      rows:[['Oldest', lot.cars[0] ? `${lot.cars[0].id} · ${lot.cars[0].model}` : '—'], ['Newest', lot.last ? `${lot.last.id} · ${lot.last.model}` : '—'], ['Built', `${line.built} this session`]] }; },
    readout() { return `car works lot · ${lot.cars.length} cars`; } };
  // the line full from the start: a body at every station, made up to where it is; some cars already on the lot
  for (let k = N - 1; k >= 0; k--) {
    const b = new Body(line.seq++, sim.t - k * TAKT); b.si = k;
    for (let j = 0; j < k; j++) if (MAKES[j]) b.setModel(MAKES[j]);
    line.bodies[k] = b;
  }
  for (let i = 0; i < 8; i++) { const b = new Body(990 + i, sim.t - 300); b.setModel('complete'); lot.park(b, i); }
  const crew = [['R. Kowal', 226, LY + 3.6, -Math.PI / 2, 1, 'running the press'], ['E. Dube', 327, LY + 2.8, -Math.PI / 2, 11, 'fitting the trim'],
    ['M. Ortega', 363, LY + 2.6, -Math.PI / 2, 15, 'fitting the seats'], ['T. Haas', 370.4, LY - 2.6, Math.PI / 2, 16, 'filling and starting'], ['N. Sato', 395.2, LY + 2.9, -Math.PI * 0.8, 19, 'checking the paint']];
  for (const [id, x, y, h, st, job] of crew) new Worker(id, x, y, h, st, job);
  line.draw(false);
  return { works, line, lot, update(dt) { line.update(dt); lot.update(); line.draw(!!g.userData.peek.cut?.visible); } };
}
