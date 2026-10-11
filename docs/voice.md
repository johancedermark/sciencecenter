# Buddy's voice

## Configure
1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. Optional: `REALTIME_MODEL` (default `gpt-realtime-2.1-mini`) and `REALTIME_VOICE` (default `marin`).
2. `npm run dev`. `GET /api/health` returns `{ ok, voice, model }`. `voice: true` means a key is configured.

Without a key, everything still works offline: Buddy narrates with the browser's `speechSynthesis` (falling back to chirps if there's no voice for the language), and typed messages get rule-based replies (`src/voice/offline.ts`). These handle "ta mig till / take me to …", "visa / show …", "vad är detta / what is this" and greetings.

## Architecture
```
browser (src/voice/BuddyVoice.ts)            server (server/index.ts)              OpenAI
 Talk ─► POST /api/realtime-token {lang, context, rooms, stations}
                                   ─► POST /v1/realtime/client_secrets (key, session config) ─►
                                   ◄─ { value: ek_…, expires_at, model }
 getUserMedia ─► RTCPeerConnection + data channel "oai-events"
 SDP offer ─► POST /v1/realtime/calls (Bearer ek_…) ─► answer SDP; audio both ways over WebRTC
```
- **Session** (minted on the server): semantic VAD, far-field noise reduction, `gpt-4o-transcribe` input transcription (language unset), audio output, `reasoning: {effort: 'low'}`. If the model rejects `reasoning`, the server retries without it and logs a warning.
- **Persona** (`server/buddyPersona.ts`, shared with the client): Buddy's instructions, the room/station lists and the tool definitions. When the context changes, the client sends `session.update` (debounced 600 ms) with `type: 'realtime'` and refreshed instructions that include `describeContext()` and the focused station's text.
- **Audio out** plays through a hidden `<audio>` element. Chrome needs this for remote WebRTC audio. The same stream feeds an `AnalyserNode` that drives `level()` (Buddy's mouth). The mute button mutes the element.
- **Subtitles/status**: Buddy's transcript is streamed into the subtitle, and the visitor's transcript is shown as "Du". The talk button shows listening, thinking or speaking.
- **Narration** (`buddy.say` → `narrate`): when the session is live, Buddy speaks it as an out-of-band response (`conversation: 'none'`), so scripted lines don't pollute the conversation. Lines are skipped while the visitor or Buddy is talking, or right after a tool action.
- **Server safety**: 10 tokens per IP per 10 minutes, a 64 KB body limit, validated ids and lengths. In production (`npm run build && npm start`), the server also serves `dist/` with an SPA fallback.

## Tools
| Tool | Args | Effect |
|---|---|---|
| `go_to_room` | `room_id` (enum incl. `atrium`) | teleports the visitor |
| `open_station` | `station_id` (enum) | moves to the room if needed and opens the station; returns its text |
| `close_station` | none | closes the station |
| `set_mood` | `expression`, `gesture?` | `buddy.emote` / `buddy.gesture` |
| `get_context` | none | current context, focused station text, rooms, stations |

The client sends room and station ids in the token request, so the enums always match the built world.

## Privacy
In voice mode, the visitor's microphone audio and Buddy's conversation are sent to OpenAI for processing (speech recognition, the model and speech output). Nothing is stored by this server, and the API key never leaves the server. Buddy is instructed not to ask for personal data. Without a key, nothing leaves the browser except the token request that returns `no_key`.


## Everyday voice (no conversation running)

Scripted lines (greetings, station intros, the **Förklara/Explain** button) are spoken with OpenAI
text-to-speech through `POST /api/tts` (`server/tts.ts`): `gpt-4o-mini-tts`, voice `marin` (the same as
the realtime voice), with style instructions for a warm, playful robot in natural Swedish or English.

- The client (`src/voice/cloudSpeech.ts`) splits text into sentence clips, plays them back to back while
  prefetching the next one, shows each clip as a subtitle and drives Buddy's mouth from the real audio.
- Audio is cached on disk in `.cache/tts/` (gitignored) by a hash of model, voice, language, style version
  and text, so each scripted line is generated once. Only uncached lines count against the per-IP rate limit.
- Without a key, or if a request fails, Buddy falls back to the browser's speechSynthesis.

## The Explain button

Each station panel has a **Förklara** button (shortcut **X**). Buddy then explains the station:
- in a live conversation, the realtime model explains it in its own words (so follow-up questions work);
- otherwise Buddy reads a short spoken explanation from `src/content/explanations.json`.

Those texts are generated from the station texts by `scripts/gen-explanations.mjs` (default model
`gpt-5.4-mini`) and then reviewed by hand (corrected entries are marked `"edited": true`). After adding
or changing a station: run `copy(gnistan.exportStations())` in the dev console, save it to a file, run
`node --env-file=.env scripts/gen-explanations.mjs <file>`, and review the diff.
