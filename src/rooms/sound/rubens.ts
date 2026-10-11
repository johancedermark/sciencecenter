/**
 * Rubens' tube: a 2 m gas-filled tube with a row of small flames, driven by a speaker at one end
 * and closed at the other. Steady-state pressure amplitude for a piston at x = 0 and a closed end at x = L:
 *   p(x) ∝ cos(K(L − x)) / sin(KL),  K = (ω/c)(1 − iη)
 * with resonances at f = n·c/(2L). Flames are taller where the pressure oscillation amplitude is larger.
 */
import * as THREE from 'three';
import { getLang, L } from '../../core/i18n';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import { camDist, drawResponse, hz, LiveNoise, LiveTone, nf, rbox, type Shared, type StationModule } from './common';

const CX = 7.2;
const CZ = 3;
const LT = 2.0; // tube length (m)
const C_GAS = 250; // speed of sound in propane at 20 °C (m/s)
const ETA = 0.012;
const TY = 1.06; // tube axis height
const TR = 0.045; // tube radius
const NF = 48; // flames
const F_MIN = 30;
const F_MAX = 800;
const P0 = 4; // flame response scale
const H0 = 0.07; // flame height with no sound
const H1 = 0.36; // extra height at the largest pressure swing

export function buildRubens(s: Shared): StationModule {
  const { ctx, mats } = s;
  const ac = ctx.sfx.ctx;
  const root = new THREE.Group();
  root.position.set(CX, 0, CZ);
  ctx.group.add(root);
  const z0 = -LT / 2; // speaker end

  // Table
  const cab = new THREE.Mesh(rbox(0.56, 0.74, 2.7, 0.04), mats.darkWood);
  cab.position.y = 0.37;
  const top = new THREE.Mesh(rbox(0.7, 0.05, 2.85, 0.02), mats.wood);
  top.position.y = 0.765;
  root.add(cab, top);

  // Tube on two stands
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR, LT, 28, 1), new THREE.MeshStandardMaterial({ color: 0xa9b0b8, metalness: 0.7, roughness: 0.3 }));
  tube.rotation.x = Math.PI / 2;
  tube.position.y = TY;
  root.add(tube);
  const capGeo = new THREE.CylinderGeometry(TR + 0.008, TR + 0.008, 0.02, 28);
  const cap = new THREE.Mesh(capGeo, mats.brass);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(0, TY, LT / 2 + 0.01);
  root.add(cap);
  const standGeo = new THREE.CylinderGeometry(0.012, 0.012, TY - 0.79, 8);
  const footGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.02, 16);
  for (const z of [-0.6, 0.6]) {
    const st = new THREE.Mesh(standGeo, mats.brass);
    st.position.set(0, (TY + 0.79) / 2 - 0.02, z);
    const ft = new THREE.Mesh(footGeo, mats.brass);
    ft.position.set(0, 0.8, z);
    root.add(st, ft);
  }
  // Hole strip (dark dots along the top)
  const holes = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.002, LT - 0.08), mats.black);
  holes.position.set(0, TY + TR - 0.001, 0);
  root.add(holes);

  // Speaker box at the near-left end
  const spk = new THREE.Group();
  const spkBox = new THREE.Mesh(rbox(0.26, 0.3, 0.2, 0.03), mats.wood);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.03, 0.04, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d1e22, side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 0.1;
  spk.add(spkBox, cone);
  spk.position.set(0, TY, z0 - 0.1);
  spk.rotation.y = Math.PI; // cone faces away from the tube (the tube is sealed by a membrane)
  root.add(spk);

  // Amplifier with a frequency knob
  const amp = new THREE.Mesh(rbox(0.3, 0.14, 0.24, 0.02), mats.black);
  amp.position.set(0.2, 0.86, z0 + 0.2);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.03, 20), mats.brass);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.36, 0.87, z0 + 0.2);
  const ampLed = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0x112233, toneMapped: false }));
  ampLed.position.set(0.352, 0.905, z0 + 0.28);
  root.add(amp, knob, ampLed);

  // Gas valve at the far end
  const valve = new THREE.Group();
  const vBody = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 10), mats.brass);
  const vHandle = new THREE.Mesh(rbox(0.12, 0.02, 0.025, 0.008), mats.red);
  vHandle.position.y = 0.05;
  valve.add(vBody, vHandle);
  valve.position.set(0.18, 0.84, LT / 2 + 0.05);
  root.add(valve);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 6, 16, Math.PI / 2), mats.black);
  hose.rotation.y = Math.PI / 2;
  hose.position.set(0.05, 0.92, LT / 2 + 0.02);
  root.add(hose);

  // Flames: billboarded additive quads (one instanced draw call)
  const fc = document.createElement('canvas');
  fc.width = 64;
  fc.height = 128;
  const fg = fc.getContext('2d')!;
  fg.save();
  fg.scale(1, 2);
  const grad = fg.createRadialGradient(32, 46, 2, 32, 40, 30);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.3, 'rgba(255,190,80,0.95)');
  grad.addColorStop(0.65, 'rgba(255,110,30,0.45)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  fg.fillStyle = grad;
  fg.fillRect(0, 0, 64, 64);
  fg.restore();
  const blue = fg.createRadialGradient(32, 118, 1, 32, 118, 14);
  blue.addColorStop(0, 'rgba(120,170,255,0.95)');
  blue.addColorStop(1, 'rgba(60,90,255,0)');
  fg.fillStyle = blue;
  fg.fillRect(0, 90, 64, 38);
  const flameTex = new THREE.CanvasTexture(fc);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  const flameGeo = new THREE.PlaneGeometry(1, 1);
  flameGeo.translate(0, 0.5, 0);
  const flameMat = new THREE.MeshBasicMaterial({
    map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, NF);
  flames.frustumCulled = false;
  root.add(flames);
  const flamePhase = new Float32Array(NF).map(() => Math.random() * 100);
  const flameZ = new Float32Array(NF);
  for (let i = 0; i < NF; i++) flameZ[i] = z0 + 0.06 + (i / (NF - 1)) * (LT - 0.12);

  ctx.addCollider(CX, CZ, 0.8, 3.0);

  // ---------------------------------------------------------------- state
  let focused = false;
  let speakerOn = false;
  let gasOn = true;
  let freq = 100;
  let drive = 0;
  let gas = 1;
  let resTime = 0;
  let cheered = 0;
  let curveDirty = true;
  const curve = new Float32Array(300);
  const pAmp = new Float32Array(NF);
  const heights = new Float32Array(NF).fill(H0);
  const tone = new LiveTone(ac, s.bus, 'sine');
  const hiss = new LiveNoise(ac, s.bus, 2200, 0.5);

  let ui: {
    spk?: HTMLInputElement; gas?: HTMLInputElement; fs?: HTMLInputElement; f?: Readout; n?: Readout; lam?: Readout; meter?: Meter;
    graph?: { ctx: CanvasRenderingContext2D; width: number; height: number };
  } = {};

  const f1 = C_GAS / (2 * LT);

  /** |p(x)| along the tube (x from the speaker) into pAmp; returns the max. */
  function pressure(f: number, out: boolean, samples = NF) {
    const kr = (2 * Math.PI * f) / C_GAS;
    const ki = kr * ETA;
    const dr = Math.sin(kr * LT) * Math.cosh(ki * LT);
    const di = -Math.cos(kr * LT) * Math.sinh(ki * LT);
    const dd = Math.hypot(dr, di);
    let mx = 0;
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * LT;
      const sx = LT - x;
      const cr = Math.cos(kr * sx) * Math.cosh(ki * sx);
      const ci = Math.sin(kr * sx) * Math.sinh(ki * sx);
      const m = Math.hypot(cr, ci) / dd;
      if (out) pAmp[i] = m;
      if (m > mx) mx = m;
    }
    return mx;
  }

  const setSpeaker = (on: boolean) => {
    speakerOn = on;
    if (ui.spk) ui.spk.checked = on;
  };
  const setGas = (on: boolean) => {
    gasOn = on;
    if (ui.gas) ui.gas.checked = on;
    ctx.sfx.noise(0.35, { freq: on ? 1800 : 800, gain: 0.05 });
  };
  const setFreq = (f: number) => {
    freq = THREE.MathUtils.clamp(f, F_MIN, F_MAX);
    if (ui.fs) {
      ui.fs.value = String(freq);
      ui.fs.dispatchEvent(new Event('input'));
    }
  };

  ctx.interaction.add(spk, {
    label: L('Högtalaren: på/av', 'The speaker: on/off'),
    enabled: () => focused,
    onClick: () => setSpeaker(!speakerOn),
  });
  ctx.interaction.add(knob, {
    label: L('Vrid: dra åt sidan för frekvens', 'Turn: drag sideways for frequency'),
    cursor: 'ew-resize',
    enabled: () => focused,
    onDrag: (info) => {
      setFreq(freq * Math.exp(-info.dx * 0.002));
      if (!speakerOn) setSpeaker(true);
    },
  });
  ctx.interaction.add(valve, {
    label: L('Gaskranen: på/av', 'The gas valve: on/off'),
    enabled: () => focused,
    onClick: () => setGas(!gasOn),
  });

  // ---------------------------------------------------------------- station
  ctx.addStation({
    id: 'sound-rubens',
    title: L('Rubens rör', "Rubens' tube"),
    position: [CX - 0.2, CZ],
    viewpoint: { position: [CX - 2.8, 1.55, CZ + 0.05], target: [CX, TY - 0.15, CZ + 0.45] },
    intro: L(
      'Ett rör fullt med gas och en rad små lågor. När ljudet träffar rätt ton ritar eldflammorna själva ljudvågen!',
      'A tube full of gas and a row of little flames. When the sound hits the right note, the flames draw the sound wave themselves!',
    ),
    howTo: L(
      'Slå på högtalaren och ändra frekvensen med reglaget eller ratten på förstärkaren. Leta efter resonanserna, där lågorna bildar höga toppar och låga dalar.',
      'Switch on the speaker and change the frequency with the slider or the knob on the amplifier. Look for the resonances, where the flames form tall peaks and low valleys.',
    ),
    science: L(
      'Högtalaren skickar tryckvågor in i röret. De studsar mot den stängda änden och möts, och vid vissa frekvenser bildas en stående våg: f = n·c/(2L). Röret är fyllt med propan, där ljudet går ungefär 250 m/s (i luft 343 m/s), så med L = 2 m blir grundtonen 62,5 Hz. Där trycket svänger mest pressas gasen ut i stötar och lågorna blir högst; där trycket står still blir de låga. Avståndet mellan två höga lågor är en halv våglängd, så du kan mäta ljudets våglängd med en linjal! Simuleringen är förenklad: i ett riktigt rör beror lågornas höjd också på gastrycket.',
      "The speaker sends pressure waves into the tube. They bounce off the closed end and meet, and at certain frequencies a standing wave forms: f = n·c/(2L). The tube is filled with propane, where sound travels at about 250 m/s (343 m/s in air), so with L = 2 m the fundamental is 62.5 Hz. Where the pressure swings the most, the gas is pushed out in bursts and the flames are tallest; where the pressure stays steady, they are low. The distance between two tall flames is half a wavelength, so you can measure the wavelength of sound with a ruler! The simulation is simplified: in a real tube the flame height also depends on the gas pressure.",
    ),
    wow: L(
      'Heinrich Rubens byggde det första röret 1904. Han använde 200 små hål och kunde se ljudvågor med blotta ögat. Idag spelar folk musik genom rören och låter lågorna dansa i takt.',
      'Heinrich Rubens built the first tube in 1904. He used 200 small holes and could see sound waves with the naked eye. Today people play music through tubes like this and let the flames dance to the beat.',
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
      ui.spk = panel.toggle(L('Högtalare på', 'Speaker on'), speakerOn, (v) => setSpeaker(v));
      ui.gas = panel.toggle(L('Gas och lågor', 'Gas and flames'), gasOn, (v) => setGas(v));
      ui.fs = panel.slider(
        L('Frekvens', 'Frequency'),
        { min: F_MIN, max: F_MAX, step: 0.5, value: freq, format: (v) => hz(v) },
        (v) => {
          freq = v;
          if (!speakerOn) setSpeaker(true);
        },
      );
      panel.buttons([
        {
          label: L('Förra resonansen', 'Previous resonance'),
          icon: '◀',
          onClick: () => {
            const n = Math.ceil(freq / f1 - 0.02) - 1;
            if (n >= 1) setFreq(n * f1);
            setSpeaker(true);
          },
        },
        {
          label: L('Nästa resonans', 'Next resonance'),
          icon: '▶',
          onClick: () => {
            const n = Math.floor(freq / f1 + 0.02) + 1;
            setFreq(n * f1);
            setSpeaker(true);
          },
        },
      ]);
      ui.f = panel.readout(L('Frekvens', 'Frequency'));
      ui.n = panel.readout(L('Närmaste resonans fₙ = n·c/(2L)', 'Nearest resonance fₙ = n·c/(2L)'));
      ui.lam = panel.readout(L('Våglängd λ = c/f', 'Wavelength λ = c/f'));
      ui.meter = panel.meter(L('Resonans', 'Resonance'), '#ffb35c');
      panel.note(L('Svarskurva: tryckutslag mot frekvens', 'Response curve: pressure swing versus frequency'));
      const c = panel.canvas(80);
      ui.graph = { ctx: c.ctx, width: c.width, height: c.height };
      curveDirty = true;
      return () => {
        ui = {};
      };
    },
  });

  function silence() {
    setSpeaker(false);
    drive = 0;
    tone.stop();
    hiss.stop();
  }

  // ---------------------------------------------------------------- update
  const dummy = new THREE.Object3D();
  const ledMat = ampLed.material as THREE.MeshBasicMaterial;
  let graphTimer = 0;

  function update(dt: number, time: number) {
    dt = Math.min(dt, 0.05);
    const near = focused || camDist(s, CX, CZ) < 10;
    if (!near) return;
    drive += ((speakerOn ? 1 : 0) - drive) * (1 - Math.exp(-dt / 0.25));
    gas += ((gasOn ? 1 : 0) - gas) * (1 - Math.exp(-dt / 0.3));
    const pMax = pressure(freq, true);
    const nNear = Math.max(1, Math.round(freq / f1));
    const resNorm = Math.min(1, pMax * nNear * Math.PI * ETA);

    // Flames: height follows the local pressure amplitude, with a little flicker
    const yaw = Math.atan2(s.cam.x - CX, s.cam.z - CZ);
    for (let i = 0; i < NF; i++) {
      const p = pAmp[i] * drive;
      const target = H0 + H1 * (1 - Math.exp(-p / P0));
      heights[i] += (target - heights[i]) * (1 - Math.exp(-dt / 0.12));
      const ph = flamePhase[i];
      const flick = 1 + 0.09 * Math.sin(time * 17 + ph) + 0.05 * Math.sin(time * 29 + ph * 2) + (drive > 0.1 ? 0.04 * Math.sin(time * 41 + ph) : 0);
      const h = heights[i] * flick * gas;
      dummy.position.set(0, TY + TR - 0.004, flameZ[i]);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(0.045 + h * 0.08, Math.max(0.0001, h), 1);
      dummy.updateMatrix();
      flames.setMatrixAt(i, dummy.matrix);
    }
    flames.instanceMatrix.needsUpdate = true;
    flames.visible = gas > 0.02;
    cone.position.z = 0.1 + Math.sin(time * 50) * 0.004 * drive;
    ledMat.color.setHex(speakerOn ? 0xffb35c : 0x112233);

    // Sound: the speaker tone (louder when the tube resonates) and a soft gas hiss
    if (focused) {
      if (drive > 0.01) {
        tone.start(freq);
        tone.set(freq, drive * 0.035 * (0.3 + 0.7 * resNorm));
      } else if (tone.on) tone.stop();
      if (gas > 0.05) {
        hiss.start();
        hiss.set(0.007 * gas);
      } else hiss.stop();
    }

    if (!focused) return;
    ui.f?.set(hz(freq));
    ui.n?.set(`n = ${nNear} · ${hz(nNear * f1)}`);
    ui.lam?.set(`${nf(C_GAS / freq, 2)} m`);
    ui.meter?.set(resNorm * drive, resNorm > 0.7 && drive > 0.5 ? (getLang() === 'sv' ? 'Resonans!' : 'Resonance!') : `${nf(Math.round(resNorm * 100))} %`);
    graphTimer -= dt;
    if (ui.graph && (curveDirty || graphTimer <= 0)) {
      if (curveDirty) {
        for (let i = 0; i < curve.length; i++) {
          const f = F_MIN + ((F_MAX - F_MIN) * i) / (curve.length - 1);
          curve[i] = 1 - Math.exp(-pressure(f, false, 25) / P0);
        }
        curveDirty = false;
      }
      graphTimer = 0.1;
      const peaks: number[] = [];
      for (let n = 1; n * f1 < F_MAX; n++) peaks.push(n * f1);
      drawResponse(ui.graph.ctx, ui.graph.width, ui.graph.height, curve, F_MIN, F_MAX, freq, false, peaks);
    }
    if (speakerOn && resNorm > 0.75 && gasOn) {
      resTime += dt;
      if (resTime > 1) {
        if (cheered === 0) {
          cheered = 1;
          s.cheer(L('Resonans! Lågorna ritar den stående vågen: höga där trycket svänger mest.', 'Resonance! The flames draw the standing wave: tall where the pressure swings the most.'));
        } else if (cheered === 1 && nNear >= 5) {
          cheered = 2;
          s.cheer(L(`n = ${nNear}! Räkna topparna, och mät avståndet mellan dem: det är en halv våglängd.`, `n = ${nNear}! Count the peaks, and measure the distance between them: that is half a wavelength.`));
        }
      }
    } else resTime = 0;
  }

  return { update, silence };
}
