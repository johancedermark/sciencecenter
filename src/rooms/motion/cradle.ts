/** Station 3: Newton's cradle. Drag 1–3 steel balls out and let go. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomContext } from '../../core/types';
import type { Readout } from '../../core/controlPanel';
import { L } from '../../core/i18n';
import { CradleSim } from './physics';
import { Batch, StationState, buddyGate, fmt, mat, stationFrame, steelClick, type StationModule } from './common';

const R = 0.04;
const LEN = 0.32;
const PY = 1.29;
const ZR = 0.12;
const HZ = 960;
const MAX_PULL = 1.0; // rad (57°)

export function buildCradle(ctx: RoomContext, x: number, z: number, rotY: number): StationModule {
  const { group, v, world, collider } = stationFrame(ctx, x, z, rotY);
  const st = new StationState(ctx, world);
  const buddy = buddyGate(ctx);
  const sim = new CradleSim(LEN, R);
  const px = (i: number) => (i - 2) * 2 * R;

  // ---------------------------------------------------------------- static build
  const b = new Batch();
  b.add(new THREE.CylinderGeometry(0.42, 0.48, 0.06, 40), mat.wood, [0, 0.79, 0]);
  b.add(new THREE.CylinderGeometry(0.12, 0.18, 0.76, 24), mat.darkWood, [0, 0.38, 0]);
  b.add(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 32), mat.darkWood, [0, 0.02, 0]);
  b.add(new RoundedBoxGeometry(0.66, 0.05, 0.36, 2, 0.02), mat.darkWood, [0, 0.845, 0]);
  const rod = new THREE.CylinderGeometry(0.008, 0.008, 1, 10);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.strut(new THREE.Vector3(sx * 0.28, 0.87, sz * ZR), new THREE.Vector3(sx * 0.28, PY, sz * ZR), 0.008, mat.brass, rod);
  }
  for (const sz of [-1, 1]) b.strut(new THREE.Vector3(-0.28, PY, sz * ZR), new THREE.Vector3(0.28, PY, sz * ZR), 0.008, mat.brass, rod);
  b.add(new THREE.SphereGeometry(0.014, 10, 8), mat.brass, [-0.28, PY, -ZR]);
  b.add(new THREE.SphereGeometry(0.014, 10, 8), mat.brass, [0.28, PY, -ZR]);
  b.add(new THREE.SphereGeometry(0.014, 10, 8), mat.brass, [-0.28, PY, ZR]);
  b.add(new THREE.SphereGeometry(0.014, 10, 8), mat.brass, [0.28, PY, ZR]);
  b.build(group);

  const ballGeo = new THREE.SphereGeometry(R, 28, 18);
  const balls = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(ballGeo, mat.steel);
    group.add(m);
    return m;
  });
  const strGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 1, 4);
  const strings = new THREE.InstancedMesh(strGeo, mat.string, 10);
  strings.frustumCulled = false;
  group.add(strings);
  // glow ring under the cradle (idle life)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.008, 6, 64), mat.glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.76;
  group.add(ring);

  // ---------------------------------------------------------------- state
  const s = { E0: 0, lastClick: 0, released: 0, dragI: -1, side: 0 as -1 | 0 | 1, maxOut: 0 };
  let rEnergy: Readout | null = null;
  let rHits: Readout | null = null;

  const a = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const mtx = new THREE.Matrix4();

  const draw = () => {
    for (let i = 0; i < 5; i++) {
      const th = sim.th[i];
      c.set(px(i) + LEN * Math.sin(th), PY - LEN * Math.cos(th), 0);
      balls[i].position.copy(c);
      for (let k = 0; k < 2; k++) {
        a.set(px(i), PY, k ? ZR : -ZR);
        dir.subVectors(c, a);
        const len = dir.length();
        dir.divideScalar(len);
        q.setFromUnitVectors(up, dir);
        mid.addVectors(a, c).multiplyScalar(0.5);
        sc.set(1, len, 1);
        mtx.compose(mid, q, sc);
        strings.setMatrixAt(i * 2 + k, mtx);
      }
    }
    strings.instanceMatrix.needsUpdate = true;
  };

  const release = () => {
    sim.held.fill(false);
    sim.om.fill(0);
    sim.collisions = 0;
    s.E0 = sim.energy();
    s.released = performance.now() / 1000;
    s.maxOut = 0;
  };

  const pull = (left: number, right: number) => {
    sim.stop();
    for (let i = 0; i < left; i++) sim.th[i] = -0.6;
    for (let i = 0; i < right; i++) sim.th[4 - i] = 0.6;
    ctx.sfx.whoosh();
    release();
    if (left === 2 && right === 0) {
      buddy.say(L(
        'Två in, två ut! Om bara en kula flög ut med dubbla farten skulle rörelsemängden stämma, men då skulle energin fördubblas. Bara två kulor klarar båda lagarna.',
        'Two in, two out! If one ball flew out at double speed, momentum would still add up, but the energy would double. Only two balls satisfy both laws.',
      ), { expression: 'idea', gesture: 'point' });
    }
  };

  // drag balls
  const plane = new THREE.Plane();
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  balls.forEach((ball, i) => {
    ctx.interaction.add(ball, {
      label: L('Dra ut kulan och släpp', 'Drag the ball out and let go'),
      onDragStart: () => {
        group.updateMatrixWorld();
        nrm.set(0, 0, 1).transformDirection(group.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(nrm, group.localToWorld(tmp.set(0, PY, 0)));
        sim.stop();
        s.dragI = i;
        s.side = i < 2 ? -1 : i > 2 ? 1 : 0;
        ctx.sfx.tone(2400, 0.03, { type: 'triangle', gain: 0.05 });
      },
      onDrag: (info) => {
        const p = info.onPlane(plane);
        if (!p) return;
        group.worldToLocal(p);
        let ang = Math.atan2(p.x - px(i), PY - p.y);
        if (s.side === 0) {
          if (Math.abs(ang) < 0.03) return;
          s.side = ang < 0 ? -1 : 1;
        }
        ang = s.side < 0 ? Math.max(-MAX_PULL, Math.min(0, ang)) : Math.min(MAX_PULL, Math.max(0, ang));
        sim.th.fill(0);
        sim.held.fill(false);
        const lo = s.side < 0 ? 0 : i;
        const hi = s.side < 0 ? i : 4;
        for (let j = lo; j <= hi; j++) {
          sim.th[j] = ang;
          sim.held[j] = true;
        }
      },
      onDragEnd: () => {
        const n = sim.held.filter(Boolean).length;
        release();
        s.dragI = -1;
        if (n === 2 && Math.abs(sim.th[s.side < 0 ? 0 : 4]) > 0.1) {
          buddy.say(L(
            'Du släppte två, och två flyger ut på andra sidan. Både rörelsemängd och energi måste bevaras, och det klarar bara ”två in, två ut”.',
            'You dropped two, and two fly out on the other side. Both momentum and energy must be conserved, and only "two in, two out" does both.',
          ), { expression: 'idea' });
        } else if (n === 3) {
          buddy.say(L('Tre in, tre ut! Mittenkulan är med i båda gängen.', 'Three in, three out! The middle ball belongs to both groups.'), { expression: 'surprised' });
        }
      },
    });
  });

  collider(1.0, 1.0);

  ctx.addStation(
    st.hook({
      id: 'motion-cradle',
      title: L('Newtons vagga', "Newton's cradle"),
      position: [x, z],
      viewpoint: { position: v(0.22, 1.42, 1.55), target: v(0.22, 1.02, 0) },
      intro: L(
        'Fem stålkulor på rad. Dra ut en och släpp: varför flyger exakt en ut på andra sidan, och aldrig två?',
        'Five steel balls in a row. Pull one out and let go: why does exactly one fly out the other side, never two?',
      ),
      howTo: L(
        'Dra en kula åt sidan med musen eller fingret och släpp. Tar du kula två eller tre följer kulorna utanför med. Prova också knapparna, till exempel en från varje sida.',
        'Drag a ball sideways with the mouse or your finger and let go. If you grab the second or third ball, the outer ones come along. Also try the buttons, like one from each side.',
      ),
      science: L(
        'När kulorna krockar bevaras två saker: rörelsemängden (massa × fart) och, nästan helt, rörelseenergin (½·massa × fart²). Släpper du två kulor med farten v kunde i princip en kula flyga ut med 2v, för då stämmer rörelsemängden. Men då skulle energin bli ½·m·(2v)² = 2·m·v², dubbelt så mycket som de två kulorna hade (m·v²). Det går inte, så det enda som stämmer med båda lagarna är att två kulor flyger ut med farten v. Stål studsar nästan perfekt (studstal ungefär 0,98 här), men lite energi blir ljud och värme i varje klick, så vaggan stannar till slut.',
        'When the balls collide, two things are conserved: momentum (mass × speed) and, almost completely, kinetic energy (½·mass × speed²). If you drop two balls at speed v, one ball flying out at 2v would in principle keep momentum right. But its energy would be ½·m·(2v)² = 2·m·v², twice what the two balls had (m·v²). That is impossible, so the only outcome that satisfies both laws is two balls flying out at speed v. Steel bounces almost perfectly (restitution about 0.98 here), but each click turns a little energy into sound and heat, so the cradle eventually stops.',
      ),
      wow: L(
        'Stöten går genom mittenkulorna som en ljudvåg med ungefär 5 km/s, så snabbt att mittenkulorna knappt rör sig.',
        'The impact travels through the middle balls as a sound wave at about 5 km/s, so fast that the middle balls barely move.',
      ),
      controls: (panel) => {
        panel.heading(L('Släpp kulor från vänster', 'Drop balls from the left'));
        panel.buttons([
          { label: L('1 kula', '1 ball'), onClick: () => pull(1, 0) },
          { label: L('2 kulor', '2 balls'), onClick: () => pull(2, 0) },
          { label: L('3 kulor', '3 balls'), onClick: () => pull(3, 0) },
        ]);
        panel.buttons([
          { label: L('1 från varje sida', '1 from each side'), onClick: () => pull(1, 1) },
          { label: L('2 + 1', '2 + 1'), onClick: () => pull(2, 1) },
        ]);
        panel.button(L('Stoppa', 'Stop'), () => { sim.stop(); s.E0 = 0; }, { icon: '✋' });
        panel.toggle(L('Perfekt studs (studstal e = 1)', 'Perfect bounce (restitution e = 1)'), sim.e === 1, (on) => {
          sim.e = on ? 1 : 0.98;
          sim.drag = on ? 0 : 0.02;
        });
        rEnergy = panel.readout(L('Rörelseenergi kvar', 'Energy left'));
        rHits = panel.readout(L('Antal klick', 'Clicks'));
        panel.note(L(
          'Modell: kulorna är pendlar (L = 32 cm, g = 9,82 m/s²) som krockar en i taget, med studstalet 0,98 och lite luftmotstånd.',
          'Model: the balls are pendulums (L = 32 cm, g = 9.82 m/s²) colliding one pair at a time, with restitution 0.98 and a little air drag.',
        ));
        return () => {
          rEnergy = rHits = null;
        };
      },
    }),
  );

  draw();

  return {
    update(dt, time) {
      ring.scale.setScalar(1 + 0.01 * Math.sin(time * 2));
      if (!st.near()) return;
      const d = Math.min(dt, 0.05);
      const n = Math.max(1, Math.ceil(d * HZ));
      const h = d / n;
      let loud = 0;
      for (let k = 0; k < n; k++) loud = Math.max(loud, sim.step(h));
      const now = performance.now() / 1000;
      if (loud > 0.02 && now - s.lastClick > 0.03) {
        s.lastClick = now;
        steelClick(ctx.sfx, loud);
      }
      draw();
      if (rEnergy) rEnergy.set(s.E0 > 1e-6 && s.dragI < 0 ? `${fmt((100 * sim.energy()) / s.E0, 0)} %` : '–');
      if (rHits) rHits.set(String(sim.collisions));
    },
  };
}
