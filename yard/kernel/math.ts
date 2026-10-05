// @ts-nocheck

// ---- small maths ----
export const rng = (s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(+new URLSearchParams(location.search).get('seed') || 20261004);
export const rand = (a, b) => a + (b - a) * rng();
export const pick = a => a[Math.floor(rng() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const ease = t => t * t * (3 - 2 * t);
