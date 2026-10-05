// @ts-nocheck
import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { Part, pose } from '../kernel/part';
import { pick, rand, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { SEA_Z } from '../layout';
import { buildFish, buildFishingBoat } from '../models/sea';
import { lookOf } from '../models/people';
import { PROTO, clock, hourAt, sim } from './core';
import { Person } from './person';
import { homes } from './homes';

// The fisherman. Kestrel lies alongside the town pier until morning, motors out to a fishing ground, and fishes with
// a rod: the float bobs, dips when something bites, and a fish comes up over the side into the fish boxes. With a
// full hold, at dusk, or when it rains, she comes in and the catch goes up onto the pier. At the end of the pier an
// angler fishes too, landing one now and then.
export const SPECIES = [['mackerel', 0.3, 0.9], ['sea bass', 0.8, 3.5], ['bream', 0.4, 1.6], ['cod', 1.0, 5.5], ['pollock', 0.6, 2.4]];
const catchOne = () => { const [name, a, b] = pick(SPECIES); return { name, kg:Math.round(rand(a, b) * 10) / 10, t:sim.t }; };
const MOOR = [204.4, 301], GROUNDS = [[150, 309], [110, 312], [70, 307], [248, 311], [276, 313], [130, 304]];
const HOLD = 6, FLOAT = new THREE.Vector3(...W(-1.9, 6.4, -0.35).toArray()), BOX = new THREE.Vector3(...W(-2.4, -0.3, 1.0).toArray());
const fishing = () => { const h = hourAt(sim.t); return h >= 5.5 && h < 19.5 && !hooks.raining(); };

class FishingBoat {
  constructor() {
    this.kind = 'boat'; this.id = 'Kestrel'; this.group = buildFishingBoat(); this.groups = [this.group]; this.group.userData.entity = this; this.pick = [0, 0, 1.6];
    [this.rod, this.float, this.fish] = ['rod', 'float', 'fish'].map(n => this.group.getObjectByName(n));
    // the skipper is whoever in town lives as "a fisherman"
    const home = homes.find(h => h.household.text === 'a fisherman');
    this.skipper = home?.residents[0] ?? 'H. Ali'; this.home = home;
    const { variant } = lookOf('fisher', this.skipper), man = PROTO.person.fisher[variant].clone();
    man.getObjectByName('carry').visible = false; pose(man, -1.9, 0.2, Math.PI / 2, 0.5); this.group.add(man); this.man = man; this.arms = ['armL', 'armR'].map(n => man.getObjectByName(n));
    scene.add(this.group);
    this.state = 'moored'; this.hold = []; this.today = []; this.x = MOOR[0]; this.y = MOOR[1]; this.h = -Math.PI / 2; this.v = 0; this.t = 0; this.path = null; this.s = 0;
    this.place();
  }
  // a path from where she lies, round the end of the town pier if the ground is west of it
  go(to, then) {
    const west = to[0] < 200, pts = [[this.x, this.y], ...(this.state === 'moored' ? [[MOOR[0] + 1.5, MOOR[1] + 6]] : []),
      ...(west && this.x > 200 ? [[205, 316.5], [195, 316.5]] : !west && this.x < 200 ? [[195, 316.5], [205, 316.5]] : []), to];
    this.path = new Path(pts, 3); this.s = 0; this.next = then;
  }
  update(dt) {
    this.t += dt;
    const out = fishing();
    switch (this.state) {
      // she does not go out again too late to fish
      case 'moored': if (out && hourAt(sim.t) < 17.5 && this.t > 4) { this.state = 'out'; this.ground = pick(GROUNDS); this.go(this.ground, () => this.startFishing()); } break;
      case 'out': case 'home': this.sail(dt); break;
      case 'fishing':
        if (!out || this.hold.length >= HOLD) { this.goHome(); break; }
        // a bite comes after a wait; the float dips, then the fish comes up over the side
        if (this.t > this.biteAt && !this.reeling) { this.reeling = 0.001; this.caught = catchOne(); }
        if (this.reeling) {
          this.reeling += dt;
          if (this.reeling > 1.1) { const k = Math.min(1, (this.reeling - 1.1) / 1.1); this.fish.visible = true; this.fish.position.lerpVectors(FLOAT, BOX, k); this.fish.position.y += Math.sin(k * Math.PI) * 2.2; this.fish.rotation.z = k * 9; }
          if (this.reeling > 2.3) { this.fish.visible = false; this.hold.push(this.caught); this.today.push(this.caught); this.reeling = 0; this.t = 0; this.biteAt = rand(6, 16); }
        }
        break;
      case 'unloading': if (this.t > 6) { this.hold = []; this.state = 'moored'; this.t = 0; } break;
    }
    // float bobs while waiting and dips on a bite; rod and float only while fishing
    const fishingNow = this.state === 'fishing';
    this.rod.visible = this.float.visible = fishingNow;
    this.float.position.y = FLOAT.y + (this.reeling && this.reeling < 1.1 ? -0.25 : Math.sin(sim.t * 2.1) * 0.04);
    for (const a of this.arms) a.rotation.z = fishingNow ? (this.reeling ? 1.0 + Math.sin(sim.t * 14) * 0.15 : 0.75) : 0;
    this.place();
  }
  sail(dt) {
    this.v = Math.min(4.5, this.v + dt * 1.2, Math.sqrt(2 * 1.0 * Math.max(0, this.path.length - this.s)) + 0.2);
    this.s += this.v * dt;
    const a = this.path.at(Math.min(this.s, this.path.length)); this.x = a.x; this.y = a.y; this.h = a.h;
    if (this.s >= this.path.length) { this.v = 0; const n = this.next; this.next = null; n?.(); }
  }
  startFishing() { this.state = 'fishing'; this.t = 0; this.biteAt = rand(5, 12); this.reeling = 0; }
  goHome() { this.reeling = 0; this.fish.visible = false; this.state = 'home'; this.go(MOOR, () => { this.state = 'unloading'; this.t = 0; this.h = -Math.PI / 2; }); }
  place() { pose(this.group, this.x, this.y, this.h, SEA_Z + 0.22 + Math.sin(sim.t * 1.5) * 0.06); }
  status() {
    const n = this.hold.length;
    return { moored:fishing() ? 'alongside the town pier · casting off' : 'alongside the town pier', out:'heading out to the fishing ground',
      fishing:this.reeling ? `reeling in a ${this.caught.name}` : 'fishing · waiting for a bite', home:`heading back with ${n} ${n === 1 ? 'fish' : 'fish'}`,
      unloading:'unloading the catch onto the pier' }[this.state];
  }
  info() {
    const kg = this.today.reduce((s, f) => s + f.kg, 0), last = this.today[this.today.length - 1];
    return { kind:'Fishing boat', title:this.id, status:this.status(), bar:{ v:this.hold.length, max:HOLD, label:`hold ${this.hold.length}/${HOLD} fish` },
      rows:[['Skipper', this.skipper], ['Lives at', this.home?.id ?? 'down by the harbour'], ['Catch today', `${this.today.length} fish · ${kg.toFixed(1)} kg`],
        ['Last catch', last ? `${last.name} · ${last.kg} kg · ${clock(last.t)}` : 'none yet'], ['Fishing hours', '05:30–19:30']] };
  }
  readout() { return `${this.id} · ${this.status()}`.toLowerCase(); }
  route() { return this.state === 'out' || this.state === 'home' ? { path:this.path, s:this.s, closed:false, next:this.path && [this.path.at(this.path.length).x, this.path.at(this.path.length).y] } : null; }
}

// the angler at the end of the town pier: a rod out over the rail, a fish now and then
class Angler extends Person {
  constructor() {
    super({ look:'fisher', id:'O. Weiss', x:199, y:311.6, h:Math.PI / 2, speed:1.2 });
    this.today = []; this.biteAt = rand(10, 30); this.t = 0;
    for (const g of [this.group, this.lite]) g.add(new Part().seg('line', W(0.35, -0.15, 1.2), W(2.7, -0.15, 2.7)).seg('detail', W(2.7, -0.15, 2.7), W(3.9, -0.15, -1.75)).build('rod'));
  }
  think() { this.wait(1e9, 'fishing off the end of the pier'); }
  update(dt) {
    super.update(dt);
    this.t += dt;
    if (fishing() && this.t > this.biteAt) { this.t = 0; this.biteAt = rand(15, 45); const f = catchOne(); this.today.push(f); this.label = `landed a ${f.name}`; this.landed = 2.0; }
    if (this.landed > 0) { this.landed -= dt; if (this.landed <= 0) this.label = 'fishing off the end of the pier'; }
    this.carrying = this.landed > 0 ? 'fish' : null; this.box.visible = !!this.carrying;
    for (const a of this.arms) a.rotation.z = this.landed > 0 ? 1.1 : 0.75;
  }
  info() {
    const last = this.today[this.today.length - 1];
    return { kind:'Angler · the town pier', title:this.id, status:this.status(), rows:[['Catch today', `${this.today.length} fish`], ['Last catch', last ? `${last.name} · ${last.kg} kg` : 'nothing yet']] };
  }
}

export function buildFishing() {
  const kestrel = new FishingBoat(), angler = new Angler();
  return { kestrel, angler, update(dt) { kestrel.update(dt); } };
}
