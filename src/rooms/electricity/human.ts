/**
 * Station 5: the human battery.
 * Two different metals + sweat (a salty electrolyte) = a galvanic cell. The visitor closes the circuit
 * through their body. I = E_eff / (R_skin+body + R_meter). Dry skin ≈ 200 kΩ hand to hand at low DC voltage,
 * wet skin ≈ 15 kΩ. The aluminium's oxide film lowers its EMF to ≈ 0,6 V (research doc: 0,5–0,8 V), and
 * the cell polarises: the current sags by about a quarter over ~10 s while you hold on.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import {
  AnalogMeter, Cheers, Every, FONT, StationFrame, Wire, canvasPlane, clamp, ease, fmt, mats, put, rbox, sign, workbench,
} from './shared';

interface Metal { label: L10n; key: 'aluminium' | 'zinc' | 'copper'; emf: number }
const METALS: Metal[] = [
  { label: L('Aluminium', 'Aluminium'), key: 'aluminium', emf: 0.6 },
  { label: L('Zink', 'Zinc'), key: 'zinc', emf: 0.8 },
  { label: L('Koppar', 'Copper'), key: 'copper', emf: 0.003 },
];
const R_DRY = 200e3;
const R_WET = 15e3;
const R_METER = 2e3;
const FULL = 50; // µA

function handGeometry(mirror: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const palm = new THREE.SphereGeometry(0.05, 16, 10);
  palm.scale(1, 0.32, 1.15);
  parts.push(palm);
  const fingerLen = [0.07, 0.08, 0.075, 0.06];
  fingerLen.forEach((len, i) => {
    const f = new THREE.CapsuleGeometry(0.011, len, 4, 8);
    f.rotateX(Math.PI / 2);
    f.translate(-0.03 + i * 0.02, 0.002, -0.055 - len / 2);
    parts.push(f);
  });
  const thumb = new THREE.CapsuleGeometry(0.012, 0.05, 4, 8);
  thumb.rotateX(Math.PI / 2);
  thumb.rotateY(-0.9);
  thumb.translate(0.055, 0, -0.01);
  parts.push(thumb);
  // forearm stub reaching back towards the visitor
  const arm = new THREE.CylinderGeometry(0.03, 0.035, 0.2, 14);
  arm.rotateX(Math.PI / 2 - 0.25);
  arm.translate(0, 0.03, 0.15);
  parts.push(arm);
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  flat.forEach((p) => { for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k); });
  const geo = mergeGeometries(flat, false)!;
  if (mirror) {
    geo.scale(-1, 1, 1);
    // flip winding so the faces stay outward
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i + 1), ay = pos.getY(i + 1), az = pos.getZ(i + 1);
      pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      pos.setXYZ(i + 2, ax, ay, az);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildHuman(ctx: RoomContext, cheers: Cheers) {
  const m = mats();
  const st = new StationFrame(ctx, 6.5, 2.5, -Math.PI / 2);
  const g = st.group;
  workbench(g, 2.2, 0.95);
  st.collider(2.35, 1.1);

  let left = false;
  let right = false;
  let wet = false;
  let metal = 0;
  let hold = 0; // seconds both hands have been on (polarisation)
  let current = 0; // µA
  let focused = false;
  let both = false;

  // board and plates
  put(g, rbox(1.1, 0.03, 0.42, 0.012), m.wood, 0, 0.915, 0.12);
  put(g, rbox(1.12, 0.012, 0.44, 0.006), m.brass, 0, 0.902, 0.12);
  const PL = [-0.3, 0.3];
  const plateGeo = rbox(0.3, 0.012, 0.25, 0.006);
  const leftPlate = put(g, plateGeo, m.copper, PL[0], 0.936, 0.12, 0, 0, 0, false);
  const rightMat = m.aluminium.clone();
  const rightPlate = put(g, plateGeo, rightMat, PL[1], 0.936, 0.12, 0, 0, 0, false);
  const outline = (mirror: boolean) => canvasPlane(0.26, 0.22, 256, 216, (c, W, H) => {
    c.strokeStyle = 'rgba(40,25,15,0.55)';
    c.lineWidth = 5;
    c.setLineDash([12, 8]);
    c.save();
    if (mirror) { c.translate(W, 0); c.scale(-1, 1); }
    c.beginPath();
    c.ellipse(W * 0.5, H * 0.66, W * 0.2, H * 0.24, 0, 0, Math.PI * 2);
    c.stroke();
    [0.36, 0.45, 0.54, 0.63].forEach((x, i) => {
      c.beginPath();
      c.moveTo(W * x, H * 0.45);
      c.lineTo(W * x, H * (0.12 + (i === 1 ? 0 : i === 3 ? 0.08 : 0.03)));
      c.stroke();
    });
    c.beginPath();
    c.moveTo(W * 0.68, H * 0.62);
    c.lineTo(W * 0.85, H * 0.45);
    c.stroke();
    c.restore();
  }, { transparent: true });
  const outlines = [outline(false), outline(true)];
  outlines.forEach((o, i) => {
    o.mesh.rotation.x = -Math.PI / 2;
    o.mesh.position.set(PL[i], 0.943, 0.12);
    g.add(o.mesh);
  });
  const labelL = sign(() => t(L('Koppar', 'Copper')), 0.2, 0.045);
  labelL.mesh.position.set(PL[0], 0.92, 0.36);
  labelL.mesh.rotation.x = -0.6;
  g.add(labelL.mesh);
  const labelR = sign(() => t(METALS[metal].label), 0.2, 0.045);
  labelR.mesh.position.set(PL[1], 0.92, 0.36);
  labelR.mesh.rotation.x = -0.6;
  g.add(labelR.mesh);

  // hands
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0a982, roughness: 0.65 });
  const hands = [handGeometry(false), handGeometry(true)].map((geo, i) => {
    const h = new THREE.Mesh(geo, skin);
    h.position.set(PL[i] + (i === 0 ? 0.01 : -0.01), 1.2, 0.14);
    h.visible = false;
    g.add(h);
    return h;
  });
  // water drops shown when the hands are wet
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 });
  const drops = (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new THREE.SphereGeometry(0.006 + Math.random() * 0.006, 8, 6);
      d.scale(1, 0.45, 1);
      d.translate(PL[i % 2] + (Math.random() - 0.5) * 0.24, 0.944, 0.12 + (Math.random() - 0.5) * 0.2);
      parts.push(d);
    }
    return new THREE.Mesh(mergeGeometries(parts, false)!, dropMat);
  })();
  g.add(drops);
  drops.visible = false;
  // a water bowl and towel as props
  put(g, new THREE.CylinderGeometry(0.1, 0.07, 0.06, 24, 1, true), m.cream, 0.82, 0.93, 0.1);
  put(g, new THREE.CircleGeometry(0.095, 24), new THREE.MeshStandardMaterial({ color: 0x6fb4d8, roughness: 0.05, metalness: 0.2 }), 0.82, 0.95, 0.1, -Math.PI / 2);
  put(g, rbox(0.22, 0.03, 0.14, 0.012), new THREE.MeshStandardMaterial({ color: 0xc94f4f, roughness: 0.95 }), -0.82, 0.915, 0.15, 0, 0.2, 0);

  // meter
  const meter = new AnalogMeter(g, {
    min: 0, max: FULL, ticks: [0, 10, 20, 30, 40, 50], unit: 'µA',
    title: () => t(L('Mikroamperemeter', 'Microammeter')), size: 0.52, freq: 1.4, damping: 0.6,
  });
  meter.group.position.set(0, 1.32, -0.22);
  meter.group.rotation.x = -0.1;
  put(g, rbox(0.1, 0.36, 0.08, 0.02), m.darkWood, 0, 1.06, -0.26);
  const wL = new Wire(g, [[PL[0] - 0.13, 0.94, 0.0], [-0.45, 0.93, -0.2], [-0.15, 1.1, -0.24]], m.rubberRed, { beads: 12 });
  const wR = new Wire(g, [[PL[1] + 0.13, 0.94, 0.0], [0.45, 0.93, -0.2], [0.15, 1.1, -0.24]], m.rubberBlack, { beads: 12 });

  const hint = canvasPlane(0.6, 0.08, 512, 68, (c, W, H) => {
    c.fillStyle = '#f6e7c8';
    c.font = `700 34px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t(L('Lägg en hand på varje platta!', 'Put one hand on each plate!')), W / 2, H / 2);
  }, { transparent: true });
  hint.mesh.rotation.x = -Math.PI / 2;
  hint.mesh.position.set(0, 0.932, 0.3);
  g.add(hint.mesh);

  // ------------------------------------------------------------ interaction
  let hud: null | { cur: Readout; emf: Readout; res: Readout; l: HTMLInputElement; r: HTMLInputElement; setWet: (i: number) => void; setMetal: (i: number) => void } = null;
  const setHand = (i: number, on: boolean) => {
    if (i === 0) left = on; else right = on;
    ctx.sfx.tone(on ? 240 : 180, 0.08, { type: 'sine', gain: 0.08 });
    if (hud) (i === 0 ? hud.l : hud.r).checked = on;
  };
  [leftPlate, rightPlate].forEach((plate, i) => {
    ctx.interaction.add(plate, {
      label: L('Lägg handen här (klicka igen för att lyfta)', 'Put your hand here (click again to lift)'),
      onClick: () => setHand(i, !(i === 0 ? left : right)),
    });
  });
  ctx.interaction.add(hands[0], { label: L('Lyft handen', 'Lift your hand'), onClick: () => setHand(0, false) });
  ctx.interaction.add(hands[1], { label: L('Lyft handen', 'Lift your hand'), onClick: () => setHand(1, false) });

  const setWet = (v: boolean) => {
    wet = v;
    skin.roughness = v ? 0.18 : 0.65;
    drops.visible = v;
    hud?.setWet(v ? 1 : 0);
    if (v) ctx.sfx.noise(0.3, { freq: 900, gain: 0.08 });
  };
  const setMetal = (i: number) => {
    metal = i;
    rightMat.copy(m[METALS[i].key]);
    labelR.redraw();
    hud?.setMetal(i);
  };

  const controls = (panel: ControlPanel) => {
    panel.heading(L('Händerna', 'Your hands'));
    const l = panel.toggle(L('Vänster hand på kopparn', 'Left hand on the copper'), left, (v) => setHand(0, v));
    const r = panel.toggle(L('Höger hand på den andra plattan', 'Right hand on the other plate'), right, (v) => setHand(1, v));
    const sw = panel.buttons([
      { label: L('Torra händer', 'Dry hands'), icon: '✋', onClick: () => setWet(false) },
      { label: L('Fuktiga händer', 'Wet hands'), icon: '💧', onClick: () => setWet(true) },
    ], wet ? 1 : 0);
    panel.heading(L('Högra plattan', 'Right plate'));
    const sm = panel.buttons(METALS.map((mt, i) => ({ label: mt.label, onClick: () => setMetal(i) })), metal);
    const cur = panel.readout(L('Ström genom dig', 'Current through you'));
    const emf = panel.readout(L('Metallparets spänning', 'Voltage of the metal pair'));
    const res = panel.readout(L('Resistans hand till hand', 'Resistance hand to hand'));
    panel.note(L('Strömmen är bara några miljondels ampere – helt ofarlig och omöjlig att känna.', 'The current is only a few millionths of an ampere: completely harmless and impossible to feel.'));
    hud = { cur, emf, res, l, r, setWet: sw, setMetal: sm };
    return () => { hud = null; };
  };

  ctx.addStation({
    id: 'electricity-human',
    title: L('Människobatteriet', 'The human battery'),
    position: [6.5, 2.5],
    viewpoint: st.view([0.1, 1.7, 1.95], [0.1, 1.05, 0]),
    intro: L('Visste du att du kan bli en del av ett batteri? Lägg händerna på metallplattorna och se nålen röra sig!', 'Did you know you can become part of a battery? Put your hands on the metal plates and watch the needle move!'),
    howTo: L('Klicka på båda plattorna för att lägga dina händer där. Prova torra och fuktiga händer, och byt metall på den högra plattan.', 'Click both plates to put your hands on them. Try dry and wet hands, and change the metal of the right plate.'),
    science: L(
      'Två olika metaller och en saltlösning bildar ett batteri. Här är saltlösningen svetten på din hud: aluminiumet lämnar ifrån sig elektroner (oxideras) och kopparn tar emot dem, så en ström på några mikroampere går genom mätaren och genom din kropp. Aluminium borde i teorin ge över 1,6 V mot koppar, men ett tunt oxidskikt sänker det till ungefär 0,6 V. Med fuktiga händer sjunker hudens resistans från cirka 200 kΩ till 15 kΩ, så strömmen blir mer än tio gånger större. Det är metallerna som är batteriet, inte din kropp – med koppar på båda sidor blir det nästan noll.',
      'Two different metals and a salty solution make a battery. Here the salty solution is the sweat on your skin: the aluminium gives away electrons (it is oxidised) and the copper takes them, so a current of a few microamperes flows through the meter and through your body. In theory aluminium should give over 1.6 V against copper, but a thin oxide layer lowers it to about 0.6 V. With wet hands your skin’s resistance drops from about 200 kΩ to 15 kΩ, so the current becomes more than ten times larger. The metals are the battery, not your body: with copper on both sides the reading is almost zero.',
    ),
    wow: L('Har du någon gång bitit i aluminiumfolie med en tandlagning av metall och känt ett litet "stick"? Det är samma batteri – med saliven som elektrolyt.', 'Ever bitten on aluminium foil with a metal filling and felt a little zing? That is the same battery, with saliva as the electrolyte.'),
    controls,
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
  });

  const hudTick = new Every(0.1);
  function update(dt: number, time: number) {
    // hands drift down onto the plates or lift away
    hands.forEach((h, i) => {
      const on = i === 0 ? left : right;
      const ty = on ? 0.955 : 1.2;
      h.position.y += (ty - h.position.y) * ease(dt, 0.12);
      h.visible = h.position.y < 1.18;
    });
    if (!focused && !st.near(8)) return;
    both = left && right;
    hold = both ? hold + dt : Math.max(0, hold - dt * 0.5);
    const mt = METALS[metal];
    const R = (wet ? R_WET : R_DRY) + R_METER;
    const emfEff = both ? mt.emf * (0.75 + 0.25 * Math.exp(-hold / 8)) : 0;
    // a small tremble: contact pressure is never perfectly steady
    const tremble = both ? 1 + 0.03 * Math.sin(time * 5.3) + 0.02 * Math.sin(time * 13.1) : 1;
    current = (emfEff / R) * 1e6 * tremble;
    meter.set(current);
    meter.update(dt);
    const lvl = clamp(current / FULL, 0, 1);
    wL.set(lvl, -1);
    wR.set(lvl, 1);
    wL.update(dt);
    wR.update(dt);
    outlines.forEach((o, i) => { o.mesh.visible = !(i === 0 ? left : right); });

    if (both && current > 1) {
      cheers.say('hum-first', L('Nålen rör sig! Du är just nu en del av ett batteri.', 'The needle moves! Right now you are part of a battery.'), { celebrate: true });
    }
    if (both && wet && current > 15) {
      cheers.say('hum-wet', L('Med fuktiga händer leder huden mycket bättre – svetten och vattnet är elektrolyten.', 'With wet hands your skin conducts much better: sweat and water are the electrolyte.'), { expression: 'idea' });
    }
    if (both && metal === 2) {
      cheers.say('hum-cu', L('Nästan noll! Koppar mot koppar ger ingen spänning. Det är metallerna, inte du, som gör strömmen.', 'Almost zero! Copper against copper gives no voltage. The metals make the current, not you.'), { expression: 'wink' });
    }

    if (hud && hudTick.tick(dt)) {
      hud.cur.set(`${fmt(current, 1)} µA`);
      hud.emf.set(`${fmt(mt.emf, 2)} V`);
      hud.res.set(`${fmt((wet ? R_WET : R_DRY) / 1000, 0)} kΩ`);
    }
  }

  return { update };
}
