// @ts-nocheck
import { hooks, scene } from '../shared';
import { Path } from '../kernel/path';
import { pose } from '../kernel/part';
import { SEA_Z } from '../layout';
import { sim } from './core';
import { compass } from './roads';

// ---- boats ----
export const BOATS = [];
export class Boat {
  constructor(o) {
    Object.assign(this, { kind:'boat', s:0, laps:0, mode:'loop', trip:null, ts:0 }, o);
    this.group = o.proto.clone(); this.group.userData.entity = this; this.groups = [this.group]; this.pick = [0, 0, 1.2];
    scene.add(this.group); BOATS.push(this); this.place();
  }
  // in rain a boat leaves its loop for a mooring beside the town pier (round the pier's end if it is east of it),
  // and when it clears goes back out to where it left off
  update(dt) {
    const rain = hooks.raining(), f = this.front;
    if (this.mode === 'loop' && rain) {
      const [mx, my] = this.moor, east = f.x > 202;
      this.mode = 'in'; this.ts = 0; this.trip = new Path([[f.x, f.y], ...(east ? [[206, 318.5], [194, 318.5]] : [[mx, 318.5]]), [mx, my]], 4);
    } else if (this.mode === 'moored' && !rain) {
      this.sBack = this.path.project(...this.moor) + 6; const b = this.path.at(this.sBack);
      this.mode = 'out'; this.ts = 0; this.trip = new Path([[f.x, f.y], [this.moor[0], 318.5], [b.x, b.y]], 4);
    }
    if (this.mode === 'loop') this.s += this.speed * dt;
    else if (this.mode !== 'moored') { this.ts += Math.min(this.speed, 3) * dt; if (this.ts >= this.trip.length) { if (this.mode === 'in') this.mode = 'moored'; else { this.mode = 'loop'; this.s = this.sBack; } } }
    this.place();
  }
  place() {
    const a = this.mode === 'loop' ? this.path.at(this.s) : this.trip.at(Math.min(this.ts, this.trip.length));
    this.front = a; pose(this.group, a.x, a.y, a.h, SEA_Z + 0.22 + Math.sin(sim.t * 1.7 + this.speed) * 0.06);
  }
  info() {
    const st = { in:'heading in out of the rain', moored:'moored by the town pier · waiting for the rain to stop', out:'heading back out' }[this.mode];
    return { kind:this.sail ? 'Sailboat' : 'Motorboat', title:this.id, status:st ?? `${this.sail ? 'sailing' : 'cruising'} ${compass(this.front.h)}`,
      rows:[['Skipper', this.skipper], ['Speed', `${Math.round(this.speed * 1.94)} kn`], ['Laps of the bay', String(Math.floor(this.s / this.path.length))]] };
  }
  readout() { return `${this.id} · ${this.info().status}`.toLowerCase(); }
  route() { return { path:this.path, s:this.s, closed:true }; }
}
