/**
 * Station 4: the gravity well. A stretched-sheet funnel shaped h(r) = −k·(1/r − 1/R). For a ball rolling
 * on gentle slopes the sideways pull is (5/7)·g·dh/dr = (5/7)·g·k / r², i.e. exactly inverse-square,
 * so we simulate a 2D inverse-square force, GM_eff = (5/7)·g·k, plus rolling friction that makes marbles
 * spiral in. (The 5/7 is because part of the energy goes into the ball's spin.)
 */
import * as THREE from 'three';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import type { RoomContext } from '../../core/types';
import { radialSpot } from '../../core/textures';
import { G_EARTH, L, MAT, fmt, type RoomBuddy } from './shared';

export const WELL_POS: [number, number] = [-6.6, 2.4];
const R = 1.1; // rim radius, m
const R0 = 0.075; // hole radius
const RIM_Y = 0.95;
const K = 0.043; // funnel constant, m²
const GM = (5 / 7) * G_EARTH * K; // ≈ 0.30 m³/s²
const BALL = 0.024;
const MAX = 6;
const TRAIL = 180;
const COLORS = [0xff5e7a, 0x5ee6d6, 0xffd23f, 0x7dff8a, 0xff9f43, 0x6fa8ff];

const heightAt = (r: number) => RIM_Y - K * (1 / Math.max(r, R0) - 1 / R);

export function buildGravityWell(ctx: RoomContext, buddy: RoomBuddy) {
  const root = new THREE.Group();
  root.position.set(WELL_POS[0], 0, WELL_POS[1]);
  ctx.group.add(root);
  ctx.addCollider(WELL_POS[0], WELL_POS[1], R * 2 + 0.2, R * 2 + 0.2);

  // --- Funnel sheet ------------------------------------------------------------------------
  const NR = 48;
  const NA = 96;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NR; i++) {
    const s = i / NR;
    const r = R0 + (R - R0) * s * s; // denser rings near the steep centre
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      pos.push(Math.cos(a) * r, heightAt(r), -Math.sin(a) * r);
      uv.push((j / NA) * 24, r * 10);
    }
  }
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j;
      const b = a + NA + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const funnelGeo = new THREE.BufferGeometry();
  funnelGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  funnelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  funnelGeo.setIndex(idx);
  funnelGeo.computeVertexNormals();
  const gridTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 128, 5);
    g.fillRect(0, 0, 5, 128);
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  })();
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0x3b2a8f, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide,
    emissive: new THREE.Color(0x9d84ff), emissiveMap: gridTex, emissiveIntensity: 0.9,
  });
  const sheet = new THREE.Mesh(funnelGeo, sheetMat);
  root.add(sheet);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 12, 96), MAT.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = RIM_Y;
  root.add(rim);
  const legGeo = new THREE.CylinderGeometry(0.03, 0.035, RIM_Y, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(legGeo, MAT.darkWood);
    leg.position.set(Math.cos(a) * (R - 0.02), RIM_Y / 2, Math.sin(a) * (R - 0.02));
    root.add(leg);
  }
  // The "star" at the bottom
  const star = new THREE.Mesh(new THREE.SphereGeometry(R0 * 0.9, 20, 14), MAT.glow(0xffc46b, 2.2));
  star.position.y = heightAt(R0) - 0.02;
  root.add(star);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSpot('rgba(255,200,120,0.9)', 'rgba(255,140,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  starGlow.scale.setScalar(0.5);
  starGlow.position.copy(star.position);
  root.add(starGlow);

  // --- Marbles and trails ----------------------------------------------------------------------
  interface Marble {
    mesh: THREE.Mesh; line: THREE.Line; trail: Float32Array; n: number;
    x: number; z: number; vx: number; vz: number; active: boolean; angle: number; prevA: number; laps: number;
    trailTimer: number; falling: number;
  }
  const ballGeo = new THREE.SphereGeometry(BALL, 20, 14);
  const marbles: Marble[] = COLORS.map((c) => {
    const mesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, emissive: c, emissiveIntensity: 0.35 }));
    mesh.visible = false;
    root.add(mesh);
    const trail = new Float32Array(TRAIL * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(trail, 3));
    g.setDrawRange(0, 0);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.75 }));
    line.frustumCulled = false;
    root.add(line);
    return { mesh, line, trail, n: 0, x: 0, z: 0, vx: 0, vz: 0, active: false, angle: 0, prevA: 0, laps: 0, trailTimer: 0, falling: -1 };
  });
  let nextMarble = 0;

  const st = { friction: true, trails: true, last: -1, captured: 0, bestLaps: 0 };

  function launch(x: number, z: number, vx: number, vz: number) {
    const m = marbles[nextMarble];
    nextMarble = (nextMarble + 1) % MAX;
    const r = Math.hypot(x, z);
    const rr = THREE.MathUtils.clamp(r, 0.2, R - BALL - 0.02);
    m.x = (x / (r || 1)) * rr;
    m.z = (z / (r || 1)) * rr;
    if (r === 0) m.x = rr;
    m.vx = vx;
    m.vz = vz;
    m.active = true;
    m.falling = -1;
    m.laps = 0;
    m.angle = 0;
    m.prevA = Math.atan2(m.z, m.x);
    m.n = 0;
    m.mesh.visible = true;
    m.mesh.scale.setScalar(1);
    (m.line.geometry as THREE.BufferGeometry).setDrawRange(0, 0);
    st.last = marbles.indexOf(m);
    ctx.sfx.tone(700, 0.08, { type: 'triangle', gain: 0.08, to: 900 });
  }

  const vCirc = (r: number) => Math.sqrt(GM / r);
  const preset = (kind: 'orbit' | 'straight' | 'ellipse' | 'escape') => {
    const r = 0.85;
    // start on the visitor's side of the funnel (+x), moving to the visitor's right (−z)
    const v = vCirc(r);
    if (kind === 'orbit') launch(r, 0, 0, -v);
    else if (kind === 'ellipse') launch(r, 0, 0, -v * 0.7);
    else if (kind === 'escape') launch(r, 0, 0, -v * 1.55);
    else launch(r, 0, -0.45, 0);
  };

  // --- Flicking by dragging on the sheet -------------------------------------------------------
  const arrow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 1, 6).rotateZ(-Math.PI / 2).translate(0.5, 0, 0),
    MAT.glow(0xffffff, 1.4),
  );
  arrow.visible = false;
  root.add(arrow);
  const ghost = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ghost.visible = false;
  root.add(ghost);
  const tmp = new THREE.Vector3();
  let plane = new THREE.Plane();
  const drag = { x: 0, z: 0, vx: 0, vz: 0 };
  const FLICK = 2.2; // (m/s) per metre of drag
  const local = (w: THREE.Vector3) => root.worldToLocal(tmp.copy(w));
  ctx.interaction.add(sheet, {
    label: L('Dra för att knuffa iväg en kula', 'Drag to flick a marble'),
    cursor: 'crosshair',
    onDragStart: (info) => {
      root.updateWorldMatrix(true, false);
      tmp.set(0, RIM_Y, 0).applyMatrix4(root.matrixWorld);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), tmp);
      const hit = info.hit?.point;
      if (!hit) return;
      const p = local(hit);
      let r = Math.hypot(p.x, p.z);
      const rr = THREE.MathUtils.clamp(r, 0.2, R - 0.05);
      r = r || 1;
      drag.x = (p.x / r) * rr;
      drag.z = (p.z / r) * rr;
      drag.vx = drag.vz = 0;
      ghost.visible = true;
      ghost.position.set(drag.x, heightAt(rr) + BALL, drag.z);
    },
    onDrag: (info) => {
      const q = info.onPlane(plane);
      if (!q) return;
      const p = local(q);
      let dx = p.x - drag.x;
      let dz = p.z - drag.z;
      const len = Math.hypot(dx, dz);
      const maxLen = 1.0;
      if (len > maxLen) {
        dx *= maxLen / len;
        dz *= maxLen / len;
      }
      drag.vx = dx * FLICK;
      drag.vz = dz * FLICK;
      const l = Math.hypot(dx, dz);
      arrow.visible = l > 0.01;
      arrow.position.copy(ghost.position);
      arrow.scale.set(l, 1, 1);
      arrow.rotation.y = Math.atan2(-dz, dx);
    },
    onDragEnd: () => {
      if (!ghost.visible) return;
      ghost.visible = false;
      arrow.visible = false;
      launch(drag.x, drag.z, drag.vx, drag.vz);
    },
  });

  // --- HUD ---------------------------------------------------------------------------------
  let ui: { speed: Readout; dist: Readout; laps: Readout; caught: Readout } | null = null;
  const controls = (panel: ControlPanel) => {
    panel.heading(L('Prova en knuff', 'Try a push'));
    panel.buttons([
      { label: L('Rakt in', 'Straight in'), icon: '⬇️', onClick: () => preset('straight') },
      { label: L('Åt sidan: bana', 'Sideways: orbit'), icon: '🔄', onClick: () => preset('orbit') },
    ]);
    panel.buttons([
      { label: L('Lite för långsam', 'A bit too slow'), icon: '🥚', onClick: () => preset('ellipse') },
      { label: L('För snabb', 'Too fast'), icon: '🚀', onClick: () => preset('escape') },
    ]);
    panel.toggle(L('Friktion (duken bromsar)', 'Friction (the sheet brakes)'), st.friction, (v) => {
      st.friction = v;
      if (!v) buddy.say(L('Utan friktion fortsätter kulan runt och runt. Så är det i rymden, där finns inget som bromsar planeterna.', 'Without friction the marble keeps going round and round. That is how it is in space: nothing brakes the planets.'));
    });
    panel.toggle(L('Visa spår', 'Show trails'), st.trails, (v) => {
      st.trails = v;
    });
    panel.button(L('Töm tratten', 'Clear the funnel'), () => {
      for (const m of marbles) {
        m.active = false;
        m.mesh.visible = false;
        (m.line.geometry as THREE.BufferGeometry).setDrawRange(0, 0);
      }
      st.last = -1;
    }, { icon: '🧹' });
    const speed = panel.readout(L('Fart (senaste kulan)', 'Speed (last marble)'));
    const dist = panel.readout(L('Avstånd till mitten', 'Distance to the centre'));
    const laps = panel.readout(L('Varv', 'Laps'));
    const caught = panel.readout(L('Kulor som fallit in', 'Marbles swallowed'));
    panel.note(L(
      'Tratten är en 2D-bild av hur massa kröker rumtiden. Den riktiga gravitationen drar inte "nedåt" i en duk, och kulorna rullar bara för att Jordens tyngdkraft drar dem.',
      'The funnel is a 2D picture of mass curving spacetime. Real gravity does not pull "down" into a sheet, and these marbles only roll because Earth\'s gravity pulls them.',
    ));
    ui = { speed, dist, laps, caught };
    return () => {
      ui = null;
    };
  };

  // --- Physics -----------------------------------------------------------------------------
  const H = 1 / 600;
  let uiTimer = 0;
  let lastCheer = 0;
  const step = (m: Marble, h: number) => {
    // semi-implicit (symplectic) Euler: energy stays bounded without friction
    const r2 = m.x * m.x + m.z * m.z;
    const r = Math.sqrt(r2);
    const a = -GM / (r2 * r);
    let ax = a * m.x;
    let az = a * m.z;
    if (st.friction) {
      const v = Math.hypot(m.vx, m.vz);
      if (v > 1e-4) {
        const f = 0.02 + 0.02 * v; // rolling resistance + air drag, m/s²
        ax -= (f * m.vx) / v;
        az -= (f * m.vz) / v;
      }
    }
    m.vx += ax * h;
    m.vz += az * h;
    m.x += m.vx * h;
    m.z += m.vz * h;
    const rn = Math.hypot(m.x, m.z);
    if (rn > R - BALL) {
      // bounce off the brass rim, losing half the radial speed
      const nx = m.x / rn;
      const nz = m.z / rn;
      const vr = m.vx * nx + m.vz * nz;
      if (vr > 0) {
        m.vx -= 1.5 * vr * nx;
        m.vz -= 1.5 * vr * nz;
        ctx.sfx.tone(1800, 0.05, { type: 'sine', gain: 0.05 });
      }
      m.x = nx * (R - BALL);
      m.z = nz * (R - BALL);
    }
    if (rn < R0 + BALL * 0.5) {
      m.falling = 0;
      st.captured++;
      ctx.sfx.tone(600, 0.5, { type: 'sine', gain: 0.12, to: 120 });
    }
  };

  const update = (dt: number, time: number, near: boolean) => {
    starGlow.scale.setScalar(0.45 + 0.05 * Math.sin(time * 2.3));
    if (!near) return;
    const n = Math.ceil(dt / H);
    const h = dt / n;
    for (const m of marbles) {
      if (!m.active) continue;
      if (m.falling >= 0) {
        m.falling += dt;
        m.mesh.scale.setScalar(Math.max(0.01, 1 - m.falling * 3));
        m.mesh.position.y -= dt * 0.4;
        if (m.falling > 0.35) {
          m.active = false;
          m.mesh.visible = false;
        }
        continue;
      }
      for (let i = 0; i < n && m.falling < 0; i++) step(m, h);
      const r = Math.hypot(m.x, m.z);
      m.mesh.position.set(m.x, heightAt(r) + BALL, m.z);
      // lap counting (unwrapped angle)
      const a = Math.atan2(m.z, m.x);
      let d = a - m.prevA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      m.prevA = a;
      m.angle += d;
      const laps = Math.floor(Math.abs(m.angle) / (Math.PI * 2));
      if (laps > m.laps) {
        m.laps = laps;
        ctx.sfx.tone(880 + laps * 40, 0.1, { type: 'sine', gain: 0.05 });
        if (laps === 3 && time - lastCheer > 10) {
          lastCheer = time;
          buddy.celebrate(L(
            'Tre varv! En knuff åt sidan gör att kulan hela tiden faller mot mitten, men missar. Det är en omloppsbana.',
            'Three laps! A sideways push means the marble keeps falling towards the centre, but keeps missing. That is an orbit.',
          ));
        }
      }
      // trail
      m.trailTimer -= dt;
      if (m.trailTimer <= 0) {
        m.trailTimer = 1 / 30;
        if (m.n >= TRAIL) {
          m.trail.copyWithin(0, 3);
          m.n = TRAIL - 1;
        }
        m.trail[m.n * 3] = m.x;
        m.trail[m.n * 3 + 1] = heightAt(r) + 0.004;
        m.trail[m.n * 3 + 2] = m.z;
        m.n++;
        const g = m.line.geometry as THREE.BufferGeometry;
        g.setDrawRange(0, m.n);
        g.attributes.position.needsUpdate = true;
      }
      m.line.visible = st.trails;
    }
    uiTimer -= dt;
    if (ui && uiTimer <= 0) {
      uiTimer = 0.1;
      const m = st.last >= 0 ? marbles[st.last] : null;
      const live = m && m.active && m.falling < 0;
      ui.speed.set(live ? `${fmt(Math.hypot(m.vx, m.vz) * 100, 0)} cm/s` : '–');
      ui.dist.set(live ? `${fmt(Math.hypot(m.x, m.z) * 100, 0)} cm` : '–');
      ui.laps.set(m ? fmt(m.laps) : '–');
      ui.caught.set(fmt(st.captured));
    }
  };

  return { controls, update };
}
