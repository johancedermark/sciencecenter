/**
 * Station 2: coloured shadows. Red, green and blue lamps light a white wall. A custom wall shader
 * adds each lamp's colour at every wall point unless the ball (sphere) or its rod (capsule) blocks
 * the straight line to that lamp, with a penumbra from the lamp's finite size.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { L10n, RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import { cooldown, fmt, glowSprite, mats, merged, plaque, rbox } from './common';

const WALL_X = -1.75;
const WALL_W = 2.8;
const WALL_H = 1.8;
const WALL_Y = 1.3;
const LAMP_X = 1.25;
const LAMP_R = 0.04; // emitting disc radius
const BALL_R = 0.13;
const ROD_R = 0.012;

const LAMPS: { name: L10n; col: [number, number, number]; hex: number }[] = [
  { name: L('röd', 'red'), col: [1, 0, 0], hex: 0xff2a2a },
  { name: L('grön', 'green'), col: [0, 1, 0], hex: 0x2aff4a },
  { name: L('blå', 'blue'), col: [0, 0, 1], hex: 0x3a5cff },
];

const COLOR_NAMES: Record<string, L10n> = {
  '111': L('vit', 'white'),
  '011': L('cyan (grönt + blått)', 'cyan (green + blue)'),
  '101': L('magenta (rött + blått)', 'magenta (red + blue)'),
  '110': L('gul (rött + grönt)', 'yellow (red + green)'),
  '100': L('röd', 'red'),
  '010': L('grön', 'green'),
  '001': L('blå', 'blue'),
  '000': L('svart', 'black'),
};
const SWATCH: Record<string, string> = {
  '111': '#ffffff', '011': '#3ff', '101': '#f4f', '110': '#ff4', '100': '#f44', '010': '#4f4', '001': '#66f', '000': '#555',
};

const vert = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform vec3 uLamp[3];
uniform vec3 uAxis[3];
uniform vec3 uCol[3];
uniform float uOn[3];
uniform vec4 uBall;
uniform vec3 uRodA;
uniform vec3 uRodB;
uniform float uRodR;
uniform float uLampR;
uniform float uRef;
uniform float uGain;
uniform vec3 uAmbient;
varying vec3 vW;
varying vec3 vN;

// Distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9).
// s returns the parameter along the first segment.
float segSeg(vec3 p1, vec3 q1, vec3 p2, vec3 q2, out float s) {
  vec3 d1 = q1 - p1;
  vec3 d2 = q2 - p2;
  vec3 r = p1 - p2;
  float a = dot(d1, d1);
  float e = dot(d2, d2);
  float f = dot(d2, r);
  float c = dot(d1, r);
  float b = dot(d1, d2);
  float den = a * e - b * b;
  s = den > 1e-9 ? clamp((b * f - c * e) / den, 0.0, 1.0) : 0.0;
  float t = (b * s + f) / e;
  if (t < 0.0) { t = 0.0; s = clamp(-c / a, 0.0, 1.0); }
  else if (t > 1.0) { t = 1.0; s = clamp((b - c) / a, 0.0, 1.0); }
  return length((p1 + d1 * s) - (p2 + d2 * t));
}

// Fraction of the lamp visible from wall point P (soft: the lamp is a small disc).
float visibility(vec3 P, vec3 Lp) {
  vec3 ab = Lp - P;
  float t = clamp(dot(uBall.xyz - P, ab) / dot(ab, ab), 0.0, 1.0);
  float d = length(uBall.xyz - (P + ab * t));
  float pen = uLampR * t + 0.002;
  float v = smoothstep(uBall.w - pen, uBall.w + pen, d);
  float s;
  float dr = segSeg(P, Lp, uRodA, uRodB, s);
  float pr = uLampR * s + 0.002;
  v *= smoothstep(uRodR - pr, uRodR + pr, dr);
  return v;
}

void main() {
  vec3 N = normalize(vN);
  vec3 col = uAmbient;
  for (int i = 0; i < 3; i++) {
    vec3 Lv = uLamp[i] - vW;
    float d2 = dot(Lv, Lv);
    vec3 l = Lv * inversesqrt(d2);
    float ndl = max(dot(N, l), 0.0);
    float spot = smoothstep(0.76, 0.97, dot(-l, uAxis[i]));
    float e = uOn[i] * ndl * spot * uRef / d2;
    if (e > 0.0) col += uCol[i] * e * visibility(vW, uLamp[i]);
  }
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

export function buildShadows(ctx: RoomContext) {
  const ROOM_X = -7;
  const ROOM_Z = -4.4;
  const g = new THREE.Group();
  g.position.set(ROOM_X, 0, ROOM_Z);
  ctx.group.add(g);

  const st = {
    on: [true, true, true],
    lampZ: [-0.75, 0, 0.75],
    lampY: [1.3, 1.3, 1.3],
    ball: new THREE.Vector3(0, 1.3, 0),
    dirty: true,
  };

  // ---------------------------------------------------------------- wall
  const uniforms = {
    uLamp: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uAxis: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uCol: { value: LAMPS.map((l) => new THREE.Vector3(...l.col)) },
    uOn: { value: [1, 1, 1] },
    uBall: { value: new THREE.Vector4() },
    uRodA: { value: new THREE.Vector3() },
    uRodB: { value: new THREE.Vector3() },
    uRodR: { value: ROD_R },
    uLampR: { value: LAMP_R },
    uRef: { value: 3.0 * 3.0 },
    uGain: { value: 0.6 },
    uAmbient: { value: new THREE.Vector3(0.045, 0.04, 0.038) },
  };
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_W, WALL_H),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag }),
  );
  wall.position.set(WALL_X, WALL_Y, 0);
  wall.rotation.y = Math.PI / 2;
  g.add(wall);
  const frame = merged(
    [
      { geo: rbox(0.1, WALL_H + 0.16, 0.08, 0.02), pos: [WALL_X - 0.03, WALL_Y, -WALL_W / 2 - 0.04] },
      { geo: rbox(0.1, WALL_H + 0.16, 0.08, 0.02), pos: [WALL_X - 0.03, WALL_Y, WALL_W / 2 + 0.04] },
      { geo: rbox(0.1, 0.08, WALL_W + 0.16, 0.02), pos: [WALL_X - 0.03, WALL_Y + WALL_H / 2 + 0.04, 0] },
      { geo: rbox(0.1, 0.08, WALL_W + 0.16, 0.02), pos: [WALL_X - 0.03, WALL_Y - WALL_H / 2 - 0.04, 0] },
      { geo: new THREE.BoxGeometry(0.04, WALL_H, WALL_W), pos: [WALL_X - 0.04, WALL_Y, 0] },
      { geo: new THREE.BoxGeometry(0.12, WALL_Y - WALL_H / 2, 0.12), pos: [WALL_X - 0.03, (WALL_Y - WALL_H / 2) / 2, -WALL_W / 2 + 0.2] },
      { geo: new THREE.BoxGeometry(0.12, WALL_Y - WALL_H / 2, 0.12), pos: [WALL_X - 0.03, (WALL_Y - WALL_H / 2) / 2, WALL_W / 2 - 0.2] },
      { geo: new THREE.BoxGeometry(0.6, 0.05, 0.3), pos: [WALL_X - 0.03, 0.025, -WALL_W / 2 + 0.2] },
      { geo: new THREE.BoxGeometry(0.6, 0.05, 0.3), pos: [WALL_X - 0.03, 0.025, WALL_W / 2 - 0.2] },
    ],
    mats.wood,
  );
  g.add(frame);
  ctx.addCollider(ROOM_X + WALL_X - 0.03, ROOM_Z, 0.7, WALL_W + 0.3);
  const pl = plaque(L('Färgade skuggor', 'Coloured shadows'), 0.8, 0.14);
  pl.position.set(WALL_X + 0.03, WALL_Y + WALL_H / 2 + 0.2, 0);
  pl.rotation.y = Math.PI / 2;
  g.add(pl);

  // ---------------------------------------------------------------- lamps
  const headGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.18, 20).rotateX(Math.PI / 2);
  const lensGeo = new THREE.CircleGeometry(0.066, 24);
  const poleGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 8).translate(0, 0.5, 0);
  const baseGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.04, 24);
  const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const wallCentreW = new THREE.Vector3();
  const lamps = LAMPS.map((def, i) => {
    const base = new THREE.Mesh(baseGeo, mats.blackMetal);
    const pole = new THREE.Mesh(poleGeo, mats.brass);
    const head = new THREE.Mesh(headGeo, mats.blackMetal);
    const lensMat = new THREE.MeshBasicMaterial({ color: def.hex, toneMapped: false });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.z = 0.091;
    head.add(lens);
    const glow = glowSprite(def.hex, 0.45, 0.85);
    glow.position.z = 0.12;
    head.add(glow);
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    g.add(base, pole, head, cone);
    ctx.addCollider(ROOM_X + LAMP_X, ROOM_Z + st.lampZ[i], 0.36, 0.36);
    return { base, pole, head, lens, lensMat, glow, cone };
  });

  function placeLamps() {
    g.updateMatrixWorld(true);
    wallCentreW.set(WALL_X, WALL_Y, 0);
    g.localToWorld(wallCentreW);
    lamps.forEach((l, i) => {
      const z = st.lampZ[i];
      const y = st.lampY[i];
      l.base.position.set(LAMP_X, 0.02, z);
      l.pole.position.set(LAMP_X, 0.04, z);
      l.pole.scale.y = y - 0.1;
      l.head.position.set(LAMP_X, y, z);
      l.head.lookAt(wallCentreW);
      const on = st.on[i];
      l.lensMat.color.setHex(on ? LAMPS[i].hex : 0x221c22);
      l.glow.visible = on;
      l.cone.visible = on;
      // the visible beam: a faint cone from the lamp to the wall
      l.cone.position.copy(l.head.position);
      l.cone.lookAt(wallCentreW);
      const dist = Math.hypot(LAMP_X - WALL_X, y - WALL_Y, z);
      l.cone.scale.set(0.95, 0.95, dist);
      const lw = uniforms.uLamp.value[i];
      // emitting point = lens centre
      l.lens.getWorldPosition(lw);
      uniforms.uAxis.value[i].copy(wallCentreW).sub(lw).normalize();
      uniforms.uOn.value[i] = on ? 1 : 0;
    });
  }

  // ---------------------------------------------------------------- ball on a rod
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.4, emissive: 0x000000 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), ballMat);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD_R, ROD_R, 1, 8).translate(0, 0.5, 0), mats.brass);
  const ballBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.05, 24), mats.blackMetal);
  g.add(ball, rod, ballBase);

  function placeBall() {
    const b = st.ball;
    ball.position.copy(b);
    rod.position.set(b.x, 0.05, b.z);
    rod.scale.y = Math.max(0.01, b.y - BALL_R - 0.05);
    ballBase.position.set(b.x, 0.025, b.z);
    const bw = ball.getWorldPosition(new THREE.Vector3());
    uniforms.uBall.value.set(bw.x, bw.y, bw.z, BALL_R);
    rod.localToWorld(uniforms.uRodA.value.set(0, 0, 0));
    rod.localToWorld(uniforms.uRodB.value.set(0, 1, 0));
    const e = new THREE.Color(0, 0, 0);
    st.on.forEach((on, i) => on && e.add(new THREE.Color(...LAMPS[i].col).multiplyScalar(0.18)));
    ballMat.emissive.copy(e);
  }

  // ---------------------------------------------------------------- CPU copy of the shadow test (for readouts)
  const _ab = new THREE.Vector3();
  const _q = new THREE.Vector3();
  function blockedCPU(P: THREE.Vector3, Lp: THREE.Vector3) {
    _ab.subVectors(Lp, P);
    const tt = THREE.MathUtils.clamp(_q.subVectors(st.ball, P).dot(_ab) / _ab.lengthSq(), 0, 1);
    _q.copy(P).addScaledVector(_ab, tt);
    return _q.distanceTo(st.ball) < BALL_R;
  }
  const lampLocal = (i: number) => new THREE.Vector3(LAMP_X - 0.091, st.lampY[i], st.lampZ[i]);
  function colourAt(P: THREE.Vector3) {
    return [0, 1, 2].map((j) => (st.on[j] && !blockedCPU(P, lampLocal(j)) ? '1' : '0')).join('');
  }
  /** Centre of lamp i's ball shadow on the wall plane. */
  function shadowCentre(i: number) {
    const Lp = lampLocal(i);
    const s = (WALL_X - Lp.x) / (st.ball.x - Lp.x);
    return Lp.clone().lerp(st.ball, s);
  }
  const report = { shadows: ['', '', ''], overlap: false };
  function analyse() {
    const centres = [0, 1, 2].map(shadowCentre);
    report.shadows = centres.map((c, i) => {
      if (!st.on[i]) return '';
      if (Math.abs(c.z) > WALL_W / 2 || Math.abs(c.y - WALL_Y) > WALL_H / 2) return 'off';
      return colourAt(c);
    });
    report.overlap = false;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      if (!st.on[i] || !st.on[j]) continue;
      const mid = centres[i].clone().lerp(centres[j], 0.5);
      const c = colourAt(mid);
      if (c[i] === '0' && c[j] === '0') report.overlap = true;
    }
  }

  // ---------------------------------------------------------------- HUD
  let ui: { rows: Readout[]; dist: HTMLInputElement; toggles: HTMLInputElement[] } | null = null;
  function drawHud() {
    if (!ui) return;
    report.shadows.forEach((code, i) => {
      const r = ui!.rows[i];
      if (!st.on[i]) {
        r.set(t(L('lampan är släckt', 'lamp is off')));
        r.el.style.color = '';
      } else if (code === 'off') {
        r.set(t(L('utanför väggen', 'off the wall')));
        r.el.style.color = '';
      } else {
        r.set(t(COLOR_NAMES[code]));
        r.el.style.color = SWATCH[code];
      }
    });
    ui.toggles.forEach((tg, i) => (tg.checked = st.on[i]));
  }

  // ---------------------------------------------------------------- milestones
  const say = cooldown(9);
  let saidCMY = false;
  let saidOverlap = false;
  let touched = false;
  function milestones() {
    if (!touched) return;
    const codes = report.shadows;
    if (!saidCMY && codes[0] === '011' && codes[1] === '101' && codes[2] === '110' && say()) {
      saidCMY = true;
      ctx.sfx.chime();
      ctx.buddy.celebrate(L('Titta! Skuggorna är cyan, magenta och gula, fast lamporna är röd, grön och blå.', 'Look! The shadows are cyan, magenta and yellow, even though the lamps are red, green and blue.'));
    } else if (!saidOverlap && report.overlap && say()) {
      saidOverlap = true;
      ctx.sfx.pop();
      ctx.buddy.say(L('Där två skuggor möts saknas två färger, så bara en lampas färg blir kvar. Och där alla tre möts blir det svart.', 'Where two shadows overlap, two colours are missing, so only one lamp’s colour is left. Where all three overlap, it’s black.'), { expression: 'idea' });
    }
  }

  // ---------------------------------------------------------------- interaction
  const _plane = new THREE.Plane();
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3();
  function dragPlaneX(localX: number) {
    g.updateMatrixWorld(true);
    _n.set(1, 0, 0).transformDirection(g.matrixWorld);
    _p.set(localX, 0, 0);
    g.localToWorld(_p);
    _plane.setFromNormalAndCoplanarPoint(_n, _p);
    return _plane;
  }
  function toggleLamp(i: number, v?: boolean) {
    st.on[i] = v ?? !st.on[i];
    ctx.sfx.tone(st.on[i] ? 900 : 500, 0.07, { type: 'triangle', gain: 0.08 });
    touched = true;
    st.dirty = true;
  }
  lamps.forEach((l, i) => {
    ctx.interaction.add(l.head, {
      label: L('Klicka: tänd/släck · dra: flytta lampan', 'Click: on/off · drag: move the lamp'),
      onClick: () => toggleLamp(i),
      onDrag: (info) => {
        const hit = info.onPlane(dragPlaneX(LAMP_X));
        if (!hit) return;
        g.worldToLocal(hit);
        st.lampZ[i] = THREE.MathUtils.clamp(hit.z, -1.2, 1.2);
        st.lampY[i] = THREE.MathUtils.clamp(hit.y, 0.7, 2.0);
        touched = true;
        st.dirty = true;
      },
    });
  });
  const ballDrag = {
    label: L('Dra bollen', 'Drag the ball'),
    onDrag: (info: { onPlane(p: THREE.Plane): THREE.Vector3 | null }) => {
      const hit = info.onPlane(dragPlaneX(st.ball.x));
      if (!hit) return;
      g.worldToLocal(hit);
      st.ball.z = THREE.MathUtils.clamp(hit.z, -1.2, 1.2);
      st.ball.y = THREE.MathUtils.clamp(hit.y, 0.55, 2.0);
      touched = true;
      st.dirty = true;
    },
  };
  ctx.interaction.add(ball, ballDrag);
  ctx.interaction.add(rod, ballDrag);
  ctx.addCollider(ROOM_X, ROOM_Z, 0.3, 0.3); // ball stand (initial spot; the ball moves only a little)

  ctx.addStation({
    id: 'light-shadows',
    title: L('Färgade skuggor', 'Coloured shadows'),
    position: [ROOM_X + 0.3, ROOM_Z],
    viewpoint: { position: [ROOM_X + 2.9, 1.7, ROOM_Z + 2.35], target: [ROOM_X - 1.0, 1.15, ROOM_Z - 0.55] },
    intro: L('Vilken färg har en skugga? Svart, tror de flesta. Här blir de cyan, magenta och gula!', 'What colour is a shadow? Black, most people think. Here they turn cyan, magenta and yellow!'),
    howTo: L('Dra bollen framför väggen. Klicka på en lampa för att tända eller släcka den, dra lamporna för att flytta dem.', 'Drag the ball in front of the wall. Click a lamp to switch it on or off, drag the lamps to move them.'),
    science: L(
      'Väggen är vit, så den skickar tillbaka allt ljus som når den. Där alla tre lampor lyser blandas rött, grönt och blått till vitt. Bollen skuggar bort en lampa i taget: där det röda ljuset saknas blir det grönt + blått = cyan, utan grönt blir det magenta och utan blått gult. Det här är additiv färgblandning, och den skiljer sig från målarfärg: rött + grönt ljus blir gult, inte brunt. Där två skuggor överlappar finns bara en färg kvar, och där alla tre möts blir det svart. Skuggornas kanter är mjuka eftersom varje lampa är en liten skiva och inte en punkt.',
      'The wall is white, so it sends back all the light that reaches it. Where all three lamps shine, red, green and blue add up to white. The ball blocks one lamp at a time: where the red light is missing you get green + blue = cyan, without green you get magenta, and without blue, yellow. This is additive colour mixing, and it is different from paint: red + green light makes yellow, not brown. Where two shadows overlap only one colour is left, and where all three meet it is black. The shadow edges are soft because each lamp is a small disc, not a point.',
    ),
    wow: L('Din mobilskärm gör alla sina färger av bara tre sorters små lampor: röda, gröna och blå. Titta på den med ett förstoringsglas!', 'Your phone screen makes every colour from just three kinds of tiny lights: red, green and blue. Look at it through a magnifying glass!'),
    controls: (panel: ControlPanel) => {
      panel.heading(L('Lampor', 'Lamps'));
      const toggles = LAMPS.map((l, i) => panel.toggle(L(`Lampa ${['🔴', '🟢', '🔵'][i]} ${l.name.sv}`, `${['🔴', '🟢', '🔵'][i]} ${l.name.en} lamp`), st.on[i], (v) => toggleLamp(i, v)));
      const dist = panel.slider(
        L('Bollens avstånd till väggen', 'Ball’s distance from the wall'),
        { min: 0.35, max: 2.6, step: 0.01, value: st.ball.x - WALL_X, format: (v) => `${fmt(v, 2)} m` },
        (v) => {
          st.ball.x = WALL_X + v;
          touched = true;
          st.dirty = true;
        },
      );
      panel.heading(L('Skuggornas färg', 'Shadow colours'));
      const rows = LAMPS.map((l) => panel.readout(L(`Skugga från ${l.name.sv} lampa`, `Shadow of the ${l.name.en} lamp`)));
      panel.button(L('Alla lampor på', 'All lamps on'), () => {
        st.on = [true, true, true];
        st.dirty = true;
      });
      panel.note(L('Flytta bollen närmare lamporna: skuggorna blir större och glider isär.', 'Move the ball closer to the lamps: the shadows grow and drift apart.'));
      ui = { rows, dist, toggles };
      drawHud();
      return () => {
        ui = null;
      };
    },
  });

  return {
    update() {
      if (!st.dirty) return;
      st.dirty = false;
      placeLamps();
      placeBall();
      analyse();
      drawHud();
      milestones();
    },
  };
}
