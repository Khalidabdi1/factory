// @ts-nocheck
import * as THREE from 'three';
import { hooks, noop, scene } from '../shared';
import { W } from '../kernel/iso';
import { Part, glow, pose } from '../kernel/part';
import { clamp, rand, rng, wrap } from '../kernel/math';
import { Path } from '../kernel/path';
import { BANK } from '../world/town';
import { CURB, PORT, RAB, SHELF, SHOP, zAt } from '../layout';
import { PROTO, clock, hourAt, kmh, night, sim } from './core';
import { bendLimit, laneClear, pullIn, streetAt } from './roads';
import { Car } from './cars';
import { Person } from './person';
import { Shopper, Staff, nextPortal, pedRoute, portal, shop } from './people';
import { locate, trip } from './roadnet';
import { buildHeli, buildHelipad } from '../models/heli';

// ---- crime ----
// Now and then a crew of two to four drives into town in a dark car: to Harbour Bank (by day they walk in, by night
// they force the door), to Corner Market while it is open, or by night to the container terminal over in Sahel. The
// driver waits at the kerb with the engine running while the others go in. Once the alarm is raised all three police
// cars come, two officers in each, and POL-AIR lifts off the station roof. How it ends was settled before they set out:
//   surrender  the police surround the place; after a stand-off the crew come out one by one, hands up
//   shootout   the crew fire from inside and the police fire back from cover; nobody dies, but those hit go down and
//              are arrested where they fell, and the rest give up
//   getaway    the crew run for the car as the sirens come and it races off with the police behind it and the
//              helicopter above: into a roadblock, or abandoned while the crew scatter on foot, or clean away
//   foot       the driver loses his nerve and leaves without them; the crew break out and are chased on foot
const S = Math.PI / 2, N = -Math.PI / 2;
// a person's steps, cleared from inside one of their own steps: the stand-in is what the step drops as it returns
const reset = p => { p.steps = [{ do:'skip' }]; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// where someone has been, a point a metre: who chases them follows it (round walls, through doors), and an officer
// far from the car walks back along their own
const trace = p => { const t = p.trail, l = t[t.length - 1]; if (!l || Math.hypot(l[0] - p.x, l[1] - p.y) > 0.9) t.push(p.lz === undefined ? [p.x, p.y] : [p.x, p.y, p.lz]); };
const backAlong = trail => { const r = []; for (let i = trail.length - 1; i >= 0; i -= 2) r.push(trail[i]); return r; };
const wpick = o => { let r = rng() * Object.values(o).reduce((s, v) => s + v, 0); for (const [k, v] of Object.entries(o)) if ((r -= v) <= 0) return k; return Object.keys(o)[0]; };

// ---- Harbour Bank ----
const B = BANK;
const OUT_FRONT = [116, 196.7], IN_FRONT = [116, 190.4], HALL_GAP = [128.6, 182.2], OFFICE_GAP = [128.6, 177.4], VAULT_IN = [124.6, 172.2];
const BACK_IN = [108.3, 169.6], BACK_OUT = B.back;
const ACROSS = [[106, 213.8], [110, 213.8], [114, 213.8], [118, 213.8], [122, 213.8], [126, 213.8]];
const COUNTER = [[109, 180.6], [116, 180.6], [123, 180.6]].map(at => ({ at, by:null })), STATIONS = [[109, 177.2], [123, 177.2]];

const inBank = p => p.x > B.x0 && p.x < B.x1 && p.y > B.y0 && p.y < B.y1;
const zone = ([x, y]) => !(x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1) ? 'out' : y > 179 ? 'hall' : 'office';
// the way between two points in and around the bank: through the front door, the gap at the end of the counter, or the
// back door, never through a wall or over the counter
// (between the office and the street in front, by the hall and the front door; the back door is for the back)
function route(a, b) {
  const za = zone(a), zb = zone(b);
  if (za === zb) return za === 'office' ? officeWay(a, b) : [b];
  const front = (za === 'out' ? a : b)[1] > B.y1 - 6;
  const legs = { 'out>hall':[B.door, IN_FRONT], 'hall>out':[IN_FRONT, B.door], 'hall>office':[HALL_GAP, OFFICE_GAP], 'office>hall':[OFFICE_GAP, HALL_GAP],
    'out>office':front ? [B.door, IN_FRONT, HALL_GAP, OFFICE_GAP] : [BACK_OUT, BACK_IN], 'office>out':front ? [OFFICE_GAP, HALL_GAP, IN_FRONT, B.door] : [BACK_IN, BACK_OUT] }[`${za}>${zb}`];
  const first = za === 'office' ? officeWay(a, legs[0]) : [legs[0]];
  return [...first, ...legs.slice(1, -1), ...(zb === 'office' ? officeWay(legs[legs.length - 1], b) : [legs[legs.length - 1], b])];
}
// behind the counter, keep to the corridor along it (y 176.6): the manager's glass office and the vault lie north of
// it, and the vault is entered through its door
const inVault = ([x, y]) => x > 119.5 && y < 174.6;
function officeWay(a, b) {
  const pts = [];
  if (inVault(a)) pts.push([122.2, 173.6], [122.2, 176.6]); else if (a[1] < 175.8) pts.push([a[0], 176.6]);
  if (inVault(b)) pts.push([122.2, 176.6], [122.2, 173.6]); else if (b[1] < 175.8) pts.push([b[0], 176.6]);
  pts.push(b);
  return pts.filter((p, i) => Math.hypot(p[0] - (i ? pts[i - 1] : a)[0], p[1] - (i ? pts[i - 1] : a)[1]) > 0.05);
}
export const officers = () => sim.people.filter(p => p instanceof Officer);

export const bank = {
  kind:'bank', id:'Harbour Bank', pick:[116, 192.2, 6], alarm:false,
  open() { const h = hourAt(sim.t); return h >= 9 && h < 17; },
  // while it is being robbed it stands open to view, its section drawn
  opened() { return incident.at('bank'); },
  status() { return incident.at('bank') ? incident.status() : this.open() ? 'open' : 'closed · alarm set'; },
  info() {
    const rows = [['Hours', '09:00–17:00']];
    if (incident.at('bank')) rows.push(...incident.rows(), ['Vault', incident.vaultOpen ? 'open' : 'shut'], ['Staff and customers', incident.evacuated ? 'out, across Market St' : 'none inside']);
    else rows.push(['Tellers', String(sim.people.filter(p => p instanceof Teller).length)], ['Customers inside', String(sim.people.filter(p => p.atBank).length)]);
    rows.push(['Robberies', String(incident.counts.bank)]);
    return { kind:'Bank', title:'Harbour Bank', status:this.status(), rows, actions:[...incident.actions('bank'), ['Look inside', () => hooks.lookInside(this)]] };
  },
  readout() { return `harbour bank · ${this.status()}`; },
};
hooks.bankOpen = () => bank.open() && !incident.at('bank');
portal('bank', 'Harbour Bank', OUT_FRONT, { w:1.5 });

// staff and customers: out of the front, over to the far pavement, watching until it is over
function evacuate(p, i) {
  p.standUp(); reset(p); p.atBank = false; for (const c of COUNTER) if (c.by === p) c.by = null;
  const spot = ACROSS[i % ACROSS.length];
  p.walk(route([p.x, p.y], OUT_FRONT), 'leaving the bank').go(pedRoute(OUT_FRONT, spot), 'getting away from the bank').face(N).then(q => q.watch());
}
// a person outside waits for the police to finish, then carries on
Person.prototype.watch = function () {
  if (incident.at('bank')) { this.wait(3, 'watching the bank from across the street').then(p => p.watch()); return; }
  if (this instanceof Teller) { this.steps = []; this.go(pedRoute([this.x, this.y], OUT_FRONT), 'going back in'); return; }
  this.from = { kind:'bank', name:'Harbour Bank', p:OUT_FRONT }; this.trip?.(nextPortal(null, 'bank'));
};
// a walker who came to the bank: up to a free window at the counter, a few words, out again
hooks.bankVisit = w => {
  const c = hooks.bankOpen() && COUNTER.find(q => !q.by);
  if (!c) { w.wait(2, 'the bank is shut').then(p => p.trip(nextPortal(w.to, 'bank'))); return; }
  c.by = w; w.atBank = true;
  w.walk([B.door, IN_FRONT, c.at], 'going into the bank').face(N).wait(rand(5, 9), 'at the counter')
    .then(p => { c.by = null; }).walk([IN_FRONT, B.door, OUT_FRONT], 'leaving the bank').then(p => { p.atBank = false; p.trip(nextPortal(p.to, 'bank')); });
};

// two tellers, in by the back door in the morning and out again after closing
export class Teller extends Person {
  constructor(k) { super({ look:'teller', id:['G. Moreau', 'K. Osei'][k], k, x:BACK_OUT[0], y:BACK_OUT[1], h:N, speed:1.4 }); }
  think() {
    const at = STATIONS[this.k];
    if (incident.at('bank')) { this.wait(1); return; }
    if (!bank.open() && hourAt(sim.t) >= 17) { this.walk(route([this.x, this.y], BACK_OUT), 'going home').then(p => p.remove()); return; }
    if (Math.hypot(this.x - at[0], this.y - at[1]) > 0.1) { this.walk(route([this.x, this.y], at), 'to the counter').face(S); return; }
    const served = COUNTER.find(c => c.by && Math.abs(c.at[0] - at[0]) < 3.6);
    this.wait(rand(3, 6), served ? 'serving a customer' : bank.open() ? 'at the counter' : 'opening up');
  }
  info() { return { kind:'Teller · Harbour Bank', title:this.id, status:this.status(), rows:[['Window', this.k ? 'east' : 'west'], ['Hours', '09:00–17:00']] }; }
}
const TELLERS = () => sim.people.filter(p => p instanceof Teller);

// ---- Corner Market ----
const inShop = ([x, y]) => x > 377.5 && x < 409.5 && y > 231 && y < 249;
const shopWay = (a, b) => inShop(a) === inShop(b) ? [b] : inShop(a) ? [SHOP.in, SHOP.out, b] : [SHOP.out, SHOP.in, b];
// a hold-up: the staff at the till put their hands up and stay put; shoppers are let go and run out
function holdUp() {
  for (const p of [...sim.people]) {
    if (!inShop([p.x, p.y]) || p instanceof Crook || p instanceof Officer) continue;
    if (p instanceof Staff) { if (p.task || p.carrying || p.truck) continue; reset(p); p.stance = 'hands'; p.held = true; p.wait(1e6, 'hands up · held at the till'); }
    else if (p instanceof Shopper) {
      for (const s of SHELF) if (s.reserved === p) s.reserved = null;
      reset(p); p.carrying = null; p.speed = 2.6; p.walk(shop.routeOut([p.x, p.y]), 'running out of the shop').then(q => q.leave());
    }
  }
}
const letGo = () => { for (const p of sim.people) if (p.held) { p.held = false; p.stance = null; p.steps = []; } };
hooks.shopShut = () => incident.at('shop');
const shopInfo = shop.info;
shop.info = function () { const i = shopInfo.call(this); if (incident.at('shop')) { i.status = incident.status(); i.rows = [...incident.rows(), ...i.rows]; i.actions = incident.actions('shop'); } return i; };
shop.opened = () => incident.at('shop');

// ---- the container terminal ----
// The crew cut the fence on the promenade at the terminal's west end, climb up onto its deck, 2 m above, and go down
// its west edge to the reefer racks, whose doors face south, over open deck; whoever goes after them climbs the same
// way. (Anything at the deck's north fence would be hidden from the town behind the stacks and the cranes.)
const CUT = 653, STRIP = 651.4, PZ = PORT.z;
const onDeck = ([x, y]) => y > 279.6 && x > PORT.x0 && x < PORT.x1;
// a fourth field: back on the ground there (the climb down clears a person's own height)
const DECK_IN = [[CUT, 278.9, CURB, 1], [CUT, 280.6, PZ], [STRIP, 283, PZ], [STRIP, 313.5, PZ]];
const portWay = (a, b) => onDeck(a) === onDeck(b) ? [b] : onDeck(a) ? [...[...DECK_IN].reverse(), b] : [...DECK_IN, b];
hooks.crimeAt = key => incident.at(key) ? incident.status() : null;

// ---- the jobs ----
// lane: where the getaway car stops (a lane point, pulled in to the kerb); focus: what the helicopter circles;
// way(a, b): how to walk between two points in and around the place; holds: where the crew wait once they have what
// they came for; giveUp: where they come out to with their hands up; police and posts: where each car stops and where
// its two officers go (front: in sight of the crew); escape: the getaway car's run, off the edge of the map;
// block: a roadblock (a lane point, then the swerve across); bail: where the car is left and the ways they scatter;
// foot: the ways they break out on foot
const POSTS = {
  bank:{ back:{ at:BACK_OUT, h:S, via:[[100.5, 197.2], [99.5, 192], [99.5, 166]], says:'the back door' }, west:{ at:[99.5, 181], h:0, via:[[100.5, 197.2], [99.5, 192]], says:'the west side' },
    left:{ at:[111.5, 197.6], h:N, via:[], says:'the front door', front:true }, right:{ at:[120.5, 197.6], h:N, via:[], says:'the front door', front:true },
    east:{ at:[133, 181], h:Math.PI, via:[[132.6, 197.2]], says:'the east side' }, street:{ at:[127.5, 200.7], h:N, via:[], says:'the street, behind POL', front:true } },
  shop:{ west:{ at:[375.6, 244], h:0, via:[[377.4, 256.4], [375.6, 253]], says:'the west side' }, frontW:{ at:[387, 257.6], h:N, via:[], says:'the shop front', front:true },
    frontE:{ at:[400.5, 257.6], h:N, via:[], says:'the shop front', front:true }, east:{ at:[411.8, 245], h:Math.PI, via:[[411.7, 254.6]], says:'the east side' },
    back:{ at:[394, 228.6], h:S, via:[[411.8, 229]], says:'the back' }, corner:{ at:[411.8, 232.5], h:Math.PI, via:[], says:'Hill Av' } },
  port:Object.fromEntries([[655, 319.2, N], [659, 319.2, N], [663, 319.2, N], [667, 319.2, N], [671, 319.2, N], [STRIP, 316.6, -0.5]].map(([x, y, h], i) =>
    [`p${i}`, { at:[x, y], h, via:[...DECK_IN.slice(0, 3), [STRIP, 318.6, PZ]], says:'the reefer racks', front:true }])),
};
const JOBS = {
  bank:{ key:'bank', name:'Harbour Bank', what:'robbing Harbour Bank', weight:0.45, ok:() => true, size:() => 1 + Math.floor(rng() * 3),
    lane:[99, 201.5, Math.PI], focus:[116, 182], way:route,
    work(c, k) {
      const dark = !bank.open();
      c.walk([OUT_FRONT, B.door], 'walking to the bank').face(N);
      if (dark) c.wait(5, k ? 'keeping watch at the door' : 'forcing the bank door');
      if (dark && !k) c.then(() => incident.alarm('the front door forced'));
      c.walk([IN_FRONT], dark ? 'breaking in' : 'walking into the bank');
      if (!k) {
        if (!dark) c.then(() => incident.alarm('the silent alarm, pressed by a teller'));
        c.walk([HALL_GAP, OFFICE_GAP], 'slipping behind the counter').walk([B.vault], 'at the vault').face(N).wait(rand(8, 12), 'cracking the vault').then(() => { incident.vaultOpen = true; })
          .wait(1.5, 'cracking the vault').walk([VAULT_IN], 'in the vault').wait(6, 'filling bags').then(p => { p.carrying = 'cash'; p.bag = 'two bags of cash'; incident.loot = true; }).walk([B.vault], 'leaving the vault');
      }
      c.then(p => p.hold());
    },
    holds:[{ at:[116, 189.4], h:S, label:'at the door, watching the street' }, { at:[110.5, 190.6], h:S, label:'at the west window' }, { at:[121.5, 190.6], h:S, label:'at the east window' }],
    giveUp:[[116, 195.6], [112.2, 195.6], [119.8, 195.6]],
    police:[[109, 201.5, Math.PI], [124, 201.5, Math.PI], [139, 201.5, Math.PI]], posts:[['back', 'west'], ['left', 'right'], ['east', 'street']].map(ks => ks.map(k => POSTS.bank[k])),
    escape:[[99, 199.3], [92, 201.5], [56.5, 201.5], [56.5, 263.5], [-70, 263.5]],
    block:{ lane:[63.5, 252, N], swerve:[[63.5, 247.5], [59.6, 242.4], [57.9, 239]] },
    bail:{ at:[56.5, 226], flee:[[[50, 226], [42, 228], [25, 238], [8, 250], [-66, 250]], [[50, 222], [42, 210], [42, 196.7], [42, 150], [8, 150], [-66, 146]],
      [[50, 230], [42, 250], [42, 258.7], [36, 266], [28, 276.5], [-66, 276.5]]] },
    foot:[[BACK_IN, BACK_OUT, [100, 160], [100, 139.3], [51.7, 139.3], [42, 150], [8, 150], [-66, 150]],
      [BACK_IN, BACK_OUT, [114, 160], [150, 152], [171.7, 139.3], [171.7, 196.7], [188.3, 213.3], [188.3, 258.7], [188.3, 276.5], [262, 286]],
      [BACK_IN, BACK_OUT, [104, 160], [96, 147], [68.3, 139.3], [42, 139.3], [20, 131], [-66, 131]]] },
  shop:{ key:'shop', name:'Corner Market', what:'holding up Corner Market', weight:0.35, ok:() => { const h = hourAt(sim.t); return h >= 8 && h < 23; }, size:() => 1 + Math.floor(rng() * 2),
    lane:[392, 263.5, Math.PI], focus:[393, 242], way:shopWay,
    work(c, k) {
      c.walk([[c.x, 256.6], SHOP.front, SHOP.out, SHOP.in], 'walking into Corner Market');
      if (!k) c.walk([[397, 247.6], SHOP.counter], 'to the counter').face(N).then(() => incident.alarm('the panic button under the counter')).wait(rand(6, 9), 'holding up the till')
        .then(p => { p.carrying = 'cash'; p.bag = 'the till'; incident.loot = true; });
      c.then(p => p.hold());
    },
    holds:[{ at:[395.5, 247.6], h:S, label:'by the door' }, { at:[388.5, 247.6], h:S, label:'at the window' }, { at:[401, 247.2], h:S, label:'by the till' }],
    giveUp:[[393.5, 253.8], [389.5, 253.8], [397.5, 253.8]],
    police:[[380, 263.5, Math.PI], [405, 263.5, Math.PI], [416.5, 237, S]], posts:[['west', 'frontW'], ['frontE', 'east'], ['back', 'corner']].map(ks => ks.map(k => POSTS.shop[k])),
    escape:[[392, 261.3], [385, 263.5], [-70, 263.5]],
    block:{ lane:[66, 270.5, 0], swerve:[[70, 270.5], [78, 267], [84, 264.6]] },
    bail:{ at:[150, 263.5], flee:[[[150, 259.4], [171.7, 258.7], [171.7, 213.3], [188.3, 196.7], [188.3, 139.3]], [[147, 266], [147, 276.5], [136, 285.5], [100, 290], [-66, 290]],
      [[153, 259.4], [68.3, 258.7], [51.7, 258.7], [42, 250], [8, 250], [-66, 250]]] },
    foot:[[SHOP.in, SHOP.out, SHOP.front, [377.4, 254.6], [373.4, 258.7], [308.3, 258.7], [291.7, 258.7], [291.7, 213.3], [188.3, 213.3]],
      [SHOP.in, SHOP.out, [399, 254.6], [399, 277.7], [384, 285.5], [300, 290], [180, 290]],
      [SHOP.in, SHOP.out, [411.7, 254.6], [411.7, 213.3], [428.3, 213.3], [436, 200], [520, 200]]] },
  port:{ key:'port', name:'the container terminal', what:'breaking into the container terminal', weight:0.6, ok:() => { const h = hourAt(sim.t); return h >= 17 && h < 20.5; }, size:() => 2 + Math.floor(rng() * 2),
    // (set out in the evening: the drive along the coast and the work at the fence bring the break-in to near midnight)
    // in along the coast road from the woods of the green belt, round in the road past the terminal, and back to the
    // kerb facing home
    approach:() => pullIn([[452, 270.5], [676, 270.5], [683, 267], [676, 263.5], [660, 263.5]], 2.2),
    lane:[660, 263.5, Math.PI], focus:[664, 312], way:portWay,
    work(c, k) {
      c.go([[c.x, c.y], [c.x, 275.6]], 'crossing the Corniche').walk([[CUT + 1.4 * (k - 1), 278.8]], 'at the terminal fence').face(S).wait(6, k ? 'keeping watch' : 'cutting the fence');
      c.walk(portWay([c.x, c.y], JOBS.port.holds[k].at), 'climbing through the fence');
      if (!k) c.face(N).wait(rand(4, 6), 'breaking a reefer\'s seal').then(() => incident.alarm('seen on the terminal\'s cameras')).wait(rand(6, 9), 'emptying the reefer')
        .then(p => { p.carrying = 'crate'; p.bag = 'a crate of medicines'; incident.loot = true; });
      c.then(p => p.hold());
    },
    holds:[{ at:[664.8, 310.4], h:N, label:'at the open reefer' }, { at:[659, 311.6], h:S, label:'keeping watch by the reefers' }, { at:[670.4, 311.6], h:S, label:'keeping watch by the reefers' }],
    giveUp:[[665, 315.4], [660, 315.4], [670, 315.4]],
    police:[[676, 270.5, 0], [664, 270.5, 0], [652, 270.5, 0]], posts:[['p3', 'p4'], ['p1', 'p2'], ['p0', 'p5']].map(ks => ks.map(k => POSTS.port[k])),
    escape:[[660, 261.3], [653, 263.5], [-70, 263.5]],
    block:{ lane:[440, 270.5, 0], swerve:[[452, 270.5], [460, 267], [466, 264.6]] },
    bail:{ at:[486, 263.5], flee:[[[486, 259.2], [484, 240], [474, 216], [458, 200], [436, 200], [428.3, 196.7]], [[488, 259.2], [497, 236], [508, 212], [514, 186]],
      [[484, 266], [484, 276.5], [466, 285.5], [430, 290], [384, 291]]] },
    foot:[[...[...DECK_IN].reverse(), [640, 276.5], [600, 276.5], [600, 300], [600, 324]],
      [...[...DECK_IN].reverse(), [680, 276.5], [760, 276.5], [860, 276.5], [950, 276.5]],
      [...[...DECK_IN].reverse(), [CUT, 272], [CUT, 258.6], [631.5, 258.6], [631.5, 215], [631.5, 199]]] },
};
// in from the west edge along Riverside Rd, by the streets to the job's lane, and in to the kerb
const approach = lane => pullIn([[-68, 134.5], ...trip({ x:60, y:134.5, h:0 }, locate(...lane))], 2.2);
const ROLES = ['the leader', 'the lookout', 'the muscle', 'the driver'];

// ---- the run: joining it, turning round for it ----
// Points from a car facing f onto the getaway run E, if it is already on one of its legs (or on the road before one),
// facing the same way; null otherwise.
function joinRun(f, E) {
  let best = null; const c = Math.cos(f.h), s = Math.sin(f.h);
  for (let i = 1; i < E.length; i++) {
    const [ax, ay] = E[i - 1], [bx, by] = E[i], L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    if (ux * c + uy * s < 0.8) continue;
    const t = (f.x - ax) * ux + (f.y - ay) * uy, d = Math.abs((f.x - ax) * uy - (f.y - ay) * ux);
    if (d > 3.5 || t > L - 2 || t < -60) continue;
    if (!best || d < best.d) best = { i, t, d, ux, uy, L };
  }
  if (!best) return null;
  const { i, t, ux, uy, L } = best, a = E[i - 1], k = t + 6;
  return [[f.x, f.y], ...(k <= 0 ? [a] : k < L ? [[a[0] + ux * k, a[1] + uy * k]] : []), ...E.slice(i)];
}
// round in the road: over to the far side, then back into the lane at ly the other way
const uturn = (f, ly) => { const d = Math.cos(f.h) >= 0 ? 1 : -1, far = ly < 267 ? 271.6 : 262.4;
  return [[f.x + d * 4, f.y + (far - f.y) * 0.3], [f.x + d * 9, far], [f.x + d * 12, 267], [f.x + d * 9, ly], [f.x + d * 3, ly]]; };
// the police follow the run only as far as the town's west end, where they give up
const policeRun = E => [...E.slice(0, -1), [6, E[E.length - 1][1]]];
function pursuitFrom(f) {
  const E = policeRun(incident.job.escape), j = joinRun(f, E);
  if (j) return j;
  if (Math.abs(f.y - 267) < 8) {   // on the coast road, facing the wrong way: round, then after it
    const u = uturn(f, 263.5), e = u[u.length - 1], k = joinRun({ x:e[0], y:e[1], h:f.h + Math.PI }, E);
    if (k) return [[f.x, f.y], ...u, ...k.slice(1)];
  }
  return null;
}

// ---- the crew ----
const CREW_NAMES = ['R. Vance', 'M. Doyle', 'S. Kerr', 'J. Pike', 'T. Rourke', 'L. Marsh', 'D. Crane', 'K. Stone', 'B. Hale', 'C. Ward', 'E. Finch', 'N. Royce', 'P. Quill', 'V. Locke'];
let crewSeq = 0;
class Crook extends Person {
  constructor(job, k, at, h, role) {
    super({ look:'thief', id:CREW_NAMES[crewSeq++ % CREW_NAMES.length], job, k, role, x:at[0], y:at[1], h, speed:2.0, state:'working', trail:[] });
    incident.crew.push(this);
  }
  update(dt) { super.update(dt); trace(this); }
  // to a hold, and wait there: the incident decides what next
  hold() {
    if (incident.givingUp) { this.surrender(); return; }
    const H = this.job.holds[this.k % this.job.holds.length];
    this.state = 'holding'; this.atHold = false;
    this.walk(this.job.way([this.x, this.y], H.at), H.label).face(H.h).then(p => { p.atHold = true; p.idle(); });
  }
  idle() { this.wait(1.5).then(p => p.idle()); }
  runFor(car) {
    reset(this); this.state = 'running'; this.stance = null; this.atHold = false; this.speed = rand(3.3, 3.7);
    this.walk(this.job.way([this.x, this.y], car.door(this.k)), 'running for the car').then(p => p.board(car));
  }
  // into the car: out of the town's people (a car brakes for whoever stands in the road) until they get out again
  board(car) { this.state = 'aboard'; car.aboard.push(this); const i = sim.people.indexOf(this); if (i >= 0) sim.people.splice(i, 1); for (const g of this.groups) g.removeFromParent(); hooks.handOff(this, car); }
  alight(car, at) {
    car.aboard.splice(car.aboard.indexOf(this), 1); Object.assign(this, { state:'out', x:at[0], y:at[1], h:car.front.h + S, lz:undefined, steps:[], carrying:null });
    sim.people.push(this); for (const g of this.groups) scene.add(g); this.place();
  }
  surrender(spot) {
    reset(this); this.state = 'surrendering'; this.stance = 'hands'; this.atHold = false; this.speed = 1.6; this.carrying = null;
    spot ??= this.job.giveUp[incident.outN++ % this.job.giveUp.length];
    this.walk(this.job.way([this.x, this.y], spot), 'coming out with hands up').then(p => p.giveUpHere());
  }
  giveUpHere() { reset(this); this.state = 'surrendered'; this.stance = 'hands'; this.v = 0; this.label = 'hands up · giving up'; this.idle(); }
  flee(path) { reset(this); this.state = 'fleeing'; this.stance = null; this.atHold = false; this.speed = rand(3.0, 3.4); this.walk(path, 'running from the police').then(p => incident.escaped(p)); }
  hit() { reset(this); this.state = 'down'; this.down = true; this.stance = null; this.atHold = false; this.carrying = null; this.v = 0; this.wait(1e6, 'hit · down'); }
  cuff() { reset(this); this.state = 'cuffed'; this.stance = null; this.v = 0; this.wait(1e6, 'under arrest'); }
  info() {
    if (!this.wanted) return { kind:'Pedestrian', title:'Stranger', status:this.status(), rows:[['Street', streetAt(this.x, this.y)], ['Wearing', 'dark clothes and gloves'], ['Seen since', clock(this.t0)]] };
    const where = inBank(this) ? 'inside Harbour Bank' : inShop([this.x, this.y]) ? 'inside Corner Market' : onDeck([this.x, this.y]) ? 'on the terminal\'s deck' : streetAt(this.x, this.y);
    const word = { working:'inside', holding:'inside', running:'running', aboard:'in the car', out:'out of the car', surrendering:'giving up', surrendered:'giving up', fleeing:'on the run', down:'hit', cuffed:'under arrest' }[this.state] ?? '';
    return { kind:`Suspect · ${word}`, title:this.id, status:this.status(),
      rows:[['Wanted for', this.job.what], ['Role', this.role], ['Carrying', this.bag ?? 'nothing'], ['Where', where], ['Arrested by', this.collarBy?.id.replace('Officer ', '') ?? '—']] };
  }
}

// ---- the police ----
const CREWS = { 'POL-1':['D. Kowalski', 'R. Haddad'], 'POL-2':['A. Mensah', 'T. Lund'], 'POL-3':['S. Brennan', 'I. Novak'] };
class Officer extends Person {
  constructor(car, k) {
    const d = car.door(k);
    super({ look:'police', id:`Officer ${CREWS[car.id][k]}`, x:d[0], y:d[1], h:car.front.h + S, speed:3.6, car, k, mode:'idle', trail:[] });
    car.crew--;
  }
  update(dt) { super.update(dt); trace(this); }
  run(st, dt) { return st.do === 'chase' ? this.chaseStep(dt) : super.run(st, dt); }
  busy() { return ['arrest', 'escort', 'chase', 'back'].includes(this.mode); }
  toPost(P) {
    this.post = P; this.mode = 'post'; this.inPlace = false;
    this.walk([...P.via, P.at], `taking position at ${P.says}`).face(P.h).then(p => { p.inPlace = true; p.stance = 'aim'; p.label = `covering ${P.says}`; p.idle(); });
  }
  hold(h, label) { this.mode = 'idle'; this.stance = 'aim'; this.face(h); this.label = label; this.idle(); }
  idle() { this.wait(1.5).then(p => p.idle()); }
  // the way to a point: from a post round the side, back along the way it came first; at the scene by the job's way
  // in and out; elsewhere straight there
  wayTo(b) {
    const pre = this.inPlace && this.post?.via.length ? [...this.post.via].reverse() : [], from = pre.length ? pre[pre.length - 1] : [this.x, this.y];
    const J = incident.job, near = this.post && Math.hypot(b[0] - J.focus[0], b[1] - J.focus[1]) < 40;
    return [...pre, ...(near ? J.way(from, b) : [b])];
  }
  homeWay() { const door = this.car.door(this.k); return this.chased ? [...backAlong(this.trail), door] : this.wayTo(door); }
  // after someone on the run: along their trail, straight at them once close
  chase(t) {
    reset(this); Object.assign(this, { mode:'chase', chased:true, target:t, inPlace:false, stance:null, speed:rand(4.1, 4.5), chaseSt:null });
    let i = 0; t.trail.forEach((q, j) => { if (Math.hypot(q[0] - this.x, q[1] - this.y) < Math.hypot(t.trail[i][0] - this.x, t.trail[i][1] - this.y)) i = j; }); this.ti = i;
    this.steps.push({ do:'chase' });
  }
  chaseStep(dt) {
    const t = this.target;
    if (!t || t.state !== 'fleeing') { this.standDown(); return true; }
    const d = dist(t, this);
    if (d < 1.1) { this.collar(t); return true; }
    const tr = t.trail;
    while (this.ti < tr.length - 1 && Math.hypot(tr[this.ti][0] - this.x, tr[this.ti][1] - this.y) < 1.4) this.ti++;
    // close, with no wall between: straight at them
    const open = zone([t.x, t.y]) === zone([this.x, this.y]) && inShop([t.x, t.y]) === inShop([this.x, this.y]) && onDeck([t.x, t.y]) === onDeck([this.x, this.y]);
    const to = d < 7 && open ? (t.lz === undefined ? [t.x, t.y] : [t.x, t.y, t.lz]) : tr[this.ti];
    if (!this.chaseSt || this.chaseSt.to !== to) this.chaseSt = { do:'walk', to, near:0.05 };
    super.run(this.chaseSt, dt); this.label = `chasing ${t.id}`;
    return false;
  }
  // to someone who has given up (or is down), then the handcuffs
  arrest(t) {
    t.collarBy = this; reset(this); const w = this.wayTo([t.x, t.y]);
    Object.assign(this, { mode:'arrest', target:t, inPlace:false, stance:'aim' });
    const last = w[w.length - 1], prev = w.length > 1 ? w[w.length - 2] : [this.x, this.y], L = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1, k = Math.min(0.9, L) / L;
    w[w.length - 1] = [last[0] - (last[0] - prev[0]) * k, last[1] - (last[1] - prev[1]) * k, ...last.slice(2)];
    this.walk(w, `going to arrest ${t.id}`).then(p => p.collar(t));
  }
  collar(t) {
    t.collarBy = this; t.cuff(); reset(this); const w = this.homeWay();
    Object.assign(this, { mode:'escort', target:t, stance:null, inPlace:false });
    this.face(Math.atan2(t.y - this.y, t.x - this.x)).wait(1.6, `handcuffing ${t.id}`)
      .then(p => { t.down = false; t.follow = p; t.label = `under arrest · walked to ${p.car.id}`; p.speed = 2.2; })
      .walk(w, `walking ${t.id} to ${this.car.id}`).wait(0.8, `putting ${t.id} in ${this.car.id}`)
      .then(p => { incident.jailed(t, p); p.board(); });
  }
  standDown(hurry = false) {
    reset(this); const w = this.homeWay();
    Object.assign(this, { mode:'back', stance:null, inPlace:false, speed:hurry ? 4.2 : this.chased ? 3.2 : 2.6 });
    this.walk(w, hurry ? 'running back to the car' : 'walking back to the car').then(p => p.board());
  }
  board() { this.car.crew++; this.remove(); }
  info() {
    return { kind:'Police officer', title:this.id, status:this.status(),
      rows:[['Car', this.car.id], ['Post', this.post?.says ?? '—'], ['Street', inBank(this) ? 'inside Harbour Bank' : inShop([this.x, this.y]) ? 'inside Corner Market' : streetAt(this.x, this.y)], ['Arrests by the car', String(this.car.arrests)]] };
  }
}

// A police car: parked nose-west in the yard beside the station until a call, then out with its lights on, two
// officers in it, by the streets to the kerb at the scene (or to a roadblock, or after a getaway car); home again by
// the streets to the yard's gate, and into the westmost free bay, the cars filling the row from the west as they
// come back.
const BAYS_X = [229, 239, 249];
export class PoliceCar extends Car {
  constructor(id, x) {
    super({ kind:'police', role:'police', id, proto:PROTO.police, len:4.6, vmax:17, v:0, path:new Path([[x + 6, 184], [x, 184]]) });
    Object.assign(this, { state:'in', crew:2, arrests:0, calls:0, bay:x, task:'' });
    this.barL = this.group.getObjectByName('barL'); this.barR = this.group.getObjectByName('barR');
    this.s = this.path.length; this.park(); this.place();
  }
  park() { this.stops = [{ s:this.path.length, name:'the police yard', label:'in the yard', release:() => false }]; this.si = 0; this.at = null; }
  drive(pts, name, arrive) {
    this.path = new Path([[this.front.x, this.front.y], ...pts], 5); this.s = 0; this.si = 0; this.at = null;
    this.stops = [{ s:this.path.length, name, label:name, release:() => false, arrive }];
  }
  door(k) { const f = this.front, c = Math.cos(f.h), s = Math.sin(f.h); return [f.x - c * (1.6 + 1.3 * k) - s * 1.6, f.y - s * (1.6 + 1.3 * k) + c * 1.6]; }
  // the streets to a lane point: out of the yard first (either way along Market St, whichever is shorter); out on the
  // coast road east of town, to the end of the town's lane and on along the road
  lanes(lane) {
    const far = lane[0] > 422 && Math.abs(lane[1] - 267) < 6, L = far ? [418, lane[1], lane[2]] : lane, tail = far ? [[lane[0], lane[1]]] : [];
    const len = pts => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
    if (this.state === 'in') {
      const ways = [[[223, 201.5], { x:223, y:201.5, h:Math.PI }], [[223, 208.5], { x:226, y:208.5, h:0 }]].map(([b, f]) => ({ pre:[[223, 184], b], pts:trip(f, locate(...L)) })).filter(o => o.pts);
      const o = ways.sort((p, q) => len(p.pts) - len(q.pts))[0];
      return [...o.pre, ...o.pts, ...tail];
    }
    const f = this.front; return [...(trip({ x:f.x, y:f.y, h:f.h }, locate(...L)) ?? []), ...tail];
  }
  toScene(job, k) {
    this.posts = job.posts[k]; this.task = job.name; this.calls++;
    const pts = pullIn(this.lanes(job.police[k]), 2.2); this.state = 'out';
    this.drive(pts, job.name, () => { this.state = 'scene'; this.parked = true; incident.onScene(this); });
  }
  toBlock(Bk) {
    this.task = 'a roadblock'; this.calls++;
    const pts = [...this.lanes(Bk.lane), ...Bk.swerve]; this.state = 'out';
    this.drive(pts, 'the roadblock', () => { this.state = 'block'; incident.blockSet(this); });
  }
  chase() { const pts = pursuitFrom(this.front); if (pts) this.pursue(pts); else this.goHome(); }
  pursue(pts) { this.state = 'pursuit'; this.parked = false; this.task = 'the getaway car'; this.drive(pts.slice(1), 'after the getaway car', () => { this.state = 'gaveup'; }); }
  // on a chase: keep a car's length behind the getaway car; on a call or a chase, look past the traffic (it pulls over)
  room() {
    const g = incident.car; if (this.state !== 'pursuit' || !g || g.state === 'gone') return Infinity;
    const s = this.path.nearest(g.front.x, g.front.y), a = this.path.at(s);
    return Math.hypot(a.x - g.front.x, a.y - g.front.y) > 3 || s < this.s ? Infinity : s - g.len - this.s - 4;
  }
  // lights on: quicker, and round corners faster than traffic
  limit() { const f = this.front, on = this.state === 'out' || this.state === 'pursuit';
    return Math.min(Math.hypot(f.x - RAB.x, f.y - RAB.y) < 22 ? (on ? 10 : 7) : on ? 20 : this.vmax, bendLimit(this.path, this.s, on ? 9 : 6.5)); }
  lookPast(o) { return (this.state === 'pursuit' || this.state === 'out') && o.kind !== 'police' && o !== incident.car; }
  goHome() {
    const f = this.front, c = Math.cos(f.h), s = Math.sin(f.h), pts = [];
    let at = { x:f.x + c * 7, y:f.y + s * 7, h:f.h };
    // out on the coast road beyond the town's ends: along it back into town, turning round first if facing away
    if ((at.x < 58 || at.x > 424) && Math.abs(at.y - 267) < 9) {
      const west = at.x < 58, h = west ? 0 : Math.PI, ly = west ? 270.5 : 263.5;
      if (Math.cos(f.h - h) < 0.3) pts.push(...uturn(f, ly));
      at = { x:west ? 62 : 424, y:ly, h }; pts.push([at.x, at.y]);
    } else if (this.parked && !laneClear(this, at.x, at.y, f.h)) return;   // pulling out from the kerb once nothing is coming
    this.state = 'back'; this.parked = false; this.task = 'the station';
    this.drive([...pts, ...(trip(at, locate(263, 201.5, Math.PI)) ?? []), [257, 201.5], [257, 191]], 'the police yard', () => this.atGate());
  }
  atGate() {
    const taken = incident.cars.filter(c => c !== this && (c.state === 'in' || c.state === 'parking')).map(c => c.bay);
    this.bay = BAYS_X.find(x => !taken.includes(x)) ?? this.bay; this.state = 'parking';
    this.drive([[257, 184], [this.bay, 184]], 'the police yard', () => this.home());
  }
  // stay where it is (its path ends here), whatever the car ahead does next
  halt() { const f = this.front, c = Math.cos(f.h), s = Math.sin(f.h); this.path = new Path([[f.x - c * 6, f.y - s * 6], [f.x, f.y]]); this.s = this.path.length; this.park(); this.stops[0].label = this.status(); }
  home() { const x = this.bay; this.state = 'in'; this.task = ''; this.path = new Path([[x + 6, 184], [x, 184]]); this.s = this.path.length; this.park(); this.place(); }
  update(dt) {
    const on = ['out', 'scene', 'pursuit', 'block', 'stopped', 'gaveup'].includes(this.state), ph = sim.t % 0.5 < 0.25;
    glow(this.barL, on && ph); glow(this.barR, on && !ph);
    // a chase ends behind the getaway car once it has stopped: out they get
    // (or behind another police car that has)
    const g = incident.car;
    if (this.state === 'pursuit' && g?.state === 'stopped' && this.v < 0.2 && dist(this.front, g.front) < 40) { this.state = 'stopped'; this.halt(); incident.onStop(this); }
    // called back to give chase: away once both are in
    if (this.recall && this.crew === 2) { this.recall = false; this.chase(); }
    // home once it is over and both officers are in
    if (incident.phase === 'done' && this.crew === 2 && ['scene', 'block', 'stopped', 'gaveup', 'pursuit'].includes(this.state)) this.goHome();
    super.update(dt);
  }
  status() {
    return { in:'in the yard', out:`on the way to ${this.task}`, scene:this.crew < 2 ? `at ${this.task} · ${2 - this.crew} officers out` : `at ${this.task}`,
      block:'across the road · a roadblock', pursuit:`chasing the getaway car · ${kmh(this.v)}`, stopped:'stopped behind the getaway car', gaveup:'lost the getaway car',
      back:'returning to the station', parking:'parking in the yard' }[this.state];
  }
  info() {
    return { kind:'Police car', title:this.id, status:this.status(),
      rows:[['Crew', CREWS[this.id].join(', ')], ['Street', streetAt(this.front.x, this.front.y)], ['Lights', this.state === 'in' || this.state === 'back' || this.state === 'parking' ? 'off' : 'flashing'],
        ['Speed', kmh(this.v)], ['Call-outs', String(this.calls)], ['Arrests', String(this.arrests)]] };
  }
}

// The crew's car: dark, plated like any other, in from the west edge and parked at the kerb, then away along the job's
// escape run, through the traffic, with the police after it.
class Getaway extends Car {
  constructor(job) {
    super({ kind:'car', role:'getaway', van:job.key === 'port', tone:'k', vmax:15, v:12, path:new Path(job.approach?.() ?? approach(job.lane), 5) });
    Object.assign(this, { job, state:'coming', aboard:[] });
    this.stops = [{ s:this.path.length, name:job.name, label:'parked · engine running', release:() => false, arrive:() => { this.state = 'waiting'; this.parked = true; incident.arrived(this); } }];
  }
  door(k) { const f = this.front, c = Math.cos(f.h), s = Math.sin(f.h), b = 1.0 + 1.4 * (k % 2) + 0.5 * (k >> 1); return [f.x - c * b - s * (1.6 + 0.4 * (k >> 1)), f.y - s * b + c * (1.6 + 0.4 * (k >> 1))]; }
  driverDoor() { const f = this.front, c = Math.cos(f.h), s = Math.sin(f.h); return [f.x - c * 1.3 + s * 1.6, f.y - s * 1.3 - c * 1.6]; }
  flee(alone) {
    Object.assign(this, { state:'fleeing', parked:false, alone, s:0, si:0, at:null, stops:[], path:new Path(this.job.escape, 6), vmax:alone || incident.end === 'escape' ? 21 : 18 });
    if (!alone && incident.end === 'bail') this.stops.push({ s:this.path.nearest(...this.job.bail.at), name:'abandoned', label:'abandoned', release:() => false, arrive:() => { this.state = 'stopped'; incident.bailOut(); } });
  }
  lookPast() { return this.state === 'fleeing'; }
  update(dt) {
    // a roadblock across the run ahead: if it is in place in time, the car stops short of it; if not, it slips past
    const bc = incident.blockCar, bp = this.job.block.swerve[this.job.block.swerve.length - 1];
    if (this.state === 'fleeing' && !this.alone && bc && !this.blockSeen) {
      const sb = this.path.nearest(bp[0], bp[1]) - 11;
      if (this.s > sb - 32) { this.blockSeen = true;
        if (bc.state === 'block') this.stops.push({ s:sb, name:'the roadblock', label:'stopped at the roadblock', release:() => false, arrive:() => { this.state = 'stopped'; incident.atBlock(); } });
        else { incident.end = 'escape'; this.vmax = 21; incident.note('the getaway car got past before the roadblock was set'); } }
    }
    super.update(dt);
  }
  remove() { super.remove(); const was = this.state; this.state = 'gone'; if (was === 'fleeing') incident.carGone(this); }
  status() {
    return { coming:'driving into town', waiting:`parked outside ${this.job.name} · engine running`, loading:'the crew running for it', fleeing:`racing away · ${kmh(this.v)}`,
      stopped:this.blockSeen && incident.end === 'roadblock' ? 'stopped at the roadblock' : 'abandoned', abandoned:'abandoned · its driver under arrest', towed:`driven away by the police · ${kmh(this.v)}`, gone:'gone' }[this.state];
  }
  info() {
    if (!this.wanted) return { kind:`${this.van ? 'Van' : 'Car'} · parked`, title:this.id, status:this.state === 'coming' ? 'driving into town' : 'parked · engine running', rows:[['Street', streetAt(this.front.x, this.front.y)], ['Speed', kmh(this.v)]] };
    const chasers = incident.cars.filter(c => c.state === 'pursuit').map(c => c.id);
    return { kind:`Getaway ${this.van ? 'van' : 'car'}`, title:this.id, status:this.status(),
      rows:[['Wanted for', this.job.what], ['In it', this.state === 'fleeing' ? `the driver${this.aboard.length ? ` and ${this.aboard.length} more` : ''}` : this.state === 'waiting' ? 'the driver' : 'nobody'],
        ['Street', streetAt(this.front.x, this.front.y)], ['Speed', kmh(this.v)], ['Chased by', chasers.join(', ') || '—'], ['Above', incident.heli.status()]],
      actions:[['Follow POL-AIR', () => hooks.track(incident.heli)]] };
  }
}

// ---- POL-AIR ----
// On the pad on the station roof until a call: the rotor spins up, it lifts off and flies to the scene at about
// 120 km/h, circles it at 40 m, follows a getaway car or whoever is running, and by night lights them with its
// searchlight. Home and down onto the pad once it is over.
const PAD = [203.5, 178, 8.55], X1 = new THREE.Vector3(1, 0, 0);
class Heli {
  constructor() {
    Object.assign(this, { kind:'heli', id:'POL-AIR', x:PAD[0], y:PAD[1], z:PAD[2], h:S, vx:0, vy:0, spin:0, state:'pad', flights:0, th:0, pick:[0, 0, 1.6], pitch:0, roll:0 });
    this.group = buildHeli(); this.group.rotation.order = 'YXZ'; this.group.userData.entity = this; this.groups = [this.group];
    this.rotor = this.group.getObjectByName('rotor'); this.tail = this.group.getObjectByName('tailRotor');
    // the searchlight: a cone of live hairlines from under the nose, and a ring where it falls
    const cone = new Part(), ring = new Part(), n = 12;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      if (i % 2 === 0) cone.seg('live', W(0, 0, 0), W(1, Math.sin(a), Math.cos(a)));
      cone.seg('live', W(1, Math.sin(a), Math.cos(a)), W(1, Math.sin(b), Math.cos(b))); ring.seg('live', W(Math.cos(a), Math.sin(a), 0), W(Math.cos(b), Math.sin(b), 0)); }
    this.beam = cone.build('beam'); this.spot = ring.build('spot'); this.beam.visible = this.spot.visible = false;
    scene.add(this.group, this.beam, this.spot); this.place();
  }
  scramble() { if (this.state === 'pad') { this.state = 'start'; this.flights++; } }
  update(dt) {
    const T = incident.heliTarget();
    this.spin = clamp(this.spin + (this.state === 'pad' ? -dt / 5 : dt / 3), 0, 1);
    this.rotor.rotation.y -= this.spin * 36 * dt; this.tail.rotation.z += this.spin * 60 * dt;
    let gx = this.x, gy = this.y, gz = this.z, still = false;
    const ground = T ? (T.z ?? zAt(T.x, T.y)) : 0;
    switch (this.state) {
      case 'start': still = true; if (this.spin >= 1) this.state = 'climb'; break;
      case 'climb': still = true; gz = PAD[2] + 30; if (this.z > gz - 2) this.state = T ? 'fly' : 'home'; break;
      case 'fly': case 'orbit': case 'track':
        if (!T) { this.state = 'home'; break; }
        gz = ground + 40;
        if (T.moving) { gx = T.x + T.vx * 1.5; gy = T.y + T.vy * 1.5; this.state = 'track'; }
        else { const r = 42; this.th += dt * 13 / r; gx = T.x + r * Math.cos(this.th); gy = T.y + r * Math.sin(this.th); this.state = Math.hypot(T.x - this.x, T.y - this.y) < r + 20 ? 'orbit' : 'fly'; }
        break;
      case 'home': gx = PAD[0]; gy = PAD[1]; gz = PAD[2] + 22; if (Math.hypot(gx - this.x, gy - this.y) < 1.5 && Math.hypot(this.vx, this.vy) < 1) this.state = 'land'; break;
      case 'land': still = true; gz = PAD[2]; if (this.z - PAD[2] < 0.03) { this.z = PAD[2]; this.state = 'pad'; } break;
    }
    if (this.state !== 'pad') {
      // steer for the goal, slowing as it nears; climb and sink no faster than a few metres a second
      const dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy), want = still ? 0 : Math.min(34, Math.sqrt(2 * 4 * d)), tvx = d > 0.01 ? dx / d * want : 0, tvy = d > 0.01 ? dy / d * want : 0;
      const ax = clamp(tvx - this.vx, -7 * dt, 7 * dt), ay = clamp(tvy - this.vy, -7 * dt, 7 * dt);
      this.vx += ax; this.vy += ay; this.x += this.vx * dt; this.y += this.vy * dt;
      this.z += clamp(gz - this.z, -4 * dt, (this.state === 'land' ? 2 : 6) * dt) * (this.state === 'land' ? Math.min(1, (this.z - PAD[2]) * 0.6 + 0.08) : 1);
      const sp = Math.hypot(this.vx, this.vy), e = sp > 3 ? wrap(Math.atan2(this.vy, this.vx) - this.h) : 0, turn = clamp(e, -1.1 * dt, 1.1 * dt);
      this.h += turn;
      // nose down as it speeds up, banked into the turn
      const c = Math.cos(this.h), s = Math.sin(this.h), along = (ax * c + ay * s) / Math.max(dt, 1e-6), across = (ay * c - ax * s) / Math.max(dt, 1e-6);
      this.pitch += (-clamp(sp / 34 * 0.12 + along * 0.02, -0.08, 0.22) - this.pitch) * Math.min(1, dt * 3);
      this.roll += (clamp(turn / Math.max(dt, 1e-6) * 0.35 + across * 0.015, -0.35, 0.35) - this.roll) * Math.min(1, dt * 3);
    } else { this.vx = this.vy = 0; this.pitch = this.roll = 0; }
    this.place(); this.light(T);
  }
  place() { pose(this.group, this.x, this.y, this.h, this.z); this.group.rotation.z = this.pitch; this.group.rotation.x = this.roll; }
  light(T) {
    const on = !!T && night() > 0.35 && ['fly', 'orbit', 'track'].includes(this.state);
    this.beam.visible = this.spot.visible = on; if (!on) return;
    const a = W(this.x + Math.cos(this.h) * 1.9, this.y + Math.sin(this.h) * 1.9, this.z + 0.2), b = W(T.x, T.y, (T.z ?? zAt(T.x, T.y)) + 0.08), d = b.clone().sub(a), L = d.length();
    this.beam.position.copy(a); this.beam.quaternion.setFromUnitVectors(X1, d.divideScalar(L)); this.beam.scale.set(L, 3.2, 3.2);
    this.spot.position.copy(b); this.spot.scale.setScalar(3.2);
  }
  status() {
    const T = incident.heliTarget();
    return { pad:'on the station roof', start:'starting up', climb:'lifting off', fly:`flying to ${incident.job?.name ?? 'the call'}`, orbit:`circling ${incident.job?.name ?? 'the scene'}`,
      track:`following ${T?.ent?.isPerson ? T.ent.id : 'the getaway car'}`, home:'flying back to the station', land:'landing on the roof' }[this.state];
  }
  info() {
    return { kind:'Police helicopter', title:'POL-AIR', status:this.status(),
      rows:[['Crew', 'C. Rowe, pilot · N. Achebe, observer'], ['Height', this.state === 'pad' ? 'on the roof' : `${Math.max(0, Math.round(this.z - zAt(this.x, this.y)))} m`], ['Speed', kmh(Math.hypot(this.vx, this.vy))],
        ['Searchlight', this.beam.visible ? 'on' : 'off'], ['Base', 'the police station roof'], ['Flights', String(this.flights)]] };
  }
  readout() { return `pol-air · ${this.status()}`; }
  route() { const T = incident.heliTarget(); return T && this.state !== 'pad' ? { pts:[[this.x, this.y], [T.x, T.y]], next:[T.x, T.y] } : null; }
}

// ---- gunfire ----
// A shot is a short live streak flying from the muzzle to where it lands, and a flash at the muzzle. The police
// aim at the crew and now and then hit one; the crew's shots go wide.
const FX = (() => {
  const g = new THREE.Group(); g.name = 'gunfire';
  const streak = new Part().seg('live', W(0, 0, 0), W(1, 0, 0)).build('tracer'), flash = new Part().box(-0.11, -0.11, -0.11, 0.22, 0.22, 0.22).build('flash'); glow(flash, true);
  const pool = [], D = new THREE.Vector3();
  return {
    group:g,
    shot(a, b, hit) {
      let s = pool.find(q => q.life <= 0);
      if (!s) { if (pool.length < 16) { s = { t:streak.clone(), f:flash.clone(), life:0 }; g.add(s.t, s.f); pool.push(s); } else s = pool[0]; }
      const az = a.lz ?? zAt(a.x, a.y), bz = b.lz ?? zAt(b.x, b.y), c = Math.cos(a.h), sn = Math.sin(a.h), m = hit ? 0 : 1;
      s.A = W(a.x + c * 0.85, a.y + sn * 0.85, az + 1.32 * a.scale); s.B = W(b.x + rand(-1.4, 1.4) * m, b.y + rand(-1.4, 1.4) * m, bz + (hit ? 1.1 : rand(0.3, 2.4)));
      s.life = s.T = 0.18; s.f.position.copy(s.A); s.f.visible = s.t.visible = true;
    },
    update(dt) {
      for (const s of pool) {
        if (s.life <= 0) continue;
        if ((s.life -= dt) <= 0) { s.t.visible = s.f.visible = false; continue; }
        const k = 1 - s.life / s.T, L = D.subVectors(s.B, s.A).length(), seg = Math.min(2.6, L); D.divideScalar(L);
        s.t.position.copy(s.A).addScaledVector(D, (L - seg) * k); s.t.quaternion.setFromUnitVectors(X1, D); s.t.scale.set(seg, 1, 1);
        s.f.visible = s.T - s.life < 0.06;
      }
    },
  };
})();

// ---- the incident ----
export const incident = {
  phase:'quiet', next:85, job:null, plan:'', end:'', crew:[], car:null, cars:[], heli:null, blockCar:null, log:[], counts:{ bank:0, shop:0, port:0 }, force:null,
  how:'', vaultOpen:false, evacuated:false, loot:false, givingUp:false, standoffAt:0, shootEnd:0, dispatchAt:0, shots:0, jailedN:0, escapedN:0, outN:0,
  active() { return this.phase !== 'quiet' && this.phase !== 'casing'; },
  at(key) { return this.active() && this.job?.key === key; },
  note(s) { this.log.unshift(`${clock(sim.t)} · ${s}`); if (this.log.length > 3) this.log.length = 3; },
  // the third car, POL-AIR, the helipad and the gunfire: made after the rest of the town (a car's plate and paint come
  // from the town's random sequence)
  extend(station) {
    this.cars.push(new PoliceCar('POL-3', 249)); this.heli = new Heli();
    const p = new Part(); buildHelipad(p, PAD[0], PAD[1], PAD[2] + 0.02); station.add(p.build('helipad'));
    FX.group.traverse(o => { o.raycast = noop; }); scene.add(FX.group);
  },
  vehicles() { return [...this.cars, ...(this.heli ? [this.heli] : []), ...(this.car && this.car.state !== 'gone' && this.car.wanted ? [this.car] : [])]; },
  update(dt) {
    FX.update(dt); this.heli?.update(dt);
    if (this.phase === 'quiet' && sim.t >= this.next && this.heli && this.cars.every(c => c.state === 'in')) this.start();
    if (this.phase === 'alarm' && sim.t >= this.dispatchAt) this.dispatch();
    if (this.active()) this.direct();
    if (this.phase === 'done' && this.cars.every(c => c.state === 'in') && this.heli.state === 'pad' && !officers().length && this.crew.every(c => c.gone)) this.close();
    // the tellers keep the bank's hours
    const tellers = TELLERS();
    if (bank.open() && !this.at('bank')) for (let k = 0; k < 2; k++) if (!tellers.some(t => t.k === k)) new Teller(k).walk([BACK_IN], 'arriving for work');
    const v = this.vaultDoor; if (v) v.rotation.y += Math.max(-dt * 0.8, Math.min(dt * 0.8, (this.vaultOpen ? -1.7 : 0) - v.rotation.y));
  },
  start() {
    const f = this.force ?? {}; this.force = null;
    const ok = Object.values(JOBS).filter(j => j.ok()), job = JOBS[f.job] ?? JOBS[wpick(Object.fromEntries(ok.map(j => [j.key, j.weight])))];
    const plan = f.plan ?? wpick({ surrender:0.25, shootout:0.25, getaway:0.33, foot:0.17 }), end = f.end ?? wpick({ roadblock:0.4, bail:0.35, escape:0.25 });
    Object.assign(this, { phase:'casing', job, plan, end, crew:[], loot:false, givingUp:false, standoffAt:0, shootEnd:0, vaultOpen:false, evacuated:false, shots:0, jailedN:0, escapedN:0, outN:0,
      blockCar:null, broke:false, size:job.size() });
    this.car = new Getaway(job);
  },
  arrived(car) { for (let k = 0; k < this.size; k++) this.job.work(new Crook(this.job, k, car.door(k), car.front.h + S, ROLES[k]), k); },
  alarm(how) {
    if (this.phase !== 'casing') return;
    const J = this.job; this.phase = 'alarm'; this.how = how; sim.stats.robberies++; this.counts[J.key]++;
    this.note(`alarm at ${J.name} · ${how}`);
    for (const c of this.crew) c.wanted = true; this.car.wanted = true;
    if (J.key === 'bank') { bank.alarm = true; const inside = sim.people.filter(p => !(p instanceof Crook) && inBank(p)); inside.forEach((p, i) => evacuate(p, i)); this.evacuated = inside.length > 0; }
    if (J.key === 'shop') holdUp();
    this.dispatchAt = sim.t + (this.plan === 'getaway' ? rand(1, 4) : rand(3, 12));
    this.heli.scramble();
    // a roadblock goes out at once, ahead of where the car will run: the car first out of the yard
    if (this.plan === 'getaway' && this.end === 'roadblock') { this.blockCar = this.yardOrder()[0]; this.blockCar.toBlock(J.block); }
  },
  yardOrder() { return this.cars.filter(c => c.state === 'in').sort((a, b) => a.front.x - b.front.x); },
  dispatch() { this.phase = 'siege'; this.yardOrder().forEach((c, k) => c.toScene(this.job, k)); },
  // a car pulls up at the scene: its officers to their posts; the driver of the getaway car gives up (unless the crew
  // mean to run), and a crew who mean to go on foot break out
  onScene(car) {
    if (this.phase === 'done') return;
    if (this.car.state === 'fleeing' && !this.car.alone) { car.parked = false; car.chase(); return; }
    for (let k = 0; k < 2; k++) new Officer(car, k).toPost(car.posts[k]);
    if ((this.plan === 'surrender' || this.plan === 'shootout') && this.car.state === 'waiting') this.driverOut();
    if (this.plan === 'foot' && !this.broke) this.breakOut();
  },
  driverOut() {
    const car = this.car; car.state = 'abandoned';
    const w = new Crook(this.job, 3, car.driverDoor(), car.front.h - S, ROLES[3]); w.wanted = true; w.giveUpHere(); this.note('the getaway driver gave himself up');
  },
  breakOut() {
    this.broke = true; this.phase = 'chase'; this.note(`the crew broke out of ${this.job.name} on foot`);
    this.crew.filter(c => ['working', 'holding'].includes(c.state)).forEach((c, i) => { const path = this.job.foot[i % this.job.foot.length]; c.flee([...this.job.way([c.x, c.y], path[0]), ...path.slice(1)]); });
  },
  run() { this.car.state = 'loading'; this.note('the crew ran for the getaway car'); for (const c of this.crew) if (!c.gone && c.state !== 'aboard') c.runFor(this.car); },
  // all aboard and away: the police on the way go after it, those at the scene run back to their cars first
  away() {
    this.phase = 'chase'; this.car.flee(false);
    for (const c of this.cars) if (c.state === 'scene') { c.recall = true; for (const o of officers()) if (o.car === c) o.standDown(true); }
  },
  blockSet(car) {
    if (this.phase === 'done') return;
    for (let k = 0; k < 2; k++) { const o = new Officer(car, k); o.hold(car.front.h, 'at the roadblock'); }
    this.note(`${car.id} set a roadblock on ${streetAt(car.front.x, car.front.y)}`);
  },
  // the getaway car stopped at the roadblock: they get out with their hands up
  atBlock() {
    const car = this.car; [...car.aboard].forEach((c, i) => { c.alight(car, car.door(i)); c.giveUpHere(); });
    const w = new Crook(this.job, 3, car.driverDoor(), car.front.h - S, ROLES[3]); w.wanted = true; w.giveUpHere();
    this.note('the getaway car stopped at the roadblock');
  },
  // the getaway car left in the road: they scatter on foot
  bailOut() {
    const car = this.car, F = this.job.bail.flee, out = [...car.aboard];
    out.forEach((c, i) => { c.alight(car, car.door(i)); c.flee(F[i % F.length]); });
    const w = new Crook(this.job, 3, car.driverDoor(), car.front.h - S, ROLES[3]); w.wanted = true; w.flee(F[out.length % F.length]);
    this.note(`the crew left the getaway car on ${streetAt(car.front.x, car.front.y)} and ran`);
  },
  onStop(car) { if (this.phase !== 'done') for (let k = 0; k < 2; k++) { const o = new Officer(car, k); o.hold(car.front.h, 'out of the car'); } },
  // off the edge of the map: whoever is in it (the driver too) got away
  carGone(car) {
    for (const c of car.aboard) { c.gone = true; c.state = 'escaped'; }
    this.escapedN += car.aboard.length + 1; sim.stats.escapes += car.aboard.length + 1;
    this.note(car.alone ? 'the getaway driver got away' : `the getaway car got away with ${car.aboard.length + 1} aboard`); car.aboard = [];
  },
  sirens(r) { const [x, y] = this.job.focus; return this.cars.some(c => (c.state === 'out' || c.state === 'scene') && Math.hypot(c.front.x - x, c.front.y - y) < r); },
  posted() { return officers().filter(o => o.inPlace).length; },
  direct() {
    const J = this.job, car = this.car, live = this.crew.filter(c => !c.gone);
    // with the police outside, the crew keep their guns on the door
    for (const c of live) if (c.state === 'holding' && c.atHold) c.stance = this.phase === 'shootout' || this.phase === 'siege' && this.posted() ? 'aim' : null;
    // getaway: once they have it and hear the sirens (or have waited long enough), they run for the car
    if (this.plan === 'getaway' && car.state === 'waiting' && this.loot && (this.sirens(110) || sim.t > this.dispatchAt + 35)) this.run();
    if (car.state === 'loading' && live.every(c => c.state === 'aboard')) this.away();
    // foot: the driver hears the sirens and goes without them
    if (this.plan === 'foot' && car.state === 'waiting' && this.sirens(120)) { car.flee(true); this.note('the getaway driver drove off without the crew'); }
    // police cars still on their way when the getaway car runs: after it, as soon as they are on its road
    if (car.state === 'fleeing' && !car.alone) for (const c of this.cars) if (c.state === 'out' && c !== this.blockCar) { const pts = pursuitFrom(c.front); if (pts) c.pursue(pts); }
    if (this.phase === 'siege' && this.plan === 'surrender' && !this.standoffAt && this.posted() >= 3) this.standoffAt = sim.t + rand(8, 16);
    if (this.phase === 'siege' && this.plan === 'shootout' && !this.shootEnd && this.posted() && live.some(c => c.state === 'holding' && c.atHold)) {
      this.phase = 'shootout'; this.shootEnd = sim.t + rand(16, 28); this.note(`shots fired at ${J.name}`); }
    if (this.standoffAt && sim.t >= this.standoffAt) this.giveUp();
    if (this.phase === 'shootout') this.gunfight();
    this.assign();
    if (this.phase !== 'done' && live.every(c => c.state === 'cuffed') && ['gone', 'stopped', 'abandoned'].includes(car.state) && !car.aboard.length) this.finish();
  },
  // both sides fire; a hit on one of the crew puts him down; when none are left standing, or it has gone on long
  // enough, the rest give up
  gunfight() {
    const crooks = this.crew.filter(c => c.state === 'holding' && c.atHold), cops = officers().filter(o => o.inPlace && o.post?.front);
    for (const p of [...crooks, ...cops]) {
      p.nextShot ??= sim.t + rand(0.2, 1.4);
      if (sim.t < p.nextShot) continue;
      p.nextShot = sim.t + rand(0.5, 1.7);
      const foes = p instanceof Crook ? cops : crooks; if (!foes.length) continue;
      const t = foes[Math.floor(rng() * foes.length)], hit = p instanceof Officer && rng() < 0.08;
      p.stance = 'aim'; p.h = Math.atan2(t.y - p.y, t.x - p.x); FX.shot(p, t, hit); this.shots++;
      if (hit) { t.hit(); this.note(`${t.id} hit and down at ${this.job.name}`); }
    }
    if (!this.crew.some(c => c.state === 'holding' || c.state === 'working') || sim.t > this.shootEnd) { this.phase = 'siege'; this.giveUp(); }
  },
  giveUp() {
    if (this.givingUp) return; this.givingUp = true;
    this.crew.filter(c => c.state === 'holding' || c.state === 'working').forEach((c, i) => { reset(c); c.stance = null; c.wait(1 + i * 2.5, 'about to give up').then(p => p.surrender()); });
    this.note(`the crew at ${this.job.name} gave up`);
  },
  // officers free to act go to those who have given up or are down; each on the run gets a chaser (two if any spare)
  assign() {
    const free = () => officers().filter(o => !o.busy());
    if (this.phase !== 'shootout') for (const c of this.crew) {
      if (c.gone || c.collarBy || !['surrendered', 'down'].includes(c.state)) continue;
      const o = free().sort((a, b) => dist(a, c) - dist(b, c))[0]; if (!o) break;
      o.arrest(c);
    }
    for (const c of this.crew) {
      if (c.state !== 'fleeing') continue;
      const n = officers().filter(o => o.mode === 'chase' && o.target === c).length, pool = free();
      if (n >= 2 || !pool.length || n === 1 && this.crew.some(q => q.state === 'fleeing' && !officers().some(o => o.mode === 'chase' && o.target === q))) continue;
      pool.sort((a, b) => dist(a, c) - dist(b, c))[0].chase(c);
    }
  },
  jailed(c, o) { c.gone = true; c.remove(); this.jailedN++; sim.stats.arrests++; o.car.arrests++; },
  escaped(c) {
    c.gone = true; c.state = 'escaped'; c.remove(); this.escapedN++; sim.stats.escapes++; this.note(`${c.id} got away on foot`);
    for (const o of officers()) if (o.mode === 'chase' && o.target === c) o.standDown();
  },
  finish() {
    this.phase = 'done'; bank.alarm = false; letGo();
    // a getaway car left behind is driven away by the police, on along its run and off the map
    const car = this.car;
    if (car.state === 'stopped' || car.state === 'abandoned') {
      if (car.state === 'abandoned') Object.assign(car, { path:new Path(this.job.escape, 6), s:0 });
      Object.assign(car, { state:'towed', parked:false, si:0, at:null, stops:[], vmax:9 });
    }
    for (const o of officers()) if (!o.busy()) o.standDown();
  },
  close() {
    this.note(`${this.job.name} · ${this.jailedN} arrested${this.escapedN ? `, ${this.escapedN} got away` : ''}`);
    if (this.car && this.car.state !== 'gone') this.car.remove();   // the abandoned car is taken away
    Object.assign(this, { phase:'quiet', next:sim.t + rand(70, 260), crew:[], car:null, blockCar:null, vaultOpen:false });
  },
  // where POL-AIR should be: over the getaway car or whoever is running, otherwise circling the scene
  heliTarget() {
    if (!this.active() || this.phase === 'done' || !this.car) return null;
    const car = this.car;
    if (car.state === 'fleeing' && !car.alone) return { x:car.front.x, y:car.front.y, ent:car, moving:true, vx:Math.cos(car.front.h) * car.v, vy:Math.sin(car.front.h) * car.v };
    const r = this.crew.find(c => c.state === 'fleeing');
    if (r) return { x:r.x, y:r.y, z:r.lz, ent:r, moving:true, vx:Math.cos(r.h) * r.v, vy:Math.sin(r.h) * r.v };
    if (car.state === 'stopped') return { x:car.front.x, y:car.front.y, ent:car };
    return { x:this.job.focus[0], y:this.job.focus[1], z:this.job.key === 'port' ? PZ : undefined };
  },
  status() {
    const car = this.car;
    return { alarm:'alarm ringing · police on the way', siege:this.posted() >= 3 ? 'surrounded by police' : 'police arriving', shootout:'shots fired · police returning fire',
      chase:car?.state === 'fleeing' && !car.alone ? 'robbed · the getaway car chased' : 'robbed · suspects chased on foot', done:'police leaving' }[this.phase] ?? '';
  },
  crewText() {
    const n = (...s) => this.crew.filter(c => s.includes(c.state)).length, parts = [], car = this.car;
    if (n('working', 'holding')) parts.push(`${n('working', 'holding')} inside`);
    if (car && (car.state === 'waiting' || car.state === 'loading')) parts.push('1 in the car');
    if (car?.state === 'fleeing' && !car.alone) parts.push(`${car.aboard.length + 1} in the getaway car`);
    for (const [s, w] of [[['running'], 'running for the car'], [['fleeing'], 'on the run'], [['surrendering', 'surrendered'], 'giving up'], [['down'], 'down']]) if (n(...s)) parts.push(`${n(...s)} ${w}`);
    if (n('cuffed') + this.jailedN) parts.push(`${n('cuffed') + this.jailedN} arrested`);
    if (this.escapedN) parts.push(`${this.escapedN} got away`);
    return parts.join(' · ') || '—';
  },
  rows() {
    const out = this.cars.filter(c => c.state !== 'in').length;
    return [['Robbers', this.crewText()], ['Police', `${officers().length} officers · ${out} ${out === 1 ? 'car' : 'cars'}`], ['POL-AIR', this.heli.status()], ...(this.shots ? [['Shots fired', String(this.shots)]] : [])];
  },
  actions(key) {
    if (!this.at(key)) return [];
    const sus = this.crew.find(c => !c.gone && c.state !== 'aboard');
    return [['Follow POL-AIR', () => hooks.track(this.heli)], ...(sus ? [['A suspect', () => hooks.select(sus)]] : [])];
  },
  state() {
    if (!this.active()) return 'quiet';
    const J = this.job, car = this.car;
    return { alarm:`alarm at ${J.name} · cars getting ready`, siege:this.posted() >= 3 ? `${J.name} surrounded` : `responding to the alarm at ${J.name}`, shootout:`shots fired at ${J.name}`,
      chase:car.state === 'fleeing' && !car.alone ? `chasing the getaway car from ${J.name}` : `chasing suspects on foot from ${J.name}`, done:`returning from ${J.name}` }[this.phase];
  },
};
export const policeStation = {
  kind:'police', id:'Police Station', pick:[203.5, 192, 6],
  info() {
    const home = incident.cars.filter(c => c.state === 'in').length;
    return { kind:'Police', title:'Police Station', status:incident.state(),
      rows:[['Cars in the yard', `${home}/${incident.cars.length}`], ['POL-AIR', incident.heli?.status() ?? '—'], ['Officers out', String(officers().length)],
        ['Arrests', String(sim.stats.arrests)], ['Got away', String(sim.stats.escapes)], ...incident.log.map((l, i) => [i ? 'Before that' : 'Last call', l])],
      actions:incident.active() ? [['Follow POL-AIR', () => hooks.track(incident.heli)]] : [] };
  },
  readout() { return `police station · ${incident.state()}`; },
};
