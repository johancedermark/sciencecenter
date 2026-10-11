/**
 * Gnistan API server.
 * - POST /api/realtime-token: mints a short-lived OpenAI Realtime client secret (the API key never reaches the browser).
 * - POST /api/tts: Buddy's everyday voice (text → cached MP3), see tts.ts.
 * - GET  /api/health
 * - In production, serves the built app from dist/ with an SPA fallback.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { buildInstructions, buildTools, type Lang, type PersonaRoom, type PersonaStation } from './buddyPersona';
import { registerTts, TTS_INFO } from './tts';

const MODEL = process.env.REALTIME_MODEL ?? 'gpt-realtime-2.1-mini';
const VOICE = process.env.REALTIME_VOICE ?? 'marin';
const PORT = Number(process.env.PORT ?? 8790);
const PROD = process.env.NODE_ENV === 'production';
const OPENAI = 'https://api.openai.com/v1/realtime/client_secrets';
const hasKey = () => !!process.env.OPENAI_API_KEY?.trim();

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, voice: hasKey(), model: MODEL, tts: hasKey() ? TTS_INFO : null }));

// ------------------------------------------------------------------ rate limit (per IP, sliding window)

const WINDOW_MS = 10 * 60_000;

/** Sliding-window limiter: returns 0 if allowed, else seconds to wait. */
function makeLimiter(max: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, list] of hits) if (list.every((t) => now - t >= WINDOW_MS)) hits.delete(ip);
  }, WINDOW_MS).unref();
  return (ip: string): number => {
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= max) {
      hits.set(ip, list);
      return Math.ceil((list[0] + WINDOW_MS - now) / 1000);
    }
    list.push(now);
    hits.set(ip, list);
    return 0;
  };
}

const rateLimited = makeLimiter(10);
// Uncached speech lines per IP per 10 min (cached lines are free).
const ttsLimited = makeLimiter(150);

function clientIp(c: Parameters<typeof getConnInfo>[0]): string {
  // Only trust X-Forwarded-For behind a known proxy (set TRUST_PROXY=1).
  if (process.env.TRUST_PROXY) {
    const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (xff) return xff;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}


// ------------------------------------------------------------------ input validation

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const clean = (s: string, max: number) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, max);

interface TokenRequest {
  lang: Lang;
  context: string;
  rooms: PersonaRoom[];
  stations: PersonaStation[];
}

function parseTokenRequest(body: unknown): TokenRequest | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Record<string, unknown>;
  if (b.lang !== 'sv' && b.lang !== 'en') return "lang must be 'sv' or 'en'";
  if (b.context !== undefined && typeof b.context !== 'string') return 'context must be a string';
  if (typeof b.context === 'string' && b.context.length > 4000) return 'context too long';
  const rooms: PersonaRoom[] = [];
  if (b.rooms !== undefined) {
    if (!Array.isArray(b.rooms) || b.rooms.length > 30) return 'rooms must be an array (max 30)';
    for (const r of b.rooms) {
      if (!r || typeof r.id !== 'string' || !ID.test(r.id) || typeof r.title !== 'string' || r.title.length > 120)
        return 'invalid room';
      rooms.push({ id: r.id, title: clean(r.title, 120) });
    }
  }
  const stations: PersonaStation[] = [];
  if (b.stations !== undefined) {
    if (!Array.isArray(b.stations) || b.stations.length > 200) return 'stations must be an array (max 200)';
    for (const s of b.stations) {
      if (
        !s || typeof s.id !== 'string' || !ID.test(s.id) || typeof s.room !== 'string' || !ID.test(s.room) ||
        typeof s.title !== 'string' || s.title.length > 120
      )
        return 'invalid station';
      stations.push({ id: s.id, room: s.room, title: clean(s.title, 120) });
    }
  }
  return { lang: b.lang, context: clean(b.context ?? '', 4000), rooms, stations };
}

// ------------------------------------------------------------------ token minting

/** Set to false once the API rejects `reasoning` for this model, so we stop sending it. */
let reasoningSupported = true;

function sessionConfig(req: TokenRequest, withReasoning: boolean) {
  return {
    type: 'realtime',
    model: MODEL,
    instructions: buildInstructions({ lang: req.lang, rooms: req.rooms, stations: req.stations, context: req.context }),
    output_modalities: ['audio'],
    ...(withReasoning ? { reasoning: { effort: 'low' } } : {}),
    audio: {
      input: {
        noise_reduction: { type: 'far_field' },
        // No language: the visitor may speak any language.
        transcription: { model: 'gpt-4o-transcribe' },
        turn_detection: { type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true },
      },
      output: { voice: VOICE },
    },
    tools: buildTools(req.rooms, req.stations),
    tool_choice: 'auto',
  };
}

async function mint(req: TokenRequest, withReasoning: boolean) {
  const res = await fetch(OPENAI, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: sessionConfig(req, withReasoning),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

app.post(
  '/api/realtime-token',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }),
  async (c) => {
    if (!hasKey()) return c.json({ error: 'no_key' }, 503);
    const wait = rateLimited(clientIp(c));
    if (wait) {
      c.header('Retry-After', String(wait));
      return c.json({ error: 'rate_limited', retry_after: wait }, 429);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', detail: 'invalid JSON' }, 400);
    }
    const req = parseTokenRequest(body);
    if (typeof req === 'string') return c.json({ error: 'bad_request', detail: req }, 400);

    try {
      let r = await mint(req, reasoningSupported);
      if (!r.ok && reasoningSupported && r.status === 400 && /reasoning/i.test(r.text)) {
        reasoningSupported = false;
        console.warn(`[realtime] ${MODEL} rejected "reasoning"; retrying without it. (${r.text.slice(0, 300)})`);
        r = await mint(req, false);
      }
      if (!r.ok) {
        console.error(`[realtime] client_secrets failed ${r.status}: ${r.text.slice(0, 500)}`);
        return c.json({ error: 'upstream', status: r.status }, 502);
      }
      const data = JSON.parse(r.text) as { value?: string; expires_at?: number; session?: { model?: string } };
      if (!data.value) return c.json({ error: 'upstream', detail: 'no client secret in response' }, 502);
      return c.json({ value: data.value, expires_at: data.expires_at, model: data.session?.model ?? MODEL });
    } catch (e) {
      console.error('[realtime] token request failed:', e);
      return c.json({ error: 'upstream' }, 502);
    }
  },
);

registerTts(app, { hasKey, clientIp: clientIp as (c: never) => string, limiter: ttsLimited });

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// ------------------------------------------------------------------ static app (production)

if (PROD) {
  const dist = resolve(import.meta.dirname, '../dist');
  const indexFile = resolve(dist, 'index.html');
  if (!existsSync(indexFile)) console.warn(`[server] ${indexFile} missing; run "npm run build" first.`);
  app.use('/*', serveStatic({ root: dist }));
  // SPA fallback
  app.get('*', (c) => (existsSync(indexFile) ? c.html(readFileSync(indexFile, 'utf8')) : c.text('Not built', 404)));
}

serve({ fetch: app.fetch, port: PORT });
console.log(
  `api on http://localhost:${PORT} (voice: ${hasKey() ? `on, ${MODEL}/${VOICE}` : 'off, no OPENAI_API_KEY'}${PROD ? ', serving dist/' : ''})`,
);
