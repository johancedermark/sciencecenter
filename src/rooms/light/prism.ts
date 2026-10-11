/**
 * Station 1: a white slit beam through a rotatable glass prism.
 * Every wavelength is traced in 2D (the table plane) with the vector form of Snell's law through
 * each face, including total internal reflection, and painted onto a curved screen.
 * Refractive indices come from the real Sellmeier formulas (Schott N-BK7, SF11; diamond after Peter 1923).
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import {
  BeamBatch, DEG, cieXYZ, cooldown, fmt, glowSprite, linToSrgb8, mats, plaque, rbox, spectralRGB, table, xyzToLinearRGB,
} from './common';

// ------------------------------------------------------------------ optics

type Glass = { name: { sv: string; en: string }; n: (nm: number) => number };

function sellmeier(B: [number, number, number], C: [number, number, number]) {
  return (nm: number) => {
    const l2 = (nm / 1000) ** 2;
    return Math.sqrt(1 + (B[0] * l2) / (l2 - C[0]) + (B[1] * l2) / (l2 - C[1]) + (B[2] * l2) / (l2 - C[2]));
  };
}

const GLASSES: Glass[] = [
  { name: L('Kronglas N-BK7', 'Crown glass N-BK7'), n: sellmeier([1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653]) },
  { name: L('Flintglas SF11', 'Flint glass SF11'), n: sellmeier([1.73759695, 0.313747346, 1.89878101], [0.013188707, 0.0623068142, 155.23629]) },
  {
    name: L('Diamant', 'Diamond'),
    n: (nm) => {
      const l2 = (nm / 1000) ** 2;
      return Math.sqrt(1 + (4.3356 * l2) / (l2 - 0.106 ** 2) + (0.3306 * l2) / (l2 - 0.175 ** 2));
    },
  },
];

const APEX = 60 * DEG;
const SIDE = 0.24;
const PRISM_H = 0.16;
const TOP = 0.85; // table top
const BEAM_Y = TOP + 0.08;
const PC = { x: -0.3, z: 0.25 }; // prism centre (station-local)
const SRC_X = -0.92;
/** The slit beam passes a little towards the apex, so even grazing incidence on the first face is reachable. */
const BEAM_Z = PC.z + 0.05;
const R_SCREEN = 1.25;
const A0 = -8 * DEG;
const A1 = 112 * DEG;
const SCREEN_Y0 = TOP + 0.01;
const SCREEN_H = 0.2;
const TEX_W = 1024;
const TEX_H = 128;
const BEAM_W = 0.008;
/** Prism rotation range (deg). An equilateral prism repeats every 60°, so this keeps one apex as the refracting edge. */
const ROT_MIN = -49;
const ROT_MAX = 30;

interface Poly {
  vx: number[];
  vz: number[];
  nx: number[];
  nz: number[];
  n: number;
}

function makePoly(cx: number, cz: number, rot: number, n: number, out?: Poly): Poly {
  const h = (SIDE * Math.sqrt(3)) / 2;
  const base = [[0, (2 * h) / 3], [-SIDE / 2, -h / 3], [SIDE / 2, -h / 3]];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const p: Poly = out ?? { vx: [0, 0, 0], vz: [0, 0, 0], nx: [0, 0, 0], nz: [0, 0, 0], n };
  p.n = n;
  for (let i = 0; i < 3; i++) {
    const [x, z] = base[i];
    p.vx[i] = cx + x * c - z * s;
    p.vz[i] = cz + x * s + z * c;
  }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const ex = p.vx[j] - p.vx[i];
    const ez = p.vz[j] - p.vz[i];
    let nx = ez;
    let nz = -ex;
    const l = Math.hypot(nx, nz);
    nx /= l;
    nz /= l;
    // make it point outwards (away from the centroid)
    if ((p.vx[i] - cx) * nx + (p.vz[i] - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    p.nx[i] = nx;
    p.nz[i] = nz;
  }
  return p;
}

/** Vector Snell's law. (nx,nz) faces the incoming ray (n·d < 0). Returns false on total internal reflection. */
function refract(d: { x: number; z: number }, nx: number, nz: number, eta: number): boolean {
  const cosi = -(d.x * nx + d.z * nz);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return false;
  const a = eta * cosi - Math.sqrt(k);
  d.x = eta * d.x + a * nx;
  d.z = eta * d.z + a * nz;
  const l = Math.hypot(d.x, d.z);
  d.x /= l;
  d.z /= l;
  return true;
}

interface TraceResult {
  /** x,z pairs of the path vertices, including the final point. */
  pts: number[];
  dx: number;
  dz: number;
  tir: number;
  /** Screen angle (rad) if the ray lands on the screen, else NaN. */
  screenA: number;
  /** First incidence angle on the entry face (rad). */
  inc: number;
  /** Exit point of the last glass surface. */
  ex: number;
  ez: number;
  hitGlass: boolean;
}

function trace(nm: number, polys: Poly[], glass: Glass, res: TraceResult) {
  const n = glass.n(nm);
  const d = { x: 1, z: 0 };
  let ox = SRC_X;
  let oz = BEAM_Z;
  res.pts.length = 0;
  res.pts.push(ox, oz);
  res.tir = 0;
  res.inc = NaN;
  res.hitGlass = false;
  res.ex = ox;
  res.ez = oz;
  let inside = -1;
  for (let ev = 0; ev < 12; ev++) {
    let bestT = Infinity;
    let bestP = -1;
    let bestE = -1;
    if (inside < 0) {
      for (let k = 0; k < polys.length; k++) {
        const p = polys[k];
        for (let e = 0; e < 3; e++) {
          const den = d.x * p.nx[e] + d.z * p.nz[e];
          if (den >= -1e-9) continue;
          const t = ((p.vx[e] - ox) * p.nx[e] + (p.vz[e] - oz) * p.nz[e]) / den;
          if (t <= 1e-7 || t >= bestT) continue;
          const hx = ox + d.x * t;
          const hz = oz + d.z * t;
          const j = (e + 1) % 3;
          const ex = p.vx[j] - p.vx[e];
          const ez = p.vz[j] - p.vz[e];
          const u = ((hx - p.vx[e]) * ex + (hz - p.vz[e]) * ez) / (ex * ex + ez * ez);
          if (u < 0 || u > 1) continue;
          bestT = t;
          bestP = k;
          bestE = e;
        }
      }
      if (bestP < 0) break;
      const p = polys[bestP];
      ox += d.x * bestT;
      oz += d.z * bestT;
      res.pts.push(ox, oz);
      if (!res.hitGlass) {
        res.inc = Math.acos(Math.min(1, -(d.x * p.nx[bestE] + d.z * p.nz[bestE])));
        res.hitGlass = true;
      }
      refract(d, p.nx[bestE], p.nz[bestE], 1 / n);
      inside = bestP;
    } else {
      const p = polys[inside];
      for (let e = 0; e < 3; e++) {
        const den = d.x * p.nx[e] + d.z * p.nz[e];
        if (den <= 1e-9) continue;
        const t = ((p.vx[e] - ox) * p.nx[e] + (p.vz[e] - oz) * p.nz[e]) / den;
        if (t > 1e-7 && t < bestT) {
          bestT = t;
          bestE = e;
        }
      }
      if (bestE < 0) break;
      ox += d.x * bestT;
      oz += d.z * bestT;
      res.pts.push(ox, oz);
      if (!refract(d, -p.nx[bestE], -p.nz[bestE], n)) {
        // total internal reflection: mirror the direction in the face
        const dn = d.x * p.nx[bestE] + d.z * p.nz[bestE];
        d.x -= 2 * dn * p.nx[bestE];
        d.z -= 2 * dn * p.nz[bestE];
        res.tir++;
      } else {
        inside = -1;
        res.ex = ox;
        res.ez = oz;
      }
    }
  }
  res.dx = d.x;
  res.dz = d.z;
  res.screenA = NaN;
  if (inside >= 0) return res; // trapped (only for absurd cases): stop at last point
  // intersect with the screen circle around the prism centre
  const fx = ox - PC.x;
  const fz = oz - PC.z;
  const b = fx * d.x + fz * d.z;
  const c = fx * fx + fz * fz - R_SCREEN * R_SCREEN;
  const disc = b * b - c;
  if (disc > 0) {
    const t = -b + Math.sqrt(disc);
    const hx = ox + d.x * t;
    const hz = oz + d.z * t;
    const a = Math.atan2(-(hz - PC.z), hx - PC.x);
    if (t > 0 && a >= A0 && a <= A1) {
      res.screenA = a;
      res.pts.push(hx, hz);
      return res;
    }
  }
  res.pts.push(ox + d.x * 1.4, oz + d.z * 1.4);
  return res;
}

function deviationDeg(r: TraceResult) {
  return Math.atan2(-r.dz, r.dx) / DEG;
}

// ------------------------------------------------------------------ station

export function buildPrism(ctx: RoomContext) {
  const ROOM_X = 0;
  const ROOM_Z = -5.6;
  const g = new THREE.Group();
  g.position.set(ROOM_X, 0, ROOM_Z);
  ctx.group.add(g);

  const st = { rot: 0 * DEG, glass: 0, crucis: false, dirty: true };

  // table
  const tbl = table(2.4, 1.75);
  tbl.position.set(-0.08, 0, -0.25);
  g.add(tbl);
  ctx.addCollider(ROOM_X - 0.08, ROOM_Z - 0.25, 2.5, 1.85);
  const pl = plaque(L('Prisma & regnbåge', 'Prism & rainbow'), 0.8, 0.14);
  pl.position.set(-0.08, 0.72, 0.626);
  g.add(pl);

  // slit lamp (brass box with a glowing slit)
  const lamp = new THREE.Group();
  lamp.position.set(SRC_X - 0.14, TOP, BEAM_Z);
  const lampBody = new THREE.Mesh(rbox(0.24, 0.2, 0.16, 0.03), mats.blackMetal);
  lampBody.position.y = 0.1;
  lamp.add(lampBody);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  slit.position.set(0.121, BEAM_Y - TOP, 0);
  slit.rotation.y = Math.PI / 2;
  lamp.add(slit);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16), mats.brass);
  vent.position.y = 0.22;
  lamp.add(vent);
  const lampGlow = glowSprite(0xfff3e0, 0.12, 0.8);
  lampGlow.position.set(0.13, BEAM_Y - TOP, 0);
  lamp.add(lampGlow);
  g.add(lamp);

  // prism meshes
  const h = (SIDE * Math.sqrt(3)) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, (2 * h) / 3);
  shape.lineTo(-SIDE / 2, -h / 3);
  shape.lineTo(SIDE / 2, -h / 3);
  shape.closePath();
  const prismGeo = new THREE.ExtrudeGeometry(shape, { depth: PRISM_H, bevelEnabled: false });
  prismGeo.rotateX(Math.PI / 2);
  prismGeo.translate(0, PRISM_H, 0);
  const prismMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8f6ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    depthWrite: false, clearcoat: 1, emissive: 0x8fb8ff, emissiveIntensity: 0.06,
  });
  const prismEdges = new THREE.LineSegments(new THREE.EdgesGeometry(prismGeo), new THREE.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.7 }));
  const prism = new THREE.Mesh(prismGeo, prismMat);
  prism.add(prismEdges);
  prism.position.set(PC.x, TOP, PC.z);
  g.add(prism);
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.012, 40), mats.brass);
  turntable.position.set(PC.x, TOP + 0.006, PC.z);
  g.add(turntable);
  const prism2 = new THREE.Mesh(prismGeo, prismMat);
  prism2.add(prismEdges.clone());
  prism2.visible = false;
  g.add(prism2);

  // curved screen with angle scale (map) and painted spectrum (emissive map)
  const scaleCanvas = document.createElement('canvas');
  scaleCanvas.width = TEX_W;
  scaleCanvas.height = TEX_H;
  const scaleTex = new THREE.CanvasTexture(scaleCanvas);
  scaleTex.colorSpace = THREE.SRGBColorSpace;
  const specCanvas = document.createElement('canvas');
  specCanvas.width = TEX_W;
  specCanvas.height = TEX_H;
  const specCtx = specCanvas.getContext('2d')!;
  const specImg = specCtx.createImageData(TEX_W, TEX_H);
  const specTex = new THREE.CanvasTexture(specCanvas);
  specTex.colorSpace = THREE.SRGBColorSpace;
  const screenGeo = new THREE.CylinderGeometry(R_SCREEN, R_SCREEN, SCREEN_H, 96, 1, true, A0 + Math.PI / 2, A1 - A0);
  const screen = new THREE.Mesh(
    screenGeo,
    new THREE.MeshStandardMaterial({
      map: scaleTex, emissive: 0xffffff, emissiveMap: specTex, emissiveIntensity: 1.05, roughness: 0.9, side: THREE.DoubleSide,
    }),
  );
  screen.position.set(PC.x, SCREEN_Y0 + SCREEN_H / 2, PC.z);
  g.add(screen);
  // brass rim along the screen's top
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R_SCREEN, 0.008, 6, 96, A1 - A0), mats.brass);
  rim.rotation.x = -Math.PI / 2;
  rim.rotation.z = A0;
  rim.position.set(PC.x, SCREEN_Y0 + SCREEN_H, PC.z);
  g.add(rim);

  const beams = new BeamBatch(160);
  g.add(beams.mesh);

  const glow = glowSprite(0xffffff, 0.25, 0.0); // glints at the prism when light goes through
  glow.position.set(PC.x, BEAM_Y, PC.z);
  g.add(glow);

  // ---------------------------------------------------------------- simulation state
  const NB = 12; // beams drawn
  const NS = 72; // samples painted on the screen
  const beamNm = Array.from({ length: NB }, (_, i) => 405 + (i * (695 - 405)) / (NB - 1));
  const beamCol = beamNm.map((nm) => spectralRGB(nm));
  const sampNm = Array.from({ length: NS }, (_, i) => 395 + (i * (710 - 395)) / (NS - 1));
  const sampXYZ = sampNm.map((nm) => cieXYZ(nm, [0, 0, 0]));
  const white: [number, number, number] = [0, 0, 0];
  for (const c of sampXYZ) for (let k = 0; k < 3; k++) white[k] += c[k];
  xyzToLinearRGB(white);
  const accX = new Float32Array(TEX_W);
  const accY = new Float32Array(TEX_W);
  const accZ = new Float32Array(TEX_W);
  const res: TraceResult = { pts: [], dx: 1, dz: 0, tir: 0, screenA: NaN, inc: 0, ex: 0, ez: 0, hitGlass: false };
  const poly1 = makePoly(PC.x, PC.z, 0, 1.5);
  const poly2 = makePoly(0, 0, 0, 1.5);
  const polys: Poly[] = [poly1];
  const zoomA = new Float32Array(NS); // final angles for the HUD zoom
  const zoomOk = new Uint8Array(NS);

  const info = { dev: 0, inc: 0, tir: 0, dmin: NaN, spread: NaN, n: 1.5 };
  let curve: { rot: number; dev: number; screenA: number }[] = [];

  function minDeviation(n: number) {
    const s = n * Math.sin(APEX / 2);
    return s < 1 ? (2 * Math.asin(s) - APEX) / DEG : NaN;
  }

  function computeCurve() {
    const gl = GLASSES[st.glass];
    curve = [];
    const p = makePoly(PC.x, PC.z, 0, gl.n(589.3));
    for (let r = ROT_MIN; r <= ROT_MAX; r += 0.5) {
      makePoly(PC.x, PC.z, r * DEG, gl.n(589.3), p);
      trace(589.3, [p], gl, res);
      curve.push({ rot: r, dev: res.tir || !res.hitGlass ? NaN : deviationDeg(res), screenA: res.screenA });
    }
  }

  function drawScale() {
    const c = scaleCanvas.getContext('2d')!;
    c.fillStyle = '#d9d2c6';
    c.fillRect(0, 0, TEX_W, TEX_H);
    c.fillStyle = '#5a4c40';
    c.strokeStyle = '#5a4c40';
    c.font = '600 20px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let a = 0; a <= 110; a += 2) {
      const u = ((a * DEG - A0) / (A1 - A0)) * TEX_W;
      const big = a % 10 === 0;
      // a plain ruler; the exact angles are in the panel
      c.lineWidth = big ? 2 : 1;
      c.beginPath();
      c.moveTo(u, 0);
      c.lineTo(u, big ? 22 : 10);
      c.stroke();
    }
    // mark where yellow light lands at minimum deviation (the exit point is not the arc's centre,
    // so this is found by tracing rather than by placing the angle Dmin)
    let best: { dev: number; screenA: number } | null = null;
    for (const p of curve) if (!Number.isNaN(p.dev) && (!best || p.dev < best.dev)) best = p;
    if (best && !Number.isNaN(best.screenA)) {
      const u = ((best.screenA - A0) / (A1 - A0)) * TEX_W;
      c.fillStyle = '#c2185b';
      c.fillRect(u - 1.5, 0, 3, TEX_H);
      c.font = '700 18px system-ui, sans-serif';
      // read from the concave side, which mirrors the texture: mirror the glyphs back
      c.save();
      c.translate(u, TEX_H - 22);
      c.scale(-1, 1);
      c.fillText('Dmin', 0, 0);
      c.restore();
    }
    scaleTex.needsUpdate = true;
  }

  let scaleGlass = -1;
  function simulate() {
    const gl = GLASSES[st.glass];
    info.n = gl.n(589.3);
    makePoly(PC.x, PC.z, st.rot, info.n, poly1);
    polys.length = 1;
    prism.rotation.y = -st.rot;

    // primary d-line trace for readouts and the optional second prism
    trace(589.3, polys, gl, res);
    info.dev = deviationDeg(res);
    info.inc = res.inc / DEG;
    info.tir = res.tir;
    const exOk = res.tir === 0 && res.hitGlass;
    if (st.crucis && exOk) {
      const px = res.ex + res.dx * 0.3;
      const pz = res.ez + res.dz * 0.3;
      // point reflection of prism 1 about (px,pz): centre 2P - C1, rotated by 180°
      makePoly(2 * px - PC.x, 2 * pz - PC.z, st.rot + Math.PI, info.n, poly2);
      polys.push(poly2);
      prism2.visible = true;
      prism2.position.set(2 * px - PC.x, TOP, 2 * pz - PC.z);
      prism2.rotation.y = -(st.rot + Math.PI);
    } else prism2.visible = false;

    // beams
    beams.begin();
    // incoming white beam (draw up to the first glass hit)
    trace(550, polys, gl, res);
    beams.seg(res.pts[0], BEAM_Y, res.pts[1], res.pts[2], BEAM_Y, res.pts[3], 0.016, 1.6, 1.55, 1.45);
    let dRed = NaN;
    let dViolet = NaN;
    for (let i = 0; i < NB; i++) {
      trace(beamNm[i], polys, gl, res);
      const [r, gg, b] = beamCol[i];
      const k = 0.3;
      for (let p = 2; p + 3 < res.pts.length; p += 2) {
        const last = p + 3 >= res.pts.length - 1;
        const kk = last ? k * 0.55 : k; // fainter in air: the screen shows the colours
        beams.seg(res.pts[p], BEAM_Y, res.pts[p + 1], res.pts[p + 2], BEAM_Y, res.pts[p + 3], BEAM_W, r * kk, gg * kk, b * kk);
      }
      if (res.tir === 0 && res.hitGlass) {
        if (Number.isNaN(dViolet)) dViolet = deviationDeg(res);
        dRed = deviationDeg(res);
      }
    }
    beams.end();
    info.spread = Math.abs(dViolet - dRed);
    info.dmin = minDeviation(info.n);

    // screen
    accX.fill(0);
    accY.fill(0);
    accZ.fill(0);
    const pxPerRad = TEX_W / (A1 - A0);
    const sigma = Math.max(1.1, ((BEAM_W / 2.35) / R_SCREEN) * pxPerRad);
    for (let i = 0; i < NS; i++) {
      trace(sampNm[i], polys, gl, res);
      zoomOk[i] = res.hitGlass && !Number.isNaN(res.screenA) ? 1 : 0;
      zoomA[i] = deviationDeg(res);
      if (Number.isNaN(res.screenA)) continue;
      const u = (res.screenA - A0) * pxPerRad;
      const [X, Y, Z] = sampXYZ[i];
      const lo = Math.max(0, Math.floor(u - 4 * sigma));
      const hi = Math.min(TEX_W - 1, Math.ceil(u + 4 * sigma));
      for (let x = lo; x <= hi; x++) {
        const w = Math.exp(-0.5 * ((x - u) / sigma) ** 2);
        accX[x] += X * w;
        accY[x] += Y * w;
        accZ[x] += Z * w;
      }
    }
    if (scaleGlass !== st.glass) {
      scaleGlass = st.glass;
      drawScale();
    }
    paintScreen();
    glow.material.opacity = res.hitGlass ? 0.35 : 0;
    drawHud();
  }

  const rgb: [number, number, number] = [0, 0, 0];
  const rowR = new Uint8ClampedArray(TEX_W);
  const rowG = new Uint8ClampedArray(TEX_W);
  const rowB = new Uint8ClampedArray(TEX_W);
  const lin = new Float32Array(TEX_W * 3);
  function paintScreen() {
    let peak = 1e-9;
    for (let x = 0; x < TEX_W; x++) {
      rgb[0] = accX[x];
      rgb[1] = accY[x];
      rgb[2] = accZ[x];
      xyzToLinearRGB(rgb);
      for (let k = 0; k < 3; k++) rgb[k] /= white[k];
      const m = Math.min(rgb[0], rgb[1], rgb[2]);
      if (m < 0) for (let k = 0; k < 3; k++) rgb[k] -= m;
      lin[x * 3] = rgb[0];
      lin[x * 3 + 1] = rgb[1];
      lin[x * 3 + 2] = rgb[2];
      peak = Math.max(peak, rgb[0], rgb[1], rgb[2]);
    }
    const gain = 1 / peak;
    for (let x = 0; x < TEX_W; x++) {
      rowR[x] = linToSrgb8(lin[x * 3] * gain);
      rowG[x] = linToSrgb8(lin[x * 3 + 1] * gain);
      rowB[x] = linToSrgb8(lin[x * 3 + 2] * gain);
    }
    // the slit image: a band at beam height with soft top and bottom
    const vc = (1 - (BEAM_Y - SCREEN_Y0) / SCREEN_H) * TEX_H;
    const half = (0.035 / SCREEN_H) * TEX_H;
    const d = specImg.data;
    for (let y = 0; y < TEX_H; y++) {
      const dy = Math.abs(y + 0.5 - vc);
      const f = dy < half ? 1 : Math.max(0, 1 - (dy - half) / 4);
      const o = y * TEX_W * 4;
      for (let x = 0; x < TEX_W; x++) {
        const i = o + x * 4;
        d[i] = rowR[x] * f;
        d[i + 1] = rowG[x] * f;
        d[i + 2] = rowB[x] * f;
        d[i + 3] = 255;
      }
    }
    specCtx.putImageData(specImg, 0, 0);
    specTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- HUD
  let ui: {
    rot: HTMLInputElement; inc: Readout; dev: Readout; dmin: Readout; n: Readout; spread: Readout; status: HTMLElement;
    curve: { ctx: CanvasRenderingContext2D; width: number; height: number };
    zoom: { ctx: CanvasRenderingContext2D; width: number; height: number };
  } | null = null;

  function drawHud() {
    if (!ui) return;
    ui.inc.set(Number.isNaN(info.inc) ? '–' : `${fmt(info.inc, 1)}°`);
    const ok = info.tir === 0;
    ui.dev.set(ok ? `${fmt(info.dev, 2)}°` : t(L('totalreflektion', 'total internal reflection')));
    ui.dmin.set(Number.isNaN(info.dmin) ? t(L('finns inte (alltid totalreflektion)', 'none (always TIR)')) : `${fmt(info.dmin, 2)}°`);
    ui.n.set(fmt(info.n, 4));
    ui.spread.set(ok && !Number.isNaN(info.spread) ? `${fmt(info.spread, 2)}°` : '–');
    let s = L('Vrid prismat och se färgerna vandra över skärmen.', 'Turn the prism and watch the colours travel across the screen.');
    if (!ok) s = L('Ljuset studsar inuti glaset: totalreflektion! Infallsvinkeln mot den andra ytan är större än gränsvinkeln.', 'The light bounces inside the glass: total internal reflection! It meets the second face at more than the critical angle.');
    else if (!Number.isNaN(info.dmin) && Math.abs(info.dev - info.dmin) < 0.25) s = L('Minsta avböjning! Ljuset går symmetriskt genom prismat.', 'Minimum deviation! The light passes through the prism symmetrically.');
    else if (st.crucis && prism2.visible) s = L('Det andra, omvända prismat samlar färgerna till vitt ljus igen.', 'The second, reversed prism gathers the colours back into white light.');
    ui.status.textContent = t(s);
    drawCurve();
    drawZoom();
  }

  function drawCurve() {
    if (!ui) return;
    const { ctx: c, width: W, height: H } = ui.curve;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(0, 0, W, H);
    const devs = curve.map((p) => p.dev).filter((v) => !Number.isNaN(v));
    if (!devs.length) {
      c.fillStyle = '#ffb3d1';
      c.font = '13px system-ui';
      c.fillText(t(L('Allt ljus totalreflekteras i diamanten.', 'All light is totally reflected in the diamond.')), 10, H / 2);
      return;
    }
    const lo = Math.floor(Math.min(...devs) - 2);
    const hi = Math.min(lo + 60, Math.ceil(Math.max(...devs) + 2));
    const X = (r: number) => 30 + ((r - ROT_MIN) / (ROT_MAX - ROT_MIN)) * (W - 40);
    const Y = (d: number) => H - 18 - ((d - lo) / (hi - lo)) * (H - 30);
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = '11px system-ui';
    c.fillText(`${lo}°`, 2, Y(lo));
    c.fillText(`${hi}°`, 2, Y(hi) + 8);
    c.fillText(t(L('prismats vridning →', 'prism rotation →')), W - 120, H - 4);
    if (!Number.isNaN(info.dmin)) {
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(30, Y(info.dmin));
      c.lineTo(W - 10, Y(info.dmin));
      c.stroke();
      c.setLineDash([]);
      c.fillText('Dmin', W - 42, Y(info.dmin) - 4);
    }
    c.strokeStyle = '#ff5fa2';
    c.lineWidth = 2;
    c.beginPath();
    let pen = false;
    for (const p of curve) {
      if (Number.isNaN(p.dev) || p.dev > hi) {
        pen = false;
        continue;
      }
      if (!pen) c.moveTo(X(p.rot), Y(p.dev));
      else c.lineTo(X(p.rot), Y(p.dev));
      pen = true;
    }
    c.stroke();
    if (info.tir === 0 && !Number.isNaN(info.dev)) {
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(X(st.rot / DEG), Y(info.dev), 5, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawZoom() {
    if (!ui) return;
    const { ctx: c, width: W, height: H } = ui.zoom;
    c.fillStyle = '#120e16';
    c.fillRect(0, 0, W, H);
    let mid = 0;
    let cnt = 0;
    for (let i = 0; i < NS; i++) if (zoomOk[i]) {
      mid += zoomA[i];
      cnt++;
    }
    if (!cnt) {
      c.fillStyle = '#ffb3d1';
      c.font = '13px system-ui';
      c.fillText(t(L('Inget ljus når skärmen.', 'No light reaches the screen.')), 10, H / 2);
      return;
    }
    mid /= cnt;
    const span = 8; // degrees across the canvas
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NS; i++) {
      if (!zoomOk[i]) continue;
      const x = W / 2 + ((zoomA[i] - mid) / span) * W;
      const [r, gg, b] = spectralRGB(sampNm[i]);
      c.fillStyle = `rgb(${linToSrgb8(r * 0.5)},${linToSrgb8(gg * 0.5)},${linToSrgb8(b * 0.5)})`;
      c.fillRect(x - 2.5, 8, 5, H - 26);
    }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '11px system-ui';
    c.fillText(t(L('Skärmen förstorad (8° bredd)', 'Screen magnified (8° wide)')), 6, H - 5);
  }


  // ---------------------------------------------------------------- interaction
  const say = cooldown(9);
  let foundMin = false;
  let sawTir = false;
  let lastTick = 0;
  let movedSinceStart = false;

  function setRot(deg: number, fromSlider = false) {
    const v = THREE.MathUtils.clamp(deg, ROT_MIN, ROT_MAX);
    if (Math.abs(v - lastTick) >= 2) {
      ctx.sfx.tone(1800 + v * 8, 0.025, { type: 'triangle', gain: 0.03 });
      lastTick = v;
    }
    st.rot = v * DEG;
    movedSinceStart = true;
    st.dirty = true;
    if (ui && !fromSlider) ui.rot.value = String(v);
  }

  function milestones() {
    if (!movedSinceStart) return;
    if (info.tir > 0 && !sawTir && say()) {
      sawTir = true;
      ctx.sfx.noise(0.4, { freq: 2500, to: 600, gain: 0.08 });
      ctx.buddy.say(L('Oj! Ljuset kommer inte ut, det speglas inuti glaset. Det kallas totalreflektion.', 'Whoa! The light can’t get out, it mirrors inside the glass. That’s total internal reflection.'), { expression: 'surprised' });
    } else if (info.tir === 0 && !Number.isNaN(info.dmin) && Math.abs(info.dev - info.dmin) < 0.15 && !foundMin && say()) {
      foundMin = true;
      ctx.sfx.chime();
      ctx.buddy.celebrate(L(`Där! Minsta avböjningen, ${fmt(info.dmin, 1)} grader. Ljuset går rakt symmetriskt genom prismat.`, `There! Minimum deviation, ${fmt(info.dmin, 1)} degrees. The light crosses the prism symmetrically.`));
    }
  }

  ctx.interaction.add(prism, {
    label: L('Dra för att vrida prismat', 'Drag to turn the prism'),
    cursor: 'ew-resize',
    onDrag: (i) => setRot(st.rot / DEG + i.dx * 0.25),
  });
  ctx.interaction.add(turntable, {
    label: L('Dra för att vrida prismat', 'Drag to turn the prism'),
    cursor: 'ew-resize',
    onDrag: (i) => setRot(st.rot / DEG + i.dx * 0.25),
  });

  computeCurve();

  ctx.addStation({
    id: 'light-prism',
    title: L('Prismat och regnbågen', 'The prism and the rainbow'),
    position: [ROOM_X, ROOM_Z + 0.35],
    viewpoint: { position: [ROOM_X + 0.15, 1.85, ROOM_Z + 2.55], target: [ROOM_X + 0.3, 0.9, ROOM_Z - 0.3] },
    intro: L('Vitt ljus ser enfärgat ut, men det gömmer en hel regnbåge. Ska vi locka fram den med ett prisma?', 'White light looks like one colour, but it hides a whole rainbow. Shall we coax it out with a prism?'),
    howTo: L('Dra i prismat (eller använd reglaget) för att vrida det. Leta upp minsta avböjningen, byt glassort och prova det andra prismat.', 'Drag the prism (or use the slider) to turn it. Find the minimum deviation, switch glass and try the second prism.'),
    science: L(
      'Ljus saktar in i glas, och glasets brytningsindex n är lite större för violett ljus än för rött (N-BK7: 1,530 vid 400 nm men 1,513 vid 700 nm). Därför bryts varje färg olika mycket i de två ytorna enligt Snells lag, n₁·sin θ₁ = n₂·sin θ₂, och det vita ljuset solfjädrar ut till ett spektrum. Prismat tillför ingen färg, det sorterar bara de färger som redan fanns i det vita ljuset. Avböjningen är minst, för N-BK7 cirka 38,6°, när strålen går symmetriskt genom prismat. Om ljuset träffar den andra ytan för snett kan det inte komma ut: det totalreflekteras. Vi bortser från de svaga delreflexerna i ytorna.',
      'Light slows down in glass, and the glass’s refractive index n is slightly larger for violet than for red (N-BK7: 1.530 at 400 nm but 1.513 at 700 nm). So each colour bends a different amount at the two faces, following Snell’s law n₁·sin θ₁ = n₂·sin θ₂, and white light fans out into a spectrum. The prism adds no colour: it only sorts the colours that were already in the white light. The deviation is smallest, about 38.6° for N-BK7, when the ray passes through the prism symmetrically. If the light meets the second face too steeply it cannot get out: it is totally reflected. We ignore the weak partial reflections at each face.',
    ),
    wow: L('En regnbåge är samma sak: miljarder regndroppar fungerar som små prismor, och bågen ligger alltid 42° från skuggan av ditt huvud.', 'A rainbow is the same thing: billions of raindrops act as tiny prisms, and the bow always sits 42° from the shadow of your head.'),
    controls: (panel: ControlPanel) => {
      panel.heading(L('Glas', 'Glass'));
      panel.buttons(
        GLASSES.map((gl, i) => ({
          label: gl.name,
          onClick: () => {
            st.glass = i;
            foundMin = false;
            computeCurve();
            st.dirty = true;
          },
        })),
        st.glass,
      );
      const rot = panel.slider(L('Prismats vridning', 'Prism rotation'), { min: ROT_MIN, max: ROT_MAX, step: 0.1, value: st.rot / DEG, format: (v) => `${fmt(v, 1)}°` }, (v) => setRot(v, true));
      panel.toggle(L('Andra, omvända prismat (Newton)', 'Second, reversed prism (Newton)'), st.crucis, (v) => {
        st.crucis = v;
        st.dirty = true;
        if (v && say()) ctx.buddy.say(L('Newton vände ett andra prisma åt andra hållet, och färgerna blev vitt ljus igen!', 'Newton turned a second prism the other way, and the colours became white light again!'), { expression: 'idea' });
      });
      const inc = panel.readout(L('Infallsvinkel mot första ytan', 'Angle of incidence, first face'));
      const dev = panel.readout(L('Avböjning D (gult ljus, 589 nm)', 'Deviation D (yellow light, 589 nm)'));
      const dmin = panel.readout(L('Minsta avböjning Dmin', 'Minimum deviation Dmin'));
      const n = panel.readout(L('Brytningsindex n (589 nm)', 'Refractive index n (589 nm)'));
      const spread = panel.readout(L('Spektrumets bredd (färger som kommer ut)', 'Spectrum width (colours that get out)'));
      const curveC = panel.canvas(120);
      const zoomC = panel.canvas(70);
      const status = panel.note(L('', ''));
      ui = { rot, inc, dev, dmin, n, spread, status, curve: curveC, zoom: zoomC };
      drawHud();
      return () => {
        ui = null;
      };
    },
  });

  return {
    update(_dt: number, time: number) {
      if (st.dirty) {
        st.dirty = false;
        simulate();
        milestones();
      }
      lampGlow.material.opacity = 0.7 + Math.sin(time * 3) * 0.05;
    },
  };
}

export const _test = { BEAM_Z, GLASSES, makePoly, trace, minDeviation: (n: number) => (2 * Math.asin(n * 0.5) - APEX) / DEG };
