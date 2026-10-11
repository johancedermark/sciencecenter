/**
 * Station 4: polarising filters. Unpolarised light → filter 1 (vertical) → optional middle filter → filter 2.
 * Ideal polarisers: ½·I₀ after the first, then Malus' law I = I_in·cos²(Δθ) at each following filter.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import { BeamBatch, DEG, cooldown, fmt, glowSprite, mats, merged, plaque, rbox, table } from './common';
import { drawText } from '../../core/textures';

const YA = 1.15;
const X_BOX = -0.75;
const X_P1 = -0.35;
const X_P3 = 0.0;
const X_P2 = 0.35;
const X_DET = 0.82;
const R_F = 0.13;

function filterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(70,64,82,0.55)';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(25,20,30,0.55)';
  for (let x = 2; x < 256; x += 9) g.fillRect(x, 0, 3, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPolarisation(ctx: RoomContext) {
  const ROOM_X = -7;
  const ROOM_Z = 2.6;
  const g = new THREE.Group();
  g.position.set(ROOM_X, 0, ROOM_Z);
  ctx.group.add(g);

  const st = { th2: 0 * DEG, th3: 45 * DEG, mid: false, midLift: 1, dirty: true };

  const tbl = table(2.1, 0.7);
  g.add(tbl);
  ctx.addCollider(ROOM_X, ROOM_Z, 2.2, 0.8);
  const pl = plaque(L('Polarisationsfilter', 'Polarising filters'), 0.8, 0.14);
  pl.position.set(0, 0.74, 0.351);
  g.add(pl);

  // light box
  const box = new THREE.Mesh(rbox(0.22, 0.42, 0.42, 0.04), mats.blackMetal);
  box.position.set(X_BOX - 0.06, YA, 0);
  g.add(box);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(1.05), toneMapped: false }));
  face.rotation.y = Math.PI / 2;
  face.position.set(X_BOX + 0.052, YA, 0);
  g.add(face);
  const boxGlow = glowSprite(0xfff1dd, 0.5, 0.35);
  boxGlow.position.set(X_BOX + 0.1, YA, 0);
  g.add(boxGlow);
  const boxLegs = merged([{ geo: new THREE.BoxGeometry(0.16, YA - 0.21 - 0.85, 0.16), pos: [X_BOX - 0.06, (YA - 0.21 + 0.85) / 2, 0] }], mats.brass);
  g.add(boxLegs);

  // filters
  const fTex = filterTexture();
  const discGeo = new THREE.CircleGeometry(R_F, 48).rotateY(Math.PI / 2);
  const ringGeo = merged(
    [
      { geo: new THREE.TorusGeometry(R_F + 0.008, 0.01, 8, 48), rot: [0, Math.PI / 2, 0] },
      { geo: new THREE.SphereGeometry(0.018, 12, 8), pos: [0, R_F + 0.03, 0] },
      { geo: new THREE.CylinderGeometry(0.005, 0.005, 0.03), pos: [0, R_F + 0.012, 0] },
    ],
    mats.brass,
  ).geometry;
  const standGeo = merged(
    [
      { geo: new THREE.CylinderGeometry(0.01, 0.01, YA - R_F - 0.86), pos: [0, (YA - R_F + 0.86) / 2, 0] },
      { geo: new THREE.CylinderGeometry(0.06, 0.07, 0.02, 20), pos: [0, 0.86, 0] },
    ],
    mats.brass,
  ).geometry;
  function makeFilter(x: number) {
    const stand = new THREE.Mesh(standGeo, mats.brass);
    stand.position.x = x;
    const rot = new THREE.Group();
    rot.position.set(x, YA, 0);
    const discMat = new THREE.MeshStandardMaterial({
      map: fTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.3,
      emissive: 0xfff0dc, emissiveMap: fTex, emissiveIntensity: 0,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    const ring = new THREE.Mesh(ringGeo, mats.brass);
    rot.add(disc, ring);
    g.add(stand, rot);
    return { stand, rot, discMat };
  }
  const f1 = makeFilter(X_P1);
  const f3 = makeFilter(X_P3);
  const f2 = makeFilter(X_P2);

  // photometer with a small display
  const det = new THREE.Mesh(rbox(0.1, 0.16, 0.16, 0.02), mats.blackMetal);
  det.position.set(X_DET + 0.05, YA, 0);
  g.add(det);
  const sensorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const sensor = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24).rotateY(-Math.PI / 2), sensorMat);
  sensor.position.set(X_DET - 0.001, YA, 0);
  g.add(sensor);
  const dispC = document.createElement('canvas');
  dispC.width = 256;
  dispC.height = 128;
  const dispCtx = dispC.getContext('2d')!;
  const dispTex = new THREE.CanvasTexture(dispC);
  dispTex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ map: dispTex }));
  disp.position.set(X_DET + 0.05, YA + 0.17, 0.02);
  disp.rotation.y = 0.75;
  g.add(disp);
  const detPost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, YA - 0.08 - 0.85), mats.brass);
  detPost.position.set(X_DET + 0.05, (YA - 0.08 + 0.85) / 2, 0);
  g.add(detPost);

  // beams and E-field arrows
  const beams = new BeamBatch(8);
  g.add(beams.mesh);
  const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.75).multiplyScalar(1.5), toneMapped: false });
  const arrowGeo = merged(
    [
      { geo: new THREE.CylinderGeometry(0.003, 0.003, 1.6) },
      { geo: new THREE.ConeGeometry(0.012, 0.2, 8), pos: [0, 0.9, 0] },
      { geo: new THREE.ConeGeometry(0.012, 0.2, 8), pos: [0, -0.9, 0], rot: [Math.PI, 0, 0] },
    ],
    arrowMat,
  ).geometry;
  const arrows = [0, 1, 2].map(() => {
    const a = new THREE.Mesh(arrowGeo, arrowMat);
    g.add(a);
    return a;
  });

  // ---------------------------------------------------------------- physics
  const out = { i1: 0.5, i3: 0.5, i2: 0.5 };
  const cos2 = (a: number) => Math.cos(a) ** 2;
  function intensities() {
    out.i1 = 0.5;
    out.i3 = st.mid ? out.i1 * cos2(st.th3) : out.i1;
    out.i2 = out.i3 * cos2(st.th2 - (st.mid ? st.th3 : 0));
  }

  function paint() {
    intensities();
    f2.rot.rotation.x = st.th2;
    f3.rot.rotation.x = st.th3;
    f1.discMat.emissiveIntensity = out.i1 * 0.25;
    f3.discMat.emissiveIntensity = st.mid ? out.i3 * 0.25 : 0;
    f2.discMat.emissiveIntensity = out.i2 * 0.25;
    sensorMat.color.setScalar(0.05 + out.i2 * 2.2);
    const pct = `${fmt(out.i2 * 100, 1)} %`;
    drawText(dispCtx, 256, 128, `I/I₀ = ${pct}`, { bg: '#0d1a12', color: '#7dffb0', font: '700 28px ui-monospace, monospace', glow: '#2f8' });
    dispTex.needsUpdate = true;
    drawHud();
  }

  function drawBeams() {
    beams.begin();
    const W = 0.2;
    const k = 0.5;
    const seg = (x0: number, x1: number, I: number) => {
      if (I > 0.002) beams.seg(x0, YA, 0, x1, YA, 0, W, I * k, I * k * 0.95, I * k * 0.88);
    };
    seg(X_BOX + 0.06, X_P1, 1);
    if (st.mid && st.midLift < 0.05) {
      seg(X_P1, X_P3, out.i1);
      seg(X_P3, X_P2, out.i3);
    } else seg(X_P1, X_P2, out.i1);
    seg(X_P2, X_DET, out.i2);
    beams.end();
  }

  // ---------------------------------------------------------------- HUD
  let ui: {
    th2: HTMLInputElement; th3: HTMLInputElement; mid: HTMLInputElement; r1: Readout; r3: Readout; r2: Readout; meter: Meter;
    plot: { ctx: CanvasRenderingContext2D; width: number; height: number };
  } | null = null;
  function drawHud() {
    if (!ui) return;
    const p = (v: number) => `${fmt(v * 100, 1)} %`;
    ui.r1.set(p(out.i1));
    ui.r3.set(st.mid ? p(out.i3) : t(L('inte isatt', 'not in place')));
    ui.r2.set(p(out.i2));
    ui.meter.set(out.i2 / 0.5, p(out.i2));
    ui.mid.checked = st.mid;
    const { ctx: c, width: W, height: H } = ui.plot;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(0, 0, W, H);
    const X = (deg: number) => 28 + (deg / 180) * (W - 38);
    const Y = (i: number) => H - 16 - (i / 0.5) * (H - 26);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = '11px system-ui';
    c.fillText('50 %', 0, Y(0.5) + 4);
    c.fillText('0', 14, Y(0) + 4);
    for (const d of [0, 45, 90, 135, 180]) c.fillText(`${d}°`, X(d) - 8, H - 2);
    c.strokeStyle = '#ff5fa2';
    c.lineWidth = 2;
    c.beginPath();
    for (let d = 0; d <= 180; d += 2) {
      const th = d * DEG;
      const i = (st.mid ? 0.5 * cos2(st.th3) * cos2(th - st.th3) : 0.5 * cos2(th));
      if (d === 0) c.moveTo(X(d), Y(i));
      else c.lineTo(X(d), Y(i));
    }
    c.stroke();
    const d2 = ((st.th2 / DEG) % 180 + 180) % 180;
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(X(d2), Y(out.i2), 5, 0, Math.PI * 2);
    c.fill();
  }

  // ---------------------------------------------------------------- milestones
  const say = cooldown(9);
  let saidDark = false;
  let saidBack = false;
  let touched = false;
  function milestones() {
    if (!touched) return;
    if (!st.mid && out.i2 < 0.004 && !saidDark && say()) {
      saidDark = true;
      ctx.sfx.tone(180, 0.4, { type: 'sine', gain: 0.1, to: 110 });
      ctx.buddy.say(L('Mörkt! Filtren står i 90 grader mot varandra, korsade. Vad händer om du sätter in ett tredje filter emellan?', 'Dark! The filters are at 90 degrees, crossed. What happens if you put a third filter in between?'), { expression: 'thinking' });
    } else if (st.mid && out.i2 > 0.1 && Math.abs(Math.cos(st.th2)) < 0.1 && !saidBack && say()) {
      saidBack = true;
      ctx.sfx.chime();
      ctx.buddy.celebrate(L('Ljuset kom tillbaka! Ett filter till släppte igenom mer ljus, en åttondel av det ursprungliga.', 'The light came back! Adding a filter let more light through, one eighth of the original.'));
    }
  }

  // ---------------------------------------------------------------- interaction
  let lastTick = 0;
  function setTh2(deg: number, fromSlider = false) {
    const v = ((deg % 360) + 360) % 360;
    st.th2 = v * DEG;
    if (Math.abs(v - lastTick) > 5) {
      lastTick = v;
      ctx.sfx.tone(1200, 0.02, { type: 'triangle', gain: 0.025 });
    }
    touched = true;
    st.dirty = true;
    if (ui && !fromSlider) ui.th2.value = String(Math.round(v > 180 ? v - 180 : v));
  }
  function setTh3(deg: number, fromSlider = false) {
    const v = ((deg % 360) + 360) % 360;
    st.th3 = v * DEG;
    touched = true;
    st.dirty = true;
    if (ui && !fromSlider) ui.th3.value = String(Math.round(v > 180 ? v - 180 : v));
  }
  function setMid(v: boolean) {
    st.mid = v;
    touched = true;
    st.dirty = true;
    ctx.sfx.whoosh();
  }
  ctx.interaction.add(f2.rot, {
    label: L('Dra för att vrida filtret', 'Drag to turn the filter'),
    cursor: 'ew-resize',
    onDrag: (i) => setTh2(st.th2 / DEG - i.dx * 0.5),
  });
  ctx.interaction.add(f3.rot, {
    label: L('Klicka: sätt in/ta ut · dra: vrid', 'Click: insert/remove · drag: turn'),
    onClick: () => setMid(!st.mid),
    onDrag: (i) => setTh3(st.th3 / DEG - i.dx * 0.5),
  });

  ctx.addStation({
    id: 'light-polariser',
    title: L('Polarisationsfilter', 'Polarising filters'),
    position: [ROOM_X + 0.2, ROOM_Z + 0.4],
    viewpoint: { position: [ROOM_X + 1.75, 1.6, ROOM_Z + 1.55], target: [ROOM_X - 0.1, 1.1, ROOM_Z - 0.35] },
    intro: L('Två filter som ser ut som vanligt grått glas. Men vrid på det ena och något märkligt händer!', 'Two filters that look like plain grey glass. But turn one of them and something strange happens!'),
    howTo: L('Dra i det bakre filtret (eller använd reglaget) för att vrida det. Korsa filtren, och sätt sedan in mittfiltret.', 'Drag the back filter (or use the slider) to turn it. Cross the filters, then insert the middle filter.'),
    science: L(
      'Ljus är en elektromagnetisk våg som svänger på tvären mot färdriktningen. Lampans ljus svänger åt alla håll, men ett polarisationsfilter släpper bara igenom svängningen längs sin axel: hälften av ljuset, ½·I₀. Nästa filter släpper igenom I = I₀·cos²θ, där θ är vinkeln mellan filtrens axlar (Malus lag). Vid 90° blir det mörkt. Ett filter i 45° emellan vrider svängningen i två steg, så då kommer ½ · ½ · ½ = 1/8 av ljuset (12,5 %) igenom. Filtren är alltså inte bara mörkt glas: vrider du ett grått glas händer ingenting. Här räknar vi med perfekta filter; riktiga släpper igenom lite mindre.',
      'Light is an electromagnetic wave that oscillates across its direction of travel. The lamp’s light oscillates in every direction, but a polarising filter only passes the oscillation along its axis: half the light, ½·I₀. The next filter passes I = I₀·cos²θ, where θ is the angle between the filter axes (Malus’ law). At 90° it goes dark. A filter at 45° in between turns the oscillation in two steps, so ½ · ½ · ½ = 1/8 of the light (12.5%) gets through. So the filters are not just dark glass: turning a grey glass changes nothing. We assume perfect filters here; real ones pass a little less.',
    ),
    wow: L('Mobil- och datorskärmar (LCD) har två korsade polarisationsfilter med flytande kristaller emellan som vrider ljuset pixel för pixel. Med polariserade solglasögon kan skärmen bli svart när du lutar huvudet, och de släcker blänk från vatten och vägbana.', 'Phone and computer LCD screens have two crossed polarising filters with liquid crystals in between that twist the light pixel by pixel. With polarised sunglasses a screen can turn black when you tilt your head, and they kill glare from water and roads.'),
    controls: (panel: ControlPanel) => {
      panel.heading(L('Filter', 'Filters'));
      const th2 = panel.slider(L('Bakre filtrets vinkel θ', 'Back filter angle θ'), { min: 0, max: 180, step: 1, value: Math.round(((st.th2 / DEG) % 180 + 180) % 180), format: (v) => `${v}°` }, (v) => setTh2(v, true));
      const mid = panel.toggle(L('Mittfilter insatt', 'Middle filter inserted'), st.mid, (v) => setMid(v));
      const th3 = panel.slider(L('Mittfiltrets vinkel', 'Middle filter angle'), { min: 0, max: 180, step: 1, value: Math.round(((st.th3 / DEG) % 180 + 180) % 180), format: (v) => `${v}°` }, (v) => setTh3(v, true));
      panel.buttons([
        { label: L('Korsa (90°)', 'Cross (90°)'), onClick: () => setTh2(90) },
        { label: L('Mitten 45°', 'Middle 45°'), onClick: () => setTh3(45) },
      ]);
      const r1 = panel.readout(L('Efter första filtret', 'After the first filter'));
      const r3 = panel.readout(L('Efter mittfiltret', 'After the middle filter'));
      const r2 = panel.readout(L('Efter bakre filtret', 'After the back filter'));
      const meter = panel.meter(L('Ljus till mätaren (av max ½·I₀)', 'Light at the meter (of max ½·I₀)'), '#ffe6a8');
      const plot = panel.canvas(110);
      ui = { th2, th3, mid, r1, r3, r2, meter, plot };
      st.dirty = true;
      return () => {
        ui = null;
      };
    },
  });

  const _q = new THREE.Quaternion();
  return {
    update(dt: number, time: number) {
      // middle filter slides down into the beam or up out of it
      const target = st.mid ? 0 : 1;
      if (Math.abs(st.midLift - target) > 1e-3) {
        st.midLift += (target - st.midLift) * Math.min(1, dt * 6);
        if (Math.abs(st.midLift - target) < 0.01) st.midLift = target;
        st.dirty = true;
      }
      f3.rot.position.y = YA + st.midLift * 0.42;
      f3.stand.visible = st.midLift < 0.5;
      if (st.dirty) {
        st.dirty = false;
        paint();
        drawBeams();
        milestones();
      }
      // oscillating E-field arrows (amplitude ∝ √I)
      const w = Math.sin(time * 6);
      const amps = [Math.sqrt(out.i1 * 2), Math.sqrt(out.i3 * 2), Math.sqrt(out.i2 * 2)];
      const ang = [0, st.mid ? st.th3 : 0, st.th2];
      const xs = st.mid && st.midLift < 0.05 ? [(X_P1 + X_P3) / 2, (X_P3 + X_P2) / 2, (X_P2 + X_DET) / 2] : [(X_P1 + X_P2) / 2, NaN, (X_P2 + X_DET) / 2];
      arrows.forEach((a, i) => {
        a.visible = !Number.isNaN(xs[i]) && amps[i] > 0.03;
        if (!a.visible) return;
        a.position.set(xs[i], YA, 0);
        a.quaternion.copy(_q.setFromAxisAngle(_xAxis, ang[i]));
        a.scale.set(1, 0.09 * amps[i] * (0.25 + 0.75 * Math.abs(w)) * Math.sign(w || 1), 1);
      });
      boxGlow.material.opacity = 0.33 + Math.sin(time * 2) * 0.03;
    },
  };
}

const _xAxis = new THREE.Vector3(1, 0, 0);
