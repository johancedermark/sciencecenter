/**
 * Offline Buddy: a small rule-based responder for typed messages when there is no realtime session.
 * Matches keywords against the room and station titles the app reports at runtime.
 */
import type { AreaId } from '../core/types';
import type { VoiceHost } from './types';

type Lang = 'sv' | 'en';
type Target = { kind: 'room'; id: string; title: string } | { kind: 'station'; id: string; title: string };

export interface OfflineReply {
  text: string;
  lang: Lang;
  /** Runs after the reply is spoken/shown (navigation). */
  action?: () => Promise<unknown> | unknown;
}

/** Other-language words for the rooms, so "take me to space" works with Swedish titles and vice versa. */
const ROOM_SYNONYMS: Record<string, string[]> = {
  atrium: ['atrium', 'atriet', 'entre', 'entren', 'hallen', 'start', 'borjan', 'pendel', 'pendeln', 'pendulum', 'lobby', 'hall'],
  electricity: ['electricity', 'elektricitet', 'el', 'strom', 'ström', 'magnet', 'magnetism', 'electric'],
  light: ['light', 'ljus', 'ljuset', 'optik', 'optics', 'farg', 'färg', 'colour', 'color'],
  sound: ['sound', 'ljud', 'ljudet', 'musik', 'music', 'vagor', 'waves'],
  motion: ['motion', 'rorelse', 'rörelse', 'mekanik', 'mechanics', 'kraft', 'krafter', 'forces'],
  space: ['space', 'rymd', 'rymden', 'planet', 'planeter', 'planets', 'stjarnor', 'stars', 'universe', 'universum'],
  perception: ['perception', 'sinnen', 'sinnena', 'senses', 'illusion', 'illusioner', 'illusions', 'hjarnan', 'brain'],
  chemistry: ['chemistry', 'kemi', 'kemin', 'kemilabbet', 'lab', 'labbet'],
};

const STOP = new Set([
  'the', 'and', 'with', 'från', 'fran', 'och', 'med', 'för', 'for', 'till', 'den', 'det', 'ett', 'en', 'av', 'på', 'pa',
  'room', 'rummet', 'station', 'how', 'what', 'mig', 'oss', 'take', 'show', 'visa', 'din', 'ditt',
]);

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

function detectLang(text: string, fallback: Lang): Lang {
  const s = text.toLowerCase();
  if (/[åäö]/.test(s)) return 'sv';
  const w = s.split(/[^a-zåäö]+/);
  const sv = w.filter((x) => ['jag', 'du', 'vad', 'hur', 'ta', 'mig', 'till', 'visa', 'är', 'det', 'hej', 'och', 'kan', 'varför', 'detta'].includes(x)).length;
  const en = w.filter((x) => ['i', 'you', 'what', 'how', 'take', 'me', 'to', 'show', 'is', 'the', 'hello', 'hi', 'and', 'can', 'why', 'this'].includes(x)).length;
  if (sv > en) return 'sv';
  if (en > sv) return 'en';
  return fallback;
}

/** How well one key matches the input words: 3 exact, 2 prefix (Swedish compounds/definite forms), else 0. */
function keyScore(input: string[], k: string): number {
  let best = 0;
  for (const w of input) {
    if (w === k) return 3;
    if (k.length >= 4 && w.length >= 4 && (w.startsWith(k.slice(0, Math.max(4, k.length - 2))) || k.startsWith(w.slice(0, Math.max(4, w.length - 2))))) best = 2;
  }
  return best;
}

/** Title words add up; synonyms (other-language room names) only count once, as the best one. */
function titleScore(input: string[], title: string, synonyms: string[] = []): number {
  const keys = new Set(words(title).filter((w) => w.length >= 3 && !STOP.has(w)));
  let score = 0;
  for (const k of keys) score += keyScore(input, k);
  const syn = Math.max(0, ...synonyms.map((x) => keyScore(input, fold(x))));
  return Math.max(score, syn);
}

function bestTarget(host: VoiceHost, input: string[], prefer: 'room' | 'station'): Target | null {
  const rooms = host.rooms().map((r) => ({ kind: 'room' as const, id: r.id, title: r.title, s: titleScore(input, r.title, ROOM_SYNONYMS[r.id] ?? []) }));
  const stations = host.stations().map((s) => ({ kind: 'station' as const, id: s.id, title: s.title, s: titleScore(input, s.title) }));
  const rank = (a: { s: number }, b: { s: number }) => b.s - a.s;
  const r = rooms.sort(rank)[0];
  const st = stations.sort(rank)[0];
  const bestR = r && r.s > 0 ? r : null;
  const bestS = st && st.s > 0 ? st : null;
  if (bestR && bestS) {
    if (bestR.s === bestS.s) return prefer === 'room' ? bestR : bestS;
    return bestR.s > bestS.s ? bestR : bestS;
  }
  return bestR ?? bestS;
}

/** First sentences of the focused station text, skipping its title. */
function explainFocused(host: VoiceHost): string | null {
  const science = host.focusedStationScience?.();
  const text = science ?? host.focusedStationText();
  if (!text) return null;
  const sentences = text.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) ?? [text];
  const body = science ? sentences : sentences.slice(1);
  let out = '';
  for (const s of body) {
    if (out && out.length + s.length > 260) break;
    out += (out ? ' ' : '') + s;
  }
  return out || text.slice(0, 260);
}

export function offlineReply(host: VoiceHost, raw: string): OfflineReply {
  const lang = detectLang(raw, host.lang());
  const sv = lang === 'sv';
  const s = fold(raw);
  const input = words(raw);
  const T = (svText: string, enText: string) => (sv ? svText : enText);

  const wantsGo = /\b(ta mig|ta oss|ga till|gå till|aka till|teleportera|vi gar|lets go|let's go|take me|take us|go to|bring me|bring us|get me to|travel to)\b/.test(s);
  const wantsShow = /\b(visa|oppna|öppna|testa|prova|show|open|try|see)\b/.test(s);
  const wantsWhat = /(vad ar (det|detta|den har|det har)|vad hander|forklara|hur (funkar|fungerar)|varfor|what is (this|that|it)|what's (this|that)|explain|how does|why)/.test(s);
  const wantsBack = /\b(stang|tillbaka|sluta|close|back|exit|stop)\b/.test(s);

  if (wantsBack && host.focusedStationText()) {
    return { lang, text: T('Okej, vi tar ett steg tillbaka!', "Okay, let's step back!"), action: () => host.closeStation() };
  }

  if (wantsGo || wantsShow) {
    const target = bestTarget(host, input, wantsGo && !wantsShow ? 'room' : 'station');
    if (target?.kind === 'room') {
      return { lang, text: T(`Kom, vi går till ${target.title}!`, `Come on, let's go to ${target.title}!`), action: () => host.goTo(target.id as AreaId) };
    }
    if (target?.kind === 'station') {
      return { lang, text: T(`Japp! Här är ${target.title}.`, `Sure! Here's ${target.title}.`), action: () => host.openStation(target.id) };
    }
  }

  if (wantsWhat) {
    const ex = explainFocused(host);
    if (ex) return { lang, text: ex };
  }

  if (/^(hej|hejsan|hallå|halla|tjena|tja|hello|hi|hey|god (morgon|dag))\b/.test(s)) {
    return { lang, text: T('Hej hej! Vart vill du gå? Säg till exempel "ta mig till rymden".', 'Hi there! Where do you want to go? Try "take me to space".') };
  }
  if (/\b(tack|thanks|thank you)\b/.test(s)) {
    return { lang, text: T('Varsågod! Säg till om du vill se något mer.', "You're welcome! Tell me if you want to see more.") };
  }

  // A bare room or station name: just go there.
  const bare = bestTarget(host, input, 'station');
  if (bare && (bare.kind === 'room' || titleScore(input, bare.title) >= 3)) {
    return bare.kind === 'room'
      ? { lang, text: T(`${bare.title}? Kom, vi går dit!`, `${bare.title}? Come on, let's go!`), action: () => host.goTo(bare.id as AreaId) }
      : { lang, text: T(`Japp! Här är ${bare.title}.`, `Sure! Here's ${bare.title}.`), action: () => host.openStation(bare.id) };
  }

  if (wantsWhat) {
    return { lang, text: T('Gå fram till en station och öppna den, så berättar jag vad som händer!', "Walk up to a station and open it, and I'll tell you what's going on!") };
  }

  const here = host.stations().slice(0, 40);
  const ctx = host.describeContext();
  const local = here.filter((st) => ctx.includes(`${st.id}:`)).slice(0, 2).map((st) => st.title);
  const suggestion = local.length
    ? T(`Testa "visa ${local[0]}"`, `Try "show ${local[0]}"`)
    : T('Testa "ta mig till rymden"', 'Try "take me to space"');
  return {
    lang,
    text: T(
      `Hmm, utan röstläget kan jag inte svara på allt. Men jag kan visa dig runt! ${suggestion}, eller fråga "vad är detta?" vid en station.`,
      `Hmm, without voice mode I can't answer everything. But I can show you around! ${suggestion}, or ask "what is this?" at a station.`,
    ),
  };
}
