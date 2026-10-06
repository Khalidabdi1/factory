import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { Part, glow, pose } from '../kernel/part';
import { clamp, rand, rng, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { PORT, WORLD } from '../layout';
import { BOX, RTG, SHIP, STS, TRAILER, boxInto, buildBox, buildRTG, buildSTS, buildShip, buildSkeletal, buildTug, buildYardTractor, staysPart } from '../models/port';
import { LIGHTS, bayX, buildPortGround, rowY } from '../world/port';
import { clock, kmh, night, sim } from './core';

// ---- Sahel Container Terminal ----
// A ship comes in from the west, the tugs push her alongside, the cranes lower their booms and work her: each takes
// boxes off its bays and sets them on a tractor, which runs round to its block in the yard, where the gantry stacks
// them; then the other way, boxes out of the yard and onto the ship. When the work is done the booms go up, the tugs
// pull her off and she sails on east. Each crane has its block, its gantry and two tractors; the tractors share one
// circuit and pass one another in the passing lane.
const PZ = PORT.z, SH = PORT.ship, [RL, RW] = PORT.rails, LANE = PORT.lane, ROAD = PORT.road, H = BOX.H;
const ROWS_S = 9, TIERS_S = 4, TIERS_Y = 4;
const sRowY = (r: number) => -10.4 + r * 2.6;                 // a ship's row, across her (local y)
const sBayX = (k: number) => SH.bay0 + k * SH.pitch;           // a ship's bay, along her (local x)
const OWNERS = ['SHLU', 'MSKU', 'CMAU', 'HLXU', 'ONEU', 'EGHU', 'TGHU', 'SEGU', 'MEDU', 'OOLU'];
const PORTS = ['Jeddah', 'Jebel Ali', 'Salalah', 'Colombo', 'Port Klang', 'Singapore', 'Mumbai', 'Sohar', 'Dammam', 'Aqaba', 'Port Said', 'Djibouti', 'Mombasa', 'Karachi'];
const GOODS = ['machine parts', 'tyres', 'textiles', 'furniture', 'electronics', 'dates', 'paper', 'floor tiles', 'car parts', 'white goods', 'coffee', 'rice', 'solar panels', 'nothing (empty)'];
const SHIPS: [string, string][] = [['SAHEL STAR', 'SAHEL'], ['NAJD PEARL', 'JEDDAH'], ['RED SEA TRADER', 'MAJURO'], ['GULF HORIZON', 'MONROVIA']];
const pickOf = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
const step = (cur: number, to: number, v: number, dt: number) => cur + clamp(to - cur, -v * dt, v * dt) * Math.min(1, 0.25 + Math.abs(to - cur) * 0.6);

// ---- a box ----
let boxSeq = 0;
class Cbox {
  [k: string]: any;
  constructor(o: any = {}) {
    const n = String(Math.floor(rng() * 900000) + 100000);
    Object.assign(this, { kind:'container', id:`${pickOf(OWNERS)} ${n} ${Math.floor(rng() * 10)}`, seq:boxSeq++, tone:rng() < 0.45 ? 'k' : 'n', goods:pickOf(GOODS),
      from:pickOf(PORTS), to:'Sahel', tonnes:Math.round(rand(4, 28)), where:null, group:null, groups:[], pick:[0, 0, H / 2] }, o);
    if (this.goods.startsWith('nothing')) this.tonnes = 4;
  }
  // a model of its own (while it moves, or while someone looks at it in a stack)
  own() { if (!this.group) { this.group = buildBox(this.tone); this.group.userData.entity = this; this.groups = [this.group]; scene.add(this.group); } return this.group; }
  drop() { if (this.group) { this.group.traverse((o: any) => o.geometry?.dispose()); this.group.removeFromParent(); this.group = null; } }
  status() { const w = this.where; if (!w) return '—';
    switch (w.at) {
      case 'ship': return `on the ${ship.title()} · bay ${String(2 * w.k + 1).padStart(2, '0')}, row ${w.r + 1}, tier ${w.tier + 1}`;
      case 'yard': return `in block ${'ABC'[w.b]} · bay ${w.k + 1}, row ${w.r + 1}, tier ${w.tier + 1}`;
      case 'crane': return `on ${w.c.id}'s spreader`;
      case 'rtg': return `on ${w.c.id}'s spreader`;
      case 'tractor': return `on ${w.t.id} · to ${w.t.box === this && w.t.next === 'rtg' ? `block ${'ABC'[w.t.pair]}` : `${PORT_CRANES[w.t.pair].id}`}`;
    } return '—'; }
  info() { return { kind:'Container · 40 ft, 2.6 m high', title:this.id, status:this.status(),
    rows:[['Owner', this.id.slice(0, 4)], ['Goods', this.goods], ['From', this.from], ['To', this.to], ['Gross', `${this.tonnes + 4} t`]] }; }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
}

// ---- the yard: three blocks of stacks, each drawn as one part ----
type Block = { kind: string, id: string, b: number, stacks: Cbox[][][], kept: Set<Cbox>, groups: any[], bbox: THREE.Box3, pick: number[], [k: string]: any };
// the yard's stacks are drawn as one part (a few draw calls for all of them), redrawn when a box comes or goes
const yardDraw = { g:null as THREE.Object3D | null, dirty:true,
  draw() { this.dirty = false; const p = new Part();
    for (const B of BLOCKS) B.stacks.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => { if (!B.kept.has(c)) boxInto(p, bayX(B.b, k), rowY(r), PZ + t * H, true, c.tone); })));
    const g = p.build('yardStacks'); g.userData.entity = { kind:'block', id:'the yard', groups:[], resolve:(pt: THREE.Vector3) => (BLOCKS.find(b => pt.x > b.bbox.min.x - 1 && pt.x < b.bbox.max.x + 1) ?? BLOCKS[0]).resolve(pt) };
    if (this.g) { this.g.traverse((o: any) => o.geometry?.dispose()); this.g.removeFromParent(); }
    this.g = g; scene.add(g); } };
const BLOCKS: Block[] = PORT.blocks.map(([x0, x1], b) => ({ kind:'block', id:`Block ${'ABC'[b]}`, b, stacks:Array.from({ length:PORT.bays }, () => Array.from({ length:PORT.rows }, () => [] as Cbox[])),
  kept:new Set<Cbox>(), groups:[], bbox:new THREE.Box3(W(x0, PORT.row0 - 0.5, PZ), W(x1, PORT.row0 + PORT.rows * PORT.pitch, PZ + TIERS_Y * H)), pick:[(x0 + x1) / 2, PORT.row0 + 7, PZ + 6],
  count() { return this.stacks.flat().reduce((s: number, q: Cbox[]) => s + q.length, 0); },
  draw() { yardDraw.dirty = true; },
  put(c: Cbox, k: number, r: number) { const q = this.stacks[k][r]; c.where = { at:'yard', b:this.b, k, r, tier:q.length }; q.push(c); c.drop(); this.draw(); },
  take(k: number, r: number) { const c = this.stacks[k][r].pop()!; this.kept.delete(c); this.draw(); return c; },
  resolve(pt: THREE.Vector3) { let best: any = null, bd = 4;
    this.stacks.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => {
      const d = Math.hypot(bayX(this.b, k) - pt.x, rowY(r) - pt.z, PZ + t * H + H / 2 - pt.y) / (Math.abs(bayX(this.b, k) - pt.x) < BOX.L / 2 ? 3 : 1); if (d < bd) { bd = d; best = c; } })));
    return best ?? this; },
  update() {
    let n = 0;
    this.stacks.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => {
      if (hooks.isSelected(c) && !this.kept.has(c)) { this.kept.add(c); pose(c.own(), bayX(this.b, k), rowY(r), 0, PZ + t * H); n++; } })));
    for (const c of [...this.kept]) if (!hooks.isSelected(c)) { this.kept.delete(c); if (c.where?.at === 'yard') c.drop(); n++; }
    if (n) this.draw();
  },
  info() { const n = this.count(), cap = PORT.bays * PORT.rows * TIERS_Y;
    return { kind:'Container stack · RTG block', title:this.id, status:`${n} boxes · worked by ${YARD[this.b]?.id ?? '—'}`, bar:{ v:n, max:cap, label:`${n} of ${cap} slots · ${n * 2} TEU` },
      rows:[['Layout', `${PORT.bays} bays × ${PORT.rows} rows × ${TIERS_Y} high`], ['Serves', PORT_CRANES[this.b]?.id ?? '—']] }; },
  readout() { return `${this.id.toLowerCase()} · ${this.count()} boxes`; },
}));

// ---- the ship ----
const ship: any = { kind:'ship', id:'SAHEL STAR', groups:[], pick:[0, 0, 12], g:null, x:SH.x, y:SH.y, v:0, state:'away', next:0, t:0, calls:0, call:0,
  bays:Array.from({ length:SH.bays }, () => Array.from({ length:ROWS_S }, () => [] as Cbox[])), kept:new Set<Cbox>(), moves:0, from:'', to:'',
  title() { return this.id.split(' ').map((w: string) => w[0] + w.slice(1).toLowerCase()).join(' '); },
  count() { return this.bays.flat().reduce((s: number, q: Cbox[]) => s + q.length, 0); },
  build(i: number) {
    const [name, flag] = SHIPS[i % SHIPS.length]; this.id = name; this.flag = flag;
    if (this.g) { this.g.traverse((o: any) => o.geometry?.dispose()); this.g.removeFromParent(); }
    this.g = buildShip(name, flag); this.g.userData.entity = this; this.groups = [this.g]; scene.add(this.g);
    this.cargo = this.g.getObjectByName('cargo'); this.ropes = this.g.getObjectByName('moorings'); this.moves = 0;
    const prev = PORTS[(i * 5 + 2) % PORTS.length]; this.from = prev; this.to = PORTS[(i * 7 + 5) % PORTS.length];
    // her cargo: most bays half to full, some boxes for Sahel, the rest going on
    for (const bay of this.bays) for (const q of bay) { q.length = 0; const n = Math.floor(rand(1, TIERS_S + 0.99)); for (let t = 0; t < n; t++) q.push(new Cbox({ from:prev, to:rng() < 0.5 ? 'Sahel' : this.to })); }
    this.restack();
  },
  restack() { this.bays.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => { c.where = { at:'ship', k, r, tier:t }; }))); this.draw(); },
  draw() {
    const p = new Part();
    this.bays.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => { if (!this.kept.has(c)) boxInto(p, sBayX(k), sRowY(r), SHIP.hatch + t * H, true, c.tone); })));
    const old = this.cargo.getObjectByName('cargoPart'); if (old) { old.traverse((o: any) => o.geometry?.dispose()); old.removeFromParent(); }
    const g = p.build('cargoPart'); g.userData.entity = this; this.cargo.add(g);
  },
  // where a slot is in the town (at the berth)
  slot(k: number, r: number, t: number) { return [this.x + sBayX(k), this.y + sRowY(r), SHIP.hatch + t * H]; },
  resolve(pt: THREE.Vector3) {
    let best: any = null, bd = 4;
    this.bays.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => { const [x, y, z] = this.slot(k, r, t);
      const d = Math.hypot(x - pt.x, y - pt.z, z + H / 2 - pt.y) / (Math.abs(x - pt.x) < BOX.L / 2 ? 3 : 1); if (d < bd) { bd = d; best = c; } })));
    return best ?? this;
  },
  update(dt: number) {
    this.t += dt;
    switch (this.state) {
      case 'away': if (sim.t >= this.next) { this.build(++this.call); this.calls++; this.state = 'in'; this.x = WORLD.x0 - SH.half - 20; this.y = SH.in; this.v = 8.5; this.g.visible = true; } break;
      case 'in': { const d = SH.x - this.x; this.v = Math.min(8.5, 0.25 + Math.sqrt(2 * 0.06 * Math.max(0, d))); this.x = Math.min(SH.x, this.x + this.v * dt);
        if (d < 0.05) { this.x = SH.x; this.v = 0; this.state = 'berthing'; this.t = 0; } break; }
      case 'berthing': { this.y = step(this.y, SH.y, 0.7, dt); this.v = 0;
        if (Math.abs(this.y - SH.y) < 0.02) { this.y = SH.y; this.state = 'working'; this.t = 0; this.ropes.visible = true; this.moves = 0; for (const c of PORT_CRANES) c.start(); } break; }
      case 'working': if (PORT_CRANES.every(c => c.mode === 'done') && TRACTORS.every(t => !t.box) && YARD.every(y => !y.box)) { this.state = 'unberthing'; this.t = 0; this.ropes.visible = false; } break;
      case 'unberthing': if (PORT_CRANES.every(c => c.boomK >= 1)) { this.y = step(this.y, SH.in, 0.7, dt); if (Math.abs(this.y - SH.in) < 0.05) { this.y = SH.in; this.state = 'out'; this.v = 0; } } break;
      case 'out': this.v = Math.min(8.5, this.v + 0.08 * dt); this.x += this.v * dt;
        if (this.x - SH.half > WORLD.x1 + 30) { this.state = 'away'; this.next = sim.t + rand(50, 80); this.g.visible = false; hooks.forget(this); } break;
    }
    // a box someone picks out of her stacks stays its own model while they look at it
    let n = 0;
    this.bays.forEach((bay: Cbox[][], k: number) => bay.forEach((q: Cbox[], r: number) => q.forEach((c, t) => { if (hooks.isSelected(c) && !this.kept.has(c)) { this.kept.add(c); const g = c.own(); this.cargo.add(g); pose(g, sBayX(k), sRowY(r), 0, SHIP.hatch + t * H); n++; } })));
    for (const c of [...this.kept]) if (!hooks.isSelected(c)) { this.kept.delete(c); if (c.where?.at === 'ship') c.drop(); n++; }
    if (n) this.draw();
    pose(this.g, this.x, this.y, 0, 0);
  },
  status() {
    return { away:`next ship due ${clock(this.next)}`, in:`coming in from ${this.from} · ${Math.round(this.v * 1.94)} kn`, berthing:'the tugs are pushing her alongside',
      working:`alongside · ${PORT_CRANES.filter(c => c.mode !== 'done').length} cranes working`, unberthing:'the tugs are pulling her off', out:`sailing for ${this.to} · ${Math.round(this.v * 1.94)} kn` }[this.state as string];
  },
  info() {
    const n = this.count(), cap = SH.bays * ROWS_S * TIERS_S;
    return { kind:`Container ship · ${this.flag}`, title:this.title(), status:this.status(), bar:{ v:n, max:cap, label:`${n} boxes on deck · ${n * 2} TEU` },
      rows:[['From', this.from], ['Next port', this.to], ['Length', `${2 * SH.half} m · beam ${2 * SH.beam} m`], ['Moves this call', String(this.moves)], ['Calls', String(this.calls)]] };
  },
  readout() { return `${this.title()} · ${this.status()}`.toLowerCase(); },
  route() { if (this.state === 'in') return { pts:[[this.x + SH.half, this.y], [SH.x + SH.half, SH.in], [SH.x + SH.half, SH.y]], next:[SH.x, SH.y], stop:'berth 1' };
    if (this.state === 'out') return { pts:[[this.x + SH.half, this.y], [WORLD.x1 + 40, this.y]], next:null, stop:this.to }; return null; },
};

// ---- the tugs ----
class Tug {
  [k: string]: any;
  constructor(i: number) {
    const [x, y] = PORT.tugs[i];
    Object.assign(this, { kind:'tug', id:`SAHEL ${i + 1}`, i, home:[x, y + 3], x, y:y + 3, h:Math.PI, v:0, job:'moored', line:null, pick:[0, 0, 4] });
    this.g = buildTug(this.id); this.g.userData.entity = this; this.groups = [this.g]; scene.add(this.g);
    const lp = new Part(); lp.seg('line', W(0, 0, 0), W(1, 0, 0)); this.line = lp.build('towline'); this.line.visible = false; scene.add(this.line);
  }
  // where to be: against the ship's south side, forward or aft, pushing her in; off her bow or stern on a line,
  // pulling her off; or home at the pontoon. They get about by a lane south of her path (TLANE).
  target() {
    const s = ship, ox = this.i ? -48 : 48, push = s.y + SH.beam + 11.6;
    if (s.state === 'in' && s.x > SH.x - 320) return [s.x + ox, push + 2, -Math.PI / 2, 'meeting'];
    if (s.state === 'berthing') return [s.x + ox, push, -Math.PI / 2, 'pushing'];
    const end = this.i ? -1 : 1, px = s.x + end * (SH.half + 16), py = s.y + 14;
    if (s.state === 'unberthing') return [px, py, end > 0 ? Math.PI / 5 : Math.PI - Math.PI / 5, PORT_CRANES.every(c => c.boomK >= 1) ? 'pulling' : 'standing by'];
    return [this.home[0], this.home[1], Math.PI, 'moored'];
  }
  update(dt: number) {
    let [tx, ty, th, job] = this.target() as [number, number, number, string]; this.job = job;
    const TLANE = PORT.ship.in + SH.beam + 13;
    if (Math.abs(this.x - tx) > 8 && job !== 'pushing' && job !== 'pulling') { ty = TLANE; th = Math.atan2(0, tx - this.x); if (Math.abs(this.y - TLANE) > 3) tx = this.x; }
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy), vmax = job === 'pushing' || job === 'pulling' ? 1.2 : 5;
    this.v = Math.min(vmax, d * 0.6);
    if (d > 0.3) { const want = Math.atan2(dy, dx), turn = d > 6 ? want : th; this.h += clamp(wrap(turn - this.h), -0.6 * dt, 0.6 * dt); this.x += dx / d * this.v * dt; this.y += dy / d * this.v * dt; }
    else this.h += clamp(wrap(th - this.h), -0.6 * dt, 0.6 * dt);
    pose(this.g, this.x, this.y, this.h, 0);
    // the tow line, from her side to the tug's stern while pulling
    const pull = job === 'pulling' || job === 'standing by';
    this.line.visible = pull;
    if (pull) { const ax = ship.x + (this.i ? -SH.half + 2 : SH.half - 6), ay = ship.y + 4, bx = this.x - Math.cos(this.h) * 8, by = this.y - Math.sin(this.h) * 8;
      this.line.position.copy(W(ax, ay, SHIP.deck)); const v = W(bx - ax, by - ay, 2.4 - SHIP.deck); this.line.scale.set(v.length(), 1, 1); this.line.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v.normalize()); }
  }
  info() { return { kind:'Harbour tug · 28 m, 50 t bollard pull', title:this.id, status:this.job === 'moored' ? 'at the pontoon' : `${this.job} the ${ship.title()}`, rows:[['Speed', kmh(this.v)], ['Berth', 'the pontoon, east end of the quay']] }; }
  readout() { return `${this.id} · ${this.info().status}`.toLowerCase(); }
}
const TUGS: Tug[] = [];

// ---- the cranes on the quay ----
const TRAVEL = PZ + 20, HOVER = PZ + 9;   // the spreader's height to travel at (a box clear of every stack), and to wait over the lane at
class Crane {
  [k: string]: any;
  constructor(i: number) {
    const m = buildSTS(`STS ${i + 1}`);
    Object.assign(this, { kind:'sts', id:`STS ${i + 1}`, i, x:PORT.cranes[i], tx:PORT.cranes[i], ty:STS.back + 3, sz:TRAVEL, boomK:1, box:null, mode:'idle', step:'park', t:0,
      d:0, l:0, lPlanned:0, moves:0, k:null, r:0, pick:[0, 330, 20], g:m.g, boom:m.boom, trolley:m.trolley, spreader:m.spreader, ropes:m.ropes, staysG:m.stays, staysK:-1,
      op:pickOf(['Y. Saleh', 'R. Kurian', 'M. Haddad', 'J. Ferreira', 'A. Mubarak', 'T. Okoye']) });
    this.g.userData.entity = this; this.groups = [this.g]; scene.add(this.g);
    this.bays = i === 0 ? [0, 1, 2] : i === 1 ? [3, 4, 5] : [6, 7];
  }
  start() { this.mode = 'discharge'; this.d = 5; this.l = 5; this.lPlanned = 0; this.moves = 0; this.step = 'choose'; }
  neighbours() { return PORT_CRANES.filter(c => c !== this); }
  clear(x: number) { return this.neighbours().every(c => Math.abs(c.x - x) > 15.5 && Math.abs(c.tx - x) > 15.5); }
  // the tractor of this crane's pair standing under it, if there is one
  under() { return TRACTORS.find(t => t.pair === this.i && t.at === 'crane'); }
  update(dt: number) {
    const working = ship.state === 'working';
    this.boomK = clamp(this.boomK + (working ? -1 : 1) * dt / 9, 0, 1);
    if (this.boomK > 0 || !working) { this.ty = step(this.ty, STS.back + 3, 2.5, dt); this.sz = step(this.sz, TRAVEL, 1.6, dt); }
    else this.work(dt);
    this.x = step(this.x, this.tx, 1.2, dt);
    this.place();
  }
  // where the spreader goes for a ship's slot, a box's top (or, holding one, the top of the slot below it)
  work(dt: number) {
    const T = this.under(), lane = T ? T.bedY() : LANE, s = ship;
    const go = (y: number, z: number) => { this.ty = step(this.ty, y, 3.6, dt); if (Math.abs(this.ty - y) < 0.05) { this.sz = step(this.sz, z, 2.8, dt); return Math.abs(this.sz - z) < 0.03; } return false; };
    const up = () => { this.sz = step(this.sz, TRAVEL, 2.8, dt); return Math.abs(this.sz - TRAVEL) < 0.05; };
    switch (this.step) {
      case 'choose': {   // the next bay to work, and the row in it
        if (this.mode === 'discharge' && this.d <= 0) { this.mode = 'load'; }
        if (this.mode === 'load' && this.l <= 0) { this.mode = 'done'; this.step = 'park'; break; }
        const has = (k: number) => this.mode === 'discharge' ? s.bays[k].some((q: Cbox[]) => q.length) : s.bays[k].some((q: Cbox[]) => q.length < TIERS_S);
        const ks = this.bays.filter((k: number) => has(k) && this.clear(s.x + sBayX(k)));
        if (!ks.length) { if (!this.bays.some((k: number) => has(k))) { this.mode === 'discharge' ? this.d = 0 : this.l = 0; } break; }
        this.k = ks.includes(this.k) ? this.k : ks[0]; this.tx = s.x + sBayX(this.k);
        this.step = this.mode === 'discharge' ? 'gantry' : 'wait-load'; break;
      }
      case 'gantry': if (Math.abs(this.x - this.tx) < 0.05) { const q = s.bays[this.k]; this.r = q.reduce((b: number, x: Cbox[], i: number) => x.length > q[b].length ? i : b, 0); this.step = 'out'; } else up(); break;
      case 'out': { const q = s.bays[this.k][this.r], [, y, z] = s.slot(this.k, this.r, q.length); if (go(y, z)) this.step = 'grab'; break; }
      case 'grab': if ((this.t += dt) > 0.9) { this.t = 0; const q = s.bays[this.k][this.r], c = q.pop()!; s.kept.delete(c); s.draw(); this.box = c; c.where = { at:'crane', c:this };
        this.spreader.add(c.own()); pose(c.group, 0, 0, 0, -H); this.step = 'lift'; } break;
      case 'lift': if (up()) this.step = 'in'; break;
      case 'in': if (go(lane, T && !T.box && T.ready ? PZ + TRAILER.deck + H : HOVER + H) && T && !T.box && T.ready) this.step = 'set'; break;
      case 'set': if ((this.t += dt) > 0.8) { this.t = 0; T.take(this.box); T.done(); this.box = null; this.d--; this.moves++; s.moves++; this.step = 'rise'; } break;
      case 'rise': if (up()) this.step = 'choose'; break;
      // loading: wait over the lane for a tractor with a box, take it, out to a slot with room
      case 'wait-load': if (go(lane, T && T.box && T.ready ? PZ + TRAILER.deck + H : HOVER + H) && T && T.box && T.ready) this.step = 'pick'; break;
      case 'pick': if ((this.t += dt) > 0.9) { this.t = 0; const c = T.give(); T.done(); this.box = c; c.where = { at:'crane', c:this }; this.spreader.add(c.own()); pose(c.group, 0, 0, 0, -H); this.step = 'lift2'; } break;
      case 'lift2': if (up()) { const q = s.bays[this.k]; this.r = q.reduce((b: number, x: Cbox[], i: number) => x.length < q[b].length ? i : b, 0); this.step = 'out2'; } break;
      case 'out2': { const q = s.bays[this.k][this.r], [, y, z] = s.slot(this.k, this.r, q.length + 1); if (go(y, z)) this.step = 'place'; break; }
      case 'place': if ((this.t += dt) > 0.8) { this.t = 0; const c = this.box; this.box = null; c.drop(); c.to = s.to; s.bays[this.k][this.r].push(c); s.restack(); this.l--; this.lPlanned--; this.moves++; s.moves++; this.step = 'rise2'; } break;
      case 'rise2': if (up()) this.step = 'choose'; break;
      case 'park': this.ty = step(this.ty, STS.back + 3, 2.5, dt); up(); break;
    }
  }
  place() {
    pose(this.g, this.x, 0, 0, 0);
    this.boom.rotation.x = -this.boomK * 1.35;
    if (this.staysK !== this.boomK) { this.staysK = this.boomK; for (const o of [...this.staysG.children]) { o.traverse((q: any) => q.geometry?.dispose()); o.removeFromParent(); } this.staysG.add(staysPart(this.boomK)); }
    pose(this.trolley, 0, this.ty, 0, STS.trolleyZ); pose(this.spreader, 0, this.ty, 0, this.sz);
    pose(this.ropes, 0, this.ty, 0, this.sz + 1.02); this.ropes.scale.y = Math.max(0.05, STS.trolleyZ - this.sz - 1.02);
  }
  status() {
    if (ship.state !== 'working') return this.boomK < 1 ? 'raising its boom' : ship.state === 'away' ? 'boom up · no ship at the berth' : `boom up · the ${ship.title()} is ${ship.state === 'in' ? 'coming in' : ship.state === 'out' ? 'leaving' : 'moving'}`;
    if (this.boomK > 0) return 'lowering its boom';
    if (this.mode === 'done') return 'finished with this ship';
    const c = this.box;
    return { choose:'moving along the ship', gantry:'moving along the ship', out:'trolley out over the ship', grab:'taking a box off the ship', lift:`lifting ${c?.id}`, in:`waiting to set ${c?.id} on a tractor`,
      set:`setting ${c?.id} on a tractor`, rise:'spreader going up', 'wait-load':'waiting for a tractor with an export', pick:'taking a box off a tractor', lift2:`lifting ${c?.id}`, out2:`trolley out with ${c?.id}`,
      place:`setting ${c?.id} on the ship`, rise2:'spreader going up', park:'parked' }[this.step as string] ?? '';
  }
  info() { return { kind:'Ship-to-shore crane · 38 m outreach', title:this.id, status:this.status(), bar:{ v:this.moves, max:10, label:`${this.moves} of 10 moves this call · ${Math.max(0, this.d)} off, ${Math.max(0, this.l)} on to go` },
    rows:[['Driver', this.op], ['Works', `bays ${this.bays.map((k: number) => String(2 * k + 1).padStart(2, '0')).join(', ')}`], ['Yard', `block ${'ABC'[this.i]} · ${YARD[this.i].id}`], ['Lift', 'twin twenty or one forty · 50 t']] }; }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
}
const PORT_CRANES: Crane[] = [];

// ---- the yard's gantries: stack what the tractors bring, give them what the ship is to take ----
class Gantry {
  [k: string]: any;
  constructor(i: number) {
    const m = buildRTG(`RTG ${i + 1}`), [x0, x1] = PORT.blocks[i];
    Object.assign(this, { kind:'rtg', id:`RTG ${i + 1}`, i, x:(x0 + x1) / 2, tx:(x0 + x1) / 2, ty:ROAD, sz:PZ + 13, box:null, step:'wait', t:0, k:0, r:0, moves:0, pick:[0, 297, 12],
      g:m.g, trolley:m.trolley, spreader:m.spreader, ropes:m.ropes });
    this.g.userData.entity = this; this.groups = [this.g]; scene.add(this.g);
  }
  get block() { return BLOCKS[this.i]; }
  under() { return TRACTORS.find(t => t.pair === this.i && t.at === 'rtg'); }
  crane() { return PORT_CRANES[this.i]; }
  // (exports go out to a tractor only once its crane is loading: a tractor never waits under a crane with one while
  // the crane waits for an empty tractor)
  wantsExport() { const c = this.crane(); return c.mode === 'load' && c.l - c.lPlanned > 0; }
  // a bay to stack the next box in (the lowest), or to take the next export from (the tallest)
  aim() {
    const st = this.block.stacks, tot = (k: number) => st[k].reduce((s: number, q: Cbox[]) => s + q.length, 0);
    const T = TRACTORS.find(t => t.pair === this.i && t.next === 'rtg' && (t.box || this.wantsExport()));
    if (!T) return;
    const ks = [0, 1, 2, 3].filter(k => T.box ? st[k].some(q => q.length < TIERS_Y) : st[k].some(q => q.length));
    if (!ks.length) return;
    this.k = ks.reduce((b, k) => (T.box ? tot(k) < tot(b) : tot(k) > tot(b)) ? k : b, ks[0]); this.tx = bayX(this.i, this.k);
  }
  update(dt: number) {
    const T = this.under(), st = this.block.stacks, top = PZ + TIERS_Y * H + 1.6, lane = T ? T.bedY() : ROAD;
    const go = (y: number, z: number) => { this.ty = step(this.ty, y, 2.6, dt); if (Math.abs(this.ty - y) < 0.04) { this.sz = step(this.sz, z, 2.2, dt); return Math.abs(this.sz - z) < 0.03; } return false; };
    const up = () => { this.sz = step(this.sz, top, 2.2, dt); return Math.abs(this.sz - top) < 0.05; };
    switch (this.step) {
      case 'wait':
        if (!T) { up(); this.aim(); break; }
        if (!T.ready || Math.abs(this.x - this.tx) > 0.05) break;
        if (T.box) { if (go(lane, PZ + TRAILER.deck + H)) this.step = 'grab'; }
        else if (this.wantsExport()) { const q = st[this.k], r = q.reduce((b: number, x: Cbox[], i: number) => x.length > q[b].length ? i : b, 0); if (q[r].length) { this.r = r; this.step = 'fetch'; } else T.done(); }
        else T.done();
        break;
      case 'grab': if ((this.t += dt) > 0.8) { this.t = 0; const c = T.give(); this.box = c; c.where = { at:'rtg', c:this }; this.spreader.add(c.own()); pose(c.group, 0, 0, 0, -H);
        const q = st[this.k]; this.r = q.reduce((b: number, x: Cbox[], i: number) => x.length < q[b].length ? i : b, 0); this.step = 'hoist'; } break;
      case 'hoist': if (up()) this.step = 'stack'; break;
      case 'stack': if (go(rowY(this.r), PZ + (st[this.k][this.r].length + 1) * H)) this.step = 'set'; break;
      case 'set': if ((this.t += dt) > 0.7) { this.t = 0; const c = this.box; this.box = null; c.to = PORTS[(c.seq * 3) % PORTS.length]; this.block.put(c, this.k, this.r); this.moves++;
        this.step = this.wantsExport() && T && st[this.k].some(q => q.length) ? 'fetch0' : 'release'; } break;
      case 'release': if (up()) { T?.done(); this.step = 'wait'; } break;
      case 'fetch0': { const q = st[this.k]; this.r = q.reduce((b: number, x: Cbox[], i: number) => x.length > q[b].length ? i : b, 0); this.step = 'fetch'; break; }
      case 'fetch': if (this.sz < top - 0.05 && Math.abs(this.ty - rowY(this.r)) > 0.05) up(); else if (go(rowY(this.r), PZ + st[this.k][this.r].length * H)) this.step = 'take'; break;
      case 'take': if ((this.t += dt) > 0.8) { this.t = 0; const c = this.block.take(this.k, this.r); c.where = { at:'rtg', c:this }; c.to = ship.to; this.box = c; this.spreader.add(c.own()); pose(c.group, 0, 0, 0, -H);
        this.crane().lPlanned++; this.step = 'hoist2'; } break;
      case 'hoist2': if (up()) this.step = 'carry'; break;
      case 'carry': if (go(lane, PZ + TRAILER.deck + H)) this.step = 'hand'; break;
      case 'hand': if ((this.t += dt) > 0.7) { this.t = 0; const c = this.box; this.box = null; T.take(c); this.moves++; this.step = 'release'; } break;
    }
    if (this.step === 'wait') this.x = step(this.x, this.tx, 2.2, dt);
    pose(this.g, this.x, 0, 0, 0); pose(this.trolley, 0, this.ty, 0, RTG.trolleyZ); pose(this.spreader, 0, this.ty, 0, this.sz);
    pose(this.ropes, 0, this.ty, 0, this.sz + 1.02); this.ropes.scale.y = Math.max(0.05, RTG.trolleyZ - this.sz - 1.02);
    this.block.update();
  }
  status() { const c = this.box; return { wait:this.under() ? 'over a tractor' : 'waiting for a tractor', grab:'taking a box off a tractor', stack:`stacking ${c?.id}`, set:`setting ${c?.id} down`,
    hoist:`lifting ${c?.id}`, hoist2:`lifting ${c?.id}`, release:'spreader going up', fetch0:'going for an export', fetch:'going for an export', take:'taking an export off the stack', carry:`bringing ${c?.id} to a tractor`, hand:`setting ${c?.id} on a tractor` }[this.step as string]; }
  info() { return { kind:'Rubber-tyred gantry crane', title:this.id, status:this.status(), rows:[['Block', this.block.id], ['Stacks', `${TIERS_Y} high, ${PORT.rows} wide`], ['Moves', String(this.moves)]] }; }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
}
const YARD: Gantry[] = [];

// ---- the tractors and their trailers, round the one circuit ----
const [LX0, LX1] = PORT.loop;
const LOOP = new Path([[LX0, LANE], [LX1, LANE], [LX1, ROAD], [LX0, ROAD]], 7, true), LL = LOOP.length;
const TOFF = -TRAILER.pin + TRAILER.len / 2;   // from the tractor's front to the trailer's middle
const sOf = (x: number, y: number) => LOOP.project(x, y);
class Tractor {
  [k: string]: any;
  constructor(i: number) {
    Object.assign(this, { kind:'tractor', id:`T-0${i + 1}`, i, pair:Math.floor(i / 2), s:sOf(700 + i * 21, LANE) + TOFF, v:0, lat:0, latT:0, box:null, next:'crane', at:null, ready:false, trips:0, pick:[-2, 0, 2.6],
      driver:pickOf(['K. Nair', 'H. Al-Shammari', 'S. Pillai', 'O. Haddad', 'P. Musa', 'F. Rahimi', 'D. Mensah', 'I. Qureshi']) });
    this.cab = buildYardTractor(); this.trailer = buildSkeletal();
    for (const g of [this.cab, this.trailer]) { g.userData.entity = this; scene.add(g); }
    this.lite = [new Part().box(-4.4, -1.2, 0.5, 4.4, 2.4, 2.4, 'kb').build('tractorLite'), new Part().box(-TRAILER.len, -1.22, 0.5, TRAILER.len, 2.44, 1.0, 'kb').build('trailerLite')];
    for (const g of this.lite) { g.userData.entity = this; g.visible = false; scene.add(g); }
    this.groups = [this.cab, this.trailer, ...this.lite]; this.place();
  }
  lod(far: boolean) { this.far = far; this.cab.visible = !far; for (const m of this.trailer.children) if (m.name !== 'box') m.visible = !far; this.lite[0].visible = this.lite[1].visible = far; this.place(); }
  // where along the circuit it stops next: under its crane, under its gantry, or its parking place
  stopS() {
    const c = PORT_CRANES[this.pair], y = YARD[this.pair];
    if (this.next === 'crane') return sOf(c.tx, LANE) + TOFF;
    if (this.next === 'rtg') return sOf(y.tx, ROAD) + TOFF;
    return sOf(696 + this.i * 19, LANE) + TOFF;
  }
  // does it have business at the next stop, or does it go round?
  business() {
    const c = PORT_CRANES[this.pair], g = YARD[this.pair];
    if (this.next === 'crane') return this.box ? c.mode === 'load' : c.mode === 'discharge' && c.d > 0;
    if (this.next === 'rtg') return !!this.box || g.wantsExport();
    return true;
  }
  take(c: Cbox) { this.box = c; c.where = { at:'tractor', t:this }; this.trailer.add(c.own()); pose(c.group, -TRAILER.len / 2 + 0.15, 0, 0, TRAILER.deck); }
  give() { const c = this.box; this.box = null; return c; }
  done() { this.at = null; this.ready = false; this.next = this.next === 'crane' ? 'rtg' : 'crane'; this.trips++; }
  update(dt: number) {
    const working = ship.state === 'working' && PORT_CRANES[this.pair].mode !== 'done';
    if (!working && !this.box && this.next !== 'park' && !this.at) this.next = 'park';
    if (working && this.next === 'park') this.next = 'crane';
    if (this.at) {   // standing at a stop while it is served (the crane or gantry sends it on)
      this.v = 0; this.ready = true; const c = PORT_CRANES[this.pair];
      if (this.at === 'crane' && !this.business() && c.step !== 'set' && c.step !== 'pick') this.done();
      this.place(); return;
    }
    // the stop ahead, if it has business there; the tractors ahead in its lane
    let stop = Infinity; const ds = ((this.stopS() - this.s) % LL + LL) % LL;
    if (this.business() || this.next === 'park') stop = ds;
    else if (ds < 1) this.done();
    let room = stop, passing = false;
    for (const o of TRACTORS) if (o !== this) {
      const d = ((o.s - this.s) % LL + LL) % LL; if (d <= 0 || d > 45) continue;
      const blocking = Math.abs(o.lat - this.lat) < 1.8 || Math.abs(o.lat - this.latT) < 1.8;
      if (o.v < 0.5 && stop > d + 2 && d < 32 && this.onStraight()) { passing = true; if (Math.abs(o.lat - PORT.pass) > 1.8) continue; }
      if (blocking) room = Math.min(room, d - 18.5);
    }
    this.latT = passing ? PORT.pass : (TRACTORS.some(o => o !== this && Math.abs(o.lat) < 1.8 && Math.abs(((o.s - this.s) % LL + LL + LL / 2) % LL - LL / 2) < 19) ? this.latT : 0);
    this.lat = step(this.lat, this.latT, 1.2, dt);
    const vmax = this.box ? 6.5 : 8, vT = Math.min(vmax, Math.sqrt(2 * 1.4 * Math.max(0, room)));
    this.v = vT < this.v ? vT : Math.min(vT, this.v + 1.2 * dt);
    this.s = (this.s + this.v * dt) % LL;
    if (stop < 0.15 && this.v < 0.3 && this.next !== 'park') { this.at = this.next; this.ready = false; }
    this.place();
  }
  // the middle of its trailer's deck, across the lane (cranes and gantries set boxes down there)
  bedY() { const a = LOOP.at(this.s - TOFF); return a.y - Math.cos(a.h) * this.lat; }
  onStraight() { const a = LOOP.at(this.s); return Math.abs(Math.sin(a.h)) < 0.05 && a.x > LX0 + 12 && a.x < LX1 - 30; }
  pt(s: number) { const a = LOOP.at(s); return { x:a.x + Math.sin(a.h) * this.lat, y:a.y - Math.cos(a.h) * this.lat, h:a.h }; }
  place() {
    const F = this.pt(this.s), K = this.pt(this.s + TRAILER.pin), R = this.pt(this.s + TRAILER.pin - TRAILER.len);
    const hk = Math.atan2(K.y - R.y, K.x - R.x);
    pose(this.cab, F.x, F.y, F.h, PZ); pose(this.trailer, K.x, K.y, hk, PZ); pose(this.lite[0], F.x, F.y, F.h, PZ); pose(this.lite[1], K.x, K.y, hk, PZ);
    this.points = [[F.x, F.y], [R.x, R.y]];
  }
  status() {
    const c = PORT_CRANES[this.pair], g = YARD[this.pair];
    if (this.at === 'crane') return this.box ? `under ${c.id} · ${c.box ? 'being unloaded' : 'waiting for the crane'}` : `under ${c.id} · waiting for a box`;
    if (this.at === 'rtg') return this.box ? `under ${g.id} · being unloaded` : `under ${g.id} · being loaded`;
    if (this.next === 'park') return 'parked';
    return `${this.box ? `taking ${this.box.id} to ${this.next === 'rtg' ? `block ${'ABC'[this.pair]}` : c.id}` : `on its way to ${this.next === 'rtg' ? g.id : c.id}`} · ${kmh(this.v)}`;
  }
  info() { return { kind:'Terminal tractor · skeletal trailer', title:this.id, status:this.status(), rows:[['Driver', this.driver], ['Works for', `${PORT_CRANES[this.pair].id} and ${YARD[this.pair].id}`], ['Carrying', this.box?.id ?? 'nothing'], ['Runs', String(Math.floor(this.trips / 2))]] }; }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  route() { if (this.at || this.next === 'park') return null; const pts = [[this.pt(this.s).x, this.pt(this.s).y]]; const ds = ((this.stopS() - this.s) % LL + LL) % LL;
    for (let u = 4; u < ds; u += 4) { const a = LOOP.at(this.s + u); pts.push([a.x, a.y]); } const e = LOOP.at(this.s + ds); pts.push([e.x, e.y]);
    return { pts, next:[e.x, e.y], stop:this.next === 'rtg' ? YARD[this.pair].id : PORT_CRANES[this.pair].id }; }
}
const TRACTORS: Tractor[] = [];

// ---- the terminal itself, and the lights out in the water ----
const lamps: THREE.Object3D[] = [];
export const port: any = { kind:'terminal', id:'Sahel Container Terminal', groups:[], pick:[800, 300, 6], ship, cranes:PORT_CRANES, yard:YARD, tractors:TRACTORS, tugs:TUGS, blocks:BLOCKS,
  status() { return ship.state === 'working' ? `the ${ship.title()} alongside · ${PORT_CRANES.filter(c => c.mode !== 'done').length} cranes working` : ship.state === 'away' ? `berth empty · next ship ${clock(ship.next)}` : ship.status(); },
  info() {
    const n = BLOCKS.reduce((s, b) => s + b.count(), 0), cap = BLOCKS.length * PORT.bays * PORT.rows * TIERS_Y;
    return { kind:'Container terminal · one berth, three cranes', title:this.id, status:hooks.crimeAt('port') ?? this.status(), bar:{ v:n, max:cap, label:`yard ${n * 2} TEU of ${cap * 2}` },
      rows:[['Berth 1', ship.state === 'away' ? 'empty' : ship.title()], ['Moves this call', String(ship.moves)], ['Ships worked', String(ship.calls)], ['Quay', `${PORT.x1 - PORT.x0} m · 14 m alongside`], ['Gate', 'Port Av']] };
  },
  readout() { return `sahel container terminal · ${this.status()}`; },
  entities() { return [this, ship, ...PORT_CRANES, ...YARD, ...TRACTORS, ...TUGS, ...BLOCKS, ...PORT_CRANES.map(c => c.box), ...YARD.map(g => g.box), ...TRACTORS.map(t => t.box), ...BLOCKS.flatMap(b => [...b.kept]), ...ship.kept].filter(Boolean); },
  vehicles() { return [ship, ...TUGS, ...TRACTORS].filter(v => v !== ship || ship.state !== 'away'); },
  // a few pixels a metre out: the ropes and stays are left out, the tractors are a block each
  detail(far: boolean) { for (const c of [...PORT_CRANES, ...YARD]) { c.ropes.visible = !far; if (c.staysG) c.staysG.visible = !far; } for (const t of TRACTORS) t.lod(far); },
  update(dt: number) {
    ship.update(dt);
    for (const t of TUGS) t.update(dt);
    for (const c of PORT_CRANES) c.update(dt);
    for (const g of YARD) g.update(dt);
    for (const t of TRACTORS) t.update(dt);
    // the lights at the breakwater's heads and on the buoys: a flash every few seconds after dark
    const n = night() > 0.3;
    lamps.forEach((g, kind) => glow(g, n && sim.t % (kind ? 4 : 2.5) < 0.5));
    if (yardDraw.dirty) yardDraw.draw();
  },
};

export function buildPort() {
  const ground = buildPortGround(); scene.add(ground);
  ground.userData.entity = { kind:'terminal', id:port.id, groups:[], resolve:(pt: THREE.Vector3) => { for (const b of BLOCKS) if (b.bbox.containsPoint(pt) || (pt.x > b.bbox.min.x && pt.x < b.bbox.max.x && pt.z > b.bbox.min.z && pt.z < b.bbox.max.z)) return b; return port; } };
  for (const kind of [0, 1]) { const p = new Part(); for (const [x, y, z, k] of LIGHTS) if (k === kind) p.box(x - 0.3, y - 0.3, z, 0.6, 0.6, 0.6, 'l');
    const g = p.build('navLights'); g.userData.entity = port; scene.add(g); lamps.push(g); }
  // the yard as it opens: stacks one to three high
  for (const b of BLOCKS) { for (let k = 0; k < PORT.bays; k++) for (let r = 0; r < PORT.rows; r++) { const n = Math.floor(rand(0, 3.99)); for (let t = 0; t < n; t++) { const c = new Cbox({ from:pickOf(PORTS) }); b.stacks[k][r].push(c); c.where = { at:'yard', b:b.b, k, r, tier:t }; } }
  }
  yardDraw.draw();
  for (let i = 0; i < 3; i++) PORT_CRANES.push(new Crane(i));
  for (let i = 0; i < 3; i++) YARD.push(new Gantry(i));
  for (let i = 0; i < 6; i++) TRACTORS.push(new Tractor(i));
  for (let i = 0; i < 2; i++) TUGS.push(new Tug(i));
  // a ship alongside already when the town opens, her booms down and the work begun
  ship.build(0); ship.calls = 1; ship.x = SH.x; ship.y = SH.y; ship.state = 'working'; ship.ropes.visible = true;
  for (const c of PORT_CRANES) { c.start(); c.boomK = 0; c.place(); }
  for (const t of TUGS) t.update(0);
  return port;
}
