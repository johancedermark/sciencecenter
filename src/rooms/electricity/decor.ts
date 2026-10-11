/**
 * Decor for the Electricity & Energy room: framed posters (Faraday 1831, Volta 1800, energy conversion),
 * a plasma globe you can touch, warm string lights and plants.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import { FONT, canvasPlane, mats, put, rbox, wrap, halo } from './shared';

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void;

function poster(ctx: RoomContext, x: number, y: number, z: number, ry: number, title: () => string, sub: () => string, body: () => string, art: Draw) {
  const m = mats();
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  ctx.group.add(grp);
  put(grp, rbox(1.34, 1.84, 0.05, 0.02), m.darkWood, 0, 0, 0);
  put(grp, rbox(1.26, 1.76, 0.02, 0.01), m.brass, 0, 0, 0.02);
  const p = canvasPlane(1.2, 1.7, 600, 850, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#f6ead2');
    grd.addColorStop(1, '#e9d6b2');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#7a4e2a';
    g.lineWidth = 4;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.fillStyle = '#3a2416';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `800 54px ${FONT}`;
    g.fillText(title(), W / 2, 92, W - 60);
    g.fillStyle = '#b5651d';
    g.font = `700 30px ${FONT}`;
    g.fillText(sub(), W / 2, 134, W - 60);
    g.save();
    g.translate(0, 160);
    art(g, W, 380);
    g.restore();
    g.fillStyle = '#3a2416';
    g.font = `500 27px ${FONT}`;
    g.textAlign = 'left';
    wrap(g, body(), 48, 590, W - 96, 36);
  });
  p.mesh.position.z = 0.032;
  grp.add(p.mesh);
}

export function buildDecor(ctx: RoomContext) {
  const m = mats();

  // ------------------------------------------------------------ posters
  poster(ctx, -9.96, 2.35, -0.8, Math.PI / 2,
    () => 'Michael Faraday',
    () => t(L('1831 · Induktionen upptäcks', '1831 · Induction is discovered')),
    () => t(L(
      'Faraday lindade två spolar på en järnring och såg en kompassnål rycka – men bara när strömmen slogs av eller på. Förändring var nyckeln! Samma år byggde han den första generatorn: en kopparskiva som snurrade mellan polerna på en magnet.',
      'Faraday wound two coils on an iron ring and saw a compass needle twitch, but only when the current was switched on or off. Change was the key! That same year he built the first generator: a copper disc spinning between the poles of a magnet.',
    )),
    (g, W, Hh) => {
      // iron ring with two coils, a galvanometer and a battery
      const cx = W / 2, cy = Hh / 2;
      g.strokeStyle = '#5a5a60';
      g.lineWidth = 26;
      g.beginPath();
      g.arc(cx, cy, 120, 0, Math.PI * 2);
      g.stroke();
      const coil = (a0: number) => {
        g.strokeStyle = '#c06a2f';
        g.lineWidth = 6;
        for (let i = -6; i <= 6; i++) {
          const a = a0 + i * 0.07;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100);
          g.lineTo(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140);
          g.stroke();
        }
      };
      coil(Math.PI);
      coil(0);
      g.strokeStyle = '#3a2416';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - 140, cy - 20); g.lineTo(cx - 230, cy - 20); g.lineTo(cx - 230, cy + 120); g.stroke();
      g.fillStyle = '#3a2416';
      g.fillRect(cx - 255, cy + 120, 50, 26);
      g.beginPath(); g.moveTo(cx + 140, cy - 20); g.lineTo(cx + 220, cy - 20); g.lineTo(cx + 220, cy + 80); g.stroke();
      g.beginPath(); g.arc(cx + 220, cy + 125, 42, 0, Math.PI * 2); g.fillStyle = '#fff8e8'; g.fill(); g.stroke();
      g.strokeStyle = '#c0201a';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx + 220, cy + 140); g.lineTo(cx + 245, cy + 98); g.stroke();
    });

  poster(ctx, 9.96, 2.35, -0.8, -Math.PI / 2,
    () => 'Alessandro Volta',
    () => t(L('1800 · Det första batteriet', '1800 · The first battery')),
    () => t(L(
      'Volta staplade skivor av zink och koppar med saltvattenindränkt kartong emellan. Stapeln gav en jämn ström – något ingen sett förut. Enheten volt är uppkallad efter honom, och varje batteri i din ficka bygger på samma idé.',
      'Volta stacked discs of zinc and copper with brine-soaked cardboard in between. The pile gave a steady current, something nobody had seen before. The unit volt is named after him, and every battery in your pocket builds on the same idea.',
    )),
    (g, W, Hh) => {
      const cx = W / 2;
      let y = Hh - 40;
      for (let i = 0; i < 11; i++) {
        g.fillStyle = '#8e9aa6'; g.fillRect(cx - 70, y - 12, 140, 12); y -= 12;
        g.fillStyle = '#8b6a45'; g.fillRect(cx - 66, y - 8, 132, 8); y -= 8;
        g.fillStyle = '#c87a45'; g.fillRect(cx - 70, y - 12, 140, 12); y -= 12;
      }
      g.strokeStyle = '#5a3e2a';
      g.lineWidth = 6;
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * 84, Hh - 30); g.lineTo(cx + sx * 84, y - 10); g.stroke(); }
      g.fillStyle = '#3a2416';
      g.font = `800 40px ${FONT}`;
      g.fillText('+', cx + 130, y + 30);
      g.fillText('−', cx + 130, Hh - 40);
    });

  poster(ctx, 7.2, 2.3, -8.96, 0,
    () => t(L('Energi byter form', 'Energy changes form')),
    () => t(L('Den skapas aldrig – den omvandlas', 'It is never created, only converted')),
    () => t(L(
      'Din arm, zinken i citronen och fotonerna från solen – överallt i rummet omvandlas energi från en form till en annan. Ingen maskin kan ge ut mer energi än den får in, och lite blir alltid värme på vägen.',
      'Your arm, the zinc in the lemon and the photons from the sun: everywhere in this room energy is converted from one form to another. No machine can give out more energy than it takes in, and a little always becomes heat on the way.',
    )),
    (g) => {
      g.font = `400 64px ${FONT}`;
      g.textAlign = 'center';
      const rows = [['💪', '⚙️', '⚡', '💡'], ['☀️', '🔷', '⚡', '🌀'], ['🍋', '🧪', '⚡', '🔴']];
      rows.forEach((r, i) => {
        r.forEach((e, j) => {
          g.fillText(e, 90 + j * 140, 80 + i * 110);
          if (j < 3) {
            g.fillStyle = '#b5651d';
            g.fillText('→', 160 + j * 140, 76 + i * 110);
            g.fillStyle = '#3a2416';
          }
        });
      });
    });

  // ------------------------------------------------------------ plasma globe on a pedestal (room centre)
  const PG = new THREE.Vector3(3.2, 0, -0.4); // off the entrance-to-generator sight line
  put(ctx.group, new THREE.CylinderGeometry(0.22, 0.28, 0.95, 24), m.darkWood, PG.x, 0.475, PG.z);
  put(ctx.group, new THREE.TorusGeometry(0.225, 0.015, 8, 32), m.brass, PG.x, 0.95, PG.z, Math.PI / 2);
  put(ctx.group, new THREE.CylinderGeometry(0.1, 0.13, 0.12, 24), m.blackMetal, PG.x, 1.01, PG.z);
  ctx.addCollider(PG.x, PG.z, 0.6, 0.6);
  const center = new THREE.Vector3(PG.x, 1.3, PG.z);
  const R = 0.2;
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(R, 32, 20),
    new THREE.MeshStandardMaterial({ color: 0x8a6cff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  globe.position.copy(center);
  ctx.group.add(globe);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8a0ff).multiplyScalar(1.6), toneMapped: false }));
  core.position.copy(center);
  ctx.group.add(core);
  const coreHalo = halo(0xb070ff, 0.45);
  coreHalo.position.copy(center);
  coreHalo.material.opacity = 0.7;
  ctx.group.add(coreHalo);
  const NF = 9, SEG = 14;
  const fPos = new Float32Array(NF * SEG * 2 * 3);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const filaments = new THREE.LineSegments(fGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0xe09bff).multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.9 }));
  filaments.frustumCulled = false;
  ctx.group.add(filaments);
  const globeWorld = ctx.toWorld(center.clone());
  const dirs = Array.from({ length: NF }, () => new THREE.Vector3().randomDirection());
  const vels = Array.from({ length: NF }, () => new THREE.Vector3());
  let touch = 0;
  const touchDir = new THREE.Vector3(0, 0, 1);
  ctx.interaction.add(globe, {
    label: L('Plasmaklot: rör vid glaset!', 'Plasma globe: touch the glass!'),
    onClick: (info) => {
      if (info.hit) {
        const p = ctx.group.worldToLocal(info.hit.point.clone()).sub(center).normalize();
        touchDir.copy(p);
      }
      touch = 4;
      ctx.sfx.resume();
      ctx.sfx.noise(0.4, { freq: 4000, gain: 0.05, type: 'highpass' });
    },
  });

  // ------------------------------------------------------------ string lights along the side walls
  const bulbs: THREE.Vector3[] = [];
  const wirePts: THREE.Vector3[][] = [];
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s < 4; s++) {
      const z0 = -8 + s * 4, z1 = z0 + 4;
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const p = new THREE.Vector3(sx * 9.85, 3.9 - Math.sin(u * Math.PI) * 0.4, z0 + (z1 - z0) * u);
        if (k < 10 || s === 3) pts.push(p);
        if (k > 0 && k < 10 && k % 2 === 0) bulbs.push(p.clone().add(new THREE.Vector3(-sx * 0.02, -0.06, 0)));
      }
    }
    wirePts.push(pts);
  }
  for (const pts of wirePts) put(ctx.group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.006, 4), m.rubberBlack);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), bulbMat, bulbs.length);
  const mtx = new THREE.Matrix4();
  const warm = new THREE.Color(0xffc070);
  bulbs.forEach((p, i) => {
    mtx.makeTranslation(p.x, p.y, p.z);
    lights.setMatrixAt(i, mtx);
    lights.setColorAt(i, warm);
  });
  ctx.group.add(lights);

  // ------------------------------------------------------------ plants and a bench
  const pot = new THREE.MeshStandardMaterial({ color: 0xb4623a, roughness: 0.8 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.7 });
  const leafGeo = new THREE.SphereGeometry(0.18, 10, 8);
  for (const [x, z] of [[-9.1, -8.1], [9.1, -8.1], [-9.1, 8.1], [9.1, 8.1]] as const) {
    put(ctx.group, new THREE.CylinderGeometry(0.28, 0.22, 0.5, 20), pot, x, 0.25, z);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const lm = put(ctx.group, leafGeo, leaf, x + Math.cos(a) * 0.17, 0.75 + (i % 3) * 0.18, z + Math.sin(a) * 0.17, 0, a, 0.4);
      lm.scale.set(0.8, 1.6, 0.6);
    }
    ctx.addCollider(x, z, 0.7, 0.7);
  }
  {
    const bx = -4.4, bz = 7.6;
    put(ctx.group, rbox(1.8, 0.07, 0.45, 0.02), m.wood, bx, 0.46, bz);
    for (const sx of [-0.75, 0.75]) put(ctx.group, rbox(0.08, 0.42, 0.38, 0.015), m.darkWood, bx + sx, 0.21, bz);
    put(ctx.group, rbox(1.8, 0.35, 0.05, 0.02), m.wood, bx, 0.75, bz + 0.22);
    ctx.addCollider(bx, bz, 1.9, 0.6);
  }
  {
    const bx = 4.4, bz = 7.6;
    put(ctx.group, rbox(1.8, 0.07, 0.45, 0.02), m.wood, bx, 0.46, bz);
    for (const sx of [-0.75, 0.75]) put(ctx.group, rbox(0.08, 0.42, 0.38, 0.015), m.darkWood, bx + sx, 0.21, bz);
    put(ctx.group, rbox(1.8, 0.35, 0.05, 0.02), m.wood, bx, 0.75, bz + 0.22);
    ctx.addCollider(bx, bz, 1.9, 0.6);
  }

  // ------------------------------------------------------------ animation
  const a = new THREE.Vector3(), b = new THREE.Vector3(), tip = new THREE.Vector3();
  const tc = new THREE.Color();
  let twinkleAcc = 0;
  return {
    update(dt: number, time: number) {
      touch = Math.max(0, touch - dt);
      const near = ctx.camera.position.distanceToSquared(globeWorld) < 14 * 14;
      if (near) {
        let k = 0;
        for (let f = 0; f < NF; f++) {
          // filaments wander; when touched they all reach for your finger
          const d = dirs[f];
          vels[f].x += (Math.random() - 0.5) * dt * 6;
          vels[f].y += (Math.random() - 0.5) * dt * 6;
          vels[f].z += (Math.random() - 0.5) * dt * 6;
          vels[f].multiplyScalar(Math.exp(-dt * 2));
          d.addScaledVector(vels[f], dt);
          if (touch > 0) d.lerp(touchDir, 1 - Math.exp(-dt * 8));
          d.normalize();
          tip.copy(d).multiplyScalar(R * 0.98);
          for (let s = 0; s < SEG; s++) {
            const u0 = s / SEG, u1 = (s + 1) / SEG;
            const j0 = s === 0 ? 0 : 0.012, j1 = s === SEG - 1 ? 0 : 0.012;
            a.copy(tip).multiplyScalar(0.18 + 0.82 * u0);
            b.copy(tip).multiplyScalar(0.18 + 0.82 * u1);
            a.x += Math.sin(time * 23 + f * 3 + s) * j0; a.y += Math.cos(time * 19 + f + s * 2) * j0;
            b.x += Math.sin(time * 23 + f * 3 + s + 1) * j1; b.y += Math.cos(time * 19 + f + (s + 1) * 2) * j1;
            fPos[k++] = center.x + a.x; fPos[k++] = center.y + a.y; fPos[k++] = center.z + a.z;
            fPos[k++] = center.x + b.x; fPos[k++] = center.y + b.y; fPos[k++] = center.z + b.z;
          }
        }
        fGeo.attributes.position.needsUpdate = true;
        coreHalo.material.opacity = 0.55 + 0.2 * Math.sin(time * 11) + (touch > 0 ? 0.3 : 0);
      }
      // string lights: a slow warm twinkle
      twinkleAcc += dt;
      if (twinkleAcc > 0.12) {
        twinkleAcc = 0;
        for (let i = 0; i < bulbs.length; i++) {
          const v = 0.75 + 0.25 * Math.sin(time * 1.7 + i * 1.3) * Math.sin(time * 0.6 + i * 0.7);
          lights.setColorAt(i, tc.copy(warm).multiplyScalar(v * 1.3));
        }
        if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
      }
    },
  };
}
