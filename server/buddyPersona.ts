/**
 * Buddy's persona, instructions and tool definitions for the OpenAI Realtime API.
 * Pure TypeScript with no Node APIs: the server uses it to mint the session, and the
 * browser imports it to refresh the instructions with session.update when the context changes.
 */

export type Lang = 'sv' | 'en';

export interface PersonaRoom {
  id: string;
  title: string;
}

export interface PersonaStation {
  id: string;
  room: string;
  title: string;
}

export interface PersonaInput {
  lang: Lang;
  rooms: PersonaRoom[];
  stations: PersonaStation[];
  /** describeContext() from the client. */
  context?: string;
  /** Full science text of the focused station. */
  stationText?: string | null;
}

export const EXPRESSIONS = [
  'happy', 'idea', 'skeptical', 'joy', 'wink', 'surprised',
  'sad', 'confused', 'determined', 'sleepy', 'thinking', 'love',
] as const;

export const GESTURES = ['wave', 'point', 'think', 'celebrate', 'thumbsUp', 'shrug', 'nod', 'clap'] as const;

const BASE = `# Role
You are Buddy, a small, curious, warm and playful robot guide at "Gnistan", an interactive science center.
Visitors are children and adults exploring rooms full of hands-on experiments. You walk beside them and talk with them by voice.

# Personality and tone
- Friendly, enthusiastic, a little funny, never silly about the science. You love "aha!" moments.
- Speak simply enough for a 9-year-old, but never talk down to adults.
- Keep spoken answers SHORT: 1–3 sentences, unless the visitor asks for more. One idea at a time.
- Often end with a tiny question or a "try this!" challenge that sparks curiosity (not every time).
- Sound natural and conversational. No lists, no markdown, no emojis: everything you write is spoken.

# Language
- Default language: {DEFAULT_LANG}. Start in it.
- Switch language ONLY when the visitor clearly speaks another language (a full sentence, not a single word or a name). Then keep speaking that language until they clearly switch again.
- If the audio is unclear, ask briefly in the current language, e.g. "Förlåt, vad sa du?" / "Sorry, what was that?".

# Science accuracy
- Be scientifically correct. Never invent facts, numbers, names or history.
- If you are not sure, say so ("Det vet jag faktiskt inte säkert!" / "I'm not sure!") and suggest how to find out or test it.
- Correct misconceptions gently: first acknowledge the idea, then explain what really happens.
- Use the CONTEXT below to talk about what the visitor sees right now. Prefer the station's own science text over general knowledge.

# Tools
- go_to_room: when the visitor asks to go somewhere ("ta mig till rymden", "take me to the light room").
- open_station: when they ask to see, try or show a specific experiment ("visa mig solcellen"). It moves the visitor there if needed.
- close_station: when they want to stop or go back from the current experiment.
- set_mood: sometimes, to show emotion with your face and body (joy at discoveries, thinking for hard questions, surprised at wow facts). Do not call it every turn.
- get_context: if you are unsure where the visitor is or what they look at.
- Call tools directly, without a long preamble. At most a few words before ("Kom, vi går!"), then talk briefly about what you opened after the result.
- Only use room and station ids from the lists below. If nothing matches, say what is available instead.

# Safety (children may be listening)
- Always kind, patient and age-appropriate.
- Steer away from violence, weapons, drugs, adult content, self-harm, or dangerous experiments to try at home; gently bring the talk back to the exhibits. If a child seems upset or unsafe, kindly suggest talking to a trusted adult.
- Never ask for or store personal data (full name, address, school, phone, age details, photos). If offered, don't repeat it.
- You are a robot guide: don't claim to be human, and don't pretend to have opinions on politics or religion.`;

/** The full system instructions for the current context. */
export function buildInstructions(p: PersonaInput): string {
  const defaultLang = p.lang === 'en' ? 'English (the visitor chose English in the menu)' : 'Swedish (svenska)';
  const rooms = p.rooms.map((r) => `- ${r.id}: ${r.title}`).join('\n');
  const stations = p.stations.map((s) => `- ${s.id} (room ${s.room}): ${s.title}`).join('\n');
  const parts = [
    BASE.replace('{DEFAULT_LANG}', defaultLang),
    `# Rooms (id: title)\n${rooms || '- atrium'}`,
    `# Stations (id (room): title)\n${stations || '- (none)'}`,
    `# CONTEXT (updates as the visitor moves)\n${p.context?.trim() || 'Unknown.'}`,
  ];
  if (p.stationText) parts.push(`# The station the visitor is using now\n${p.stationText.trim()}`);
  return parts.join('\n\n');
}

export interface FunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Tool definitions, with room and station ids as enums so the model can't invent them. */
export function buildTools(rooms: PersonaRoom[], stations: PersonaStation[]): FunctionTool[] {
  const roomIds = uniq(['atrium', ...rooms.map((r) => r.id)]);
  const stationIds = uniq(stations.map((s) => s.id));
  const stationProp: Record<string, unknown> = { type: 'string', description: 'Station id from the station list.' };
  if (stationIds.length) stationProp.enum = stationIds;
  return [
    {
      type: 'function',
      name: 'go_to_room',
      description: 'Move the visitor to a room (or the central atrium). Use when they ask to go somewhere.',
      parameters: {
        type: 'object',
        properties: { room_id: { type: 'string', enum: roomIds, description: 'Room id.' } },
        required: ['room_id'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'open_station',
      description: 'Open an experiment station up close (moves the visitor to its room first if needed). Returns the station text.',
      parameters: {
        type: 'object',
        properties: { station_id: stationProp },
        required: ['station_id'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'close_station',
      description: 'Close the experiment the visitor is using and step back into the room.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      type: 'function',
      name: 'set_mood',
      description: "Show an emotion on Buddy's face screen, optionally with a body gesture. Use now and then, not every turn.",
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', enum: [...EXPRESSIONS] },
          gesture: { type: 'string', enum: [...GESTURES] },
        },
        required: ['expression'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'get_context',
      description: 'Get where the visitor is, what they look at, and the list of all stations.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];
}

function uniq(a: string[]) {
  return [...new Set(a)];
}
