/**
 * Station 4: the lemon battery (and a Volta pile on display).
 * Each lemon is a cell with EMF E and internal resistance r (Zn/Cu: 0,90 V, 0,9 kΩ, from the research doc).
 * n lemons in series: E·n and r·n. The red LED follows the diode law I = I_s·exp(V/(n·V_T)),
 * calibrated to 1,75 V at 1 mA and 2,0 V at 20 mA; the loaded point solves n·E − I·n·r = V_LED(I).
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import {
  Cheers, Every, Lcd, StationFrame, Wire, clamp, ease, fmt, halo, mats, put, rbox, sign, workbench,
} from './shared';

interface Pair {
  label: L10n;
  minus: keyof ReturnType<typeof mats>;
  plus: keyof ReturnType<typeof mats>;
  emf: number; // V per lemon, open circuit
  r: number; // Ω per lemon
}
const PAIRS: Pair[] = [
  { label: L('Zink + koppar', 'Zinc + copper'), minus: 'zinc', plus: 'copper', emf: 0.9, r: 900 },
  { label: L('Koppar + koppar', 'Copper + copper'), minus: 'copper', plus: 'copper', emf: 0.002, r: 900 },
  { label: L('Zink + zink', 'Zinc + zinc'), minus: 'zinc', plus: 'zinc', emf: 0.003, r: 900 },
  { label: L('Magnesium + koppar', 'Magnesium + copper'), minus: 'magnesium', plus: 'copper', emf: 1.55, r: 700 },
];
const LED_NVT = 0.0834; // V
const LED_IS = 1e-3 * Math.exp(-1.75 / LED_NVT); // A
const LED_VISIBLE = 0.2e-3; // A, a red LED starts to be visible in a lit room
const SLOTS = 4;

export function buildLemon(ctx: RoomContext, cheers: Cheers) {
  const m = mats();
  const st = new StationFrame(ctx, -6.5, 2.5, Math.PI / 2);
  const g = st.group;
  workbench(g, 2.4, 0.95);
  st.collider(2.55, 1.1);

  let count = 2;
  let pair = 0;
  let closed = true;
  let focused = false;
  const res = { V: 0, I: 0, E: 0 };

  // ------------------------------------------------------------ lemons
  const lemonMat = new THREE.MeshStandardMaterial({ color: 0xf2cf32, roughness: 0.62, emissive: 0x3a2a00, emissiveIntensity: 0.15 });
  const lemonGeo = (() => {
    const geo = new THREE.SphereGeometry(0.07, 28, 20);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = Math.abs(x) / 0.07;
      // stretch along x and add the two pointed nubs of a lemon
      p.setX(i, x * 1.35 + Math.sign(x) * 0.018 * Math.pow(k, 10));
    }
    geo.computeVertexNormals();
    return geo;
  })();
  const SX = (k: number) => -0.95 + k * 0.36;
  const LY = 0.9 + 0.075;
  const LZ = 0.12;
  const lemons: THREE.Group[] = [];
  const minusMat = m.zinc.clone();
  const plusMat = m.copper.clone();
  const stripGeo = rbox(0.016, 0.1, 0.032, 0.004);
  for (let k = 0; k < SLOTS; k++) {
    put(g, new THREE.CylinderGeometry(0.1, 0.085, 0.02, 28), m.cream, SX(k), 0.91, LZ);
    const lg = new THREE.Group();
    lg.position.set(SX(k), LY, LZ);
    lg.userData.dynamic = true;
    const lemon = new THREE.Mesh(lemonGeo, lemonMat);
    lemon.rotation.z = 0.08 * (k % 2 ? 1 : -1);
    lg.add(lemon);
    const sm = new THREE.Mesh(stripGeo, minusMat);
    sm.position.set(-0.035, 0.07, 0);
    lg.add(sm);
    const sp = new THREE.Mesh(stripGeo, plusMat);
    sp.position.set(0.035, 0.07, 0);
    lg.add(sp);
    g.add(lg);
    lemons.push(lg);
  }
  const slotHits = lemons.map((_, k) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(SX(k), LY + 0.03, LZ);
    g.add(hit);
    return hit;
  });
  // A bowl of spare lemons
  put(g, new THREE.SphereGeometry(0.14, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.darkWood, -0.98, 1.04, -0.25);
  put(g, new THREE.CircleGeometry(0.135, 24), m.darkWood, -0.98, 1.0, -0.25, -Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    put(g, lemonGeo, lemonMat, -0.98 + Math.cos(a) * 0.06, 1.03, -0.25 + Math.sin(a) * 0.05, 0, a, 0.2);
  }

  // jumpers: + of lemon k to − of lemon k+1 (electrons flow from the zinc of k+1 to the copper of k)
  const top = LY + 0.115;
  const jumpers = [0, 1, 2].map((k) => new Wire(g, [
    [SX(k) + 0.035, top, LZ], [SX(k) + 0.18, top + 0.07, LZ + 0.02], [SX(k + 1) - 0.035, top, LZ],
  ], m.rubberRed, { dynamic: true, beads: 6 }));
  // output leads: − from the first lemon, + from the last active one
  const MM = new THREE.Vector3(0.6, 0.9, -0.2); // multimeter
  const LED = new THREE.Vector3(0.62, 0.9, 0.22);
  const minusLead = new Wire(g, [[SX(0) - 0.035, top, LZ], [SX(0) - 0.05, 0.93, LZ + 0.25], [0.2, 0.92, 0.38], [LED.x - 0.06, 0.95, LED.z]], m.rubberBlack, { beads: 14 });
  const plusLeads = [0, 1, 2, 3].map((k) => new Wire(g, [
    [SX(k) + 0.035, top, LZ], [SX(k) + 0.1, 0.95, LZ - 0.2], [0.3, 0.92, -0.05], [LED.x + 0.18, 0.95, LED.z - 0.02],
  ], m.rubberRed, { dynamic: true, beads: 14 }));
  new Wire(g, [[LED.x - 0.06, 0.95, LED.z - 0.03], [MM.x - 0.05, 0.92, MM.z + 0.15], [MM.x - 0.03, 0.97, MM.z + 0.04]], m.rubberBlack);
  new Wire(g, [[LED.x + 0.18, 0.95, LED.z - 0.05], [MM.x + 0.08, 0.92, MM.z + 0.15], [MM.x + 0.03, 0.97, MM.z + 0.04]], m.rubberRed);

  // ------------------------------------------------------------ multimeter
  const mm = new THREE.Group();
  mm.position.copy(MM);
  mm.rotation.x = -0.35;
  g.add(mm);
  put(mm, rbox(0.2, 0.3, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0xf2b630, roughness: 0.55 }), 0, 0.17, 0);
  put(mm, rbox(0.17, 0.24, 0.01, 0.01), m.blackMetal, 0, 0.17, 0.026);
  const lcd = new Lcd(0.15, 0.07);
  lcd.plane.mesh.position.set(0, 0.24, 0.032);
  mm.add(lcd.plane.mesh);
  put(mm, new THREE.CylinderGeometry(0.035, 0.035, 0.015, 24), m.blackMetal, 0, 0.13, 0.035, Math.PI / 2);
  put(mm, rbox(0.006, 0.03, 0.004, 0.002), m.cream, 0, 0.145, 0.044);
  for (const sx of [-1, 1]) put(mm, new THREE.CylinderGeometry(0.01, 0.01, 0.012, 12), sx < 0 ? m.rubberBlack : m.rubberRed, sx * 0.05, 0.06, 0.03, Math.PI / 2);

  // ------------------------------------------------------------ red LED on a small board, with a knife switch
  put(g, rbox(0.3, 0.025, 0.16, 0.01), m.cream, LED.x + 0.06, 0.912, LED.z);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.25, transparent: true, opacity: 0.85, emissive: 0xff2a1a, emissiveIntensity: 0 });
  put(g, new THREE.CylinderGeometry(0.025, 0.025, 0.045, 20), ledMat, LED.x, 0.95, LED.z, 0, 0, 0, false);
  put(g, new THREE.SphereGeometry(0.025, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), ledMat, LED.x, 0.972, LED.z, 0, 0, 0, false);
  put(g, new THREE.CylinderGeometry(0.029, 0.029, 0.006, 20), ledMat, LED.x, 0.93, LED.z, 0, 0, 0, false);
  const ledHalo = halo(0xff3020, 0.35);
  ledHalo.position.set(LED.x, 0.97, LED.z);
  g.add(ledHalo);
  const ledSign = sign(() => t(L('Röd LED · 1,8 V', 'Red LED · 1.8 V')), 0.2, 0.045);
  ledSign.mesh.position.set(LED.x, 0.93, LED.z + 0.1);
  ledSign.mesh.rotation.x = -0.6;
  g.add(ledSign.mesh);
  // knife switch
  const KS = new THREE.Vector3(LED.x + 0.15, 0.925, LED.z);
  put(g, rbox(0.08, 0.012, 0.05, 0.004), m.darkWood, KS.x, KS.y + 0.006, KS.z);
  put(g, rbox(0.012, 0.03, 0.02, 0.003), m.brass, KS.x - 0.03, KS.y + 0.025, KS.z);
  put(g, rbox(0.012, 0.03, 0.02, 0.003), m.brass, KS.x + 0.03, KS.y + 0.025, KS.z);
  const blade = new THREE.Group();
  blade.position.set(KS.x - 0.03, KS.y + 0.035, KS.z);
  g.add(blade);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.3, metalness: 0.9, emissive: new THREE.Color(ctx.accent), emissiveIntensity: 0.1 });
  const bladeMesh = new THREE.Mesh(rbox(0.07, 0.006, 0.012, 0.002), bladeMat);
  bladeMesh.position.x = 0.035;
  blade.add(bladeMesh);
  const knobM = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 10), m.rubberBlack);
  knobM.position.set(0.075, 0.015, 0);
  blade.add(knobM);
  const bladeHit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), new THREE.MeshBasicMaterial({ visible: false }));
  bladeHit.position.set(0.04, 0.02, 0);
  blade.add(bladeHit);

  // ------------------------------------------------------------ Volta pile on display
  {
    const VP = new THREE.Vector3(1.0, 0.9, -0.22);
    const vp = new THREE.Group();
    vp.position.copy(VP);
    g.add(vp);
    put(vp, new THREE.CylinderGeometry(0.08, 0.09, 0.03, 24), m.darkWood, 0, 0.015, 0);
    const disc = new THREE.CylinderGeometry(0.04, 0.04, 0.008, 20);
    const card = new THREE.CylinderGeometry(0.038, 0.038, 0.006, 20);
    const brine = new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.9 });
    let y = 0.035;
    for (let i = 0; i < 12; i++) {
      put(vp, disc, m.zinc, 0, y, 0); y += 0.008;
      put(vp, card, brine, 0, y, 0); y += 0.006;
      put(vp, disc, m.copper, 0, y, 0); y += 0.009;
    }
    for (const a of [0, 2.1, 4.2]) put(vp, new THREE.CylinderGeometry(0.004, 0.004, y + 0.02, 6), m.brass, Math.cos(a) * 0.05, (y + 0.02) / 2, Math.sin(a) * 0.05);
    put(vp, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), m.darkWood, 0, y + 0.02, 0);
    const vs = sign(() => t(L('Voltas stapel, 1800', 'Volta’s pile, 1800')), 0.24, 0.05);
    vs.mesh.position.set(0, 0.03, 0.11);
    vs.mesh.rotation.x = -0.5;
    vp.add(vs.mesh);
  }

  // ------------------------------------------------------------ physics
  const solve = () => {
    const p = PAIRS[pair];
    const E = p.emf * count;
    const r = p.r * count;
    res.E = E;
    if (!closed) {
      res.I = 0;
      res.V = E * (10e6 / (10e6 + r)); // 10 MΩ voltmeter
      return;
    }
    // bisection on I in [0, E/r]: f(I) = E − I·r − V_LED(I), decreasing in I
    let lo = 0, hi = Math.max(E / r, 1e-12);
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const vLed = mid > 0 ? LED_NVT * Math.log(mid / LED_IS + 1) : 0;
      if (E - mid * r - vLed > 0) lo = mid; else hi = mid;
    }
    res.I = (lo + hi) / 2;
    res.V = E - res.I * r;
  };

  const applyVisuals = () => {
    lemons.forEach((lg, k) => { lg.visible = k < count; });
    jumpers.forEach((w, k) => w.setVisible(k < count - 1));
    plusLeads.forEach((w, k) => w.setVisible(k === count - 1));
    const p = PAIRS[pair];
    minusMat.copy(m[p.minus] as THREE.MeshStandardMaterial);
    plusMat.copy(m[p.plus] as THREE.MeshStandardMaterial);
    blade.rotation.z = closed ? 0 : 1.0;
  };

  // ------------------------------------------------------------ interaction
  let hud: null | { setCount: (i: number) => void; setPair: (i: number) => void; volt: Readout; cur: Readout; power: Readout; led: Meter; closedEl: HTMLInputElement } = null;
  const setCount = (n: number) => {
    count = clamp(n, 1, SLOTS);
    applyVisuals();
    hud?.setCount(count - 1);
    ctx.sfx.pop();
  };
  const setPair = (i: number) => {
    pair = i;
    applyVisuals();
    hud?.setPair(i);
    if (i === 1 || i === 2) {
      cheers.say('lem-same', L(
        'Noll volt! Med samma metall på båda sidor finns ingen skillnad som driver elektronerna. Det är metallerna som gör jobbet.',
        'Zero volts! With the same metal on both sides there is no difference to push the electrons. The metals do the work.',
      ), { expression: 'thinking' });
    }
  };
  const toggleSwitch = () => {
    closed = !closed;
    applyVisuals();
    if (hud) hud.closedEl.checked = closed;
    ctx.sfx.tone(closed ? 500 : 300, 0.05, { type: 'square', gain: 0.05 });
  };
  slotHits.forEach((h, k) => ctx.interaction.add(h, {
    label: L('Lägg till eller ta bort citron', 'Add or remove a lemon'),
    onClick: () => setCount(count === k + 1 ? k : k + 1),
  }));
  ctx.interaction.add(blade, {
    label: L('Slå till / från LED:en', 'Switch the LED on / off'),
    onHover: (on) => { bladeMat.emissiveIntensity = on ? 0.6 : 0.1; },
    onClick: toggleSwitch,
  });

  const controls = (panel: ControlPanel) => {
    panel.heading(L('Antal citroner i serie', 'Lemons in series'));
    const sc = panel.buttons([1, 2, 3, 4].map((n) => ({ label: L(`${n} st`, `${n}`), icon: '🍋', onClick: () => setCount(n) })), count - 1);
    panel.heading(L('Elektroder (minus + plus)', 'Electrodes (minus + plus)'));
    const sp = panel.buttons(PAIRS.map((p, i) => ({ label: p.label, onClick: () => setPair(i) })), pair);
    const closedEl = panel.toggle(L('Koppla in LED:en', 'Connect the LED'), closed, () => toggleSwitch());
    const volt = panel.readout(L('Voltmetern visar', 'The voltmeter reads'));
    const cur = panel.readout(L('Ström genom LED:en', 'Current through the LED'));
    const power = panel.readout(L('Effekt', 'Power'));
    const led = panel.meter(L('LED-ljus', 'LED light'), '#ff5a4a');
    panel.note(L(
      'Minuspolen: Zn → Zn²⁺ + 2e⁻ (zinken löses upp). Pluspolen: 2H⁺ + 2e⁻ → H₂ (vätgas på kopparn).',
      'Minus pole: Zn → Zn²⁺ + 2e⁻ (the zinc dissolves). Plus pole: 2H⁺ + 2e⁻ → H₂ (hydrogen on the copper).',
    ));
    hud = { setCount: sc, setPair: sp, volt, cur, power, led, closedEl };
    return () => { hud = null; };
  };

  ctx.addStation({
    id: 'electricity-lemon',
    title: L('Citronbatteriet', 'The lemon battery'),
    position: [-6.5, 2.5],
    viewpoint: st.view([0.15, 1.65, 2.05], [0.15, 1.0, 0]),
    intro: L(
      'Kan citroner tända en lampa? Bygg ett batteri av frukt och ta reda på hur många som behövs!',
      'Can lemons light a lamp? Build a battery from fruit and find out how many it takes!',
    ),
    howTo: L(
      'Klicka på faten för att lägga till eller ta bort citroner. Byt elektroder i panelen och slå till kniven för att koppla in LED:en.',
      'Click the plates to add or remove lemons. Change electrodes in the panel and close the knife switch to connect the LED.',
    ),
    science: L(
      'Zinken i citronen oxideras: Zn → Zn²⁺ + 2e⁻. Elektronerna går genom tråden till kopparn, där vätejoner från citronsyran tar emot dem: 2H⁺ + 2e⁻ → H₂. Energin kommer alltså från zinken som långsamt förbrukas – inte från citronen, vars saft bara är elektrolyten som låter joner vandra. I teorin ger zink och koppar 1,10 V, en riktig citron ungefär 0,9 V. Men citronens inre resistans är cirka 1 kΩ, så strömmen blir under en milliampere, och spänningen sjunker när LED:en kopplas in. En röd LED behöver cirka 1,8 V och lite ström, så det krävs 3–4 citroner i serie.',
      'The zinc in the lemon is oxidised: Zn → Zn²⁺ + 2e⁻. The electrons travel through the wire to the copper, where hydrogen ions from the citric acid take them: 2H⁺ + 2e⁻ → H₂. So the energy comes from the zinc, which is slowly used up, not from the lemon, whose juice is only the electrolyte that lets ions move. In theory zinc and copper give 1.10 V, a real lemon about 0.9 V. But the lemon’s internal resistance is about 1 kΩ, so the current stays below a milliampere and the voltage drops when the LED is connected. A red LED needs about 1.8 V and a little current, so it takes 3–4 lemons in series.',
    ),
    wow: L(
      'En citron ger ungefär 1 milliwatt. För att ladda en mobil (cirka 15 Wh) skulle du behöva över 20 000 citroner – eller vänta i två år med en.',
      'One lemon gives about 1 milliwatt. To charge a phone (about 15 Wh) you would need over 20,000 lemons, or wait two years with one.',
    ),
    controls,
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
  });

  applyVisuals();

  const hudTick = new Every(0.1);
  let ledB = 0;
  let lastCount = count;
  function update(dt: number, time: number) {
    // gentle idle: the active lemons breathe a tiny bit (they are on a soft cloth)
    if (!focused && !st.near(8)) return;
    solve();
    const target = clamp((res.I - LED_VISIBLE) / 1.5e-3, 0, 1);
    ledB += (Math.pow(target, 0.6) - ledB) * ease(dt, 0.05);
    ledMat.emissiveIntensity = ledB * 3.2;
    ledHalo.material.opacity = ledB;
    const lvl = clamp(res.I / 1e-3, 0, 1);
    jumpers.forEach((w) => { w.set(lvl, -1); w.update(dt); });
    minusLead.set(lvl, 1);
    minusLead.update(dt);
    plusLeads.forEach((w) => { w.set(lvl, -1); w.update(dt); });
    lcd.set(`${fmt(res.V, 2)} V`, closed ? t(L('DC · med LED', 'DC · with LED')) : t(L('DC · utan last', 'DC · no load')));
    lemons.forEach((lg, k) => { lg.position.y = LY + Math.sin(time * 1.3 + k) * 0.001; });

    if (ledB > 0.15) {
      cheers.say('lem-led', L(
        `Den lyser! ${count} citroner i serie ger ${fmt(res.E, 1)} V utan last – nog för LED:ens 1,8 V.`,
        `It glows! ${count} lemons in series give ${fmt(res.E, 1)} V with no load, enough for the LED’s 1.8 V.`,
      ), { celebrate: true });
    }
    if (pair === 3 && ledB > 0.3 && count <= 2) {
      cheers.say('lem-mg', L(
        'Magnesium är ännu ivrigare än zink att lämna ifrån sig elektroner – därför räcker färre citroner!',
        'Magnesium is even keener than zinc to give away electrons, so fewer lemons are enough!',
      ), { expression: 'idea' });
    }
    if (count !== lastCount && closed && pair === 0 && count === 2 && ledB < 0.05) {
      cheers.say('lem-two', L(
        'Två citroner ger 1,8 V utan last, men med LED:en inkopplad sjunker spänningen. Prova en till!',
        'Two lemons give 1.8 V with no load, but with the LED connected the voltage drops. Try one more!',
      ), { expression: 'thinking' });
    }
    lastCount = count;

    if (hud && hudTick.tick(dt)) {
      hud.volt.set(`${fmt(res.V, 2)} V ${closed ? t(L('(med last)', '(loaded)')) : t(L('(utan last)', '(no load)'))}`);
      hud.cur.set(`${fmt(res.I * 1000, 2)} mA`);
      hud.power.set(`${fmt(res.I * res.V * 1000, 2)} mW`);
      hud.led.set(ledB, ledB > 0.01 ? `${fmt(ledB * 100, 0)} %` : t(L('släckt', 'off')));
    }
  }

  return { update };
}
