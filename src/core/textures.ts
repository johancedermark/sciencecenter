/** Procedural canvas textures, so the project ships no image assets. */
import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function tex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Warm oak planks. */
export function woodFloor(repeat: [number, number] = [4, 4]) {
  const { c, g } = canvas(1024, 1024);
  const r = rng(7);
  const plankH = 1024 / 8;
  for (let row = 0; row < 8; row++) {
    let x = -r() * 400;
    while (x < 1024) {
      const len = 300 + r() * 380;
      const base = 32 + r() * 14;
      const l = 38 + r() * 12;
      g.fillStyle = `hsl(${base}, ${45 + r() * 12}%, ${l}%)`;
      g.fillRect(x, row * plankH, len, plankH);
      // grain
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `hsla(${base - 6}, 50%, ${l - 10 - r() * 8}%, ${0.12 + r() * 0.18})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const y0 = row * plankH + r() * plankH;
        g.moveTo(x, y0);
        for (let s = 0; s <= 8; s++) g.lineTo(x + (len / 8) * s, y0 + Math.sin(s * 0.9 + r() * 2) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(30,15,5,0.55)';
      g.fillRect(x, row * plankH, 3, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(30,15,5,0.6)';
    g.fillRect(0, row * plankH, 1024, 3);
  }
  return tex(c, repeat);
}

/** Soft plaster with subtle mottling. */
export function plaster(color = '#e9dfd1', repeat: [number, number] = [2, 1]) {
  const { c, g } = canvas(512, 512);
  const r = rng(3);
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const a = r() * 0.05;
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(80,60,40,${a})`;
    const s = 2 + r() * 14;
    g.beginPath();
    g.arc(r() * 512, r() * 512, s, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, repeat);
}

/** Tinted carpet / rubber floor with fine speckle. */
export function carpet(hex: number, repeat: [number, number] = [6, 6]) {
  const { c, g } = canvas(256, 256);
  const r = rng(11);
  const col = new THREE.Color(hex);
  const base = col.clone().multiplyScalar(0.28);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const k = 0.18 + r() * 0.25;
    const cc = col.clone().multiplyScalar(k);
    g.fillStyle = `#${cc.getHexString()}`;
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  return tex(c, repeat);
}

/** Night sky for the atrium dome: stars + faint milky band. */
export function starSky() {
  const { c, g } = canvas(2048, 1024);
  const r = rng(42);
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#05060f');
  grad.addColorStop(0.6, '#0b1030');
  grad.addColorStop(1, '#1b1840');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(150,140,255,${r() * 0.04})`;
    const x = r() * 2048;
    g.beginPath();
    g.ellipse(x, 300 + Math.sin(x / 300) * 120 + (r() - 0.5) * 160, 60 + r() * 120, 20 + r() * 50, 0.3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const s = r() < 0.97 ? r() * 1.3 + 0.3 : 1.6 + r() * 1.6;
    const hue = r() < 0.3 ? 30 : r() < 0.5 ? 210 : 0;
    g.fillStyle = `hsla(${hue}, 80%, ${85 + r() * 15}%, ${0.4 + r() * 0.6})`;
    g.beginPath();
    g.arc(r() * 2048, r() * 1024, s, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export interface TextOpts {
  font?: string;
  color?: string;
  glow?: string;
  bg?: string;
  width?: number;
  height?: number;
  align?: CanvasTextAlign;
  padding?: number;
  lineHeight?: number;
}

/** Text rendered into a canvas texture (signs, labels). Multi-line with \n. */
export function textTexture(text: string, o: TextOpts = {}) {
  const w = o.width ?? 1024;
  const h = o.height ?? 256;
  const { c, g } = canvas(w, h);
  drawText(g, w, h, text, o);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function drawText(g: CanvasRenderingContext2D, w: number, h: number, text: string, o: TextOpts = {}) {
  g.clearRect(0, 0, w, h);
  if (o.bg) {
    g.fillStyle = o.bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = o.font ?? `700 ${Math.round(h * 0.42)}px "Baloo 2", "Nunito", system-ui, sans-serif`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  const lh = o.lineHeight ?? parseInt(g.font.match(/(\d+)px/)?.[1] ?? '40', 10) * 1.15;
  const pad = o.padding ?? 24;
  const x = g.textAlign === 'left' ? pad : g.textAlign === 'right' ? w - pad : w / 2;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => {
    if (o.glow) {
      g.shadowColor = o.glow;
      g.shadowBlur = h * 0.08;
    }
    g.fillStyle = o.color ?? '#fff';
    g.fillText(line, x, y0 + i * lh);
    g.shadowBlur = 0;
  });
}

/** Radial soft spot, for fake light pools and blob shadows. */
export function radialSpot(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const { c, g } = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
