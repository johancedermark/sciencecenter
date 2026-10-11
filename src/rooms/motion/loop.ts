/** Station 4: loop the loop. How high must you start so the ball stays on the track at the top? */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomContext } from '../../core/types';
import type { Readout } from '../../core/controlPanel';
import type { Voice } from '../../core/sfx';
import { L, t } from '../../core/i18n';
import { LoopRunner, LoopTrack, ROLL, type TrackPoint } from './physics';
import { Batch, Board, FONT, StationState, buddyGate, fmt, mat, stationFrame, type StationModule } from './common';

const LOOP_R = 0.3;
const BASE = 0.2; // height of the loop bottom above the floor
const BALL_R = 0.025;
const SHIFT = 0.12; // lateral offset of the loop exit
const HZ = 480;

export function buildLoop(ctx: RoomContext, x: number, z: number, rotY: number): StationModule {
  const { group, v, world, collider } = stationFrame(ctx, x, z, rotY);
  const st = new StationState(ctx, world);
  const buddy = buddyGate(ctx);
  const track = new LoopTrack(LOOP_R);
  const XOFF = -(track.xL + track.exit) / 2;
  const runner = new LoopRunner(track, ROLL);
  const tp: TrackPoint = { x: 0, y: 0, tx: 1, ty: 0, k: 0, seg: 0, phi: 0 };

  /** Lateral (local z) offset of the track at arc length s. */
  const laneZ = (s: number) => {
    if (s <= track.loopStart) return 0;
    if (s >= track.loopEnd) return -SHIFT;
    return (-SHIFT * (s - track.loopStart)) / (track.loopEnd - track.loopStart);
  };

  // ---------------------------------------------------------------- static build
  const b = new Batch();
  const total = track.xL + track.exit;
  b.add(new RoundedBoxGeometry(total + 0.4, 0.12, 0.55, 3, 0.04), mat.darkWood, [0, 0.06, -0.05]);
  // rails
  const railPts: THREE.Vector3[][] = [[], []];
  const nSamples = Math.ceil(track.length / 0.01);
  for (let i = 0; i <= nSamples; i++) {
    const s = (track.length * i) / nSamples;
    track.at(s, tp);
    const zc = laneZ(s);
    railPts[0].push(new THREE.Vector3(tp.x + XOFF, tp.y + BASE, zc - 0.016));
    railPts[1].push(new THREE.Vector3(tp.x + XOFF, tp.y + BASE, zc + 0.016));
  }
  for (const pts of railPts) b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), nSamples, 0.0065, 6, false), mat.steel);
  // cross ties along the track
  const tie = new THREE.BoxGeometry(0.012, 0.012, 0.05);
  for (let s = 0.05; s < track.length; s += 0.12) {
    track.at(s, tp);
    const ang = Math.atan2(tp.ty, tp.tx);
    b.add(tie, mat.darkWood, [tp.x + XOFF - tp.ty * -0.008, tp.y + BASE - tp.tx * 0.008, laneZ(s)], [0, 0, ang]);
  }
  // supports
  const post = new THREE.CylinderGeometry(0.014, 0.014, 1, 8);
  for (const s of [0.05, 0.4, 0.8, 1.2]) {
    track.at(s, tp);
    b.strut(new THREE.Vector3(tp.x + XOFF, tp.y + BASE - 0.01, -0.03), new THREE.Vector3(tp.x + XOFF, 0.12, -0.03), 0.014, mat.brass, post);
  }
  for (const side of [-1, 1]) {
    const lx = track.cx + side * LOOP_R + XOFF;
    b.strut(new THREE.Vector3(lx, BASE + LOOP_R, -SHIFT / 2 - 0.03), new THREE.Vector3(lx, 0.12, -SHIFT / 2 - 0.03), 0.014, mat.brass, post);
  }
  b.add(new RoundedBoxGeometry(0.2, 0.08, 0.2, 2, 0.02), mat.felt, [track.xL + track.exit + XOFF + 0.08, 0.16, -SHIFT]);
  b.add(new RoundedBoxGeometry(0.24, 0.1, 0.24, 2, 0.02), mat.wood, [track.xL + track.exit + XOFF + 0.08, 0.12, -SHIFT]);
  b.build(group);

  // Height ruler behind the ramp, in units of R above the loop bottom.
  const rulerH = 1.25;
  const ruler = new Board(
    0.32,
    rulerH,
    (g, w, h) => {
      g.fillStyle = '#f4ead8';
      g.fillRect(0, 0, w, h);
      const pxPerM = h / rulerH;
      const y0 = h - (BASE - 0.12) * pxPerM; // ruler bottom is at y = 0.12
      g.strokeStyle = '#3b2616';
      g.fillStyle = '#3b2616';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let k = 0; k <= 8; k++) {
        const y = y0 - k * 0.5 * LOOP_R * pxPerM;
        if (y < 10) break;
        const major = k % 2 === 0;
        g.lineWidth = major ? 4 : 2;
        g.beginPath();
        g.moveTo(w, y);
        g.lineTo(w - (major ? w * 0.35 : w * 0.18), y);
        g.stroke();
        if (major && k > 0) {
          g.font = `700 ${Math.round(w * 0.2)}px ${FONT}`;
          g.fillText(`${k / 2} R`, w * 0.58, y);
        }
      }
      g.font = `600 ${Math.round(w * 0.13)}px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(t(L('höjd', 'height')), w / 2, 30);
    },
    { px: 512, lit: true, transparent: false },
  );
  ruler.mesh.position.set(XOFF + 0.1, 0.12 + rulerH / 2, -0.28);
  group.add(ruler.mesh);

  // ball and sliding block
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: 0.3, metalness: 0.3, emissive: 0xff2a10, emissiveIntensity: 0.15 }));
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 1.002, 0.004, 6, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  ball.add(stripe);
  const block = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.04, 0.04, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x5cc8ff, roughness: 0.3 }));
  block.visible = false;
  group.add(ball, block);

  // height guide line (glowing) from the start point towards the loop
  const guide = new THREE.Mesh(new THREE.BoxGeometry(1, 0.004, 0.004), mat.glow);
  group.add(guide);

  // ---------------------------------------------------------------- state
  const s = {
    hR: 3.0,
    rolling: true,
    guess: 0 as -1 | 0 | 1, // −1 falls, 1 makes it
    lastState: 'ready' as string,
    doneAt: -1,
    shownPrediction: false,
  };
  let rumble: Voice | null = null;
  let rSpeed: Readout | null = null;
  let rG: Readout | null = null;
  let rTop: Readout | null = null;
  let rPred: Readout | null = null;
  let note: HTMLElement | null = null;
  let hSlider: HTMLInputElement | null = null;

  const h = () => s.hR * LOOP_R;
  const kE = () => (s.rolling ? 2 * ROLL : 2);

  const predictionText = () => {
    const nTop = runner.predictTopG(h());
    if (nTop >= 0) return t(L(`klarar loopen, ${fmt(nTop, 2)} g i toppen`, `makes the loop, ${fmt(nTop, 2)} g at the top`));
    const k = kE();
    const c = (-k * (s.hR - 1)) / (1 + k);
    if (c <= -1 || s.hR <= 1) return t(L('rullar tillbaka', 'rolls back'));
    const deg = (Math.acos(c) * 180) / Math.PI;
    return t(L(`lämnar banan vid ca ${fmt(deg, 0)}° (toppen = 180°)`, `leaves the track at about ${fmt(deg, 0)}° (top = 180°)`));
  };

  const refreshPrediction = () => {
    if (!rPred) return;
    rPred.set(s.guess !== 0 || s.shownPrediction ? predictionText() : t(L('gissa först!', 'guess first!')));
  };

  const place = () => {
    runner.f = s.rolling ? ROLL : 1;
    runner.place(h());
    s.lastState = 'ready';
    s.doneAt = -1;
    ball.visible = s.rolling;
    block.visible = !s.rolling;
    // guide line from the start to just past the loop
    track.at(runner.s, tp);
    const x0 = tp.x + XOFF;
    const x1 = track.cx + LOOP_R + 0.1 + XOFF;
    guide.scale.x = Math.max(0.01, x1 - x0);
    guide.position.set((x0 + x1) / 2, h() + BASE, -0.2);
    drawBall();
    refreshPrediction();
    rTop?.set('–');
  };

  const drawBall = () => {
    const obj = s.rolling ? ball : block;
    if (runner.mode === 'air') {
      // keep the ball on the inner side of the loop while flying (visual offset towards the centre)
      const dx = track.cx - runner.px;
      const dy = track.cy - runner.py;
      const d = Math.hypot(dx, dy) || 1;
      obj.position.set(runner.px + XOFF + (dx / d) * BALL_R, runner.py + BASE + (dy / d) * BALL_R, laneZ(track.loopStart + LOOP_R * Math.PI));
    } else {
      track.at(runner.s, tp);
      const off = s.rolling ? BALL_R * 0.8 : 0.02;
      obj.position.set(tp.x + XOFF - tp.ty * off, tp.y + BASE + tp.tx * off, laneZ(runner.s));
      if (s.rolling) ball.rotation.z = -runner.s / BALL_R;
      else block.rotation.z = Math.atan2(tp.ty, tp.tx);
    }
  };

  const go = () => {
    if (runner.state !== 'ready') {
      place();
    }
    runner.go();
    s.shownPrediction = true;
    refreshPrediction();
    if (note) note.textContent = '';
    ctx.sfx.tone(240, 0.08, { type: 'square', gain: 0.05 });
    rumble?.stop();
    rumble = ctx.sfx.voice(50, { type: 'triangle', gain: 0 });
  };

  const setH = (hr: number) => {
    s.hR = Math.max(1, Math.min(3.6, hr));
    if (hSlider) hSlider.value = String(s.hR);
    place();
  };

  // drag the ball up and down the ramp; click to release
  const plane = new THREE.Plane();
  const nrm = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (const obj of [ball, block]) {
    ctx.interaction.add(obj, {
      label: L('Dra upp eller ner längs rampen, klicka för att släppa', 'Drag up or down the ramp, click to release'),
      onDragStart: () => {
        group.updateMatrixWorld();
        nrm.set(0, 0, 1).transformDirection(group.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(nrm, group.localToWorld(tmp.set(0, 0, 0)));
      },
      onDrag: (info) => {
        if (runner.state !== 'ready' || Math.hypot(info.totalX, info.totalY) < 6) return;
        const p = info.onPlane(plane);
        if (!p) return;
        group.worldToLocal(p);
        setH(Math.round(((p.y - BASE) / LOOP_R) * 20) / 20);
      },
      onClick: () => {
        if (runner.state === 'ready') go();
      },
    });
  }

  const finishMsg = () => {
    const ok = runner.succeeded;
    const right = s.guess !== 0 && (s.guess === 1) === ok;
    let msg = ok
      ? t(L('Den klarade loopen!', 'It made the loop!'))
      : Number.isNaN(runner.leftAt)
        ? t(L('Den kom inte upp och rullade tillbaka.', "It didn't get up and rolled back."))
        : t(L(`Den tappade kontakten vid ${fmt((runner.leftAt * 180) / Math.PI, 0)}° och föll.`, `It lost contact at ${fmt((runner.leftAt * 180) / Math.PI, 0)}° and fell.`));
    if (s.guess !== 0) msg += ' ' + (right ? t(L('Din gissning stämde!', 'Your guess was right!')) : t(L('Din gissning stämde inte.', 'Your guess was wrong.')));
    if (note) note.textContent = msg;
    if (ok) {
      const margin = s.hR - runner.minHeight() / LOOP_R;
      if (margin < 0.15) buddy.celebrate(L('Precis på gränsen! Nästan tyngdlös i toppen.', 'Right on the edge! Almost weightless at the top.'));
      else if (right) buddy.celebrate(L('Rätt gissat!', 'Good guess!'));
    } else if (runner.state === 'fell' || !Number.isNaN(runner.leftAt)) {
      buddy.say(
        s.rolling
          ? L('För låg! En rullande kula behöver starta minst 2,7 R upp, eftersom en del av energin går åt till att snurra.', 'Too low! A rolling ball must start at least 2.7 R up, because part of the energy goes into spinning.')
          : L('För låg! En glidande kloss behöver minst 2,5 R.', 'Too low! A sliding block needs at least 2.5 R.'),
        { expression: 'surprised' },
      );
    }
  };

  collider(total + 0.5, 0.7, 0, -0.05);

  ctx.addStation(
    st.hook({
      id: 'motion-loop',
      title: L('Loopen', 'Loop the loop'),
      position: [x, z],
      viewpoint: { position: v(0.35, 1.25, 2.7), target: v(0.35, 0.6, 0) },
      intro: L(
        'Hur högt upp måste kulan starta för att klara loopen utan att ramla ner i toppen? Gissa först!',
        'How high must the ball start to make it round the loop without falling off at the top? Guess first!',
      ),
      howTo: L(
        'Dra kulan upp eller ner längs rampen (eller använd reglaget), gissa om den klarar loopen, och klicka på kulan eller ”Kör!”. Jämför sedan en rullande kula med en glidande kloss.',
        'Drag the ball up or down the ramp (or use the slider), guess whether it makes the loop, then click the ball or "Go!". Then compare a rolling ball with a sliding block.',
      ),
      science: L(
        'I toppen av loopen måste tyngdkraften plus banans tryck hålla kulan i en cirkel: v²/R = g + N/m. Banan kan bara trycka, inte dra, så farten i toppen måste vara minst √(g·R). En friktionsfri kloss får hela lägesenergin som fart och behöver starta 2,5 R över loopens botten. En rullande kula lägger 2/7 av energin på att snurra, så den behöver 2,7 R. Är den för låg blir trycket noll innan toppen, kulan släpper banan och flyger i en kastparabel. Vi räknar kulan som liten jämfört med loopen och utan rullmotstånd.',
        'At the top of the loop, gravity plus the push from the track must keep the ball moving in a circle: v²/R = g + N/m. The track can only push, not pull, so the speed at the top must be at least √(g·R). A frictionless block turns all its potential energy into speed and must start 2.5 R above the bottom of the loop. A rolling ball puts 2/7 of its energy into spinning, so it needs 2.7 R. Too low, and the push drops to zero before the top: the ball leaves the track and flies in a projectile arc. We treat the ball as small compared with the loop and ignore rolling resistance.',
      ),
      wow: L(
        'Moderna berg-och-dalbanor har droppformade loopar (klotoider) i stället för cirklar, så att g-kraften i botten inte blir för hög och farten i toppen ändå räcker.',
        'Modern roller coasters use teardrop-shaped loops (clothoids) instead of circles, so the g-force at the bottom stays bearable while the speed at the top is still enough.',
      ),
      controls: (panel) => {
        panel.heading(L('1. Välj starthöjd', '1. Choose the start height'));
        hSlider = panel.slider(
          L('Höjd h över loopens botten', 'Height h above the loop bottom'),
          { min: 1, max: 3.6, step: 0.05, value: s.hR, format: (val) => `${fmt(val, 2)} R = ${fmt(val * LOOP_R * 100, 0)} cm` },
          (val) => setH(val),
        );
        panel.heading(L('2. Gissa', '2. Guess'));
        panel.buttons(
          [
            { label: L('Klarar loopen', 'Makes the loop'), icon: '✅', onClick: () => { s.guess = 1; refreshPrediction(); } },
            { label: L('Ramlar av', 'Falls off'), icon: '💥', onClick: () => { s.guess = -1; refreshPrediction(); } },
          ],
          s.guess === 1 ? 0 : s.guess === -1 ? 1 : -1,
        );
        rPred = panel.readout(L('Fysikens förutsägelse', "Physics' prediction"));
        panel.button(L('Kör!', 'Go!'), go, { primary: true, icon: '🎢' });
        note = panel.note(L('', ''));
        rSpeed = panel.readout(L('Fart', 'Speed'));
        rG = panel.readout(L('g-kraft nu', 'g-force now'));
        rTop = panel.readout(L('g-kraft i toppen', 'g-force at the top'));
        panel.buttons(
          [
            { label: L('Rullande kula', 'Rolling ball'), onClick: () => { s.rolling = true; place(); } },
            { label: L('Glidande kloss', 'Sliding block'), onClick: () => { s.rolling = false; place(); } },
          ],
          s.rolling ? 0 : 1,
        );
        panel.note(L(
          `Loopens radie R = ${fmt(LOOP_R * 100, 0)} cm. Teori: minsta höjd ${s.rolling ? '2,7' : '2,5'} R. g = 9,82 m/s².`,
          `Loop radius R = ${fmt(LOOP_R * 100, 0)} cm. Theory: minimum height ${s.rolling ? '2.7' : '2.5'} R. g = 9.82 m/s².`,
        ));
        refreshPrediction();
        return () => {
          rSpeed = rG = rTop = rPred = null;
          note = null;
          hSlider = null;
        };
      },
      onBlur: () => {
        rumble?.stop();
        rumble = null;
      },
    }),
  );

  place();

  return {
    update(dt, time) {
      guide.scale.y = guide.scale.z = 1 + 0.4 * Math.sin(time * 3);
      if (runner.state === 'ready') return;
      if (!st.near()) return;
      const d = Math.min(dt, 0.05);
      const n = Math.max(1, Math.ceil(d * HZ));
      const hh = d / n;
      for (let i = 0; i < n; i++) runner.step(hh);
      drawBall();
      if (rumble) {
        const on = runner.mode === 'track' && runner.state !== 'done';
        rumble.setFreq(35 + runner.speed * 22);
        rumble.setGain(on ? Math.min(0.06, runner.speed * 0.02) : 0);
      }
      if (runner.state !== s.lastState) {
        const prev = s.lastState;
        s.lastState = runner.state;
        if (runner.state === 'fell') ctx.sfx.tone(140, 0.25, { type: 'sine', gain: 0.12, to: 70 });
        if (runner.state === 'success') ctx.sfx.chime();
        if (runner.state === 'done') {
          s.doneAt = time;
          if (prev !== 'done') finishMsg();
          rumble?.stop();
          rumble = null;
        }
      }
      rSpeed?.set(`${fmt(runner.speed, 2)} m/s (${fmt(runner.speed * 3.6, 1)} km/h)`);
      rG?.set(`${fmt(runner.gForce, 2)} g`);
      if (!Number.isNaN(runner.topG)) rTop?.set(`${fmt(runner.topG, 2)} g, v = ${fmt(runner.topV, 2)} m/s`);
      else if (!Number.isNaN(runner.leftAt)) rTop?.set(t(L('kom aldrig dit på banan', 'never got there on the track')));
      if (runner.state === 'done' && s.doneAt >= 0 && time - s.doneAt > 2.5) place();
    },
  };
}
