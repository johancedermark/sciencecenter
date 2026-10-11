/**
 * Station 5: light trapped in a water jet (or a bent glass rod) by total internal reflection.
 * A 2D ray is marched along the curved light guide (centre line + radius a). At each wall hit the
 * incidence angle is compared with the critical angle θc = asin(1/n). Below θc part of the light
 * escapes (Fresnel transmission, unpolarised average) and the rest reflects.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Meter, Readout } from '../../core/controlPanel';
import { BeamBatch, DEG, cooldown, fmt, glowSprite, mats, merged, plaque, rbox, table } from './common';

const G = 9.81;
const A = 0.011; // guide radius (m)
const NOZ = { x: 0.32, y: 1.32 }; // nozzle / rod start (station-local x,y; the guide lies in z = 0)
const FLOOR_Y = 0.9; // basin water surface / end of the guide
const N_PTS = 90;

type Mode = 'water' | 'glass';

/** Unpolarised Fresnel reflectance from inside (n) to air. */
function fresnelR(n: number, cosi: number) {
  const sint = n * Math.sqrt(Math.max(0, 1 - cosi * cosi));
  if (sint >= 1) return 1;
  const cost = Math.sqrt(1 - sint * sint);
  const rs = (n * cosi - cost) / (n * cosi + cost);
  const rp = (n * cost - cosi) / (n * cost + cosi);
  return 0.5 * (rs * rs + rp * rp);
}

export function buildFibre(ctx: RoomContext) {
  const ROOM_X = 7;
  const ROOM_Z = 2.6;
  const g = new THREE.Group();
  g.position.set(ROOM_X, 0, ROOM_Z);
  ctx.group.add(g);

  const st = { mode: 'water' as Mode, launch: 15 * DEG, speed: 1.9, bend: 0.22, dirty: true, geoDirty: true };

  const tbl = table(2.1, 0.75);
  g.add(tbl);
  ctx.addCollider(ROOM_X, ROOM_Z, 2.2, 0.85);
  const pl = plaque(L('Ljus i en vattenstråle', 'Light in a waterfall'), 0.85, 0.14);
  pl.position.set(0, 0.74, 0.376);
  g.add(pl);

  // water tank (glass) with water
  const TANK = { x0: NOZ.x, x1: NOZ.x + 0.5, y0: 0.87, y1: 1.62 };
  const tankGlass = new THREE.Mesh(rbox(TANK.x1 - TANK.x0, TANK.y1 - TANK.y0, 0.32, 0.015), mats.glass);
  tankGlass.position.set((TANK.x0 + TANK.x1) / 2, (TANK.y0 + TANK.y1) / 2, 0);
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x5fb6ff, transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false, emissive: 0x0a3a60, emissiveIntensity: 0.4 });
  const tankWater = new THREE.Mesh(new THREE.BoxGeometry(TANK.x1 - TANK.x0 - 0.02, 0.6, 0.3), waterMat);
  tankWater.position.set((TANK.x0 + TANK.x1) / 2, TANK.y0 + 0.31, 0);
  const tankRim = merged(
    [
      { geo: new THREE.BoxGeometry(TANK.x1 - TANK.x0 + 0.03, 0.02, 0.34), pos: [(TANK.x0 + TANK.x1) / 2, TANK.y0 - 0.01, 0] },
      { geo: new THREE.BoxGeometry(TANK.x1 - TANK.x0 + 0.03, 0.02, 0.34), pos: [(TANK.x0 + TANK.x1) / 2, TANK.y1, 0] },
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.05, 16), pos: [NOZ.x - 0.015, NOZ.y, 0], rot: [0, 0, Math.PI / 2] },
    ],
    mats.brass,
  );
  g.add(tankGlass, tankWater, tankRim);

  // submerged laser on a pivot arm (inside the tank), aimed at the nozzle
  const laser = new THREE.Group();
  const laserBody = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 16).rotateZ(Math.PI / 2), mats.blackMetal);
  laserBody.position.x = 0.07;
  const laserTip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 12).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff70).multiplyScalar(2), toneMapped: false }));
  laser.add(laserBody, laserTip);
  const laserGlow = glowSprite(0x40ff70, 0.08, 0.9);
  laser.add(laserGlow);
  g.add(laser);
  const LASER_D = 0.24; // distance from nozzle

  // basin
  const basin = merged(
    [
      { geo: new THREE.CylinderGeometry(0.3, 0.26, 0.06, 32, 1, true), pos: [0, 0.03, 0] },
      { geo: new THREE.CylinderGeometry(0.26, 0.26, 0.005, 32), pos: [0, 0.003, 0] },
    ],
    mats.brass,
  );
  basin.position.set(-0.45, 0.85, 0);
  g.add(basin);
  basin.material = new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide });
  const basinWaterMat = new THREE.MeshStandardMaterial({ color: 0x2a6f9a, roughness: 0.15, emissive: 0x40ff70, emissiveIntensity: 0 });
  const basinWater = new THREE.Mesh(new THREE.CircleGeometry(0.285, 32).rotateX(-Math.PI / 2), basinWaterMat);
  basinWater.position.set(-0.45, 0.895, 0);
  g.add(basinWater);
  const endGlow = glowSprite(0x40ff70, 0.3, 0);
  g.add(endGlow);

  // the light guide: jet or rod (rebuilt only when its shape changes)
  const glowC = document.createElement('canvas');
  glowC.width = 256;
  glowC.height = 1;
  const glowCtx = glowC.getContext('2d')!;
  const glowImg = glowCtx.createImageData(256, 1);
  const glowTex = new THREE.CanvasTexture(glowC);
  const jetMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8dcff, transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false,
    emissive: 0x40ff70, emissiveMap: glowTex, emissiveIntensity: 1.6,
  });
  const rodMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf6ff, transparent: true, opacity: 0.5, roughness: 0.02, clearcoat: 1, depthWrite: false,
    emissive: 0x40ff70, emissiveMap: glowTex, emissiveIntensity: 1.6,
  });
  const guide = new THREE.Mesh(new THREE.BufferGeometry(), jetMat);
  g.add(guide);
  const rodClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1), mats.brass);
  g.add(rodClamp);

  const px = new Float64Array(N_PTS);
  const py = new Float64Array(N_PTS);
  const cum = new Float64Array(N_PTS);

  function buildCentreLine() {
    if (st.mode === 'water') {
      // projectile: x = x0 − v·t, y = y0 − g t²/2, until it reaches the basin surface
      const tEnd = Math.sqrt((2 * (NOZ.y - FLOOR_Y)) / G);
      for (let i = 0; i < N_PTS; i++) {
        const tt = (i / (N_PTS - 1)) * tEnd;
        px[i] = NOZ.x - st.speed * tt;
        py[i] = NOZ.y - 0.5 * G * tt * tt;
      }
    } else {
      // glass rod: 8 cm straight, a circular bend of radius R through 90°, then straight down
      const R = st.bend;
      const L1 = 0.08;
      const arc = (Math.PI / 2) * R;
      const L3 = Math.max(0.02, NOZ.y - R - FLOOR_Y);
      const total = L1 + arc + L3;
      for (let i = 0; i < N_PTS; i++) {
        const s = (i / (N_PTS - 1)) * total;
        if (s <= L1) {
          px[i] = NOZ.x - s;
          py[i] = NOZ.y;
        } else if (s <= L1 + arc) {
          const a = (s - L1) / R;
          px[i] = NOZ.x - L1 - R * Math.sin(a);
          py[i] = NOZ.y - R * (1 - Math.cos(a));
        } else {
          px[i] = NOZ.x - L1 - R;
          py[i] = NOZ.y - R - (s - L1 - arc);
        }
      }
    }
    cum[0] = 0;
    for (let i = 1; i < N_PTS; i++) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    const pts = Array.from({ length: N_PTS }, (_, i) => new THREE.Vector3(px[i], py[i], 0));
    guide.geometry.dispose();
    guide.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, A, 12, false);
    guide.material = st.mode === 'water' ? jetMat : rodMat;
    tankGlass.visible = tankWater.visible = st.mode === 'water';
    rodClamp.visible = st.mode === 'glass';
    rodClamp.position.set(NOZ.x - 0.04, (NOZ.y + 0.86) / 2, 0);
    rodClamp.scale.y = NOZ.y - 0.86;
    basin.position.x = px[N_PTS - 1];
    basinWater.position.x = px[N_PTS - 1];
  }

  /** Nearest point on the centre line near segment hint k; returns distance and updates near*. */
  let nearX = 0;
  let nearY = 0;
  let nearS = 0;
  function nearest(x: number, y: number, k: number) {
    let best = Infinity;
    let bk = k;
    for (let j = Math.max(0, k - 3); j <= Math.min(N_PTS - 2, k + 3); j++) {
      const ax = px[j];
      const ay = py[j];
      const ex = px[j + 1] - ax;
      const ey = py[j + 1] - ay;
      const l2 = ex * ex + ey * ey;
      const u = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2));
      const qx = ax + ex * u;
      const qy = ay + ey * u;
      const d = Math.hypot(x - qx, y - qy);
      if (d < best) {
        best = d;
        bk = j;
        nearX = qx;
        nearY = qy;
        nearS = cum[j] + u * Math.sqrt(l2);
      }
    }
    return { d: best, k: bk };
  }

  const beams = new BeamBatch(260);
  g.add(beams.mesh);
  const profile = new Float32Array(256);
  const out = { n: 1.333, crit: 0, internal: 0, firstInc: NaN, delivered: 0, bounces: 0, leaks: 0 };

  function traceLight() {
    const n = st.mode === 'water' ? 1.333 : 1.5;
    out.n = n;
    out.crit = Math.asin(1 / n);
    // internal launch angle relative to the guide axis (which starts along −x)
    let alpha = st.launch;
    if (st.mode === 'glass') alpha = Math.asin(Math.sin(st.launch) / n); // refraction at the flat end face
    out.internal = alpha;
    let dx = -Math.cos(alpha);
    let dy = -Math.sin(alpha);
    let x = NOZ.x;
    let y = NOZ.y;
    let I = 1;
    let k = 0;
    let lx = x;
    let ly = y;
    out.firstInc = NaN;
    out.bounces = 0;
    out.leaks = 0;
    profile.fill(0);
    const total = cum[N_PTS - 1];
    beams.begin();
    const col = (i: number) => [0.25 * i * 1.6, 1.0 * i * 1.6, 0.4 * i * 1.6] as const;
    // laser → nozzle (inside the tank, or in air for the rod)
    {
      const [r, gg, b] = col(1);
      beams.seg(NOZ.x + Math.cos(st.launch) * LASER_D, NOZ.y + Math.sin(st.launch) * LASER_D, 0, NOZ.x, NOZ.y, 0, 0.007, r, gg, b);
    }
    const h = 0.0015;
    let delivered = 0;
    for (let step = 0; step < 4000 && I > 0.01; step++) {
      const nx2 = x + dx * h;
      const ny2 = y + dy * h;
      const r = nearest(nx2, ny2, k);
      k = r.k;
      const sIdx = Math.min(255, Math.floor((nearS / total) * 255));
      profile[sIdx] = Math.max(profile[sIdx], I);
      // reached the end of the guide?
      if (k >= N_PTS - 2 && nearS >= total - 1e-4) {
        const [cr, cg, cb] = col(I);
        beams.seg(lx, ly, 0, nx2, ny2, 0, 0.005, cr, cg, cb);
        // light leaves the end face and lights up the basin
        beams.seg(nx2, ny2, 0, nx2 + dx * 0.05, ny2 + dy * 0.05, 0, 0.012, cr * 0.6, cg * 0.6, cb * 0.6);
        delivered = I;
        break;
      }
      if (r.d <= A) {
        x = nx2;
        y = ny2;
        continue;
      }
      // bisect for the wall crossing between (x,y) and (nx2,ny2)
      let lo = 0;
      let hi = 1;
      for (let it = 0; it < 12; it++) {
        const m = (lo + hi) / 2;
        if (nearest(x + dx * h * m, y + dy * h * m, k).d > A) hi = m;
        else lo = m;
      }
      const bx = x + dx * h * lo;
      const by = y + dy * h * lo;
      nearest(bx, by, k);
      let nx = bx - nearX;
      let ny = by - nearY;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const cosi = Math.max(1e-4, dx * nx + dy * ny); // > 0: the ray is leaving the guide
      const inc = Math.acos(Math.min(1, Math.abs(cosi)));
      if (Number.isNaN(out.firstInc)) out.firstInc = inc;
      {
        const [cr, cg, cb] = col(I);
        beams.seg(lx, ly, 0, bx, by, 0, 0.005, cr, cg, cb);
      }
      const R = fresnelR(n, cosi);
      if (R < 1) {
        // partial escape: refracted ray in air (vector Snell, the normal facing the ray is −N)
        const eta = n;
        const k2 = 1 - eta * eta * (1 - cosi * cosi);
        const a = eta * cosi - Math.sqrt(Math.max(0, k2));
        const tx = eta * dx - a * nx;
        const ty = eta * dy - a * ny;
        const tl = Math.hypot(tx, ty) || 1;
        const Iout = I * (1 - R);
        if (Iout > 0.02 && out.leaks < 60) {
          const [cr, cg, cb] = col(Iout);
          beams.seg(bx, by, 0, bx + (tx / tl) * 0.35, by + (ty / tl) * 0.35, 0, 0.006, cr, cg, cb);
          out.leaks++;
        }
        I *= R;
      }
      // reflect
      dx -= 2 * cosi * nx;
      dy -= 2 * cosi * ny;
      x = bx - nx * 1e-5;
      y = by - ny * 1e-5;
      lx = x;
      ly = y;
      out.bounces++;
    }
    beams.end();
    out.delivered = delivered;

    // glow along the guide: light scattered by tiny bubbles/impurities, proportional to local intensity
    let run = 0;
    for (let i = 0; i < 256; i++) {
      run = Math.max(profile[i], run * 0.97);
      const v = Math.round(255 * Math.min(1, run * 0.9));
      glowImg.data[i * 4] = glowImg.data[i * 4 + 1] = glowImg.data[i * 4 + 2] = v;
      glowImg.data[i * 4 + 3] = 255;
    }
    glowCtx.putImageData(glowImg, 0, 0);
    glowTex.needsUpdate = true;
    basinWaterMat.emissiveIntensity = delivered * 1.4;
    endGlow.position.set(px[N_PTS - 1], py[N_PTS - 1], 0);
    endGlow.material.opacity = delivered * 0.9;
    // laser orientation: on the far side of the nozzle, pointing at it
    laser.position.set(NOZ.x + Math.cos(st.launch) * LASER_D, NOZ.y + Math.sin(st.launch) * LASER_D, 0);
    laser.rotation.z = st.launch;
    drawHud();
  }

  // ---------------------------------------------------------------- HUD
  let ui: {
    launch: HTMLInputElement; crit: Readout; internal: Readout; inc: Readout; delivered: Meter; bounces: Readout; note: HTMLElement;
  } | null = null;
  function drawHud() {
    if (!ui) return;
    ui.crit.set(`${fmt(out.crit / DEG, 1)}°  (n = ${fmt(out.n, st.mode === 'water' ? 3 : 2)})`);
    ui.internal.set(`${fmt(out.internal / DEG, 1)}°`);
    ui.inc.set(Number.isNaN(out.firstInc) ? '–' : `${fmt(out.firstInc / DEG, 1)}°`);
    ui.delivered.set(out.delivered, `${Math.round(out.delivered * 100)} %`);
    ui.bounces.set(String(out.bounces));
    let note = L('Ljuset studsar fram längs strålen: varje träff är en totalreflektion.', 'The light zigzags along the jet: every hit is a total internal reflection.');
    if (!Number.isNaN(out.firstInc) && out.firstInc < out.crit) note = L('Infallsvinkeln mot ytan är mindre än gränsvinkeln, så det mesta ljuset läcker ut.', 'The angle of incidence at the surface is smaller than the critical angle, so most of the light leaks out.');
    else if (out.delivered < 0.5) note = L('I den snäva kurvan blir infallsvinkeln för liten och ljuset läcker ut. Gör kurvan mjukare!', 'In the tight bend the angle of incidence gets too small and the light leaks out. Make the bend gentler!');
    ui.note.textContent = t(note);
  }

  // ---------------------------------------------------------------- milestones
  const say = cooldown(9);
  let saidGuided = false;
  let saidLeak = false;
  let touched = false;
  function milestones() {
    if (!touched) return;
    if (out.delivered > 0.9 && out.bounces > 2 && !saidGuided && say()) {
      saidGuided = true;
      ctx.sfx.chime();
      ctx.buddy.celebrate(L('Ljuset följer med vattnet runt kurvan! Så fungerar en optisk fiber.', 'The light follows the water round the curve! That’s how an optical fibre works.'));
    } else if (out.delivered < 0.3 && !saidLeak && say()) {
      saidLeak = true;
      ctx.sfx.noise(0.35, { freq: 3000, to: 800, gain: 0.07 });
      ctx.buddy.say(L('Nu läcker ljuset ut! Det träffar ytan för rakt, under gränsvinkeln.', 'Now the light leaks out! It hits the surface too squarely, below the critical angle.'), { expression: 'surprised' });
    }
  }

  // ---------------------------------------------------------------- interaction
  function setLaunch(deg: number, fromSlider = false) {
    st.launch = THREE.MathUtils.clamp(deg, -60, 70) * DEG;
    touched = true;
    st.dirty = true;
    if (ui && !fromSlider) ui.launch.value = String(Math.round(deg));
  }
  const _plane = new THREE.Plane();
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3();
  ctx.interaction.add(laser, {
    label: L('Dra för att rikta lasern', 'Drag to aim the laser'),
    onDrag: (info) => {
      g.updateMatrixWorld(true);
      _n.set(0, 0, 1).transformDirection(g.matrixWorld);
      g.localToWorld(_p.set(NOZ.x, NOZ.y, 0));
      _plane.setFromNormalAndCoplanarPoint(_n, _p);
      const hit = info.onPlane(_plane);
      if (!hit) return;
      g.worldToLocal(hit);
      setLaunch(Math.atan2(hit.y - NOZ.y, hit.x - NOZ.x) / DEG);
    },
  });

  // gentle water sound while focused
  let water: { stop(): void } | null = null;
  function startWater() {
    if (water) return;
    const c = ctx.sfx.ctx;
    const src = c.createBufferSource();
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 0.6;
    const gn = c.createGain();
    gn.gain.value = 0;
    gn.gain.setTargetAtTime(0.035, c.currentTime, 0.3);
    src.connect(f).connect(gn).connect(ctx.sfx.out);
    src.start();
    water = {
      stop: () => {
        gn.gain.setTargetAtTime(0, c.currentTime, 0.2);
        src.stop(c.currentTime + 1.2);
      },
    };
  }

  ctx.addStation({
    id: 'light-fibre',
    title: L('Ljus i en vattenstråle', 'Light in a waterfall'),
    position: [ROOM_X - 0.1, ROOM_Z + 0.45],
    viewpoint: { position: [ROOM_X - 0.35, 1.55, ROOM_Z + 2.3], target: [ROOM_X + 0.25, 1.1, ROOM_Z - 0.1] },
    intro: L('Kan ljus åka vattenrutschkana? Lys med en laser in i en vattenstråle och se vad som händer!', 'Can light ride a water slide? Shine a laser into a jet of water and see what happens!'),
    howTo: L('Dra i lasern eller använd reglaget för att ändra vinkeln. Ändra vattnets fart, eller byt till en böjd glasstav och ändra böjen.', 'Drag the laser or use the slider to change its angle. Change the water speed, or switch to a bent glass rod and change the bend.'),
    science: L(
      'När ljus i vatten når ytan mot luft böjs det bort från normalen. Om infallsvinkeln är större än gränsvinkeln θc, där sin θc = 1/n, kan ljuset inte komma ut alls och speglas till 100 %: totalreflektion. För vatten (n = 1,333) är θc = 48,6° och för glas (n = 1,5) 41,8°. Ljuset studsar därför fram inne i strålen och följer den runt kurvan. Riktar du lasern för brant, eller gör kurvan för skarp, blir infallsvinkeln mindre än θc och ljuset läcker ut. Det är inte vattnet som "drar" ljuset: ljuset går rakt mellan studsarna.',
      'When light in water reaches the surface with air it bends away from the normal. If the angle of incidence is larger than the critical angle θc, where sin θc = 1/n, the light cannot get out at all and is reflected 100%: total internal reflection. For water (n = 1.333) θc = 48.6°, and for glass (n = 1.5) 41.8°. So the light bounces along inside the jet and follows it round the curve. Aim the laser too steeply, or make the bend too tight, and the angle of incidence drops below θc and the light leaks out. The water does not "pull" the light: it travels in straight lines between bounces.',
    ),
    wow: L('Internet färdas genom glasfibrer som är tunnare än ett hårstrå. Kablar på havsbotten bär nästan all trafik mellan kontinenterna, som ljuspulser som studsar på just det här sättet.', 'The internet travels through glass fibres thinner than a hair. Cables on the sea floor carry almost all traffic between continents, as light pulses bouncing in exactly this way.'),
    onFocus: () => startWater(),
    onBlur: () => {
      water?.stop();
      water = null;
    },
    controls: (panel: ControlPanel) => {
      panel.heading(L('Ljusledare', 'Light guide'));
      panel.buttons(
        [
          { label: L('Vattenstråle', 'Water jet'), onClick: () => { st.mode = 'water'; st.geoDirty = true; touched = true; } },
          { label: L('Böjd glasstav', 'Bent glass rod'), onClick: () => { st.mode = 'glass'; st.geoDirty = true; touched = true; } },
        ],
        st.mode === 'water' ? 0 : 1,
      );
      const launch = panel.slider(L('Laserns vinkel mot strålen', 'Laser angle to the jet'), { min: -60, max: 70, step: 1, value: Math.round(st.launch / DEG), format: (v) => `${v}°` }, (v) => setLaunch(v, true));
      panel.slider(L('Vattnets fart (vattenstråle)', 'Water speed (water jet)'), { min: 1.1, max: 2.6, step: 0.05, value: st.speed, format: (v) => `${fmt(v, 2)} m/s` }, (v) => {
        st.speed = v;
        if (st.mode === 'water') st.geoDirty = true;
        touched = true;
      });
      panel.slider(L('Böjens radie (glasstav)', 'Bend radius (glass rod)'), { min: 0.02, max: 0.4, step: 0.01, value: st.bend, format: (v) => `${fmt(v * 100, 0)} cm` }, (v) => {
        st.bend = v;
        if (st.mode === 'glass') st.geoDirty = true;
        touched = true;
      });
      const crit = panel.readout(L('Gränsvinkel θc', 'Critical angle θc'));
      const internal = panel.readout(L('Strålens vinkel mot axeln inuti', 'Ray angle to the axis inside'));
      const inc = panel.readout(L('Första infallsvinkeln mot ytan', 'First angle of incidence at the surface'));
      const bounces = panel.readout(L('Antal studsar', 'Number of bounces'));
      const delivered = panel.meter(L('Ljus som når fram', 'Light that gets through'), '#5dff8f');
      const note = panel.note(L('', ''));
      ui = { launch, crit, internal, inc, delivered, bounces, note };
      st.dirty = true;
      return () => {
        ui = null;
      };
    },
  });

  // falling droplets in the basin (idle life)
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.03, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  g.add(ripple);

  return {
    update(_dt: number, time: number) {
      if (st.geoDirty) {
        st.geoDirty = false;
        buildCentreLine();
        st.dirty = true;
      }
      if (st.dirty) {
        st.dirty = false;
        traceLight();
        milestones();
      }
      // water: moving shimmer and a ripple where the jet lands
      const water = st.mode === 'water';
      ripple.visible = water;
      if (water) {
        jetMat.emissiveIntensity = 1.5 + Math.sin(time * 23) * 0.12;
        const ph = (time * 1.6) % 1;
        ripple.position.set(px[N_PTS - 1], 0.897, 0);
        ripple.scale.setScalar(1 + ph * 5);
        (ripple.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - ph);
      }
    },
  };
}
