/** Decor for the Forces & Motion room: a marble run on the wall, Newton's laws poster, bench and plants. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomContext } from '../../core/types';
import { L, t } from '../../core/i18n';
import { Batch, Board, FONT, mat, wrap, type StationModule } from './common';

/** A marble run mounted on the left wall (x = −10), spanning z ∈ [Z0, Z0 + 3.6]. */
function marbleRun(ctx: RoomContext): StationModule {
  const Z0 = -3.4;
  const WALL_X = -10 + 0.12;
  const root = new THREE.Group();
  root.position.set(WALL_X, 0, Z0);
  ctx.group.add(root);
  // Path in wall coordinates (u along +z, y up); marbles roll from the top down through 5 zigzag rails.
  const pts: [number, number][] = [];
  const rails = 5;
  for (let i = 0; i < rails; i++) {
    const y = 3.6 - i * 0.48;
    const [ua, ub] = i % 2 === 0 ? [0.25, 3.15] : [3.15, 0.25];
    pts.push([ua, y], [ub, y - 0.3]);
  }
  pts.push([3.15, 1.2], [3.42, 1.2], [3.42, 3.95], [3.2, 3.95], [0.25, 3.72]);
  // close the loop back to the start
  pts.push([pts[0][0], pts[0][1]]);
  const seg: { a: [number, number]; b: [number, number]; len: number; t0: number; dur: number }[] = [];
  let T = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const vertical = Math.abs(b[0] - a[0]) < 0.01;
    const lift = vertical && b[1] > a[1];
    const speed = lift ? 0.35 : vertical ? 1.6 : 0.75;
    seg.push({ a, b, len, t0: T, dur: len / speed });
    T += len / speed;
  }

  const bt = new Batch();
  bt.add(new RoundedBoxGeometry(0.06, 3.2, 3.9, 2, 0.02), mat.darkWood, [-0.08, 2.5, 1.8]);
  const railGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
  seg.forEach((sg, i) => {
    const vertical = Math.abs(sg.b[0] - sg.a[0]) < 0.01;
    if (vertical) return;
    if (i === seg.length - 1) return;
    for (const dz of [-0.012, 0.012]) {
      bt.strut(new THREE.Vector3(dz, sg.a[1] - 0.02, sg.a[0]), new THREE.Vector3(dz, sg.b[1] - 0.02, sg.b[0]), 0.008, mat.brass, railGeo);
    }
    // little brackets
    bt.add(new THREE.BoxGeometry(0.08, 0.015, 0.015), mat.brass, [-0.04, sg.a[1] - 0.03, sg.a[0]]);
  });
  bt.add(new THREE.CylinderGeometry(0.05, 0.04, 0.06, 16, 1, true), mat.brass, [0, 1.17, 3.3]);
  bt.build(root);
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 2.8, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
  );
  tube.position.set(0, 2.6, 3.42);
  root.add(tube);

  // two slowly turning brass gears for life
  const gearGeo = (() => {
    const b = new Batch();
    const g = new THREE.Group();
    b.add(new THREE.TorusGeometry(0.22, 0.025, 8, 32), mat.brass, [0, 0, 0], [0, Math.PI / 2, 0]);
    for (let k = 0; k < 4; k++) b.add(new THREE.BoxGeometry(0.02, 0.44, 0.02), mat.brass, [0, 0, 0], [(k * Math.PI) / 4, 0, 0]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      b.add(new THREE.BoxGeometry(0.03, 0.06, 0.04), mat.brass, [0, Math.cos(a) * 0.255, Math.sin(a) * 0.255], [a, 0, 0]);
    }
    b.build(g);
    return (g.children[0] as THREE.Mesh).geometry;
  })();
  const gears = [new THREE.Mesh(gearGeo, mat.brass), new THREE.Mesh(gearGeo, mat.brass)];
  gears[0].position.set(-0.02, 1.55, 1.7);
  gears[1].position.set(-0.02, 1.55 + 0.47, 1.7 + 0.12);
  gears[1].scale.setScalar(0.62);
  root.add(...gears);

  const N = 9;
  const marbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.1 }), N);
  marbles.frustumCulled = false;
  for (let i = 0; i < N; i++) marbles.setColorAt(i, new THREE.Color().setHSL(i / N, 0.8, 0.55));
  root.add(marbles);
  const m = new THREE.Matrix4();
  const world = ctx.toWorld(new THREE.Vector3(WALL_X, 2.4, Z0 + 1.8));
  let lastSeg = new Int32Array(N).fill(-1);

  return {
    update(_dt, time) {
      gears[0].rotation.x = time * 0.3;
      gears[1].rotation.x = -time * 0.3 / 0.62 + 0.1;
      if (ctx.camera.position.distanceToSquared(world) > 14 * 14) return;
      for (let i = 0; i < N; i++) {
        const tt = (time + (i * T) / N) % T;
        let k = 0;
        while (k < seg.length - 1 && tt > seg[k].t0 + seg[k].dur) k++;
        const sg = seg[k];
        const f = (tt - sg.t0) / sg.dur;
        const u = sg.a[0] + (sg.b[0] - sg.a[0]) * f;
        const y = sg.a[1] + (sg.b[1] - sg.a[1]) * f;
        m.makeTranslation(0, y + 0.01, u);
        marbles.setMatrixAt(i, m);
        // soft tick when a marble lands in the cup at the bottom
        if (k !== lastSeg[i]) {
          if (k === rails * 2 && ctx.camera.position.distanceToSquared(world) < 36) {
            ctx.sfx.tone(1900 + i * 60, 0.05, { type: 'sine', gain: 0.02 });
          }
          lastSeg[i] = k;
        }
      }
      marbles.instanceMatrix.needsUpdate = true;
    },
  };
}

function newtonPoster(ctx: RoomContext) {
  const laws = [
    {
      title: L('1. Tröghetslagen', '1. Inertia'),
      body: L(
        'En kropp är still eller rör sig rakt fram med jämn fart, tills en kraft verkar på den.',
        'An object stays at rest or keeps moving in a straight line at constant speed until a force acts on it.',
      ),
    },
    {
      title: L('2. Kraftlagen: F = m · a', '2. Force law: F = m · a'),
      body: L(
        'Kraft är massa gånger acceleration. Dubbla kraften ger dubbla accelerationen.',
        'Force equals mass times acceleration. Double the force, double the acceleration.',
      ),
    },
    {
      title: L('3. Verkan och motverkan', '3. Action and reaction'),
      body: L(
        'Trycker du på något, trycker det lika hårt tillbaka på dig.',
        'If you push on something, it pushes back on you just as hard.',
      ),
    },
  ];
  const poster = new Board(
    1.7,
    1.3,
    (g, w, h) => {
      g.fillStyle = '#f2e6cf';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2f6a3a';
      g.lineWidth = 12;
      g.strokeRect(16, 16, w - 32, h - 32);
      g.fillStyle = '#2b2018';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.font = `800 ${Math.round(h * 0.085)}px ${FONT}`;
      g.fillText(t(L('Newtons tre lagar', "Newton's three laws")), w * 0.07, h * 0.06);
      let y = h * 0.2;
      laws.forEach((law, i) => {
        // pictogram
        const cx = w * 0.12;
        const cy = y + h * 0.07;
        g.fillStyle = ['#e8673a', '#2f9fd8', '#d9a520'][i];
        g.beginPath();
        g.arc(cx, cy, h * 0.05, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#2b2018';
        g.lineWidth = 6;
        g.beginPath();
        if (i === 0) {
          g.moveTo(cx + h * 0.07, cy);
          g.lineTo(cx + h * 0.12, cy);
        } else if (i === 1) {
          g.moveTo(cx - h * 0.12, cy);
          g.lineTo(cx - h * 0.065, cy);
          g.moveTo(cx - h * 0.085, cy - h * 0.02);
          g.lineTo(cx - h * 0.065, cy);
          g.lineTo(cx - h * 0.085, cy + h * 0.02);
        } else {
          g.moveTo(cx - h * 0.02, cy - h * 0.065);
          g.lineTo(cx - h * 0.02, cy + h * 0.065);
        }
        g.stroke();
        g.fillStyle = '#2b2018';
        g.font = `700 ${Math.round(h * 0.055)}px ${FONT}`;
        g.fillText(t(law.title), w * 0.24, y);
        g.font = `500 ${Math.round(h * 0.042)}px ${FONT}`;
        g.fillStyle = '#4a3626';
        wrap(g, t(law.body), w * 0.68).forEach((line, j) => g.fillText(line, w * 0.24, y + h * 0.075 + j * h * 0.05));
        y += h * 0.245;
      });
      g.font = `italic 500 ${Math.round(h * 0.038)}px Georgia, serif`;
      g.fillStyle = '#6b4a2e';
      g.textAlign = 'right';
      g.fillText('Isaac Newton, Principia, 1687', w * 0.93, h * 0.9);
    },
    { px: 1024, lit: true, transparent: false },
  );
  poster.mesh.position.set(10 - 0.04, 2.45, -1.8);
  poster.mesh.rotation.y = -Math.PI / 2;
  ctx.group.add(poster.mesh);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.04, 1.4, 1.8, 2, 0.015), mat.darkWood);
  frame.position.set(10 - 0.005, 2.45, -1.8);
  ctx.group.add(frame);
}

export function buildDecor(ctx: RoomContext): StationModule {
  const run = marbleRun(ctx);
  newtonPoster(ctx);

  const b = new Batch();
  // bench in the middle, facing the back wall
  b.add(new RoundedBoxGeometry(1.8, 0.07, 0.45, 2, 0.025), mat.paleWood, [0, 0.45, 0.4]);
  for (const sx of [-0.75, 0.75]) b.add(new RoundedBoxGeometry(0.08, 0.42, 0.4, 2, 0.02), mat.darkWood, [sx, 0.21, 0.4]);
  ctx.addCollider(0, 0.4, 1.9, 0.55);
  // plants in the corners
  const leaf = new THREE.SphereGeometry(1, 10, 8);
  for (const [px, pz] of [[-9.1, -8.1], [9.1, -8.1], [-9.1, 8.1], [9.1, 8.1]] as const) {
    b.add(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 18), mat.pot, [px, 0.25, pz]);
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4;
      const r = k === 0 ? 0 : 0.18;
      b.add(leaf, mat.leaf, [px + Math.cos(a) * r, 0.75 + (k % 3) * 0.22, pz + Math.sin(a) * r], [0, a, 0], [0.22, 0.32, 0.22]);
    }
    ctx.addCollider(px, pz, 0.7, 0.7);
  }
  b.build(ctx.group);
  return run;
}
