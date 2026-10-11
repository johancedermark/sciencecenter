# Science Center: build plan

## Vision
A cozy, warmly lit 3D science center in the browser. You explore a round central atrium
(with a working Foucault pendulum) and six themed rooms, either by walking (WASD/mouse, touch joystick)
or by teleporting from a menu. Every station is a hands-on, scientifically correct experiment.
The robot **Buddy** (built from `Character/`) follows you, reacts with expressions and gestures,
and can be talked to in real time (Swedish by default, any language) through the OpenAI Realtime API.

## Tech decisions
- **Vite + TypeScript + Three.js** (vanilla, r186). Three.js has the largest ecosystem and runs in any
  browser; game engines (Babylon, Unity WebGL) add weight without a clear benefit for this scope.
- Post-processing: three/addons `EffectComposer` + `UnrealBloomPass` for the glowing, cozy look.
- Layout: 7 rooms around a round atrium (perception added after research).
- Collision: 2D circle-vs-segment against wall segments (rooms are flat, so no physics engine is needed).
- Experiments: custom, analytically or numerically correct simulations (no physics-engine fakery).
- Sound: WebAudio, synthesized (no asset files).
- **Server: Node + Hono** (`server/index.ts`). It mints ephemeral Realtime client secrets so the API key
  never reaches the browser. Vite proxies `/api` in dev.
- Voice: WebRTC to the Realtime API, with tool calls so Buddy can teleport you, point at experiments
  and change its expression. Lip sync comes from an AnalyserNode on the remote audio.
- Fallback without a key: Buddy speaks scripted lines with subtitles and browser speechSynthesis.
- UI: bilingual Swedish/English (`sv` default), HTML/CSS overlay.

## Shared contract (all builders code against this)
- `src/core/types.ts`: `RoomDef`, `RoomContext`, `RoomInstance`, `Station`, `L10n`
- `src/core/interaction.ts`: register meshes with hover/click/drag handlers
- `src/core/ui.ts`: info panel, toasts, subtitles
- `src/buddy/Buddy.ts`: `say()`, `emote()`, `gesture()`, `lookAt()`
- `src/core/sfx.ts`: synthesized sound helpers

## Checklist
- [x] Research: science-center themes and exhibit physics (`docs/research/science-content.md`)
- [x] Research: Realtime API (model id, client secrets, WebRTC, tools)
- [x] Scaffold: Vite/TS/Three, Hono server, scripts, .env.example
- [x] Core engine: renderer, bloom, loop, player controller (desktop + touch), collision, interaction
- [x] World: atrium hub + Foucault pendulum, corridors, 6 room shells, cozy lighting, signage
- [x] UI: start screen, room menu/teleport, station info panel, language toggle, help
- [x] Buddy: procedural 3D model true to the reference, face screen with expressions, animations
      (idle, walk, wave, point, think, celebrate, talk), follow behaviour
- [x] Buddy voice: server token endpoint, WebRTC client, tools, subtitles, lip sync, fallback
- [x] Room: Electricity & Energy (crank generator, magnet/coil, solar cell dissection, lemon battery, ...)
- [x] Room: Light & Optics
- [x] Room: Sound & Waves
- [x] Room: Forces & Motion
- [x] Room: Space
- [x] Room: Brain & Senses (added: research shows it in 9/10 centres)
- [x] Room: Chemistry
- [x] Atrium: Foucault pendulum, welcome desk, decor
- [x] Integration, perf pass (per-room visibility, draw calls), mobile check
- [x] Verify in a real browser: desktop and phone width, every station, the menu, Buddy
- [x] Docs: README (run, architecture, adding a room), commit and push to feature branch

## Review (2026-10-11)
**Delivered:** atrium + 7 themed rooms, 37 stations, procedural 3D Buddy, realtime voice with offline fallback,
bilingual sv/en UI, desktop + touch controls, deep links. ~29k lines TypeScript, 415 kB gzipped, no asset files.

**Verified**
- `tsc --noEmit` and `vite build` pass; the production server serves dist and the API (health, 503 no_key).
- Headless Chrome (GPU) tour: every station opens, is screenshotted, and its on-screen interactives get real
  mouse clicks/drags. No exceptions, 60 fps.
- Walking: atrium → corridor → door opens → room → blocked by exhibit colliders; walking back out works;
  map teleport, language switch, offline chat (teleport/open/explain), no-key toast.
- Phone (390×844, touch emulation): close-ups pulled back and shifted above the sheet; Ames keeps its peephole.
- Physics spot checks by builders with scripts (Foucault 12.94°/h, cycloid π√(R/g), Malus, Snell/BK7,
  Doppler, Lenz tube times, LJ, titration...) and by me (planet gravities).

**Not verified / open**
- Realtime voice verified with a key (headless Chrome, fake mic): token minting, WebRTC connect, Swedish
  greeting, typed question answered in Swedish, tool calls go_to_room and open_station, narration responses
  accepted (incl. tool_choice 'none'), clean stop. Fixed: the greeting was English because response-level
  instructions replace the session's. Still open: real microphone speech and how the Swedish voice sounds.
- Microphone input in the sound room (no mic headless). Audio was not listened to.
- Real touch devices (only emulated). Draw calls: some rooms ~150–180 incl. shell.

