import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { W } from '../kernel/iso';
import { clamp, rng } from '../kernel/math';
import { Path } from '../kernel/path';
import { pose } from '../kernel/part';
import { JOUST, buildJoust } from '../world/joust';
import { SEAT, buildDestrier, buildKnight, buildKnightLite, buildLance, type Livery } from '../models/joust';
import { hourAt, kmh, sim } from './core';
import { FAR, Person } from './person';

// ---- the Millbrook tourney ----
// Every day from eight in the morning four knights joust at the tilt: two bouts, then a final between their winners.
// A bout is two courses (and a third if they are level). For a course the knights wait at opposite ends of the tilt,
// lances up, each with the tilt on his left, until the herald calls it; then they spur on, lower their lances as they
// close, and meet in the middle at a gallop. A lance aimed true breaks on the other's targe (a point), one aimed poorly
// glances off or misses, and now and then one strikes so hard it carries the other out of the saddle, which wins the
// bout outright. They ride on to the far end, wheel round the end of the tilt onto the other side, take a fresh lance
// from the squire there if theirs broke, and come again. The winner salutes the lord and lady in the royal stand.
type Kn = any;
const KNIGHTS: [string, string, string, Livery][] = [
  ['Sir Roland of Harrow', 'bendy or and gules', 'Bayard', { cap:'k', stripe:'n', pattern:'bendy' }],
  ['Sir Edmund Fairweather', 'barry argent and gules', 'Valiant', { cap:'n', stripe:'k', pattern:'barry' }],
  ['Sir Gareth of the Moor', 'paly sable and argent', 'Thunder', { cap:'k', stripe:'n', pattern:'paly' }],
  ['Sir Aldous Kendall', 'azure, a bordure or', 'Gringolet', { cap:'n', stripe:'k', pattern:'plain' }]];
// where each waits between bouts: two by the west end of the lists, two by the east, facing in
const HOMES = [[1849.6, 214.5, 0], [1938.4, 214.5, Math.PI], [1849.6, 223.5, 0], [1938.4, 223.5, Math.PI]];
const { ends:[EW, EE], lanes:{ east:LE, west:LW }, tilt:{ y:TY } } = JOUST;
const GALLOP = 8.6, TROT = 3.6, COURSES = 2;
const OUTCOME = ['misses', 'glances off his targe', 'breaks his lance', 'unhorses him'];

export function buildJoustSys() {
  const base = buildJoust(); scene.add(base);
  const knights: Kn[] = KNIGHTS.map(([name, arms, horse, L], i) => {
    const g = new THREE.Group(), full = new THREE.Group(), D = buildDestrier(L), rider = buildKnight(L), lance = buildLance(L), lite = buildKnightLite(L);
    rider.position.copy(W(0, 0, SEAT)); full.add(D.g); D.g.add(rider); rider.add(lance.g); lance.g.position.copy(W(0.2, 0.36, 0.45));
    g.add(full, lite); scene.add(g);
    const [hx, hy, hh] = HOMES[i];
    const k: Kn = { kind:'knight', id:name, name, arms, horse, i, g, full, D, rider, lance, lite, groups:[g], pick:[0, 0, 2.6], x:hx, y:hy, h:hh, v:0, phase:i, up:1, upT:1,
      path:null as Path | null, s:0, vT:0, mounted:true, fall:null as any, broken:0, bout:0, wins:0, unhorsed:0, total:0, label:'waiting by the pavilion',
      status() { return this.label; },
      info() { const tb = tourney.bout; const inBout = tb && (tb.a === this || tb.b === this);
        return { kind:'Knight · jousting at the tilt', title:this.name, status:this.status(),
          rows:[['Arms', this.arms], ['Horse', `${this.horse}, a grey destrier`], ...(inBout ? [['This bout', `${this.bout} ${this.bout === 1 ? 'lance' : 'lances'} broken · course ${Math.min(tb.course, tb.of)} of ${tb.of}`]] : []),
            ['Today', `${this.wins} ${this.wins === 1 ? 'bout' : 'bouts'} won`], ['Lances broken', String(this.total)], ['Unhorsed', `${this.unhorsed} ${this.unhorsed === 1 ? 'time' : 'times'}`], ['Speed', kmh(this.v)]] as [string, string][] }; },
      readout() { return `${this.name} · ${this.label}`.toLowerCase(); },
      route() { return this.path ? { path:this.path, s:this.s, closed:false, next:null } : null; } };
    g.userData.entity = k; rider.userData.entity = k; return k; });
  // the herald before the royal stand, a squire at each end of the lists
  const herald: any = new Person({ look:'herald', id:'Master Pell, herald', x:1894, y:205.0, h:Math.PI / 2, speed:1 }); herald.label = 'waiting for the lists to open';
  herald.info = () => ({ kind:'Herald · Millbrook tourney', title:herald.id, status:herald.label, rows:[['Calls', 'the courses, and the strikes'], ['Keeps', 'the cheque on the board']] });
  const squires = [[1857.5, 225.2, -Math.PI / 2], [1930.5, 212.8, Math.PI / 2]].map(([x, y, h], k) => { const p: any = new Person({ look:'squire', id:k ? 'Hal, a squire' : 'Wat, a squire', x, y, h, speed:1.4 });
    p.home = [x, y]; p.label = 'minding the lances'; p.info = () => ({ kind:'Squire · Millbrook tourney', title:p.id, status:p.label, rows:[['End', k ? 'the east end of the tilt' : 'the west end of the tilt'], ['Lances', 'a rack of a dozen']] }); return p; });

  // ---- moving the knights ----
  const walkTo = (k: Kn, pts: number[][], label: string, speed = TROT) => { k.path = new Path([[k.x, k.y], ...pts], 2.2); k.s = 0; k.vT = speed; k.label = label; };
  function ride(k: Kn, dt: number) {
    if (k.path) {
      const left = k.path.length - k.s;
      const vt = Math.min(k.vT, Math.sqrt(Math.max(0, 2 * 3.2 * left)) + 0.2);
      k.v = vt > k.v ? Math.min(vt, k.v + 3.2 * dt) : Math.max(vt, k.v - 6 * dt);
      k.s = Math.min(k.path.length, k.s + k.v * dt);
      const a = k.path.at(k.s); k.x = a.x; k.y = a.y; k.h = a.h;
      if (k.s >= k.path.length - 0.02) { k.path = null; k.v = 0; k.done = true; }
    }
    k.up += clamp(k.upT - k.up, -dt / 1.1, dt / 1.1);
    place(k, dt);
  }
  function place(k: Kn, dt: number) {
    const gait = k.v > 5 ? 1 : k.v > 0.3 ? 0.55 : 0;
    k.phase += dt * (k.v > 5 ? 9 : 6.5) * (gait > 0 ? 1 : 0);
    pose(k.g, k.x, k.y, k.h, 0);
    const sw = [0, 0.5, 2.2, 2.9];
    k.D.legs.forEach((l: THREE.Object3D, i: number) => { l.rotation.z = gait ? Math.sin(k.phase + sw[i]) * 0.55 * gait : 0; });
    k.D.g.position.y = gait ? Math.abs(Math.sin(k.phase)) * 0.08 * gait : 0;
    // the lance: up, carried, or couched across the horse's neck toward the other side of the tilt
    k.lance.g.rotation.set(0, 0.04 + 0.2 * (1 - k.up), -0.06 + 1.32 * k.up);
    k.full.visible = !FAR; k.lite.visible = FAR;
    if (k.fall) {
      const f = k.fall; f.t += dt; const e = Math.min(1, f.t / 0.9);
      k.rider.position.set(f.x, Math.max(0.35, f.z - 2.1 * e * e), f.y); k.rider.rotation.set(0, f.h, -1.45 * e);
    }
  }
  function unhorse(k: Kn) {
    k.mounted = false; k.unhorsed++; scene.attach(k.rider);
    const p = k.rider.position.clone(); k.fall = { t:0, x:p.x + Math.cos(k.h) * -0.8, y:p.z + Math.sin(k.h) * -0.8, z:p.y, h:-k.h };
    k.rider.position.set(k.fall.x, k.fall.z, k.fall.y);
  }
  function remount(k: Kn) { k.fall = null; k.mounted = true; k.D.g.attach(k.rider); k.rider.position.copy(W(0, 0, SEAT)); k.rider.rotation.set(0, 0, 0); }
  function freshLance(k: Kn) { k.lance.whole.visible = true; k.lance.stub.visible = false; }

  // ---- the day: two bouts and a final ----
  const tourney: any = { state:'closed', bouts:[] as any[], bout:null as any, t:0, wait:0, champion:null as Kn, last:'', day:0 };
  function newDay() {
    for (const k of knights) { k.wins = 0; k.bout = 0; }
    tourney.bouts = [{ a:knights[0], b:knights[1] }, { a:knights[2], b:knights[3] }, { final:true }]; tourney.champion = null; tourney.bout = null; tourney.state = 'between'; tourney.wait = 2;
  }
  function startBout(b: any) {
    if (b.final) { const w = tourney.bouts.slice(0, 2).map((x: any) => x.winner); b.a = w[0]; b.b = w[1]; }
    Object.assign(b, { course:1, of:COURSES, step:'enter', t:0 }); tourney.bout = b;
    for (const k of [b.a, b.b]) { k.bout = 0; freshLance(k); k.upT = 1; }
    // the one who starts west rides in at the west opening, the other at the east, by way of the lists if need be
    const into = (k: Kn, west: boolean) => { const home = k.x < 1894, y = west ? LE : LW, sx = west ? EW : EE, door = home ? 1852.5 : 1935.5, hy = home ? LE : LW;
      // from his own end of the lists; if he starts at the far one, along his side of the tilt and round its far end
      const pts = home === west ? [[door, y], [sx, y]] : [[door, hy], [west ? EW - 2.5 : EE + 2.5, hy], [west ? EW - 2.5 : EE + 2.5, y], [sx + (west ? 0.6 : -0.6), y]];
      walkTo(k, pts, `riding in to the ${west ? 'west' : 'east'} end`, TROT); k.done = false; };
    into(b.a, true); into(b.b, false); b.aWest = true;
    herald.label = `calling ${b.final ? 'the final' : `bout ${tourney.bouts.indexOf(b) + 1}`}: ${b.a.name} against ${b.b.name}`;
  }
  // at the ends, ready: facing down their lanes, the tilt on their left
  const lane = (west: boolean) => west ? { y:LE, x0:EW, x1:EE, h:0 } : { y:LW, x0:EE, x1:EW, h:Math.PI };
  function course(b: any, dt: number) {
    const A = b.a, B = b.b, wA = b.aWest, LA = lane(wA), LB = lane(!wA);
    b.t += dt;
    switch (b.step) {
      case 'enter': if (A.done && B.done) { A.h = LA.h; B.h = LB.h; b.step = 'ready'; b.t = 0; herald.label = 'the knights at the tilt'; A.label = B.label = 'at the end of the tilt, lance up'; } break;
      case 'ready': if (b.t > 2.6) { b.step = 'charge'; b.hit = false; for (const k of [A, B]) { k.label = 'charging'; k.v = 0.5; } herald.label = `course ${b.course}: laissez aller!`; } break;
      case 'charge': {
        for (const [k, L] of [[A, LA], [B, LB]] as [Kn, any][]) {
          if (!k.mounted) { k.v = Math.max(0, k.v - 3 * dt); } else k.v = Math.min(GALLOP * (0.96 + 0.04 * ((k.i * 7) % 3) / 2), k.v + 3.0 * dt);
          k.x += Math.cos(L.h) * k.v * dt; k.y = L.y; k.h = L.h;
          const gap = Math.abs(B.x - A.x); k.upT = gap < 34 && !b.hit && k.mounted ? 0 : 1; k.up += clamp(k.upT - k.up, -dt / 0.9, dt / 0.9);
          place(k, dt);
        }
        // the strike: each lance's luck on the other
        if (!b.hit && (wA ? B.x - A.x : A.x - B.x) < 3.4) {
          b.hit = true; const res: string[] = [];
          for (const [k, o] of [[A, B], [B, A]] as [Kn, Kn][]) {
            const r = rng(), out = r < 0.16 ? 0 : r < 0.32 ? 1 : r < 0.93 ? 2 : 3; k.lastOut = out;
            if (out >= 2) { k.bout++; k.total++; k.lance.whole.visible = false; k.lance.stub.visible = true; k.lance.splinters.visible = true; k.splT = 0.7; }
            res.push(`${k.name.split(' ').pop()} ${OUTCOME[out]}`);
          }
          // a knight carried out of his saddle (only one of them: whoever was struck hardest)
          const down = A.lastOut === 3 ? B : B.lastOut === 3 ? A : null; if (down) { unhorse(down); b.downed = down; }
          herald.label = res.join(' · ');
        }
        for (const k of [A, B]) if (k.splT !== undefined && (k.splT -= dt) <= 0) { k.lance.splinters.visible = false; k.splT = undefined; }
        // past each other and on to the far end
        if (b.hit && Math.abs((wA ? A.x : B.x) - EE) < 0.4 && Math.abs((wA ? B.x : A.x) - EW) < 0.4) b.step = 'turn';
        for (const [k, L] of [[A, LA], [B, LB]] as [Kn, any][]) { const left = Math.abs(L.x1 - k.x); if (b.hit && left < 9) k.v = Math.min(k.v, Math.sqrt(2 * 4.2 * left)); if (left < 0.3 || (L.h === 0 ? k.x > L.x1 : k.x < L.x1)) { k.x = L.x1; k.v = 0; } }
        if (b.hit && A.v === 0 && B.v === 0) b.step = 'turn';
        if (b.step === 'turn') {
          b.t = 0;
          if (b.downed) { const d = b.downed; b.step = 'fallen'; d.label = 'unhorsed'; herald.label = `${d.name} is unhorsed!`; break; }
          // round the end of the tilt onto the other side, to come back
          for (const [k, L] of [[A, LA], [B, LB]] as [Kn, any][]) { const e = L.x1, d = L.h === 0 ? 1 : -1, ny = L.y === LE ? LW : LE;
            walkTo(k, [[e + d * 2.6, L.y], [e + d * 2.6, ny], [e - d * 1.2, ny]], 'wheeling round the end of the tilt', 2.6); k.done = false; k.upT = 1; }
        }
        break; }
      case 'turn': if (A.done && B.done) {
          for (const k of [A, B]) if (k.lance.stub.visible) { freshLance(k); }
          A.label = B.label = 'taking a fresh lance from the squire';
          b.aWest = !b.aWest; A.x = lane(b.aWest).x0; B.x = lane(!b.aWest).x0; A.h = lane(b.aWest).h; B.h = lane(!b.aWest).h;
          b.course++;
          if (b.course > b.of) { if (A.bout === B.bout && b.of < COURSES + 1) { b.of++; herald.label = 'level: one more course'; } else { finish(b); break; } }
          b.step = 'ready'; b.t = 0; }
        break;
      case 'fallen': {
        const d = b.downed, other = d === A ? B : A;
        // his horse is caught and led back to him, and he is helped up into the saddle again
        if (b.t > 2.5 && !d.path && !d.leading && d.fall) { d.leading = true; walkTo(d, [[d.fall.x, d.fall.y]], 'led back to his rider', 1.6); d.done = false; }
        if (d.leading && d.done) { d.leading = false; remount(d); finish(b, other); }
        break; }
      case 'salute': if (b.t > 3.5) { b.step = 'out'; for (const k of [A, B]) { const [hx, hy] = HOMES[k.i]; walkTo(k, [[hx < 1894 ? JOUST.lists[0] - 1.5 : JOUST.lists[1] + 1.5, k.y], [hx, hy]], 'riding back to his pavilion', TROT); k.done = false; } } break;
      case 'out': if (A.done && B.done) { for (const k of [A, B]) { k.h = HOMES[k.i][2]; k.label = 'waiting by the pavilion'; } b.step = 'over'; tourney.bout = null; tourney.state = 'between'; tourney.wait = 6; } break;
    }
  }
  function finish(b: any, by?: Kn) {
    const A = b.a, B = b.b, w = by ?? (A.bout >= B.bout ? (A.bout === B.bout ? (rng() < 0.5 ? A : B) : A) : B);
    b.winner = w; w.wins++; b.step = 'salute'; b.t = 0; w.upT = 1; w.h = -Math.PI / 2;
    w.label = 'saluting the lord and lady'; (w === A ? B : A).label = 'beaten';
    herald.label = by ? `${w.name} wins, unhorsing his man` : `${w.name} wins, ${w.bout} lances to ${(w === A ? B : A).bout}`;
    tourney.last = `${w.name} beat ${(w === A ? B : A).name}`;
    if (b.final) { tourney.champion = w; herald.label = `${w.name} is champion of the lists!`; }
  }

  let lastH = hourAt(sim.t);
  function update(dt: number) {
    const h = hourAt(sim.t);
    if (lastH < 5 && h >= 5) { tourney.state = 'closed'; tourney.bout = null; for (const k of knights) { if (!k.mounted) remount(k); const [x, y, hh] = HOMES[k.i]; Object.assign(k, { x, y, h:hh, path:null, v:0, label:'waiting by the pavilion' }); freshLance(k); } }
    lastH = h;
    if (tourney.state === 'closed' && h >= 8 && h < 14) { tourney.state = 'between'; newDay(); }
    if (tourney.state === 'between' && (tourney.wait -= dt) <= 0) {
      const next = tourney.bouts.find((b: any) => !b.winner && b.step === undefined);
      if (next && (!next.final || tourney.bouts.slice(0, 2).every((b: any) => b.winner))) { tourney.state = 'bout'; startBout(next); }
      else if (!next) { tourney.state = 'done'; herald.label = tourney.champion ? `the day is ${tourney.champion.name}'s` : 'the lists are closed'; }
    }
    const b = tourney.bout;
    for (const k of knights) { if (b && b.step === 'charge' && (k === b.a || k === b.b)) continue; ride(k, dt); }
    if (b) course(b, dt);
    // the squires come out to a knight waiting at their end of the tilt
    for (const [n, q] of squires.entries()) { const ex = n ? EE : EW, k = b && [b.a, b.b].find((k: Kn) => Math.abs(k.x - ex) < 1.5 && (b.step === 'ready' || b.step === 'turn'));
      const to = k ? [k.x + (n ? -0.6 : 0.6), k.y + (n ? -1.6 : 1.6)] : q.home;
      if (!q.steps.length && Math.hypot(q.x - to[0], q.y - to[1]) > 0.3) { q.walk([to], k ? `handing ${k.name.split(' ').pop()} a lance` : 'back to the rack'); q.carrying = !!k; }
      if (!k && Math.hypot(q.x - q.home[0], q.y - q.home[1]) < 0.3 && !q.steps.length) { q.label = 'minding the lances'; q.h = n ? Math.PI / 2 : -Math.PI / 2; q.carrying = null; } }
    if (!b && tourney.state !== 'bout') herald.label = tourney.state === 'closed' ? 'the lists open at eight' : tourney.state === 'done' ? herald.label : 'calling the next bout';
  }
  const yard: any = { kind:'tiltyard', id:'Millbrook tiltyard', groups:[base], pick:[1894, 219, 2],
    status() { const b = tourney.bout; return tourney.state === 'closed' ? 'closed · the lists open at eight' : tourney.state === 'done' ? `the day's jousting is done${tourney.champion ? ` · ${tourney.champion.name} champion` : ''}`
      : b ? `${b.final ? 'the final' : `bout ${tourney.bouts.indexOf(b) + 1}`} · course ${Math.min(b.course, b.of)} of ${b.of}` : 'between bouts'; },
    info() { const b = tourney.bout;
      const rows: [string, string][] = [['Lists', '80 m, with a tilt of 60 m · a royal stand, four pavilions']];
      if (b) rows.push(['At the tilt', `${b.a.name} (${b.a.bout}) · ${b.b.name} (${b.b.bout})`], ['Herald', herald.label]);
      tourney.bouts.forEach((x: any, k: number) => { if (x.winner) rows.push([x.final ? 'Final' : `Bout ${k + 1}`, `${x.winner.name} beat ${(x.winner === x.a ? x.b : x.a).name}`]); });
      if (tourney.champion) rows.push(['Champion', tourney.champion.name]);
      rows.push(['Scoring', 'a point a lance broken · unhorsing wins outright']);
      return { kind:'Tiltyard · Millbrook tourney', title:this.id, status:this.status(), rows, actions:b ? [['Follow the joust', () => hooks.track(b.a)]] : [] }; },
    readout() { return `millbrook tiltyard · ${this.status()}`; } };
  base.userData.entity = yard;
  for (const k of knights) place(k, 0);
  hooks.joustOn = () => tourney.state === 'bout' || tourney.state === 'between';
  return { yard, knights, herald, squires, tourney, entities:() => [yard, ...knights, herald, ...squires], update, detail() { for (const k of knights) place(k, 0); },
    // debug: start the day's jousting now
    start() { newDay(); tourney.state = 'between'; tourney.wait = 0; return tourney.state; } };
}
