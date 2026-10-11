/**
 * Station 4: the blind spot. A full-screen card (cross + target) sized in real centimetres after a
 * credit-card calibration, so we can predict the viewing distance where the target vanishes.
 */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel } from '../../core/controlPanel';
import { type BuddyGate, type Overlay, canvasPlane, fmt, fullCanvas, mats, mesh, openOverlay, rbox } from './common';

const CAL_KEY = 'gnistan.perception.pxPerCm';
const CARD_CM = 8.56; // ISO/IEC 7810 ID-1 card width
const BLIND_DEG = 15.5; // centre of the optic disc, temporal to fixation

type Mode = 'dot' | 'buddy' | 'line';
type Eye = 'right' | 'left';

function loadCal(): number {
  try {
    const v = Number(localStorage.getItem(CAL_KEY));
    if (v >= 15 && v <= 120) return v;
  } catch { /* storage blocked */ }
  return 96 / 2.54; // CSS reference pixel: 96 per inch
}

function drawCross(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.strokeStyle = '#111';
  g.lineWidth = Math.max(2, s * 0.18);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x + s, y);
  g.moveTo(x, y - s);
  g.lineTo(x, y + s);
  g.stroke();
}

function drawBuddyFace(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#ff8a3c';
  const w = r * 2;
  const h = r * 1.7;
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, r * 0.45);
  g.fill();
  g.fillStyle = '#2b1606';
  g.beginPath();
  g.roundRect(x - w * 0.36, y - h * 0.28, w * 0.72, h * 0.5, r * 0.25);
  g.fill();
  g.fillStyle = '#9ff4ff';
  for (const dx of [-0.17, 0.17]) {
    g.beginPath();
    g.arc(x + dx * w, y - h * 0.04, r * 0.15, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#2b1606';
  g.lineWidth = r * 0.1;
  g.beginPath();
  g.arc(x, y + h * 0.28, r * 0.25, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

export function buildBlindspot(ctx: RoomContext, buddy: BuddyGate, pos: [number, number]) {
  const root = new THREE.Group();
  root.position.set(pos[0] + 0.3, 0, pos[1]);
  root.rotation.y = -Math.PI / 2; // faces -x
  ctx.group.add(root);
  ctx.addCollider(pos[0] + 0.3, pos[1] + 0.35, 0.9, 2.3);

  let mode: Mode = 'dot';
  let eye: Eye = 'right';
  let pxPerCm = loadCal();
  let overlay: Overlay | null = null;

  // ---- desk, chin rest and the card
  mesh(rbox(1.1, 0.06, 0.62, 0.02), mats.wood, 0, 0.78, 0, root);
  for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) {
    mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.76, 10), mats.darkWood, x, 0.38, z, root);
  }
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), mats.brass, -0.38, 0.95, 0.24, root);
  const chin = mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 20, Math.PI), mats.brass, -0.38, 1.1, 0.24, root);
  chin.rotation.z = Math.PI;
  const card = canvasPlane(0.62, 0.3, [1024, 496], (g, W, H) => {
    g.fillStyle = '#efe9de';
    g.fillRect(0, 0, W, H);
    drawCross(g, W * 0.18, H * 0.5, H * 0.07);
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(W * 0.82, H * 0.5, H * 0.06, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6a6066';
    g.textAlign = 'center';
    g.font = '700 30px Nunito, system-ui, sans-serif';
    g.fillText(t(L('Blunda med vänster öga · titta på krysset', 'Close your left eye · look at the cross')), W / 2, H * 0.88);
  });
  card.mesh.position.set(0, 1.3, -0.24);
  card.mesh.rotation.x = -0.12;
  root.add(card.mesh);
  mesh(rbox(0.66, 0.34, 0.03, 0.01), mats.darkWood, 0, 1.3, -0.262, root).rotation.x = -0.12;
  mesh(new THREE.BoxGeometry(0.04, 0.36, 0.04), mats.darkWood, 0, 0.98, -0.27, root);
  ctx.interaction.add(card.mesh, { label: L('Öppna kortet i helskärm', 'Open the card full-screen'), onClick: () => open() });

  // ---- a big model eye with the optic nerve leaving at the blind spot
  const eyeRoot = new THREE.Group();
  eyeRoot.position.set(1.05, 1.25, -0.05);
  root.add(eyeRoot);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 10), mats.brass, 0, -0.75, 0, eyeRoot);
  mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 24), mats.darkWood, 0, -1.23, 0, eyeRoot);
  const ball = new THREE.Group();
  eyeRoot.add(ball);
  mesh(new THREE.SphereGeometry(0.24, 32, 20), new THREE.MeshStandardMaterial({ color: 0xf2ece4, roughness: 0.35 }), 0, 0, 0, ball);
  const iris = mesh(new THREE.CircleGeometry(0.095, 32), new THREE.MeshStandardMaterial({ color: 0x3a7ab8, roughness: 0.4 }), 0, 0, 0.2405, ball);
  mesh(new THREE.CircleGeometry(0.045, 24), mats.black, 0, 0, 0.001, iris);
  // optic nerve leaves the back of the eye on the nose side, ~15° from the fovea's axis
  const nerveMat = new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.6, emissive: 0xffa020, emissiveIntensity: 0.25 });
  const nerve = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.35, 12), nerveMat, 0, 0, 0, ball);
  const a = (15 * Math.PI) / 180;
  nerve.position.set(Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38);
  nerve.rotation.set(Math.PI / 2, 0, 0);
  nerve.rotation.y = a;
  const discMat = new THREE.MeshBasicMaterial({ color: 0xffc040 });
  mesh(new THREE.SphereGeometry(0.04, 16, 8), discMat, Math.sin(a) * 0.235, 0, -Math.cos(a) * 0.235, ball);
  ctx.interaction.add(ball, {
    label: L('Synnerven lämnar ögat här – där finns inga synceller', 'The optic nerve leaves the eye here – no light cells there'),
    onClick: () => {
      ctx.sfx.pop();
      buddy.say(L('Där synnerven går ut ur ögat finns inga synceller alls. Det är din blinda fläck!', "Where the optic nerve leaves the eye there are no light cells at all. That's your blind spot!"), 'idea');
    },
  });

  // ---- full-screen card
  const sepCm = (W: number) => Math.min(13, (W * 0.8) / pxPerCm);
  const predicted = (W: number) => sepCm(W) / Math.tan((BLIND_DEG * Math.PI) / 180);
  const MODE_NAMES: Record<Mode, L10n> = { dot: L('Prick', 'Dot'), buddy: L('Buddy', 'Buddy'), line: L('Bruten linje', 'Broken line') };

  function open() {
    if (overlay?.open) return;
    ctx.sfx.resume();
    const ov = openOverlay({
      background: '#f6f2ea',
      closeLabel: L('Stäng', 'Close'),
      onClose: () => {
        offLang();
        fc.dispose();
        overlay = null;
        buddy.celebrate(mode === 'line'
          ? L('Hjärnan lagade linjen! Den fyller i hålet med det som finns runt omkring.', 'Your brain mended the line! It fills the hole with whatever is around it.')
          : L('Försvann den? Du har en blind fläck i varje öga – och märker det aldrig.', "Did it vanish? You have a blind spot in each eye – and never notice."));
      },
    });
    overlay = ov;
    const fc = fullCanvas(ov.root, () => draw());
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute', left: '0', right: '0', bottom: 'max(16px, env(safe-area-inset-bottom))', display: 'flex',
      justifyContent: 'center', gap: '8px', flexWrap: 'wrap', padding: '0 12px',
    } satisfies Partial<CSSStyleDeclaration>);
    ov.root.appendChild(bar);
    const buttons = () => {
      bar.innerHTML = '';
      const mk = (label: string, active: boolean, fn: () => void) => {
        const b = document.createElement('button');
        Object.assign(b.style, {
          padding: '10px 16px', borderRadius: '999px', border: '0', fontWeight: '800', fontSize: '15px', cursor: 'pointer',
          background: active ? '#ff8a5c' : '#2a1f2c', color: active ? '#2b1606' : '#fff6ea',
        } satisfies Partial<CSSStyleDeclaration>);
        b.textContent = label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          ctx.sfx.click();
          fn();
          buttons();
          draw();
        });
        bar.appendChild(b);
      };
      (Object.keys(MODE_NAMES) as Mode[]).forEach((m) => mk(t(MODE_NAMES[m]), mode === m, () => (mode = m)));
      mk(eye === 'right' ? t(L('👁 Höger öga', '👁 Right eye')) : t(L('👁 Vänster öga', '👁 Left eye')), false, () => (eye = eye === 'right' ? 'left' : 'right'));
    };
    buttons();
    const offLang = onLangChange(() => {
      buttons();
      draw();
    });

    function draw() {
      const { g, size } = fc;
      const W = size.w;
      const H = size.h;
      g.fillStyle = '#f6f2ea';
      g.fillRect(0, 0, W, H);
      const cm = pxPerCm;
      const sep = sepCm(W) * cm;
      const dir = eye === 'right' ? 1 : -1; // the blind spot is on the temporal side: right for the right eye
      const cy = H * 0.5;
      const fx = W / 2 - (dir * sep) / 2;
      const tx = W / 2 + (dir * sep) / 2;
      drawCross(g, fx, cy, cm * 0.6);
      if (mode === 'dot') {
        g.fillStyle = '#d02a1a';
        g.beginPath();
        g.arc(tx, cy, cm * 0.5, 0, Math.PI * 2);
        g.fill();
      } else if (mode === 'buddy') {
        drawBuddyFace(g, tx, cy, cm * 0.75);
      } else {
        // a thick line with a gap right where the blind spot lands
        g.fillStyle = '#1f4fa8';
        const th = cm * 0.35;
        const gap = cm * 1.4;
        const x0 = fx + dir * cm * 2.2;
        const x1 = dir > 0 ? W : 0;
        const ga = tx - gap / 2;
        const gb = tx + gap / 2;
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        g.fillRect(lo, cy - th / 2, Math.max(0, ga - lo), th);
        g.fillRect(gb, cy - th / 2, Math.max(0, hi - gb), th);
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#4a4046';
      const fs = Math.round(Math.max(14, Math.min(22, W * 0.022)));
      g.font = `700 ${fs}px Nunito, system-ui, sans-serif`;
      const closeEye = eye === 'right' ? L('vänster', 'left') : L('höger', 'right');
      const useEye = eye === 'right' ? L('höger', 'right') : L('vänster', 'left');
      const what = mode === 'line' ? L('glappet i linjen', 'the gap in the line') : mode === 'buddy' ? L('Buddy', 'Buddy') : L('den röda pricken', 'the red dot');
      const lines = [
        t(L(`Blunda med ${closeEye.sv} öga. Titta stint på krysset med ${useEye.sv} öga.`, `Close your ${closeEye.en} eye. Stare at the cross with your ${useEye.en} eye.`)),
        t(L(`Flytta långsamt huvudet närmare eller längre bort. Vid ungefär ${fmt(predicted(W))} cm försvinner ${what.sv}.`, `Slowly move your head closer or farther. At about ${fmt(predicted(W))} cm, ${what.en} disappears.`)),
      ];
      lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.14 + i * fs * 1.6));
      g.fillStyle = '#8a8086';
      g.font = `600 ${Math.round(fs * 0.75)}px Nunito, system-ui, sans-serif`;
      g.fillText(t(L(`Avstånd mellan kryss och mål: ${fmt(sepCm(W), 1)} cm (kalibrera i panelen för exakta värden)`, `Cross to target: ${fmt(sepCm(W), 1)} cm (calibrate in the panel for exact values)`)), W / 2, H * 0.14 + 3.2 * fs * 1.0 + fs);
    }
    fc.fit();
  }

  // ---- HUD
  function controls(p: ControlPanel) {
    p.button(L('Öppna kortet i helskärm', 'Open the card full-screen'), open, { primary: true, icon: '▶' });
    p.buttons((Object.keys(MODE_NAMES) as Mode[]).map((m) => ({ label: MODE_NAMES[m], onClick: () => (mode = m) })), (Object.keys(MODE_NAMES) as Mode[]).indexOf(mode));
    p.heading(L('Kalibrera skärmen (valfritt)', 'Calibrate your screen (optional)'));
    p.note(L('Håll ett bankkort mot skärmen och dra reglaget tills den orangea rutan är exakt lika bred som kortet (8,56 cm).', 'Hold a bank card against the screen and drag the slider until the orange box is exactly as wide as the card (8.56 cm).'));
    const cardBox = document.createElement('div');
    Object.assign(cardBox.style, {
      height: '54px', borderRadius: '6px', border: '2px solid #ff8a5c', background: 'rgba(255,138,92,0.18)',
      maxWidth: '100%', boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);
    const setBox = () => (cardBox.style.width = `${pxPerCm * CARD_CM}px`);
    setBox();
    p.root.appendChild(cardBox);
    const dist = p.readout(L('Pricken bör försvinna vid', 'The dot should vanish at'));
    const upd = () => dist.set(`≈ ${fmt(predicted(Math.min(window.innerWidth, screen.width || window.innerWidth)))} cm`);
    upd();
    p.slider(L('Skärmens skala', 'Screen scale'), { min: 20, max: 90, step: 0.1, value: pxPerCm, format: (v) => `${fmt(v, 1)} px/cm` }, (v) => {
      pxPerCm = v;
      setBox();
      upd();
      try { localStorage.setItem(CAL_KEY, String(v)); } catch { /* ignore */ }
    });
  }

  ctx.addStation({
    id: 'perception-blindspot',
    title: L('Blinda fläcken', 'The blind spot'),
    position: pos,
    viewpoint: { position: [pos[0] - 1.8, 1.55, pos[1] + 0.2], target: [pos[0] + 0.3, 1.2, pos[1] + 0.6] },
    intro: L('Du har ett hål i synfältet just nu – i båda ögonen! Vill du hitta ditt?', 'You have a hole in your vision right now – in both eyes! Want to find yours?'),
    howTo: L('Öppna kortet. Blunda med vänster öga, titta på krysset och flytta huvudet långsamt fram och tillbaka.', 'Open the card. Close your left eye, look at the cross and slowly move your head back and forth.'),
    science: L(
      'Där synnerven och blodkärlen lämnar ögat, på näthinnans näs-sida, finns en fläck på cirka 1,5 mm helt utan tappar och stavar. Den hamnar ungefär 15° ut åt tinningsidan i synfältet och är cirka 5° bred, plats för tio fullmånar bredvid varandra. När bilden av pricken landar där finns det ingen cell som kan se den. Du märker aldrig hålet, eftersom det andra ögat täcker upp och hjärnan dessutom fyller i fläcken med det som finns runt omkring. Därför ser den brutna linjen hel ut.',
      'Where the optic nerve and blood vessels leave the eye, on the nose side of the retina, there is a patch about 1.5 mm across with no cones or rods at all. It falls about 15° out towards your temple in your field of view and is about 5° wide, room for ten full moons side by side. When the image of the dot lands there, no cell can see it. You never notice the hole, because the other eye covers for it and your brain fills the patch in with whatever surrounds it. That is why the broken line looks whole.',
    ),
    wow: L(
      'Bläckfiskens öga har ingen blind fläck: där sitter nervtrådarna bakom syncellerna i stället för framför.',
      "An octopus eye has no blind spot: its nerve fibres run behind the light cells instead of in front of them.",
    ),
    controls,
    onBlur() {
      overlay?.close();
    },
  });

  return {
    update(_dt: number, time: number) {
      ball.rotation.y = 0.35 + Math.sin(time * 0.4) * 0.35;
      ball.rotation.x = Math.sin(time * 0.27) * 0.12;
      discMat.color.setRGB(1.4, 1.0 + 0.3 * Math.sin(time * 3), 0.35);
      nerveMat.emissiveIntensity = 0.2 + 0.15 * Math.sin(time * 3);
    },
  };
}
