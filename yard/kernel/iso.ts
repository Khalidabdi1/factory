// @ts-nocheck
import * as THREE from 'three';

// ---- iso kernel (after ai-iso-skill, MIT © Tolga Cohce) ----
// Scene coords are the skill's: +x runs down-right, +y down-left, +z up. Three.js is y-up, so W swaps
// y and z; an orthographic camera looking down (-1,-1,-1) then draws exactly the skill's P(x,y,z).
export const W = (x, y, z = 0) => new THREE.Vector3(x, z, y);
// plane = origin O + in-plane axes U,V. Anything drawn in (u,v) through this matrix lies flat on that plane.
export const plane = (O, U, V) => { const u = W(...U), v = W(...V), n = new THREE.Vector3().crossVectors(u, v).normalize();
  return new THREE.Matrix4().makeBasis(u, v, n).setPosition(W(...O)); };
export const TOP   = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);   // z = const
export const FRONT = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 0, -1]);  // y = const (faces lower-left); pass its top-left corner
export const SIDE  = (x, y, z) => plane([x, y, z], [0, -1, 0], [0, 0, -1]); // x = const (faces lower-right); pass its top-left corner
