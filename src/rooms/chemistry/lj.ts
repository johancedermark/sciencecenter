/**
 * 3D Lennard-Jones particle box in reduced units (σ = ε = m = k_B = 1).
 * With ε/k_B = 120 K and σ = 0.34 nm the particles behave like argon atoms.
 * Velocity Verlet, truncated-and-shifted potential (r_c = 2.5σ), reflecting walls, weak gravity.
 * Two heat modes: a Berendsen thermostat (target temperature) or constant heating power
 * (energy is added at a fixed rate, so the temperature stalls while bonds break: latent heat).
 */
export const ARGON_EPS_K = 120; // ε/k_B in kelvin
export const ARGON_SIGMA_NM = 0.34;

const RC = 2.5;
const RC2 = RC * RC;
const INV_RC6 = 1 / RC2 ** 3;
const U_SHIFT = 4 * (INV_RC6 * INV_RC6 - INV_RC6);
const NEIGH2 = 1.5 * 1.5;

export class LJBox {
  readonly n: number;
  readonly L: [number, number, number];
  readonly x: Float64Array;
  readonly v: Float64Array;
  private a: Float64Array;
  /** Neighbours within 1.5σ, per particle (from the last force evaluation). */
  readonly neigh: Uint8Array;
  readonly dt = 0.004;
  gravity = 0.03;
  mode: 'thermostat' | 'power' = 'thermostat';
  /** Target temperature (reduced) for the thermostat. */
  targetT = 0.35;
  /** Heating power in reduced energy per particle per reduced time unit (power mode). */
  power = 0.12;
  /** Berendsen coupling time. */
  tauT = 0.4;
  /** Heat added in power mode, per particle (reduced energy). */
  heatAdded = 0;
  pe = 0;
  time = 0;

  constructor(cells = 4, L: [number, number, number] = [8, 12, 8]) {
    this.n = 4 * cells ** 3;
    this.L = L;
    this.x = new Float64Array(this.n * 3);
    this.v = new Float64Array(this.n * 3);
    this.a = new Float64Array(this.n * 3);
    this.neigh = new Uint8Array(this.n);
    this.reset(0.3, cells);
  }

  /** FCC crystal resting on the floor, Maxwell-Boltzmann velocities at temperature T. */
  reset(T: number, cells = Math.round(Math.cbrt(this.n / 4))) {
    const a = 1.56; // lattice constant (ρ ≈ 1.05 σ⁻³, near the LJ solid at low T)
    const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    const ox = (this.L[0] - cells * a) / 2 + a / 4;
    const oz = (this.L[2] - cells * a) / 2 + a / 4;
    const oy = 0.6;
    let i = 0;
    for (let ix = 0; ix < cells; ix++)
      for (let iy = 0; iy < cells; iy++)
        for (let iz = 0; iz < cells; iz++)
          for (const b of basis) {
            this.x[i * 3] = ox + (ix + b[0]) * a;
            this.x[i * 3 + 1] = oy + (iy + b[1]) * a;
            this.x[i * 3 + 2] = oz + (iz + b[2]) * a;
            i++;
          }
    let sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < this.n; k++) {
      for (let d = 0; d < 3; d++) this.v[k * 3 + d] = gauss() * Math.sqrt(T);
      sx += this.v[k * 3]; sy += this.v[k * 3 + 1]; sz += this.v[k * 3 + 2];
    }
    for (let k = 0; k < this.n; k++) {
      this.v[k * 3] -= sx / this.n; this.v[k * 3 + 1] -= sy / this.n; this.v[k * 3 + 2] -= sz / this.n;
    }
    this.scaleTo(T);
    this.heatAdded = 0;
    this.time = 0;
    this.forces();
  }

  kinetic() {
    let s = 0;
    for (let k = 0; k < this.n * 3; k++) s += this.v[k] * this.v[k];
    return 0.5 * s;
  }

  /** Kinetic temperature, k_B·T = 2·KE / (3N). */
  temperature() {
    return (2 * this.kinetic()) / (3 * this.n);
  }

  private scaleTo(T: number) {
    const cur = this.temperature();
    if (cur <= 0) return;
    const f = Math.sqrt(T / cur);
    for (let k = 0; k < this.n * 3; k++) this.v[k] *= f;
  }

  private forces() {
    const { n, x, a, neigh } = this;
    a.fill(0);
    neigh.fill(0);
    let pe = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i * 3], yi = x[i * 3 + 1], zi = x[i * 3 + 2];
      let fxi = 0, fyi = 0, fzi = 0;
      for (let j = i + 1; j < n; j++) {
        const dx = xi - x[j * 3];
        const dy = yi - x[j * 3 + 1];
        const dz = zi - x[j * 3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 >= RC2) continue;
        if (r2 < NEIGH2) {
          if (neigh[i] < 255) neigh[i]++;
          if (neigh[j] < 255) neigh[j]++;
        }
        const rr = Math.max(r2, 0.64); // guards against overlap blow-ups (never reached in normal runs)
        const inv2 = 1 / rr;
        const inv6 = inv2 * inv2 * inv2;
        const f = 24 * inv2 * inv6 * (2 * inv6 - 1);
        pe += 4 * inv6 * (inv6 - 1) - U_SHIFT;
        fxi += f * dx; fyi += f * dy; fzi += f * dz;
        a[j * 3] -= f * dx; a[j * 3 + 1] -= f * dy; a[j * 3 + 2] -= f * dz;
      }
      a[i * 3] += fxi;
      a[i * 3 + 1] += fyi - this.gravity;
      a[i * 3 + 2] += fzi;
    }
    this.pe = pe;
  }

  step() {
    const { n, x, v, a, dt, L } = this;
    const h = 0.5 * dt;
    for (let k = 0; k < n * 3; k++) {
      v[k] += h * a[k];
      x[k] += dt * v[k];
    }
    // Reflecting walls (particle radius 0.5σ).
    for (let i = 0; i < n; i++)
      for (let d = 0; d < 3; d++) {
        const k = i * 3 + d;
        const lo = 0.5, hi = L[d] - 0.5;
        if (x[k] < lo) { x[k] = 2 * lo - x[k]; v[k] = Math.abs(v[k]); }
        else if (x[k] > hi) { x[k] = 2 * hi - x[k]; v[k] = -Math.abs(v[k]); }
      }
    this.forces();
    for (let k = 0; k < n * 3; k++) {
      v[k] += h * a[k];
      if (v[k] > 12) v[k] = 12; else if (v[k] < -12) v[k] = -12;
    }
    const ke = this.kinetic();
    if (ke > 1e-9) {
      let lam = 1;
      if (this.mode === 'thermostat') {
        const T = (2 * ke) / (3 * n);
        lam = Math.sqrt(Math.max(0.81, Math.min(1.21, 1 + (dt / this.tauT) * (this.targetT / T - 1))));
      } else {
        const dE = this.power * n * dt;
        lam = Math.sqrt((ke + dE) / ke);
        this.heatAdded += this.power * dt;
      }
      for (let k = 0; k < n * 3; k++) v[k] *= lam;
    }
    this.time += dt;
  }

  /** Fraction of particles with ≤ 2 close neighbours (≈ gas). */
  gasFraction() {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.neigh[i] <= 2) c++;
    return c / this.n;
  }

  /** Mean number of close neighbours (12 in a perfect FCC crystal, fewer at the surface). */
  meanNeighbours() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.neigh[i];
    return s / this.n;
  }
}

function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
