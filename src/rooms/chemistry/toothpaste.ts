/** Station 4: elephant toothpaste. 2 H₂O₂ → 2 H₂O + O₂, sped up by a catalyst, with real heat and gas volumes. */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import { clamp, fmt, type Kit, type StationRuntime } from './common';

type Cat = 'KI' | 'yeast';

const R = 8.314;
const DH = 98_000; // J released per mol H₂O₂ (ΔH = −196 kJ per 2 mol)
const VM = 24.06; // L/mol for a gas at 20 °C and 1 atm
const T0 = 20;
/** First-order rate constants at 20 °C (1/s) and activation energies (J/mol). Catalase is a protein and stops working when hot. */
const CAT = {
  KI: { k0: 0.15, Ea: 56_000, name: L('Kaliumjodid (KI)', 'Potassium iodide (KI)'), color: 0xe8e0a0 },
  yeast: { k0: 0.1, Ea: 23_000, name: L('Jäst (enzymet katalas)', 'Yeast (the enzyme catalase)'), color: 0xc9a36a },
};
/** Mixing limit: the catalyst can't reach the peroxide faster than the liquid stirs itself (keeps 30 % at a few seconds). */
const K_MAX = 1.2;
const FOAM_PER_PARTICLE_L = 0.012;
const POOL = 720;
const STRIPES = [0xff5a8a, 0x5ab0ff, 0xffd84a, 0x7be07b];

export function buildToothpaste(kit: Kit): StationRuntime {
  const { ctx, mats } = kit;
  const TX = 6.6, TZ = -7.5;
  const top = 0.75;
  kit.bench(TX, TZ, 2.0, 1.1, 0, top);
  ctx.addCollider(TX, TZ, 2.05, 1.15);

  let conc: 3 | 30 = 3;
  let cat: Cat = 'KI';
  let Tc = T0;
  let o2L = 0;
  // tray
  const trayW = 1.3, trayD = 0.85;
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x3d6f8f, roughness: 0.5 });
  kit.box(trayW, 0.03, trayD, trayMat, TX - 0.15, top, TZ + 0.05);
  const FLOOR = top + 0.03;
  // graduated cylinder
  const CX = TX - 0.15, CZ = TZ + 0.05;
  const CYL_R = 0.055, CYL_H = 0.5;
  const MOUTH = FLOOR + 0.02 + CYL_H;
  kit.box(0.16, 0.02, 0.16, mats.glassRim, CX, FLOOR, CZ);
  const cyl = new THREE.Mesh(kit.geos.openCyl, mats.glass);
  cyl.scale.set(CYL_R, CYL_H, CYL_R);
  cyl.position.set(CX, FLOOR + 0.02 + CYL_H / 2, CZ);
  ctx.group.add(cyl);
  const marks = new THREE.Mesh(new THREE.CylinderGeometry(CYL_R * 1.01, CYL_R * 1.01, CYL_H * 0.8, 24, 1, true, -0.4, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, wireframe: true }));
  marks.position.copy(cyl.position);
  ctx.group.add(marks);
  const solMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8e8d8).multiplyScalar(0.7), transparent: true, opacity: 0.8 });
  const solution = new THREE.Mesh(kit.geos.cyl, solMat);
  ctx.group.add(solution);
  const plugMat = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.95 });
  const plug = new THREE.Mesh(kit.geos.cyl, plugMat);
  plug.visible = false;
  ctx.group.add(plug);

  // foam particles
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.95 });
  const foam = new THREE.InstancedMesh(kit.geos.lowSphere, foamMat, POOL);
  foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  foam.count = 0;
  foam.frustumCulled = false;
  ctx.group.add(foam);
  const px = new Float32Array(POOL), py = new Float32Array(POOL), pz = new Float32Array(POOL);
  const vx = new Float32Array(POOL), vy = new Float32Array(POOL), vz = new Float32Array(POOL);
  const rad = new Float32Array(POOL);
  const settled = new Uint8Array(POOL);
  const white = new THREE.Color(0xf7f5ef);
  // heap height map over the tray
  const CELL = 0.035;
  const GX = Math.ceil(trayW / CELL), GZ = Math.ceil(trayD / CELL);
  const heap = new Float32Array(GX * GZ);
  const cellOf = (x: number, z: number) => {
    const i = clamp(Math.floor((x - (CX - trayW / 2)) / CELL), 0, GX - 1);
    const j = clamp(Math.floor((z - (CZ - trayD / 2)) / CELL), 0, GZ - 1);
    return j * GX + i;
  };

  // catalyst beakers, peroxide bottles, splint
  const beaker = (x: number, z: number, color: number) => {
    const g = new THREE.Group();
    const gl = new THREE.Mesh(kit.geos.openCyl, mats.glass);
    gl.scale.set(0.035, 0.08, 0.035);
    gl.position.y = 0.04;
    const lq = new THREE.Mesh(kit.geos.cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.75), transparent: true, opacity: 0.9 }));
    lq.scale.set(0.031, 0.045, 0.031);
    lq.position.y = 0.024;
    g.add(lq, gl);
    g.position.set(x, top, z);
    ctx.group.add(g);
    return g;
  };
  const kiBeaker = beaker(TX + 0.7, TZ + 0.3, CAT.KI.color);
  const yeastBeaker = beaker(TX + 0.7, TZ + 0.05, CAT.yeast.color);
  const BEAKER_REST = { KI: kiBeaker.position.clone(), yeast: yeastBeaker.position.clone() };
  const kiTag = kit.label(() => 'KI', 0.07, 0.035, { px: 128 });
  kiTag.mesh.position.set(TX + 0.7, top + 0.05, TZ + 0.3 + 0.036);
  const yTag = kit.label(() => t(L('Jäst', 'Yeast')), 0.07, 0.035, { px: 128 });
  yTag.mesh.position.set(TX + 0.7, top + 0.05, TZ + 0.05 + 0.036);
  ctx.group.add(kiTag.mesh, yTag.mesh);

  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x5a3315, roughness: 0.25, transparent: true, opacity: 0.85 });
  const bottle = (x: number, label: string) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(kit.geos.cyl, bottleMat);
    b.scale.set(0.04, 0.16, 0.04);
    b.position.y = 0.08;
    const neck = new THREE.Mesh(kit.geos.cyl, bottleMat);
    neck.scale.set(0.015, 0.05, 0.015);
    neck.position.y = 0.185;
    const cap = new THREE.Mesh(kit.geos.cyl, mats.blackTop);
    cap.scale.set(0.018, 0.02, 0.018);
    cap.position.y = 0.215;
    const tag = kit.label(() => `H₂O₂ ${label}`, 0.075, 0.04, { px: 128, bg: '#f7f0dd' });
    tag.mesh.position.set(0, 0.08, 0.041);
    g.add(b, neck, cap, tag.mesh);
    g.position.set(x, top, TZ - 0.38);
    ctx.group.add(g);
    return g;
  };
  const b3 = bottle(TX + 0.45, '3 %');
  const b30 = bottle(TX + 0.62, '30 %');
  // safety goggles (decor + reminder)
  const gogMat = new THREE.MeshStandardMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0.55, roughness: 0.1 });
  const gog = new THREE.Group();
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 16), gogMat);
    lens.position.x = s * 0.035;
    gog.add(lens);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.004, 4, 24, Math.PI), mats.blackTop);
  strap.rotation.x = Math.PI / 2;
  gog.add(strap);
  gog.rotation.x = -Math.PI / 2.3;
  gog.position.set(TX + 0.82, top + 0.02, TZ - 0.15);
  ctx.group.add(gog);

  // splint
  const splint = new THREE.Group();
  const stick = new THREE.Mesh(kit.geos.cyl, new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.8 }));
  stick.scale.set(0.005, 0.32, 0.005);
  stick.position.y = 0.16;
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const ember = new THREE.Mesh(kit.geos.sphere, emberMat);
  ember.scale.setScalar(0.008);
  const splintFlame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  splintFlame.position.y = -0.035;
  splintFlame.rotation.x = Math.PI;
  splintFlame.visible = false;
  splint.add(stick, ember, splintFlame);
  const SPLINT_REST = new THREE.Vector3(TX + 0.3, top + 0.06, TZ + 0.38);
  splint.position.copy(SPLINT_REST);
  splint.rotation.z = 1.25;
  ctx.group.add(splint);
  kit.box(0.04, 0.05, 0.04, mats.brass, TX + 0.3, top, TZ + 0.38);

  // display
  const disp = kit.canvasPlane(0.5, 0.2, 384, (g, W, H) => {
    g.fillStyle = '#10161a';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(H * 0.24)}px ui-monospace, Menlo, monospace`;
    g.fillStyle = Tc > 60 ? '#ff8a5a' : Tc > 30 ? '#ffd36a' : '#9fd8ff';
    g.fillText(`🌡 ${fmt(Tc, 0)} °C`, W * 0.06, H * 0.3);
    g.fillStyle = '#7dffc4';
    g.fillText(`O₂ ${fmt(o2L, 2)} L`, W * 0.06, H * 0.7);
    g.font = `600 ${Math.round(H * 0.14)}px system-ui, sans-serif`;
    g.fillStyle = '#c9c2b4';
    g.textAlign = 'right';
    g.fillText(`H₂O₂ ${conc} %`, W * 0.95, H * 0.3);
    g.fillText(cat === 'KI' ? 'KI' : t(L('jäst', 'yeast')), W * 0.95, H * 0.7);
  });
  disp.mesh.position.set(TX + 0.55, top + 0.62, TZ - 0.53);
  kit.box(0.54, 0.24, 0.03, mats.blackTop, TX + 0.55, top + 0.5, TZ - 0.56);
  const leg = new THREE.Mesh(kit.geos.cyl, mats.steel);
  leg.scale.set(0.012, 0.5, 0.012);
  leg.position.set(TX + 0.55, top + 0.25, TZ - 0.56);
  ctx.group.add(disp.mesh, leg);
  kit.staticize(leg, marks);
  const eq = kit.label(() => '2 H₂O₂ → 2 H₂O + O₂', 1.3, 0.17, { px: 768, bg: '#f4ead8', color: '#2d4a3e' });
  eq.mesh.position.set(TX - 0.15, 1.75, -8.97);
  ctx.group.add(eq.mesh);

  // ---------------------------------------------------------------- state
  let safety = false;
  let stripes = false;
  let n0 = 0, n = 0; // mol H₂O₂
  let rateLps = 0;
  let running = false;
  let started = false;
  let startTime = 0;
  let clock = 0;
  let emitAcc = 0;
  let next = 0;
  let pourT = -1;
  let splintT = -1;
  let relit = false;
  let focused = false;
  let saidHot = false;
  let activity = 1; // catalase activity (lost for good when it gets too hot)
  let slowFor = 0;
  let hud: { refresh: () => void } | null = null;
  let hudTimer = 0, dispTimer = 0;
  const pouring = new THREE.Vector3();

  const massC = () => ((conc === 30 ? 111 : 100) + 20) * 4.18; // J/K: 100 mL peroxide + 20 mL catalyst solution
  function refill() {
    n0 = conc === 30 ? (111 * 0.3) / 34.01 : (100 * 0.03) / 34.01;
    n = n0;
    Tc = T0;
    o2L = 0;
    rateLps = 0;
    running = false;
    started = false;
    emitAcc = 0;
    next = 0;
    foam.count = 0;
    settled.fill(0);
    heap.fill(0);
    plug.visible = false;
    relit = false;
    saidHot = false;
    activity = 1;
    slowFor = 0;
    solMat.color.setHex(0xb8e8d8).multiplyScalar(0.7);
    const h = 0.08;
    solution.scale.set(CYL_R * 0.92, h, CYL_R * 0.92);
    solution.position.set(CX, FLOOR + 0.02 + h / 2, CZ);
    b3.position.y = top + (conc === 3 ? 0.02 : 0);
    b30.position.y = top + (conc === 30 ? 0.02 : 0);
    disp.redraw();
    hud?.refresh();
  }
  refill();

  function setConc(c: 3 | 30) {
    if (started) refill();
    conc = c;
    refill();
    if (c === 30 && !safety) {
      kit.buddy.say(L('30 % väteperoxid fräter på huden. Det får bara hanteras av en vuxen med skyddsglasögon och handskar. Kryssa i rutan först!',
        '30% hydrogen peroxide burns skin. Only an adult with goggles and gloves may handle it. Tick the box first!'), { expression: 'skeptical' }, true);
    }
  }

  function start(c: Cat) {
    cat = c;
    if (started || pourT >= 0) return;
    if (conc === 30 && !safety) {
      ctx.sfx.error();
      kit.buddy.say(L('Vänta! 30 % kräver en vuxen, skyddsglasögon och handskar. Kryssa i säkerhetsrutan.',
        'Wait! 30% needs an adult, goggles and gloves. Tick the safety box.'), { expression: 'skeptical' }, true);
      return;
    }
    pourT = 0;
    hud?.refresh();
  }

  function testSplint() {
    if (splintT >= 0) return;
    splintT = 0;
    relit = false;
  }

  ctx.interaction.add(kiBeaker, { label: CAT.KI.name, onClick: () => start('KI') });
  ctx.interaction.add(yeastBeaker, { label: CAT.yeast.name, onClick: () => start('yeast') });
  ctx.interaction.add(b3, { label: L('Väteperoxid 3 %', 'Hydrogen peroxide 3%'), onClick: () => setConc(3) });
  ctx.interaction.add(b30, { label: L('Väteperoxid 30 % (bara vuxna med skydd)', 'Hydrogen peroxide 30% (adults with protection only)'), onClick: () => setConc(30) });
  ctx.interaction.add(splint, { label: L('Glödande trästicka', 'Glowing splint'), onClick: testSplint });
  ctx.interaction.add(cyl, { label: L('Mätcylinder med väteperoxid och diskmedel', 'Cylinder with hydrogen peroxide and dish soap'), onClick: () => start(cat) });

  function emit() {
    const i = next;
    next = (next + 1) % POOL;
    if (foam.count < POOL) foam.count++;
    if (settled[i]) {
      // recycled: lower the heap where it was
      heap[cellOf(px[i], pz[i])] = Math.max(0, heap[cellOf(px[i], pz[i])] - rad[i] * 0.55);
    }
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * CYL_R * 0.6;
    px[i] = CX + Math.cos(a) * rr;
    pz[i] = CZ + Math.sin(a) * rr;
    py[i] = MOUTH - 0.02;
    const up = clamp(0.35 + rateLps * 0.55, 0.35, 3.6);
    const side = 0.06 + Math.random() * 0.18 + up * 0.04;
    const b = Math.random() * Math.PI * 2;
    vx[i] = Math.cos(b) * side;
    vz[i] = Math.sin(b) * side;
    vy[i] = up * (0.85 + Math.random() * 0.3);
    rad[i] = 0.022 + Math.random() * 0.016;
    settled[i] = 0;
    const k = Math.floor(o2L / 0.4) % STRIPES.length;
    if (stripes && (Math.floor(o2L / 0.2) % 2 === 0)) foam.setColorAt(i, tmpC.setHex(STRIPES[k]).multiplyScalar(0.8));
    else foam.setColorAt(i, white);
  }
  const tmpC = new THREE.Color();
  for (let i = 0; i < POOL; i++) foam.setColorAt(i, white);

  ctx.addStation({
    id: 'chem-toothpaste',
    title: L('Elefanttandkräm', 'Elephant toothpaste'),
    position: [TX - 0.1, TZ + 0.75],
    viewpoint: { position: [TX + 0.2, 1.7, TZ + 2.15], target: [TX + 0.4, 1.25, TZ - 0.1] },
    intro: L('Väteperoxid sönderfaller till vatten och syrgas, men jättelångsamt. Med en katalysator går det på sekunder, och diskmedlet fångar gasen i ett skumberg!',
      'Hydrogen peroxide breaks down into water and oxygen, but very slowly. With a catalyst it takes seconds, and the dish soap traps the gas in a mountain of foam!'),
    howTo: L('Välj styrka (3 % eller 30 %) och katalysator. Klicka på en katalysatorbägare för att hälla i. Testa sedan syrgasen med den glödande stickan.',
      'Choose the strength (3% or 30%) and a catalyst. Click a catalyst beaker to pour it in. Then test the oxygen with the glowing splint.'),
    science: L(
      '2 H₂O₂ → 2 H₂O + O₂. Reaktionen ger ut värme, 98 kJ per mol väteperoxid, så skummet blir varmt: 3 % värms cirka 17 grader, och 30 % når kokpunkten och ångar. En katalysator (jodidjoner från KI, eller enzymet katalas i jäst) ger reaktionen en genväg med lägre energitröskel men förbrukas inte själv. Värmen gör att reaktionen går ännu fortare, men katalas är ett protein som slutar fungera när det blir för varmt. 100 mL 30 % peroxid ger nästan 12 liter syrgas, och den glödande stickan flammar upp eftersom luft bara har 21 % syre. 30 % väteperoxid fräter: bara en vuxen med skyddsglasögon och handskar!',
      '2 H₂O₂ → 2 H₂O + O₂. The reaction gives off heat, 98 kJ per mole of peroxide, so the foam gets warm: 3% heats up about 17 degrees, and 30% reaches boiling point and steams. A catalyst (iodide ions from KI, or the enzyme catalase in yeast) gives the reaction a shortcut with a lower energy barrier but isn\'t used up itself. The heat speeds the reaction up even more, but catalase is a protein that stops working when it gets too hot. 100 mL of 30% peroxide makes almost 12 litres of oxygen, and the glowing splint bursts into flame because air is only 21% oxygen. 30% hydrogen peroxide burns skin: only an adult with goggles and gloves!'),
    wow: L('Din lever är full av katalas. Den bryter ner väteperoxid som bildas i dina celler, ungefär en miljon molekyler per sekund per enzym.',
      'Your liver is full of catalase. It breaks down hydrogen peroxide formed in your cells, about a million molecules per second per enzyme.'),
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
    controls: (panel) => {
      panel.heading(L('Väteperoxid (100 mL + diskmedel)', 'Hydrogen peroxide (100 mL + dish soap)'));
      const setC = panel.buttons([
        { label: L('3 % (apotek)', '3% (pharmacy)'), onClick: () => setConc(3) },
        { label: L('30 % (bara vuxna)', '30% (adults only)'), icon: '⚠️', onClick: () => setConc(30) },
      ], conc === 3 ? 0 : 1);
      panel.toggle(L('En vuxen är med, med skyddsglasögon och handskar', 'An adult is here, with goggles and gloves'), safety, (v) => {
        safety = v;
        hud?.refresh();
      });
      panel.heading(L('Katalysator', 'Catalyst'));
      const setK = panel.buttons([
        { label: CAT.KI.name, onClick: () => { cat = 'KI'; hud?.refresh(); } },
        { label: CAT.yeast.name, onClick: () => { cat = 'yeast'; hud?.refresh(); } },
      ], cat === 'KI' ? 0 : 1);
      panel.toggle(L('Karamellfärg i ränder', 'Food colouring stripes'), stripes, (v) => { stripes = v; });
      const go = panel.button(L('Häll i katalysatorn!', 'Pour in the catalyst!'), () => start(cat), { primary: true, icon: '🧪' });
      panel.buttons([
        { label: L('Glödande sticka', 'Glowing splint'), icon: '🪵', onClick: testSplint },
        { label: L('Städa och fyll på', 'Clean up and refill'), icon: '🧽', onClick: refill },
      ]);
      const tR = panel.readout(L('Temperatur', 'Temperature'));
      const oR = panel.readout(L('Syrgas bildad', 'Oxygen made'));
      const rR = panel.readout(L('Hastighet', 'Rate'));
      const left = panel.meter(L('Väteperoxid kvar', 'Hydrogen peroxide left'), '#7dffc4');
      const warn = panel.note(L('', ''));
      hud = {
        refresh: () => {
          setC(conc === 3 ? 0 : 1);
          setK(cat === 'KI' ? 0 : 1);
          tR.set(`${fmt(Tc, 1)} °C`);
          oR.set(`${fmt(o2L, 2)} L`);
          rR.set(`${fmt(rateLps * 1000, 0)} mL O₂/s`);
          left.set(n0 ? n / n0 : 0, `${fmt(n0 ? (100 * n) / n0 : 0, 0)} %`);
          go.disabled = started || (conc === 30 && !safety);
          warn.textContent = conc === 30 && !safety
            ? t(L('⚠️ 30 % väteperoxid fräter. Bara en vuxen med skyddsglasögon och handskar får göra det här.',
              '⚠️ 30% hydrogen peroxide burns. Only an adult with goggles and gloves may do this.'))
            : t(L('Katalysatorn tas inte slut: samma lilla mängd kan bryta ner hur mycket peroxid som helst.',
              'The catalyst isn\'t used up: the same small amount can break down any amount of peroxide.'));
        },
      };
      hud.refresh();
      return () => { hud = null; };
    },
  });

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();

  return {
    center: [TX, TZ + 0.3],
    update(dt, time, near) {
      clock += dt;
      const ed = Math.min(dt, 0.05);
      // ember glow
      emberMat.color.setRGB(1, 0.35 + 0.1 * Math.sin(time * 5), 0.08);
      if (!near && !focused && !running) return;

      // pour animation: the catalyst beaker tips over the cylinder
      if (pourT >= 0) {
        pourT += ed;
        const b = cat === 'KI' ? kiBeaker : yeastBeaker;
        const rest = BEAKER_REST[cat];
        pouring.set(CX + 0.06, MOUTH + 0.04, CZ);
        if (pourT < 0.6) {
          b.position.lerpVectors(rest, pouring, smooth(pourT / 0.6));
        } else if (pourT < 1.2) {
          b.position.copy(pouring);
          b.rotation.z = smooth((pourT - 0.6) / 0.6) * 2.1;
        } else if (pourT < 1.3) {
          if (!started) {
            started = true;
            running = true;
            startTime = clock;
            solMat.color.setHex(cat === 'KI' ? 0xd8c070 : 0xc8b090).multiplyScalar(0.7);
            ctx.sfx.noise(1.2, { freq: 600, to: 2400, gain: 0.12 });
          }
        } else if (pourT < 2.2) {
          b.rotation.z = (1 - smooth((pourT - 1.3) / 0.9)) * 2.1;
          b.position.lerpVectors(pouring, rest, smooth((pourT - 1.3) / 0.9));
        } else {
          b.position.copy(rest);
          b.rotation.z = 0;
          pourT = -1;
        }
      }

      // kinetics (substeps for stability when k gets large)
      if (running) {
        const sub = 8;
        const h = ed / sub;
        let dn = 0;
        for (let s = 0; s < sub; s++) {
          const Tk = Tc + 273.15;
          const c = CAT[cat];
          let k = c.k0 * Math.exp((-c.Ea / R) * (1 / Tk - 1 / (T0 + 273.15)));
          if (cat === 'yeast') {
            if (Tc > 45) activity *= Math.exp(-0.1 * Math.exp((Tc - 60) / 6) * h); // catalase denatures, irreversibly
            k *= activity;
          }
          k = Math.min(k, K_MAX);
          const d = Math.min(n, k * n * h);
          n -= d;
          dn += d;
          Tc = Math.min(100, Tc + (d * DH) / massC());
          Tc -= ((Tc - T0) / 600) * h; // slow cooling
        }
        const o2 = (dn / 2) * VM;
        o2L += o2;
        rateLps = o2 / ed;
        emitAcc += o2 / FOAM_PER_PARTICLE_L;
        // foam rises in the cylinder before it comes out
        const fillFrac = clamp(o2L / 0.25, 0, 1);
        plug.visible = true;
        const ph = 0.08 + fillFrac * (CYL_H - 0.08);
        plug.scale.set(CYL_R * 0.95, ph, CYL_R * 0.95);
        plug.position.set(CX, FLOOR + 0.02 + ph / 2, CZ);
        if (fillFrac >= 1) {
          let k = 0;
          while (emitAcc >= 1 && k < 40) {
            emit();
            emitAcc -= 1;
            k++;
          }
        } else emitAcc = Math.min(emitAcc, 2);
        if (rateLps > 0.02 && Math.random() < dt * 8) ctx.sfx.noise(0.3, { freq: 300 + rateLps * 300, gain: Math.min(0.12, 0.02 + rateLps * 0.03) });
        if (Tc > 90 && Math.random() < dt * 14) {
          kit.fx.steam.spawn(CX + (Math.random() - 0.5) * 0.2, MOUTH + 0.1 + Math.random() * 0.3, CZ + (Math.random() - 0.5) * 0.2,
            0, 0.25, 0, 2.5, tmpC.setRGB(0.22, 0.22, 0.24));
          if (!saidHot) {
            saidHot = true;
            kit.buddy.say(L('Det ångar! 30 % blir så varmt att vattnet kokar. Därför: bara vuxna med skydd.',
              'It\'s steaming! 30% gets so hot the water boils. That\'s why: adults with protection only.'), { expression: 'surprised' });
          }
        }
        slowFor = rateLps < 0.0005 && clock - startTime > 3 ? slowFor + ed : 0;
        if (slowFor > 3) {
          running = false;
          rateLps = 0;
          kit.buddy.say(L(`Reaktionen stannade med ${fmt((100 * n) / n0, 0)} % peroxid kvar. Värmen förstörde katalasenzymet i jästen!`,
            `The reaction stopped with ${fmt((100 * n) / n0, 0)}% peroxide left. The heat destroyed the catalase enzyme in the yeast!`), { expression: 'surprised' }, true);
        } else if (n / n0 < 0.002) {
          running = false;
          rateLps = 0;
          kit.buddy.celebrate(conc === 30
            ? L(`Wow! ${fmt(o2L, 1)} liter syrgas och skummet blev ${fmt(Tc, 0)} °C varmt.`, `Wow! ${fmt(o2L, 1)} litres of oxygen and the foam got ${fmt(Tc, 0)} °C hot.`)
            : L(`Klart! ${fmt(o2L, 2)} liter syrgas, och skummet är ljummet: ${fmt(Tc, 0)} °C.`, `Done! ${fmt(o2L, 2)} litres of oxygen, and the foam is warm: ${fmt(Tc, 0)} °C.`));
        }
      }

      // foam particles
      if (foam.count) {
        for (let i = 0; i < foam.count; i++) {
          if (!settled[i]) {
            vy[i] -= 9.81 * 0.55 * ed;
            const drag = 1 - 0.9 * ed;
            vx[i] *= drag; vz[i] *= drag;
            px[i] += vx[i] * ed; py[i] += vy[i] * ed; pz[i] += vz[i] * ed;
            // keep falling foam outside the glass
            const dx = px[i] - CX, dz = pz[i] - CZ;
            const rr = Math.hypot(dx, dz);
            if (py[i] < MOUTH && rr < CYL_R + rad[i]) {
              const f = (CYL_R + rad[i]) / Math.max(rr, 1e-4);
              px[i] = CX + dx * f;
              pz[i] = CZ + dz * f;
              if (rr < 1e-4) px[i] += CYL_R + rad[i];
            }
            px[i] = clamp(px[i], CX - trayW / 2 + 0.02, CX + trayW / 2 - 0.02);
            pz[i] = clamp(pz[i], CZ - trayD / 2 + 0.02, CZ + trayD / 2 - 0.02);
            let c = cellOf(px[i], pz[i]);
            const ground = FLOOR + heap[c] + rad[i] * 0.6;
            if (vy[i] < 0 && py[i] <= ground) {
              // roll downhill a little to build a mound
              for (let it = 0; it < 6; it++) {
                const ci = c % GX, cj = (c / GX) | 0;
                let best = c;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                  const ni = ci + di, nj = cj + dj;
                  if (ni < 0 || nj < 0 || ni >= GX || nj >= GZ) continue;
                  const nc = nj * GX + ni;
                  if (heap[nc] < heap[best] - 0.03) best = nc;
                }
                if (best === c) break;
                c = best;
              }
              px[i] = CX - trayW / 2 + ((c % GX) + 0.5) * CELL + (Math.random() - 0.5) * CELL * 0.6;
              pz[i] = CZ - trayD / 2 + (((c / GX) | 0) + 0.5) * CELL + (Math.random() - 0.5) * CELL * 0.6;
              py[i] = FLOOR + heap[c] + rad[i] * 0.6;
              heap[c] += rad[i] * 0.55;
              settled[i] = 1;
            }
          }
          const wob = settled[i] ? 1 + 0.06 * Math.sin(time * 3 + i * 1.7) : 1;
          sc.set(rad[i] * wob, rad[i] * (2 - wob), rad[i] * wob);
          pv.set(px[i], py[i], pz[i]);
          m4.compose(pv, q, sc);
          foam.setMatrixAt(i, m4);
        }
        foam.instanceMatrix.needsUpdate = true;
        if (foam.instanceColor) foam.instanceColor.needsUpdate = true;
      }

      // glowing splint test
      if (splintT >= 0) {
        splintT += ed;
        let topY = MOUTH + 0.05;
        if (foam.count) topY = Math.max(topY, FLOOR + heap[cellOf(CX + 0.06, CZ)] + 0.05);
        const target = pv.set(CX + 0.1, topY + 0.05, CZ);
        if (splintT < 0.8) {
          splint.position.lerpVectors(SPLINT_REST, target, smooth(splintT / 0.8));
          splint.rotation.z = 1.25 + (0.5 - 1.25) * smooth(splintT / 0.8);
        } else if (splintT < 4) {
          const oxygen = started && o2L > 0.05 && clock - startTime < 120;
          if (!relit && splintT > 1.0) {
            relit = true;
            if (oxygen) {
              splintFlame.visible = true;
              ctx.sfx.noise(0.5, { freq: 700, to: 200, gain: 0.25, type: 'lowpass' });
              ctx.sfx.tone(180, 0.3, { type: 'sine', gain: 0.1, to: 90 });
              kit.buddy.celebrate(L('Fwoosh! Stickan tände igen: det betyder att gasen är syrgas.',
                'Whoosh! The splint relit: that means the gas is oxygen.'));
            } else {
              kit.buddy.say(L('Stickan bara glöder. Här finns bara vanlig luft, starta reaktionen först!',
                'The splint just glows. There\'s only ordinary air here; start the reaction first!'), { expression: 'thinking' });
            }
          }
          splintFlame.scale.set(1 + 0.15 * Math.sin(time * 30), 1 + 0.25 * Math.sin(time * 23), 1);
        } else if (splintT < 4.8) {
          splintFlame.visible = false;
          splint.position.lerpVectors(target, SPLINT_REST, smooth((splintT - 4) / 0.8));
          splint.rotation.z = 0.5 + (1.25 - 0.5) * smooth((splintT - 4) / 0.8);
        } else {
          splint.position.copy(SPLINT_REST);
          splint.rotation.z = 1.25;
          splintT = -1;
        }
      }

      dispTimer -= dt;
      if (dispTimer <= 0 && (running || near)) {
        dispTimer = running ? 0.15 : 1;
        disp.redraw();
      }
      hudTimer -= dt;
      if (hud && hudTimer <= 0) {
        hudTimer = 0.15;
        hud.refresh();
      }
    },
  };
}

function smooth(x: number) {
  const f = clamp(x, 0, 1);
  return f * f * (3 - 2 * f);
}
