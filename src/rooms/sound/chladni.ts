/**
 * Chladni plate: a square steel plate with ~3000 sand grains.
 * Mode shapes use the classic standing-wave approximation for a free square plate
 *   z = cos(nπu)·cos(mπv) ± cos(mπu)·cos(nπv),  u, v ∈ [0, 1] measured from a corner,
 * with resonances f = F0·(n² + m²) (the ± pair split by ±3 %, as Poisson's ratio does on a real plate).
 * Grains bounce where the plate moves and drift down the |z| gradient, so they collect on the nodal lines.
 */
import * as THREE from 'three';
import { L } from '../../core/i18n';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import { camDist, hz, LiveNoise, LiveTone, nf, rbox, type Shared, type StationModule } from './common';

const CX = -6;
const CZ = -5;
const PLATE_Y = 0.98;
const LP = 0.9; // plate side in the scene (m)
const F0 = 21; // Hz per unit of (n² + m²) for this model plate
const Q = 45; // quality factor of each resonance
const N_GRAINS = 3000;
const F_MIN = 40;
const F_MAX = 2300;

interface Mode {
  n: number;
  m: number;
  s: number;
  f: number;
}

function buildModes(): Mode[] {
  const out: Mode[] = [];
  for (let n = 0; n <= 9; n++) {
    for (let m = n; m <= 9; m++) {
      const k = n * n + m * m;
      if (k < 2 || k > 100) continue;
      if (n === m) out.push({ n, m, s: 1, f: F0 * k });
      else {
        out.push({ n, m, s: 1, f: F0 * k * 1.03 });
        out.push({ n, m, s: -1, f: F0 * k * 0.97 });
      }
    }
  }
  return out.sort((a, b) => a.f - b.f);
}

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

export function buildChladni(s: Shared): StationModule {
  const { ctx, mats } = s;
  const ac = ctx.sfx.ctx;
  const modes = buildModes();

  const root = new THREE.Group();
  root.position.set(CX, 0, CZ);
  ctx.group.add(root);

  // Table: dark cabinet + oak top
  const cab = new THREE.Mesh(rbox(1.1, 0.7, 1.1, 0.04), mats.darkWood);
  cab.position.y = 0.35;
  const top = new THREE.Mesh(rbox(1.3, 0.06, 1.3, 0.025), mats.wood);
  top.position.y = 0.73;
  root.add(cab, top);
  // Brass trim ring on the table
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 4), mats.brass);
  trim.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  trim.scale.set(1.414, 1.414, 1);
  trim.position.y = 0.765;
  root.add(trim);
  // Vibration driver + shaft
  const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 24), mats.black);
  driver.position.y = 0.83;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, PLATE_Y - 0.9, 8), mats.brass);
  shaft.position.y = (PLATE_Y + 0.9) / 2;
  root.add(driver, shaft);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), new THREE.MeshBasicMaterial({ color: 0x224455, toneMapped: false }));
  led.position.set(0, 0.83, 0.125);
  root.add(led);

  // The plate (top surface displaced per vertex, very exaggerated, slow "strobe" motion)
  const SEG = 40;
  const plateGeo = new THREE.PlaneGeometry(LP, LP, SEG, SEG);
  const plate = new THREE.Mesh(
    plateGeo,
    new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.3, roughness: 0.62, side: THREE.DoubleSide }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = PLATE_Y;
  root.add(plate);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(LP, 0.006, LP), mats.steel);
  edge.position.y = PLATE_Y - 0.0035;
  root.add(edge);
  const pos = plateGeo.attributes.position as THREE.BufferAttribute;
  const pu = new Float32Array(pos.count);
  const pv = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    pu[i] = pos.getX(i) / LP + 0.5;
    pv[i] = -pos.getY(i) / LP + 0.5; // plane y → room -z
  }

  // Sand
  const grainGeo = new THREE.BoxGeometry(0.0085, 0.006, 0.0085);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xb89a62, roughness: 0.95 });
  const sand = new THREE.InstancedMesh(grainGeo, sandMat, N_GRAINS);
  sand.position.y = PLATE_Y;
  sand.frustumCulled = false;
  root.add(sand);
  const gu = new Float32Array(N_GRAINS);
  const gv = new Float32Array(N_GRAINS);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N_GRAINS; i++) {
    dummy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    const k = 0.75 + Math.random() * 0.6;
    dummy.scale.set(k, k, k);
    dummy.updateMatrix();
    sand.setMatrixAt(i, dummy.matrix);
  }
  const mArr = sand.instanceMatrix.array as Float32Array;
  const sprinkle = () => {
    for (let i = 0; i < N_GRAINS; i++) {
      gu[i] = 0.03 + Math.random() * 0.94;
      gv[i] = 0.03 + Math.random() * 0.94;
    }
  };
  sprinkle();

  // The bow, resting along the front edge
  const bow = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.72, 8), mats.darkWood);
  stick.rotation.z = Math.PI / 2;
  stick.position.y = 0.06;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.004, 0.012), mats.cream);
  const frog = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.018), mats.black);
  frog.position.set(-0.34, 0.03, 0);
  bow.add(stick, hair, frog);
  bow.position.set(0, PLATE_Y - 0.02, LP / 2 + 0.012);
  root.add(bow);
  const bowHit = new THREE.Mesh(new THREE.BoxGeometry(LP + 0.25, 0.16, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  bowHit.position.set(0, PLATE_Y, LP / 2 + 0.04);
  root.add(bowHit);

  ctx.addCollider(CX, CZ, 1.35, 1.35);

  // ---------------------------------------------------------------- state
  let focused = false;
  let driverOn = false;
  let freq = 21 * 29 * 1.03; // near the (2,5) pattern
  let bowLevel = 0;
  let bowing = false;
  let bowU = 0.5;
  let bowPickU = -1;
  let lastBowT = 0;
  let strength = 0; // resonance strength 0..1 of the best mode (smoothed)
  let excite = 0; // overall excitation 0..1 (smoothed)
  let best = modes[0];
  let phase = 0;
  let goodTime = 0;
  const found = new Set<string>();

  const tone = new LiveTone(ac, s.bus, 'sine');
  const hiss = new LiveNoise(ac, s.bus, 5200, 0.6);

  let ui: { f?: Readout; mode?: Readout; meter?: Meter; slider?: HTMLInputElement; drv?: HTMLInputElement } = {};

  const fToS = (f: number) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * 1000;
  const sToF = (v: number) => F_MIN * Math.pow(F_MAX / F_MIN, v / 1000);

  const zAt = (md: Mode, u: number, v: number) =>
    Math.cos(md.n * Math.PI * u) * Math.cos(md.m * Math.PI * v) + md.s * Math.cos(md.m * Math.PI * u) * Math.cos(md.n * Math.PI * v);

  /** Bowing excites the resonance nearest the current frequency that has an antinode where you bow. */
  const pickBowMode = () => {
    const sorted = modes.slice().sort((a, b) => Math.abs(Math.log(a.f / freq)) - Math.abs(Math.log(b.f / freq)));
    for (const md of sorted) {
      if (Math.abs(zAt(md, bowU, 1)) > 1.2) {
        freq = md.f;
        break;
      }
    }
    bowPickU = bowU;
    if (ui.slider) {
      // bowing is true here, so the slider handler won't switch the driver on
      ui.slider.value = String(fToS(freq));
      ui.slider.dispatchEvent(new Event('input'));
    }
  };

  const plateWorldY = () => ctx.toWorld(new THREE.Vector3(CX, PLATE_Y, CZ)).y;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmp = new THREE.Vector3();
  const bowAt = (info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) => {
    plane.constant = -plateWorldY();
    const p = info.onPlane(plane);
    if (!p) return null;
    root.worldToLocal(tmp.copy(p));
    return THREE.MathUtils.clamp(tmp.x / LP + 0.5, 0.02, 0.98);
  };

  ctx.interaction.add(bowHit, {
    label: L('Stryk med stråken längs kanten', 'Draw the bow along the edge'),
    cursor: 'ew-resize',
    enabled: () => focused,
    onDragStart: (info) => {
      const u = bowAt(info);
      if (u === null) return;
      bowing = true;
      bowU = u;
      lastBowT = performance.now();
      if (driverOn) {
        driverOn = false;
        if (ui.drv) ui.drv.checked = false;
      }
      pickBowMode();
      bowLevel = Math.max(bowLevel, 0.5);
    },
    onDrag: (info) => {
      const u = bowAt(info);
      if (u === null) return;
      const now = performance.now();
      const dts = Math.max(0.008, (now - lastBowT) / 1000);
      const speed = (Math.abs(u - bowU) * LP) / dts; // m/s along the edge
      lastBowT = now;
      bowU = u;
      bowLevel = Math.min(1, Math.max(bowLevel, 0.45 + speed * 0.5));
      if (Math.abs(bowU - bowPickU) > 0.09) pickBowMode();
    },
    onDragEnd: () => {
      bowing = false;
    },
  });

  // ---------------------------------------------------------------- station
  ctx.addStation({
    id: 'sound-chladni',
    title: L('Chladnis platta', 'Chladni plate'),
    position: [CX, CZ],
    viewpoint: { position: [CX + 0.15, 1.85, CZ + 1.55], target: [CX + 0.42, PLATE_Y - 0.25, CZ - 0.05] },
    intro: L(
      'Sätt plattan i svängning och se sanden rita mönster av sig själv!',
      'Make the plate vibrate and watch the sand draw patterns all by itself!',
    ),
    howTo: L(
      'Slå på tongeneratorn och dra långsamt i frekvensreglaget, eller dra stråken längs plattans främre kant. Leta efter frekvenser där sanden bildar skarpa linjer.',
      'Switch on the tone generator and slowly move the frequency slider, or drag the bow along the front edge of the plate. Look for frequencies where the sand forms sharp lines.',
    ),
    science: L(
      'Vid vissa frekvenser, resonanser, bildar plattan en stående våg. Vissa linjer, nodlinjerna, står helt stilla medan resten gungar upp och ner. Sanden kastas bort från de rörliga delarna och hamnar där plattan står still. Många tror att sanden samlas där det skakar mest, men det är tvärtom. Här används en förenklad modell av en fri fyrkantig platta: z = cos(nπx/L)·cos(mπy/L) ± cos(mπx/L)·cos(nπy/L), med resonansfrekvensen f ≈ 21 Hz·(n² + m²). En riktig stålplatta följer den mer komplicerade Kirchhoff-teorin, men mönstren blir mycket lika. Mellan resonanserna skakar plattan oordnat och sanden sprids ut igen.',
      'At certain frequencies, the resonances, the plate forms a standing wave. Some lines, the nodal lines, stay completely still while the rest moves up and down. The sand is thrown off the moving parts and ends up where the plate is still. Many people think sand gathers where the shaking is strongest, but it is the opposite. This uses a simplified model of a free square plate: z = cos(nπx/L)·cos(mπy/L) ± cos(mπx/L)·cos(nπy/L), with resonant frequency f ≈ 21 Hz·(n² + m²). A real steel plate follows the more complicated Kirchhoff theory, but the patterns look very similar. Between resonances the plate shakes in a jumble and the sand spreads out again.',
    ),
    wow: L(
      'Ernst Chladni visade sina sandmönster för Napoleon år 1808. Napoleon blev så imponerad att han utlyste ett pris på 3000 franc till den som kunde förklara dem matematiskt.',
      'Ernst Chladni showed his sand patterns to Napoleon in 1808. Napoleon was so impressed that he offered a prize of 3000 francs to whoever could explain them mathematically.',
    ),
    onFocus: () => {
      focused = true;
      ctx.sfx.resume();
    },
    onBlur: () => {
      focused = false;
      silence();
    },
    controls: (panel: ControlPanel) => {
      ui.drv = panel.toggle(L('Tongenerator på', 'Tone generator on'), driverOn, (v) => {
        driverOn = v;
      });
      ui.slider = panel.slider(
        L('Frekvens', 'Frequency'),
        { min: 0, max: 1000, step: 0.01, value: fToS(freq), format: (v) => hz(sToF(v)) },
        (v) => {
          freq = sToF(v);
          if (!driverOn && !bowing) {
            driverOn = true;
            if (ui.drv) ui.drv.checked = true;
          }
        },
      );
      const jump = (dir: 1 | -1) => {
        const list = dir > 0 ? modes.filter((m) => m.f > freq * 1.004) : modes.filter((m) => m.f < freq * 0.996).reverse();
        if (!list.length) return;
        freq = list[0].f;
        if (ui.slider) {
          ui.slider.value = String(fToS(freq));
          ui.slider.dispatchEvent(new Event('input'));
        }
        if (!driverOn) {
          driverOn = true;
          if (ui.drv) ui.drv.checked = true;
        }
      };
      panel.buttons([
        { label: L('Förra resonansen', 'Previous resonance'), icon: '◀', onClick: () => jump(-1) },
        { label: L('Nästa resonans', 'Next resonance'), icon: '▶', onClick: () => jump(1) },
      ]);
      ui.f = panel.readout(L('Frekvens', 'Frequency'));
      ui.mode = panel.readout(L('Närmaste mönster (n, m)', 'Nearest pattern (n, m)'));
      ui.meter = panel.meter(L('Resonans', 'Resonance'), '#4fd1ff');
      panel.button(L('Strö ut ny sand', 'Sprinkle fresh sand'), () => {
        sprinkle();
        ctx.sfx.noise(0.5, { freq: 4000, gain: 0.05 });
      }, { icon: '🫙' });
      panel.note(
        L(
          'Tips: stryk med stråken på olika ställen längs kanten. Plattan väljer en resonans som har en buk (största rörelse) just där du stryker.',
          'Tip: bow at different places along the edge. The plate picks a resonance that has an antinode (largest motion) right where you bow.',
        ),
      );
      return () => {
        ui = {};
      };
    },
  });

  function silence() {
    driverOn = false;
    bowing = false;
    bowLevel = 0;
    excite = 0;
    tone.stop();
    hiss.stop();
    if (ui.drv) ui.drv.checked = false;
  }

  // ---------------------------------------------------------------- update
  const ledMat = led.material as THREE.MeshBasicMaterial;
  const ledOff = new THREE.Color(0x224455);
  const ledOn = new THREE.Color(0x4fd1ff);

  function update(dt: number, time: number) {
    dt = Math.min(dt, 0.05);
    const near = focused || camDist(s, CX, CZ) < 8;
    if (!near) return;

    // Excitation: driver or bow (the bowed plate rings down with τ ≈ 1.5 s)
    if (!bowing) bowLevel *= Math.exp(-dt / 1.5);
    const target = driverOn ? 1 : bowLevel;
    excite += (target - excite) * (1 - Math.exp(-dt / 0.12));

    // Which mode responds most at this frequency?
    let bestA = 0;
    for (const md of modes) {
      const x = (2 * Q * (freq - md.f)) / md.f;
      const a = 1 / Math.sqrt(1 + x * x);
      if (a > bestA) {
        bestA = a;
        best = md;
      }
    }
    strength += (bestA - strength) * (1 - Math.exp(-dt / 0.15));
    const E = excite;
    const S = strength;

    // Sound: louder at resonance, gentle overall
    if (focused && E > 0.01) {
      tone.start(freq);
      hiss.start();
      tone.setType(bowing || (!driverOn && bowLevel > 0.02) ? 'triangle' : 'sine');
      tone.set(freq, 0.045 * E * (0.2 + 0.8 * S));
      hiss.set(0.02 * E * (0.35 + 0.65 * S));
    } else if (tone.on && E < 0.006) {
      tone.stop(0.1);
      hiss.stop();
    }
    ledMat.color.copy(ledOff).lerp(ledOn, Math.min(1, E * 1.5));
    bow.position.x = THREE.MathUtils.lerp(bow.position.x, bowing ? (bowU - 0.5) * LP : 0, 1 - Math.exp(-dt * 20));

    // Plate shape (exaggerated) in slow motion
    phase += dt * Math.PI * 2 * 2.2;
    const n = best.n;
    const m = best.m;
    const sg = best.s;
    const amp = 0.012 * S * E * Math.sin(phase);
    const pz = pos.array as Float32Array;
    if (Math.abs(amp) > 1e-5 || pz[2] !== 0) {
      for (let i = 0; i < pos.count; i++) {
        const u = pu[i];
        const v = pv[i];
        const z = Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) + sg * Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v);
        pz[i * 3 + 2] = (amp * z) / 2;
      }
      pos.needsUpdate = true;
    }

    // Sand: random bouncing ∝ local vibration + drift down the |z| gradient, plus scatter off resonance.
    const K2 = Math.PI * Math.PI * (n * n + m * m);
    const sub = 2;
    const h = dt / sub;
    const sq = Math.sqrt(h);
    const kD = 2.6 * S * E;
    const kJ = 0.09 * S * E;
    const kS = 0.035 * E * (1 - S) * (1 - S);
    const active = E > 0.004;
    const np = n * Math.PI;
    const mp = m * Math.PI;
    for (let i = 0; i < N_GRAINS; i++) {
      let u = gu[i];
      let v = gv[i];
      let z = 0;
      if (active) {
        for (let k = 0; k < sub; k++) {
          const cnu = Math.cos(np * u), snu = Math.sin(np * u);
          const cmu = Math.cos(mp * u), smu = Math.sin(mp * u);
          const cnv = Math.cos(np * v), snv = Math.sin(np * v);
          const cmv = Math.cos(mp * v), smv = Math.sin(mp * v);
          z = cnu * cmv + sg * cmu * cnv;
          const dzu = -np * snu * cmv - sg * mp * smu * cnv;
          const dzv = -mp * cnu * smv - sg * np * cmu * snv;
          const a = Math.abs(z) * 0.5;
          const jig = (kJ * a + kS) * sq;
          u += -kD * ((z * dzu) / K2) * h + jig * gauss();
          v += -kD * ((z * dzv) / K2) * h + jig * gauss();
          if (u < 0.006) u = 0.012 - u;
          else if (u > 0.994) u = 1.988 - u;
          if (v < 0.006) v = 0.012 - v;
          else if (v > 0.994) v = 1.988 - v;
        }
        gu[i] = u;
        gv[i] = v;
      } else {
        z = Math.cos(np * u) * Math.cos(mp * v) + sg * Math.cos(mp * u) * Math.cos(np * v);
      }
      const a = Math.abs(z) * 0.5;
      const hop = active ? Math.random() * 0.014 * a * S * E : 0;
      const o = i * 16;
      mArr[o + 12] = (u - 0.5) * LP;
      mArr[o + 13] = 0.003 + (amp * z) / 2 + hop;
      mArr[o + 14] = (v - 0.5) * LP;
    }
    sand.instanceMatrix.needsUpdate = true;

    // Readouts and milestones
    if (focused) {
      ui.f?.set(hz(freq));
      ui.mode?.set(`(${best.n}, ${best.m})${best.n !== best.m ? (best.s > 0 ? ' +' : ' −') : ''} · ${hz(best.f)}`);
      ui.meter?.set(S * Math.min(1, E * 1.2), `${nf(Math.round(S * 100))} %`);
      if (S > 0.85 && E > 0.5) {
        goodTime += dt;
        const key = `${best.n},${best.m},${best.s}`;
        if (goodTime > 1.5 && !found.has(key)) {
          found.add(key);
          if (found.size === 1) {
            s.cheer(L('Titta! Sanden samlas på linjerna där plattan står helt still.', 'Look! The sand gathers on the lines where the plate stands completely still.'));
          } else if (found.size === 5) {
            s.cheer(L('Fem olika mönster! Högre frekvens ger fler och tätare nodlinjer.', 'Five different patterns! Higher frequency gives more and closer nodal lines.'));
          }
        }
      } else goodTime = 0;
    }
    void time;
  }

  return { update, silence };
}
