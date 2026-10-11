/**
 * Station 3: negative afterimage. A Nordic flag painted in its opponent colours (computed in OKLab) is shown
 * full-screen; after a countdown the screen turns white and the visitor's own fatigued cones paint the real flag.
 */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel } from '../../core/controlPanel';
import { type BuddyGate, type Overlay, canvasPlane, fmt, fullCanvas, hexCss, inducerFor, mats, mesh, openOverlay, rbox } from './common';

interface Flag {
  name: L10n;
  w: number;
  h: number;
  field: number;
  /** Cross layers drawn in order: [colour, vertical bar x0..x1, horizontal bar y0..y1] in flag units. */
  cross: [number, number, number, number, number][];
}

const FLAGS: Flag[] = [
  { name: L('Sverige', 'Sweden'), w: 16, h: 10, field: 0x006aa7, cross: [[0xfecc02, 5, 7, 4, 6]] },
  { name: L('Norge', 'Norway'), w: 22, h: 16, field: 0xba0c2f, cross: [[0xffffff, 6, 10, 6, 10], [0x00205b, 7, 9, 7, 9]] },
  { name: L('Finland', 'Finland'), w: 18, h: 11, field: 0xffffff, cross: [[0x002f6c, 5, 8, 4, 7]] },
];

function drawFlag(g: CanvasRenderingContext2D, f: Flag, x: number, y: number, w: number, h: number, inverted: boolean) {
  const col = (hex: number) => (inverted ? inducerFor(hex) : hexCss(hex));
  const sx = w / f.w;
  const sy = h / f.h;
  g.fillStyle = col(f.field);
  g.fillRect(x, y, w, h);
  for (const [c, x0, x1, y0, y1] of f.cross) {
    g.fillStyle = col(c);
    g.fillRect(x + x0 * sx, y, (x1 - x0) * sx, h);
    g.fillRect(x, y + y0 * sy, w, (y1 - y0) * sy);
  }
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export function buildAfterimage(ctx: RoomContext, buddy: BuddyGate, pos: [number, number]) {
  const root = new THREE.Group();
  root.position.set(pos[0] - 0.3, 0, pos[1]);
  root.rotation.y = Math.PI / 2; // faces +x
  ctx.group.add(root);
  ctx.addCollider(pos[0] - 0.3, pos[1] - 0.3, 0.9, 2.6);

  let flagIndex = 0;
  let seconds = 25;
  let overlay: Overlay | null = null;
  let runs = 0;

  // ---- the easel in the room
  const legGeo = new THREE.CylinderGeometry(0.03, 0.035, 2.1, 10);
  for (const x of [-0.75, 0.75]) {
    const leg = mesh(legGeo, mats.wood, x, 1.03, 0, root);
    leg.rotation.x = -0.08;
  }
  mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.0, 10), mats.wood, 0, 0.98, -0.35, root).rotation.x = 0.3;
  mesh(rbox(1.75, 1.12, 0.06, 0.03), mats.darkWood, 0, 1.55, 0.05, root);
  mesh(rbox(1.8, 0.06, 0.16, 0.02), mats.brass, 0, 0.96, 0.1, root);
  const art = canvasPlane(1.6, 1.0, [1024, 640], (g, W, H) => {
    drawFlag(g, FLAGS[flagIndex], 0, 0, W, H, true);
    dot(g, W / 2, H / 2, 10);
  });
  art.mesh.position.set(0, 1.55, 0.085);
  root.add(art.mesh);
  const label = canvasPlane(1.6, 0.3, [1024, 192], (g, W, H) => {
    g.fillStyle = '#3a2418';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9a050';
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd9a8';
    g.font = '800 72px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Den konstiga flaggan', 'The strange flag')), W / 2, H * 0.4);
    g.font = '700 38px "Nunito", system-ui, sans-serif';
    g.fillStyle = '#f3c99a';
    g.fillText(t(L('Stirra 20–30 s, titta sedan på vitt', 'Stare for 20–30 s, then look at white')), W / 2, H * 0.77);
  });
  label.mesh.position.set(0, 2.32, 0.05);
  root.add(label.mesh);
  // a little white "look here afterwards" board next to it
  mesh(rbox(0.7, 0.9, 0.04, 0.02), mats.cream, 1.25, 1.05, -0.05, root).rotation.y = -0.3;
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), mats.brass, 1.25, 0.3, -0.05, root);
  mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 20), mats.darkWood, 1.25, 0.02, -0.05, root);

  ctx.interaction.add(art.mesh, { label: L('Starta i helskärm', 'Start full-screen'), onClick: () => start() });

  // ---- full-screen experiment
  function start() {
    if (overlay?.open) return;
    ctx.sfx.resume();
    const flag = FLAGS[flagIndex];
    let phase: 'stare' | 'white' | 'compare' = 'stare';
    const t0 = performance.now();
    let tWhite = 0;
    let raf = 0;
    let lastSec = -1;
    const ov = openOverlay({
      background: '#ffffff',
      closeLabel: L('Stäng', 'Close'),
      onClose: () => {
        cancelAnimationFrame(raf);
        offLang();
        fc.dispose();
        overlay = null;
        if (phase !== 'stare') {
          runs++;
          buddy.celebrate(runs === 1
            ? L('Såg du flaggan i rätt färger? Den fanns bara i din hjärna!', 'Did you see the flag in the right colours? It only existed in your brain!')
            : L('Prova en annan flagga, eller stirra längre för en starkare efterbild.', 'Try another flag, or stare longer for a stronger afterimage.'));
        }
      },
    });
    overlay = ov;
    const fc = fullCanvas(ov.root, () => draw());
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute', left: '0', right: '0', bottom: 'max(18px, env(safe-area-inset-bottom))', display: 'flex',
      justifyContent: 'center', gap: '10px', flexWrap: 'wrap', padding: '0 12px', zIndex: '2',
    } satisfies Partial<CSSStyleDeclaration>);
    ov.root.appendChild(bar);
    const mkBtn = (text: L10n, fn: () => void) => {
      const b = document.createElement('button');
      Object.assign(b.style, {
        padding: '12px 20px', borderRadius: '999px', border: '0', fontWeight: '800', fontSize: '16px',
        background: '#2a1f2c', color: '#fff6ea', cursor: 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      b.textContent = t(text);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.sfx.click();
        fn();
      });
      bar.appendChild(b);
    };
    const showButtons = () => {
      bar.innerHTML = '';
      mkBtn(L('↺ Igen', '↺ Again'), () => {
        ov.close();
        start();
      });
      mkBtn(phase === 'compare' ? L('Visa vitt', 'Show white') : L('Jämför med riktiga flaggan', 'Compare with the real flag'), () => {
        phase = phase === 'compare' ? 'white' : 'compare';
        showButtons();
        draw();
      });
    };
    const offLang = onLangChange(() => {
      if (phase !== 'stare') showButtons();
      draw();
    });

    function draw() {
      const { g, size } = fc;
      const W = size.w;
      const H = size.h;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      // flag as large as fits, keeping its proportions
      const s = Math.min((W * 0.86) / flag.w, (H * 0.7) / flag.h);
      const fw = flag.w * s;
      const fh = flag.h * s;
      const fx = (W - fw) / 2;
      const fy = (H - fh) / 2;
      const r = Math.max(4, Math.min(W, H) * 0.008);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (phase === 'stare') {
        drawFlag(g, flag, fx, fy, fw, fh, true);
        dot(g, W / 2, H / 2, r);
        const left = Math.max(0, seconds - (performance.now() - t0) / 1000);
        g.fillStyle = '#3a3036';
        g.font = `800 ${Math.round(Math.min(34, H * 0.045))}px "Baloo 2", "Nunito", system-ui, sans-serif`;
        g.fillText(t(L('Stirra på pricken. Rör inte blicken!', "Stare at the dot. Don't move your eyes!")), W / 2, fy / 2);
        g.fillText(fmt(Math.ceil(left)), W / 2, fy + fh + (H - fy - fh) / 2);
      } else if (phase === 'white') {
        dot(g, W / 2, H / 2, r);
        if (performance.now() - tWhite > 1500) {
          g.fillStyle = '#9a9096';
          g.font = `700 ${Math.round(Math.min(24, H * 0.035))}px "Nunito", system-ui, sans-serif`;
          g.fillText(t(L('Ser du flaggan i rätt färger? Blinka om den bleknar.', 'Do you see the flag in its true colours? Blink if it fades.')), W / 2, fy / 2);
        }
      } else {
        drawFlag(g, flag, fx, fy, fw, fh, false);
        g.fillStyle = '#3a3036';
        g.font = `700 ${Math.round(Math.min(24, H * 0.035))}px "Nunito", system-ui, sans-serif`;
        g.fillText(t(L('Den riktiga flaggan. Stämde din efterbild?', 'The real flag. Did your afterimage match?')), W / 2, fy / 2);
      }
    }

    const tick = () => {
      const now = performance.now();
      if (phase === 'stare') {
        const el = (now - t0) / 1000;
        const sec = Math.ceil(seconds - el);
        if (sec !== lastSec) {
          lastSec = sec;
          if (sec <= 3 && sec > 0) ctx.sfx.tone(660, 0.06, { type: 'sine', gain: 0.05 });
          draw();
        }
        if (el >= seconds) {
          phase = 'white';
          tWhite = now;
          ctx.sfx.tone(990, 0.15, { type: 'sine', gain: 0.07 });
          draw();
          window.setTimeout(() => {
            if (ov.open && phase === 'white') draw();
          }, 1600);
          window.setTimeout(() => {
            if (ov.open) showButtons();
          }, 6000);
        }
      }
      if (ov.open) raf = requestAnimationFrame(tick);
    };
    fc.fit();
    raf = requestAnimationFrame(tick);
  }

  // ---- HUD
  function controls(p: ControlPanel) {
    p.button(L('Starta i helskärm', 'Start full-screen'), start, { primary: true, icon: '▶' });
    p.buttons(FLAGS.map((f, i) => ({
      label: f.name,
      onClick: () => {
        flagIndex = i;
        art.redraw();
        swatches();
      },
    })), flagIndex);
    p.slider(L('Stirrtid', 'Stare time'), { min: 10, max: 40, step: 1, value: seconds, format: (v) => `${fmt(v)} s` }, (v) => (seconds = v));
    p.heading(L('Färgerna du stirrar på → efterbilden', 'Colours you stare at → the afterimage'));
    const box = document.createElement('div');
    Object.assign(box.style, { display: 'flex', flexDirection: 'column', gap: '6px' } satisfies Partial<CSSStyleDeclaration>);
    p.root.appendChild(box);
    const swatches = () => {
      const f = FLAGS[flagIndex];
      const cols = [f.field, ...f.cross.map((c) => c[0])];
      box.innerHTML = '';
      for (const c of cols) {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontVariantNumeric: 'tabular-nums' } satisfies Partial<CSSStyleDeclaration>);
        const sw = (css: string) => {
          const s = document.createElement('span');
          Object.assign(s.style, { width: '34px', height: '22px', borderRadius: '6px', background: css, border: '1px solid rgba(255,255,255,0.3)', flex: 'none' } satisfies Partial<CSSStyleDeclaration>);
          return s;
        };
        const inv = inducerFor(c);
        const txt = document.createElement('span');
        txt.textContent = `${inv}  →  ${hexCss(c)}`;
        row.append(sw(inv), document.createTextNode('→'), sw(hexCss(c)), txt);
        box.appendChild(row);
      }
    };
    swatches();
    p.note(L(
      'Datorn speglar varje färg genom grått i OKLab-färgrymden: blått ↔ gult, rött ↔ grönt, ljust ↔ mörkt. Det är samma motsatspar som synsystemet använder.',
      'The computer mirrors each colour through grey in the OKLab colour space: blue ↔ yellow, red ↔ green, light ↔ dark. These are the same opponent pairs your visual system uses.',
    ));
  }

  ctx.addStation({
    id: 'perception-afterimage',
    title: L('Den konstiga flaggan', 'The strange flag'),
    position: pos,
    viewpoint: { position: [pos[0] + 2.3, 1.6, pos[1]], target: [pos[0] - 0.3, 1.45, pos[1] - 0.45] },
    intro: L('Den här flaggan har fel färger. Stirra på den en stund, så rättar din hjärna till den!', 'This flag has the wrong colours. Stare at it for a while and your brain will fix it!'),
    howTo: L('Tryck "Starta i helskärm". Stirra på den svarta pricken utan att flytta blicken tills skärmen blir vit.', 'Press "Start full-screen". Stare at the black dot without moving your eyes until the screen turns white.'),
    science: L(
      'Näthinnan har tre sorters tappar (för korta, mellanlånga och långa våglängder). När du stirrar på orange tröttnar de tappar som tar emot mest av det ljuset och blir mindre känsliga i några sekunder. Sedan räknar nervcellerna i ögat och hjärnan ut skillnader i motsatspar: blått mot gult, rött mot grönt, ljust mot mörkt. När du tittar på vitt svarar de trötta tapparna svagare, så skillnaden tippar över åt motsatt färg: det orangea blir blått och det mörkblå blir gult. Efterbilden är inte "inbränd" i ögat; den bleknar på några sekunder när tapparna återhämtar sig.',
      'Your retina has three kinds of cones (for short, medium and long wavelengths). When you stare at orange, the cones that catch most of that light get tired and become less sensitive for a few seconds. Nerve cells in the eye and brain then compute differences in opponent pairs: blue versus yellow, red versus green, light versus dark. When you look at white, the tired cones answer more weakly, so the balance tips towards the opposite colour: orange turns blue and dark blue turns yellow. The afterimage is not "burned into" your eye; it fades within seconds as the cones recover.',
    ),
    wow: L(
      'Efterbilden följer med blicken: titta på en vägg längre bort så blir flaggan större, eftersom den sitter på samma ställe på näthinnan.',
      'The afterimage moves with your gaze: look at a wall farther away and the flag gets bigger, because it sits on the same patch of retina.',
    ),
    controls,
    onBlur() {
      overlay?.close();
    },
  });

  return {};
}
