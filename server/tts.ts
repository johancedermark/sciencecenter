/**
 * POST /api/tts — Buddy's everyday voice (when no realtime conversation is running).
 * Text → MP3 via OpenAI's speech endpoint, in the same voice as the realtime session.
 * Results are cached on disk by content hash, so scripted lines (greetings, station intros,
 * explanations) are generated once and then served for free.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const TTS_MODEL = process.env.TTS_MODEL ?? 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.TTS_VOICE ?? process.env.REALTIME_VOICE ?? 'marin';
const ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const CACHE_DIR = resolve(import.meta.dirname, '../.cache/tts');
const MAX_CHARS = 600;
// Bump when the style instructions change, so cached audio is regenerated.
const STYLE_VERSION = 1;

const STYLE: Record<'sv' | 'en', string> = {
  sv:
    'Du är Buddy, en vänlig, nyfiken och glad liten robotguide i ett vetenskapscenter för barn och vuxna. ' +
    'Tala naturlig, tydlig rikssvenska med varm och lekfull entusiasm, lagom tempo och levande intonation. ' +
    'Uttala siffror, enheter och vetenskapliga ord korrekt på svenska. Inte överdrivet, inte barnsligt.',
  en:
    'You are Buddy, a friendly, curious and cheerful little robot guide in a science center for kids and adults. ' +
    'Speak clear, natural English with warm, playful enthusiasm, a relaxed pace and lively intonation. ' +
    'Pronounce numbers, units and scientific words correctly. Not over the top, not childish.',
};

const memory = new Map<string, Buffer>();
const inflight = new Map<string, Promise<Buffer>>();

function cacheKey(text: string, lang: string) {
  return createHash('sha256').update(`${TTS_MODEL}|${TTS_VOICE}|${lang}|${STYLE_VERSION}|${text}`).digest('hex');
}

function readCache(key: string): Buffer | null {
  const hit = memory.get(key);
  if (hit) return hit;
  const file = resolve(CACHE_DIR, `${key}.mp3`);
  if (!existsSync(file)) return null;
  const buf = readFileSync(file);
  remember(key, buf);
  return buf;
}

function remember(key: string, buf: Buffer) {
  memory.set(key, buf);
  if (memory.size > 300) memory.delete(memory.keys().next().value!);
}

async function synthesize(text: string, lang: 'sv' | 'en'): Promise<Buffer> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, instructions: STYLE[lang], response_format: 'mp3' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`speech ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Cached or fresh audio; concurrent requests for the same line share one upstream call. */
async function getAudio(text: string, lang: 'sv' | 'en'): Promise<{ buf: Buffer; cached: boolean }> {
  const key = cacheKey(text, lang);
  const hit = readCache(key);
  if (hit) return { buf: hit, cached: true };
  let p = inflight.get(key);
  if (!p) {
    p = synthesize(text, lang)
      .then((buf) => {
        remember(key, buf);
        try {
          mkdirSync(CACHE_DIR, { recursive: true });
          writeFileSync(resolve(CACHE_DIR, `${key}.mp3`), buf);
        } catch (e) {
          console.warn('[tts] could not write cache', e);
        }
        return buf;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return { buf: await p, cached: false };
}

export function registerTts(
  app: Hono,
  opts: { hasKey: () => boolean; clientIp: (c: never) => string; limiter: (ip: string) => number },
) {
  app.post('/api/tts', bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }), async (c) => {
    if (!opts.hasKey()) return c.json({ error: 'no_key' }, 503);
    let body: { text?: unknown; lang?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    const lang = body.lang === 'en' ? 'en' : body.lang === 'sv' ? 'sv' : null;
    const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
    if (!lang || !text || text.length > MAX_CHARS) return c.json({ error: 'bad_request' }, 400);

    // Only uncached generations count against the rate limit.
    const key = cacheKey(text, lang);
    if (!readCache(key) && !inflight.has(key)) {
      const wait = opts.limiter(opts.clientIp(c as never));
      if (wait) {
        c.header('Retry-After', String(wait));
        return c.json({ error: 'rate_limited', retry_after: wait }, 429);
      }
    }
    try {
      const { buf, cached } = await getAudio(text, lang);
      return new Response(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'private, max-age=86400',
          'X-TTS-Cache': cached ? 'hit' : 'miss',
        },
      });
    } catch (e) {
      console.error('[tts] failed:', e);
      return c.json({ error: 'upstream' }, 502);
    }
  });
}

export const TTS_INFO = { model: TTS_MODEL, voice: TTS_VOICE };
