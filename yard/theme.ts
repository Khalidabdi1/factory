// @ts-nocheck
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ---- tokens → materials ----
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// window and lamp read as dark glass and pale metal by day, and light up at night; screen is a pierced screen's
// holes, two-tone dark by day (the shadow behind the lattice) and lit like a window after dark
const FILL_TOK = { ground:'--ground', road:'--road', body:'--body', deck:'--deck', kob:'--ko', kod:'--ko-deck', glass:'--glass', livef:'--live',
  window:'--glass', lamp:'--deck', sea:'--sea', sand:'--sand', grass:'--grass', snow:'--snow', screen:'--ko' };
const LINE_TOK = { line:'--line', detail:'--detail', koline:'--ko-line', live:'--live' };
export const TEXT_TOK = { ink:'--ink', paint:'--line' };
// Night is one palette for both themes: the day colours slide toward it after dusk.
const NIGHT = {
  fill:{ ground:'#0e0f10', road:'#0a0b0b', body:'#111213', deck:'#141516', kob:'#8c9093', kod:'#999da0', glass:'#08090a', livef:'#f4f5f5',
    window:'#e9ebec', lamp:'#f4f5f5', sea:'#090a0b', sand:'#141516', grass:'#0c0d0e', snow:'#232628', screen:'#e9ebec' },
  line:{ line:'#33373a', detail:'#202325', koline:'#3d4144', live:'#f4f5f5' },
  text:{ ink:'#70757a', paint:'#33373a' } };
export const FILL = {}, LINE = {}, TEXT = { ink:[], paint:[] };
// Faces are flat and unlit, pushed back a hair so the hairlines drawn on them always win the depth test.
for (const k in FILL_TOK) FILL[k] = new THREE.MeshBasicMaterial({ side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 });
// 1 css px at any zoom: the WebGL stand-in for vector-effect:non-scaling-stroke.
for (const k in LINE_TOK) LINE[k] = new LineMaterial({ linewidth:1, worldUnits:false });
const DAYC = { fill:{}, line:{}, text:{} }, NIGHTC = { fill:{}, line:{}, text:{} };
for (const g in NIGHT) for (const k in NIGHT[g]) NIGHTC[g][k] = new THREE.Color(NIGHT[g][k]);
let dusk = 0;   // 0 is full day, 1 full night
export function applyTheme() {
  for (const k in FILL_TOK) DAYC.fill[k] = new THREE.Color(css(FILL_TOK[k]));
  for (const k in LINE_TOK) DAYC.line[k] = new THREE.Color(css(LINE_TOK[k]));
  for (const k in TEXT_TOK) DAYC.text[k] = new THREE.Color(css(TEXT_TOK[k]));
  shade(dusk, true);
}
// windows and lamps come on early in the dusk and go off late in the dawn
export function shade(n, force) {
  if (!force && Math.abs(n - dusk) < 0.002) return;
  dusk = n; const lit = Math.min(1, n * 1.8);
  for (const k in FILL) FILL[k].color.copy(DAYC.fill[k]).lerp(NIGHTC.fill[k], k === 'window' || k === 'lamp' || k === 'screen' ? lit : n);
  for (const k in LINE) LINE[k].color.copy(DAYC.line[k]).lerp(NIGHTC.line[k], n);
  for (const k in TEXT) { const c = DAYC.text[k].clone().lerp(NIGHTC.text[k], n); for (const m of TEXT[k]) m.color.copy(c); }
}
