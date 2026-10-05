// @ts-nocheck
import * as THREE from 'three';
import { hooks, scene } from '../shared';
import { Part, pose } from '../kernel/part';
import { pick, rand } from '../kernel/math';
import { HIP_H, lookOf } from '../models/people';
import { PROTO, hourAt, night, sim } from './core';
import { WALKERS, portal } from './people';

// every building you can click: a name, a status, a few rows
export const entity = (g, o) => { const e = { groups:[g], readout() { return `${this.id} · ${this.info().status}`.toLowerCase(); }, ...o }; g.userData.entity = e; scene.add(g); return e; };

// Who lives in a home: how many, any pet, whether they share a surname, and the nurse who sleeps by day.
export const HOUSEHOLDS = [{ text:'two adults, two children', n:4 }, { text:'a retired couple', n:2 }, { text:'three students', n:3, mixed:true },
  { text:'a family of five', n:5 }, { text:'one adult and a cat', n:1, pet:'cat' }, { text:'two adults', n:2 }, { text:'a young couple and a baby', n:3 },
  { text:'a nurse on night shifts', n:1, nights:true }, { text:'two brothers', n:2 }, { text:'a painter and her dog', n:1, pet:'dog' }, { text:'a fisherman', n:1 },
  { text:'grandparents and a grandson', n:3 }, { text:'a doctor and a teacher', n:2 }, { text:'two flatmates', n:2, mixed:true }];
const SURNAMES = ['Novak', 'Haddad', 'Costa', 'Okafor', 'Lindqvist', 'Moreau', 'Rossi', 'Tanaka', 'Mensah', 'Kowalski', 'Ferreira', 'Brandt', 'Osei',
  'Petrov', 'Dubois', 'Quinn', 'Sato', 'Varga', 'Ali', 'Berg', 'Rao', 'Lopes', 'Weiss', 'Hughes'];
const INITIALS = 'ABCDEFGHIJKLMNOPRSTVW';
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
export const lightsText = () => { const h = hourAt(sim.t), n = night(); return n < 0.3 ? 'quiet' : h > 0.5 && h < 5.5 ? 'asleep · lights out' : 'lights on'; };

// What someone at home is doing, and where: a spot kind of the home's section and a few words for the card.
function routine(hh, hour, i) {
  if (hh.nights) { if (hour >= 19.5 || hour < 7.5) return null; if (hour >= 8.5 && hour < 16) return ['bed', 'asleep after a night shift']; }
  if (hour >= 23.5 || hour < 6.5) return ['bed', 'asleep'];
  if (hour < 8.5) return i === 0 ? ['cook', 'making breakfast'] : ['dine', 'having breakfast'];
  if (hour < 12) return [['dine', 'working at the table'], ['sofa', 'reading on the sofa'], ['cook', 'tidying the kitchen']][i % 3];
  if (hour < 13.5) return i === 0 ? ['cook', 'making lunch'] : ['dine', 'having lunch'];
  if (hour < 17.5) return [['sofa', 'reading on the sofa'], ['dine', 'doing homework'], ['sofa', 'having a nap']][i % 3];
  if (hour < 19.5) return i === 0 ? ['cook', 'cooking dinner'] : ['dine', 'waiting for dinner'];
  return i < 3 ? ['sofa', 'watching television'] : ['dine', 'playing cards'];
}

// a resident in place: sitting on a seat, standing at the counter, or lying in bed under the duvet
function figure(name, kind, spot, floor) {
  const { variant, scale } = lookOf('walker', name), g = PROTO.person.walker[variant].clone();
  g.scale.setScalar(scale); g.getObjectByName('carry').visible = false;
  const [legL, legR, armL, armR, sit] = ['legL', 'legR', 'armL', 'armR', 'sitLegs'].map(n => g.getObjectByName(n));
  if (kind === 'bed') {
    const o = new THREE.Group(); o.add(g); g.rotation.z = Math.PI / 2;   // on its back, head toward the pillow
    o.add(new Part().box(-1.3 * scale, -0.42, -0.02, 1.32 * scale, 0.84, 0.2, 'kb').build('duvet'));
    pose(o, spot.at[0], spot.at[1], spot.h, floor + spot.z + 0.12 * scale); return o;
  }
  if (kind === 'sofa' || kind === 'dine') {
    legL.visible = legR.visible = false; sit.visible = true; armL.rotation.z = armR.rotation.z = 0.4;
    pose(g, spot.at[0], spot.at[1], spot.h, floor + spot.z - (HIP_H - 0.07) * scale); return g;
  }
  if (kind === 'cook') armL.rotation.z = armR.rotation.z = 0.7;
  pose(g, spot.at[0], spot.at[1], spot.h, floor); return g;
}

export const homes = [];
export function home(g, o) {
  const e = entity(g, { kind:'house', household:pick(HOUSEHOLDS), built:Math.floor(rand(1926, 2019)), figures:[], figKey:'', parcels:[], ...o,
    // out walking from here, never more than live here
    out() { return Math.min(this.household.n, WALKERS().filter(w => w.from === this.portal).length); },
    // who is home and what each is doing, in residents' order
    plan() {
      const hour = hourAt(sim.t), hh = this.household, home = [];
      let left = hh.n - this.out();
      this.residents.forEach((name, i) => { if (left <= 0) return; const r = routine(hh, hour, i); if (r) { home.push({ name, kind:r[0], label:r[1] }); left--; } });
      return home;
    },
    info() {
      const hh = this.household, now = this.plan(), out = this.out(), doing = [...new Set(now.map(p => p.label))].join(', '), ord = hooks.orderFor?.(this);
      return { kind:this.villa ? 'Villa' : 'House', title:this.id, status:now.length ? lightsText() : 'nobody home',
        rows:[['Street', this.street], ['Household', hh.text], ['Who', this.residents.join(', ')],
          ['At home', now.length ? `${now.length} of ${hh.n} · ${doing}` : hh.nights && !out ? 'at the hospital' : 'nobody'],
          ['Out and about', out ? `${out} from here` : 'nobody'], ...(ord ? [ord.row] : []), ['Built', String(this.built)]],
        actions:[...(ord?.actions ?? []), ['Look inside', () => hooks.lookInside(this)]] };
    },
    // while the home is open, the people in it are drawn where they are; redrawn when that changes
    whileOpen() {
      // parcels wait inside the door until someone unpacks them, a couple of hours later
      this.parcels = this.parcels.filter(q => sim.t - q.t < 35);
      const now = this.plan(), key = now.map(p => `${p.name}:${p.kind}`).join('|') + `|${this.parcels.length}`;
      if (key === this.figKey) return;
      this.clearFigures(); this.figKey = key;
      const used = { sofa:0, dine:0, cook:0, bed:0 }, floor = this.floor, S = this.spots;
      // the spot they would be at, or the next free seat (a sleeper short of a bed dozes on the sofa)
      const take = want => { for (const k of want === 'bed' ? ['bed', 'sofa'] : [want, 'sofa', 'dine', 'cook']) { const s = S[k]?.[used[k]]; if (s) { used[k]++; return [k, s]; } } return null; };
      for (const p of now) {
        const t = take(p.kind); if (!t) continue;
        const [kind, spot] = t, grp = figure(p.name, kind, spot, floor), house = this;
        const r = { kind:'resident', id:p.name, groups:[grp], pick:[0, 0, 1.0], doing:kind === 'sofa' && p.kind === 'bed' ? 'asleep on the sofa' : p.label,
          info() { return { kind:`Resident · ${house.villa ? 'villa' : 'house'}`, title:this.id, status:this.doing, rows:[['Lives at', house.id], ['Household', house.household.text]] }; },
          readout() { return `${this.id} · ${this.doing}`.toLowerCase(); } };
        grp.userData.entity = r; this.groups[0].add(grp); this.figures.push(r);
      }
      this.parcels.forEach((q, i) => { const b = PROTO.shopBox.clone(); pose(b, S.parcel.at[0] + (i % 2) * 0.95, S.parcel.at[1], 0.3 * (i % 3), floor + Math.floor(i / 2) * 0.55);
        this.groups[0].add(b); this.figures.push({ groups:[b] }); });
      if (this.household.pet && S.pet) {
        const pet = PROTO.dog.clone(); if (this.household.pet === 'cat') pet.scale.setScalar(0.62);
        pose(pet, S.pet.at[0], S.pet.at[1], S.pet.h, floor + 0.02); this.groups[0].add(pet); this.figures.push({ groups:[pet] });
      }
    },
    clearFigures() { for (const f of this.figures) { for (const g of f.groups) g.removeFromParent(); if (f.kind) hooks.forget(f); } this.figures = []; this.figKey = ''; },
    peeked(on) { if (!on) this.clearFigures(); },
  });
  // the household's names: one surname unless they only share the house
  const hh = e.household, h0 = hash(e.id);
  e.residents = Array.from({ length:hh.n }, (_, i) => `${INITIALS[(h0 >>> (i * 3)) % INITIALS.length]}. ${SURNAMES[(h0 + (hh.mixed ? i * 7 : 0)) % SURNAMES.length]}`);
  e.floor = o.floor ?? 0.15;
  e.pick = [o.door[0], o.door[1] - 2, 2.5]; e.portal = portal('home', e.id, o.door, { w:1.2 }); homes.push(e); return e;
}
