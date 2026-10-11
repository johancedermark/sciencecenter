# Building a room (contract and quality bar)

Gnistan is a cozy, warmly lit 3D science center for kids **and** adults. Every station is a
hands-on experiment that is **scientifically correct**, gives **immediate feedback**, and has
**more than one outcome** to explore (Exploratorium's "Active Prolonged Engagement").
Research with numbers and sources: `docs/research/science-content.md`.

## Files and ownership
- A room lives in `src/rooms/<id>/` and exports `<id>Room: RoomDef` from `index.ts`
  (the atrium exports `atrium` from `src/rooms/atrium/index.ts`). Split stations into files,
  e.g. `src/rooms/electricity/generator.ts`.
- **Only edit files in your own room folder.** Do not change `src/core/**`, other rooms, Buddy or voice.
  If you need a core change, describe it in your final report and work around it locally.
- Do not run git and do not start dev servers (one already runs at http://localhost:5180 with HMR).
- `npx tsc --noEmit` must pass for the whole project when you finish.

## Read first
`src/core/types.ts` (contract), `src/core/controlPanel.ts` (HUD widgets),
`src/core/interaction.ts` (hover/click/drag on meshes), `src/core/sfx.ts` (synth sounds),
`src/core/textures.ts` (canvas textures, `textTexture`, `drawText`), `src/core/i18n.ts` (`t`, `L`, `onLangChange`, `getLang`),
`src/core/layout.ts`, and `src/rooms/placeholder.ts` (a minimal example).

## Room frame
- Origin = centre of the floor, +Y up. Room is **20 m wide (x: −10…10), 18 m deep (z: −9…9), 6 m high**.
- The entrance door is in the wall at **z = +9, x ∈ [−1.6, 1.6]**. Visitors arrive at about (0, 6.8) looking towards −z.
  **Keep x ∈ [−2.5, 2.5], z > 4.5 free** (the entrance walkway).
- The world already builds: wood floor, a tinted rug (x ±7, z ±6), plaster walls with dark wood wainscot to 0.9 m
  and an accent LED strip, ceiling with beams at z = 0, ±3.6, ±7.2 (y ≈ 5.7), four pendant lamps at (±5, ±4)
  hanging to y ≈ 4.5, and a neon room title on the back wall (y ≈ 4.9). Don't put tall things under the pendants'
  bulbs. You may put posters and decor on walls (stay away from the back-wall title band y 4.2–5.6, |x| < 4.5).
- `ctx.addCollider(x, z, w, d)` for every exhibit footprint. Leave ≥ 1.2 m walking space between exhibits.

## Stations
- 4–5 stations per room, each registered with `ctx.addStation(def)`. Station centres ≥ 4 m apart and ≥ 1.5 m from walls.
- `viewpoint`: a close-up camera ~1.3–1.8 m high, 1.6–3 m from the exhibit, framing it fully. Everything
  the visitor manipulates must be visible and clickable from there. Note the station panel covers the right
  ~420 px of the screen on desktop (bottom ~50 % on phones), so frame the exhibit slightly left of centre
  (aim the target ~0.4 m to the right of the exhibit centre as seen from the camera).
  On narrow portrait screens the core pulls the camera back along the view line (never through a wall) and
  shifts the image above the bottom sheet. Set `fixedViewpoint: true` if the exact eye position matters (a peephole).
- The visitor sees a prompt within ~3.2 m of `position`; pressing E/tap focuses the station, opens the panel
  (`intro`, `howTo`, `science`, `wow`) and builds `controls(panel)` (rebuilt on language change, so keep state
  in the station). Use **both** in-world interaction (drag a crank, click a button, drag a magnet) and HUD controls.
  Interaction must work with mouse **and** touch (it does if you use `ctx.interaction`).
- Feedback: synthesized sound (`ctx.sfx`), glow, motion, numbers with units. Give Buddy reactions on real milestones
  (`ctx.buddy.celebrate(L(...))`, `ctx.buddy.say(...)`) with a cooldown (≥ 8 s) so Buddy doesn't spam.
- Text: excellent, natural **Swedish** and English (`{ sv, en }`). Kid-friendly, precise, no talking down.
  Swedish numbers use a decimal comma (`1,12 eV`): format with `toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', …)`.
  `science` should be 3–6 sentences with the real mechanism and at least one real number. Correct a common misconception.
- Simulations must be physically right (real formulas and constants, numerically stable, frame-rate independent:
  use `dt` and substeps). If you simplify, say so in the science text.

## Look and feel
- Cozy, warm and lit up: wood, brass, glass, rounded shapes (`RoundedBoxGeometry` from
  `three/addons/geometries/RoundedBoxGeometry.js`), soft warm light pools, and glowing accents.
  Bloom picks up colours brighter than ~0.82 luminance: use `MeshBasicMaterial` or a high `emissiveIntensity`
  (and `toneMapped: false` for strong neon) for things that should glow; keep everything else below that.
- Up to 4 `ctx.addLight()` anchors per room (point lights, no shadows), e.g. intensity 15–40 and distance 8–12.
  Use emissive materials for small lights.
- Add a little life: decor (plants, a bench, a poster or two on the walls about the theme), idle animations
  (things gently moving or glowing), so the room feels alive before you touch anything.
- In-world text (labels, signs): canvas textures, redrawn on `onLangChange`.

## Performance (it must run on a laptop and a phone)
- Per room: aim for < 150 draw calls and < 300k triangles. Share geometries and materials. Use `InstancedMesh` for many
  particles or objects. No shadows. Canvas textures ≤ 1024 px.
- No allocations in per-frame code (reuse vectors). Heavy simulation only while the station is focused or the visitor is
  within ~8 m (`ctx.camera.position` is the camera in world space; use `ctx.toWorld` or the room group's matrix to compare).
- `update(dt, time)` is only called while the room is visible.

## Final report (≤ 300 words)
Your stations (id, one line each), anything you needed from core, known limitations, and how you checked correctness.
