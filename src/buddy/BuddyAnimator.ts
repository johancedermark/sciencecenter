/**
 * Procedural, layered animation for Buddy.
 *
 * Every frame a flat pose vector (joint channels) is built from layers:
 *   idle (breathing, sway) → locomotion (gait) → talking beats → listening → fidgets → gestures,
 * smoothed, then written to the rig's pivots. Legs are driven by two-bone IK towards
 * procedurally planted foot targets, so the stride matches the ground speed.
 * The head looks at a world point with clamped neck angles; the eyes cover the rest.
 * Nothing in update() allocates.
 */
import * as THREE from 'three';
import type { Gesture } from '../core/types';
import { DIM, type BuddyRig } from './BuddyModel';
import type { Face } from './Face';

// ------------------------------------------------------------------ pose channels
const PELVIS_Y = 0;
const AIR_Y = 1;
const SPINE_X = 2; // + leans forward
const SPINE_Y = 3; // + turns towards Buddy's left
const SPINE_Z = 4;
const HEAD_X = 5; // + nods down
const HEAD_Y = 6;
const HEAD_Z = 7;
const SH_LIFT = 8;
const ARM0 = 9;
// Arm channels (mirrored: the same numbers give the same pose on either side)
const FLEX = 0; // raise forward
const ABD = 1; // raise outward
const TWIST = 2; // roll about the upper-arm axis
const ELBOW = 3; // bend (forearm forward)
const WRIST_X = 4;
const WRIST_Z = 5;
const WRIST_Y = 6; // roll of the hand about its long axis
const CURL = 7; // middle/ring/pinky 0..1
const INDEX = 8; // 0..1
const THUMB = 9; // −1 out (thumbs up) .. 0 rest .. 1 tucked
const ARM_N = 10;
const N = ARM0 + 2 * ARM_N;
const LEFT = 0; // +X, gauntlet arm
const RIGHT = 1;
const a = (k: number, ch: number) => ARM0 + k * ARM_N + ch;
/** Channels that are not low-pass filtered (they carry fast, already-continuous motion). */
const UNSMOOTHED = new Set([PELVIS_Y, AIR_Y]);

export const GESTURE_DURATION: Record<Gesture, number> = {
  wave: 2.2,
  point: 2.4,
  think: 2.6,
  celebrate: 1.7,
  thumbsUp: 1.7,
  shrug: 1.6,
  nod: 1.2,
  clap: 1.9,
};

type Fidget = 'look' | 'hop' | 'gauntlet';
const FIDGETS: readonly Fidget[] = ['look', 'hop', 'gauntlet', 'look'];
const FIDGET_DURATION: Record<Fidget, number> = { look: 3.4, hop: 0.95, gauntlet: 2.8 };
const BLEND = 0.25;

export interface AnimInput {
  /** Root-local velocity (x = Buddy's left, z = forward), m/s. */
  velX: number;
  velZ: number;
  /** Turning speed, rad/s. */
  yawRate: number;
  /** World point to look at (null = straight ahead). */
  lookAt: THREE.Vector3 | null;
  /** World point to point at with the `point` gesture (null = forward). */
  pointAt: THREE.Vector3 | null;
  /** Voice level 0..1. */
  talk: number;
  listening: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (x: number, y: number, t: number) => x + (y - x) * t;
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth01 = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const smoothstep = (e0: number, e1: number, x: number) => smooth01((x - e0) / (e1 - e0));
/** 0 → 1 → 0 bump over [t0, t1] with soft edges. */
const window01 = (t: number, t0: number, t1: number, edge: number) => smoothstep(t0, t0 + edge, t) * (1 - smoothstep(t1 - edge, t1, t));
const TAU = Math.PI * 2;

export class BuddyAnimator {
  /** Called at the moment the hands meet during the clap gesture. */
  onClap: (() => void) | null = null;

  private readonly P = new Float32Array(N);
  private readonly S = new Float32Array(N);
  private readonly G = new Float32Array(N);
  private readonly foot = new Float32Array(8); // per leg: x, y, z, pitch (root-local)

  private phase = 0;
  private gaitW = 0;
  private runW = 0;

  private gesture: Gesture | null = null;
  private gT = 0;
  private gDur = 0;
  private gW = 0;
  private queued: Gesture | null = null;
  private lastClap = -1;

  private fidget: Fidget | null = null;
  private fT = 0;
  private fDur = 0;
  private fW = 0;
  private nextFidget = 7;
  private fidgetIdx = 0;

  private talkS = 0;
  private listenW = 0;

  private lookYaw = 0;
  private lookPitch = 0;
  private spineLook = 0;
  private saccX = 0;
  private saccY = 0;
  private nextSacc = 1;

  private antX = 0;
  private antZ = 0;
  private antVX = 0;
  private antVZ = 0;
  private dynInit = false;
  private readonly prevBase = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();

  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly look = { yaw: 0, pitch: 0 };

  constructor(
    private readonly rig: BuddyRig,
    private readonly face: Face,
  ) {
    this.restPose(this.S, 0);
    this.foot[0] = DIM.hipX;
    this.foot[4] = -DIM.hipX;
    this.foot[1] = this.foot[5] = DIM.ankleY;
    this.foot[2] = this.foot[6] = DIM.footZ;
  }

  get currentGesture(): Gesture | null {
    return this.gesture;
  }

  /** Is Buddy mid-air or in a gesture that shouldn't be interrupted by walking off? */
  get busy(): boolean {
    return this.gesture !== null && this.gW > 0.5;
  }

  play(g: Gesture) {
    if (this.gesture) {
      // Fade the current gesture out from wherever it is, then start the new one.
      this.queued = g;
      this.gDur = Math.min(this.gDur, this.gT + BLEND);
      return;
    }
    this.start(g);
  }

  /** Forget velocities (after a teleport). */
  resetDynamics() {
    this.dynInit = false;
    this.antX = this.antZ = this.antVX = this.antVZ = 0;
  }

  private start(g: Gesture) {
    this.gesture = g;
    this.gT = 0;
    this.gDur = GESTURE_DURATION[g];
    this.lastClap = -1;
    if (this.fidget) this.fDur = Math.min(this.fDur, this.fT + BLEND);
  }

  update(dt: number, time: number, inp: AnimInput) {
    const P = this.P;
    const r = this.rig;
    r.root.updateMatrixWorld();

    // ---------------------------------------------------------- idle base
    this.restPose(P, time);

    // ---------------------------------------------------------- locomotion
    const speed = Math.hypot(inp.velX, inp.velZ);
    const drive = Math.max(speed, Math.abs(inp.yawRate) * 0.22);
    this.gaitW = damp(this.gaitW, drive > 0.07 ? 1 : 0, 7, dt);
    this.runW = damp(this.runW, smoothstep(2.0, 3.3, speed), 4, dt);
    this.gait(dt, speed, drive, inp.velX, inp.velZ);
    const gw = this.gaitW;
    const cosP = Math.cos(this.phase * TAU);
    const swing = (0.3 + 0.5 * this.runW) * gw * clamp(speed / 0.9, 0.25, 1);
    P[a(RIGHT, FLEX)] += swing * cosP;
    P[a(LEFT, FLEX)] -= swing * cosP;
    P[a(LEFT, ELBOW)] += this.runW * gw * 0.9;
    P[a(RIGHT, ELBOW)] += this.runW * gw * 0.9;
    P[a(LEFT, ABD)] += this.runW * gw * 0.12;
    P[a(RIGHT, ABD)] += this.runW * gw * 0.12;
    P[SPINE_X] += clamp(speed * 0.06, 0, 0.3) * gw;
    P[SPINE_Y] += 0.07 * cosP * gw;

    // ---------------------------------------------------------- talking beats
    this.talkS = damp(this.talkS, inp.talk, 14, dt);
    const tk = smoothstep(0.03, 0.3, this.talkS);
    if (tk > 0) {
      const beat = 0.5 + 0.5 * Math.sin(time * 4.4) * Math.sin(time * 1.9 + 1);
      P[HEAD_X] += tk * (0.045 * Math.sin(time * 6.1) * (0.5 + 0.5 * Math.sin(time * 1.7)) - 0.02);
      P[HEAD_Z] += tk * 0.04 * Math.sin(time * 2.3);
      P[HEAD_Y] += tk * 0.05 * Math.sin(time * 1.3);
      P[a(RIGHT, ELBOW)] += tk * 0.55 * beat;
      P[a(RIGHT, FLEX)] += tk * 0.25 * beat;
      P[a(RIGHT, CURL)] -= tk * 0.2;
      P[a(LEFT, ELBOW)] += tk * 0.3 * (0.5 + 0.5 * Math.sin(time * 3.1 + 2));
    }
    r.chestMat.emissiveIntensity = 0.3 + 0.55 * tk * (0.6 + 0.4 * Math.min(1, inp.talk * 2));

    // ---------------------------------------------------------- listening
    this.listenW = damp(this.listenW, inp.listening ? 1 : 0, 5, dt);
    const lw = this.listenW;
    P[HEAD_Z] += 0.2 * lw;
    P[HEAD_X] += 0.05 * lw;
    P[SPINE_X] += 0.04 * lw;
    const pulse = 1 + lw * 0.9 * (0.5 + 0.5 * Math.sin(time * 6.5));
    r.antennaMat.color.copy(r.antennaColor).multiplyScalar(pulse);
    r.halo.material.opacity = 0.3 + 0.35 * lw * (0.5 + 0.5 * Math.sin(time * 6.5));
    r.halo.scale.setScalar(0.13 + 0.05 * lw);

    // ---------------------------------------------------------- fidgets
    const idle = speed < 0.05 && !this.gesture && this.talkS < 0.05 && !inp.listening;
    if (!idle) {
      this.nextFidget = Math.max(this.nextFidget, time + 4 + Math.random() * 4);
      if (this.fidget) this.fDur = Math.min(this.fDur, this.fT + BLEND);
    } else if (!this.fidget && time > this.nextFidget) {
      this.fidget = FIDGETS[this.fidgetIdx++ % FIDGETS.length];
      if (Math.random() < 0.3) this.fidgetIdx++;
      this.fT = 0;
      this.fDur = FIDGET_DURATION[this.fidget];
    }
    let overrideW = 0;
    if (this.fidget) {
      this.fT += dt;
      this.fW = clamp(this.fW + (this.fT < this.fDur - BLEND ? dt : -dt) / BLEND, 0, 1);
      const w = smooth01(this.fW);
      overrideW = this.fidgetPose(P, this.fidget, this.fT, w);
      if (this.fT >= this.fDur && this.fW <= 0) {
        this.fidget = null;
        this.nextFidget = time + 5 + Math.random() * 6;
      }
    }

    // ---------------------------------------------------------- gestures
    if (this.gesture) {
      this.gT += dt;
      this.gW = clamp(this.gW + (this.gT < this.gDur - BLEND ? dt : -dt) / BLEND, 0, 1);
      const G = this.G;
      G.set(P);
      const ow = this.gesturePose(G, this.gesture, this.gT, inp);
      const w = smooth01(this.gW);
      for (let i = 0; i < N; i++) P[i] += (G[i] - P[i]) * w;
      overrideW = Math.max(overrideW, ow * w);
      if (this.gesture === 'celebrate') this.jump(P, this.gT - 0.1, 0.2);
      if (this.gT >= this.gDur && this.gW <= 0) {
        this.gesture = null;
        if (this.queued) {
          const q = this.queued;
          this.queued = null;
          this.start(q);
        }
      }
    }

    // ---------------------------------------------------------- smoothing
    const S = this.S;
    const k = 1 - Math.exp(-20 * dt);
    for (let i = 0; i < N; i++) S[i] = UNSMOOTHED.has(i) ? P[i] : S[i] + (P[i] - S[i]) * k;

    // ---------------------------------------------------------- look-at
    let yawT = 0;
    let pitchT = 0;
    if (inp.lookAt) {
      this.lookAngles(inp.lookAt, S[AIR_Y]);
      yawT = this.look.yaw;
      pitchT = this.look.pitch;
    }
    if (overrideW > 0) {
      const o = this.overrideTarget(this.v3);
      if (o) {
        this.lookAngles(o, S[AIR_Y]);
        yawT = lerp(yawT, this.look.yaw, overrideW);
        pitchT = lerp(pitchT, this.look.pitch, overrideW);
      }
    }
    // Head can't look backwards: past ~110° the body will turn instead, so just look ahead-ish.
    if (Math.abs(yawT) > 2.0) yawT = Math.sign(yawT) * 2.0;
    const spineTarget = clamp(yawT * 0.3, -0.35, 0.35);
    this.spineLook = damp(this.spineLook, spineTarget, 6, dt);
    const headYawT = clamp(yawT - this.spineLook - S[SPINE_Y], -1.05, 1.05);
    this.lookYaw = damp(this.lookYaw, headYawT, 8, dt);
    this.lookPitch = damp(this.lookPitch, clamp(pitchT, -0.5, 0.45), 8, dt);

    // Eyes cover what the neck hasn't reached yet, plus tiny saccades.
    if (time > this.nextSacc) {
      this.nextSacc = time + 0.8 + Math.random() * 2.2;
      this.saccX = (Math.random() - 0.5) * 0.25;
      this.saccY = (Math.random() - 0.5) * 0.15;
    }
    const doneYaw = this.lookYaw + this.spineLook + S[SPINE_Y];
    this.face.lookX = clamp((yawT - doneYaw) * 1.6 + this.saccX, -1, 1);
    this.face.lookY = clamp((pitchT - this.lookPitch) * 1.6 + this.saccY, -1, 1);
    this.face.talk = this.talkS;

    // ---------------------------------------------------------- write the rig
    this.apply();
    this.antenna(dt);

    const air = Math.max(0, S[AIR_Y]);
    r.shadow.scale.setScalar(1 - Math.min(0.5, air * 1.6));
    r.shadow.material.opacity = 1 - Math.min(0.6, air * 2.5);
  }

  // ================================================================ layers

  private restPose(P: Float32Array, time: number) {
    P.fill(0);
    const br = Math.sin(time * 2.2);
    P[PELVIS_Y] = 0.0025 * br;
    P[SH_LIFT] = 0.004 * br;
    P[SPINE_X] = 0.02 + 0.012 * br;
    P[SPINE_Z] = 0.022 * Math.sin(time * 0.83);
    P[SPINE_Y] = 0.03 * Math.sin(time * 0.57);
    P[HEAD_Z] = 0.035 * Math.sin(time * 0.71 + 1);
    P[HEAD_X] = 0.015 * Math.sin(time * 1.1);
    for (let k = 0; k < 2; k++) {
      const ph = k * 2.1;
      P[a(k, FLEX)] = 0.06 + 0.035 * Math.sin(time * 1.1 + ph);
      P[a(k, ABD)] = 0.13 + 0.02 * Math.sin(time * 0.9 + ph);
      P[a(k, ELBOW)] = 0.3 + 0.04 * Math.sin(time * 1.3 + ph);
      P[a(k, CURL)] = 0.45;
      P[a(k, INDEX)] = 0.3;
      P[a(k, THUMB)] = 0.1;
    }
  }

  /** Foot targets from a procedural gait cycle: stance feet move back at ground speed. */
  private gait(dt: number, speed: number, drive: number, vx: number, vz: number) {
    const beta = lerp(0.62, 0.32, this.runW); // stance fraction
    const AMAX = 0.12 + 0.045 * this.runW; // half step length the legs can reach (more when crouched)
    const freq = clamp(speed / ((2 * AMAX) / beta), 1.7, 5.6);
    if (this.gaitW > 0.001) this.phase = (this.phase + freq * dt) % 1;
    const A = Math.min(AMAX, (beta * speed) / (2 * freq));
    const dx = speed > 0.02 ? vx / speed : 0;
    const dz = speed > 0.02 ? vz / speed : 1;
    const lift = (0.03 + 0.04 * this.runW) * clamp(drive / 0.4, 0, 1);
    const gw = this.gaitW;
    for (let k = 0; k < 2; k++) {
      const p = (this.phase + k * 0.5) % 1;
      let off: number;
      let y = 0;
      let pitch = 0;
      if (p < beta) {
        off = A * (1 - (2 * p) / beta);
      } else {
        const s = (p - beta) / (1 - beta);
        off = A * (-1 + 2 * smooth01(s));
        y = lift * Math.sin(Math.PI * s);
        pitch = -0.35 * Math.sin(Math.PI * s) * clamp(drive, 0, 1);
      }
      const side = k === 0 ? 1 : -1;
      const i = k * 4;
      this.foot[i] = side * DIM.hipX + off * dx * gw;
      this.foot[i + 1] = DIM.ankleY + y * gw;
      this.foot[i + 2] = DIM.footZ + off * dz * gw;
      this.foot[i + 3] = pitch * gw;
    }
    // Body bob: highest at mid-stance; a small crouch while walking gives the legs reach.
    const P = this.P;
    const b = Math.cos(2 * TAU * (this.phase - beta / 2));
    P[PELVIS_Y] += gw * (-0.018 - 0.045 * this.runW + 0.011 * b * clamp(speed, 0, 1));
    P[AIR_Y] += gw * this.runW * 0.03 * Math.max(0, -b);
  }

  /** Crouch, ballistic jump of height h, landing squash. t is time since the gesture began. */
  private jump(P: Float32Array, t: number, h: number) {
    if (t < 0) return;
    const T = 2 * Math.sqrt((2 * h) / 9.81);
    const tc = 0.16;
    const tl = 0.22;
    if (t < tc) P[PELVIS_Y] -= 0.05 * Math.sin((t / tc) * Math.PI * 0.5);
    else if (t < tc + T) {
      const u = t - tc;
      const v0 = (9.81 * T) / 2;
      P[AIR_Y] += Math.max(0, v0 * u - 0.5 * 9.81 * u * u);
      P[PELVIS_Y] -= 0.05 * Math.max(0, 1 - u / 0.06);
    } else if (t < tc + T + tl) {
      P[PELVIS_Y] -= 0.05 * Math.sin((Math.PI * (t - tc - T)) / tl);
    }
  }

  /** Writes a fidget into P (already weighted). Returns the look-override weight. */
  private fidgetPose(P: Float32Array, f: Fidget, t: number, w: number): number {
    switch (f) {
      case 'look':
        return w;
      case 'hop':
        if (w > 0) this.jump(P, t, 0.07);
        P[a(LEFT, ABD)] += 0.25 * w * window01(t, 0.1, 0.8, 0.15);
        P[a(RIGHT, ABD)] += 0.25 * w * window01(t, 0.1, 0.8, 0.15);
        return 0;
      case 'gauntlet': {
        const L = LEFT;
        P[a(L, FLEX)] = lerp(P[a(L, FLEX)], 0.75, w);
        P[a(L, ABD)] = lerp(P[a(L, ABD)], 0.05, w);
        P[a(L, TWIST)] = lerp(P[a(L, TWIST)], 0.35, w);
        P[a(L, ELBOW)] = lerp(P[a(L, ELBOW)], 1.75, w);
        P[a(L, WRIST_X)] = lerp(P[a(L, WRIST_X)], -0.2 + 0.15 * Math.sin(t * 3), w);
        P[a(L, CURL)] = lerp(P[a(L, CURL)], 0.7, w);
        P[HEAD_Z] += 0.12 * w;
        return w;
      }
    }
  }

  /** Look target for the active fidget/gesture override (world space), or null. */
  private overrideTarget(out: THREE.Vector3): THREE.Vector3 | null {
    const r = this.rig;
    if (this.gesture === 'think') {
      out.set(0.6, DIM.eyeY + 1.4, 2.2);
      return r.root.localToWorld(out);
    }
    if (this.fidget === 'gauntlet') return r.arms[LEFT].wrist.getWorldPosition(out);
    if (this.fidget === 'look') {
      const t = this.fT;
      const yaw = t < 1.4 ? -0.95 : 0.85;
      const pitch = t < 1.4 ? 0.05 : 0.2;
      out.set(Math.sin(yaw) * 3, DIM.eyeY + Math.sin(pitch) * 3, Math.cos(yaw) * 3);
      return r.root.localToWorld(out);
    }
    return null;
  }

  /** Writes the gesture's full-weight pose into G. Returns the look-override weight. */
  private gesturePose(G: Float32Array, g: Gesture, t: number, inp: AnimInput): number {
    const R = RIGHT;
    const L = LEFT;
    switch (g) {
      case 'wave': {
        const s = Math.sin(t * 11);
        G[a(R, FLEX)] = 0;
        G[a(R, ABD)] = 2.3 + 0.12 * s;
        G[a(R, TWIST)] = 1.6;
        G[a(R, ELBOW)] = 0.5 + 0.3 * (0.5 + 0.5 * Math.sin(t * 11 + 0.9));
        G[a(R, WRIST_Z)] = 0.2 * s;
        G[a(R, CURL)] = 0.05;
        G[a(R, INDEX)] = 0;
        G[a(R, THUMB)] = -0.3;
        G[HEAD_Z] += 0.1;
        G[SPINE_Z] -= 0.04;
        return 0;
      }
      case 'point': {
        let yaw = 0;
        let elev = -0.05;
        if (inp.pointAt) {
          const p = this.rig.root.worldToLocal(this.v1.copy(inp.pointAt));
          yaw = Math.atan2(p.x, Math.max(0.05, p.z));
          if (p.z < 0) yaw = Math.sign(p.x || 1) * 1.4;
        }
        // Point with the arm on the target's side (the gauntlet arm for things on Buddy's left).
        const k = yaw > 0.25 ? L : R;
        const side = k === L ? 1 : -1;
        if (inp.pointAt) {
          const p = this.v1;
          const sx = side * 0.178;
          const sy = DIM.pelvisY + 0.25 + G[AIR_Y];
          yaw = Math.atan2(p.x - sx, Math.max(0.05, p.z));
          if (p.z < 0) yaw = Math.sign(p.x - sx || 1) * 1.4;
          elev = Math.atan2(p.y - sy, Math.hypot(p.x - sx, p.z));
        }
        const turn = clamp(yaw * 0.35, -0.4, 0.4);
        G[SPINE_Y] += turn;
        G[a(k, FLEX)] = clamp(Math.PI / 2 + elev, 0.9, 2.4);
        G[a(k, ABD)] = clamp(side * (yaw - turn), -0.5, 1.3);
        G[a(k, TWIST)] = 0;
        G[a(k, ELBOW)] = 0.12;
        G[a(k, WRIST_X)] = 0;
        G[a(k, CURL)] = 1;
        G[a(k, INDEX)] = 0;
        G[a(k, THUMB)] = 0.9;
        G[a(1 - k, ABD)] = 0.2;
        G[SPINE_X] -= 0.03;
        return 0;
      }
      case 'think': {
        G[a(R, FLEX)] = 1.1;
        G[a(R, ABD)] = -0.4;
        G[a(R, TWIST)] = -0.4;
        G[a(R, ELBOW)] = 1.1;
        G[a(R, WRIST_X)] = 0;
        G[a(R, CURL)] = 0.85;
        G[a(R, INDEX)] = 0.15;
        G[a(R, THUMB)] = 0.6;
        // Gauntlet fist on the hip
        G[a(L, FLEX)] = 0;
        G[a(L, ABD)] = 0.7;
        G[a(L, TWIST)] = -1.4;
        G[a(L, ELBOW)] = 1.7;
        G[a(L, CURL)] = 0.9;
        G[a(L, INDEX)] = 0.9;
        G[HEAD_Z] += 0.14;
        G[SPINE_Z] += 0.03;
        return 0.7;
      }
      case 'celebrate': {
        const s = Math.sin(t * 13);
        for (let k = 0; k < 2; k++) {
          G[a(k, FLEX)] = 0.35;
          G[a(k, ABD)] = 2.6 + 0.1 * (k === 0 ? s : -s);
          G[a(k, TWIST)] = 0.2;
          G[a(k, ELBOW)] = 0.2;
          G[a(k, CURL)] = 0.05;
          G[a(k, INDEX)] = 0;
          G[a(k, THUMB)] = -0.3;
        }
        G[HEAD_X] -= 0.15;
        G[SPINE_X] -= 0.05;
        return 0;
      }
      case 'thumbsUp': {
        G[a(R, FLEX)] = 0.45;
        G[a(R, ABD)] = 0.15;
        G[a(R, TWIST)] = 0;
        G[a(R, ELBOW)] = 1.15;
        G[a(R, CURL)] = 1;
        G[a(R, INDEX)] = 1;
        G[a(R, THUMB)] = -1;
        G[HEAD_Z] += 0.12;
        G[HEAD_X] += 0.06 * Math.sin(t * 7) * window01(t, 0.3, 1.4, 0.2);
        return 0;
      }
      case 'shrug': {
        for (let k = 0; k < 2; k++) {
          G[a(k, FLEX)] = 0.2;
          G[a(k, ABD)] = 0.4;
          G[a(k, TWIST)] = 1.4;
          G[a(k, ELBOW)] = 1.4;
          G[a(k, WRIST_Y)] = 1.5;
          G[a(k, CURL)] = 0.1;
          G[a(k, INDEX)] = 0.05;
          G[a(k, THUMB)] = -0.2;
        }
        G[SH_LIFT] += 0.028 * window01(t, 0.15, 1.4, 0.2);
        G[HEAD_Z] += 0.18;
        G[HEAD_X] += 0.04;
        return 0;
      }
      case 'nod': {
        G[HEAD_X] += 0.22 * Math.sin(t * TAU * 1.8) * window01(t, 0.05, 1.15, 0.15);
        return 0;
      }
      case 'clap': {
        const c = Math.cos(t * TAU * 2.6);
        for (let k = 0; k < 2; k++) {
          G[a(k, FLEX)] = 1.1;
          G[a(k, ABD)] = -0.82 + 0.6 * (0.5 + 0.5 * c);
          G[a(k, TWIST)] = 0;
          G[a(k, ELBOW)] = 0.6;
          G[a(k, CURL)] = 0.1;
          G[a(k, INDEX)] = 0.05;
          G[a(k, THUMB)] = 0;
        }
        // Hands meet when c is at its minimum.
        const cycle = Math.floor(t * 2.6 - 0.5);
        if (cycle >= 0 && cycle !== this.lastClap && t > 0.3 && t < this.gDur - 0.3) {
          this.lastClap = cycle;
          this.onClap?.();
        }
        G[HEAD_X] += 0.05;
        return 0;
      }
    }
  }

  // ================================================================ rig output

  private lookAngles(world: THREE.Vector3, air: number) {
    const p = this.rig.root.worldToLocal(this.v2.copy(world));
    const dy = p.y - (DIM.eyeY + air);
    this.look.yaw = Math.atan2(p.x, p.z);
    this.look.pitch = Math.atan2(dy, Math.max(0.2, Math.hypot(p.x, p.z)));
  }

  private apply() {
    const S = this.S;
    const r = this.rig;
    r.body.position.y = Math.max(0, S[AIR_Y]);
    r.pelvis.position.y = DIM.pelvisY + S[PELVIS_Y];
    r.spine.rotation.set(S[SPINE_X], S[SPINE_Y] + this.spineLook, S[SPINE_Z]);
    r.head.rotation.set(S[HEAD_X] - this.lookPitch - S[SPINE_X] * 0.7, S[HEAD_Y] + this.lookYaw, S[HEAD_Z]);

    for (let k = 0; k < 2; k++) {
      const arm = r.arms[k];
      const s = arm.side;
      const i = ARM0 + k * ARM_N;
      arm.shoulder.position.y = arm.shoulderY + S[SH_LIFT];
      arm.shoulder.rotation.set(-S[i + FLEX], s * S[i + TWIST], s * S[i + ABD]);
      arm.elbow.rotation.x = -Math.max(0, S[i + ELBOW]);
      arm.wrist.rotation.set(-S[i + WRIST_X], s * S[i + WRIST_Y], s * S[i + WRIST_Z]);
      arm.fingers.rotation.z = -s * clamp(S[i + CURL], 0, 1) * 1.6;
      arm.index.rotation.z = -s * clamp(S[i + INDEX], 0, 1) * 1.6;
      const th = clamp(S[i + THUMB], -1, 1);
      const out = th >= 0 ? 0.5 + 0.4 * th : 0.5 + 1.1 * -th;
      const across = th >= 0 ? 0.2 + 0.7 * th : 0.2 * (1 + th);
      arm.thumb.rotation.set(-out, 0, -s * across);
    }

    // Legs: two-bone IK in the (rolled) sagittal plane towards the foot targets.
    const hipY = r.body.position.y + r.pelvis.position.y + DIM.hipY;
    const air = r.body.position.y;
    for (let k = 0; k < 2; k++) {
      const leg = r.legs[k];
      const j = k * 4;
      const dx = this.foot[j] - leg.side * DIM.hipX;
      const dy = this.foot[j + 1] + air * 0.55 - hipY;
      const dz = this.foot[j + 2];
      const roll = Math.atan2(dx, -dy);
      const v = Math.hypot(dx, dy);
      const L1 = DIM.thigh;
      const L2 = DIM.shin;
      const d = clamp(Math.hypot(dz, v), 0.05, L1 + L2 - 1e-4);
      const phi = Math.atan2(dz, v);
      const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const beta = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
      const thigh = phi + alpha;
      const knee = Math.PI - beta;
      leg.hip.rotation.set(-thigh, 0, roll);
      leg.knee.rotation.x = knee;
      leg.ankle.rotation.set(thigh - knee + this.foot[j + 3], 0, -roll);
    }
  }

  /** Spring-damper antenna driven by the acceleration of its base. */
  private antenna(dt: number) {
    const r = this.rig;
    const base = r.antenna.getWorldPosition(this.v1);
    if (!this.dynInit || dt <= 0) {
      this.prevBase.copy(base);
      this.prevVel.set(0, 0, 0);
      this.dynInit = true;
      return;
    }
    const vel = this.v2.subVectors(base, this.prevBase).divideScalar(dt);
    const acc = this.v3.subVectors(vel, this.prevVel).divideScalar(dt);
    this.prevBase.copy(base);
    this.prevVel.copy(vel);
    if (acc.lengthSq() > 900) acc.setLength(30);
    r.head.getWorldQuaternion(this.q).invert();
    acc.applyQuaternion(this.q);
    const K = 170;
    const C = 4.2;
    const GAIN = 2.6;
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.antVX += (-K * this.antX - C * this.antVX - acc.z * GAIN) * h;
      this.antVZ += (-K * this.antZ - C * this.antVZ + acc.x * GAIN) * h;
      this.antX += this.antVX * h;
      this.antZ += this.antVZ * h;
    }
    this.antX = clamp(this.antX, -0.6, 0.6);
    this.antZ = clamp(this.antZ, -0.6, 0.6);
    r.antenna.rotation.set(this.antX, 0, this.antZ);
  }
}
