/**
 * Station 'foucault': a 15 m Foucault pendulum hanging from the top of the dome, knocking over
 * a ring of 72 pegs as the floor (the Earth) turns under its swing plane.
 * World frame: +x = east, −z = north (the visitor spawns south of the pendulum looking north).
 */
import * as THREE from 'three';
import { L, getLang, onLangChange, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { Readout } from '../../core/controlPanel';
import { radialSpot } from '../../core/textures';
import { FoucaultSim, OMEGA_EARTH, precessionDegPerHour } from './foucaultPhysics';
import { buddyThrottle, fmt, type Mats } from './common';

const LENGTH = 15;
const REST_Y = 0.42; // bob centre height at rest
const PIVOT_Y = REST_Y + LENGTH; // 15.42 m, just under the dome top (16.2 m)
const AMPLITUDE = 2.0;
const MAX_PULL = 2.05;
const N_PEGS = 72;
const PEG_R = 2.1;
const PEG_H = 0.4;
const PEG_BASE_Y = 0.04;
const HIT_DIST = 0.17; // bob body radius at peg-top height + peg radius
const RAIL_R = 2.55;
const TRAIL_N = 220;

const LATITUDES = [
  { label: L('Stockholm 59,33° N', 'Stockholm 59.33° N'), lat: 59.33 },
  { label: L('Nordpolen 90° N', 'North Pole 90° N'), lat: 90 },
  { label: L('Ekvatorn 0°', 'Equator 0°'), lat: 0 },
  { label: L('Sydney 33,87° S', 'Sydney 33.87° S'), lat: -33.87 },
];
const LAPSES = [1, 60, 600, 3600];
const LAPSE_NOTES = [
  L('Verklig tid: planet vrider sig bara 0,2° i minuten. Ha tålamod, eller spola fram!', 'Real time: the plane turns only 0.2° a minute. Be patient, or speed things up!'),
  L('1 sekund här = 1 minut av jordens rotation.', "1 second here = 1 minute of the Earth's rotation."),
  L('1 sekund här = 10 minuter av jordens rotation.', "1 second here = 10 minutes of the Earth's rotation."),
  L('1 sekund här = 1 timme! Jorden snurrar nu så fort att banan blir en stjärnformad rosett.', "1 second here = 1 hour! The Earth now spins so fast that the path becomes a star-shaped rosette."),
];

export function buildFoucault(ctx: RoomContext, mats: Mats) {
  const g = new THREE.Group();
  g.name = 'foucault';
  ctx.group.add(g);
  const buddy = buddyThrottle(ctx.buddy);

  // ------------------------------------------------------------------ state
  const sim = new FoucaultSim(LENGTH);
  let latIndex = 0;
  let lapseIndex = 2;
  let simTime = 0; // simulated Earth seconds since the clock was reset
  let held = false;
  let dragMoved = false;
  const updateOmega = () => {
    sim.omega = OMEGA_EARTH * Math.sin((LATITUDES[latIndex].lat * Math.PI) / 180) * LAPSES[lapseIndex];
  };
  updateOmega();
  sim.release(0, AMPLITUDE); // swing north–south to start

  // ------------------------------------------------------------------ suspension, cable, bob
  const mount = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.05), new THREE.Vector2(0.1, -0.04), new THREE.Vector2(0.22, 0.06),
      new THREE.Vector2(0.06, 0.18), new THREE.Vector2(0.035, 0.25), new THREE.Vector2(0.035, 0.95), new THREE.Vector2(0, 0.95),
    ], 20),
    mats.brass,
  );
  mount.position.y = PIVOT_Y;
  g.add(mount);

  const cableGeo = new THREE.CylinderGeometry(0.009, 0.009, 1, 6, 1, true);
  cableGeo.translate(0, -0.5, 0);
  const cable = new THREE.Mesh(cableGeo, new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.4, metalness: 0.7 }));
  cable.position.set(0, PIVOT_Y, 0);
  g.add(cable);

  const bob = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.36), new THREE.Vector2(0.02, -0.34), new THREE.Vector2(0.06, -0.28),
      new THREE.Vector2(0.12, -0.19), new THREE.Vector2(0.175, -0.09), new THREE.Vector2(0.2, 0),
      new THREE.Vector2(0.19, 0.07), new THREE.Vector2(0.15, 0.14), new THREE.Vector2(0.08, 0.19),
      new THREE.Vector2(0.03, 0.22), new THREE.Vector2(0.025, 0.27), new THREE.Vector2(0, 0.27),
    ], 32),
    new THREE.MeshStandardMaterial({ color: 0xd8a65a, roughness: 0.18, metalness: 1, emissive: 0x3a2208, emissiveIntensity: 0.4 }),
  );
  g.add(bob);
  // Bigger invisible grab handle so the bob is easy to catch on a phone.
  const grab = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  bob.add(grab);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 24),
    new THREE.MeshBasicMaterial({ map: radialSpot('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.05;
  g.add(blob);

  // ------------------------------------------------------------------ peg ring, rail, inlay
  const ringBase = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(1.96, 0), new THREE.Vector2(1.96, PEG_BASE_Y), new THREE.Vector2(2.24, PEG_BASE_Y),
      new THREE.Vector2(2.24, 0),
    ], 96),
    mats.darkWood,
  );
  g.add(ringBase);

  const pegGeo = new THREE.CylinderGeometry(0.018, 0.024, PEG_H, 10);
  pegGeo.translate(0, PEG_H / 2, 0);
  const pegMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2 });
  const pegs = new THREE.InstancedMesh(pegGeo, pegMat, N_PEGS);
  const pegX = new Float32Array(N_PEGS);
  const pegZ = new Float32Array(N_PEGS);
  const pegState = new Uint8Array(N_PEGS); // 0 standing, 1 falling, 2 lying
  const pegAng = new Float32Array(N_PEGS);
  const pegVel = new Float32Array(N_PEGS);
  const pegDX = new Float32Array(N_PEGS);
  const pegDZ = new Float32Array(N_PEGS);
  const col = new THREE.Color();
  for (let k = 0; k < N_PEGS; k++) {
    const b = (k * 2 * Math.PI) / N_PEGS; // bearing, clockwise from north
    pegX[k] = Math.sin(b) * PEG_R;
    pegZ[k] = -Math.cos(b) * PEG_R;
    col.setHex(k % 18 === 0 ? 0xd94a3a : k % 2 ? 0xf3e6cc : 0xc9893f);
    pegs.setColorAt(k, col);
  }
  g.add(pegs);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const writePeg = (k: number) => {
    if (pegAng[k] === 0) q.identity();
    else {
      axis.set(pegDZ[k], 0, -pegDX[k]);
      q.setFromAxisAngle(axis, pegAng[k]);
    }
    pos.set(pegX[k], PEG_BASE_Y, pegZ[k]);
    pegs.setMatrixAt(k, m4.compose(pos, q, one));
  };
  const resetPegs = () => {
    for (let k = 0; k < N_PEGS; k++) {
      pegState[k] = 0;
      pegAng[k] = 0;
      pegVel[k] = 0;
      writePeg(k);
    }
    pegs.instanceMatrix.needsUpdate = true;
  };
  resetPegs();

  const rail = new THREE.Mesh(new THREE.TorusGeometry(RAIL_R, 0.035, 10, 120), mats.brass);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 0.82;
  g.add(rail);
  const N_POSTS = 16;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.045, 0.82, 10).translate(0, 0.41, 0), mats.darkBrass, N_POSTS);
  for (let k = 0; k < N_POSTS; k++) {
    const a = ((k + 0.5) * 2 * Math.PI) / N_POSTS;
    pos.set(Math.sin(a) * RAIL_R, 0, Math.cos(a) * RAIL_R);
    posts.setMatrixAt(k, m4.compose(pos, q.identity(), one));
  }
  g.add(posts);
  // Collider: an octagon-ish union of three boxes inside the rail.
  ctx.addCollider(0, 0, RAIL_R * 2, 2.12);
  ctx.addCollider(0, 0, 2.12, RAIL_R * 2);
  ctx.addCollider(0, 0, 3.6, 3.6);

  const inlay = buildInlay();
  g.add(inlay.mesh);

  // ------------------------------------------------------------------ trail on the floor
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailCol = new Float32Array(TRAIL_N * 3);
  for (let i = 0; i < TRAIL_N; i++) {
    const f = Math.pow(1 - i / TRAIL_N, 1.6);
    trailCol[i * 3] = 1.0 * f;
    trailCol[i * 3 + 1] = 0.72 * f;
    trailCol[i * 3 + 2] = 0.38 * f;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  trail.frustumCulled = false;
  g.add(trail);
  const resetTrail = () => {
    for (let i = 0; i < TRAIL_N; i++) {
      trailPos[i * 3] = sim.x;
      trailPos[i * 3 + 1] = 0.03;
      trailPos[i * 3 + 2] = -sim.y;
    }
    trailGeo.attributes.position.needsUpdate = true;
  };
  resetTrail();
  let trailAcc = 0;

  // ------------------------------------------------------------------ interaction: pull the bob
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55);
  ctx.interaction.add(bob, {
    label: L('Dra i pendelkulan och släpp', 'Pull the bob and let go'),
    range: 10,
    onDragStart: () => {
      held = true;
      dragMoved = false;
    },
    onDrag: (info) => {
      const p = info.onPlane(dragPlane);
      if (!p) return;
      let x = p.x;
      let n = -p.z;
      const r = Math.hypot(x, n);
      if (r > MAX_PULL) {
        x *= MAX_PULL / r;
        n *= MAX_PULL / r;
      }
      sim.x = x;
      sim.y = n;
      sim.vx = sim.vy = 0;
      dragMoved = true;
    },
    onDragEnd: () => {
      held = false;
      if (!dragMoved) return;
      sim.release(sim.x, sim.y);
      simTime = 0;
      resetTrail();
      ctx.sfx.whoosh();
      if (sim.radius < 1.8) {
        buddy.say(L(
          'Den svänger lite kort nu. Pinnarna står på 2,1 meter, så dra ut kulan nästan till räcket om du vill välta dem.',
          "That's a short swing. The pegs stand 2.1 metres out, so pull the bob almost to the rail if you want to knock them over.",
        ));
      }
    },
  });

  // ------------------------------------------------------------------ station
  let rTime: Readout | null = null;
  let rPlane: Readout | null = null;
  let rRate: Readout | null = null;
  let rPegs: Readout | null = null;
  let lapseNote: HTMLElement | null = null;
  let fallen = 0;
  let focused = false;
  const milestones = new Set<number>();

  const dirWord = (deg: number) =>
    Math.abs(deg) < 0.05 ? '' : deg > 0 ? t(L(' medurs', ' clockwise')) : t(L(' moturs', ' anticlockwise'));
  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h >= 24) return `${Math.floor(h / 24)} ${t(L('d', 'd'))} ${h % 24} h ${m} min`;
    if (h > 0) return `${h} h ${m} min`;
    return `${m} min ${sec} s`;
  };
  const refreshReadouts = () => {
    rTime?.set(formatTime(simTime));
    const deg = (sim.planeAngle * 180) / Math.PI;
    rPlane?.set(`${fmt(Math.abs(deg), 1)}°${dirWord(deg)}`);
    const rate = precessionDegPerHour(LATITUDES[latIndex].lat);
    rRate?.set(`${fmt(Math.abs(rate), 2)} °/h${dirWord(rate)}`);
    rPegs?.set(`${fallen} / ${N_PEGS}`);
  };

  const clearAll = () => {
    resetPegs();
    fallen = 0;
    milestones.clear();
    simTime = 0;
    sim.planeAngle = 0;
    resetTrail();
  };

  ctx.addStation({
    id: 'foucault',
    title: L('Foucaults pendel', "Foucault's pendulum"),
    position: [0, 0],
    viewpoint: { position: [0, 1.75, 4.2], target: [0.45, 0.5, 0] },
    intro: L(
      'Den här pendeln bevisar att jorden snurrar, helt utan teleskop. Se hur den välter pinnarna, en efter en!',
      'This pendulum proves that the Earth spins, no telescope needed. Watch it knock over the pegs, one by one!',
    ),
    howTo: L(
      'Dra i mässingskulan och släpp den för att starta en ny sväng. Spola fram tiden och byt plats på jordklotet. Håll koll på vilket håll svängplanet vrider sig.',
      'Pull the brass bob and let go to start a new swing. Speed up time and move around the globe. Watch which way the swing plane turns.',
    ),
    science: L(
      'År 1851 hängde Léon Foucault en 67 meter lång pendel i Panthéon i Paris. En pendel fortsätter svänga i samma riktning i rymden, men jorden under den snurrar ett varv på 23,93 timmar. Här hemma ser det därför ut som att pendeln vrider sig, fast det egentligen är golvet som vrids. Det kallas Corioliseffekten. Takten beror på var du står: 15,04° i timmen gånger sinus för latituden. I Stockholm blir det 12,94° i timmen, medurs. Vid nordpolen går det ett helt varv per dygn, vid ekvatorn står planet stilla och söder om ekvatorn vrider det sig moturs. Den här pendeln är 15 meter lång och svänger fram och tillbaka på 7,8 sekunder (T = 2π√(L/g)). Simuleringen löser rörelseekvationerna i jordens roterande system men använder småvinkelapproximationen, och tidsförloppet snabbar bara upp jordens rotation, inte svängningen.',
      "In 1851 Léon Foucault hung a 67-metre pendulum in the Panthéon in Paris. A pendulum keeps swinging in the same direction in space, but the Earth beneath it turns once every 23.93 hours. To us it looks as if the pendulum turns, but it is really the floor that turns. This is the Coriolis effect. The rate depends on where you stand: 15.04° per hour times the sine of the latitude. In Stockholm that is 12.94° per hour, clockwise. At the North Pole it makes a full turn per day, at the equator the plane stays put, and south of the equator it turns anticlockwise. This pendulum is 15 metres long and swings back and forth in 7.8 seconds (T = 2π√(L/g)). The simulation solves the equations of motion in Earth's rotating frame using the small-angle approximation, and the time-lapse speeds up only the Earth's rotation, not the swing.",
    ),
    wow: L(
      'Eftersom kulan svänger åt två håll har den vält alla 72 pinnar när planet vridit sig ett halvt varv, 180°. I Stockholm tar det 13,9 timmar.',
      'Because the bob swings both ways, it has knocked over all 72 pegs once the plane has turned half a lap, 180°. In Stockholm that takes 13.9 hours.',
    ),
    onFocus: () => {
      focused = true;
    },
    onBlur: () => {
      focused = false;
    },
    controls: (panel) => {
      panel.heading(L('Tidsförlopp', 'Time-lapse'));
      panel.buttons(
        LAPSES.map((f) => ({
          label: L(`${f.toLocaleString('sv-SE')}×`, `${f.toLocaleString('en-GB')}×`),
          onClick: () => {
            lapseIndex = LAPSES.indexOf(f);
            updateOmega();
            if (lapseNote) lapseNote.textContent = t(LAPSE_NOTES[lapseIndex]);
          },
        })),
        lapseIndex,
      );
      lapseNote = panel.note(LAPSE_NOTES[lapseIndex]);
      panel.heading(L('Var på jorden?', 'Where on Earth?'));
      panel.buttons(
        LATITUDES.map((la, i) => ({
          label: la.label,
          onClick: () => {
            latIndex = i;
            updateOmega();
            refreshReadouts();
            if (la.lat === 0) {
              buddy.say(L(
                'Vid ekvatorn vrider sig inte golvet under pendeln alls, så svängplanet står still.',
                "At the equator the floor doesn't twist under the pendulum at all, so the swing plane stays put.",
              ));
            } else if (la.lat < 0) {
              buddy.say(L(
                'I Sydney vrider sig planet åt andra hållet, moturs, och lite långsammare: 8,38° i timmen.',
                'In Sydney the plane turns the other way, anticlockwise, and a bit slower: 8.38° per hour.',
              ));
            } else if (la.lat === 90) {
              buddy.say(L(
                'På nordpolen snurrar jorden rakt under pendeln: ett helt varv på 23 timmar och 56 minuter.',
                'At the North Pole the Earth turns right under the pendulum: one full turn in 23 hours and 56 minutes.',
              ));
            }
          },
        })),
        latIndex,
      );
      rTime = panel.readout(L('Simulerad tid', 'Simulated time'));
      rPlane = panel.readout(L('Svängplanet har vridit sig', 'Swing plane has turned'));
      rRate = panel.readout(L('Teoretisk takt', 'Theoretical rate'));
      rPegs = panel.readout(L('Välta pinnar', 'Pegs knocked over'));
      refreshReadouts();
      panel.button(L('Ställ upp pinnarna igen', 'Stand the pegs up again'), () => {
        clearAll();
        ctx.sfx.pop();
        refreshReadouts();
      }, { primary: true, icon: '↺' });
      panel.button(L('Starta om svängningen', 'Restart the swing'), () => {
        const b = Math.atan2(sim.x, sim.y);
        sim.release(Math.sin(b) * AMPLITUDE, Math.cos(b) * AMPLITUDE);
        clearAll();
        ctx.sfx.whoosh();
        refreshReadouts();
      }, { icon: '🔁' });
      return () => {
        rTime = rPlane = rRate = rPegs = null;
        lapseNote = null;
      };
    },
  });

  // ------------------------------------------------------------------ per-frame
  const camPos = new THREE.Vector3();
  const up = new THREE.Vector3(0, -1, 0);
  const cableDir = new THREE.Vector3();
  let readoutAcc = 0;

  const knock = (k: number, vx: number, vz: number) => {
    pegState[k] = 1;
    const sp = Math.hypot(vx, vz);
    if (sp > 0.05) {
      pegDX[k] = vx / sp;
      pegDZ[k] = vz / sp;
    } else {
      pegDX[k] = pegX[k] / PEG_R;
      pegDZ[k] = pegZ[k] / PEG_R;
    }
    pegVel[k] = 0.6 + sp * 2.2;
    pegAng[k] = 0.001;
    fallen++;
    ctx.camera.getWorldPosition(camPos);
    const near = focused || Math.hypot(camPos.x, camPos.z) < 6;
    const vol = 1 / (1 + camPos.distanceTo(pos.set(pegX[k], 0.3, pegZ[k])) / 4);
    ctx.sfx.noise(0.05, { freq: 3400, q: 2.5, gain: 0.16 * vol });
    ctx.sfx.tone(2100 + Math.random() * 500, 0.03, { type: 'square', gain: 0.05 * vol });
    if (!near) {
      // Buddy only comments when the visitor is watching.
    } else if (fallen === 1 && !milestones.has(1)) {
      milestones.add(1);
      buddy.say(L('Klick! Där föll en pinne. Det är jorden som har vridit sig under pendeln.', 'Click! A peg fell. That was the Earth turning under the pendulum.'));
    } else if (fallen >= N_PEGS / 2 && !milestones.has(36)) {
      milestones.add(36);
      buddy.celebrate(L('Halva ringen är vält! Svängplanet har vridit sig 90°.', 'Half the ring is down! The swing plane has turned 90°.'));
    } else if (fallen === N_PEGS && !milestones.has(72)) {
      milestones.add(72);
      buddy.celebrate(L('Alla 72 pinnar ligger! Planet har vridit sig ett halvt varv.', 'All 72 pegs are down! The plane has turned half a lap.'));
    }
  };

  const tumble = (dt: number) => {
    let dirty = false;
    for (let k = 0; k < N_PEGS; k++) {
      if (pegState[k] !== 1) continue;
      // Thin rod pivoting on its base: θ̈ = (3g / 2h)·sin θ
      pegVel[k] += ((3 * 9.82) / (2 * PEG_H)) * Math.sin(pegAng[k]) * dt;
      pegAng[k] += pegVel[k] * dt;
      const land = Math.PI / 2 - 0.06;
      if (pegAng[k] >= land) {
        pegAng[k] = land;
        if (pegVel[k] > 1.2) {
          ctx.sfx.tone(520 + Math.random() * 200, 0.04, { type: 'triangle', gain: 0.03 });
          pegVel[k] *= -0.28;
        } else {
          pegVel[k] = 0;
          pegState[k] = 2;
        }
      }
      writePeg(k);
      dirty = true;
    }
    if (dirty) pegs.instanceMatrix.needsUpdate = true;
  };

  const placeBob = () => {
    const bx = sim.x;
    const bz = -sim.y;
    const r2 = bx * bx + bz * bz;
    const by = PIVOT_Y - Math.sqrt(LENGTH * LENGTH - r2);
    bob.position.set(bx, by, bz);
    cableDir.set(bx, by - PIVOT_Y, bz).normalize();
    cable.quaternion.setFromUnitVectors(up, cableDir);
    cable.scale.y = LENGTH - 0.27;
    bob.quaternion.copy(cable.quaternion);
    blob.position.x = bx;
    blob.position.z = bz;
  };
  placeBob();

  onLangChange(() => {
    inlay.redraw();
    refreshReadouts();
  });

  return {
    update(dt: number, time: number) {
      const step = Math.min(dt, 0.1);
      if (!held) {
        simTime += step * LAPSES[lapseIndex];
        const n = Math.max(1, Math.ceil(step / (1 / 120)));
        const h = step / n;
        for (let s = 0; s < n; s++) {
          sim.step(h);
          // Pegs near the bob
          const bx = sim.x;
          const bz = -sim.y;
          if (bx * bx + bz * bz > (PEG_R - HIT_DIST) ** 2) {
            for (let k = 0; k < N_PEGS; k++) {
              if (pegState[k] !== 0) continue;
              const dx = pegX[k] - bx;
              const dz = pegZ[k] - bz;
              if (dx * dx + dz * dz < HIT_DIST * HIT_DIST) knock(k, sim.vx, -sim.vy);
            }
          }
        }
      }
      placeBob();
      tumble(step);

      trailAcc += step;
      if (trailAcc > 0.04) {
        trailAcc = 0;
        trailPos.copyWithin(3, 0, (TRAIL_N - 1) * 3);
        trailPos[0] = sim.x;
        trailPos[1] = 0.03;
        trailPos[2] = -sim.y;
        trailGeo.attributes.position.needsUpdate = true;
      }
      (bob.material as THREE.MeshStandardMaterial).emissiveIntensity = held ? 1.2 : 0.35 + 0.1 * Math.sin(time * 2);

      readoutAcc += dt;
      if (readoutAcc > 0.2 && rTime) {
        readoutAcc = 0;
        refreshReadouts();
      }
    },
  };
}

/** Brass compass rose and degree scale inlaid in the floor around the pendulum (one textured disc). */
function buildInlay() {
  const R = 4.25;
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const px = S / 2 / R; // pixels per metre
  const cx = S / 2;
  const brass = '#d6a85c';
  const brassDark = '#9a6c2c';
  const font = '"Baloo 2", "Nunito", system-ui, sans-serif';

  const ring = (r: number, w: number, color = brass) => {
    g.strokeStyle = color;
    g.lineWidth = w * px;
    g.beginPath();
    g.arc(cx, cx, r * px, 0, Math.PI * 2);
    g.stroke();
  };
  // bearing b (clockwise from north) → canvas point; north is up in the canvas.
  const at = (r: number, b: number): [number, number] => [cx + Math.sin(b) * r * px, cx - Math.cos(b) * r * px];

  const arcText = (text: string, r: number, centre: number, size: number) => {
    g.font = `700 ${size}px ${font}`;
    g.fillStyle = brass;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const spacing = size * 0.12;
    const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0);
    // Read from outside: characters run with decreasing bearing, tops towards the centre.
    let b = centre + total / 2 / (r * px);
    [...text].forEach((ch, i) => {
      const w = widths[i];
      const bc = b - w / 2 / (r * px);
      const [x, y] = at(r, bc);
      g.save();
      g.translate(x, y);
      g.rotate(bc + Math.PI);
      g.fillText(ch, 0, 0);
      g.restore();
      b -= w / (r * px);
    });
  };

  const redraw = () => {
    g.clearRect(0, 0, S, S);
    // Darker wooden field inside the rail.
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, 2.45 * px);
    grad.addColorStop(0, 'rgba(40,22,12,0.55)');
    grad.addColorStop(1, 'rgba(40,22,12,0.25)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, 2.45 * px, 0, Math.PI * 2);
    g.fill();
    // Degree scale, one tick per peg (5°), long ticks every 15°.
    g.strokeStyle = brass;
    for (let k = 0; k < 72; k++) {
      const b = (k * Math.PI) / 36;
      const long = k % 3 === 0;
      const [x0, y0] = at(long ? 1.6 : 1.72, b);
      const [x1, y1] = at(1.86, b);
      g.lineWidth = (long ? 0.022 : 0.012) * px;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    ring(1.88, 0.02);
    // Compass rose: 8 points, two-tone brass.
    for (let k = 0; k < 8; k++) {
      const b = (k * Math.PI) / 4;
      const len = k % 2 === 0 ? 1.5 : 0.85;
      const wid = k % 2 === 0 ? 0.2 : 0.14;
      const tip = at(len, b);
      const l = at(wid, b - Math.PI / 4);
      const rr = at(wid, b + Math.PI / 4);
      g.fillStyle = brass;
      g.beginPath();
      g.moveTo(cx, cx);
      g.lineTo(...l);
      g.lineTo(...tip);
      g.closePath();
      g.fill();
      g.fillStyle = brassDark;
      g.beginPath();
      g.moveTo(cx, cx);
      g.lineTo(...rr);
      g.lineTo(...tip);
      g.closePath();
      g.fill();
    }
    ring(0.12, 0.05);
    // Outer bands and the letters N Ö S V (Swedish: Norr, Öster, Söder, Väster).
    ring(2.95, 0.03);
    ring(3.05, 0.012);
    ring(3.75, 0.012);
    ring(3.83, 0.03);
    ring(4.18, 0.03);
    g.font = `800 ${Math.round(0.42 * px)}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    (['N', 'Ö', 'S', 'V'] as const).forEach((ch, i) => {
      const b = (i * Math.PI) / 2;
      const [x, y] = at(3.4, b);
      g.save();
      g.translate(x, y);
      g.rotate(b + Math.PI);
      g.fillStyle = i === 0 ? '#e0563f' : brass;
      g.fillText(ch, 0, 0);
      g.restore();
    });
    // Small diamonds between the letters
    for (let k = 0; k < 4; k++) {
      const [x, y] = at(3.4, Math.PI / 4 + (k * Math.PI) / 2);
      g.fillStyle = brassDark;
      g.beginPath();
      g.arc(x, y, 0.06 * px, 0, Math.PI * 2);
      g.fill();
    }
    const sv = getLang() === 'sv';
    arcText(sv ? 'FOUCAULTS PENDEL · PARIS 1851' : "FOUCAULT'S PENDULUM · PARIS 1851", 4.0, Math.PI, Math.round(0.2 * px));
    arcText(sv ? 'JORDEN SNURRAR UNDER PENDELN' : 'THE EARTH TURNS UNDER THE PENDULUM', 4.0, 0, Math.round(0.2 * px));
    tex.needsUpdate = true;
  };
  redraw();

  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(R, 96),
    new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0.35,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  return { mesh, redraw };
}
