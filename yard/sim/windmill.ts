import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { clamp, wrap } from '../kernel/math';
import { MILL } from '../land';
import { CAP_Z, DOOR, FLOORS, FLOOR_NAMES, R, SPOT, STAGE, bl, buildWindmill, drawCart, drawStack, inner } from '../world/windmill';
import { hourAt, sim } from './core';
import { FAR, Person } from './person';

// ---- Knoll Mill at work ----
// The miller comes up the track from the fields at first light, lets the sails go once the wind will turn them and
// works the mill until dusk: the sack hoist lifts the grain from the cart to the bin floor, he tips it into the bins,
// it runs down through the hoppers to the stones, and the flour comes down the spouts into sacks on the meal floor,
// which he ties off and carries down to the stack by the door. In a gale, or a calm, or at dusk he puts the brake on,
// the sails come to rest in a cross and he opens their shutters to spill the wind. The cap is always winding round to
// face the wind; the fantail at its back sees to that.
type P3 = number[];
const [CX, CY] = MILL.c, Z = MILL.z;
const C8 = Math.cos(Math.PI / 8);
// a point inside on a floor, in the town's frame, with its height (for a walk with a height of its own)
const IN = (floor: number, b: number, l: number): P3 => { const [x, y] = bl(b, l); return [CX + x, CY + y, Z + FLOORS[floor]]; };
// round the stage, on its deck, at a heading from the tower's middle
const ON_STAGE = (a: number): P3 => { const r = R(STAGE.z) + 0.75; return [CX + r * Math.cos(a), CY + r * Math.sin(a), Z + STAGE.z]; };
const TRACK = [[1668, 36], [1668, -4], [1676, -9], [1688, -10.5]];
const DOOR_OUT = [CX + DOOR[0], CY + DOOR[1]], DOOR_IN: P3 = [CX, CY + inner(0) - 0.4, Z];
const wind = () => hooks.weather.wind() as { dir: number, speed: number };
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
// the way the wind blows from, in words (dir is a heading in the plan: +x east, +y south)
const fromWord = (h: number) => COMPASS[((Math.round(h / (Math.PI / 4)) % 8) + 8) % 8];
const BEAUFORT = [0.5, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5];
const WIND_WORD = ['calm', 'light air', 'light breeze', 'gentle breeze', 'moderate breeze', 'fresh breeze', 'strong breeze', 'near gale', 'gale', 'strong gale', 'storm'];
const force = (v: number) => { let f = 0; while (f < BEAUFORT.length && v > BEAUFORT[f]) f++; return f; };

export function buildWindmillSys() {
  const M = buildWindmill(); scene.add(M.g);
  const mill: any = { kind:'windmill', id:'Knoll Mill', groups:[M.g], pick:[0, 0, CAP_Z + 1.5],
    phase:'rest', braked:true, w:0, angle:0, yaw:1.3, shut:false, cart:12, bins:0, hoist:null as null | { z: number }, meal:0, ready:0, stack:0, today:0, total:0, open:false,
    rpm() { return this.w * 60 / (Math.PI * 2); },
    status() {
      const v = wind().speed;
      if (this.phase === 'working') return this.w < 0.25 ? 'becalmed · the sails barely turning' : `grinding · the sails at ${Math.round(this.rpm())} rpm`;
      if (this.phase === 'starting') return 'the miller setting the sails';
      if (this.phase === 'stopping') return v > 15 ? 'stopping · too much wind' : 'the brake going on';
      return v > 15 && hourAt(sim.t) > 6 && hourAt(sim.t) < 19.5 ? 'braked · a gale blowing' : 'at rest · sails in a cross';
    },
    info() {
      const v = wind(), f = force(v.speed);
      return { kind:'Windmill · tower mill, 1814', title:this.id, status:this.status(), bar:{ v:this.cart, max:12, label:`grain on the cart · ${this.cart} of 12 sacks` },
        rows:[['Wind', `force ${f}, ${WIND_WORD[f]} · from the ${fromWord(v.dir)}`], ['Cap', Math.abs(wrap(v.dir - this.yaw)) > 0.06 ? `winding round · facing ${fromWord(this.yaw)}` : `facing ${fromWord(this.yaw)}, into the wind`],
          ['Sails', `four patent sails, 21 m · ${this.phase === 'working' ? `${Math.round(this.rpm())} rpm, shutters set` : 'braked, shutters open'}`],
          ['Stones', 'two pairs of French burrs, 1.2 m · ' + (this.phase === 'working' && this.bins > 0 && this.w > 0.5 ? 'grinding' : 'idle')],
          ['In the bins', `${this.bins} ${this.bins === 1 ? 'sack' : 'sacks'} of wheat`], ['Ground today', `${this.today} ${this.today === 1 ? 'sack' : 'sacks'} of flour`],
          ['Miller', `${miller.id} · ${miller.here ? miller.status() : 'at home'}`], ['Tower', '8-sided brick, limewashed, 17.6 m to the curb']],
        actions:[['Look inside', () => hooks.lookInside(this)]] };
    },
    readout() { return `knoll mill · ${this.status()}`; },
    peeked(on: boolean) { this.open = on; M.capShell.visible = !on; M.brakeWheel.visible = M.brakeBand.visible = on; },
  };
  for (const o of [M.g]) o.userData.entity = mill;
  const redraw = () => {
    for (const [grp, part] of [[M.stackG, drawStack(Math.min(18, mill.stack))], [M.cartG, drawCart(mill.cart)]] as any) {
      for (const o of [...grp.children]) { o.traverse((q: any) => q.geometry?.dispose()); o.removeFromParent(); }
      if (part) grp.add(part);
    }
  };
  redraw();

  // ---- the miller ----
  class Miller extends Person {
    [k: string]: any;
    constructor() { super({ look:'miller', id:'W. Garnett', x:TRACK[0][0], y:TRACK[0][1], speed:1.6 }); this.here = false; this.hidden = true; this.task = ''; }
    // up or down a ladder: from its foot on one floor to its head on the next, slowly, rung by rung
    climb(from: number, to: number) {
      const L = SPOT.ladder;
      for (let f = from; f !== to; f += Math.sign(to - from)) {
        if (to > from) { this.walk([IN(f, L[0] - 0.25, 0)], `going up to ${FLOOR_NAMES[f + 1]}`); this.steps.push({ do:'walk', to:IN(f + 1, L[1], 0), label:`climbing to ${FLOOR_NAMES[f + 1]}`, speed:0.55 }); this.walk([IN(f + 1, L[1] - 0.6, -0.5)]); }
        else { this.walk([IN(f, L[1] - 0.6, -0.5), IN(f, L[1], 0)], `going down to ${FLOOR_NAMES[f - 1]}`); this.steps.push({ do:'walk', to:IN(f - 1, L[0] - 0.25, 0), label:`climbing down to ${FLOOR_NAMES[f - 1]}`, speed:0.55 }); }
      }
      this.floor = to; return this;
    }
    onFloor(floor: number, b: number, l: number, label?: string) { if (this.floor !== floor) this.climb(this.floor, floor); return this.walk([IN(floor, b, l)], label); }
    think() {
      // he sets out from home well before dawn, since the walk up takes a while, and starts the mill at first light
      const h = hourAt(sim.t), v = wind().speed, day = h >= 5.2 && h < 19, fit = v > 2.2 && v < 15;
      if (!this.here) { if (h >= 3.3 && h < 16 && fit && (mill.cart > 0 || mill.bins > 0)) this.arrive(); else this.wait(4, 'at home'); return; }
      // time to stop: dusk, a gale, the grain all ground with none left to come
      const done = mill.cart === 0 && mill.bins === 0 && !mill.hoist && mill.ready === 0;
      if (mill.phase === 'working' && (!day || !fit || done)) { this.stop(!day ? 'dusk' : !fit ? 'the wind' : 'no grain'); return; }
      if (mill.phase === 'rest') { if (day && fit && !done) this.start(); else if (h < 5.2 && h > 3 && fit && !done) this.onFloor(0, 0.6, 1.2, 'lighting the lamps').wait(4, 'waiting for first light'); else this.leave(); return; }
      // working: a full sack on the meal floor first, then a sack up on the hoist, then the bins; else watch the stones
      if (mill.ready > 0) {
        const [b, l] = SPOT.stones[mill.today % 2];
        this.onFloor(1, b - 0.55, l, 'tying off a sack of flour').face(this.faceTo(b, l)).wait(2.2, 'tying off a sack of flour').then((p: Miller) => { mill.ready--; p.carrying = 'a sack of flour'; })
          .climb(1, 0).walk([IN(0, SPOT.stack[mill.stack % 2][0] - 0.7, SPOT.stack[mill.stack % 2][1])], 'carrying the flour down').wait(1, 'stacking the flour')
          .then((p: Miller) => { p.carrying = null; mill.stack++; mill.today++; mill.total++; redraw(); });
        return;
      }
      if (mill.hoist?.z >= FLOORS[3]) {
        const [b, l] = SPOT.hoist; this.onFloor(3, b + 0.5, l + 0.6, 'taking the sack off the hoist').wait(1.2, 'unhooking the sack').then(() => { mill.hoist = null; })
          .walk([IN(3, SPOT.bins[0][0] - 0.75, SPOT.bins[0][1])], 'carrying the wheat to the bin').wait(2.4, 'tipping the wheat into the bin').then(() => { mill.bins++; });
        return;
      }
      if (!mill.hoist && mill.cart > 0 && mill.bins < 4) {
        const [b, l] = SPOT.hoist; this.onFloor(0, b + 0.5, l + 0.6, 'hooking a sack on the hoist').wait(1.6, 'hooking a sack on the hoist')
          .then(() => { mill.cart--; mill.hoist = { z:0.05 }; redraw(); }).climb(0, 3).wait(1, 'waiting for the sack');
        return;
      }
      const [b, l] = SPOT.stones[Math.floor(sim.t / 9) % 2];
      this.onFloor(2, b - 0.95, l * 0.8, 'feeling the meal').face(this.faceTo(b, l)).wait(4, mill.bins ? 'feeling the meal · setting the stones' : 'waiting on the grain');
    }
    faceTo(b: number, l: number) { const [x, y] = bl(b, l); return Math.atan2(CY + y - this.y, CX + x - this.x); }
    arrive() {
      this.here = true; this.hidden = false; this.x = TRACK[0][0]; this.y = TRACK[0][1]; this.lz = undefined; this.floor = 0;
      this.go(TRACK.slice(1), 'walking up to the mill').walk([DOOR_OUT], 'unlocking the door').wait(1.5, 'unlocking the door').walk([DOOR_IN], 'going in');
    }
    // out on the stage, round to the back of the cap where the striking chain hangs, to set (or open) the shutters
    stage(label: string) {
      const back = mill.yaw + Math.PI, a0 = Math.PI / 2, d = clamp(wrap(back - a0), -1.1, 1.1), n = 3;
      this.onFloor(2, -0.6, -0.6).walk([IN(2, -(inner(STAGE.z) - 0.4) * Math.SQRT1_2, -(inner(STAGE.z) - 0.4) * Math.SQRT1_2)], 'out onto the stage');
      this.walk([ON_STAGE(a0)]); for (let i = 1; i <= n; i++) this.walk([ON_STAGE(a0 + d * i / n)]);
      this.face(a0 + d + Math.PI).wait(2.5, label);
      for (let i = n - 1; i >= 0; i--) this.walk([ON_STAGE(a0 + d * i / n)]);
      return this.walk([IN(2, -0.6, -0.6)], 'back in off the stage');
    }
    start() {
      mill.phase = 'starting';
      this.stage('setting the shutters').climb(2, 3).walk([IN(3, 0.6, 0.6)], 'letting the brake off').wait(2, 'letting the brake off')
        .then(() => { mill.braked = false; mill.shut = true; mill.phase = 'working'; });
    }
    stop(why: string) {
      mill.phase = 'stopping'; this.task = why;
      this.onFloor(3, 0.6, 0.6, 'putting the brake on').wait(2, 'putting the brake on').then(() => { mill.braked = true; })
        .wait(7, 'waiting for the sails to stop').stage('opening the shutters').then(() => { mill.shut = false; mill.phase = 'rest'; });
    }
    leave() {
      this.onFloor(0, 0.2, 0, 'going down').walk([DOOR_IN, [...DOOR_OUT, Z, 1]], 'locking up').wait(1.2, 'locking the door')
        .go([...TRACK].reverse(), 'walking home across the fields').then((p: Miller) => { p.here = false; p.hidden = true; });
    }
    status() { return this.label || (this.here ? 'at the mill' : 'at home'); }
    info() {
      return { kind:'Miller · Knoll Mill', title:this.id, status:this.status(),
        rows:[['Mill', mill.status()], ['On', this.here ? (this.lz !== undefined ? FLOOR_NAMES[this.floor] ?? 'the stage' : 'the knoll') : '—'], ['Carrying', this.carrying ?? 'nothing'],
          ['Ground today', `${mill.today} sacks`], ['Wind', `force ${force(wind().speed)} from the ${fromWord(wind().dir)}`]] };
    }
  }
  const miller = new Miller();

  let lastH = hourAt(sim.t);
  function update(dt: number) {
    const h = hourAt(sim.t), v = wind();
    // a new day: the carter has left a fresh load of wheat by the door overnight, the flour has gone down to the village
    if (lastH < 5 && h >= 5 && h < 6) { mill.cart = 12; mill.stack = 0; mill.today = 0; redraw(); }
    lastH = h;
    // the cap winds round toward the wind, slowly; the fantail spins with how far it is out
    const err = wrap(v.dir - mill.yaw); mill.yaw += clamp(err, -0.035 * dt, 0.035 * dt);
    M.cap.rotation.y = -mill.yaw; M.fan.rotation.z += dt * (0.4 + Math.min(14, Math.abs(err) * 60) + v.speed * 0.05);
    // the sails: driven by the wind while the brake is off, braked to a stop in a cross when it goes on
    const target = mill.braked ? 0 : clamp((v.speed - 2.6) * 0.17, 0, 1.65);
    if (!mill.braked) mill.w += clamp(target - mill.w, -0.25 * dt, 0.12 * dt);
    else if (mill.w > 0.12) mill.w = Math.max(0.12, mill.w - 0.3 * dt);
    else if (mill.w > 0) { const rest = Math.ceil(mill.angle / (Math.PI / 2)) * Math.PI / 2; if (rest - mill.angle < mill.w * dt + 1e-4) { mill.angle = rest; mill.w = 0; } }
    mill.angle += mill.w * dt; if (mill.angle > 1e4) mill.angle -= Math.PI * 2 * 1500;
    M.spin.rotation.x = mill.angle; M.cloth.visible = mill.shut;
    // grinding, while the stones turn and there is wheat in the bins: a sack of flour every 22 s or so at full speed
    if (mill.phase === 'working' && mill.bins > 0 && mill.w > 0.5 && mill.ready < 2) { mill.meal += dt * mill.w / 1.65 / 22; if (mill.meal >= 1) { mill.meal = 0; mill.bins--; mill.ready++; } }
    // the hoist lifts at walking pace once the sack is on, while the sails turn (it is driven off the upright)
    if (mill.hoist && mill.hoist.z < FLOORS[3]) mill.hoist.z = Math.min(FLOORS[3] + 0.02, mill.hoist.z + dt * (mill.w > 0.2 ? 0.8 : 0.35));
    if (mill.open) {
      M.upright.rotation.y -= mill.w * 2.4 * dt;
      for (const n of M.nuts) n.rotation.y += mill.w * 9.6 * dt;
      M.governor.rotation.y += mill.w * 6 * dt; M.balls.scale.set(1 + Math.min(0.7, mill.w * 0.45), 1, 1);
      const hz = mill.hoist ? mill.hoist.z : FLOORS[3] + 0.6; M.hoistSack.visible = !!mill.hoist; M.hoistSack.position.y = hz;
      const top = FLOORS[4] + 1.05, low = hz + 0.95; const [qx, qy] = bl(SPOT.hoist[0], SPOT.hoist[1]); M.chain.position.copy(W(qx, qy, low)); M.chain.scale.y = Math.max(0.01, top - low);
    }
  }
  return { mill, miller, entities:() => [mill, miller], update, detail() { M.fan.visible = !FAR; } };
}
