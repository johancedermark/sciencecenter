/** TEMPORARY minimal server: replaced by the realtime token server. */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
app.get('/api/health', (c) => c.json({ ok: true, voice: !!process.env.OPENAI_API_KEY }));
const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port });
console.log(`api on http://localhost:${port}`);
