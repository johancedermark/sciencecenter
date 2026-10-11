/** Room atmosphere: dark velvet drapes, fairy lights, an infinity mirror, an EM-spectrum poster, a suncatcher and plants. */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { RoomContext } from '../../core/types';
import { linToSrgb8, mats, merged, rbox, spectralRGB } from './common';

const W = 10;
const D = 9;

export function buildDecor(ctx: RoomContext) {
  const g = new THREE.Group();
  ctx.group.add(g);

  // ---------------------------------------------------------------- velvet drapes (one merged mesh)
  const drapeGeo = (w: number, h: number) => {
    const geo = new THREE.PlaneGeometry(w, h, Math.max(8, Math.round(w * 10)), 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.035 * Math.sin(p.getX(i) * 13) + 0.015 * Math.sin(p.getX(i) * 31));
    geo.computeVertexNormals();
    return geo;
  };
  const Y0 = 0.95;
  const Y1 = 4.1;
  const H = Y1 - Y0;
  const YC = (Y0 + Y1) / 2;
  const drapes = merged(
    [
      { geo: drapeGeo(2 * W, H), pos: [0, YC, -D + 0.07] },
      { geo: drapeGeo(2 * D, H), pos: [-W + 0.07, YC, 0], rot: [0, Math.PI / 2, 0] },
      { geo: drapeGeo(2 * D, H), pos: [W - 0.07, YC, 0], rot: [0, -Math.PI / 2, 0] },
      { geo: drapeGeo(W - 1.75, H), pos: [-(W + 1.75) / 2, YC, D - 0.07], rot: [0, Math.PI, 0] },
      { geo: drapeGeo(W - 1.75, H), pos: [(W + 1.75) / 2, YC, D - 0.07], rot: [0, Math.PI, 0] },
    ],
    new THREE.MeshStandardMaterial({ color: 0x2a1d3a, roughness: 0.95, metalness: 0 }),
  );
  g.add(drapes);
  // brass curtain rails
  const rails = merged(
    [
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 2 * W), pos: [0, Y1 + 0.04, -D + 0.1], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 2 * D), pos: [-W + 0.1, Y1 + 0.04, 0], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 2 * D), pos: [W - 0.1, Y1 + 0.04, 0], rot: [Math.PI / 2, 0, 0] },
    ],
    mats.brass,
  );
  g.add(rails);

  // ---------------------------------------------------------------- fairy lights along the rails
  const fairyPts: THREE.Vector3[] = [];
  const garland = (a: THREE.Vector3, b: THREE.Vector3, n: number, swags: number) => {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p = a.clone().lerp(b, u);
      const s = (u * swags) % 1;
      p.y -= 0.28 * 4 * s * (1 - s);
      fairyPts.push(p);
    }
  };
  garland(new THREE.Vector3(-W + 0.3, Y1, -D + 0.15), new THREE.Vector3(W - 0.3, Y1, -D + 0.15), 90, 8);
  garland(new THREE.Vector3(-W + 0.15, Y1, -D + 0.3), new THREE.Vector3(-W + 0.15, Y1, D - 0.3), 80, 7);
  garland(new THREE.Vector3(W - 0.15, Y1, -D + 0.3), new THREE.Vector3(W - 0.15, Y1, D - 0.3), 80, 7);
  const fairy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), fairyPts.length);
  const m4 = new THREE.Matrix4();
  fairyPts.forEach((p, i) => fairy.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  const fairyHue = fairyPts.map((_, i) => (i * 0.137) % 1);
  const fairyPhase = fairyPts.map((_, i) => (i * 2.399) % (Math.PI * 2));
  const col = new THREE.Color();
  fairyPts.forEach((_, i) => fairy.setColorAt(i, col.setHSL(fairyHue[i], 0.9, 0.6)));
  g.add(fairy);

  // ---------------------------------------------------------------- infinity mirror (back wall, left)
  const IM = { x: -4.7, y: 2.45, z: -D + 0.16, size: 1.3 };
  const imFrame = merged(
    [
      { geo: rbox(IM.size + 0.16, 0.1, 0.12, 0.03), pos: [0, IM.size / 2 + 0.05, 0] },
      { geo: rbox(IM.size + 0.16, 0.1, 0.12, 0.03), pos: [0, -IM.size / 2 - 0.05, 0] },
      { geo: rbox(0.1, IM.size, 0.12, 0.03), pos: [-IM.size / 2 - 0.03, 0, 0] },
      { geo: rbox(0.1, IM.size, 0.12, 0.03), pos: [IM.size / 2 + 0.03, 0, 0] },
    ],
    mats.darkWood,
  );
  imFrame.position.set(IM.x, IM.y, IM.z + 0.06);
  g.add(imFrame);
  const imBack = new THREE.Mesh(new THREE.PlaneGeometry(IM.size, IM.size), new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 0.08, metalness: 1 }));
  imBack.position.set(IM.x, IM.y, IM.z + 0.02);
  g.add(imBack);
  const RINGS = 14;
  const PER = 36;
  const leds = new THREE.InstancedMesh(new THREE.CircleGeometry(0.014, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), RINGS * PER);
  for (let r = 0; r < RINGS; r++) {
    // each reflection pair sits one mirror-gap deeper: perspective shrinks it
    const s = Math.pow(0.84, r);
    for (let k = 0; k < PER; k++) {
      const a = (k / PER) * Math.PI * 2;
      // rounded-square LED path
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      const sq = Math.pow(Math.pow(Math.abs(cx), 4) + Math.pow(Math.abs(cy), 4), -0.25);
      const R = (IM.size / 2 - 0.08) * s;
      m4.makeScale(Math.max(0.35, s), Math.max(0.35, s), 1).setPosition(IM.x + cx * sq * R, IM.y + cy * sq * R, IM.z + 0.03 + r * 0.0005);
      leds.setMatrixAt(r * PER + k, m4);
      leds.setColorAt(r * PER + k, col.setRGB(1, 1, 1));
    }
  }
  g.add(leds);
  const imLabel = textPlaque(L('Oändlighetsspegel: två speglar som speglar varandra', 'Infinity mirror: two mirrors reflecting each other'), 1.5, 0.14);
  imLabel.position.set(IM.x, IM.y - IM.size / 2 - 0.25, IM.z + 0.03);
  g.add(imLabel);

  // ---------------------------------------------------------------- EM spectrum poster (back wall, right)
  const posterC = document.createElement('canvas');
  posterC.width = 1024;
  posterC.height = 512;
  const posterTex = new THREE.CanvasTexture(posterC);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  posterTex.anisotropy = 8;
  const drawPoster = () => drawSpectrumPoster(posterC.getContext('2d')!, posterTex);
  drawPoster();
  onLangChange(drawPoster);
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshStandardMaterial({ map: posterTex, emissive: 0xffffff, emissiveMap: posterTex, emissiveIntensity: 0.28, roughness: 0.8 }),
  );
  poster.position.set(4.7, 2.45, -D + 0.16);
  g.add(poster);
  const posterFrame = merged(
    [
      { geo: new THREE.BoxGeometry(2.52, 0.05, 0.04), pos: [0, 0.625, 0] },
      { geo: new THREE.BoxGeometry(2.52, 0.05, 0.04), pos: [0, -0.625, 0] },
      { geo: new THREE.BoxGeometry(0.05, 1.3, 0.04), pos: [-1.235, 0, 0] },
      { geo: new THREE.BoxGeometry(0.05, 1.3, 0.04), pos: [1.235, 0, 0] },
    ],
    mats.brass,
  );
  posterFrame.position.set(4.7, 2.45, -D + 0.16);
  g.add(posterFrame);

  // ---------------------------------------------------------------- suncatcher crystal + wandering rainbows on the floor
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshPhysicalMaterial({ color: 0xf2fbff, roughness: 0, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, emissive: 0xb0d8ff, emissiveIntensity: 0.25, flatShading: true }),
  );
  crystal.scale.y = 1.6;
  crystal.position.set(0, 3.5, 0.6);
  g.add(crystal);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 2.2), mats.brass);
  string.position.set(0, 3.5 + 0.25 + 1.1, 0.6);
  g.add(string);
  const rbC = document.createElement('canvas');
  rbC.width = 128;
  rbC.height = 32;
  const rbg = rbC.getContext('2d')!;
  const img = rbg.createImageData(128, 32);
  for (let x = 0; x < 128; x++) {
    const [r, gg, b] = spectralRGB(400 + (x / 127) * 300);
    const ax = Math.sin((x / 127) * Math.PI);
    for (let y = 0; y < 32; y++) {
      const ay = Math.sin(((y + 0.5) / 32) * Math.PI);
      const i = (y * 128 + x) * 4;
      img.data[i] = linToSrgb8(r);
      img.data[i + 1] = linToSrgb8(gg);
      img.data[i + 2] = linToSrgb8(b);
      img.data[i + 3] = Math.round(255 * ax * ay * 0.9);
    }
  }
  rbg.putImageData(img, 0, 0);
  const rbTex = new THREE.CanvasTexture(rbC);
  rbTex.colorSpace = THREE.SRGBColorSpace;
  const RB = 7;
  const rainbows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.42, 0.11).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: rbTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.8 }),
    RB,
  );
  rainbows.position.y = 0.014;
  g.add(rainbows);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();

  // ---------------------------------------------------------------- bench and plants
  const bench = merged(
    [
      { geo: rbox(1.6, 0.07, 0.45, 0.03), pos: [0, 0.45, 0] },
      { geo: rbox(1.6, 0.4, 0.06, 0.03), pos: [0, 0.75, -0.2], rot: [-0.12, 0, 0] },
      { geo: new THREE.BoxGeometry(0.07, 0.45, 0.4), pos: [-0.7, 0.225, 0] },
      { geo: new THREE.BoxGeometry(0.07, 0.45, 0.4), pos: [0.7, 0.225, 0] },
    ],
    mats.wood,
  );
  bench.position.set(-6.2, 0, 7.6);
  g.add(bench);
  ctx.addCollider(-6.2, 7.6, 1.7, 0.6);
  const potGeo = new THREE.CylinderGeometry(0.28, 0.2, 0.5, 20).translate(0, 0.25, 0);
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb4643a, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.7, flatShading: true });
  const leafParts = Array.from({ length: 9 }, (_, i) => {
    const a = i * 2.4;
    const r = i === 0 ? 0 : 0.18 + (i % 3) * 0.06;
    return { geo: new THREE.IcosahedronGeometry(0.2 + (i % 2) * 0.06, 0), pos: [Math.cos(a) * r, 0.75 + (i % 4) * 0.18, Math.sin(a) * r] as THREE.Vector3Tuple };
  });
  const leafGeo = merged(leafParts, leafMat).geometry;
  for (const [x, z] of [[-9.2, 8.2], [9.2, 8.2], [9.2, 5.6]] as const) {
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.set(x, 0, z);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(x, 0, z);
    leaves.rotation.y = x * z;
    g.add(pot, leaves);
    ctx.addCollider(x, z, 0.6, 0.6);
  }

  return {
    update(_dt: number, time: number) {
      // twinkling fairy lights
      for (let i = 0; i < fairyPts.length; i++) {
        const tw = 0.55 + 0.45 * Math.sin(time * 1.7 + fairyPhase[i]);
        col.setHSL((fairyHue[i] + time * 0.01) % 1, 0.85, 0.5).multiplyScalar(0.7 + tw * 0.9);
        fairy.setColorAt(i, col);
      }
      fairy.instanceColor!.needsUpdate = true;
      // infinity mirror: a rainbow chase that fades with depth
      for (let r = 0; r < RINGS; r++) {
        const fade = Math.pow(0.8, r);
        for (let k = 0; k < PER; k++) {
          const hue = (k / PER + time * 0.08 + r * 0.015) % 1;
          col.setHSL(hue, 1, 0.55).multiplyScalar(fade * 1.7);
          leds.setColorAt(r * PER + k, col);
        }
      }
      leds.instanceColor!.needsUpdate = true;
      // suncatcher
      crystal.rotation.y = time * 0.25;
      crystal.position.y = 3.5 + Math.sin(time * 0.7) * 0.02;
      for (let i = 0; i < RB; i++) {
        const a = time * 0.25 * 2 + (i / RB) * Math.PI * 2;
        const rr = 1.6 + (i % 3) * 0.9;
        tmp.set(Math.cos(a) * rr, 0, 0.6 + Math.sin(a) * rr * 0.8);
        q.setFromAxisAngle(up, -a + Math.PI / 2);
        m4.compose(tmp, q, one);
        rainbows.setMatrixAt(i, m4);
      }
      rainbows.instanceMatrix.needsUpdate = true;
    },
  };
}

function textPlaque(text: ReturnType<typeof L>, w: number, h: number) {
  const px = 1024;
  const ph = Math.round((px * h) / w);
  const c = document.createElement('canvas');
  c.width = px;
  c.height = ph;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, px, ph);
    g.font = `600 ${Math.round(ph * 0.34)}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f4d9ff';
    g.shadowColor = '#ff5fa2';
    g.shadowBlur = 12;
    g.fillText(t(text), px / 2, ph / 2);
    tex.needsUpdate = true;
  };
  draw();
  onLangChange(draw);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

function drawSpectrumPoster(g: CanvasRenderingContext2D, tex: THREE.Texture) {
  const Wd = 1024;
  const Ht = 512;
  g.fillStyle = '#1d1630';
  g.fillRect(0, 0, Wd, Ht);
  g.fillStyle = '#ffe9f4';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 46px "Baloo 2", system-ui, sans-serif';
  g.fillText(t(L('Det elektromagnetiska spektrumet', 'The electromagnetic spectrum')), Wd / 2, 46);

  // wave with increasing frequency
  g.strokeStyle = '#ffb3d6';
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 40; x <= Wd - 40; x++) {
    const u = (x - 40) / (Wd - 80);
    const phase = 2 * Math.PI * (Math.pow(60, u) - 1) * 0.9;
    const y = 128 + Math.sin(phase) * 22;
    if (x === 40) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  const bands: { name: ReturnType<typeof L>; lam: string; c: string }[] = [
    { name: L('Radio', 'Radio'), lam: '> 1 m', c: '#7b5cff' },
    { name: L('Mikrovågor', 'Microwaves'), lam: '1 mm–1 m', c: '#5f7bff' },
    { name: L('Infrarött', 'Infrared'), lam: '0,75–1000 µm', c: '#b0404a' },
    { name: L('Synligt', 'Visible'), lam: '380–750 nm', c: '' },
    { name: L('UV', 'UV'), lam: '10–380 nm', c: '#8b3dff' },
    { name: L('Röntgen', 'X-rays'), lam: '0,01–10 nm', c: '#5ab0ff' },
    { name: L('Gamma', 'Gamma'), lam: '< 0,01 nm', c: '#64ffd0' },
  ];
  const x0 = 40;
  const bw = (Wd - 80) / bands.length;
  const y0 = 170;
  const bh = 70;
  bands.forEach((b, i) => {
    const x = x0 + i * bw;
    if (b.c) {
      g.fillStyle = b.c;
      g.globalAlpha = 0.75;
      g.fillRect(x + 2, y0, bw - 4, bh);
      g.globalAlpha = 1;
    } else {
      for (let k = 0; k < bw - 4; k++) {
        const [r, gg, bb] = spectralRGB(750 - (k / (bw - 4)) * 370);
        g.fillStyle = `rgb(${linToSrgb8(r)},${linToSrgb8(gg)},${linToSrgb8(bb)})`;
        g.fillRect(x + 2 + k, y0, 1, bh);
      }
    }
    g.fillStyle = '#fff';
    g.font = '700 22px system-ui, sans-serif';
    g.fillText(t(b.name), x + bw / 2, y0 + bh + 22);
    g.fillStyle = '#d7c8ee';
    g.font = '500 16px system-ui, sans-serif';
    const lam = b.lam;
    g.fillText(t(L(lam, lam.replace(/(\d),(\d)/g, '$1.$2'))), x + bw / 2, y0 + bh + 46);
  });
  g.font = '500 18px system-ui, sans-serif';
  g.fillStyle = '#d7c8ee';
  g.textAlign = 'left';
  g.fillText(t(L('← längre våglängd, lägre energi', '← longer wavelength, lower energy')), 40, 355);
  g.textAlign = 'right';
  g.fillText(t(L('kortare våglängd, högre energi →', 'shorter wavelength, higher energy →')), Wd - 40, 355);

  // zoomed visible band
  const vx0 = 200;
  const vx1 = Wd - 200;
  const vy = 392;
  for (let x = vx0; x <= vx1; x++) {
    const nm = 750 - ((x - vx0) / (vx1 - vx0)) * 370;
    const [r, gg, b] = spectralRGB(nm);
    const fade = Math.min(1, (nm - 380) / 40, (750 - nm) / 50);
    g.fillStyle = `rgb(${linToSrgb8(r * fade)},${linToSrgb8(gg * fade)},${linToSrgb8(b * fade)})`;
    g.fillRect(x, vy, 1, 46);
  }
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = '500 16px system-ui, sans-serif';
  for (const nm of [700, 600, 500, 400]) {
    const x = vx0 + ((750 - nm) / 370) * (vx1 - vx0);
    g.fillRect(x - 1, vy + 46, 2, 8);
    g.fillText(`${nm} nm`, x, vy + 66);
  }
  g.font = '600 19px system-ui, sans-serif';
  g.fillStyle = '#ffd6ea';
  g.fillText(t(L('Allt vi kan se är den här lilla biten. Allt färdas med 299 792 km/s.', 'All we can see is this tiny slice. All of it travels at 299,792 km/s.')), Wd / 2, Ht - 22);
  tex.needsUpdate = true;
}
