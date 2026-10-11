/**
 * Station 1: reaction time. A big button machine with a lamp, a score screen and a ruler-drop rig that
 * replays each result as the classic ruler test (d = ½·g·t², shown in slow motion).
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import { type BuddyGate, canvasPlane, fmt, mats, mesh, rbox } from './common';

const G = 9.82; // m/s², Sweden
const RULER_LEN = 0.5; // m (a 50 cm ruler)
const SLOWMO = 5;
const TRIES = 5;
const HS_KEY = 'gnistan.perception.reaction.best';

type Mode = 'light' | 'sound';
type Phase = 'idle' | 'wait' | 'go' | 'result' | 'false' | 'slow' | 'done';

function loadBest(): Record<Mode, number | null> {
  try {
    const v = JSON.parse(localStorage.getItem(HS_KEY) ?? 'null');
    if (v && typeof v === 'object') return { light: num(v.light), sound: num(v.sound) };
  } catch { /* storage blocked or corrupt */ }
  return { light: null, sound: null };
}
function num(v: unknown) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}
function saveBest(b: Record<Mode, number | null>) {
  try { localStorage.setItem(HS_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

export const dropDistance = (tSec: number) => 0.5 * G * tSec * tSec;

export function buildReaction(ctx: RoomContext, buddy: BuddyGate, pos: [number, number]) {
  const root = new THREE.Group();
  root.position.set(pos[0], 0, pos[1]);
  root.rotation.y = -Math.PI / 2; // front (+z local) faces -x, towards the room centre
  ctx.group.add(root);
  ctx.addCollider(pos[0], pos[1] + 0.17, 0.8, 1.75);

  // --- state
  let mode: Mode = 'light';
  let phase: Phase = 'idle';
  let goAt = 0; // performance.now() when the cue appeared
  let cueAt = 0; // when the cue should appear
  let times: number[] = [];
  let last: number | null = null;
  const best = loadBest();
  let focused = false;

  // --- cabinet
  mesh(rbox(1.2, 0.95, 0.62, 0.05), mats.wood, 0, 0.475, 0, root);
  mesh(rbox(1.26, 0.06, 0.68, 0.025), mats.darkWood, 0, 0.97, 0, root);
  const panel = mesh(rbox(1.0, 0.08, 0.42, 0.03), mats.cream, -0.05, 1.03, 0.08, root);
  panel.rotation.x = 0.18;
  // big mushroom button
  const btnBase = mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.07, 32), mats.brass, -0.15, 1.1, 0.12, root);
  btnBase.rotation.x = 0.18;
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd8322a, roughness: 0.35, emissive: 0xff3020, emissiveIntensity: 0.15 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.scale.y = 0.55;
  cap.position.set(0, 0.035, 0);
  btnBase.add(cap);
  // lamp tower
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), mats.brass, 0.42, 1.45, -0.18, root);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x401010 });
  const lamp = mesh(new THREE.SphereGeometry(0.13, 32, 16), lampMat, 0.42, 1.98, -0.18, root);
  mesh(new THREE.TorusGeometry(0.135, 0.018, 8, 32), mats.brass, 0, 0, 0, lamp).rotation.x = Math.PI / 2;
  const LAMP_OFF = new THREE.Color(0x3a1a12);
  const LAMP_RED = new THREE.Color(0xc0281c);
  const LAMP_GREEN = new THREE.Color(0x6dff7a).multiplyScalar(1.6);
  const LAMP_AMBER = new THREE.Color(0xffb040).multiplyScalar(1.2);
  // score screen
  mesh(rbox(0.74, 0.46, 0.06, 0.03), mats.darkWood, -0.18, 1.5, -0.22, root);
  const screen = canvasPlane(0.66, 0.38, [512, 296], (g, W, H) => drawScreen(g, W, H));
  screen.mesh.position.set(-0.18, 1.5, -0.188);
  root.add(screen.mesh);
  mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), mats.darkWood, -0.18, 1.1, -0.24, root);

  // Ruler-drop rig on the visitor's right (local +x): a post, a clamp arm and two "fingers" that pinch the ruler.
  const rig = new THREE.Group();
  rig.position.set(0.78, 0, 0.12);
  root.add(rig);
  mesh(rbox(0.3, 0.06, 0.3, 0.02), mats.darkWood, 0, 0.03, 0, rig);
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 12), mats.brass, -0.1, 1.0, -0.08, rig);
  mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), mats.brass, -0.04, 1.95, -0.08, rig);
  const FINGER_Y = 1.15;
  mesh(new THREE.BoxGeometry(0.1, 0.025, 0.025), mats.brass, -0.05, FINGER_Y - 0.03, -0.08, rig);
  const fingerGeo = rbox(0.05, 0.08, 0.035, 0.015);
  const fingerMat = new THREE.MeshStandardMaterial({ color: 0xe0a882, roughness: 0.7 });
  const fingerA = mesh(fingerGeo, fingerMat, 0.03, FINGER_Y, 0.05, rig);
  const fingerB = mesh(fingerGeo, fingerMat, 0.03, FINGER_Y, -0.05, rig);
  const rulerTex = canvasPlane(0.045, RULER_LEN, [64, 1024], drawRuler);
  const rulerBody = mesh(new THREE.BoxGeometry(0.05, RULER_LEN, 0.008), new THREE.MeshStandardMaterial({ color: 0xe8c860, roughness: 0.6 }), 0, 0, 0);
  const ruler = new THREE.Group();
  ruler.add(rulerBody);
  rulerTex.mesh.position.z = 0.0045; // the scale faces the visitor
  ruler.add(rulerTex.mesh);
  rig.add(ruler);
  const rulerRestY = FINGER_Y + RULER_LEN / 2; // the 0 cm mark sits between the fingers
  ruler.position.y = rulerRestY;
  let drop: { tReact: number; tau: number; done: boolean } | null = null;

  // signs
  {
    const s = canvasPlane(1.1, 0.22, [1024, 205], (g, W, H) => {
      g.fillStyle = '#3a2418';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffd9a8';
      g.font = `800 ${Math.round(H * 0.5)}px "Baloo 2", "Nunito", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t(L('⚡ Reaktionstest', '⚡ Reaction test')), W / 2, H / 2);
    });
    s.mesh.position.set(0, 0.7, 0.315);
    root.add(s.mesh);
  }

  // --- in-world interaction: the button reacts on pointer-down, not on release, so timing is fair
  ctx.interaction.add(cap, {
    label: L('Tryck!', 'Press!'),
    cursor: 'pointer',
    onDragStart: () => press(performance.now()),
  });
  ctx.interaction.add(lamp, { label: L('Lampan: vänta på grönt', 'The lamp: wait for green'), onDragStart: () => press(performance.now()) });

  // --- HUD bits (rebuilt with the panel)
  let pad: HTMLDivElement | null = null;
  let ro: { last: Readout; best5: Readout; avg: Readout; ruler: Readout; record: Readout; tries: Readout } | null = null;

  function msStr(v: number | null) {
    return v == null ? '–' : `${fmt(v)} ms`;
  }
  function stats() {
    const b = times.length ? Math.min(...times) : null;
    const a = times.length ? times.reduce((s, v) => s + v, 0) / times.length : null;
    return { b, a };
  }

  function phaseText(): { big: string; small: string; bg: string; fg: string } {
    const cue = mode === 'light' ? L('grönt', 'green') : L('pipet', 'the beep');
    switch (phase) {
      case 'idle':
        return { big: t(L('Tryck för att börja', 'Press to start')), small: t(L(`Vänta sedan på ${cue.sv} …`, `Then wait for ${cue.en} …`)), bg: '#3a2a20', fg: '#ffe6c4' };
      case 'wait':
        return { big: t(L('Vänta …', 'Wait …')), small: t(L(`Tryck när det blir ${cue.sv}`, `Press on ${cue.en}`)), bg: '#7a1d17', fg: '#ffd7cf' };
      case 'go':
        return { big: t(L('NU!', 'NOW!')), small: '', bg: mode === 'light' ? '#2fd14a' : '#7a1d17', fg: mode === 'light' ? '#062b0c' : '#ffd7cf' };
      case 'result':
        return { big: msStr(last), small: t(L(`Försök ${times.length} av ${TRIES}. Tryck för nästa.`, `Try ${times.length} of ${TRIES}. Press for the next one.`)), bg: '#2c3a46', fg: '#d8f6ff' };
      case 'false':
        return { big: t(L('Tjuvstart!', 'False start!')), small: t(L('Du tryckte innan signalen (eller under 100 ms). Tryck för att försöka igen.', 'You pressed before the cue (or within 100 ms). Press to try again.')), bg: '#5a2a5a', fg: '#ffe0ff' };
      case 'slow':
        return { big: t(L('Missade du?', 'Missed it?')), small: t(L('Mer än 1,5 s. Tryck för att försöka igen.', 'Over 1.5 s. Press to try again.')), bg: '#3a2a20', fg: '#ffe6c4' };
      case 'done': {
        const { b, a } = stats();
        return { big: `${t(L('Medel', 'Average'))} ${msStr(a == null ? null : Math.round(a))}`, small: t(L(`Bäst ${msStr(b)}. Tryck för en ny omgång.`, `Best ${msStr(b)}. Press for a new round.`)), bg: '#2c3a46', fg: '#d8f6ff' };
      }
    }
  }

  function refresh() {
    const p = phaseText();
    if (pad) {
      pad.style.background = p.bg;
      pad.style.color = p.fg;
      (pad.firstChild as HTMLElement).textContent = p.big;
      (pad.lastChild as HTMLElement).textContent = p.small;
    }
    if (ro) {
      const { b, a } = stats();
      ro.last.set(msStr(last));
      ro.best5.set(msStr(b));
      ro.avg.set(msStr(a == null ? null : Math.round(a)));
      ro.ruler.set(last == null ? '–' : dropDistance(last / 1000) > RULER_LEN ? t(L('föll igenom!', 'fell through!')) : `${fmt(dropDistance(last / 1000) * 100, 1)} cm`);
      ro.record.set(msStr(best[mode]));
      ro.tries.set(`${times.length} / ${TRIES}`);
    }
    // lamp
    const c = phase === 'wait' || (phase === 'go' && mode === 'sound') ? LAMP_RED
      : phase === 'go' ? LAMP_GREEN
      : phase === 'result' || phase === 'done' ? LAMP_AMBER : LAMP_OFF;
    lampMat.color.copy(c);
    screen.redraw();
  }

  function drawScreen(g: CanvasRenderingContext2D, W: number, H: number) {
    g.fillStyle = '#0d1a17';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(94,230,214,0.06)';
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7ef0d0';
    g.font = `800 ${Math.round(H * 0.3)}px "Baloo 2", system-ui, sans-serif`;
    const big = phase === 'wait' ? '…' : phase === 'go' ? t(L('NU!', 'NOW!')) : phase === 'false' ? t(L('TJUVSTART', 'FALSE START')) : last == null ? '— ms' : `${fmt(last)} ms`;
    g.fillText(big, W / 2, H * 0.4);
    g.font = `700 ${Math.round(H * 0.11)}px "Nunito", system-ui, sans-serif`;
    g.fillStyle = '#c9f6ea';
    const { b } = stats();
    const rec = best[mode];
    g.fillText(`${t(L('Bäst', 'Best'))}: ${msStr(b)}   ${t(L('Rekord', 'Record'))}: ${msStr(rec)}`, W / 2, H * 0.74);
    g.fillStyle = '#86b8ac';
    g.font = `700 ${Math.round(H * 0.08)}px "Nunito", system-ui, sans-serif`;
    g.fillText(mode === 'light' ? t(L('👁 Ljussignal', '👁 Light cue')) : t(L('🔊 Ljudsignal', '🔊 Sound cue')), W / 2, H * 0.9);
  }

  function startWait() {
    if (phase === 'done' || times.length >= TRIES) times = [];
    phase = 'wait';
    cueAt = performance.now() + 1500 + Math.random() * 2500; // 1.5–4 s, unpredictable
    ctx.sfx.tone(330, 0.06, { type: 'triangle', gain: 0.05 });
    refresh();
  }

  function goCue() {
    phase = 'go';
    goAt = performance.now();
    if (mode === 'sound') {
      ctx.sfx.tone(1000, 0.12, { type: 'square', gain: 0.14 });
      // The beep leaves the speakers a little after it is scheduled: start the clock when it is actually heard.
      const ac = ctx.sfx.ctx;
      goAt += ((ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000;
    }
    refresh();
  }

  function press(ts: number) {
    if (!focused) return; // the machine only measures while you're at it
    ctx.sfx.resume();
    switch (phase) {
      case 'idle': case 'result': case 'false': case 'slow': case 'done':
        startWait();
        return;
      case 'wait':
        phase = 'false';
        ctx.sfx.error();
        refresh();
        return;
      case 'go': {
        const rt = ts - goAt;
        if (rt < 100) {
          // Faster than the nervous system allows: you guessed (sprint rules use the same 0.1 s limit).
          phase = 'false';
          ctx.sfx.error();
          refresh();
          return;
        }
        last = Math.round(rt);
        times.push(last);
        ctx.sfx.pop();
        startDrop(rt / 1000);
        const prevBest = best[mode];
        const newRecord = prevBest != null && last < prevBest;
        if (prevBest == null || last < prevBest) {
          best[mode] = last;
          saveBest(best);
        }
        if (times.length >= TRIES) {
          phase = 'done';
          ctx.sfx.chime();
          const avg = times.reduce((s, v) => s + v, 0) / times.length;
          buddy.celebrate(avg < 250
            ? L(`Medel ${fmt(avg)} millisekunder! Det är snabbare än de flesta.`, `Average ${fmt(avg)} milliseconds! That's faster than most people.`)
            : L(`Medel ${fmt(avg)} millisekunder. Prova med ljudsignal – örat brukar vinna!`, `Average ${fmt(avg)} milliseconds. Try the sound cue – ears usually win!`));
        } else {
          phase = 'result';
          if (newRecord) buddy.celebrate(L(`Nytt rekord: ${fmt(last)} ms!`, `New record: ${fmt(last)} ms!`));
        }
        refresh();
        return;
      }
    }
  }

  function startDrop(tReact: number) {
    drop = { tReact, tau: 0, done: false };
    ruler.position.y = rulerRestY;
    ctx.sfx.noise(0.25, { freq: 900, to: 300, gain: 0.05 });
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    press(e.timeStamp || performance.now());
  };

  function controls(p: ControlPanel) {
    p.buttons(
      [
        { label: L('Ljussignal', 'Light cue'), icon: '👁', onClick: () => setMode('light') },
        { label: L('Ljudsignal', 'Sound cue'), icon: '🔊', onClick: () => setMode('sound') },
      ],
      mode === 'light' ? 0 : 1,
    );
    pad = document.createElement('div');
    Object.assign(pad.style, {
      height: '150px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', textAlign: 'center', padding: '10px', touchAction: 'none',
      userSelect: 'none', border: '2px solid rgba(255,255,255,0.15)', transition: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    const big = document.createElement('div');
    Object.assign(big.style, { fontFamily: 'var(--display)', fontSize: '36px', fontWeight: '800', lineHeight: '1.1' });
    const small = document.createElement('div');
    Object.assign(small.style, { fontSize: '14px', marginTop: '6px', opacity: '0.85' });
    pad.append(big, small);
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press(e.timeStamp || performance.now());
    });
    p.root.appendChild(pad);
    p.note(L('Du kan också trycka på den stora röda knappen i maskinen eller på mellanslag.', 'You can also hit the big red button on the machine or the space bar.'));
    ro = {
      last: p.readout(L('Senaste', 'Last')),
      tries: p.readout(L('Försök', 'Tries')),
      best5: p.readout(L('Bäst av 5', 'Best of 5')),
      avg: p.readout(L('Medel', 'Average')),
      ruler: p.readout(L('Linjalen hann falla', 'The ruler fell')),
      record: p.readout(L('Rekord på den här datorn', 'Record on this computer')),
    };
    p.note(L(
      `Linjalen till höger om maskinen visar ditt resultat som det klassiska linjaltestet, i slow motion ×${SLOWMO}: d = ½·g·t² med g = 9,82 m/s².`,
      `The ruler on the right of the machine replays your result as the classic ruler-drop test, in slow motion ×${SLOWMO}: d = ½·g·t² with g = 9.82 m/s².`,
    ));
    p.button(L('Ny omgång', 'New round'), () => {
      times = [];
      last = null;
      phase = 'idle';
      refresh();
    }, { icon: '↺' });
    refresh();
    return () => {
      pad = null;
      ro = null;
    };
  }

  function setMode(m: Mode) {
    if (m === mode) return;
    mode = m;
    times = [];
    last = null;
    phase = 'idle';
    refresh();
  }

  refresh();

  return {
    controls,
    onFocus() {
      focused = true;
      window.addEventListener('keydown', onKey, true);
    },
    onBlur() {
      focused = false;
      window.removeEventListener('keydown', onKey, true);
      if (phase === 'wait' || phase === 'go') phase = 'idle';
      refresh();
    },
    update(dt: number, time: number) {
      if (phase === 'wait' && performance.now() >= cueAt) goCue();
      if (phase === 'go' && performance.now() - goAt > 1500) {
        phase = 'slow';
        refresh();
      }
      // idle glow on the button
      capMat.emissiveIntensity = phase === 'go' ? 0.9 : 0.15 + 0.1 * Math.sin(time * 2.4);
      // ruler drop replay: free fall y = ½·g·τ², stopped at τ = reaction time
      if (drop && !drop.done) {
        drop.tau += dt / SLOWMO;
        const tau = Math.min(drop.tau, drop.tReact);
        const fall = dropDistance(tau);
        if (fall > RULER_LEN) {
          // missed: the ruler slips through the fingers and lands on the base
          const y = rulerRestY - dropDistance(drop.tau);
          ruler.position.y = Math.max(0.06 + RULER_LEN / 2, y);
          if (y <= 0.06 + RULER_LEN / 2) {
            drop.done = true;
            ctx.sfx.tone(140, 0.12, { type: 'triangle', gain: 0.12 });
          }
        } else {
          ruler.position.y = rulerRestY - fall;
          if (drop.tau >= drop.tReact) {
            drop.done = true;
            ctx.sfx.tone(600, 0.05, { type: 'triangle', gain: 0.08 });
          }
        }
      }
      const pinch = drop && drop.tau >= drop.tReact ? 0.022 : 0.05;
      fingerA.position.z += (pinch - fingerA.position.z) * Math.min(1, dt * 20);
      fingerB.position.z = -fingerA.position.z;
    },
  };
}

function drawRuler(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#f0d070';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a1c0c';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.font = '700 22px Nunito, system-ui, sans-serif';
  const cm = RULER_LEN * 100;
  for (let i = 0; i <= cm * 10; i++) {
    const y = H - (i / (cm * 10)) * H;
    const len = i % 100 === 0 ? W * 0.55 : i % 10 === 0 ? W * 0.32 : i % 5 === 0 ? 0 : 0;
    if (len) g.fillRect(0, y - 1.5, len, 3);
    if (i % 50 === 0 && i > 0 && i < cm * 10) g.fillText(String(i / 10), W - 2, y);
  }
  g.fillStyle = '#c02818';
  g.fillRect(0, H - 6, W, 6);
}
