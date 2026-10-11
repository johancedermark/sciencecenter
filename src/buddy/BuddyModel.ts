/**
 * Buddy's procedural mesh and skeleton.
 *
 * Buddy faces +Z in its local frame, +X is Buddy's LEFT (the gauntlet arm and the
 * rainbow head patch), units are metres, the origin is on the floor between the feet.
 * Static parts are merged per pivot and material to keep draw calls low (~40).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { radialTexture, rainbowTexture } from './textures';

/** Rig dimensions shared with the animator (leg IK). */
export const DIM = {
  pelvisY: 0.37,
  hipX: 0.072,
  hipY: -0.035,
  thigh: 0.135,
  shin: 0.14,
  /** Ankle height above the floor when the boot is flat. */
  ankleY: 0.075,
  footZ: 0.012,
  /** Height of the head pivot centre used for look-at (root-local). */
  eyeY: 0.86,
} as const;

export interface ArmRig {
  side: 1 | -1;
  shoulder: THREE.Object3D;
  elbow: THREE.Object3D;
  wrist: THREE.Object3D;
  thumb: THREE.Object3D;
  index: THREE.Object3D;
  fingers: THREE.Object3D;
  shoulderY: number;
}

export interface LegRig {
  side: 1 | -1;
  hip: THREE.Object3D;
  knee: THREE.Object3D;
  ankle: THREE.Object3D;
}

export interface BuddyRig {
  root: THREE.Group;
  /** Carries jumps (y offset). */
  body: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  antenna: THREE.Group;
  /** 0 = left (+X, gauntlet), 1 = right (−X). */
  arms: [ArmRig, ArmRig];
  legs: [LegRig, LegRig];
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  chestMat: THREE.MeshStandardMaterial;
  antennaMat: THREE.MeshBasicMaterial;
  antennaColor: THREE.Color;
}

type V3 = [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Transform a geometry in place: position, Euler rotation, scale. */
function xf(g: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: number | V3 = 1): THREE.BufferGeometry {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _p.set(p[0], p[1], p[2]);
  if (typeof s === 'number') _s.setScalar(s);
  else _s.set(s[0], s[1], s[2]);
  _m.compose(_p, _q, _s);
  return g.applyMatrix4(_m);
}

/** Merge parts into one mesh (non-indexed, position/normal/uv only) and add it to a pivot. */
function addMerged(pivot: THREE.Object3D, mat: THREE.Material, parts: THREE.BufferGeometry[]): THREE.Mesh {
  const list = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
    n.clearGroups();
    return n;
  });
  const geo = list.length === 1 ? list[0] : mergeGeometries(list, false)!;
  if (list.length > 1) list.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  pivot.add(mesh);
  return mesh;
}

const sphere = (r: number, w = 28, h = 20) => new THREE.SphereGeometry(r, w, h);
/** Lathe around Y; the profile may be given in either direction (normals always face outwards). */
const lathe = (pts: [number, number][], segs = 28) => {
  const p = pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts;
  return new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), segs);
};
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 5, 12);
const cyl = (rt: number, rb: number, h: number, segs = 24) => new THREE.CylinderGeometry(rt, rb, h, segs);
const torus = (r: number, tube: number) => new THREE.TorusGeometry(r, tube, 10, 36);
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 4, r);

/** A pivot (Object3D) at a local position. */
function pivot(parent: THREE.Object3D, x: number, y: number, z: number, name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Ellipsoid shell section helper (sphere segment scaled to the head radii). */
function shellPatch(radii: V3, grow: number, phiStart: number, phiLen: number, thetaStart: number, thetaLen: number, w = 24, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h, phiStart, phiLen, thetaStart, thetaLen);
  return xf(g, [0, 0, 0], [0, 0, 0], [radii[0] * grow, radii[1] * grow, radii[2] * grow]);
}

/** Build the whole robot. `faceTexture` is the dynamic visor canvas. */
export function buildBuddy(faceTexture: THREE.Texture): BuddyRig {
  // ---------- materials (shared) ----------
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xe9e4dc, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.22 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x3b3e43, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x17191c, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x55585a, metalness: 0.75, roughness: 0.36 });
  // Black glossy screen; the canvas only provides the glowing (emissive) features and,
  // through `map`'s alpha, the rounded outline. Base colour black keeps lit features from
  // over-blooming into a teal haze.
  const visor = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    map: faceTexture,
    emissive: 0xffffff,
    emissiveMap: faceTexture,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0,
    specularIntensity: 0.4,
    clearcoat: 0.7,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.35,
    alphaTest: 0.5,
  });
  const rainbow = rainbowTexture();
  const patchMat = new THREE.MeshStandardMaterial({ map: rainbow, emissive: 0xffffff, emissiveMap: rainbow, emissiveIntensity: 0.3, roughness: 0.3 });
  const chestMat = patchMat.clone();
  const teal = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ee6d6).multiplyScalar(2.2) });
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa23a).multiplyScalar(2.6) });
  const antennaColor = new THREE.Color(0x5ee6d6).multiplyScalar(2.6);
  const antennaMat = new THREE.MeshBasicMaterial({ color: antennaColor.clone() });

  // ---------- hierarchy ----------
  const root = new THREE.Group();
  root.name = 'Buddy';
  const body = pivot(root, 0, 0, 0, 'body');
  const pelvis = pivot(body, 0, DIM.pelvisY, 0, 'pelvis');

  // Pelvis + black waist
  addMerged(pelvis, black, [
    xf(sphere(1, 28, 16), [0, -0.01, 0], [0, 0, 0], [0.105, 0.06, 0.085]),
    xf(lathe([[0.0, 0.0], [0.084, 0.0], [0.09, 0.03], [0.085, 0.06], [0, 0.06]]), [0, 0, 0], [0, 0, 0], [1, 1, 0.85]),
    xf(sphere(0.036), [DIM.hipX, DIM.hipY, 0]),
    xf(sphere(0.036), [-DIM.hipX, DIM.hipY, 0]),
  ]);

  // ---------- torso ----------
  const spine = pivot(pelvis, 0, 0.04, 0, 'spine');
  addMerged(spine, cream, [
    xf(rbox(0.28, 0.18, 0.2, 0.05), [0, 0.165, 0]),
    // Rounded lower chest flare that tucks into the black waist
    xf(lathe([[0.0, 0.0], [0.096, 0.0], [0.124, 0.035], [0.13, 0.1], [0, 0.1]]), [0, 0.01, 0], [0, 0, 0], [1, 1, 0.78]),
  ]);
  addMerged(spine, dark, [
    xf(cyl(0.042, 0.05, 0.05), [0, 0.265, -0.005]),
    // Shoulder sockets
    xf(sphere(0.04), [0.145, 0.205, 0]),
    xf(sphere(0.04), [-0.145, 0.205, 0]),
  ]);
  {
    // Hexagon-ish chest panel, protruding slightly from the flat chest front (z = 0.1)
    const s = new THREE.Shape();
    const P: [number, number][] = [
      [-0.048, 0.046], [0.048, 0.046], [0.058, 0.034], [0.058, -0.012],
      [0.03, -0.046], [-0.03, -0.046], [-0.058, -0.012], [-0.058, 0.034],
    ];
    s.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 2 });
    // Planar UVs over the shape's bounds
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.062) / 0.124, (pos.getY(i) + 0.05) / 0.1);
    addMerged(spine, chestMat, [xf(g, [-0.016, 0.16, 0.097], [0, 0, 0], [1.18, 1.18, 1])]);
  }
  addMerged(spine, amber, [xf(sphere(0.011, 16, 12), [0.068, 0.205, 0.099])]);

  // ---------- head ----------
  const head = pivot(spine, 0, 0.27, 0, 'head');
  head.rotation.order = 'YXZ';
  const HC = 0.178; // head centre above the neck pivot
  const radii: V3 = [0.232, 0.195, 0.205];
  addMerged(head, cream, [xf(sphere(1, 48, 32), [0, HC, 0], [0, 0, 0], radii)]);
  {
    // Visor: a front section of a slightly larger ellipsoid; the face canvas cuts its rounded outline.
    const half = 0.98;
    const g = shellPatch(radii, 1.022, Math.PI / 2 - half, half * 2, 0.78, 1.52, 48, 32);
    addMerged(head, visor, [xf(g, [0, HC, 0])]);
  }
  {
    // Ear discs (both sides) with an inner hub
    const ear = () => lathe([[0, 0.028], [0.06, 0.028], [0.073, 0.016], [0.076, 0], [0.072, -0.02], [0.0, -0.022]], 32);
    const hub = () => lathe([[0, 0.01], [0.018, 0.01], [0.024, 0.0], [0.0, 0.0]], 24);
    addMerged(head, dark, [
      xf(ear(), [0.228, HC - 0.005, -0.005], [0, 0, -Math.PI / 2]),
      xf(ear(), [-0.228, HC - 0.005, -0.005], [0, 0, Math.PI / 2]),
      xf(hub(), [0.256, HC - 0.005, -0.005], [0, 0, -Math.PI / 2]),
      xf(hub(), [-0.256, HC - 0.005, -0.005], [0, 0, Math.PI / 2]),
      // Antenna socket
      xf(cyl(0.016, 0.02, 0.02, 16), [0.045, HC + 0.19, -0.02]),
    ]);
    addMerged(head, amber, [
      xf(torus(0.036, 0.0065), [0.258, HC - 0.005, -0.005], [0, Math.PI / 2, 0]),
      xf(torus(0.036, 0.0065), [-0.258, HC - 0.005, -0.005], [0, Math.PI / 2, 0]),
      xf(sphere(0.011, 14, 10), [0.266, HC - 0.005, -0.005], [0, 0, 0], [0.6, 1, 1]),
      xf(sphere(0.011, 14, 10), [-0.266, HC - 0.005, -0.005], [0, 0, 0], [0.6, 1, 1]),
    ]);
    // Rainbow patch, upper-front of the left (+X) side, above the ear
    addMerged(head, patchMat, [xf(shellPatch(radii, 1.012, Math.PI - 0.62, 0.52, 0.45, 0.56), [0, HC, 0])]);
  }
  const antenna = pivot(head, 0.045, HC + 0.2, -0.02, 'antenna');
  addMerged(antenna, black, [xf(cyl(0.0055, 0.007, 0.095, 10), [0, 0.0475, 0])]);
  addMerged(antenna, antennaMat, [xf(sphere(0.017, 18, 14), [0, 0.102, 0])]);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64),
      color: 0x5ee6d6,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.position.set(0, 0.102, 0);
  halo.scale.setScalar(0.13);
  antenna.add(halo);

  // ---------- arms ----------
  const arms = ([1, -1] as const).map((side) => {
    const sy = 0.205;
    const shoulder = pivot(spine, side * 0.178, sy, 0, side > 0 ? 'shoulderL' : 'shoulderR');
    shoulder.rotation.order = 'XZY';
    addMerged(shoulder, dark, [
      xf(sphere(0.058, 28, 20), [0, -0.004, 0], [0, 0, 0], [1, 0.95, 1]),
      xf(sphere(0.034), [0, -0.112, 0]), // elbow joint
    ]);
    addMerged(shoulder, cream, [xf(lathe([[0, -0.03], [0.041, -0.035], [0.044, -0.07], [0.04, -0.1], [0, -0.1]]), [0, 0, 0])]);
    if (side > 0) {
      // Small rainbow patch on the outer side of the left shoulder pad
      addMerged(shoulder, patchMat, [xf(new THREE.SphereGeometry(0.0595, 16, 12, Math.PI - 0.5, 1.0, 0.45, 0.75), [0, -0.004, 0])]);
    }
    const elbow = pivot(shoulder, 0, -0.112, 0, 'elbow');
    if (side > 0) {
      // Left forearm: dark gunmetal mechanical gauntlet with teal lights
      addMerged(elbow, gunmetal, [
        xf(lathe([[0, -0.005], [0.045, -0.008], [0.056, -0.025], [0.058, -0.07], [0.05, -0.1], [0.04, -0.108], [0, -0.108]], 28)),
        xf(torus(0.057, 0.006), [0, -0.03, 0], [Math.PI / 2, 0, 0]),
        xf(torus(0.054, 0.006), [0, -0.09, 0], [Math.PI / 2, 0, 0]),
        // Round dial on the outer side
        xf(cyl(0.026, 0.028, 0.02, 24), [0.058, -0.052, -0.004], [0, 0, Math.PI / 2]),
        xf(cyl(0.012, 0.012, 0.012, 16), [0.071, -0.052, -0.004], [0, 0, Math.PI / 2]),
        // Plates on the front
        xf(rbox(0.04, 0.03, 0.014, 0.004), [0.0, -0.045, 0.054]),
        xf(rbox(0.036, 0.022, 0.012, 0.004), [0.02, -0.08, 0.048], [0, 0.4, 0]),
      ]);
      addMerged(elbow, teal, [
        xf(torus(0.03, 0.003), [0.069, -0.052, -0.004], [0, Math.PI / 2, 0]),
        xf(rbox(0.026, 0.006, 0.006, 0.0025), [0.0, -0.068, 0.058]),
        xf(rbox(0.006, 0.024, 0.006, 0.0025), [0.035, -0.08, 0.044], [0, 0.6, 0]),
      ]);
    } else {
      addMerged(elbow, cream, [xf(lathe([[0, -0.012], [0.036, -0.016], [0.042, -0.05], [0.046, -0.088], [0.04, -0.1], [0, -0.1]]))]);
    }
    const wrist = pivot(elbow, 0, -0.106, 0, 'wrist');
    wrist.scale.setScalar(1.22); // chunky cartoon hands
    // Hand: palm faces the body (−side·X); fingers hang along −Y; thumb on the front (+Z) edge.
    addMerged(wrist, black, [
      xf(cyl(0.028, 0.03, 0.02, 16), [0, -0.006, 0]),
      xf(rbox(0.036, 0.06, 0.064, 0.013), [0, -0.036, 0]),
    ]);
    const finger = (len: number, z: number) => xf(capsule(0.0118, len), [0, -(len / 2 + 0.0118) + 0.006, z]);
    const thumb = pivot(wrist, -side * 0.006, -0.022, 0.03, 'thumb');
    thumb.rotation.order = 'XZY';
    addMerged(thumb, black, [xf(capsule(0.012, 0.022), [0, -0.021, 0])]);
    const index = pivot(wrist, 0, -0.062, 0, 'index');
    addMerged(index, black, [finger(0.03, 0.021)]);
    const fingers = pivot(wrist, 0, -0.062, 0, 'fingers');
    addMerged(fingers, black, [finger(0.032, 0.004), finger(0.03, -0.013), finger(0.022, -0.028)]);
    const arm: ArmRig = { side, shoulder, elbow, wrist, thumb, index, fingers, shoulderY: sy };
    return arm;
  }) as [ArmRig, ArmRig];

  // ---------- legs ----------
  const legs = ([1, -1] as const).map((side) => {
    const hip = pivot(pelvis, side * DIM.hipX, DIM.hipY, 0, side > 0 ? 'hipL' : 'hipR');
    hip.rotation.order = 'ZXY';
    addMerged(hip, cream, [
      xf(lathe([[0, -0.0], [0.05, -0.012], [0.059, -0.05], [0.055, -0.1], [0.044, -0.118], [0, -0.118]]), [0, 0, 0], [0, 0, 0], [1, 1, 0.95]),
    ]);
    addMerged(hip, black, [
      xf(sphere(0.04), [0, -DIM.thigh, 0]),
      xf(sphere(1, 20, 14), [0, -DIM.thigh + 0.004, 0.026], [0, 0, 0], [0.036, 0.032, 0.022]),
    ]);
    const knee = pivot(hip, 0, -DIM.thigh, 0, 'knee');
    addMerged(knee, cream, [
      xf(lathe([[0, -0.016], [0.048, -0.02], [0.059, -0.05], [0.071, -0.1], [0.07, -0.125], [0.054, -0.138], [0, -0.138]], 30)),
    ]);
    addMerged(knee, teal, [xf(torus(0.019, 0.0048), [side * 0.069, -0.098, 0.004], [0, Math.PI / 2, 0])]);
    const ankle = pivot(knee, 0, -DIM.shin, 0, 'ankle');
    ankle.rotation.order = 'ZXY';
    const A = DIM.ankleY;
    addMerged(ankle, dark, [
      xf(rbox(0.122, 0.034, 0.205, 0.016), [0, -A + 0.017, 0.024]),
      xf(sphere(1, 28, 18), [0, -A + 0.04, 0.03], [0, 0, 0], [0.062, 0.05, 0.098]),
      xf(cyl(0.045, 0.05, 0.03, 20), [0, -0.012, 0.0]),
    ]);
    const leg: LegRig = { side, hip, knee, ankle };
    return leg;
  }) as [LegRig, LegRig];

  // ---------- blob shadow ----------
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.8),
    new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 64),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  shadow.renderOrder = 1;
  root.add(shadow);

  return { root, body, pelvis, spine, head, antenna, arms, legs, shadow, halo, chestMat, antennaMat, antennaColor };
}
