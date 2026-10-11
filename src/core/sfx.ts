/**
 * Synthesized sound effects (WebAudio, no asset files).
 * Rooms can also use `sfx.ctx` and `sfx.out` directly for custom synthesis.
 */
export interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  /** Glide to this frequency over the duration. */
  to?: number;
  delay?: number;
  pan?: number;
}

export interface Voice {
  setFreq(hz: number, glide?: number): void;
  setGain(g: number, glide?: number): void;
  stop(release?: number): void;
  readonly osc: OscillatorNode;
}

export class Sfx {
  readonly ctx: AudioContext;
  /** Connect custom nodes here; it goes through the master volume. */
  readonly out: GainNode;
  private master: GainNode;
  private noiseBuf: AudioBuffer;
  private _muted = false;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.out = this.ctx.createGain();
    this.out.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get muted() {
    return this._muted;
  }

  setMuted(m: boolean) {
    this._muted = m;
    this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** A one-shot tone. */
  tone(freq: number, dur = 0.15, o: ToneOpts = {}) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    const g = c.createGain();
    const a = o.attack ?? 0.005;
    const r = o.release ?? Math.min(0.3, dur);
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, t0 + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);
    let node: AudioNode = osc.connect(g);
    if (o.pan) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(this.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Filtered noise burst (whoosh, sizzle, sand). */
  noise(dur = 0.3, o: { gain?: number; freq?: number; q?: number; type?: BiquadFilterType; to?: number; delay?: number } = {}) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, t0 + Math.min(0.05, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /** A sustained oscillator you control (motors, hums, tone generators). */
  voice(freq: number, o: { type?: OscillatorType; gain?: number } = {}): Voice {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(o.gain ?? 0.1, c.currentTime, 0.03);
    osc.connect(g).connect(this.out);
    osc.start();
    let stopped = false;
    return {
      osc,
      setFreq: (hz, glide = 0.03) => osc.frequency.setTargetAtTime(Math.max(0.01, hz), c.currentTime, glide),
      setGain: (v, glide = 0.03) => g.gain.setTargetAtTime(v, c.currentTime, glide),
      stop: (release = 0.08) => {
        if (stopped) return;
        stopped = true;
        g.gain.setTargetAtTime(0, c.currentTime, release);
        osc.stop(c.currentTime + release * 6);
      },
    };
  }

  // Ready-made UI sounds
  click() { this.tone(1400, 0.04, { type: 'triangle', gain: 0.08 }); }
  hover() { this.tone(2200, 0.03, { type: 'sine', gain: 0.025 }); }
  pop() { this.tone(500, 0.08, { type: 'sine', gain: 0.15, to: 1100 }); }
  whoosh() { this.noise(0.6, { freq: 300, to: 2400, gain: 0.12 }); }
  chime() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', gain: 0.09, delay: i * 0.07 }));
  }
  error() { this.tone(220, 0.18, { type: 'square', gain: 0.05, to: 160 }); }
  zap() {
    this.noise(0.25, { freq: 3000, q: 0.5, gain: 0.25, type: 'highpass' });
    this.tone(90, 0.2, { type: 'sawtooth', gain: 0.08 });
  }
  /** Short robotic chirps, Buddy's "voice" when no speech is available. */
  chirp() {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 700 + Math.random() * 900;
      this.tone(f, 0.07, { type: 'square', gain: 0.025, to: f * (Math.random() > 0.5 ? 1.5 : 0.7), delay: i * 0.08 });
    }
  }
}
