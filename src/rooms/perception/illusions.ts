/**
 * Station 5: the illusions wall. Three classic illusions as panels you can poke in the room or open full-screen:
 * Adelson's checker-shadow (A and B are the same grey), Müller-Lyer (adjust a line until it looks equal, then
 * measure) and the Ebbinghaus circles (remove the neighbours).
 */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import { type BuddyGate, type Overlay, approach, canvasPlane, fmt, fullCanvas, mats, mesh, openOverlay, rbox, smooth } from './common';

const BG = '#d6cfc3';
const PX: [number, number] = [1024, 788];
const PANEL_W = 1.3;
const PANEL_H = (PANEL_W * PX[1]) / PX[0];

// ------------------------------------------------------------------ Adelson's checker-shadow, rendered per pixel once
const T_GREY = 120; // sRGB value of both A and B
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const srgb = (l: number) => { const c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255); };

interface AdelsonImage { canvas: HTMLCanvasElement; A: [number, number]; B: [number, number]; s: number }
let adelson: AdelsonImage | null = null;
function adelsonImage(): AdelsonImage {
  if (adelson) return adelson;
  const [W, H] = PX;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  const s = H * 0.14; // cell edge
  const ux = s * 0.866, uy = s * 0.5; // U = (ux, uy), V = (-ux, uy)
  const ox = W * 0.5, oy = H * 0.1;
  const N = 5;
  const P = (i: number, j: number): [number, number] => [ox + (i - j) * ux, oy + (i + j) * uy];
  // board sides
  const side = (a: [number, number], b: [number, number], col: string) => {
    const d = s * 0.32;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(b[0], b[1] + d);
    g.lineTo(a[0], a[1] + d);
    g.closePath();
    g.fill();
  };
  side(P(0, N), P(N, N), '#57504a');
  side(P(N, 0), P(N, N), '#3e3833');
  // checker with a soft shadow, per pixel. Illumination multiplies the reflectance in *linear* light.
  const light = lin(200);
  const dark = lin(T_GREY);
  const f = lin(T_GREY) / light; // shadow strength chosen so a light square in full shadow equals a dark one in light
  const A: [number, number] = [1, 2]; // dark, lit
  const B: [number, number] = [3, 3]; // light, shadowed
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - ox) / ux;
      const dy = (y + 0.5 - oy) / uy;
      const i = (dy + dx) / 2;
      const j = (dy - dx) / 2;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const ci = Math.floor(i), cj = Math.floor(j);
      let v: number;
      if ((ci === A[0] && cj === A[1]) || (ci === B[0] && cj === B[1])) v = T_GREY;
      else {
        const base = (ci + cj) % 2 ? dark : light;
        // cast shadow: a soft capsule from the cylinder's foot, away from the light
        const px = i - 3.7, py = j - 1.15, sx = -0.3, sy = 2.7;
        const u = Math.min(1, Math.max(0, (px * sx + py * sy) / (sx * sx + sy * sy)));
        const r = Math.hypot(px - u * sx, py - u * sy);
        const shade = 1 - smooth((r - 0.72) / 0.45);
        v = srgb(base * (1 - (1 - f) * shade));
      }
      const k = (y * W + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = v;
    }
  }
  g.putImageData(img, 0, 0);
  // the green cylinder casting the shadow
  const [cx, cy] = P(3.7, 1.15);
  const rx = s * 0.62, ry = rx * 0.5, ch = s * 2.1;
  const grad = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  grad.addColorStop(0, '#2f6a38');
  grad.addColorStop(0.55, '#5aa864');
  grad.addColorStop(1, '#2a5a30');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  g.lineTo(cx - rx, cy - ch);
  g.ellipse(cx, cy - ch, rx, ry, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  g.fillStyle = '#7cc286';
  g.beginPath();
  g.ellipse(cx, cy - ch, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  // labels
  const cA = P(A[0] + 0.5, A[1] + 0.5);
  const cB = P(B[0] + 0.5, B[1] + 0.5);
  g.fillStyle = '#f4f0ea';
  g.font = `800 ${Math.round(s * 0.42)}px "Baloo 2", "Nunito", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('A', cA[0], cA[1]);
  g.fillText('B', cB[0], cB[1]);
  adelson = { canvas: c, A: cA, B: cB, s };
  return adelson;
}

// ------------------------------------------------------------------ state + drawing
interface State {
  reveal: boolean;
  ml: number; // adjustable line / reference line
  measured: boolean;
  ebb: number; // 0..1 how visible the surrounding circles are
  ebbOn: boolean;
}

function fit(w: number, h: number) {
  const s = Math.min(w / PX[0], h / PX[1]);
  return { s, x: (w - PX[0] * s) / 2, y: (h - PX[1] * s) / 2 };
}

function drawAdelson(g: CanvasRenderingContext2D, w: number, h: number, st: State) {
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  const im = adelsonImage();
  const f = fit(w, h);
  g.imageSmoothingEnabled = true;
  g.drawImage(im.canvas, f.x, f.y, PX[0] * f.s, PX[1] * f.s);
  if (st.reveal) {
    // a bridge of exactly the same grey that joins A and B: no edge anywhere along it
    const ax = f.x + im.A[0] * f.s, ay = f.y + im.A[1] * f.s;
    const bx = f.x + im.B[0] * f.s, by = f.y + im.B[1] * f.s;
    g.strokeStyle = `rgb(${T_GREY},${T_GREY},${T_GREY})`;
    g.lineWidth = im.s * 0.3 * f.s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    g.fillStyle = '#f4f0ea';
    g.font = `800 ${Math.round(im.s * 0.42 * f.s)}px "Baloo 2", "Nunito", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('A', ax, ay);
    g.fillText('B', bx, by);
  }
}

function drawML(g: CanvasRenderingContext2D, w: number, h: number, st: State) {
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  const f = fit(w, h);
  const S = (v: number) => v * f.s;
  const cx = f.x + S(PX[0] / 2);
  const L0 = S(PX[0] * 0.44);
  const fin = S(PX[0] * 0.075);
  const ang = (38 * Math.PI) / 180;
  const fx = Math.cos(ang) * fin, fy = Math.sin(ang) * fin;
  g.strokeStyle = '#1d1a1f';
  g.lineWidth = S(9);
  g.lineCap = 'round';
  const line = (y: number, len: number, heads: boolean) => {
    const x0 = cx - len / 2, x1 = cx + len / 2;
    const dir = heads ? 1 : -1; // heads: fins point back along the line (‹—›); tails: fins point outwards (›—‹)
    g.beginPath();
    g.moveTo(x0, y); g.lineTo(x1, y);
    g.moveTo(x0, y); g.lineTo(x0 + dir * fx, y - fy);
    g.moveTo(x0, y); g.lineTo(x0 + dir * fx, y + fy);
    g.moveTo(x1, y); g.lineTo(x1 - dir * fx, y - fy);
    g.moveTo(x1, y); g.lineTo(x1 - dir * fx, y + fy);
    g.stroke();
  };
  const y0 = f.y + S(PX[1] * 0.33);
  const y1 = f.y + S(PX[1] * 0.66);
  line(y0, L0, true);
  g.strokeStyle = '#a8321e';
  line(y1, L0 * st.ml, false);
  if (st.measured) {
    g.setLineDash([S(10), S(10)]);
    g.strokeStyle = '#1f4fa8';
    g.lineWidth = S(4);
    for (const x of [cx - L0 / 2, cx + L0 / 2]) {
      g.beginPath();
      g.moveTo(x, y0 - S(60));
      g.lineTo(x, y1 + S(60));
      g.stroke();
    }
    g.setLineDash([]);
    const pct = (st.ml - 1) * 100;
    g.fillStyle = '#1f4fa8';
    g.font = `800 ${Math.round(S(44))}px "Baloo 2", "Nunito", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${pct >= 0 ? '+' : '−'}${fmt(Math.abs(pct), 0)} %`, cx, f.y + S(PX[1] * 0.9));
  }
}

function drawEbb(g: CanvasRenderingContext2D, w: number, h: number, st: State) {
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  const f = fit(w, h);
  const S = (v: number) => v * f.s;
  const cy = f.y + S(PX[1] * 0.5);
  const R = S(48);
  const circle = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const a = smooth(st.ebb);
  const lx = f.x + S(PX[0] * 0.28), rx = f.x + S(PX[0] * 0.74);
  g.globalAlpha = a;
  g.fillStyle = '#4a6fa5';
  for (let k = 0; k < 6; k++) {
    const t0 = (k / 6) * Math.PI * 2;
    circle(lx + Math.cos(t0) * S(185), cy + Math.sin(t0) * S(185), S(88));
  }
  for (let k = 0; k < 8; k++) {
    const t0 = (k / 8) * Math.PI * 2;
    circle(rx + Math.cos(t0) * S(88), cy + Math.sin(t0) * S(88), S(22));
  }
  g.globalAlpha = 1;
  g.fillStyle = '#e8792e';
  circle(lx, cy, R);
  circle(rx, cy, R);
}

const ILLUSIONS = [
  { id: 'adelson', name: L('Schackbrädet', 'Checker shadow'), draw: drawAdelson },
  { id: 'ml', name: L('Müller-Lyer', 'Müller-Lyer'), draw: drawML },
  { id: 'ebb', name: L('Ebbinghaus', 'Ebbinghaus'), draw: drawEbb },
] as const;

export function buildIllusions(ctx: RoomContext, buddy: BuddyGate, pos: [number, number], wallZ: number) {
  const st: State = { reveal: false, ml: 1.15 + Math.random() * 0.15, measured: false, ebb: 1, ebbOn: true };
  const root = new THREE.Group();
  root.position.set(pos[0], 0, wallZ);
  ctx.group.add(root);
  ctx.addCollider(pos[0], wallZ + 0.05, 4.9, 0.4);
  let overlay: Overlay | null = null;
  let revealedOnce = false;

  // ---- the wall: a big wooden board, three framed panels and a header
  mesh(rbox(4.8, 2.2, 0.08, 0.04), mats.darkWood, 0, 1.75, 0, root);
  mesh(rbox(4.9, 0.08, 0.2, 0.03), mats.brass, 0, 0.62, 0.06, root);
  const header = canvasPlane(2.4, 0.34, [1024, 145], (g, W, H) => {
    g.fillStyle = '#3a2418';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd9a8';
    g.font = '800 82px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Lita inte på ögonen!', "Don't trust your eyes!")), W / 2, H * 0.52);
  });
  header.mesh.position.set(0, 2.62, 0.05);
  root.add(header.mesh);
  const xs = [-1.5, 0, 1.5];
  const panels = ILLUSIONS.map((il, i) => {
    const p = canvasPlane(PANEL_W, PANEL_H, PX, (g, W, H) => il.draw(g, W, H, st));
    p.mesh.position.set(xs[i], 1.65, 0.07);
    root.add(p.mesh);
    mesh(rbox(PANEL_W + 0.08, PANEL_H + 0.08, 0.03, 0.015), mats.brass, xs[i], 1.65, 0.05, root);
    const lab = canvasPlane(PANEL_W, 0.16, [1024, 126], (g, W, H) => {
      g.fillStyle = '#2a1a12';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f3c99a';
      g.font = '800 64px "Baloo 2", "Nunito", system-ui, sans-serif';
      g.fillText(t(il.name), W / 2, H * 0.55);
    });
    lab.mesh.position.set(xs[i], 1.65 - PANEL_H / 2 - 0.13, 0.06);
    root.add(lab.mesh);
    return p;
  });
  const redraw = (i: number) => {
    panels[i].redraw();
    if (overlay?.open) overlayDraw?.();
    refreshHud();
  };

  // in-world interaction
  ctx.interaction.add(panels[0].mesh, { label: L('Klicka: visa sanningen', 'Click: reveal the truth'), onClick: () => toggleReveal() });
  ctx.interaction.add(panels[1].mesh, {
    label: L('Dra i sidled för att ändra den röda linjen', 'Drag sideways to change the red line'),
    cursor: 'ew-resize',
    onDrag: (info) => setML(st.ml + info.dx * 0.0025),
    onClick: () => measure(),
  });
  ctx.interaction.add(panels[2].mesh, { label: L('Klicka: ta bort grannarna', 'Click: remove the neighbours'), onClick: () => toggleEbb() });

  function toggleReveal() {
    st.reveal = !st.reveal;
    ctx.sfx.pop();
    if (st.reveal && !revealedOnce) {
      revealedOnce = true;
      buddy.say(L('A och B är exakt samma grå färg! Hjärnan räknar bort skuggan åt dig.', 'A and B are exactly the same grey! Your brain subtracts the shadow for you.'), 'surprised');
    }
    redraw(0);
  }
  function setML(v: number) {
    const nv = Math.min(1.45, Math.max(0.6, v));
    if (nv === st.ml && !st.measured) return;
    st.ml = nv;
    st.measured = false;
    redraw(1);
  }
  function measure() {
    st.measured = true;
    ctx.sfx.chime();
    const pct = (st.ml - 1) * 100;
    if (Math.abs(pct) >= 5) buddy.celebrate(L(`Du ställde in linjen ${fmt(Math.abs(pct))} % ${pct < 0 ? 'för kort' : 'för lång'}. Helt normalt – nästan alla luras!`, `You set the line ${fmt(Math.abs(pct))} % too ${pct < 0 ? 'short' : 'long'}. Totally normal – almost everyone is fooled!`));
    else buddy.celebrate(L('Wow, nästan exakt! Du kanske mätte med blicken längs linjerna?', 'Wow, nearly exact! Did you measure along the lines with your eyes?'));
    redraw(1);
  }
  function toggleEbb() {
    st.ebbOn = !st.ebbOn;
    ctx.sfx.whoosh();
  }

  // ---- full-screen view
  let overlayDraw: (() => void) | null = null;
  function openLarge(i: number) {
    if (overlay?.open) overlay.close();
    const il = ILLUSIONS[i];
    const ov = openOverlay({
      background: BG,
      closeLabel: L('Stäng', 'Close'),
      onClose: () => {
        fc.dispose();
        offLang();
        overlay = null;
        overlayDraw = null;
      },
    });
    overlay = ov;
    const fc = fullCanvas(ov.root, () => overlayDraw?.());
    overlayDraw = () => {
      fc.g.save();
      il.draw(fc.g, fc.size.w, fc.size.h - 70, st);
      fc.g.restore();
    };
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute', left: '0', right: '0', bottom: 'max(14px, env(safe-area-inset-bottom))', display: 'flex',
      justifyContent: 'center', gap: '10px', padding: '0 12px', flexWrap: 'wrap',
    } satisfies Partial<CSSStyleDeclaration>);
    ov.root.appendChild(bar);
    const mk = (label: L10n, fn: () => void) => {
      const b = document.createElement('button');
      Object.assign(b.style, {
        padding: '12px 20px', borderRadius: '999px', border: '0', fontWeight: '800', fontSize: '16px', cursor: 'pointer',
        background: '#2a1f2c', color: '#fff6ea',
      } satisfies Partial<CSSStyleDeclaration>);
      b.textContent = t(label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.sfx.click();
        fn();
      });
      bar.appendChild(b);
    };
    const buttons = () => {
      bar.innerHTML = '';
      if (il.id === 'adelson') mk(L('Visa / dölj sanningen', 'Reveal / hide the truth'), toggleReveal);
      if (il.id === 'ml') {
        mk(L('◀ Kortare', '◀ Shorter'), () => setML(st.ml - 0.01));
        mk(L('Längre ▶', 'Longer ▶'), () => setML(st.ml + 0.01));
        mk(L('📏 Mät', '📏 Measure'), measure);
      }
      if (il.id === 'ebb') mk(L('Ta bort / visa grannarna', 'Remove / show the neighbours'), toggleEbb);
    };
    buttons();
    const offLang = onLangChange(() => {
      buttons();
      overlayDraw?.();
    });
    // dragging on the canvas adjusts the Müller-Lyer line
    let lastX: number | null = null;
    fc.canvas.addEventListener('pointerdown', (e) => {
      lastX = e.clientX;
      fc.canvas.setPointerCapture(e.pointerId);
    });
    fc.canvas.addEventListener('pointermove', (e) => {
      if (lastX == null || il.id !== 'ml') return;
      setML(st.ml + (e.clientX - lastX) / (fc.size.w * 0.44));
      lastX = e.clientX;
    });
    fc.canvas.addEventListener('pointerup', () => {
      lastX = null;
      if (il.id === 'adelson') toggleReveal();
      if (il.id === 'ebb') toggleEbb();
    });
    fc.fit();
  }

  // ---- HUD
  let ro: { ml: Readout } | null = null;
  let mlSlider: HTMLInputElement | null = null;
  function refreshHud() {
    if (mlSlider && Number(mlSlider.value) !== st.ml) mlSlider.value = String(st.ml);
    if (ro) ro.ml.set(st.measured ? `${st.ml >= 1 ? '+' : '−'}${fmt(Math.abs(st.ml - 1) * 100)} %` : t(L('tryck Mät', 'press Measure')));
  }
  function controls(p: ControlPanel) {
    p.heading(L('1 · Schackbrädet (Adelson)', '1 · Checker shadow (Adelson)'));
    p.note(L('Ruta B i skuggan ser mycket ljusare ut än A. Hjärnan vet att skuggor gör saker mörkare och räknar bort skuggan för att visa hur ytan verkligen är. Smart, när man vill känna igen saker i olika ljus!', 'Square B in the shadow looks much lighter than A. Your brain knows shadows darken things and subtracts the shadow to show what the surface is really like. Smart, when you want to recognise things in any light!'));
    p.button(L('Visa sanningen', 'Reveal the truth'), toggleReveal, { icon: '🔍' });
    p.heading(L('2 · Müller-Lyer', '2 · Müller-Lyer'));
    p.note(L('Dra i panelen eller reglaget tills den röda linjen ser lika lång ut som den svarta. Tryck sedan Mät.', 'Drag the panel or the slider until the red line looks as long as the black one. Then press Measure.'));
    mlSlider = p.slider(L('Röda linjens längd', 'Red line length'), { min: 0.6, max: 1.45, step: 0.005, value: st.ml, format: () => '' }, (v) => setML(v));
    p.button(L('Mät', 'Measure'), measure, { icon: '📏' });
    ro = { ml: p.readout(L('Skillnad mot svarta linjen', 'Difference from the black line')) };
    p.note(L('En ledande förklaring: vinklarna liknar hörn i 3D. Utåtvända fenor ser ut som ett inre hörn längre bort, och hjärnan förstorar det som verkar vara långt bort.', 'A leading explanation: the fins look like corners in 3D. Outward fins look like an inside corner farther away, and the brain enlarges things that seem far away.'));
    p.heading(L('3 · Ebbinghaus-cirklarna', '3 · Ebbinghaus circles'));
    p.note(L('De två orange cirklarna är exakt lika stora. Hjärnan bedömer storlek genom att jämföra med grannarna, inte i centimeter.', 'The two orange circles are exactly the same size. Your brain judges size by comparing with the neighbours, not in centimetres.'));
    p.button(L('Ta bort / visa grannarna', 'Remove / show the neighbours'), toggleEbb, { icon: '⭕' });
    p.heading(L('Visa stort', 'Show large'));
    p.buttons(ILLUSIONS.map((il, i) => ({ label: il.name, onClick: () => openLarge(i) })));
    refreshHud();
    return () => {
      ro = null;
      mlSlider = null;
    };
  }

  ctx.addStation({
    id: 'perception-illusions',
    title: L('Synvillor', 'Illusions wall'),
    position: pos,
    viewpoint: { position: [pos[0], 1.6, wallZ + 3.0], target: [pos[0] + 0.45, 1.6, wallZ] },
    intro: L('Tre bilder där din hjärna gissar fel – med flit! Kan du lura den tillbaka?', 'Three pictures where your brain guesses wrong – on purpose! Can you outsmart it?'),
    howTo: L('Klicka på schackbrädet, dra i linjerna och klicka på cirklarna. Öppna dem i helskärm för starkast effekt.', 'Click the checkerboard, drag the lines and click the circles. Open them full-screen for the strongest effect.'),
    science: L(
      'Hjärnan mäter inte ljus och längder som en linjal; den gissar vad som finns där ute utifrån vad som brukar vara sant. I schackbrädet är A och B exakt samma grå (RGB 120, 120, 120), men hjärnan tar hänsyn till skuggan och kontrasten mot grannrutorna. I Müller-Lyer ställer de flesta in linjen 10–30 % fel, och i Ebbinghaus bedöms storlek relativt omgivningen. Synvillor är alltså inte fel i hjärnan utan smarta genvägar som nästan alltid ger rätt svar i den riktiga världen.',
      'Your brain doesn\'t measure light and length like a ruler; it guesses what is out there based on what is usually true. In the checkerboard, A and B are exactly the same grey (RGB 120, 120, 120), but the brain accounts for the shadow and the contrast with neighbouring squares. In Müller-Lyer most people set the line 10–30 % wrong, and in Ebbinghaus size is judged relative to the surroundings. Illusions aren\'t faults in the brain but smart shortcuts that almost always give the right answer in the real world.',
    ),
    wow: L(
      'Människor som vuxit upp utan raka väggar och rätvinkliga hörn luras mindre av Müller-Lyer, enligt klassiska studier från 1960-talet.',
      'People who grew up without straight walls and right-angled corners were less fooled by Müller-Lyer, according to classic studies from the 1960s.',
    ),
    controls,
    onBlur() {
      overlay?.close();
    },
  });

  return {
    update(dt: number) {
      const target = st.ebbOn ? 1 : 0;
      if (Math.abs(st.ebb - target) > 0.002) {
        st.ebb = approach(st.ebb, target, 5, dt);
        if (Math.abs(st.ebb - target) <= 0.002) st.ebb = target;
        redraw(2);
      }
    },
  };
}
