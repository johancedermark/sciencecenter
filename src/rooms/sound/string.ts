/**
 * Standing waves on a string (Melde's experiment).
 * A vibrator drives one end of a string; the other runs over a pulley to a hanging mass (tension T = m·g).
 * The steady state of a damped, driven string fixed at x = L and driven at x = 0 is
 *   y(x, t) = Re[ a · sin(K(L − x)) / sin(KL) · e^{iωt} ],  K = (ω/v)(1 − iη),  v = √(T/μ)
 * which is exactly the superposition of the waves travelling back and forth, with resonances at fₙ = n·v/(2L).
 * Plucking adds the free modal solution (harmonics n·f₁ with the triangle-pluck amplitudes).
 */
import * as THREE from 'three';
import { L } from '../../core/i18n';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import { camDist, drawResponse, hz, LiveTone, nf, rbox, type Shared, type StationModule } from './common';

const CX = 0;
const CZ = -6;
const LEN = 2.5; // string length (m)
const X0 = -1.25; // vibrator contact
const SY = 1.22; // string height
const MU = 0.002; // kg/m (2 g/m)
const ETA = 0.008; // damping → Q ≈ 1/(2η) ≈ 60
const A_DRIVE = 0.001; // vibrator amplitude 1 mm
const VIS = 8; // visual exaggeration of the amplitude
const Y_MAX = 0.16; // largest drawn displacement
const NP = 160; // points along the string
const NH = 24; // harmonics in a pluck
const F_MIN = 5;
const F_MAX = 300;
const G = 9.81;
const STROBE = 0.8; // displayed oscillation rate (Hz): the animation is slowed down like under a strobe light

export function buildString(s: Shared): StationModule {
  const { ctx, mats } = s;
  const ac = ctx.sfx.ctx;
  const root = new THREE.Group();
  root.position.set(CX, 0, CZ);
  ctx.group.add(root);

  // Bench
  const benchL = 2.95;
  const benchC = -0.25;
  const base = new THREE.Mesh(rbox(benchL - 0.15, 0.76, 0.42, 0.04), mats.darkWood);
  base.position.set(benchC, 0.38, 0);
  const top = new THREE.Mesh(rbox(benchL, 0.07, 0.56, 0.025), mats.wood);
  top.position.set(benchC, 0.79, 0);
  root.add(base, top);
  // Measuring tape under the string (brass strip with tick marks via canvas)
  const tc = document.createElement('canvas');
  tc.width = 1024;
  tc.height = 32;
  const tg = tc.getContext('2d')!;
  tg.fillStyle = '#d9b45a';
  tg.fillRect(0, 0, 1024, 32);
  tg.fillStyle = '#3a2a10';
  for (let i = 0; i <= 50; i++) {
    const x = (i / 50) * 1023;
    tg.fillRect(x, 0, 2, i % 10 === 0 ? 30 : i % 5 === 0 ? 20 : 11);
  }
  const tapeTex = new THREE.CanvasTexture(tc);
  tapeTex.colorSpace = THREE.SRGBColorSpace;
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 0.04), new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.5, metalness: 0.3 }));
  tape.rotation.x = -Math.PI / 2;
  tape.position.set(X0 + LEN / 2, 0.83, 0.12);
  root.add(tape);

  // Vibrator (black box with brass arm)
  const vib = new THREE.Group();
  const vbox = new THREE.Mesh(rbox(0.22, 0.3, 0.2, 0.03), mats.black);
  vbox.position.set(X0 - 0.12, 0.98, 0);
  const vled = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0x223344, toneMapped: false }));
  vled.position.set(X0 - 0.12, 1.06, 0.105);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.012), mats.brass);
  arm.position.set(X0 - 0.05, SY, 0);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, SY - 1.13, 6), mats.brass);
  post.position.set(X0 - 0.12, (SY + 1.13) / 2, 0);
  vib.add(vbox, vled, arm, post);
  root.add(vib);

  // Pulley, hanging string and mass
  const PX = X0 + LEN;
  const PR = 0.045;
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(PR, 0.012, 8, 24), mats.brass);
  pulley.position.set(PX, SY - PR, 0);
  const pPost = new THREE.Mesh(new THREE.BoxGeometry(0.03, SY - PR - 0.8, 0.03), mats.steel);
  pPost.position.set(PX - 0.06, (SY - PR + 0.8) / 2, -0.04);
  const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1, 4), new THREE.MeshBasicMaterial({ color: 0x8fe6ff, toneMapped: false }));
  root.add(pulley, pPost, hang);
  const massGroup = new THREE.Group();
  const mass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 24), mats.brass);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 6, 12), mats.steel);
  massGroup.add(mass, hook);
  root.add(massGroup);

  // The glowing string: two crossed ribbons so it reads from any angle
  const pos = new Float32Array(NP * 4 * 3);
  const idx: number[] = [];
  for (let i = 0; i < NP - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, a + 1, b, a + 1, b + 1, b, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sGeo.setIndex(idx);
  const stringMesh = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0x8fe6ff, toneMapped: false, side: THREE.DoubleSide }));
  stringMesh.frustumCulled = false;
  root.add(stringMesh);
  // Faint envelope (the blur a real string shows): ±|y| along the string, so the nodes always stand out
  const envPos = new Float32Array(NP * 2 * 3);
  const envIdx: number[] = [];
  for (let i = 0; i < NP - 1; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    envIdx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const envGeo = new THREE.BufferGeometry();
  envGeo.setAttribute('position', new THREE.BufferAttribute(envPos, 3));
  envGeo.setIndex(envIdx);
  const envelope = new THREE.Mesh(
    envGeo,
    new THREE.MeshBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  envelope.frustumCulled = false;
  root.add(envelope);
  const envAmp = new Float32Array(NP);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.1, 0.24, 0.16), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(X0 + LEN / 2, SY, 0);
  root.add(hit);

  ctx.addCollider(CX + benchC + 0.1, CZ, benchL + 0.3, 0.7);

  // ---------------------------------------------------------------- state
  let focused = false;
  let driverOn = false;
  let tension = 50; // N
  let freq = 31.6;
  let drive = 0;
  let phase = 0;
  let pluckT = 1e9;
  const pluckB = new Float32Array(NH + 1);
  let pulling: { xp: number; h: number } | null = null;
  let resTime = 0;
  let reachedN = 0;
  let curveDirty = true;
  const curve = new Float32Array(240);
  const hRe = new Float32Array(NP);
  const hIm = new Float32Array(NP);
  const disp = new Float32Array(NP);
  let pluckVoices: { osc: OscillatorNode; g: GainNode }[] = [];

  const tone = new LiveTone(ac, s.bus, 'sawtooth', 1400);
  let ui: {
    v?: Readout; f1?: Readout; n?: Readout; amp?: Readout; meter?: Meter;
    fs?: HTMLInputElement; ts?: HTMLInputElement; drv?: HTMLInputElement;
    graph?: { ctx: CanvasRenderingContext2D; width: number; height: number };
  } = {};

  const speed = () => Math.sqrt(tension / MU);
  const f1 = () => speed() / (2 * LEN);

  /** Complex transfer H(x) = sin(K(L−x))/sin(KL) into hRe/hIm; returns max |H|. */
  function transfer(f: number, out: boolean, samples = NP) {
    const kr = (2 * Math.PI * f) / speed();
    const ki = kr * ETA;
    // denominator sin(KL)
    const dr = Math.sin(kr * LEN) * Math.cosh(ki * LEN);
    const di = -Math.cos(kr * LEN) * Math.sinh(ki * LEN);
    const dd = dr * dr + di * di;
    let mx = 0;
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * LEN;
      const sx = LEN - x;
      const nr = Math.sin(kr * sx) * Math.cosh(ki * sx);
      const ni = -Math.cos(kr * sx) * Math.sinh(ki * sx);
      const re = (nr * dr + ni * di) / dd;
      const im = (ni * dr - nr * di) / dd;
      if (out) {
        hRe[i] = re;
        hIm[i] = im;
      }
      const m = Math.hypot(re, im);
      if (m > mx) mx = m;
    }
    return mx;
  }

  function computeCurve() {
    for (let i = 0; i < curve.length; i++) {
      const f = F_MIN + ((F_MAX - F_MIN) * i) / (curve.length - 1);
      curve[i] = Math.min(transfer(f, false, 41), 60);
    }
    curveDirty = false;
  }

  function stopPluck() {
    const t = ac.currentTime;
    for (const p of pluckVoices) {
      p.g.gain.cancelScheduledValues(t);
      p.g.gain.setTargetAtTime(0, t, 0.03);
      p.osc.stop(t + 0.2);
    }
    pluckVoices = [];
  }

  function pluck(xp: number, h: number) {
    xp = THREE.MathUtils.clamp(xp, 0.05, LEN - 0.05);
    let bMax = 0;
    for (let n = 1; n <= NH; n++) {
      pluckB[n] = ((2 * h * LEN * LEN) / (n * n * Math.PI * Math.PI * xp * (LEN - xp))) * Math.sin((n * Math.PI * xp) / LEN);
      bMax = Math.max(bMax, Math.abs(n * pluckB[n]));
    }
    pluckT = 0;
    // Sound: additive synthesis of the first 12 harmonics at their real frequencies n·f₁
    stopPluck();
    const t0 = ac.currentTime;
    const base = f1();
    const loud = Math.min(1, h / 0.1);
    for (let n = 1; n <= 12; n++) {
      const fn = n * base;
      if (fn > 12000) break;
      const amp = (Math.abs(n * pluckB[n]) / bMax) * 0.05 * loud;
      if (amp < 0.0008) continue;
      const osc = ac.createOscillator();
      osc.frequency.value = fn;
      const g = ac.createGain();
      const tau = 1.6 / Math.pow(n, 0.6);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.004);
      g.gain.setTargetAtTime(0, t0 + 0.004, tau);
      osc.connect(g).connect(s.bus);
      osc.start(t0);
      osc.stop(t0 + tau * 6);
      const v = { osc, g };
      osc.onended = () => {
        g.disconnect();
        pluckVoices = pluckVoices.filter((p) => p !== v);
      };
      pluckVoices.push(v);
    }
  }

  const setDriver = (on: boolean) => {
    driverOn = on;
    if (ui.drv) ui.drv.checked = on;
  };

  // In-world: vibrator toggles, string plucks, mass sets the tension
  ctx.interaction.add(vib, {
    label: L('Vibratorn: klicka för på/av', 'Vibrator: click for on/off'),
    enabled: () => focused,
    onClick: () => setDriver(!driverOn),
  });
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const pointOnString = (info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) => {
    // vertical plane through the string, facing the room's +z
    const wp = ctx.toWorld(new THREE.Vector3(CX, SY, CZ));
    nrm.set(0, 0, 1).transformDirection(ctx.group.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(nrm, wp);
    const p = info.onPlane(plane);
    if (!p) return null;
    return root.worldToLocal(tmp.copy(p));
  };
  ctx.interaction.add(hit, {
    label: L('Dra i strängen och släpp', 'Pull the string and let go'),
    cursor: 'ns-resize',
    enabled: () => focused,
    onDragStart: (info) => {
      const p = pointOnString(info);
      if (!p) return;
      pulling = { xp: THREE.MathUtils.clamp(p.x - X0, 0.08, LEN - 0.08), h: 0 };
    },
    onDrag: (info) => {
      const p = pointOnString(info);
      if (!p || !pulling) return;
      pulling.h = THREE.MathUtils.clamp(p.y - SY, -0.14, 0.14);
    },
    onDragEnd: () => {
      if (!pulling) return;
      const { xp, h } = pulling;
      pulling = null;
      if (Math.abs(h) > 0.01) {
        ctx.sfx.resume();
        pluck(xp, h);
      }
    },
  });
  ctx.interaction.add(massGroup, {
    label: L('Dra vikten upp/ner: spänning', 'Drag the weight up/down: tension'),
    cursor: 'ns-resize',
    enabled: () => focused,
    onDrag: (info) => {
      tension = THREE.MathUtils.clamp(tension * Math.exp(info.dy * 0.01), 5, 200);
      curveDirty = true;
      if (ui.ts) {
        ui.ts.value = String(Math.round(tension));
        ui.ts.dispatchEvent(new Event('input'));
      }
    },
  });

  // ---------------------------------------------------------------- station
  ctx.addStation({
    id: 'sound-string',
    title: L('Stående vågor på en sträng', 'Standing waves on a string'),
    position: [CX, CZ],
    viewpoint: { position: [CX + 0.05, 1.55, CZ + 2.75], target: [CX + 0.55, 0.98, CZ] },
    intro: L(
      'Skaka strängen med rätt frekvens så verkar vågen stå alldeles stilla!',
      'Shake the string at just the right frequency and the wave seems to stand perfectly still!',
    ),
    howTo: L(
      'Slå på vibratorn och dra i frekvensen tills strängen svänger kraftigt. Ändra spänningen med vikten eller reglaget. Du kan också dra i strängen och släppa, som på en gitarr.',
      'Switch on the vibrator and move the frequency until the string swings strongly. Change the tension with the weight or the slider. You can also pull the string and let go, like on a guitar.',
    ),
    science: L(
      'En våg på strängen färdas med farten v = √(T/μ), där T är spänningen och μ massan per meter (här 2 g/m). Vågen studsar mot ändarna, och när en hel rad halva våglängder får plats på strängen förstärker de fram- och tillbakagående vågorna varandra: fₙ = n·v/(2L). Med T = 50 N blir v ≈ 158 m/s och f₁ ≈ 31,6 Hz på vår 2,5 m långa sträng. Vågen ser ut att stå still, men den består egentligen av två vågor som rör sig åt var sitt håll. Noderna står helt stilla, bukarna svänger mest. Animationen är kraftigt nedsaktad, som i ett stroboskopljus, och utslaget är förstorat.',
      'A wave on the string travels at v = √(T/μ), where T is the tension and μ the mass per metre (here 2 g/m). The wave bounces off the ends, and when a whole number of half wavelengths fits on the string, the waves going back and forth reinforce each other: fₙ = n·v/(2L). With T = 50 N, v ≈ 158 m/s and f₁ ≈ 31.6 Hz on our 2.5 m string. The wave seems to stand still, but it is really two waves moving in opposite directions. The nodes stay completely still, the antinodes swing the most. The animation is heavily slowed down, as under a strobe light, and the swing is enlarged.',
    ),
    wow: L(
      'En gitarrsträng svänger i grundtonen och massor av övertoner (2f, 3f, 4f …) samtidigt. Blandningen av övertoner är anledningen till att en gitarr och ett piano låter olika fast de spelar samma ton. Lägg fingret lätt mitt på strängen så dämpas grundtonen och du hör flageoletten, en oktav högre.',
      'A guitar string vibrates in its fundamental and lots of harmonics (2f, 3f, 4f …) at once. The mix of harmonics is why a guitar and a piano sound different even when playing the same note. Touch the string lightly at its middle and the fundamental is damped, so you hear the harmonic an octave higher.',
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
      ui.drv = panel.toggle(L('Vibrator på', 'Vibrator on'), driverOn, (v) => setDriver(v));
      ui.fs = panel.slider(
        L('Frekvens', 'Frequency'),
        { min: F_MIN, max: F_MAX, step: 0.1, value: freq, format: (v) => hz(v) },
        (v) => {
          freq = v;
          if (!driverOn) setDriver(true);
        },
      );
      ui.ts = panel.slider(
        L('Spänning T', 'Tension T'),
        { min: 5, max: 200, step: 1, value: Math.round(tension), format: (v) => `${nf(v)} N` },
        (v) => {
          tension = v;
          curveDirty = true;
        },
      );
      panel.buttons([
        {
          label: L('Nästa resonans', 'Next resonance'),
          icon: '▶',
          onClick: () => {
            const n = Math.floor(freq / f1() + 0.02) + 1;
            freq = Math.min(F_MAX, n * f1());
            if (ui.fs) {
              ui.fs.value = String(freq);
              ui.fs.dispatchEvent(new Event('input'));
            }
            setDriver(true);
          },
        },
        { label: L('Knäpp på strängen', 'Pluck the string'), icon: '🎸', onClick: () => pluck(LEN / 5, 0.08) },
      ]);
      ui.v = panel.readout(L('Våghastighet v = √(T/μ)', 'Wave speed v = √(T/μ)'));
      ui.f1 = panel.readout(L('Grundton f₁ = v/(2L)', 'Fundamental f₁ = v/(2L)'));
      ui.n = panel.readout(L('Närmaste resonans', 'Nearest resonance'));
      ui.amp = panel.readout(L('Största utslag', 'Largest swing'));
      ui.meter = panel.meter(L('Resonans', 'Resonance'), '#4fd1ff');
      panel.note(L('Svarskurva: utslag mot frekvens (topparna är fₙ)', 'Response curve: swing versus frequency (the peaks are fₙ)'));
      const c = panel.canvas(90);
      ui.graph = { ctx: c.ctx, width: c.width, height: c.height };
      curveDirty = true;
      return () => {
        ui = {};
      };
    },
  });

  function silence() {
    setDriver(false);
    drive = 0;
    tone.stop();
    stopPluck();
    pluckT = 1e9;
    pulling = null;
  }

  // ---------------------------------------------------------------- update
  const vledMat = vled.material as THREE.MeshBasicMaterial;
  let graphTimer = 0;

  function update(dt: number) {
    dt = Math.min(dt, 0.05);
    // Mass and hanging string reflect the tension (always, cheap)
    const kg = tension / G;
    const mh = 0.04 + kg * 0.011;
    mass.scale.y = mh;
    const bottom = 0.42;
    mass.position.set(PX + PR, bottom + mh / 2, 0);
    hook.position.set(PX + PR, bottom + mh + 0.015, 0);
    hook.rotation.y = Math.PI / 2;
    const hangTop = SY - PR;
    const hangBot = bottom + mh + 0.03;
    hang.scale.y = hangTop - hangBot;
    hang.position.set(PX + PR, (hangTop + hangBot) / 2, 0);

    const near = focused || camDist(s, CX, CZ) < 8;
    if (!near) return;

    drive += ((driverOn ? 1 : 0) - drive) * (1 - Math.exp(-dt / 0.35));
    phase += dt * Math.PI * 2 * STROBE;
    const hMax = transfer(freq, true);
    const nNear = Math.max(1, Math.round(freq / f1()));
    const resNorm = Math.min(1, hMax * Math.PI * ETA * nNear);
    const gScale = Math.min(1, Y_MAX / (A_DRIVE * VIS * hMax)) * A_DRIVE * VIS * drive;
    const cph = Math.cos(phase);
    const sph = Math.sin(phase);
    for (let i = 0; i < NP; i++) {
      disp[i] = gScale * (hRe[i] * cph - hIm[i] * sph);
      envAmp[i] = gScale * Math.hypot(hRe[i], hIm[i]);
    }

    // Pluck: free vibration, harmonics at n·STROBE in slow motion, higher ones die faster
    if (pluckT < 12) {
      pluckT += dt;
      for (let n = 1; n <= NH; n++) {
        const b = pluckB[n] * Math.cos(2 * Math.PI * STROBE * n * pluckT) * Math.exp(-pluckT / (3 / Math.sqrt(n)));
        if (Math.abs(b) < 1e-5) continue;
        for (let i = 0; i < NP; i++) disp[i] += b * Math.sin((n * Math.PI * i) / (NP - 1));
      }
    }
    if (pulling) {
      const { xp, h } = pulling;
      for (let i = 0; i < NP; i++) {
        const x = (i / (NP - 1)) * LEN;
        disp[i] = x < xp ? (h * x) / xp : (h * (LEN - x)) / (LEN - xp);
      }
    }

    const w = 0.006;
    for (let i = 0; i < NP; i++) {
      const x = X0 + (i / (NP - 1)) * LEN;
      const e = pulling ? 0 : Math.min(0.2, envAmp[i]);
      const o = i * 6;
      envPos[o] = x; envPos[o + 1] = SY + e; envPos[o + 2] = -0.002;
      envPos[o + 3] = x; envPos[o + 4] = SY - e; envPos[o + 5] = -0.002;
    }
    (envGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < NP; i++) {
      const x = X0 + (i / (NP - 1)) * LEN;
      const y = SY + THREE.MathUtils.clamp(disp[i], -0.2, 0.2);
      const o = i * 12;
      pos[o] = x; pos[o + 1] = y + w; pos[o + 2] = 0;
      pos[o + 3] = x; pos[o + 4] = y - w; pos[o + 5] = 0;
      pos[o + 6] = x; pos[o + 7] = y; pos[o + 8] = w;
      pos[o + 9] = x; pos[o + 10] = y; pos[o + 11] = -w;
    }
    (sGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    arm.position.y = SY + disp[0];
    vledMat.color.setHex(drive > 0.1 ? 0x4fd1ff : 0x223344);

    // Sound of the vibrator: louder when the string resonates
    if (focused && drive > 0.01) {
      tone.start(freq);
      tone.set(freq, drive * (0.012 + 0.05 * resNorm));
    } else if (tone.on && drive < 0.01) tone.stop();

    if (!focused) return;
    const v = speed();
    ui.v?.set(`${nf(v, 0)} m/s`);
    ui.f1?.set(hz(f1()));
    ui.n?.set(`n = ${nNear} · fₙ = ${hz(nNear * f1())}`);
    ui.amp?.set(driverOn ? `${nf(A_DRIVE * hMax * 1000, 0)} mm` : '–');
    ui.meter?.set(resNorm * drive, `${nf(Math.round(resNorm * 100))} %`);
    graphTimer -= dt;
    if (ui.graph && (curveDirty || graphTimer <= 0)) {
      if (curveDirty) computeCurve();
      graphTimer = 0.1;
      const peaks: number[] = [];
      for (let n = 1; n * f1() < F_MAX; n++) peaks.push(n * f1());
      drawResponse(ui.graph.ctx, ui.graph.width, ui.graph.height, curve, F_MIN, F_MAX, freq, false, peaks);
    }
    if (driverOn && resNorm > 0.9) {
      resTime += dt;
      if (resTime > 1.2) {
        if (reachedN === 0) {
          s.cheer(L('Där! En stående våg. Ser du noderna som står helt still?', 'There! A standing wave. Can you see the nodes standing completely still?'));
          reachedN = nNear;
        } else if (nNear >= 4 && reachedN < 4) {
          s.cheer(L(`Övertonen n = ${nNear}: ${nNear} bukar och ${nNear + 1} noder!`, `Harmonic n = ${nNear}: ${nNear} antinodes and ${nNear + 1} nodes!`));
          reachedN = nNear;
        }
      }
    } else resTime = 0;
  }

  return { update, silence };
}
