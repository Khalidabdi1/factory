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
export const hooks = { forget:noop, lookInside:noop };
