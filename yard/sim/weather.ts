// @ts-nocheck
import { hooks } from '../shared';
import { rand, rng } from '../kernel/math';
import { hourAt, sim } from './core';

// The weather: mostly fair, with showers through the day (about a fifth of the time) and, some mornings, sea fog.
// kind is what is coming; look is what can be seen, which stays while it fades. amount eases in and out over a few
// seconds, so a shower comes on and clears gradually.
export const weather = { kind:'clear', look:'clear', amount:0, next:90, until:0, fogArmed:false, showers:0,
  update(dt) {
    const h = hourAt(sim.t);
    // fog is decided once each dawn (armed overnight), and lifts by mid-morning
    if (h < 4.5 || h > 12) this.fogArmed = true;
    else if (this.fogArmed && h < 5.5) { this.fogArmed = false; if (this.kind === 'clear' && rng() < 0.45) this.set('fog', rand(45, 70)); }
    if (this.kind === 'clear' && (this.next -= dt) <= 0) { if (rng() < 0.4) this.set('rain', rand(40, 90)); this.next = rand(90, 200); }
    if (this.kind !== 'clear' && sim.t >= this.until) this.kind = 'clear';
    this.amount += Math.max(-dt / 8, Math.min(dt / 8, (this.kind === 'clear' ? 0 : 1) - this.amount));
    if (this.amount <= 0) this.look = this.kind;
  },
  set(kind, secs) { this.kind = kind; this.until = sim.t + secs; this.look = kind; if (kind === 'rain') { this.showers++; hooks.onRain?.(); } },
  raining() { return this.look === 'rain' && this.amount > 0.3; },
  rain() { return this.look === 'rain' ? this.amount : 0; },
  fog() { return this.look === 'fog' ? this.amount : 0; },
  word() { return this.amount < 0.2 ? '' : this.look === 'rain' ? (this.amount > 0.7 ? 'rain' : 'showers') : this.look === 'fog' ? 'fog' : ''; },
};
hooks.raining = () => weather.raining();
hooks.weather = weather;
