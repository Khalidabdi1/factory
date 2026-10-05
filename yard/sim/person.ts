// @ts-nocheck
import { hooks, scene } from '../shared';
import { pose } from '../kernel/part';
import { clamp, wrap } from '../kernel/math';
import { onRoad, zAt } from '../layout';
import { PROTO, sim } from './core';
import { HIP_H, lookOf } from '../models/people';
import { crossClear } from './roads';

// ---- people ----
// from far away everyone is drawn as one static part, a handful of draw calls instead of a dozen
export let TINY = false;
export const setTiny = v => { TINY = v; };
export class Person {
  constructor(o) {
    Object.assign(this, { kind:'person', isPerson:true, h:0, v:0, speed:1.5, steps:[], phase:0, label:'', carrying:null, done:0, t0:sim.t }, o);
    // the same name always gets the same clothes and height
    const { variant, scale } = lookOf(this.look, this.id); this.scale = scale;
    this.group = PROTO.person[this.look][variant].clone(); this.group.scale.setScalar(scale);
    [this.legs, this.arms] = [['legL', 'legR'], ['armL', 'armR']].map(ns => ns.map(n => this.group.getObjectByName(n)));
    this.sitLegs = this.group.getObjectByName('sitLegs');
    this.box = this.group.getObjectByName('carry'); this.box.visible = false; this.group.userData.entity = this; this.groups = [this.group]; this.pick = [0, 0, 1.25];
    this.lite = PROTO.personLite[this.look][variant].clone(); this.lite.scale.setScalar(scale); this.lite.userData.entity = this; this.groups.push(this.lite); scene.add(this.lite);
    if (this.dog) { this.dogG = PROTO.dog.clone(); this.dogG.userData.entity = this; this.groups.push(this.dogG); scene.add(this.dogG); }
    scene.add(this.group); sim.people.push(this); this.place();
  }
  walk(pts, label) { for (const to of pts) this.steps.push({ do:'walk', to, label }); return this; }
  // a walk over the pavements: where a leg crosses a street, wait at the kerb for a gap first
  go(pts, label) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (onRoad((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) this.steps.push({ do:'cross', a, b });
      this.steps.push({ do:'walk', to:b, label });
    }
    return this;
  }
  face(h) { this.steps.push({ do:'face', h }); return this; }
  wait(t, label) { this.steps.push({ do:'wait', t, label }); return this; }
  then(fn, label) { this.steps.push({ do:'call', fn, label }); return this; }
  update(dt) {
    if (this.follow) {   // walked along by someone else, a step behind them
      const f = this.follow; this.h = f.h; this.x = f.x - Math.cos(f.h) * 0.85; this.y = f.y - Math.sin(f.h) * 0.85; this.v = f.v;
    } else {
      if (!this.steps.length) this.think?.();
      const st = this.steps[0];
      if (st) { if (!st.started) { st.started = true; if (st.label) this.label = st.label; } if (this.run(st, dt)) this.steps.shift(); } else this.v = 0;
    }
    if (this.v > 0.05) this.phase += dt * this.v * 4.5;
    // arms swing against the legs; a box is held out in front with both hands; seated, the legs fold
    const sw = this.v > 0.05 && !this.sit ? Math.sin(this.phase) * 0.5 : 0, ground = this.sit === 'ground';
    this.legs[0].rotation.z = ground ? 1.5 : sw; this.legs[1].rotation.z = ground ? 1.5 : -sw;
    for (const l of this.legs) l.visible = this.sit !== 'chair';
    this.sitLegs.visible = this.sit === 'chair';
    const arm = this.carrying ? 1.15 : this.sit ? 0.35 : -sw * 0.7;
    this.arms[0].rotation.z = arm; this.arms[1].rotation.z = this.carrying || this.sit ? arm : sw * 0.7;
    this.box.visible = !!this.carrying;
    this.place();
  }
  run(st, dt) {
    if (st.do === 'walk') {
      const to = typeof st.to === 'function' ? st.to(this) : st.to;
      const dx = to[0] - this.x, dy = to[1] - this.y, d = Math.hypot(dx, dy);
      if (d < (st.near ?? 0.03)) { if (!st.near) { this.x = to[0]; this.y = to[1]; } this.v = 0; return true; }
      const e = wrap(Math.atan2(dy, dx) - this.h); this.h += clamp(e, -7 * dt, 7 * dt);
      this.v = Math.abs(e) > 0.8 ? 0 : st.speed ?? this.speed;
      const step = Math.min(d, this.v * dt); this.x += dx / d * step; this.y += dy / d * step; return false;
    }
    this.v = 0;
    if (st.do === 'cross') { st.t = (st.t ?? 0) + dt; if (st.t > 10 || crossClear(st.a, st.b)) return true; if (st.t > 0.4) this.label = 'waiting to cross'; return false; }
    if (st.do === 'wait') return (st.t -= dt) <= 0;
    if (st.do === 'face') { const e = wrap(st.h - this.h); if (Math.abs(e) < 0.02) { this.h = st.h; return true; } this.h += clamp(e, -7 * dt, 7 * dt); return false; }
    if (st.do === 'call') { st.fn(this); return true; }
    return true;
  }
  // sit on a seat ({ at, h, z }: z is the seat height) or on the ground; stand up again
  sitOn(seat) { this.sit = seat.ground ? 'ground' : 'chair'; this.seat = seat; if (seat.at) [this.x, this.y] = seat.at; if (seat.h !== undefined) this.h = seat.h; this.v = 0; }
  standUp() { if (this.seat?.by === this) this.seat.by = null; this.sit = null; this.seat = null; }
  place() {
    // seated, the hips drop to the seat (or to the ground)
    const s = this.scale, z = zAt(this.x, this.y) + (this.sit === 'chair' ? (this.seat.z ?? 0.45) - (HIP_H - 0.07) * s : this.sit === 'ground' ? -(HIP_H - 0.08) * s : 0);
    pose(this.group, this.x, this.y, this.h, z); pose(this.lite, this.x, this.y, this.h, z);
    // inside a building that is shut, nobody is drawn (its walls hide them anyway)
    const away = hooks.closedAt(this.x, this.y);
    this.group.visible = !TINY && !away; this.lite.visible = TINY && !away; if (this.dogG) this.dogG.visible = !TINY && !away;
    if (this.dogG) { const c = Math.cos(this.h), s = Math.sin(this.h), x = this.x - c * 0.9 - s * 0.55, y = this.y - s * 0.9 + c * 0.55; pose(this.dogG, x, y, this.h, zAt(x, y)); }
  }
  // where the person is still going: the walk legs left
  route() {
    const pts = [[this.x, this.y], ...this.steps.filter(s => s.do === 'walk' && typeof s.to !== 'function').map(s => s.to)];
    return pts.length < 2 ? null : { pts, next:pts[pts.length - 1] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  status() { return this.label || 'standing'; }
  remove() { this.standUp(); const i = sim.people.indexOf(this); if (i >= 0) sim.people.splice(i, 1); for (const g of this.groups) g.removeFromParent(); hooks.forget(this); }
}
