/** Lab atmosphere: a bubbling distillation island, shelves of coloured bottles, plants and posters. */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { L10n } from '../../core/types';
import { softDot, type Kit } from './common';
import { cabbageColor } from './ph';

function flaskProfile(r: number, h: number, neckR: number, neckH: number) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  pts.push(new THREE.Vector2(r, 0.004), new THREE.Vector2(r, h * 0.12));
  pts.push(new THREE.Vector2(neckR, h), new THREE.Vector2(neckR, h + neckH));
  return pts;
}

export function buildDecor(kit: Kit) {
  const { ctx, mats } = kit;
  const g = ctx.group;
  const tmp = new THREE.Color();
  const updates: ((dt: number, time: number, near: boolean) => void)[] = [];

  // ---------------------------------------------------------------- centre island: distillation
  const IX = 0, IZ = 0.2;
  const isl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.86, 32), mats.cabinet);
  isl.position.set(IX, 0.43, IZ);
  const islTop = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.05, 32), mats.benchTop);
  islTop.position.set(IX, 0.885, IZ);
  g.add(isl, islTop);
  kit.staticize(isl, islTop);
  ctx.addCollider(IX, IZ, 1.35, 1.35);
  const T = 0.91;
  // tripod + burner glow
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(kit.geos.cyl, mats.steel);
    const a = (i / 3) * Math.PI * 2;
    leg.scale.set(0.006, 0.2, 0.006);
    leg.position.set(IX - 0.2 + Math.cos(a) * 0.07, T + 0.1, IZ + Math.sin(a) * 0.07);
    g.add(leg);
    kit.staticize(leg);
  }
  const burnerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0x3a5cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  burnerGlow.position.set(IX - 0.2, T + 0.06, IZ);
  burnerGlow.scale.setScalar(0.12);
  g.add(burnerGlow);
  // round-bottom flask with glowing liquid
  const rbGlass = new THREE.Mesh(kit.geos.sphere, mats.glass);
  rbGlass.scale.setScalar(0.09);
  rbGlass.position.set(IX - 0.2, T + 0.29, IZ);
  const rbLiquid = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dffb5).multiplyScalar(0.7), transparent: true, opacity: 0.9 }));
  rbLiquid.scale.setScalar(0.084);
  rbLiquid.position.copy(rbGlass.position);
  const rbNeck = new THREE.Mesh(kit.geos.openCyl, mats.glass);
  rbNeck.scale.set(0.02, 0.12, 0.02);
  rbNeck.position.set(IX - 0.2, T + 0.42, IZ);
  // condenser tube going down to the right
  const cond = new THREE.Mesh(kit.geos.cyl, mats.glassRim);
  cond.scale.set(0.018, 0.42, 0.018);
  cond.position.set(IX + 0.0, T + 0.4, IZ);
  cond.rotation.z = -1.05;
  const condJacket = new THREE.Mesh(kit.geos.openCyl, mats.glass);
  condJacket.scale.set(0.035, 0.3, 0.035);
  condJacket.position.copy(cond.position);
  condJacket.rotation.z = -1.05;
  // receiving Erlenmeyer flask
  const erlGeo = new THREE.LatheGeometry(flaskProfile(0.07, 0.12, 0.02, 0.05), 20);
  const erl = new THREE.Mesh(erlGeo, mats.glass);
  erl.position.set(IX + 0.22, T, IZ);
  const erlLiqGeo = new THREE.LatheGeometry(flaskProfile(0.064, 0.05, 0.04, 0.0), 20);
  const erlLiq = new THREE.Mesh(erlLiqGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dffb5).multiplyScalar(0.6), transparent: true, opacity: 0.85 }));
  erlLiq.position.copy(erl.position);
  g.add(rbLiquid, rbGlass, rbNeck, cond, condJacket, erlLiq, erl);
  kit.staticize(rbLiquid, rbGlass, rbNeck, cond, condJacket, erlLiq, erl);
  // a few more flasks with coloured liquids
  const flaskColors = [0xff4f7a, 0x6a7cff, 0xffc04a];
  flaskColors.forEach((c, i) => {
    const a = 2.0 + i * 0.85;
    const x = IX + Math.cos(a) * 0.42, z = IZ + Math.sin(a) * 0.42;
    const f = new THREE.Mesh(erlGeo, mats.glass);
    f.position.set(x, T, z);
    f.scale.setScalar(0.8);
    const l = new THREE.Mesh(erlLiqGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.7), transparent: true, opacity: 0.88 }));
    l.position.copy(f.position);
    l.scale.setScalar(0.8);
    g.add(l, f);
    kit.staticize(l, f);
    updates.push((dt, _time, near) => {
      if (near && Math.random() < dt * 2.5) {
        kit.fx.bubbles.spawn(x + (Math.random() - 0.5) * 0.06, T + 0.006, z + (Math.random() - 0.5) * 0.06, 0, 0.04, 0, 1.2,
          tmp.setHex(c).multiplyScalar(0.45), T + 0.04);
      }
    });
  });
  updates.push((dt, time, near) => {
    burnerGlow.scale.setScalar(0.11 + 0.015 * Math.sin(time * 19));
    if (!near) return;
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.06;
      kit.fx.bubbles.spawn(IX - 0.2 + Math.cos(a) * r, T + 0.22, IZ + Math.sin(a) * r, 0, 0.08 + Math.random() * 0.06, 0, 1,
        tmp.setRGB(0.3, 0.7, 0.55), T + 0.3);
    }
    if (Math.random() < dt * 2.2) {
      kit.fx.steam.spawn(IX - 0.2, T + 0.5, IZ, (Math.random() - 0.5) * 0.04, 0.16, (Math.random() - 0.5) * 0.04, 3.2,
        tmp.setRGB(0.13, 0.15, 0.15));
    }
    if (Math.random() < dt * 0.6) {
      kit.fx.bigBubbles.spawn(IX + 0.22, T + 0.012, IZ, 0, 0.03, 0, 1.2, tmp.setRGB(0.2, 0.5, 0.4), T + 0.045);
      ctx.sfx.tone(700 + Math.random() * 400, 0.04, { type: 'sine', gain: 0.012 });
    }
  });

  // ---------------------------------------------------------------- shelves with bottles (front wall corners)
  const shelf = (x: number) => {
    const z = 8.72;
    const W = 2.4, H = 2.2, D = 0.4;
    for (const s of [-1, 1]) kit.box(0.05, H, D, mats.darkWood, x + (s * W) / 2, 0, z);
    const levels = [0.35, 0.95, 1.55, 2.15];
    for (const y of levels) kit.box(W, 0.04, D, mats.darkWood, x, y - 0.04, z);
    ctx.addCollider(x, z, W + 0.1, D + 0.1);
    // bottles, instanced
    const bottleGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0.003), new THREE.Vector2(0.05, 0.14), new THREE.Vector2(0.022, 0.18),
      new THREE.Vector2(0.018, 0.22), new THREE.Vector2(0, 0.22),
    ], 14);
    const cols = [0x7a3f1a, 0x2f6f4a, 0x2a4a8a, 0x9a2a3a, 0xc9a24a, 0x5a3a8a, 0xe8e2d0];
    const count = 30;
    const inst = new THREE.InstancedMesh(bottleGeo, new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.88 }), count);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let li = 0; li < 3 && k < count; li++) {
      for (let j = 0; j < 10 && k < count; j++) {
        if ((j * 7 + li * 3 + Math.round(x)) % 5 === 0) continue;
        const sc = 0.8 + ((j * 13 + li * 7) % 5) * 0.1;
        m4.makeScale(sc, sc, sc).setPosition(x - W / 2 + 0.17 + j * 0.23, levels[li], z - 0.02 + ((j % 2) - 0.5) * 0.12);
        inst.setMatrixAt(k, m4);
        inst.setColorAt(k, tmp.setHex(cols[(j + li * 3) % cols.length]));
        k++;
      }
    }
    inst.count = k;
    g.add(inst);
    // a big glowing jar on the top shelf
    const jar = new THREE.Mesh(kit.geos.cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dffb5).multiplyScalar(0.55), transparent: true, opacity: 0.85 }));
    jar.scale.set(0.09, 0.22, 0.09);
    jar.position.set(x + 0.7, levels[3] + 0.11, z);
    const jarGlass = new THREE.Mesh(kit.geos.openCyl, mats.glass);
    jarGlass.scale.set(0.1, 0.26, 0.1);
    jarGlass.position.set(x + 0.7, levels[3] + 0.13, z);
    g.add(jar, jarGlass);
    kit.staticize(jar, jarGlass);
    updates.push((dt, _t, near) => {
      if (near && Math.random() < dt * 1.5) {
        kit.fx.bubbles.spawn(x + 0.7 + (Math.random() - 0.5) * 0.1, levels[3] + 0.02, z + (Math.random() - 0.5) * 0.1, 0, 0.05, 0, 3,
          tmp.setRGB(0.15, 0.5, 0.35), levels[3] + 0.22);
      }
    });
  };
  shelf(-6.2);
  shelf(6.2);

  // ---------------------------------------------------------------- plants
  const plant = (x: number, z: number, s = 1) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.38 * s, 16), mats.pot);
    pot.position.set(x, 0.19 * s, z);
    g.add(pot);
    kit.staticize(pot);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 * s, 1), mats.plant);
    leaves.position.set(x, 0.62 * s, z);
    leaves.scale.set(1, 1.25, 1);
    g.add(leaves);
    ctx.addCollider(x, z, 0.45 * s, 0.45 * s);
    updates.push((_dt, time) => { leaves.rotation.y = Math.sin(time * 0.5 + x) * 0.08; });
  };
  plant(-3.2, 8.3);
  plant(3.2, 8.3);
  plant(-9.3, -3.4, 0.9);
  plant(9.3, -3.4, 0.9);
  plant(-9.3, 5.2, 1.1);
  plant(9.3, 5.2, 1.1);

  // ---------------------------------------------------------------- posters
  const poster = (x: number, z: number, ry: number, title: L10n, draw: (gc: CanvasRenderingContext2D, W: number, H: number) => void) => {
    const p = kit.canvasPlane(1.1, 1.45, 512, (gc, W, H) => {
      gc.fillStyle = '#f3ead9';
      gc.fillRect(0, 0, W, H);
      gc.strokeStyle = '#3dbf8f';
      gc.lineWidth = 10;
      gc.strokeRect(10, 10, W - 20, H - 20);
      gc.fillStyle = '#2b1d12';
      gc.font = '800 44px "Baloo 2", system-ui, sans-serif';
      gc.textAlign = 'center';
      gc.textBaseline = 'middle';
      gc.fillText(t(title), W / 2, 70);
      draw(gc, W, H);
    }, false);
    p.mesh.position.set(x, 2.45, z);
    p.mesh.rotation.y = ry;
    g.add(p.mesh);
    kit.box(0.03, 1.53, 1.18, mats.darkWood, x + (ry > 0 ? -0.02 : 0.02), 2.45 - 0.765, z);
    onLangChange(() => p.redraw());
  };
  const rows = (gc: CanvasRenderingContext2D, W: number, items: [string, L10n][], y0: number, step: number, emojiSize = 52) => {
    items.forEach(([icon, text], i) => {
      const y = y0 + i * step;
      gc.font = `${emojiSize}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      gc.textAlign = 'center';
      gc.fillText(icon, 80, y);
      gc.font = '600 30px "Baloo 2", system-ui, sans-serif';
      gc.textAlign = 'left';
      gc.fillStyle = '#3b2a1c';
      wrapText(gc, t(text), 130, y, W - 160, 32);
    });
  };
  poster(-9.95, 6.9, Math.PI / 2, L('Säkert i labbet', 'Safe in the lab'), (gc, W) => rows(gc, W, [
    ['🥽', L('Skyddsglasögon på', 'Goggles on')],
    ['🧤', L('Handskar för starka ämnen', 'Gloves for strong chemicals')],
    ['🧑‍🔬', L('Alltid med en vuxen', 'Always with an adult')],
    ['👃', L('Vifta, sniffa inte direkt', 'Waft, don\'t sniff directly')],
    ['🚫', L('Smaka aldrig i labbet', 'Never taste in the lab')],
  ], 170, 135));
  poster(-9.95, -4.6, Math.PI / 2, L('Fyrverkeriets färger', 'Firework colours'), (gc, W) => rows(gc, W, [
    ['🔴', L('Strontium: rött', 'Strontium: red')],
    ['🟠', L('Kalcium: orange', 'Calcium: orange')],
    ['🟡', L('Natrium: gult', 'Sodium: yellow')],
    ['🟢', L('Barium: grönt', 'Barium: green')],
    ['🔵', L('Koppar: blått', 'Copper: blue')],
    ['🟣', L('Strontium + koppar: lila', 'Strontium + copper: purple')],
  ], 160, 112, 46));
  poster(-9.95, 0.6, Math.PI / 2, L('pH-skalan', 'The pH scale'), (gc, W, H) => {
    const x0 = 70, x1 = W - 70, y0 = 140, y1 = H - 60;
    for (let y = y0; y < y1; y++) {
      const pH = ((y - y0) / (y1 - y0)) * 14;
      cabbageColor(pH, tmp);
      gc.fillStyle = `#${tmp.getHexString()}`;
      gc.fillRect(x0, y, 70, 1.5);
    }
    const ex: [number, L10n][] = [[0, L('0  starkt surt', '0  strongly acidic')], [2, L('2  citron', '2  lemon')], [3, L('3  ättika', '3  vinegar')],
      [7, L('7  neutralt vatten', '7  neutral water')], [8.3, L('8  bikarbonat', '8  baking soda')], [11, L('11  ammoniak', '11  ammonia')],
      [14, L('14  starkt basiskt', '14  strongly basic')]];
    gc.font = '600 28px "Baloo 2", system-ui, sans-serif';
    gc.textAlign = 'left';
    gc.fillStyle = '#3b2a1c';
    for (const [p, text] of ex) gc.fillText(t(text), x0 + 90, y0 + (p / 14) * (y1 - y0));
    void x1;
  });
  poster(9.95, -4.6, -Math.PI / 2, L('Tre tillstånd', 'Three states'), (gc, W) => {
    const names: L10n[] = [L('Fast', 'Solid'), L('Flytande', 'Liquid'), L('Gas', 'Gas')];
    names.forEach((n, i) => {
      const y = 150 + i * 220;
      gc.strokeStyle = '#3b2a1c';
      gc.lineWidth = 4;
      gc.strokeRect(50, y, 190, 170);
      gc.fillStyle = ['#4f8cff', '#2fbf9a', '#ff7a3a'][i];
      for (let k = 0; k < 16; k++) {
        let px: number, py: number;
        if (i === 0) { px = 75 + (k % 4) * 46; py = y + 30 + Math.floor(k / 4) * 38; }
        else if (i === 1) { px = 70 + ((k * 37) % 150); py = y + 80 + ((k * 23) % 80); }
        else { px = 70 + ((k * 61) % 160); py = y + 20 + ((k * 43) % 140); if (k > 7) continue; }
        gc.beginPath();
        gc.arc(px, py, 15, 0, Math.PI * 2);
        gc.fill();
      }
      gc.fillStyle = '#2b1d12';
      gc.font = '700 38px "Baloo 2", system-ui, sans-serif';
      gc.textAlign = 'left';
      gc.fillText(t(n), 270, y + 85);
    });
    void W;
  });

  poster(9.95, 6.9, -Math.PI / 2, L('Svensk kemi', 'Swedish chemistry'), (gc, W) => rows(gc, W, [
    ['🔥', L('Scheele upptäckte syret, cirka 1771', 'Scheele discovered oxygen, around 1771')],
    ['🔤', L('Berzelius gav grundämnena bokstäver: H, O, C', 'Berzelius gave the elements letters: H, O, C')],
    ['🍋', L('Arrhenius: syror ger vätejoner, H⁺', 'Arrhenius: acids give hydrogen ions, H⁺')],
    ['🏅', L('Nobel uppfann dynamiten och nobelpriset', 'Nobel invented dynamite and the Nobel Prize')],
  ], 180, 165, 56));

  return {
    update(dt: number, time: number, near: boolean) {
      for (const u of updates) u(dt, time, near);
    },
  };
}

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  const y0 = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
}
