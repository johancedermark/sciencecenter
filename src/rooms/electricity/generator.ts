/**
 * Station 1: the hand-crank generator.
 * A crank (inertia, hand modelled as a torque-limited spring towards the pointer) drives a
 * bar magnet 10:1 through a belt. The magnet spins between two coils: e = N·B·A·ω·sin(ωt).
 * Current through the chosen load gives the Lenz back-torque τ = k_e·i·sinθ (exact per sub-step),
 * so the incandescent bulb makes the crank heavy and stops it fast when you let go.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import {
  Cheers, Every, FONT, StationFrame, Wire, canvasPlane, clamp, ease, fmt, halo, mats, put, rbox, sign, workbench, bakeStatic,
} from './shared';

// ---- physical model (SI units)
const N_TURNS = 200;
const B_FIELD = 0.5; // T
const AREA = 15.1e-4; // m²
const K_E = N_TURNS * B_FIELD * AREA; // V·s/rad  (≈ 0.151)
const GEAR = 10; // belt ratio crank -> magnet
const ETA_GEAR = 0.8;
const R_COIL = 0.8; // Ω
const R_LED = 48; // Ω  (12 V, 3 W LED lamp, treated as a resistance)
const R_INC = 6.86; // Ω (12 V, 21 W incandescent)
const INC_RATED = 21; // W -> 300 lm
const LM_FULL = 300;
const INERTIA = 0.05; // kg·m², crank + reflected rotor
const HAND_K = 25; // N·m/rad  (wrist/arm stiffness)
const HAND_C = 2.2; // N·m·s/rad
const HAND_MAX = 3.5; // N·m  (≈ 15 N on a 24 cm crank)
const SUB = 0.0005; // s, physics sub-step (resolves the 2·f torque ripple)
const SCOPE_N = 400; // samples shown (200 ms)
const BUF_N = 1024;

type Load = 0 | 1 | 2 | 3; // none, LED, incandescent, both

export function buildGenerator(ctx: RoomContext, cheers: Cheers) {
  const m = mats();
  const st = new StationFrame(ctx, 0, -6.0, 0);
  const g = st.group;
  workbench(g, 2.6, 1.0);
  st.collider(2.75, 1.15);

  // ------------------------------------------------------------ state
  let phiC = 0; // crank angle
  let omegaC = 0; // crank angular velocity
  let load: Load = 1;
  let dc = false;
  let dragging = false;
  let ptr = 0; // unwrapped pointer angle
  let ptrOffset = 0;
  let ptrPrev = 0;
  let omegaPtr = 0;
  let lastRaw = 0;
  let tauHandShown = 0;
  let pLedF = 0; // filtered LED power (fast)
  let pIncF = 0; // filament power (thermal lag)
  let incBroken = false;
  let overTime = 0;
  let focused = false;
  // running averages for readouts (0.25 s)
  let avgV2 = 0, avgI2 = 0, avgP = 0, avgPHand = 0, peakAbsV = 0;
  let iNow = 0, vNow = 0;
  const buf = new Float32Array(BUF_N);
  let bufHead = 0;

  const rLoad = () => {
    const led = load === 1 || load === 3;
    const inc = (load === 2 || load === 3) && !incBroken;
    let gsum = 0;
    if (led) gsum += 1 / R_LED;
    if (inc) gsum += 1 / R_INC;
    return gsum > 0 ? 1 / gsum : Infinity;
  };

  // ------------------------------------------------------------ crank wheel
  const CRANK = new THREE.Vector3(0.72, 1.32, 0.18);
  const crank = new THREE.Group();
  crank.position.copy(CRANK);
  crank.userData.dynamic = true;
  g.add(crank);
  put(crank, new THREE.TorusGeometry(0.26, 0.018, 10, 56), m.brass);
  put(crank, new THREE.CylinderGeometry(0.24, 0.24, 0.035, 48), m.darkWood, 0, 0, -0.1, Math.PI / 2);
  put(crank, new THREE.CylinderGeometry(0.2, 0.2, 0.037, 48), m.wood, 0, 0, -0.1, Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(crank, rbox(0.022, 0.25, 0.014, 0.006), m.brass, Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0, 0, 0, a - Math.PI / 2);
  }
  put(crank, new THREE.CylinderGeometry(0.045, 0.05, 0.08, 24), m.brass, 0, 0, -0.03, Math.PI / 2);
  bakeStatic(crank);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a4f2a, roughness: 0.45, emissive: new THREE.Color(ctx.accent), emissiveIntensity: 0.15 });
  put(crank, new THREE.CylinderGeometry(0.026, 0.026, 0.14, 20), handleMat, 0.235, 0, 0.08, Math.PI / 2, 0, 0, false);
  put(crank, new THREE.SphereGeometry(0.03, 16, 12), m.brass, 0.235, 0, 0.155, 0, 0, 0, false);
  const hit = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.z = 0.1;
  crank.add(hit);
  // Upright and axle
  put(g, rbox(0.12, 0.42, 0.08, 0.02), m.darkWood, CRANK.x, 0.9 + 0.21, -0.02);
  put(g, new THREE.CylinderGeometry(0.018, 0.018, 0.3, 12), m.steel, CRANK.x, CRANK.y, 0.04, Math.PI / 2);

  // ------------------------------------------------------------ generator (glass housing, coils, magnet)
  const GEN = new THREE.Vector3(-0.05, 1.32, 0.22);
  put(g, rbox(0.46, 0.14, 0.3, 0.03), m.darkWood, GEN.x, 0.97, GEN.z - 0.02);
  put(g, rbox(0.06, 0.2, 0.06, 0.015), m.brass, GEN.x - 0.15, 1.12, GEN.z);
  put(g, rbox(0.06, 0.2, 0.06, 0.015), m.brass, GEN.x + 0.15, 1.12, GEN.z);
  put(g, new THREE.CylinderGeometry(0.19, 0.19, 0.2, 48, 1, true), m.glass, GEN.x, GEN.y, GEN.z, Math.PI / 2);
  put(g, new THREE.TorusGeometry(0.19, 0.012, 8, 48), m.brass, GEN.x, GEN.y, GEN.z + 0.1);
  put(g, new THREE.TorusGeometry(0.19, 0.012, 8, 48), m.brass, GEN.x, GEN.y, GEN.z - 0.1);
  put(g, new THREE.CircleGeometry(0.185, 40), m.blackMetal, GEN.x, GEN.y, GEN.z - 0.098);
  // Coils with iron pole shoes; the copper winding shows as stripes.
  const coilTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const cg = c.getContext('2d')!;
    for (let y = 0; y < 256; y += 4) {
      cg.fillStyle = y % 8 === 0 ? '#d98a4f' : '#a85a2c';
      cg.fillRect(0, y, 64, 4);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  })();
  const coilMat = new THREE.MeshStandardMaterial({ map: coilTex, roughness: 0.35, metalness: 0.7 });
  for (const sx of [-1, 1]) {
    put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.065, 24), coilMat, GEN.x + sx * 0.122, GEN.y, GEN.z, 0, 0, Math.PI / 2);
    put(g, rbox(0.03, 0.08, 0.08, 0.008), m.steel, GEN.x + sx * 0.08, GEN.y, GEN.z);
  }
  const rotor = new THREE.Group();
  rotor.position.copy(GEN);
  rotor.userData.dynamic = true;
  g.add(rotor);
  put(rotor, rbox(0.06, 0.034, 0.034, 0.008), m.magnetRed, 0.031, 0, 0);
  put(rotor, rbox(0.06, 0.034, 0.034, 0.008), m.magnetBlue, -0.031, 0, 0);
  put(rotor, new THREE.CylinderGeometry(0.008, 0.008, 0.36, 10), m.steel, 0, 0, -0.06, Math.PI / 2);
  put(rotor, new THREE.CylinderGeometry(0.024, 0.024, 0.03, 24), m.brass, 0, 0, -0.14, Math.PI / 2);
  bakeStatic(rotor);
  const nsLabel = canvasPlane(0.1, 0.035, 128, 44, (cg, W, H) => {
    cg.font = `800 34px ${FONT}`;
    cg.textBaseline = 'middle';
    cg.fillStyle = '#fff';
    cg.textAlign = 'left';
    cg.fillText('S', 6, H / 2);
    cg.textAlign = 'right';
    cg.fillText('N', W - 6, H / 2);
  }, { transparent: true });
  nsLabel.mesh.position.z = 0.018;
  rotor.add(nsLabel.mesh);
  // AC/DC badge on the base
  const badge = sign(() => (dc ? t(L('DC (kommutator)', 'DC (commutator)')) : t(L('AC (släpringar)', 'AC (slip rings)'))), 0.3, 0.06);
  badge.mesh.position.set(GEN.x, 0.97, GEN.z + 0.131);
  g.add(badge.mesh);

  // Belt: open belt around the 0.24 m crank pulley and the 0.024 m magnet pulley (10:1).
  {
    const c1 = new THREE.Vector2(CRANK.x, CRANK.y), r1 = 0.24;
    const c2 = new THREE.Vector2(GEN.x, GEN.y), r2 = 0.024;
    const d = c1.distanceTo(c2);
    const phi = Math.asin((r1 - r2) / d);
    const a0 = Math.PI / 2 + phi;
    const pts: THREE.Vector3[] = [];
    const z = 0.08;
    for (let i = 0; i <= 40; i++) {
      const a = a0 - (i / 40) * (2 * a0);
      pts.push(new THREE.Vector3(c1.x + Math.cos(a) * r1, c1.y + Math.sin(a) * r1, z));
    }
    for (let i = 0; i <= 16; i++) {
      const a = -a0 - (i / 16) * (2 * Math.PI - 2 * a0);
      pts.push(new THREE.Vector3(c2.x + Math.cos(a) * r2, c2.y + Math.sin(a) * r2, z));
    }
    const belt = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    put(g, new THREE.TubeGeometry(belt, 160, 0.007, 6, true), m.rubberBlack);
  }

  // ------------------------------------------------------------ bulbs
  const bulbProfile = (r: number) => {
    // neck at the bottom, then a sphere of radius r up to the top (points bottom -> top)
    const pts = [new THREE.Vector2(r * 0.42, -r * 0.6), new THREE.Vector2(r * 0.42, -r * 0.32)];
    for (let i = 0; i <= 18; i++) {
      const a = -1.1 + (i / 18) * (Math.PI / 2 + 1.1);
      pts.push(new THREE.Vector2(Math.max(0.0005, Math.cos(a) * r), r * 0.55 + Math.sin(a) * r));
    }
    return pts;
  };
  const bulbGeo = new THREE.LatheGeometry(bulbProfile(0.075), 28);
  const makeSocket = (x: number) => {
    put(g, new THREE.CylinderGeometry(0.06, 0.07, 0.03, 24), m.darkWood, x, 0.915, 0.25);
    put(g, new THREE.CylinderGeometry(0.034, 0.034, 0.07, 20), m.brass, x, 0.965, 0.25);
  };
  // LED bulb: frosted diffuser
  makeSocket(-0.5);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.6, emissive: 0xfff1d8, emissiveIntensity: 0 });
  put(g, bulbGeo, ledMat, -0.5, 1.045, 0.25, 0, 0, 0, false);
  const ledHalo = halo(0xfff0d6, 0.6);
  ledHalo.position.set(-0.5, 1.09, 0.25);
  g.add(ledHalo);
  // Incandescent: clear glass with a glowing coiled filament
  makeSocket(-0.88);
  const incGlassMat = new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false, emissive: 0xffa040, emissiveIntensity: 0 });
  const incBulb = put(g, bulbGeo, incGlassMat, -0.88, 1.045, 0.25, 0, 0, 0, false);
  const filMat = new THREE.MeshBasicMaterial({ color: 0x2a1a10, toneMapped: false });
  const filament = new THREE.Group();
  filament.position.set(-0.88, 1.09, 0.25);
  g.add(filament);
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const a = u * Math.PI * 2 * 9;
      pts.push(new THREE.Vector3(-0.03 + u * 0.06 + Math.cos(a) * 0.002, Math.sin(a) * 0.004, Math.cos(a) * 0.004));
    }
    filament.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0012, 4), filMat));
    const sup = new THREE.CylinderGeometry(0.0012, 0.0012, 0.07, 4);
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(sup, m.steel);
      s.position.set(sx * 0.03, -0.035, 0);
      filament.add(s);
    }
  }
  const incHalo = halo(0xffb060, 0.7);
  incHalo.position.set(-0.88, 1.09, 0.25);
  g.add(incHalo);
  const ledSign = sign(() => t(L('LED · 3 W', 'LED · 3 W')), 0.2, 0.05);
  ledSign.mesh.position.set(-0.5, 0.94, 0.36);
  ledSign.mesh.rotation.x = -0.5;
  g.add(ledSign.mesh);
  const incSign = sign(() => (incBroken ? t(L('Trasig!', 'Blown!')) : t(L('Glödlampa · 21 W', 'Incandescent · 21 W'))), 0.26, 0.05);
  incSign.mesh.position.set(-0.88, 0.94, 0.36);
  incSign.mesh.rotation.x = -0.5;
  g.add(incSign.mesh);

  // ------------------------------------------------------------ load switch (rotary)
  const SW = new THREE.Vector3(0.28, 0.93, 0.3);
  put(g, rbox(0.26, 0.03, 0.2, 0.012), m.darkWood, SW.x, SW.y - 0.01, SW.z);
  const swFace = canvasPlane(0.24, 0.18, 256, 192, (cg, W, H) => {
    cg.fillStyle = '#f1e6d2';
    cg.fillRect(0, 0, W, H);
    cg.fillStyle = '#3a2416';
    cg.font = `700 22px ${FONT}`;
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    const names = [L('Av', 'Off'), L('LED', 'LED'), L('Glöd', 'Incand.'), L('Båda', 'Both')];
    names.forEach((n, i) => {
      const a = -Math.PI / 2 + (i - 1.5) * 0.75;
      cg.fillText(t(n), W / 2 + Math.cos(a) * 92, H * 0.66 + Math.sin(a) * 88 * 0.75);
    });
  });
  swFace.mesh.rotation.x = -Math.PI / 2;
  swFace.mesh.position.set(SW.x, SW.y + 0.006, SW.z);
  g.add(swFace.mesh);
  const knob = new THREE.Group();
  knob.position.set(SW.x, SW.y + 0.02, SW.z + 0.03);
  g.add(knob);
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x2a2226, roughness: 0.4, emissive: new THREE.Color(ctx.accent), emissiveIntensity: 0.1 });
  const knobMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.035, 24), knobMat);
  knob.add(knobMesh);
  const pointer = new THREE.Mesh(rbox(0.008, 0.01, 0.05, 0.003), m.brass);
  pointer.position.set(0, 0.02, -0.025);
  knob.add(pointer);
  const knobAngle = (l: Load) => -(l - 1.5) * 0.75;

  // ------------------------------------------------------------ oscilloscope
  const SC = new THREE.Vector3(-0.72, 1.3, -0.24);
  put(g, rbox(0.5, 0.26, 0.3, 0.02), m.darkWood, SC.x, 1.03, SC.z);
  put(g, rbox(0.5, 0.32, 0.3, 0.04), m.blackMetal, SC.x, SC.y, SC.z);
  put(g, rbox(0.4, 0.27, 0.02, 0.02), m.brass, SC.x - 0.03, SC.y, SC.z + 0.148);
  const scope = canvasPlane(0.36, 0.24, 384, 256, () => {}, { glow: true });
  scope.mesh.position.set(SC.x - 0.03, SC.y, SC.z + 0.16);
  g.add(scope.mesh);
  for (let i = 0; i < 3; i++) put(g, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), m.brass, SC.x + 0.21, SC.y + 0.08 - i * 0.07, SC.z + 0.15, Math.PI / 2);

  // ------------------------------------------------------------ cables
  const red = m.rubberRed;
  const wGen = new Wire(g, [[GEN.x + 0.12, 1.0, GEN.z + 0.15], [0.1, 0.93, 0.38], [SW.x - 0.12, 0.935, SW.z]], red);
  const wLed = new Wire(g, [[SW.x - 0.12, 0.935, SW.z - 0.04], [-0.2, 0.925, 0.12], [-0.5, 0.92, 0.15], [-0.5, 0.92, 0.22]], red);
  const wInc = new Wire(g, [[SW.x - 0.12, 0.935, SW.z - 0.07], [-0.3, 0.925, 0.06], [-0.88, 0.92, 0.12], [-0.88, 0.92, 0.22]], red);
  new Wire(g, [[GEN.x - 0.12, 1.0, GEN.z - 0.12], [-0.35, 0.93, -0.12], [SC.x + 0.21, SC.y - 0.06, SC.z + 0.17]], m.rubberBlack);

  // ------------------------------------------------------------ interaction
  const plane = new THREE.Plane();
  const nrm = new THREE.Vector3();
  const local = new THREE.Vector3();
  const pointerAngle = (info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) => {
    crank.updateMatrixWorld();
    nrm.set(0, 0, 1).transformDirection(crank.matrixWorld);
    local.copy(CRANK);
    g.localToWorld(local);
    plane.setFromNormalAndCoplanarPoint(nrm, local);
    const p = info.onPlane(plane);
    if (!p) return null;
    g.worldToLocal(p);
    return Math.atan2(p.y - CRANK.y, p.x - CRANK.x);
  };
  const wrapPi = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  ctx.interaction.add(crank, {
    label: L('Veva!', 'Crank it!'),
    cursor: 'grab',
    onHover: (on) => { handleMat.emissiveIntensity = on ? 0.6 : 0.15; },
    onDragStart: (info) => {
      const a = pointerAngle(info);
      if (a === null) return;
      dragging = true;
      lastRaw = a;
      ptr = a;
      ptrPrev = a;
      // keep the crank where it is: the hand grabs it with zero spring offset
      ptrOffset = phiC - ptr;
      omegaPtr = omegaC;
      ctx.sfx.resume();
    },
    onDrag: (info) => {
      const a = pointerAngle(info);
      if (a === null) return;
      ptr += wrapPi(a - lastRaw);
      lastRaw = a;
    },
    onDragEnd: () => { dragging = false; },
  });

  const setLoad = (l: Load) => {
    load = l;
    hud?.setLoadBtn(l);
  };
  ctx.interaction.add(knob, {
    label: L('Byt belastning', 'Change load'),
    onHover: (on) => { knobMat.emissiveIntensity = on ? 0.6 : 0.1; },
    onClick: () => {
      ctx.sfx.click();
      setLoad(((load + 1) % 4) as Load);
    },
  });
  ctx.interaction.add(incBulb, {
    label: L('Byt glödlampa', 'Replace the bulb'),
    enabled: () => incBroken,
    onClick: () => replaceBulb(),
  });

  const replaceBulb = () => {
    if (!incBroken) return;
    incBroken = false;
    overTime = 0;
    incGlassMat.opacity = 0.25;
    incSign.redraw();
    filament.visible = true;
    ctx.sfx.pop();
  };

  // ------------------------------------------------------------ HUD
  let hud: null | {
    setLoadBtn: (l: Load) => void;
    scope: { ctx: CanvasRenderingContext2D; width: number; height: number };
    speed: Readout; volt: Readout; amp: Readout; power: Readout; you: Readout;
    effort: Meter; ledLm: Meter; incLm: Meter; replace: HTMLButtonElement;
  } = null;

  const controls = (panel: ControlPanel) => {
    panel.heading(L('Belastning', 'Load'));
    const setLoadBtn = panel.buttons([
      { label: L('Ingen', 'None'), onClick: () => setLoad(0) },
      { label: L('LED', 'LED'), icon: '💡', onClick: () => setLoad(1) },
      { label: L('Glödlampa', 'Incandescent'), icon: '🔥', onClick: () => setLoad(2) },
      { label: L('Båda', 'Both'), onClick: () => setLoad(3) },
    ], load);
    panel.toggle(L('Likriktare (kommutator): DC i stället för AC', 'Commutator: DC instead of AC'), dc, (v) => {
      dc = v;
      badge.redraw();
    });
    panel.heading(L('Oscilloskop: spänning över lampan', 'Oscilloscope: voltage across the lamp'));
    const sc = panel.canvas(130);
    panel.note(L('5 V per ruta upp och ner, 20 ms per ruta i sidled.', '5 V per square vertically, 20 ms per square across.'));
    const speed = panel.readout(L('Varvtal', 'Speed'));
    const volt = panel.readout(L('Spänning (effektivvärde)', 'Voltage (RMS)'));
    const amp = panel.readout(L('Ström', 'Current'));
    const power = panel.readout(L('Elektrisk effekt i lampan', 'Electrical power in the lamp'));
    const you = panel.readout(L('Din effekt i veven', 'Your power at the crank'));
    const effort = panel.meter(L('Ansträngning (vridmoment)', 'Effort (torque)'), '#ff8a5c');
    const ledLm = panel.meter(L('LED-ljus', 'LED light'), '#fff2c8');
    const incLm = panel.meter(L('Glödlampans ljus', 'Incandescent light'), '#ffb060');
    const replace = panel.button(L('Byt glödlampa', 'Replace the bulb'), replaceBulb, { icon: '🔧' });
    replace.style.display = incBroken ? '' : 'none';
    hud = { setLoadBtn, scope: sc, speed, volt, amp, power, you, effort, ledLm, incLm, replace };
    return () => { hud = null; };
  };

  // ------------------------------------------------------------ drawing the trace
  const drawTrace = (c: CanvasRenderingContext2D, W: number, H: number, dark: boolean) => {
    c.fillStyle = dark ? '#03140c' : '#071a12';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(80,255,170,0.14)';
    c.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      c.beginPath(); c.moveTo((W * i) / 10, 0); c.lineTo((W * i) / 10, H); c.stroke();
    }
    for (let i = 1; i < 8; i++) {
      c.beginPath(); c.moveTo(0, (H * i) / 8); c.lineTo(W, (H * i) / 8); c.stroke();
    }
    c.strokeStyle = 'rgba(80,255,170,0.35)';
    c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
    // Trigger: last rising crossing of 30 % of the peak, so the trace stands still.
    const lvl = Math.max(0.5, peakAbsV * 0.3);
    let start = (bufHead - SCOPE_N + BUF_N) % BUF_N;
    for (let k = SCOPE_N; k < BUF_N - 2; k++) {
      const i0 = (bufHead - k - 1 + BUF_N) % BUF_N;
      const i1 = (i0 + 1) % BUF_N;
      if (buf[i0] < lvl && buf[i1] >= lvl) {
        start = i1;
        break;
      }
    }
    c.strokeStyle = '#6dffb0';
    c.lineWidth = 2;
    c.shadowColor = '#3dff9a';
    c.shadowBlur = 6;
    c.beginPath();
    const vPerDiv = 5;
    for (let k = 0; k < SCOPE_N; k++) {
      const v = buf[(start + k) % BUF_N];
      const x = (k / (SCOPE_N - 1)) * W;
      const y = H / 2 - (v / (vPerDiv * 4)) * (H / 2);
      const yy = clamp(y, 1, H - 1);
      if (k === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.stroke();
    c.shadowBlur = 0;
  };

  const drawWorldScope = () => {
    const c = scope.g;
    const W = scope.canvas.width, H = scope.canvas.height;
    drawTrace(c, W, H, true);
    c.fillStyle = '#9dffc8';
    c.font = `700 22px ${FONT}`;
    c.textAlign = 'left';
    c.fillText(`${fmt(Math.sqrt(avgV2), 1)} V`, 10, 24);
    c.textAlign = 'right';
    c.fillText(`${fmt(avgP, 1)} W`, W - 10, 24);
    c.textAlign = 'left';
    c.fillText(dc ? 'DC' : 'AC', 10, H - 12);
    scope.tex.needsUpdate = true;
  };

  // ------------------------------------------------------------ sound
  let hum: ReturnType<RoomContext['sfx']['voice']> | null = null;
  const hudTick = new Every(0.1);
  const scopeTick = new Every(1 / 20);
  const col = new THREE.Color();
  const warm = new THREE.Color(0xffd9a0);
  const deep = new THREE.Color(0xff3a00);

  const def = {
    id: 'electricity-generator',
    title: L('Vevgeneratorn', 'The hand-crank generator'),
    position: [0, -6.0] as [number, number],
    viewpoint: st.view([0.42, 1.78, 2.35], [0.42, 1.12, 0]),
    intro: L(
      'Här gör du el med din egen arm! Orkar du tända den gamla glödlampan lika starkt som LED-lampan?',
      'Here you make electricity with your own arm! Can you light the old bulb as brightly as the LED?',
    ),
    howTo: L(
      'Dra handtaget runt i cirklar. Välj belastning med vredet eller i panelen. Släpp veven och se hur fort den stannar.',
      'Drag the handle round in circles. Pick a load with the knob or in the panel. Let go and watch how fast it stops.',
    ),
    science: L(
      'När magneten snurrar mellan spolarna ändras det magnetiska flödet genom dem, och då induceras en spänning: e = N·B·A·ω·sin(ωt). Här är N = 200 varv, B = 0,5 T och A = 15 cm², så spänningen växer i takt med hur fort du vevar, och den byter riktning varje halvvarv – växelström. Generatorn skapar ingen energi: så fort ström flyter skapar den ett magnetfält som bromsar magneten (Lenz lag), och det tunga motståndet i veven är energin som lämnar din arm. Utan last flyter ingen ström, därför går det lätt. LED-lampan ger 300 lumen av 3 W, men glödlampan behöver cirka 21 W för samma ljus – sju gånger mer – eftersom över 90 % blir värme. (Vi räknar lamporna som vanliga resistanser, en förenkling.)',
      'As the magnet spins between the coils, the magnetic flux through them changes, and that induces a voltage: e = N·B·A·ω·sin(ωt). Here N = 200 turns, B = 0.5 T and A = 15 cm², so the voltage grows with how fast you crank, and it reverses every half turn: alternating current. The generator does not create energy: as soon as current flows it makes a magnetic field that brakes the magnet (Lenz’s law), and the heavy feel of the crank is the energy leaving your arm. With no load no current flows, which is why it spins so easily. The LED gives 300 lumens from 3 W, but the incandescent bulb needs about 21 W for the same light, seven times more, because over 90 % becomes heat. (We treat the lamps as plain resistances, a simplification.)',
    ),
    wow: L(
      'En människa orkar ge ungefär 75 W under en hel arbetsdag. Det räcker till en enda gammal 60 W-glödlampa – eller sju LED-lampor som lyser lika starkt.',
      'A person can keep up about 75 W over a working day. That is enough for one old 60 W bulb, or seven LED bulbs that are just as bright.',
    ),
    controls,
    onFocus: () => {
      focused = true;
      ctx.sfx.resume();
      hum = ctx.sfx.voice(60, { type: 'triangle', gain: 0 });
    },
    onBlur: () => {
      focused = false;
      dragging = false;
      hum?.stop(0.2);
      hum = null;
    },
  };
  ctx.addStation(def);

  // ------------------------------------------------------------ update
  function update(dt: number, time: number) {
    // Affordance: the handle breathes gently when idle.
    if (!dragging && Math.abs(omegaC) < 0.2) handleMat.emissiveIntensity = 0.15 + 0.12 * (0.5 + 0.5 * Math.sin(time * 3));
    knob.rotation.y += (knobAngle(load) - knob.rotation.y) * ease(dt, 0.06);
    const active = focused || st.near(8) || Math.abs(omegaC) > 0.05;
    if (!active) return;

    // pointer angular velocity (smoothed)
    if (dragging) {
      omegaPtr += ((ptr - ptrPrev) / Math.max(dt, 1e-4) - omegaPtr) * ease(dt, 0.05);
      ptrPrev = ptr;
    }
    const R = rLoad();
    const steps = Math.ceil(dt / SUB);
    const h = dt / steps;
    let sV2 = 0, sI2 = 0, sP = 0, sPH = 0, sTau = 0, sLed = 0, sInc = 0;
    const tauF = 0.04, visc = 0.003;
    for (let s = 0; s < steps; s++) {
      const th = GEAR * phiC;
      const sn = Math.sin(th);
      const e = K_E * GEAR * omegaC * sn; // EMF
      const i = Number.isFinite(R) ? e / (R_COIL + R) : 0;
      const vLoad = Number.isFinite(R) ? i * R : e; // open circuit: the scope sees the EMF
      const tauLoad = (GEAR * K_E * i * sn) / ETA_GEAR; // Lenz back-torque at the crank
      let tauHand = 0;
      if (dragging) {
        // the hand slips if the pointer runs more than ~1 rad ahead of the handle
        let target = ptr + ptrOffset;
        if (target - phiC > 1) { ptrOffset -= target - phiC - 1; target = phiC + 1; }
        if (target - phiC < -1) { ptrOffset -= target - phiC + 1; target = phiC - 1; }
        tauHand = clamp(HAND_K * (target - phiC) + HAND_C * (omegaPtr - omegaC), -HAND_MAX, HAND_MAX);
      }
      const tauFric = tauF * Math.tanh(omegaC / 0.3) + visc * omegaC;
      omegaC += ((tauHand - tauLoad - tauFric) / INERTIA) * h;
      omegaC = clamp(omegaC, -45, 45);
      phiC += omegaC * h;
      // power in each lamp
      const pLed = load === 1 || load === 3 ? (vLoad * vLoad) / R_LED : 0;
      const pInc = (load === 2 || load === 3) && !incBroken ? (vLoad * vLoad) / R_INC : 0;
      pLedF += (pLed - pLedF) * (h / 0.004); // LED + driver: almost instant, flickers at low speed
      pIncF += (pInc - pIncF) * (h / 0.07); // filament thermal time constant
      sLed += pLedF;
      sInc += pIncF;
      const vOut = dc ? Math.abs(vLoad) : vLoad;
      buf[bufHead] = vOut;
      bufHead = (bufHead + 1) % BUF_N;
      sV2 += vLoad * vLoad;
      sI2 += i * i;
      sP += (Number.isFinite(R) ? i * i * R : 0);
      sPH += tauHand * omegaC;
      sTau += Math.abs(tauHand);
      iNow = i;
      vNow = vOut;
    }
    const k = ease(dt, 0.25);
    avgV2 += (sV2 / steps - avgV2) * k;
    avgI2 += (sI2 / steps - avgI2) * k;
    avgP += (sP / steps - avgP) * k;
    avgPHand += (sPH / steps - avgPHand) * k;
    tauHandShown += (sTau / steps - tauHandShown) * ease(dt, 0.15);
    peakAbsV = Math.max(Math.abs(vNow), peakAbsV * Math.exp(-dt / 0.3));
    const pLedFrame = sLed / steps;
    const pIncFrame = sInc / steps;

    // ---- visuals
    crank.rotation.z = phiC;
    rotor.rotation.z = GEAR * phiC;
    // LED: 100 lm/W, its driver caps it at the rated 3 W / 300 lm
    const ledB = clamp((pLedFrame * 100) / LM_FULL, 0, 1);
    ledMat.emissiveIntensity = ledB * 2.4;
    ledHalo.material.opacity = ledB * 0.9;
    // Incandescent: light ∝ P^2.1 (a cool filament glows red and gives little light)
    const incRel = pIncFrame / INC_RATED;
    const incB = Math.min(1.7, Math.pow(Math.max(0, incRel), 2.1));
    const temp = clamp(Math.pow(Math.max(0, incRel), 0.3), 0, 1.2);
    col.copy(deep).lerp(warm, clamp(temp, 0, 1)).multiplyScalar(0.15 + 3.2 * Math.min(1.2, Math.sqrt(incB)) * clamp(incRel * 6, 0, 1));
    filMat.color.copy(incRel > 0.03 ? col : col.setHex(0x2a1a10));
    incGlassMat.emissiveIntensity = incBroken ? 0 : incB * 0.6;
    incHalo.material.opacity = clamp(incB, 0, 1.3) * 0.8;
    incHalo.material.color.copy(deep).lerp(warm, clamp(temp, 0, 1));
    // Over-driving the filament: more than 1.8× rated power for 2 s burns it out.
    if (!incBroken && incRel > 1.8) {
      overTime += dt;
      if (overTime > 2) {
        incBroken = true;
        filament.visible = false;
        incGlassMat.opacity = 0.4;
        incSign.redraw();
        ctx.sfx.zap();
        ctx.sfx.noise(0.15, { freq: 5000, gain: 0.2, type: 'highpass' });
        if (hud) hud.replace.style.display = '';
        cheers.say('gen-blown', L(
          'Pang! Glödtråden smälte – den fick nästan dubbelt så mycket effekt som den tål. Klicka på lampan för att byta.',
          'Pop! The filament melted: it got almost twice the power it can take. Click the bulb to replace it.',
        ), { repeat: true, expression: 'surprised' });
      }
    } else overTime = Math.max(0, overTime - dt);

    // Charge flow in the cables: in AC the electrons just jiggle back and forth.
    const iLed = Number.isFinite(R) && (load === 1 || load === 3) ? (vNow / R_LED) : 0;
    const iInc = Number.isFinite(R) && (load === 2 || load === 3) && !incBroken ? (vNow / R_INC) : 0;
    const iTot = Number.isFinite(R) ? (dc ? Math.abs(iNow) : iNow) : 0;
    wGen.set(Math.abs(iTot) / 2, Math.sign(iTot));
    wLed.set(Math.abs(iLed) * 3, Math.sign(iLed));
    wInc.set(Math.abs(iInc) / 2, Math.sign(iInc));
    wGen.update(dt);
    wLed.update(dt);
    wInc.update(dt);

    // Handle colour shows effort
    if (dragging) {
      const eff = tauHandShown / HAND_MAX;
      handleMat.emissive.setHex(ctx.accent).lerp(deep, clamp(eff, 0, 1));
      handleMat.emissiveIntensity = 0.3 + eff * 0.9;
    } else handleMat.emissive.setHex(ctx.accent);

    // Sound: a whirr that rises with speed, heavier with load
    if (hum) {
      const sp = Math.abs(omegaC);
      hum.setFreq(45 + sp * GEAR * 0.35);
      hum.setGain(Math.min(0.05, sp * 0.004) * (1 + 0.6 * clamp(tauHandShown / HAND_MAX, 0, 1)));
    }

    // Scope (in the world and in the HUD)
    if (scopeTick.tick(dt) && (st.near(6) || focused)) {
      drawWorldScope();
      if (hud) drawTrace(hud.scope.ctx, hud.scope.width, hud.scope.height, false);
    }

    // Milestones
    if (ledB > 0.98 && load === 1) {
      cheers.say('gen-led', L(
        'Där! LED-lampan lyser fullt med bara 3 watt. Prova glödlampan nu – känn skillnaden!',
        'There! The LED is at full brightness with just 3 watts. Try the incandescent now and feel the difference!',
      ), { celebrate: true });
    }
    if (incB > 0.9 && !incBroken) {
      cheers.say('gen-inc', L(
        'Wow, vilken kraft! Glödlampan slukar runt 21 watt för samma ljus som LED-lampan får av 3.',
        'Wow, what power! The incandescent gulps about 21 watts for the light the LED makes from 3.',
      ), { celebrate: true });
    }
    if (!dragging && load >= 2 && Math.abs(omegaC) < 0.5 && avgP > 3) {
      cheers.say('gen-lenz', L(
        'Såg du hur fort veven stannade när du släppte? Strömmen bromsar magneten – det är Lenz lag.',
        'Did you see how fast the crank stopped when you let go? The current brakes the magnet: that is Lenz’s law.',
      ), { expression: 'idea' });
    }

    if (hud && hudTick.tick(dt)) {
      const rps = Math.abs(omegaC) / (Math.PI * 2);
      hud.speed.set(`${fmt(rps, 1)} ${t(L('varv/s', 'rev/s'))} · ${fmt(rps * GEAR, 0)} Hz`);
      hud.volt.set(`${fmt(Math.sqrt(avgV2), 1)} V`);
      hud.amp.set(`${fmt(Number.isFinite(R) ? Math.sqrt(avgI2) : 0, 2)} A`);
      hud.power.set(`${fmt(avgP, 1)} W`);
      hud.you.set(`${fmt(Math.max(0, avgPHand), 0)} W`);
      hud.effort.set(tauHandShown / HAND_MAX, `${fmt(tauHandShown, 1)} N·m`);
      hud.ledLm.set(ledB, `${fmt(ledB * LM_FULL, 0)} lm`);
      hud.incLm.set(Math.min(1, incB), incBroken ? t(L('trasig', 'blown')) : `${fmt(incB * LM_FULL, 0)} lm`);
    }
  }

  return { update };
}
