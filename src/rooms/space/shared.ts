/** Shared data, materials and helpers for the Space room. */
import * as THREE from 'three';
import { getLang, onLangChange, t, L } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import { drawText, type TextOpts } from '../../core/textures';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export const locale = () => (getLang() === 'sv' ? 'sv-SE' : 'en-GB');

/** Locale-aware number with a fixed number of decimals (decimal comma in Swedish). */
export function fmt(v: number, decimals = 0): string {
  return v.toLocaleString(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Seconds → "8 min 19 s", "4 h 10 min", "1,28 s". */
export function fmtDuration(s: number): string {
  if (s < 10) return `${fmt(s, 2)} s`;
  if (s < 60) return `${fmt(s, 1)} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `${m} min ${Math.floor(s - m * 60)} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - h * 3600) / 60);
  return `${h} h ${m} min`;
}

/** Light speed, km/s (exact by definition). */
export const C_KM_S = 299_792.458;
export const AU_KM = 149_597_870.7;
export const G_EARTH = 9.81;

// ---------------------------------------------------------------------------
// Solar-system data (NASA Planetary Fact Sheet; mean values)
// ---------------------------------------------------------------------------

export type TexKind = 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

export interface Body {
  id: TexKind;
  name: L10n;
  /** Mean diameter, km. */
  diamKm: number;
  /** Semi-major axis, AU (Moon: distance from Earth in km is in `moonDistKm`). */
  aAU: number;
  /** Orbital period, Earth years. */
  periodYr: number;
  /** Mean longitude at J2000, degrees. */
  L0: number;
  /** Surface gravity, m/s² (gas giants: at the 1-bar level). */
  g: number;
  /** Length of a solar day. */
  day: L10n;
  moons: L10n;
  temp: L10n;
  /** Atmosphere glow colour for the rim light. */
  rim: number;
}

export const PLANETS: Body[] = [
  {
    id: 'mercury', name: L('Merkurius', 'Mercury'), diamKm: 4879, aAU: 0.387, periodYr: 0.2408, L0: 252.25, g: 3.70,
    day: L('176 jorddygn (från soluppgång till soluppgång)', '176 Earth days (sunrise to sunrise)'),
    moons: L('0', '0'), temp: L('−173 °C på natten, 427 °C på dagen', '−173 °C at night, 427 °C by day'), rim: 0x9a8f86,
  },
  {
    id: 'venus', name: L('Venus', 'Venus'), diamKm: 12104, aAU: 0.723, periodYr: 0.6152, L0: 181.98, g: 8.87,
    day: L('117 jorddygn (den snurrar baklänges!)', '117 Earth days (it spins backwards!)'),
    moons: L('0', '0'), temp: L('464 °C, varmast av alla planeter', '464 °C, the hottest planet'), rim: 0xffd890,
  },
  {
    id: 'earth', name: L('Jorden', 'Earth'), diamKm: 12756, aAU: 1.0, periodYr: 1.0, L0: 100.46, g: 9.81,
    day: L('24 timmar', '24 hours'), moons: L('1 (Månen)', '1 (the Moon)'), temp: L('15 °C i medel', '15 °C on average'),
    rim: 0x6fb6ff,
  },
  {
    id: 'mars', name: L('Mars', 'Mars'), diamKm: 6792, aAU: 1.524, periodYr: 1.8808, L0: 355.45, g: 3.71,
    day: L('24 timmar 40 minuter', '24 hours 40 minutes'), moons: L('2 (Phobos och Deimos)', '2 (Phobos and Deimos)'),
    temp: L('−65 °C i medel', '−65 °C on average'), rim: 0xff9a6a,
  },
  {
    id: 'jupiter', name: L('Jupiter', 'Jupiter'), diamKm: 142984, aAU: 5.203, periodYr: 11.862, L0: 34.40, g: 24.79,
    day: L('9 timmar 56 minuter, snabbast av alla', '9 hours 56 minutes, the fastest of all'),
    moons: L('95+ kända', '95+ known'), temp: L('−110 °C vid molntopparna', '−110 °C at the cloud tops'), rim: 0xffd2a0,
  },
  {
    id: 'saturn', name: L('Saturnus', 'Saturn'), diamKm: 120536, aAU: 9.537, periodYr: 29.457, L0: 49.94, g: 10.44,
    day: L('10 timmar 39 minuter', '10 hours 39 minutes'), moons: L('270+ kända', '270+ known'),
    temp: L('−140 °C vid molntopparna', '−140 °C at the cloud tops'), rim: 0xffe6a8,
  },
  {
    id: 'uranus', name: L('Uranus', 'Uranus'), diamKm: 51118, aAU: 19.19, periodYr: 84.011, L0: 313.23, g: 8.69,
    day: L('17 timmar 14 minuter (den ligger på sidan)', '17 hours 14 minutes (it lies on its side)'),
    moons: L('28+ kända', '28+ known'), temp: L('−195 °C', '−195 °C'), rim: 0x9ff3ff,
  },
  {
    id: 'neptune', name: L('Neptunus', 'Neptune'), diamKm: 49528, aAU: 30.07, periodYr: 164.79, L0: 304.88, g: 11.15,
    day: L('16 timmar 6 minuter', '16 hours 6 minutes'), moons: L('16', '16'),
    temp: L('−200 °C, med vindar på 2 000 km/h', '−200 °C, with 2,000 km/h winds'), rim: 0x6f8dff,
  },
];

export const MOON: Body = {
  id: 'moon', name: L('Månen', 'The Moon'), diamKm: 3475, aAU: 384_400 / AU_KM, periodYr: 27.321661 / 365.25, L0: 218.32,
  g: 1.62,
  day: L('29,5 jorddygn (samma sida vänd mot oss)', '29.5 Earth days (the same side always faces us)'),
  moons: L('–', '–'), temp: L('−173 °C på natten, 127 °C på dagen', '−173 °C at night, 127 °C by day'), rim: 0xd8d8e0,
};

export const SUN_DIAM_KM = 1_392_700;
export const MOON_DIST_KM = 384_400;
export const SYNODIC_MONTH_D = 29.530589;

// ---------------------------------------------------------------------------
// Procedural planet textures
// ---------------------------------------------------------------------------

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const texCache = new Map<string, THREE.Texture>();

function bands(g: CanvasRenderingContext2D, w: number, h: number, cols: string[], r: () => number, wobble = 3) {
  let y = 0;
  while (y < h) {
    const bh = 3 + r() * 12;
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * wobble * r());
    g.lineTo(w, y + bh);
    g.lineTo(0, y + bh);
    g.fill();
    y += bh * 0.8;
  }
}

function blobs(g: CanvasRenderingContext2D, w: number, h: number, n: number, col: string, r: () => number, size: number, yMin = 0, yMax = 1) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const cx = r() * w;
    const cy = (yMin + r() * (yMax - yMin)) * h;
    const k = 3 + Math.floor(r() * 5);
    for (let j = 0; j < k; j++) {
      g.beginPath();
      g.ellipse(cx + (r() - 0.5) * size * 2, cy + (r() - 0.5) * size, size * (0.4 + r()), size * (0.3 + r() * 0.6), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function craters(g: CanvasRenderingContext2D, w: number, h: number, n: number, r: () => number) {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = (0.1 + r() * 0.8) * h;
    const s = 1 + r() * r() * 7;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(x - s * 0.25, y - s * 0.25, s * 0.7, 0, Math.PI * 2);
    g.fill();
  }
}

/** Equirectangular 512×256 texture for a body. */
export function planetTexture(kind: TexKind | 'sun'): THREE.Texture {
  const hit = texCache.get(kind);
  if (hit) return hit;
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 977 + kind.charCodeAt(0) * 31);
  const fill = (col: string) => {
    g.fillStyle = col;
    g.fillRect(0, 0, w, h);
  };
  switch (kind) {
    case 'sun': {
      fill('#ffb648');
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = r() > 0.5 ? `rgba(255,240,170,${r() * 0.35})` : `rgba(220,90,10,${r() * 0.3})`;
        g.beginPath();
        g.arc(r() * w, r() * h, 1 + r() * 4, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'mercury':
      fill('#8d847c');
      blobs(g, w, h, 14, 'rgba(60,55,50,0.25)', r, 22);
      craters(g, w, h, 260, r);
      break;
    case 'moon':
      fill('#a9a7a4');
      // Maria: the dark "face" is on the near side (u ≈ 0.25 faces +X in Three's sphere mapping is handled by callers).
      blobs(g, w, h, 9, 'rgba(70,70,75,0.55)', r, 26, 0.25, 0.7);
      craters(g, w, h, 320, r);
      break;
    case 'venus':
      fill('#e7c98a');
      bands(g, w, h, ['#f0d9a4', '#dcb873', '#efe0b8', '#d9b067'], r, 8);
      g.filter = 'blur(4px)';
      g.drawImage(c, 0, 0);
      g.filter = 'none';
      break;
    case 'earth': {
      fill('#1d5fae');
      blobs(g, w, h, 7, '#3f8a3a', r, 30, 0.2, 0.8);
      blobs(g, w, h, 5, '#a98d55', r, 16, 0.3, 0.65);
      blobs(g, w, h, 30, 'rgba(255,255,255,0.55)', r, 10, 0.05, 0.95);
      g.fillStyle = '#f4f8ff';
      g.fillRect(0, 0, w, h * 0.07);
      g.fillRect(0, h * 0.93, w, h * 0.07);
      break;
    }
    case 'mars':
      fill('#c1572e');
      blobs(g, w, h, 12, 'rgba(90,35,20,0.45)', r, 20, 0.25, 0.75);
      craters(g, w, h, 90, r);
      g.fillStyle = '#f6efe9';
      g.fillRect(0, 0, w, h * 0.05);
      g.fillRect(0, h * 0.96, w, h * 0.04);
      break;
    case 'jupiter': {
      fill('#d8b48a');
      bands(g, w, h, ['#e9d6b5', '#c38d5f', '#f3e7cf', '#b37748', '#d9b98f'], r, 2);
      g.fillStyle = '#b8492d';
      g.beginPath();
      g.ellipse(w * 0.62, h * 0.64, 26, 13, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'saturn':
      fill('#e3cc94');
      bands(g, w, h, ['#efdcaa', '#d6b977', '#f3e6c3', '#c9a866'], r, 1);
      break;
    case 'uranus':
      fill('#a6e3ea');
      bands(g, w, h, ['#a6e3ea', '#9bdbe3', '#b4ecf1'], r, 1);
      break;
    case 'neptune':
      fill('#3e66d6');
      bands(g, w, h, ['#3e66d6', '#3558c4', '#4a74e0'], r, 2);
      g.fillStyle = '#26398f';
      g.beginPath();
      g.ellipse(w * 0.4, h * 0.6, 18, 9, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'pluto':
      fill('#c9a98a');
      blobs(g, w, h, 6, 'rgba(250,240,225,0.7)', r, 28, 0.4, 0.7);
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(kind, tex);
  return tex;
}

/** Concentric ring texture for Saturn's rings (planar UVs of RingGeometry). */
export function ringTexture(): THREE.Texture {
  const hit = texCache.get('ring');
  if (hit) return hit;
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const r = rng(99);
  const inner = 0.56;
  for (let k = 0; k < 120; k++) {
    const f = inner + (1 - inner) * (k / 120);
    const gap = f > 0.83 && f < 0.86; // Cassini division
    g.strokeStyle = gap ? 'rgba(0,0,0,0)' : `rgba(${220 + r() * 30},${195 + r() * 30},${150 + r() * 40},${0.35 + r() * 0.55})`;
    g.lineWidth = (s / 2) * ((1 - inner) / 120) + 0.8;
    if (gap) continue;
    g.beginPath();
    g.arc(s / 2, s / 2, (f * s) / 2, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set('ring', tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Sun-lit material: lambert from a point "sun" in world space, plus a glowing rim.
// ---------------------------------------------------------------------------

export interface SunlitOpts {
  map?: THREE.Texture;
  color?: number;
  /** Light from the night side (earthshine / room light). */
  ambient?: number;
  /** Strength of the sun-lit side. */
  sun?: number;
  rim?: number;
  rimStrength?: number;
}

export function sunlitMaterial(sunWorld: THREE.Vector3, o: SunlitOpts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sunWorld },
      uMap: { value: o.map ?? null },
      uUseMap: { value: o.map ? 1 : 0 },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uAmbient: { value: o.ambient ?? 0.08 },
      uSunI: { value: o.sun ?? 1.25 },
      uRim: { value: new THREE.Color(o.rim ?? 0x8f7bff) },
      uRimI: { value: o.rimStrength ?? 0.5 },
      uDim: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform sampler2D uMap; uniform float uUseMap; uniform vec3 uColor;
      uniform float uAmbient; uniform float uSunI; uniform vec3 uRim; uniform float uRimI; uniform float uDim;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main() {
        vec3 base = uColor;
        if (uUseMap > 0.5) base *= texture2D(uMap, vUv).rgb;
        vec3 N = normalize(vN);
        vec3 Ld = normalize(uSun - vW);
        float d = dot(N, Ld);
        float lit = smoothstep(-0.04, 0.12, d) * max(d, 0.0) * 0.6 + smoothstep(-0.04, 0.12, d) * 0.4;
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
        vec3 col = base * (uAmbient + lit * uSunI) * uDim + uRim * rim * uRimI * (0.35 + 0.65 * smoothstep(-0.3, 0.4, d));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** A plane with canvas text, redrawn on language change. */
export function textPlane(
  getText: () => string,
  width: number,
  height: number,
  o: TextOpts & { px?: [number, number]; basic?: boolean } = {},
) {
  const [pw, ph] = o.px ?? [1024, Math.round((1024 * height) / width)];
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = () => {
    drawText(g, pw, ph, getText(), o);
    tex.needsUpdate = true;
  };
  redraw();
  onLangChange(redraw);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  return { mesh, redraw };
}

/** A canvas-backed plane you draw yourself; `draw` is called on language change too. */
export function canvasPlane(width: number, height: number, px: [number, number], draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, transparent = false) {
  const c = document.createElement('canvas');
  c.width = px[0];
  c.height = px[1];
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = () => {
    draw(g, px[0], px[1]);
    tex.needsUpdate = true;
  };
  redraw();
  onLangChange(redraw);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent, toneMapped: false, depthWrite: !transparent }),
  );
  return { mesh, redraw, tex };
}

export const FONT = '"Baloo 2", "Nunito", system-ui, sans-serif';

// ---------------------------------------------------------------------------
// Buddy with a cooldown, shared across the room so stations don't talk over each other.
// ---------------------------------------------------------------------------

export function makeBuddy(ctx: RoomContext, cooldown = 9) {
  let last = -Infinity;
  const ok = () => {
    const now = performance.now() / 1000;
    if (now - last < cooldown) return false;
    last = now;
    return true;
  };
  return {
    celebrate(text: L10n) {
      if (ok()) ctx.buddy.celebrate(text);
    },
    say(text: L10n) {
      if (ok()) ctx.buddy.say(text);
    },
  };
}
export type RoomBuddy = ReturnType<typeof makeBuddy>;

/** Returns true when the camera is within `r` metres (horizontal) of a room-local point. */
export function makeNearCheck(ctx: RoomContext) {
  const tmp = new THREE.Vector3();
  return (x: number, z: number, r: number) => {
    tmp.copy(ctx.camera.position);
    ctx.group.worldToLocal(tmp);
    return Math.hypot(tmp.x - x, tmp.z - z) < r;
  };
}

/** Converts a world point to a local point of `obj` (allocation-free). */
export function toLocal(obj: THREE.Object3D, world: THREE.Vector3, out: THREE.Vector3) {
  out.copy(world);
  return obj.worldToLocal(out);
}

/** A horizontal plane at local height y of `obj`, in world space (for drag projection). */
export function worldPlaneAt(obj: THREE.Object3D, y: number) {
  obj.updateWorldMatrix(true, false);
  const p = new THREE.Vector3(0, y, 0).applyMatrix4(obj.matrixWorld);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), p);
}

export { t, L };

// Shared simple materials
export const MAT = {
  brass: new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 0.85, roughness: 0.3 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2f20, roughness: 0.55 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.5 }),
  navy: new THREE.MeshStandardMaterial({ color: 0x141a3c, roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeef4, roughness: 0.45 }),
  glow: (color: number, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }),
};

// ---------------------------------------------------------------------------
// A small astronaut built from primitives, merged into one geometry with vertex colours.
// Height 1 (feet at y = 0), facing +Z.
// ---------------------------------------------------------------------------

export function astronautGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    geo.scale(sx, sy, sz);
    geo.rotateX(rx);
    geo.rotateZ(rz);
    geo.translate(x, y, z);
    const col = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(geo);
  };
  const suit = 0xf2f2f6;
  const grey = 0x8a8f9c;
  // legs
  add(new THREE.CapsuleGeometry(0.075, 0.22, 4, 10), suit, -0.085, 0.2, 0);
  add(new THREE.CapsuleGeometry(0.075, 0.22, 4, 10), suit, 0.085, 0.2, 0);
  // boots
  add(new THREE.BoxGeometry(0.13, 0.06, 0.2), grey, -0.085, 0.03, 0.02);
  add(new THREE.BoxGeometry(0.13, 0.06, 0.2), grey, 0.085, 0.03, 0.02);
  // torso
  add(new THREE.CapsuleGeometry(0.16, 0.18, 4, 12), suit, 0, 0.52, 0);
  // chest panel
  add(new THREE.BoxGeometry(0.14, 0.08, 0.04), 0x5d6bd8, 0, 0.56, 0.15);
  // backpack
  add(new THREE.BoxGeometry(0.28, 0.32, 0.12), 0xd9d9e0, 0, 0.55, -0.17);
  // arms
  add(new THREE.CapsuleGeometry(0.06, 0.22, 4, 10), suit, -0.22, 0.5, 0, 0, -0.35);
  add(new THREE.CapsuleGeometry(0.06, 0.22, 4, 10), suit, 0.22, 0.5, 0, 0, 0.35);
  // gloves
  add(new THREE.SphereGeometry(0.055, 10, 8), grey, -0.27, 0.36, 0);
  add(new THREE.SphereGeometry(0.055, 10, 8), grey, 0.27, 0.36, 0);
  // helmet + visor
  add(new THREE.SphereGeometry(0.16, 20, 14), suit, 0, 0.84, 0);
  add(new THREE.SphereGeometry(0.125, 20, 14), 0xc79a3a, 0, 0.85, 0.055, 0, 0, 1, 0.8, 0.85);
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
}
