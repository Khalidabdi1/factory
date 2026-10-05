// @ts-nocheck
import * as THREE from 'three';

// Page elements, flags and the scene every module shares.
export const $ = id => document.getElementById(id);
export const stage = $('stage'), canvas = $('view');
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DEBUG = new URLSearchParams(location.search).has('debug');
export const noop = () => {};
export const scene = new THREE.Scene();
// set once the renderer exists: texture anisotropy for text drawn on faces
export const gfx = { aniso:1 };
// late-bound calls into the view, so the simulation never imports it
// and a few things the simulation reaches without importing them (they import it): the courier and its orders
export const hooks = { forget:noop, lookInside:noop, track:noop, select:noop, closedAt:() => false, orderFor:() => null, courier:null, orders:{ list:[], delivered:0 },
  bankOpen:() => false, bankVisit:noop, fairOpen:() => false, fairVisit:noop, raining:() => false, inBuilding:() => false, onRain:noop, weather:null };
