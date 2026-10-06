// @ts-nocheck
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { gfx, noop } from '../shared';
import { W } from './iso';
import { FILL, LINE, TEXT, TEXT_TOK, css } from '../theme';

// ---- parts: boxes and flat detail, collected into a few draw calls ----
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TONE = { n:['body','deck','line'], k:['kob','kod','koline'], g:['glass','glass','line'], gr:['body','ground','line'], gs:['body','grass','line'],
  l:['lamp','lamp','line'], w:['window','window','line'], s:['body','sand','line'],
  // one fill for every face: small moving parts (a person's limbs) cost two draw calls instead of three
  nb:['body','body','line'], kb:['kob','kob','koline'] };
export const TEX_PX = 64;
export class Part {
  constructor() { this.fill = {}; this.lines = {}; this.texts = []; }
  tri(k, a, b, c) { (this.fill[k] ??= []).push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }
  poly(k, p) { for (let i = 1; i < p.length - 1; i++) this.tri(k, p[0], p[i], p[i + 1]); }
  seg(k, a, b) { (this.lines[k] ??= []).push(a.x, a.y, a.z, b.x, b.y, b.z); return this; }
  // A flat polygon swept along e. Faces are turned to point away from the solid's middle; up-facing ones take the
  // deck fill, and only those steeper than 35° downward are left out, since the camera never sees them at any heading.
  extrude(pts, e, tone = 'n', { seams = true, lines = true }: { seams?: boolean, lines?: boolean } = {}) {
    const [bodyK, deckK, lineK] = TONE[tone];
    const A = pts.map(p => W(...p)), E = W(...e), B = A.map(p => p.clone().add(E));
    const mid = [...A, ...B].reduce((s, p) => s.add(p), v3(0, 0, 0)).multiplyScalar(1 / (A.length * 2));
    const face = q => {
      const n = v3(0, 0, 0).crossVectors(q[1].clone().sub(q[0]), q[2].clone().sub(q[0])).normalize();
      if (n.dot(q.reduce((s, p) => s.add(p), v3(0, 0, 0)).multiplyScalar(1 / q.length).sub(mid)) < 0) n.negate();
      if (n.y < -0.82) return;
      this.poly(n.y > 0.6 ? deckK : bodyK, q);
    };
    face(A); face(B);
    for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; face([A[i], A[j], B[j], B[i]]); }
    if (lines) for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length;
      this.seg(lineK, A[i], A[j]); this.seg(lineK, B[i], B[j]); if (seams) this.seg(lineK, A[i], B[i]); }
    return this;
  }
  // box at (x,y,z), size w along x, d along y, h along z — same signature as the skill's box()
  box(x, y, z, w, d, h, tone?, o?) { return this.extrude([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], [0, 0, h], tone, o); }
  cylZ(cx, cy, z, r, h, n = 12, tone?) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]); }
    return this.extrude(p, [0, 0, h], tone, { seams:false }); }
  cylY(cx, y, cz, r, len, n = 10, tone?) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
    return this.extrude(p, [0, len, 0], tone, { seams:false }); }
  // 2D linework in a face's local units, like drawing inside the skill's <g transform="${FRONT(…)}">.
  // lift nudges it off the face along the outward normal (negative for faces whose plane normal points out).
  draw(M, segs, k = 'detail', lift = 0.04) {
    const off = v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-lift);
    const at = (u, v) => v3(u, v, 0).applyMatrix4(M).add(off);
    for (let i = 0; i < segs.length; i += 4) this.seg(k, at(segs[i], segs[i + 1]), at(segs[i + 2], segs[i + 3]));
    return this;
  }
  rect2(M, x, y, w, h, k?, lift?) { return this.draw(M, [x, y, x + w, y, x + w, y, x + w, y + h, x + w, y + h, x, y + h, x, y + h, x, y], k, lift); }
  fill2(M, x, y, w, h, k = 'glass', lift = 0.03) {
    const off = v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-lift);
    const at = (u, v) => v3(u, v, 0).applyMatrix4(M).add(off);
    this.poly(k, [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)]);
    return this;
  }
  text(M, str, x, y, size, k = 'ink', anchor = 'start', lift = 0.035) { this.texts.push({ M, str, x, y, size, k, anchor, lift }); return this; }
  // any three.js geometry, flat-filled by facet direction, every facet edge a hairline
  geo(g, m, tone = 'n') {
    const [bodyK, deckK, lineK] = TONE[tone];
    g = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    const p = g.attributes.position, a = v3(), b = v3(), c = v3(), n = v3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      if (n.y > -0.82) this.tri(n.y > 0.45 ? deckK : bodyK, a, b, c);
    }
    const e = new THREE.EdgesGeometry(g).attributes.position;
    for (let i = 0; i < e.count; i += 2) this.seg(lineK, a.fromBufferAttribute(e, i).clone(), b.fromBufferAttribute(e, i + 1).clone());
    return this;
  }
  build(name?) {
    const g = new THREE.Group(); if (name) g.name = name;
    for (const k in this.fill) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(this.fill[k], 3));
      const m = new THREE.Mesh(geo, FILL[k]); m.userData.fill = k; g.add(m);
    }
    for (const k in this.lines) {
      const l = new LineSegments2(new LineSegmentsGeometry().setPositions(this.lines[k]), LINE[k]);
      l.userData.line = k; l.raycast = noop; g.add(l);
    }
    for (const t of this.texts) g.add(textMesh(t));
    return g;
  }
}
// Text drawn flat on a plane: a canvas glyph texture (white) tinted by its token colour.
function textMesh({ M, str, x, y, size, k, anchor, lift }) {
  const font = `500 ${TEX_PX}px ${css('--mono')}`;
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = font;
  c.width = Math.ceil(g.measureText(str).width) + 8; c.height = Math.round(TEX_PX * 1.25);
  g.font = font; g.fillStyle = '#fff'; g.fillText(str, 4, TEX_PX * 0.95);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = gfx.aniso;
  const s = size / TEX_PX, w = c.width * s, h = c.height * s;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x - 4 * s, top = y - TEX_PX * 0.95 * s;
  const geo = new THREE.PlaneGeometry(w, h).scale(1, -1, 1).translate(x0 + w / 2, top + h / 2, 0).applyMatrix4(M);
  geo.translate(...v3(0, 0, 0).setFromMatrixColumn(M, 2).normalize().multiplyScalar(-lift).toArray());
  const mat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, side:THREE.DoubleSide, color:css(TEXT_TOK[k]) });
  TEXT[k].push(mat);
  const mesh = new THREE.Mesh(geo, mat); mesh.raycast = noop; return mesh;
}
export const pose = (o, x, y, h = 0, z = 0) => { o.position.set(x, z, y); o.rotation.y = -h; };
// light a part up: its faces take the live colour (LineSegments2 is also a Mesh, so go by the fill key)
export const glow = (g, on) => { for (const m of g.children) if (m.userData.fill) m.material = on ? FILL.livef : FILL[m.userData.fill]; };
