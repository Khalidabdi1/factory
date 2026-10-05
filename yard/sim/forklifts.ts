// @ts-nocheck
import { scene } from '../shared';
import { W } from '../kernel/iso';
import { glow, pose } from '../kernel/part';
import { clamp, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { Site, dedupe, keepSide } from '../kernel/graph';
import { RACK, STAGE } from '../layout';
import { DECK, VAN_DECK, VAN_LEN } from '../models/vehicles';
import { PROTO, conveyor, kmh, sim } from './core';

export const PLANT = new Site({ name:'Plant 01', lane:66,
  nodes:{ a:[14, 66], J:[128, 66], A:[128, 81], B:[188, 81], C:[188, 66] }, segs:[['a', 'J'], ['J', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'J']] });
export const WH = new Site({ name:'Warehouse 01', lane:65,
  nodes:{ oA:[232, 65], o1:[250, 65], o2:[286, 65], oB:[304, 65], i1:[250, 48.5], i2:[286, 48.5], iA:[236, 48.5], iB:[300, 48.5],
    kA:[236, 40.6], kB:[300, 40.6], uA:[236, 26], uB:[304, 26] },
  segs:[['oA', 'o1'], ['o1', 'o2'], ['o2', 'oB'], ['o1', 'i1'], ['o2', 'i2'], ['iA', 'i1'], ['i1', 'i2'], ['i2', 'iB'], ['iA', 'kA'], ['kA', 'kB'], ['iB', 'kB'], ['kA', 'uA'], ['uA', 'uB']] });
PLANT.chargers = [16, 21.5, 27].map(x => ({ x, h:-Math.PI / 2, F:[x, 51.6], SO:[x, 58], E:PLANT.at(x, 66) }));
WH.chargers = [262, 268, 274].map(x => ({ x, h:Math.PI / 2, F:[x, 55.0], SO:[x, 48.5], E:WH.at(x, 48.5) }));

const LOC = {
  belt:p => { const x = conveyor.path.at(p.s).x; return { name:'line A', h:-Math.PI / 2, z:1.0, F:[x, 59.35], SO:[x, 66], E:PLANT.at(x, 66) }; },
  stage:sl => { const h = sl.row ? Math.PI / 2 : -Math.PI / 2; return { name:sl.label, h, z:0, F:[sl.x, sl.y - Math.sin(h) * 1.35], SO:[sl.x, 81], E:PLANT.at(sl.x, 81) }; },
  flat:(site, t, i) => { const [x] = t.slotWorld(i); return { name:t.id, h:Math.PI / 2, z:DECK, F:[x, t.pose.y - 2.55], SO:[x, t.pose.y - 7.4], E:site.at(x, site.lane) }; },
  rack:sl => sl.row === 'B' ? { name:sl.label, h:Math.PI / 2, z:sl.local[2], F:[sl.x, sl.y - 1.35], SO:[sl.x, 26], E:WH.at(sl.x, 26) }
    : { name:sl.label, h:-Math.PI / 2, z:sl.local[2], F:[sl.x, sl.y + 1.35], SO:[sl.x, 40.6], E:WH.at(sl.x, 40.6) },
  van:t => { const p = t.pose, c = Math.cos(p.h), s = Math.sin(p.h), rx = p.x - c * VAN_LEN, ry = p.y - s * VAN_LEN, SO = [rx - c * 5.7, ry - s * 5.7];
    return { name:t.id, h:p.h, z:VAN_DECK, F:[rx - c * 0.2, ry - s * 0.2], SO, E:WH.at(SO[0], 26) }; },
  charger:c => ({ name:'charger', h:c.h, z:0, F:c.F, SO:c.SO, E:c.E }),
};

const FL = { speed:7, acc:3.5, turn:3.2, lift:1.6, carry:0.35, slow:2.2 };
let forkSeq = 1;
export class Forklift {
  constructor(site, i) {
    this.kind = 'forklift'; this.site = site; this.id = `FL-0${forkSeq++}`; this.charger = site.chargers[i];
    [this.x, this.y] = this.charger.F; this.h = this.charger.h; this.fork = 0.1; this.v = 0;
    this.steps = []; this.task = null; this.load = null; this.label = 'charging'; this.waitT = 0; this.passT = 0;
    this.battery = [88, 66, 47, 74, 58, 92][sim.forklifts.length]; this.moves = 0; this.atCharger = true; this.anchor = this.charger.E;
    this.group = PROTO.forklift.clone(); this.carriage = this.group.getObjectByName('carriage'); this.mast2 = this.group.getObjectByName('mast2'); this.beacon = this.group.getObjectByName('beacon');
    this.group.userData.entity = this; this.groups = [this.group]; this.pick = [-1.8, 0, 3.46];
    scene.add(this.group); sim.forklifts.push(this); site.forklifts.push(this); this.place();
  }
  place() {
    pose(this.group, this.x, this.y, this.h); this.carriage.position.y = this.fork;
    this.mast2.position.y = Math.max(0, this.fork + 1.25 - 4.55);   // the inner mast telescopes up for the top rack level
    glow(this.beacon, this.v > 0.05 && sim.t % 0.8 < 0.4);
  }
  blocked() {
    if (this.passT > 0) return false;
    const c = Math.cos(this.h), s = Math.sin(this.h);
    return this.site.forklifts.some(o => o !== this && [[o.x, o.y], [o.x - Math.cos(o.h) * 3.7, o.y - Math.sin(o.h) * 3.7]].some(([x, y]) => {
      const dx = x - this.x, dy = y - this.y, f = dx * c + dy * s; return f > 0.3 && f < 6.5 && Math.abs(dy * c - dx * s) < 2.1; }));
  }
  update(dt) {
    this.passT = Math.max(0, this.passT - dt);
    if (this.atCharger) this.battery = Math.min(100, this.battery + 2.2 * dt);
    else this.battery = Math.max(5, this.battery - (this.v > 0.05 ? 0.2 : 0.05) * dt);
    if (!this.steps.length) { this.task = null; dispatch(this); }
    const st = this.steps[0];
    if (st && !st.started) { st.started = true; if (st.label) this.label = st.label; }
    if (st && this.run(st, dt)) this.steps.shift();
    if (!this.steps.length && !this.task) this.label = this.atCharger ? (this.battery < 99 ? 'charging' : 'idle at charger') : 'idle';
    this.place();
  }
  run(st, dt) {
    switch (st.do) {
      case 'go': return this.drive(st, dt);
      case 'face': { const e = wrap(st.h - this.h); if (Math.abs(e) < 0.01) { this.h = st.h; return true; } this.h += clamp(e, -FL.turn * dt, FL.turn * dt); return false; }
      case 'lift': { const e = st.z - this.fork; if (Math.abs(e) < 0.005) { this.fork = st.z; return true; } this.fork += clamp(e, -FL.lift * dt, FL.lift * dt); return false; }
      case 'fwd': case 'back': {
        if (st.do === 'back') this.atCharger = false;
        const dx = st.p[0] - this.x, dy = st.p[1] - this.y, d = Math.hypot(dx, dy);
        this.v = Math.min(FL.slow, d * 3 + 0.2);
        if (d <= this.v * dt + 1e-4) { this.x = st.p[0]; this.y = st.p[1]; this.v = 0; return true; }
        this.x += dx / d * this.v * dt; this.y += dy / d * this.v * dt; return false;
      }
      case 'grab': this.grab(st.pallet); return true;
      case 'drop': this.drop(st.slot); return true;
      case 'wait': st.t -= dt; return st.t <= 0;
      case 'call': st.fn(); return true;
      case 'charge': return this.battery >= st.min;
    }
    return true;
  }
  drive(st, dt) {
    if (!st.path) {
      const pts = dedupe([[this.x, this.y], ...keepSide(dedupe(this.site.route(this.anchor, st.loc.E))), st.loc.SO]);
      if (pts.length < 2) { this.anchor = st.loc.E; return true; }
      st.path = new Path(pts, 2.2); st.s = 0;
    }
    const start = st.path.at(0);
    if (st.s === 0) { const e = wrap(start.h - this.h); if (Math.abs(e) > 0.01) { this.v = 0; this.h += clamp(e, -FL.turn * dt, FL.turn * dt); return false; } }
    const left = st.path.length - st.s;
    let vT = Math.min(FL.speed, Math.sqrt(2 * FL.acc * left) + 0.15);
    if (this.blocked()) { vT = 0; this.waitT += dt; if (this.waitT > 2.5) { this.passT = 1.5; this.waitT = 0; } } else this.waitT = 0;
    this.v = vT < this.v ? Math.max(vT, this.v - 6 * dt) : Math.min(vT, this.v + FL.acc * dt);
    st.s = Math.min(st.path.length, st.s + this.v * dt);
    const p = st.path.at(st.s); this.x = p.x; this.y = p.y; this.h = p.h;
    if (st.s >= st.path.length) { this.v = 0; this.anchor = st.loc.E; return true; }
    return false;
  }
  grab(p) {
    if (p.loc.type === 'conveyor') conveyor.items.splice(conveyor.items.indexOf(p), 1);
    if (p.loc.type === 'slot') p.loc.slot.pallet = null;
    p.group.visible = true;   // it may have been tucked away in a closed warehouse
    this.carriage.attach(p.group); p.tweenTo(W(1.35, 0, -0.1));
    p.loc = { type:'forklift', f:this }; this.load = p;
  }
  drop(slot) {
    const p = this.load; this.load = null; this.moves++; p.reserved = null;
    slot.parent.attach(p.group); p.tweenTo(W(...slot.local)); slot.pallet = p; slot.reserved = null; p.loc = { type:'slot', slot };
    if (RACK.includes(slot)) sim.stats.whIn++;
    if (slot.owner?.model === 'van') sim.stats.whOut++;
  }
  info() {
    return { kind:`Forklift · ${this.site.name}`, title:this.id, status:this.label, bar:{ v:this.battery, max:100, label:`battery ${Math.round(this.battery)}%` },
      rows:[['Task', this.task?.text ?? (this.atCharger ? 'on charge' : 'none')], ['Load', this.load ? `${this.load.id} · ${this.load.kg} kg` : 'empty'],
        ['Fork height', `${this.fork.toFixed(2)} m`], ['Speed', kmh(this.v)], ['Pallets moved', String(this.moves)]] };
  }
  readout() { return `${this.id} · ${this.label}`.toLowerCase(); }
  // the leg it is driving now
  route() { const st = this.steps[0]; if (st?.do !== 'go' || !st.path) return null; return { path:st.path, s:st.s, closed:false, next:st.loc.F, stop:st.loc.name }; }
}

// Task steps. Forks sit 0.1 under the pallet's bottom, so "z + 0.1" slides them into the pallet.
const leaveCharger = f => f.atCharger ? [{ do:'back', p:f.charger.SO, label:'leaving charger' }] : [];
function pickup(p, loc) {
  return [{ do:'go', loc, label:`to ${loc.name}` }, { do:'face', h:loc.h }, { do:'lift', z:loc.z + 0.1 },
    { do:'fwd', p:loc.F, label:`picking ${p.id}` }, { do:'grab', pallet:p }, { do:'lift', z:loc.z + (loc.z > 0 ? 0.5 : 0.4) },
    { do:'back', p:loc.SO }, { do:'lift', z:FL.carry }];
}
function dropAt(p, loc, slot) {
  const over = loc.z > 0 ? 0.5 : 0.3;
  return [{ do:'go', loc, label:`carrying ${p.id} → ${loc.name}` }, { do:'face', h:loc.h }, { do:'lift', z:loc.z + 0.1 + over },
    { do:'fwd', p:loc.F, label:`placing ${p.id}` }, { do:'lift', z:loc.z + 0.12 }, { do:'drop', slot }, { do:'wait', t:0.55 },
    { do:'lift', z:loc.z + 0.02 }, { do:'back', p:loc.SO }, { do:'lift', z:FL.carry }];
}
function park(f, label = 'to charger') {
  const loc = LOC.charger(f.charger);
  return [{ do:'go', loc, label }, { do:'face', h:loc.h }, { do:'lift', z:0.1 }, { do:'fwd', p:loc.F }, { do:'call', fn:() => { f.atCharger = true; } }];
}
const ready = p => p && !p.reserved && !p.tw;
function dispatch(f) {
  const assign = (task, steps) => { f.task = task; f.steps = steps; };
  if (f.battery < 22) { if (f.atCharger) assign({ text:'charging to 80%' }, [{ do:'charge', min:80, label:'charging' }]); else assign({ text:'low battery' }, park(f, 'low battery · to charger')); return; }
  const move = (p, from, to, slot, task) => { p.reserved = f; slot.reserved = f; assign(task, [...leaveCharger(f), ...pickup(p, from), ...dropAt(p, to, slot)]); };
  if (f.site === PLANT) {
    // load a flatbed waiting at a bay; otherwise clear the belt into staging
    const t = sim.trucks.filter(t => t.at?.name === 'bay' && t.freeSlot() >= 0).sort((a, b) => b.loaded() - a.loaded())[0];
    if (t) {
      const c = conveyor.pickable().map(p => ({ p, loc:LOC.belt(p) }));
      for (const s of STAGE) if (ready(s.pallet)) c.push({ p:s.pallet, loc:LOC.stage(s) });
      // older pallets first (rough FIFO), nearer ones break ties
      c.sort((a, b) => (a.p.t0 - b.p.t0) / 20 + Math.hypot(a.loc.SO[0] - f.x, a.loc.SO[1] - f.y) / 60 - Math.hypot(b.loc.SO[0] - f.x, b.loc.SO[1] - f.y) / 60);
      if (c[0]) { const i = t.freeSlot(); return move(c[0].p, c[0].loc, LOC.flat(PLANT, t, i), t.slots[i], { text:`${c[0].p.id} → ${t.id}`, to:'Warehouse 01' }); }
    }
    const e = conveyor.pickable().sort((a, b) => b.s - a.s)[0];
    const free = STAGE.filter(s => !s.pallet && !s.reserved).sort((a, b) => Math.hypot(a.x - 153, a.y - 63) - Math.hypot(b.x - 153, b.y - 63))[0];
    if (e && free) return move(e, LOC.belt(e), LOC.stage(free), free, { text:`${e.id} → ${free.label}`, to:'Warehouse 01' });
  } else {
    // warehouse: fill a waiting delivery truck from the racks, unload flatbeds into the racks
    const van = sim.trucks.find(t => t.at?.name === 'load' && t.doors === 1 && t.freeSlot() >= 0);
    const stock = RACK.filter(s => ready(s.pallet)).sort((a, b) => a.pallet.t0 - b.pallet.t0);
    const loadVan = () => { const s = stock[0], i = van.freeSlot();
      move(s.pallet, LOC.rack(s), LOC.van(van), van.slots[i], { text:`${s.pallet.id} → ${van.id}`, to:'Corner Market', van }); };
    if (van && stock.length && WH.forklifts.filter(o => o.task?.van === van).length < 2) return loadVan();
    const free = RACK.filter(s => !s.pallet && !s.reserved).sort((a, b) => a.level - b.level || Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
    for (const t of sim.trucks.filter(t => t.at?.name === 'dock')) {
      const i = [3, 4, 5, 0, 1, 2].find(i => ready(t.slots[i].pallet));
      if (i !== undefined && free.length) { const p = t.slots[i].pallet; return move(p, LOC.flat(WH, t, i), LOC.rack(free[0]), free[0], { text:`${p.id} → ${free[0].label}`, to:'Corner Market' }); }
    }
    if (van && stock.length) return loadVan();
  }
  if (!f.atCharger) assign(null, park(f));
}
