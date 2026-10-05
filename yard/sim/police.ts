// @ts-nocheck
import { glow } from '../kernel/part';
import { rand } from '../kernel/math';
import { Path } from '../kernel/path';
import { PROTO, clock, hourAt, kmh, sim } from './core';
import { streetAt } from './roads';
import { Car } from './cars';
import { Person } from './person';
import { PROM, pedRoute } from './people';

// ---- the bank job: a man tries the bank door, the alarm calls both police cars, officers give chase ----
const BANK_DOOR = [116, 194.9];
export const bank = {
  kind:'bank', id:'Harbour Bank', pick:[116, 192.2, 6], alarm:false,
  open() { const h = hourAt(sim.t); return h >= 9 && h < 17; },
  info() {
    return { kind:'Bank', title:'Harbour Bank', status:this.alarm ? 'alarm ringing · police called' : this.open() ? 'open' : 'closed · alarm set',
      rows:[['Hours', '09:00–17:00'], ['Break-ins tried', String(sim.stats.robberies)], ['Arrests', String(sim.stats.arrests)], ['Got away', String(sim.stats.escapes)]] };
  },
  readout() { return `harbour bank · ${this.alarm ? 'alarm ringing' : this.open() ? 'open' : 'closed'}`; },
};
class Thief extends Person {
  constructor() {
    super({ look:'thief', id:'Hooded man', x:68.3, y:241, h:-Math.PI / 2, speed:1.6 });   // off the bus at the Park stop
    this.go(pedRoute([this.x, this.y], [116, 196.7]), 'walking').walk([BANK_DOOR], 'at the bank door').face(-Math.PI / 2)
      .wait(5, 'forcing the bank door').then(() => incident.alarm());
  }
  flee() {
    this.id = 'Suspect'; this.wanted = true; this.speed = rand(3.2, 3.75); this.steps = [];
    this.walk([[116, 196.7], [68.3, 196.7], [68.3, PROM], [-6, PROM]], 'running from the bank').then(() => incident.escaped());
  }
  info() {
    if (!this.wanted) return { kind:'Pedestrian', title:this.id, status:this.status(), rows:[['Street', streetAt(this.x, this.y)], ['Wearing', 'a dark hood and gloves'], ['Seen since', clock(this.t0)]] };
    return { kind:'Suspect · wanted', title:this.id, status:this.caught ? `under arrest · ${this.caught.car.id}` : this.status(),
      rows:[['Wanted for', 'trying to break into Harbour Bank'], ['Street', streetAt(this.x, this.y)], ['Pursued by', incident.cars.filter(c => c.state !== 'in').map(c => c.id).join(', ') || 'nobody yet']] };
  }
}
class Officer extends Person {
  constructor(car) {
    const f = car.front, c = Math.cos(f.h), s = Math.sin(f.h);
    super({ look:'police', id:`Officer ${car.id.slice(-1) === '1' ? 'D. Kowalski' : 'A. Mensah'}`, x:f.x - c * 2 + s * 1.5, y:f.y - s * 2 - c * 1.5, h:f.h, speed:3.9, car });
    car.crew = 0;
    this.steps = [{ do:'walk', near:1.1, label:'chasing the suspect', to:p => { const t = incident.thief; return t && !t.caught ? [t.x, t.y] : [p.x, p.y]; } }, { do:'call', fn:p => p.collar() }];
  }
  door() { const f = this.car.front, c = Math.cos(f.h), s = Math.sin(f.h); return [f.x - c * 2.2 + s * 1.5, f.y - s * 2.2 - c * 1.5]; }
  collar() {
    const t = incident.thief;
    if (t && !t.caught && Math.hypot(t.x - this.x, t.y - this.y) < 1.4) {
      t.caught = this; t.steps = []; t.follow = this; t.label = 'under arrest'; incident.arrested(this);
      this.steps.push({ do:'walk', to:this.door(), speed:1.4, label:'walking the suspect to the car' }, { do:'wait', t:0.8, label:'putting the suspect in the car' },
        { do:'call', fn:p => { t.remove(); if (incident.thief === t) incident.thief = null; p.board(); } });
    } else this.steps.push({ do:'walk', to:this.door(), speed:1.6, label:'walking back to the car' }, { do:'call', fn:p => p.board() });
  }
  board() { this.car.crew = 1; this.remove(); this.car.state = 'wait'; }
  info() { return { kind:'Police officer', title:this.id, status:this.status(), rows:[['Car', this.car.id], ['Street', streetAt(this.x, this.y)], ['Arrests', String(this.car.arrests)]] }; }
}
// A police car: parked in the yard beside the station until the alarm, then out with its lights on.
const OUT = y => [[223, 184], [223, 201.5], [56.5, 201.5], [56.5, y]];
const BACK = [[56.5, 270.5], [303.5, 270.5], [303.5, 201.5], [257, 201.5], [257, 184], [229, 184]];
export class PoliceCar extends Car {
  constructor(id, x) {
    super({ kind:'police', role:'police', id, proto:PROTO.police, len:4.6, vmax:15, v:0, path:new Path([[x + 6, 184], [x, 184]]) });
    this.state = 'in'; this.crew = 1; this.arrests = 0; this.calls = 0; this.homeT = 0;
    this.barL = this.group.getObjectByName('barL'); this.barR = this.group.getObjectByName('barR');
    this.s = this.path.length; this.park(); this.place();
  }
  park() { this.stops = [{ s:this.path.length, name:'the police yard', label:'in the yard', release:() => false }]; this.si = 0; this.at = null; }
  drive(pts, name, arrive) {
    this.path = new Path([[this.front.x, this.front.y], ...pts], 5); this.s = 0; this.si = 0; this.at = null;
    this.stops = [{ s:this.path.length, name, label:name, release:() => false, arrive }];
  }
  dispatch(y) { this.state = 'out'; this.calls++; this.drive(OUT(y), 'the scene', () => { this.state = 'scene'; new Officer(this); }); }
  update(dt) {
    const on = this.state === 'out' || this.state === 'scene' || this.state === 'wait', ph = sim.t % 0.5 < 0.25;
    glow(this.barL, on && ph); glow(this.barR, on && !ph);
    if (this.state === 'wait') {
      if (this.ahead && (this.ahead.state === 'scene' || this.ahead.state === 'wait')) return;
      this.state = 'back'; this.homeT = 0; this.drive(BACK, 'the police yard', () => this.home());
    }
    super.update(dt);
    // the second car home stops behind the first one, short of its path's end: that counts as parked too
    if (this.state === 'back' && this.front.x < 262 && this.front.y < 190) { this.homeT = this.v < 0.05 ? this.homeT + dt : 0; if (this.homeT > 1.5) this.home(); }
  }
  home() { const x = this.front.x; this.state = 'in'; this.path = new Path([[x + 6, 184], [x, 184]]); this.s = this.path.length; this.park(); this.place(); }
  status() { return { in:'in the yard', out:'answering the bank alarm', scene:this.crew ? 'at the scene' : 'at the scene · officer on foot', wait:'waiting to leave', back:'returning to the station' }[this.state]; }
  info() {
    return { kind:'Police car', title:this.id, status:this.status(),
      rows:[['Street', streetAt(this.front.x, this.front.y)], ['Lights', this.state === 'out' || this.state === 'scene' || this.state === 'wait' ? 'flashing' : 'off'],
        ['Speed', kmh(this.v)], ['Call-outs', String(this.calls)], ['Arrests', String(this.arrests)]] };
  }
}
export const incident = {
  phase:'quiet', next:85, thief:null, cars:[], log:'no calls today', dispatchAt:0,
  update() {
    if (this.phase === 'quiet' && sim.t >= this.next) this.start();
    if (this.phase === 'alarm' && sim.t >= this.dispatchAt) this.dispatch();
    if ((this.phase === 'response' || this.phase === 'back') && !this.thief && this.cars.every(c => c.state === 'in') && !sim.people.some(p => p instanceof Officer)) {
      this.phase = 'quiet'; this.next = sim.t + rand(60, 320);   // spread wide, so the next try can fall at any hour
    }
  },
  start() { this.phase = 'casing'; this.thief = new Thief(); },
  alarm() {
    this.phase = 'alarm'; bank.alarm = true; sim.stats.robberies++; this.dispatchAt = sim.t + rand(4, 18);
    this.log = `${clock(sim.t)} · alarm at Harbour Bank`; this.thief.flee();
  },
  dispatch() {
    this.phase = 'response';
    const [a, b] = [...this.cars].sort((p, q) => p.front.x - q.front.x);
    a.ahead = null; b.ahead = a; a.dispatch(252); b.dispatch(222);
  },
  arrested(o) { this.phase = 'back'; bank.alarm = false; sim.stats.arrests++; o.car.arrests++; this.log = `${clock(sim.t)} · suspect arrested by ${o.car.id}`; },
  escaped() { this.phase = 'back'; bank.alarm = false; sim.stats.escapes++; this.log = `${clock(sim.t)} · suspect got away`; this.thief.remove(); this.thief = null; },
  state() {
    return { quiet:'quiet', casing:'quiet', alarm:'alarm at Harbour Bank · cars getting ready', response:'responding to the alarm at Harbour Bank', back:'returning from Harbour Bank' }[this.phase];
  },
};
export const policeStation = {
  kind:'police', id:'Police Station', pick:[203.5, 192, 6],
  info() {
    const out = incident.cars.filter(c => c.state !== 'in').length;
    return { kind:'Police', title:'Police Station', status:incident.state(),
      rows:[['Cars in the yard', `${2 - out}/2`], ['Officers on foot', String(sim.people.filter(p => p instanceof Officer).length)], ['Arrests', String(sim.stats.arrests)],
        ['Got away', String(sim.stats.escapes)], ['Last call', incident.log]] };
  },
  readout() { return `police station · ${incident.state()}`; },
};
