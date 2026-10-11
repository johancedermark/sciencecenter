/** Station 2: the red-cabbage pH rainbow and a vinegar + baking soda neutralisation with a live pH curve. */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { L10n } from '../../core/types';
import { clamp, fmt, lerpStops, type Kit, type StationRuntime } from './common';
import { ACID_ML, EQUIV_ML, co2mmol, titrationPH } from './phmath';

interface Sub {
  name: L10n;
  icon: string;
  pH: number;
  base: number;
  milky?: boolean;
  danger?: boolean;
}

const SUBS: Sub[] = [
  { name: L('Citronsaft', 'Lemon juice'), icon: '🍋', pH: 2.0, base: 0xf0e49a },
  { name: L('Ättika', 'Vinegar'), icon: '🥒', pH: 2.9, base: 0xe9ecef },
  { name: L('Kolsyrat vatten', 'Soda water'), icon: '🫧', pH: 4.0, base: 0xdcecf3 },
  { name: L('Mjölk', 'Milk'), icon: '🥛', pH: 6.6, base: 0xf7f4ea, milky: true },
  { name: L('Vatten', 'Water'), icon: '💧', pH: 7.0, base: 0xd5e9f2 },
  { name: L('Bikarbonat', 'Baking soda'), icon: '🧁', pH: 8.3, base: 0xe4eef2 },
  { name: L('Tvål', 'Soap'), icon: '🧼', pH: 10.0, base: 0xe6f2ec },
  { name: L('Ammoniak', 'Ammonia'), icon: '🧴', pH: 11.0, base: 0xe2edf5 },
  { name: L('Avloppsrensare', 'Drain cleaner'), icon: '⚠️', pH: 13.0, base: 0xeaeee0, danger: true },
];

/** Red-cabbage (anthocyanin) colour vs pH: red → pink → violet → blue → green → yellow. */
const STOPS: [number, THREE.Color][] = ([
  [1, 0xc8102e], [2, 0xd8173f], [3, 0xe0457f], [4, 0xb04a9c], [5, 0x8f4fb0], [6, 0x7650b8], [7, 0x6658c0],
  [8, 0x3a6ad0], [9, 0x2f86c0], [10, 0x2a9e94], [11, 0x3db35a], [12, 0x9cc43a], [13, 0xd4c62c], [14, 0xe0c020],
] as [number, number][]).map(([p, c]) => [p, new THREE.Color(c)]);

export function cabbageColor(pH: number, out: THREE.Color) {
  return lerpStops(STOPS, pH, out);
}

const BRIGHT = 0.78; // keep liquids under the bloom threshold

function tubeProfile(r: number, h: number, open: boolean) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * r, r - Math.cos(a) * r));
  }
  pts.push(new THREE.Vector2(r, h));
  if (!open) pts.push(new THREE.Vector2(0, h));
  return pts;
}

export function buildPH(kit: Kit): StationRuntime {
  const { ctx, mats } = kit;
  const BX = -9.45, BZ = 0.6;
  const top = 0.9;
  kit.bench(BX, BZ, 3.6, 1.0, Math.PI / 2);
  ctx.addCollider(BX, BZ, 1.05, 3.65);

  let added = 0; // mL of baking-soda solution
  let curPH = titrationPH(0);
  // ---------------------------------------------------------------- tube rack
  const N = SUBS.length;
  const TX = -9.3;
  const tubeZ = (i: number) => 2.15 - i * 0.15;
  const TUBE_R = 0.025, TUBE_H = 0.22, TUBE_Y = top + 0.03;
  kit.box(0.12, 0.05, N * 0.15 + 0.08, mats.darkWood, TX, top, tubeZ((N - 1) / 2));
  kit.box(0.12, 0.018, N * 0.15 + 0.08, mats.darkWood, TX, top + 0.13, tubeZ((N - 1) / 2));
  for (const s of [-1, 1]) kit.box(0.1, 0.13, 0.02, mats.darkWood, TX, top, tubeZ((N - 1) / 2) + s * (N * 0.15 / 2 + 0.03));

  const glassGeo = new THREE.LatheGeometry(tubeProfile(TUBE_R, TUBE_H, true), 20);
  const liqGeo = new THREE.LatheGeometry(tubeProfile(TUBE_R * 0.86, 1, false), 16);
  const glass = new THREE.InstancedMesh(glassGeo, mats.glass, N);
  const liqMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 });
  const liquid = new THREE.InstancedMesh(liqGeo, liqMat, N);
  const m4 = new THREE.Matrix4();
  const fill = new Float32Array(N).fill(0.1);
  const ind = new Float32Array(N); // 0..1 indicator mixed in
  const indTarget = new Float32Array(N);
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  const white = new THREE.Color(0xffffff);

  const tubeColor = (i: number, out: THREE.Color) => {
    const s = SUBS[i];
    out.setHex(s.base);
    cabbageColor(s.pH, tmp);
    if (s.milky) tmp.lerp(white, 0.45);
    return out.lerp(tmp, ind[i]).multiplyScalar(BRIGHT);
  };
  const writeTube = (i: number) => {
    m4.makeScale(1, fill[i], 1).setPosition(TX, TUBE_Y + 0.003, tubeZ(i));
    liquid.setMatrixAt(i, m4);
    liquid.setColorAt(i, tubeColor(i, col));
  };
  for (let i = 0; i < N; i++) {
    m4.makeTranslation(TX, TUBE_Y, tubeZ(i));
    glass.setMatrixAt(i, m4);
    writeTube(i);
  }
  liquid.instanceMatrix.needsUpdate = true;
  liquid.instanceColor!.needsUpdate = true;
  liquid.renderOrder = 1;
  glass.renderOrder = 2;
  ctx.group.add(liquid, glass);

  // name tags under the tubes (emoji + name; the pH appears once the indicator is in)
  const tags = kit.canvasPlane(N * 0.15, 0.12, 1024, (g, W, H) => {
    g.fillStyle = '#f4ead8';
    g.fillRect(0, 0, W, H);
    const slot = W / N;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      const cx = (i + 0.5) * slot;
      if (i) {
        g.fillStyle = 'rgba(90,60,40,0.25)';
        g.fillRect(i * slot - 1, 6, 2, H - 12);
      }
      g.font = `${Math.round(H * 0.3)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      g.fillText(SUBS[i].icon, cx, H * 0.22);
      const name = t(SUBS[i].name);
      let fs = Math.round(H * 0.2);
      g.font = `700 ${fs}px "Baloo 2", system-ui, sans-serif`;
      while (g.measureText(name).width > slot * 0.92 && fs > 8) {
        fs--;
        g.font = `700 ${fs}px "Baloo 2", system-ui, sans-serif`;
      }
      g.fillStyle = SUBS[i].danger ? '#a3261b' : '#3b2a1c';
      g.fillText(name, cx, H * 0.55);
      if (indTarget[i] > 0) {
        g.font = `800 ${Math.round(H * 0.2)}px "Baloo 2", system-ui, sans-serif`;
        cabbageColor(SUBS[i].pH, tmp);
        g.fillStyle = `#${tmp.clone().multiplyScalar(0.8).getHexString()}`;
        g.fillText(`pH ${fmt(SUBS[i].pH, SUBS[i].pH % 1 ? 1 : 0)}`, cx, H * 0.83);
      }
    }
  });
  tags.mesh.position.set(TX + 0.15, top + 0.035, tubeZ((N - 1) / 2));
  tags.mesh.rotation.y = Math.PI / 2;
  tags.mesh.rotateX(-1.15);
  ctx.group.add(tags.mesh);
  onLangChange(() => tags.redraw());

  // ---------------------------------------------------------------- cabbage jug + pipette
  const JX = -9.35, JZ = 0.62;
  const jugGlass = new THREE.Mesh(kit.geos.openCyl, mats.glass);
  jugGlass.scale.set(0.07, 0.17, 0.07);
  jugGlass.position.set(JX, top + 0.085, JZ);
  const jugLiquid = new THREE.Mesh(kit.geos.cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5a3aa0).multiplyScalar(0.8), transparent: true, opacity: 0.9 }));
  jugLiquid.scale.set(0.064, 0.12, 0.064);
  jugLiquid.position.set(JX, top + 0.062, JZ);
  ctx.group.add(jugLiquid, jugGlass);
  const cabbage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), new THREE.MeshStandardMaterial({ color: 0x6a2f7a, roughness: 0.75, flatShading: true }));
  cabbage.position.set(-9.6, top + 0.09, -0.85);
  cabbage.scale.set(1, 0.9, 1);
  ctx.group.add(cabbage);
  const jugTag = kit.label(() => t(L('Rödkålssaft', 'Red-cabbage juice')), 0.2, 0.045, { px: 256 });
  jugTag.mesh.position.set(JX + 0.076, top + 0.1, JZ);
  jugTag.mesh.rotation.y = Math.PI / 2;
  ctx.group.add(jugTag.mesh);

  const pipette = new THREE.Group();
  const pipGlass = new THREE.Mesh(kit.geos.cyl, mats.glassRim);
  pipGlass.scale.set(0.006, 0.16, 0.006);
  pipGlass.position.y = 0.08;
  const bulb = new THREE.Mesh(kit.geos.sphere, new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }));
  bulb.scale.set(0.014, 0.022, 0.014);
  bulb.position.y = 0.175;
  const pipLiquid = new THREE.Mesh(kit.geos.cyl, jugLiquid.material);
  pipLiquid.scale.set(0.0045, 0.06, 0.0045);
  pipLiquid.position.y = 0.035;
  pipette.add(pipGlass, bulb, pipLiquid);
  const PIP_REST = new THREE.Vector3(JX, top + 0.19, JZ);
  pipette.position.copy(PIP_REST);
  ctx.group.add(pipette);

  // ---------------------------------------------------------------- titration: beaker, burette, pH meter
  const KX = -9.3, KZ = -0.08;
  kit.box(0.2, 0.05, 0.2, mats.blackTop, KX, top, KZ); // stirrer plate
  const beakerY = top + 0.05;
  const beaker = new THREE.Mesh(kit.geos.openCyl, mats.glass);
  beaker.scale.set(0.065, 0.14, 0.065);
  beaker.position.set(KX, beakerY + 0.07, KZ);
  const beakerBottom = new THREE.Mesh(new THREE.CircleGeometry(0.065, 24), mats.glassRim);
  beakerBottom.rotation.x = -Math.PI / 2;
  beakerBottom.position.set(KX, beakerY + 0.002, KZ);
  const bLiqMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
  const bLiquid = new THREE.Mesh(kit.geos.cyl, bLiqMat);
  bLiquid.position.set(KX, beakerY, KZ);
  ctx.group.add(bLiquid, beaker, beakerBottom);
  // burette on a stand
  const standRod = new THREE.Mesh(kit.geos.cyl, mats.steel);
  standRod.scale.set(0.008, 0.75, 0.008);
  standRod.position.set(KX - 0.14, top + 0.375, KZ);
  kit.box(0.12, 0.015, 0.22, mats.blackTop, KX - 0.12, top, KZ);
  const arm = new THREE.Mesh(kit.geos.cyl, mats.steel);
  arm.scale.set(0.006, 0.14, 0.006);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(KX - 0.07, top + 0.6, KZ);
  const burette = new THREE.Mesh(kit.geos.cyl, mats.glassRim);
  burette.scale.set(0.012, 0.42, 0.012);
  burette.position.set(KX, top + 0.52, KZ);
  const buretteLiq = new THREE.Mesh(kit.geos.cyl, new THREE.MeshBasicMaterial({ color: 0xcfe3ea, transparent: true, opacity: 0.6 }));
  buretteLiq.position.set(KX, top + 0.52, KZ);
  const tap = new THREE.Mesh(kit.geos.cyl, mats.brass);
  tap.scale.set(0.007, 0.05, 0.007);
  tap.rotation.z = Math.PI / 2;
  tap.position.set(KX, top + 0.3, KZ);
  const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.04, 8), mats.glassRim);
  tipCone.rotation.x = Math.PI;
  tipCone.position.set(KX, top + 0.27, KZ);
  ctx.group.add(standRod, arm, burette, buretteLiq, tap, tipCone);
  kit.staticize(standRod, arm, tipCone);
  const burTag = kit.label(() => t(L('NaHCO₃ 1 M', 'NaHCO₃ 1 M')), 0.16, 0.04, { px: 256 });
  burTag.mesh.position.set(KX + 0.02, top + 0.56, KZ);
  burTag.mesh.rotation.y = Math.PI / 2;
  ctx.group.add(burTag.mesh);
  const drop = new THREE.Mesh(kit.geos.sphere, new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.85 }));
  drop.scale.setScalar(0.006);
  drop.visible = false;
  ctx.group.add(drop);
  // pH meter
  kit.box(0.12, 0.05, 0.16, mats.blackTop, KX + 0.02, top, KZ - 0.32);
  const meter = kit.canvasPlane(0.14, 0.07, 256, (g, W, H) => {
    g.fillStyle = '#0c1a14';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#58ffb0';
    g.font = `700 ${Math.round(H * 0.42)}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`pH ${fmt(curPH, 2)}`, W / 2, H * 0.55);
  });
  meter.mesh.position.set(KX + 0.02, top + 0.12, KZ - 0.32);
  meter.mesh.rotation.y = Math.PI / 2;
  kit.box(0.02, 0.07, 0.15, mats.blackTop, KX + 0.0, top + 0.05, KZ - 0.32);
  ctx.group.add(meter.mesh);
  const probe = new THREE.Mesh(kit.geos.cyl, mats.blackTop);
  probe.scale.set(0.006, 0.2, 0.006);
  probe.rotation.x = 0.25;
  probe.position.set(KX + 0.035, beakerY + 0.1, KZ - 0.03);
  ctx.group.add(probe);
  kit.staticize(probe, beakerBottom, cabbage);
  const kTag = kit.label(() => t(L('Utspädd ättika + rödkål', 'Diluted vinegar + cabbage')), 0.26, 0.04, { px: 384 });
  kTag.mesh.position.set(KX + 0.105, top + 0.025, KZ);
  kTag.mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  ctx.group.add(kTag.mesh);

  // ---------------------------------------------------------------- state
  let shownPH = curPH;
  let fizz = 0; // fizz intensity (decays)
  let dropT = -1;
  let pendingML = 0;
  const queue: number[] = [];
  let pipT = -1;
  let pipTarget = -1;
  let last = -1;
  let hud: { refresh: () => void; drawCurve: () => void } | null = null;
  let focused = false;
  let rainbowDone = false;
  let equivSaid = false;
  const PIP_ABOVE = new THREE.Vector3();

  const beakerLevel = () => 0.05 + (added / ACID_ML) * 0.05; // 50 mL ≈ 5 cm of liquid
  const updateBeaker = () => {
    const h = beakerLevel();
    bLiquid.scale.set(0.06, h, 0.06);
    bLiquid.position.y = beakerY + h / 2 + 0.002;
    cabbageColor(shownPH, bLiqMat.color).multiplyScalar(BRIGHT);
    const left = Math.max(0, 1 - added / 12);
    buretteLiq.scale.set(0.009, 0.38 * left, 0.009);
    buretteLiq.position.y = top + 0.33 + 0.38 * left / 2;
  };
  updateBeaker();

  function pour(i: number) {
    if (indTarget[i] > 0 || queue.includes(i) || pipTarget === i) return;
    queue.push(i);
  }
  function pourAll() {
    for (let i = 0; i < N; i++) pour(i);
  }
  function emptyTubes() {
    queue.length = 0;
    for (let i = 0; i < N; i++) {
      ind[i] = 0;
      indTarget[i] = 0;
      fill[i] = 0.1;
      writeTube(i);
    }
    liquid.instanceMatrix.needsUpdate = true;
    liquid.instanceColor!.needsUpdate = true;
    last = -1;
    rainbowDone = false;
    tags.redraw();
    hud?.refresh();
  }
  function addBase(mL: number) {
    if (added >= 12) {
      ctx.sfx.error();
      return;
    }
    pendingML += mL;
    if (dropT < 0) dropT = 0;
  }
  function newVinegar() {
    added = 0;
    pendingML = 0;
    curPH = titrationPH(0);
    shownPH = curPH;
    equivSaid = false;
    updateBeaker();
    meter.redraw();
    hud?.refresh();
    hud?.drawCurve();
  }

  ctx.interaction.add(glass, {
    label: L('Häll i rödkålssaft', 'Pour in red-cabbage juice'),
    onClick: (info) => {
      const id = info.hit?.instanceId;
      if (id !== undefined) pour(id);
    },
  });
  ctx.interaction.add(jugGlass, { label: L('Häll rödkålssaft i alla rör', 'Pour cabbage juice into every tube'), onClick: pourAll });
  ctx.interaction.add(burette, { label: L('Tillsätt 0,2 mL bikarbonatlösning', 'Add 0.2 mL baking-soda solution'), onClick: () => addBase(0.2) });
  ctx.interaction.add(tap, { label: L('Tillsätt 0,2 mL bikarbonatlösning', 'Add 0.2 mL baking-soda solution'), onClick: () => addBase(0.2) });

  function drawCurve(g: CanvasRenderingContext2D, W: number, H: number) {
    const padL = 30, padB = 20, padT = 6, padR = 8;
    const pw = W - padL - padR, ph = H - padB - padT;
    const X = (mL: number) => padL + (mL / 10) * pw;
    const Y = (p: number) => padT + (1 - p / 14) * ph;
    g.fillStyle = '#101418';
    g.fillRect(0, 0, W, H);
    for (let p = 0; p < 14; p += 0.25) {
      cabbageColor(p + 0.125, tmp);
      g.fillStyle = `#${tmp.getHexString()}`;
      g.fillRect(padL - 8, Y(p + 0.25), 6, Y(p) - Y(p + 0.25) + 0.5);
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.fillStyle = '#c9c2b4';
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let p = 0; p <= 14; p += 2) {
      g.beginPath();
      g.moveTo(padL, Y(p));
      g.lineTo(W - padR, Y(p));
      g.stroke();
      g.fillText(String(p), padL - 10, Y(p));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let v = 0; v <= 10; v += 2) g.fillText(String(v), X(v), H - padB + 4);
    g.textAlign = 'right';
    g.fillText('mL', W - padR, H - padB + 4);
    // equivalence marker
    g.strokeStyle = 'rgba(255,220,150,0.5)';
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(X(EQUIV_ML), padT);
    g.lineTo(X(EQUIV_ML), H - padB);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(padL, Y(7));
    g.lineTo(W - padR, Y(7));
    g.stroke();
    // curve up to the current volume
    g.lineWidth = 2.5;
    g.strokeStyle = '#ffe9b0';
    g.beginPath();
    for (let v = 0; v <= Math.min(added, 10) + 1e-6; v += 0.05) {
      const p = titrationPH(v);
      if (v === 0) g.moveTo(X(v), Y(p));
      else g.lineTo(X(v), Y(p));
    }
    g.stroke();
    g.lineWidth = 1;
    cabbageColor(curPH, tmp);
    g.fillStyle = `#${tmp.getHexString()}`;
    g.beginPath();
    g.arc(X(Math.min(added, 10)), Y(curPH), 4.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.stroke();
  }

  ctx.addStation({
    id: 'chem-ph',
    title: L('Rödkålsregnbågen', 'The red-cabbage rainbow'),
    position: [-8.4, BZ],
    viewpoint: { position: [-7.3, 1.58, 0.55], target: [-9.35, 1.0, 0.55] },
    intro: L('Rödkålssaft är en hemlig färgdetektor. Häll den i vardagsämnen och se en hel regnbåge av syror och baser!',
      'Red-cabbage juice is a secret colour detector. Pour it into everyday liquids and watch a whole rainbow of acids and bases!'),
    howTo: L('Klicka på ett provrör för att droppa i rödkålssaft. Neutralisera sedan ättikan i bägaren: klicka på byretten eller använd knapparna och följ pH-kurvan.',
      'Click a test tube to add red-cabbage juice. Then neutralise the vinegar in the beaker: click the burette or use the buttons and follow the pH curve.'),
    science: L(
      'Rödkål innehåller antocyaniner, färgämnen som byter form när de tar upp eller släpper vätejoner (H⁺), och varje form har sin egen färg. pH = −log[H⁺], så varje steg på skalan är tio gånger: citronsaft med pH 2 har 100 000 gånger fler vätejoner än rent vatten med pH 7. Ättika och bikarbonat reagerar: CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂, och koldioxiden bubblar ut. Vid neutralisationspunkten (5,0 mL) blir pH inte 7 utan cirka 8,9, eftersom acetatjonen är en svag bas. Förenkling: vi räknar som om all CO₂ bubblar bort, vid 25 °C. Många tror att baser är ofarliga, men avloppsrensare med pH 13 fräter lika illa som stark syra: bara med en vuxen och skyddsutrustning!',
      'Red cabbage contains anthocyanins, pigments that change shape when they take up or release hydrogen ions (H⁺), and each shape has its own colour. pH = −log[H⁺], so every step on the scale is a factor of ten: lemon juice at pH 2 has 100,000 times more hydrogen ions than pure water at pH 7. Vinegar and baking soda react: CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂, and the carbon dioxide bubbles out. At the equivalence point (5.0 mL) the pH is not 7 but about 8.9, because the acetate ion is a weak base. Simplification: we calculate as if all the CO₂ escapes, at 25 °C. Many people think bases are harmless, but drain cleaner at pH 13 burns skin as badly as strong acid: only with an adult and protective gear!'),
    wow: L('Samma färgämne gör blåbär blå och rosor röda. Hortensior blir blå eller rosa beroende på jordens pH.',
      'The same kind of pigment makes blueberries blue and roses red. Hydrangeas turn blue or pink depending on the soil\'s pH.'),
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
    controls: (panel) => {
      panel.heading(L('Regnbågen', 'The rainbow'));
      panel.button(L('Häll rödkålssaft i alla rör', 'Pour cabbage juice into every tube'), pourAll, { primary: true, icon: '🟣' });
      panel.button(L('Töm rören', 'Empty the tubes'), emptyTubes, { icon: '🧽' });
      const sel = panel.readout(L('Senaste rör', 'Last tube'));
      const hplus = panel.readout(L('Vätejoner [H⁺]', 'Hydrogen ions [H⁺]'));
      panel.heading(L('Neutralisera ättika', 'Neutralise vinegar'));
      panel.buttons([
        { label: L('+0,2 mL', '+0.2 mL'), icon: '💧', onClick: () => addBase(0.2) },
        { label: L('+1 mL', '+1 mL'), icon: '💦', onClick: () => addBase(1) },
        { label: L('Ny ättika', 'New vinegar'), icon: '🔄', onClick: newVinegar },
      ]);
      const cv = panel.canvas(150);
      const vol = panel.readout(L('Tillsatt bikarbonat (1 M)', 'Baking soda added (1 M)'));
      const phR = panel.readout(L('pH i bägaren', 'pH in the beaker'));
      const co2 = panel.readout(L('Koldioxid som bubblat ut', 'Carbon dioxide bubbled out'));
      panel.note(L('Bara med en vuxen och skyddsglasögon om du provar starka ämnen hemma. Ättika och bikarbonat går bra!',
        'Only with an adult and safety goggles if you try strong substances at home. Vinegar and baking soda are fine!'));
      hud = {
        drawCurve: () => drawCurve(cv.ctx, cv.width, cv.height),
        refresh: () => {
          if (last >= 0) {
            const s = SUBS[last];
            sel.set(`${s.icon} ${t(s.name)}: pH ${fmt(s.pH, s.pH % 1 ? 1 : 0)}`);
            hplus.set(`${sci(s.pH)} mol/L`);
          } else {
            sel.set('–');
            hplus.set('–');
          }
          vol.set(`${fmt(added, 1)} mL`);
          phR.set(fmt(curPH, 2));
          const mm = co2mmol(added);
          co2.set(`${fmt(mm, 1)} mmol ≈ ${fmt(mm * 24.5, 0)} mL`);
        },
      };
      hud.refresh();
      hud.drawCurve();
      return () => { hud = null; };
    },
  });

  // ---------------------------------------------------------------- per frame
  return {
    center: [BX + 0.6, BZ],
    update(dt, time, near) {
      if (!near && !focused) return;
      // pipette queue
      if (pipT < 0 && queue.length) {
        pipTarget = queue.shift()!;
        pipT = 0;
        PIP_ABOVE.set(TX, TUBE_Y + TUBE_H + 0.03, tubeZ(pipTarget));
      }
      if (pipT >= 0) {
        pipT += dt / 0.9;
        const p = pipT;
        if (p < 0.4) pipette.position.lerpVectors(PIP_REST, PIP_ABOVE, smooth(p / 0.4));
        else if (p < 0.6) {
          pipette.position.copy(PIP_ABOVE);
          bulb.scale.set(0.017, 0.016, 0.017);
          if (indTarget[pipTarget] === 0) {
            indTarget[pipTarget] = 1;
            ctx.sfx.tone(900 + pipTarget * 70, 0.12, { type: 'sine', gain: 0.06, to: 600 + pipTarget * 50 });
            for (let k = 0; k < 6; k++) {
              kit.fx.bubbles.spawn(TX + (Math.random() - 0.5) * 0.02, TUBE_Y + 0.02, tubeZ(pipTarget) + (Math.random() - 0.5) * 0.02,
                0, 0.05 + Math.random() * 0.05, 0, 1.2, cabbageColor(SUBS[pipTarget].pH, tmp).multiplyScalar(0.5), TUBE_Y + 0.15);
            }
          }
        } else if (p < 1) {
          bulb.scale.set(0.014, 0.022, 0.014);
          pipette.position.lerpVectors(PIP_ABOVE, PIP_REST, smooth((p - 0.6) / 0.4));
        } else {
          pipette.position.copy(PIP_REST);
          last = pipTarget;
          pipT = -1;
          pipTarget = -1;
          tags.redraw();
          hud?.refresh();
          if (!rainbowDone && indTarget.every((v) => v > 0)) {
            rainbowDone = true;
            ctx.sfx.chime();
            kit.buddy.celebrate(L('En hel pH-regnbåge! Från rött i citronen till gult i avloppsrensaren.',
              'A whole pH rainbow! From red in the lemon to yellow in the drain cleaner.'), true);
          } else if (last === N - 1 && !rainbowDone) {
            kit.buddy.say(L('Avloppsrensare är så basisk att den fräter. Bara med en vuxen och skyddsutrustning!',
              'Drain cleaner is so basic that it burns. Only with an adult and protective gear!'), { expression: 'surprised' });
          }
        }
      }
      // indicator mixing and fill level
      let dirty = false;
      for (let i = 0; i < N; i++) {
        if (ind[i] !== indTarget[i]) {
          ind[i] = indTarget[i] > ind[i] ? Math.min(indTarget[i], ind[i] + dt * 0.9) : indTarget[i];
          fill[i] = 0.1 + 0.05 * ind[i];
          writeTube(i);
          dirty = true;
        }
      }
      if (dirty) {
        liquid.instanceMatrix.needsUpdate = true;
        liquid.instanceColor!.needsUpdate = true;
      }

      // titration drops
      if (dropT >= 0) {
        dropT += dt;
        const y = top + 0.25 - 4.9 * dropT * dropT;
        const surf = beakerY + beakerLevel();
        drop.visible = true;
        drop.position.set(KX, Math.max(surf, y), KZ);
        if (y <= surf) {
          const mL = Math.min(pendingML, 0.2 + (pendingML > 0.6 ? 0.8 : 0));
          const before = co2mmol(added);
          pendingML = Math.max(0, pendingML - mL);
          added = Math.min(12, Math.round((added + mL) * 1000) / 1000);
          const gas = co2mmol(added) - before;
          fizz = Math.min(1.5, fizz + gas * 1.6);
          curPH = titrationPH(added);
          ctx.sfx.tone(1200, 0.05, { type: 'sine', gain: 0.05, to: 700 });
          if (gas > 0) ctx.sfx.noise(0.6 + gas, { freq: 5200, q: 0.4, gain: 0.05 + gas * 0.08, type: 'highpass' });
          meter.redraw();
          hud?.refresh();
          hud?.drawCurve();
          dropT = pendingML > 0 ? 0 : -1;
          drop.visible = dropT >= 0;
          if (!equivSaid && added >= EQUIV_ML - 1e-6) {
            equivSaid = true;
            kit.buddy.celebrate(L('Neutraliserat! Allt syra har reagerat, och titta: pH hoppade upp till nästan 9, inte 7.',
              'Neutralised! All the acid has reacted, and look: the pH jumped to almost 9, not 7.'), true);
          }
        }
      }
      // smooth colour change in the beaker
      if (Math.abs(shownPH - curPH) > 0.005) {
        shownPH += (curPH - shownPH) * Math.min(1, dt * 3);
        updateBeaker();
      }
      // fizz: CO₂ bubbles and a little foam sound
      if (fizz > 0.01) {
        const n = fizz * 60 * dt;
        for (let k = 0; k < n + (Math.random() < n % 1 ? 1 : 0); k++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 0.05;
          kit.fx.bubbles.spawn(KX + Math.cos(a) * r, beakerY + 0.01, KZ + Math.sin(a) * r, 0, 0.12 + Math.random() * 0.1, 0, 1.5,
            tmp.setRGB(0.4, 0.4, 0.45), beakerY + beakerLevel());
        }
        fizz *= Math.exp(-dt * 0.9);
      }
      // gentle idle bubbles in the cabbage jug
      if (Math.random() < dt * 3) {
        kit.fx.bubbles.spawn(JX + (Math.random() - 0.5) * 0.08, top + 0.01, JZ + (Math.random() - 0.5) * 0.08, 0, 0.06, 0, 2,
          tmp.setRGB(0.3, 0.2, 0.45), top + 0.12);
      }
      void time;
    },
  };
}

function smooth(x: number) {
  const f = clamp(x, 0, 1);
  return f * f * (3 - 2 * f);
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** [H⁺] = 10^(−pH) written like 1,3 · 10⁻³. */
function sci(pH: number) {
  const e = -pH;
  const p = Math.floor(e + 1e-9);
  const mant = 10 ** (e - p);
  const pow = `10⁻${String(-p).replace(/\d/g, (d) => SUP[d])}`;
  return mant > 1.05 ? `${fmt(mant, 1)} · ${pow}` : pow;
}
