import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { TOP, W } from '../kernel/iso';
import { Part, pose } from '../kernel/part';
import { Path, withHeights } from '../kernel/path';
import { DISH, LANE, OBS, OBS_ROAD, OBS_ROAD_PTS, ROAD_EAST, ROAD_PATH, landZ, offsetLine, roadZ } from '../land';
import { CAMERA, CENTRE, HOUSE, MAIN, PARK, PUBLIC, SOLAR, buildDish, buildDome, buildObservatory } from '../world/observatory';
import * as core from './core';
import * as people from './person';
import * as carsM from './cars';
import { weather } from './weather';
const { clock, hourAt, night, sim } = core as any, { Person } = people as any, { Car } = carsM as any;

// ---- Beacon Hill Observatory: what moves and who comes ----
// After dark, when the sky is clear, the domes open: the shutter slides up and over, the dome turns to face what the
// telescope is after and the telescope tips up to it, a new target every so often; at dawn, or when cloud or rain
// comes in, they close. The radio dish works day and night. Two astronomers walk over from the residence at dusk and
// sit at the main dome's desk until dawn; visitors drive up by day for the visitor centre and the planetarium, and in
// the evening to look through the public dome's telescope. Anything the town wants watched in the sky (hooks.skyTarget)
// is followed by every instrument at once.
const D2R = Math.PI / 180;
// [name, azimuth from north, altitude], degrees
const DEEP = [['the Andromeda Galaxy, M31', 62, 58], ['the Orion Nebula, M42', 160, 38], ['the Whirlpool Galaxy, M51', 330, 72], ['the Ring Nebula, M57', 290, 70],
  ['the Crab Nebula, M1', 140, 55], ['the globular cluster M13', 270, 62], ['a quasar, 3C 273', 230, 40], ['a supernova in NGC 4618', 20, 48], ['the Pleiades', 95, 64]];
const PLANETS = [['Saturn', 200, 32], ['Jupiter and its moons', 120, 46], ['the Moon', 150, 40], ['Mars', 250, 28]];
const RADIO = [['the hydrogen of the Milky Way', 10, 52], ['the pulsar PSR B0329+54', 350, 62], ['the quasar 3C 48', 110, 58], ['Cassiopeia A', 30, 70], ['the Sun', 170, 44], ['the galaxy Cygnus A', 60, 34]];
const SURVEY = Array.from({ length:12 }, (_, i) => [`survey field ${1201 + i}`, (i * 67) % 360, 35 + (i * 23) % 45]);
// the skill's frame turns from east toward south; a compass bearing runs from north
const toAz = (deg: number) => (deg - 90) * D2R, fromAz = (a: number) => ((a / D2R + 90) % 360 + 360) % 360;
const step = (cur: number, to: number, v: number, dt: number) => cur + Math.max(-v * dt, Math.min(v * dt, to - cur));
const turn = (cur: number, to: number, v: number, dt: number) => { const d = Math.atan2(Math.sin(to - cur), Math.cos(to - cur)); return cur + Math.max(-v * dt, Math.min(v * dt, d)); };
const clear = () => !weather.raining() && weather.fog() < 0.3 && weather.kind !== 'rain';

type Inst = { kind: string, id: string, g: THREE.Group, groups: THREE.Object3D[], pick: number[], x: number, y: number, z: number, az: number, alt: number, k: number, ti: number, tt: number, list: any[], [k: string]: any };

export function buildObservatorySys() {
  const w = buildObservatory(); scene.add(w.g);
  const Z = OBS.z;
  // ---- the domes ----
  const dome = (o: any, name: string, tube: number, kind: string, list: any[], rows: () => [string, string][]) => {
    const m = buildDome({ r:o.r, h:o.h, name, tube }); pose(m.g, o.x, o.y, 0, Z); scene.add(m.g);
    const ent: Inst = { kind, id:name, g:m.g, groups:[m.g], pick:[0, 0, o.h + o.r * 0.6], x:o.x, y:o.y, z:Z + o.h, az:0, alt:Math.PI / 2, k:0, ti:0, tt:0, list, m, rows, open:false,
      info() { return { kind:this.kindText, title:this.id, status:this.status(), rows:this.rows(), actions:this.actions?.() }; },
      readout() { return `${this.id} · ${this.status()}`.toLowerCase(); } } as any;
    m.g.userData.entity = ent; return ent;
  };
  const main = dome(MAIN, 'the Beacon Telescope', 10.5, 'observatory', DEEP, () => [['Telescope', 'a 4.2 m reflector on an alt-az mount'], ['Pointing', point(main)],
    ['Target', main.open ? main.target : '—'], ['Instrument', main.open ? 'the spectrograph' : 'parked'], ['At the desk', staffIn() ? 'Dr F. Hartley, Dr A. Quint' : 'nobody'], ['Dome', `${MAIN.r * 2} m, turns on its drum`]]);
  main.kindText = 'Observatory · main telescope'; main.actions = () => [['Look inside', () => hooks.lookInside(main)]];
  const pub = dome(PUBLIC, 'the Public Dome', 3.6, 'observatory', PLANETS, () => [['Telescope', 'a 0.6 m reflector for visitors'], ['Open to visitors', '19:30–23:00, clear nights'],
    ['Showing', pub.open ? pub.target : '—'], ['Looking through it', String(visitors.filter(v => v.at === 'dome').length)]]);
  pub.kindText = 'Observatory · public telescope';
  const cam = dome(CAMERA, 'the Survey Camera', 3.0, 'observatory', SURVEY, () => [['Telescope', 'a 1.0 m Schmidt camera'], ['Work', 'surveying the sky for asteroids'], ['Field', cam.open ? cam.target : '—'],
    ['Pictures tonight', String(cam.shots ?? 0)]]);
  cam.kindText = 'Observatory · survey camera';
  // the main dome opens up to its section: the drum cut low, the dome lifted off, the pier, the desk, the stair
  { const c = new Part(), r = MAIN.r, n = 32;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      const A = W(r * Math.cos(a), r * Math.sin(a), 0), B = W(r * Math.cos(b), r * Math.sin(b), 0), A2 = W(r * Math.cos(a), r * Math.sin(a), 1.2), B2 = W(r * Math.cos(b), r * Math.sin(b), 1.2);
      c.poly('body', [A, B, B2, A2]); c.seg('line', A2, B2).seg('detail', A, A2); }
    const cut = c.build('domeCut'); cut.visible = false; main.g.add(cut);
    const f = new Part(), G = TOP(0, 0, 0.02);
    f.box(-5.8, 2.6, 0, 3.4, 1.4, 0.8, 'n').fill2(TOP(-5.6, 2.8, 0.82), 0, 0, 3.0, 0.9, 'window', 0.01);
    for (let i = 0; i < 3; i++) f.box(-5.5 + i * 1.1, 2.7, 0.8, 0.8, 0.08, 0.55, 'w');
    // the stair up round the drum's wall to the floor the telescope stands on, with its handrail
    const rail: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) { const a = -0.4 + i * 0.22, z = i * (MAIN.h - 0.4) / 12; f.box(5.6 * Math.cos(a) - 0.4, 5.6 * Math.sin(a) - 0.3, z, 0.8, 0.6, 0.12, 'k');
      rail.push(W(5.1 * Math.cos(a), 5.1 * Math.sin(a), z + 1.0)); f.seg('line', W(5.1 * Math.cos(a), 5.1 * Math.sin(a), z + 0.12), rail[i]); }
    for (let i = 1; i < rail.length; i++) f.seg('line', rail[i - 1], rail[i]);
    f.draw(G, [-8.4, 0, 8.4, 0, 0, -8.4, 0, 8.4], 'detail', 0.01);
    const inside = f.build('domeInside'); inside.visible = false; main.g.add(inside);
    main.g.userData.peek = { shell:main.m.drum, cut, inside, box:[MAIN.x - MAIN.r, MAIN.x + MAIN.r, MAIN.y - MAIN.r, MAIN.y + MAIN.r], z:[Z, Z + 6] };
    main.peeked = (on: boolean) => { main.m.shell.visible = main.m.shutter.visible = !on; };
  }
  // ---- the radio dish ----
  const dm = buildDish(), dz = landZ(DISH.x, DISH.y); pose(dm.g, DISH.x, DISH.y, 0, dz); scene.add(dm.g);
  const dish: Inst = { kind:'observatory', id:'the Moor Dish', g:dm.g, groups:[dm.g], pick:[0, 0, 13], x:DISH.x, y:DISH.y, z:dz + 13, az:0, alt:0.8, k:1, ti:0, tt:0, list:RADIO,
    info() { return { kind:'Radio telescope · 22 m dish', title:this.id, status:this.status(), rows:[['Listening at', '1.42 GHz, the hydrogen line'], ['Target', this.target], ['Pointing', point(this)],
      ['Works', 'day and night, in any weather but a gale'], ['Control', 'the hut beside it']] }; },
    readout() { return `the moor dish · ${this.status()}`; } } as any;
  dm.g.userData.entity = dish;
  // ---- the rest of the summit: one entity a building, all resolved from the ground part ----
  const place = (id: string, kind: string, rows: () => [string, string][], status: () => string) => ({ kind:'observatory', id, groups:[w.ground], pick:[0, 0, 0],
    info() { return { kind, title:id, status:status(), rows:rows() }; }, readout() { return `${id} · ${status()}`.toLowerCase(); } });
  const centreOpen = () => { const h = hourAt(sim.t); return h >= 10 && h < 22; };
  const SHOWS = [11, 13, 15, 17, 20];
  const nextShow = () => { const h = hourAt(sim.t), n = SHOWS.find(s => s > h) ?? SHOWS[0]; return `${String(n).padStart(2, '0')}:00 · ${n >= 20 ? 'The Night Sky Tonight' : ['The Life of Stars', 'To the Edge of the Universe', 'Our Sun', 'Planets of the Solar System'][SHOWS.indexOf(n) % 4]}`; };
  const site = place('Beacon Hill Observatory', 'Observatory · on the summit of Beacon Hill', () => [['Sky', sky()], ['Domes open', String([main, pub, cam].filter(d => d.open).length + ' of 3')],
    ['Main telescope', main.open ? main.target : 'parked'], ['Radio dish', dish.target], ['Visitors on the hill', String(visitors.length)], ['Next planetarium show', nextShow()]],
    () => night() > 0.6 ? clear() ? 'observing · the domes open' : 'clouded out · the domes shut' : 'the domes shut for the day');
  const centre = place('the Visitor Centre', 'Visitor centre and planetarium', () => [['Open', '10:00–22:00'], ['Next show', nextShow()], ['Inside', String(visitors.filter(v => v.at === 'centre').length)],
    ['Café', centreOpen() ? 'open' : 'closed'], ['Planetarium', '11 m dome, 80 seats']], () => centreOpen() ? 'open' : 'closed');
  const solar = place('the Solar Tower', 'Solar telescope · a 16 m tower', () => [['Heliostat', 'two mirrors on the roof send the Sun down the tower'], ['Today', night() > 0.5 ? '—' : 'three groups of sunspots, a small flare'],
    ['Instrument', 'a spectrograph in the basement']], () => night() > 0.5 ? 'closed for the night' : clear() ? 'watching the Sun' : 'waiting for the cloud to clear');
  const house = place('the Residence', 'Astronomers’ residence and workshop', () => [['Rooms', '6'], ['In tonight', staffIn() ? 'at the telescope' : 'Dr F. Hartley, Dr A. Quint'], ['Workshop', 'mirror coating, the instruments']],
    () => staffIn() ? 'empty · everyone at the telescope' : 'quiet');
  const inBox = (x: number, y: number, b: number[]) => x > b[0] - 1 && x < b[1] + 1 && y > b[2] - 1 && y < b[3] + 1;
  (w.ground.userData as any).entity = { kind:'observatory', id:'Beacon Hill Observatory', groups:[w.ground],
    resolve(pt: THREE.Vector3) { const x = pt.x, y = pt.z;
      if (inBox(x, y, [CENTRE.px - 6, CENTRE.x1, CENTRE.y0, CENTRE.y1])) return centre;
      if (inBox(x, y, [SOLAR.x - 2.2, SOLAR.x + 2.2, SOLAR.y - 2.2, SOLAR.y + 2.2])) return solar;
      if (inBox(x, y, [HOUSE.x0, HOUSE.x1, HOUSE.y0, HOUSE.y1])) return house;
      site.pick = [x, y, pt.y]; return site; } };
  const sky = () => night() < 0.4 ? 'daylight' : !clear() ? weather.raining() ? 'rain · the domes shut' : 'cloud and fog' : 'dark and clear · seeing 0.7″';
  const point = (i: Inst) => `bearing ${Math.round(fromAz(i.az))}°, ${Math.round(i.alt / D2R)}° up`;

  // ---- the people ----
  const staff: any[] = [], visitors: any[] = [];
  const staffIn = () => staff.some(s => s.at === 'desk');
  const DOOR = [MAIN.x, MAIN.y + MAIN.r + 1.2], DESK = [[MAIN.x - 4.1, MAIN.y + 1.9], [MAIN.x - 2.9, MAIN.y + 1.9]], HOME = [1459, HOUSE.y1 + 0.6];
  class Astronomer extends Person {
    constructor(id: string, k: number) { super({ look:'staff', id, k, x:HOME[0] - k, y:HOME[1], h:-Math.PI / 2, speed:1.3, at:'home' }); this.hidden = true; }
    think() {
      const want = main.open || main.k > 0.02;
      if (want && this.at === 'home') { this.hidden = false; this.at = 'going'; this.walk([[1459, 30], [1447, 40], [DOOR[0], DOOR[1] + 1], DOOR, DESK[this.k]], 'walking over to the telescope').face(-Math.PI / 2).then((p: any) => { p.at = 'desk'; }); return; }
      if (!want && this.at === 'desk') { this.at = 'going'; this.walk([DOOR, [DOOR[0], DOOR[1] + 1], [1447, 40], [1459, 30], HOME], 'going back to the residence').then((p: any) => { p.at = 'home'; p.hidden = true; }); return; }
      this.wait(2, this.at === 'desk' ? `observing ${main.target}` : 'asleep at the residence');
    }
    info() { return { kind:'Astronomer · Beacon Hill', title:this.id, status:this.status(), rows:[['Telescope', 'the Beacon Telescope'], ['Tonight', main.open ? main.target : '—']] }; }
  }
  staff.push(new Astronomer('Dr F. Hartley', 0), new Astronomer('Dr A. Quint', 1));

  // visitors' cars: out of the Vale Road's tunnel under Long Edge, round to the turning, up the hill, into a bay; and
  // back down the same way and into the tunnel. A bay is taken from the moment a car sets out for it.
  const tun = ROAD_EAST.runs().find(r => r[0] === 'tunnel' && ROAD_PATH.at(r[1]).x > 1500)!, sIn = tun[1] + 18, sJ = ROAD_PATH.nearest(1492, 79);
  const lane = (s0: number, s1: number, side: number) => { const pts: number[][] = []; const d = Math.sign(s1 - s0); for (let s = s0; d * (s1 - s) > 0; s += d * 3) { const q = ROAD_PATH.at(s); pts.push([q.x - Math.sin(q.h) * side * LANE, q.y + Math.cos(q.h) * side * LANE]); } return pts; };
  const up = offsetLine(OBS_ROAD_PTS, 1.4).slice(1), down = offsetLine([...OBS_ROAD_PTS].reverse(), 1.4).slice(0, -1);
  const zOf = (x: number, y: number) => { if (Math.hypot(x - OBS.c[0], y - OBS.c[1]) < OBS.r - 1) return OBS.z;
    const s = OBS_ROAD.path.nearest(x, y), p = OBS_ROAD.path.at(s); return Math.hypot(p.x - x, p.y - y) < 4 && s > 3 ? OBS_ROAD.zAt(s) : roadZ(x, y); };
  const BAYS = PARK.bays.map((x, i) => ({ x, car:null as any, staff:i === 1 || i === 4 }));
  const arrive = (b: any) => withHeights(new Path([...lane(sIn, sJ, -1), ...up, [1446, 74.5], [b.x - 3.5, PARK.aisle], [b.x, PARK.aisle - 3.2], [b.x, PARK.front]], 6), zOf);
  const leave = (b: any) => withHeights(new Path([[b.x, PARK.front], [b.x, PARK.back], [PARK.west, PARK.back], [PARK.west, PARK.aisle], ...down, ...lane(sJ, sIn + 30, 1)], 6), zOf);
  const car = { next:30 };
  class Visitor extends Person {
    constructor(c: any, b: any) { super({ look:'walker', id:`a visitor from ${c.id}`, x:b.x + 1.4, y:PARK.front + 2, h:Math.PI / 2, speed:1.25, c, b, at:'out' }); visitors.push(this);
      const h = hourAt(sim.t), dusk = h >= 19.5 || h < 2;
      this.walk([[b.x + 1.6, PARK.aisle - 0.6], [1440, 69], [1440, 66.2], [1436, 65.6]], 'walking to the visitor centre').then((p: any) => { p.hidden = true; p.at = 'centre'; })
        .wait(dusk ? 18 : 30 + (c.seq % 20), 'in the visitor centre').then((p: any) => { p.hidden = false; p.at = 'out'; });
      if (dusk) this.walk([[1436, 65.6], [1427, 67.5], [1413, 58], [PUBLIC.x + (c.seq % 3) - 1, PUBLIC.y + PUBLIC.r + 2.4]], 'walking to the public dome').face(-Math.PI / 2)
        .then((p: any) => { p.at = 'dome'; }).wait(26, 'looking through the telescope').then((p: any) => { p.at = 'out'; }).walk([[1413, 58], [1427, 67.5], [1440, 69]], 'walking back to the car');
      else this.walk([[1440, 66.2], [1440, 69]], 'walking back to the car');
      this.walk([[b.x + 1.6, PARK.aisle - 0.6], [b.x + 1.4, PARK.front + 2]], 'walking back to the car').then((p: any) => { visitors.splice(visitors.indexOf(p), 1); c.back = true; p.remove(); });
    }
    info() { return { kind:'Visitor · Beacon Hill', title:this.id, status:this.status(), rows:[['Came in', this.c.id], ['Here since', clock(this.t0)]] }; }
  }
  const visit = (b: any) => {
    const c = new Car({ role:'visitor', path:arrive(b), vmax:9, v:6 }); b.car = c;
    c.stops = [{ s:c.path.length, name:'the observatory car park', label:'parked at the observatory', release:() => !!c.back,
      arrive:() => { c.parked = true; new Visitor(c, b); },
      left:() => { c.parked = false; c.path = leave(b); c.s = 0; c.si = 0; c.stops = []; c.leaving = true; b.car = null; } }];
  };

  // ---- each frame ----
  const aim = (i: Inst, dt: number, open: boolean, every: number, vAz: number, vAlt: number) => {
    i.k = step(i.k, open ? 1 : 0, 1 / 14, dt);
    if (open && (i.tt -= dt) <= 0) { i.tt = every; i.ti = (i.ti + 1) % i.list.length; if (i === cam) cam.shots = (cam.shots ?? 0) + 1; }
    const [name, a, el] = i.list[i.ti]; i.target = name;
    let tAz = toAz(a), tAlt = el * D2R;
    const T = hooks.skyTarget?.();   // something the town is watching in the sky: every instrument follows it
    if (T && open) { const dx = T.x - i.x, dy = T.y - i.y, dz = T.z - i.z; tAz = Math.atan2(dy, dx); tAlt = Math.max(0.12, Math.atan2(dz, Math.hypot(dx, dy))); i.target = T.name; }
    if (!open) { tAz = toAz(180); tAlt = Math.PI / 2; }   // parked: the slit to the south, the tube upright
    i.az = turn(i.az, tAz, vAz * D2R, dt); i.alt = step(i.alt, i.k > 0.9 || !open ? tAlt : i.alt, vAlt * D2R, dt);
  };
  const update = (dt: number) => {
    const dark = night() > 0.6, ok = clear(), h = hourAt(sim.t);
    // (a launch from Gull Spit opens them by day as well, to follow it up)
    const launch = !!hooks.skyTarget?.();
    main.open = ok && (dark || launch); pub.open = ok && (dark && h >= 19.5 && h < 23 || launch); cam.open = ok && (dark || launch);
    if (!cam.open && !dark) cam.shots = 0;
    for (const d of [main, pub, cam]) {
      aim(d, dt, d.open, d === cam ? 20 : d === pub ? 60 : 45, d === main ? 2 : 4, 3);
      d.m.az.rotation.y = -d.az; d.m.shutter.rotation.z = d.k * 1.45; d.m.alt.rotation.z = d.alt;
    }
    aim(dish, dt, true, 35, 1.5, 1.0); dm.az.rotation.y = -dish.az; dm.el.rotation.z = dish.alt;
    // visitors: by day while the centre is open, and in the evening for the public dome on a clear night
    const visiting = h >= 10 && h < 17.5 || h >= 19.5 && h < 22 && ok;
    if ((car.next -= dt) <= 0) { car.next = 16 + (sim.t * 7.3) % 26; const b = BAYS.find(b => !b.staff && !b.car); if (visiting && b) visit(b); }
  };
  for (const d of [main, pub, cam]) { d.status = () => d.open ? d.k < 0.95 ? 'opening' : `observing ${d.target}` : d.k > 0.05 ? 'closing' : night() < 0.6 ? 'shut for the day' : !clear() ? 'shut · cloud' : 'shut for the night'; }
  dish.status = () => `listening to ${dish.target}`;
  update(0);
  return { main, pub, cam, dish, site, centre, solar, house, entities:() => [site, main, pub, cam, dish, centre, solar, house], update };
}
