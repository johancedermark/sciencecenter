#!/usr/bin/env node
/**
 * Generates Buddy's spoken "Explain" texts (Förklara-knappen) for every station, in Swedish and English.
 * The station's own texts (intro, how-to, science, wow) are rewritten into a short, simple explanation
 * that sounds good read aloud (no formulas or symbols), using only facts from the station text.
 *
 * Usage:
 *   1. In the dev app console (http://localhost:5180), run: copy(gnistan.exportStations())
 *      and save the clipboard to a file, e.g. /tmp/stations.json
 *   2. node --env-file=.env scripts/gen-explanations.mjs /tmp/stations.json
 *
 * Only stations whose source text changed are regenerated (hash stored per entry).
 * Output: src/content/explanations.json — review it before committing. Hand-edited entries are marked
 * "edited": true and are kept until their station text changes.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MODEL = process.env.EXPLAIN_MODEL ?? 'gpt-5.4-mini';
const OUT = resolve(import.meta.dirname, '../src/content/explanations.json');
const PROMPT_VERSION = 1;

const INSTRUCTIONS = {
  sv: `Du skriver det som roboten Buddy säger när en besökare trycker på "Förklara" vid en station i ett vetenskapscenter.
Texten läses upp av en röst. Målgrupp: nyfikna barn från cirka 8 år och vuxna.
- 4–6 korta meningar, högst 650 tecken totalt. Naturlig, varm, tydlig rikssvenska. Du-tilltal.
- Ordning: vad som händer här, varför det händer (den riktiga vetenskapen, enkelt men korrekt), ett vardagsexempel, och sist en liten utmaning att prova vid stationen.
- Inga formler, symboler, grekiska bokstäver, upphöjda tal, förkortningar, listor eller parenteser. Skriv det som det sägs: "watt", "grader", "ungefär tolv komma nio grader i timmen".
- Använd bara fakta som står i källtexten. Hitta inte på nya siffror eller påståenden. Hellre färre detaljer än fel.
- Börja inte med "Hej" och inte med stationens namn ordagrant. Svara bara med texten.`,
  en: `You write what the robot Buddy says when a visitor presses "Explain" at a station in a science center.
The text is read aloud by a voice. Audience: curious kids from about 8 and adults.
- 4–6 short sentences, at most 650 characters. Natural, warm, clear English. Address the visitor as "you".
- Order: what happens here, why it happens (the real science, simple but correct), an everyday example, and finally a tiny challenge to try at the station.
- No formulas, symbols, Greek letters, superscripts, abbreviations, lists or parentheses. Write it as it is spoken: "watts", "degrees", "about twelve point nine degrees an hour".
- Use only facts from the source text. Don't invent numbers or claims. Fewer details are better than wrong ones.
- Don't start with "Hi" or with the station name verbatim. Reply with the text only.`,
};

const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error('Usage: node --env-file=.env scripts/gen-explanations.mjs <stations.json>');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY missing (run with --env-file=.env)');
  process.exit(1);
}

const stations = JSON.parse(readFileSync(input, 'utf8'));
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

function source(s, lang) {
  const parts = [`Station: ${s.title[lang]}`, `Intro: ${s.intro[lang]}`, `Gör så här / How to: ${s.howTo[lang]}`, `Vetenskapen / Science: ${s.science[lang]}`];
  if (s.wow) parts.push(`Wow: ${s.wow[lang]}`);
  return parts.join('\n');
}

async function generate(src, lang) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, reasoning: { effort: 'low' }, instructions: INSTRUCTIONS[lang], input: src }),
    });
    const d = await res.json();
    if (!res.ok) {
      console.warn(`  ${res.status} ${JSON.stringify(d.error ?? d).slice(0, 200)}; retrying`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const text = d.output?.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text).join('').trim();
    if (text) return text.replace(/\s+/g, ' ');
  }
  throw new Error('generation failed');
}

let changed = 0;
const queue = [];
for (const s of stations) {
  for (const lang of ['sv', 'en']) {
    const src = source(s, lang);
    const hash = createHash('sha256').update(`${MODEL}|${PROMPT_VERSION}|${src}`).digest('hex').slice(0, 16);
    if (out[s.id]?.[lang]?.hash === hash) continue;
    if (out[s.id]?.[lang]?.edited) console.warn(`  note: ${s.id} [${lang}] was hand-edited; its source changed, so it will be regenerated. Review it again.`);
    queue.push({ s, lang, src, hash });
  }
}
console.log(`${queue.length} explanation(s) to generate with ${MODEL}`);
// A few at a time.
for (let i = 0; i < queue.length; i += 6) {
  await Promise.all(
    queue.slice(i, i + 6).map(async ({ s, lang, src, hash }) => {
      const text = await generate(src, lang);
      out[s.id] = { ...(out[s.id] ?? {}), [lang]: { text, hash } };
      changed++;
      console.log(`  ${s.id} [${lang}] ${text.length} chars`);
    }),
  );
}
// Stable order, drop stations that no longer exist.
const ids = new Set(stations.map((s) => s.id));
const sorted = Object.fromEntries(stations.map((s) => s.id).filter((id) => out[id]).map((id) => [id, out[id]]));
for (const id of Object.keys(out)) if (!ids.has(id)) console.log(`  removed ${id}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`done: ${changed} generated, written to ${OUT}`);
