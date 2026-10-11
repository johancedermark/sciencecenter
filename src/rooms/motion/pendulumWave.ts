/** Station 2: pendulum wave. 15 independent pendulums whose periods are tuned to a common 60 s cycle. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomContext, L10n } from '../../core/types';
import type { Readout } from '../../core/controlPanel';
import { L, t } from '../../core/i18n';
import { pendulumLength, pendulumPeriod } from './physics';
import { Batch, StationState, buddyGate, fmt, mat, stationFrame, type StationModule } from './common';

const COUNT = 15;
const N0 = 51;
const CYCLE = 60;
const AMP = (14 * Math.PI) / 180;
const PIVOT_Y = 1.56;
const SPACING = 0.1;
const BOB_R = 0.028;

function patternName(f: number): L10n {
  // f = fraction of the cycle. At f = p/q the pendulums fall into q groups.
  for (let q = 1; q <= 6; q++) {
    for (let p = 0; p <= q; p++) {
      if (q > 1 && (p === 0 || p === q)) continue;
      if (Math.abs(f - p / q) < 0.006) {
        if (q === 1) return L('Alla i takt!', 'All in sync!');
        if (q === 2) return L('Två rader', 'Two rows');
        if (q === 3) return L('Tre rader', 'Three rows');
        if (q === 4) return L('Fyra rader', 'Four rows');
        return L(`${q} rader`, `${q} rows`);
      }
    }
  }
  if (f < 0.09 || f > 0.91) return L('Orm som slingrar', 'Wiggling snake');
  for (const r of [1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4]) if (Math.abs(f - r) < 0.03) return L('Flera ormar', 'Several snakes');
  return L('Ser ut som kaos…', 'Looks like chaos…');
}

export function buildPendulumWave(ctx: RoomContext, x: number, z: number, rotY: number): StationModule {
  const { group, v, world, collider } = stationFrame(ctx, x, z, rotY);
  const st = new StationState(ctx, world);
  const buddy = buddyGate(ctx);

  const lengths = Array.from({ length: COUNT }, (_, k) => pendulumLength(N0 + k, CYCLE));
  const omegas = lengths.map((Lk) => (2 * Math.PI) / pendulumPeriod(Lk));
  const pivotX = (k: number) => (k - (COUNT - 1) / 2) * SPACING;

  // ---------------------------------------------------------------- static build
  const b = new Batch();
  b.add(new RoundedBoxGeometry(1.9, 0.75, 0.7, 3, 0.05), mat.darkWood, [0, 0.375, 0]);
  b.add(new RoundedBoxGeometry(1.96, 0.05, 0.76, 2, 0.02), mat.wood, [0, 0.775, 0]);
  for (const sx of [-1, 1]) {
    b.add(new RoundedBoxGeometry(0.07, PIVOT_Y - 0.8 + 0.06, 0.07, 2, 0.02), mat.wood, [sx * 0.86, (PIVOT_Y + 0.8) / 2, 0]);
    b.add(new RoundedBoxGeometry(0.22, 0.04, 0.4, 2, 0.015), mat.wood, [sx * 0.86, 0.82, 0]);
  }
  b.add(new RoundedBoxGeometry(1.8, 0.06, 0.07, 2, 0.02), mat.wood, [0, PIVOT_Y + 0.03, 0]);
  for (let k = 0; k < COUNT; k++) b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), mat.brass, [pivotX(k), PIVOT_Y - 0.005, 0]);
  b.build(group);

  // release lever on the right upright
  const lever = new THREE.Group();
  lever.position.set(0.86, 1.15, 0.05);
  const leverArm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), mat.brass);
  leverArm.position.y = 0.1;
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x7cff6b, emissive: 0x7cff6b, emissiveIntensity: 0.5, roughness: 0.35 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), knobMat);
  knob.position.y = 0.21;
  lever.add(leverArm, knob);
  lever.rotation.x = 0.5;
  group.add(lever);

  // pendulums: instanced strings and bobs
  const stringGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1, 4);
  stringGeo.translate(0, -0.5, 0);
  const strings = new THREE.InstancedMesh(stringGeo, mat.string, COUNT);
  const bobs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(BOB_R, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.4 }),
    COUNT,
  );
  const baseColors = lengths.map((_, k) => new THREE.Color().setHSL(0.02 + (k / COUNT) * 0.75, 0.75, 0.55));
  const white = new THREE.Color(0xffffff);
  baseColors.forEach((c, k) => bobs.setColorAt(k, c));
  strings.frustumCulled = bobs.frustumCulled = false;
  group.add(strings, bobs);

  const s = {
    t: 0,
    speed: 1,
    paused: false,
    gather: -1, // 0..1 while gathering into sync, −1 otherwise
    gatherFrom: new Float64Array(COUNT),
    selected: -1,
    lastF: 0,
  };
  const angles = new Float64Array(COUNT);
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const bobOff = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();

  const computeAngles = () => {
    if (s.gather >= 0) {
      const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, s.gather));
      for (let k = 0; k < COUNT; k++) angles[k] = s.gatherFrom[k] + (AMP - s.gatherFrom[k]) * e;
      return;
    }
    // Exact small-angle solution θ(t) = θ0·cos(ωt): no drift, no frame-rate dependence.
    for (let k = 0; k < COUNT; k++) angles[k] = AMP * Math.cos(omegas[k] * s.t);
  };

  const writeInstances = () => {
    for (let k = 0; k < COUNT; k++) {
      q.setFromAxisAngle(ax, -angles[k]);
      pos.set(pivotX(k), PIVOT_Y, 0);
      sc.set(1, lengths[k], 1);
      m.compose(pos, q, sc);
      strings.setMatrixAt(k, m);
      bobOff.set(0, -lengths[k], 0).applyQuaternion(q).add(pos);
      m.compose(bobOff, q, one);
      bobs.setMatrixAt(k, m);
    }
    strings.instanceMatrix.needsUpdate = true;
    bobs.instanceMatrix.needsUpdate = true;
  };

  let rTime: Readout | null = null;
  let rPattern: Readout | null = null;
  let rSel: Readout | null = null;

  const syncRelease = () => {
    s.gatherFrom.set(angles);
    s.gather = 0;
    s.paused = false;
    ctx.sfx.whoosh();
  };

  const select = (k: number) => {
    if (s.selected >= 0) bobs.setColorAt(s.selected, baseColors[s.selected]);
    s.selected = k;
    bobs.setColorAt(k, white);
    if (bobs.instanceColor) bobs.instanceColor.needsUpdate = true;
    ctx.sfx.tone(300 + k * 40, 0.15, { type: 'sine', gain: 0.08 });
    updateSel();
  };
  const updateSel = () => {
    if (!rSel) return;
    const k = s.selected;
    if (k < 0) {
      rSel.set(t(L('klicka på en kula', 'click a bob')));
      return;
    }
    rSel.set(
      t(L(
        `nr ${k + 1}: L = ${fmt(lengths[k], 3)} m, T = ${fmt(pendulumPeriod(lengths[k]), 3)} s, ${N0 + k} svängningar/min`,
        `#${k + 1}: L = ${fmt(lengths[k], 3)} m, T = ${fmt(pendulumPeriod(lengths[k]), 3)} s, ${N0 + k} swings/min`,
      )),
    );
  };

  ctx.interaction.add(bobs, {
    label: L('Vilken pendel är det?', 'Which pendulum is this?'),
    onClick: (info) => {
      const id = info.hit?.instanceId;
      if (id !== undefined) select(id);
    },
  });
  ctx.interaction.add(lever, { label: L('Synka och släpp', 'Sync and release'), onClick: syncRelease });

  collider(2.0, 0.8);

  ctx.addStation(
    st.hook({
      id: 'motion-pendulum-wave',
      title: L('Pendelvågen', 'Pendulum wave'),
      position: [x, z],
      viewpoint: { position: v(0.75, 1.85, 1.9), target: v(0.35, 1.2, 0) },
      intro: L(
        'Femton pendlar som inte sitter ihop alls, och ändå dansar de ormar, rader och kaos. Vänta en minut så händer något magiskt!',
        "Fifteen pendulums that aren't connected at all, yet they dance as snakes, rows and chaos. Wait a minute and something magical happens!",
      ),
      howTo: L(
        'Dra i den gröna spaken (eller ”Synka och släpp”) så startar alla i takt. Titta på mönstren, byt fart eller hoppa i cykeln. Klicka på en kula för att se dess längd.',
        'Pull the green lever (or "Sync and release") to start them all in step. Watch the patterns, change the speed or jump through the cycle. Click a bob to see its length.',
      ),
      science: L(
        `En pendels period är T = 2π·√(L/g), så en kortare pendel svänger fortare. Längderna är valda så att den längsta (${fmt(lengths[0], 3)} m) gör exakt 51 hela svängningar på 60 sekunder, nästa 52, och så vidare upp till den kortaste (${fmt(lengths[COUNT - 1], 3)} m) med 65. Därför glider de isär lite i taget: först en orm, efter 30 s två rader (varannan pendel har hunnit en halv svängning mer), och efter 60 s är alla i takt igen. Pendlarna påverkar inte varandra alls, mönstret är bara olika faser. Vi använder småvinkelformeln, som stämmer på några promille vid utslag på 14°.`,
        `A pendulum's period is T = 2π·√(L/g), so a shorter pendulum swings faster. The lengths are chosen so that the longest (${fmt(lengths[0], 3)} m) makes exactly 51 full swings in 60 seconds, the next 52, and so on up to the shortest (${fmt(lengths[COUNT - 1], 3)} m) with 65. So they drift apart a little at a time: first a snake, after 30 s two rows (every other pendulum is half a swing ahead), and after 60 s they are all in step again. The pendulums don't affect each other at all; the pattern is just different phases. We use the small-angle formula, which is accurate to a few parts per thousand at a 14° swing.`,
      ),
      wow: L(
        'En pendels period beror inte på hur tung kulan är, bara på längden och g. Därför användes pendlar i klockor i nästan 300 år.',
        "A pendulum's period doesn't depend on how heavy the bob is, only on its length and g. That's why pendulums kept time in clocks for almost 300 years.",
      ),
      controls: (panel) => {
        panel.button(L('Synka och släpp', 'Sync and release'), syncRelease, { primary: true, icon: '🔄' });
        panel.buttons(
          [
            { label: L('1×', '1×'), onClick: () => { s.speed = 1; s.paused = false; } },
            { label: L('½×', '½×'), onClick: () => { s.speed = 0.5; s.paused = false; } },
            { label: L('4× snabbspola', '4× fast'), onClick: () => { s.speed = 4; s.paused = false; } },
            { label: L('Paus', 'Pause'), icon: '⏸', onClick: () => (s.paused = true) },
          ],
          s.paused ? 3 : s.speed === 1 ? 0 : s.speed === 0.5 ? 1 : 2,
        );
        rTime = panel.readout(L('Tid i cykeln', 'Time in the cycle'));
        rPattern = panel.readout(L('Mönster', 'Pattern'));
        panel.slider(
          L('Hoppa i cykeln (s)', 'Jump in the cycle (s)'),
          { min: 0, max: CYCLE, step: 0.5, value: Math.round((s.t % CYCLE) * 2) / 2, format: (val) => `${fmt(val, 1)} s` },
          (val) => {
            s.gather = -1;
            s.t = val;
          },
        );
        rSel = panel.readout(L('Vald pendel', 'Selected pendulum'));
        updateSel();
        panel.note(L(
          `Tips: hoppa till 20 s (tre rader), 30 s (två rader) och 45 s (fyra rader). g = 9,82 m/s².`,
          `Tip: jump to 20 s (three rows), 30 s (two rows) and 45 s (four rows). g = 9.82 m/s².`,
        ));
        return () => {
          rTime = rPattern = rSel = null;
        };
      },
    }),
  );

  computeAngles();
  writeInstances();

  return {
    update(dt) {
      const near = st.near();
      const now = performance.now() / 1000;
      knobMat.emissiveIntensity = 0.4 + 0.25 * Math.sin(now * 2.5);
      lever.rotation.x += ((s.gather >= 0 ? -0.5 : 0.5) - lever.rotation.x) * Math.min(1, dt * 8);
      const d = Math.min(dt, 0.1);
      if (s.gather >= 0) {
        s.gather += d / 0.9;
        if (s.gather >= 1) {
          s.gather = -1;
          s.t = 0;
          ctx.sfx.tone(660, 0.2, { type: 'triangle', gain: 0.08 });
        }
      } else if (!s.paused) {
        s.t += d * s.speed;
      }
      const f = (s.t % CYCLE) / CYCLE;
      // Milestone: back in sync after a full cycle.
      if (s.gather < 0 && !s.paused && f < s.lastF && s.t > CYCLE * 0.5) {
        ctx.sfx.chime();
        if (st.focused) buddy.celebrate(L('Titta! Efter 60 sekunder är alla i takt igen.', 'Look! After 60 seconds they are all back in step.'));
      }
      s.lastF = f;
      if (!near) return;
      computeAngles();
      writeInstances();
      if (rTime) rTime.set(`${fmt(s.t % CYCLE, 1)} / ${CYCLE} s`);
      if (rPattern) rPattern.set(s.gather >= 0 ? t(L('Synkar…', 'Syncing…')) : t(patternName(f)));
    },
  };
}
