/** Shared materials, geometry and helpers for the chemistry lab. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawText, woodFloor, type TextOpts } from '../../core/textures';
import { getLang, onLangChange, t } from '../../core/i18n';
import type { BuddyApi, Expression, Gesture, L10n, RoomContext } from '../../core/types';

export type Kit = ReturnType<typeof createKit>;

/** A station's per-frame hook. `near` is true when the visitor is within ~8 m or the station is focused. */
export interface StationRuntime {
  update(dt: number, time: number, near: boolean): void;
  /** Room-local exhibit centre (x, z), used for the proximity check. */
  center: [number, number];
}

export function fmt(v: number, digits = 1): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Like fmt, but trims trailing zeros (atomic masses keep their own precision). */
export function fmtUpTo(v: number, digits = 3): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: digits });
}

export function createKit(ctx: RoomContext) {
  const benchTop = woodFloor([1, 0.4]);
  const mats = {
    benchTop: new THREE.MeshStandardMaterial({ map: benchTop, color: 0xd7b48c, roughness: 0.5 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x5b3a25, roughness: 0.65 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0x7a5136, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.32, metalness: 0.85 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xa9b1ba, roughness: 0.35, metalness: 0.75 }),
    blackTop: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2b3a33, roughness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xe6fbff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.2,
      clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
    }),
    glassRim: new THREE.MeshStandardMaterial({ color: 0xcff6ff, roughness: 0.1, transparent: true, opacity: 0.45 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.8 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xb8643a, roughness: 0.8 }),
    accentGlow: new THREE.MeshBasicMaterial({ color: ctx.accent, toneMapped: false }),
  };

  const geos = {
    unitBox: new RoundedBoxGeometry(1, 1, 1, 3, 0.04),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    lowSphere: new THREE.IcosahedronGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
    openCyl: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
  };

  /** Meshes that never move; merged per material by `mergeStatics()` to save draw calls. */
  const statics: THREE.Mesh[] = [];
  const staticize = (...m: THREE.Mesh[]) => { statics.push(...m); };

  /** A rounded box sized w×h×d with its base at y (static unless `dynamic`). */
  function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = ctx.group) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.04, w / 4, h / 4, d / 4)), mat);
    m.position.set(x, y + h / 2, z);
    parent.add(m);
    statics.push(m);
    return m;
  }

  /** A lab bench: wooden top on a dark cabinet. Returns the top height. */
  function bench(x: number, z: number, w: number, d: number, rotY = 0, h = 0.9) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    box(w - 0.08, h - 0.06, d - 0.1, mats.cabinet, 0, 0, -0.02, g);
    box(w, 0.06, d, mats.benchTop, 0, h - 0.06, 0, g);
    // brass handles on the cabinet doors
    const n = Math.max(1, Math.round(w / 0.8));
    const handleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8);
    for (let i = 0; i < n; i++) {
      const hm = new THREE.Mesh(handleGeo, mats.brass);
      hm.position.set(-w / 2 + (i + 0.5) * (w / n), h - 0.25, d / 2 - 0.06);
      hm.rotation.z = Math.PI / 2;
      g.add(hm);
      statics.push(hm);
    }
    ctx.group.add(g);
    return { group: g, top: h };
  }

  /** A text plane drawn from a canvas; redrawn on language change. */
  function label(
    text: () => string,
    w: number,
    h: number,
    o: TextOpts & { px?: number } = {},
  ) {
    const px = o.px ?? 512;
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round((px * h) / w);
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xcccccc });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const redraw = () => {
      drawText(g, c.width, c.height, text(), {
        font: `700 ${Math.round(c.height * 0.5)}px "Baloo 2", "Nunito", system-ui, sans-serif`,
        color: '#3b2a1c',
        bg: '#f4ead8',
        ...o,
      });
      tex.needsUpdate = true;
    };
    redraw();
    onLangChange(redraw);
    return { mesh, redraw };
  }

  /** A canvas-texture surface that the caller draws on (screens, posters, boards). */
  function canvasPlane(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, basic = true) {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round((px * h) / w);
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = basic
      ? new THREE.MeshBasicMaterial({ map: tex, color: 0xd0d0d0 }) // keep pale canvases under the bloom threshold
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const redraw = () => {
      draw(g, c.width, c.height);
      tex.needsUpdate = true;
    };
    redraw();
    return { mesh, redraw, canvas: c, g, tex };
  }

  /** Bakes all static meshes into one mesh per material (room-local). Call once after building. */
  function mergeStatics() {
    ctx.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(ctx.group.matrixWorld).invert();
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    for (const m of statics) {
      if (!m.parent || Array.isArray(m.material)) continue;
      const list = byMat.get(m.material) ?? [];
      list.push(m);
      byMat.set(m.material, list);
    }
    const rel = new THREE.Matrix4();
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        rel.multiplyMatrices(inv, m.matrixWorld);
        let g = m.geometry.clone().applyMatrix4(rel);
        if (g.index) g = g.toNonIndexed();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        g.morphAttributes = {};
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      for (const m of list) m.removeFromParent();
      ctx.group.add(new THREE.Mesh(merged, mat));
    }
    statics.length = 0;
  }

  // Buddy with a shared cooldown so he doesn't spam.
  let lastBuddy = -1e9;
  const COOLDOWN = 8000;
  const gate = (force = false) => {
    const now = performance.now();
    if (!force && now - lastBuddy < COOLDOWN) return false;
    lastBuddy = now;
    return true;
  };
  const buddy = {
    celebrate(text: L10n, force = false) {
      if (gate(force)) ctx.buddy.celebrate(text);
    },
    say(text: L10n, opts?: { expression?: Expression; gesture?: Gesture }, force = false) {
      if (gate(force)) ctx.buddy.say(text, opts);
    },
    raw: ctx.buddy as BuddyApi,
  };

  // Shared particle pools (one draw call each): bubbles in liquids and steam puffs.
  const fx = {
    bubbles: new PuffPool(420, 0.022, bubbleDot(), true),
    bigBubbles: new PuffPool(160, 0.045, bubbleDot(), true),
    steam: new PuffPool(220, 0.32, softDot(), true, 0.5),
  };
  ctx.group.add(fx.bubbles.points, fx.bigBubbles.points, fx.steam.points);

  return { ctx, mats, geos, box, bench, label, canvasPlane, buddy, fx, t, staticize, mergeStatics };
}

/** Linear colour interpolation through sorted stops. Writes into `out`. */
export function lerpStops(stops: [number, THREE.Color][], x: number, out: THREE.Color) {
  if (x <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      return out.copy(c0).lerp(c1, (x - x0) / (x1 - x0));
    }
  }
  return out.copy(stops[stops.length - 1][1]);
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Soft round sprite texture for bubbles, steam and glows. */
let _soft: THREE.Texture | null = null;
export function softDot() {
  if (_soft) return _soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _soft = new THREE.CanvasTexture(c);
  return _soft;
}

/** Ring-shaped bubble sprite (a thin bright rim). */
let _bubble: THREE.Texture | null = null;
export function bubbleDot() {
  if (_bubble) return _bubble;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 18, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 31, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(24, 23, 4, 0, Math.PI * 2);
  g.fill();
  _bubble = new THREE.CanvasTexture(c);
  return _bubble;
}

/**
 * A pool of point sprites (bubbles or steam puffs) in one draw call.
 * Emitters call `spawn`; particles rise, wobble and fade.
 */
export class PuffPool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private top: Float32Array;
  private base = new Float32Array(0);
  private next = 0;
  private dirty = false;

  constructor(readonly count: number, size: number, tex: THREE.Texture, additive: boolean, private drag = 0) {
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.top = new Float32Array(count).fill(1e9);
    this.base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
    const mat = new THREE.PointsMaterial({
      size, map: tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** Spawn at (x,y,z) with velocity; it dies after `life` s or above `top` (e.g. a liquid surface). */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: THREE.Color, top = 1e9) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = color.r; this.base[i * 3 + 1] = color.g; this.base[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.top[i] = top;
  }

  update(dt: number, time: number) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const k = i * 3;
      const wob = Math.sin(time * 7 + i) * 0.02;
      this.pos[k] += (this.vel[k] + wob) * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += (this.vel[k + 2] + wob) * dt;
      if (this.drag) {
        this.vel[k] *= 1 - this.drag * dt;
        this.vel[k + 2] *= 1 - this.drag * dt;
      }
      if (this.pos[k + 1] > this.top[i]) this.life[i] = 0;
      const f = this.life[i] <= 0 ? 0 : Math.min(1, this.life[i] / (this.maxLife[i] * 0.5), (this.maxLife[i] - this.life[i]) * 8);
      this.col[k] = this.base[k] * f;
      this.col[k + 1] = this.base[k + 1] * f;
      this.col[k + 2] = this.base[k + 2] * f;
      if (this.life[i] <= 0) this.pos[k + 1] = -100;
    }
    if (any || this.dirty) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
      this.dirty = any;
    }
  }
}
