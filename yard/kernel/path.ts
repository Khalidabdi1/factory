// @ts-nocheck

// a height along a path, from a function of (x, y): looked up every metre, so a car can stand on a road that climbs
export function withHeights(path, zOf) {
  const n = Math.ceil(path.length) + 2, t = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = path.at(i); t[i] = zOf(p.x, p.y); }
  path.zs = s => { if (path.closed) s = ((s % path.length) + path.length) % path.length; const i = Math.max(0, Math.min(n - 2, Math.floor(s))), f = Math.max(0, Math.min(1, s - i)); return t[i] + (t[i + 1] - t[i]) * f; };
  return path;
}
// A polyline with filleted corners, walked by arc length. at(s) extrapolates past both ends, or wraps
// round when the path is a closed loop (start it in the middle of a straight).
export class Path {
  declare length: number; declare closed: boolean; declare segs: any[];
  constructor(pts, r = 6, closed = false) {
    // a point repeated back to back would make a zero-length leg (and a corner with no direction): drop it
    pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
    this.closed = closed;
    this.segs = []; let cur = pts[0], s = 0;
    const line = (a, b) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-6) return;
      this.segs.push({ t:'L', s, len, ax:a[0], ay:a[1], h:Math.atan2(b[1] - a[1], b[0] - a[0]) }); s += len; };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      if (!c) { line(cur, b); break; }
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const d1x = (b[0] - a[0]) / l1, d1y = (b[1] - a[1]) / l1, d2x = (c[0] - b[0]) / l2, d2y = (c[1] - b[1]) / l2;
      const turn = Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y);
      if (Math.abs(turn) < 1e-4) continue;
      const tanH = Math.tan(Math.abs(turn) / 2);
      const t = Math.min(r * tanH, Math.hypot(b[0] - cur[0], b[1] - cur[1]), l2 / 2), rr = t / tanH;
      const p1 = [b[0] - d1x * t, b[1] - d1y * t], sg = Math.sign(turn);
      line(cur, p1);
      const cx = p1[0] - d1y * rr * sg, cy = p1[1] + d1x * rr * sg;
      this.segs.push({ t:'A', s, len:rr * Math.abs(turn), cx, cy, r:rr, a0:Math.atan2(p1[1] - cy, p1[0] - cx), da:turn });
      s += rr * Math.abs(turn); cur = [b[0] + d2x * t, b[1] + d2y * t];
    }
    this.length = s;
  }
  on(g, d) {
    if (g.t === 'L') return { x:g.ax + Math.cos(g.h) * d, y:g.ay + Math.sin(g.h) * d, h:g.h };
    const a = g.a0 + g.da * (d / g.len);
    return { x:g.cx + g.r * Math.cos(a), y:g.cy + g.r * Math.sin(a), h:a + Math.sign(g.da) * Math.PI / 2 };
  }
  at(s) {
    const S = this.segs;
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    if (s <= 0) { const p = this.on(S[0], 0); return { x:p.x + Math.cos(p.h) * s, y:p.y + Math.sin(p.h) * s, h:p.h }; }
    if (s >= this.length) { const g = S[S.length - 1], p = this.on(g, g.len), e = s - this.length; return { x:p.x + Math.cos(p.h) * e, y:p.y + Math.sin(p.h) * e, h:p.h }; }
    for (const g of S) if (s <= g.s + g.len) return this.on(g, s - g.s);
  }
  // the distance along it of the point nearest (x, y), worked out leg by leg (for long paths, where project is slow)
  nearest(x, y) {
    let best = Infinity, bs = 0;
    for (const g of this.segs) {
      let s, px, py;
      if (g.t === 'L') { const c = Math.cos(g.h), n = Math.sin(g.h), t = Math.max(0, Math.min(g.len, (x - g.ax) * c + (y - g.ay) * n)); s = g.s + t; px = g.ax + c * t; py = g.ay + n * t; }
      else { const a = Math.atan2(y - g.cy, x - g.cx), f = Math.max(0, Math.min(1, Math.atan2(Math.sin(a - g.a0), Math.cos(a - g.a0)) / g.da)), aa = g.a0 + g.da * f;
        s = g.s + g.len * f; px = g.cx + g.r * Math.cos(aa); py = g.cy + g.r * Math.sin(aa); }
      const d = Math.hypot(px - x, py - y); if (d < best) { best = d; bs = s; }
    }
    return bs;
  }
  project(x, y) {
    const d = s => { const p = this.at(s); return Math.hypot(p.x - x, p.y - y); };
    let best = 0; for (let s = 0; s <= this.length; s += 0.5) if (d(s) < d(best)) best = s;
    for (let s = best - 0.5; s <= best + 0.5; s += 0.02) if (s >= 0 && s <= this.length && d(s) < d(best)) best = s;
    return best;
  }
}
