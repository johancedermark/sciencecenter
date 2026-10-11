/**
 * Atmosphere and decor for the Space room: a planetarium ceiling with twinkling stars and the odd
 * shooting star, a dusk band on the upper walls, a hanging Saturn, a poster of the autumn sky over
 * Sweden (Karlavagnen), a retro rocket and an astronaut.
 */
import * as THREE from 'three';
import type { RoomContext } from '../../core/types';
import { getLang } from '../../core/i18n';
import { radialSpot } from '../../core/textures';
import { FONT, L, MAT, astronautGeometry, canvasPlane, planetTexture, ringTexture, sunlitMaterial } from './shared';

const CEIL_Y = 5.68;

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildDecor(ctx: RoomContext) {
  const g = ctx.group;
  const W = ctx.size.width;
  const D = ctx.size.depth;
  const r = rng(2026);

  // --- Planetarium ceiling ------------------------------------------------------------------
  const ceilTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const x = c.getContext('2d')!;
    const grad = x.createRadialGradient(512, 512, 60, 512, 512, 720);
    grad.addColorStop(0, '#1b1f5c');
    grad.addColorStop(0.6, '#0f1240');
    grad.addColorStop(1, '#070824');
    x.fillStyle = grad;
    x.fillRect(0, 0, 1024, 1024);
    // Milky Way: a soft diagonal band of haze and faint stars
    x.save();
    x.translate(512, 512);
    x.rotate(-0.6);
    for (let i = 0; i < 420; i++) {
      const px = (r() - 0.5) * 1500;
      const py = (r() - 0.5) * 220 * (0.4 + r());
      x.fillStyle = `rgba(${150 + r() * 60},${140 + r() * 50},255,${0.025 + r() * 0.03})`;
      x.beginPath();
      x.ellipse(px, py, 30 + r() * 80, 12 + r() * 30, 0, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(230,230,255,${r() * 0.5})`;
      x.fillRect((r() - 0.5) * 1500, (r() - 0.5) * 260 * r(), 1.2, 1.2);
    }
    x.restore();
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = `rgba(220,220,255,${r() * 0.35})`;
      x.fillRect(r() * 1024, r() * 1024, 1.3, 1.3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: ceilTex, color: 0xb8b8d8 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = CEIL_Y;
  g.add(ceiling);

  // Twinkling stars (one draw call)
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  const col = new Float32Array(N * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * (W - 0.2);
    pos[i * 3 + 1] = CEIL_Y - 0.02;
    pos[i * 3 + 2] = (r() - 0.5) * (D - 0.2);
    const bright = r() < 0.06;
    size[i] = bright ? 0.09 + r() * 0.06 : 0.03 + r() * 0.04;
    phase[i] = r();
    const k = r();
    tint.setHSL(k < 0.25 ? 0.08 : k < 0.6 ? 0.62 : 0.7, k < 0.6 ? 0.6 : 0.15, 0.85);
    const b = bright ? 2.2 : 1.0;
    col[i * 3] = tint.r * b;
    col[i * 3 + 1] = tint.g * b;
    col[i * 3 + 2] = tint.b * b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 420 * Math.min(window.devicePixelRatio || 1, 1.75) } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      uniform float uTime; uniform float uScale;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aPhase * 2.6) + aPhase * 40.0);
        tw *= 0.85 + 0.15 * sin(uTime * 7.3 + aPhase * 91.0);
        vCol = aColor * tw;
        gl_PointSize = max(1.5, aSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a;
        // little four-point sparkle
        float cross = max(0.0, 1.0 - abs(p.x) * 14.0) * smoothstep(0.5, 0.0, abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 14.0) * smoothstep(0.5, 0.0, abs(p.x));
        gl_FragColor = vec4(vCol * (a + cross * 0.35), 1.0);
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  g.add(stars);

  // Shooting star
  const streakTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 16;
    const x = c.getContext('2d')!;
    const grad = x.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.85, 'rgba(220,220,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = grad;
    x.fillRect(0, 5, 256, 6);
    return new THREE.CanvasTexture(c);
  })();
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.05),
    new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  streak.rotation.x = Math.PI / 2;
  streak.position.y = CEIL_Y - 0.04;
  streak.visible = false;
  g.add(streak);
  const shoot = { t: -1, next: 4, x0: 0, z0: 0, dx: 0, dz: 0 };

  // --- Dusk band on the upper walls ---------------------------------------------------------------
  const bandTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const x = c.getContext('2d')!;
    const grad = x.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0, 'rgba(16,14,52,0)');
    grad.addColorStop(0.55, 'rgba(16,15,60,0.75)');
    grad.addColorStop(1, 'rgba(9,10,38,1)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 160; i++) {
      const y = r() * 170;
      x.fillStyle = `rgba(230,230,255,${(1 - y / 200) * r() * 0.9})`;
      x.fillRect(r() * 512, y, 1.6, 1.6);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const BAND_Y0 = 3.5;
  const bandH = CEIL_Y - BAND_Y0;
  const bandMat = new THREE.MeshBasicMaterial({ map: bandTex, transparent: true, depthWrite: false });
  const addBand = (x: number, z: number, w: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, bandH), bandMat);
    m.position.set(x, BAND_Y0 + bandH / 2, z);
    m.rotation.y = ry;
    m.renderOrder = -1;
    g.add(m);
  };
  addBand(0, -D / 2 + 0.015, W, 0);
  addBand(0, D / 2 - 0.015, W, Math.PI);
  addBand(-W / 2 + 0.015, 0, D, Math.PI / 2);
  addBand(W / 2 - 0.015, 0, D, -Math.PI / 2);

  // --- Hanging Saturn over the entrance --------------------------------------------------------
  const satWorldSun = ctx.toWorld(new THREE.Vector3(-3, 5, 6));
  const saturn = new THREE.Group();
  saturn.position.set(0, 4.55, 1.2);
  g.add(saturn);
  const satBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 40, 24),
    sunlitMaterial(satWorldSun, { map: planetTexture('saturn'), ambient: 0.25, sun: 1.25, rim: 0xffd890, rimStrength: 1.0 }),
  );
  saturn.add(satBody);
  const satRing = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.68, 96),
    new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(1.1, 1.0, 0.85) }),
  );
  // RingGeometry UVs are planar over the outer radius; scale the texture so its outer edge matches.
  satRing.rotation.x = -Math.PI / 2;
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(26.7);
  tilt.add(satRing);
  saturn.add(tilt);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, CEIL_Y - 4.87, 4), MAT.brass);
  wire.position.set(0, (CEIL_Y + 4.87) / 2 - 4.55, 0);
  saturn.add(wire);
  ctx.interaction.add(satBody, {
    label: L('Saturnus: så lätt att den skulle flyta i vatten', 'Saturn: so light it would float in water'),
  });

  // --- Poster: the night sky over Sweden ------------------------------------------------------
  // Stereographic projection around the celestial pole for an autumn evening (local sidereal time ≈ 22 h),
  // seen facing north from Sweden (pole altitude ≈ 59°).
  const STARS: [string, number, number, number][] = [
    // name, RA (h), Dec (°), magnitude
    ['Dubhe', 11.062, 61.75, 1.8], ['Merak', 11.031, 56.38, 2.4], ['Phecda', 11.897, 53.69, 2.4],
    ['Megrez', 12.257, 57.03, 3.3], ['Alioth', 12.9, 55.96, 1.8], ['Mizar', 13.399, 54.93, 2.2],
    ['Alkaid', 13.792, 49.31, 1.9], ['Polaris', 2.53, 89.26, 2.0],
    ['Caph', 0.153, 59.15, 2.3], ['Schedar', 0.675, 56.54, 2.2], ['Gamma', 0.945, 60.72, 2.2],
    ['Ruchbah', 1.43, 60.24, 2.7], ['Segin', 1.907, 63.67, 3.4],
  ];
  const poster = canvasPlane(2.7, 1.8, [1024, 683], (x, w, h) => {
    const sv = getLang() === 'sv';
    const sky = x.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#060824');
    sky.addColorStop(0.75, '#16205a');
    sky.addColorStop(1, '#2d3a7a');
    x.fillStyle = sky;
    x.fillRect(0, 0, w, h);
    const rr = rng(77);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(255,255,255,${rr() * 0.55})`;
      x.fillRect(rr() * w, rr() * h * 0.85, 1.5, 1.5);
    }
    // aurora
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = `rgba(90,255,170,${0.012 + rr() * 0.014})`;
      x.lineWidth = 14 + rr() * 20;
      x.beginPath();
      const y0 = 470 + rr() * 40;
      x.moveTo(0, y0);
      x.bezierCurveTo(w * 0.3, y0 - 120 - rr() * 60, w * 0.6, y0 + 30, w, y0 - 90 - rr() * 40);
      x.stroke();
    }
    const LST = 22;
    const cx = 600;
    const cy = 250;
    const S = 820;
    const proj = (ra: number, dec: number): [number, number] => {
      const H = ((LST - ra) / 24) * Math.PI * 2;
      const rho = Math.tan(THREE.MathUtils.degToRad(90 - dec) / 2);
      return [cx - rho * Math.sin(H) * S, cy - rho * Math.cos(H) * S];
    };
    const P = STARS.map(([, ra, dec]) => proj(ra, dec));
    const line = (a: number, b: number, dash = false) => {
      x.setLineDash(dash ? [8, 10] : []);
      x.beginPath();
      x.moveTo(P[a][0], P[a][1]);
      x.lineTo(P[b][0], P[b][1]);
      x.stroke();
    };
    x.strokeStyle = 'rgba(255,214,140,0.55)';
    x.lineWidth = 2.5;
    [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]].forEach(([a, b]) => line(a, b));
    [[8, 9], [9, 10], [10, 11], [11, 12]].forEach(([a, b]) => line(a, b));
    // pointer stars: Merak → Dubhe → Polaris (about 5× their separation)
    x.strokeStyle = 'rgba(160,200,255,0.6)';
    line(0, 7, true);
    x.setLineDash([]);
    STARS.forEach(([, , , mag], i) => {
      const rad = Math.max(2, 7 - mag * 1.5);
      const glow = x.createRadialGradient(P[i][0], P[i][1], 0, P[i][0], P[i][1], rad * 4);
      glow.addColorStop(0, 'rgba(255,255,255,0.9)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = glow;
      x.beginPath();
      x.arc(P[i][0], P[i][1], rad * 4, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(P[i][0], P[i][1], rad, 0, Math.PI * 2);
      x.fill();
    });
    x.font = `700 26px ${FONT}`;
    x.fillStyle = '#ffd68c';
    x.textAlign = 'center';
    const mid = (a: number, b: number): [number, number] => [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
    const kv = mid(2, 5);
    x.fillText(sv ? 'Karlavagnen' : 'The Big Dipper', kv[0], kv[1] + 60);
    x.fillStyle = '#bcd4ff';
    x.fillText(sv ? 'Polstjärnan' : 'Polaris', P[7][0] + 6, P[7][1] - 22);
    const cas = mid(9, 11);
    x.fillStyle = '#ffd68c';
    x.fillText(sv ? 'Cassiopeja' : 'Cassiopeia', cas[0], cas[1] + 46);
    // Forest, cottage and lake silhouette
    x.fillStyle = '#05060f';
    x.beginPath();
    x.moveTo(0, h);
    x.lineTo(0, 600);
    for (let px = 0; px <= w; px += 18) {
      const tree = 560 + rr() * 30;
      x.lineTo(px, 610);
      x.lineTo(px + 9, tree);
    }
    x.lineTo(w, 610);
    x.lineTo(w, h);
    x.fill();
    x.fillStyle = '#7a1d1a';
    x.fillRect(150, 586, 70, 36);
    x.beginPath();
    x.moveTo(142, 588);
    x.lineTo(185, 560);
    x.lineTo(228, 588);
    x.fill();
    x.fillStyle = '#ffcf6b';
    x.fillRect(168, 598, 14, 12);
    x.fillStyle = 'rgba(40,60,130,0.6)';
    x.fillRect(0, 640, w, h - 640);
    x.textAlign = 'left';
    x.fillStyle = '#fff';
    x.font = `700 34px ${FONT}`;
    x.fillText(sv ? 'Stjärnhimlen över Sverige' : 'The night sky over Sweden', 28, 48);
    x.font = `500 20px ${FONT}`;
    x.fillStyle = '#cfd8ff';
    x.fillText(sv ? 'En höstkväll, mot norr' : 'An autumn evening, facing north', 28, 78);
    x.font = `500 19px ${FONT}`;
    x.fillText(sv ? 'Följ vagnens två bakre stjärnor ungefär' : 'Follow the two end stars of the Dipper', 28, 112);
    x.fillText(sv ? '5 gånger uppåt: där sitter Polstjärnan.' : 'about 5 times up: there is Polaris.', 28, 136);
  });
  poster.mesh.rotation.y = Math.PI / 2;
  poster.mesh.position.set(-W / 2 + 0.03, 2.25, -1.4);
  g.add(poster.mesh);
  const posterFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 2.8), MAT.darkWood);
  posterFrame.position.set(-W / 2 + 0.01, 2.25, -1.4);
  g.add(posterFrame);

  // --- Retro rocket ------------------------------------------------------------------------------
  const rocket = new THREE.Group();
  rocket.position.set(-8.1, 0, 7.1);
  g.add(rocket);
  ctx.addCollider(-8.1, 7.1, 1.4, 1.4);
  const prof: THREE.Vector2[] = [];
  const bodyPts: [number, number][] = [[0.0, 0.42], [0.24, 0.45], [0.33, 0.7], [0.36, 1.2], [0.36, 2.2], [0.34, 2.55], [0.29, 2.85]];
  for (const [rad, y] of bodyPts) prof.push(new THREE.Vector2(rad, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.35, metalness: 0.2 }));
  rocket.add(body);
  const nosePts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    nosePts.push(new THREE.Vector2(0.29 * Math.cos((s * Math.PI) / 2) ** 0.8, 2.85 + s * 0.75));
  }
  const red = new THREE.MeshStandardMaterial({ color: 0xd8463a, roughness: 0.4, metalness: 0.2 });
  const nose = new THREE.Mesh(new THREE.LatheGeometry(nosePts, 32), red);
  rocket.add(nose);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.42, -0.1);
  finShape.lineTo(0.42, 0.15);
  finShape.lineTo(0, 0.9);
  finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(finGeo, red);
    fin.position.y = 0.1;
    fin.rotation.y = (i / 3) * Math.PI * 2;
    fin.translateX(0.28);
    rocket.add(fin);
  }
  const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 24), MAT.brass);
  portRing.position.set(0, 2.0, 0.36);
  rocket.add(portRing);
  const portGlass = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), MAT.glow(0x8fd8ff, 1.3));
  portGlass.position.set(0, 2.0, 0.355);
  rocket.add(portGlass);
  rocket.rotation.y = -0.6; // porthole faces the room
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.5, 20, 1, true).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 0.3), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  flame.position.y = 0.28;
  rocket.add(flame);
  ctx.interaction.add(body, {
    label: L('Raket: Saturn V var 110 m hög', 'Rocket: Saturn V stood 110 m tall'),
    onClick: () => {
      ctx.sfx.noise(1.4, { freq: 200, to: 1200, gain: 0.18, type: 'lowpass' });
      ctx.sfx.tone(60, 1.2, { type: 'sawtooth', gain: 0.05, to: 40 });
      flameBoost = 1;
    },
  });
  let flameBoost = 0;

  // --- Astronaut ---------------------------------------------------------------------------
  const astro = new THREE.Mesh(astronautGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
  astro.scale.setScalar(1.7);
  astro.position.set(8.2, 0.18, 7.2);
  astro.rotation.y = -2.4; // face the room centre
  g.add(astro);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), new THREE.MeshStandardMaterial({ color: 0x8a8790, roughness: 0.95, flatShading: true }));
  rock.scale.set(1, 0.3, 1);
  rock.position.set(8.2, 0.02, 7.2);
  g.add(rock);
  ctx.addCollider(8.2, 7.2, 1.3, 1.3);
  const visorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSpot('rgba(255,210,120,0.5)', 'rgba(255,210,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  visorGlow.scale.setScalar(0.5);
  g.add(visorGlow);
  const visorPos = new THREE.Vector3(0, 0.85, 0.12).multiplyScalar(1.7).applyEuler(astro.rotation).add(astro.position);
  visorGlow.position.copy(visorPos);
  ctx.interaction.add(astro, {
    label: L('Rymddräkten väger ca 130 kg på Jorden', 'The spacesuit weighs about 130 kg on Earth'),
  });

  // --- Lights ------------------------------------------------------------------------------
  ctx.addLight({ position: [-5.5, 3.7, -2.5], color: 0x9a7cff, intensity: 26, distance: 13 });
  ctx.addLight({ position: [5.0, 3.7, 2.5], color: 0x8a9cff, intensity: 24, distance: 13 });

  // --- Animation ---------------------------------------------------------------------------
  const update = (dt: number, time: number) => {
    starMat.uniforms.uTime.value = time;
    satBody.rotation.y = time * 0.15;
    saturn.position.y = 4.55 + Math.sin(time * 0.6) * 0.03;
    flameBoost = Math.max(0, flameBoost - dt * 0.5);
    const f = 0.85 + 0.15 * Math.sin(time * 23) * Math.sin(time * 7.7);
    flame.scale.set(1 + flameBoost * 0.6, f * (1 + flameBoost * 2.5), 1 + flameBoost * 0.6);
    rocket.position.y = flameBoost > 0 ? Math.sin(time * 60) * 0.006 * flameBoost : 0;

    // shooting star
    if (shoot.t < 0) {
      shoot.next -= dt;
      if (shoot.next <= 0) {
        shoot.t = 0;
        shoot.x0 = (Math.random() - 0.5) * 12;
        shoot.z0 = (Math.random() - 0.5) * 10;
        const a = Math.random() * Math.PI * 2;
        shoot.dx = Math.cos(a);
        shoot.dz = Math.sin(a);
        streak.rotation.z = a;
        streak.visible = true;
      }
    } else {
      shoot.t += dt;
      const k = shoot.t / 0.9;
      streak.position.x = shoot.x0 + shoot.dx * k * 6;
      streak.position.z = shoot.z0 + shoot.dz * k * 6;
      (streak.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(1, k) * Math.PI);
      if (k >= 1) {
        shoot.t = -1;
        shoot.next = 6 + Math.random() * 9;
        streak.visible = false;
      }
    }
  };

  return { update };
}
