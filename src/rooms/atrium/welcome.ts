/**
 * Station 'welcome': a curved wooden reception desk with a glowing info screen
 * (click it to flip pages) and a "where should I start?" quiz in the panel.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { L, onLangChange, t } from '../../core/i18n';
import { ControlPanel } from '../../core/controlPanel';
import { drawText, radialSpot } from '../../core/textures';
import type { L10n, RoomContext, RoomId } from '../../core/types';
import { buddyThrottle, polar, type Mats } from './common';

export const DESK_ANGLE = 334.3; // midway between the corridors to Electricity (0°) and Chemistry (308.6°)
const R_IN = 7.2;
const R_OUT = 7.85;
const SPAN = 10; // ± degrees
const DESK_H = 1.0;

/** Mirrors the room titles and icons in src/rooms/<id>/index.ts. */
const ROOMS: { id: RoomId; icon: string; title: L10n; color: string }[] = [
  { id: 'electricity', icon: '⚡', title: L('Elektricitet & Energi', 'Electricity & Energy'), color: '#ffc23d' },
  { id: 'light', icon: '🌈', title: L('Ljus & Optik', 'Light & Optics'), color: '#ff5fa2' },
  { id: 'sound', icon: '🎵', title: L('Ljud & Vågor', 'Sound & Waves'), color: '#4fd1ff' },
  { id: 'motion', icon: '🎢', title: L('Kraft & Rörelse', 'Forces & Motion'), color: '#7cff6b' },
  { id: 'space', icon: '🪐', title: L('Rymden', 'Space'), color: '#8f7bff' },
  { id: 'perception', icon: '🧠', title: L('Hjärna & Sinnen', 'Brain & Senses'), color: '#ff8a5c' },
  { id: 'chemistry', icon: '🧪', title: L('Kemilabbet', 'Chemistry Lab'), color: '#3dffb5' },
];
const room = (id: RoomId) => ROOMS.find((r) => r.id === id)!;

type Score = Partial<Record<RoomId, number>>;
const QUIZ: { q: L10n; options: { label: L10n; score: Score }[] }[] = [
  {
    q: L('1/3 · Vad gör du helst en regnig söndag?', '1/3 · What would you rather do on a rainy Sunday?'),
    options: [
      { label: L('🔧 Bygger något med skruvar och sladdar', '🔧 Build something with screws and wires'), score: { electricity: 2, motion: 1 } },
      { label: L('🎨 Ritar, målar eller fotar', '🎨 Draw, paint or take photos'), score: { light: 2, perception: 1 } },
      { label: L('🎸 Spelar musik eller sjunger', '🎸 Play music or sing'), score: { sound: 2, perception: 1 } },
      { label: L('🧁 Bakar och experimenterar i köket', '🧁 Bake and experiment in the kitchen'), score: { chemistry: 2, light: 1 } },
    ],
  },
  {
    q: L('2/3 · Välj en superkraft!', '2/3 · Pick a superpower!'),
    options: [
      { label: L('⚡ Styra blixtar', '⚡ Control lightning'), score: { electricity: 2, light: 1 } },
      { label: L('🚀 Flyga till månen', '🚀 Fly to the Moon'), score: { space: 2, motion: 1 } },
      { label: L('🕵️ Läsa tankar och aldrig bli lurad', '🕵️ Read minds and never be fooled'), score: { perception: 2, sound: 1 } },
      { label: L('🧪 Förvandla ett ämne till ett annat', '🧪 Turn one substance into another'), score: { chemistry: 2, electricity: 1 } },
    ],
  },
  {
    q: L('3/3 · Vilken fråga vill du helst ha svar på?', '3/3 · Which question would you most like answered?'),
    options: [
      { label: L('🌅 Varför är himlen blå men solnedgången röd?', '🌅 Why is the sky blue but the sunset red?'), score: { light: 2, space: 1 } },
      { label: L('🔊 Hur kan en sångare spräcka ett glas?', '🔊 How can a singer shatter a glass?'), score: { sound: 2, motion: 1 } },
      { label: L('🎢 Varför ramlar man inte ur en loop?', "🎢 Why don't you fall out of a loop-the-loop?"), score: { motion: 2, perception: 1 } },
      { label: L('🌍 Hur väger man en planet?', '🌍 How do you weigh a planet?'), score: { space: 2, chemistry: 1 } },
    ],
  },
];

const PAGES: { title: L10n; lines: L10n[] }[] = [
  {
    title: L('Välkommen till Gnistan!', 'Welcome to Gnistan!'),
    lines: [
      L('🚶 Gå med WASD/piltangenterna eller styrspaken', '🚶 Walk with WASD/arrow keys or the joystick'),
      L('👀 Dra med musen eller fingret för att titta', '👀 Drag with the mouse or a finger to look'),
      L('👆 Klicka på golvet för att gå dit', '👆 Click the floor to walk there'),
      L('✨ Tryck E (eller Utforska) vid ett experiment', '✨ Press E (or Explore) at an experiment'),
    ],
  },
  {
    title: L('Kartan', 'The map'),
    lines: [
      L('🗺️ Tryck M eller på knappen Karta', '🗺️ Press M or the Map button'),
      L('Där ser du var du är och alla sju rum', 'It shows where you are and all seven rooms'),
      L('Klicka på ett rum för att hoppa dit direkt', 'Click a room to jump straight there'),
      L('Eller följ neonskyltarna över korridorerna', 'Or follow the neon signs above the corridors'),
    ],
  },
  {
    title: L('Prata med Buddy', 'Talk to Buddy'),
    lines: [
      L('🤖 Buddy är din robotguide och följer med dig', '🤖 Buddy is your robot guide and follows you'),
      L('Tryck på Prata med Buddy och fråga vad du vill', 'Press Talk to Buddy and ask anything'),
      L('Du kan också skriva till Buddy i chatten', 'You can also type to Buddy in the chat'),
      L('Fråga till exempel: "Varför välter pinnarna?"', 'Try asking: "Why do the pegs fall over?"'),
    ],
  },
  { title: L('Sju rum att upptäcka', 'Seven rooms to discover'), lines: [] },
];

export function buildWelcome(ctx: RoomContext, mats: Mats) {
  const buddy = buddyThrottle(ctx.buddy);
  const g = new THREE.Group();
  g.name = 'welcome-desk';
  g.rotation.y = (DESK_ANGLE * Math.PI) / 180;
  ctx.group.add(g);

  // ------------------------------------------------------------------ the desk (annulus sector, extruded)
  // Shape coordinates (sx, sy) map to group-local (x = sx, z = −sy) after rotating the extrusion upright.
  const sector = (r0: number, r1: number, span: number) => {
    const a = (span * Math.PI) / 180;
    const s = new THREE.Shape();
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const al = -a + (2 * a * i) / n;
      const x = Math.sin(al) * r1;
      const z = Math.cos(al) * r1;
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    }
    for (let i = n; i >= 0; i--) {
      const al = -a + (2 * a * i) / n;
      s.lineTo(Math.sin(al) * r0, -Math.cos(al) * r0);
    }
    return s;
  };
  const bodyGeo = new THREE.ExtrudeGeometry(sector(R_IN, R_OUT, SPAN), { depth: DESK_H - 0.06, bevelEnabled: false, curveSegments: 24 });
  bodyGeo.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, mats.wood);
  g.add(body);
  const topGeo = new THREE.ExtrudeGeometry(sector(R_IN - 0.1, R_OUT + 0.04, SPAN + 0.9), {
    depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 24,
  });
  topGeo.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(topGeo, mats.darkWood);
  top.position.y = DESK_H - 0.06;
  g.add(top);
  // Warm LED strip along the visitor side, near the floor.
  const strip = new THREE.Mesh(
    new THREE.TorusGeometry(R_IN - 0.02, 0.018, 6, 48, (2 * SPAN * Math.PI) / 180),
    mats.warmGlow,
  );
  strip.rotation.x = Math.PI / 2;
  // Torus arc starts at +x and runs towards −z (in its own XY before the rotation); turn it to centre on +z.
  strip.rotation.z = Math.PI / 2 - (SPAN * Math.PI) / 180;
  strip.position.y = 0.12;
  g.add(strip);

  // Front sign "Gnistan · Info" on the visitor side.
  const signTex = new THREE.CanvasTexture(document.createElement('canvas'));
  const signCanvas = signTex.image as HTMLCanvasElement;
  signCanvas.width = 1024;
  signCanvas.height = 192;
  signTex.colorSpace = THREE.SRGBColorSpace;
  drawText(signCanvas.getContext('2d')!, 1024, 192, '✦ GNISTAN · INFO ✦', {
    color: '#ffe2b0', glow: '#ff9a40', font: '700 92px "Baloo 2", system-ui, sans-serif',
  });
  signTex.needsUpdate = true;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.3),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  sign.position.set(0, 0.62, R_IN - 0.08);
  sign.rotation.y = Math.PI;
  g.add(sign);

  // ------------------------------------------------------------------ the info screen
  const screenPivot = new THREE.Group();
  screenPivot.position.set(0, DESK_H, R_IN + 0.32);
  screenPivot.rotation.y = Math.PI; // face the centre of the atrium
  g.add(screenPivot);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.12, 0.4, 16).translate(0, 0.2, 0), mats.brass);
  screenPivot.add(stand);
  const tilt = new THREE.Group();
  tilt.position.y = 0.72;
  tilt.rotation.x = -0.14;
  screenPivot.add(tilt);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.86, 0.06, 3, 0.03), mats.darkBrass);
  frame.position.z = -0.035;
  tilt.add(frame);
  const SW = 1024;
  const SH = 660;
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SW;
  screenCanvas.height = SH;
  const sg = screenCanvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.24, 0.8),
    new THREE.MeshBasicMaterial({ map: screenTex, color: 0xe8e8e8 }),
  );
  tilt.add(screen);

  let page = 0;
  let pageTimer = 0;
  let pageHold = 0;
  const font = '"Baloo 2", "Nunito", system-ui, sans-serif';
  const drawScreen = () => {
    const grad = sg.createLinearGradient(0, 0, 0, SH);
    grad.addColorStop(0, '#1d1530');
    grad.addColorStop(1, '#2c1a22');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, SW, SH);
    sg.strokeStyle = 'rgba(255,190,110,0.5)';
    sg.lineWidth = 4;
    sg.strokeRect(14, 14, SW - 28, SH - 28);
    const p = PAGES[page];
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    sg.font = `800 64px ${font}`;
    sg.shadowColor = '#ff9a40';
    sg.shadowBlur = 18;
    sg.fillStyle = '#ffe2b0';
    sg.fillText(t(p.title), SW / 2, 82);
    sg.shadowBlur = 0;
    if (p.lines.length) {
      sg.textAlign = 'left';
      sg.font = `600 38px ${font}`;
      sg.fillStyle = '#f4ead8';
      p.lines.forEach((ln, i) => sg.fillText(t(ln), 70, 185 + i * 92, SW - 140));
    } else {
      sg.textAlign = 'left';
      sg.font = `600 36px ${font}`;
      ROOMS.forEach((r, i) => {
        const col = i < 4 ? 0 : 1;
        const row = i < 4 ? i : i - 4;
        const x = 60 + col * 480;
        const y = 180 + row * 92;
        sg.fillStyle = r.color;
        sg.fillText(`${r.icon}  ${t(r.title)}`, x, y, 450);
      });
      sg.fillStyle = '#f4ead8';
      sg.font = `600 32px ${font}`;
      sg.fillText(t(L('Följ neonskyltarna!', 'Follow the neon signs!')), 540, 180 + 3 * 92, 440);
    }
    // Footer: page dots and a hint.
    sg.textAlign = 'center';
    sg.font = `500 28px ${font}`;
    sg.fillStyle = 'rgba(255,226,176,0.75)';
    sg.fillText(t(L('Klicka på skärmen för nästa sida', 'Click the screen for the next page')), SW / 2, SH - 52);
    PAGES.forEach((_, i) => {
      sg.fillStyle = i === page ? '#ffb45a' : 'rgba(255,226,176,0.3)';
      sg.beginPath();
      sg.arc(SW / 2 - 45 + i * 30, SH - 92, 8, 0, Math.PI * 2);
      sg.fill();
    });
    screenTex.needsUpdate = true;
  };
  drawScreen();
  ctx.interaction.add(screen, {
    label: L('Nästa sida', 'Next page'),
    onClick: () => {
      page = (page + 1) % PAGES.length;
      pageHold = 25;
      pageTimer = 0;
      ctx.sfx.tone(880, 0.06, { type: 'sine', gain: 0.08, to: 1320 });
      drawScreen();
    },
  });
  onLangChange(drawScreen);

  // Light pool on the floor in front of the desk.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({
      map: radialSpot('rgba(255,200,140,0.9)', 'rgba(255,200,140,0)'), transparent: true, opacity: 0.18,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.01, R_IN - 0.9);
  g.add(pool);

  // Colliders along the arc (axis-aligned boxes, so use small overlapping squares).
  for (const da of [-8, -4, 0, 4, 8]) {
    const [x, z] = polar((R_IN + R_OUT) / 2, DESK_ANGLE + da);
    ctx.addCollider(x, z, 0.82, 0.82);
  }

  // ------------------------------------------------------------------ station + quiz
  let qIndex = 0;
  const scores: Record<string, number> = {};
  let result: RoomId | null = null;
  const pickRoom = (): RoomId => {
    let best: RoomId = 'electricity';
    let bs = -1;
    for (const r of ROOMS) {
      const s = scores[r.id] ?? 0;
      if (s > bs) {
        bs = s;
        best = r.id;
      }
    }
    return best;
  };
  const renderQuiz = (box: HTMLElement) => {
    box.replaceChildren();
    const p = new ControlPanel(box, ctx.sfx);
    if (result) {
      const r = room(result);
      p.heading(L(`Börja i ${r.icon} ${r.title.sv}!`, `Start in ${r.icon} ${r.title.en}!`));
      p.note(L(
        `Leta efter neonskylten ${r.icon} ${r.title.sv} över en av korridorerna, eller öppna kartan (M) och hoppa dit direkt.`,
        `Look for the neon sign ${r.icon} ${r.title.en} above one of the corridors, or open the map (M) and jump straight there.`,
      ));
      p.button(L('Gör quizet igen', 'Take the quiz again'), () => {
        qIndex = 0;
        result = null;
        for (const k of Object.keys(scores)) delete scores[k];
        renderQuiz(box);
      }, { icon: '↺' });
      return;
    }
    const q = QUIZ[qIndex];
    p.note(q.q).style.fontWeight = '700';
    q.options.forEach((o) =>
      p.button(o.label, () => {
        for (const [id, s] of Object.entries(o.score)) scores[id] = (scores[id] ?? 0) + (s ?? 0) + qIndex * 0.01;
        qIndex++;
        if (qIndex >= QUIZ.length) {
          result = pickRoom();
          const r = room(result);
          ctx.sfx.chime();
          buddy.celebrate(L(
            `Jag tycker att du ska börja i ${r.title.sv}! Häng med!`,
            `I think you should start in ${r.title.en}! Come on!`,
          ));
        }
        renderQuiz(box);
      }),
    );
  };

  const deskPos = polar((R_IN + R_OUT) / 2, DESK_ANGLE);
  const cam = polar(R_IN - 2.4, DESK_ANGLE);
  const screenAt = polar(R_IN + 0.3, DESK_ANGLE);
  const a = (DESK_ANGLE * Math.PI) / 180;
  // Camera looks outwards along (sin a, cos a); its right-hand side is (−cos a, sin a).
  const right: [number, number] = [-Math.cos(a), Math.sin(a)];
  ctx.addStation({
    id: 'welcome',
    title: L('Välkomstdisken', 'Welcome desk'),
    position: deskPos,
    viewpoint: {
      position: [cam[0], 1.65, cam[1]],
      target: [screenAt[0] + right[0] * 0.4, 1.5, screenAt[1] + right[1] * 0.4],
    },
    intro: L(
      'Välkommen till Gnistan! Här får du veta hur allt funkar, och jag kan hjälpa dig välja var du ska börja.',
      'Welcome to Gnistan! Here you can find out how everything works, and I can help you choose where to start.',
    ),
    howTo: L(
      'Klicka på skärmen för att bläddra. Gör quizet här intill så föreslår jag ett rum.',
      "Click the screen to flip through it. Take the quiz here and I'll suggest a room.",
    ),
    science: L(
      'Gnistan har sju rum runt atriet, som ekrarna i ett hjul. Varje experiment går att ändra på, så det finns alltid mer än ett svar att upptäcka. Forskare på museet Exploratorium i San Francisco har visat att man lär sig mest när man själv ställer frågorna och testar: "Vad händer om jag …?" Så gissa först, testa sedan och se om du hade rätt. Att ha fel är en helt vanlig del av vetenskap, inte ett misslyckande.',
      'Gnistan has seven rooms around the atrium, like the spokes of a wheel. You can change every experiment, so there is always more than one answer to discover. Researchers at the Exploratorium museum in San Francisco have shown that people learn most when they ask the questions and test things themselves: "What happens if I …?" So guess first, then test and see if you were right. Being wrong is a perfectly normal part of science, not a failure.',
    ),
    wow: L(
      'Pendeln mitt i atriet är 15 meter hög, ungefär lika hög som ett femvåningshus.',
      'The pendulum in the middle of the atrium is 15 metres tall, about as tall as a five-storey building.',
    ),
    controls: (panel) => {
      panel.heading(L('Så funkar Gnistan', 'How Gnistan works'));
      panel.note(L(
        'Gå med WASD, piltangenterna eller styrspaken och titta runt genom att dra. Klicka på golvet för att gå dit. Vid ett experiment trycker du på E eller Utforska.',
        'Walk with WASD, the arrow keys or the joystick, and drag to look around. Click the floor to walk there. At an experiment, press E or Explore.',
      ));
      panel.note(L(
        'Kartan (M) visar var du är och tar dig direkt till alla rum. Buddy följer med dig: tryck på Prata med Buddy och fråga vad du vill.',
        'The map (M) shows where you are and takes you straight to any room. Buddy comes along: press Talk to Buddy and ask anything.',
      ));
      panel.note(L(
        ROOMS.map((r) => `${r.icon} ${r.title.sv}`).join(' · '),
        ROOMS.map((r) => `${r.icon} ${r.title.en}`).join(' · '),
      ));
      panel.heading(L('Var ska jag börja?', 'Where should I start?'));
      const box = document.createElement('div');
      panel.root.appendChild(box);
      renderQuiz(box);
    },
  });

  return {
    update(dt: number) {
      pageTimer += dt;
      if (pageHold > 0) pageHold -= dt;
      else if (pageTimer > 9) {
        pageTimer = 0;
        page = (page + 1) % PAGES.length;
        drawScreen();
      }
    },
  };
}
