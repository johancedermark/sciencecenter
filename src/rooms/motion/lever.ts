/** Station 5: lift a car (or an elephant) with one hand, using a lever and a movable fulcrum. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomContext, L10n } from '../../core/types';
import type { Meter, Readout } from '../../core/controlPanel';
import { L, t } from '../../core/i18n';
import { G } from './physics';
import { Batch, Board, FONT, StationState, buddyGate, fmt, mat, roundRect, stationFrame, wrap, type StationModule } from './common';

const PIV = 0.6;
const LOAD_X = -1.7;
const HAND_X = 1.95;
const BEAM_L0 = LOAD_X - 0.3;
const BEAM_L1 = HAND_X + 0.1;
const BEAM_T = 0.08;
const XF_MIN = LOAD_X + 0.06;
const XF_MAX = 0.3;

interface Load {
  name: L10n;
  kg: number;
  obj: THREE.Group;
}

function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const b = new Batch();
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8442f, roughness: 0.35, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.1, metalness: 0.2 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.8 });
  b.add(new RoundedBoxGeometry(0.46, 0.1, 0.22, 3, 0.035), paint, [0, 0.1, 0]);
  b.add(new RoundedBoxGeometry(0.25, 0.09, 0.2, 3, 0.035), glass, [-0.02, 0.18, 0]);
  b.add(new RoundedBoxGeometry(0.27, 0.02, 0.21, 2, 0.008), paint, [-0.02, 0.225, 0]);
  const wheel = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 18);
  for (const wx of [-0.15, 0.15]) for (const wz of [-0.11, 0.11]) b.add(wheel, tyre, [wx, 0.05, wz], [Math.PI / 2, 0, 0]);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  b.add(new THREE.SphereGeometry(0.015, 8, 6), lamp, [0.23, 0.11, 0.07]);
  b.add(new THREE.SphereGeometry(0.015, 8, 6), lamp, [0.23, 0.11, -0.07]);
  b.build(g);
  return g;
}

function buildElephant(): THREE.Group {
  const g = new THREE.Group();
  const b = new Batch();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d8f99, roughness: 0.85 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.4 });
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  b.add(sphere, skin, [0, 0.22, 0], [0, 0, 0], [0.2, 0.13, 0.12]);
  b.add(sphere, skin, [0.2, 0.28, 0], [0, 0, 0], [0.09, 0.085, 0.08]);
  b.add(sphere, skin, [0.17, 0.27, 0.085], [0, 0, 0], [0.05, 0.075, 0.012]);
  b.add(sphere, skin, [0.17, 0.27, -0.085], [0, 0, 0], [0.05, 0.075, 0.012]);
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.27, 0.26, 0), new THREE.Vector3(0.31, 0.2, 0), new THREE.Vector3(0.32, 0.12, 0), new THREE.Vector3(0.36, 0.08, 0),
  ]);
  b.add(new THREE.TubeGeometry(trunk, 16, 0.022, 8, false), skin);
  const leg = new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10);
  for (const lx of [-0.11, 0.1]) for (const lz of [-0.06, 0.06]) b.add(leg, skin, [lx, 0.07, lz]);
  const tusk = new THREE.ConeGeometry(0.01, 0.07, 8);
  b.add(tusk, ivory, [0.29, 0.2, 0.035], [0, 0, -2.2]);
  b.add(tusk, ivory, [0.29, 0.2, -0.035], [0, 0, -2.2]);
  b.add(new THREE.SphereGeometry(0.009, 8, 6), dark, [0.265, 0.31, 0.05]);
  b.add(new THREE.SphereGeometry(0.009, 8, 6), dark, [0.265, 0.31, -0.05]);
  b.add(new THREE.CylinderGeometry(0.006, 0.003, 0.1, 6), skin, [-0.21, 0.2, 0], [0, 0, 0.6]);
  b.build(g);
  return g;
}

export function buildLever(ctx: RoomContext, x: number, z: number, rotY: number, wallZ: number): StationModule {
  const { group, v, world, collider } = stationFrame(ctx, x, z, rotY);
  const st = new StationState(ctx, world);
  const buddy = buddyGate(ctx);

  // ---------------------------------------------------------------- static build
  const b = new Batch();
  b.add(new RoundedBoxGeometry(BEAM_L1 - BEAM_L0 + 0.3, 0.06, 0.8, 2, 0.025), mat.darkWood, [(BEAM_L0 + BEAM_L1) / 2, 0.03, 0]);
  // fulcrum rail
  b.add(new THREE.BoxGeometry(XF_MAX - XF_MIN + 0.3, 0.02, 0.06), mat.brass, [(XF_MIN + XF_MAX) / 2, 0.07, 0]);
  // rest block under the load end and soft stop under the hand end
  b.add(new RoundedBoxGeometry(0.12, PIV - 0.06, 0.3, 2, 0.02), mat.wood, [LOAD_X - 0.22, 0.06 + (PIV - 0.06) / 2, 0]);
  b.add(new RoundedBoxGeometry(0.16, 0.08, 0.3, 2, 0.03), mat.felt, [HAND_X, 0.1, 0]);
  b.build(group);

  // fulcrum (a brass triangular prism) – draggable
  const tri = new THREE.Shape();
  tri.moveTo(-0.1, 0);
  tri.lineTo(0.1, 0);
  tri.lineTo(0, PIV - 0.06);
  tri.closePath();
  const fulcrumGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.24, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
  fulcrumGeo.translate(0, 0.06, -0.12);
  const fulcrum = new THREE.Mesh(fulcrumGeo, mat.brass);
  group.add(fulcrum);

  // beam (pivot group at the fulcrum tip; beam offset so it stays fixed in x)
  const pivot = new THREE.Group();
  group.add(pivot);
  const beam = new THREE.Mesh(new RoundedBoxGeometry(BEAM_L1 - BEAM_L0, BEAM_T, 0.16, 2, 0.02), mat.paleWood);
  pivot.add(beam);
  const handle = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.6 }));
  grip.rotation.x = Math.PI / 2;
  const gripGlow = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 24), mat.glow);
  gripGlow.position.z = 0.16;
  handle.add(grip, gripGlow);
  pivot.add(handle);
  const platform = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.03, 0.3, 2, 0.01), mat.wood);
  pivot.add(platform);

  const loads: Load[] = [
    { name: L('Bil, 1 200 kg', 'Car, 1,200 kg'), kg: 1200, obj: buildCar() },
    { name: L('Elefant, 4 000 kg', 'Elephant, 4,000 kg'), kg: 4000, obj: buildElephant() },
  ];
  loads.forEach((l) => group.add(l.obj));

  // force sign above the hand end
  const s = {
    xf: -0.95,
    load: 0,
    strength: 40,
    a: 0,
    aTarget: 0,
    dragging: false,
    straining: false,
    lastCreak: 0,
    lifted: false,
    shown: '',
  };
  const d1 = () => s.xf - LOAD_X;
  const d2 = () => HAND_X - s.xf;
  const force = () => (loads[s.load].kg * d1()) / d2();
  const aMax = () => Math.asin(Math.min(0.99, (PIV - 0.16) / d2()));

  const sign = new Board(
    0.6,
    0.42,
    (g, w, h) => {
      const F = force();
      const ok = F <= s.strength;
      g.fillStyle = '#2b2018';
      roundRect(g, 0, 0, w, h, 26);
      g.fill();
      g.fillStyle = '#d9c7a8';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `600 ${Math.round(h * 0.13)}px ${FONT}`;
      g.fillText(t(L('Kraft på din hand', 'Force on your hand')), w / 2, h * 0.18);
      g.fillStyle = ok ? '#7cff6b' : '#ff6b5a';
      g.font = `800 ${Math.round(h * 0.34)}px ${FONT}`;
      g.fillText(`${fmt(F, F < 100 ? 1 : 0)} kg`, w / 2, h * 0.52);
      g.fillStyle = '#d9c7a8';
      g.font = `500 ${Math.round(h * 0.1)}px ${FONT}`;
      g.fillText(
        ok ? t(L(`Du orkar ${fmt(s.strength, 0)} kg: det går!`, `You manage ${fmt(s.strength, 0)} kg: you can do it!`)) : t(L(`Du orkar ${fmt(s.strength, 0)} kg: för tungt`, `You manage ${fmt(s.strength, 0)} kg: too heavy`)),
        w / 2,
        h * 0.84,
      );
    },
    { px: 512 },
  );
  (sign.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xc8c8c8);
  sign.mesh.position.set(HAND_X - 0.15, 1.45, -0.15);
  group.add(sign.mesh);
  const signPost = new Batch();
  signPost.add(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 8), mat.brass, [HAND_X - 0.15, 0.66, -0.2]);
  signPost.add(new RoundedBoxGeometry(0.64, 0.46, 0.03, 2, 0.01), mat.darkWood, [HAND_X - 0.15, 1.45, -0.172]);
  signPost.build(group);

  // Archimedes poster on the wall behind
  const poster = new Board(
    1.5,
    1.0,
    (g, w, h) => {
      g.fillStyle = '#efe2c6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a5a36';
      g.lineWidth = 10;
      g.strokeRect(14, 14, w - 28, h - 28);
      // little lever drawing: Earth on one end
      g.strokeStyle = '#3b2616';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(w * 0.12, h * 0.73);
      g.lineTo(w * 0.88, h * 0.6);
      g.stroke();
      g.fillStyle = '#3b2616';
      g.beginPath();
      g.moveTo(w * 0.3, h * 0.7);
      g.lineTo(w * 0.26, h * 0.82);
      g.lineTo(w * 0.34, h * 0.82);
      g.fill();
      g.fillStyle = '#4f86c6';
      g.beginPath();
      g.arc(w * 0.16, h * 0.62, h * 0.09, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5aa05a';
      g.beginPath();
      g.arc(w * 0.14, h * 0.6, h * 0.04, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b2616';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.font = `italic 700 ${Math.round(h * 0.075)}px Georgia, serif`;
      const quote = t(L('”Ge mig en plats att stå på, så ska jag flytta jorden.”', '"Give me a place to stand, and I shall move the Earth."'));
      wrap(g, quote, w * 0.84).forEach((line, i) => g.fillText(line, w * 0.08, h * 0.1 + i * h * 0.095));
      g.font = `600 ${Math.round(h * 0.055)}px ${FONT}`;
      g.fillText(t(L('Arkimedes, ca 250 f.Kr.', 'Archimedes, c. 250 BC')), w * 0.08, h * 0.34);
      g.font = `700 ${Math.round(h * 0.07)}px ${FONT}`;
      g.textAlign = 'right';
      g.fillText('F · d₂ = W · d₁', w * 0.9, h * 0.84);
    },
    { px: 1024, lit: true, transparent: false },
  );
  poster.mesh.position.set(0, 2.3, wallZ + 0.03);
  group.add(poster.mesh);

  collider(BEAM_L1 - BEAM_L0 + 0.3, 0.9, (BEAM_L0 + BEAM_L1) / 2, 0);

  // ---------------------------------------------------------------- state & interaction
  let meter: Meter | null = null;
  let rArms: Readout | null = null;
  let rRatio: Readout | null = null;
  let rTravel: Readout | null = null;
  let rWork: Readout | null = null;
  let fSlider: HTMLInputElement | null = null;

  const layout = () => {
    pivot.position.set(s.xf, PIV + 0.005, 0);
    pivot.rotation.z = -s.a;
    fulcrum.position.x = s.xf;
    const mid = (BEAM_L0 + BEAM_L1) / 2;
    beam.position.set(mid - s.xf, BEAM_T / 2, 0);
    handle.position.set(HAND_X - s.xf, BEAM_T + 0.03, 0);
    platform.position.set(LOAD_X - s.xf, BEAM_T + 0.015, 0);
    // load sits on the platform (world-local)
    const lx = LOAD_X - s.xf;
    const ly = BEAM_T + 0.03;
    const ca = Math.cos(-s.a);
    const sa = Math.sin(-s.a);
    loads.forEach((l, i) => {
      l.obj.visible = i === s.load;
      l.obj.position.set(s.xf + lx * ca - ly * sa, PIV + 0.005 + lx * sa + ly * ca, 0);
      l.obj.rotation.z = -s.a;
    });
  };

  const refresh = () => {
    const F = force();
    const key = `${fmt(F, 1)}|${s.strength}|${s.load}`;
    if (key !== s.shown) {
      s.shown = key;
      sign.redraw();
    }
    meter?.set(F / 150, `${fmt(F, F < 100 ? 1 : 0)} kg`);
    rArms?.set(`d₁ = ${fmt(d1(), 2)} m · d₂ = ${fmt(d2(), 2)} m`);
    rRatio?.set(`${fmt(d2() / d1(), 1)} ×`);
    rTravel?.set(t(L(`handen ${fmt((10 * d2()) / d1(), 0)} cm ner`, `hand ${fmt((10 * d2()) / d1(), 0)} cm down`)));
    const lift = d1() * Math.sin(s.a);
    const push = d2() * Math.sin(s.a);
    const W = loads[s.load].kg * G * lift;
    const Wh = F * G * push;
    rWork?.set(
      s.a > 0.002
        ? t(L(
          `last ${fmt(lift * 100, 1)} cm, hand ${fmt(push * 100, 1)} cm: ${fmt(W, 0)} J = ${fmt(Wh, 0)} J`,
          `load ${fmt(lift * 100, 1)} cm, hand ${fmt(push * 100, 1)} cm: ${fmt(W, 0)} J = ${fmt(Wh, 0)} J`,
        ))
        : t(L('tryck ner handtaget', 'push the handle down')),
    );
  };

  const setFulcrum = (xf: number) => {
    s.xf = Math.max(XF_MIN, Math.min(XF_MAX, xf));
    if (fSlider) fSlider.value = String(d1());
    layout();
    refresh();
  };

  const plane = new THREE.Plane();
  const nrm = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const setPlane = () => {
    group.updateMatrixWorld();
    nrm.set(0, 0, 1).transformDirection(group.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(nrm, group.localToWorld(tmp.set(0, 0, 0)));
  };

  ctx.interaction.add(fulcrum, {
    label: L('Dra stödet åt sidan', 'Drag the fulcrum sideways'),
    enabled: () => s.a < 0.01,
    onDragStart: setPlane,
    onDrag: (info) => {
      const p = info.onPlane(plane);
      if (!p) return;
      group.worldToLocal(p);
      const before = s.xf;
      setFulcrum(p.x);
      const now = performance.now() / 1000;
      if (Math.abs(s.xf - before) > 0.001 && now - s.lastCreak > 0.12) {
        s.lastCreak = now;
        ctx.sfx.noise(0.08, { freq: 700, gain: 0.05 });
      }
    },
  });

  let gripY0 = 0;
  ctx.interaction.add(handle, {
    label: L('Tryck ner handtaget', 'Push the handle down'),
    onDragStart: (info) => {
      setPlane();
      s.dragging = true;
      const p = info.onPlane(plane);
      gripY0 = p ? group.worldToLocal(p).y : PIV + BEAM_T;
    },
    onDrag: (info) => {
      const p = info.onPlane(plane);
      if (!p) return;
      group.worldToLocal(p);
      const drop = Math.max(0, gripY0 - p.y);
      const want = Math.asin(Math.min(Math.sin(aMax()), drop / d2()));
      if (force() <= s.strength) {
        s.aTarget = want;
        s.straining = false;
      } else {
        s.aTarget = 0;
        s.straining = want > 0.01;
      }
    },
    onDragEnd: () => {
      s.dragging = false;
      s.straining = false;
      s.aTarget = 0;
    },
  });

  ctx.addStation(
    st.hook({
      id: 'motion-lever',
      title: L('Lyft en bil med handen', 'Lift a car with your hand'),
      position: [x, z],
      viewpoint: { position: v(0.8, 1.6, 3.0), target: v(0.8, 0.8, 0) },
      intro: L(
        'Kan du lyfta en bil med en hand? Med en tillräckligt lång hävstång kan du det. Hitta rätt plats för stödet!',
        'Can you lift a car with one hand? With a long enough lever, you can. Find the right spot for the fulcrum!',
      ),
      howTo: L(
        'Dra mässingsstödet åt sidan (eller använd reglaget) och tryck sedan ner handtaget. Är kraften större än du orkar rör sig inget. Prova elefanten också!',
        "Drag the brass fulcrum sideways (or use the slider), then push the handle down. If the force is more than you can manage, nothing moves. Try the elephant too!",
      ),
      science: L(
        'En hävstång är i jämvikt när kraft × arm är lika på båda sidor: F · d₂ = W · d₁. Flyttar du stödet nära bilen blir lastens arm d₁ kort och din arm d₂ lång, så kraften du behöver blir W · d₁/d₂. Men inget är gratis: när bilen lyfts 10 cm måste din hand röra sig d₂/d₁ gånger längre. Arbetet, kraft × sträcka, är lika stort på båda sidor, energin bevaras. Vi räknar här med en viktlös och helt stel stång.',
        'A lever balances when force × arm is equal on both sides: F · d₂ = W · d₁. Move the fulcrum close to the car and the load arm d₁ gets short while your arm d₂ gets long, so the force you need is W · d₁/d₂. But nothing is free: when the car rises 10 cm, your hand has to move d₂/d₁ times further. The work, force × distance, is the same on both sides; energy is conserved. Here we treat the bar as weightless and perfectly stiff.',
      ),
      wow: L(
        'Arkimedes sa: ”Ge mig en plats att stå på, så ska jag flytta jorden.” Med 50 kg kraft och 1 m kort arm skulle den långa armen behöva vara cirka 1,2·10²³ m, ungefär 13 miljoner ljusår lång.',
        'Archimedes said: "Give me a place to stand, and I shall move the Earth." With 50 kg of force and a 1 m short arm, the long arm would have to be about 1.2·10²³ m, roughly 13 million light-years long.',
      ),
      controls: (panel) => {
        panel.buttons(
          loads.map((l, i) => ({
            label: l.name,
            icon: i === 0 ? '🚗' : '🐘',
            onClick: () => {
              s.load = i;
              s.a = s.aTarget = 0;
              layout();
              refresh();
              ctx.sfx.pop();
            },
          })),
          s.load,
        );
        fSlider = panel.slider(
          L('Lastens arm d₁ (stödets läge)', 'Load arm d₁ (fulcrum position)'),
          { min: XF_MIN - LOAD_X, max: XF_MAX - LOAD_X, step: 0.01, value: d1(), format: (val) => `${fmt(val, 2)} m` },
          (val) => setFulcrum(LOAD_X + val),
        );
        panel.slider(
          L('Hur mycket orkar du trycka?', 'How hard can you push?'),
          { min: 10, max: 100, step: 1, value: s.strength, format: (val) => `${fmt(val, 0)} kg` },
          (val) => {
            s.strength = val;
            refresh();
          },
        );
        meter = panel.meter(L('Kraft på din hand (kg)', 'Force on your hand (kg)'), '#7cff6b');
        rArms = panel.readout(L('Armar', 'Arms'));
        rRatio = panel.readout(L('Utväxling d₂/d₁', 'Advantage d₂/d₁'));
        rTravel = panel.readout(L('Lyft 10 cm ⇒', 'Lift 10 cm ⇒'));
        rWork = panel.readout(L('Arbete', 'Work'));
        refresh();
        return () => {
          meter = null;
          rArms = rRatio = rTravel = rWork = null;
          fSlider = null;
        };
      },
    }),
  );

  layout();
  refresh();

  return {
    update(dt, time) {
      gripGlow.scale.setScalar(1 + 0.12 * Math.sin(time * 3));
      if (!st.near()) return;
      const prev = s.a;
      s.a += (s.aTarget - s.a) * Math.min(1, dt * (s.dragging ? 14 : 4));
      if (Math.abs(s.a) < 1e-4 && s.aTarget === 0) s.a = 0;
      let jitter = 0;
      if (s.straining) {
        jitter = 0.003 * Math.sin(time * 70);
        const now = performance.now() / 1000;
        if (now - s.lastCreak > 0.5) {
          s.lastCreak = now;
          ctx.sfx.tone(70, 0.3, { type: 'sawtooth', gain: 0.04, to: 55 });
          buddy.say(L('För tungt! Flytta stödet närmare lasten, så blir din arm längre.', 'Too heavy! Move the fulcrum closer to the load so your arm gets longer.'), { expression: 'determined' });
        }
      }
      const real = s.a;
      s.a = real + jitter;
      layout();
      s.a = real;
      if (Math.abs(s.a - prev) > 1e-5) refresh();
      if (!s.lifted && s.a > aMax() * 0.8) {
        s.lifted = true;
        buddy.celebrate(
          s.load === 0
            ? L(`Du lyfte en bil på 1 200 kg med bara ${fmt(force(), 0)} kg kraft!`, `You lifted a 1,200 kg car with just ${fmt(force(), 0)} kg of force!`)
            : L(`En hel elefant, med bara ${fmt(force(), 0)} kg kraft!`, `A whole elephant, with just ${fmt(force(), 0)} kg of force!`),
        );
        ctx.sfx.chime();
      }
      if (s.a < 0.005) s.lifted = false;
    },
  };
}
