/** Station 1: brachistochrone race. Three tracks, same start and end, which ball arrives first? */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomContext } from '../../core/types';
import type { Readout } from '../../core/controlPanel';
import { L, t } from '../../core/i18n';
import { BRACH, Curve, CurveRunner, G, ROLL, brachCurves } from './physics';
import { Batch, Board, FONT, StationState, buddyGate, fmt, mat, roundRect, stationFrame, type StationModule } from './common';

const NAMES = [L('Rak ramp', 'Straight ramp'), L('Cykloid', 'Cycloid'), L('Djupdyk', 'Deep dive')];
const COLORS = [0xff8a5c, 0x5cc8ff, 0xffd25c];
const CSS = ['#e8673a', '#2f9fd8', '#d9a520'];
const TRACK_Z = [-0.3, 0, 0.3];
const X0 = -BRACH.X / 2;
const Y0 = 1.75;
const BALL_R = 0.03;
const HZ = 480;

/** A wooden track: a plank (top + two sides) that follows a curve given as up-normal samples. */
function plankGeometry(pts: { x: number; y: number; nx: number; ny: number }[], halfW: number, thick: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const strip = (a: (p: (typeof pts)[0]) => [number, number, number], b: (p: (typeof pts)[0]) => [number, number, number]) => {
    const base = pos.length / 3;
    for (const p of pts) pos.push(...a(p), ...b(p));
    for (let i = 0; i < pts.length - 1; i++) {
      const k = base + i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  };
  const top = (z: number) => (p: (typeof pts)[0]): [number, number, number] => [p.x, p.y, z];
  const bot = (z: number) => (p: (typeof pts)[0]): [number, number, number] => [p.x - p.nx * thick, p.y - p.ny * thick, z];
  strip(top(halfW), top(-halfW));
  strip(top(-halfW), bot(-halfW));
  strip(bot(halfW), top(halfW));
  strip(bot(-halfW), bot(halfW));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBrachistochrone(ctx: RoomContext, x: number, z: number, rotY: number): StationModule {
  const { group, v, world, collider } = stationFrame(ctx, x, z, rotY);
  const st = new StationState(ctx, world);
  const buddy = buddyGate(ctx);
  const curves = brachCurves.map((f) => new Curve(f, 4000));
  const pt = { x: 0, y: 0, tx: 1, ty: 0 };

  // ---------------------------------------------------------------- static build
  const batch = new Batch();
  batch.add(new RoundedBoxGeometry(2.1, 0.14, 1.05, 3, 0.04), mat.darkWood, [0.05, 0.07, 0]);
  // start tower and finish block
  batch.add(new RoundedBoxGeometry(0.16, Y0 + 0.12, 0.95, 2, 0.03), mat.wood, [X0 - 0.1, (Y0 + 0.12) / 2, 0]);
  batch.add(new RoundedBoxGeometry(0.12, 0.85, 0.95, 2, 0.03), mat.wood, [-X0 + 0.08, 0.425, 0]);
  const post = new THREE.CylinderGeometry(0.012, 0.012, 1, 8);
  curves.forEach((c, k) => {
    const samples: { x: number; y: number; nx: number; ny: number }[] = [];
    const N = 140;
    for (let i = 0; i <= N; i++) {
      c.at((c.length * i) / N, pt);
      samples.push({ x: X0 + pt.x, y: Y0 - pt.y, nx: pt.ty, ny: pt.tx });
    }
    const plank = plankGeometry(samples, 0.05, 0.03);
    plank.translate(0, 0, TRACK_Z[k]);
    batch.add(plank, mat.paleWood);
    for (const side of [-1, 1]) {
      const rail = new THREE.CatmullRomCurve3(samples.map((p) => new THREE.Vector3(p.x + p.nx * 0.014, p.y + p.ny * 0.014, TRACK_Z[k] + side * 0.046)));
      batch.add(new THREE.TubeGeometry(rail, 120, 0.007, 5, false), mat.darkWood);
    }
    for (const u of [0.22, 0.45, 0.68, 0.88]) {
      c.at(c.length * u, pt);
      const top = new THREE.Vector3(X0 + pt.x, Y0 - pt.y - 0.03, TRACK_Z[k]);
      batch.strut(top, new THREE.Vector3(top.x, 0.14, top.z), 0.012, mat.brass, post);
    }
    // finish line marker (glowing)
    batch.add(new THREE.BoxGeometry(0.012, 0.004, 0.1), mat.glow, [-X0 - 0.01, Y0 - BRACH.H + 0.003, TRACK_Z[k]]);
  });
  // little start flags, one per track
  COLORS.forEach((_, k) => batch.add(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6), mat.brass, [X0 - 0.12, Y0 + 0.27, TRACK_Z[k] + 0.12]));
  batch.build(group);
  const flagGeo = new THREE.PlaneGeometry(0.12, 0.08);
  flagGeo.translate(0.06, 0, 0);
  const flags = COLORS.map((c, k) => {
    const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }));
    f.position.set(X0 - 0.12, Y0 + 0.37, TRACK_Z[k] + 0.12);
    group.add(f);
    return f;
  });

  // start gate (brass bar that swings up on release)
  const gate = new THREE.Group();
  gate.position.set(X0 - 0.02, Y0 + 0.09, 0);
  const gateBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 10), mat.brass);
  gateBar.rotation.x = Math.PI / 2;
  gateBar.position.set(0.05, -0.04, 0);
  gate.add(gateBar);
  group.add(gate);

  // release button on the tower
  const button = new THREE.Group();
  button.position.set(X0 - 0.1, 1.0, 0.49);
  const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 20), mat.brass);
  bBase.rotation.x = Math.PI / 2;
  const capMat = new THREE.MeshStandardMaterial({ color: 0xff4d3a, emissive: 0xff3020, emissiveIntensity: 0.6, roughness: 0.3 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.02;
  button.add(bBase, cap);
  group.add(button);

  // balls
  const balls = COLORS.map((c) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 16),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.2, emissive: c, emissiveIntensity: 0 }),
    );
    group.add(m);
    return m;
  });

  // Back board: title, Bernoulli, results
  type Mode = 'idle' | 'running' | 'done';
  const s = {
    mode: 'idle' as Mode,
    bet: -1,
    rolling: true,
    tauto: false,
    speed: 1,
    doneAt: 0,
    times: [-1, -1, -1],
  };
  const board = new Board(
    2.1,
    1.25,
    (g, w, h) => {
      g.fillStyle = '#e6d6bc';
      roundRect(g, 0, 0, w, h, 24);
      g.fill();
      g.strokeStyle = 'rgba(90,60,30,0.10)';
      g.lineWidth = 2;
      for (let gx = 0; gx < w; gx += 40) {
        g.beginPath();
        g.moveTo(gx, 0);
        g.lineTo(gx, h);
        g.stroke();
      }
      for (let gy = 0; gy < h; gy += 40) {
        g.beginPath();
        g.moveTo(0, gy);
        g.lineTo(w, gy);
        g.stroke();
      }
      g.fillStyle = '#3b2616';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.font = `800 ${Math.round(h * 0.085)}px ${FONT}`;
      g.fillText(t(L('Vilken väg är snabbast?', 'Which way is fastest?')), 36, 26);
      g.font = `500 ${Math.round(h * 0.05)}px ${FONT}`;
      g.fillStyle = '#6b4a2e';
      g.fillText(t(L('Johann Bernoullis gåta, 1696', "Johann Bernoulli's puzzle, 1696")), 38, 26 + h * 0.1);
      // results
      const x0 = w * 0.6;
      g.font = `700 ${Math.round(h * 0.055)}px ${FONT}`;
      g.fillStyle = '#3b2616';
      g.fillText(t(L('Måltider', 'Finish times')), x0, 30);
      const order = [0, 1, 2].filter((k) => s.times[k] >= 0).sort((a, b) => s.times[a] - s.times[b]);
      for (let k = 0; k < 3; k++) {
        const y = 30 + h * (0.08 + k * 0.075);
        g.fillStyle = CSS[k];
        g.beginPath();
        g.arc(x0 + 12, y + h * 0.03, h * 0.022, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3b2616';
        g.font = `600 ${Math.round(h * 0.05)}px ${FONT}`;
        const place = order.indexOf(k);
        const medal = place === 0 ? ' 🥇' : place === 1 ? ' 🥈' : place === 2 ? ' 🥉' : '';
        g.fillText(t(NAMES[k]) + (s.bet === k ? ' ★' : ''), x0 + 32, y);
        g.textAlign = 'right';
        g.fillText((s.times[k] >= 0 ? `${fmt(s.times[k], 2)} s` : '–') + medal, w - 30, y);
        g.textAlign = 'left';
      }
      g.font = `500 ${Math.round(h * 0.04)}px ${FONT}`;
      g.fillStyle = '#6b4a2e';
      g.fillText(
        t(s.rolling ? L('Rullande massiva kulor, g = 9,82 m/s²', 'Rolling solid balls, g = 9.82 m/s²') : L('Friktionsfri glidning, g = 9,82 m/s²', 'Frictionless sliding, g = 9.82 m/s²')),
        x0,
        30 + h * 0.32,
      );
      if (s.bet >= 0) g.fillText('★ ' + t(L('= din satsning', '= your bet')), x0, 30 + h * 0.37);
    },
    { px: 1024, lit: true, transparent: false },
  );
  board.mesh.position.set(0.05, 1.42, -0.5);
  group.add(board.mesh);
  const boardBack = new THREE.Mesh(new RoundedBoxGeometry(2.16, 1.31, 0.04, 2, 0.02), mat.darkWood);
  boardBack.position.set(0.05, 1.42, -0.525);
  group.add(boardBack);
  const boardLegs = new Batch();
  boardLegs.add(new THREE.BoxGeometry(0.05, 0.8, 0.04), mat.darkWood, [-0.9, 0.5, -0.525]);
  boardLegs.add(new THREE.BoxGeometry(0.05, 0.8, 0.04), mat.darkWood, [1.0, 0.5, -0.525]);
  boardLegs.build(group);

  collider(2.3, 1.2, 0.05, 0);

  // ---------------------------------------------------------------- simulation
  const runners = curves.map((c) => new CurveRunner(c, G * ROLL));
  const readouts: (Readout | null)[] = [null, null, null];
  let resultNote: HTMLElement | null = null;
  let setBetUI: ((i: number) => void) | null = null;

  const placeBalls = () => {
    runners.forEach((r, k) => {
      r.curve.at(r.s, pt);
      const b = balls[k];
      b.position.set(X0 + pt.x + pt.ty * BALL_R, Y0 - pt.y + pt.tx * BALL_R, TRACK_Z[k]);
      b.rotation.z = -r.s / BALL_R;
    });
  };

  const resetRunners = () => {
    const gEff = s.rolling ? G * ROLL : G;
    runners.forEach((r, k) => {
      r.gEff = gEff;
      r.s0 = k === 1 && s.tauto ? curves[1].sAtDrop(0.5) : 0;
      r.reset();
    });
    placeBalls();
    board.redraw();
    updateReadouts();
  };

  const updateReadouts = () => {
    readouts.forEach((r, k) => r?.set(s.times[k] >= 0 ? `${fmt(s.times[k], 2)} s` : s.mode === 'running' ? '…' : '–'));
  };

  const bet = (k: number) => {
    if (s.mode === 'running') return;
    s.bet = k;
    setBetUI?.(k);
    ctx.sfx.pop();
    balls.forEach((b, j) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = j === k ? 0.45 : 0));
    if (s.mode === 'done') {
      s.mode = 'idle';
      resetRunners();
    }
    board.redraw();
  };

  const release = () => {
    if (s.mode === 'running') return;
    s.times = [-1, -1, -1];
    resetRunners();
    s.mode = 'running';
    ctx.sfx.tone(180, 0.12, { type: 'square', gain: 0.06 });
    ctx.sfx.noise(0.25, { freq: 900, gain: 0.08 });
    if (resultNote) resultNote.textContent = '';
    updateReadouts();
  };

  const finishRace = () => {
    s.mode = 'done';
    s.doneAt = performance.now() / 1000;
    const order = [0, 1, 2].sort((a, b) => s.times[a] - s.times[b]);
    const win = order[0];
    board.redraw();
    ctx.sfx.chime();
    const winTxt = t(NAMES[win]);
    let msg = `${t(L('Vinnare', 'Winner'))}: ${winTxt}.`;
    if (s.bet >= 0) msg += ' ' + (s.bet === win ? t(L('Du satsade rätt!', 'You bet right!')) : t(L('Inte den du satsade på!', "Not the one you bet on!")));
    if (resultNote) resultNote.textContent = msg;
    if (s.tauto) {
      buddy.celebrate(L(
        'Cykloidkulan startade halvvägs ner men kom fram på exakt samma tid. Det kallas tautokron: samma tid oavsett startpunkt!',
        'The cycloid ball started halfway down but arrived at exactly the same time. That is a tautochrone: same time from any start point!',
      ));
    } else if (s.bet === win) {
      buddy.celebrate(L('Rätt! Cykloiden vinner, fast den är längre än den raka rampen.', 'Right! The cycloid wins, even though it is longer than the straight ramp.'));
    } else if (s.bet === 0) {
      buddy.say(L('Den raka vägen är kortast, men inte snabbast! Den får för lite fart i början.', 'The straight path is the shortest, but not the fastest! It picks up too little speed at the start.'), { expression: 'wink' });
    } else if (s.bet === 2) {
      buddy.say(L('Djupdyket får jättefart tidigt, men åker för långt och måste klättra upp igen.', 'The deep dive gets lots of speed early, but travels too far and has to climb back up.'), { expression: 'thinking' });
    }
  };

  // in-world interaction
  balls.forEach((b, k) => {
    ctx.interaction.add(b, {
      label: L('Satsa på den här banan', 'Bet on this track'),
      onClick: () => bet(k),
      enabled: () => s.mode !== 'running',
    });
  });
  ctx.interaction.add(button, {
    label: L('Släpp kulorna!', 'Release the balls!'),
    onClick: () => {
      cap.position.z = 0.005;
      release();
    },
  });

  resetRunners();

  ctx.addStation(
    st.hook({
      id: 'motion-brachistochrone',
      title: L('Snabbaste vägen', 'The fastest path'),
      position: [x, z],
      viewpoint: { position: v(0.4, 1.6, 2.35), target: v(0.4, 1.1, 0) },
      intro: L(
        'Tre kulor, tre banor, samma start och samma mål. Vilken kommer först? Satsa innan du släpper!',
        'Three balls, three tracks, same start and same finish. Which one arrives first? Place your bet before you release!',
      ),
      howTo: L(
        'Klicka på en kula för att satsa på den. Tryck sedan på den röda knappen eller ”Släpp!”. Prova också glidande kulor och att starta cykloidkulan halvvägs ner.',
        'Click a ball to bet on it. Then press the red button or "Release!". Also try sliding balls, and starting the cycloid ball halfway down.',
      ),
      science: L(
        'År 1696 utmanade Johann Bernoulli Europas matematiker: vilken bana tar en kula snabbast från en punkt till en lägre punkt? Svaret är en cykloid, kurvan som en punkt på ett rullande hjul ritar. Den går brant ner först, så kulan får hög fart tidigt, och den farten använder den på resten av vägen. Den raka rampen är kortast men långsammast, och djupdyket går för långt ner och måste klättra upp igen. Här rullar massiva kulor utan att glida: de accelererar med 5/7 av en glidande kulas acceleration (en del av energin går till rotation), vilket gör alla tider √(7/5) ≈ 1,18 gånger längre men ändrar inte ordningen. Med g = 9,82 m/s² tar cykloiden 0,84 s och den raka rampen 0,99 s.',
        'In 1696 Johann Bernoulli challenged the mathematicians of Europe: which path takes a ball fastest from one point to a lower one? The answer is a cycloid, the curve traced by a point on a rolling wheel. It drops steeply first, so the ball gets up to speed early and carries that speed for the rest of the way. The straight ramp is shortest but slowest, and the deep dive goes too far down and has to climb back up. Here solid balls roll without slipping: they accelerate at 5/7 of a sliding ball (some energy goes into spinning), which makes all times √(7/5) ≈ 1.18 times longer but does not change the order. With g = 9.82 m/s² the cycloid takes 0.84 s and the straight ramp 0.99 s.',
      ),
      wow: L(
        'Cykloiden är också en tautokron: släpper du kulan var som helst på den, når den botten på exakt samma tid. Newton löste Bernoullis gåta på en enda kväll.',
        'The cycloid is also a tautochrone: release the ball anywhere on it and it reaches the bottom in exactly the same time. Newton solved Bernoulli\'s puzzle in a single evening.',
      ),
      controls: (panel) => {
        panel.heading(L('1. Satsa', '1. Place your bet'));
        setBetUI = panel.buttons(
          NAMES.map((n, k) => ({ label: n, icon: ['🟠', '🔵', '🟡'][k], onClick: () => bet(k) })),
          s.bet,
        );
        panel.heading(L('2. Släpp', '2. Release'));
        panel.button(L('Släpp!', 'Release!'), release, { primary: true, icon: '🏁' });
        readouts[0] = panel.readout(NAMES[0]);
        readouts[1] = panel.readout(NAMES[1]);
        readouts[2] = panel.readout(NAMES[2]);
        resultNote = panel.note(L('', ''));
        updateReadouts();
        panel.heading(L('Prova mer', 'Try more'));
        panel.buttons(
          [
            { label: L('Rullande kulor', 'Rolling balls'), onClick: () => { s.rolling = true; s.mode = 'idle'; s.times = [-1, -1, -1]; resetRunners(); } },
            { label: L('Glidande (friktionsfritt)', 'Sliding (frictionless)'), onClick: () => { s.rolling = false; s.mode = 'idle'; s.times = [-1, -1, -1]; resetRunners(); } },
          ],
          s.rolling ? 0 : 1,
        );
        panel.toggle(L('Cykloidkulan startar halvvägs ner', 'Cycloid ball starts halfway down'), s.tauto, (on) => {
          s.tauto = on;
          s.mode = 'idle';
          s.times = [-1, -1, -1];
          resetRunners();
        });
        panel.buttons(
          [
            { label: L('Riktig fart 1×', 'Real speed 1×'), onClick: () => (s.speed = 1) },
            { label: L('Slowmotion ¼×', 'Slow motion ¼×'), onClick: () => (s.speed = 0.25) },
          ],
          s.speed === 1 ? 0 : 1,
        );
        const gEff = s.rolling ? G * ROLL : G;
        panel.note(L(
          `Teori: cykloiden tar π·√(R/g′) = ${fmt(Math.PI * Math.sqrt(BRACH.R / gEff), 3)} s (R = 0,5 m, fallhöjd 1 m). Tiderna mäts i fysiktid, även i slowmotion.`,
          `Theory: the cycloid takes π·√(R/g′) = ${fmt(Math.PI * Math.sqrt(BRACH.R / gEff), 3)} s (R = 0.5 m, 1 m drop). Times are physics time, even in slow motion.`,
        ));
        return () => {
          readouts.fill(null);
          resultNote = null;
          setBetUI = null;
        };
      },
    }),
  );

  let gateAngle = 0;
  return {
    update(dt) {
      // idle life: the bet ball and the button pulse gently
      const now = performance.now() / 1000;
      capMat.emissiveIntensity = 0.45 + 0.3 * Math.sin(now * 3);
      cap.position.z += (0.02 - cap.position.z) * Math.min(1, dt * 6);
      const gateTarget = s.mode === 'idle' ? 0 : -1.4;
      gateAngle += (gateTarget - gateAngle) * Math.min(1, dt * 10);
      gate.rotation.z = -gateAngle;
      if (s.mode === 'running') {
        const simDt = Math.min(dt, 0.1) * s.speed;
        const n = Math.max(1, Math.ceil(simDt * HZ));
        const h = simDt / n;
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < 3; k++) {
            const r = runners[k];
            if (r.finished) continue;
            r.step(h);
            if (r.finished) {
              s.times[k] = r.finishTime;
              const place = s.times.filter((x) => x >= 0).length;
              ctx.sfx.tone([880, 660, 520][place - 1] ?? 440, 0.12, { type: 'triangle', gain: 0.1 });
              updateReadouts();
              board.redraw();
            }
          }
        }
        placeBalls();
        if (runners.every((r) => r.finished)) finishRace();
      } else if (s.mode === 'done' && now - s.doneAt > 4) {
        s.mode = 'idle';
        resetRunners();
        ctx.sfx.pop();
      }
      // flags flutter
      for (let k = 0; k < 3; k++) flags[k].rotation.y = 0.25 * Math.sin(now * 2.2 + k * 1.7);
    },
  };
}
