/** Shared helpers for the Sound & Waves room: materials, audio bus, formatting, Buddy cooldown. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getLang, onLangChange } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';

export const ACCENT = 0x4fd1ff;

/** Number with the visitor's locale (decimal comma in Swedish). */
export function nf(v: number, digits = 0): string {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Frequency with a sensible number of digits. */
export function hz(f: number): string {
  if (f >= 10000) return `${nf(f / 1000, 1)} kHz`;
  if (f >= 1000) return `${nf(f / 1000, 2)} kHz`;
  return `${nf(f, f < 100 ? 1 : 0)} Hz`;
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** Nearest note in equal temperament (A4 = 440 Hz), e.g. "A4". */
export function noteName(f: number): string {
  if (!(f > 0)) return '–';
  const n = Math.round(12 * Math.log2(f / 440)) + 57; // semitones from C0
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12)}`;
}

export const rbox = (w: number, h: number, d: number, r = 0.03, seg = 3) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

export interface Mats {
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  warmGlow: THREE.MeshBasicMaterial;
  red: THREE.MeshStandardMaterial;
}

export function makeMats(): Mats {
  return {
    wood: new THREE.MeshStandardMaterial({ color: 0x9a6438, roughness: 0.55 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2f20, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 0.75, roughness: 0.32 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.55, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x23252c, roughness: 0.5, metalness: 0.2 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xe9e0cf, roughness: 0.7 }),
    glow: new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false }),
    warmGlow: new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.4, emissive: 0x400000 }),
  };
}

/** A sustained oscillator (optionally through a low-pass) that can be started and stopped many times. */
export class LiveTone {
  private osc: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  constructor(
    private ac: AudioContext,
    private dest: AudioNode,
    private type: OscillatorType = 'sine',
    private lowpass = 0,
  ) {}

  get on() {
    return !!this.osc;
  }

  start(freq: number) {
    if (this.osc) return;
    const c = this.ac;
    this.osc = c.createOscillator();
    this.osc.type = this.type;
    this.osc.frequency.value = freq;
    this.g = c.createGain();
    this.g.gain.value = 0;
    this.pan = c.createStereoPanner();
    let n: AudioNode = this.osc;
    if (this.lowpass > 0) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = this.lowpass;
      n = n.connect(f);
    }
    n.connect(this.g).connect(this.pan).connect(this.dest);
    this.osc.start();
  }

  set(freq: number, gain: number, tc = 0.03, pan = 0) {
    if (!this.osc || !this.g || !this.pan) return;
    const t = this.ac.currentTime;
    this.osc.frequency.setTargetAtTime(Math.max(1, freq), t, tc);
    this.g.gain.setTargetAtTime(Math.max(0, gain), t, tc);
    this.pan.pan.setTargetAtTime(pan, t, tc);
  }

  setType(t: OscillatorType) {
    this.type = t;
    if (this.osc) this.osc.type = t;
  }

  stop(release = 0.06) {
    if (!this.osc || !this.g) return;
    const t = this.ac.currentTime;
    this.g.gain.cancelScheduledValues(t);
    this.g.gain.setTargetAtTime(0, t, release);
    const o = this.osc;
    o.stop(t + release * 8);
    o.onended = () => {
      o.disconnect();
    };
    this.osc = null;
    this.g = null;
    this.pan = null;
  }
}

let noiseBuf: AudioBuffer | null = null;
/** Looping band-passed noise (sand hiss, gas hiss). */
export class LiveNoise {
  private src: AudioBufferSourceNode | null = null;
  private g: GainNode | null = null;
  constructor(private ac: AudioContext, private dest: AudioNode, private freq = 3000, private q = 0.7) {}

  start() {
    if (this.src) return;
    const c = this.ac;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    this.src = c.createBufferSource();
    this.src.buffer = noiseBuf;
    this.src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = this.freq;
    f.Q.value = this.q;
    this.g = c.createGain();
    this.g.gain.value = 0;
    this.src.connect(f).connect(this.g).connect(this.dest);
    this.src.start(0, Math.random());
  }

  set(gain: number, tc = 0.05) {
    if (this.g) this.g.gain.setTargetAtTime(Math.max(0, gain), this.ac.currentTime, tc);
  }

  stop() {
    if (!this.src || !this.g) return;
    const t = this.ac.currentTime;
    this.g.gain.setTargetAtTime(0, t, 0.05);
    const s = this.src;
    s.stop(t + 0.4);
    s.onended = () => s.disconnect();
    this.src = null;
    this.g = null;
  }
}

/** Room-wide shared state handed to every station builder. */
export interface Shared {
  ctx: RoomContext;
  mats: Mats;
  /** Room audio bus: every sound in this room goes through it. */
  bus: GainNode;
  /** Camera position in room-local coordinates (updated every frame). */
  cam: THREE.Vector3;
  /** Buddy line with a room-wide cooldown (≥ 10 s). */
  cheer(text: L10n, celebrate?: boolean): void;
  /** Canvas-texture label that redraws on language change. */
  lang(fn: () => void): void;
}

export function makeShared(ctx: RoomContext): Shared {
  const bus = ctx.sfx.ctx.createGain();
  bus.gain.value = 1;
  bus.connect(ctx.sfx.out);
  let last = -1e9;
  return {
    ctx,
    mats: makeMats(),
    bus,
    cam: new THREE.Vector3(),
    cheer(text, celebrate = true) {
      const now = performance.now();
      if (now - last < 10000) return;
      last = now;
      if (celebrate) ctx.buddy.celebrate(text);
      else ctx.buddy.say(text, { expression: 'surprised' });
    },
    lang(fn) {
      fn();
      onLangChange(() => fn());
    },
  };
}

/** Horizontal distance from the camera to a room-local point. */
export function camDist(s: Shared, x: number, z: number) {
  return Math.hypot(s.cam.x - x, s.cam.z - z);
}

/** A station module: per-frame update and a hard "silence everything" switch. */
export interface StationModule {
  update(dt: number, time: number): void;
  silence(): void;
}

/** Glowing soft dot texture (flames, LEDs). */
export function glowTexture(inner: string, mid: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, mid);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Draw a response curve (amplitude vs frequency) with a marker, on a HUD canvas. */
export function drawResponse(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  curve: Float32Array,
  fMin: number,
  fMax: number,
  fNow: number,
  log: boolean,
  peaks: number[] = [],
) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(10,20,30,0.55)';
  g.fillRect(0, 0, w, h);
  const xOf = (f: number) =>
    log ? (Math.log(f / fMin) / Math.log(fMax / fMin)) * w : ((f - fMin) / (fMax - fMin)) * w;
  g.strokeStyle = 'rgba(79,209,255,0.18)';
  g.lineWidth = 1;
  for (const p of peaks) {
    if (p < fMin || p > fMax) continue;
    const x = xOf(p);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  let mx = 1e-9;
  for (let i = 0; i < curve.length; i++) mx = Math.max(mx, curve[i]);
  g.strokeStyle = '#4fd1ff';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * w;
    const y = h - 6 - (curve[i] / mx) * (h - 14);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  const x = xOf(fNow);
  g.strokeStyle = '#ffb35c';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x, h);
  g.stroke();
}
