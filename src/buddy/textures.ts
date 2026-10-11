/** Small procedural canvas textures used by Buddy's model. */
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Diagonal rainbow "pixel diamond" pattern (chest panel, head and shoulder patches). */
export function rainbowTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#17191d';
  g.fillRect(0, 0, S, S);
  const cols = ['#e5483d', '#f07f2a', '#f4c13b', '#93cf47', '#2fb8a2', '#3a86d8', '#6f5bd0', '#d4529b'];
  const cell = 22;
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(Math.PI / 4);
  for (let i = -9; i <= 9; i++) {
    for (let j = -9; j <= 9; j++) {
      const base = cols[(((i + Math.floor(j / 3)) % cols.length) + cols.length) % cols.length];
      g.fillStyle = base;
      g.fillRect(i * cell - cell / 2 + 1.2, j * cell - cell / 2 + 1.2, cell - 2.4, cell - 2.4);
      // Per-diamond shading so it reads as pixels, not stripes.
      const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      g.fillStyle = r > 0.5 ? `rgba(255,255,255,${(r - 0.5) * 0.3})` : `rgba(0,0,0,${(0.5 - r) * 0.55})`;
      g.fillRect(i * cell - cell / 2 + 1.2, j * cell - cell / 2 + 1.2, cell - 2.4, cell - 2.4);
    }
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft radial gradient: white centre fading to transparent. */
export function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
