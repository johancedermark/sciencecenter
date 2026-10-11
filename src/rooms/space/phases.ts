/**
 * Station 3: Moon phases. A lamp (the Sun), the Earth in the middle and a Moon you drag around its orbit.
 * The porthole shows the Moon as seen from Earth: an exact analytic render of a sphere lit from the
 * lamp's direction, expressed in the Earth-observer's view frame (north up). Lit fraction = (1 − cos α)/2,
 * where α is the Sun–Earth–Moon angle (elongation).
 */
import * as THREE from 'three';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import type { L10n, RoomContext } from '../../core/types';
import { getLang } from '../../core/i18n';
import { radialSpot } from '../../core/textures';
import {
  FONT, L, MAT, SYNODIC_MONTH_D, canvasPlane, fmt, planetTexture, sunlitMaterial, t, type RoomBuddy,
} from './shared';

export const PHASES_POS: [number, number] = [6.8, -5.4];
const TABLE_Y = 0.78;
const EARTH_Y = 1.08;
const EARTH_R = 0.13;
const ORBIT_R = 0.62;
const MOON_R = 0.055;
const LAMP: [number, number, number] = [0, EARTH_Y, -1.45];
const THETA_SUN = Math.atan2(-LAMP[2], LAMP[0]); // prograde angle of the lamp seen from Earth (90°)

function phaseName(phiDeg: number): L10n {
  const p = ((phiDeg % 360) + 360) % 360;
  if (p < 8 || p >= 352) return L('Nymåne', 'New moon');
  if (p < 82) return L('Tilltagande månskära', 'Waxing crescent');
  if (p < 98) return L('Första kvarteret', 'First quarter');
  if (p < 172) return L('Tilltagande måne', 'Waxing gibbous');
  if (p < 188) return L('Fullmåne', 'Full moon');
  if (p < 262) return L('Avtagande måne', 'Waning gibbous');
  if (p < 278) return L('Sista kvarteret', 'Last quarter');
  return L('Avtagande månskära', 'Waning crescent');
}

export function buildPhases(ctx: RoomContext, buddy: RoomBuddy) {
  const root = new THREE.Group();
  root.position.set(PHASES_POS[0], 0, PHASES_POS[1]);
  ctx.group.add(root);
  ctx.addCollider(PHASES_POS[0], PHASES_POS[1] - 0.35, 2.2, 2.9);

  // --- Table, Earth, lamp --------------------------------------------------------------------
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, TABLE_Y, 48), MAT.darkWood);
  table.position.y = TABLE_Y / 2;
  root.add(table);
  const topMat = new THREE.MeshStandardMaterial({ color: 0x1a1a3c, roughness: 0.55 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.93, 48), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = TABLE_Y + 0.002;
  root.add(top);
  const tableRim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.025, 8, 64), MAT.brass);
  tableRim.rotation.x = Math.PI / 2;
  tableRim.position.y = TABLE_Y;
  root.add(tableRim);

  const lampWorld = ctx.toWorld(new THREE.Vector3(PHASES_POS[0] + LAMP[0], LAMP[1], PHASES_POS[1] + LAMP[2]));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, LAMP[1], 12), MAT.brass);
  pole.position.set(LAMP[0], LAMP[1] / 2, LAMP[2]);
  root.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 24), MAT.darkWood);
  foot.position.set(LAMP[0], 0.025, LAMP[2]);
  root.add(foot);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), MAT.glow(0xffd28a, 2.2));
  bulb.position.set(...LAMP);
  root.add(bulb);
  const reflector = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd9b46a, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }),
  );
  reflector.rotation.x = Math.PI / 2; // opening faces +Z (towards Earth)
  reflector.position.set(LAMP[0], LAMP[1], LAMP[2] - 0.08);
  root.add(reflector);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSpot('rgba(255,210,140,0.85)', 'rgba(255,160,60,0)'), blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  lampGlow.scale.setScalar(0.9);
  lampGlow.position.set(...LAMP);
  root.add(lampGlow);
  ctx.addLight({ position: [PHASES_POS[0] + LAMP[0], LAMP[1] + 0.3, PHASES_POS[1] + LAMP[2]], color: 0xffc98a, intensity: 10, distance: 5 });

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, EARTH_Y - TABLE_Y - EARTH_R + 0.02, 12), MAT.brass);
  stand.position.y = TABLE_Y + (EARTH_Y - TABLE_Y - EARTH_R) / 2;
  root.add(stand);
  const earthTilt = new THREE.Group();
  earthTilt.position.y = EARTH_Y;
  earthTilt.rotation.z = THREE.MathUtils.degToRad(23.4);
  root.add(earthTilt);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 40, 28),
    sunlitMaterial(lampWorld, { map: planetTexture('earth'), ambient: 0.16, sun: 1.3, rim: 0x6fb6ff, rimStrength: 0.7 }),
  );
  earthTilt.add(earth);


  // Orbit ring (a tilted plane: the tilt is exaggerated to 18° so it shows at this small scale; the real one is 5.1°)
  const ORB_N = 128;
  const orbitPts = new Float32Array(ORB_N * 3);
  const orbitGeo = new THREE.BufferGeometry();
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPts, 3));
  const orbit = new THREE.LineLoop(orbitGeo, new THREE.LineBasicMaterial({ color: 0xb4a6ff }));
  orbit.position.y = EARTH_Y;
  root.add(orbit);
  const TAN_I = Math.tan(THREE.MathUtils.degToRad(18));
  const moonHeight = (theta: number) => ORBIT_R * TAN_I * Math.sin(theta - st.node);
  const writeOrbit = () => {
    for (let i = 0; i < ORB_N; i++) {
      const a = (i / ORB_N) * Math.PI * 2;
      orbitPts[i * 3] = Math.cos(a) * ORBIT_R;
      orbitPts[i * 3 + 1] = moonHeight(a);
      orbitPts[i * 3 + 2] = -Math.sin(a) * ORBIT_R;
    }
    orbitGeo.attributes.position.needsUpdate = true;
  };

  // Moon on an arm
  const arm = new THREE.Group();
  arm.position.y = TABLE_Y + 0.12;
  root.add(arm);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(ORBIT_R, 0.01, 0.014).translate(ORBIT_R / 2, 0, 0), MAT.brass);
  arm.add(rod);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, EARTH_Y - arm.position.y, 6).translate(0, (EARTH_Y - arm.position.y) / 2, 0), MAT.brass);
  pin.position.x = ORBIT_R;
  arm.add(pin);
  const moonMat = sunlitMaterial(lampWorld, { map: planetTexture('moon'), ambient: 0.08, sun: 1.4, rim: 0xffffff, rimStrength: 0.12 });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 32, 20), moonMat);
  moon.position.set(ORBIT_R, EARTH_Y - arm.position.y, 0);
  arm.add(moon);
  const moonHit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  moonHit.position.copy(moon.position);
  arm.add(moonHit);

  // Earth's shadow (umbra drawn as a cylinder, since the model Sun is far bigger than this lamp would suggest)
  const shadow = new THREE.Mesh(
    new THREE.CylinderGeometry(EARTH_R, EARTH_R, 1.0, 32, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
  );
  shadow.position.y = EARTH_Y;
  root.add(shadow);

  // --- Porthole: the view from Earth ----------------------------------------------------------
  const view = new THREE.Group();
  view.position.set(-1.25, 1.55, 0.25);
  view.rotation.y = 0.35;
  root.add(view);
  const viewMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uL: { value: new THREE.Vector3(0, 0, 1) },
      uEclipse: { value: 0 },
      uMap: { value: planetTexture('moon') },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uL; uniform float uEclipse; uniform sampler2D uMap; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float rr = length(p);
        if (rr > 1.0) discard;
        // night sky with a few stars, brighter towards the Sun (glare near new moon)
        vec3 col = vec3(0.012, 0.016, 0.05);
        float s = hash(floor(vUv * 90.0));
        col += vec3(0.8) * step(0.985, s) * 0.6;
        vec2 sunDir = length(uL.xy) > 1e-4 ? normalize(uL.xy) : vec2(0.0);
        float toward = 0.5 + 0.5 * dot(normalize(p + 1e-5), sunDir);
        col += vec3(1.0, 0.75, 0.45) * pow(max(-uL.z, 0.0), 8.0) * 0.45 * toward;
        vec2 q = p / 0.72;
        float r2 = dot(q, q);
        if (r2 < 1.0) {
          vec3 n = vec3(q.x, q.y, sqrt(1.0 - r2));
          float lon = atan(n.x, n.z);
          float lat = asin(clamp(n.y, -1.0, 1.0));
          vec3 albedo = texture2D(uMap, vec2(0.5 + lon / 6.2831853, 0.5 + lat / 3.14159265)).rgb;
          float d = dot(n, normalize(uL));
          float lit = smoothstep(-0.025, 0.045, d);
          vec3 sunlit = albedo * 1.45 * lit;
          sunlit = mix(sunlit, albedo * vec3(0.55, 0.16, 0.07) * lit, uEclipse);
          vec3 earthshine = albedo * vec3(0.05, 0.06, 0.09);
          col = sunlit + earthshine * (1.0 - lit);
        }
        // soft edge at the porthole glass
        col *= smoothstep(1.0, 0.94, rr);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const viewDisc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), viewMat);
  view.add(viewDisc);
  const porthole = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 12, 48), MAT.brass);
  view.add(porthole);
  const viewPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.2, 10), MAT.brass);
  viewPost.position.y = -0.95;
  view.add(viewPost);
  const viewFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 20), MAT.darkWood);
  viewFoot.position.y = -1.53;
  view.add(viewFoot);
  ctx.addCollider(PHASES_POS[0] - 1.25, PHASES_POS[1] + 0.25, 0.4, 0.4);

  let shownName = '';
  let shownPct = -1;
  const st = {
    theta: THETA_SUN + THREE.MathUtils.degToRad(60),
    playing: false,
    shadow: true,
    season: false,
    /** Ascending node of the Moon's orbit. Outside eclipse season the node line is square to the Sun. */
    node: THETA_SUN + Math.PI / 2,
    phi: 60,
    frac: 0.25,
    eclipse: 0,
    visitedNew: false,
    lastName: '',
  };
  writeOrbit();
  const sign = canvasPlane(0.9, 0.3, [512, 170], (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,16,50,0.85)';
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 26);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#cfc8ff';
    g.font = `600 24px ${FONT}`;
    g.fillText(getLang() === 'sv' ? 'Utsikt från Jorden' : 'View from Earth', w / 2, 32);
    g.fillStyle = '#fff';
    g.font = `700 40px ${FONT}`;
    g.fillText(t(phaseName(st.phi)), w / 2, 82);
    g.fillStyle = '#ffd68c';
    g.font = `600 30px ${FONT}`;
    g.fillText(`${fmt(st.frac * 100, 0)} % ${getLang() === 'sv' ? 'belyst' : 'lit'}`, w / 2, 132);
  }, true);
  sign.mesh.position.y = 0.55;
  view.add(sign.mesh);

  // --- Interaction -------------------------------------------------------------------------
  let dragPlane = new THREE.Plane();
  const tmp = new THREE.Vector3();
  ctx.interaction.add(moonHit, {
    label: L('Dra Månen runt Jorden', 'Drag the Moon around Earth'),
    onDragStart: () => {
      st.playing = false;
      root.updateWorldMatrix(true, false);
      tmp.set(0, EARTH_Y, 0).applyMatrix4(root.matrixWorld);
      dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), tmp);
    },
    onDrag: (info) => {
      const q = info.onPlane(dragPlane);
      if (!q) return;
      root.worldToLocal(tmp.copy(q));
      st.theta = Math.atan2(-tmp.z, tmp.x);
    },
  });
  ctx.interaction.add(bulb, {
    label: L('Lampan = Solen', 'The lamp = the Sun'),
    onClick: () => {
      ctx.sfx.chime();
      buddy.say(L('Solen lyser alltid på halva Månen. Faserna visar bara hur mycket av den ljusa halvan vi ser härifrån.', 'The Sun always lights half of the Moon. The phases only show how much of that bright half we can see from here.'));
    },
  });

  const setPhi = (deg: number) => {
    st.playing = false;
    st.theta = THETA_SUN + THREE.MathUtils.degToRad(deg);
    ctx.sfx.pop();
  };

  // --- HUD ----------------------------------------------------------------------------------
  let ui: { name: Readout; lit: Readout; angle: Readout; day: Readout; play: HTMLButtonElement } | null = null;
  const controls = (panel: ControlPanel) => {
    const name = panel.readout(L('Fas', 'Phase'));
    const lit = panel.readout(L('Belyst del av skivan', 'Lit part of the disc'));
    const angle = panel.readout(L('Vinkel Sol–Jord–Måne', 'Angle Sun–Earth–Moon'));
    const day = panel.readout(L('Dagar sedan nymåne', 'Days since new moon'));
    panel.buttons([
      { label: L('Nymåne', 'New'), icon: '🌑', onClick: () => setPhi(0) },
      { label: L('Första kv.', 'First qtr'), icon: '🌓', onClick: () => setPhi(90) },
      { label: L('Fullmåne', 'Full'), icon: '🌕', onClick: () => setPhi(180) },
      { label: L('Sista kv.', 'Last qtr'), icon: '🌗', onClick: () => setPhi(270) },
    ]);
    const play = panel.button(st.playing ? L('Pausa månaden', 'Pause the month') : L('Spela en månad', 'Play a month'), () => {
      st.playing = !st.playing;
      play.textContent = t(st.playing ? L('⏸ Pausa månaden', '⏸ Pause the month') : L('▶ Spela en månad', '▶ Play a month'));
    }, { icon: st.playing ? '⏸' : '▶' });
    panel.toggle(L('Visa Jordens skugga', "Show Earth's shadow"), st.shadow, (v) => {
      st.shadow = v;
    });
    panel.toggle(L('Förmörkelsesäsong', 'Eclipse season'), st.season, (v) => {
      st.season = v;
      st.node = v ? THETA_SUN : THETA_SUN + Math.PI / 2;
      writeOrbit();
    });
    panel.note(L(
      'Skuggan pekar bort från Solen. Månens bana lutar, så oftast passerar fullmånen ovanför skuggan. Bara när banans skärningslinje pekar mot Solen (förmörkelsesäsong, ungefär två gånger om året) träffar skuggan Månen: en månförmörkelse, inte en fas.',
      'The shadow points away from the Sun. The Moon\'s orbit is tilted, so the full Moon usually passes above the shadow. Only when the orbit\'s crossing line points at the Sun (eclipse season, about twice a year) does the shadow hit the Moon: a lunar eclipse, not a phase.',
    ));
    ui = { name, lit, angle, day, play };
    return () => {
      ui = null;
    };
  };

  // --- Update ---------------------------------------------------------------------------------
  const S = new THREE.Vector3(LAMP[0], 0, LAMP[2]).normalize(); // Earth → Sun (lamp), in the orbit plane
  const M = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const zv = new THREE.Vector3();
  const lv = viewMat.uniforms.uL.value as THREE.Vector3;
  const moonColor = (moonMat.uniforms.uColor.value as THREE.Color);
  const white = new THREE.Color(1, 1, 1);
  const copper = new THREE.Color(0.9, 0.35, 0.18);
  let tickPhase = Math.round(st.phi / 45);
  let uiTimer = 0;

  const update = (dt: number, time: number) => {
    if (st.playing) st.theta += ((Math.PI * 2) / 14) * dt; // one synodic month in 14 s
    arm.rotation.y = st.theta;
    earth.rotation.y += dt * 0.6;
    moon.rotation.y = Math.PI; // tidally locked: the arm keeps the same face towards Earth
    shadow.visible = st.shadow;
    shadow.rotation.y = Math.atan2(-S.x, -S.z);
    lampGlow.material.opacity = 0.85 + 0.1 * Math.sin(time * 3.1);

    // Geometry: everything in the station frame (Earth at the origin of the orbit plane)
    const dy = moonHeight(st.theta);
    moon.position.y = EARTH_Y - arm.position.y + dy;
    moonHit.position.y = moon.position.y;
    pin.scale.y = moon.position.y / (EARTH_Y - arm.position.y);
    M.set(Math.cos(st.theta) * ORBIT_R, dy, -Math.sin(st.theta) * ORBIT_R).normalize();
    const cosA = S.dot(M);
    st.frac = (1 - cosA) / 2;
    let phi = THREE.MathUtils.radToDeg(st.theta - THETA_SUN) % 360;
    if (phi < 0) phi += 360;
    st.phi = phi;
    // Observer at Earth looking at the Moon, north (orbit normal) up.
    right.crossVectors(M, Y).normalize();
    zv.copy(M).negate();
    up.crossVectors(zv, right);
    lv.set(S.dot(right), S.dot(up), S.dot(zv));
    // Eclipse: is the Moon inside the umbra cylinder behind Earth?
    const dist = Math.hypot(ORBIT_R, dy);
    const along = -cosA * dist;
    const perp = Math.sqrt(Math.max(0, dist * dist - along * along));
    st.eclipse = along > 0 ? 1 - THREE.MathUtils.smoothstep(perp, EARTH_R - MOON_R, EARTH_R + MOON_R) : 0;
    viewMat.uniforms.uEclipse.value = st.eclipse;
    moonColor.copy(white).lerp(copper, st.eclipse);
    moonMat.uniforms.uDim.value = 1 - 0.55 * st.eclipse;

    // Feedback: soft tick at each eighth of the cycle, milestones for Buddy
    const tp = Math.round(phi / 45) % 8;
    if (tp !== tickPhase) {
      tickPhase = tp;
      ctx.sfx.tone(520 + tp * 60, 0.08, { type: 'triangle', gain: 0.06 });
    }
    const nm = t(phaseName(phi));
    if (phi < 8 || phi > 352) st.visitedNew = true;
    if (nm !== st.lastName) {
      st.lastName = nm;
      if (st.eclipse > 0.6) {
        buddy.celebrate(L(
          'Månförmörkelse! Nu hamnade Månen i Jordens skugga och blev kopparröd. Det händer bara vid fullmåne.',
          'Lunar eclipse! The Moon slipped into Earth\'s shadow and turned copper red. That only happens at full moon.',
        ));
      } else if (phi > 172 && phi < 188 && st.visitedNew) {
        st.visitedNew = false;
        buddy.celebrate(L('Fullmåne! Månen står mitt emot Solen, så vi ser hela den upplysta sidan.', 'Full moon! The Moon is opposite the Sun, so we see the whole lit side.'));
      }
    }

    const pct = Math.round(st.frac * 100);
    const name = t(phaseName(phi));
    if (pct !== shownPct || name !== shownName) {
      shownPct = pct;
      shownName = name;
      sign.redraw();
    }
    uiTimer -= dt;
    if (ui && uiTimer <= 0) {
      uiTimer = 0.08;
      ui.name.set(st.eclipse > 0.5 ? t(L('Månförmörkelse!', 'Lunar eclipse!')) : name);
      ui.lit.set(`${fmt(st.frac * 100, 0)} %`);
      ui.angle.set(`${fmt(phi <= 180 ? phi : 360 - phi, 0)}°`);
      ui.day.set(`${fmt((phi / 360) * SYNODIC_MONTH_D, 1)} ${getLang() === 'sv' ? 'dygn' : 'days'}`);
    }
  };

  return { controls, update };
}
