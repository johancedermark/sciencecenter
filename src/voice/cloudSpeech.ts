/**
 * Buddy's everyday voice: lines are spoken with OpenAI text-to-speech through our server (/api/tts),
 * in the same voice as the realtime conversation. Long texts are split into sentence-sized clips that
 * play back to back while the next one is fetched, so speech starts quickly and subtitles follow along.
 * The mouth level comes from an analyser on the real audio. Falls back to browser speech when the
 * server has no key or a request fails.
 */
import type { Sfx } from '../core/sfx';
import { BrowserSpeech } from './browserSpeech';

type Lang = 'sv' | 'en';

const MAX_CLIP = 260;
const CLIP_CACHE = 80;

export class CloudSpeech {
  /** Called when the whole line finishes or is cancelled. */
  onEnd: (() => void) | null = null;
  /** Called when a new clip (sentence group) starts, with its text — for synced subtitles. */
  onClip: ((text: string) => void) | null = null;

  private fallback: BrowserSpeech;
  /** null = unknown yet, false = no server voice (no key / errors), true = works. */
  private available: boolean | null = null;
  private audio = new Audio();
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private clips = new Map<string, Promise<string>>();
  private gen = 0;
  private playing = false;
  private usingFallback = false;
  private lvl = 0;

  constructor(private sfx: Sfx) {
    this.fallback = new BrowserSpeech(sfx);
    this.fallback.onEnd = () => {
      if (this.usingFallback) this.finish();
    };
    this.audio.preload = 'auto';
    void fetch('/api/health')
      .then((r) => r.json())
      .then((h: { tts?: unknown }) => {
        if (this.available === null) this.available = !!h.tts;
      })
      .catch(() => {
        if (this.available === null) this.available = false;
      });
  }

  get speaking() {
    return this.playing || (this.usingFallback && this.fallback.speaking);
  }

  /** Route the audio element through WebAudio once (for mute + mouth level). Needs a running context. */
  private ensureGraph() {
    if (this.analyser) return;
    try {
      const ctx = this.sfx.ctx;
      const src = ctx.createMediaElementSource(this.audio);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(this.analyser.fftSize);
      src.connect(this.analyser);
      this.analyser.connect(this.sfx.out);
    } catch (e) {
      console.warn('[speech] could not route audio through WebAudio', e);
    }
  }

  /** Warm the cache for a line (e.g. a station explanation) so it starts instantly later. */
  preload(text: string, lang: Lang) {
    if (this.available !== true) return;
    for (const c of splitClips(text)) void this.clip(c, lang).catch(() => undefined);
  }

  speak(text: string, lang: Lang) {
    this.cancel();
    const gen = ++this.gen;
    if (this.available === false) return this.speakFallback(text, lang);
    const parts = splitClips(text);
    if (!parts.length) return this.finish();
    this.ensureGraph();
    this.sfx.resume();
    this.playing = true;
    void this.playFrom(parts, 0, lang, gen);
  }

  private async playFrom(parts: string[], i: number, lang: Lang, gen: number) {
    if (gen !== this.gen) return;
    if (i >= parts.length) return this.finish();
    let url: string;
    try {
      url = await this.clip(parts[i], lang);
    } catch (e) {
      if (gen !== this.gen) return;
      console.warn('[speech] cloud voice failed, using browser speech', e);
      return this.speakFallback(parts.slice(i).join(' '), lang);
    }
    if (gen !== this.gen) return;
    if (i + 1 < parts.length) void this.clip(parts[i + 1], lang).catch(() => undefined);
    this.onClip?.(parts[i]);
    this.audio.src = url;
    this.audio.onended = () => void this.playFrom(parts, i + 1, lang, gen);
    this.audio.onerror = () => void this.playFrom(parts, i + 1, lang, gen);
    try {
      await this.audio.play();
    } catch (e) {
      if (gen !== this.gen) return;
      // Autoplay blocked or decode error: say the rest with browser speech instead of going silent.
      console.warn('[speech] playback failed', e);
      this.speakFallback(parts.slice(i).join(' '), lang);
    }
  }

  private clip(text: string, lang: Lang): Promise<string> {
    const key = `${lang}|${text}`;
    let p = this.clips.get(key);
    if (!p) {
      p = fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      }).then(async (r) => {
        if (r.status === 503) this.available = false;
        if (!r.ok) throw new Error(`tts ${r.status}`);
        this.available = true;
        return URL.createObjectURL(await r.blob());
      });
      p.catch(() => this.clips.delete(key));
      this.clips.set(key, p);
      if (this.clips.size > CLIP_CACHE) {
        const [oldKey, oldP] = this.clips.entries().next().value!;
        this.clips.delete(oldKey);
        void oldP.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
      }
    }
    return p;
  }

  private speakFallback(text: string, lang: Lang) {
    this.playing = false;
    this.usingFallback = true;
    this.onClip?.(text);
    this.fallback.speak(text, lang);
  }

  cancel() {
    this.gen++;
    this.playing = false;
    this.audio.onended = null;
    this.audio.onerror = null;
    try {
      this.audio.pause();
    } catch { /* ignore */ }
    if (this.usingFallback) {
      this.usingFallback = false;
      this.fallback.cancel();
    }
  }

  private finish() {
    this.playing = false;
    this.usingFallback = false;
    this.onEnd?.();
  }

  /** Mouth level 0..1 (call once per frame). */
  level(): number {
    if (this.usingFallback) return this.fallback.level();
    let target = 0;
    if (this.playing && this.analyser && this.buf && !this.audio.paused) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      target = Math.min(1, Math.sqrt(sum / this.buf.length) * 5);
    }
    this.lvl += (target - this.lvl) * (target > this.lvl ? 0.5 : 0.15);
    return this.lvl;
  }
}

/**
 * Split text into sentence groups of at most MAX_CLIP characters. The first clip is kept to one
 * sentence so speech starts as soon as possible.
 */
export function splitClips(text: string): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+(?:[.!?…]+["”')\]]*|$)\s*/g) ?? [];
  const out: string[] = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > MAX_CLIP) {
      if (cur) out.push(cur);
      cur = '';
      // Very long sentence: break at commas/spaces.
      let rest = s;
      while (rest.length > MAX_CLIP) {
        let cut = rest.lastIndexOf(', ', MAX_CLIP);
        if (cut < MAX_CLIP / 2) cut = rest.lastIndexOf(' ', MAX_CLIP);
        if (cut <= 0) cut = MAX_CLIP;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      if (rest) out.push(rest);
      continue;
    }
    if (!out.length && !cur) {
      out.push(s); // first clip: one sentence for a fast start
      continue;
    }
    if (cur && cur.length + 1 + s.length > MAX_CLIP) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}
