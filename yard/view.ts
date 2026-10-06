// @ts-nocheck
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { $, DEBUG, REDUCED, canvas, hooks, noop, scene, stage } from './shared';
import { W } from './kernel/iso';
import { LINE, applyTheme, shade } from './theme';
import { pose, setTextFar, v3 } from './kernel/part';
import { clamp } from './kernel/math';
import { Path } from './kernel/path';
import { RACK, SHELF, WORLD } from './layout';
import { ring } from './world/ground';
import { PROTO, STEP, clock, conveyor, hourAt, night, shift, sim } from './sim/core';
import { SPOTS } from './sim/cars';
import { BUS_STOPS } from './sim/trucks';
import { FAR, TINY, setTiny } from './sim/person';
import { PORTALS, nextPortal, shop, whGate } from './sim/people';
import { bank, incident, policeStation } from './sim/police';
import { BOATS } from './sim/boats';
import { weather } from './sim/weather';
import { buildFog, buildRain } from './world/weatherfx';
import { orders, placeOrder } from './sim/courier';
import { EDGES, kerbStop, locate, trip } from './sim/roadnet';

export function initView({ courier, fairSys, fishingSys, fireSys, worksSys, trainSys, sahelSys, metroSys, brtSys, motorsSys, portSys, renderer, whG, shopG, factory, warehouse, gate, cafe, townHall, lighthouse, range, flats, homes }) {
let selected = null, hovered = null;
// ---- camera & controls ----
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
const ISO = v3(1, 1, 1).normalize(), CENTER = W((WORLD.x0 + WORLD.x1) / 2, (WORLD.y0 + WORLD.y1) / 2, 0);
camera.position.copy(CENTER).addScaledVector(ISO, 1500); camera.lookAt(CENTER);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableRotate:false, screenSpacePanning:true, zoomToCursor:true, enableDamping:!REDUCED, dampingFactor:0.12 });
controls.mouseButtons = { LEFT:THREE.MOUSE.PAN, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.PAN };
controls.touches = { ONE:THREE.TOUCH.PAN, TWO:THREE.TOUCH.DOLLY_PAN };
controls.target.copy(CENTER);
controls.listenToKeyEvents(window);
// the places the caption links jump to: [x0, x1, y0, y1]
const WB = [WORLD.x0, WORLD.x1, WORLD.y0, WORLD.y1];
const VIEWS = [[0, 200, 0, 150], [204, 360, 0, 150], [352, 440, 212, 298], [53, 300, 138, 262], [0, 440, 255, 336], [206, 410, -58, 2], [520, 960, 0, 270], [566, 760, 120, 284], [448, 676, -56, 6], [640, 966, 276, 420]];
let fitZoom = 1, HOME = CENTER.clone(), goal = null, follow = false, sized = false;
// the zoom and ground target that frame a box of the world (z0..z1 high) in a w × h view
function frame(w, h, [x0, x1, y0, y1], [z0, z1] = [0, 12]) {
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse, b = new THREE.Box3();
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) b.expandByPoint(W(x, y, z).applyMatrix4(inv));
  const c = b.getCenter(v3(0, 0, 0)).applyMatrix4(camera.matrixWorld);
  return { zoom:Math.min(w / (b.max.x - b.min.x), h / (b.max.y - b.min.y)) * 0.94, target:c.addScaledVector(ISO, -c.y / ISO.y) };
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false);
  Object.assign(camera, { left:-w / 2, right:w / 2, top:h / 2, bottom:-h / 2 });
  const f = frame(w, h, WB, [-4, 50]); fitZoom = f.zoom; HOME = f.target; controls.minZoom = fitZoom * 0.6; controls.maxZoom = fitZoom * 36;
  if (!sized) { sized = true; const v = w < 600 ? frame(w, h, VIEWS[0]) : f; camera.zoom = v.zoom; moveTarget(v.target); }
  camera.zoom = clamp(camera.zoom, controls.minZoom, controls.maxZoom); camera.updateProjectionMatrix();
  for (const m of Object.values(LINE)) m.resolution.set(w, h);
}
const overlay = () => { const l = new LineSegments2(new LineSegmentsGeometry(), LINE.live); l.raycast = noop; l.frustumCulled = false; l.visible = false; scene.add(l); return l; };
const retLine = overlay(), routeLine = overlay();
// rain and fog
const rain = buildRain(), fog = buildFog(); scene.add(rain.group, fog.group);
function moveTarget(to) { const d = to.clone().sub(controls.target); controls.target.add(d); camera.position.add(d); }
new ResizeObserver(resize).observe(stage); resize();
canvas.addEventListener('wheel', () => { goal = null; }, { passive:true });
function zoomBy(k) { goal = { zoom:clamp((goal?.zoom ?? camera.zoom) * k, controls.minZoom, controls.maxZoom), target:goal?.target }; }
function resetView() { setFollow(false); goal = { zoom:fitZoom, target:HOME.clone() }; }
function goView(i) { setFollow(false); goal = frame(stage.clientWidth, stage.clientHeight, VIEWS[i]); }
const siteButtons = [...document.querySelectorAll('.sites button')];
siteButtons.forEach((b, i) => { b.onclick = () => goView(i); });
function markSite() {
  const t = controls.target, close = camera.zoom > fitZoom * 1.3;
  const i = close ? VIEWS.findIndex(([x0, x1, y0, y1]) => t.x >= x0 && t.x <= x1 && t.z >= y0 && t.z <= y1) : -1;
  siteButtons.forEach((b, k) => b.setAttribute('aria-current', k === i));
}
function skipTime() { shift.goal += 6; }

// ---- selection, tags, card ----
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3(), box = new THREE.Box3();
const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function hit(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(scene.children, true)) {
    if (!h.object.isMesh || !shown(h.object) || h.point.x < WORLD.x0 || h.point.x > WORLD.x1 || h.point.z < WORLD.y0 || h.point.z > WORLD.y1) continue;
    let o = h.object; while (o && !o.userData.entity) o = o.parent;
    // the nearest visible surface decides; a part drawn for many things (Sahel's buildings) says which one was hit
    return o ? o.userData.entity.resolve?.(h.point) ?? o.userData.entity : null;
  }
  return null;
}
// walk an entity's groups, stopping at anything that belongs to another entity (a pallet on a truck)
function eachOwn(ent, fn) { const walk = o => { if (o.userData.entity && o.userData.entity !== ent) return; fn(o); o.children.forEach(walk); };
  for (const g of ent.groups) { fn(g); g.children.forEach(walk); } }
let liveG = null;
function setLive(ent, on) { if (ent) eachOwn(ent, o => { if (o.isLineSegments2 && o.userData.line === 'line') o.material = on ? LINE.live : LINE.line; }); }
function bounds(ent) { box.makeEmpty(); if (ent.bbox) return box.copy(ent.bbox); for (const g of ent.groups) box.expandByObject(g); return box; }
function select(ent) {
  if (ent === selected) return;
  setLive(selected, false); selected = ent; setLive(selected, true); liveG = ent?.groups?.[0];
  setFollow(false); $('card').hidden = !ent; refresh(); drawRoute();
}
hooks.forget = forget;
function forget(ent) { if (selected === ent) select(null); if (hovered === ent) hovered = null; }
const STILL = ['factory', 'works', 'lot', 'gate', 'conveyor', 'warehouse', 'shop', 'bank', 'police', 'station', 'building', 'house', 'range', 'lighthouse', 'resident', 'pier', 'ride', 'brtstop', 'line', 'showroom', 'cartower', 'crossing', 'terminal', 'block'];
const followable = ent => !!ent && !STILL.includes(ent.kind);
function setFollow(on) { follow = on && followable(selected); $('cardFollow').setAttribute('aria-pressed', follow); }
function refresh() {
  const r = $('readout');
  r.textContent = (paused ? 'paused · ' : '') + (selected ? selected.readout() : 'nothing selected');
  markSite();
  if (!selected) return;
  const i = selected.info();
  $('cardKind').textContent = i.kind; $('cardTitle').textContent = i.title; $('cardStatus').textContent = i.status;
  const bar = $('cardBar'); bar.hidden = !i.bar;
  if (i.bar) { bar.querySelector('span').textContent = i.bar.label; bar.querySelector('i').style.width = `${clamp(i.bar.v / i.bar.max, 0, 1) * 100}%`; }
  const dl = $('cardRows'); dl.replaceChildren(...i.rows.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
  // the card's own buttons (Look inside, Track …), rebuilt only when they change so a click is never lost
  const acts = i.actions ?? [], foot = $('cardFoot'), key = acts.map(a => a[0]).join('|');
  cardActs = acts;
  if (foot.dataset.acts !== key) {
    foot.dataset.acts = key; foot.querySelectorAll('.act').forEach(b => b.remove());
    for (const [label] of acts) { const b = document.createElement('button'); b.className = 'act'; b.textContent = label; b.onclick = () => cardActs.find(a => a[0] === label)?.[1](); foot.append(b); }
  }
  $('cardFollow').hidden = !followable(selected); foot.hidden = !followable(selected) && !acts.length;
}
let cardActs = [];
// Track: select a vehicle, follow it and come in close
hooks.select = ent => select(ent);
hooks.isSelected = ent => !!ent && selected === ent;
hooks.track = ent => { select(ent); setFollow(true); goal = { zoom:Math.max(camera.zoom, fitZoom * 5.5) }; };
// Look inside: frame the building close enough to see its rooms (it is open while it is selected)
hooks.lookInside = ent => { const pk = ent.groups[0].userData.peek, [x0, x1, y0, y1] = pk.box; setFollow(false); goal = frame(stage.clientWidth, stage.clientHeight, [x0 - 4, x1 + 4, y0 - 4, y1 + 4], pk.z ?? [0, 5]); };
// someone selected turns into someone else (a walker into a metro rider, a rider onto a train): the selection, and
// following, go with them
hooks.handOff = (from, to) => { if (selected === from) { const f = follow; select(to); setFollow(f); } };
// a closed building says it can be opened
const hoverText = e => { const pk = e?.groups?.[0]?.userData.peek; return e ? `${e.id}${pk && !pk.cut?.visible ? ' · look inside' : ''}` : ''; };
const screenAt = v => { tmp.copy(v).project(camera); return [(tmp.x + 1) / 2 * stage.clientWidth, (1 - tmp.y) / 2 * stage.clientHeight]; };
function anchorOf(ent) { const b = bounds(ent); return screenAt(v3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2)); }
function placeAt(el, [x, y], text) {
  el.hidden = false; if (el.textContent !== text) el.textContent = text;
  const hw = el.offsetWidth / 2 + 6;   // keep the tag inside the stage
  el.style.left = `${clamp(x, hw, stage.clientWidth - hw)}px`; el.style.top = `${clamp(y, el.offsetHeight + 16, stage.clientHeight)}px`;
}
function placeTag(el, ent, text) { if (!ent) el.hidden = true; else placeAt(el, anchorOf(ent), text); }
// the corners are rebuilt only when the selection's footprint changes size; moving it is a translation
let retKey = '';
function updateReticle() {
  if (!selected) { retLine.visible = false; return; }
  const b = bounds(selected), x0 = b.min.x - 0.8, z0 = b.min.z - 0.8, y = Math.max(0, b.min.y) + 0.06;
  const w = b.max.x + 0.8 - x0, d = b.max.z + 0.8 - z0, key = `${w.toFixed(1)}|${d.toFixed(1)}`;
  if (key !== retKey) {
    retKey = key; const L = Math.min(3, w / 3, d / 3), s = [];
    for (const [x, dx] of [[0, 1], [w, -1]]) for (const [z, dz] of [[0, 1], [d, -1]]) s.push(x, 0, z, x + dx * L, 0, z, x, 0, z, x, 0, z + dz * L);
    retLine.geometry.dispose(); retLine.geometry = new LineSegmentsGeometry().setPositions(s);
  }
  retLine.position.set(x0, y, z0); retLine.visible = true;
}
// the selection's route: dashes ahead of it (a whole loop for loop vehicles) and a ring at its next stop
let routeNext = null;
function drawRoute() {
  const r = selected?.route?.();
  const path = r && (r.path ?? new Path(r.pts, 0.01));
  if (!r || !path.length) { routeLine.visible = false; routeNext = null; return; }
  const z = 0.24, s = [], s0 = r.s ?? 0, s1 = r.closed ? s0 + path.length : path.length;
  for (let d = s0; d < s1; d += 1.6) { const a = path.at(d), b = path.at(Math.min(d + 0.8, s1)); s.push(a.x, z, a.y, b.x, z, b.y); }
  routeNext = r.next ? { p:W(r.next[0], r.next[1], z), stop:r.stop } : null;
  if (r.next) { const rr = selected.isPerson ? 1.1 : 3.2; for (const v of ring(r.next[0], r.next[1], rr, z, 32)) s.push(v.x, v.y, v.z); }
  routeLine.geometry.dispose(); routeLine.geometry = new LineSegmentsGeometry().setPositions(s); routeLine.visible = true;
}
// A closed building opens up while it, or something inside it, is selected. Homes draw their section (and are told
// to show who is in) the first time they open.
const PEEK = [[whG, warehouse], [shopG, shop], [bank.groups[0], bank], [fireSys.station.groups[0], fireSys.station], [worksSys.works.groups[0], worksSys.works], ...homes.map(h => [h.groups[0], h]),
  ...Object.values(metroSys.stations).map(s => [s.groups[0], s]), [motorsSys.groups[0], motorsSys]];
hooks.inBuilding = (x, y) => PEEK.some(([g]) => { const b = g.userData.peek.box; return x > b[0] && x < b[1] && y > b[2] && y < b[3]; });
// a shut building hides who is in it; a station only those up on its floors, not those in the street beneath it
hooks.closedAt = (x, y, p) => { for (const [g] of PEEK) { const pk = g.userData.peek, b = pk.box;
  if (x > b[0] && x < b[1] && y > b[2] && y < b[3]) { if (pk.hides && !pk.hides(x, y, p)) continue; return !pk.cut?.visible; } } return false; };
function updatePeek() {
  let c = null; if (selected) { const b = bounds(selected); c = [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]; }
  for (const [g, ent] of PEEK) { const pk = g.userData.peek, [x0, x1, y0, y1] = pk.box;
    const inside = p => !!p && p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;
    // a station also opens when the view comes in close over it
    const near = pk.near && camera.zoom > 9 && controls.target.x > x0 - 6 && controls.target.x < x1 + 6 && controls.target.z > y0 - 6 && controls.target.z < y1 + 6;
    const on = selected === ent || inside(c) || !!routeNext && inside([routeNext.p.x, routeNext.p.z]) || near;
    if (on && !pk.cut) {
      const s = pk.section({ twoBeds:ent.household?.n >= 3 }); s.cut.visible = s.inside.visible = false;
      g.add(s.cut, s.inside); Object.assign(pk, { cut:s.cut, inside:s.inside }); ent.spots = s.spots;
    }
    if (pk.cut && pk.cut.visible !== on) { pk.cut.visible = on; pk.shell.visible = !on; if (pk.inside) pk.inside.visible = on; ent.peeked?.(on); for (const p of sim.people) p.place(); }
    if (on) ent.whileOpen?.();
    if (ent === warehouse) for (const s of RACK) if (s.pallet) s.pallet.group.visible = on; }
}

let down = null, pointer = null, hoverDirty = false;
canvas.addEventListener('pointerdown', e => { down = { x:e.clientX, y:e.clientY, t:performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 700) select(hit(e.clientX, e.clientY));
  down = null;
});
canvas.addEventListener('pointermove', e => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6) { goal = null; setFollow(false); }   // a real drag takes the camera back
  if (e.pointerType === 'mouse' && !e.buttons) { pointer = [e.clientX, e.clientY]; hoverDirty = true; }
});
canvas.addEventListener('pointerleave', () => { pointer = null; hovered = null; canvas.classList.remove('over'); });
const vehicles = () => [...sim.forklifts, ...sim.trucks, ...incident.cars, courier, fireSys.engine, ...(trainSys.state === 'away' ? [] : [trainSys]), ...metroSys.trains, motorsSys.shuttle, ...portSys.vehicles()].sort((a, b) => a.id.localeCompare(b.id));
function cycle(d) { const v = vehicles(), i = v.indexOf(selected); if (v.length) select(v[i < 0 ? (d > 0 ? 0 : v.length - 1) : (i + d + v.length) % v.length]); }
let paused = false;
function togglePause() { paused = !paused; $('pause').setAttribute('aria-pressed', paused); $('pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('pause').innerHTML = paused ? '<svg viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5z"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg>'; refresh(); }
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next; applyTheme();
  try { localStorage.setItem('factory-yard-theme', next); } catch { /* private window: the choice lasts this visit */ }
}
// After dark the page around the map turns dark too (in a light theme it would otherwise frame a black town),
// and the caption says it is night. Hysteresis keeps it from flickering at the turn.
let afterDark = false, turnT = 0;
// the caption after the clock: night, and the weather
let phaseKey = null;
function phaseText() { const t = [afterDark ? 'night' : '', weather.word()].filter(Boolean).map(w => ` · ${w}`).join(''); if (t !== phaseKey) { phaseKey = t; $('phase').textContent = t; } }
function markNight(n) {
  if (afterDark ? n > 0.45 : n < 0.55) return;
  afterDark = !afterDark; const root = document.documentElement;
  root.classList.add('turning'); root.classList.toggle('after-dark', afterDark);
  clearTimeout(turnT); turnT = setTimeout(() => root.classList.remove('turning'), 1300);
  phaseText();
}
// The GPU can drop the context (driver reset, memory pressure, a GPU switch). three.js restores it by itself;
// meanwhile say so instead of leaving a blank plate, then re-tint everything once it is back.
let lost = false;
canvas.addEventListener('webglcontextlost', () => { lost = true; const n = $('note'); n.hidden = false; n.textContent = 'Redrawing the figure…'; console.warn('Factory Yard: WebGL context lost'); });
canvas.addEventListener('webglcontextrestored', () => { lost = false; $('note').hidden = true; applyTheme(); resize(); console.warn('Factory Yard: WebGL context restored'); });
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
$('zoomIn').onclick = () => zoomBy(1.4); $('zoomOut').onclick = () => zoomBy(1 / 1.4); $('home').onclick = resetView;
$('pause').onclick = togglePause; $('theme').onclick = toggleTheme; $('time').onclick = skipTime;
$('cardClose').onclick = () => { select(null); canvas.focus(); };
$('cardFollow').onclick = () => setFollow(!follow);
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button')) return;
  if (e.key.startsWith('Arrow')) { goal = null; setFollow(false); return; }
  const act = { Escape:() => select(null), f:() => setFollow(!follow), F:() => setFollow(!follow), ']':() => cycle(1), '[':() => cycle(-1), ' ':togglePause,
    '+':() => zoomBy(1.4), '=':() => zoomBy(1.4), '-':() => zoomBy(1 / 1.4), '_':() => zoomBy(1 / 1.4), '0':resetView, Home:resetView, t:toggleTheme, T:toggleTheme,
    n:skipTime, N:skipTime, 1:() => goView(0), 2:() => goView(1), 3:() => goView(2), 4:() => goView(3), 5:() => goView(4), 6:() => goView(5), 7:() => goView(6), 8:() => goView(7), 9:() => goView(8), p:() => goView(9), P:() => goView(9) }[e.key];
  if (act) { act(); e.preventDefault(); }
});

// ---- loop ----
let last = performance.now(), acc = 0, cardT = 0;
// one bad frame is logged (once per message) and skipped; it never stops the loop
const reported = new Set();
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  try { tick(now); } catch (err) { const k = String(err?.stack ?? err); if (!reported.has(k)) { reported.add(k); console.error('Factory Yard frame error', err); } }
}
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) { acc += dt; while (acc >= STEP) { sim.step(STEP); acc -= STEP; } }
  if (shift.h < shift.goal) shift.h = Math.min(shift.goal, shift.h + dt * (REDUCED ? 60 : 5));
  // rain and fog dim the town a little (windows half-light), and are drawn round the view
  shade(Math.max(night(), 0.32 * weather.rain() + 0.15 * weather.fog())); markNight(night());
  rain.update(dt, controls.target, stage.clientWidth / camera.zoom, weather.rain()); fog.update(dt, sim.t, weather.fog()); phaseText();
  const k = REDUCED ? 1 : 1 - Math.exp(-dt * 6);
  if (follow && selected) { const b = bounds(selected); moveTarget(controls.target.clone().lerp(v3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2), k)); }
  if (goal) {
    if (goal.target) moveTarget(controls.target.clone().lerp(goal.target, k));
    camera.zoom += (goal.zoom - camera.zoom) * k; camera.updateProjectionMatrix();
    if (Math.abs(goal.zoom - camera.zoom) < 1e-3 * goal.zoom && (!goal.target || controls.target.distanceTo(goal.target) < 0.05)) goal = null;
  }
  controls.update(dt);
  // slide the target along the view ray onto the ground (an invisible move), then keep it over the world
  const t = controls.target; moveTarget(t.clone().addScaledVector(ISO, -t.y / ISO.y));
  moveTarget(v3(clamp(t.x, WORLD.x0, WORLD.x1), 0, clamp(t.z, WORLD.y0, WORLD.y1)));
  camera.updateMatrixWorld();
  // people's detail by how big they are on screen (zoom is screen px per metre): a lite figure under about 4 px a
  // metre, none at all under about 1.5
  const tiny = camera.zoom < 4.2, far = camera.zoom < 1.5;
  if (tiny !== TINY || far !== FAR) { setTiny(tiny, far); setTextFar(far); motorsSys.detail(!tiny); portSys.detail(far); for (const p of sim.people) p.place(); for (const c of sim.cars) c.place(); for (const t of metroSys.trains) t.place(); for (const b of brtSys.buses) b.place();
    // a pallet a few pixels across is its load and nothing else: one draw call instead of four
    for (const pl of sim.pallets) for (const m of pl.group.children) if (m.userData.fill !== 'kob') m.visible = !far; }
  updatePeek();
  // a selection that has changed its model (a car off a tower's shared part) gets its highlight again
  if (selected && selected.groups?.[0] !== liveG) { liveG = selected.groups?.[0]; setLive(selected, true); }
  if (hoverDirty && pointer) { hoverDirty = false; hovered = hit(...pointer); canvas.classList.toggle('over', !!hovered); }
  placeTag($('tagSel'), selected, selected ? `${selected.id} · ${selected.info().status}` : '');
  placeTag($('tagHover'), hovered !== selected ? hovered : null, hoverText(hovered));
  updateReticle();
  if ((cardT -= dt) <= 0) {
    cardT = 0.25; refresh(); drawRoute();
  }
  const ck = clock(sim.t); if ($('clock').textContent !== ck) $('clock').textContent = ck;
  // the next stop's name, when it is on screen and clear of the selection's own tag
  const sp = routeNext?.stop && screenAt(routeNext.p), sa = sp && anchorOf(selected);
  if (sp && sp[0] > 0 && sp[0] < stage.clientWidth && sp[1] > 30 && sp[1] < stage.clientHeight && Math.hypot(sp[0] - sa[0], sp[1] - sa[1]) > 70) placeAt($('tagStop'), sp, `next · ${routeNext.stop}`);
  else $('tagStop').hidden = true;
  if (!lost) renderer.render(scene, camera);
}
refresh(); markNight(night());
requestAnimationFrame(frameLoop);
window.__yardReady = true;

// ---- debug hook for automated checks (?debug) ----
if (DEBUG) {
  const all = () => [...sahelSys.buildings, ...Object.values(metroSys.stations), ...metroSys.trains, ...brtSys.stations, ...motorsSys.entities(), ...portSys.entities(), factory, conveyor, gate, warehouse, whGate, shop, bank, policeStation, fireSys.station, worksSys.works, worksSys.lot.entity, ...worksSys.line.bodies.filter(Boolean), ...worksSys.line.driving, ...worksSys.lot.kept, trainSys, cafe, townHall, lighthouse, range, ...flats, ...homes,
    fairSys.pier, ...fairSys.rides, fishingSys.kestrel, ...sim.forklifts, ...sim.trucks, ...sim.cars, ...sim.people, ...BOATS, ...sim.pallets];
  const find = id => all().find(e => e.id === id);
  window.yard = {
    sim, conveyor, shop, whGate, incident, bank, RACK, SHELF, SPOTS, BUS_STOPS, camera, controls, renderer, scene, hourAt, night, PROTO, pose, hooks, PORTALS, nextPortal,
    all:() => all().map(e => ({ id:e.id, kind:e.kind, status:e.info().status })),
    step:s => { for (let t = 0; t < s; t += STEP) sim.step(STEP); },
    skip:hours => { shift.goal += hours; shift.h = shift.goal; },
    look:(x, y, k) => { goal = null; setFollow(false); moveTarget(W(x, y, 0)); camera.zoom = fitZoom * k; camera.updateProjectionMatrix(); },
    view:i => { const v = frame(stage.clientWidth, stage.clientHeight, VIEWS[i]); goal = null; moveTarget(v.target); camera.zoom = v.zoom; camera.updateProjectionMatrix(); },
    select:id => select(find(id) ?? null), selected:() => selected?.id ?? null, find,
    // run one frame now (works in a hidden window, where the browser holds animation frames) and count its draw calls
    drawCalls:() => { tick(performance.now()); return renderer.info.render.calls; },
    // place an online order now (for a home by id, or any): returns the order
    order:id => placeOrder(id ? find(id) : homes[Math.floor(Math.random() * homes.length)]), orders, courier, roadnet:{ trip, locate, kerbStop, EDGES },
    // start the bank job now (when the town is quiet)
    robbery:() => { if (incident.phase === 'quiet') incident.next = sim.t; return incident.phase; },
    // a chimney fire now, at a house by id or any house with a chimney (when none is burning): returns the house
    worksSys, trainSys, metroSys, brtSys, motorsSys, portSys,
    // the next train now (when none is in): returns its state
    train:() => { if (trainSys.state === 'away') trainSys.next = sim.t; return trainSys.state; },
    fire:id => fireSys.blaze.phase === 'quiet' ? fireSys.blaze.start(id ? find(id) : undefined).id : `busy: ${fireSys.blaze.phase}`, fireSys,
    // weather now: 'rain', 'fog' or 'clear', for some seconds
    weather:(kind = 'rain', secs = 60) => { if (kind === 'clear') { weather.kind = 'clear'; } else weather.set(kind, secs); return weather.kind; }, weatherState:weather,
    screenOf:id => { const e = find(id); scene.updateMatrixWorld(); camera.updateMatrixWorld(); const p = (e.groups[0] ? e.groups[0].localToWorld(W(...(e.pick ?? [0, 0, 1]))) : W(...e.pick)).project(camera), r = canvas.getBoundingClientRect();
      return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; },
  };
}
}
