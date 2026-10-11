/** Shared helpers for the Light & Optics room: materials, glowing beams, spectral colours, formatting. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getLang, onLangChange, t } from '../../core/i18n';
import { drawText } from '../../core/textures';
import type { L10n } from '../../core/types';

export const DEG = Math.PI / 180;

/** Locale-aware number: decimal comma in Swedish. */
export function fmt(v: number, digits = 1): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ------------------------------------------------------------------ materials (shared)

export const mats = {
  wood: new THREE.MeshStandardMaterial({ color: 0x7a4a2b, roughness: 0.55 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.3, metalness: 0.9 }),
  blackMetal: new THREE.MeshStandardMaterial({ color: 0x1e1b22, roughness: 0.45, metalness: 0.6 }),
  felt: new THREE.MeshStandardMaterial({ color: 0x1b1622, roughness: 1 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xdff4ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05,
  }),
};

// ------------------------------------------------------------------ geometry helpers

export function rbox(w: number, h: number, d: number, r = 0.03) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
}

/** Merge several geometries (each with its own transform) into one mesh: one draw call. */
export function merged(parts: { geo: THREE.BufferGeometry; pos?: THREE.Vector3Tuple; rot?: THREE.Vector3Tuple }[], mat: THREE.Material) {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    // keep only shared attributes so merging works
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    return g;
  });
  return new THREE.Mesh(mergeGeometries(geos, false)!, mat);
}

/** A wooden exhibit table (top + 4 legs in one mesh) with a dark felt top. */
export function table(w: number, d: number, h = 0.85) {
  const grp = new THREE.Group();
  const legs = merged(
    [
      { geo: rbox(w, 0.06, d, 0.025), pos: [0, h - 0.03, 0] },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({
        geo: new THREE.CylinderGeometry(0.035, 0.03, h - 0.06, 10),
        pos: [sx * (w / 2 - 0.1), (h - 0.06) / 2, sz * (d / 2 - 0.1)] as THREE.Vector3Tuple,
      })),
      { geo: new THREE.BoxGeometry(w - 0.2, 0.05, 0.03), pos: [0, 0.18, d / 2 - 0.1] },
      { geo: new THREE.BoxGeometry(w - 0.2, 0.05, 0.03), pos: [0, 0.18, -d / 2 + 0.1] },
    ],
    mats.wood,
  );
  grp.add(legs);
  const felt = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.004, d - 0.08), mats.felt);
  felt.position.y = h + 0.002;
  grp.add(felt);
  return grp;
}

/** A small brass-framed plaque with the station title, redrawn on language change. */
export function plaque(text: L10n, w = 0.9, h = 0.16) {
  const px = 512;
  const ph = Math.round((px * h) / w);
  const c = document.createElement('canvas');
  c.width = px;
  c.height = ph;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    drawText(g, px, ph, t(text), { bg: '#2a1d16', color: '#ffe3b0', font: `700 ${Math.round(ph * 0.5)}px "Baloo 2", system-ui, sans-serif` });
    tex.needsUpdate = true;
  };
  draw();
  onLangChange(draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

// ------------------------------------------------------------------ glowing beams

let beamTex: THREE.Texture | null = null;
function softBeamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 4);
  for (let x = 0; x < 64; x++) {
    const u = (x + 0.5) / 64 * 2 - 1;
    const a = Math.exp(-u * u * 5) * 0.8 + Math.exp(-u * u * 40) * 0.6;
    for (let y = 0; y < 4; y++) {
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Many glowing light-ray segments in a single additive draw call.
 * Each segment is two crossed soft quads, so it reads as a beam from any angle.
 * Usage: begin(); seg(...); seg(...); end();
 */
export class BeamBatch {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0;
  private geo: THREE.BufferGeometry;

  constructor(readonly capacity: number) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 8 * 3);
    this.col = new Float32Array(capacity * 8 * 3);
    const uv = new Float32Array(capacity * 8 * 2);
    const idx = new Uint32Array(capacity * 12);
    for (let s = 0; s < capacity; s++) {
      for (let q = 0; q < 2; q++) {
        const b = s * 8 + q * 4;
        uv.set([0, 0, 1, 0, 1, 1, 0, 1], b * 2);
        idx.set([b, b + 1, b + 2, b, b + 2, b + 3], s * 12 + q * 6);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        map: softBeamTexture(), vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  begin() {
    this.n = 0;
  }

  /** Segment a→b (in the batch mesh's local frame), width in metres, linear RGB (may exceed 1 for bloom). */
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, r: number, g: number, b: number) {
    if (this.n >= this.capacity) return;
    _d.set(bx - ax, by - ay, bz - az);
    const len = _d.length();
    if (len < 1e-6) return;
    _d.divideScalar(len);
    _u.crossVectors(_d, _up);
    if (_u.lengthSq() < 1e-6) _u.set(1, 0, 0);
    _u.normalize();
    _v.crossVectors(_d, _u).normalize();
    const hw = width / 2;
    const s = this.n++;
    for (let q = 0; q < 2; q++) {
      const ox = (q ? _v.x : _u.x) * hw;
      const oy = (q ? _v.y : _u.y) * hw;
      const oz = (q ? _v.z : _u.z) * hw;
      const o = (s * 8 + q * 4) * 3;
      const P = this.pos;
      P[o] = ax - ox; P[o + 1] = ay - oy; P[o + 2] = az - oz;
      P[o + 3] = ax + ox; P[o + 4] = ay + oy; P[o + 5] = az + oz;
      P[o + 6] = bx + ox; P[o + 7] = by + oy; P[o + 8] = bz + oz;
      P[o + 9] = bx - ox; P[o + 10] = by - oy; P[o + 11] = bz - oz;
      for (let k = 0; k < 4; k++) {
        this.col[o + k * 3] = r;
        this.col[o + k * 3 + 1] = g;
        this.col[o + k * 3 + 2] = b;
      }
    }
  }

  end() {
    this.geo.setDrawRange(0, this.n * 12);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ colour of light

function lobe(x: number, mu: number, s1: number, s2: number) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 colour-matching functions (Wyman, Sloan & Shirley 2013 multi-lobe fit). λ in nm. */
export function cieXYZ(nm: number, out: [number, number, number]) {
  out[0] = 1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2);
  out[1] = 0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
  out[2] = 1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
  return out;
}

/** XYZ → linear sRGB (D65), in place. */
export function xyzToLinearRGB(c: [number, number, number]) {
  const [X, Y, Z] = c;
  c[0] = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  c[1] = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  c[2] = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return c;
}

/** A vivid display colour for one wavelength (linear RGB, max channel = 1). */
export function spectralRGB(nm: number): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  xyzToLinearRGB(cieXYZ(nm, c));
  const m = Math.min(c[0], c[1], c[2]);
  if (m < 0) for (let i = 0; i < 3; i++) c[i] -= m; // desaturate out-of-gamut spectral colours towards white
  const mx = Math.max(c[0], c[1], c[2], 1e-6);
  return [c[0] / mx, c[1] / mx, c[2] / mx];
}

export function linToSrgb8(v: number) {
  v = Math.max(0, Math.min(1, v));
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

// ------------------------------------------------------------------ misc

/** Buddy rate limiter: returns true at most once per `gap` seconds. */
export function cooldown(gap = 9) {
  let last = -1e9;
  return () => {
    const now = performance.now() / 1000;
    if (now - last < gap) return false;
    last = now;
    return true;
  };
}

/** Soft additive glow sprite texture. */
let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color: number, size: number, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  );
  s.scale.setScalar(size);
  return s;
}
