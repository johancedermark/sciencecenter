/**
 * Foucault pendulum in the Earth's rotating frame (small-angle, linearised).
 *
 *   ẍ = −ω0²·x + 2Ω·ẏ
 *   ÿ = −ω0²·y − 2Ω·ẋ        ω0² = g/L,  Ω = Ω_E·sin φ (vertical component of Earth's spin)
 *
 * x points east, y points north (metres, horizontal bob position). With z = x + iy this is
 * z̈ = −ω0²z − 2iΩż, whose exact solution is z(t) = e^{−iΩt}·w(t) with ẅ = −(ω0² + Ω²)·w:
 * an ordinary pendulum swing seen from a floor that turns under it. We propagate that exact
 * solution each step, so it is unconditionally stable and frame-rate independent.
 * Pure module (no three.js), so it can be tested on its own.
 */

/** Earth's sidereal rotation rate, rad/s (360° per 23.9345 h = 15.041 °/h). */
export const OMEGA_EARTH = 7.2921e-5;
export const G_STOCKHOLM = 9.82;

/** Foucault precession rate in degrees per (Earth) hour, positive = clockwise seen from above. */
export function precessionDegPerHour(latDeg: number) {
  return ((OMEGA_EARTH * 180) / Math.PI) * 3600 * Math.sin((latDeg * Math.PI) / 180);
}

export class FoucaultSim {
  readonly w0: number;
  readonly period: number;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Effective vertical spin component Ω (rad/s), including any time-lapse factor. */
  omega = 0;
  /** Measured swing-plane rotation since release (rad, positive = clockwise from above), from turning points. */
  planeAngle = 0;
  private lastPlane = NaN;
  private lastRdot = 0;

  constructor(readonly length: number, readonly g = G_STOCKHOLM) {
    this.w0 = Math.sqrt(g / length);
    this.period = (2 * Math.PI) / this.w0;
  }

  /** Release the bob from rest (relative to the floor) at (x east, y north). */
  release(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.planeAngle = 0;
    this.lastPlane = Math.atan2(x, y); // compass bearing of the swing plane
    this.lastRdot = 0;
  }

  get radius() {
    return Math.hypot(this.x, this.y);
  }

  /** Advance by dt seconds (exact for the linear equations, any dt). */
  step(dt: number) {
    const W = this.omega;
    const wp = Math.sqrt(this.w0 * this.w0 + W * W);
    // w = z·e^{iΩt}; at local t = 0: w = z, ẇ = ż + iΩz
    const ax = this.x;
    const ay = this.y;
    const bx = this.vx - W * ay;
    const by = this.vy + W * ax;
    const c = Math.cos(wp * dt);
    const s = Math.sin(wp * dt);
    const wx = ax * c + (bx / wp) * s;
    const wy = ay * c + (by / wp) * s;
    const dwx = -ax * wp * s + bx * c;
    const dwy = -ay * wp * s + by * c;
    // z = e^{−iΩdt}·w,  ż = e^{−iΩdt}·(ẇ − iΩw)
    const cr = Math.cos(W * dt);
    const sr = -Math.sin(W * dt);
    this.x = wx * cr - wy * sr;
    this.y = wx * sr + wy * cr;
    const ux = dwx + W * wy;
    const uy = dwy - W * wx;
    this.vx = ux * cr - uy * sr;
    this.vy = ux * sr + uy * cr;
    this.trackPlane();
  }

  /** At each turning point (radial speed + → −) read the bearing of the bob: that's the swing plane. */
  private trackPlane() {
    const r = this.radius;
    const rdot = r > 1e-6 ? (this.x * this.vx + this.y * this.vy) / r : 0;
    if (this.lastRdot > 0 && rdot <= 0 && r > 0.3) {
      const bearing = Math.atan2(this.x, this.y); // clockwise from north
      if (Number.isFinite(this.lastPlane)) {
        // The plane is an axis: compare modulo 180°.
        let d = bearing - this.lastPlane;
        d -= Math.PI * Math.round(d / Math.PI);
        this.planeAngle += d;
      }
      this.lastPlane = bearing;
    }
    this.lastRdot = rdot;
  }
}
