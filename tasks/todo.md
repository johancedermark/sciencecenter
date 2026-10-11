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
- [ ] Research: science-center themes and exhibit physics (`docs/research/science-content.md`)
- [ ] Research: Realtime API (model id, client secrets, WebRTC, tools)
- [ ] Scaffold: Vite/TS/Three, Hono server, scripts, .env.example
- [ ] Core engine: renderer, bloom, loop, player controller (desktop + touch), collision, interaction
- [ ] World: atrium hub + Foucault pendulum, corridors, 6 room shells, cozy lighting, signage
- [ ] UI: start screen, room menu/teleport, station info panel, language toggle, help
- [ ] Buddy: procedural 3D model true to the reference, face screen with expressions, animations
      (idle, walk, wave, point, think, celebrate, talk), follow behaviour
- [ ] Buddy voice: server token endpoint, WebRTC client, tools, subtitles, lip sync, fallback
- [ ] Room: Electricity & Energy (crank generator, magnet/coil, solar cell dissection, lemon battery, ...)
- [ ] Room: Light & Optics
- [ ] Room: Sound & Waves
- [ ] Room: Forces & Motion
- [ ] Room: Space
- [ ] Room: Chemistry
- [ ] Integration, perf pass (per-room visibility, draw calls), mobile check
- [ ] Verify in a real browser: desktop and phone width, every station, the menu, Buddy
- [ ] Docs: README (run, architecture, adding a room), commit and push to feature branch

## Review
(filled in at the end)
