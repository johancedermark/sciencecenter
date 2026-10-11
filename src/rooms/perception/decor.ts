/** Decor: the glowing neuron brain, posters, plants and a bench. */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import { radialSpot } from '../../core/textures';
import type { RoomContext } from '../../core/types';
import { ACCENT, type BuddyGate, canvasPlane, mats, mesh, rbox, rng, wrapLines } from './common';

// ------------------------------------------------------------------ the brain sculpture
export function buildBrain(ctx: RoomContext, buddy: BuddyGate, pos: [number, number]) {
  const root = new THREE.Group();
  root.position.set(pos[0], 0, pos[1]);
  ctx.group.add(root);
  ctx.addCollider(pos[0], pos[1], 1.1, 1.1);

  mesh(rbox(0.95, 1.1, 0.95, 0.06), mats.wood, 0, 0.55, 0, root);
  mesh(rbox(1.05, 0.06, 1.05, 0.03), mats.brass, 0, 1.12, 0, root);
  mesh(rbox(1.05, 0.08, 1.05, 0.03), mats.darkWood, 0, 0.04, 0, root);
  const plaque = canvasPlane(0.8, 0.5, [800, 500], (g, W, H) => {
    g.fillStyle = '#2a1a12';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9a050';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd9a8';
    g.font = '800 78px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Din hjärna', 'Your brain')), W / 2, H * 0.24);
    g.font = '700 40px "Nunito", system-ui, sans-serif';
    g.fillStyle = '#f3c99a';
    g.fillText(t(L('≈ 86 miljarder nervceller', '≈ 86 billion neurons')), W / 2, H * 0.5);
    g.fillText(t(L('≈ 1,4 kg · drivs av ≈ 20 W', '≈ 1.4 kg · runs on ≈ 20 W')), W / 2, H * 0.68);
    g.fillStyle = '#c9a98a';
    g.font = '600 30px "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Klicka på hjärnan!', 'Click the brain!')), W / 2, H * 0.86);
  });
  plaque.mesh.position.set(0, 0.62, 0.478);
  root.add(plaque.mesh);

  // neurons: sampled near the surface of two hemispheres, plus cerebellum and brain stem
  const brain = new THREE.Group();
  brain.position.y = 1.85;
  root.add(brain);
  const r = rng(1234);
  const pts: THREE.Vector3[] = [];
  const shapes = [
    { c: [-0.2, 0.08, 0.02], s: [0.27, 0.33, 0.52], n: 70 },
    { c: [0.2, 0.08, 0.02], s: [0.27, 0.33, 0.52], n: 70 },
    { c: [0, -0.2, -0.34], s: [0.3, 0.13, 0.17], n: 16 },
    { c: [0, -0.4, -0.12], s: [0.07, 0.2, 0.07], n: 6 },
  ];
  for (const sh of shapes) {
    let made = 0;
    while (made < sh.n) {
      const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      const l = v.length();
      if (l > 1 || (sh.n > 20 && l < 0.65)) continue;
      if (sh.n > 20 && v.y < -0.55) continue; // flat-ish bottom
      pts.push(new THREE.Vector3(sh.c[0] + v.x * sh.s[0], sh.c[1] + v.y * sh.s[1], sh.c[2] + v.z * sh.s[2]));
      made++;
    }
  }
  const N = pts.length;
  // connections: each neuron to its 3 nearest neighbours
  const adj: number[][] = pts.map(() => []);
  const edges: [number, number][] = [];
  const has = new Set<string>();
  for (let i = 0; i < N; i++) {
    const near = pts.map((p, j) => ({ j, d: p.distanceToSquared(pts[i]) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 3);
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (has.has(key)) continue;
      has.add(key);
      edges.push([i, j]);
      adj[i].push(edges.length - 1);
      adj[j].push(edges.length - 1);
    }
  }
  const lp: number[] = [];
  for (const [a, b] of edges) lp.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  brain.add(new THREE.LineSegments(lg, lineMat));

  const nodeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.022, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    nodeMesh.setMatrixAt(i, m4);
  });
  const glow = new Float32Array(N);
  const base = new THREE.Color(0xd06a3c);
  const hot = new THREE.Color(0xffe2a0).multiplyScalar(2.2);
  const tmpC = new THREE.Color();
  for (let i = 0; i < N; i++) nodeMesh.setColorAt(i, base);
  brain.add(nodeMesh);

  // action potentials travelling along the connections
  const P = 46;
  const pulseMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(2.4) }), P);
  brain.add(pulseMesh);
  const pulses = Array.from({ length: P }, () => ({ e: Math.floor(r() * edges.length), fwd: r() > 0.5, t: r(), speed: 0.8 + r() * 1.2 }));
  const pv = new THREE.Vector3();
  let burst = 0;

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSpot('rgba(255,150,90,0.9)', 'rgba(255,120,60,0)'), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(2.0);
  brain.add(halo);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  brain.add(hit);
  ctx.interaction.add(hit, {
    label: L('Klicka: tänk en tanke!', 'Click: think a thought!'),
    onClick: () => {
      burst = 2.5;
      ctx.sfx.chime();
      for (const p of pulses) p.speed = 2.5 + r() * 2;
      buddy.say(L(
        'Varje gnista är en nervsignal. I en riktig hjärna skickar nervcellerna tillsammans miljarder sådana varje sekund, i upp till 120 meter per sekund!',
        'Each spark is a nerve signal. In a real brain, the neurons fire billions of them every second, at up to 120 metres per second!',
      ), 'idea');
    },
  });

  return {
    update(dt: number, time: number) {
      brain.rotation.y = time * 0.12;
      burst = Math.max(0, burst - dt);
      for (let k = 0; k < P; k++) {
        const p = pulses[k];
        p.t += p.speed * dt;
        if (p.t >= 1) {
          const [a, b] = edges[p.e];
          const node = p.fwd ? b : a;
          glow[node] = 1;
          const opts = adj[node];
          const next = opts[Math.floor(Math.random() * opts.length)];
          p.e = next;
          p.fwd = edges[next][0] === node;
          p.t = 0;
          if (burst <= 0) p.speed = 0.8 + Math.random() * 1.2;
        }
        const [a, b] = edges[p.e];
        const from = pts[p.fwd ? a : b];
        const to = pts[p.fwd ? b : a];
        pv.lerpVectors(from, to, p.t);
        m4.makeTranslation(pv.x, pv.y, pv.z);
        pulseMesh.setMatrixAt(k, m4);
      }
      pulseMesh.instanceMatrix.needsUpdate = true;
      const decay = Math.exp(-dt * 4);
      for (let i = 0; i < N; i++) {
        glow[i] *= decay;
        tmpC.copy(base).lerp(hot, glow[i]);
        nodeMesh.setColorAt(i, tmpC);
      }
      if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
      halo.material.opacity = 0.26 + 0.08 * Math.sin(time * 1.3) + burst * 0.08;
      lineMat.opacity = 0.35 + burst * 0.15;
    },
  };
}

// ------------------------------------------------------------------ posters, plants, bench
export function buildDecor(ctx: RoomContext) {
  // Five senses poster on the left wall, above a bench
  const senses = canvasPlane(1.5, 2.0, [768, 1024], (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#3a2030');
    grad.addColorStop(1, '#22162a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ff8a5c';
    g.lineWidth = 10;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd0a8';
    g.font = '800 70px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Fem sinnen?', 'Five senses?')), W / 2, 90);
    g.font = '800 48px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillStyle = '#ff9a6a';
    g.fillText(t(L('Du har betydligt fler!', 'You have many more!')), W / 2, 152);
    const five: [string, { sv: string; en: string }][] = [
      ['👁', L('Syn', 'Sight')], ['👂', L('Hörsel', 'Hearing')], ['👃', L('Lukt', 'Smell')],
      ['👅', L('Smak', 'Taste')], ['✋', L('Känsel', 'Touch')],
    ];
    const more: [string, { sv: string; en: string }][] = [
      ['⚖️', L('Balans – innerörats båggångar', 'Balance – the inner ear')],
      ['🤸', L('Kroppsuppfattning – var är din hand?', 'Body position – where is your hand?')],
      ['🌡️', L('Värme och kyla', 'Hot and cold')],
      ['⚡', L('Smärta', 'Pain')],
      ['🫀', L('Inre sinnen – hunger, törst, puls', 'Inner senses – hunger, thirst, heartbeat')],
    ];
    g.textAlign = 'left';
    g.font = '700 40px "Nunito", system-ui, sans-serif';
    five.forEach(([ic, l], i) => {
      const x = 70 + (i % 2) * 330;
      const y = 236 + Math.floor(i / 2) * 64;
      g.fillStyle = '#fff2e2';
      g.fillText(`${ic}  ${t(l)}`, x, y);
    });
    g.fillStyle = '#ff9a6a';
    g.font = '800 42px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('… och dessutom:', '… and also:')), 70, 452);
    g.font = '700 33px "Nunito", system-ui, sans-serif';
    g.fillStyle = '#f6e2cc';
    let y = 516;
    for (const [ic, l] of more) {
      for (const [k, line] of wrapLines(g, `${ic}  ${t(l)}`, W - 150).entries()) {
        g.fillText(line, k ? 118 : 70, y);
        y += 46;
      }
      y += 10;
    }
    g.fillStyle = '#c9a98a';
    g.font = '600 28px "Nunito", system-ui, sans-serif';
    y = H - 110;
    for (const line of wrapLines(g, t(L(
      'Forskare räknar till minst 9 och ibland över 20 sinnen – det beror på hur man räknar.',
      'Scientists count at least 9 and sometimes more than 20 senses – it depends on how you count.',
    )), W - 140)) {
      g.fillText(line, 70, y);
      y += 38;
    }
  });
  senses.mesh.position.set(-9.93, 2.35, 1.2);
  senses.mesh.rotation.y = Math.PI / 2;
  ctx.group.add(senses.mesh);
  mesh(new THREE.BoxGeometry(0.03, 2.08, 1.58), mats.brass, -9.965, 2.35, 1.2, ctx.group);

  // Eye-to-hand poster above the reaction machine (right wall)
  const chain = canvasPlane(1.9, 1.15, [1024, 620], (g, W, H) => {
    g.fillStyle = '#20302c';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#5ee6d6';
    g.lineWidth = 8;
    g.strokeRect(10, 10, W - 20, H - 20);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#c9fff2';
    g.font = '800 58px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Från öga till finger', 'From eye to finger')), W / 2, 66);
    const steps: [string, { sv: string; en: string }, string][] = [
      ['👁', L('Näthinnan', 'Retina'), '≈ 20–40 ms'],
      ['🧠', L('Syncentrum', 'Visual cortex'), '≈ 30 ms'],
      ['💡', L('Beslut', 'Decision'), '≈ 80–100 ms'],
      ['⚡', L('Nerv till handen', 'Nerve to hand'), '≈ 20 ms'],
      ['💪', L('Muskeln', 'Muscle'), '≈ 30 ms'],
    ];
    const n = steps.length;
    steps.forEach(([ic, l, ms], i) => {
      const x = 110 + (i * (W - 220)) / (n - 1);
      g.font = '64px system-ui, sans-serif';
      g.fillText(ic, x, 200);
      g.fillStyle = '#e8fff8';
      g.font = '800 30px "Nunito", system-ui, sans-serif';
      g.fillText(t(l), x, 280);
      g.fillStyle = '#7ef0d0';
      g.font = '700 28px "Nunito", system-ui, sans-serif';
      g.fillText(ms, x, 325);
      if (i < n - 1) {
        g.fillStyle = '#5ee6d6';
        g.fillText('→', x + (W - 220) / (n - 1) / 2, 200);
      }
      g.fillStyle = '#c9fff2';
    });
    g.fillStyle = '#ffd9a8';
    g.font = '800 46px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Summa: ungefär 200–250 ms', 'Total: about 200–250 ms')), W / 2, 440);
    g.fillStyle = '#a8d8cc';
    g.font = '600 30px "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Ungefärliga tider. Ljud går ofta snabbare än ljus!', 'Rough timings. Sound is often quicker than light!')), W / 2, 530);
  });
  chain.mesh.position.set(9.93, 2.85, -0.5);
  chain.mesh.rotation.y = -Math.PI / 2;
  ctx.group.add(chain.mesh);

  // plants (shared geometry)
  const potGeo = new THREE.CylinderGeometry(0.26, 0.2, 0.5, 18);
  const leafGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const r = rng(77);
  for (const [x, z] of [[-9.1, 8.1], [9.1, 8.1], [9.1, -8.2], [-9.1, -8.2]]) {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    mesh(potGeo, mats.pot, 0, 0.25, 0, p);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r();
      const h = 0.65 + r() * 0.75;
      const leaf = mesh(leafGeo, mats.leaf, Math.cos(a) * 0.17, h, Math.sin(a) * 0.17, p);
      leaf.scale.set(0.55, 1.7, 0.3);
      leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    }
    ctx.group.add(p);
    ctx.addCollider(x, z, 0.55, 0.55);
  }

  // bench under the senses poster
  const bench = new THREE.Group();
  bench.position.set(-9.2, 0, 1.2);
  mesh(rbox(0.5, 0.07, 1.7, 0.03), mats.wood, 0, 0.45, 0, bench);
  for (const z of [-0.7, 0.7]) mesh(rbox(0.44, 0.42, 0.07, 0.02), mats.darkWood, 0, 0.21, z, bench);
  ctx.group.add(bench);
  ctx.addCollider(-9.2, 1.2, 0.55, 1.75);
}
