// @ts-nocheck
import { TOP, W } from '../kernel/iso';
import { Part } from '../kernel/part';

// People: box legs that swing at the hip, a torso, arms, a head. Staff and police wear the two-tone shirt;
// the guard and the police wear caps, the man trying the bank a dark hood.
// lite: one part with the legs at rest and no carton, for when a person is only a few pixels tall
export function buildPerson(look, lite = false) {
  const tone = look === 'staff' || look === 'police' ? 'k' : 'n', p = new Part();
  p.box(-0.13, -0.25, 0.85, 0.26, 0.5, 0.62, tone);
  p.box(-0.1, 0.25, 0.92, 0.2, 0.12, 0.52, tone); p.box(-0.1, -0.37, 0.92, 0.2, 0.12, 0.52, tone);
  p.box(-0.12, -0.12, 1.5, 0.24, 0.24, 0.27, look === 'thief' ? 'k' : 'n');
  if (look === 'thief') p.box(-0.16, -0.15, 1.6, 0.22, 0.3, 0.24, 'k');
  if (look === 'guard' || look === 'police') { p.box(-0.15, -0.15, 1.77, 0.3, 0.3, 0.07, 'k'); p.box(0.15, -0.15, 1.77, 0.12, 0.3, 0.03, 'k'); }
  if (lite) { for (const y of [0.04, -0.2]) p.box(-0.08, y, 0, 0.16, 0.16, 0.85); return p.build('personLite'); }
  const g = p.build('person');
  for (const [n, y] of [['legL', 0.12], ['legR', -0.12]]) { const l = new Part().box(-0.08, -0.08, -0.85, 0.16, 0.16, 0.85).build(n); l.position.copy(W(0, y, 0.85)); g.add(l); }
  const c = new Part(); c.box(0.16, -0.24, 0.95, 0.46, 0.48, 0.42, 'k'); c.draw(TOP(0.16, -0.24, 1.37), [0.23, 0, 0.23, 0.48], 'koline');
  g.add(c.build('carry'));
  return g;
}
export function buildDog() {
  const p = new Part();
  p.box(-0.4, -0.12, 0.28, 0.62, 0.24, 0.24); p.box(0.16, -0.1, 0.4, 0.26, 0.2, 0.2);
  for (const [x, y] of [[-0.36, -0.1], [-0.36, 0.04], [0.1, -0.1], [0.1, 0.04]]) p.box(x, y, 0, 0.06, 0.06, 0.28);
  p.seg('line', W(-0.4, 0, 0.48), W(-0.62, 0, 0.7));
  return p.build('dog');
}
