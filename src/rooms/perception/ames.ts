/**
 * Station 2: the Ames room, built to the true geometry.
 *
 * We start from a virtual rectangular room in front of the peephole (eye at the origin, looking down -z) and
 * move every point along its own sight line from the eye: P_real = P / (n·P + c). That map is a central
 * projective transformation (a homology with centre at the eye), so straight lines stay straight, planes stay
 * planes, and every point lands on the same ray it had before: from the peephole the real room projects to
 * exactly the same image as the rectangular one. Here 1/s = nx·x + c, chosen so the far left corner is pushed
 * to 1.6× its distance and the far right corner pulled in to 0.7×.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import { ACCENT, type BuddyGate, approach, canvasPlane, fmt, mats, mesh, rbox, smooth } from './common';

// Virtual (perceived) room, relative to the eye.
const VX = 1.3; // half width
const Y0 = -0.9; // floor below the eye
const Y1 = 0.7; // ceiling above the eye
const ZF = -1.7; // front opening
const ZB = -2.9; // back wall
const S_LEFT = 1.6; // far-left corner pushed back
const S_RIGHT = 0.7; // far-right corner pulled forward
const NX = (1 / S_RIGHT - 1 / S_LEFT) / (2 * VX);
const C0 = (1 / S_RIGHT + 1 / S_LEFT) / 2;
const scaleAt = (vx: number) => 1 / (NX * vx + C0);
const FACADE = 0.25; // distance from the eye to the peephole wall's front face
const DOLL_H = 0.6;

/** Virtual point (relative to eye) -> real point (relative to eye). */
function warp(v: THREE.Vector3, out = new THREE.Vector3()) {
  return out.copy(v).multiplyScalar(scaleAt(v.x));
}

export function buildAmes(ctx: RoomContext, buddy: BuddyGate, eye: THREE.Vector3Tuple, stationPos: [number, number]) {
  const E = new THREE.Vector3(...eye);
  const root = new THREE.Group();
  root.position.copy(E);
  ctx.group.add(root);

  // ---------------------------------------------------------------- the distorted room (unlit, so no shading gives depth away)
  const roomMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const vCentre = new THREE.Vector3(0, (Y0 + Y1) / 2, (ZF + ZB) / 2);
  const rCentre = warp(vCentre);

  type CellColour = (i: number, j: number) => number;
  function face(p00: THREE.Vector3, p10: THREE.Vector3, p01: THREE.Vector3, nu: number, nv: number, colour: CellColour) {
    const pos: number[] = [];
    const col: number[] = [];
    const du = p10.clone().sub(p00);
    const dv = p01.clone().sub(p00);
    const at = (u: number, v: number) => warp(p00.clone().addScaledVector(du, u / nu).addScaledVector(dv, v / nv));
    const c = new THREE.Color();
    const n = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        c.setHex(colour(i, j), THREE.SRGBColorSpace);
        const a = at(i, j), b = at(i + 1, j), d = at(i, j + 1), e = at(i + 1, j + 1);
        for (const tri of [[a, b, e], [a, e, d]]) {
          // Wind every triangle to face the inside of the room, so the outside is see-through (back-face culled).
          e1.subVectors(tri[1], tri[0]);
          e2.subVectors(tri[2], tri[0]);
          n.crossVectors(e1, e2);
          const inward = rCentre.clone().sub(tri[0]);
          const order = n.dot(inward) > 0 ? [0, 1, 2] : [0, 2, 1];
          for (const k of order) {
            pos.push(tri[k].x, tri[k].y, tri[k].z);
            col.push(c.r, c.g, c.b);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const geos = [
    // floor: classic checkerboard (8 × 4)
    face(V(-VX, Y0, ZF), V(VX, Y0, ZF), V(-VX, Y0, ZB), 8, 4, (i, j) => ((i + j) % 2 ? 0x3a2a26 : 0xd9c9aa)),
    // back wall: striped wallpaper with two windows
    face(V(-VX, Y0, ZB), V(VX, Y0, ZB), V(-VX, Y1, ZB), 10, 8, (i, j) => {
      const win = (i === 2 || i === 3 || i === 6 || i === 7) && j >= 3 && j <= 5;
      if (win) return j === 5 ? 0xa8d4ee : 0x86bede;
      if (j === 0) return 0x5b3a26;
      return i % 2 ? 0xb88a5e : 0xc99c6c;
    }),
    // side walls
    face(V(-VX, Y0, ZF), V(-VX, Y0, ZB), V(-VX, Y1, ZF), 4, 8, (i, j) => (j === 0 ? 0x5b3a26 : i % 2 ? 0xa97c54 : 0xb88a60)),
    face(V(VX, Y0, ZF), V(VX, Y0, ZB), V(VX, Y1, ZF), 4, 8, (i, j) => (j === 0 ? 0x5b3a26 : i % 2 ? 0xa97c54 : 0xb88a60)),
    // ceiling
    face(V(-VX, Y1, ZF), V(VX, Y1, ZF), V(-VX, Y1, ZB), 8, 4, (i, j) => ((i + j) % 2 ? 0xd8ccb6 : 0xcfc2aa)),
  ];
  for (const g of geos) root.add(new THREE.Mesh(g, roomMat));

  // ---------------------------------------------------------------- cabinet + peephole wall
  const realX0 = -VX * S_LEFT - 0.27; // cabinet inner extents (relative to eye)
  const realX1 = VX * scaleAt(VX) + 0.22;
  const backZ = ZB * S_LEFT - 0.26;
  const CAB_H = 2.7;
  const cab = new THREE.Group();
  cab.position.set(0, -E.y, 0); // cabinet built from the floor up
  root.add(cab);
  const wall = (x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = CAB_H) => {
    const m = mesh(rbox(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), 0.02), mats.wood, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, cab);
    return m;
  };
  const fz = -FACADE - 0.03; // facade centre plane (front face at -FACADE)
  wall(realX0 - 0.08, realX0, fz, backZ - 0.08);
  wall(realX1, realX1 + 0.08, fz, backZ - 0.08);
  wall(realX0 - 0.08, realX1 + 0.08, backZ - 0.08, backZ);
  // facade with the viewing slot = the virtual front opening projected onto the facade plane
  const k = FACADE / -ZF;
  const hx = VX * k * 0.985;
  const hy0 = Y0 * k * 0.985 + E.y;
  const hy1 = Y1 * k * 0.985 + E.y;
  const FX0 = realX0 - 0.35;
  const FX1 = realX1 + 0.9;
  wall(FX0, -hx, fz + 0.03, fz - 0.03);
  wall(hx, FX1, fz + 0.03, fz - 0.03);
  wall(-hx, hx, fz + 0.03, fz - 0.03, 0, hy0);
  wall(-hx, hx, fz + 0.03, fz - 0.03, hy1, CAB_H);
  // black hood around the slot (frames the view like a real peephole) and a brass rim
  const hood = new THREE.MeshStandardMaterial({ color: 0x0c0a0c, roughness: 1, side: THREE.DoubleSide });
  const hd = 0.11;
  const hz = -FACADE + hd / 2;
  mesh(new THREE.BoxGeometry(2 * hx + 0.04, 0.01, hd), hood, 0, hy1 + 0.005, hz, cab);
  mesh(new THREE.BoxGeometry(2 * hx + 0.04, 0.01, hd), hood, 0, hy0 - 0.005, hz, cab);
  mesh(new THREE.BoxGeometry(0.01, hy1 - hy0, hd), hood, -hx - 0.005, (hy0 + hy1) / 2, hz, cab);
  mesh(new THREE.BoxGeometry(0.01, hy1 - hy0, hd), hood, hx + 0.005, (hy0 + hy1) / 2, hz, cab);
  const rimZ = -FACADE + hd;
  mesh(new THREE.BoxGeometry(2 * hx + 0.08, 0.03, 0.02), mats.brass, 0, hy1 + 0.02, rimZ, cab);
  mesh(new THREE.BoxGeometry(2 * hx + 0.08, 0.03, 0.02), mats.brass, 0, hy0 - 0.02, rimZ, cab);
  mesh(new THREE.BoxGeometry(0.03, hy1 - hy0 + 0.07, 0.02), mats.brass, -hx - 0.02, (hy0 + hy1) / 2, rimZ, cab);
  mesh(new THREE.BoxGeometry(0.03, hy1 - hy0 + 0.07, 0.02), mats.brass, hx + 0.02, (hy0 + hy1) / 2, rimZ, cab);
  // a step and signs
  mesh(rbox(0.7, 0.16, 0.4, 0.03), mats.darkWood, 0, 0.08, -FACADE + 0.3, cab);
  const title = canvasPlane(1.6, 0.36, [1024, 230], (g, W, H) => {
    g.fillStyle = '#3a2418';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9a050';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd9a8';
    g.font = '800 92px "Baloo 2", "Nunito", system-ui, sans-serif';
    g.fillText(t(L('Ames rum', 'The Ames room')), W / 2, H * 0.4);
    g.font = '700 48px "Nunito", system-ui, sans-serif';
    g.fillStyle = '#f3c99a';
    g.fillText(t(L('👁 Titta in genom springan', '👁 Look in through the slot')), W / 2, H * 0.76);
  });
  title.mesh.position.set(0, 2.25, -FACADE + 0.005);
  cab.add(title.mesh);

  const fx0 = E.x + FX0, fx1 = E.x + FX1, fzW = E.z + fz, bzW = E.z + backZ - 0.08;
  ctx.addCollider((fx0 + fx1) / 2, (fzW + bzW) / 2, fx1 - fx0, Math.abs(fzW - bzW) + 0.06);

  // ---------------------------------------------------------------- two identical robot dolls
  const dollGeo = {
    leg: new THREE.CylinderGeometry(0.035, 0.04, 0.13, 12),
    body: rbox(0.26, 0.24, 0.18, 0.06),
    head: rbox(0.25, 0.2, 0.2, 0.07),
    eye: new THREE.SphereGeometry(0.028, 16, 8),
    ant: new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6),
    bulb: new THREE.SphereGeometry(0.025, 12, 8),
  };
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbff8ff).multiplyScalar(1.5) });
  function makeDoll(color: number) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: color, emissiveIntensity: 0.22 });
    const d = new THREE.Group();
    const inner = new THREE.Group();
    d.add(inner);
    mesh(dollGeo.leg, mats.black, -0.06, 0.065, 0, inner);
    mesh(dollGeo.leg, mats.black, 0.06, 0.065, 0, inner);
    mesh(dollGeo.body, mat, 0, 0.25, 0, inner);
    const head = mesh(dollGeo.head, mat, 0, 0.47, 0, inner);
    mesh(dollGeo.eye, eyeMat, -0.055, 0.0, 0.1, head);
    mesh(dollGeo.eye, eyeMat, 0.055, 0.0, 0.1, head);
    mesh(dollGeo.ant, mats.brass, 0, 0.14, 0, head);
    mesh(dollGeo.bulb, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) }), 0, 0.19, 0, head);
    root.add(d);
    return { group: d, inner, u: 0, target: 0, z: 0, phase: Math.random() * 6 };
  }
  // u = virtual x of the doll (left corner -1, right corner +1)
  const orange = makeDoll(0xff8a3c);
  const teal = makeDoll(0x30c8b8);
  orange.u = orange.target = -1;
  orange.z = -2.62;
  teal.u = teal.target = 1;
  teal.z = -2.36;
  const dolls = [orange, teal];
  const tmpV = new THREE.Vector3();
  function placeDoll(d: typeof orange, time: number, moving: boolean) {
    warp(tmpV.set(d.u, Y0, d.z), d.group.position); // feet on the sloping real floor
    d.inner.rotation.z = moving ? Math.sin(time * 9 + d.phase) * 0.09 : 0;
    d.inner.position.y = moving ? Math.abs(Math.sin(time * 9 + d.phase)) * 0.02 : 0;
    // face the peephole
    d.group.rotation.y = Math.atan2(-d.group.position.x, -d.group.position.z);
  }
  const dollDistance = (d: typeof orange) => d.group.position.length();
  for (const d of dolls) {
    placeDoll(d, 0, false);
    ctx.interaction.add(d.group, { label: L('Klicka: byt plats', 'Click: swap places'), onClick: () => swap() });
  }
  function swap() {
    const a = orange.target;
    orange.target = teal.target;
    teal.target = a;
    ctx.sfx.chirp();
    refresh();
  }

  // ---------------------------------------------------------------- reveal helpers: the perceived box and the sight lines
  const ghost = new THREE.Group();
  ghost.visible = false;
  root.add(ghost);
  {
    const box = new THREE.BoxGeometry(2 * VX, Y1 - Y0, ZF - ZB);
    box.translate(0, (Y0 + Y1) / 2, (ZF + ZB) / 2);
    ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(1.4), transparent: true, opacity: 0.9 })));
    const rays: number[] = [];
    for (const vx of [-VX, VX]) for (const vy of [Y0, Y1]) {
      const r = warp(V(vx, vy, ZB));
      rays.push(0, 0, 0, r.x, r.y, r.z);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rays, 3));
    ghost.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.55 })));
    ghost.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0b0).multiplyScalar(1.5) })));
  }

  // ---------------------------------------------------------------- camera: peephole <-> walk-around view
  let focused = false;
  let revealOn = false;
  let revealK = 0;
  let revealedOnce = false;
  const revealPos = new THREE.Vector3();
  const revealQ = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  function computeReveal() {
    revealPos.copy(ctx.toWorld(new THREE.Vector3(E.x + 1.0, 4.9, E.z + 0.7)));
    const target = ctx.toWorld(new THREE.Vector3(E.x - 0.35, 0.6, E.z - 3.0));
    m4.lookAt(revealPos, target, up);
    revealQ.setFromRotationMatrix(m4);
  }

  // ---------------------------------------------------------------- HUD
  let ro: { orange: Readout; teal: Readout; ratio: Readout } | null = null;
  let revealBtn: HTMLButtonElement | null = null;
  function refresh() {
    if (revealBtn) revealBtn.textContent = revealOn ? '👁 ' + t(L('Tillbaka till titthålet', 'Back to the peephole')) : '🚶 ' + t(L('Gå runt och titta', 'Walk around'));
    if (!ro) return;
    const dO = dollDistance(orange);
    const dT = dollDistance(teal);
    ro.orange.set(`${fmt(dO, 2)} m`);
    ro.teal.set(`${fmt(dT, 2)} m`);
    const r = Math.max(dO, dT) / Math.min(dO, dT);
    ro.ratio.set(`${fmt(r, 1)}×`);
  }
  function controls(p: ControlPanel) {
    revealBtn = p.button(L('Gå runt och titta', 'Walk around'), () => {
      revealOn = !revealOn;
      ctx.sfx.whoosh();
      if (revealOn && !revealedOnce) {
        revealedOnce = true;
        buddy.say(L('Titta! Rummet är inte alls fyrkantigt. Vänstra hörnet är mycket längre bort.', "Look! The room isn't square at all. The left corner is much farther away."), 'surprised');
      }
      refresh();
    }, { primary: true });
    p.button(L('Byt plats på robotarna', 'Swap the robots'), swap, { icon: '🔁' });
    p.heading(L('Mätt från titthålet', 'Measured from the peephole'));
    ro = {
      orange: p.readout(L('Avstånd till orange robot', 'Distance to the orange robot')),
      teal: p.readout(L('Avstånd till turkos robot', 'Distance to the teal robot')),
      ratio: p.readout(L('Den närmaste ser så här mycket större ut', 'The nearer one looks this much bigger')),
    };
    p.note(L(
      `Båda robotarna är exakt ${fmt(DOLL_H * 100)} cm höga. Bakväggens vänstra hörn är ${fmt(S_LEFT, 1)} gånger längre bort än det verkar, det högra bara ${fmt(S_RIGHT, 1)} gånger.`,
      `Both robots are exactly ${fmt(DOLL_H * 100)} cm tall. The far-left corner is ${fmt(S_LEFT, 1)} times farther away than it looks, the far-right one only ${fmt(S_RIGHT, 1)} times.`,
    ));
    refresh();
    return () => {
      ro = null;
      revealBtn = null;
    };
  }

  ctx.addStation({
    id: 'perception-ames',
    fixedViewpoint: true,
    title: L('Ames rum', 'The Ames room'),
    position: stationPos,
    viewpoint: {
      position: [E.x, E.y, E.z],
      target: [E.x + 0.55, E.y - 0.08, E.z - 2.3],
    },
    intro: L('Titta in genom springan. Varför är den ena roboten en jätte och den andra en dvärg?', 'Peek through the slot. Why is one robot a giant and the other a dwarf?'),
    howTo: L('Jämför robotarna. Klicka på en robot (eller "Byt plats") och se dem växa och krympa. Tryck sedan "Gå runt och titta".', 'Compare the robots. Click a robot (or "Swap") and watch them grow and shrink. Then press "Walk around".'),
    science: L(
      'Rummet är inte fyrkantigt. Bakväggen sneddar bort så att vänstra hörnet är 1,6 gånger längre bort än det ser ut och högra bara 0,7 gånger, och golv och tak lutar. Varje hörn ligger ändå på exakt samma siktlinje från titthålet som i ett vanligt rum, så bilden på din näthinna blir identisk med ett rektangulärt rum. Hjärnan har sett tusentals rektangulära rum och väljer den tolkningen. Då måste robotarna vara olika stora, eftersom den bortre bara täcker hälften så stor vinkel. Det är alltså inte ögat som luras: med bara ett öga och ingen rörelse finns ingen information som avslöjar formen.',
      'The room isn\'t rectangular. The back wall slants away so the far-left corner is 1.6 times farther than it looks and the far-right only 0.7 times, and the floor and ceiling slope. Yet every corner sits on exactly the same sight line from the peephole as in an ordinary room, so the image on your retina is identical to a rectangular room. Your brain has seen thousands of rectangular rooms and picks that interpretation. Then the robots must be different sizes, because the far one covers only about half the angle. Your eye isn\'t fooled: with one eye and no movement, there is simply no information that reveals the shape.',
    ),
    wow: L(
      'Adelbert Ames Jr. byggde det första rummet 1946. Effekten är så stark att folk hellre tror att en vän krymper när hon går tvärs över rummet än att rummet är snett.',
      'Adelbert Ames Jr. built the first one in 1946. The effect is so strong that people would rather believe a friend shrinks as she walks across than that the room is crooked.',
    ),
    controls,
    onFocus() {
      focused = true;
      revealOn = false;
      revealK = 0;
      computeReveal();
      refresh();
    },
    onBlur() {
      focused = false;
      revealOn = false;
      revealK = 0;
      ghost.visible = false;
    },
  });

  let lastSwapLine = -1e9;
  return {
    update(dt: number, time: number) {
      // dolls walk along the back wall at 0.35 m/s (in the virtual room)
      for (const d of dolls) {
        const moving = Math.abs(d.target - d.u) > 1e-3;
        if (moving) {
          const step = 0.35 * dt;
          d.u += Math.sign(d.target - d.u) * Math.min(step, Math.abs(d.target - d.u));
          if (Math.abs(d.target - d.u) <= 1e-3) {
            d.u = d.target;
            refresh();
            if (d === teal && time - lastSwapLine > 20 && !revealOn) {
              lastSwapLine = time;
              buddy.say(L('Samma robot, samma storlek. Den har bara gått längre bort!', 'Same robot, same size. It just walked farther away!'), 'wink');
            }
          }
          if (ro && Math.floor(time * 10) !== Math.floor((time - dt) * 10)) refresh();
        }
        placeDoll(d, time, moving);
      }
      // walk-around camera: override the focus camera after the player has placed it this frame
      revealK = approach(revealK, revealOn ? 1 : 0, 2.6, dt);
      if (revealOn && revealK > 0.995) revealK = 1;
      ghost.visible = focused && revealK > 0.05;
      if (focused && revealK > 1e-3) {
        const e = smooth(revealK);
        const cam = ctx.camera;
        cam.position.lerp(revealPos, e);
        cam.quaternion.slerp(revealQ, e);
      }
    },
  };
}
