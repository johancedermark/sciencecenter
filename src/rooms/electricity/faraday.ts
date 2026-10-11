/**
 * Station 2: Faraday's magnet and coil, and the Lenz tubes.
 *
 * Coil: the bar magnet is modelled as two magnetic poles (±q at its ends). The B-flux through one loop
 * of radius a at axial distance z from a pole is μ0·q/2·(±1 − z/√(z²+a²)); the ±1 parts cancel for a
 * whole magnet, and averaging z/√(z²+a²) over the length of the coil has the closed form
 * [√(z²+a²)] / ℓ. So Φ is exact for this model and the needle follows EMF = −dΦ/dt.
 *
 * Tubes: eddy-current drag F = k·v gives terminal velocity v_t = m·g/k almost at once
 * (time constant v_t/g ≈ 10 ms). k is fitted to the Leybold times for a 50 cm tube:
 * copper 5,0 s, aluminium 3,7 s, plastic 0,3 s (free fall).
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import {
  AnalogMeter, Cheers, Every, Lcd, StationFrame, Wire, bakeStatic, canvasPlane, clamp, ease, fmt, mats, put, rbox, sign, workbench,
} from './shared';

const MU0 = 4e-7 * Math.PI;
const Q_POLE = 288; // A·m: ferrite bar magnet, M ≈ 3,2·10⁵ A/m, 3 × 3 cm cross-section
const POLE_SEP = 0.12; // m between the effective poles of the 15 cm magnet
const COIL_A = 0.05; // m, mean coil radius
const COIL_LEN = 0.16; // m
const R_PER_TURN = 0.02; // Ω
const R_GALV = 20; // Ω
const FULL_SCALE = 20; // mA
const G = 9.81;
const TUBE_LEN = 0.5;

interface Tube {
  name: { sv: string; en: string };
  x: number;
  vt: number; // terminal velocity m/s (0 = no eddy currents)
  mat: THREE.Material;
  y: number; // magnet centre
  v: number;
  state: 'ready' | 'falling' | 'landed' | 'lifting';
  time: number;
  best: number;
  timer: number;
  magnet: THREE.Mesh;
  rings: THREE.Mesh[];
  ringMat: THREE.MeshBasicMaterial;
  lcd: Lcd;
  tubeMesh: THREE.Mesh;
}

export function buildFaraday(ctx: RoomContext, cheers: Cheers) {
  const m = mats();
  const st = new StationFrame(ctx, 6.0, -5.0, -Math.PI / 5);
  const g = st.group;
  workbench(g, 2.6, 1.0);
  st.collider(2.75, 1.15);

  // ================================================================= coil and galvanometer
  const XC = -0.62; // coil centre (local x)
  const YC = 1.06;
  const ZC = 0.12;
  let turns = 200;
  let xm = -0.25; // magnet centre
  let xTarget = xm;
  let grabOff = 0;
  let flipAngle = 0; // 0 = N pole pointing +x (towards the right)
  let flipTarget = 0;
  let phiPrev = 0;
  let emf = 0;
  let current = 0; // mA
  let vMag = 0;
  let maxSeen = 0;
  let seenPos = false;
  let seenNeg = false;
  let draggingMag = false;
  let magHover = false;
  let focused = false;

  // wooden rail with brass guides
  put(g, rbox(1.25, 0.04, 0.1, 0.015), m.darkWood, -0.62, 0.93, ZC);
  for (const x of [-1.22, -0.02]) put(g, rbox(0.04, 0.12, 0.1, 0.012), m.brass, x, 0.97, ZC);
  // coil former and winding
  const coilCanvas = document.createElement('canvas');
  coilCanvas.width = 32;
  coilCanvas.height = 64;
  const cc = coilCanvas.getContext('2d')!;
  for (let y = 0; y < 64; y += 2) {
    cc.fillStyle = y % 4 === 0 ? '#e0925a' : '#9c5428';
    cc.fillRect(0, y, 32, 2);
  }
  const coilTex = new THREE.CanvasTexture(coilCanvas);
  coilTex.colorSpace = THREE.SRGBColorSpace;
  coilTex.wrapS = coilTex.wrapT = THREE.RepeatWrapping;
  const coilMat = new THREE.MeshStandardMaterial({ map: coilTex, roughness: 0.35, metalness: 0.75 });
  const coilGeo = new THREE.CylinderGeometry(0.068, 0.068, COIL_LEN, 32, 1, true);
  put(g, coilGeo, coilMat, XC, YC, ZC, 0, 0, Math.PI / 2, false);
  const coilInner = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8, side: THREE.BackSide });
  put(g, new THREE.CylinderGeometry(0.04, 0.04, COIL_LEN + 0.02, 24, 1, true), coilInner, XC, YC, ZC, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    put(g, new THREE.RingGeometry(0.04, 0.085, 32), m.darkWood, XC + sx * (COIL_LEN / 2 + 0.01), YC, ZC, 0, sx * Math.PI / 2);
    put(g, new THREE.RingGeometry(0.04, 0.085, 32), m.darkWood, XC + sx * (COIL_LEN / 2 + 0.01), YC, ZC, 0, -sx * Math.PI / 2);
  }
  put(g, rbox(0.06, 0.1, 0.08, 0.015), m.darkWood, XC, 0.97, ZC);
  const setTurnsVisual = () => {
    coilTex.repeat.set(1, turns / 32);
    coilTex.needsUpdate = true;
  };
  setTurnsVisual();
  const turnsSign = sign(() => `${turns} ${t(L('varv', 'turns'))}`, 0.2, 0.05);
  turnsSign.mesh.position.set(XC, 0.97, ZC + 0.11);
  turnsSign.mesh.rotation.x = -0.4;
  g.add(turnsSign.mesh);

  // magnet: red N half, blue S half
  const magnet = new THREE.Group();
  magnet.userData.dynamic = true;
  magnet.position.set(xm, YC, ZC);
  g.add(magnet);
  put(magnet, rbox(0.075, 0.03, 0.03, 0.006), m.magnetRed, 0.0375, 0, 0);
  put(magnet, rbox(0.075, 0.03, 0.03, 0.006), m.magnetBlue, -0.0375, 0, 0);
  bakeStatic(magnet);
  const nsTag = canvasPlane(0.14, 0.026, 256, 48, (c2, W, H) => {
    c2.font = '800 38px system-ui, sans-serif';
    c2.fillStyle = '#fff';
    c2.textBaseline = 'middle';
    c2.textAlign = 'left';
    c2.fillText('S', 16, H / 2);
    c2.textAlign = 'right';
    c2.fillText('N', W - 16, H / 2);
  }, { transparent: true });
  nsTag.mesh.position.z = 0.0155;
  magnet.add(nsTag.mesh);
  const magHit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.08), new THREE.MeshBasicMaterial({ visible: false }));
  magnet.add(magHit);
  const magGlow = new THREE.MeshBasicMaterial({ color: ctx.accent, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const magOutline = new THREE.Mesh(rbox(0.16, 0.04, 0.04, 0.01), magGlow);
  magnet.add(magOutline);

  // galvanometer
  const galv = new AnalogMeter(g, {
    min: -FULL_SCALE, max: FULL_SCALE, ticks: [-20, -10, 0, 10, 20], unit: 'mA',
    title: () => t(L('Galvanometer', 'Galvanometer')), size: 0.44, freq: 2.2, damping: 0.45,
  });
  galv.group.position.set(XC, 1.42, -0.22);
  galv.group.rotation.x = -0.12;
  put(g, rbox(0.08, 0.4, 0.08, 0.02), m.darkWood, XC, 1.1, -0.26);
  const wA = new Wire(g, [[XC - COIL_LEN / 2, YC - 0.05, ZC], [XC - 0.2, 0.95, -0.05], [XC - 0.15, 1.2, -0.22]], m.rubberRed, { beads: 10 });
  const wB = new Wire(g, [[XC + COIL_LEN / 2, YC - 0.05, ZC], [XC + 0.2, 0.95, -0.05], [XC + 0.15, 1.2, -0.22]], m.rubberBlack, { beads: 10 });

  const fluxAt = (x: number, s: number) => {
    // s = cos(flip angle): the axial projection of the magnet
    const xN = x + (s * POLE_SEP) / 2;
    const xS = x - (s * POLE_SEP) / 2;
    const F = (xp: number) => {
      const z2 = XC + COIL_LEN / 2 - xp;
      const z1 = XC - COIL_LEN / 2 - xp;
      return Math.sqrt(z2 * z2 + COIL_A * COIL_A) - Math.sqrt(z1 * z1 + COIL_A * COIL_A);
    };
    return turns * ((MU0 * Q_POLE) / (2 * COIL_LEN)) * (F(xS) - F(xN));
  };
  phiPrev = fluxAt(xm, 1);

  const plane = new THREE.Plane();
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const localX = (info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) => {
    g.updateMatrixWorld();
    nrm.set(0, 0, 1).transformDirection(g.matrixWorld);
    tmp.set(xm, YC, ZC);
    g.localToWorld(tmp);
    plane.setFromNormalAndCoplanarPoint(nrm, tmp);
    const p = info.onPlane(plane);
    if (!p) return null;
    return g.worldToLocal(p).x;
  };
  const flip = () => {
    flipTarget += Math.PI;
    ctx.sfx.whoosh();
  };
  ctx.interaction.add(magnet, {
    label: L('Dra magneten · klicka för att vända den', 'Drag the magnet · click to flip it'),
    onHover: (on) => { magHover = on; },
    onDragStart: (info) => {
      const x = localX(info);
      if (x === null) return;
      draggingMag = true;
      grabOff = xm - x;
      ctx.sfx.resume();
    },
    onDrag: (info) => {
      const x = localX(info);
      if (x === null) return;
      xTarget = clamp(x + grabOff, -1.12, -0.1);
    },
    onDragEnd: () => { draggingMag = false; },
    onClick: () => flip(),
  });

  // ================================================================= Lenz tubes
  const Y_BOT = 1.0;
  const Y_TOP = Y_BOT + TUBE_LEN;
  // frame
  put(g, rbox(1.05, 0.05, 0.3, 0.02), m.darkWood, 0.7, 0.925, 0);
  for (const x of [0.18, 1.22]) put(g, rbox(0.05, 0.75, 0.05, 0.015), m.darkWood, x, 1.29, -0.05);
  put(g, rbox(1.1, 0.05, 0.08, 0.015), m.brass, 0.7, Y_TOP + 0.16, -0.05);
  put(g, rbox(1.06, 0.03, 0.06, 0.01), m.brass, 0.7, Y_BOT + 0.02, -0.05);
  let nitrogen = false;
  const copperCold = new THREE.MeshStandardMaterial({ color: 0xd9824f, roughness: 0.32, metalness: 0.9 });
  const acrylic = new THREE.MeshStandardMaterial({ color: 0xd8f0ff, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const neoMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.2, metalness: 0.95 });
  const magGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.025, 20);
  const ringGeo = new THREE.TorusGeometry(0.029, 0.0032, 6, 28);
  const tubeGeo = new THREE.CylinderGeometry(0.022, 0.022, TUBE_LEN, 28, 1, true);
  // v_t fitted: copper 0,5 m / 5,0 s = 0,100 m/s, aluminium 0,5 / 3,7 = 0,135 m/s
  const VT_CU = 0.1;
  const tubes: Tube[] = [
    { name: L('Koppar', 'Copper'), x: 0.38, vt: VT_CU, mat: copperCold },
    { name: L('Aluminium', 'Aluminium'), x: 0.7, vt: 0.5 / 3.7, mat: m.aluminium },
    { name: L('Plast', 'Plastic'), x: 1.02, vt: 0, mat: acrylic },
  ].map((d) => {
    const tubeMesh = put(g, tubeGeo, d.mat, d.x, Y_BOT + TUBE_LEN / 2, 0, 0, 0, 0, false);
    put(g, new THREE.TorusGeometry(0.022, 0.004, 6, 24), m.brass, d.x, Y_TOP + 0.002, 0, Math.PI / 2);
    // clip holding the magnet above the mouth
    put(g, rbox(0.02, 0.14, 0.02, 0.006), m.brass, d.x, Y_TOP + 0.08, -0.04);
    // catch cup
    put(g, new THREE.CylinderGeometry(0.045, 0.04, 0.035, 20), m.felt, d.x, 0.95, 0);
    const magnetMesh = put(g, magGeo, neoMat, d.x, Y_TOP + 0.0125, 0, 0, 0, 0, false);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a3c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const rings = [0, 1].map(() => {
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.rotation.x = Math.PI / 2;
      g.add(r);
      return r;
    });
    const lcd = new Lcd(0.17, 0.06);
    lcd.plane.mesh.position.set(d.x, Y_TOP + 0.16, -0.008);
    g.add(lcd.plane.mesh);
    lcd.set(fmt(0, 2) + ' s');
    const label = sign(() => t(d.name), 0.2, 0.05);
    label.mesh.position.set(d.x, 0.97, 0.12);
    label.mesh.rotation.x = -0.4;
    g.add(label.mesh);
    const tb: Tube = {
      ...d, y: Y_TOP + 0.0125, v: 0, state: 'ready', time: 0, best: 0, timer: 0,
      magnet: magnetMesh, rings, ringMat, lcd, tubeMesh,
    };
    return tb;
  });

  const drop = (tb: Tube) => {
    if (tb.state !== 'ready') return;
    tb.state = 'falling';
    tb.v = 0;
    tb.timer = 0;
    tb.time = 0;
    ctx.sfx.resume();
    ctx.sfx.tone(880, 0.06, { type: 'triangle', gain: 0.06 });
  };
  for (const tb of tubes) {
    const h = { label: L(`Släpp magneten i ${tb.name.sv.toLowerCase()}röret`, `Drop the magnet into the ${tb.name.en.toLowerCase()} tube`), onClick: () => drop(tb) };
    ctx.interaction.add(tb.tubeMesh, h);
    ctx.interaction.add(tb.magnet, h);
  }

  // ================================================================= HUD
  let hud: null | {
    flux: Readout; emf: Readout; cur: Readout; speed: Readout;
    times: Readout[];
    setTurns: (i: number) => void;
  } = null;
  const turnOptions = [50, 100, 200];
  const controls = (panel: ControlPanel) => {
    panel.heading(L('Magnet och spole', 'Magnet and coil'));
    const setTurns = panel.buttons(turnOptions.map((n) => ({
      label: L(`${n} varv`, `${n} turns`),
      onClick: () => {
        turns = n;
        setTurnsVisual();
        turnsSign.redraw();
        phiPrev = fluxAt(xm, Math.cos(flipAngle));
      },
    })), turnOptions.indexOf(turns));
    panel.button(L('Vänd magneten', 'Flip the magnet'), flip, { icon: '🔄' });
    const flux = panel.readout(L('Magnetiskt flöde genom spolen (N·Φ)', 'Magnetic flux linkage (N·Φ)'));
    const emf = panel.readout(L('Inducerad spänning', 'Induced voltage'));
    const cur = panel.readout(L('Ström i galvanometern', 'Current in the galvanometer'));
    const speed = panel.readout(L('Magnetens fart', 'Magnet speed'));
    panel.heading(L('Lenz-rören (50 cm)', 'The Lenz tubes (50 cm)'));
    panel.note(L('Gissa först: vilken magnet kommer ut sist? Magneterna är likadana, bara rören skiljer.', 'Guess first: which magnet comes out last? The magnets are identical; only the tubes differ.'));
    panel.buttons(tubes.map((tb) => ({ label: tb.name, onClick: () => drop(tb) })));
    panel.button(L('Släpp alla tre samtidigt!', 'Drop all three at once!'), () => tubes.forEach(drop), { primary: true, icon: '🏁' });
    panel.toggle(L('Kyl kopparröret till −196 °C (flytande kväve)', 'Cool the copper tube to −196 °C (liquid nitrogen)'), nitrogen, (v) => {
      nitrogen = v;
      // copper conducts about 7× better at 77 K, so the eddy-current drag is about 7× stronger
      tubes[0].vt = v ? VT_CU / 7 : VT_CU;
      copperCold.color.setHex(v ? 0xe9d4cf : 0xd9824f);
      copperCold.roughness = v ? 0.75 : 0.32;
      tubes[0].best = 0;
      if (v) cheers.say('far-ln2', L('Brrr! Kall koppar leder ström ungefär sju gånger bättre – vad tror du händer nu?', 'Brrr! Cold copper conducts about seven times better. What do you think happens now?'), { expression: 'thinking' });
    });
    const times = tubes.map((tb) => panel.readout(tb.name));
    hud = { flux, emf, cur, speed, times, setTurns };
    return () => { hud = null; };
  };

  ctx.addStation({
    id: 'electricity-faraday',
    title: L('Magnet, spole och Lenz-rör', 'Magnet, coil and Lenz tubes'),
    position: [6.0, -5.0],
    viewpoint: st.view([0.25, 1.72, 2.45], [0.25, 1.15, 0]),
    intro: L(
      'Michael Faraday upptäckte 1831 att en magnet i rörelse kan skapa ström. Prova själv – och släpp sedan magneter genom rören!',
      'In 1831 Michael Faraday discovered that a moving magnet can make a current. Try it yourself, then drop magnets through the tubes!',
    ),
    howTo: L(
      'Dra magneten in i och ut ur spolen och titta på nålen. Klicka på magneten för att vända den. Klicka på ett rör för att släppa en magnet.',
      'Drag the magnet in and out of the coil and watch the needle. Click the magnet to flip it. Click a tube to drop a magnet.',
    ),
    science: L(
      'Det är inte magneten i sig som ger ström, utan förändringen: spänningen är e = −N·dΦ/dt, där Φ är det magnetiska flödet genom varje varv. Står magneten still blir det noll, hur stark den än är. In och ut ger motsatt riktning, liksom att vända magneten, och fler varv eller snabbare rörelse ger mer ström. I rören gör samma sak att virvelströmmar uppstår i metallväggen; deras magnetfält motverkar rörelsen (Lenz lag), så magneten når en gränshastighet på bara 0,1 m/s i koppar och tar 5,0 s genom 50 cm. Koppar är inte magnetiskt alls – det leder bara ström bra (5,96·10⁷ S/m mot aluminiums 3,77·10⁷), och i plaströret faller magneten fritt på 0,3 s.',
      'It is not the magnet itself that makes the current, but the change: the voltage is e = −N·dΦ/dt, where Φ is the magnetic flux through each turn. If the magnet stands still you get zero, however strong it is. In and out give opposite directions, and so does flipping the magnet, while more turns or faster motion give more current. In the tubes the same thing drives eddy currents in the metal wall; their magnetic field opposes the motion (Lenz’s law), so the magnet reaches a terminal speed of only 0.1 m/s in copper and takes 5.0 s through 50 cm. Copper is not magnetic at all, it just conducts very well (5.96·10⁷ S/m against aluminium’s 3.77·10⁷), and in the plastic tube the magnet falls freely in 0.3 s.',
    ),
    wow: L(
      'Rören blir faktiskt en aning varma: magnetens lägesenergi blir värme i metallen. Samma virvelströmsbroms används i berg- och dalbanor och tåg – den slits aldrig.',
      'The tubes actually get a tiny bit warm: the magnet’s lost height energy becomes heat in the metal. The same eddy-current brake is used on roller coasters and trains, and it never wears out.',
    ),
    controls,
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; draggingMag = false; },
  });

  // ================================================================= update
  const hudTick = new Every(0.1);
  let flipVisual = 0;
  let idleHint = 0;
  function update(dt: number, time: number) {
    if (!focused && !st.near(8)) return;
    // --- magnet and coil
    const xPrev = xm;
    xm += (xTarget - xm) * ease(dt, 0.025);
    flipVisual += (flipTarget - flipVisual) * ease(dt, 0.09);
    flipAngle = flipVisual;
    magnet.position.x = xm;
    magnet.rotation.y = flipAngle;
    vMag += ((xm - xPrev) / Math.max(dt, 1e-4) - vMag) * ease(dt, 0.04);
    const phi = fluxAt(xm, Math.cos(flipAngle));
    const emfRaw = -(phi - phiPrev) / Math.max(dt, 1e-4);
    phiPrev = phi;
    emf += (emfRaw - emf) * ease(dt, 0.02);
    current = (emf / (turns * R_PER_TURN + R_GALV)) * 1000;
    galv.set(current);
    galv.update(dt);
    const lvl = Math.abs(current) / FULL_SCALE;
    wA.set(lvl, Math.sign(current));
    wB.set(lvl, -Math.sign(current));
    wA.update(dt);
    wB.update(dt);
    if (!draggingMag && Math.abs(vMag) < 0.01) idleHint += dt;
    else idleHint = 0;
    magGlow.opacity = magHover ? 0.25 : 0.14 * (0.5 + 0.5 * Math.sin(time * 3)) * clamp(idleHint - 2, 0, 1);

    // milestones
    maxSeen = Math.max(maxSeen, Math.abs(current));
    if (current > FULL_SCALE * 0.25) seenPos = true;
    if (current < -FULL_SCALE * 0.25) seenNeg = true;
    if (Math.abs(current) > FULL_SCALE * 0.35) {
      cheers.say('far-first', L('Nålen slog ut! Rörelse genom spolen ger ström. Vad händer om du drar ut den igen?', 'The needle kicked! Motion through the coil makes a current. What happens when you pull it out again?'), { celebrate: true });
    }
    if (seenPos && seenNeg) {
      cheers.say('far-both', L('Precis! In åt ena hållet, ut åt det andra. Strömmen följer förändringen, inte magneten.', 'Exactly! In one way, out the other. The current follows the change, not the magnet.'), { expression: 'idea' });
    }
    if (Math.abs(current) > FULL_SCALE * 1.02) {
      cheers.say('far-peg', L('Nålen slog i stoppet! Fler varv och snabb rörelse ger mycket ström.', 'The needle hit the stop! More turns and fast motion give lots of current.'), { expression: 'surprised' });
    }

    // --- tubes (exact solution of v' = g − (g/v_t)·v inside, free fall outside)
    for (const tb of tubes) {
      if (tb.state === 'falling') {
        tb.time += dt;
        const n = Math.ceil(dt / 0.002);
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          const inside = tb.y < Y_TOP && tb.y > Y_BOT && tb.vt > 0;
          if (inside) {
            const kk = G / tb.vt;
            const e = Math.exp(-kk * h);
            const vNew = tb.vt + (-tb.v - tb.vt) * e; // speed downward
            const dy = tb.vt * h + (-tb.v - tb.vt) * (1 - e) / kk;
            tb.v = -vNew;
            tb.y -= dy;
          } else {
            tb.v -= G * h;
            tb.y += tb.v * h;
          }
          if (tb.y - 0.0125 < Y_BOT && tb.timer === 0) {
            tb.timer = tb.time; // left the tube mouth: stop the clock
            tb.best = tb.timer;
          }
          if (tb.y <= 0.98) {
            tb.y = 0.98;
            tb.v = 0;
            tb.state = 'landed';
            tb.time = 0;
            ctx.sfx.tone(320, 0.05, { type: 'square', gain: 0.05 });
            ctx.sfx.noise(0.08, { freq: 2000, gain: 0.08 });
            break;
          }
        }
        tb.lcd.set(`${fmt(tb.timer || tb.time, 2)} s`);
      } else if (tb.state === 'landed') {
        tb.time += dt;
        if (tb.time > 2.2) { tb.state = 'lifting'; tb.time = 0; }
      } else if (tb.state === 'lifting') {
        // a helper arm lifts it back to the clip (in reality: you carry it back)
        tb.y += (Y_TOP + 0.0125 - tb.y) * ease(dt, 0.25);
        if (Math.abs(tb.y - Y_TOP - 0.0125) < 0.002) {
          tb.y = Y_TOP + 0.0125;
          tb.state = 'ready';
          tb.timer = 0;
        }
      }
      tb.magnet.position.y = tb.y;
      tb.magnet.position.x = tb.x + (tb.state === 'lifting' ? 0.06 * Math.sin(Math.PI * clamp((tb.y - 0.98) / (Y_TOP - 0.97), 0, 1)) : 0);
      // eddy-current rings glow around the magnet while it moves inside the metal
      const inside = tb.vt > 0 && tb.y < Y_TOP && tb.y > Y_BOT && tb.state === 'falling';
      // at terminal speed the braking force equals m·g in every metal, so the glow follows speed / v_t
      const glow = inside ? clamp(-tb.v / tb.vt, 0, 1) * 0.75 : 0;
      tb.ringMat.opacity += (glow - tb.ringMat.opacity) * ease(dt, 0.05);
      tb.rings[0].position.set(tb.x, tb.y + 0.03, 0);
      tb.rings[1].position.set(tb.x, tb.y - 0.03, 0);
      tb.rings[0].visible = tb.rings[1].visible = tb.ringMat.opacity > 0.01;
    }
    const cu = tubes[0], pl = tubes[2];
    if (cu.timer > 0 && pl.timer > 0 && cu.timer > 4) {
      cheers.say('far-race', L(
        `Plaströret: ${fmt(pl.timer, 1)} s. Kopparröret: ${fmt(cu.timer, 1)} s! Virvelströmmarna bromsar magneten utan att röra den.`,
        `Plastic tube: ${fmt(pl.timer, 1)} s. Copper tube: ${fmt(cu.timer, 1)} s! The eddy currents brake the magnet without touching it.`,
      ), { celebrate: true });
    }

    if (hud && hudTick.tick(dt)) {
      hud.flux.set(`${fmt(phi * 1000, 1)} mWb`);
      hud.emf.set(`${fmt(emf * 1000, 0)} mV`);
      hud.cur.set(`${fmt(current, 1)} mA`);
      hud.speed.set(`${fmt(Math.abs(vMag), 2)} m/s`);
      tubes.forEach((tb, i) => {
        const tt = tb.timer || (tb.state === 'falling' ? tb.time : tb.best);
        hud!.times[i].set(tt > 0 ? `${fmt(tt, 2)} s` : '–');
      });
    }
  }

  return { update };
}
