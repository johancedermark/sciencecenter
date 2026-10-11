/**
 * Station 3: optical bench with a candle, a thin converging lens and a screen, at real (1:1) scale.
 * The screen picture is computed with geometric optics: every object point maps to a disc whose
 * centre follows the chief ray (height × −s/dₒ) and whose diameter is D·|1 − s·(1/f − 1/dₒ)|
 * (D = lens aperture, s = lens–screen distance). That disc shrinks to a point exactly when
 * 1/f = 1/dₒ + 1/dᵢ with s = dᵢ: the sharp, inverted image with m = −dᵢ/dₒ.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import { BeamBatch, cooldown, fmt, glowSprite, mats, merged, plaque, rbox, table } from './common';

const YA = 1.12; // optical axis height
const XC = -0.95; // candle (object) position on the rail
const X_MAX = 0.98;
const APERTURE = 0.08; // lens diameter, m
const SCREEN = 0.3; // screen size, m
const TEX = 256;
const PX = TEX / SCREEN; // canvas px per metre on the screen
const FOCALS = [0.1, 0.2, 0.3];

export function buildLens(ctx: RoomContext) {
  const ROOM_X = 7;
  const ROOM_Z = -4.6;
  const g = new THREE.Group();
  g.position.set(ROOM_X, 0, ROOM_Z);
  ctx.group.add(g);

  const st = { f: 0.2, xl: -0.45, xs: 0.25, rays: true, dirty: true };

  // ---------------------------------------------------------------- bench
  const tbl = table(2.3, 0.7);
  g.add(tbl);
  ctx.addCollider(ROOM_X, ROOM_Z, 2.4, 0.8);
  const rail = merged(
    [
      { geo: rbox(2.1, 0.03, 0.06, 0.01), pos: [0, 0.88, 0] },
      ...[-0.9, 0, 0.9].map((x) => ({ geo: new THREE.BoxGeometry(0.04, 0.012, 0.1), pos: [x, 0.862, 0] as THREE.Vector3Tuple })),
    ],
    new THREE.MeshStandardMaterial({ color: 0xa88450, roughness: 0.55, metalness: 0.7 }),
  );
  g.add(rail);
  // centimetre scale along the rail
  const scaleC = document.createElement('canvas');
  scaleC.width = 1024;
  scaleC.height = 32;
  {
    const c = scaleC.getContext('2d')!;
    c.fillStyle = '#efe4cf';
    c.fillRect(0, 0, 1024, 32);
    c.fillStyle = '#3a2a1d';
    c.font = '600 13px system-ui';
    c.textAlign = 'center';
    for (let cm = 0; cm <= 200; cm++) {
      const x = (cm / 200) * 1024;
      const big = cm % 10 === 0;
      c.fillRect(x - (big ? 1 : 0.5), 0, big ? 2 : 1, big ? 14 : cm % 5 === 0 ? 10 : 6);
      if (big && cm > 0 && cm < 200) c.fillText(String(cm), x, 27);
    }
  }
  const scaleTex = new THREE.CanvasTexture(scaleC);
  scaleTex.colorSpace = THREE.SRGBColorSpace;
  const scaleStrip = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.0625), new THREE.MeshStandardMaterial({ map: scaleTex, roughness: 0.8 }));
  scaleStrip.rotation.x = -Math.PI / 2;
  scaleStrip.position.set(XC + 1.0, 0.856, 0.2);
  g.add(scaleStrip);
  const pl = plaque(L('Linsbänken', 'The lens bench'), 0.7, 0.13);
  pl.position.set(0, 0.74, 0.351);
  g.add(pl);

  // ---------------------------------------------------------------- candle
  const candle = new THREE.Group();
  candle.position.set(XC, 0, 0);
  const holder = merged(
    [
      { geo: new THREE.BoxGeometry(0.08, 0.03, 0.09), pos: [0, 0.91, 0] },
      { geo: new THREE.CylinderGeometry(0.008, 0.008, YA - 0.116 - 0.925), pos: [0, (YA - 0.116 + 0.925) / 2, 0] },
      { geo: new THREE.CylinderGeometry(0.035, 0.03, 0.01, 20), pos: [0, YA - 0.121, 0] },
    ],
    mats.brass,
  );
  candle.add(holder);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0xf6ead2, roughness: 0.6, emissive: 0x3a2610 }));
  wax.position.y = YA - 0.066;
  candle.add(wax);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2.2), toneMapped: false });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), flameMat);
  flame.scale.set(0.008, 0.017, 0.008);
  flame.position.y = YA + 0.004;
  candle.add(flame);
  const flameGlow = glowSprite(0xffa850, 0.16, 0.9);
  flameGlow.position.y = YA + 0.004;
  candle.add(flameGlow);
  g.add(candle);

  // ---------------------------------------------------------------- lens carriage
  const lensG = new THREE.Group();
  const lensMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xe6f6ff, roughness: 0.02, transparent: true, opacity: 0.4, clearcoat: 1, emissive: 0x6fa0d0, emissiveIntensity: 0.1 }),
  );
  lensMesh.position.y = YA;
  lensG.add(lensMesh);
  const lensFrame = merged(
    [
      { geo: new THREE.TorusGeometry(APERTURE / 2 + 0.004, 0.005, 8, 40), pos: [0, YA, 0], rot: [0, Math.PI / 2, 0] },
      { geo: new THREE.CylinderGeometry(0.007, 0.007, YA - APERTURE / 2 - 0.9), pos: [0, (YA - APERTURE / 2 + 0.9) / 2, 0] },
      { geo: rbox(0.07, 0.035, 0.09, 0.01), pos: [0, 0.905, 0] },
    ],
    mats.brass,
  );
  lensG.add(lensFrame);
  g.add(lensG);

  // ---------------------------------------------------------------- screen carriage
  const screenG = new THREE.Group();
  const scrC = document.createElement('canvas');
  scrC.width = scrC.height = TEX;
  const scrCtx = scrC.getContext('2d')!;
  const scrTex = new THREE.CanvasTexture(scrC);
  scrTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN, SCREEN), new THREE.MeshBasicMaterial({ map: scrTex, side: THREE.DoubleSide }));
  screen.position.y = YA;
  screen.rotation.y = -Math.PI / 2;
  screenG.add(screen);
  const screenFrame = merged(
    [
      { geo: new THREE.BoxGeometry(0.02, SCREEN + 0.03, 0.015), pos: [0.005, YA, SCREEN / 2 + 0.007] },
      { geo: new THREE.BoxGeometry(0.02, SCREEN + 0.03, 0.015), pos: [0.005, YA, -SCREEN / 2 - 0.007] },
      { geo: new THREE.BoxGeometry(0.02, 0.015, SCREEN), pos: [0.005, YA + SCREEN / 2 + 0.007, 0] },
      { geo: new THREE.BoxGeometry(0.02, 0.015, SCREEN), pos: [0.005, YA - SCREEN / 2 - 0.007, 0] },
      { geo: new THREE.BoxGeometry(0.012, YA - SCREEN / 2 - 0.9, 0.012), pos: [0.005, (YA - SCREEN / 2 + 0.9) / 2, 0] },
      { geo: rbox(0.07, 0.035, 0.09, 0.01), pos: [0, 0.905, 0] },
    ],
    mats.darkWood,
  );
  screenG.add(screenFrame);
  g.add(screenG);

  // focal point markers and ray diagram
  const fA = glowSprite(0x7fe8ff, 0.05, 0.9);
  const fB = glowSprite(0x7fe8ff, 0.05, 0.9);
  g.add(fA, fB);
  const rays = new BeamBatch(12);
  g.add(rays.mesh);

  // ---------------------------------------------------------------- optics
  const out = { dO: 0, s: 0, dI: NaN, m: NaN, blur: 0, k: 0 };
  function optics() {
    out.dO = st.xl - XC;
    out.s = st.xs - st.xl;
    const inv = 1 / st.f - 1 / out.dO; // 1/dᵢ
    out.dI = inv > 1e-9 ? 1 / inv : NaN;
    out.m = Number.isNaN(out.dI) ? NaN : -out.dI / out.dO;
    out.blur = APERTURE * Math.abs(1 - out.s * inv);
    out.k = out.s / out.dO; // chief-ray scale on the screen
  }

  // offscreen canvases for the sharp image and its blur
  const sharpC = document.createElement('canvas');
  const blurC = document.createElement('canvas');
  const sharpCtx = sharpC.getContext('2d')!;
  const blurCtx = blurC.getContext('2d')!;

  /** The candle drawn in object coordinates (metres; y up from the axis; flame centre near 0). */
  function drawCandle(c: CanvasRenderingContext2D, bright: number) {
    c.fillStyle = `rgba(255,236,205,${0.16 * bright})`;
    c.fillRect(-0.018, -0.116, 0.036, 0.1);
    const grad = c.createRadialGradient(0, -0.002, 0, 0, 0.0, 0.022);
    grad.addColorStop(0, `rgba(255,255,235,${Math.min(1, 1.0 * bright)})`);
    grad.addColorStop(0.35, `rgba(255,190,90,${Math.min(1, 0.95 * bright)})`);
    grad.addColorStop(0.75, `rgba(255,110,30,${Math.min(1, 0.5 * bright)})`);
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(0, 0.022);
    c.bezierCurveTo(0.004, 0.012, 0.009, 0.0, 0.008, -0.006);
    c.bezierCurveTo(0.007, -0.013, -0.007, -0.013, -0.008, -0.006);
    c.bezierCurveTo(-0.009, 0.0, -0.004, 0.012, 0, 0.022);
    c.fill();
    c.fillStyle = `rgba(30,20,10,${0.6 * Math.min(1, bright)})`;
    c.fillRect(-0.0007, -0.016, 0.0014, 0.008);
  }

  function paintScreen() {
    const k = out.k;
    const bright = THREE.MathUtils.clamp(0.8 / (k * k), 0.06, 1.2);
    const rPx = (out.blur * PX) / 2;
    const q = rPx > 10 ? 10 / rPx : 1;
    const S = Math.max(24, Math.round(TEX * q));
    sharpC.width = blurC.width = S;
    sharpC.height = blurC.height = S;
    sharpCtx.setTransform(-k * PX * q, 0, 0, k * PX * q, S / 2, S / 2);
    drawCandle(sharpCtx, bright);
    blurCtx.globalCompositeOperation = 'lighter';
    const r = rPx * q;
    const N = r < 0.6 ? 1 : Math.min(48, Math.max(6, Math.ceil(Math.PI * r * r / 4)));
    blurCtx.globalAlpha = 1 / N;
    for (let i = 0; i < N; i++) {
      // Vogel spiral: uniform samples over the blur disc
      const rr = N === 1 ? 0 : r * Math.sqrt((i + 0.5) / N);
      const a = i * 2.399963;
      blurCtx.drawImage(sharpC, rr * Math.cos(a), rr * Math.sin(a));
    }
    blurCtx.globalAlpha = 1;
    scrCtx.globalCompositeOperation = 'source-over';
    scrCtx.fillStyle = '#4d4741';
    scrCtx.fillRect(0, 0, TEX, TEX);
    scrCtx.globalCompositeOperation = 'lighter';
    scrCtx.imageSmoothingEnabled = true;
    scrCtx.drawImage(blurC, 0, 0, S, S, 0, 0, TEX, TEX);
    scrCtx.globalCompositeOperation = 'source-over';
    scrTex.needsUpdate = true;
    if (ui) {
      const { ctx: c, width: W, height: H } = ui.view;
      c.fillStyle = '#120e16';
      c.fillRect(0, 0, W, H);
      const sz = H - 8;
      c.drawImage(scrC, (W - sz) / 2, 4, sz, sz);
    }
  }

  function drawRays() {
    rays.begin();
    fA.visible = fB.visible = st.rays;
    if (st.rays) {
      const h = 0.02; // flame tip height above the axis
      const xl = st.xl;
      const xs = st.xs;
      const f = st.f;
      const w = 0.004;
      fA.position.set(xl - f, YA, 0);
      fB.position.set(xl + f, YA, 0);
      const z = 0.0;
      // 1: parallel to the axis, then through the far focus
      const slope1 = -h / f;
      rays.seg(XC, YA + h, z, xl, YA + h, z, w, 1.4, 0.35, 0.8);
      rays.seg(xl, YA + h, z, xs, YA + h + slope1 * (xs - xl), z, w, 1.4, 0.35, 0.8);
      // 2: straight through the centre
      const slope2 = -h / (xl - XC);
      rays.seg(XC, YA + h, z, xs, YA + h + slope2 * (xs - XC), z, w, 1.5, 1.2, 0.3);
      // 3: through (or as if from) the near focus, then parallel
      if (Math.abs(out.dO - f) > 1e-3) {
        const y3 = (h * f) / (f - out.dO);
        if (Math.abs(y3) < 0.25) {
          rays.seg(XC, YA + h, z, xl, YA + y3, z, w, 0.3, 1.2, 1.5);
          rays.seg(xl, YA + y3, z, xs, YA + y3, z, w, 0.3, 1.2, 1.5);
        }
      }
    }
    rays.end();
  }

  // ---------------------------------------------------------------- HUD
  let ui: {
    dO: Readout; s: Readout; dI: Readout; m: Readout; blur: Readout; sharp: Meter; note: HTMLElement;
    view: { ctx: CanvasRenderingContext2D; width: number; height: number };
  } | null = null;
  const cm = (m: number) => `${fmt(m * 100, 1)} cm`;
  function drawHud() {
    if (!ui) return;
    ui.dO.set(cm(out.dO));
    ui.s.set(cm(out.s));
    ui.dI.set(Number.isNaN(out.dI) ? t(L('ingen verklig bild', 'no real image')) : cm(out.dI));
    ui.m.set(Number.isNaN(out.m) ? '–' : `${fmt(out.m, 2)}×`);
    ui.blur.set(`${fmt(out.blur * 1000, 1)} mm`);
    const sharp = Math.max(0, 1 - out.blur / 0.012);
    ui.sharp.set(sharp, `${Math.round(sharp * 100)} %`);
    let n = L('Flytta skärmen tills lågan blir skarp.', 'Move the screen until the flame looks sharp.');
    if (Number.isNaN(out.dI)) n = L('Ljuset är för nära linsen (dₒ ≤ f): strålarna möts aldrig bakom linsen. Tittar du genom linsen från andra sidan ser du i stället en förstorad, rättvänd bild, precis som i ett förstoringsglas.', 'The candle is too close (dₒ ≤ f): the rays never meet behind the lens. Look through the lens from the other side and you see an enlarged, upright image instead, just like a magnifying glass.');
    else if (out.blur < 0.0015) n = Math.abs(out.m) > 1.02
      ? L('Skarpt! Bilden är upp och ner och större än ljuset.', 'Sharp! The image is upside down and bigger than the candle.')
      : Math.abs(out.m) < 0.98
        ? L('Skarpt! Bilden är upp och ner och mindre än ljuset.', 'Sharp! The image is upside down and smaller than the candle.')
        : L('Skarpt, och lika stort som ljuset: nu är dₒ = dᵢ = 2f.', 'Sharp, and the same size as the candle: now dₒ = dᵢ = 2f.');
    ui.note.textContent = t(n);
  }

  // ---------------------------------------------------------------- milestones
  const say = cooldown(9);
  let sharpBig = false;
  let sharpSmall = false;
  let saidBoth = false;
  let saidVirtual = false;
  let wasSharp = false;
  let touched = false;
  function milestones() {
    if (!touched) return;
    const sharp = out.blur < 0.0015 && !Number.isNaN(out.dI);
    if (sharp && !wasSharp) {
      ctx.sfx.chime();
      const big = Math.abs(out.m) > 1;
      if (big) sharpBig = true;
      else sharpSmall = true;
      if (sharpBig && sharpSmall && !saidBoth && say()) {
        saidBoth = true;
        ctx.buddy.celebrate(L('Du hittade båda! För samma avstånd mellan ljus och skärm finns två skarpa lägen: en stor bild och en liten.', 'You found both! For the same candle-to-screen distance there are two sharp positions: a big image and a small one.'));
      } else if (say()) {
        ctx.buddy.celebrate(L(`Skarpt! Förstoringen är ${fmt(out.m, 2)}. Minustecknet betyder att bilden är upp och ner.`, `Sharp! The magnification is ${fmt(out.m, 2)}. The minus sign means the image is upside down.`));
      }
    }
    wasSharp = sharp;
    if (Number.isNaN(out.dI) && !saidVirtual && say()) {
      saidVirtual = true;
      ctx.buddy.say(L('Nu är ljuset innanför brännpunkten. Ingen bild på skärmen, men så fungerar ett förstoringsglas!', 'Now the candle is inside the focal length. No image on the screen, but that’s how a magnifying glass works!'), { expression: 'thinking' });
    }
  }

  function update3D() {
    lensG.position.x = st.xl;
    screenG.position.x = st.xs;
    const thick = (APERTURE / 2) ** 2 / st.f; // biconvex, n = 1.5: R = f, thickness = 2·r²/(2R)
    lensMesh.scale.set(Math.max(0.003, thick / 2 + 0.0015), APERTURE / 2, APERTURE / 2);
    optics();
    paintScreen();
    drawRays();
    drawHud();
  }

  // ---------------------------------------------------------------- interaction
  const _plane = new THREE.Plane();
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3();
  function railX(info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) {
    g.updateMatrixWorld(true);
    _n.set(0, 0, 1).transformDirection(g.matrixWorld);
    _p.set(0, YA, 0);
    g.localToWorld(_p);
    _plane.setFromNormalAndCoplanarPoint(_n, _p);
    const hit = info.onPlane(_plane);
    if (!hit) return null;
    return g.worldToLocal(hit).x;
  }
  let lastTickCm = 0;
  function tick(x: number) {
    const c = Math.round(x * 100);
    if (c !== lastTickCm) {
      lastTickCm = c;
      if (c % 2 === 0) ctx.sfx.tone(1500, 0.02, { type: 'triangle', gain: 0.02 });
    }
  }
  let grabOff = 0;
  ctx.interaction.add(lensG, {
    label: L('Dra linsen längs skenan', 'Drag the lens along the rail'),
    cursor: 'ew-resize',
    onDragStart: (i) => {
      const x = railX(i);
      grabOff = x === null ? 0 : st.xl - x;
    },
    onDrag: (i) => {
      const x = railX(i);
      if (x === null) return;
      st.xl = THREE.MathUtils.clamp(x + grabOff, XC + 0.03, st.xs - 0.03);
      tick(st.xl);
      touched = true;
      st.dirty = true;
    },
  });
  ctx.interaction.add(screenG, {
    label: L('Dra skärmen längs skenan', 'Drag the screen along the rail'),
    cursor: 'ew-resize',
    onDragStart: (i) => {
      const x = railX(i);
      grabOff = x === null ? 0 : st.xs - x;
    },
    onDrag: (i) => {
      const x = railX(i);
      if (x === null) return;
      st.xs = THREE.MathUtils.clamp(x + grabOff, st.xl + 0.03, X_MAX);
      tick(st.xs);
      touched = true;
      st.dirty = true;
    },
  });

  ctx.addStation({
    id: 'light-lens',
    title: L('Linsbänken', 'The lens bench'),
    position: [ROOM_X, ROOM_Z + 0.4],
    viewpoint: { position: [ROOM_X - 1.05, 1.75, ROOM_Z + 1.45], target: [ROOM_X + 0.3, 1.05, ROOM_Z - 0.2] },
    intro: L('En lins kan fånga ljuset från en låga och rita en bild av den på en skärm. Men bara om du hittar rätt avstånd!', 'A lens can catch the light from a flame and paint a picture of it on a screen. But only if you find the right distance!'),
    howTo: L('Dra linsen och skärmen längs skenan tills lågan blir skarp. Byt lins och jämför.', 'Drag the lens and the screen along the rail until the flame is sharp. Switch lenses and compare.'),
    science: L(
      'En samlingslins böjer alla strålar från en punkt på lågan så att de möts i en enda punkt bakom linsen. Avstånden följer linsformeln 1/f = 1/dₒ + 1/dᵢ, där dₒ är avståndet till ljuset, dᵢ till bilden och f brännvidden. Bilden blir upp och ner, och förstoringen är m = −dᵢ/dₒ. Står skärmen fel möts strålarna före eller efter den, och varje punkt blir en suddig skiva vars storlek växer med felet. En vanlig missuppfattning är att en halvt övertäckt lins bara ger halva bilden, men hela bilden finns kvar, bara mörkare. Här är linsen 8 cm bred och avstånden i verklig skala.',
      'A converging lens bends all the rays from one point of the flame so that they meet again at one point behind the lens. The distances follow the lens equation 1/f = 1/dₒ + 1/dᵢ, where dₒ is the distance to the candle, dᵢ to the image and f the focal length. The image is upside down, and the magnification is m = −dᵢ/dₒ. If the screen is in the wrong place, the rays meet before or after it and every point becomes a blurry disc that grows with the error. A common misconception is that covering half the lens gives half the image, but the whole image remains, just dimmer. Here the lens is 8 cm wide and the distances are real size.',
    ),
    wow: L('Ditt öga gör exakt så här: bilden på näthinnan är upp och ner, och hjärnan vänder på den. Ögat har cirka 60 dioptrier, alltså f ≈ 1,7 cm.', 'Your eye does exactly this: the image on your retina is upside down, and your brain flips it. The eye has about 60 dioptres, so f ≈ 1.7 cm.'),
    controls: (panel: ControlPanel) => {
      panel.heading(L('Lins', 'Lens'));
      panel.buttons(
        FOCALS.map((f) => ({
          label: L(`f = ${f * 100} cm`, `f = ${f * 100} cm`),
          onClick: () => {
            st.f = f;
            wasSharp = false;
            st.dirty = true;
          },
        })),
        FOCALS.indexOf(st.f),
      );
      panel.toggle(L('Visa strålgång och brännpunkter', 'Show ray diagram and focal points'), st.rays, (v) => {
        st.rays = v;
        st.dirty = true;
      });
      const view = panel.canvas(120);
      const dO = panel.readout(L('Ljus → lins, dₒ', 'Candle → lens, dₒ'));
      const s = panel.readout(L('Lins → skärm', 'Lens → screen'));
      const dI = panel.readout(L('Skarp bild vid dᵢ', 'Sharp image at dᵢ'));
      const m = panel.readout(L('Förstoring m = −dᵢ/dₒ', 'Magnification m = −dᵢ/dₒ'));
      const blur = panel.readout(L('Suddighet (skivans diameter)', 'Blur (disc diameter)'));
      const sharp = panel.meter(L('Skärpa', 'Sharpness'), '#ffd27a');
      const note = panel.note(L('', ''));
      ui = { dO, s, dI, m, blur, sharp, note, view };
      st.dirty = true;
      return () => {
        ui = null;
      };
    },
  });

  return {
    update(_dt: number, time: number) {
      // candle flicker
      const fl = 1 + Math.sin(time * 13.1) * 0.05 + Math.sin(time * 7.3) * 0.04;
      flame.scale.y = 0.017 * fl;
      flameGlow.material.opacity = 0.75 + (fl - 1) * 2;
      if (st.dirty) {
        st.dirty = false;
        update3D();
        milestones();
      }
    },
  };
}
