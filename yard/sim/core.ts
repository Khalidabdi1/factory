// @ts-nocheck
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { pose } from '../kernel/part';
import { clamp, ease, rand, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { BOXES, RACK } from '../layout';
import { FAR } from './person';

// ---- simulation ----
export const STEP = 1 / 60, WARMUP = 80;
export const sim = { t:0, trucks:[], cars:[], forklifts:[], people:[], pallets:new Set(), peds:[], stats:{} };
export const resetStats = () => { sim.stats = { produced:0, flatTrips:0, whIn:0, whOut:0, shopIn:0, sold:0, plantOut:0, robberies:0, arrests:0, escapes:0, riders:0 }; };
resetStats();
// One day passes in six minutes of simulation; the visible run starts at 10:00. N skips six hours.
const DAY = 360;
// hours added by the skip button; h eases toward goal
export const shift = { h:0, goal:0 };
export const hourAt = t => ((4 + 2 / 3 + t * 24 / DAY + shift.h) % 24 + 24) % 24;
const hhmm = h => { const m = Math.floor(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const clock = t => hhmm(hourAt(t));
// 0 by day, 1 by night, easing through dusk (18:30–20:30) and dawn (05:00–07:00)
const nightOf = h => h < 5 ? 1 : h < 7 ? 1 - ease((h - 5) / 2) : h < 18.5 ? 0 : h < 20.5 ? ease((h - 18.5) / 2) : 1;
export const night = () => nightOf(hourAt(sim.t));
export const kmh = v => `${Math.round(v * 3.6)} km/h`;
export const DRIVERS = ['A. Haddad', 'S. Okafor', 'M. Rossi', 'J. Park', 'L. Novak', 'R. Silva', 'T. Brandt', 'K. Mensah', 'D. Ferreira'];
export const STAFF = ['R. Diaz', 'M. Chen', 'O. Bakr', 'L. Ferraro'];
export const NAMES = ['A. Costa', 'B. Ivanova', 'C. Murphy', 'D. Sato', 'E. Lund', 'F. Kaya', 'G. Moreau', 'H. Ali', 'I. Novak', 'J. Smith', 'K. Osei', 'L. Berg',
  'M. Dubois', 'N. Rao', 'O. Weiss', 'P. Quinn', 'Q. Zhou', 'R. Lopes', 'S. Mäkinen', 'T. Okoro', 'U. Varga', 'V. Petrov', 'W. Hughes', 'Y. Tanaka', 'Z. Haddad'];
export const SKUS = [
  { name:'Gear housings', code:'GH-24', units:[24, 48], kg:[380, 520] },
  { name:'Cartons', code:'CT-60', units:[48, 96], kg:[160, 260] },
  { name:'Steel panels', code:'SP-10', units:[10, 14], kg:[640, 820] },
];
let palletSeq = 1001;
export const PROTO = {};

export class Pallet {
  constructor() {
    this.kind = 'pallet'; this.id = `PAL-${palletSeq++}`; this.v = Math.floor(rng() * 3); this.sku = SKUS[this.v];
    this.units = Math.round(rand(...this.sku.units)); this.kg = Math.round(rand(...this.sku.kg) / 5) * 5; this.t0 = sim.t;
    this.group = PROTO.pallet[this.v].clone(); this.group.userData.entity = this; this.groups = [this.group];
    if (FAR) for (const m of this.group.children) if (m.userData.fill !== 'kob') m.visible = false;   // made while the view is far out
    this.loc = { type:'new' }; this.reserved = null; this.tw = null; this.pick = [0, 0, 1.2];
    sim.pallets.add(this);
  }
  // slide to a spot in the current parent's frame; the further it goes, the longer it takes
  tweenTo(to, d) {
    const r = this.group.rotation.y;
    this.tw = { p0:this.group.position.clone(), p1:to, r0:r, r1:Math.round(r / (Math.PI / 2)) * Math.PI / 2, t:0,
      d:d ?? clamp(0.25 + this.group.position.distanceTo(to) * 0.09, 0.25, 1.2) };
  }
  update(dt) {
    if (!this.tw) return;
    const w = this.tw; w.t = Math.min(w.d, w.t + dt); const e = ease(w.t / w.d);
    this.group.position.lerpVectors(w.p0, w.p1, e); this.group.rotation.y = w.r0 + (w.r1 - w.r0) * e;
    if (w.t >= w.d) this.tw = null;
  }
  where() {
    const l = this.loc;
    return l.type === 'conveyor' ? (conveyor.inZone(this) ? 'line A pickup' : 'on line A') : l.type === 'slot' ? l.slot.label : l.type === 'forklift' ? `on ${l.f.id}` : '—';
  }
  bound() {
    const o = this.loc.slot?.owner;
    if (o?.model === 'flatbed') return 'Warehouse 01';
    if (o?.kind === 'train') return 'by rail, out of town';
    if (o?.model === 'van' || RACK.includes(this.loc.slot)) return 'Corner Market';
    return this.reserved?.task?.to ?? 'Warehouse 01';
  }
  info() {
    return { kind:`Pallet · ${this.sku.code}`, title:this.id, status:this.where(),
      rows:[['Contents', this.sku.name], ['Quantity', `${this.units} units · ${BOXES} boxes`], ['Gross weight', `${this.kg} kg`], ['Produced', clock(this.t0)], ['Bound for', this.bound()]] };
  }
  readout() { return `${this.id} · ${this.where()}`.toLowerCase(); }
  remove() { sim.pallets.delete(this); this.group.removeFromParent(); hooks.forget(this); }
}
export function putIn(slot, p) {
  slot.parent.add(p.group); p.group.position.copy(W(...slot.local)); p.group.rotation.set(0, 0, 0);
  slot.pallet = p; p.loc = { type:'slot', slot };
}

// Line A: pallets appear inside the factory and roll out to the pickup stations.
export const conveyor = {
  kind:'conveyor', id:'Line A', path:new Path([[86, 44], [86, 58], [148.5, 58]], 3), items:[], next:2, held:false, rate:26, pick:[118.9, 60.8, 0.8],
  // the last stretch of belt has no rail on the yard side; pallets come to rest there at three stations, 3.1 apart
  inZone(p) { return p.s >= this.path.length - 6.3; },
  pickable() { return this.items.filter(p => this.inZone(p) && p.rest && !p.reserved); },
  update(dt) {
    this.items.forEach((p, i) => {
      // a reserved pallet holds still for the forklift coming for it; the rest queue up 3.1 apart
      const s = p.reserved ? p.s : Math.min(i ? this.items[i - 1].s - 3.1 : this.path.length, p.s + 2.4 * dt);
      p.rest = s - p.s < 1e-6; p.s = s;
      const q = this.path.at(p.s); pose(p.group, q.x, q.y, 0, 1.0);
    });
    this.next -= dt;
    const last = this.items[this.items.length - 1];
    this.held = this.next <= 0 && !!last && last.s < 3.1;
    if (this.next <= 0 && !this.held) this.spawn();
  },
  spawn() {
    const p = new Pallet(); p.loc = { type:'conveyor' }; p.s = 0; scene.add(p.group); this.items.push(p);
    this.next = this.rate; sim.stats.produced++;
  },
  info() {
    return { kind:'Conveyor', title:'Line A', status:this.held ? 'held · belt full' : 'running',
      rows:[['Rate', `1 pallet / ${this.rate} s`], ['On belt', `${this.items.length} pallets`], ['At pickup', `${this.items.filter(p => this.inZone(p)).length} pallets`],
        ['Next pallet', this.held ? 'waiting for space' : `in ${Math.max(0, Math.ceil(this.next))} s`]] };
  },
  readout() { return `line a · ${this.held ? 'held' : 'running'} · ${this.items.length} on belt`; },
};
