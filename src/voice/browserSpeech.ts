/**
 * Offline speech for Buddy: the browser's speechSynthesis with a friendly robot voice,
 * plus a simulated syllable envelope so Buddy's mouth moves while it talks.
 * Falls back to synthesized chirps when speechSynthesis (or a voice for the language) is missing.
 */
import type { Sfx } from '../core/sfx';

type Lang = 'sv' | 'en';

const NICE = /(natural|neural|premium|enhanced|siri|google|online|wavenet|alva|klara|oskar|samantha|daniel|serena|ava|aria|jenny)/i;

export class BrowserSpeech {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  private current: SpeechSynthesisUtterance | null = null;
  private speakingUntil = 0;
  private startedAt = 0;
  private pulse = 0;
  private lastT = 0;
  private lvl = 0;
  private endTimer = 0;
  /** Called when the current line finishes (or is cancelled). */
  onEnd: (() => void) | null = null;

  constructor(private sfx: Sfx) {
    if (this.synth) {
      this.loadVoices();
      this.synth.addEventListener?.('voiceschanged', () => this.loadVoices());
    }
  }

  private loadVoices() {
    try {
      this.voices = this.synth?.getVoices() ?? [];
    } catch {
      this.voices = [];
    }
  }

  /** Best voice for the language, or null if the browser has voices but none for it. Undefined = voices not loaded yet. */
  private pickVoice(lang: Lang): SpeechSynthesisVoice | null | undefined {
    if (!this.voices.length) this.loadVoices();
    if (!this.voices.length) return undefined;
    const matches = this.voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
    if (!matches.length) return null;
    const score = (v: SpeechSynthesisVoice) => {
      const l = v.lang.toLowerCase();
      let s = 0;
      if (NICE.test(v.name)) s += 4;
      if (lang === 'sv' && l.startsWith('sv-se')) s += 2;
      if (lang === 'en' && (l.startsWith('en-us') || l.startsWith('en-gb'))) s += 2;
      if (v.default) s += 1;
      if (/compact|eloquence|novelty|whisper|bad news|bells|zarvox|trinoids|albert|jester|bubbles|boing/i.test(v.name)) s -= 6;
      return s;
    };
    return matches.sort((a, b) => score(b) - score(a))[0];
  }

  get speaking() {
    return performance.now() < this.speakingUntil;
  }

  /** Speak a line, cancelling whatever was playing. */
  speak(text: string, lang: Lang) {
    this.cancel();
    const est = estimateMs(text);
    this.startedAt = performance.now();
    this.speakingUntil = this.startedAt + est;
    const voice = this.synth ? this.pickVoice(lang) : null;
    if (!this.synth || voice === null) {
      this.sfx.chirp();
      this.endTimer = window.setTimeout(() => this.finish(), est);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? (lang === 'sv' ? 'sv-SE' : 'en-US');
    if (voice) u.voice = voice;
    u.rate = 1.05;
    u.pitch = 1.25;
    u.volume = this.sfx.muted ? 0 : 1;
    u.onstart = () => {
      if (this.current !== u) return;
      this.startedAt = performance.now();
      this.speakingUntil = this.startedAt + est * 1.5 + 2000; // safety net if onend never fires
    };
    u.onboundary = () => {
      if (this.current === u) this.pulse = 1;
    };
    u.onend = u.onerror = () => {
      if (this.current === u) this.finish();
    };
    this.current = u;
    try {
      this.synth.speak(u);
    } catch {
      this.current = null;
      this.sfx.chirp();
      this.endTimer = window.setTimeout(() => this.finish(), est);
    }
  }

  cancel() {
    clearTimeout(this.endTimer);
    const had = this.current;
    this.current = null;
    this.speakingUntil = 0;
    if (had) {
      try {
        this.synth?.cancel();
      } catch { /* ignore */ }
    }
  }

  private finish() {
    clearTimeout(this.endTimer);
    this.current = null;
    this.speakingUntil = 0;
    this.onEnd?.();
  }

  /** Simulated mouth level 0..1 (call once per frame). */
  level(): number {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    this.pulse = Math.max(0, this.pulse - dt * 6);
    let target = 0;
    if (this.speaking) {
      const t = (now - this.startedAt) / 1000;
      // ~5 syllables per second, with slower phrase-level variation.
      const syll = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 4.8);
      const phrase = 0.6 + 0.4 * Math.sin(t * 2.1 + 1.3) * Math.sin(t * 0.7);
      target = Math.min(1, 0.15 + 0.55 * syll * phrase + 0.4 * this.pulse);
    }
    this.lvl += (target - this.lvl) * (target > this.lvl ? 0.6 : 0.25);
    return this.lvl;
  }
}

/** Rough speaking time for a line (ms). */
export function estimateMs(text: string) {
  return Math.max(1200, text.length * 62);
}
