/**
 * Buddy, the robot guide: behaviour (following, standing beside stations, speaking,
 * reacting). The mesh lives in BuddyModel, the face in Face, the motion in BuddyAnimator.
 */
import * as THREE from 'three';
import type { BuddyController, BuddyFrameState, Expression, Gesture, L10n } from '../core/types';
import type { Sfx } from '../core/sfx';
import type { Collision, Segment } from '../core/collision';
import { buildBuddy, type BuddyRig } from './BuddyModel';
import { Face } from './Face';
import { BuddyAnimator, type AnimInput } from './BuddyAnimator';

export interface BuddyDeps {
  scene: THREE.Scene;
  sfx: Sfx;
  collision: Collision;
}

const RADIUS = 0.3;
/** Follow spots relative to the visitor: (metres forward, metres sideways); sideways is mirrored to the preferred side. */
const FOLLOW_SLOTS: readonly (readonly [number, number])[] = [
  [2.3, 1.05],
  [1.6, 1.45],
  [2.8, 0.5],
  [-0.2, 1.6],
  [-1.3, 0.8],
];
/** Spots beside an exhibit: (metres towards the camera, metres sideways off the camera–exhibit line). */
// [along towards the camera, sideways] from the exhibit. Tried in order; the sideways part is
// clamped so Buddy stays inside the camera frame.
const FOCUS_SLOTS: readonly (readonly [number, number])[] = [
  [0.3, 1.3],
  [0.0, 1.6],
  [0.7, 1.2],
  [-0.5, 1.4],
  [1.1, 1.0],
  [-1.0, 0.9],
];
const CRUMBS = 48;
const WALK = 1.8;
const KEEP_UP = 3.6;
const RUN = 6.2;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function segmentsCross(ax: number, az: number, bx: number, bz: number, s: Segment): boolean {
  const d1x = bx - ax;
  const d1z = bz - az;
  const d2x = s.bx - s.ax;
  const d2z = s.bz - s.az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const ex = s.ax - ax;
  const ez = s.az - az;
  const t = (ex * d2z - ez * d2x) / den;
  const u = (ex * d1z - ez * d1x) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

export class Buddy implements BuddyController {
  readonly root: THREE.Group;
  speaker: ((line: L10n) => void) | null = null;

  private readonly rig: BuddyRig;
  private readonly face = new Face();
  private readonly anim: BuddyAnimator;

  private time = 0;
  private placed = false;
  private readonly vel = new THREE.Vector2();
  private readonly animVel = new THREE.Vector2();
  private readonly prevPos = new THREE.Vector3();
  private readonly prevPlayer = new THREE.Vector3();
  private readonly playerVel = new THREE.Vector2();
  private wasFocused = false;
  private yaw = 0;
  private yawRate = 0;
  private idleYaw = 0;

  private readonly goal = new THREE.Vector3();
  private readonly waypoint = new THREE.Vector3();
  private goalDist = 0;
  private waypointIsGoal = true;
  private settled = false;
  private unhappyT = 0;
  private retargetT = 0;
  private pathT = 0;
  private stuckT = 0;
  private side = 1;

  private focusSide = 0;
  private readonly focusKey = new THREE.Vector3(Infinity, 0, 0);
  private readonly attendPt = new THREE.Vector3();
  private attendUntil = -1;
  private attendSlotDirty = false;

  private readonly crumbs = Array.from({ length: CRUMBS }, () => new THREE.Vector3());
  private crumbN = 0;
  private crumbHead = 0;

  private exprUntil = 0;
  private lastActive = 0;
  private listening = false;
  private deferred: Gesture | null = null;
  private deferUntil = 0;

  private readonly lookPt = new THREE.Vector3();
  private readonly input: AnimInput = {
    velX: 0,
    velZ: 0,
    yawRate: 0,
    lookAt: null,
    pointAt: null,
    talk: 0,
    listening: false,
  };

  constructor(private readonly deps: BuddyDeps) {
    this.rig = buildBuddy(this.face.texture);
    this.root = this.rig.root;
    this.anim = new BuddyAnimator(this.rig, this.face);
    this.anim.onClap = () => deps.sfx.noise(0.07, { freq: 2400, q: 0.6, gain: 0.14 });
    deps.scene.add(this.root);
    if (import.meta.env?.DEV) (window as unknown as Record<string, unknown>).__buddy = this;
  }

  // ================================================================ BuddyApi

  say(text: L10n, opts?: { expression?: Expression; gesture?: Gesture; priority?: boolean }) {
    const len = Math.max(text.sv.length, text.en.length);
    if (opts?.expression) this.emote(opts.expression, clamp(len * 70, 3000, 9000));
    if (opts?.gesture) this.gesture(opts.gesture);
    this.lastActive = this.time;
    this.speaker?.(text);
  }

  emote(expression: Expression, ms = 4000) {
    this.face.setExpression(expression);
    this.exprUntil = this.time + ms / 1000;
    this.lastActive = this.time;
  }

  gesture(gesture: Gesture) {
    this.lastActive = this.time;
    // Point once Buddy has arrived beside the exhibit, not while still walking there.
    if (gesture === 'point' && this.goalDist > 0.6) {
      this.deferred = gesture;
      this.deferUntil = this.time + 3;
      return;
    }
    this.anim.play(gesture);
  }

  celebrate(text?: L10n) {
    this.emote('joy', 2600);
    this.gesture('celebrate');
    this.deps.sfx.chime();
    if (text) this.say(text);
  }

  attend(worldPoint: THREE.Vector3) {
    this.attendPt.copy(worldPoint);
    this.attendUntil = this.time + 7;
    this.attendSlotDirty = true;
    this.lastActive = this.time;
  }

  // ================================================================ BuddyController

  setListening(on: boolean) {
    this.listening = on;
    this.lastActive = this.time;
  }

  placeNear(pos: THREE.Vector3, yaw: number) {
    this.placed = true;
    this.followSlot(pos, yaw, this.goal);
    this.root.position.set(this.goal.x, 0, this.goal.z);
    this.prevPos.copy(this.root.position);
    this.prevPlayer.copy(pos);
    this.playerVel.set(0, 0);
    this.waypoint.copy(this.goal);
    this.vel.set(0, 0);
    this.animVel.set(0, 0);
    this.yaw = this.idleYaw = Math.atan2(pos.x - this.goal.x, pos.z - this.goal.z);
    this.root.rotation.y = this.yaw;
    this.settled = true;
    this.unhappyT = 0;
    this.stuckT = 0;
    this.crumbN = 0;
    this.focusKey.set(Infinity, 0, 0);
    this.anim.resetDynamics();
  }

  update(dt: number, time: number, s: BuddyFrameState) {
    this.time = time;
    const P = s.playerPos;
    const pos = this.root.position;
    if (!this.placed || (pos.x - P.x) ** 2 + (pos.z - P.z) ** 2 > 25 * 25) this.placeNear(P, s.playerYaw);
    if (dt <= 0) return;
    this.recordCrumb(P);
    // Visitor velocity (smoothed), used to keep pace instead of lagging behind.
    const kp = 1 - Math.exp(-8 * dt);
    this.playerVel.x += ((P.x - this.prevPlayer.x) / dt - this.playerVel.x) * kp;
    this.playerVel.y += ((P.z - this.prevPlayer.z) / dt - this.playerVel.y) * kp;
    if (this.playerVel.lengthSq() > 100) this.playerVel.set(0, 0);
    this.prevPlayer.copy(P);
    if (this.wasFocused && !s.focus) this.attendUntil = Math.min(this.attendUntil, time);
    this.wasFocused = !!s.focus;
    const talking = s.talkLevel > 0.05;
    if (s.moving || talking || this.listening) this.lastActive = time;

    // ---------------------------------------------------------- where to stand
    let beside: THREE.Vector3 | null = null;
    if (s.focus) {
      beside = s.focus.world;
      this.attendPt.copy(s.focus.world);
      this.attendUntil = Math.max(this.attendUntil, time + 1.5);
      if (this.focusKey.distanceToSquared(s.focus.world) > 0.01) {
        this.focusKey.copy(s.focus.world);
        this.focusSide = 0;
        this.besideSlot(s.focus.world, s.focus.viewPos, this.goal);
        this.pathT = 0;
      }
      this.settled = false;
    } else if (this.attendUntil > time && this.attendPt.distanceToSquared(P) < 64) {
      beside = this.attendPt;
      if (this.attendSlotDirty) {
        this.attendSlotDirty = false;
        this.focusSide = 0;
        this.besideSlot(this.attendPt, s.cameraPos, this.goal);
        this.pathT = 0;
      }
      this.settled = false;
    } else {
      this.focusKey.set(Infinity, 0, 0);
      this.follow(dt, P, s.playerYaw, s.moving);
    }

    // ---------------------------------------------------------- path (direct, or along the visitor's trail)
    this.pathT -= dt;
    if (this.pathT <= 0) {
      this.pathT = 0.2;
      this.choosePath();
    }

    // ---------------------------------------------------------- move
    const wx = this.waypoint.x - pos.x;
    const wz = this.waypoint.z - pos.z;
    const wd = Math.hypot(wx, wz);
    this.goalDist = Math.hypot(this.goal.x - pos.x, this.goal.z - pos.z);
    const toPlayer = Math.hypot(P.x - pos.x, P.z - pos.z);
    let maxSpeed = s.moving && !beside ? KEEP_UP : WALK;
    if (this.goalDist > 6 || toPlayer > 7) maxSpeed = RUN;
    const speed = this.settled ? 0 : this.waypointIsGoal ? Math.min(maxSpeed, Math.max(0, wd - 0.04) * 2.4) : maxSpeed;
    const k = 1 - Math.exp(-6 * dt);
    let tx = wd > 1e-4 ? (wx / wd) * speed : 0;
    let tz = wd > 1e-4 ? (wz / wd) * speed : 0;
    if (s.moving && !beside && !this.settled) {
      // Feed-forward: move with the visitor, plus the correction towards the follow spot.
      tx += this.playerVel.x;
      tz += this.playerVel.y;
      const m = Math.hypot(tx, tz);
      if (m > RUN) {
        tx *= RUN / m;
        tz *= RUN / m;
      }
    }
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (tz - this.vel.y) * k;
    let nx = pos.x + this.vel.x * dt;
    let nz = pos.z + this.vel.y * dt;
    // Keep a polite distance from the visitor, then stay out of walls.
    const px = nx - P.x;
    const pz = nz - P.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.7 && pd > 1e-4) {
      nx = P.x + (px / pd) * 0.7;
      nz = P.z + (pz / pd) * 0.7;
    }
    [nx, nz] = this.deps.collision.resolve(nx, nz, RADIUS);
    pos.set(nx, 0, nz);

    const ax = (pos.x - this.prevPos.x) / dt;
    const az = (pos.z - this.prevPos.z) / dt;
    this.prevPos.copy(pos);
    const ka = 1 - Math.exp(-12 * dt);
    this.animVel.x += (ax - this.animVel.x) * ka;
    this.animVel.y += (az - this.animVel.y) * ka;
    const moveSpeed = this.animVel.length();

    // Stuck behind something for a while: hop to the goal (rare; the trail usually avoids it).
    if (speed > 0.8 && moveSpeed < 0.15) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 2.5) {
      this.stuckT = 0;
      pos.set(this.goal.x, 0, this.goal.z);
      this.prevPos.copy(pos);
      this.anim.resetDynamics();
    }

    // ---------------------------------------------------------- facing
    const cam = s.cameraPos;
    const toCam = Math.atan2(cam.x - pos.x, cam.z - pos.z);
    let face: number;
    if ((moveSpeed > 0.4 && wd > 1.2) || moveSpeed > 1.6) {
      face = Math.atan2(this.vel.x, this.vel.y);
      this.idleYaw = toCam;
    } else if (beside) {
      const toE = Math.atan2(beside.x - pos.x, beside.z - pos.z);
      const pointing = this.anim.currentGesture === 'point';
      face = toCam + wrap(toE - toCam) * (pointing ? 0.7 : 0.35);
    } else {
      if (Math.abs(wrap(this.idleYaw - toCam)) > 0.6 || moveSpeed > 0.4) this.idleYaw = toCam;
      face = this.idleYaw;
    }
    const diff = wrap(face - this.yaw);
    const step = clamp(diff * (1 - Math.exp(-7 * dt)), -6 * dt, 6 * dt);
    this.yaw = wrap(this.yaw + step);
    this.yawRate += (step / dt - this.yawRate) * ka;
    this.root.rotation.y = this.yaw;

    // ---------------------------------------------------------- deferred gesture, expression
    if (this.deferred && (this.goalDist < 0.5 || time > this.deferUntil)) {
      this.anim.play(this.deferred);
      this.deferred = null;
    }
    const base: Expression = time - this.lastActive > 45 && !s.focus ? 'sleepy' : 'happy';
    if (time > this.exprUntil && !talking && this.face.expression !== base) this.face.setExpression(base);

    // ---------------------------------------------------------- look target
    const attending = this.attendUntil > time;
    const pointing = this.anim.currentGesture === 'point';
    let look: THREE.Vector3 | null = cam;
    if (attending && (pointing || (!talking && time % 5 > 1.3))) {
      this.lookPt.copy(this.attendPt);
      if (this.lookPt.y < 0.3) this.lookPt.y = 0.8;
      look = this.lookPt;
    }
    if (moveSpeed > 1.5 && wd > 3) look = null;

    // ---------------------------------------------------------- animate
    const c = Math.cos(this.yaw);
    const sn = Math.sin(this.yaw);
    const inp = this.input;
    inp.velX = this.animVel.x * c - this.animVel.y * sn;
    inp.velZ = this.animVel.x * sn + this.animVel.y * c;
    inp.yawRate = this.yawRate;
    inp.lookAt = look;
    inp.pointAt = attending ? this.attendPt : null;
    inp.talk = s.talkLevel;
    inp.listening = this.listening;
    this.anim.update(dt, time, inp);
    this.face.update(dt, time);
  }

  // ================================================================ navigation

  /** Follow mode: stay put while comfortably in view, otherwise walk to a follow spot. */
  private follow(dt: number, P: THREE.Vector3, yaw: number, moving: boolean) {
    const pos = this.root.position;
    const dx = pos.x - P.x;
    const dz = pos.z - P.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const inView = (dx * fx + dz * fz) / d > 0.45;
    const comfy = d > 1.15 && d < 2.6 && inView && !moving;
    if (this.settled) {
      this.unhappyT = comfy ? 0 : this.unhappyT + dt;
      if (this.unhappyT > (d < 1.0 ? 0.1 : 0.7)) {
        this.settled = false;
        this.unhappyT = 0;
        this.retargetT = 0;
      } else {
        this.goal.set(pos.x, 0, pos.z);
        return;
      }
    }
    this.retargetT -= dt;
    if (this.retargetT <= 0) {
      this.retargetT = 0.25;
      this.followSlot(P, yaw, this.goal);
      this.pathT = 0;
    }
    if (!moving && Math.hypot(this.goal.x - pos.x, this.goal.z - pos.z) < 0.18) {
      this.settled = true;
      this.goal.set(pos.x, 0, pos.z);
    }
  }

  /** A free spot in front of and to the side of the visitor (preferring Buddy's current side). */
  private followSlot(P: THREE.Vector3, yaw: number, out: THREE.Vector3) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const pos = this.root.position;
    const cur = (pos.x - P.x) * rx + (pos.z - P.z) * rz;
    if (Math.abs(cur) > 0.3) this.side = Math.sign(cur);
    for (const [f, l] of FOLLOW_SLOTS) {
      for (let t = 0; t < 2; t++) {
        const sgn = t === 0 ? this.side : -this.side;
        const cx = P.x + fx * f + rx * l * sgn;
        const cz = P.z + fz * f + rz * l * sgn;
        if (this.freeSpot(P.x, P.z, cx, cz, out)) {
          this.side = sgn;
          return;
        }
      }
    }
    const [x, z] = this.deps.collision.resolve(P.x + fx * 0.9, P.z + fz * 0.9, RADIUS);
    out.set(x, 0, z);
  }

  /** Beside an exhibit E, seen from V: off the V–E line so Buddy never blocks the view. */
  private besideSlot(E: THREE.Vector3, V: THREE.Vector3, out: THREE.Vector3) {
    let dx = V.x - E.x;
    let dz = V.z - E.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) {
      dx = 0;
      dz = 1;
    } else {
      dx /= l;
      dz /= l;
    }
    const nx = -dz;
    const nz = dx;
    // n points to the camera's screen-left; prefer it, since the station panel covers the right.
    if (this.focusSide === 0) this.focusSide = 1;
    for (const [along, side] of FOCUS_SLOTS) {
      const a = Math.min(along, l * 0.7);
      const perp = Math.min(side, Math.max(0.8, (l - a) * 0.72));
      for (let t = 0; t < 2; t++) {
        const sgn = t === 0 ? this.focusSide : -this.focusSide;
        const cx = E.x + dx * a + nx * perp * sgn;
        const cz = E.z + dz * a + nz * perp * sgn;
        // Never stand right under the camera's nose: keep ≥ 1.7 m from it.
        if (this.freeSpot(V.x, V.z, cx, cz, out) && (out.x - V.x) ** 2 + (out.z - V.z) ** 2 >= 1.7 * 1.7) {
          this.focusSide = sgn;
          return;
        }
      }
    }
    // Fallback: beside and slightly behind the exhibit, away from the camera.
    const [x, z] = this.deps.collision.resolve(E.x - dx * 0.8 + nx * 1.2 * this.focusSide, E.z - dz * 0.8 + nz * 1.2 * this.focusSide, RADIUS);
    out.set(x, 0, z);
  }

  /** Is (cx, cz) reachable in a straight line from (fromX, fromZ) and clear of walls? Writes the spot to out. */
  private freeSpot(fromX: number, fromZ: number, cx: number, cz: number, out: THREE.Vector3): boolean {
    if (!this.clearLine(fromX, fromZ, cx, cz)) return false;
    const [x, z] = this.deps.collision.resolve(cx, cz, RADIUS);
    if ((x - cx) ** 2 + (z - cz) ** 2 > 0.15 * 0.15) return false;
    out.set(x, 0, z);
    return true;
  }

  private clearLine(ax: number, az: number, bx: number, bz: number): boolean {
    const col = this.deps.collision;
    for (const s of col.segments) if (segmentsCross(ax, az, bx, bz, s)) return false;
    for (const g of col.gates.values()) {
      if (g.open) continue;
      for (const s of g.segs) if (segmentsCross(ax, az, bx, bz, s)) return false;
    }
    return true;
  }

  /** Head straight for the goal if nothing is in the way, else for the newest visible trail point. */
  private choosePath() {
    const pos = this.root.position;
    if (this.clearLine(pos.x, pos.z, this.goal.x, this.goal.z)) {
      this.waypoint.copy(this.goal);
      this.waypointIsGoal = true;
      return;
    }
    this.waypointIsGoal = false;
    for (let i = 0; i < this.crumbN; i++) {
      const c = this.crumbs[(this.crumbHead - 1 - i + CRUMBS) % CRUMBS];
      if ((c.x - pos.x) ** 2 + (c.z - pos.z) ** 2 < 0.04) continue;
      if (this.clearLine(pos.x, pos.z, c.x, c.z)) {
        this.waypoint.copy(c);
        return;
      }
    }
    this.waypoint.copy(this.goal);
    this.waypointIsGoal = true;
  }

  private recordCrumb(P: THREE.Vector3) {
    if (this.crumbN > 0) {
      const last = this.crumbs[(this.crumbHead - 1 + CRUMBS) % CRUMBS];
      if ((last.x - P.x) ** 2 + (last.z - P.z) ** 2 < 0.7 * 0.7) return;
    }
    this.crumbs[this.crumbHead].set(P.x, 0, P.z);
    this.crumbHead = (this.crumbHead + 1) % CRUMBS;
    this.crumbN = Math.min(CRUMBS, this.crumbN + 1);
  }
}
