/**
 * Station 2: your weight on other worlds. A doctor's scale shows the force (N) and what that force
 * would read on an Earth scale ("feels like X kg"); a jump wall shows how high the same take-off
 * speed carries you on each world, at true height and in real time: h = v²/(2g), t = 2v/g.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import type { L10n, RoomContext } from '../../core/types';
import { getLang } from '../../core/i18n';
import {
  FONT, G_EARTH, L, MAT, MOON, PLANETS, astronautGeometry, canvasPlane, fmt, planetTexture, sunlitMaterial, t,
  type RoomBuddy, type TexKind,
} from './shared';

export const WEIGHT_POS: [number, number] = [-6.0, -6.5];

interface World { id: TexKind; name: L10n; g: number }
const PLUTO: World = { id: 'pluto', name: L('Pluto', 'Pluto'), g: 0.62 };
/** Jump-wall lanes, left to right. */
const LANES: World[] = [
  PLANETS[0], PLANETS[1], PLANETS[2], MOON, PLANETS[3], PLANETS[4], PLANETS[5], PLANETS[6], PLANETS[7],
].map((b) => ({ id: b.id, name: b.name, g: b.g }));
const WORLDS: World[] = [...LANES, PLUTO];

const JUMP_EARTH = 0.4; // m
const V0 = Math.sqrt(2 * G_EARTH * JUMP_EARTH); // 2.80 m/s take-off speed

const BOARD = { x0: -8.6, x1: -5.4, y0: 0.95, h: 3.0, z: -8.93 };
const LANE_W = (BOARD.x1 - BOARD.x0) / LANES.length;
const SCALE_POS: [number, number] = [-4.55, -7.6];
const FIG_H = 0.24;

export function buildWeight(ctx: RoomContext, buddy: RoomBuddy) {
  const root = ctx.group;
  ctx.addCollider((BOARD.x0 + BOARD.x1) / 2, -8.6, BOARD.x1 - BOARD.x0 + 0.2, 0.75);
  ctx.addCollider(SCALE_POS[0], SCALE_POS[1], 0.9, 0.9);

  const st = {
    mass: 35,
    sel: 3, // Moon
    jumpT: -1,
    landed: new Array(LANES.length).fill(false) as boolean[],
    peaks: new Array(LANES.length).fill(0) as number[],
    needle: 0,
    needleV: 0,
  };

  // --- Jump wall ---------------------------------------------------------------------------
  const boardDraw = (g: CanvasRenderingContext2D, w: number, h: number) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#120f33');
    grad.addColorStop(1, '#1f1a4d');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(230,225,255,${r() * 0.5})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    const lw = w / LANES.length;
    // selected lane glow
    const si = st.sel < LANES.length ? st.sel : -1;
    if (si >= 0) {
      const lg = g.createLinearGradient(0, h, 0, 0);
      lg.addColorStop(0, 'rgba(143,123,255,0.45)');
      lg.addColorStop(1, 'rgba(143,123,255,0.05)');
      g.fillStyle = lg;
      g.fillRect(si * lw, 0, lw, h);
    }
    g.strokeStyle = 'rgba(200,190,255,0.25)';
    g.lineWidth = 2;
    for (let i = 1; i < LANES.length; i++) {
      g.beginPath();
      g.moveTo(i * lw, 0);
      g.lineTo(i * lw, h);
      g.stroke();
    }
    // height scale (true metres above the shelf)
    const yOf = (m: number) => h * (1 - m / BOARD.h);
    g.font = `600 22px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let m = 0.5; m < BOARD.h; m += 0.5) {
      g.strokeStyle = 'rgba(255,214,140,0.55)';
      g.setLineDash([10, 10]);
      g.beginPath();
      g.moveTo(0, yOf(m));
      g.lineTo(w, yOf(m));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffd68c';
      g.fillText(`${fmt(m, 1)} m`, 6, yOf(m) - 14);
    }
    // Title
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.font = `700 40px ${FONT}`;
    g.fillText(getLang() === 'sv' ? 'Samma hopp, olika världar' : 'Same jump, different worlds', w / 2, 34);
    g.font = `500 22px ${FONT}`;
    g.fillStyle = '#cfc8ff';
    g.fillText(getLang() === 'sv' ? 'Skala 1:1 – ett hopp på 40 cm på Jorden' : 'Scale 1:1 – a 40 cm jump on Earth', w / 2, 72);
    // Records
    g.font = `700 26px ${FONT}`;
    st.peaks.forEach((p, i) => {
      if (p <= 0) return;
      const y = yOf(p + FIG_H);
      g.strokeStyle = '#7dffb0';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(i * lw + 8, y);
      g.lineTo((i + 1) * lw - 8, y);
      g.stroke();
      g.fillStyle = '#7dffb0';
      g.fillText(`${fmt(p, 2)} m`, (i + 0.5) * lw, Math.max(110, y - 20));
    });
  };
  const board = canvasPlane(BOARD.x1 - BOARD.x0, BOARD.h, [1024, 960], boardDraw);
  board.mesh.position.set((BOARD.x0 + BOARD.x1) / 2, BOARD.y0 + BOARD.h / 2, BOARD.z);
  (board.mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.8);
  root.add(board.mesh);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(BOARD.x1 - BOARD.x0 + 0.12, BOARD.h + 0.12, 0.04, 2, 0.02), MAT.darkWood);
  frame.position.set(board.mesh.position.x, board.mesh.position.y, BOARD.z - 0.03);
  root.add(frame);
  // Shelf the figures stand on, with a name strip
  const shelf = new THREE.Mesh(new RoundedBoxGeometry(BOARD.x1 - BOARD.x0 + 0.1, 0.06, 0.34, 2, 0.02), MAT.wood);
  shelf.position.set(board.mesh.position.x, BOARD.y0 - 0.03, BOARD.z + 0.17);
  root.add(shelf);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(BOARD.x1 - BOARD.x0, BOARD.y0 - 0.06, 0.3), MAT.darkWood);
  cabinet.position.set(board.mesh.position.x, (BOARD.y0 - 0.06) / 2, BOARD.z + 0.16);
  root.add(cabinet);
  const names = canvasPlane(BOARD.x1 - BOARD.x0, 0.16, [1024, 48], (g, w, h) => {
    g.fillStyle = '#2a1b12';
    g.fillRect(0, 0, w, h);
    g.font = `700 22px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    LANES.forEach((l, i) => {
      g.fillStyle = i === st.sel ? '#ffd68c' : '#f3e6d0';
      g.fillText(t(l.name), ((i + 0.5) * w) / LANES.length, h / 2);
    });
  });
  names.mesh.position.set(board.mesh.position.x, BOARD.y0 - 0.15, BOARD.z + 0.315);
  root.add(names.mesh);

  // Globes in front of each lane (click to choose that world)
  const sunW = ctx.toWorld(new THREE.Vector3(-3, 4, -2));
  const globeGeo = new THREE.SphereGeometry(0.065, 24, 16);
  LANES.forEach((l, i) => {
    const globe = new THREE.Mesh(globeGeo, sunlitMaterial(sunW, { map: planetTexture(l.id), ambient: 0.35, sun: 1.0, rimStrength: 0.6 }));
    globe.position.set(BOARD.x0 + (i + 0.5) * LANE_W, BOARD.y0 + 0.07, BOARD.z + 0.29);
    root.add(globe);
    ctx.interaction.add(globe, { label: l.name, onClick: () => select(i) });
  });

  // Astronaut figures (one instanced draw call)
  const figs = new THREE.InstancedMesh(astronautGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), LANES.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const setFig = (i: number, h: number, squash: number) => {
    pv.set(BOARD.x0 + (i + 0.5) * LANE_W, BOARD.y0 + h, BOARD.z + 0.12);
    sv.set(FIG_H * (1 + (1 - squash) * 0.5), FIG_H * squash, FIG_H);
    m4.compose(pv, q, sv);
    figs.setMatrixAt(i, m4);
  };
  LANES.forEach((_, i) => setFig(i, 0, 1));
  root.add(figs);

  // --- Scale ---------------------------------------------------------------------------------
  const scale = new THREE.Group();
  scale.position.set(SCALE_POS[0], 0, SCALE_POS[1]);
  scale.rotation.y = -0.45;
  scale.scale.setScalar(1.2);
  root.add(scale);
  const platform = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.1, 0.7, 3, 0.04), MAT.white);
  platform.position.y = 0.05;
  scale.add(platform);
  const mat = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.012, 0.5, 2, 0.005), new THREE.MeshStandardMaterial({ color: 0x3a3550, roughness: 0.9 }));
  mat.position.set(0, 0.105, 0.05);
  scale.add(mat);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 16), MAT.brass);
  column.position.set(0, 0.7, -0.3);
  scale.add(column);
  const dialCase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 48), MAT.brass);
  dialCase.rotation.x = Math.PI / 2;
  dialCase.position.set(0, 1.45, -0.3);
  scale.add(dialCase);
  const MAX_KG = 400;
  const dialAngle = (kg: number) => (-Math.PI * 0.8) + (Math.min(kg, MAX_KG) / MAX_KG) * Math.PI * 1.6;
  const dial = canvasPlane(0.54, 0.54, [512, 512], (g, w, h) => {
    g.fillStyle = '#fbf6ea';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a1b12';
    g.fillStyle = '#2a1b12';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let kg = 0; kg <= MAX_KG; kg += 10) {
      const a = dialAngle(kg) - Math.PI / 2;
      const major = kg % 50 === 0;
      const r0 = major ? 200 : 214;
      g.lineWidth = major ? 4 : 2;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      g.lineTo(w / 2 + Math.cos(a) * 236, h / 2 + Math.sin(a) * 236);
      g.stroke();
      if (major) {
        g.font = `700 26px ${FONT}`;
        g.fillText(String(kg), w / 2 + Math.cos(a) * 170, h / 2 + Math.sin(a) * 170);
      }
    }
    g.font = `600 24px ${FONT}`;
    g.fillText(getLang() === 'sv' ? 'kg (som på Jorden)' : 'kg (Earth reading)', w / 2, h / 2 + 90);
  }, true);
  dial.mesh.position.set(0, 1.45, -0.255);
  scale.add(dial.mesh);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.004).translate(0, 0.09, 0), new THREE.MeshBasicMaterial({ color: 0xd8342c }));
  needle.position.set(0, 1.45, -0.25);
  scale.add(needle);
  const display = canvasPlane(0.6, 0.2, [512, 170], (g, w, h) => {
    g.fillStyle = '#0d1a14';
    g.fillRect(0, 0, w, h);
    const world = WORLDS[st.sel];
    const N = st.mass * world.g;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7dffb0';
    g.font = `700 40px ${FONT}`;
    g.fillText(t(world.name), w / 2, 36);
    g.font = `700 50px ${FONT}`;
    g.fillText(`${fmt(N, 0)} N`, w / 2, 92);
    g.font = `500 26px ${FONT}`;
    g.fillStyle = '#b8ffd6';
    g.fillText(`${getLang() === 'sv' ? 'massa' : 'mass'} ${fmt(st.mass, 0)} kg`, w / 2, 144);
  });
  display.mesh.position.set(0, 1.0, -0.26);
  scale.add(display.mesh);
  ctx.interaction.add(platform, { label: L('Hoppa!', 'Jump!'), onClick: () => jump() });

  // --- Logic -------------------------------------------------------------------------------
  let ui: { force: Readout; feel: Readout; massR: Readout; jumpH: Readout; air: Readout; chart: { ctx: CanvasRenderingContext2D; width: number; height: number }; setActive: (i: number) => void } | null = null;

  function refresh() {
    board.redraw();
    names.redraw();
    display.redraw();
    if (!ui) return;
    const w = WORLDS[st.sel];
    const lang = getLang();
    ui.force.set(`${fmt(st.mass * w.g, 0)} N`);
    ui.feel.set(`${fmt((st.mass * w.g) / G_EARTH, 1)} kg`);
    ui.massR.set(`${fmt(st.mass, 0)} kg ${lang === 'sv' ? '(samma överallt)' : '(the same everywhere)'}`);
    const h = (V0 * V0) / (2 * w.g);
    ui.jumpH.set(`${fmt(h, 2)} m${w.id === 'pluto' ? (lang === 'sv' ? ' – genom taket!' : ' – through the ceiling!') : ''}`);
    ui.air.set(`${fmt((2 * V0) / w.g, 2)} s`);
    ui.setActive(st.sel);
    drawChart();
  }

  function drawChart() {
    if (!ui) return;
    const { ctx: g, width, height } = ui.chart;
    g.clearRect(0, 0, width, height);
    const n = WORLDS.length;
    const rowH = height / n;
    const maxKg = (st.mass * 24.79) / G_EARTH;
    g.font = `600 11px ${FONT}`;
    g.textBaseline = 'middle';
    WORLDS.forEach((w, i) => {
      const kg = (st.mass * w.g) / G_EARTH;
      const y = i * rowH + rowH / 2;
      g.fillStyle = i === st.sel ? '#ffd68c' : '#cfc8ff';
      g.textAlign = 'left';
      g.fillText(t(w.name), 0, y);
      const x0 = 74;
      const bw = ((width - x0 - 54) * kg) / maxKg;
      g.fillStyle = i === st.sel ? '#ffb347' : '#8f7bff';
      g.fillRect(x0, y - rowH * 0.32, Math.max(2, bw), rowH * 0.64);
      g.fillStyle = '#fff';
      g.fillText(`${fmt(kg, 1)} kg`, x0 + bw + 4, y);
    });
  }

  function select(i: number) {
    st.sel = i;
    ctx.sfx.pop();
    refresh();
    const w = WORLDS[i];
    const feel = (st.mass * w.g) / G_EARTH;
    if (w.g > 20) {
      buddy.say(L(
        `På Jupiter skulle vågen visa ${feel.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kg. Till och med dina egna ben skulle kännas som en tung ryggsäck!`,
        `On Jupiter the scale would read ${feel.toLocaleString('en-GB', { maximumFractionDigits: 0 })} kg. Even your own legs would feel like a heavy backpack!`,
      ));
    } else if (w.id === 'moon') {
      buddy.say(L('På Månen väger du bara en sjättedel. Men din massa, allt det du består av, är exakt densamma.', 'On the Moon you weigh only a sixth. But your mass, all the stuff you are made of, is exactly the same.'));
    }
  }

  function jump() {
    if (st.jumpT >= 0) return;
    st.jumpT = 0;
    st.landed.fill(false);
    ctx.sfx.tone(180, 0.25, { type: 'sine', to: 520, gain: 0.15 });
    ctx.sfx.whoosh();
  }

  const controls = (panel: ControlPanel) => {
    panel.slider(L('Din massa', 'Your mass'), { min: 10, max: 150, step: 1, value: st.mass, format: (v) => `${fmt(v)} kg` }, (v) => {
      st.mass = v;
      refresh();
    });
    panel.heading(L('Välj värld', 'Pick a world'));
    const setActive = panel.buttons(WORLDS.map((w, i) => ({ label: w.name, onClick: () => select(i) })), st.sel);
    const force = panel.readout(L('Din tyngd (kraft)', 'Your weight (force)'));
    const feel = panel.readout(L('Vågen visar (känns som)', 'Scale reads (feels like)'));
    const massR = panel.readout(L('Din massa', 'Your mass'));
    panel.button(L('Hoppa på alla världar!', 'Jump on every world!'), () => jump(), { primary: true, icon: '🦘' });
    const jumpH = panel.readout(L('Hopphöjd här', 'Jump height here'));
    const air = panel.readout(L('Tid i luften', 'Time in the air'));
    panel.heading(L('Vågen på varje värld', 'The scale on each world'));
    const chart = panel.canvas(170);
    panel.note(L(
      'Vågen mäter kraften du trycker med, F = m·g, och räknar om den till kg som om du stod på Jorden.',
      'A scale measures the force you push with, F = m·g, and converts it to kg as if you were on Earth.',
    ));
    ui = { force, feel, massR, jumpH, air, chart, setActive };
    refresh();
    return () => {
      ui = null;
    };
  };

  const update = (dt: number) => {
    // Needle: damped spring towards the scale reading (it wobbles like a real dial)
    const target = dialAngle((st.mass * WORLDS[st.sel].g) / G_EARTH);
    const w0 = 9;
    const n = Math.max(1, Math.ceil(dt / 0.005));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      st.needleV += (-w0 * w0 * (st.needle - target) - 2 * 0.22 * w0 * st.needleV) * h;
      st.needle += st.needleV * h;
    }
    needle.rotation.z = -st.needle;

    if (st.jumpT >= 0) {
      st.jumpT += dt;
      let all = true;
      LANES.forEach((l, i) => {
        const T = (2 * V0) / l.g;
        const tt = st.jumpT;
        if (tt < T) {
          all = false;
          const y = V0 * tt - 0.5 * l.g * tt * tt;
          setFig(i, y, 1);
        } else {
          const since = tt - T;
          setFig(i, 0, since < 0.25 ? 1 - 0.25 * Math.sin((since / 0.25) * Math.PI) : 1);
          if (!st.landed[i]) {
            st.landed[i] = true;
            st.peaks[i] = (V0 * V0) / (2 * l.g);
            ctx.sfx.tone(90 + l.g * 6, 0.12, { type: 'sine', gain: 0.18, to: 60, pan: (i / (LANES.length - 1)) * 1.4 - 0.7 });
            board.redraw();
          }
          if (since < 0.3) all = false;
        }
      });
      figs.instanceMatrix.needsUpdate = true;
      if (all) {
        st.jumpT = -1;
        buddy.celebrate(L(
          'Samma språng, men på Månen flög du 2,4 meter och var i luften i 3,5 sekunder!',
          'The same push-off, but on the Moon you flew 2.4 metres and hung in the air for 3.5 seconds!',
        ));
      }
    }
  };

  return { controls, update };
}
