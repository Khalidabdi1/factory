// @ts-nocheck
import { TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';

// Homes in section, after the warehouse and the shop: the walls cut low and hatched on the cut, the roof as an
// outline, the ground floor furnished. A home's section is drawn the first time it is opened.
//
// Each section also lists its spots, where the people who live there sit, stand or sleep:
//   sofa / dine  a seat: { at, h, z }, z the seat height       cook  standing at the counter: { at, h }
//   bed          lying down: { at (where the feet are), h (head → feet), z (the mattress) }
//   parcel       a delivery's place inside the door              pet   a spot on the rug
const LOW = 1.0, T = 0.22;
const FACE = { e:[1, 0], s:[0, 1], w:[-1, 0], n:[0, -1] };
const heading = f => Math.atan2(FACE[f][1], FACE[f][0]);
const turn = f => ({ e:'w', w:'e', n:'s', s:'n' }[f]);

// a straight low wall along x or y, hatched on top, leaving gaps [a, b] (in the same coordinate) for doors
function lowWall(c, x0, y0, x1, y1, z, gaps = []) {
  const alongX = Math.abs(y1 - y0) < 1e-6, a0 = Math.min(alongX ? x0 : y0, alongX ? x1 : y1), a1 = Math.max(alongX ? x0 : y0, alongX ? x1 : y1);
  const runs = []; let s = a0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > s) runs.push([s, g0]); s = Math.max(s, g1); }
  if (a1 > s) runs.push([s, a1]);
  for (const [r0, r1] of runs) {
    if (r1 - r0 < 0.05) continue;
    const bx = alongX ? r0 : x0 - T / 2, by = alongX ? y0 - T / 2 : r0, w = alongX ? r1 - r0 : T, d = alongX ? T : r1 - r0;
    c.box(bx, by, z, w, d, LOW);
    const n = Math.max(w, d), segs = [];
    for (let u = 0.25; u < n - 0.05; u += 0.45) segs.push(...(w > d ? [u, 0, Math.min(n, u + T), d] : [0, u, w, Math.min(n, u + T)]));
    c.draw(TOP(bx, by, z + LOW), segs);
  }
}
const outline = (c, pts, k = 'detail') => { for (let i = 0; i < pts.length - 1; i++) c.seg(k, W(...pts[i]), W(...pts[i + 1])); };

// furniture is drawn in its own frame: u forward (the way it faces, out from the wall it stands against), v across
function piece(p, x, y, z, face) {
  const [fx, fy] = FACE[face], lx = -fy, ly = fx;
  const at = (u, v) => [x + fx * u + lx * v, y + fy * u + ly * v];
  const o = {
    at, h:heading(face),
    box(u, v, z0, du, dv, hh, tone) { const a = at(u, v), b = at(u + du, v + dv); p.box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), z + z0, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), hh, tone); return o; },
    rect(u, v, du, dv, zz, k = 'detail') { const q = [at(u, v), at(u + du, v), at(u + du, v + dv), at(u, v + dv), at(u, v)];
      for (let i = 0; i < 4; i++) p.seg(k, W(q[i][0], q[i][1], z + zz), W(q[i + 1][0], q[i + 1][1], z + zz)); return o; },
  };
  return o;
}
// a sofa with its back to the wall; seats along it
function sofa(p, spots, x, y, z, face, len) {
  const f = piece(p, x, y, z, face);
  f.box(0.05, -len / 2, 0, 0.85, len, 0.42).box(0, -len / 2, 0, 0.25, len, 0.85).box(0.05, -len / 2, 0, 0.85, 0.18, 0.6).box(0.05, len / 2 - 0.18, 0, 0.85, 0.18, 0.6);
  const n = len > 2 ? 3 : 2;
  for (let i = 0; i < n; i++) spots.sofa.push({ at:f.at(0.5, (i - (n - 1) / 2) * (len - 0.5) / n), h:f.h, z:0.42 });
  return f;
}
// a coffee table, a rug, and the television on a low cabinet facing the sofa
function lounge(p, spots, f) {
  f.box(1.4, -0.5, 0, 0.6, 1.0, 0.38).rect(1.05, -1.15, 1.6, 2.3, 0.02).box(3.3, -0.75, 0, 0.42, 1.5, 0.5).box(3.42, -0.6, 0.5, 0.08, 1.2, 0.7, 'w');
  spots.pet = { at:f.at(2.35, 0.75), h:f.h + 1.2 };
}
// a table with chairs on its long sides, everyone facing it
function dining(p, spots, x, y, z, len, chairs) {
  p.box(x - len / 2, y - 0.45, z + 0.7, len, 0.9, 0.06); p.box(x - 0.15, y - 0.15, z, 0.3, 0.3, 0.7);
  const per = chairs / 2;
  for (const s of [-1, 1]) for (let i = 0; i < per; i++) {
    const cx = x + (i - (per - 1) / 2) * (len / per), cy = y + s * 0.85;
    p.box(cx - 0.21, cy - 0.21, z, 0.42, 0.42, 0.45); p.box(cx - 0.21, cy + s * 0.18 - 0.03, z, 0.42, 0.06, 0.95);
    spots.dine.push({ at:[cx, cy], h:-s * Math.PI / 2, z:0.45 });
  }
}
// a kitchen run against a wall: worktop, hob, sink, wall cupboards, the fridge at one end
function kitchen(p, spots, x, y, z, face, len) {
  const f = piece(p, x, y, z, face);
  f.box(0, -len / 2, 0, 0.62, len - 0.75, 0.9).box(0, len / 2 - 0.72, 0, 0.7, 0.72, 1.85).box(0, -len / 2, 1.5, 0.35, len - 0.75, 0.6);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) f.rect(0.12 + 0.22 * i, -len / 2 + 0.25 + 0.25 * j, 0.16, 0.16, 0.91);
  f.rect(0.12, -len / 2 + 1.0, 0.4, 0.5, 0.91);
  spots.cook.push({ at:f.at(1.05, -len / 2 + 0.7), h:heading(turn(Object.keys(FACE).find(k => FACE[k][0] === Math.round(Math.cos(f.h)) && FACE[k][1] === Math.round(Math.sin(f.h))))) });
  spots.cook.push({ at:f.at(1.05, 0.1), h:spots.cook[spots.cook.length - 1].h });
}
// a bed with its head against a wall; whoever sleeps in it lies head to the pillow
function bed(p, spots, x, y, z, face, wide) {
  const f = piece(p, x, y, z, face), hw = wide ? 0.82 : 0.47;
  f.box(0, -hw - 0.03, 0, 0.1, 2 * hw + 0.06, 0.95).box(0.1, -hw, 0, 2.0, 2 * hw, 0.42).box(0.8, -hw, 0.42, 1.3, 2 * hw, 0.12, 'k');
  for (const v of wide ? [-0.4, 0.4] : [0]) { f.box(0.22, v - 0.3, 0.42, 0.42, 0.6, 0.12); spots.bed.push({ at:f.at(2.08, v), h:f.h, z:0.47 }); }
  f.box(0, hw + 0.15, 0, 0.42, 0.45, 0.5);
  return f;
}
function bathroom(p, x, y, z, face) {
  const f = piece(p, x, y, z, face);
  f.box(0, -0.85, 0, 0.75, 1.7, 0.55).box(0, 1.1, 0, 0.42, 0.55, 0.85).box(0, 1.9, 0, 0.62, 0.42, 0.42).box(0, 1.9, 0, 0.2, 0.42, 0.8);
  f.rect(0.08, -0.77, 0.59, 1.54, 0.56);
}
function stairs(p, x, y, z, along, rise, n = 7) {
  for (let i = 0; i < n; i++) { const t = i / n; p.box(along === 'x' ? x + t * rise : x, along === 'x' ? y : y + t * rise, z, along === 'x' ? rise / n : 0.95, along === 'x' ? 0.95 : rise / n, 0.25 + i * 0.3); }
}

// A house: living room on the side of the front door, kitchen and dining on the other, bedroom and a bathroom (or a
// second bedroom) behind. The house spans x..x+w, y..y+d at height z; door is the front door's offset from the west wall.
export function houseSection({ x, y, z, w, d, h, rh, ov = 0.5, ridgeY, door, twoBeds }) {
  const c = new Part(), f = new Part(), spots = { sofa:[], dine:[], cook:[], bed:[], parcel:null, pet:null };
  const mir = door > w / 2, U = u => mir ? x + w - u : x + u, side = mir ? 'w' : 'e', vp = d * 0.42;
  // the cut: outer walls with the door, the partition with two doorways, the wall between the back rooms
  lowWall(c, x, y + T / 2, x + w, y + T / 2, z); lowWall(c, x, y + d - T / 2, x + w, y + d - T / 2, z, [[x + door, x + door + 1.1]]);
  lowWall(c, x + T / 2, y, x + T / 2, y + d, z); lowWall(c, x + w - T / 2, y, x + w - T / 2, y + d, z);
  const g1 = [U(w * 0.3 - 0.5), U(w * 0.3 + 0.5)].sort((a, b) => a - b), g2 = [U(w * 0.8 - 0.45), U(w * 0.8 + 0.45)].sort((a, b) => a - b);
  lowWall(c, x, y + vp, x + w, y + vp, z, [g1, g2]); lowWall(c, U(w * 0.58), y, U(w * 0.58), y + vp, z);
  // the roof as an outline: eaves, ridge, gables
  const zE = z + h - 0.12, zR = z + h + rh;
  outline(c, [[x - ov, y - ov, zE], [x + w + ov, y - ov, zE], [x + w + ov, y + d + ov, zE], [x - ov, y + d + ov, zE], [x - ov, y - ov, zE]]);
  if (ridgeY) { outline(c, [[x + w / 2, y - ov, zR], [x + w / 2, y + d + ov, zR]]); for (const Y of [y - ov, y + d + ov]) outline(c, [[x - ov, Y, zE], [x + w / 2, Y, zR], [x + w + ov, Y, zE]]); }
  else { outline(c, [[x - ov, y + d / 2, zR], [x + w + ov, y + d / 2, zR]]); for (const X of [x - ov, x + w + ov]) outline(c, [[X, y - ov, zE], [X, y + d / 2, zR], [X, y + d + ov, zE]]); }
  // the rooms
  f.fill2(TOP(x, y, z), 0, 0, w, d, 'deck', 0.012);
  const front = (vp + d) / 2, len = Math.min(2.2, d - vp - 2.6);
  lounge(f, spots, sofa(f, spots, U(T), y + front, z, side, len));
  const kx0 = w * 0.55, kx1 = w - T, klen = Math.min(3.2, kx1 - kx0);
  kitchen(f, spots, U((kx0 + kx1) / 2), y + vp + T / 2, z, 's', klen);
  dining(f, spots, U(w * 0.76), y + front + 0.45, z, 1.5, 4);
  bed(f, spots, U(w * 0.29), y + T, z, 's', true);
  f.box(Math.min(U(w * 0.58 - T / 2 - 0.62), U(w * 0.58 - T / 2)), y + 0.5, z, 0.62, 1.5, 2.0);   // wardrobe against the partition
  if (twoBeds) bed(f, spots, U(w * 0.79), y + T, z, 's', false); else bathroom(f, U(w - T), y + 1.0, z, side === 'e' ? 'w' : 'e');
  if (h > 4.5) stairs(f, Math.min(U(w * 0.36), U(w * 0.52)), y + vp + T / 2, z, 'x', w * 0.16, 7);
  spots.parcel = { at:[x + door + 0.55, y + d - 0.9] };
  return { cut:c.build('cut'), inside:f.build('inside'), spots };
}

// A villa's ground floor: a bedroom at the west end, an open living room, dining and kitchen with an island, stairs up.
// The ground floor spans bx..bx+bw, by..by+bd; the front door is near its east end.
export function villaSection({ bx, by, z, bw, bd }) {
  const c = new Part(), f = new Part(), spots = { sofa:[], dine:[], cook:[], bed:[], parcel:null, pet:null }, k = bw / 22, door = bw - 3.6;
  lowWall(c, bx, by + T / 2, bx + bw, by + T / 2, z); lowWall(c, bx, by + bd - T / 2, bx + bw, by + bd - T / 2, z, [[bx + door, bx + door + 1.4]]);
  lowWall(c, bx + T / 2, by, bx + T / 2, by + bd, z); lowWall(c, bx + bw - T / 2, by, bx + bw - T / 2, by + bd, z);
  lowWall(c, bx + 6 * k, by, bx + 6 * k, by + bd, z, [[by + bd * 0.5 - 0.5, by + bd * 0.5 + 0.5]]);
  // the slab over the ground floor and the upper storey, as outlines
  outline(c, [[bx - 0.4, by - 0.4, z + 3.9], [bx + bw + 0.4, by - 0.4, z + 3.9], [bx + bw + 0.4, by + bd + 0.4, z + 3.9], [bx - 0.4, by + bd + 0.4, z + 3.9], [bx - 0.4, by - 0.4, z + 3.9]]);
  outline(c, [[bx + 5, by + 1.5, z + 7.0], [bx + bw - 3, by + 1.5, z + 7.0], [bx + bw - 3, by + bd - 2.5, z + 7.0], [bx + 5, by + bd - 2.5, z + 7.0], [bx + 5, by + 1.5, z + 7.0]]);
  f.fill2(TOP(bx, by, z), 0, 0, bw, bd, 'deck', 0.012);
  bed(f, spots, bx + T, by + bd * 0.3, z, 'e', true);
  lounge(f, spots, sofa(f, spots, bx + 9.5 * k, by + T, z, 's', 2.6));
  dining(f, spots, bx + 14 * k, by + bd * 0.62, z, 2.2, 6);
  kitchen(f, spots, bx + 18.2 * k, by + T, z, 's', 3.4 * k + 0.6);
  f.box(bx + 16.6 * k, by + 3.3, z, 2.4 * k, 0.9, 0.9);
  stairs(f, bx + bw - 1.2, by + 1.0, z, 'y', 4.2, 9);
  spots.parcel = { at:[bx + door + 0.7, by + bd - 0.9] };
  return { cut:c.build('cut'), inside:f.build('inside'), spots };
}
