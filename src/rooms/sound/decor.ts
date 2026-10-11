/** Decor for the Sound & Waves room: acoustic foam, posters, a tuning fork, a bench and plants. */
import * as THREE from 'three';
import { getLang, L, t } from '../../core/i18n';
import { nf, rbox, type Shared, type StationModule } from './common';

function posterCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { c, g, tex };
}

function framedPoster(s: Shared, tex: THREE.Texture, x: number, y: number, z: number, ry: number) {
  const grp = new THREE.Group();
  const frame = new THREE.Mesh(rbox(2.12, 1.37, 0.05, 0.02), s.mats.darkWood);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, color: 0xb4b0a8 }));
  pic.position.z = 0.027;
  grp.add(frame, pic);
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  s.ctx.group.add(grp);
}

const FONT = '"Baloo 2", "Nunito", system-ui, sans-serif';

function drawScale(g: CanvasRenderingContext2D) {
  const sv = getLang() === 'sv';
  g.fillStyle = '#efe2c6';
  g.fillRect(0, 0, 1024, 640);
  g.fillStyle = '#123a4a';
  g.font = `700 52px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t(L('Tonskalan i hertz', 'The musical scale in hertz')), 512, 56);
  const whites: [string, number][] = [
    ['C4', 261.63], ['D4', 293.66], ['E4', 329.63], ['F4', 349.23], ['G4', 392.0], ['A4', 440.0], [sv ? 'H4' : 'B4', 493.88], ['C5', 523.25],
  ];
  const kx = 72;
  const kw = 110;
  const ky = 110;
  const kh = 330;
  whites.forEach(([n, f], i) => {
    const x = kx + i * kw;
    const a4 = n === 'A4';
    g.fillStyle = a4 ? '#bdeeff' : '#ffffff';
    g.fillRect(x, ky, kw - 4, kh);
    g.strokeStyle = '#3b2a1e';
    g.lineWidth = 3;
    g.strokeRect(x, ky, kw - 4, kh);
    g.fillStyle = '#123a4a';
    g.font = `700 34px ${FONT}`;
    g.fillText(n, x + kw / 2 - 2, ky + kh - 70);
    g.font = `600 24px ${FONT}`;
    g.fillStyle = a4 ? '#0a6d93' : '#5a4636';
    g.fillText(nf(f, f % 1 === 0 ? 0 : 2), x + kw / 2 - 2, ky + kh - 30);
  });
  // black keys after C, D, F, G, A
  for (const i of [0, 1, 3, 4, 5]) {
    const x = kx + (i + 1) * kw - 34;
    g.fillStyle = '#2a2420';
    g.fillRect(x, ky, 62, kh * 0.58);
  }
  g.fillStyle = '#123a4a';
  g.font = `600 30px ${FONT}`;
  g.fillText(t(L('Kammartonen A4 = 440 Hz', 'Concert pitch A4 = 440 Hz')), 512, 490);
  g.font = `500 26px ${FONT}`;
  g.fillStyle = '#5a4636';
  g.fillText(
    sv
      ? 'Ett halvtonssteg: × 2^(1/12) ≈ 1,0595   ·   En oktav: × 2'
      : 'One semitone: × 2^(1/12) ≈ 1.0595   ·   One octave: × 2',
    512,
    540,
  );
  g.fillText(
    sv ? 'f = 440 Hz · 2^(n/12), n = antal halvtoner från A4' : 'f = 440 Hz · 2^(n/12), n = semitones from A4',
    512,
    585,
  );
}

function drawSpeeds(g: CanvasRenderingContext2D) {
  const sv = getLang() === 'sv';
  g.fillStyle = '#10222c';
  g.fillRect(0, 0, 1024, 640);
  g.fillStyle = '#8fe6ff';
  g.font = `700 52px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sv ? 'Hur snabbt går ljudet?' : 'How fast does sound travel?', 512, 56);
  const rows: [string, string, number][] = [
    [sv ? 'Propan' : 'Propane', '#ffb35c', 250],
    [sv ? 'Luft (20 °C)' : 'Air (20 °C)', '#8fe6ff', 343],
    [sv ? 'Helium' : 'Helium', '#c6a8ff', 1007],
    [sv ? 'Vatten' : 'Water', '#5ab0ff', 1480],
    [sv ? 'Stål' : 'Steel', '#d8dde4', 5900],
  ];
  rows.forEach(([name, col, v], i) => {
    const y = 140 + i * 72;
    g.textAlign = 'right';
    g.fillStyle = '#e8f6ff';
    g.font = `600 30px ${FONT}`;
    g.fillText(name, 230, y);
    const w = (v / 5900) * 560;
    g.fillStyle = col;
    g.fillRect(250, y - 20, Math.max(8, w), 40);
    g.textAlign = 'left';
    g.fillStyle = '#e8f6ff';
    g.fillText(`${nf(v)} m/s`, 260 + Math.max(8, w), y);
  });
  g.textAlign = 'center';
  g.font = `500 27px ${FONT}`;
  g.fillStyle = '#ffd9a0';
  g.fillText(
    sv ? 'Åska? Räkna sekunderna efter blixten och dela med 3:' : 'Thunder? Count the seconds after the flash and divide by 3:',
    512,
    535,
  );
  g.fillText(sv ? 'så många kilometer bort slog den ner.' : "that's how many kilometres away it struck.", 512, 575);
}

export function buildDecor(s: Shared): StationModule {
  const { ctx, mats } = s;
  const ac = ctx.sfx.ctx;

  // ---------------------------------------------------------------- acoustic foam (2 draw calls)
  const panels: { p: [number, number, number]; n: [number, number, number] }[] = [
    { p: [-7.45, 2.7, -8.97], n: [0, 0, 1] },
    { p: [-6.2, 2.7, -8.97], n: [0, 0, 1] },
    { p: [6.2, 2.9, -8.97], n: [0, 0, 1] },
    { p: [7.45, 2.9, -8.97], n: [0, 0, 1] },
    { p: [-9.97, 2.6, -3.0], n: [1, 0, 0] },
    { p: [9.97, 2.6, -2.0], n: [-1, 0, 0] },
    { p: [-6.0, 2.6, 8.97], n: [0, 0, -1] },
    { p: [6.0, 2.6, 8.97], n: [0, 0, -1] },
  ];
  const P = 5;
  const cell = 1.2 / P;
  const pyrGeo = new THREE.ConeGeometry(cell * 0.7071, 0.1, 4, 1);
  pyrGeo.rotateY(Math.PI / 4);
  pyrGeo.translate(0, 0.05, 0);
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const foam = new THREE.InstancedMesh(pyrGeo, foamMat, panels.length * P * P);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.24, 1.24, 0.04), mats.darkWood, panels.length);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const qPanel = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const cA = new THREE.Color(0x26303c);
  const cB = new THREE.Color(0x1d4552);
  let k = 0;
  panels.forEach((pn, pi) => {
    const n = new THREE.Vector3(...pn.n);
    q.setFromUnitVectors(up, n);
    qPanel.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.compose(new THREE.Vector3(...pn.p), qPanel, one);
    backs.setMatrixAt(pi, m);
    // in-plane axes
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(qPanel);
    const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(qPanel);
    for (let i = 0; i < P; i++) {
      for (let j = 0; j < P; j++) {
        v.set(...pn.p)
          .addScaledVector(ax, (i - (P - 1) / 2) * cell)
          .addScaledVector(ay, (j - (P - 1) / 2) * cell)
          .addScaledVector(n, 0.02);
        m.compose(v, q, one);
        foam.setMatrixAt(k, m);
        foam.setColorAt(k, pi % 2 === 0 ? cA : cB);
        k++;
      }
    }
  });
  ctx.group.add(foam, backs);

  // ---------------------------------------------------------------- posters
  const scale = posterCanvas();
  framedPoster(s, scale.tex, -9.95, 2.55, 3.0, Math.PI / 2);
  const speeds = posterCanvas();
  framedPoster(s, speeds.tex, 9.95, 2.55, 3.0, -Math.PI / 2);
  s.lang(() => {
    drawScale(scale.g);
    scale.tex.needsUpdate = true;
    drawSpeeds(speeds.g);
    speeds.tex.needsUpdate = true;
  });

  // ---------------------------------------------------------------- tuning fork on a resonance box
  const FX = 3.7;
  const FZ = 6.6;
  const ped = new THREE.Mesh(rbox(0.5, 0.9, 0.42, 0.04), mats.darkWood);
  ped.position.set(FX, 0.45, FZ);
  const box = new THREE.Mesh(rbox(0.34, 0.12, 0.17, 0.02), mats.wood);
  box.position.set(FX, 0.96, FZ);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), mats.black);
  hole.position.set(FX - 0.171, 0.96, FZ);
  hole.rotation.y = -Math.PI / 2;
  ctx.group.add(ped, box, hole);
  const fork = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8), mats.steel);
  stem.position.y = 0.04;
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), mats.steel);
  bridge.rotation.z = Math.PI;
  bridge.position.y = 0.1;
  const prongGeo = new THREE.BoxGeometry(0.012, 0.18, 0.012);
  const prongL = new THREE.Mesh(prongGeo, mats.steel);
  prongL.position.set(-0.022, 0.19, 0);
  const prongR = new THREE.Mesh(prongGeo, mats.steel);
  prongR.position.set(0.022, 0.19, 0);
  fork.add(stem, bridge, prongL, prongR);
  fork.position.set(FX, 1.02, FZ);
  ctx.group.add(fork);
  const plaqueC = document.createElement('canvas');
  plaqueC.width = 256;
  plaqueC.height = 64;
  const pg = plaqueC.getContext('2d')!;
  pg.fillStyle = '#c9a050';
  pg.fillRect(0, 0, 256, 64);
  pg.fillStyle = '#2a1c0c';
  pg.font = `700 34px ${FONT}`;
  pg.textAlign = 'center';
  pg.textBaseline = 'middle';
  pg.fillText('A4 = 440 Hz', 128, 33);
  const plaqueTex = new THREE.CanvasTexture(plaqueC);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.4, roughness: 0.4 }));
  plaque.position.set(FX, 0.75, FZ - 0.212);
  plaque.rotation.y = Math.PI;
  ctx.group.add(plaque);
  ctx.addCollider(FX, FZ, 0.55, 0.47);

  let ring = 0;
  let forkVoice: { osc: OscillatorNode; g: GainNode } | null = null;
  const stopFork = () => {
    if (!forkVoice) return;
    const now = ac.currentTime;
    forkVoice.g.gain.cancelScheduledValues(now);
    forkVoice.g.gain.setTargetAtTime(0, now, 0.03);
    forkVoice.osc.stop(now + 0.2);
    forkVoice = null;
  };
  ctx.interaction.add(fork, {
    label: L('Slå an stämgaffeln (440 Hz)', 'Strike the tuning fork (440 Hz)'),
    range: 4,
    onClick: () => {
      ctx.sfx.resume();
      stopFork();
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      osc.frequency.value = 440;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.005);
      g.gain.setTargetAtTime(0, now + 0.005, 1.4);
      // the strike also briefly sounds the "clang" mode (~6.25 × f)
      const clang = ac.createOscillator();
      clang.frequency.value = 440 * 6.25;
      const cg = ac.createGain();
      cg.gain.setValueAtTime(0.012, now);
      cg.gain.setTargetAtTime(0, now, 0.08);
      clang.connect(cg).connect(s.bus);
      clang.start(now);
      clang.stop(now + 0.6);
      osc.connect(g).connect(s.bus);
      osc.start(now);
      osc.stop(now + 8);
      forkVoice = { osc, g };
      osc.onended = () => {
        g.disconnect();
        if (forkVoice?.osc === osc) forkVoice = null;
      };
      ring = 1;
    },
  });

  // ---------------------------------------------------------------- bench and plants
  const seat = new THREE.Mesh(rbox(1.9, 0.08, 0.46, 0.03), mats.wood);
  seat.position.set(0, 0.46, 0.6);
  ctx.group.add(seat);
  for (const x of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(rbox(0.1, 0.42, 0.4, 0.02), mats.darkWood);
    leg.position.set(x, 0.21, 0.6);
    ctx.group.add(leg);
  }
  ctx.addCollider(0, 0.6, 1.95, 0.5);
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb4623c, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8, flatShading: true });
  const potGeo = new THREE.CylinderGeometry(0.26, 0.2, 0.5, 20);
  const leafGeo = new THREE.IcosahedronGeometry(0.42, 1);
  for (const [x, z] of [[-9.1, 8.1], [9.1, 8.1]] as const) {
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.set(x, 0.25, z);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 0.85, z);
    leaf.scale.set(1, 1.35, 1);
    ctx.group.add(pot, leaf);
    ctx.addCollider(x, z, 0.6, 0.6);
  }

  return {
    update(dt: number, time: number) {
      if (ring > 0.001) {
        ring *= Math.exp(-dt / 1.4);
        const w = Math.sin(time * 60) * 0.004 * ring;
        prongL.position.x = -0.022 - w;
        prongR.position.x = 0.022 + w;
      }
    },
    silence() {
      stopFork();
      ring = 0;
    },
  };
}
