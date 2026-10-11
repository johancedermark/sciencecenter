/** Shared helpers for the perception room: number formatting, Buddy cooldown, signs, overlays, colour maths. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getLang, onLangChange, t } from '../../core/i18n';
import { drawText } from '../../core/textures';
import type { L10n, RoomContext } from '../../core/types';

export const ACCENT = 0xff8a5c;

/** Locale-aware number, e.g. fmt(19.6, 1) -> "19,6" in Swedish. */
export function fmt(v: number, digits = 0): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Buddy lines on real milestones, at most one every `cooldown` seconds across the whole room. */
export function makeBuddyGate(ctx: RoomContext, cooldown = 9) {
  let last = -1e9;
  return {
    celebrate(text: L10n) {
      const now = performance.now() / 1000;
      if (now - last < cooldown) return;
      last = now;
      ctx.buddy.celebrate(text);
    },
    say(text: L10n, expression: 'surprised' | 'thinking' | 'happy' | 'wink' | 'idea' = 'happy') {
      const now = performance.now() / 1000;
      if (now - last < cooldown) return;
      last = now;
      ctx.buddy.say(text, { expression });
    },
  };
}
export type BuddyGate = ReturnType<typeof makeBuddyGate>;

// ------------------------------------------------------------------ shared materials and geometry

export const mats = {
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.62, metalness: 0.02 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.7 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.32, metalness: 0.85 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xcfc2ad, roughness: 0.85 }),
  felt: new THREE.MeshStandardMaterial({ color: 0x5a2f2a, roughness: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1d1a1f, roughness: 0.5 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xb8643c, roughness: 0.75 }),
};

const boxCache = new Map<string, THREE.BufferGeometry>();
/** Shared rounded box geometry (cached by size). */
export function rbox(w: number, h: number, d: number, r = 0.03) {
  const key = `${w}|${h}|${d}|${r}`;
  let g = boxCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    boxCache.set(key, g);
  }
  return g;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

// ------------------------------------------------------------------ canvas-backed planes

export interface CanvasPlane {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  redraw(): void;
}

/** A flat unlit plane showing a canvas. `draw` is called now and on every language change. */
export function canvasPlane(
  w: number, h: number, px: [number, number],
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
): CanvasPlane {
  const canvas = document.createElement('canvas');
  canvas.width = px[0];
  canvas.height = px[1];
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  const redraw = () => {
    draw(g, px[0], px[1]);
    texture.needsUpdate = true;
  };
  redraw();
  onLangChange(redraw);
  return { mesh: m, canvas, g, texture, redraw };
}

/** A small wooden sign with warm text (station names, plaques). */
export function sign(text: L10n, w: number, h: number, opts: { color?: string; bg?: string; font?: number } = {}) {
  const pxW = 1024;
  const pxH = Math.round((1024 * h) / w);
  return canvasPlane(w, h, [pxW, pxH], (g, W, H) => {
    drawText(g, W, H, t(text), {
      bg: opts.bg ?? '#3a2418',
      color: opts.color ?? '#ffd9a8',
      font: `800 ${Math.round(opts.font ?? H * 0.5)}px "Baloo 2", "Nunito", system-ui, sans-serif`,
    });
    const lw = Math.max(6, H * 0.05);
    g.strokeStyle = '#c9a050';
    g.lineWidth = lw;
    g.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  });
}

/** Wrap text in a canvas into lines no wider than maxW. */
export function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

// ------------------------------------------------------------------ full-screen overlay

export interface Overlay {
  root: HTMLDivElement;
  close(): void;
  readonly open: boolean;
}

/**
 * A full-screen layer above the whole UI, for effects that must happen in the visitor's real eyes.
 * Escape closes only the overlay (not the station). `onClose` runs once.
 */
export function openOverlay(o: { background: string; closeLabel: L10n; onClose?: () => void }): Overlay {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '9999', background: o.background,
    touchAction: 'none', userSelect: 'none', overflow: 'hidden',
    fontFamily: "'Nunito', system-ui, sans-serif",
  } satisfies Partial<CSSStyleDeclaration>);
  const btn = document.createElement('button');
  Object.assign(btn.style, {
    position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', right: '14px', zIndex: '2',
    padding: '10px 18px', borderRadius: '999px', border: '1px solid rgba(0,0,0,0.25)',
    background: 'rgba(30,22,30,0.82)', color: '#fff6ea', fontWeight: '800', fontSize: '16px', cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  const label = () => (btn.textContent = '✕ ' + t(o.closeLabel));
  label();
  const offLang = onLangChange(label);
  let isOpen = true;
  const onKey = (e: KeyboardEvent) => {
    // Keep keys away from the station/player while the overlay is up; Escape closes the overlay only.
    e.stopPropagation();
    if (e.code === 'Escape') close();
  };
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    window.removeEventListener('keydown', onKey, true);
    offLang();
    root.remove();
    o.onClose?.();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  window.addEventListener('keydown', onKey, true);
  root.appendChild(btn);
  document.body.appendChild(root);
  return { root, close, get open() { return isOpen; } };
}

/** A DPR-scaled canvas filling its parent; calls `onResize` with CSS-pixel size. */
export function fullCanvas(parent: HTMLElement, onResize: () => void) {
  const c = document.createElement('canvas');
  Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  parent.appendChild(c);
  const g = c.getContext('2d')!;
  const size = { w: 1, h: 1, dpr: 1 };
  const fit = () => {
    size.dpr = Math.min(2, window.devicePixelRatio || 1);
    size.w = parent.clientWidth || window.innerWidth;
    size.h = parent.clientHeight || window.innerHeight;
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    onResize();
  };
  window.addEventListener('resize', fit);
  return { canvas: c, g, size, fit, dispose: () => window.removeEventListener('resize', fit) };
}

// ------------------------------------------------------------------ colour science (OKLab)

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function srgbToOklab(hex: number): [number, number, number] {
  const r = s2l(((hex >> 16) & 255) / 255);
  const g = s2l(((hex >> 8) & 255) / 255);
  const b = s2l((hex & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * The colour whose negative afterimage is `hex`: mirror it through grey in OKLab's opponent axes
 * (a: green–red, b: blue–yellow), flip its lightness, and push the chroma as far as the sRGB gamut allows
 * so the cones get the strongest possible one-sided workout.
 */
export function inducerFor(hex: number): string {
  const [L, a, b] = srgbToOklab(hex);
  const L2 = Math.min(0.85, Math.max(0.35, 1.3 - L));
  const inGamut = (k: number) => oklabToLinear(L2, -a * k, -b * k).every((v) => v >= 0 && v <= 1);
  let lo = 0;
  let hi = 3;
  for (let i = 0; i < 30; i++) {
    const k = (lo + hi) / 2;
    if (inGamut(k)) lo = k;
    else hi = k;
  }
  const rgb = oklabToLinear(L2, -a * lo * 0.95, -b * lo * 0.95);
  return '#' + rgb.map((v) => Math.round(l2s(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('');
}

export function hexCss(hex: number) {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Small deterministic RNG. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Exponential approach, frame-rate independent. */
export function approach(cur: number, target: number, rate: number, dt: number) {
  return target + (cur - target) * Math.exp(-rate * dt);
}
