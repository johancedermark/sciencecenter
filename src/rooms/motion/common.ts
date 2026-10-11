/** Shared materials and helpers for the Forces & Motion room. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Expression, Gesture, L10n, RoomContext, StationDef } from '../../core/types';
import { getLang, onLangChange } from '../../core/i18n';

export const ACCENT = 0x7cff6b;

export const mat = {
  wood: new THREE.MeshStandardMaterial({ color: 0xb98552, roughness: 0.55 }),
  paleWood: new THREE.MeshStandardMaterial({ color: 0xdcb582, roughness: 0.5 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x5a3721, roughness: 0.55 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.28, metalness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.12, metalness: 1.0 }),
  string: new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.8 }),
  felt: new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 1 }),
  glow: new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f8a3c, roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xb0583a, roughness: 0.7 }),
};

/** Locale-aware number with a fixed number of decimals (decimal comma in Swedish). */
export function fmt(v: number, d = 2): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Buddy lines with a per-station cooldown so Buddy doesn't spam. */
export function buddyGate(ctx: RoomContext, cooldown = 8) {
  let last = -1e9;
  const ok = () => {
    const now = performance.now() / 1000;
    if (now - last < cooldown) return false;
    last = now;
    return true;
  };
  return {
    say(text: L10n, opts?: { expression?: Expression; gesture?: Gesture }) {
      if (ok()) ctx.buddy.say(text, opts);
    },
    celebrate(text: L10n) {
      if (ok()) ctx.buddy.celebrate(text);
    },
  };
}

/** Collects static geometry per material and merges it into one mesh per material (few draw calls). */
export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();

  add(geo: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale?: [number, number, number]) {
    this.p.set(...pos);
    this.q.setFromEuler(this.e.set(...rot));
    this.sc.set(...(scale ?? [1, 1, 1]));
    this.m.compose(this.p, this.q, this.sc);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(this.m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) {
      g = g.clone();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    let list = this.parts.get(material);
    if (!list) this.parts.set(material, (list = []));
    list.push(g);
  }

  /** Add a box from a to b with a given thickness (a strut). */
  strut(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, geo?: THREE.BufferGeometry) {
    const len = a.distanceTo(b);
    const g = geo ?? new THREE.CylinderGeometry(radius, radius, 1, 10);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    this.add(g, material, [mid.x, mid.y, mid.z], [e.x, e.y, e.z], [1, len, 1]);
  }

  build(parent: THREE.Object3D) {
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      parent.add(new THREE.Mesh(merged, material));
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
  }
}

/** A canvas-textured plane you can redraw (signs, scoreboards). Redraws itself on language change. */
export class Board {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;

  constructor(
    readonly w: number,
    readonly h: number,
    private draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
    opts: { px?: number; lit?: boolean; transparent?: boolean } = {},
  ) {
    const px = opts.px ?? 512;
    this.canvas = document.createElement('canvas');
    const aspect = w / h;
    this.canvas.width = aspect >= 1 ? px : Math.round(px * aspect);
    this.canvas.height = aspect >= 1 ? Math.round(px / aspect) : px;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const material = opts.lit
      ? new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85, transparent: opts.transparent })
      : new THREE.MeshBasicMaterial({ map: this.tex, color: 0xdddddd, transparent: opts.transparent ?? true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    this.redraw();
    onLangChange(() => this.redraw());
  }

  redraw() {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.draw(this.g, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }
}

export const FONT = '"Baloo 2", "Nunito", system-ui, sans-serif';

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Wrap text to a width; returns lines. */
export function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * A station's local frame: a group placed at (x, z) in the room with yaw `rotY`.
 * Local +z faces the visitor. `v()` converts local points to room coordinates (for viewpoints).
 */
export function stationFrame(ctx: RoomContext, x: number, z: number, rotY: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  ctx.group.add(group);
  group.updateMatrix();
  const v = (lx: number, ly: number, lz: number): [number, number, number] => {
    const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(group.matrix);
    return [p.x, p.y, p.z];
  };
  const world = ctx.toWorld(new THREE.Vector3(x, 1, z));
  /** Collider for a local footprint (w along local x, d along local z), axis-aligned in the room. */
  const collider = (w: number, d: number, cx = 0, cz = 0) => {
    const c = v(cx, 0, cz);
    const swap = Math.abs(Math.sin(rotY)) > 0.5;
    ctx.addCollider(c[0], c[2], swap ? d : w, swap ? w : d);
  };
  return { group, v, world, collider };
}

/** Per-station state that the room loop needs: focus and proximity. */
export class StationState {
  focused = false;
  constructor(private ctx: RoomContext, private world: THREE.Vector3) {}
  /** Within ~8 m of the camera, or focused. */
  near() {
    return this.focused || this.ctx.camera.position.distanceToSquared(this.world) < 64;
  }
  hook(def: StationDef): StationDef {
    const onFocus = def.onFocus;
    const onBlur = def.onBlur;
    return {
      ...def,
      onFocus: () => {
        this.focused = true;
        onFocus?.();
      },
      onBlur: () => {
        this.focused = false;
        onBlur?.();
      },
    };
  }
}

/** Short metallic click for colliding steel balls; loudness from impact speed (m/s). */
export function steelClick(sfx: RoomContext['sfx'], speed: number, pan = 0) {
  const g = Math.min(0.22, 0.03 + speed * 0.12);
  sfx.tone(3400 + Math.random() * 300, 0.035, { type: 'triangle', gain: g, release: 0.03, pan });
  sfx.tone(6100, 0.02, { type: 'sine', gain: g * 0.5, release: 0.02, pan });
  sfx.noise(0.03, { freq: 5200, q: 2, gain: g * 0.6, type: 'bandpass' });
}

export interface StationModule {
  update(dt: number, time: number): void;
}
