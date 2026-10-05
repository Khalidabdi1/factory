// @ts-nocheck
import { hooks, scene } from '../shared';
import { pose } from '../kernel/part';
import { clamp, wrap } from '../kernel/math';
import { onRoad, zAt } from '../layout';
import { PROTO, sim } from './core';
import { crossClear } from './roads';

// ---- people ----
// from far away everyone is drawn as one static part, a handful of draw calls instead of a dozen
export let TINY = false;
export const setTiny = v => { TINY = v; };
export class Person {
  constructor(o) {
    Object.assign(this, { kind:'person', isPerson:true, h:0, v:0, speed:1.5, steps:[], phase:0, label:'', carrying:null, done:0, t0:sim.t }, o);
    this.group = PROTO.person[this.look].clone(); this.legs = ['legL', 'legR'].map(n => this.group.getObjectByName(n));
    this.box = this.group.getObjectByName('carry'); this.box.visible = false; this.group.userData.entity = this; this.groups = [this.group]; this.pick = [0, 0, 1.25];
    this.lite = PROTO.personLite[this.look].clone(); this.lite.userData.entity = this; this.groups.push(this.lite); scene.add(this.lite);
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
    const sw = this.v > 0.05 ? Math.sin(this.phase) * 0.5 : 0;
    this.legs[0].rotation.z = sw; this.legs[1].rotation.z = -sw;
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
  place() {
    const z = zAt(this.x, this.y);
    pose(this.group, this.x, this.y, this.h, z); pose(this.lite, this.x, this.y, this.h, z);
    this.group.visible = !TINY; this.lite.visible = TINY; if (this.dogG) this.dogG.visible = !TINY;
    if (this.dogG) { const c = Math.cos(this.h), s = Math.sin(this.h), x = this.x - c * 0.9 - s * 0.55, y = this.y - s * 0.9 + c * 0.55; pose(this.dogG, x, y, this.h, zAt(x, y)); }
  }
  // where the person is still going: the walk legs left
  route() {
    const pts = [[this.x, this.y], ...this.steps.filter(s => s.do === 'walk' && typeof s.to !== 'function').map(s => s.to)];
    return pts.length < 2 ? null : { pts, next:pts[pts.length - 1] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  status() { return this.label || 'standing'; }
  remove() { const i = sim.people.indexOf(this); if (i >= 0) sim.people.splice(i, 1); for (const g of this.groups) g.removeFromParent(); hooks.forget(this); }
}
