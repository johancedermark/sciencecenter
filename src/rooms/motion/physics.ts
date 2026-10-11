/**
 * Pure physics for the Forces & Motion room (no Three.js, so it can be tested on its own).
 * All units SI. g is the Swedish value.
 */
export const G = 9.82;
/** Solid sphere rolling without slipping: a = g·sinθ / (1 + I/(m r²)), with I/(m r²) = 2/5. */
export const ROLL = 5 / 7;

// ---------------------------------------------------------------------------------------------
// Curves along which a ball moves (brachistochrone race)
// ---------------------------------------------------------------------------------------------

/** u ∈ [0,1] → [x, yDown] (yDown = drop below the start point). */
export type CurveFn = (u: number) => [number, number];

export const BRACH = { R: 0.5, X: Math.PI * 0.5, H: 1.0, deepTheta: 1.35 * Math.PI };

export const brachCurves: CurveFn[] = [
  // 0: straight ramp
  (u) => [BRACH.X * u, BRACH.H * u],
  // 1: cycloid x = R(θ − sinθ), y = R(1 − cosθ), θ ∈ [0, π]: the brachistochrone between these points
  (u) => {
    const th = Math.PI * u;
    return [BRACH.R * (th - Math.sin(th)), BRACH.R * (1 - Math.cos(th))];
  },
  // 2: a steeper, deeper curve that dips below the end and climbs back up
  //    (a cycloid run past its bottom to θe = 1.35π, then stretched to fit the same end point)
  (u) => {
    const te = BRACH.deepTheta;
    const th = te * u;
    const sx = BRACH.X / (te - Math.sin(te));
    const sy = BRACH.H / (1 - Math.cos(te));
    return [sx * (th - Math.sin(th)), sy * (1 - Math.cos(th))];
  },
];

/** A curve sampled densely and parametrised by arc length s. */
export class Curve {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly s: Float64Array;
  readonly length: number;
  private hint = 0;

  constructor(fn: CurveFn, readonly n = 4000) {
    this.x = new Float64Array(n + 1);
    this.y = new Float64Array(n + 1);
    this.s = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const [x, y] = fn(i / n);
      this.x[i] = x;
      this.y[i] = y;
      if (i > 0) this.s[i] = this.s[i - 1] + Math.hypot(x - this.x[i - 1], y - this.y[i - 1]);
    }
    this.length = this.s[n];
  }

  /** Segment index i with s[i] ≤ q ≤ s[i+1]. */
  seg(q: number): number {
    const s = this.s;
    let i = this.hint;
    if (q <= 0) return (this.hint = 0);
    if (q >= this.length) return (this.hint = this.n - 1);
    while (i > 0 && s[i] > q) i--;
    while (i < this.n - 1 && s[i + 1] < q) i++;
    return (this.hint = i);
  }

  /** dyDown/ds: the sine of the slope angle (downhill positive). */
  slope(q: number): number {
    const i = this.seg(q);
    const ds = this.s[i + 1] - this.s[i];
    return ds > 0 ? (this.y[i + 1] - this.y[i]) / ds : 1;
  }

  /** Position and unit tangent at arc length q. */
  at(q: number, out: { x: number; y: number; tx: number; ty: number }) {
    const i = this.seg(q);
    const ds = this.s[i + 1] - this.s[i];
    const f = ds > 0 ? Math.min(1, Math.max(0, (q - this.s[i]) / ds)) : 0;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * f;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * f;
    out.tx = ds > 0 ? (this.x[i + 1] - this.x[i]) / ds : 0;
    out.ty = ds > 0 ? (this.y[i + 1] - this.y[i]) / ds : 1;
    return out;
  }

  /** Arc length where the drop below the start first reaches `drop` (for starting part-way down). */
  sAtDrop(drop: number): number {
    for (let i = 0; i < this.n; i++) {
      if (this.y[i + 1] >= drop) {
        const f = (drop - this.y[i]) / (this.y[i + 1] - this.y[i] || 1);
        return this.s[i] + (this.s[i + 1] - this.s[i]) * f;
      }
    }
    return this.length;
  }
}

/** A ball moving along a Curve: s'' = gEff · dy/ds, integrated with RK4. */
export class CurveRunner {
  s = 0;
  v = 0;
  t = 0;
  finishTime = -1;

  constructor(readonly curve: Curve, public gEff: number, public s0 = 0) {
    this.reset();
  }

  reset() {
    this.s = this.s0;
    this.v = 0;
    this.t = 0;
    this.finishTime = -1;
  }

  get finished() {
    return this.finishTime >= 0;
  }

  step(h: number) {
    if (this.finished) return;
    const c = this.curve;
    const g = this.gEff;
    const s = this.s;
    const v = this.v;
    const a1 = g * c.slope(s);
    const a2 = g * c.slope(s + 0.5 * h * v);
    const v2 = v + 0.5 * h * a1;
    const a3 = g * c.slope(s + 0.5 * h * v2);
    const v3 = v + 0.5 * h * a2;
    const a4 = g * c.slope(s + h * v3);
    const v4 = v + h * a3;
    const ns = s + (h / 6) * (v + 2 * v2 + 2 * v3 + v4);
    const nv = v + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    if (ns >= c.length) {
      // Interpolate the crossing inside the step for 0.01 s precision.
      const f = (c.length - s) / (ns - s || 1);
      this.finishTime = this.t + h * f;
      this.s = c.length;
      this.v = nv;
      this.t += h;
      return;
    }
    this.s = ns;
    this.v = nv;
    this.t += h;
  }
}

/** Run all curves to the finish; returns finish times (s). Used by tests. */
export function raceTimes(curves: Curve[], gEff: number, hz = 480): number[] {
  return curves.map((c) => {
    const r = new CurveRunner(c, gEff);
    for (let i = 0; i < hz * 20 && !r.finished; i++) r.step(1 / hz);
    return r.finishTime;
  });
}

// ---------------------------------------------------------------------------------------------
// Pendulum wave
// ---------------------------------------------------------------------------------------------

/** Length of a simple pendulum that makes `osc` full swings in `cycle` seconds (small angle). */
export function pendulumLength(osc: number, cycle: number, g = G) {
  const T = cycle / osc;
  return g * (T / (2 * Math.PI)) ** 2;
}

export function pendulumPeriod(L: number, g = G) {
  return 2 * Math.PI * Math.sqrt(L / g);
}

// ---------------------------------------------------------------------------------------------
// Newton's cradle
// ---------------------------------------------------------------------------------------------

export class CradleSim {
  readonly n = 5;
  readonly th = new Float64Array(5);
  readonly om = new Float64Array(5);
  readonly held = [false, false, false, false, false];
  /** Coefficient of restitution between the steel balls. */
  e = 0.98;
  /** Weak air drag on each ball (1/s). */
  drag = 0.02;
  collisions = 0;

  constructor(readonly L: number, readonly r: number) {}

  /** Horizontal position of ball i relative to the pivot of ball 0 (pivots spaced 2r). */
  x(i: number) {
    return i * 2 * this.r + this.L * Math.sin(this.th[i]);
  }

  /** Mechanical energy per unit mass (J/kg). */
  energy() {
    let E = 0;
    for (let i = 0; i < this.n; i++) {
      const v = this.L * this.om[i];
      E += 0.5 * v * v + G * this.L * (1 - Math.cos(this.th[i]));
    }
    return E;
  }

  stop() {
    this.th.fill(0);
    this.om.fill(0);
    this.held.fill(false);
  }

  /** One substep. Returns the largest relative impact speed (m/s) of collisions in this step, 0 if none. */
  step(h: number): number {
    const k = G / this.L;
    for (let i = 0; i < this.n; i++) {
      if (this.held[i]) {
        this.om[i] = 0;
        continue;
      }
      // RK4 for θ'' = −(g/L)·sinθ − drag·θ'
      const th = this.th[i];
      const om = this.om[i];
      const d = this.drag;
      const f = (t: number, o: number) => -k * Math.sin(t) - d * o;
      const a1 = f(th, om);
      const a2 = f(th + 0.5 * h * om, om + 0.5 * h * a1);
      const a3 = f(th + 0.5 * h * (om + 0.5 * h * a1), om + 0.5 * h * a2);
      const a4 = f(th + h * (om + 0.5 * h * a2), om + h * a3);
      this.th[i] = th + h * om + (h * h / 6) * (a1 + a2 + a3);
      this.om[i] = om + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    }
    return this.resolve();
  }

  /**
   * Sequential pairwise impulses until no touching pair is approaching. With e = 1 and equal masses
   * this gives exactly "n balls in, n balls out" (momentum and energy conserved).
   */
  resolve(): number {
    const L = this.L;
    const e = this.e;
    let maxRel = 0;
    for (let iter = 0; iter < 40; iter++) {
      let any = false;
      for (let i = 0; i < this.n - 1; i++) {
        if (this.held[i] || this.held[i + 1]) continue;
        const gap = this.x(i + 1) - this.x(i) - 2 * this.r;
        if (gap > 1e-9) continue;
        const u1 = L * this.om[i];
        const u2 = L * this.om[i + 1];
        const rel = u1 - u2;
        if (rel <= 1e-7) continue;
        const mean = 0.5 * (u1 + u2);
        this.om[i] = (mean - 0.5 * e * rel) / L;
        this.om[i + 1] = (mean + 0.5 * e * rel) / L;
        if (rel > 1e-3) this.collisions++;
        maxRel = Math.max(maxRel, rel);
        any = true;
      }
      if (!any) break;
    }
    return maxRel;
  }
}

// ---------------------------------------------------------------------------------------------
// Loop the loop
// ---------------------------------------------------------------------------------------------

export interface TrackPoint {
  x: number;
  y: number;
  /** Unit tangent (direction of increasing s). */
  tx: number;
  ty: number;
  /** Signed curvature towards the support normal n = (−ty, tx). */
  k: number;
  /** Which segment: 0 ramp, 1 fillet, 2 flat, 3 loop, 4 exit. */
  seg: number;
  /** Loop angle φ from the bottom (only for seg 3). */
  phi: number;
}

/** Ramp (straight, 40°) → fillet arc → flat → full vertical loop of radius R → exit flat. y = 0 at the loop bottom. */
export class LoopTrack {
  readonly alpha = (40 * Math.PI) / 180;
  readonly Rf = 0.5;
  readonly flat = 0.35;
  readonly exit = 1.0;
  readonly yTop = 1.15;
  readonly lens: number[];
  readonly starts: number[];
  readonly length: number;
  readonly xArc0: number;
  readonly xF: number;
  readonly xL: number;
  readonly cx: number;
  readonly cy: number;

  constructor(readonly R = 0.3) {
    const a = this.alpha;
    const yArc0 = this.Rf * (1 - Math.cos(a));
    const ramp = (this.yTop - yArc0) / Math.sin(a);
    this.xArc0 = ramp * Math.cos(a);
    this.xF = this.xArc0 + this.Rf * Math.sin(a);
    this.xL = this.xF + this.flat;
    this.cx = this.xL;
    this.cy = R;
    this.lens = [ramp, this.Rf * a, this.flat, 2 * Math.PI * R, this.exit];
    this.starts = [];
    let acc = 0;
    for (const l of this.lens) {
      this.starts.push(acc);
      acc += l;
    }
    this.length = acc;
  }

  get loopStart() {
    return this.starts[3];
  }
  get loopEnd() {
    return this.starts[4];
  }

  /** Arc length on the ramp where the track is at height h. */
  sAtHeight(h: number) {
    return (this.yTop - h) / Math.sin(this.alpha);
  }

  at(s: number, o: TrackPoint): TrackPoint {
    const a = this.alpha;
    s = Math.max(0, Math.min(this.length, s));
    let seg = 4;
    for (let i = 0; i < 4; i++) {
      if (s < this.starts[i + 1]) {
        seg = i;
        break;
      }
    }
    const q = s - this.starts[seg];
    o.seg = seg;
    o.phi = 0;
    switch (seg) {
      case 0:
        o.tx = Math.cos(a);
        o.ty = -Math.sin(a);
        o.x = q * o.tx;
        o.y = this.yTop + q * o.ty;
        o.k = 0;
        break;
      case 1: {
        // Arc centre (xF, Rf); angle from straight down, going from −a to 0
        const b = -a + q / this.Rf;
        o.x = this.xF + this.Rf * Math.sin(b);
        o.y = this.Rf - this.Rf * Math.cos(b);
        o.tx = Math.cos(b);
        o.ty = Math.sin(b);
        o.k = 1 / this.Rf;
        break;
      }
      case 2:
        o.x = this.xF + q;
        o.y = 0;
        o.tx = 1;
        o.ty = 0;
        o.k = 0;
        break;
      case 3: {
        const phi = q / this.R;
        o.phi = phi;
        o.x = this.cx + this.R * Math.sin(phi);
        o.y = this.cy - this.R * Math.cos(phi);
        o.tx = Math.cos(phi);
        o.ty = Math.sin(phi);
        o.k = 1 / this.R;
        break;
      }
      default:
        o.x = this.xL + q;
        o.y = 0;
        o.tx = 1;
        o.ty = 0;
        o.k = 0;
    }
    return o;
  }
}

export type LoopState = 'ready' | 'running' | 'fell' | 'back' | 'success' | 'done';

/**
 * A ball (rolling, f = 5/7) or a frictionless sliding block (f = 1) on the LoopTrack.
 * On the track: s'' = −f·g·ty, and the normal force per unit mass is N = v²·k + g·ny.
 * If N would be negative the track can't pull, so the ball leaves and flies as a projectile.
 */
export class LoopRunner {
  mode: 'track' | 'air' = 'track';
  state: LoopState = 'ready';
  s = 0;
  v = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  /** Normal force / (m·g): the g-force felt by a rider. */
  gForce = 1;
  /** g-force at the top of the loop on this run (NaN if it never got there on the track). */
  topG = NaN;
  topV = NaN;
  /** Where it left the track (loop angle, rad) or NaN. */
  leftAt = NaN;
  succeeded = false;
  damping = 0;
  settleTime = 0;
  /** Time spent in the air since leaving the track. */
  airTime = 0;
  private p: TrackPoint = { x: 0, y: 0, tx: 1, ty: 0, k: 0, seg: 0, phi: 0 };
  private q: TrackPoint = { x: 0, y: 0, tx: 1, ty: 0, k: 0, seg: 0, phi: 0 };

  constructor(readonly track: LoopTrack, public f = ROLL) {}

  /** v² = k·g·Δh, k = 2f. */
  get kE() {
    return 2 * this.f;
  }
  /** Minimum release height (m above the loop bottom) to stay on the track. */
  minHeight() {
    return this.track.R * (2 + 1 / this.kE);
  }
  /** Predicted g-force at the top for release height h (negative → it can't stay on). */
  predictTopG(h: number) {
    return this.kE * (h / this.track.R - 2) - 1;
  }

  place(h: number) {
    this.mode = 'track';
    this.state = 'ready';
    this.s = this.track.sAtHeight(h);
    this.v = 0;
    this.gForce = 0;
    this.topG = NaN;
    this.topV = NaN;
    this.leftAt = NaN;
    this.succeeded = false;
    this.damping = 0;
    this.settleTime = 0;
  }

  go() {
    if (this.state === 'ready') this.state = 'running';
  }

  get speed() {
    return this.mode === 'air' ? Math.hypot(this.vx, this.vy) : Math.abs(this.v);
  }

  private acc(s: number, v: number) {
    const p = this.track.at(s, this.q);
    return -this.f * G * p.ty - this.damping * v;
  }

  step(h: number) {
    if (this.state === 'ready' || this.state === 'done') return;
    const tr = this.track;
    if (this.mode === 'air') {
      this.px += this.vx * h;
      this.py += this.vy * h - 0.5 * G * h * h;
      this.vy -= G * h;
      this.gForce = 0;
      this.airTime += h;
      const dx = this.px - tr.cx;
      const dy = this.py - tr.cy;
      const d = Math.hypot(dx, dy);
      if (this.airTime > 0.05 && d >= tr.R && dx * this.vx + dy * this.vy > 0) {
        // Lands on the loop: keep only the velocity along the track, with a thud.
        let phi = Math.atan2(dx, -dy);
        if (phi < 0) phi += 2 * Math.PI;
        this.s = tr.loopStart + tr.R * phi;
        this.v = (this.vx * Math.cos(phi) + this.vy * Math.sin(phi)) * 0.7;
        this.mode = 'track';
        this.damping = 1.2;
      } else if (this.py < -1) {
        this.state = 'done';
      }
      return;
    }
    // RK4 along the track
    const s = this.s;
    const v = this.v;
    const a1 = this.acc(s, v);
    const a2 = this.acc(s + 0.5 * h * v, v + 0.5 * h * a1);
    const v2 = v + 0.5 * h * a1;
    const a3 = this.acc(s + 0.5 * h * v2, v + 0.5 * h * a2);
    const v3 = v + 0.5 * h * a2;
    const a4 = this.acc(s + h * v3, v + h * a3);
    const v4 = v + h * a3;
    const prev = tr.at(s, this.p).phi;
    const prevSeg = this.p.seg;
    this.s = s + (h / 6) * (v + 2 * v2 + 2 * v3 + v4);
    this.v = v + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    if (this.s <= 0) {
      this.s = 0;
      this.v = Math.max(0, this.v);
    }
    const p = tr.at(this.s, this.p);
    // Support normal n = (−ty, tx), so ny = tx:  N/m = v²·k − g⃗·n = v²·k + g·tx
    const N = this.v * this.v * p.k + G * p.tx;
    this.gForce = N / G;
    if (p.seg === 3 && prevSeg === 3 && prev < Math.PI && p.phi >= Math.PI && Number.isNaN(this.topG)) {
      this.topG = this.gForce;
      this.topV = Math.abs(this.v);
    }
    if (N < 0) {
      // The track would have to pull: the ball leaves it.
      this.mode = 'air';
      this.px = p.x;
      this.py = p.y;
      this.vx = this.v * p.tx;
      this.vy = this.v * p.ty;
      this.airTime = 0;
      if (Number.isNaN(this.leftAt)) this.leftAt = p.phi;
      this.gForce = 0;
      if (this.state === 'running') this.state = 'fell';
      this.damping = 1.2;
      return;
    }
    if (this.state === 'running' && this.v < 0) {
      this.state = 'back';
      this.damping = 1.2;
    }
    if (!this.succeeded && this.s > tr.loopEnd && this.state === 'running') {
      this.succeeded = true;
      this.state = 'success';
    }
    if (this.s >= tr.length) {
      this.s = tr.length;
      this.state = 'done';
    }
    if (this.damping > 0) {
      if (Math.abs(this.v) < 0.03) this.settleTime += h;
      else this.settleTime = 0;
      if (this.settleTime > 0.6) this.state = 'done';
    }
  }
}
