// @ts-nocheck
import * as THREE from 'three';
import { $, canvas, gfx, hooks, noop, scene } from './shared';
import { W } from './kernel/iso';
import { applyTheme, css } from './theme';
import { Part, TEX_PX, glow, pose } from './kernel/part';
import { clamp, ease, pick, rand, rng } from './kernel/math';
import { Path } from './kernel/path';
import './kernel/graph';
import { BAYS, CURB, DOCKS, ORCHARD, RACK, SEA_Z, SHELF, STAGE, SX, SY, WORLD, onRoad } from './layout';
import { buildWorld } from './world/ground';
import { buildRange, hillHeight } from './world/range';
import { bayLamp, buildBooth, buildConveyor, buildFactory, buildGate, buildShop, buildShopBox, buildWarehouse, buildWhGate } from './world/industry';
import { buildBank, buildCafe, buildFlats, buildHouse, buildPolice, buildTownHall, buildVilla } from './world/town';
import { buildBus, buildCar, buildCarLite, buildForklift, buildPallet, buildParcelVan, buildPoliceCar, buildTractor, buildTrailer, buildVan } from './models/vehicles';
import { LOOKS, OUTFITS, buildDog, buildPerson } from './models/people';
import { buildLighthouse, buildMotorboat, buildSailboat } from './models/sea';
import { DRIVERS, PROTO, Pallet, SKUS, STEP, WARMUP, clock, conveyor, hourAt, night, putIn, resetStats, sim } from './sim/core';
import { roadVehicles } from './sim/roads';
import { COAST, Car, LOOPS, ROAD, SPOTS, custNext, customerCar } from './sim/cars';
import { BUS_PATH, BUS_STOPS, Truck, VAN_LOOP, busHolds, flatVariant, vanHolds } from './sim/trucks';
import { Forklift, PLANT, WH } from './sim/forklifts';
import './sim/person';
import { Guard, PICKERS, Picker, SHOPPERS, Shopper, Staff, WALKERS, Walker, nextPortal, portal, setGuard, shop, startPortal, walkSpawn, whGate } from './sim/people';
import { PoliceCar, bank, incident, policeStation } from './sim/police';
import { BOATS, Boat } from './sim/boats';
import { entity, home, homes, lightsText } from './sim/homes';
import { Courier, tickOrders } from './sim/courier';
import { buildFair } from './sim/fair';
import { buildFishing } from './sim/fishing';
import { weather } from './sim/weather';
import { buildFireService } from './sim/fire';
import { buildWorks } from './sim/works';
import { buildTrain } from './sim/train';
import { buildWoods } from './world/woods';
import { THROUGH, buildSahel } from './sim/sahel';
import { buildMetro } from './sim/metro';
import { buildBrt } from './sim/brt';
import { buildMotors } from './sim/motors';
import { buildPort } from './sim/port';
import { buildEastSys } from './sim/east';
import { initView } from './view';

applyTheme();

// ---- renderer ----
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true }); }
catch (err) { $('note').hidden = false; $('note').textContent = 'This figure needs WebGL, which this browser has turned off.'; $('readout').textContent = 'no webgl'; throw err; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
// Anything outside the world's slab is cut, so traffic and walkers slide in and out of the plate's edge.
renderer.clippingPlanes = [
  new THREE.Plane(new THREE.Vector3(1, 0, 0), -WORLD.x0 + 0.05), new THREE.Plane(new THREE.Vector3(-1, 0, 0), WORLD.x1 + 0.05),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -WORLD.y0 + 0.05), new THREE.Plane(new THREE.Vector3(0, 0, -1), WORLD.y1 + 0.05)];
gfx.aniso = renderer.capabilities.getMaxAnisotropy();

// ---- assemble ----
await Promise.race([document.fonts.load(`500 ${TEX_PX}px ${css('--mono')}`), new Promise(r => setTimeout(r, 2500))]).catch(noop);
PROTO.tractor = buildTractor(); PROTO.trailer = buildTrailer(); PROTO.forklift = buildForklift(); PROTO.van = buildVan(); PROTO.bus = buildBus(); PROTO.police = buildPoliceCar(); PROTO.parcelVan = buildParcelVan();
PROTO.car = { n:buildCar(false, 'n'), k:buildCar(false, 'k') }; PROTO.carVan = { n:buildCar(true, 'n'), k:buildCar(true, 'k') };
PROTO.carLite = { n:buildCarLite(false, 'n'), k:buildCarLite(false, 'k') }; PROTO.carVanLite = { n:buildCarLite(true, 'n'), k:buildCarLite(true, 'k') };
PROTO.pallet = [0, 1, 2].map(buildPallet);
// every look in each of its outfits, full and lite
PROTO.person = Object.fromEntries(LOOKS.map(k => [k, OUTFITS[k].map((_, i) => buildPerson(k, i))]));
PROTO.personLite = Object.fromEntries(LOOKS.map(k => [k, OUTFITS[k].map((_, i) => buildPerson(k, i, true))]));
PROTO.dog = buildDog();
const world = buildWorld(), rangeG = buildRange();
const factoryG = buildFactory(), conveyorG = buildConveyor(), gateG = buildGate(), whG = buildWarehouse(), whGateG = buildWhGate(), shopG = buildShop();
whGateG.add(buildBooth());
world.traverse(o => { o.raycast = noop; });   // ground, streets, trees: nothing to click, and the heaviest mesh to test on every hover
scene.add(world, rangeG, factoryG, conveyorG, gateG, whG, whGateG, shopG, ...BAYS.map(bayLamp), ...DOCKS.map(bayLamp));
whGate.panel = whGateG.getObjectByName('panel');
// the boxes on the shelves and in the stockroom are drawn only while the shop is open to view; they are posed in the
// town's frame, so they hang off the scene rather than the shop, which stands moved from where it was drawn
const boxProto = PROTO.shopBox = buildShopBox(), shopInside = new THREE.Group(); shopInside.name = 'shopInside'; shopInside.visible = false; scene.add(shopInside);
shopG.userData.peek.inside = shopInside;
for (const s of SHELF) { s.mesh = boxProto.clone(); pose(s.mesh, s.x, s.y, 0, s.z + CURB); s.mesh.visible = false; shopInside.add(s.mesh); }
shop.stockMeshes = []; for (let l = 0; l < 2; l++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
  const m = boxProto.clone(); pose(m, 363.6 + SX + 1.1 * i, 95.6 + SY + 1.0 * j, 0, 0.56 * l + CURB); shopInside.add(m); shop.stockMeshes.push(m); }
// staff cars, nose in: the north row faces +y, the south row faces −y
for (const [i, row, van] of [[1, 1, 0], [4, 1, 1], [7, 1, 0], [11, 1, 0], [2, 1, 0], [9, 1, 1]]) {   // one row: the north row made way for the forklifts' lane
  const c = buildCar(!!van, rng() < 0.4 ? 'k' : 'n', false), x = 141.7 + 3.4 * i;
  if (row) pose(c, x, 32, -Math.PI / 2); else pose(c, x, 15, Math.PI / 2);
  scene.add(c);
}

// the homes' gardens, pools and garages share one part
const gardens = new Part();
// B3, facing Market St: four houses with driveways; C1, facing Coast Rd: five more
for (let i = 0; i < 4; i++) {
  const lx = 309.6 + 25.2 * i, o = { x:lx + 3, y:172, w:11, d:12, h:i % 2 ? 5.6 : 4.4, rh:i === 2 ? 3.6 : 3, ridgeY:i === 1, door:i === 3 ? 7.4 : 2,
    lotX0:lx, lotX1:lx + 25.2, lotY1:195.4, car:i === 2 ? null : [lx + 18, 190], gardens };
  home(buildHouse(o), { id:`No. ${12 + i * 2} Market St`, street:'Market St', door:[o.x + o.door + 0.55, 184.6], kerb:[o.x + o.door + 0.55, 197] });
}
for (let i = 0; i < 5; i++) {
  const lx = 69.6 + 20.16 * i, o = { x:lx + 2.5, y:226, w:11.5, d:11, h:i === 2 ? 5.6 : 4.4, rh:3, ridgeY:i % 2 === 0, door:i === 4 ? 7.6 : 2,
    lotX0:lx, lotX1:lx + 20.16, lotY1:257.4, car:i % 2 ? [lx + 17, 252] : null, gardens };
  home(buildHouse(o), { id:`No. ${1 + i * 2} Coast Rd`, street:'Coast Rd', door:[o.x + o.door + 0.55, 237.6], kerb:[o.x + o.door + 0.55, 259] });
}
const VILLAS = [['Villa Aster', 189.6, 50.4, 22, 13, [189.6 + 30, 236, 12, 6], [[189.6 + 46, 232], [192, 250], [189.6 + 44, 251]]],
  ['Villa Brisa', 240.4, 50, 22, 13, [240.4 + 30, 236, 12, 6], [[240.4 + 46, 232], [243, 250], [240.4 + 44, 251]]],
  ['Villa Cala', 309.6, 33.6, 18, 12, [309.6 + 4, 240, 11.5, 5.5], [[309.6 + 29.5, 228], [309.6 + 28, 251]]],
  ['Villa Dune', 343.2, 33.6, 18, 12, [343.2 + 4, 240, 11.5, 5.5], [[343.2 + 29.5, 228], [343.2 + 28, 251]]]];   // Corner Market has the corner lot
for (const [id, x, w, bw, bd, pool, palms] of VILLAS) {
  const g = buildVilla({ x, y:214.6, w, bw, bd, pool, palms, lotY1:257.4, gardens });
  home(g, { id, villa:true, street:'Coast Rd', door:[x + 3 + bw - 3.2, 214.6 + 7 + bd + 0.6], kerb:[x + 3 + bw - 3.2, 259] });
}
// Orchard Lane: six houses facing south over the lane, three with a garage and a car on the drive, porches, dormers
const ORCHARD_HOUSES = [{ w:9, h:4.4, door:2, garage:3.2, dormer:true }, { w:10, h:5.6, ridgeY:true, door:6.6, porch:true }, { w:10.5, h:4.4, door:2, porch:true },
  { w:9, h:5.6, door:5.8, garage:3.2, dormer:true }, { w:10, h:4.4, ridgeY:true, door:2 }, { w:9, h:4.4, door:2.2, garage:3.2, porch:true }];
ORCHARD.lots.forEach(([lx, lw], i) => {
  const s = ORCHARD_HOUSES[i], x = lx + 1, y = 42.5, d = 9.5;
  const o = { ...s, x, y, d, rh:3, lotX0:lx, lotX1:lx + lw, lotY1:ORCHARD.lotY1, car:s.garage ? [x + s.w + 0.2 + s.garage / 2, 57.6] : null, gardens };
  home(buildHouse(o), { id:`No. ${1 + 2 * i} Orchard Ln`, street:'Orchard Ln', door:[x + s.door + 0.55, y + d + 0.6], kerb:[x + s.door + 0.55, ORCHARD.pave] });
});
const gardensG = gardens.build('gardens'); gardensG.traverse(o => { o.raycast = noop; }); scene.add(gardensG);
const flats = [['Market Court', 72, 146, 24, 44, 15, 12], ['Harbour View', 266, 144, 24, 46, 18, 12]].map(([id, x, y, w, d, h, door]) => {
  const e = entity(buildFlats(id, x, y, w, d, h, door), { kind:'building', id, floors:h / 3, flats:Math.round(h / 3) * 6,
    info() { return { kind:'Flats', title:this.id, status:lightsText(), rows:[['Floors', String(this.floors)], ['Flats', String(this.flats)], ['Street', 'Riverside Rd']] }; } });
  e.pick = [x + w / 2, y + d, h / 2]; e.portal = portal('home', id, [x + door, y + d + 0.6], { w:3 }); return e;
});
bank.groups = [buildBank()]; bank.groups[0].userData.entity = bank; scene.add(bank.groups[0]);
const bankAlarm = bank.groups[0].getObjectByName('alarm'); incident.vaultDoor = bank.groups[0].getObjectByName('vaultDoor');
policeStation.groups = [buildPolice()]; policeStation.groups[0].userData.entity = policeStation; scene.add(policeStation.groups[0]);
const cafe = entity(buildCafe(), { kind:'building', id:'Café Mira', pick:[151, 186, 3],
  info() { const h = hourAt(sim.t), open = h >= 7 && h < 22, n = WALKERS().filter(w => w.to?.kind === 'cafe' && w.steps[0]?.do === 'wait').length;
    return { kind:'Café', title:'Café Mira', status:open ? 'open' : 'closed', rows:[['Hours', '07:00–22:00'], ['On the terrace', `${n} ${n === 1 ? 'guest' : 'guests'}`], ['Street', 'Market St']] }; } });
const townHall = entity(buildTownHall(), { kind:'building', id:'Town Hall', pick:[241, 172, 6],
  info() { return { kind:'Town hall', title:'Town Hall', status:`the clock says ${clock(sim.t)}`, rows:[['Built', '1911'], ['Clock', 'two faces, south and east'], ['Weather', weather.word() || 'fair'], ['Showers today', String(weather.showers)], ['Street', 'Riverside Rd']] }; } });
const hands = ['hourF', 'minF', 'hourS', 'minS'].map(n => townHall.groups[0].getObjectByName(n));
portal('home', 'Town Hall', [241, 173.6], { w:1 });
const lighthouse = entity(buildLighthouse(), { kind:'lighthouse', id:'Harbour Light', pick:[402, 312.9, 6],
  info() { return { kind:'Lighthouse', title:'Harbour Light', status:weather.fog() > 0.3 ? 'beam on · fog signal sounding' : this.beam.visible ? 'beam on · one turn every 7 s' : 'off for the day', rows:[['Height', '14 m'], ['Range', '18 nautical miles'], ['Lit', 'dusk to dawn']] }; } });
lighthouse.beam = lighthouse.groups[0].getObjectByName('beam');
const range = entity(rangeG, { kind:'range', id:'Grey Peaks', pick:[160, -50, hillHeight(160, -50)],
  info() { return { kind:'Hills', title:'Grey Peaks', status:night() > 0.5 ? 'dark against the sky' : 'snow on the tops', rows:[['Highest point', '1,840 m'], ['Snow line', 'about 1,200 m'], ['Woods', 'pine on the lower slopes']] }; } });
// bus shelters: a back wall behind where people wait, two side panels, a roof, a stop sign
const shelters = new Part();
for (const st of BUS_STOPS) {
  const p = shelters, [x, y] = st.wait, ew = Math.abs(st.at[1] - y) > 2, sg = ew ? Math.sign(y - st.at[1]) : Math.sign(x - st.at[0]);
  if (ew) { const wy = y + sg * 0.9; p.box(x - 1.8, wy - 0.05, CURB, 3.6, 0.1, 2.2); for (const dx of [-1.8, 1.7]) p.box(x + dx, Math.min(wy, wy - sg * 1.2), CURB, 0.1, 1.2, 2.3);
    p.box(x - 2, Math.min(wy, wy - sg * 1.4), CURB + 2.3, 4, 1.4, 0.1); p.box(x + 2.6, y - 0.05, CURB, 0.1, 0.1, 2.6); p.box(x + 2.4, y - 0.25, CURB + 2.6, 0.5, 0.5, 0.5, 'k'); }
  else { const wx = x + sg * 0.9; p.box(wx - 0.05, y - 1.8, CURB, 0.1, 3.6, 2.2); for (const dy of [-1.8, 1.7]) p.box(Math.min(wx, wx - sg * 1.2), y + dy, CURB, 1.2, 0.1, 2.3);
    p.box(Math.min(wx, wx - sg * 1.4), y - 2, CURB + 2.3, 1.4, 4, 0.1); p.box(x - 0.05, y + 2.6, CURB, 0.1, 0.1, 2.6); p.box(x - 0.25, y + 2.4, CURB + 2.6, 0.5, 0.5, 0.5, 'k'); }
  portal('stop', `the ${st.name} stop`, st.wait, { stop:st, w:1.5 });
}
scene.add(shelters.build('shelters'));

const factory = {
  kind:'factory', id:'Plant 01', groups:[factoryG], pick:[54, 48, 10],
  info() {
    const staged = STAGE.filter(s => s.pallet).length;
    return { kind:'Factory', title:'Plant 01', status:conveyor.held ? 'line held · belt full' : 'line running',
      rows:[['Pallets made', `${sim.stats.produced} this session`], ['On the belt', String(conveyor.items.length)], ['Staging', `${staged}/16 slots`],
        ['Trucks loaded', String(sim.stats.plantOut)], ['Bays busy', `${sim.trucks.filter(t => t.at?.name === 'bay').length}/2`]] };
  },
  readout() { return `plant 01 · ${conveyor.held ? 'held' : 'running'} · ${sim.stats.produced} made`; },
};
const warehouse = {
  kind:'warehouse', id:'Warehouse 01', groups:[whG], pick:[268, 58.1, 6],
  info() {
    const n = RACK.filter(s => s.pallet).length, per = l => RACK.filter(s => s.level === l && s.pallet).length;
    const stock = SKUS.map(k => [k.name, RACK.filter(s => s.pallet?.sku === k).length]).filter(([, c]) => c);
    return { kind:'Warehouse', title:'Warehouse 01', status:`${n} pallets in the racks`, bar:{ v:n, max:RACK.length, label:`racks ${n}/${RACK.length}` },
      rows:[...stock.map(([k, c]) => [k, `${c} ${c === 1 ? 'pallet' : 'pallets'}`]), ['Levels 1 · 2 · 3', [0, 1, 2].map(l => `${per(l)}/16`).join(' · ')],
        ['Received', `${sim.stats.whIn} pallets this session`], ['Shipped', `${sim.stats.whOut} pallets this session`],
        ['At the docks', sim.trucks.filter(t => t.at?.name === 'dock').map(t => t.id).join(', ') || 'none'],
        ['Loading lane', sim.trucks.find(t => t.at?.name === 'load')?.id ?? 'empty'], ['Forklifts', `${WH.forklifts.length}`],
        ['Parcels packed', String(PICKERS.reduce((n, p) => n + p.done, 0))]],
      actions:[['Look inside', () => hooks.lookInside(this)]] };
  },
  readout() { return `warehouse 01 · ${RACK.filter(s => s.pallet).length}/${RACK.length} in the racks`; },
};
conveyor.groups = [conveyorG];
const gate = {
  kind:'gate', id:'Plant gate', groups:[gateG], pick:[133, 109, 2], open:[0, 0],
  update(dt) {
    const near = x => sim.trucks.some(t => t.points.some(p => Math.hypot(p[0] - x, p[1] - 118) < 13));
    [118, 124].forEach((x, i) => { this.open[i] = clamp(this.open[i] + (near(x) ? 1 : -1) * dt * 1.4, 0, 1); });
    gateG.getObjectByName('armOut').rotation.z = ease(this.open[0]) * 1.45; gateG.getObjectByName('armIn').rotation.z = -ease(this.open[1]) * 1.45;
  },
  info() {
    const st = o => o > 0.98 ? 'open' : o < 0.02 ? 'closed' : 'moving';
    return { kind:'Gate · barriers', title:'Plant gate', status:this.open.some(o => o > 0.02) ? 'barrier up' : 'barriers down',
      rows:[['In lane', st(this.open[1])], ['Out lane', st(this.open[0])], ['Trucks out', String(sim.stats.plantOut)]] };
  },
  readout() { return `plant gate · ${sim.stats.plantOut} trucks out`; },
};
whGate.groups = [whGateG]; shop.groups = [shopG]; shopInside.userData.entity = shop;
for (const [g, e] of [[factoryG, factory], [conveyorG, conveyor], [gateG, gate], [whG, warehouse], [whGateG, whGate], [shopG, shop]]) g.userData.entity = e;

const guard = new Guard(); setGuard(guard);
for (let k = 0; k < 4; k++) new Staff(k);
for (let k = 0; k < 2; k++) new Picker(k);
for (let i = 0; i < 3; i++) new Forklift(PLANT, i);
for (let i = 0; i < 3; i++) new Forklift(WH, i);
// the fleet: flatbed 1 at its bay, flatbed 2 unloading at dock 2, flatbed 3 loaded on the road east to dock 1;
// delivery truck 1 in the loading lane, 2 at the shop, 3 on its way back; the bus between stops
const flat = (id, driver, bay, dock, at) => { const v = flatVariant(bay, dock); return new Truck({ model:'flatbed', id, driver, bay, dock, path:v.path, holds:v.holds, s:at(v) }); };
const T1 = flat('TRK-2051', DRIVERS[0], BAYS[0], DOCKS[0], v => v.holds.find(h => h.name === 'bay').s);
const T2 = flat('TRK-2052', DRIVERS[1], BAYS[1], DOCKS[1], v => v.holds.find(h => h.name === 'dock').s);
const T3 = flat('TRK-2053', DRIVERS[8], BAYS[1], DOCKS[0], v => v.path.project(262, 134.5));
BAYS[0].truck = T1; DOCKS[1].truck = T2; DOCKS[0].truck = T3;
const V1h = vanHolds(), V2h = vanHolds(), V3h = vanHolds();
const V1 = new Truck({ model:'van', id:'DLV-01', driver:DRIVERS[2], path:VAN_LOOP, holds:V1h, s:V1h.find(h => h.name === 'load').s });
const V2 = new Truck({ model:'van', id:'DLV-02', driver:DRIVERS[3], path:VAN_LOOP, holds:V2h, s:V2h.find(h => h.name === 'shop').s });
const V3 = new Truck({ model:'van', id:'DLV-03', driver:DRIVERS[5], path:VAN_LOOP, holds:V3h, s:VAN_LOOP.project(340, 263.5) });
const BUS = new Truck({ model:'bus', id:'BUS-1', driver:DRIVERS[4], path:BUS_PATH, holds:busHolds(), s:BUS_PATH.project(200, 208.5), pax:12 });
for (const t of sim.trucks) t.place();
const stockOf = (slot, age) => { const p = new Pallet(); p.t0 = age; putIn(slot, p); return p; };
for (let i = 0; i < 6; i++) stockOf(T2.slots[i], -50 + i);
for (let i = 0; i < 6; i++) stockOf(T3.slots[i], -40 + i);
for (let i = 0; i < 3; i++) stockOf(V2.slots[i], -90 + i);
// the racks open the day part-full, on every level of both rows
for (const i of [0, 1, 2, 4, 6, 9, 11, 17, 20, 22, 24, 25, 27, 30, 33, 36, 42, 45]) stockOf(RACK[i], -70 + i);
for (const [k, si] of [[0, 1], [1, 3], [2, 4], [3, 9], [4, 12], [5, 6]]) { const sl = STAGE[si]; stockOf(sl, -60 + k); }
for (let i = 0; i < 16; i++) { const s = SHELF[(i * 7) % SHELF.length]; s.sku = SKUS[i % 3].name; s.mesh.visible = true; }
for (let i = 0; i < 4; i++) shop.stock.push(SKUS[i % 3].name);
shop.drawStock();
// town traffic, the police, the boats, the waves
for (const L of LOOPS) for (let k = 0; k < L.n; k++) new Car({ role:'local', loop:L, path:L.path, yields:L.ys, s:(k + rng() * 0.4) * L.path.length / L.n, vmax:rand(9, 12) });
incident.cars = [new PoliceCar('POL-1', 229), new PoliceCar('POL-2', 239)];
const courier = new Courier();
// Sunset Pier and its rides
const fairSys = buildFair();
// Kestrel and her skipper, and the angler on the town pier
const fishingSys = buildFishing();
PROTO.sail = buildSailboat(); PROTO.motor = buildMotorboat();
new Boat({ id:'Gull', sail:true, skipper:'E. Lund', moor:[190.5, 300], proto:PROTO.sail, speed:2.6, path:new Path([[200, 320], [370, 320], [370, 326], [40, 326], [40, 320], [200, 320]], 2.8, true) });   // south of Sunset Pier
new Boat({ id:'Marlin', skipper:'R. Lopes', moor:[190.5, 308.5], proto:PROTO.motor, speed:6.5, s:300, path:new Path([[220, 334.5], [30, 334.5], [30, 329], [420, 329], [420, 334.5], [220, 334.5]], 2.8, true) });
const waves = [0, 1].map(() => { const p = new Part();
  for (let i = 0; i < 80; i++) { const x = rand(-10, 450), y = rand(299, 335), l = rand(1.5, 3.6); p.seg('detail', W(x, y, SEA_Z + 0.03), W(x + l, y, SEA_Z + 0.03)); }
  const g = p.build('waves'); scene.add(g); return g; });
// Riverside Fire Station, ENG-1 and its watch, on the old shop site
const fireSys = buildFireService();
// Car Works on its terrace in the hills, its line full and some cars already on the lot
const worksSys = buildWorks();
// the railway and FRT-7, which calls at Car Works and Plant 01
const trainSys = buildTrain();
// the woods round both towns, and the pines up the hills
const woodsG = buildWoods(); woodsG.traverse(o => { o.raycast = noop; }); scene.add(woodsG);
// Sahel, the new city east of the green belt: its streets, its towers, its traffic and people
const sahelSys = buildSahel();
// Sahel Metro: its viaducts, its five stations and their insides, its driverless trains
const metroSys = buildMetro();
// the Metrobus along Sahel Blvd's busway, and its stations on the median
const brtSys = buildBrt();
// Sahel Motors: the car shuttle from Car Works, the car towers, the showroom, the test track, the level crossing
const motorsSys = buildMotors();
// Sahel Container Terminal: the quay and its cranes, the yard, the tractors, the ship and her tugs, the breakwater
const portSys = buildPort();
// the east country: Harrow Ridge, Raven Gorge, High Moor, Millbrook; Line 1's way out there and the Vale Road
const eastSys = buildEastSys(metroSys);
applyTheme();

const lightG = factoryG.getObjectByName('light'), fans = factoryG.children.filter(o => o.name === 'fan');
const entryClear = (x, y) => !roadVehicles().some(o => o.points.some(p => Math.hypot(p[0] - x, p[1] - y) < 10));
sim.step = dt => {
  sim.t += dt;
  const late = night() > 0.5;
  conveyor.update(dt); tickOrders(dt); fairSys.update(dt); fishingSys.update(dt); weather.update(dt);
  if ((ROAD.next -= dt) <= 0 && entryClear(WORLD.x0 - 8, 134.5)) { new Car({ path:rng() < 0.38 ? THROUGH.e : ROAD.path }); ROAD.next = late ? rand(7, 14) : rand(3, 7); }
  if ((COAST.nextE -= dt) <= 0 && entryClear(WORLD.x0 - 8, 270.5)) { new Car({ role:'coast', path:COAST.e }); COAST.nextE = late ? rand(22, 40) : rand(11, 18); }
  if ((COAST.nextW -= dt) <= 0 && entryClear(WORLD.x1 + 8, 263.5)) { new Car({ role:'coast', path:COAST.w }); COAST.nextW = late ? rand(22, 40) : rand(11, 18); }
  if ((custNext.t -= dt) <= 0) { const sp = SPOTS.find(s => !s.car); if (sp && entryClear(WORLD.x0 - 8, 270.5)) customerCar(sp); custNext.t = late ? rand(60, 120) : rand(20, 40); }
  if ((shop.next -= dt) <= 0) { if (SHOPPERS().length < 10) new Shopper(); shop.next = late ? rand(14, 22) : rand(4.5, 7.5); }
  if ((walkSpawn.t -= dt) <= 0) { walkSpawn.t = rand(1.0, 2.2); if (WALKERS().length < (late ? 8 : 24)) { const f = startPortal(); new Walker(f, nextPortal(f)); } }
  for (const t of sim.trucks) t.update(dt);
  for (const c of [...sim.cars]) c.update(dt);
  for (const f of sim.forklifts) f.update(dt);
  for (const p of [...sim.people]) p.update(dt);
  sim.peds = sim.people.filter(p => onRoad(p.x, p.y));
  for (const p of sim.pallets) p.update(dt);
  for (const b of BOATS) b.update(dt);
  gate.update(dt); whGate.update(dt); incident.update(dt); fireSys.update(dt); worksSys.update(dt); trainSys.update(dt); sahelSys.update(dt); metroSys.update(dt); motorsSys.update(dt); portSys.update(dt); eastSys.update(dt);
  for (const b of BAYS) glow(b.lamp, sim.trucks.some(t => t.bay === b && t.at?.name === 'bay'));
  for (const d of DOCKS) glow(d.lamp, sim.trucks.some(t => t.dock === d && t.at?.name === 'dock'));
  glow(lightG, sim.t % 1.6 < 0.18);
  glow(bankAlarm, bank.alarm && sim.t % 0.5 < 0.25);
  for (const f of fans) f.rotation.y += dt * 5;
  lighthouse.beam.visible = night() > 0.15 || weather.fog() > 0.3; lighthouse.beam.rotation.y -= dt * 0.9;
  waves.forEach((g, k) => { g.position.x = Math.sin(sim.t * 0.21 + k * 2) * 3; g.position.z = Math.cos(sim.t * 0.17 + k) * 0.8; });
  const h = hourAt(sim.t), ah = (h % 12) / 12 * Math.PI * 2, am = (h % 1) * Math.PI * 2;
  hands[0].rotation.z = -ah; hands[1].rotation.z = -am; hands[2].rotation.x = -ah; hands[3].rotation.x = -am;
};
for (let t = 0; t < WARMUP; t += STEP) sim.step(STEP);
resetStats();

initView({ courier, fairSys, fishingSys, fireSys, worksSys, trainSys, sahelSys, metroSys, brtSys, motorsSys, portSys, eastSys, renderer, whG, shopG, factory, warehouse, gate, cafe, townHall, lighthouse, range, flats, homes });
