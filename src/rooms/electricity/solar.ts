/**
 * Station 3: the solar module, taken apart.
 *
 * Electrical model: 15 silicon cells (182 mm, 331 cm² each) in series.
 *   Photocurrent  I_L = EQE(λ)·(λ/1239,84 nm·eV)·G·A·cos θ      (one electron per absorbed photon)
 *   Cell diode    I = I_L − I₀·(exp(V/(15·kT/q)) − 1),  kT/q = 25,7 mV,  I₀ = 2·10⁻¹⁰ A
 *   Operating point with the load found by bisection.
 * Photons with E = hc/λ below the band gap 1,12 eV (λ > 1107 nm) are not absorbed at all.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import {
  Cheers, Every, FONT, StationFrame, bakeStatic, Wire, canvasPlane, clamp, ease, fmt, halo, mats, put, rbox, sci, sign, workbench,
} from './shared';

const HC = 1239.84; // eV·nm
const EG = 1.12; // eV, silicon at 300 K
const VT = 0.0257; // V, kT/q at 25 °C
const I0 = 2e-10; // A, dark saturation current per cell
const N_CELLS = 15;
const A_CELL = 0.0331; // m²
const Q = 1.602e-19;
const R_FAN = 0.8; // Ω, a big 12 V fan (≈ 100 W at full sun)
const LED_VTH = 7.5; // V, LED string threshold
const LED_R = 1; // Ω, series resistance of an LED floodlight
const LED_FULL = 1.8; // A at full brightness
const FAN_V = 10; // V for full fan speed

/** External quantum efficiency of a typical Al-BSF silicon cell (incl. reflection). */
const EQE_TABLE: [number, number][] = [
  [300, 0], [350, 0.35], [400, 0.6], [450, 0.78], [500, 0.85], [600, 0.9], [700, 0.92], [800, 0.9],
  [900, 0.82], [950, 0.72], [1000, 0.55], [1050, 0.3], [1100, 0.05], [1107, 0],
];
function eqe(nm: number) {
  if (nm >= 1107 || nm <= 300) return 0;
  for (let i = 1; i < EQE_TABLE.length; i++) {
    const [x1, y1] = EQE_TABLE[i];
    if (nm <= x1) {
      const [x0, y0] = EQE_TABLE[i - 1];
      return y0 + ((y1 - y0) * (nm - x0)) / (x1 - x0);
    }
  }
  return 0;
}

/** Approximate sRGB of a wavelength; infrared drawn as a dim dark red (it is invisible). */
function wavelengthColor(nm: number, out: THREE.Color) {
  let r = 0, g = 0, b = 0;
  if (nm < 380) { r = 0.5; g = 0; b = 1; }
  else if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 700) { r = 1; }
  else { r = 0.45; g = 0.05; b = 0.12; }
  return out.setRGB(r, g, b, THREE.SRGBColorSpace);
}

interface LayerDef {
  name: L10n;
  thick: L10n;
  role: L10n;
  detail: L10n;
  vis: number; // visual thickness (m), exaggerated
}

const LAYERS: LayerDef[] = [
  {
    name: L('Aluminiumram', 'Aluminium frame'), thick: L('ca 35 mm hög', 'about 35 mm tall'),
    role: L('Gör panelen styv', 'Makes the module stiff'),
    detail: L('Ramen av anodiserad aluminium håller ihop glaset och alla lager, tål snö och vind och har hål för montering. Den jordas av säkerhetsskäl.',
      'The anodised aluminium frame holds the glass and all the layers together, takes snow and wind loads and has holes for mounting. It is earthed for safety.'),
    vis: 0.04,
  },
  {
    name: L('Frontglas', 'Front glass'), thick: L('3,2 mm', '3.2 mm'),
    role: L('Skyddar, släpper in 91–94 %', 'Protects, lets 91–94 % through'),
    detail: L('Härdat, järnfattigt glas som tål hagel. Vanligt glas ser grönt ut i kanten på grund av järn och skulle stjäla ljus; med ett tunt antireflexskikt släpper det in cirka 94 %.',
      'Tempered low-iron glass that survives hail. Ordinary glass looks green at the edge because of iron and would steal light; with a thin anti-reflective coating it lets about 94 % through.'),
    vis: 0.012,
  },
  {
    name: L('EVA (främre)', 'EVA (front)'), thick: L('0,45 mm', '0.45 mm'),
    role: L('Plastlim som kapslar in cellerna', 'Plastic glue that encapsulates the cells'),
    detail: L('Etylenvinylacetat smälts fast i en vakuumpress. Det limmar, dämpar stötar och stoppar fukt. Brytningsindex 1,48 – nästan som glas, så ljuset studsar inte i skarven.',
      'Ethylene-vinyl acetate is melted on in a vacuum laminator. It glues, cushions and keeps moisture out. Its refractive index of 1.48 is almost that of glass, so light does not bounce at the joint.'),
    vis: 0.004,
  },
  {
    name: L('Silverfingrar', 'Silver fingers'), thick: L('30–100 µm breda', '30–100 µm wide'),
    role: L('Samlar upp elektronerna', 'Collect the electrons'),
    detail: L('Tunna silverlinjer med cirka 3 mm mellanrum och några tjockare samlingsskenor (busbars). De måste vara smala, eftersom de skuggar 3–5 % av cellen, men tjocka nog för att leda strömmen.',
      'Thin silver lines about 3 mm apart, plus a few thicker busbars. They must be narrow, because they shade 3–5 % of the cell, yet thick enough to carry the current.'),
    vis: 0.003,
  },
  {
    name: L('Antireflexskikt (SiNx)', 'Anti-reflective coating (SiNx)'), thick: L('ca 75 nm', 'about 75 nm'),
    role: L('Gör cellen mörkblå, minskar reflexen', 'Makes the cell dark blue, cuts reflection'),
    detail: L('Kiselnitrid med brytningsindex cirka 2,0. Tjockleken är en kvarts våglängd: 600 nm / (4 · 2,0) = 75 nm, så reflexerna från ovan- och undersidan släcker ut varandra. Blankt kisel speglar över 30 % av ljuset – med skiktet bara några procent.',
      'Silicon nitride with a refractive index of about 2.0. The thickness is a quarter wavelength: 600 nm / (4 · 2.0) = 75 nm, so the reflections from its top and bottom cancel. Bare silicon mirrors over 30 % of the light; with the coating, only a few per cent.'),
    vis: 0.003,
  },
  {
    name: L('n⁺-emitter (fosfor)', 'n⁺ emitter (phosphorus)'), thick: L('0,3–0,5 µm', '0.3–0.5 µm'),
    role: L('Kisel med extra elektroner', 'Silicon with extra electrons'),
    detail: L('Fosfor har fem ytterelektroner mot kiselns fyra, så varje fosforatom ger en fri elektron. Ytan är mycket hårt dopad, cirka 10²⁰ atomer per cm³.',
      'Phosphorus has five outer electrons against silicon’s four, so each phosphorus atom donates a free electron. The surface is very heavily doped, about 10²⁰ atoms per cm³.'),
    vis: 0.004,
  },
  {
    name: L('pn-övergång', 'p-n junction'), thick: L('0,1–1 µm', '0.1–1 µm'),
    role: L('Inbyggt elfält skiljer laddningarna', 'Built-in field separates the charges'),
    detail: L('Där n- och p-kisel möts vandrar elektroner över och lämnar ett utarmningsområde med ett inbyggt elfält (cirka 0,7–0,9 V). Fältet skjuter elektronerna uppåt mot fingrarna och hålen nedåt – det är hjärtat i solcellen.',
      'Where n- and p-silicon meet, electrons wander across and leave a depletion zone with a built-in electric field (about 0.7–0.9 V). The field pushes electrons up towards the fingers and holes down: this is the heart of the cell.'),
    vis: 0.004,
  },
  {
    name: L('p-kisel (bor)', 'p-type silicon (boron)'), thick: L('150–180 µm', '150–180 µm'),
    role: L('Här fångas det mesta ljuset', 'Most of the light is absorbed here'),
    detail: L('Kiselskivan är tunnare än två pappersark. Bor ger "hål" (saknade elektroner). Blått ljus fångas redan i den översta mikrometern, men rött och nära-IR måste gå 100 µm eller mer, eftersom kisel har ett indirekt bandgap.',
      'The silicon wafer is thinner than two sheets of paper. Boron provides "holes" (missing electrons). Blue light is caught within the top micrometre, but red and near-infrared must travel 100 µm or more, because silicon has an indirect band gap.'),
    vis: 0.01,
  },
  {
    name: L('Baksidesfält (p⁺, Al-BSF)', 'Back-surface field (p⁺, Al-BSF)'), thick: L('5–10 µm', '5–10 µm'),
    role: L('Stöter tillbaka elektroner från baksidan', 'Repels electrons from the back'),
    detail: L('När aluminiumpastan bränns in vid cirka 800 °C legeras den in i kislet och bildar ett hårt dopat p⁺-lager. Dess elfält hindrar elektroner från att försvinna vid baksidan.',
      'When the aluminium paste is fired at about 800 °C it alloys into the silicon and forms a heavily doped p⁺ layer. Its field keeps electrons from being lost at the back.'),
    vis: 0.004,
  },
  {
    name: L('Aluminiumkontakt', 'Aluminium back contact'), thick: L('20–30 µm', '20–30 µm'),
    role: L('Samlar upp hålen, speglar IR', 'Collects the holes, mirrors IR'),
    detail: L('Ett screentryckt aluminiumlager som täcker hela baksidan. Det är cellens pluspol och reflekterar en del infrarött ljus tillbaka in i kislet för en andra chans.',
      'A screen-printed aluminium layer covering the whole back. It is the cell’s plus pole and reflects some infrared light back into the silicon for a second chance.'),
    vis: 0.004,
  },
  {
    name: L('EVA (bakre)', 'EVA (rear)'), thick: L('0,45 mm', '0.45 mm'),
    role: L('Kapslar in baksidan', 'Encapsulates the back'),
    detail: L('Samma plastlim som framtill. Cellerna ligger alltså inbäddade som i en smörgås och rör aldrig luft eller vatten.',
      'The same plastic glue as at the front. The cells lie embedded like in a sandwich and never touch air or water.'),
    vis: 0.004,
  },
  {
    name: L('Baksidesfolie', 'Backsheet'), thick: L('ca 0,3 mm', 'about 0.3 mm'),
    role: L('Fuktspärr och elektrisk isolering', 'Moisture barrier and insulation'),
    detail: L('Ett laminat av PET och fluorplast som stänger ute fukt och isolerar mot upp till 1000 V. Den vita färgen speglar tillbaka ljus som fallit mellan cellerna.',
      'A laminate of PET and fluoropolymer that keeps moisture out and insulates up to 1000 V. Its white colour reflects back light that falls between the cells.'),
    vis: 0.005,
  },
];
const IDX_FINGERS = 3, IDX_EMITTER = 5, IDX_JUNCTION = 6, IDX_BASE = 7, IDX_CONTACT = 9;

const NP = 150; // photon pool
const NQ = 120; // electron/hole pool

export function buildSolar(ctx: RoomContext, cheers: Cheers) {
  const m = mats();
  const st = new StationFrame(ctx, -6.0, -5.0, Math.PI / 5);
  const g = st.group;
  const BENCH_H = 0.75;
  workbench(g, 2.6, 1.0, BENCH_H);
  st.collider(2.75, 1.15);

  // ------------------------------------------------------------ state
  let lambda = 650;
  let irr = 600; // W/m²
  let theta = 0; // lamp angle from the normal (rad)
  let loadFan = true;
  let explodeTarget = 0;
  let explode = 0;
  let selected = -1;
  let focused = false;
  let draggingLamp = false;
  let touched = false; // the visitor has changed something (no cheers for the default state)
  let fanAngle = 0;
  let fanSpeed = 0;
  const op = { I: 0, V: 0, IL: 0 };

  // ------------------------------------------------------------ frame of the module
  const C = new THREE.Vector3(-0.25, 1.25, 0);
  const TILT = (35 * Math.PI) / 180;
  const nHat = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
  const xHat = new THREE.Vector3(1, 0, 0);
  const dHat = new THREE.Vector3(0, -Math.sin(TILT), Math.cos(TILT));
  const qTilt = new THREE.Quaternion().setFromAxisAngle(xHat, TILT);
  const qFlat = new THREE.Quaternion();
  const W = 1.0, D = 0.6;
  const TOWER_TOP = 2.32, TOWER_STEP = 0.115;
  const towerY = (i: number) => TOWER_TOP - i * TOWER_STEP;

  // stand: a post behind the module
  put(g, rbox(0.06, 0.55, 0.06, 0.015), m.brass, C.x, BENCH_H + 0.27, -0.42);
  put(g, rbox(0.3, 0.04, 0.2, 0.012), m.darkWood, C.x, BENCH_H + 0.02, -0.42);
  put(g, rbox(0.04, 0.04, 0.3, 0.01), m.brass, C.x, BENCH_H + 0.52, -0.28);
  // junction box on the stand
  put(g, rbox(0.12, 0.08, 0.05, 0.012), m.blackMetal, C.x + 0.12, BENCH_H + 0.45, -0.42);

  // ------------------------------------------------------------ layer textures
  const cellsTex = (() => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 600;
    const cg = c.getContext('2d')!;
    cg.clearRect(0, 0, 1000, 600);
    const cw = 182, chh = 182, gx = (1000 - 5 * cw) / 6, gy = (600 - 3 * chh) / 4;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const x = gx + i * (cw + gx), y = gy + j * (chh + gy);
      const grd = cg.createLinearGradient(x, y, x + cw, y + chh);
      grd.addColorStop(0, '#1d2f6e');
      grd.addColorStop(0.5, '#253c8c');
      grd.addColorStop(1, '#16275c');
      cg.fillStyle = grd;
      cg.beginPath();
      cg.roundRect(x, y, cw, chh, 14);
      cg.fill();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();
  const fingerTex = (() => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 600;
    const cg = c.getContext('2d')!;
    const cw = 182, chh = 182, gx = (1000 - 5 * cw) / 6, gy = (600 - 3 * chh) / 4;
    cg.fillStyle = '#e8ecf2';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const x = gx + i * (cw + gx), y = gy + j * (chh + gy);
      for (let k = 0; k < 14; k++) cg.fillRect(x + 4, y + 7 + k * 12.5, cw - 8, 1.6);
      for (let b = 0; b < 3; b++) cg.fillRect(x + 30 + b * 60, y, 5, chh);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();

  const layerMats: THREE.MeshStandardMaterial[] = [
    m.aluminium.clone(),
    new THREE.MeshStandardMaterial({ color: 0xe6f4ff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    // laminated EVA is clear; a faint milky tint keeps the sheet visible in the exploded view
    new THREE.MeshStandardMaterial({ color: 0xf5f3ea, roughness: 0.3, transparent: true, opacity: 0.1, depthWrite: false }),
    new THREE.MeshStandardMaterial({ map: fingerTex, color: 0xffffff, roughness: 0.3, metalness: 0.8, alphaTest: 0.5, transparent: false }),
    new THREE.MeshStandardMaterial({ map: cellsTex, roughness: 0.25, metalness: 0.2, alphaTest: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x5f6ed6, roughness: 0.4, transparent: true, opacity: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 0.4, emissive: 0xffb347, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x8c7b86, roughness: 0.45, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0xa48e8e, roughness: 0.5, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: 0.55, metalness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0xf5f3ea, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false }),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7 }),
  ];

  // Assembled offsets along the normal (glass on top)
  const totalVis = LAYERS.slice(1).reduce((s, l) => s + l.vis, 0);
  const assembledOff: number[] = [0];
  {
    let s = totalVis / 2;
    for (let i = 1; i < LAYERS.length; i++) {
      assembledOff.push(s - LAYERS[i].vis / 2);
      s -= LAYERS[i].vis;
    }
  }

  const layerObjs: THREE.Object3D[] = LAYERS.map((ly, i) => {
    let o: THREE.Object3D;
    if (i === 0) {
      // frame: four bars around the laminate
      const fr = new THREE.Group();
      const bar = (w: number, d: number, x: number, z: number) => put(fr, rbox(w, ly.vis, d, 0.006), layerMats[0], x, -0.006, z);
      bar(W + 0.07, 0.035, 0, D / 2 + 0.0175);
      bar(W + 0.07, 0.035, 0, -D / 2 - 0.0175);
      bar(0.035, D, W / 2 + 0.0175, 0);
      bar(0.035, D, -W / 2 - 0.0175, 0);
      bakeStatic(fr);
      o = fr;
    } else {
      o = new THREE.Mesh(new THREE.BoxGeometry(W, ly.vis, D), layerMats[i]);
    }
    o.userData.dynamic = true;
    g.add(o);
    return o;
  });
  // The finger and cell textures are transparent between the lines/cells; alphaTest cuts those parts out.

  const baseEmissive = layerMats.map((mt) => mt.emissive.clone());
  const baseEmissiveI = layerMats.map((mt) => mt.emissiveIntensity);

  // ------------------------------------------------------------ labels (exploded view)
  const LABEL_X0 = C.x + W / 2 + 0.08;
  const LABEL_W = 0.98;
  const labelH = LAYERS.length * TOWER_STEP;
  const labelCY = towerY((LAYERS.length - 1) / 2);
  const labels = canvasPlane(LABEL_W, labelH, 640, 1024, (cg, CW, CH) => {
    const rowH = CH / LAYERS.length;
    LAYERS.forEach((ly, i) => {
      const y = rowH * i + rowH / 2;
      const sel = i === selected;
      cg.strokeStyle = sel ? '#ffc23d' : 'rgba(255,240,210,0.6)';
      cg.lineWidth = sel ? 4 : 2;
      cg.beginPath();
      cg.moveTo(0, y);
      cg.lineTo(40, y);
      cg.stroke();
      cg.fillStyle = sel ? 'rgba(255,194,61,0.25)' : 'rgba(30,18,10,0.72)';
      cg.beginPath();
      cg.roundRect(44, y - rowH * 0.44, CW - 48, rowH * 0.88, 12);
      cg.fill();
      cg.fillStyle = '#fff4dc';
      cg.textAlign = 'left';
      cg.textBaseline = 'middle';
      cg.font = `800 28px ${FONT}`;
      cg.fillText(t(ly.name), 58, y - rowH * 0.17, CW - 230);
      cg.textAlign = 'right';
      cg.fillStyle = '#ffc23d';
      cg.font = `800 25px ${FONT}`;
      cg.fillText(t(ly.thick), CW - 14, y - rowH * 0.17);
      cg.textAlign = 'left';
      cg.fillStyle = '#e6d6bd';
      cg.font = `500 21px ${FONT}`;
      cg.fillText(t(ly.role), 58, y + rowH * 0.2, CW - 72);
    });
  }, { transparent: true, glow: true });
  labels.mesh.position.set(LABEL_X0 + LABEL_W / 2, labelCY, D / 2 + 0.02);
  (labels.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
  labels.mesh.visible = false;
  g.add(labels.mesh);
  const labelColor = new THREE.Color(0xc8c0b4);
  (labels.mesh.material as THREE.MeshBasicMaterial).color.copy(labelColor);

  // ------------------------------------------------------------ lamp on an arc track
  const R_ARC = 0.78;
  const track = new THREE.Group();
  track.userData.dynamic = true;
  g.add(track);
  {
    const pts: THREE.Vector3[] = [];
    const lim = (82 * Math.PI) / 180;
    for (let i = 0; i <= 40; i++) {
      const a = -lim + (i / 40) * 2 * lim;
      pts.push(C.clone().addScaledVector(xHat, Math.sin(a) * (R_ARC + 0.08)).addScaledVector(nHat, Math.cos(a) * (R_ARC + 0.08)));
    }
    put(track, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.009, 6), m.brass, 0, 0, 0, 0, 0, 0, false);
    // feet of the arc
    for (const s of [-1, 1]) {
      const p = pts[s < 0 ? 0 : pts.length - 1];
      put(track, new THREE.CylinderGeometry(0.012, 0.012, p.y - BENCH_H, 8), m.brass, p.x, (p.y + BENCH_H) / 2, p.z, 0, 0, 0, false);
    }
  }
  const lamp = new THREE.Group();
  lamp.userData.dynamic = true;
  g.add(lamp);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2c5a48, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(ctx.accent), emissiveIntensity: 0.05 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.13, 28, 1, true), shadeMat);
  shade.rotation.x = Math.PI / 2;
  lamp.add(shade);
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), m.brass);
  capM.rotation.x = Math.PI / 2;
  capM.position.z = -0.07;
  lamp.add(capM);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), lensMat);
  lens.position.z = 0.055;
  lamp.add(lens);
  const lampHalo = halo(0xffffff, 0.5);
  lampHalo.position.z = 0.08;
  lamp.add(lampHalo);
  const lampHit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  lamp.add(lampHit);
  // beam cone: apex at the lamp, opening along +z, length scaled to the target
  const beamGeo = new THREE.ConeGeometry(1, 1, 32, 1, true);
  beamGeo.translate(0, -0.5, 0);
  beamGeo.rotateX(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.visible = false; // posed on the first update
  beam.userData.dynamic = true;
  g.add(beam);

  // ------------------------------------------------------------ loads: fan and LED
  const FAN = new THREE.Vector3(-1.08, BENCH_H, 0.12);
  put(g, new THREE.CylinderGeometry(0.08, 0.09, 0.03, 24), m.darkWood, FAN.x, FAN.y + 0.015, FAN.z);
  put(g, new THREE.CylinderGeometry(0.012, 0.012, 0.28, 10), m.brass, FAN.x, FAN.y + 0.16, FAN.z);
  put(g, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16), m.blackMetal, FAN.x, FAN.y + 0.32, FAN.z - 0.02, Math.PI / 2);
  put(g, new THREE.TorusGeometry(0.15, 0.005, 6, 40), m.brass, FAN.x, FAN.y + 0.32, FAN.z + 0.04);
  const fan = new THREE.Group();
  fan.position.set(FAN.x, FAN.y + 0.32, FAN.z + 0.04);
  fan.userData.dynamic = true;
  g.add(fan);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    put(fan, rbox(0.05, 0.13, 0.006, 0.003), m.brass, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0, 0, 0.5, a - Math.PI / 2);
  }
  put(fan, new THREE.SphereGeometry(0.025, 12, 8), m.brass);
  bakeStatic(fan);
  const LEDP = new THREE.Vector3(-1.08, BENCH_H, -0.3);
  put(g, rbox(0.14, 0.06, 0.1, 0.015), m.darkWood, LEDP.x, LEDP.y + 0.03, LEDP.z);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: 0.3, emissive: 0xfff1d0, emissiveIntensity: 0 });
  put(g, new THREE.SphereGeometry(0.035, 16, 12), ledMat, LEDP.x, LEDP.y + 0.1, LEDP.z, 0, 0, 0, false);
  put(g, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), ledMat, LEDP.x, LEDP.y + 0.075, LEDP.z, 0, 0, 0, false);
  const ledHalo = halo(0xfff0d0, 0.4);
  ledHalo.position.set(LEDP.x, LEDP.y + 0.1, LEDP.z);
  g.add(ledHalo);
  const wire = new Wire(g, [[C.x + 0.12, BENCH_H + 0.42, -0.42], [-0.7, BENCH_H + 0.01, -0.3], [-0.95, BENCH_H + 0.01, -0.05], [FAN.x, BENCH_H + 0.04, FAN.z]], m.rubberRed);
  const wireLed = new Wire(g, [[C.x + 0.06, BENCH_H + 0.42, -0.45], [-0.7, BENCH_H + 0.01, -0.42], [LEDP.x + 0.07, BENCH_H + 0.03, LEDP.z]], m.rubberBlack);

  // in-world explode button
  const BTN = new THREE.Vector3(0.95, BENCH_H, 0.32);
  put(g, rbox(0.22, 0.04, 0.16, 0.015), m.darkWood, BTN.x, BTN.y + 0.02, BTN.z);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xc8402a, roughness: 0.35, emissive: new THREE.Color(ctx.accent), emissiveIntensity: 0.2 });
  const btn = put(g, new THREE.CylinderGeometry(0.045, 0.05, 0.035, 24), btnMat, BTN.x, BTN.y + 0.055, BTN.z, 0, 0, 0, false);
  const btnSign = sign(() => (explodeTarget ? t(L('Sätt ihop', 'Put together')) : t(L('Ta isär', 'Take apart'))), 0.24, 0.06);
  btnSign.mesh.position.set(BTN.x, BTN.y + 0.045, BTN.z + 0.11);
  btnSign.mesh.rotation.x = -0.5;
  g.add(btnSign.mesh);

  // ------------------------------------------------------------ photons and charge carriers
  const dotGeo = new THREE.SphereGeometry(0.011, 8, 6);
  const photonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const photons = new THREE.InstancedMesh(dotGeo, photonMat, NP);
  photons.frustumCulled = false;
  g.add(photons);
  const carrierMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const carriers = new THREE.InstancedMesh(dotGeo, carrierMat, NQ);
  carriers.frustumCulled = false;
  g.add(carriers);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NP; i++) photons.setMatrixAt(i, zero);
  for (let i = 0; i < NQ; i++) carriers.setMatrixAt(i, zero);
  const tmpC = new THREE.Color();
  for (let i = 0; i < NP; i++) photons.setColorAt(i, tmpC.setRGB(1, 1, 1));
  for (let i = 0; i < NQ; i++) carriers.setColorAt(i, tmpC.setRGB(1, 1, 1));
  const pPos = new Float32Array(NP * 3), pDir = new Float32Array(NP * 3);
  const pLeft = new Float32Array(NP), pLife = new Float32Array(NP);
  const pState = new Uint8Array(NP); // 0 dead, 1 incoming, 2 reflected, 3 passing, 4 flash
  const pFate = new Uint8Array(NP); // 0 absorb, 1 reflect, 2 pass
  const qPos = new Float32Array(NQ * 3), qVy = new Float32Array(NQ), qStop = new Float32Array(NQ), qLife = new Float32Array(NQ);
  const qState = new Uint8Array(NQ);
  let spawnAcc = 0;
  const elecColor = new THREE.Color(0x6fe8ff).multiplyScalar(1.6);
  const holeColor = new THREE.Color(0xff7a3c).multiplyScalar(1.6);
  const photonColor = new THREE.Color();
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
  const _mm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const lampPos = new THREE.Vector3();
  const lampTarget = new THREE.Vector3();

  const spawnCarrier = (x: number, y: number, z: number, up: boolean, stopY: number) => {
    for (let i = 0; i < NQ; i++) {
      if (qState[i]) continue;
      qState[i] = 1;
      qPos[i * 3] = x; qPos[i * 3 + 1] = y; qPos[i * 3 + 2] = z;
      qVy[i] = up ? 0.35 : -0.35;
      qStop[i] = stopY;
      qLife[i] = 0;
      carriers.setColorAt(i, up ? elecColor : holeColor);
      if (carriers.instanceColor) carriers.instanceColor.needsUpdate = true;
      return;
    }
  };

  const spawnPhoton = () => {
    let i = 0;
    while (i < NP && pState[i]) i++;
    if (i >= NP) return;
    const exploded = explode > 0.99;
    // start just in front of the lamp lens
    _v.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0.06);
    lamp.localToWorld(_v);
    g.worldToLocal(_v);
    const nm = lambda;
    const r = Math.random();
    const fate = r < 0.05 ? 1 : Math.random() < eqe(nm) / 0.95 ? 0 : 2;
    let dist: number;
    if (exploded) {
      _t.set(C.x + (Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.44);
      // where along the path does it stop?
      let stopY: number;
      if (fate === 1) stopY = towerY(1) + LAYERS[1].vis / 2;
      else if (fate === 0) stopY = nm < 500 ? towerY(Math.random() < 0.5 ? IDX_EMITTER : IDX_JUNCTION) : towerY(IDX_BASE);
      else stopY = towerY(LAYERS.length - 1) - 0.25;
      _t.y = stopY;
      _w.subVectors(_t, _v);
      dist = _w.length();
      _w.normalize();
    } else {
      // a random point on the front glass
      _t.copy(C).addScaledVector(nHat, totalVis / 2 + 0.002)
        .addScaledVector(xHat, (Math.random() - 0.5) * (W - 0.06))
        .addScaledVector(dHat, (Math.random() - 0.5) * (D - 0.06));
      _w.subVectors(_t, _v);
      dist = _w.length();
      _w.normalize();
    }
    pPos[i * 3] = _v.x; pPos[i * 3 + 1] = _v.y; pPos[i * 3 + 2] = _v.z;
    pDir[i * 3] = _w.x; pDir[i * 3 + 1] = _w.y; pDir[i * 3 + 2] = _w.z;
    pLeft[i] = dist;
    pLife[i] = 0;
    pState[i] = 1;
    pFate[i] = fate;
    photons.setColorAt(i, photonColor);
    if (photons.instanceColor) photons.instanceColor.needsUpdate = true;
  };

  const clearParticles = () => {
    pState.fill(0);
    qState.fill(0);
  };

  // ------------------------------------------------------------ electrical model
  const NVT = N_CELLS * VT;
  const loadI = (V: number) => (loadFan ? V / R_FAN : Math.max(0, (V - LED_VTH) / LED_R));
  const solve = () => {
    const cosT = Math.max(0, Math.cos(theta * (1 - explode)));
    const resp = (eqe(lambda) * lambda) / HC; // A/W
    const IL = resp * irr * A_CELL * cosT;
    const voc = IL > 0 ? NVT * Math.log(IL / I0 + 1) : 0;
    // the cell current falls and the load current rises with V: bisection on the difference
    let lo = 0, hi = Math.max(voc, 1e-6);
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (IL - I0 * (Math.exp(mid / NVT) - 1) - loadI(mid) > 0) lo = mid; else hi = mid;
    }
    op.V = (lo + hi) / 2;
    op.I = Math.max(0, loadI(op.V));
    op.IL = IL;
  };

  // ------------------------------------------------------------ interaction
  const plane = new THREE.Plane();
  const pn = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const setLampFromPointer = (info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) => {
    g.updateMatrixWorld();
    pn.crossVectors(xHat, nHat).transformDirection(g.matrixWorld);
    pc.copy(C);
    g.localToWorld(pc);
    plane.setFromNormalAndCoplanarPoint(pn, pc);
    const p = info.onPlane(plane);
    if (!p) return;
    g.worldToLocal(p).sub(C);
    const a = Math.atan2(p.dot(xHat), p.dot(nHat));
    theta = clamp(a, (-80 * Math.PI) / 180, (80 * Math.PI) / 180);
  };
  ctx.interaction.add(lamp, {
    label: L('Dra lampan längs bågen', 'Drag the lamp along the arc'),
    enabled: () => explode < 0.05,
    onHover: (on) => { shadeMat.emissiveIntensity = on ? 0.5 : 0.05; },
    onDragStart: (info) => { draggingLamp = true; touched = true; setLampFromPointer(info); ctx.sfx.resume(); },
    onDrag: (info) => setLampFromPointer(info),
    onDragEnd: () => { draggingLamp = false; },
  });

  const toggleExplode = () => {
    explodeTarget = explodeTarget ? 0 : 1;
    clearParticles();
    btnSign.redraw();
    ctx.sfx.whoosh();
    if (hud) hud.explodeBtn.textContent = '🔧 ' + t(explodeTarget ? L('Sätt ihop', 'Put together') : L('Ta isär', 'Take apart'));
    if (explodeTarget) {
      cheers.say('sol-explode', L(
        'Titta! En solpanel är en smörgås av tolv lager – och själva kislet är tunnare än två papper. Klicka på ett lager!',
        'Look! A solar module is a sandwich of twelve layers, and the silicon itself is thinner than two sheets of paper. Click a layer!',
      ), { expression: 'surprised' });
    }
  };
  ctx.interaction.add(btn, {
    label: L('Ta isär / sätt ihop', 'Take apart / put together'),
    onHover: (on) => { btnMat.emissiveIntensity = on ? 0.7 : 0.2; },
    onClick: toggleExplode,
  });

  const selectLayer = (i: number) => {
    selected = selected === i ? -1 : i;
    labels.redraw();
    ctx.sfx.pop();
    if (hud) hud.detail.textContent = selected >= 0 ? `${t(LAYERS[selected].name)} · ${t(LAYERS[selected].thick)}: ${t(LAYERS[selected].detail)}` : t(L('Klicka på ett lager för att läsa mer.', 'Click a layer to read more.'));
  };
  layerObjs.forEach((o, i) => {
    ctx.interaction.add(o, {
      label: LAYERS[i].name,
      enabled: () => explode > 0.95,
      onClick: () => selectLayer(i),
    });
  });
  ctx.interaction.add(labels.mesh, {
    label: L('Klicka för detaljer', 'Click for details'),
    enabled: () => explode > 0.95,
    onClick: (info) => {
      const uv = info.hit?.uv;
      if (!uv) return;
      const row = clamp(Math.floor((1 - uv.y) * LAYERS.length), 0, LAYERS.length - 1);
      selectLayer(row);
    },
  });

  // ------------------------------------------------------------ HUD
  const presets = [
    { nm: 450, label: L('Blå 450 nm', 'Blue 450 nm') },
    { nm: 530, label: L('Grön 530 nm', 'Green 530 nm') },
    { nm: 650, label: L('Röd 650 nm', 'Red 650 nm') },
    { nm: 950, label: L('IR 950 nm', 'IR 950 nm') },
    { nm: 1200, label: L('IR 1200 nm', 'IR 1200 nm') },
  ];
  let hud: null | {
    energy: Readout; gap: Readout; flux: Readout; angle: Readout; cur: Readout; volt: Readout; power: Readout;
    out: Meter; detail: HTMLElement; explodeBtn: HTMLButtonElement; lambdaSlider: HTMLInputElement; setPreset: (i: number) => void;
  } = null;
  const controls = (panel: ControlPanel) => {
    const explodeBtn = panel.button(explodeTarget ? L('Sätt ihop', 'Put together') : L('Ta isär', 'Take apart'), toggleExplode, { primary: true, icon: '🔧' });
    const detail = panel.note(L('Klicka på ett lager för att läsa mer.', 'Click a layer to read more.'));
    if (selected >= 0) detail.textContent = `${t(LAYERS[selected].name)} · ${t(LAYERS[selected].thick)}: ${t(LAYERS[selected].detail)}`;
    panel.heading(L('Lampan', 'The lamp'));
    let lambdaSlider: HTMLInputElement;
    const setPreset = panel.buttons(presets.map((p) => ({
      label: p.label,
      onClick: () => { lambda = p.nm; lambdaSlider.value = String(p.nm); lambdaSlider.dispatchEvent(new Event('input')); },
    })), presets.findIndex((p) => p.nm === lambda));
    lambdaSlider = panel.slider(L('Våglängd', 'Wavelength'), { min: 350, max: 1300, step: 5, value: lambda, format: (v) => `${v} nm` }, (v) => {
      lambda = v;
      touched = true;
      setPreset(presets.findIndex((p) => p.nm === v));
    });
    panel.slider(L('Ljusstyrka på panelen', 'Irradiance on the module'), { min: 0, max: 1000, step: 10, value: irr, format: (v) => `${v} W/m²` }, (v) => { irr = v; touched = true; });
    panel.note(L('Full sol en klar sommardag ≈ 1000 W/m².', 'Full sun on a clear summer day ≈ 1000 W/m².'));
    panel.buttons([
      { label: L('Fläkt', 'Fan'), icon: '🌀', onClick: () => { loadFan = true; } },
      { label: L('LED-lampa', 'LED lamp'), icon: '💡', onClick: () => { loadFan = false; } },
    ], loadFan ? 0 : 1);
    const energy = panel.readout(L('Fotonenergi E = hc/λ', 'Photon energy E = hc/λ'));
    const gap = panel.readout(L('Kiselns bandgap', 'Silicon band gap'), `${fmt(EG, 2)} eV`);
    const flux = panel.readout(L('Fotoner per sekund på panelen', 'Photons per second on the module'));
    const angle = panel.readout(L('Infallsvinkel', 'Angle of incidence'));
    const cur = panel.readout(L('Ström', 'Current'));
    const volt = panel.readout(L('Spänning (15 celler i serie)', 'Voltage (15 cells in series)'));
    const power = panel.readout(L('Effekt till lasten', 'Power to the load'));
    const out = panel.meter(L('Lasten', 'The load'), '#ffc23d');
    hud = { energy, gap, flux, angle, cur, volt, power, out, detail, explodeBtn, lambdaSlider, setPreset };
    return () => { hud = null; };
  };

  ctx.addStation({
    id: 'electricity-solar',
    title: L('Solcellen – ta isär den!', 'The solar cell: take it apart!'),
    position: [-6.0, -5.0],
    viewpoint: st.view([0.3, 1.85, 2.7], [0.3, 1.5, 0]),
    intro: L(
      'En solpanel ser ut som en blå glasskiva, men inuti finns tolv lager som samarbetar. Ta isär den och skjut fotoner på den!',
      'A solar module looks like a blue sheet of glass, but inside are twelve layers working together. Take it apart and fire photons at it!',
    ),
    howTo: L(
      'Dra lampan längs bågen, välj färg och styrka i panelen. Tryck "Ta isär" och klicka på lagren för att läsa om dem.',
      'Drag the lamp along the arc, choose colour and strength in the panel. Press "Take apart" and click the layers to read about them.',
    ),
    science: L(
      'Ljus består av fotoner med energin E = hc/λ. Om en foton har mer än kiselns bandgap, 1,12 eV, kan den slå loss en elektron och lämna ett "hål" efter sig. pn-övergångens inbyggda elfält skickar elektronen upp mot silverfingrarna och hålet ner mot baksidan – så uppstår strömmen. Fotoner längre än 1107 nm (som IR på 1200 nm) har för lite energi och går rakt igenom. Men en blå foton ger inte mer ström än en röd: varje foton ger högst en elektron, och överskottsenergin blir värme – därför ger samma watt rött ljus faktiskt mer ström. Strömmen följer också cos(vinkeln), eftersom snett ljus sprids över en större yta.',
      'Light is made of photons with energy E = hc/λ. If a photon has more than silicon’s band gap of 1.12 eV, it can knock an electron loose and leave a "hole" behind. The p-n junction’s built-in field sends the electron up to the silver fingers and the hole down to the back, and that is the current. Photons longer than 1107 nm (like IR at 1200 nm) have too little energy and pass straight through. But a blue photon does not give more current than a red one: each photon gives at most one electron and the extra energy becomes heat, so the same watts of red light actually give more current. The current also follows cos(angle), because slanted light is spread over a larger area.',
    ),
    wow: L(
      'Det blå antireflexskiktet är bara 75 nanometer tjockt – ungefär en tusendel av ett hårstrå. Utan det skulle kislet spegla bort över 30 % av ljuset.',
      'The blue anti-reflective coating is only 75 nanometres thick, about a thousandth of a hair. Without it the silicon would mirror away over 30 % of the light.',
    ),
    controls,
    onFocus: () => { focused = true; fanVoice = ctx.sfx.voice(80, { type: 'sawtooth', gain: 0 }); },
    onBlur: () => { focused = false; draggingLamp = false; fanVoice?.stop(0.2); fanVoice = null; },
  });
  let fanVoice: ReturnType<RoomContext['sfx']['voice']> | null = null;

  // ------------------------------------------------------------ update
  const hudTick = new Every(0.1);
  const lampPosA = new THREE.Vector3();
  const lampPosE = new THREE.Vector3(C.x, 2.68, 0);
  const lampTgtE = new THREE.Vector3(C.x, 1.2, 0);
  const smooth = (x: number) => x * x * (3 - 2 * x);

  function update(dt: number, time: number) {
    btnMat.emissiveIntensity = Math.max(btnMat.emissiveIntensity * 0.98, 0.15 + 0.15 * Math.sin(time * 2.5));
    if (!focused && !st.near(9)) return;

    // explode animation (staggered per layer)
    const prevE = explode;
    explode += clamp(explodeTarget - explode, -dt / 1.6, dt / 1.6);
    if ((prevE < 1 && explode >= 1) || (prevE > 0 && explode <= 0)) clearParticles();
    layerObjs.forEach((o, i) => {
      const k = smooth(clamp(explode * 1.5 - (i / (LAYERS.length - 1)) * 0.5, 0, 1));
      _v.copy(C).addScaledVector(nHat, assembledOff[i]);
      _w.set(C.x, towerY(i), 0);
      if (i === selected && explode > 0.95) _w.z += 0.14;
      o.position.lerpVectors(_v, _w, k);
      o.quaternion.slerpQuaternions(qTilt, qFlat, k);
      // highlight
      const mt = layerMats[i];
      if (i === selected) {
        mt.emissive.setHex(ctx.accent);
        mt.emissiveIntensity = 0.35 + 0.15 * Math.sin(time * 4);
      } else if (i !== IDX_JUNCTION) {
        mt.emissive.copy(baseEmissive[i]);
        mt.emissiveIntensity = baseEmissiveI[i];
      }
    });
    const lblMat = labels.mesh.material as THREE.MeshBasicMaterial;
    lblMat.opacity = clamp((explode - 0.7) / 0.3, 0, 1);
    labels.mesh.visible = lblMat.opacity > 0.01;
    track.visible = explode < 0.5;

    // lamp pose
    lampPosA.copy(C).addScaledVector(xHat, Math.sin(theta) * R_ARC).addScaledVector(nHat, Math.cos(theta) * R_ARC);
    const ke = smooth(explode);
    lampPos.lerpVectors(lampPosA, lampPosE, ke);
    lampTarget.lerpVectors(C, lampTgtE, ke);
    lamp.position.copy(lampPos);
    _v.copy(lampTarget);
    g.localToWorld(_v);
    lamp.lookAt(_v);
    beam.visible = true;
    beam.position.copy(lampPos);
    beam.quaternion.copy(lamp.quaternion);
    const bl = lampPos.distanceTo(lampTarget);
    beam.scale.set(0.36, 0.36, bl);

    // colour and strength
    wavelengthColor(lambda, photonColor);
    const visible = lambda >= 380 && lambda <= 720;
    const inten = irr / 1000;
    lensMat.color.copy(photonColor).multiplyScalar(visible ? 0.4 + 1.6 * inten : 0.25);
    beamMat.color.copy(photonColor);
    beamMat.opacity = visible ? 0.012 + 0.035 * inten : 0.006;
    lampHalo.material.color.copy(photonColor);
    lampHalo.material.opacity = visible ? 0.2 + 0.7 * inten : 0.08;

    // electrical
    solve();
    const exploding = explode > 0.01 && explode < 0.99;
    const level = loadFan ? clamp(op.V / FAN_V, 0, 1) : clamp(op.I / LED_FULL, 0, 1);
    // fan: speed ∝ voltage (a DC motor), with a little inertia
    fanSpeed += ((loadFan ? (op.V / FAN_V) * 40 : 0) - fanSpeed) * ease(dt, 0.6);
    fanAngle += fanSpeed * dt;
    fan.rotation.z = fanAngle;
    const ledB = loadFan ? 0 : clamp(op.I / LED_FULL, 0, 1);
    ledMat.emissiveIntensity = ledB * 2.6;
    ledHalo.material.opacity = ledB * 0.9;
    wire.set(loadFan ? op.I / 10 : 0, 1);
    wireLed.set(loadFan ? 0 : op.I / LED_FULL, 1);
    wire.update(dt);
    wireLed.update(dt);
    const jm = layerMats[IDX_JUNCTION];
    if (selected !== IDX_JUNCTION) {
      jm.emissive.setHex(0xffb347);
      jm.emissiveIntensity = 0.25 + 1.2 * clamp(op.IL / 12, 0, 1);
    }
    if (fanVoice) {
      fanVoice.setFreq(40 + fanSpeed * 4);
      fanVoice.setGain(loadFan ? Math.min(0.025, fanSpeed * 0.0008) : 0);
    }

    // photons
    if (!exploding && irr > 0) {
      spawnAcc += dt * 70 * inten;
      while (spawnAcc > 1) { spawnAcc -= 1; spawnPhoton(); }
    }
    const speed = 1.6;
    const exploded = explode > 0.99;
    for (let i = 0; i < NP; i++) {
      const s = pState[i];
      if (!s) { photons.setMatrixAt(i, zero); continue; }
      pLife[i] += dt;
      if (s === 4) {
        // absorption flash
        const k = pLife[i] / 0.25;
        if (k >= 1) { pState[i] = 0; photons.setMatrixAt(i, zero); continue; }
        _s.setScalar(1 + 2.5 * k * (1 - k) * 4);
      } else {
        const step = speed * dt;
        pPos[i * 3] += pDir[i * 3] * step;
        pPos[i * 3 + 1] += pDir[i * 3 + 1] * step;
        pPos[i * 3 + 2] += pDir[i * 3 + 2] * step;
        pLeft[i] -= step;
        _s.setScalar(s === 3 ? 0.8 : 1);
        if (pLeft[i] <= 0) {
          if (s === 1) {
            const f = pFate[i];
            if (f === 0) {
              pState[i] = 4;
              pLife[i] = 0;
              if (exploded) {
                const x = pPos[i * 3], y = pPos[i * 3 + 1], z = pPos[i * 3 + 2];
                spawnCarrier(x, y, z, true, towerY(IDX_FINGERS));
                spawnCarrier(x + 0.01, y, z, false, towerY(IDX_CONTACT));
              }
            } else if (f === 1) {
              // reflect off the glass
              _v.set(pDir[i * 3], pDir[i * 3 + 1], pDir[i * 3 + 2]);
              const nrm = exploded ? _w.set(0, 1, 0) : _w.copy(nHat);
              _v.addScaledVector(nrm, -2 * _v.dot(nrm));
              pDir[i * 3] = _v.x; pDir[i * 3 + 1] = _v.y; pDir[i * 3 + 2] = _v.z;
              pState[i] = 2;
              pLeft[i] = 0.5;
            } else {
              pState[i] = 3;
              pLeft[i] = exploded ? 0.1 : 0.5;
            }
          } else {
            pState[i] = 0;
            photons.setMatrixAt(i, zero);
            continue;
          }
        }
      }
      _v.set(pPos[i * 3], pPos[i * 3 + 1], pPos[i * 3 + 2]);
      _mm.compose(_v, _q, _s);
      photons.setMatrixAt(i, _mm);
    }
    photons.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NQ; i++) {
      if (!qState[i]) { carriers.setMatrixAt(i, zero); continue; }
      qLife[i] += dt;
      const y = qPos[i * 3 + 1] + qVy[i] * dt;
      const done = qVy[i] > 0 ? y >= qStop[i] : y <= qStop[i];
      if (done || qLife[i] > 4 || !exploded) { qState[i] = 0; carriers.setMatrixAt(i, zero); continue; }
      qPos[i * 3 + 1] = y;
      _v.set(qPos[i * 3], y, qPos[i * 3 + 2]);
      _s.setScalar(0.85);
      _mm.compose(_v, _q, _s);
      carriers.setMatrixAt(i, _mm);
    }
    carriers.instanceMatrix.needsUpdate = true;

    // milestones
    const ePh = HC / lambda;
    if (lambda > 1107 && irr > 300) {
      cheers.say('sol-ir', L(
        `Inget händer! En foton på ${fmt(lambda, 0)} nm har bara ${fmt(ePh, 2)} eV – mindre än kiselns 1,12 eV. Den går rakt igenom.`,
        `Nothing happens! A ${fmt(lambda, 0)} nm photon has only ${fmt(ePh, 2)} eV, less than silicon’s 1.12 eV. It passes straight through.`,
      ), { expression: 'thinking' });
    }
    if (lambda < 480 && op.IL > 2) {
      cheers.say('sol-blue', L(
        'Blå fotoner har mer energi än röda – men varje foton ger ändå bara en elektron. Resten blir värme!',
        'Blue photons carry more energy than red ones, but each photon still gives just one electron. The rest becomes heat!',
      ), { expression: 'idea' });
    }
    if (level > 0.7 && touched) {
      cheers.say('sol-run', L('Där snurrar det! Ljus blir el utan några rörliga delar.', 'There it goes! Light turned into electricity with no moving parts.'), { celebrate: true });
    }
    if (Math.abs(theta) > 1.2 && irr > 300 && !draggingLamp && explode < 0.05) {
      cheers.say('sol-angle', L('Snett ljus sprids över en större yta, så strömmen följer cos(vinkeln).', 'Slanted light spreads over a bigger area, so the current follows cos(angle).'), { expression: 'idea' });
    }

    if (hud && hudTick.tick(dt)) {
      hud.energy.set(`${fmt(ePh, 2)} eV (${fmt(lambda, 0)} nm)`);
      hud.gap.set(ePh > EG ? `${fmt(EG, 2)} eV · ${t(L('fotonen räcker ✓', 'photon is enough ✓'))}` : `${fmt(EG, 2)} eV · ${t(L('för svag – går igenom ✗', 'too weak, passes through ✗'))}`);
      const cosT = Math.max(0, Math.cos(theta * (1 - explode)));
      const phot = (irr * A_CELL * N_CELLS * cosT) / (ePh * Q);
      hud.flux.set(phot > 0 ? sci(phot, 1) : '0');
      hud.angle.set(`${fmt((theta * (1 - explode) * 180) / Math.PI, 0)}° · cos = ${fmt(cosT, 2)}`);
      hud.cur.set(`${fmt(op.I, 2)} A`);
      hud.volt.set(`${fmt(op.V, 2)} V`);
      hud.power.set(`${fmt(op.I * op.V, 1)} W`);
      hud.out.set(level, loadFan ? `${fmt((op.V / FAN_V) * 1500, 0)} ${t(L('varv/min', 'rpm'))}` : `${fmt(ledB * 100, 0)} %`);
    }
  }

  return { update };
}
