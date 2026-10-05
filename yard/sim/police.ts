// @ts-nocheck
import { hooks } from '../shared';
import { glow } from '../kernel/part';
import { rand } from '../kernel/math';
import { Path } from '../kernel/path';
import { BANK } from '../world/town';
import { PROTO, clock, hourAt, kmh, sim } from './core';
import { streetAt } from './roads';
import { Car } from './cars';
import { Person } from './person';
import { nextPortal, pedRoute, portal } from './people';
import { locate, trip } from './roadnet';

// ---- the bank job ----
// A man in a dark hood comes to Harbour Bank. By night he forces the front door; by day he walks in and slips behind
// the counter, and a teller presses the silent alarm while staff and customers walk out to watch from across Market St.
// He cracks the vault and fills a bag. Both police cars come, two officers each, and take the front door, the back
// door and the east side. If he reaches the back door before it is covered he breaks out and they chase him on foot;
// most often he is cornered inside, and after a stand-off the two at the front go in and arrest him.
const B = BANK;
const OUT_FRONT = [116, 196.7], IN_FRONT = [116, 190.4], HALL_GAP = [128.6, 182.2], OFFICE_GAP = [128.6, 177.4], VAULT_IN = [124.6, 172.2];
const BACK_IN = [108.3, 169.6], BACK_OUT = B.back;
const HIDES = [{ at:[112.5, 177.6], label:'hiding behind the counter', sit:true }, { at:[106.4, 190.6], h:Math.PI / 2, label:'watching from the window' },
  { at:BACK_IN, h:-Math.PI / 2, label:'trying the back door', back:true }];
// the four places the officers take round the bank
const POSTS = { left:{ at:[113.2, 196.6], h:-Math.PI / 2, via:[], says:'the front door' }, right:{ at:[118.8, 196.6], h:-Math.PI / 2, via:[], says:'the front door' },
  back:{ at:BACK_OUT, h:Math.PI / 2, via:[[100.5, 197.2], [99.5, 192], [99.5, 166]], says:'the back door' }, east:{ at:[133, 181], h:Math.PI, via:[[132.6, 197.2]], says:'the east side' } };
const ACROSS = [[106, 213.8], [110, 213.8], [114, 213.8], [118, 213.8], [122, 213.8], [126, 213.8]];
const COUNTER = [[109, 180.6], [116, 180.6], [123, 180.6]].map(at => ({ at, by:null })), STATIONS = [[109, 177.2], [123, 177.2]];

const inBank = p => p.x > B.x0 && p.x < B.x1 && p.y > B.y0 && p.y < B.y1;
const zone = ([x, y]) => !(x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1) ? 'out' : y > 179 ? 'hall' : 'office';
// the way between two points in and around the bank: through the front door, the gap at the end of the counter, or the
// back door, never through a wall or over the counter
function route(a, b) {
  const za = zone(a), zb = zone(b);
  if (za === zb) return [b];
  const legs = { 'out>hall':[B.door, IN_FRONT], 'hall>out':[IN_FRONT, B.door], 'hall>office':[HALL_GAP, OFFICE_GAP], 'office>hall':[OFFICE_GAP, HALL_GAP],
    'out>office':[BACK_OUT, BACK_IN], 'office>out':[BACK_IN, BACK_OUT] };
  return [...legs[`${za}>${zb}`], b];
}
export const officers = () => sim.people.filter(p => p instanceof Officer);

export const bank = {
  kind:'bank', id:'Harbour Bank', pick:[116, 192.2, 6], alarm:false,
  open() { const h = hourAt(sim.t); return h >= 9 && h < 17; },
  status() {
    const ph = incident.phase, t = incident.thief;
    if (ph === 'alarm') return 'alarm ringing · police on the way';
    if (ph === 'siege') return incident.perimeter() ? 'surrounded · suspect inside' : 'alarm ringing · police arriving';
    if (ph === 'chase') return 'suspect broke out · police giving chase';
    if (ph === 'done' && t?.caught) return 'suspect arrested';
    return this.open() ? 'open' : 'closed · alarm set';
  },
  info() {
    const ph = incident.phase, t = incident.thief, offs = officers(), rows = [['Hours', '09:00–17:00']];
    if (ph !== 'quiet' && ph !== 'casing') rows.push(['Suspect', !t ? 'got away' : t.caught ? 'under arrest' : `${inBank(t) ? 'inside · ' : ''}${t.status()}`],
      ['Police', offs.length ? `${offs.filter(o => o.inPlace).length} of ${offs.length} officers in position` : 'on the way'],
      ['Vault', incident.vaultOpen ? 'open' : 'shut'], ['Staff and customers', incident.evacuated ? 'out, across Market St' : 'none inside']);
    else rows.push(['Tellers', String(sim.people.filter(p => p instanceof Teller).length)], ['Customers inside', String(sim.people.filter(p => p.atBank).length)]);
    rows.push(['Break-ins tried', String(sim.stats.robberies)], ['Arrests', String(sim.stats.arrests)], ['Got away', String(sim.stats.escapes)]);
    return { kind:'Bank', title:'Harbour Bank', status:this.status(), rows,
      actions:[...(t?.wanted && !t.caught ? [['Suspect', () => hooks.select(t)]] : []), ['Look inside', () => hooks.lookInside(this)]] };
  },
  readout() { return `harbour bank · ${this.status()}`; },
};
hooks.bankOpen = () => bank.open() && (incident.phase === 'quiet' || incident.phase === 'casing');
portal('bank', 'Harbour Bank', OUT_FRONT, { w:1.5 });

// staff and customers: out of the front, over to the far pavement, watching until it is over
function evacuate(p, i) {
  p.standUp(); p.steps = []; p.atBank = false; for (const c of COUNTER) if (c.by === p) c.by = null;
  const spot = ACROSS[i % ACROSS.length];
  p.walk(route([p.x, p.y], OUT_FRONT), 'leaving the bank').go(pedRoute(OUT_FRONT, spot), 'getting away from the bank').face(-Math.PI / 2).then(q => q.watch());
}
// a person outside waits for the police to finish, then carries on
Person.prototype.watch = function () {
  if (incident.phase !== 'quiet' && incident.phase !== 'casing') { this.wait(3, 'watching the bank from across the street').then(p => p.watch()); return; }
  if (this instanceof Teller) { this.steps = []; this.go(pedRoute([this.x, this.y], OUT_FRONT), 'going back in'); return; }
  this.from = { kind:'bank', name:'Harbour Bank', p:OUT_FRONT }; this.trip?.(nextPortal(null, 'bank'));
};
// a walker who came to the bank: up to a free window at the counter, a few words, out again
hooks.bankVisit = w => {
  const c = hooks.bankOpen() && COUNTER.find(q => !q.by);
  if (!c) { w.wait(2, 'the bank is shut').then(p => p.trip(nextPortal(w.to, 'bank'))); return; }
  c.by = w; w.atBank = true;
  w.walk([B.door, IN_FRONT, c.at], 'going into the bank').face(-Math.PI / 2).wait(rand(5, 9), 'at the counter')
    .then(p => { c.by = null; }).walk([IN_FRONT, B.door, OUT_FRONT], 'leaving the bank').then(p => { p.atBank = false; p.trip(nextPortal(p.to, 'bank')); });
};

// two tellers, in by the back door in the morning and out again after closing
export class Teller extends Person {
  constructor(k) { super({ look:'teller', id:['G. Moreau', 'K. Osei'][k], k, x:BACK_OUT[0], y:BACK_OUT[1], h:-Math.PI / 2, speed:1.4 }); }
  think() {
    const at = STATIONS[this.k], quiet = incident.phase === 'quiet' || incident.phase === 'casing';
    if (!quiet) { this.wait(1); return; }
    if (!bank.open() && hourAt(sim.t) >= 17) { this.walk(route([this.x, this.y], BACK_OUT), 'going home').then(p => p.remove()); return; }
    if (Math.hypot(this.x - at[0], this.y - at[1]) > 0.1) { this.walk(route([this.x, this.y], at), 'to the counter').face(Math.PI / 2); return; }
    const served = COUNTER.find(c => c.by && Math.abs(c.at[0] - at[0]) < 3.6);
    this.wait(rand(3, 6), served ? 'serving a customer' : bank.open() ? 'at the counter' : 'opening up');
  }
  info() { return { kind:'Teller · Harbour Bank', title:this.id, status:this.status(), rows:[['Window', this.k ? 'east' : 'west'], ['Hours', '09:00–17:00']] }; }
}
const TELLERS = () => sim.people.filter(p => p instanceof Teller);

class Thief extends Person {
  constructor() {
    super({ look:'thief', id:'Hooded man', x:68.3, y:241, h:-Math.PI / 2, speed:1.6 });   // off the bus at the Park stop
    const night = !bank.open();
    this.go(pedRoute([this.x, this.y], OUT_FRONT), 'walking').walk([B.door], 'at the bank door').face(-Math.PI / 2);
    if (night) this.wait(5, 'forcing the bank door').then(() => incident.alarm('front door forced'));
    this.walk([IN_FRONT], night ? 'breaking in' : 'walking into the bank');
    if (!night) this.then(() => incident.alarm('silent alarm, pressed by a teller'));   // a teller sees him make for the gap
    this.walk([HALL_GAP, OFFICE_GAP], 'slipping behind the counter');
    this.walk([B.vault], 'at the vault').face(-Math.PI / 2).wait(rand(8, 13), 'cracking the vault').then(() => { incident.vaultOpen = true; })
      .wait(1.5, 'cracking the vault').walk([VAULT_IN], 'in the vault').wait(7, 'filling a bag').then(p => { p.carrying = 'cash'; p.bag = true; })
      .walk([B.vault], 'leaving the vault').then(p => p.decide());
  }
  // out of the back door if nobody covers it yet; otherwise lie low and wait for a chance
  decide() {
    if (!incident.posted('back')) { this.speed = 3.3; this.walk([[112, 176.6], BACK_IN], 'running for the back door').then(p => incident.posted('back') ? p.cornered() : p.breakOut()); return; }
    this.cornered();
  }
  cornered() {
    if (this.caught) return;
    const k = this.hideK = ((this.hideK ?? -1) + 1) % HIDES.length, hd = HIDES[k];
    this.standUp(); this.walk(route([this.x, this.y], hd.at), hd.label);
    if (hd.h !== undefined) this.face(hd.h);
    if (hd.sit) this.then(p => p.sitOn({ ground:true }));
    this.wait(rand(4, 7), hd.back ? 'trying the back door · police outside' : hd.label).then(p => { p.standUp(); if (hd.back && !incident.posted('back')) p.breakOut(); else p.cornered(); });
  }
  // out through the back door and away over the plaza and through the park
  breakOut() {
    this.speed = rand(3.2, 3.75); this.steps = []; incident.breakout();
    this.walk([BACK_OUT, [100, 160], [100, 139.3], [51.7, 139.3], [42, 150], [8, 150], [8, 200], [-6, 200]], 'running from the bank').then(() => incident.escaped());
  }
  info() {
    if (!this.wanted) return { kind:'Pedestrian', title:this.id, status:this.status(), rows:[['Street', streetAt(this.x, this.y)], ['Wearing', 'a dark hood and gloves'], ['Seen since', clock(this.t0)]] };
    const offs = officers(), ins = inBank(this);
    return { kind:`Suspect · ${ins ? 'inside Harbour Bank' : 'wanted'}`, title:this.id, status:this.caught ? `under arrest · ${this.caught.car.id}` : this.status(),
      rows:[['Wanted for', 'breaking into Harbour Bank'], ['Carrying', this.bag ? 'a bag of cash' : 'nothing'], ['Where', ins ? 'inside the bank' : streetAt(this.x, this.y)],
        ['Surrounded by', offs.filter(o => o.inPlace).map(o => o.id.replace('Officer ', '')).join(', ') || 'nobody yet']] };
  }
}

const CREWS = { 'POL-1':['D. Kowalski', 'R. Haddad'], 'POL-2':['A. Mensah', 'T. Lund'] };
class Officer extends Person {
  constructor(car, post, k) {
    const f = car.front, c = Math.cos(f.h), s = Math.sin(f.h), out = [f.x - c * (1.6 + 1.3 * k) - s * 1.6, f.y - s * (1.6 + 1.3 * k) + c * 1.6];
    super({ look:'police', id:`Officer ${CREWS[car.id][k]}`, x:out[0], y:out[1], h:f.h - Math.PI / 2, speed:3.6, car, post });
    car.crew--;
    const P = POSTS[post];
    this.walk([...P.via, P.at], `taking position at ${P.says}`).face(P.h).then(p => { p.inPlace = true; p.label = `covering ${P.says}`; });
  }
  door() { const f = this.car.front, c = Math.cos(f.h), s = Math.sin(f.h); return [f.x - c * 2.2 - s * 1.6, f.y - s * 2.2 + c * 1.6]; }
  goIn() { this.inPlace = false; this.steps = []; this.chase('going in after the suspect'); }
  // after him, by the way round walls and the counter; arrest him when within reach
  chase(label = 'chasing the suspect') {
    this.inPlace = false;
    this.steps = [{ do:'walk', near:1.0, label, to:p => { const t = incident.thief; return t && !t.caught ? route([p.x, p.y], [t.x, t.y])[0] : [p.x, p.y]; } },
      { do:'call', fn:p => { const t = incident.thief; if (t && !t.caught && Math.hypot(t.x - p.x, t.y - p.y) > 1.4) p.chase(label); else p.collar(); } }];
  }
  collar() {
    const t = incident.thief;
    if (t && !t.caught && Math.hypot(t.x - this.x, t.y - this.y) < 1.4) {
      t.caught = this; t.standUp(); t.steps = []; t.follow = this; t.label = 'under arrest'; incident.arrested(this);
      this.walk([...route([this.x, this.y], OUT_FRONT), this.door()], 'walking the suspect to the car').wait(0.8, 'putting the suspect in the car')
        .then(p => { t.remove(); if (incident.thief === t) incident.thief = null; p.board(); });
    } else this.standDown();
  }
  standDown() { this.inPlace = false; this.steps = []; this.walk([...route([this.x, this.y], OUT_FRONT), this.door()], 'walking back to the car').then(p => p.board()); }
  board() { this.car.crew++; this.remove(); }
  info() { return { kind:'Police officer', title:this.id, status:this.status(), rows:[['Car', this.car.id], ['Post', POSTS[this.post].says], ['Street', inBank(this) ? 'inside Harbour Bank' : streetAt(this.x, this.y)], ['Arrests', String(this.car.arrests)]] }; }
}

// A police car: parked in the yard beside the station until the alarm, then out with its lights on, two officers in it.
// From the yard down to Market St, west to the bank; back to the yard the shortest way round.
const YARD = [[257, 201.5], [257, 184]];
export class PoliceCar extends Car {
  constructor(id, x) {
    super({ kind:'police', role:'police', id, proto:PROTO.police, len:4.6, vmax:15, v:0, path:new Path([[x + 6, 184], [x, 184]]) });
    this.state = 'in'; this.crew = 2; this.arrests = 0; this.calls = 0; this.homeT = 0; this.yardX = x;
    this.barL = this.group.getObjectByName('barL'); this.barR = this.group.getObjectByName('barR');
    this.s = this.path.length; this.park(); this.place();
  }
  park() { this.stops = [{ s:this.path.length, name:'the police yard', label:'in the yard', release:() => false }]; this.si = 0; this.at = null; }
  drive(pts, name, arrive) {
    this.path = new Path([[this.front.x, this.front.y], ...pts], 5); this.s = 0; this.si = 0; this.at = null;
    this.stops = [{ s:this.path.length, name, label:name, release:() => false, arrive }];
  }
  dispatch(x, posts) { this.state = 'out'; this.calls++; this.drive([[223, 184], [223, 201.5], [x, 201.5]], 'Harbour Bank', () => { this.state = 'scene'; posts.forEach((p, k) => new Officer(this, p, k)); }); }
  update(dt) {
    const on = this.state === 'out' || this.state === 'scene', ph = sim.t % 0.5 < 0.25;
    glow(this.barL, on && ph); glow(this.barR, on && !ph);
    // back to the yard once it is over and both officers are in (behind the other car, after it has gone)
    if (this.state === 'scene' && incident.phase === 'done' && this.crew === 2 && !(this.ahead?.state === 'scene')) {
      const pts = trip({ x:this.front.x, y:this.front.y, h:this.front.h }, locate(...YARD[0].map((v, i) => v + [6, 0][i]), Math.PI));
      this.state = 'back'; this.homeT = 0; this.drive([...(pts ?? []), ...YARD, [this.yardX, 184]], 'the police yard', () => this.home());
    }
    super.update(dt);
    // the second car home stops behind the first one, short of its path's end: that counts as parked too
    if (this.state === 'back' && this.front.x < 262 && this.front.y < 190) { this.homeT = this.v < 0.05 ? this.homeT + dt : 0; if (this.homeT > 1.5) this.home(); }
  }
  home() { const x = this.front.x; this.state = 'in'; this.path = new Path([[x + 6, 184], [x, 184]]); this.s = this.path.length; this.park(); this.place(); }
  status() { return { in:'in the yard', out:'answering the alarm at Harbour Bank', scene:this.crew < 2 ? `at Harbour Bank · ${2 - this.crew} officers out` : 'at Harbour Bank', back:'returning to the station' }[this.state]; }
  info() {
    return { kind:'Police car', title:this.id, status:this.status(),
      rows:[['Crew', CREWS[this.id].join(', ')], ['Street', streetAt(this.front.x, this.front.y)], ['Lights', this.state === 'out' || this.state === 'scene' ? 'flashing' : 'off'],
        ['Speed', kmh(this.v)], ['Call-outs', String(this.calls)], ['Arrests', String(this.arrests)]] };
  }
}

export const incident = {
  phase:'quiet', next:85, thief:null, cars:[], log:'no calls today', dispatchAt:0, vaultOpen:false, evacuated:false, standoffAt:0, how:'',
  update(dt) {
    if (this.phase === 'quiet' && sim.t >= this.next) this.start();
    if (this.phase === 'alarm' && sim.t >= this.dispatchAt) this.dispatch();
    if (this.phase === 'siege') {
      if (!this.standoffAt && this.perimeter()) this.standoffAt = sim.t + rand(10, 20);
      if (this.standoffAt && sim.t >= this.standoffAt && this.thief?.bag && !this.goneIn) { this.goneIn = true; for (const o of officers()) if (o.post === 'left' || o.post === 'right') o.goIn(); }
    }
    if (this.phase === 'done' && !this.thief && this.cars.every(c => c.state === 'in') && !officers().length) {
      this.phase = 'quiet'; this.next = sim.t + rand(60, 320);   // spread wide, so the next try can fall at any hour
      Object.assign(this, { vaultOpen:false, evacuated:false, standoffAt:0, goneIn:false });
    }
    // the tellers keep the bank's hours
    const want = bank.open() && (this.phase === 'quiet' || this.phase === 'casing'), tellers = TELLERS();
    if (want) for (let k = 0; k < 2; k++) if (!tellers.some(t => t.k === k)) new Teller(k).walk([BACK_IN], 'arriving for work');
    const v = this.vaultDoor; if (v) v.rotation.y += Math.max(-dt * 0.8, Math.min(dt * 0.8, (this.vaultOpen ? -1.7 : 0) - v.rotation.y));
  },
  start() { this.phase = 'casing'; this.thief = new Thief(); },
  alarm(how) {
    this.phase = 'alarm'; this.how = how; bank.alarm = true; sim.stats.robberies++; this.dispatchAt = sim.t + rand(3, 28);   // sometimes the crews are slow to get going, and the back door is left open
    this.log = `${clock(sim.t)} · alarm at Harbour Bank · ${how}`; this.thief.id = 'Suspect'; this.thief.wanted = true;
    // everyone inside gets out by the front, the thief excepted
    const inside = sim.people.filter(p => p !== this.thief && inBank(p) && !(p instanceof Officer));
    inside.forEach((p, i) => evacuate(p, i)); this.evacuated = inside.length > 0;
  },
  dispatch() {
    this.phase = 'siege';
    const [a, b] = [...this.cars].sort((p, q) => p.front.x - q.front.x);   // the first out goes furthest, the second stops behind it
    a.ahead = null; b.ahead = a; a.dispatch(109, ['back', 'east']); b.dispatch(124, ['left', 'right']);
  },
  posted(post) { return officers().some(o => o.post === post && o.inPlace); },
  perimeter() { return ['left', 'right', 'back', 'east'].every(p => this.posted(p)); },
  breakout() { this.phase = 'chase'; for (const o of officers()) o.chase(); },
  arrested(o) {
    this.phase = 'done'; bank.alarm = false; sim.stats.arrests++; o.car.arrests++;
    this.log = `${clock(sim.t)} · suspect arrested ${inBank(o) ? 'inside the bank' : streetAt(o.x, o.y)} by ${o.id}`;
    for (const q of officers()) if (q !== o) q.standDown();
  },
  escaped() {
    this.phase = 'done'; bank.alarm = false; sim.stats.escapes++; this.log = `${clock(sim.t)} · suspect got away`; this.thief.remove(); this.thief = null;
    for (const q of officers()) q.standDown();
  },
  state() {
    return { quiet:'quiet', casing:'quiet', alarm:'alarm at Harbour Bank · cars getting ready', siege:this.perimeter() ? 'bank surrounded · suspect inside' : 'responding to the alarm at Harbour Bank',
      chase:'chasing a suspect from Harbour Bank', done:'returning from Harbour Bank' }[this.phase];
  },
};
export const policeStation = {
  kind:'police', id:'Police Station', pick:[203.5, 192, 6],
  info() {
    const out = incident.cars.filter(c => c.state !== 'in').length, offs = officers();
    return { kind:'Police', title:'Police Station', status:incident.state(),
      rows:[['Cars in the yard', `${2 - out}/2`], ['Officers out', String(offs.length)],
        ['Perimeter', incident.phase === 'siege' ? `${offs.filter(o => o.inPlace).length} of 4 posts covered` : '—'], ['Arrests', String(sim.stats.arrests)],
        ['Got away', String(sim.stats.escapes)], ['Last call', incident.log]] };
  },
  readout() { return `police station · ${incident.state()}`; },
};
