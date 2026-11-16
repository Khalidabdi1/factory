import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { glow, pose } from '../kernel/part';
import { clamp, rand, rng, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { GARAGE_Y, GRID, LAP, PITS, PIT_IN_S, PIT_OUT_S, PODIUM, START_S, TRACK, TURNS, TURN_S, buildCircuit, garageX, kAt, pitPaths, trackAt, vAt } from '../world/circuit';
import { F1_LEN, buildCrew, buildF1 } from '../models/f1';
import { clock, hourAt, kmh, sim } from './core';
import { FAR, Person } from './person';

// ---- the Gull Bay Grand Prix, every day ----
// A weekend is two days, and the plate opens on race day. The day after it is practice in the morning (the cars go out
// of their garages in ones and twos, run a few laps and come in again) and qualifying in the afternoon (each car has an
// out lap, one flying lap and an in lap, and the order of their best laps is the next day's grid). On race day, at first
// light, the cars go round to the grid, run the formation lap behind each other, weaving to warm their tyres,
// and stop on their slots; the five pairs of red lights come on one by one, go out, and the race is on: four laps, each
// car into the pits once for tyres. A faster car closes up in the slipstream on a straight, pulls out and goes by; in
// the corners it has to wait. Now and then one spins at a corner (the marshal shows the yellow flag) and rejoins, and
// once in a while one stops for good. The race runs on into the night under the floodlights; the first three go up to
// the podium on the pit building's balcony, and the cars are pushed back into their garages for the night.
const TEAMS = [{ name:'Newhaven Motors Racing', short:'Newhaven', body:'k', wing:'n', stripe:false }, { name:'Harrow Grand Prix', short:'Harrow', body:'n', wing:'k', stripe:false },
  { name:'Kestrel Racing', short:'Kestrel', body:'k', wing:'k', stripe:false }, { name:'Fairhaven F1', short:'Fairhaven', body:'n', wing:'n', stripe:false },
  { name:'Moorland Motorsport', short:'Moorland', body:'n', wing:'k', stripe:true }];
const DRIVERS: [string, string, number][] = [['F. Ashcroft', '7', 1.0], ['J. Kerr', '11', 0.985], ['M. Lindqvist', '4', 0.992], ['T. Ibanez', '23', 0.978], ['C. Moreau', '16', 0.988],
  ['P. Hartmann', '31', 0.972], ['S. Whitlock', '55', 0.981], ['E. Vasquez', '63', 0.968], ['N. Petit', '10', 0.975], ['O. Brennan', '81', 0.962]];
export const RACE_LAPS = 4;
const COMPOUNDS = ['soft', 'medium', 'hard'], GRIP = { soft:1.0, medium:0.99, hard:0.982 } as Record<string, number>, WEAR = { soft:0.006, medium:0.0035, hard:0.002 } as Record<string, number>;
const fmt = (t: number) => t > 0 && t < 1e5 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}` : '—';
const mod = (s: number) => ((s % LAP) + LAP) % LAP;
const ahead = (from: number, to: number) => mod(to - from);   // metres along the lap from one point on it to another
const PIT_SPAN = ahead(PIT_IN_S, PIT_OUT_S);
const where = (s: number) => { for (let k = 0; k < TURN_S.length; k++) if (Math.abs(wrap((s - TURN_S[k]) / LAP * Math.PI * 2)) / (Math.PI * 2) * LAP < 22) return `Turn ${TURNS[k][0]}, ${TURNS[k][1]}`;
  const x = trackAt(s).x, y = trackAt(s).y; return y > 140 ? 'the pit straight' : y < 32 ? 'the back straight' : y > 56 && y < 76 ? 'the infield straight' : y > 88 && y < 102 ? 'the harbour straight' : x > 2310 ? 'the east straight' : 'the infield'; };

type Mode = 'garage' | 'out' | 'track' | 'in' | 'push' | 'through' | 'stopped' | 'retired';
class Racer {
  [k: string]: any;
  constructor(i: number) {
    const [name, num, skill] = DRIVERS[i], team = TEAMS[i >> 1];
    Object.assign(this, { kind:'f1', i, num, name, team, skill, id:`#${num} ${name}`, mode:'garage' as Mode, v:0, s:0, d:0, off:0, offT:0, ps:0, path:null as Path | null,
      lap:0, crossings:0, lapT0:0, last:0, best:Infinity, quali:Infinity, plan:'rest', laps:0, tyre:'medium', tyreAge:0, stops:0, pitLap:2, finished:false, dnf:false,
      spin:null as any, yaw:0, stopT:0, hold:0, garage:i, pos:i + 1, gapText:'—', lead:false, pick:[-2.8, 0, 0.9] });
    this.full = buildF1(team.body, team.wing, num, false, team.stripe); this.lite = buildF1(team.body, team.wing, num, true);
    this.groups = [this.full, this.lite]; for (const g of this.groups) { g.userData.entity = this; scene.add(g); }
    this.paths = pitPaths(i); this.park();
  }
  // in the garage, nose to the pit lane
  park() { this.mode = 'garage'; this.v = 0; this.place(); }
  go(path: Path, mode: Mode) { this.path = path; this.ps = 0; this.mode = mode; }
  place() {
    let x: number, y: number, h: number;
    const gx = garageX(this.garage);
    if (this.mode === 'garage') { x = gx; y = GARAGE_Y - F1_LEN / 2; h = Math.PI / 2; }
    else if (this.mode === 'push') { const k = clamp(this.ps, 0, 1), e = k * k * (3 - 2 * k); x = gx; y = PITS.box + (GARAGE_Y - F1_LEN / 2 - PITS.box) * e; h = Math.PI / 2 * e; x += Math.cos(h) * 0; }
    else if (this.path && this.mode !== 'track' && this.mode !== 'retired') { const p = this.path.at(this.ps); x = p.x; y = p.y; h = p.h; }
    else { const p = trackAt(this.s, this.off); x = p.x; y = p.y; h = p.h + (this.spin ? this.yaw : 0); }
    this.front = { x, y, h };
    for (const g of this.groups) pose(g, x, y, h, 0.02);
    this.full.visible = !FAR; this.lite.visible = FAR;
  }
  // where it is on the lap while it is in the pit lane: the same fraction of the way from the pit entry to the exit
  pitS() { return mod(PIT_IN_S + this.ps / this.path!.length * PIT_SPAN); }
  status() {
    const r = race;
    if (this.dnf) return `out of the race · stopped at ${where(this.s)}`;
    if (this.mode === 'garage') return r.phase === 'podium' || r.phase === 'finish' ? 'in the garage · the race is over' : r.phase === 'closed' ? 'in the garage for the night' : 'in the garage';
    if (this.mode === 'push') return 'pushed back into the garage';
    if (this.mode === 'out') return 'leaving the pits';
    if (this.mode === 'in') return 'coming into the pits';
    if (this.mode === 'stopped') return `pit stop · ${this.tyre} tyres going on`;
    if (this.mode === 'through') return 'in the pit lane';
    if (this.spin) return `spun at ${where(this.s)}`;
    if (this.hold) return this.plan === 'grid' || this.plan === 'formation' ? `on the grid · P${this.slot + 1}` : 'stopped';
    if (r.phase === 'race' || r.phase === 'lights' || this.finished) return this.finished ? `finished P${this.pos}` : `P${this.pos} · lap ${Math.min(RACE_LAPS, this.lap + 1)} of ${RACE_LAPS} · ${kmh(this.v)}`;
    return `${{ practice:'practice', quali:'qualifying', grid:'to the grid', formation:'formation lap', outlap:'out lap', flying:'flying lap', inlap:'in lap' }[this.plan as string] ?? 'on track'} · ${kmh(this.v)}`;
  }
  info() {
    const rows: [string, string][] = [['Team', this.team.name], ['Driver', this.name], ['Car', `#${this.num} · ${this.team.short}-${this.i % 2 ? 'B' : 'A'}`]];
    if (race.phase === 'race' || race.phase === 'finish' || race.phase === 'podium') rows.push(['Position', this.dnf ? 'DNF' : `P${this.pos} of ${racers.length}`], ['Gap', this.gapText], ['Lap', `${Math.min(RACE_LAPS, this.lap)} of ${RACE_LAPS} done`], ['Pit stops', String(this.stops)]);
    if (this.quali < Infinity) rows.push(['Qualified', `P${this.grid + 1} · ${fmt(this.quali)}`]);
    rows.push(['Last lap', fmt(this.last)], ['Best lap', fmt(this.best)], ['Tyres', `${this.tyre} · ${this.tyreAge} ${this.tyreAge === 1 ? 'lap' : 'laps'} old`], ['Speed', kmh(this.v)]);
    if (this.mode === 'track') rows.push(['On', where(this.s)]);
    const inRace = race.phase === 'race';
    return { kind:`F1 car · ${this.team.short}`, title:this.id, status:this.status(), rows,
      bar:inRace && !this.dnf ? { v:Math.min(RACE_LAPS, this.lap), max:RACE_LAPS, label:`lap ${Math.min(RACE_LAPS, this.lap + 1)} of ${RACE_LAPS}` } : undefined };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  route() { if (this.mode === 'track') return { path:TRACK, s:this.s, closed:true, next:null }; if (this.path && (this.mode === 'out' || this.mode === 'in' || this.mode === 'through')) return { path:this.path, s:this.ps, closed:false, next:null }; return null; }
}
const racers: Racer[] = [];
// the session that is on, by the clock; the start's lights; the order and the gaps
const race: any = { phase:'closed', t0:0, lights:0, lightsT:0, out:0, order:[] as Racer[], fastest:{ t:Infinity, who:'' }, record:{ t:Infinity, who:'' }, winner:null, podium:[] as Person[],
  incidents:0, day:0, lastWinner:'' };

export function buildCircuitSys() {
  const C = buildCircuit(); scene.add(C.g);
  for (let i = 0; i < DRIVERS.length; i++) racers.push(new Racer(i));
  const crews = [0, 1].map(() => { const g = buildCrew(); g.visible = false; scene.add(g); return g; });
  const R = racers;

  // ---- driving on the track: the speed it may go, the car in front, the side it passes on ----
  function pace(c: Racer) {
    const grip = GRIP[c.tyre] * (1 - WEAR[c.tyre] * c.tyreAge);
    switch (c.plan) {
      case 'formation': return 0.82;
      case 'grid': return 0.85;
      case 'outlap': case 'inlap': case 'pitIn': return 0.9;
      case 'practice': return 0.93 * c.skill * grip;
      case 'flying': return c.skill * grip * (1 + c.push);
      case 'cool': return 0.7;
      default: return c.skill * grip * (1 + c.push);
    }
  }
  function drive(c: Racer, dt: number) {
    const racing = race.phase === 'race' && !c.finished;
    let target = vAt(c.s + 2) * pace(c);
    // slower near a car stopped on a slot ahead of it, or a stop of its own
    if (c.stopAt !== undefined) { const left = c.stopAt - c.d; target = Math.min(target, Math.sqrt(Math.max(0, 2 * 7 * left))); if (left < 0.05) { c.d = c.stopAt; c.v = 0; c.stopAt = undefined; c.hold = 1; c.onStop?.(); return; } }
    if (c.spin) { // sliding wide off the track, round and round, then away again
      const sp = c.spin; sp.t += dt; c.v = Math.max(0, c.v - 26 * dt); c.yaw += dt * c.v * 0.32 * sp.dir; c.offT = sp.side * 9;
      if (c.v === 0 && sp.t > 3.4) { if (sp.dnf) { c.mode = 'retired'; c.dnf = true; c.spin = null; c.yaw = 0; } else { c.spin = null; c.yaw = 0; c.offT = 0; } }
    } else {
      // the car in front in the same lane: close up behind it, or pull out and pass where the track runs straight
      let near: Racer | null = null, gap = 1e9;
      for (const o of R) { if (o === c || o.mode !== 'track' || o.dnf) continue; const g = ahead(c.s, o.s) - F1_LEN; if (g > -F1_LEN && g < 40 && g < gap && Math.abs(o.off - c.off) < (o.hold ? 1.4 : 2.0)) { gap = g; near = o; } }
      const straight = Math.min(vAt(c.s + 15), vAt(c.s + 40), vAt(c.s + 70)) > 58 * pace(c);
      if (near) {
        if (racing && straight && gap < 22) target *= 1.035;   // the tow
        const faster = target > near.v + 0.8;
        if (racing && faster && straight && gap < 16 && !near.spin) c.offT = near.off > 0.3 ? -2.6 : 2.6;
        else target = Math.min(target, near.v + Math.max(-6, gap - (near.hold ? 1.2 : 6)) * 1.1);
      } else if (c.plan !== 'formation') {
        // back onto the racing line once nobody is alongside
        if (!R.some(o => o !== c && o.mode === 'track' && Math.abs(ahead(c.s, o.s) - (ahead(c.s, o.s) > LAP / 2 ? LAP : 0)) < 9 && Math.abs(o.off) < 3.2)) c.offT = 0;
        if (vAt(c.s + 20) < 40) c.offT = clamp(c.offT, -1.2, 1.2);
      }
      if (c.plan === 'formation') c.offT = 1.4 * Math.sin(c.d * 0.09 + c.i);
      // coming up the grid: down the middle past the cars already on their slots, across onto its own at the last
      if (c.stopAt !== undefined && c.slot !== undefined) { const left = c.stopAt - c.d; if (left < 120) c.offT = left < 13 ? GRID[c.slot].off : 0; }
    }
    c.v = target > c.v ? Math.min(target, c.v + (2.5 + 15 * (1 - c.v / 90)) * dt) : Math.max(target, c.v - 48 * dt);
    c.off += clamp(c.offT - c.off, -2.4 * dt, 2.4 * dt);
    const was = c.s; c.s = mod(c.s + c.v * dt); c.d += c.v * dt;
    crossed(c, was, c.s);
  }
  // past a point on the lap between one step and the next
  const passed = (a: number, b: number, x: number) => ahead(a, x) <= ahead(a, b) && ahead(a, b) < LAP / 2;
  function crossed(c: Racer, a: number, b: number) {
    if (passed(a, b, START_S)) lineCrossed(c);
    // into the pits: in for the night or the next session, or for tyres in the race
    if (c.mode === 'track' && passed(a, b, PIT_IN_S) && !c.spin && !c.dnf) {
      if (c.plan === 'inlap' || c.plan === 'pitIn') { c.go(c.paths.in, 'in'); }
      else if (race.phase === 'race' && !c.finished && c.lap === c.pitLap && c.stops === 0) { c.go(c.paths.through, 'through'); c.boxS = c.paths.through.project(garageX(c.garage), PITS.box); c.boxed = false; }
    }
    // the spin waiting for it at a corner
    if (c.spinAt !== undefined && passed(a, b, c.spinAt) && race.phase === 'race') { const side = kAt(c.spinAt) > 0 ? -1 : 1; c.spin = { t:0, side, dir:rng() < 0.5 ? 1 : -1, dnf:c.dnfNext, at:where(c.spinAt) }; c.spinAt = undefined; race.incidents++; race.yellowAt = c; }
  }
  function lineCrossed(c: Racer) {
    c.crossings++;
    const t = sim.t, lt = t - c.lapT0; c.lapT0 = t;
    const timed = c.plan === 'flying' || c.plan === 'practice' || (race.phase === 'race' && c.crossings > 1);
    if (c.crossings > 1 && timed && lt > 5) { c.last = lt; if (lt < c.best) c.best = lt; if (race.phase === 'race' && lt < race.fastest.t) race.fastest = { t:lt, who:c.id }; if (lt < race.record.t) race.record = { t:lt, who:c.id }; }
    if (race.phase === 'race') {
      if (c.crossings > 1) { c.lap++; c.tyreAge++; }
      // a spin, now and then; a stop for good, rarely
      if (!c.finished && c.lap < RACE_LAPS - 0 && rng() < 0.05) { c.spinAt = TURN_S[Math.floor(rng() * TURN_S.length)]; c.dnfNext = rng() < 0.12; }
      if (c.lap >= RACE_LAPS && !c.finished && (race.winner || R.every(o => o === c || o.lap < RACE_LAPS))) { c.finished = true; c.plan = 'pitIn'; if (!race.winner) { race.winner = c; race.lastWinner = c.id; } c.finishT = t; }
      else if (race.winner && !c.finished && c.crossings > 1) { c.finished = true; c.plan = 'pitIn'; c.finishT = t; }
    } else if (c.plan === 'flying') { if (lt < c.quali) c.quali = lt; c.plan = 'inlap'; }
    else if (c.plan === 'outlap') c.plan = 'flying';
    else if (c.plan === 'practice' && --c.laps <= 0) c.plan = 'inlap';
  }
  // in the pit lane: 80 km/h, slowing for the box; the stop itself; on and away
  function pitDrive(c: Racer, dt: number) {
    const P = c.path!, L = P.length;
    let target = PITS.limit;
    if (c.ps < 25) target = Math.max(PITS.limit, c.v - 30 * dt);
    if (c.mode === 'in') target = Math.min(target, Math.sqrt(Math.max(0, 2 * 6 * (L - c.ps))));
    if (c.mode === 'out' && c.ps > L - 40) target = vAt(PIT_OUT_S) * 0.8;
    if (c.mode === 'through' && !c.boxed) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 7 * (c.boxS - c.ps))));
    if (c.mode === 'out' || c.mode === 'through') for (const o of R) if (o !== c && (o.mode === 'out' || o.mode === 'through' || o.mode === 'in') && o.path) {
      const op = o.path.at(o.ps), dx = op.x - c.front.x, dy = op.y - c.front.y, f = dx * Math.cos(c.front.h) + dy * Math.sin(c.front.h);
      if (f > 0 && f < 14 && Math.abs(dy * Math.cos(c.front.h) - dx * Math.sin(c.front.h)) < 1.8) target = Math.min(target, o.v + (f - 7) * 0.8); }
    c.v = target > c.v ? Math.min(target, c.v + 9 * dt) : Math.max(Math.max(0, target), c.v - 32 * dt);
    const was = c.mode === 'through' ? c.pitS() : 0;
    c.ps = Math.min(L, c.ps + c.v * dt);
    if (c.mode === 'through') { const now = c.pitS(); c.d += ahead(was, now); if (passed(was, now, START_S)) lineCrossed(c); c.s = now;
      if (!c.boxed && c.boxS - c.ps < 0.05) { c.boxed = true; c.ps = c.boxS; c.v = 0; c.mode = 'stopped'; c.stopT = rand(2.2, 3.4); const crew = crews.find(g => !g.visible); if (crew) { c.crew = crew; crew.visible = true; pose(crew, garageX(c.garage), PITS.box, 0, 0.02); } } }
    if (c.mode === 'in' && c.ps >= L - 0.05) { c.v = 0; c.mode = 'push'; c.ps = 0; }
    if ((c.mode === 'out' || c.mode === 'through') && c.ps >= L - 0.05) {
      const end = P.at(L), q = trackAt(PIT_OUT_S); c.mode = 'track'; c.s = PIT_OUT_S; c.off = (end.x - q.x) * -Math.sin(q.h) + (end.y - q.y) * Math.cos(q.h); c.offT = 0; c.path = null;
      if (c.plan === 'grid') { const sl = GRID[c.slot]; c.stopAt = c.d + ahead(c.s, sl.s); c.offT = sl.off; c.onStop = () => { c.offT = c.off = sl.off; }; }
    }
  }

  // ---- the sessions ----
  function setPhase(ph: string) {
    race.phase = ph; race.t0 = sim.t;
    if (ph === 'practice') { R.forEach(c => { c.best = Infinity; c.last = 0; c.quali = Infinity; c.finished = false; c.dnf = false; c.lap = 0; c.crossings = 0; c.stops = 0; c.tyreAge = 0; c.tyre = 'medium'; c.leaveAt = sim.t + rand(2, 70); c.runs = 2; }); }
    if (ph === 'quali') R.forEach((c, k) => { c.leaveAt = sim.t + 3 + ((k * 7) % 10) * 3 + rand(0, 2); c.runs = 1; c.tyre = 'soft'; c.tyreAge = 0; });
    if (ph === 'grid') {
      const order = [...R].sort((a, b) => a.quali - b.quali || a.i - b.i); order.forEach((c, k) => { c.slot = k; c.grid = k; c.leaveAt = sim.t + 2 + k * 1.6; c.plan = 'grid'; c.tyre = k % 3 === 0 ? 'soft' : 'medium'; c.tyreAge = 0; c.pitLap = k % 2 ? 2 : 1; });
      race.fastest = { t:Infinity, who:'' }; race.winner = null; race.incidents = 0;
    }
    if (ph === 'formation') R.forEach(c => { c.hold = 0; c.plan = 'formation'; c.stopAt = c.d + LAP; c.onStop = () => { c.offT = c.off = GRID[c.slot].off; }; });
    if (ph === 'lights') { race.lights = 0; race.lightsT = sim.t; race.out = rand(0.6, 2.6); }
    if (ph === 'race') R.forEach(c => { c.hold = 0; c.plan = 'race'; c.lap = 0; c.crossings = 0; c.lapT0 = sim.t; c.push = rand(-0.004, 0.004); c.launch = sim.t + rand(0.18, 0.45); c.stops = 0; });
    if (ph === 'finish') R.forEach(c => { if (!c.dnf && c.mode === 'track') { c.plan = 'pitIn'; } });
    if (ph === 'podium') podium();
    if (ph === 'closed') { for (const p of race.podium) p.remove(); race.podium = []; R.forEach(c => { c.dnf = false; c.spin = null; c.hold = 0; c.stopAt = undefined; c.plan = 'rest'; c.park(); }); }
  }
  function podium() {
    const top = [...R].filter(c => c.finished && !c.dnf).sort((a, b) => a.pos - b.pos).slice(0, 3);
    const { x, y, z } = PODIUM, steps = [[0, 0.9], [-2.4, 0.6], [2.4, 0.35]];
    race.podium = top.map((c, k) => { const p: any = new Person({ look:'racer', id:c.name, x:x + steps[k][0], y, h:Math.PI / 2, speed:1 }); p.lz = z + steps[k][1];
      p.info = () => ({ kind:`Driver · ${c.team.short}`, title:c.name, status:`P${k + 1} · on the podium`, rows:[['Car', `#${c.num}`], ['Team', c.team.name], ['Best lap', fmt(c.best)], ['Pit stops', String(c.stops)]] });
      p.status = () => k === 0 ? 'lifting the trophy' : 'on the podium'; p.carrying = true; p.wait(999); return p; });
  }
  function order() {
    const live = R.filter(c => !c.dnf);
    live.sort((a, b) => (b.finished ? 1e9 - (b.finishT ?? 0) * 1e3 : b.lap * LAP + ahead(START_S, b.s)) - (a.finished ? 1e9 - (a.finishT ?? 0) * 1e3 : a.lap * LAP + ahead(START_S, a.s)));
    // nobody yet over the line from the grid is still in grid order
    live.forEach((c, k) => { c.pos = k + 1; });
    const lead = live[0];
    live.forEach((c, k) => { if (!k) { c.gapText = 'leading'; return; } const dd = lead.lap * LAP + ahead(START_S, lead.s) - (c.lap * LAP + ahead(START_S, c.s)), laps = Math.floor(dd / LAP);
      c.gapText = c.finished && lead.finished ? `+${((c.finishT ?? 0) - (lead.finishT ?? 0)).toFixed(1)} s` : laps >= 1 ? `+${laps} ${laps === 1 ? 'lap' : 'laps'}` : `+${(dd / Math.max(30, (c.v + lead.v) / 2)).toFixed(1)} s`; });
    race.order = [...live, ...R.filter(c => c.dnf)];
  }

  let doorK = 0, wasH = hourAt(sim.t); race.next = 'race';   // the plate opens on race day
  function update(dt: number) {
    const h = hourAt(sim.t);
    // the weekend's timetable, two days to it: race day (the first one seen), then practice and qualifying
    const crossedH = (x: number) => wasH < x && h >= x; wasH = h;
    if (crossedH(5) && race.phase !== 'closed') setPhase('closed');
    if (race.phase === 'closed' && race.next === 'race' && h >= 5 && h < 9) { race.next = 'practice'; R.forEach(c => { if (c.quali === Infinity) c.quali = 40 - c.skill * 10 + rand(0, 0.3); }); setPhase('grid'); }
    if (race.phase === 'closed' && race.next === 'practice' && h >= 7 && h < 9) { race.next = 'race'; setPhase('practice'); }
    if (race.phase === 'practice' && h >= 12.5) { if (R.every(c => c.mode === 'garage')) setPhase('quali'); else R.forEach(c => { if (c.plan === 'practice') c.plan = 'inlap'; c.leaveAt = Infinity; }); }
    if (race.phase === 'quali' && sim.t - race.t0 > 20 && R.every(c => c.mode === 'garage' && c.leaveAt === Infinity)) setPhase('closed');
    if (race.phase === 'grid' && R.every(c => c.hold)) setPhase('formation');
    if (race.phase === 'formation' && R.every(c => c.hold)) setPhase('lights');
    if (race.phase === 'lights') { const e = sim.t - race.lightsT; race.lights = Math.min(5, Math.floor(e)); if (e > 5 + race.out) { race.lights = 0; setPhase('race'); } }
    if (race.phase === 'race' && R.every(c => c.finished || c.dnf)) setPhase('finish');
    if (race.phase === 'finish' && race.order.filter((c: Racer) => !c.dnf).slice(0, 3).every((c: Racer) => c.mode === 'garage')) setPhase('podium');
    if (race.phase === 'podium' && sim.t - race.t0 > 30) setPhase('closed');
    // out of the garages, when a car's time comes
    for (const c of R) {
      if (c.mode === 'garage' && sim.t >= (c.leaveAt ?? Infinity) && (race.phase === 'practice' || race.phase === 'quali' || race.phase === 'grid')) {
        if (race.phase === 'practice') { c.plan = 'practice'; c.laps = 2 + (c.i % 2); c.leaveAt = c.runs-- > 1 ? sim.t + 60 + rand(0, 30) : Infinity; }
        else if (race.phase === 'quali') { c.plan = 'outlap'; c.push = rand(-0.006, 0.006); c.leaveAt = Infinity; }
        else c.leaveAt = Infinity;
        c.go(c.paths.out, 'out'); c.lapT0 = sim.t; c.crossings = 0;
      }
    }
    order();
    for (const c of R) {
      if (c.mode === 'garage' || c.mode === 'retired') { c.v = 0; }
      else if (c.mode === 'push') { c.ps += dt / 4; if (c.ps >= 1) { c.park(); if (c.plan === 'pitIn' || c.plan === 'inlap') c.plan = 'rest'; } }
      else if (c.mode === 'stopped') { c.stopT -= dt; if (c.stopT <= 0) { c.mode = 'through'; c.stops++; c.tyre = c.tyre === 'soft' ? 'medium' : c.tyre === 'medium' ? 'hard' : 'medium'; c.tyreAge = 0; if (c.crew) { c.crew.visible = false; c.crew = null; } } }
      else if (c.mode === 'track') {
        if (c.hold) { c.v = 0; }
        else if (race.phase === 'race' && sim.t < (c.launch ?? 0)) c.v = 0;
        else if (race.phase === 'lights') c.v = 0;
        else drive(c, dt);
      } else pitDrive(c, dt);
      c.place();
    }
    // the start lights, the yellow flag at the spin's corner, the garage doors, the crowd
    C.lights.forEach((l, k) => glow(l, race.phase === 'lights' && race.lights > k));
    const y = race.yellowAt; C.yellow.visible = !!(y && y.spin && !FAR);
    if (C.yellow.visible) { const sp = y.spin, s = y.s; let best = C.posts[0], bd = Infinity; for (const p of C.posts) { const q = trackAt(s), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = p; } } C.yellow.position.copy(W(best.x + 0.9, best.y + 0.9, 0)); C.yellow.rotation.y = Math.sin(sim.t * 8) * 0.5; if (!sp) race.yellowAt = null; }
    const open = race.phase !== 'closed' ? 1 : 0; doorK += clamp(open - doorK, -dt / 2, dt / 2); C.pits.doors.scale.y = Math.max(0.04, 1 - doorK);
    C.crowd.visible = race.phase !== 'closed' && h > 7.5 && !FAR;
  }

  // ---- the cards ----
  const circuit: any = { kind:'circuit', id:'Gull Bay Circuit', groups:[C.base], pick:[2140, 150, 2],
    session() { return { closed:'closed for the night', practice:'practice', quali:'qualifying', grid:'the cars going to the grid', formation:'formation lap', lights:'lights…', race:`race · lap ${Math.min(RACE_LAPS, (race.order[0]?.lap ?? 0) + 1)} of ${RACE_LAPS}`, finish:'chequered flag', podium:'the podium' }[race.phase as string] as string; },
    info() {
      const live = race.phase === 'race' || race.phase === 'finish' || race.phase === 'podium', list = live ? race.order : [...R].sort((a, b) => a.best - b.best || a.i - b.i);
      const rows: [string, string][] = [['Track', '1.5 km · 15 turns · DRS on two straights'], ['Weekend', race.next === 'practice' ? 'race day · tomorrow practice and qualifying' : 'practice and qualifying · tomorrow the race']];
      if (race.phase !== 'closed') list.slice(0, 10).forEach((c: Racer, k: number) => rows.push([live ? (c.dnf ? 'DNF' : `P${k + 1}`) : `${k + 1}.`, `#${c.num} ${c.name.split(' ').pop()} · ${live ? (c.dnf ? 'out' : c.gapText) : fmt(c.best)}`]));
      if (race.fastest.who) rows.push(['Fastest lap', `${fmt(race.fastest.t)} · ${race.fastest.who}`]);
      rows.push(['Lap record', race.record.who ? `${fmt(race.record.t)} · ${race.record.who}` : '—']);
      if (race.lastWinner) rows.push(['Last winner', race.lastWinner]);
      const lead = race.order[0];
      return { kind:'Grand Prix circuit', title:this.id, status:this.session(), rows,
        bar:race.phase === 'race' && lead ? { v:Math.min(RACE_LAPS, lead.lap), max:RACE_LAPS, label:`lap ${Math.min(RACE_LAPS, lead.lap + 1)} of ${RACE_LAPS}` } : undefined,
        actions:[...(lead && race.phase !== 'closed' ? [['Follow the leader', () => hooks.track(race.phase === 'race' ? lead : [...R].filter(c => c.mode === 'track')[0] ?? lead)]] : []), ['Look inside the pits', () => hooks.lookInside(pits)]] };
    },
    readout() { return `gull bay circuit · ${this.session()}`; } };
  C.base.userData.entity = circuit;
  const pits: any = { kind:'pits', id:'Gull Bay pits', groups:[C.pits.g], pick:[2130, 130, 5],
    info() { const by = (t: number) => R.filter(c => c.i >> 1 === t).map(c => `#${c.num} ${c.mode === 'garage' ? 'in' : c.mode === 'stopped' ? 'stopping' : 'out'}`).join(', ');
      return { kind:'Pit building · 10 garages, Race Control', title:this.id, status:race.phase === 'closed' ? 'shut for the night' : circuit.session(), rows:[...TEAMS.map((t, k) => [t.name, by(k)] as [string, string]), ['Race Control', 'the tower at the east end'], ['Podium', 'on the balcony over the pit lane']],
        actions:[['Look inside', () => hooks.lookInside(this)]] }; },
    readout() { return `gull bay pits · ${race.phase === 'closed' ? 'shut' : circuit.session()}`; } };
  C.pits.g.userData.entity = pits;
  return { circuit, pits, racers:R, race, C, entities:() => [circuit, pits, ...R, ...race.podium], update,
    detail() { for (const c of R) c.place(); },
    // debug: jump to a session now ('practice', 'quali', 'grid', 'race' after the grid…)
    jump(ph: string) { if (ph === 'grid') { R.forEach((c, k) => { c.quali = 30 + k * 0.1 + rand(0, 0.5); c.mode = 'garage'; }); } setPhase(ph); return race.phase; } };
}
