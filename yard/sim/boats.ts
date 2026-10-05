// @ts-nocheck
import { scene } from '../shared';
import { pose } from '../kernel/part';
import { SEA_Z } from '../layout';
import { sim } from './core';
import { compass } from './roads';

// ---- boats ----
export const BOATS = [];
export class Boat {
  constructor(o) {
    Object.assign(this, { kind:'boat', s:0, laps:0 }, o);
    this.group = o.proto.clone(); this.group.userData.entity = this; this.groups = [this.group]; this.pick = [0, 0, 1.2];
    scene.add(this.group); BOATS.push(this); this.place();
  }
  update(dt) { this.s += this.speed * dt; this.place(); }
  place() { const a = this.path.at(this.s); this.front = a; pose(this.group, a.x, a.y, a.h, SEA_Z + 0.22 + Math.sin(sim.t * 1.7 + this.speed) * 0.06); }
  info() {
    return { kind:this.sail ? 'Sailboat' : 'Motorboat', title:this.id, status:`${this.sail ? 'sailing' : 'cruising'} ${compass(this.front.h)}`,
      rows:[['Skipper', this.skipper], ['Speed', `${Math.round(this.speed * 1.94)} kn`], ['Laps of the bay', String(Math.floor(this.s / this.path.length))]] };
  }
  readout() { return `${this.id} · ${this.info().status}`.toLowerCase(); }
  route() { return { path:this.path, s:this.s, closed:true }; }
}
