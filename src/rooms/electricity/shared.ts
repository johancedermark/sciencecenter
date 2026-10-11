/**
 * Shared building blocks for the Electricity & Energy room:
 * materials, number formatting, a static-mesh baker (fewer draw calls), canvas labels,
 * cables with glowing current-flow particles, analog meters, LCD displays and Buddy cooldowns.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getLang, onLangChange, t } from '../../core/i18n';
import { radialSpot, woodFloor } from '../../core/textures';
import type { Expression, L10n, RoomContext, Viewpoint } from '../../core/types';

// ------------------------------------------------------------------ numbers

/** Locale number: decimal comma in Swedish. */
export function fmt(v: number, digits = 2): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Scientific-ish number, e.g. 4,2·10²⁰. */
export function sci(v: number, digits = 1): string {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  const sup = String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] ?? (c === '-' ? '⁻' : c)).join('');
  return `${fmt(m, digits)}·10${sup}`;
}

/** Choose a unit prefix for an SI value: 0.0042 A -> "4,2 mA". */
export function si(v: number, unit: string, digits = 2): string {
  const a = Math.abs(v);
  if (a === 0) return `${fmt(0, digits)} ${unit}`;
  if (a < 1e-3) return `${fmt(v * 1e6, digits)} µ${unit}`;
  if (a < 1) return `${fmt(v * 1e3, digits)} m${unit}`;
  return `${fmt(v, digits)} ${unit}`;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Frame-rate independent smoothing factor for a time constant tau (s). */
export const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / Math.max(1e-4, tau));

// ------------------------------------------------------------------ materials

export interface Mats {
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  aluminium: THREE.MeshStandardMaterial;
  zinc: THREE.MeshStandardMaterial;
  magnesium: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  blackMetal: THREE.MeshStandardMaterial;
  rubberRed: THREE.MeshStandardMaterial;
  rubberBlack: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  magnetRed: THREE.MeshStandardMaterial;
  magnetBlue: THREE.MeshStandardMaterial;
  electron: THREE.MeshBasicMaterial;
}

let shared: Mats | null = null;

export function mats(): Mats {
  if (shared) return shared;
  const woodTex = woodFloor([1, 1]);
  shared = {
    wood: new THREE.MeshStandardMaterial({ map: woodTex, color: 0xd9b48a, roughness: 0.5 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 0.55 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.3, metalness: 0.9 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd9824f, roughness: 0.32, metalness: 0.9 }),
    aluminium: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.38, metalness: 0.85 }),
    zinc: new THREE.MeshStandardMaterial({ color: 0x8e9aa6, roughness: 0.55, metalness: 0.7 }),
    magnesium: new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.45, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.8 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x24222a, roughness: 0.45, metalness: 0.5 }),
    rubberRed: new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.6 }),
    rubberBlack: new THREE.MeshStandardMaterial({ color: 0x1e1c22, roughness: 0.65 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xddeeff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false,
    }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.7 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.95 }),
    magnetRed: new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.45, metalness: 0.2 }),
    magnetBlue: new THREE.MeshStandardMaterial({ color: 0x2f5fd0, roughness: 0.45, metalness: 0.2 }),
    electron: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ff3ff).multiplyScalar(1.6), toneMapped: false }),
  };
  return shared;
}

let spotTex: THREE.Texture | null = null;
/** Soft additive glow texture (bulb halos, light pools). */
export function glowTexture() {
  return (spotTex ??= radialSpot('rgba(255,255,255,1)', 'rgba(255,255,255,0)'));
}

/** An additive halo sprite (a plane that always faces the camera). */
export function halo(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  );
  s.scale.setScalar(size);
  return s;
}

// ------------------------------------------------------------------ geometry helpers

export function rbox(w: number, h: number, d: number, r = 0.02, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

/** Add a mesh to a parent at a position; flagged static so it can be baked. */
export function put(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  isStatic = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (isStatic) m.userData.static = true;
  parent.add(m);
  return m;
}

/**
 * Merge every mesh flagged `userData.static` under `root` into one mesh per material.
 * Interactive and animated meshes stay untouched. Cuts draw calls drastically.
 */
export function bakeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.static || Array.isArray(m.material)) return;
    // A static mesh inside a dynamic parent must not be baked.
    let p: THREE.Object3D | null = m.parent;
    while (p && p !== root) {
      if (p.userData.dynamic) return;
      p = p.parent;
    }
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.morphAttributes = {};
    g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const list = buckets.get(m.material) ?? [];
    list.push(g);
    buckets.set(m.material, list);
    victims.push(m);
  });
  for (const v of victims) v.parent?.remove(v);
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    geos.forEach((g) => g.dispose());
  }
}

// ------------------------------------------------------------------ station frame

/**
 * A station placed at room-local (x, z) and rotated by yaw (its local +z faces the visitor).
 * Build the exhibit in local coordinates; convert viewpoints with `view`.
 */
export class StationFrame {
  readonly group = new THREE.Group();
  readonly world = new THREE.Vector3();
  private cos: number;
  private sin: number;
  constructor(readonly ctx: RoomContext, readonly x: number, readonly z: number, readonly yaw: number) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    ctx.group.add(this.group);
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.world.copy(ctx.toWorld(new THREE.Vector3(x, 1, z)));
  }
  /** Local (x, z) -> room (x, z). */
  toRoom(lx: number, lz: number): [number, number] {
    return [this.x + lx * this.cos + lz * this.sin, this.z - lx * this.sin + lz * this.cos];
  }
  view(cam: THREE.Vector3Tuple, target: THREE.Vector3Tuple): Viewpoint {
    const [cx, cz] = this.toRoom(cam[0], cam[2]);
    const [tx, tz] = this.toRoom(target[0], target[2]);
    return { position: [cx, cam[1], cz], target: [tx, target[1], tz] };
  }
  /** Axis-aligned room collider around a local rectangle (w x d centred at local cx, cz). */
  collider(w: number, d: number, cx = 0, cz = 0) {
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => this.toRoom(cx + a, cz + b));
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    this.ctx.addCollider((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  }
  /** Is the camera within r metres (simulation LOD)? */
  near(r = 8) {
    return this.ctx.camera.position.distanceToSquared(this.world) < r * r;
  }
}

/** A sturdy workbench: oak top with brass edge, dark legs, a lower shelf. Top surface at y = h. */
export function workbench(parent: THREE.Object3D, w: number, d: number, h = 0.9) {
  const m = mats();
  put(parent, rbox(w, 0.07, d, 0.025), m.wood, 0, h - 0.035, 0);
  put(parent, rbox(w + 0.02, 0.025, 0.03, 0.01), m.brass, 0, h - 0.06, d / 2);
  const leg = rbox(0.08, h - 0.07, 0.08, 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(parent, leg, m.darkWood, sx * (w / 2 - 0.08), (h - 0.07) / 2, sz * (d / 2 - 0.08));
  put(parent, rbox(w - 0.12, 0.04, d - 0.12, 0.015), m.darkWood, 0, 0.22, 0);
  put(parent, rbox(w - 0.2, 0.02, d - 0.2, 0.01), m.felt, 0, 0.25, 0);
}

// ------------------------------------------------------------------ canvas planes

export interface CanvasPlane {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  redraw(): void;
}

/** A plane with a canvas texture, redrawn on language change. */
export function canvasPlane(
  w: number, h: number, px: number, py: number,
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
  o: { transparent?: boolean; glow?: boolean; side?: THREE.Side } = {},
): CanvasPlane {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = py;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const common = { map: tex, transparent: !!o.transparent, side: o.side ?? THREE.FrontSide };
  const mat = o.glow
    ? new THREE.MeshBasicMaterial({ ...common, toneMapped: false })
    : new THREE.MeshStandardMaterial({ ...common, roughness: 0.8 });
  if (o.transparent) mat.depthWrite = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const redraw = () => {
    g.clearRect(0, 0, px, py);
    draw(g, px, py);
    tex.needsUpdate = true;
  };
  redraw();
  onLangChange(redraw);
  return { mesh, canvas, g, tex, redraw };
}

export const FONT = '"Baloo 2", "Nunito", system-ui, sans-serif';

/** Word-wrap text in a canvas. Returns the y after the last line. */
export function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y);
        y += lh;
        line = word;
      } else line = test;
    }
    g.fillText(line, x, y);
    y += lh;
  }
  return y;
}

/** A small sign: dark wood plaque with cream text. */
export function sign(text: () => string, w: number, h: number, px = 512): CanvasPlane {
  const py = Math.round((px * h) / w);
  return canvasPlane(w, h, px, py, (g, W, H) => {
    g.fillStyle = '#3a2416';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c89b54';
    g.lineWidth = Math.max(3, H * 0.06);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
    g.fillStyle = '#f6e7c8';
    g.font = `700 ${Math.round(H * 0.42)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text(), W / 2, H / 2 + H * 0.03, W * 0.92);
  });
}

// ------------------------------------------------------------------ cables with flowing charge

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * A rubber cable along a smooth curve, with glowing "electron" beads that drift along it while current flows.
 * Beads move from the first point to the last when direction > 0.
 */
export class Wire {
  readonly tube: THREE.Mesh;
  readonly beads: THREE.InstancedMesh;
  private table: Float32Array;
  private n = 64;
  private phase = Math.random();
  private level = 0;
  private dir = 1;
  private length: number;

  constructor(parent: THREE.Object3D, points: THREE.Vector3Tuple[], mat: THREE.Material, o: { radius?: number; beads?: number; beadMat?: THREE.Material; dynamic?: boolean } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this.length = curve.getLength();
    this.tube = put(parent, new THREE.TubeGeometry(curve, Math.max(12, Math.round(this.length * 40)), o.radius ?? 0.008, 6), mat, 0, 0, 0, 0, 0, 0, !o.dynamic);
    this.table = new Float32Array((this.n + 1) * 3);
    for (let i = 0; i <= this.n; i++) {
      curve.getPointAt(i / this.n, _p);
      this.table.set([_p.x, _p.y, _p.z], i * 3);
    }
    const count = o.beads ?? Math.max(4, Math.round(this.length * 14));
    this.beads = new THREE.InstancedMesh(beadGeo(), o.beadMat ?? mats().electron, count);
    this.beads.frustumCulled = false;
    this.beads.visible = false;
    parent.add(this.beads);
  }

  /** level 0..1 (bead speed/size), direction ±1. */
  set(level: number, dir = 1) {
    this.level = level;
    this.dir = dir >= 0 ? 1 : -1;
  }

  /** Show or hide the whole cable (needs `dynamic: true`). */
  setVisible(v: boolean) {
    this.tube.visible = v;
    if (!v) this.beads.visible = false;
  }

  update(dt: number) {
    const on = this.level > 0.003 && this.tube.visible;
    this.beads.visible = on;
    if (!on) return;
    const speed = (0.04 + 0.55 * Math.min(1, this.level)) / this.length;
    this.phase = (this.phase + this.dir * speed * dt + 1) % 1;
    const count = this.beads.count;
    const sc = 0.55 + 0.45 * Math.min(1, this.level * 2);
    _s.setScalar(sc);
    for (let i = 0; i < count; i++) {
      const u = (this.phase + i / count) % 1;
      const f = u * this.n;
      const k = Math.min(this.n - 1, Math.floor(f));
      const a = f - k;
      const t0 = k * 3, t1 = t0 + 3;
      _p.set(
        this.table[t0] + (this.table[t1] - this.table[t0]) * a,
        this.table[t0 + 1] + (this.table[t1 + 1] - this.table[t0 + 1]) * a,
        this.table[t0 + 2] + (this.table[t1 + 2] - this.table[t0 + 2]) * a,
      );
      _m.compose(_p, _q, _s);
      this.beads.setMatrixAt(i, _m);
    }
    this.beads.instanceMatrix.needsUpdate = true;
  }
}

let _beadGeo: THREE.SphereGeometry | null = null;
function beadGeo() {
  return (_beadGeo ??= new THREE.SphereGeometry(0.013, 8, 6));
}

// ------------------------------------------------------------------ analog meter

export interface MeterOpts {
  min: number;
  max: number;
  /** Major tick values with labels. */
  ticks: number[];
  unit: string;
  title: () => string;
  /** Needle sweep half-angle, radians. */
  sweep?: number;
  /** Natural frequency (Hz) and damping of the needle. */
  freq?: number;
  damping?: number;
  /** Face width in metres. */
  size?: number;
  tickLabel?: (v: number) => string;
}

/**
 * A brass-cased analog meter with a damped needle (a real moving-coil movement is a
 * damped spring-mass system; the needle overshoots a little and settles).
 */
export class AnalogMeter {
  readonly group = new THREE.Group();
  readonly needle: THREE.Group;
  private angle = 0;
  private vel = 0;
  private target = 0;
  private sweep: number;
  readonly face: CanvasPlane;

  constructor(parent: THREE.Object3D, private o: MeterOpts) {
    const m = mats();
    const S = o.size ?? 0.36;
    this.sweep = o.sweep ?? 0.85;
    parent.add(this.group);
    // Case
    put(this.group, rbox(S * 1.12, S * 0.82, 0.08, 0.03), m.darkWood, 0, 0, -0.04);
    put(this.group, rbox(S * 1.02, S * 0.72, 0.02, 0.012), m.brass, 0, 0, 0.005);
    this.face = canvasPlane(S * 0.94, S * 0.64, 512, 348, (g, W, H) => this.drawFace(g, W, H));
    this.face.mesh.position.z = 0.017;
    this.group.add(this.face.mesh);
    // Needle pivots at the bottom centre of the face.
    this.needle = new THREE.Group();
    this.needle.position.set(0, -S * 0.25, 0.022);
    this.group.add(this.needle);
    const nl = S * 0.48;
    const nm = new THREE.Mesh(new THREE.BoxGeometry(0.004, nl, 0.002), new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.5 }));
    nm.position.y = nl / 2;
    this.needle.add(nm);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), m.blackMetal);
    hub.rotation.x = Math.PI / 2;
    this.needle.add(hub);
    // Glass cover
    put(this.group, new THREE.PlaneGeometry(S * 0.96, S * 0.66), m.glass, 0, 0, 0.03);
    this.angle = this.valueToAngle(0);
    this.needle.rotation.z = -this.angle;
  }

  private valueToAngle(v: number) {
    const { min, max } = this.o;
    const f = (clamp(v, min - (max - min) * 0.04, max + (max - min) * 0.04) - min) / (max - min);
    return (f * 2 - 1) * this.sweep;
  }

  private drawFace(g: CanvasRenderingContext2D, W: number, H: number) {
    const { min, max, ticks } = this.o;
    g.fillStyle = '#f4ead5';
    g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.89, R = H * 0.7;
    const ang = (v: number) => -Math.PI / 2 + ((v - min) / (max - min) * 2 - 1) * this.sweep;
    g.strokeStyle = '#2b2018';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2 - this.sweep, -Math.PI / 2 + this.sweep);
    g.stroke();
    // minor ticks
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const v = min + ((max - min) * i) / steps;
      const a = ang(v);
      const len = i % 5 === 0 ? 18 : 9;
      g.lineWidth = i % 5 === 0 ? 3 : 1.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
      g.stroke();
    }
    g.fillStyle = '#2b2018';
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const v of ticks) {
      const a = ang(v);
      g.fillText(this.o.tickLabel ? this.o.tickLabel(v) : String(v), cx + Math.cos(a) * (R - 44), cy + Math.sin(a) * (R - 44));
    }
    // Zero mark in red for centre-zero meters
    if (min < 0 && max > 0) {
      const a = ang(0);
      g.strokeStyle = '#c0201a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
      g.lineTo(cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
      g.stroke();
    }
    g.fillStyle = '#5a3e2a';
    g.font = `800 40px ${FONT}`;
    g.fillText(this.o.unit, cx, cy - R * 0.42);
    g.font = `600 24px ${FONT}`;
    g.fillText(this.o.title(), cx, H * 0.08, W * 0.9);
  }

  set(value: number) {
    this.target = this.valueToAngle(value);
  }

  update(dt: number) {
    const w = 2 * Math.PI * (this.o.freq ?? 1.6);
    const z = this.o.damping ?? 0.55;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    const stop = this.sweep * 1.08;
    for (let i = 0; i < n; i++) {
      const acc = w * w * (this.target - this.angle) - 2 * z * w * this.vel;
      this.vel += acc * h;
      this.angle += this.vel * h;
      if (this.angle > stop) { this.angle = stop; this.vel *= -0.3; }
      if (this.angle < -stop) { this.angle = -stop; this.vel *= -0.3; }
    }
    this.needle.rotation.z = -this.angle;
  }
}

// ------------------------------------------------------------------ LCD

/** A segment-style LCD display (multimeter / stopwatch). Redraws only when the text changes. */
export class Lcd {
  readonly plane: CanvasPlane;
  private text = '';
  private small = '';
  constructor(w: number, h: number, o: { glow?: boolean; bg?: string; fg?: string } = {}) {
    const px = 384;
    const py = Math.round((px * h) / w);
    this.plane = canvasPlane(w, h, px, py, (g, W, H) => {
      g.fillStyle = o.bg ?? '#a9bd8f';
      g.fillRect(0, 0, W, H);
      g.fillStyle = o.fg ?? '#18200f';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.font = `700 ${Math.round(H * 0.62)}px "Courier New", ui-monospace, monospace`;
      g.fillText(this.text, W - W * 0.05, H * (this.small ? 0.42 : 0.52));
      if (this.small) {
        g.font = `700 ${Math.round(H * 0.2)}px ${FONT}`;
        g.textAlign = 'left';
        g.fillText(this.small, W * 0.05, H * 0.84);
      }
    }, { glow: o.glow });
  }
  set(text: string, small = '') {
    if (text === this.text && small === this.small) return;
    this.text = text;
    this.small = small;
    this.plane.redraw();
  }
}

// ------------------------------------------------------------------ Buddy

/** Buddy reactions with a shared cooldown (≥ 8 s) so Buddy never spams. */
export class Cheers {
  private last = -1e9;
  private done = new Set<string>();
  constructor(private ctx: RoomContext, private cooldown = 9000) {}
  /** Say something once per key (unless repeat), respecting the cooldown. Returns true if said. */
  say(key: string, text: L10n, o: { celebrate?: boolean; repeat?: boolean; expression?: Expression } = {}) {
    const now = performance.now();
    if (now - this.last < this.cooldown) return false;
    if (!o.repeat && this.done.has(key)) return false;
    this.done.add(key);
    this.last = now;
    if (o.celebrate) this.ctx.buddy.celebrate(text);
    else this.ctx.buddy.say(text, { expression: o.expression ?? 'happy' });
    return true;
  }
}

/** Throttle helper for HUD updates (~10 Hz). */
export class Every {
  private acc = 0;
  constructor(private period = 0.1) {}
  tick(dt: number) {
    this.acc += dt;
    if (this.acc < this.period) return false;
    this.acc = 0;
    return true;
  }
}

/** Current language name of an L10n, for canvases. */
export const tr = (l: L10n) => t(l);
