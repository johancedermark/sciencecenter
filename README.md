# ⚡ Gnistan: Buddy's science center

A cozy, warmly lit 3D science center in the browser. Walk around (or jump in through the map) into seven
themed rooms full of hands-on, scientifically correct experiments, with **Buddy**, a robot guide you can
talk to in Swedish (or any language) through the OpenAI Realtime API.

| Room | Stations |
|---|---|
| 🕰️ Atrium | Foucault's pendulum (real precession for Stockholm, 12.94°/h), welcome desk |
| ⚡ Electricity & Energy | Hand-crank generator, magnet and coil plus the Lenz tube, a solar cell taken apart layer by layer, lemon battery, human battery |
| 🌈 Light & Optics | Prism, coloured shadows, lens bench, polarisation, total internal reflection |
| 🎵 Sound & Waves | Chladni plate, standing waves, oscilloscope for your voice, Doppler, Rubens' tube |
| 🎢 Forces & Motion | Brachistochrone race, pendulum wave, Newton's cradle, loop the loop, lever |
| 🪐 Space | Orrery, your weight on other worlds, moon phases, gravity well, light-speed mail |
| 🧠 Brain & Senses | Reaction time, Ames room, afterimage flag, blind spot, illusions |
| 🧪 Chemistry Lab | Flame tests with a spectroscope, red-cabbage pH, particle box, elephant toothpaste, periodic table |

## Run it

```bash
npm install
cp .env.example .env      # add OPENAI_API_KEY to talk to Buddy (optional)
npm run dev               # web on http://localhost:5180, API on :8790
```

Without a key everything works; Buddy then speaks scripted lines with the browser's speech synthesis
and answers typed questions with a small offline guide.

Production: `npm run build && npm start` (the Hono server serves `dist/` and the API on `PORT`, default 8790).

### Controls
- **Desktop:** WASD or the arrow keys to walk, drag to look, click the floor to walk there, click and drag experiments,
  **E** to explore a station, **M** for the map, **Enter** to type to Buddy, **Esc** to go back.
- **Touch:** joystick bottom-left, drag to look, tap the floor to walk there, tap or drag experiments.
- **Deep links:** `?room=space`, `?station=foucault`, add `&go` to skip the start screen.

## Architecture

```
src/
  core/        engine (renderer and bloom), world (atrium, corridors, room shells, doors, light rig),
               player, interaction, ui, controlPanel, sfx (WebAudio synth), i18n (sv/en), layout, types (contract)
  rooms/<id>/  one folder per room; each exports a RoomDef (see docs/BUILDING_ROOMS.md)
  buddy/       procedural 3D model of Buddy, canvas face with expressions, procedural animation, follow behaviour
  voice/       WebRTC Realtime client, tool calls, subtitles, lip-sync level, offline fallback
server/        Hono: mints ephemeral Realtime client secrets (the API key never reaches the browser), serves dist/
docs/          research notes, room-building guide, voice notes
```

- **Three.js r186**, Vite 8 and TypeScript, with no asset files: every texture, model and sound is generated in code.
- Rooms are built in a room-local frame and registered through `RoomContext` (stations, colliders, light anchors).
- A fixed rig of six point lights moves to the current area, so shader light counts never change (no hitches).
  Rooms behind closed doors are hidden and not updated.
- The station panel builds HUD controls from a small widget kit, and every text is bilingual.

See `docs/BUILDING_ROOMS.md` to add a room and `docs/voice.md` for the voice setup.
