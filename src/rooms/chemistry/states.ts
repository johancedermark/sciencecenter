/** Station 3: states of matter. A glass box of 256 Lennard-Jones "argon atoms" with a thermostat and a heating curve. */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import { clamp, fmt, type Kit, type StationRuntime } from './common';
import { ARGON_EPS_K, LJBox } from './lj';

type Phase = 'solid' | 'liquid' | 'boiling' | 'gas';
const PHASE_NAME = {
  solid: L('Fast (kristall)', 'Solid (crystal)'),
  liquid: L('Flytande', 'Liquid'),
  boiling: L('Vätska som förångas', 'Liquid evaporating'),
  gas: L('Gas', 'Gas'),
};
const PHASE_COLOR: Record<Phase, string> = { solid: '#7fb6ff', liquid: '#4fe0c0', boiling: '#ffd36a', gas: '#ff8a5a' };

const T_MIN_K = 20, T_MAX_K = 320;
const SIM_RATE = 2.2; // reduced time units per real second (thermostat mode)
const SIM_RATE_HEAT = 3.2; // faster while heating so a full curve takes ~40 s
const HEAT_POWER = 0.075; // ε per particle per τ
const S = 0.055; // metres per σ

interface Sample { q: number; T: number; pe: number; phase: Phase }

export function buildStates(kit: Kit): StationRuntime {
  const { ctx, mats } = kit;
  const BX = 9.45, BZ = 0.6;
  const top = 0.9;
  kit.bench(BX, BZ, 3.6, 1.0, -Math.PI / 2);
  ctx.addCollider(BX, BZ, 1.05, 3.65);

  const sim = new LJBox(4, [13, 16, 13]);
  ctx.group.userData.ljSim = sim; // handy for poking at the simulation from the dev console
  const [Lx, Ly, Lz] = sim.L;
  const CX = 9.42, CZ = 0.75, BASE = top + 0.06;
  const W = Lz * S, H = Ly * S, D = Lx * S;

  let phase: Phase = 'solid';
  const samples: Sample[] = [];
  let mode: 'thermostat' | 'heat' = 'thermostat';
  // heater plate (glows from icy blue to red-hot)
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.4, metalness: 0.6, emissive: 0x000000 });
  kit.box(D + 0.08, 0.06, W + 0.08, plateMat, CX, top, CZ);
  // glass box with brass corner posts
  const glassBox = new THREE.Mesh(new THREE.BoxGeometry(D, H, W), kit.mats.glass);
  glassBox.position.set(CX, BASE + H / 2, CZ);
  ctx.group.add(glassBox);
  const postGeo = new THREE.CylinderGeometry(0.009, 0.009, H, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, mats.brass);
    p.position.set(CX + (sx * D) / 2, BASE + H / 2, CZ + (sz * W) / 2);
    ctx.group.add(p);
  }
  kit.box(D + 0.04, 0.025, W + 0.04, mats.brass, CX, BASE + H, CZ);
  ctx.group.children.filter((o) => (o as THREE.Mesh).geometry === postGeo).forEach((o) => kit.staticize(o as THREE.Mesh));

  // the atoms
  const atomMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
  const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5 * S, 12, 8), atomMat, sim.n);
  atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ctx.group.add(atoms);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  const cold = new THREE.Color(0x4f8cff), warm = new THREE.Color(0x4fe0b0), hot = new THREE.Color(0xff7a3a);
  for (let i = 0; i < sim.n; i++) atoms.setColorAt(i, cold);

  // thermometer column
  const thermoGlass = new THREE.Mesh(kit.geos.cyl, mats.glassRim);
  thermoGlass.scale.set(0.018, 0.8, 0.018);
  thermoGlass.position.set(CX - 0.2, top + 0.45, CZ + W / 2 + 0.12);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xd8342a });
  const thermoBulb = new THREE.Mesh(kit.geos.sphere, bulbMat);
  thermoBulb.scale.setScalar(0.03);
  thermoBulb.position.set(CX - 0.2, top + 0.05, CZ + W / 2 + 0.12);
  const thermoLiq = new THREE.Mesh(kit.geos.cyl, bulbMat);
  thermoLiq.scale.set(0.009, 0.05, 0.009);
  thermoLiq.position.set(CX - 0.2, top + 0.1, CZ + W / 2 + 0.12);
  ctx.group.add(thermoGlass, thermoBulb, thermoLiq);
  kit.staticize(thermoGlass, thermoBulb);
  kit.box(0.08, 0.04, 0.08, mats.darkWood, CX - 0.2, top, CZ + W / 2 + 0.12);

  // control box with a big brass dial
  const KX = 9.2, KZ = CZ - W / 2 - 0.28;
  kit.box(0.3, 0.28, 0.32, mats.cabinet, KX, top, KZ);
  const dial = new THREE.Group();
  const dialDisk = new THREE.Mesh(kit.geos.cyl, mats.brass);
  dialDisk.scale.set(0.085, 0.04, 0.085);
  dialDisk.rotation.z = Math.PI / 2;
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.014), kit.mats.accentGlow);
  notch.position.set(-0.022, 0.045, 0);
  dial.add(dialDisk, notch);
  dial.position.set(KX - 0.17, top + 0.15, KZ);
  ctx.group.add(dial);
  const readout = kit.canvasPlane(0.26, 0.09, 384, (g, Wc, Hc) => {
    g.fillStyle = '#0c1418';
    g.fillRect(0, 0, Wc, Hc);
    const K = sim.temperature() * ARGON_EPS_K;
    g.fillStyle = PHASE_COLOR[phase];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(Hc * 0.42)}px ui-monospace, Menlo, monospace`;
    g.fillText(`${fmt(K, 0)} K`, Wc / 2, Hc * 0.36);
    g.font = `600 ${Math.round(Hc * 0.24)}px system-ui, sans-serif`;
    g.fillText(t(PHASE_NAME[phase]), Wc / 2, Hc * 0.78);
  });
  readout.mesh.position.set(KX - 0.165, top + 0.34, KZ);
  readout.mesh.rotation.y = -Math.PI / 2;
  kit.box(0.02, 0.12, 0.28, mats.blackTop, KX - 0.15, top + 0.28, KZ);
  ctx.group.add(readout.mesh);

  // heating-curve board on the wall
  const board = kit.canvasPlane(1.7, 0.95, 768, (g, Wc, Hc) => drawCurve(g, Wc, Hc, true));
  board.mesh.position.set(9.96, 2.35, BZ);
  board.mesh.rotation.y = -Math.PI / 2;
  kit.box(0.04, 1.03, 1.78, mats.darkWood, 9.99, 2.35 - 0.515, BZ);
  ctx.group.add(board.mesh);
  onLangChange(() => board.redraw());

  // ---------------------------------------------------------------- state
  let targetK = 36;
  sim.targetT = targetK / ARGON_EPS_K;
  let acc = 0;
  let Tema = sim.temperature();
  let lastPhase: Phase = 'solid';
  let sampleAcc = 0;
  let boardTimer = 0;
  let readTimer = 0;
  let focused = false;
  let hud: { draw: () => void; refresh: () => void; slider: HTMLInputElement | null } | null = null;
  let hudTimer = 0;
  let warm0 = 0;
  const seen = new Set<Phase>();

  function classify(): Phase {
    const gf = sim.gasFraction();
    const T = Tema;
    if (gf > 0.6) return 'gas';
    if (T < 0.62) return 'solid';
    if (gf > 0.15) return 'boiling';
    return 'liquid';
  }

  function setTarget(K: number) {
    targetK = clamp(K, T_MIN_K, T_MAX_K);
    sim.targetT = targetK / ARGON_EPS_K;
    if (mode === 'heat') {
      mode = 'thermostat';
      sim.mode = 'thermostat';
    }
    if (hud?.slider) hud.slider.value = String(targetK);
  }

  function startHeating() {
    sim.reset(30 / ARGON_EPS_K);
    sim.mode = 'thermostat';
    sim.targetT = 30 / ARGON_EPS_K;
    mode = 'heat';
    warm0 = 0.6; // settle the crystal briefly before heating
    samples.length = 0;
    Tema = sim.temperature();
    ctx.sfx.tone(300, 0.4, { type: 'sine', gain: 0.06, to: 600 });
    hud?.refresh();
  }

  function freeze() {
    mode = 'thermostat';
    sim.mode = 'thermostat';
    sim.reset(30 / ARGON_EPS_K);
    setTarget(36);
    Tema = sim.temperature();
    samples.length = 0;
    ctx.sfx.tone(900, 0.4, { type: 'sine', gain: 0.05, to: 300 });
    board.redraw();
    hud?.refresh();
  }

  // dial drag: up/right = warmer
  let dialStart = 0;
  ctx.interaction.add(dial, {
    label: L('Vrid på värmen', 'Turn the heat'),
    onDragStart: () => { dialStart = targetK; },
    onDrag: (info) => setTarget(dialStart + (info.totalX - info.totalY) * 0.8),
  });
  ctx.interaction.add(glassBox, {
    label: L('Partikellådan: klicka för att värma jämnt', 'The particle box: click to heat steadily'),
    onClick: startHeating,
  });

  function drawCurve(g: CanvasRenderingContext2D, Wc: number, Hc: number, big: boolean) {
    const k = big ? Wc / 400 : 1;
    const padL = 34 * k, padR = 30 * k, padT = (big ? 26 : 8) * k, padB = 22 * k;
    const pw = Wc - padL - padR, ph = Hc - padT - padB;
    const QMAX = 10, TMAX = 400;
    const X = (q: number) => padL + (q / QMAX) * pw;
    const Y = (T: number) => padT + (1 - T / TMAX) * ph;
    const YP = (pe: number) => padT + (pe / -6) * ph; // potential energy axis: 0 at top, −6 at bottom
    g.fillStyle = big ? '#1e2a26' : '#101418';
    g.fillRect(0, 0, Wc, Hc);
    g.font = `${Math.round(10 * k)}px system-ui, sans-serif`;
    if (big) {
      g.fillStyle = '#f2ead8';
      g.font = `700 ${Math.round(15 * k)}px "Baloo 2", system-ui, sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(t(L('Uppvärmningskurva: argon i lådan', 'Heating curve: argon in the box')), padL, 13 * k);
      g.font = `${Math.round(10 * k)}px system-ui, sans-serif`;
    }
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.lineWidth = 1;
    g.fillStyle = '#c9c2b4';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let T = 0; T <= TMAX; T += 100) {
      g.beginPath();
      g.moveTo(padL, Y(T));
      g.lineTo(Wc - padR, Y(T));
      g.stroke();
      g.fillText(`${T}`, padL - 4 * k, Y(T));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let q = 0; q <= QMAX; q += 2) g.fillText(String(q), X(q), Hc - padB + 4 * k);
    g.textAlign = 'right';
    g.fillText(t(L('tillförd värme, kJ/mol →', 'heat added, kJ/mol →')), Wc - padR, Hc - padB + 4 * k + 10 * k);
    g.save();
    g.translate(10 * k, padT + ph / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t(L('temperatur (K)', 'temperature (K)')), 0, 0);
    g.restore();
    g.save();
    g.translate(Wc - 10 * k, padT + ph / 2);
    g.rotate(Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,200,240,0.75)';
    g.fillText(t(L('- - energi i bindningar', '- - energy in bonds')), 0, 0);
    g.restore();
    if (samples.length < 2) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(12 * k)}px system-ui, sans-serif`;
      g.fillText(t(L('Tryck "Värm jämnt" så ritas kurvan', 'Press "Heat steadily" to draw the curve')), padL + pw / 2, padT + ph / 2);
      return;
    }
    // bond energy (potential energy) dashed
    g.setLineDash([4 * k, 3 * k]);
    g.strokeStyle = 'rgba(255,200,240,0.6)';
    g.lineWidth = 1.5 * k;
    g.beginPath();
    samples.forEach((s, i) => (i ? g.lineTo(X(s.q), YP(s.pe)) : g.moveTo(X(s.q), YP(s.pe))));
    g.stroke();
    g.setLineDash([]);
    // temperature, coloured by phase
    g.lineWidth = 2.5 * k;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      g.strokeStyle = PHASE_COLOR[b.phase];
      g.beginPath();
      g.moveTo(X(a.q), Y(a.T));
      g.lineTo(X(b.q), Y(b.T));
      g.stroke();
    }
    // legend
    const legend: Phase[] = ['solid', 'liquid', 'boiling', 'gas'];
    let lx = padL + 6 * k;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const p of legend) {
      g.fillStyle = PHASE_COLOR[p];
      g.fillRect(lx, padT + 6 * k, 10 * k, 4 * k);
      const name = t(PHASE_NAME[p]);
      g.fillText(name, lx + 13 * k, padT + 8 * k);
      lx += 13 * k + g.measureText(name).width + 10 * k;
    }
  }

  const fmtK = (K: number) => `${fmt(K, 0)} K (${fmt(K - 273.15, 0)} °C)`;

  ctx.addStation({
    id: 'chem-states',
    title: L('Partikellådan: fast, flytande, gas', 'The particle box: solid, liquid, gas'),
    position: [8.4, BZ],
    viewpoint: { position: [6.75, 1.62, 0.55], target: [9.4, 1.45, 0.95] },
    intro: L('I lådan finns 256 argonatomer. Vrid upp värmen och se kristallen smälta och koka bort!',
      'The box holds 256 argon atoms. Turn up the heat and watch the crystal melt and boil away!'),
    howTo: L('Dra i den mässingsfärgade ratten eller reglaget för att ändra temperaturen. Tryck "Värm jämnt" för att rita en uppvärmningskurva.',
      'Drag the brass dial or the slider to change the temperature. Press "Heat steadily" to draw a heating curve.'),
    science: L(
      'Temperatur är hur snabbt atomerna rör sig i genomsnitt. I fast form sitter de i ett gitter och vibrerar, i vätska glider de förbi varandra men håller ihop, och i gas flyger de fritt. Datorn räknar ut krafterna mellan atomerna med Lennard-Jones-potentialen (som argon: ε/k = 120 K, σ = 0,34 nm). När du värmer jämnt planar temperaturen ut vid smältning och kokning: energin går åt till att bryta bindningar (den streckade linjen) i stället för att öka farten. Is behöver 334 J per gram bara för att smälta, och temperaturen står still på 0 °C under tiden. Atomerna blir inte större när det blir varmt, de får bara större avstånd. Förenklingar: bara 256 atomer i en sluten låda (så platån blir lite utsmetad) och en svag konstgjord tyngdkraft som håller vätskan i botten.',
      'Temperature is how fast the atoms move on average. In a solid they sit in a lattice and vibrate, in a liquid they slide past each other but stick together, and in a gas they fly freely. The computer works out the forces between atoms with the Lennard-Jones potential (like argon: ε/k = 120 K, σ = 0.34 nm). When you heat steadily the temperature levels off during melting and boiling: the energy goes into breaking bonds (the dashed line) instead of speeding the atoms up. Ice needs 334 J per gram just to melt, and the temperature stays at 0 °C the whole time. Atoms don\'t get bigger when they get hot, they just move further apart. Simplifications: only 256 atoms in a closed box (so the plateau is a bit smeared) and a weak artificial gravity that keeps the liquid at the bottom.'),
    wow: L('Riktig argon smälter vid 83,8 K (−189 °C) och kokar redan vid 87,3 K. Det är bara 3,5 graders skillnad!',
      'Real argon melts at 83.8 K (−189 °C) and boils at just 87.3 K. Only 3.5 degrees apart!'),
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
    controls: (panel) => {
      const slider = panel.slider(L('Termostat', 'Thermostat'), {
        min: T_MIN_K, max: T_MAX_K, step: 1, value: targetK, format: (v) => fmtK(v),
      }, (v) => setTarget(v));
      panel.buttons([
        { label: L('Värm jämnt', 'Heat steadily'), icon: '🔥', onClick: startHeating },
        { label: L('Frys till kristall', 'Freeze to a crystal'), icon: '❄️', onClick: freeze },
      ]);
      const tR = panel.readout(L('Temperatur i lådan', 'Temperature in the box'));
      const pR = panel.readout(L('Tillstånd', 'State'));
      const nR = panel.readout(L('Grannar per atom', 'Neighbours per atom'));
      const cv = panel.canvas(150);
      panel.note(L('Heldragen linje = temperatur. Streckad = energi som sitter i bindningarna mellan atomerna.',
        'Solid line = temperature. Dashed = energy stored in the bonds between atoms.'));
      hud = {
        slider,
        draw: () => drawCurve(cv.ctx, cv.width, cv.height, false),
        refresh: () => {
          tR.set(fmtK(Tema * ARGON_EPS_K));
          pR.set(t(PHASE_NAME[phase]) + (mode === 'heat' ? ` · ${t(L('värmer', 'heating'))}` : ''));
          nR.set(fmt(sim.meanNeighbours(), 1));
        },
      };
      hud.refresh();
      hud.draw();
      return () => { hud = null; };
    },
  });

  // ---------------------------------------------------------------- per frame
  function render() {
    const vmax = 3.2;
    for (let i = 0; i < sim.n; i++) {
      const x = sim.x[i * 3], y = sim.x[i * 3 + 1], z = sim.x[i * 3 + 2];
      m4.makeTranslation(CX + (z - Lz / 2) * S, BASE + y * S, CZ + (x - Lx / 2) * S);
      atoms.setMatrixAt(i, m4);
      const vx = sim.v[i * 3], vy = sim.v[i * 3 + 1], vz = sim.v[i * 3 + 2];
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) / vmax;
      if (sp < 0.5) c.copy(cold).lerp(warm, sp * 2);
      else c.copy(warm).lerp(hot, Math.min(1, (sp - 0.5) * 2));
      atoms.setColorAt(i, c);
    }
    atoms.instanceMatrix.needsUpdate = true;
    atoms.instanceColor!.needsUpdate = true;
  }
  render();

  return {
    center: [BX - 0.6, BZ],
    update(dt, time, near) {
      dial.rotation.x = -((targetK - T_MIN_K) / (T_MAX_K - T_MIN_K)) * Math.PI * 1.5 + Math.PI * 0.75;
      if (!near && !focused) return;
      const rate = mode === 'heat' ? SIM_RATE_HEAT : SIM_RATE;
      acc += Math.min(dt, 0.05) * rate;
      let steps = 0;
      while (acc >= sim.dt && steps < 20) {
        if (mode === 'heat') {
          if (warm0 > 0) {
            warm0 -= sim.dt;
            if (warm0 <= 0) {
              sim.mode = 'power';
              sim.power = HEAT_POWER;
              sim.heatAdded = 0;
            }
          }
        }
        sim.step();
        acc -= sim.dt;
        steps++;
        Tema += (sim.temperature() - Tema) * 0.01;
        if (mode === 'heat' && sim.mode === 'power') {
          sampleAcc += sim.dt;
          if (sampleAcc >= 0.08) {
            sampleAcc = 0;
            samples.push({ q: sim.heatAdded, T: Tema * ARGON_EPS_K, pe: sim.pe / sim.n, phase });
          }
          if (Tema * ARGON_EPS_K > 390 || sim.heatAdded > 10) {
            mode = 'thermostat';
            sim.mode = 'thermostat';
            targetK = clamp(Tema * ARGON_EPS_K, T_MIN_K, T_MAX_K);
            sim.targetT = targetK / ARGON_EPS_K;
            if (hud?.slider) hud.slider.value = String(targetK);
            kit.buddy.celebrate(L('Klar! Ser du var kurvan planade ut? Där gick värmen åt till att bryta bindningar.',
              'Done! See where the curve flattened? That\'s where the heat went into breaking bonds.'), true);
            board.redraw();
            break;
          }
        }
      }
      if (acc > sim.dt * 4) acc = 0; // don't spiral if the frame rate drops
      phase = classify();
      if (phase !== lastPhase) {
        lastPhase = phase;
        if (!seen.has(phase)) {
          seen.add(phase);
          if (phase === 'liquid') kit.buddy.say(L('Kristallen smälter! Atomerna börjar glida förbi varandra.', 'The crystal is melting! The atoms start sliding past each other.'), { expression: 'surprised' });
          else if (phase === 'gas') kit.buddy.say(L('Gas! Nu flyger atomerna fritt och studsar mot väggarna.', 'Gas! Now the atoms fly freely and bounce off the walls.'), { expression: 'joy' });
        }
        ctx.sfx.tone(phase === 'solid' ? 400 : phase === 'gas' ? 900 : 650, 0.2, { type: 'triangle', gain: 0.05 });
      }
      render();
      // heater glow
      const K = Tema * ARGON_EPS_K;
      const h = clamp((K - 60) / 260, 0, 1);
      const cc = clamp((60 - K) / 40, 0, 1);
      plateMat.emissive.setRGB(0.9 * h + 0.05 * cc, 0.25 * h * h + 0.2 * cc, 0.05 * h + 0.6 * cc);
      plateMat.emissiveIntensity = 0.6 + 0.3 * Math.sin(time * 2);
      const level = clamp(K / 400, 0.02, 1) * 0.76;
      thermoLiq.scale.set(0.009, level, 0.009);
      thermoLiq.position.set(CX - 0.2, top + 0.07 + level / 2, CZ + W / 2 + 0.12);
      readTimer -= dt;
      if (readTimer <= 0) {
        readTimer = 0.25;
        readout.redraw();
      }
      boardTimer -= dt;
      if (mode === 'heat' && boardTimer <= 0) {
        boardTimer = 0.4;
        board.redraw();
      }
      hudTimer -= dt;
      if (hud && hudTimer <= 0) {
        hudTimer = 0.2;
        hud.refresh();
        hud.draw();
      }
      if (mode === 'heat' && Math.random() < dt * 2) ctx.sfx.noise(0.25, { freq: 500, gain: 0.015 });
    },
  };
}
