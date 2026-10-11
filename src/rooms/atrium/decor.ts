/**
 * Atrium decor: potted plants, round benches, floor lamps, Buddy's charging dock and
 * floating sculptures under the dome (DNA, atom, Saturn). Everything repeated is instanced.
 * All floor items sit at the angular midpoints between corridor mouths, clear of the mouths.
 */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import { radialSpot } from '../../core/textures';
import type { RoomContext } from '../../core/types';
import { polar, type Mats } from './common';

/** Angular midpoints between the seven corridor mouths (degrees). */
const MIDS = [0, 1, 2, 3, 4, 5, 6].map((i) => ((i + 0.5) * 360) / 7);
const BUDDY_ANGLE = MIDS[0]; // 25.7°, mirrors the welcome desk on the other side of the spawn

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** A leaf: a bent, tapered grid (length along +y, droops towards +z). */
function leafGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 4, 8);
  geo.translate(0, 0.5, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i);
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.95 + 0.03)), 0.75) * 0.42;
    const x = p.getX(i) * w * 2 * 0.5;
    p.setXYZ(i, x, v, 0.32 * v * v + 0.5 * Math.abs(x));
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildDecor(ctx: RoomContext, mats: Mats) {
  const g = new THREE.Group();
  g.name = 'atrium-decor';
  ctx.group.add(g);
  const rand = rng(1851);
  const updaters: ((dt: number, time: number) => void)[] = [];

  // ------------------------------------------------------------------ plants
  const plantSpots = MIDS.map((m) => polar(10.65, m - 4.5));
  const N_PLANTS = plantSpots.length;
  const STEMS = 7;
  const LEAVES_PER = 3;
  const pots = new THREE.InstancedMesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.36, 0.08), new THREE.Vector2(0.44, 0.62),
      new THREE.Vector2(0.47, 0.66), new THREE.Vector2(0.47, 0.72), new THREE.Vector2(0.42, 0.72), new THREE.Vector2(0.41, 0.66),
    ], 28),
    new THREE.MeshStandardMaterial({ color: 0xb8643c, roughness: 0.75 }),
    N_PLANTS,
  );
  const soil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.41, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 1 }), N_PLANTS);
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.02, 1, 5).translate(0, 0.5, 0);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 0.8 }), N_PLANTS * STEMS);
  const leaves = new THREE.InstancedMesh(
    leafGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }),
    N_PLANTS * STEMS * LEAVES_PER,
  );
  const leafCol = new THREE.Color();
  let si = 0;
  let li = 0;
  plantSpots.forEach(([x, z], pi) => {
    _m.makeTranslation(x, 0, z);
    pots.setMatrixAt(pi, _m);
    _m.makeTranslation(x, 0.66, z);
    soil.setMatrixAt(pi, _m);
    ctx.addCollider(x, z, 0.95, 0.95);
    const tall = pi % 2 === 0 ? 1.35 : 1;
    for (let k = 0; k < STEMS; k++) {
      let yaw = (k / STEMS) * Math.PI * 2 + rand() * 0.6;
      const lean = 0.15 + rand() * 0.4;
      const len = (1.0 + rand() * 1.0) * tall;
      const dir = _p.set(Math.sin(yaw) * Math.sin(lean), Math.cos(lean), Math.cos(yaw) * Math.sin(lean));
      // Keep foliage off the wall: mirror stems that lean outwards back towards the room.
      const ux = x / Math.hypot(x, z);
      const uz = z / Math.hypot(x, z);
      const dr = dir.x * ux + dir.z * uz;
      if (dr > 0) {
        dir.x -= 2 * dr * ux;
        dir.z -= 2 * dr * uz;
        yaw = Math.atan2(dir.x, dir.z);
      }
      dir.normalize();
      _q.setFromUnitVectors(UP, dir);
      const base = new THREE.Vector3(x + dir.x * 0.05, 0.66, z + dir.z * 0.05);
      _m.compose(base, _q, _s.set(1, len, 1));
      stems.setMatrixAt(si++, _m);
      for (let j = 0; j < LEAVES_PER; j++) {
        const f = j === 0 ? 1 : 0.55 + rand() * 0.2;
        const tip = base.clone().addScaledVector(dir, len * f);
        const size = (j === 0 ? 0.75 : 0.55) * (0.8 + rand() * 0.4) * (tall > 1 ? 1.1 : 1);
        _e.set(0.5 + rand() * 0.6, yaw + (j ? 1.4 * (rand() - 0.5) : 0), 0, 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(tip, _q, _s.set(size * 0.9, size, size));
        leaves.setMatrixAt(li, _m);
        leafCol.setHSL(0.27 + rand() * 0.07, 0.45 + rand() * 0.2, 0.22 + rand() * 0.1);
        leaves.setColorAt(li, leafCol);
        li++;
      }
    }
  });
  g.add(pots, soil, stems, leaves);

  // ------------------------------------------------------------------ floor lamps and light pools
  const lampSpots = MIDS.map((m) => polar(10.8, m + 4.5));
  const N_LAMPS = lampSpots.length;
  const lampBase = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 20).translate(0, 0.025, 0), mats.darkBrass, N_LAMPS);
  const lampPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 8).translate(0, 0.75, 0), mats.brass, N_LAMPS);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d8, emissive: 0xffa652, emissiveIntensity: 1.1, roughness: 0.9, side: THREE.DoubleSide,
  });
  const lampShade = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 0.34, 24, 1, true).translate(0, 1.6, 0), shadeMat, N_LAMPS);
  const pools = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: radialSpot('rgba(255,190,120,1)', 'rgba(255,190,120,0)'), transparent: true, opacity: 0.2,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    N_LAMPS,
  );
  lampSpots.forEach(([x, z], i) => {
    _m.makeTranslation(x, 0, z);
    lampBase.setMatrixAt(i, _m);
    lampPole.setMatrixAt(i, _m);
    lampShade.setMatrixAt(i, _m);
    // Pool shifted a little towards the room so it isn't half inside the wall.
    const [px, pz] = polar(10.2, MIDS[i] + 4.5);
    _m.makeTranslation(px, 0.011 + i * 0.0005, pz);
    pools.setMatrixAt(i, _m);
    ctx.addCollider(x, z, 0.5, 0.5);
  });
  g.add(lampBase, lampPole, lampShade, pools);
  updaters.push((_dt, time) => {
    shadeMat.emissiveIntensity = 1.05 + 0.05 * Math.sin(time * 0.7);
  });

  // ------------------------------------------------------------------ round benches
  const benchAngles = [MIDS[1], MIDS[2], MIDS[3], MIDS[4], MIDS[5]];
  const N_B = benchAngles.length;
  const seat = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 40).translate(0, 0.45, 0), mats.wood, N_B);
  const pedestal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.55, 0.4, 28).translate(0, 0.2, 0), mats.darkWood, N_B);
  const trim = new THREE.InstancedMesh(new THREE.TorusGeometry(0.78, 0.022, 8, 48).rotateX(Math.PI / 2).translate(0, 0.45, 0), mats.brass, N_B);
  benchAngles.forEach((a, i) => {
    const [x, z] = polar(6.7, a);
    _m.makeTranslation(x, 0, z);
    seat.setMatrixAt(i, _m);
    pedestal.setMatrixAt(i, _m);
    trim.setMatrixAt(i, _m);
    ctx.addCollider(x, z, 1.5, 1.5);
  });
  g.add(seat, pedestal, trim);

  // ------------------------------------------------------------------ Buddy's charging dock (decor)
  const [bx, bz] = polar(7.0, BUDDY_ANGLE);
  const dock = new THREE.Group();
  dock.position.set(bx, 0, bz);
  dock.rotation.y = Math.atan2(-bx, -bz); // text reads from the centre of the atrium
  g.add(dock);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.68, 0.06, 40).translate(0, 0.03, 0),
    new THREE.MeshStandardMaterial({ color: 0x2a2b38, roughness: 0.35, metalness: 0.6 }),
  );
  dock.add(pad);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5ee6d6, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.022, 8, 64).rotateX(Math.PI / 2), ringMat);
  ring.position.y = 0.065;
  dock.add(ring);
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = labelCanvas.height = 512;
  const lg = labelCanvas.getContext('2d')!;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const drawLabel = () => {
    lg.clearRect(0, 0, 512, 512);
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.shadowColor = '#5ee6d6';
    lg.shadowBlur = 24;
    lg.fillStyle = '#dffcf8';
    lg.font = '800 150px "Baloo 2", "Nunito", system-ui, sans-serif';
    lg.fillText('Buddy', 256, 230);
    lg.font = '600 52px "Baloo 2", "Nunito", system-ui, sans-serif';
    lg.fillText(`⚡ ${t(L('laddplats', 'charging dock'))}`, 256, 350);
    labelTex.needsUpdate = true;
  };
  drawLabel();
  onLangChange(drawLabel);
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  label.position.y = 0.064;
  dock.add(label);
  updaters.push((_dt, time) => {
    const k = 0.55 + 0.45 * Math.sin(time * 1.6);
    ringMat.color.setRGB(0.37 * (0.5 + k), 0.9 * (0.5 + k), 0.84 * (0.5 + k));
  });

  // ------------------------------------------------------------------ floating sculptures under the dome
  const domeY = (r: number) => 9 + 0.6 * Math.sqrt(144 - r * r);
  const cablePts: number[] = [];
  const hang = (x: number, topY: number, z: number) => {
    const r = Math.hypot(x, z);
    cablePts.push(x, topY, z, x, domeY(r) - 0.05, z);
  };
  const glow = (hex: number) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });

  // DNA double helix
  {
    const [x, z] = polar(6.2, 196);
    const dna = new THREE.Group();
    dna.position.set(x, 11.2, z);
    g.add(dna);
    const N = 22;
    const H = 3.2;
    const R = 0.42;
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 12, 8), mats.brass, N * 2);
    const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x222222 }), N);
    const pairCols = [0xff6f61, 0x4fd1ff, 0x7cff6b, 0xffc23d];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const y = -H / 2 + (i * H) / (N - 1);
      const a = i * 0.55;
      const p1 = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
      const p2 = new THREE.Vector3(-Math.cos(a) * R, y, -Math.sin(a) * R);
      beads.setMatrixAt(i * 2, _m.makeTranslation(p1));
      beads.setMatrixAt(i * 2 + 1, _m.makeTranslation(p2));
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      _q.setFromUnitVectors(UP, p2.clone().sub(p1).normalize());
      rungs.setMatrixAt(i, _m.compose(mid, _q, _s.set(1, R * 2 - 0.1, 1)));
      rungs.setColorAt(i, c.setHex(pairCols[i % 4]));
    }
    dna.add(beads, rungs);
    hang(x, 11.2 + H / 2, z);
    updaters.push((dt) => {
      dna.rotation.y += dt * 0.25;
    });
  }

  // Atom with three orbiting electrons
  {
    const [x, z] = polar(6.6, 100);
    const atom = new THREE.Group();
    atom.position.set(x, 11.4, z);
    g.add(atom);
    const nuc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x331100 }), 7);
    const c = new THREE.Color();
    const offs = [[0, 0, 0], [0.16, 0.05, 0], [-0.1, 0.12, 0.08], [0.02, -0.14, 0.1], [-0.08, -0.04, -0.15], [0.1, 0.1, -0.12], [-0.15, 0.02, 0.12]];
    offs.forEach(([ox, oy, oz], i) => {
      nuc.setMatrixAt(i, _m.makeTranslation(ox, oy, oz));
      nuc.setColorAt(i, c.setHex(i % 2 ? 0xd94a3a : 0x9aa4b8));
    });
    atom.add(nuc);
    const ORB = 1.0;
    const tilts = [
      new THREE.Euler(Math.PI / 2, 0, 0),
      new THREE.Euler(Math.PI / 2 + Math.PI / 3, 0.3, 0),
      new THREE.Euler(Math.PI / 2 - Math.PI / 3, -0.3, 0),
    ];
    const orbitQ = tilts.map((e) => new THREE.Quaternion().setFromEuler(e));
    const orbits = new THREE.InstancedMesh(new THREE.TorusGeometry(ORB, 0.01, 6, 80), glow(0x8fd8ff), 3);
    orbitQ.forEach((oq, i) => orbits.setMatrixAt(i, _m.compose(_p.set(0, 0, 0), oq, _s.set(1, 1, 1))));
    atom.add(orbits);
    const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 12, 8), glow(0x9fe8ff), 3);
    electrons.frustumCulled = false;
    atom.add(electrons);
    const ev = new THREE.Vector3();
    updaters.push((_dt, time) => {
      for (let i = 0; i < 3; i++) {
        const a = time * (1.6 + i * 0.35) + i * 2.1;
        ev.set(Math.cos(a) * ORB, Math.sin(a) * ORB, 0).applyQuaternion(orbitQ[i]);
        electrons.setMatrixAt(i, _m.makeTranslation(ev));
      }
      electrons.instanceMatrix.needsUpdate = true;
      atom.rotation.y = time * 0.15;
    });
    hang(x, 11.4 + 0.2, z);
  }

  // Saturn with its rings
  {
    const [x, z] = polar(6.6, 292);
    const sat = new THREE.Group();
    sat.position.set(x, 11.8, z);
    sat.rotation.z = (26.7 * Math.PI) / 180; // Saturn's axial tilt
    g.add(sat);
    const bands = document.createElement('canvas');
    bands.width = 64;
    bands.height = 256;
    const bg = bands.getContext('2d')!;
    for (let y = 0; y < 256; y += 4) {
      const l = 62 + 10 * Math.sin(y * 0.11) + 5 * Math.sin(y * 0.37);
      bg.fillStyle = `hsl(38, 45%, ${l}%)`;
      bg.fillRect(0, y, 64, 4);
    }
    const bandTex = new THREE.CanvasTexture(bands);
    bandTex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.8, emissive: 0x2a1d0a }));
    sat.add(planet);
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 256;
    ringCanvas.height = 4;
    const rg = ringCanvas.getContext('2d')!;
    for (let i = 0; i < 256; i++) {
      const cassini = i > 150 && i < 165; // the Cassini division
      const a = cassini ? 0.05 : 0.35 + 0.5 * Math.abs(Math.sin(i * 0.09)) * (i / 256 + 0.4);
      rg.fillStyle = `rgba(230,205,160,${Math.min(0.95, a)})`;
      rg.fillRect(i, 0, 1, 4);
    }
    const ringTex = new THREE.CanvasTexture(ringCanvas);
    ringTex.colorSpace = THREE.SRGBColorSpace;
    const ringGeo = new THREE.RingGeometry(0.75, 1.35, 64, 1);
    // Map u radially across the ring.
    const rp = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    for (let i = 0; i < rp.count; i++) {
      const r = Math.hypot(rp.getX(i), rp.getY(i));
      uv.setXY(i, (r - 0.75) / 0.6, 0.5);
    }
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9, emissive: 0x1a140a }),
    );
    ringMesh.rotation.x = -Math.PI / 2;
    sat.add(ringMesh);
    hang(x, 11.8 + 0.55, z);
    updaters.push((dt) => {
      planet.rotation.y += dt * 0.3;
    });
  }

  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  g.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x9a8a70, transparent: true, opacity: 0.6 })));

  return {
    update(dt: number, time: number) {
      for (const u of updaters) u(dt, time);
    },
  };
}
