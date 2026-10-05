// @ts-nocheck
import * as THREE from 'three';
import { TOP, W } from '../kernel/iso';
import { Part, v3 } from '../kernel/part';

// People, about 1.74 m: shoes, legs that swing at the hip, hips, a torso wider at the shoulders, arms that swing
// at the shoulder, a neck and an eight-sided head. Clothes are the two fills: 'n' plain, 'k' the two-tone that
// uniforms and goods wear. Variety comes from the cut (trousers, skirt, coat), the hair or hat, and a bag.
//
// A look names who they are; each look has a few variants. Outfit fields:
//   top / bottom  'n' | 'k'                         shirt and trousers (or skirt)
//   lower         'trousers' | 'skirt' | 'coat'
//   hair          'short' | 'long' | 'bun' | 'none'  (hidden under a hood)
//   hat           'cap' | 'police' | 'hat' | 'hood' | 'helmet' | null
//   pack          'backpack' | 'bag' | null
//   slim          narrower shoulders and waist
const civ = (top, bottom, lower, hair, hat, pack, slim) => ({ top, bottom, lower, hair, hat, pack, slim });
export const OUTFITS = {
  // walkers and shoppers share one wardrobe
  walker:[civ('n', 'k', 'trousers', 'short', null, null, false), civ('k', 'n', 'skirt', 'long', null, null, true),
    civ('k', 'n', 'trousers', 'short', 'cap', 'backpack', false), civ('n', 'n', 'skirt', 'bun', null, 'bag', true),
    civ('k', 'k', 'trousers', 'none', null, null, false), civ('n', 'k', 'trousers', 'short', null, 'backpack', true),
    civ('n', 'k', 'coat', 'short', 'hat', null, false), civ('k', 'n', 'coat', 'long', null, 'bag', true)],
  staff:[civ('k', 'n', 'trousers', 'short', null, null, false), civ('k', 'n', 'trousers', 'bun', null, null, true)],
  guard:[civ('k', 'k', 'trousers', 'short', 'police', null, false)],
  police:[civ('k', 'n', 'trousers', 'short', 'police', null, false), civ('k', 'n', 'trousers', 'bun', 'police', null, true)],
  thief:[civ('k', 'k', 'trousers', 'none', 'hood', 'backpack', false)],
  fisher:[civ('n', 'k', 'coat', 'short', 'hat', null, false), civ('k', 'n', 'trousers', 'short', 'cap', 'bag', false)],
  courier:[civ('k', 'n', 'trousers', 'short', 'cap', null, false)],
  teller:[civ('n', 'k', 'trousers', 'short', null, null, false), civ('k', 'n', 'skirt', 'bun', null, null, true)],
};
OUTFITS.shopper = OUTFITS.walker;
export const LOOKS = Object.keys(OUTFITS);

const HIP = 0.86, SHOULDER = 1.4;
// a six-sided frustum standing on z0: skirts and coat tails
function frustum(p, x, z0, z1, rTop, rBot, depth, tone) {
  p.geo(new THREE.CylinderGeometry(rTop, rBot, z1 - z0, 6), new THREE.Matrix4().compose(W(x, 0, (z0 + z1) / 2), new THREE.Quaternion(), v3(depth, 1, 1)), tone);
}

// One fill per tone for every face of a person, tops included: a person costs a third fewer draw calls,
// and the hairlines still mark every edge.
const T = t => t === 'k' ? 'kb' : 'nb';
// what sits on the shoulders and above: torso, neck, head, hair or hat, bag
function upper(p, o) {
  const sh = o.slim ? 0.19 : 0.22, wa = o.slim ? 0.15 : 0.17, top = T(o.top), bottom = T(o.bottom);
  // hips, then the torso: a trapezoid in front view, swept back to front
  if (o.lower !== 'skirt') p.box(-0.11, -wa, HIP - 0.06, 0.22, 2 * wa, 0.16, bottom);
  p.extrude([[-0.12, -wa, 0.95], [-0.12, wa, 0.95], [-0.12, sh, SHOULDER + 0.02], [-0.12, -sh, SHOULDER + 0.02]], [0.24, 0, 0], top);
  if (o.lower === 'skirt') frustum(p, 0, 0.5, 0.98, 0.17, 0.26, 0.82, bottom);
  if (o.lower === 'coat') frustum(p, 0, 0.52, 0.97, 0.19, 0.25, 0.8, top);
  p.box(-0.04, -0.045, SHOULDER + 0.02, 0.08, 0.09, 0.06, 'nb');
  p.cylZ(0.01, 0, 1.47, 0.11, 0.25, 8, 'nb');
  const hairTone = o.top === 'k' ? 'nb' : 'kb';
  if (o.hat !== 'hood' && o.hair !== 'none') {
    p.cylZ(-0.005, 0, 1.655, 0.12, 0.085, 8, hairTone);
    if (o.hair === 'short') p.box(-0.135, -0.11, 1.53, 0.07, 0.22, 0.14, hairTone);
    if (o.hair === 'long') p.box(-0.145, -0.12, 1.3, 0.08, 0.24, 0.38, hairTone);
    if (o.hair === 'bun') p.cylZ(-0.08, 0, 1.73, 0.06, 0.08, 6, hairTone);
  }
  if (o.hat === 'cap') { p.cylZ(0, 0, 1.665, 0.125, 0.08, 8, 'kb'); p.box(0.08, -0.1, 1.665, 0.14, 0.2, 0.025, 'kb'); }
  if (o.hat === 'police') { p.box(-0.15, -0.15, 1.665, 0.3, 0.3, 0.055, 'kb'); p.box(0.13, -0.12, 1.665, 0.11, 0.24, 0.02, 'kb'); }
  if (o.hat === 'hat') { p.cylZ(0, 0, 1.68, 0.2, 0.025, 10, 'nb'); p.cylZ(0, 0, 1.7, 0.115, 0.1, 8, 'nb'); }
  if (o.hat === 'helmet') { p.cylZ(0, 0, 1.64, 0.14, 0.13, 10, 'kb'); p.box(-0.2, -0.14, 1.64, 0.08, 0.28, 0.025, 'kb'); }
  if (o.hat === 'hood') p.box(-0.15, -0.14, 1.44, 0.21, 0.28, 0.33, 'kb');
  if (o.pack === 'backpack') p.box(-0.25, -0.15, 1.0, 0.13, 0.3, 0.36, o.top === 'k' ? 'nb' : 'kb');
  if (o.pack === 'bag') { p.box(-0.06, sh + 0.02, 0.84, 0.18, 0.06, 0.17, 'kb'); p.seg('line', W(0, sh - 0.02, SHOULDER), W(0.03, sh + 0.05, 1.01)); }
  return sh;
}

// lite: one part with the legs and arms at rest and nothing to carry, for when a person is only a few pixels tall
export function buildPerson(look, variant = 0, lite = false) {
  const o = OUTFITS[look][variant], legW = o.lower === 'skirt' ? 0.12 : 0.15, legTone = o.lower === 'skirt' ? 'nb' : T(o.bottom);
  const p = new Part(), sh = upper(p, o);
  if (lite) {
    for (const y of [0.1, -0.1]) p.box(-0.07, y - legW / 2, 0, 0.14, legW, HIP, legTone);
    for (const s of [1, -1]) p.box(-0.05, s * (sh + 0.005) - 0.05, SHOULDER - 0.66, 0.1, 0.1, 0.66, T(o.top));
    return p.build('personLite');
  }
  const g = p.build('person');
  // legs hang from the hips and carry their shoes; arms hang from the shoulders
  for (const [n, y] of [['legL', 0.1], ['legR', -0.1]]) {
    const l = new Part().box(-legW / 2, -legW / 2, -HIP + 0.05, legW, legW, HIP - 0.05, legTone).box(-0.07, -0.065, -HIP, 0.22, 0.13, 0.08, legTone).build(n);
    l.position.copy(W(0, y, HIP)); g.add(l);
  }
  for (const [n, s] of [['armL', 1], ['armR', -1]]) {
    const a = new Part().box(-0.05, -0.05, -0.6, 0.1, 0.1, 0.6, T(o.top)).box(-0.045, -0.045, -0.68, 0.09, 0.09, 0.08, T(o.top)).build(n);
    a.position.copy(W(0, s * (sh + 0.005), SHOULDER - 0.03)); g.add(a);
  }
  // sitting on a chair or a bench: thighs forward, shins down to the floor; shown instead of the swinging legs
  const sit = new Part();
  for (const y of [0.1, -0.1]) sit.box(-0.06, y - legW / 2, HIP - 0.07, 0.56, legW, legW, legTone).box(0.42, y - legW / 2, 0.36, legW, legW, HIP - 0.43, legTone).box(0.42, y - 0.065, 0.36, 0.2, 0.13, 0.07, legTone);
  const sitG = sit.build('sitLegs'); sitG.visible = false; g.add(sitG);
  const c = new Part(); c.box(0.16, -0.24, 0.95, 0.46, 0.48, 0.42, 'k'); c.draw(TOP(0.16, -0.24, 1.37), [0.23, 0, 0.23, 0.48], 'koline');
  g.add(c.build('carry'));
  return g;
}
export const HIP_H = HIP;

// the same person every time they appear: a variant and a height from their name
export function lookOf(look, id) {
  let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  return { variant:h % OUTFITS[look].length, scale:0.93 + (h >>> 8) % 1000 / 1000 * 0.13 };
}

export function buildDog() {
  const p = new Part();
  p.box(-0.4, -0.12, 0.28, 0.62, 0.24, 0.24); p.box(0.16, -0.1, 0.4, 0.26, 0.2, 0.2);
  for (const [x, y] of [[-0.36, -0.1], [-0.36, 0.04], [0.1, -0.1], [0.1, 0.04]]) p.box(x, y, 0, 0.06, 0.06, 0.28);
  p.seg('line', W(-0.4, 0, 0.48), W(-0.62, 0, 0.7));
  return p.build('dog');
}
