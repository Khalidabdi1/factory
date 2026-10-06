import * as THREE from 'three';
import { noop, scene } from '../shared';
import { EAST, LINE_EAST, ROAD_EAST, gorgeC, landZ } from '../land';
import { buildEast } from '../world/east';
import { night, sim } from './core';
import { weather } from './weather';

// ---- the east country: what a click on it says ----
// The land answers with the place under the pointer; the Vale Road with itself (and how many are on it); Line 1's way
// out there with the line.
type Place = { id: string, kind: string, rows: [string, string][], status: () => string };
const PLACES: Record<string, Place> = {
  woods:{ id:'Sahel Woods', kind:'Woods', rows:[['Trees', 'oak, pine, poplar'], ['Paths', 'none yet'], ['Beyond', 'Harrow Ridge']], status:() => night() > 0.5 ? 'dark under the trees' : 'still' },
  harrow:{ id:'Harrow Ridge', kind:'Ridge', rows:[['Highest point', '412 m'], ['West face', 'the Vale Road climbs it in four hairpins'], ['Under it', 'Line 1, 120 m of tunnel; the freight line'],
    ['East face', 'a cliff over Raven Gorge']], status:() => weather.fog() > 0.3 ? 'in cloud' : 'clear to the top' },
  gorge:{ id:'Raven Gorge', kind:'Gorge', rows:[['Depth', 'about 30 m below the rims'], ['Stream', 'runs all year, down to the sea'], ['Crossings', 'the Line 1 arch, the Vale Road suspension bridge, the coast road at its mouth'],
    ['Floor', 'gravel, alders and willows, boulders']], status:() => weather.raining() ? 'the stream rising' : 'the stream low' },
  moor:{ id:'High Moor', kind:'Plateau', rows:[['Height', 'about 260 m above the sea'], ['Ground', 'heath: gorse, hawthorn, stones'], ['Across it', 'Line 1 in a cutting, the Vale Road']], status:() => night() > 0.5 ? 'dark and clear' : 'wind over the heather' },
  beacon:{ id:'Beacon Hill', kind:'Hill', rows:[['Height', '560 m'], ['On top', 'nothing yet'], ['Sky', 'the darkest for miles']], status:() => night() > 0.5 ? 'stars out' : 'clear' },
  ridge2:{ id:'Long Edge', kind:'Ridge', rows:[['Highest point', '420 m'], ['Through it', 'Line 1 and the Vale Road, in tunnels'], ['East face', 'falls into Millbrook Vale']], status:() => 'quiet' },
  vale:{ id:'Millbrook Vale', kind:'Valley', rows:[['Floor', 'farmland, opening south to the sea'], ['Village', 'Millbrook'], ['Line 1', 'the end of the line'], ['Road', 'the Vale Road, on to the east']], status:() => night() > 0.5 ? 'a few lights' : 'farmed' },
  north:{ id:'the High Range', kind:'Mountains', rows:[['Highest point', '2,210 m'], ['Snow', 'on the tops all year']], status:() => 'snow on the tops' },
  coast:{ id:'the east coast', kind:'Coast', rows:[['Shore', 'sand, from Sahel to the east edge'], ['Road', 'the coast road']], status:() => 'surf on the sand' },
};
const placeAt = (x: number, y: number) => {
  const z = landZ(x, y);
  if (y > 236) return PLACES.coast;
  if (Math.abs(x - gorgeC(y)) < 30) return PLACES.gorge;
  if (y < -10 && z > 30 && !(x > 1300 && x < 1550)) return PLACES.north;
  if (x < 1062) return PLACES.woods;
  if (x < 1260) return PLACES.harrow;
  if (Math.hypot(x - 1440, y - 45) < 62) return PLACES.beacon;
  if (x < 1530) return PLACES.moor;
  if (x < 1612) return PLACES.ridge2;
  return PLACES.vale;
};
const onRoadEast = (c: any) => c.front && c.front.x > EAST.x0 + 2 && c.front.y < 200;

export function buildEastSys(metroSys: any) {
  metroSys.buildCountry();
  const lineEnt = metroSys.lines[0], e = buildEast(); scene.add(e.group);
  e.green.traverse(o => { o.raycast = noop; });
  const ents = Object.fromEntries(Object.entries(PLACES).map(([k, P]) => [k, { kind:'range', id:P.id, groups:[e.land], pick:[0, 0, 0], P,
    info() { return { kind:P.kind, title:P.id, status:P.status(), rows:P.rows }; }, readout() { return `${P.id} · ${P.status()}`.toLowerCase(); } }]));
  const land = { kind:'range', id:'the east country', groups:[e.land], pick:[1300, 100, 30],
    resolve(pt: THREE.Vector3) { const P = placeAt(pt.x, pt.z), ent = Object.values(ents).find(q => q.P === P)!; ent.pick = [pt.x, pt.z, pt.y]; return ent; },
    info() { return { kind:'Country', title:'the east country', status:'', rows:[] }; }, readout() { return 'the east country'; } };
  e.land.userData.entity = land;
  const lengthOf = (C: typeof ROAD_EAST, m: string) => C.samples.filter(q => q.mode === m).length;
  const road = { kind:'line', id:'Vale Road', groups:[e.road], pick:[1190, 98, 30],
    info() {
      const n = sim.cars.filter(onRoadEast).length;
      return { kind:'Road · two lanes', title:'Vale Road', status:`${n} ${n === 1 ? 'car' : 'cars'} on it`, rows:[['From', 'the end of Sahel Blvd'], ['To', 'Millbrook and on east'],
        ['Length', `${(ROAD_EAST.path.length / 1000).toFixed(1)} km`], ['Hairpins', 'three, up Harrow Ridge\'s west face'], ['Over Raven Gorge', 'a suspension bridge, 60 m between its pylons'],
        ['Tunnel', `${lengthOf(ROAD_EAST, 'tunnel')} m, under Long Edge`], ['Into Millbrook', 'a curving viaduct down the valley side']] };
    },
    readout() { return 'vale road'; } };
  e.road.userData.entity = road;
  e.line.userData.entity = lineEnt;
  return { ...e, road, land, places:Object.values(ents), lineLength:LINE_EAST.path.length, update(_dt: number) {} };
}
