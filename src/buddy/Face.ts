/**
 * Buddy's visor face: glowing turquoise eyes and mouth drawn on a canvas.
 * The canvas is only redrawn when something visible changes (expression, blink,
 * gaze, mouth, or a small animated detail such as the "idea" sparkle).
 * Expression changes happen behind a quick blink, the classic cartoon trick.
 */
import * as THREE from 'three';
import type { Expression } from '../core/types';

const W = 512;
const H = 360;
const TEAL = '#5ee6d6';
const BG = '#020304';
const EXPRESSIONS: readonly Expression[] = [
  'happy', 'idea', 'skeptical', 'joy', 'wink', 'surprised',
  'sad', 'confused', 'determined', 'sleepy', 'thinking', 'love',
];
const ANIMATED: readonly Expression[] = ['idea', 'confused', 'sleepy', 'love'];
const EXL = W / 2 - 114;
const EXR = W / 2 + 114;
const EY = 170;
const MX = W / 2;
const MY = 266;
const ER = 42;
const VISOR_RADII = [150, 150, 128, 128];
const TAU = Math.PI * 2;

export class Face {
  readonly texture: THREE.CanvasTexture;
  /** Gaze, −1..1. +x = towards Buddy's left (canvas right), +y = up. */
  lookX = 0;
  lookY = 0;
  /** Mouth openness from speech, 0..1. */
  talk = 0;

  private readonly g: CanvasRenderingContext2D;
  private expr: Expression = 'happy';
  private pending: Expression | null = null;
  private blinkT = -1;
  private blinkDur = 0.15;
  private nextBlink = 2.5;
  private doubleBlink = false;
  private lastKey = -1;

  constructor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.g = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.draw(0, 0);
  }

  /** The expression shown (or about to be shown after the current blink). */
  get expression(): Expression {
    return this.pending ?? this.expr;
  }

  setExpression(e: Expression) {
    if (e === this.expression) return;
    this.pending = e;
  }

  update(dt: number, time: number) {
    if (this.blinkT < 0 && (this.pending || time >= this.nextBlink)) {
      this.blinkT = 0;
      this.blinkDur = this.pending ? 0.13 : 0.15;
      if (!this.pending) {
        this.nextBlink = time + 2 + Math.random() * 4;
        this.doubleBlink = Math.random() < 0.2;
      }
    }
    let closed = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const u = this.blinkT / this.blinkDur;
      if (u >= 0.5 && this.pending) {
        this.expr = this.pending;
        this.pending = null;
      }
      if (u >= 1) {
        this.blinkT = -1;
        if (this.doubleBlink) {
          this.doubleBlink = false;
          this.nextBlink = time + 0.1;
        }
      } else closed = Math.sin(Math.PI * u);
    }

    const ei = EXPRESSIONS.indexOf(this.expr);
    const bq = Math.round(closed * 10);
    const lx = Math.round(Math.max(-1, Math.min(1, this.lookX)) * 10) + 10;
    const ly = Math.round(Math.max(-1, Math.min(1, this.lookY)) * 10) + 10;
    const tq = this.talk > 0.05 ? 1 + Math.round(Math.min(1, this.talk) * 14) : 0;
    const aq = tq > 0 || ANIMATED.includes(this.expr) ? Math.floor(time * 12) % 64 : 0;
    const key = ((((ei * 16 + bq) * 32 + lx) * 32 + ly) * 16 + tq) * 64 + aq;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.draw(closed, time);
    }
  }

  // ---------------------------------------------------------------- drawing

  private draw(closed: number, time: number) {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.shadowBlur = 0;
    g.beginPath();
    g.roundRect(6, 6, W - 12, H - 12, VISOR_RADII);
    g.fillStyle = BG;
    g.fill();

    g.fillStyle = TEAL;
    g.strokeStyle = TEAL;
    g.shadowColor = TEAL;
    g.shadowBlur = 9;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const open = 1 - closed;
    const gx = this.lookX * 13;
    const gy = -this.lookY * 10;
    const tick = Math.floor(time * 12) / 12;

    switch (this.expr) {
      case 'happy':
        this.ring(EXL + gx, EY + gy, ER, open, gx, gy);
        this.ring(EXR + gx, EY + gy, ER, open, gx, gy);
        break;
      case 'idea': {
        this.ring(EXL + gx, EY + gy - 4, ER * 1.14, open, gx, gy);
        this.ring(EXR + gx, EY + gy - 4, ER * 1.14, open, gx, gy);
        const tw = 1 + 0.25 * Math.sin(tick * 9);
        this.sparkle(EXR + 78, EY - 76, 20 * tw);
        this.sparkle(EXR + 42, EY - 104, 9 * (2 - tw));
        break;
      }
      case 'skeptical':
        this.ring(EXL + gx, EY + gy, ER, open, gx, gy);
        this.ring(EXR + gx, EY + gy + 4, ER * 0.95, open, gx, gy);
        this.lid(EXR + gx, EY + gy + 4, ER * 0.95, -6, 0.08);
        this.brow(EXL, EY - 72, 46, -0.12);
        break;
      case 'joy':
        this.arcEye(EXL, EY + 4, ER);
        this.arcEye(EXR, EY + 4, ER);
        break;
      case 'wink':
        this.ring(EXL + gx, EY + gy, ER, open, gx, gy);
        this.arcEye(EXR, EY + 6, ER * 0.9);
        break;
      case 'surprised':
        this.ring(EXL + gx, EY + gy - 6, ER * 1.18, open, gx * 0.5, gy * 0.5, 0.14);
        this.ring(EXR + gx, EY + gy - 6, ER * 1.18, open, gx * 0.5, gy * 0.5, 0.14);
        this.brow(EXL, EY - 84, 36, 0.12);
        this.brow(EXR, EY - 84, 36, -0.12);
        break;
      case 'sad':
        this.ring(EXL + gx, EY + gy + 10, ER * 0.92, open, gx, gy);
        this.ring(EXR + gx, EY + gy + 10, ER * 0.92, open, gx, gy);
        this.brow(EXL, EY - 58, 42, -0.3);
        this.brow(EXR, EY - 58, 42, 0.3);
        break;
      case 'confused': {
        this.ring(EXL + gx, EY + gy + 4, ER, open, gx, gy);
        this.ring(EXR + gx, EY + gy - 8, ER * 0.78, open, gx, gy);
        this.brow(EXR, EY - 76, 34, -0.2);
        const bob = Math.sin(tick * 4) * 6;
        g.font = 'bold 72px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('?', W - 150, 92 + bob);
        break;
      }
      case 'determined':
        this.ring(EXL + gx, EY + gy + 4, ER, open, gx, gy);
        this.ring(EXR + gx, EY + gy + 4, ER, open, gx, gy);
        this.lid(EXL + gx, EY + gy + 4, ER, -14, 0.3);
        this.lid(EXR + gx, EY + gy + 4, ER, -14, -0.3);
        break;
      case 'sleepy': {
        const o = Math.min(open, 0.55);
        this.ring(EXL + gx, EY + gy + 10, ER, o, gx, gy);
        this.ring(EXR + gx, EY + gy + 10, ER, o, gx, gy);
        const z = (tick * 0.6) % 1;
        g.font = 'bold 44px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.globalAlpha = 1 - z;
        g.fillText('z', W - 160 + z * 22, 118 - z * 48);
        g.globalAlpha = 1;
        break;
      }
      case 'thinking':
        this.ring(EXL - 14, EY - 12, ER, open, -10, -10);
        this.ring(EXR - 14, EY - 12, ER, open, -10, -10);
        break;
      case 'love': {
        const p = (1 + 0.1 * Math.sin(tick * 10)) * Math.max(0.12, open);
        this.heart(EXL, EY, 36, p);
        this.heart(EXR, EY, 36, p);
        break;
      }
    }
    if (this.talk > 0.05) this.talkMouth(tick);
    else this.expressionMouth();
    this.texture.needsUpdate = true;
  }

  private expressionMouth() {
    switch (this.expr) {
      case 'happy':
        this.smile(MX, MY, 38, 14);
        break;
      case 'idea':
        this.openMouth(MX, MY - 6, 34, 26, true);
        break;
      case 'skeptical':
        this.flat(MX + 26, MY + 4, 30, -0.12);
        break;
      case 'joy':
        this.openMouth(MX, MY - 14, 60, 48, true);
        break;
      case 'wink':
        this.smile(MX + 6, MY, 40, 17);
        break;
      case 'surprised':
        this.oMouth(MX, MY + 4, 20, 26);
        break;
      case 'sad':
        this.frown(MX, MY + 16, 34, 14);
        break;
      case 'confused':
        this.wavy(MX, MY + 4, 38);
        break;
      case 'determined':
        this.flat(MX, MY + 6, 30, 0);
        break;
      case 'sleepy':
        this.oMouth(MX, MY + 6, 11, 9);
        break;
      case 'thinking':
        this.smile(MX - 26, MY + 4, 18, 6);
        break;
      case 'love':
        this.smile(MX, MY, 40, 18);
        break;
    }
  }

  /** Talking mouth: openness from the voice level, width wobbling with a viseme-like rhythm. */
  private talkMouth(tick: number) {
    const o = Math.min(1, this.talk);
    const shape = 0.5 + 0.5 * Math.sin(Math.floor(tick * 7) * 2.7);
    const w = 24 + 22 * o + 12 * shape * o;
    const d = 8 + 40 * o * (1.1 - 0.4 * shape);
    this.openMouth(MX, MY - 6 + (this.expr === 'sad' ? 10 : 0), w, d, o > 0.35);
  }

  private ring(cx: number, cy: number, r: number, open: number, hx: number, hy: number, hl = 0.21) {
    const g = this.g;
    if (open < 0.2) {
      g.lineWidth = 13;
      g.beginPath();
      g.moveTo(cx - r * 0.85, cy);
      g.lineTo(cx + r * 0.85, cy);
      g.stroke();
      return;
    }
    const ry = r * 1.12 * open;
    g.lineWidth = 14;
    g.beginPath();
    g.ellipse(cx, cy, r, ry, 0, 0, TAU);
    g.stroke();
    // Small highlight dot inside the ring (upper left), leading the gaze a little.
    g.beginPath();
    g.ellipse(cx - r * 0.3 + hx * 0.5, cy - ry * 0.32 + hy * 0.5, r * hl, r * hl * open, 0, 0, TAU);
    g.fill();
  }

  /** Overpaint the top of an eye with a straight lid (determined, skeptical). */
  private lid(cx: number, cy: number, r: number, yOff: number, slope: number) {
    const g = this.g;
    const e = r + 16;
    const y0 = cy + yOff - slope * e;
    const y1 = cy + yOff + slope * e;
    g.save();
    g.shadowBlur = 0;
    g.fillStyle = BG;
    g.beginPath();
    g.moveTo(cx - e, y0);
    g.lineTo(cx + e, y1);
    g.lineTo(cx + e, cy - r * 1.4 - 20);
    g.lineTo(cx - e, cy - r * 1.4 - 20);
    g.closePath();
    g.fill();
    g.restore();
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(cx - e + 8, y0 + slope * 8);
    g.lineTo(cx + e - 8, y1 - slope * 8);
    g.stroke();
  }

  private brow(cx: number, cy: number, half: number, slope: number) {
    const g = this.g;
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(cx - half, cy - slope * half);
    g.lineTo(cx + half, cy + slope * half);
    g.stroke();
  }

  /** "^" closed happy eye. */
  private arcEye(cx: number, cy: number, r: number) {
    const g = this.g;
    g.lineWidth = 15;
    g.beginPath();
    g.arc(cx, cy + r * 0.5, r * 0.88, Math.PI * 1.17, Math.PI * 1.83);
    g.stroke();
  }

  private heart(cx: number, cy: number, s: number, sy: number) {
    const g = this.g;
    g.save();
    g.translate(cx, cy);
    g.scale(1 + (sy - 1) * 0.3, sy);
    g.beginPath();
    g.moveTo(0, s * 0.95);
    g.bezierCurveTo(-s * 1.7, -s * 0.05, -s * 0.75, -s * 1.25, 0, -s * 0.42);
    g.bezierCurveTo(s * 0.75, -s * 1.25, s * 1.7, -s * 0.05, 0, s * 0.95);
    g.fill();
    g.restore();
  }

  private sparkle(x: number, y: number, s: number) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x, y - s);
    g.quadraticCurveTo(x, y, x + s, y);
    g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y);
    g.quadraticCurveTo(x, y, x, y - s);
    g.fill();
  }

  private smile(cx: number, cy: number, w: number, d: number) {
    const g = this.g;
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(cx - w, cy);
    g.quadraticCurveTo(cx, cy + d * 2, cx + w, cy);
    g.stroke();
  }

  private frown(cx: number, cy: number, w: number, d: number) {
    const g = this.g;
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(cx - w, cy);
    g.quadraticCurveTo(cx, cy - d * 2, cx + w, cy);
    g.stroke();
  }

  private flat(cx: number, cy: number, w: number, tilt: number) {
    const g = this.g;
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(cx - w, cy - tilt * w);
    g.lineTo(cx + w, cy + tilt * w);
    g.stroke();
  }

  private wavy(cx: number, cy: number, w: number) {
    const g = this.g;
    g.lineWidth = 12;
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const x = cx - w + (2 * w * i) / 16;
      const y = cy + Math.sin((i / 16) * TAU * 1.5) * 7;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  private oMouth(cx: number, cy: number, rx: number, ry: number) {
    const g = this.g;
    g.lineWidth = 12;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.stroke();
  }

  /** Filled "D" mouth (open smile / talking), optionally with a darker tongue. */
  private openMouth(cx: number, cy: number, w: number, d: number, tongue: boolean) {
    const g = this.g;
    g.beginPath();
    g.moveTo(cx - w, cy);
    g.quadraticCurveTo(cx, cy - 5, cx + w, cy);
    g.bezierCurveTo(cx + w, cy + d * 1.33, cx - w, cy + d * 1.33, cx - w, cy);
    g.closePath();
    g.fill();
    if (tongue && d > 16) {
      g.save();
      g.clip();
      g.shadowBlur = 0;
      g.fillStyle = '#1e8077';
      g.beginPath();
      g.ellipse(cx, cy + d * 1.02, w * 0.55, d * 0.36, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }
}
