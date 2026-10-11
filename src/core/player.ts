/**
 * First-person visitor: WASD/arrows + drag to look on desktop, joystick + drag on touch,
 * click-on-floor to walk there, and a "focus" mode that glides the camera to a station close-up.
 */
import * as THREE from 'three';
import type { Collision } from './collision';
import type { Interaction } from './interaction';

const EYE = 1.62;
const RADIUS = 0.32;
const WALK = 3.2;
const RUN = 6.0;

export class Player {
  readonly position = new THREE.Vector3(0, 0, 8);
  yaw = 0;
  pitch = -0.05;
  private keys = new Set<string>();
  private walkTarget: THREE.Vector3 | null = null;
  private joy = { x: 0, y: 0, active: false };
  private lookDrag: { id: number; x: number; y: number } | null = null;
  private bob = 0;
  private velocity = new THREE.Vector3();
  /** While focused the camera sits at a station viewpoint. */
  private focus: {
    from: THREE.Vector3; fromQ: THREE.Quaternion;
    pos: THREE.Vector3; target: THREE.Vector3; t: number;
    yawOff: number; pitchOff: number;
  } | null = null;
  private returnFrom: { pos: THREE.Vector3; q: THREE.Quaternion; t: number } | null = null;
  /** Fired when the visitor moves on their own while focused (to close the station panel). */
  onLeaveFocus: (() => void) | null = null;
  inputEnabled = false;
  /** Whether movement happened this frame (for footstep/bob/Buddy following). */
  speed = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private collision: Collision,
    private interaction: Interaction,
  ) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (this.focus && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        this.onLeaveFocus?.();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isFocused() {
    return !!this.focus;
  }

  get eye() {
    return EYE;
  }

  /** Joystick input from the touch UI, each axis -1..1. */
  setJoystick(x: number, y: number, active: boolean) {
    this.joy = { x, y, active };
    if (active && this.focus && Math.hypot(x, y) > 0.3) this.onLeaveFocus?.();
  }

  walkTo(p: THREE.Vector3) {
    if (this.focus) return;
    this.walkTarget = p.clone();
  }

  teleport(pos: THREE.Vector3, yaw: number) {
    this.position.set(pos.x, 0, pos.z);
    this.yaw = yaw;
    this.pitch = -0.05;
    this.walkTarget = null;
    this.focus = null;
    this.returnFrom = null;
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
  }

  /** Glide the camera to a close-up. World space. */
  focusOn(pos: THREE.Vector3, target: THREE.Vector3, fixed = false) {
    this.walkTarget = null;
    this.focus = {
      from: this.camera.position.clone(),
      fromQ: this.camera.quaternion.clone(),
      pos: fixed ? pos.clone() : this.fitViewpoint(pos, target),
      target: target.clone(),
      t: 0,
      yawOff: 0,
      pitchOff: 0,
    };
  }

  /**
   * Viewpoints are authored for a landscape screen. On narrow (portrait) screens the horizontal field of
   * view is much smaller, so pull the camera back along the view line, but never through a wall.
   */
  private fitViewpoint(pos: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const k = Math.min(2.2, Math.max(1, 0.75 / halfH));
    if (k <= 1.01) return pos.clone();
    const dir = new THREE.Vector3().subVectors(pos, target);
    const want = target.clone().addScaledVector(dir, k);
    // Stop 0.35 m before the first wall between the original viewpoint and the pulled-back one.
    let tMax = 1;
    for (const sg of this.collision.segments) {
      const t = segHit(pos.x, pos.z, want.x, want.z, sg.ax, sg.az, sg.bx, sg.bz);
      if (t !== null) tMax = Math.min(tMax, t);
    }
    const len = pos.distanceTo(want);
    const tSafe = len > 0 ? Math.max(0, tMax - 0.35 / len) : 0;
    return pos.clone().lerp(want, tSafe);
  }

  /** On narrow screens the station sheet covers the bottom half: shift the image up while focused. */
  private applyViewShift(amount: number) {
    const cam = this.camera;
    const narrow = window.innerWidth < 760;
    const shift = narrow ? amount * 0.25 : 0;
    if (shift > 0.001) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cam.setViewOffset(w, h, 0, h * shift, w, h);
    } else if (cam.view?.enabled) {
      cam.clearViewOffset();
    }
  }

  /** Leave the close-up and glide back into the visitor's head. */
  unfocus() {
    if (!this.focus) return;
    // Stand the visitor where the camera was (on the floor, out of walls), looking the same way.
    const f = this.focus;
    const dir = new THREE.Vector3().subVectors(f.target, f.pos).normalize();
    const back = f.pos.clone().addScaledVector(dir, -0.6);
    const [x, z] = this.collision.resolve(back.x, back.z, RADIUS);
    this.returnFrom = { pos: this.camera.position.clone(), q: this.camera.quaternion.clone(), t: 0 };
    this.position.set(x, 0, z);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.max(-0.6, Math.min(0.3, Math.asin(dir.y) * 0.5));
    this.focus = null;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.inputEnabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    // Let the interaction system decide first (it runs on the same event, registered earlier).
    queueMicrotask(() => {
      if (this.interaction.capturing) return;
      this.lookDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
  };

  private onMove = (e: PointerEvent) => {
    const d = this.lookDrag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    const s = e.pointerType === 'touch' ? 0.0055 : 0.0042;
    if (this.focus) {
      this.focus.yawOff = clamp(this.focus.yawOff + dx * s, -0.7, 0.7);
      this.focus.pitchOff = clamp(this.focus.pitchOff + dy * s, -0.5, 0.5);
    } else {
      this.yaw += dx * s;
      this.pitch = clamp(this.pitch + dy * s, -1.25, 1.2);
    }
    if (Math.abs(dx) + Math.abs(dy) > 2) this.walkTarget = null;
  };

  private onUp = (e: PointerEvent) => {
    if (this.lookDrag?.id === e.pointerId) this.lookDrag = null;
  };

  update(dt: number) {
    const cam = this.camera;
    if (this.focus) {
      this.updateFocus(dt);
      this.speed = 0;
      return;
    }

    // --- movement intent
    let fwd = 0;
    let side = 0;
    if (this.inputEnabled) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyA')) side -= 1;
      if (k.has('KeyD')) side += 1;
      if (k.has('ArrowLeft')) this.yaw += 1.9 * dt;
      if (k.has('ArrowRight')) this.yaw -= 1.9 * dt;
      if (this.joy.active) {
        fwd += -this.joy.y;
        side += this.joy.x;
      }
    }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const want = new THREE.Vector3();
    if (fwd || side) {
      this.walkTarget = null;
      want.set(-sinY * fwd + cosY * side, 0, -cosY * fwd - sinY * side);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(run ? RUN : WALK);
    } else if (this.walkTarget) {
      const to = new THREE.Vector3().subVectors(this.walkTarget, this.position).setY(0);
      const dist = to.length();
      if (dist < 0.25) {
        this.walkTarget = null;
      } else {
        want.copy(to).normalize().multiplyScalar(Math.min(WALK, dist * 3));
        // Turn gently towards the walking direction.
        const targetYaw = Math.atan2(-to.x, -to.z);
        this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * 3);
      }
    }
    // Smooth acceleration
    this.velocity.lerp(want, Math.min(1, dt * 10));
    const prevX = this.position.x;
    const prevZ = this.position.z;
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    const [rx, rz] = this.collision.resolve(nx, nz, RADIUS);
    this.position.x = rx;
    this.position.z = rz;
    const moved = Math.hypot(rx - prevX, rz - prevZ);
    this.speed = moved / Math.max(dt, 1e-4);
    if (this.walkTarget && this.speed < 0.05 && want.lengthSq() > 0.1) this.walkTarget = null; // blocked

    // --- camera
    this.bob += moved * 2.2;
    const bobY = Math.sin(this.bob * 2) * 0.025 * Math.min(1, this.speed / WALK);
    const eyePos = new THREE.Vector3(this.position.x, EYE + bobY, this.position.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch, this.yaw, 0, 'YXZ'));
    if (this.returnFrom) {
      const r = this.returnFrom;
      r.t = Math.min(1, r.t + dt / 0.7);
      const k = ease(r.t);
      this.applyViewShift(1 - k);
      cam.position.lerpVectors(r.pos, eyePos, k);
      cam.quaternion.slerpQuaternions(r.q, q, k);
      if (r.t >= 1) this.returnFrom = null;
    } else {
      cam.position.copy(eyePos);
      cam.quaternion.copy(q);
    }
  }

  private updateFocus(dt: number) {
    const f = this.focus!;
    f.t = Math.min(1, f.t + dt / 0.9);
    const k = ease(f.t);
    const look = new THREE.Matrix4().lookAt(f.pos, f.target, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(look);
    const off = new THREE.Quaternion().setFromEuler(new THREE.Euler(-f.pitchOff, f.yawOff, 0, 'YXZ'));
    q.multiply(off);
    this.camera.position.lerpVectors(f.from, f.pos, k);
    this.camera.quaternion.slerpQuaternions(f.fromQ, q, k);
    this.applyViewShift(k);
  }

  /** Forward direction on the floor plane. */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/** Intersection parameter t∈[0,1] along p→q with segment a→b, or null. */
function segHit(px: number, pz: number, qx: number, qz: number, ax: number, az: number, bx: number, bz: number): number | null {
  const rx = qx - px, rz = qz - pz, sx = bx - ax, sz = bz - az;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((ax - px) * sz - (az - pz) * sx) / den;
  const u = ((ax - px) * rz - (az - pz) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export function wrapAngle(a: number) {
  if (!Number.isFinite(a)) return 0;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
