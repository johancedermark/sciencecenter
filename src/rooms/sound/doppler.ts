/**
 * Doppler effect: a model ambulance drives past on a tilted 1:40 diorama.
 * The heard frequency is computed live from the emission (retarded) time:
 *   f' = f · c / (c − v·cosθ),  c = 343 m/s,
 * where θ is the angle between the car's velocity and the line from the car (where it was when it
 * emitted the sound now arriving) to the listener. Stereo pan and 1/r distance attenuation use the same point.
 * Wave fronts are drawn analytically in one shader: circles of radius c·(t − t_emit) around each emission point.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import { drawText } from '../../core/textures';
import { ACCENT, camDist, hz, LiveTone, nf, rbox, type Shared, type StationModule } from './common';

const CX = -7.3;
const CZ = 3;
const C = 343; // m/s
const SCALE = 40; // 1 m on the model = 40 m real
const ROAD_X = -0.2; // road centre on the board (model m)
const EAR_X = 0.2; // listener on the board
const D_REAL = (EAR_X - ROAD_X) * SCALE; // 16 m from the road
const S_VIS = 96; // visible road ±96 m
const S_END = 106; // car hidden in the tunnels beyond this
const N_RING = 64;
const EMIT = 0.04; // s between drawn wave fronts (each one stands for many real wave crests)
const TILT = 0.55; // board tilt towards the visitor (rad)

export function buildDoppler(s: Shared): StationModule {
  const { ctx, mats } = s;
  const ac = ctx.sfx.ctx;
  const root = new THREE.Group();
  root.position.set(CX, 0, CZ);
  ctx.group.add(root);

  // Cabinet and back panel, the board on top tilted towards the visitor (+x)
  const cab = new THREE.Mesh(rbox(1.0, 0.74, 5.4, 0.04), mats.darkWood);
  cab.position.set(-0.05, 0.37, 0);
  const back = new THREE.Mesh(rbox(0.06, 0.62, 5.4, 0.02), mats.darkWood);
  back.position.set(-0.52, 1.0, 0);
  root.add(cab, back);
  const board = new THREE.Group();
  board.position.set(0, 1.04, 0);
  board.rotation.z = -TILT;
  root.add(board);
  const slab = new THREE.Mesh(rbox(1.3, 0.05, 5.4, 0.02), mats.wood);
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5.3), new THREE.MeshStandardMaterial({ color: 0x2c5a3e, roughness: 1 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.026;
  board.add(slab, felt);

  // Road texture
  const rc = document.createElement('canvas');
  rc.width = 64;
  rc.height = 1024;
  const rg = rc.getContext('2d')!;
  rg.fillStyle = '#3a3a40';
  rg.fillRect(0, 0, 64, 1024);
  rg.fillStyle = '#d8d2c0';
  rg.fillRect(2, 0, 3, 1024);
  rg.fillRect(59, 0, 3, 1024);
  for (let y = 0; y < 1024; y += 64) rg.fillRect(30, y, 4, 34);
  const roadTex = new THREE.CanvasTexture(rc);
  roadTex.colorSpace = THREE.SRGBColorSpace;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 5.2), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(ROAD_X, 0.028, 0);
  board.add(road);

  // Tunnels at both ends
  const tunnelGeo = rbox(0.5, 0.26, 0.55, 0.05);
  const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.9 });
  const mouthGeo = new THREE.PlaneGeometry(0.24, 0.16);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  for (const sgn of [-1, 1]) {
    const tn = new THREE.Mesh(tunnelGeo, tunnelMat);
    tn.position.set(ROAD_X, 0.15, sgn * 2.7);
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(ROAD_X, 0.11, sgn * (2.7 - 0.276));
    if (sgn > 0) mouth.rotation.y = Math.PI;
    board.add(tn, mouth);
  }

  // Wave-front overlay (one draw call)
  const ringUniforms = {
    uE: { value: Array.from({ length: N_RING }, () => new THREE.Vector3(0, 0, -1e6)) },
    uT: { value: 0 },
    uC: { value: C / SCALE },
    uColor: { value: new THREE.Color(ACCENT) },
  };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = vec2(position.x, -position.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uE[${N_RING}];
      uniform float uT;
      uniform float uC;
      uniform vec3 uColor;
      varying vec2 vP;
      void main() {
        float a = 0.0;
        for (int i = 0; i < ${N_RING}; i++) {
          vec3 e = uE[i];
          float r = uC * (uT - e.z);
          if (r < 0.0 || r > 2.8) continue;
          float d = abs(length(vP - e.xy) - r);
          a += (1.0 - smoothstep(0.005, 0.018, d)) * (1.0 - r / 2.8);
        }
        a = min(a, 1.4);
        gl_FragColor = vec4(uColor * a * 1.2, a);
      }`,
  });
  const rings = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5.3), ringMat);
  rings.rotation.x = -Math.PI / 2;
  rings.position.y = 0.032;
  board.add(rings);

  // Ambulance
  const car = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xc9c4bb, roughness: 0.55 });
  const body = new THREE.Mesh(rbox(0.16, 0.12, 0.34, 0.025), white);
  body.position.y = 0.1;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.163, 0.025, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f7d3b, roughness: 0.5 }));
  stripe.position.y = 0.09;
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.2, metalness: 0.4 }));
  windscreen.position.set(0, 0.125, 0.171);
  const axleGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.17, 14);
  for (const z of [-0.11, 0.11]) {
    const axle = new THREE.Mesh(axleGeo, mats.black);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.034, z);
    car.add(axle);
  }
  const blueA = new THREE.MeshBasicMaterial({ color: 0x2060ff, toneMapped: false });
  const blueB = new THREE.MeshBasicMaterial({ color: 0x2060ff, toneMapped: false });
  const lightGeo = new THREE.BoxGeometry(0.05, 0.025, 0.03);
  const la = new THREE.Mesh(lightGeo, blueA);
  la.position.set(-0.045, 0.172, 0.1);
  const lb = new THREE.Mesh(lightGeo, blueB);
  lb.position.set(0.045, 0.172, 0.1);
  car.add(body, stripe, windscreen, la, lb);
  car.position.set(ROAD_X, 0.028, 0);
  board.add(car);

  // Listener ("you are here"): brass ear trumpet on a post + label
  const ear = new THREE.Group();
  const earPost = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), mats.brass);
  earPost.position.y = 0.06;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 16, 1, true), mats.brass);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(-0.03, 0.13, 0);
  const earRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 32), new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false }));
  earRing.rotation.x = -Math.PI / 2;
  earRing.position.y = 0.004;
  ear.add(earPost, horn, earRing);
  ear.position.set(EAR_X, 0.028, 0);
  board.add(ear);
  const lc = document.createElement('canvas');
  lc.width = 768;
  lc.height = 96;
  const lg = lc.getContext('2d')!;
  const labelTex = new THREE.CanvasTexture(lc);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.15), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true }));
  label.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)),
  );
  label.position.set(EAR_X + 0.3, 0.03, 0);
  board.add(label);
  s.lang(() => {
    drawText(lg, 768, 96, t(L('🎧 Här lyssnar du (16 m från vägen)', '🎧 You listen here (16 m from the road)')), {
      font: '800 38px "Baloo 2", "Nunito", system-ui, sans-serif',
      color: '#ffe2b0',
    });
    labelTex.needsUpdate = true;
  });

  ctx.addCollider(CX - 0.05, CZ, 1.45, 5.9);

  // ---------------------------------------------------------------- state
  let focused = false;
  let speed = 25; // m/s
  let siren = true;
  let slow = false;
  let simT = 0;
  let tStart = 0.5;
  let lastEmit = -1;
  let ringIdx = 0;
  let passes = 0;
  let heardF = 0;
  let fastCheered = false;
  const tone = new LiveTone(ac, s.bus, 'triangle', 3500);

  let ui: { v?: Readout; f?: Readout; heard?: Readout; pred?: Readout; spd?: HTMLInputElement } = {};

  const posAt = (tt: number) => (tt < tStart ? -S_END : Math.min(S_END, -S_END + speed * (tt - tStart)));
  const srcF = (te: number) => (siren ? (Math.floor(te / 0.6) % 2 === 0 ? 900 : 700) : 440);

  const restart = () => {
    tStart = simT + 0.3;
  };

  ctx.interaction.add(car, {
    label: L('Klicka: kör förbi igen', 'Click: drive past again'),
    enabled: () => focused,
    onClick: () => restart(),
  });

  ctx.addStation({
    id: 'sound-doppler',
    title: L('Dopplereffekten', 'The Doppler effect'),
    position: [CX + 0.3, CZ],
    viewpoint: { position: [CX + 4.1, 1.95, CZ - 0.5], target: [CX, 0.78, CZ - 1.15] },
    intro: L(
      'Varför låter en ambulans ljusare när den kommer och mörkare när den åker iväg? Lyssna!',
      'Why does an ambulance sound higher when it comes towards you and lower when it drives away? Listen!',
    ),
    howTo: L(
      'Lyssna när ambulansen kör förbi. Ändra farten och jämför. Titta på vågfronterna: de trängs ihop framför bilen och glesnar bakom. Klicka på bilen för att köra igen.',
      'Listen as the ambulance drives past. Change the speed and compare. Watch the wave fronts: they bunch up in front of the car and spread out behind it. Click the car to run it again.',
    ),
    science: L(
      'Sirenen skickar ut vågtoppar med jämn takt, men bilen hinner köra en bit mellan varje topp. Framför bilen hamnar topparna tätare, så fler toppar per sekund når ditt öra och tonen blir högre. Bakom bilen blir det tvärtom. Den hörda frekvensen är f′ = f·c/(c − v·cos θ), där c = 343 m/s är ljudets fart i luft vid 20 °C och θ vinkeln mellan bilens fart och riktningen mot dig. Exempel: 440 Hz i 20 m/s låter som 467 Hz på väg mot dig och 416 Hz på väg bort. Många tror att tonen stiger för att bilen kommer närmare, men den är nästan konstant medan bilen närmar sig och sjunker snabbt just när den passerar. Ringarna visar en vågfront var 0,04:e sekund, och modellen är byggd i skala 1:40.',
      'The siren sends out wave crests at a steady rate, but the car moves a little between each crest. In front of the car the crests end up closer together, so more crests per second reach your ear and the pitch is higher. Behind the car it is the opposite. The heard frequency is f′ = f·c/(c − v·cos θ), where c = 343 m/s is the speed of sound in air at 20 °C and θ is the angle between the car\'s velocity and the direction to you. Example: 440 Hz at 20 m/s sounds like 467 Hz coming towards you and 416 Hz going away. Many think the pitch rises because the car gets closer, but it stays almost constant while the car approaches and drops quickly just as it passes. The rings show one wave front every 0.04 s, and the model is at 1:40 scale.',
    ),
    wow: L(
      'Astronomer använder samma effekt med ljus: galaxer som rör sig bort från oss ser rödare ut (rödförskjutning). Så upptäckte man att universum expanderar.',
      'Astronomers use the same effect with light: galaxies moving away from us look redder (redshift). That is how we found out that the universe is expanding.',
    ),
    onFocus: () => {
      focused = true;
      ctx.sfx.resume();
      restart();
    },
    onBlur: () => {
      focused = false;
      silence();
    },
    controls: (panel: ControlPanel) => {
      ui.spd = panel.slider(
        L('Fart', 'Speed'),
        { min: 5, max: 250, step: 1, value: speed, format: (v) => `${nf(v)} m/s · ${nf(v * 3.6)} km/h` },
        (v) => (speed = v),
      );
      panel.buttons(
        [
          { label: L('Siren 900/700 Hz', 'Siren 900/700 Hz'), icon: '🚑', onClick: () => (siren = true) },
          { label: L('Ren ton 440 Hz', 'Pure tone 440 Hz'), icon: '🎵', onClick: () => (siren = false) },
        ],
        siren ? 0 : 1,
      );
      panel.toggle(L('Slow motion (bara bilden, ×0,25)', 'Slow motion (picture only, ×0.25)'), slow, (v) => (slow = v));
      panel.button(L('Kör förbi igen', 'Drive past again'), restart, { icon: '🔁' });
      ui.v = panel.readout(L('Mach-tal v/c', 'Mach number v/c'));
      ui.f = panel.readout(L('Sirenen sänder', 'The siren sends'));
      ui.heard = panel.readout(L('Du hör nu', 'You hear now'));
      ui.pred = panel.readout(L('Rakt mot dig / rakt bort', 'Straight towards / away'));
      panel.note(
        L('Tips: använd hörlurar eller stereohögtalare, så hör du också bilen röra sig från höger till vänster.', 'Tip: use headphones or stereo speakers and you will also hear the car move from right to left.'),
      );
      return () => {
        ui = {};
      };
    },
  });

  function silence() {
    tone.stop();
    heardF = 0;
    for (const e of ringUniforms.uE.value) e.z = -1e6;
  }

  // ---------------------------------------------------------------- update
  function update(dt: number, time: number) {
    dt = Math.min(dt, 0.05);
    // Idle life: lights blink gently even when nobody is here
    const blink = Math.floor(time * (focused ? 5 : 1.5)) % 2 === 0;
    blueA.color.setHex(blink ? 0x3a7bff : 0x0a1a40);
    blueB.color.setHex(blink ? 0x0a1a40 : 0x3a7bff);
    earRing.scale.setScalar(1 + 0.08 * Math.sin(time * 2));
    const near = focused || camDist(s, CX, CZ) < 9;
    if (!near) return;

    if (focused) {
      simT += dt * (slow ? 0.25 : 1);
      if (posAt(simT) >= S_END) {
        tStart = simT + 1.0;
        passes++;
        if (passes === 1) {
          s.cheer(
            L('Hörde du? Tonen var hög när bilen kom och hoppade ner precis när den passerade.', 'Did you hear it? The pitch was high as the car came and dropped just as it passed.'),
          );
        }
      }
    }
    const sNow = posAt(simT);
    car.position.z = sNow / SCALE;
    car.visible = Math.abs(sNow) < S_END;

    // Emit wave fronts while the car is on the visible road
    if (focused && Math.abs(sNow) < S_VIS && simT - lastEmit >= EMIT) {
      lastEmit = simT;
      const e = ringUniforms.uE.value[ringIdx];
      e.set(ROAD_X, sNow / SCALE, simT);
      ringIdx = (ringIdx + 1) % N_RING;
    }
    ringUniforms.uT.value = simT;

    // Sound: solve the emission time t_e with Newton's method, then Doppler, pan and 1/r
    if (focused) {
      let te = simT - Math.hypot(sNow, D_REAL) / C;
      for (let k = 0; k < 5; k++) {
        const se = posAt(te);
        const r = Math.hypot(se, D_REAL);
        const moving = te >= tStart && se < S_END ? speed : 0;
        const gte = simT - te - r / C;
        const dg = -1 - (moving * se) / (r * C);
        te -= gte / dg;
      }
      const se = posAt(te);
      const r = Math.hypot(se, D_REAL);
      const moving = te >= tStart && se < S_END;
      const cosT = -se / r;
      const f0 = srcF(te);
      const fh = moving ? (f0 * C) / (C - speed * cosT) : f0;
      const onRoad = te >= tStart - 0.3 && Math.abs(se) < S_END;
      const tunnel = Math.abs(se) > S_VIS ? 0.25 : 1;
      const gain = onRoad ? 0.07 * Math.min(1, (D_REAL / r) * 1.0) * tunnel : 0;
      if (gain > 0.0005) tone.start(fh);
      tone.set(fh, gain, 0.015, THREE.MathUtils.clamp((-se / r) * 0.85, -0.85, 0.85));
      heardF = onRoad ? fh : 0;

      ui.v?.set(nf(speed / C, 2));
      ui.f?.set(siren ? `${hz(f0)} (900/700)` : hz(440));
      ui.heard?.set(heardF ? hz(heardF) : '–');
      const fs = siren ? 900 : 440;
      ui.pred?.set(`${hz((fs * C) / (C - speed))} / ${hz((fs * C) / (C + speed))}`);
      if (speed > 150 && !fastCheered && Math.abs(sNow) < 30) {
        fastCheered = true;
        s.cheer(
          L('Så snabbt! Se hur vågfronterna nästan hinner ikapp varandra framför bilen. Vid 343 m/s bildas en ljudbang.', 'So fast! See how the wave fronts almost pile up in front of the car. At 343 m/s you get a sonic boom.'),
          false,
        );
      }
    }
  }

  return { update, silence };
}
