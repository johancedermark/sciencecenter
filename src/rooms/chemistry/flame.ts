/** Station 1: flame tests in a glowing fume hood, with a spectroscope showing the real emission lines. */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { L10n } from '../../core/types';
import { fmt, softDot, type Kit, type StationRuntime } from './common';
import { drawSpectrum, type Line } from './spectrum';

interface Salt {
  key: string;
  formula: string;
  name: L10n;
  color: number;
  /** Seen through cobalt-blue glass (it blocks yellow, passes blue and deep red). */
  cobalt: number;
  /** Seconds before the salt has burnt off the loop. */
  life: number;
  lines: Line[];
  firework: L10n;
  powder: number;
}

const HC = 1239.84; // h·c in eV·nm

const SALTS: Salt[] = [
  {
    key: 'Li', formula: 'LiCl', name: L('Litiumklorid', 'Lithium chloride'), color: 0xff1a40, cobalt: 0xc0206a, life: 7,
    lines: [[670.8, 1, 0], [610.4, 0.14, 0], [460.3, 0.05, 0]], powder: 0xf4f2ee,
    firework: L('Litium ger karminrött. Linjen på 670,8 nm är så stark att den syns även i ljuset från fjärran stjärnor.',
      'Lithium gives crimson. The 670.8 nm line is so strong it shows up even in light from distant stars.'),
  },
  {
    key: 'Na', formula: 'NaCl', name: L('Natriumklorid (koksalt)', 'Sodium chloride (table salt)'), color: 0xffa21a, cobalt: 0x1a2a70, life: 14,
    lines: [[589.0, 1, 0], [589.6, 0.55, 0]], powder: 0xffffff,
    firework: L('Natrium ger guldgult. Ett enda saltkorn färgar lågan i flera sekunder, så fyrverkerimakare håller natrium borta från andra färger.',
      'Sodium gives golden yellow. A single grain colours the flame for seconds, so firework makers keep sodium away from other colours.'),
  },
  {
    key: 'K', formula: 'KCl', name: L('Kaliumklorid', 'Potassium chloride'), color: 0xc49aff, cobalt: 0xd040a0, life: 6,
    lines: [[766.5, 1, 0], [769.9, 0.6, 0], [404.4, 0.32, 0], [404.7, 0.2, 0]], powder: 0xf6f6f6,
    firework: L('Kalium ger en svag lila färg. Det mesta av ljuset ligger på 766 och 770 nm, nästan i infrarött där ögat knappt ser.',
      'Potassium gives a faint lilac. Most of its light is at 766 and 770 nm, almost in the infrared where the eye barely sees.'),
  },
  {
    key: 'Ca', formula: 'CaCl₂', name: L('Kalciumklorid', 'Calcium chloride'), color: 0xff6424, cobalt: 0x7fd08a, life: 7,
    lines: [[422.7, 0.35, 0], [554, 0.7, 4], [604, 0.4, 4], [622, 1, 6]], powder: 0xf0eee8,
    firework: L('Kalcium ger orange-tegelrött, mest från molekylen CaOH som bildas i lågan.',
      'Calcium gives orange to brick red, mostly from the molecule CaOH that forms in the flame.'),
  },
  {
    key: 'Sr', formula: 'SrCl₂', name: L('Strontiumklorid', 'Strontium chloride'), color: 0xff1c10, cobalt: 0x9a2a90, life: 7,
    lines: [[460.7, 0.35, 0], [606, 0.6, 4], [640.8, 0.4, 0], [659, 0.5, 4], [682, 1, 5]], powder: 0xf4f4f0,
    firework: L('Strontium ger de klarröda fyrverkerierna och nödblossen, mest från SrOH-band runt 606 och 682 nm.',
      'Strontium gives the bright red fireworks and flares, mostly from SrOH bands around 606 and 682 nm.'),
  },
  {
    key: 'Ba', formula: 'BaCl₂', name: L('Bariumklorid', 'Barium chloride'), color: 0xaaff6a, cobalt: 0x50c0a0, life: 7,
    lines: [[455.4, 0.15, 0], [487, 0.35, 4], [513, 0.6, 5], [524, 0.45, 4], [553.5, 1, 0]], powder: 0xf2f4f2,
    firework: L('Barium ger de gröna fyrverkerierna: atomlinjen 553,5 nm plus BaOH- och BaCl-band.',
      'Barium gives green fireworks: the 553.5 nm atomic line plus BaOH and BaCl bands.'),
  },
  {
    key: 'Cu', formula: 'CuCl₂', name: L('Kopparklorid', 'Copper chloride'), color: 0x22e6c8, cobalt: 0x3a70ff, life: 7,
    lines: [[428, 0.35, 3], [435, 0.5, 3], [443, 0.55, 3], [452, 0.45, 3], [479, 0.6, 3], [488, 0.65, 3], [498, 0.5, 3],
      [510.6, 0.45, 0], [515.3, 0.4, 0], [521.8, 0.5, 0], [535, 0.35, 8]], powder: 0x4fbfa8,
    firework: L('Koppar ger blått och blågrönt, främst från CuCl-molekyler. Blått är den svåraste fyrverkerifärgen.',
      'Copper gives blue and blue-green, mostly from CuCl molecules. Blue is the hardest firework colour to make.'),
  },
];

const MIX: Salt = {
  key: 'NaK', formula: 'NaCl+KCl', name: L('Blandning: natrium + kalium', 'Mixture: sodium + potassium'), color: 0xffa21a, cobalt: 0xd040a0, life: 10,
  lines: [...SALTS[1].lines, ...SALTS[2].lines], powder: 0xfafafa,
  firework: L('Natriums gula ljus dränker kaliums svaga lila. Titta genom koboltglaset: det stoppar gult, och kaliums färg syns!',
    'Sodium\'s yellow drowns potassium\'s faint lilac. Look through the cobalt glass: it blocks yellow, and potassium\'s colour appears!'),
};

const FLAME_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uH;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 p = position;
    vH = clamp(p.y / uH + 0.5, 0.0, 1.0);
    float f = sin(uTime * 23.0 + p.y * 60.0) * 0.5 + sin(uTime * 37.0 + p.y * 90.0) * 0.5;
    p.x += f * 0.004 * vH;
    p.z += cos(uTime * 29.0 + p.y * 70.0) * 0.003 * vH;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FLAME_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float a = uAlpha * smoothstep(1.0, 0.15, vH) * (0.25 + 0.75 * pow(facing, 1.4));
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

function flameMat(h: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uH: { value: h }, uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function buildFlame(kit: Kit): StationRuntime {
  const { ctx, mats } = kit;
  const HX = -6.5, HZ = -8.35;
  const top = 0.9;

  // ---------------------------------------------------------------- fume hood
  kit.bench(HX, HZ, 2.6, 1.1);
  ctx.addCollider(HX, HZ - 0.05, 2.7, 1.25);
  const backMat = new THREE.MeshStandardMaterial({ color: 0x9fbcb0, emissive: 0x2f7a62, emissiveIntensity: 0.22, roughness: 0.85 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.48, 1.42), backMat);
  back.position.set(HX, top + 0.71, HZ - 0.52);
  ctx.group.add(back);
  for (const sx of [-1, 1]) kit.box(0.07, 1.45, 1.1, mats.cabinet, HX + sx * 1.265, top, HZ);
  kit.box(2.62, 0.48, 1.14, mats.cabinet, HX, top + 1.42, HZ);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.08), new THREE.MeshBasicMaterial({ color: 0x9fd8c0 }));
  strip.rotation.x = Math.PI / 2;
  strip.position.set(HX, top + 1.41, HZ - 0.2);
  ctx.group.add(strip);
  const sash = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 0.55), mats.glass);
  sash.position.set(HX, top + 1.14, HZ + 0.53);
  ctx.group.add(sash);
  const sashBar = new THREE.Mesh(kit.geos.cyl, mats.brass);
  sashBar.scale.set(0.015, 2.4, 0.015);
  sashBar.rotation.z = Math.PI / 2;
  sashBar.position.set(HX, top + 0.86, HZ + 0.56);
  ctx.group.add(sashBar);
  const duct = new THREE.Mesh(kit.geos.cyl, mats.steel);
  duct.scale.set(0.17, 3.3, 0.17);
  duct.position.set(HX, top + 1.9 + 1.65, HZ - 0.25);
  ctx.group.add(duct);
  kit.staticize(back, strip, sash, sashBar, duct);

  // spectroscope screen on the hood's top housing
  let screenGain = 0, screenBurner = 0.3;
  let screenSalt: Salt | null = null;
  const screen = kit.canvasPlane(1.5, 0.36, 768, (g, W, H) => {
    drawSpectrum(g, W, H, screenSalt?.lines ?? [], screenGain, screenBurner, {
      scale: W / 380, labels: true, irLabel: 'IR',
    });
  });
  screen.mesh.position.set(HX, top + 1.66, HZ + 0.575);
  ctx.group.add(screen.mesh);
  const screenTitle = kit.label(() => t(L('🔭 Spektroskop', '🔭 Spectroscope')), 0.5, 0.09, {
    bg: 'rgba(0,0,0,0)', color: '#f6e7c8', px: 256,
  });
  screenTitle.mesh.position.set(HX - 0.98, top + 1.82, HZ + 0.576);
  ctx.group.add(screenTitle.mesh);

  // ---------------------------------------------------------------- burner
  const BX = HX + 0.15, BZ = HZ + 0.05;
  const base = new THREE.Mesh(kit.geos.cyl, mats.steel);
  base.scale.set(0.07, 0.025, 0.07);
  base.position.set(BX, top + 0.0125, BZ);
  const tube = new THREE.Mesh(kit.geos.cyl, mats.brass);
  tube.scale.set(0.017, 0.15, 0.017);
  tube.position.set(BX, top + 0.1, BZ);
  const collar = new THREE.Mesh(kit.geos.cyl, mats.brass);
  collar.scale.set(0.024, 0.03, 0.024);
  collar.position.set(BX, top + 0.05, BZ);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.009, 6, 20, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0xc8582f, roughness: 0.6 }));
  hose.position.set(BX + 0.06, top + 0.01, BZ - 0.14);
  hose.rotation.x = -Math.PI / 2;
  ctx.group.add(base, tube, collar, hose);
  kit.staticize(base, tube, collar, hose);

  const FY = top + 0.175;
  const innerH = 0.08, outerH = 0.26;
  const innerMat = flameMat(innerH);
  const outerMat = flameMat(outerH);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.013, innerH, 16, 6, true), innerMat);
  inner.position.set(BX, FY + innerH / 2, BZ);
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.034, outerH, 18, 10, true), outerMat);
  outer.position.set(BX, FY + outerH / 2 - 0.005, BZ);
  ctx.group.add(inner, outer);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softDot(), color: 0x3050ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35,
  }));
  glow.position.set(BX, FY + 0.07, BZ);
  glow.scale.setScalar(0.4);
  ctx.group.add(glow);

  // ---------------------------------------------------------------- salt dishes
  const dishGeo = new THREE.CylinderGeometry(0.042, 0.03, 0.014, 20);
  const heapGeo = new THREE.SphereGeometry(0.026, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const DZ = HZ + 0.4;
  const dishX = (i: number) => HX - 1.05 + i * 0.118;
  const dishes: THREE.Group[] = [];
  SALTS.forEach((s, i) => {
    const g = new THREE.Group();
    g.position.set(dishX(i), top, DZ);
    const dish = new THREE.Mesh(dishGeo, mats.glassRim);
    dish.position.y = 0.007;
    const heap = new THREE.Mesh(heapGeo, new THREE.MeshStandardMaterial({ color: s.powder, roughness: 0.95 }));
    heap.scale.y = 0.45;
    heap.position.y = 0.01;
    g.add(dish, heap);
    ctx.group.add(g);
    dishes.push(g);
    ctx.interaction.add(g, {
      label: s.name,
      onHover: (on) => g.scale.setScalar(on ? 1.15 : 1),
      onClick: () => choose(s),
    });
  });
  const dishLabels = kit.canvasPlane(0.84, 0.07, 768, (g, W, H) => {
    g.fillStyle = '#f4ead8';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3b2a1c';
    g.font = `700 ${Math.round(H * 0.55)}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    SALTS.forEach((s, i) => g.fillText(s.formula, ((i + 0.5) / SALTS.length) * W, H * 0.55));
  });
  dishLabels.mesh.position.set(HX - 1.05 + 3 * 0.118, top + 0.004, DZ + 0.075);
  dishLabels.mesh.rotation.x = -Math.PI / 2.6;
  ctx.group.add(dishLabels.mesh);

  // ---------------------------------------------------------------- inoculation loop
  const loop = new THREE.Group();
  const dir = new THREE.Vector3(0.55, 0.75, 0.37).normalize();
  const wire = new THREE.Mesh(kit.geos.cyl, mats.steel);
  wire.scale.set(0.0018, 0.2, 0.0018);
  wire.position.copy(dir).multiplyScalar(0.1);
  wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const handle = new THREE.Mesh(kit.geos.cyl, mats.darkWood);
  handle.scale.set(0.009, 0.14, 0.009);
  handle.position.copy(dir).multiplyScalar(0.27);
  handle.quaternion.copy(wire.quaternion);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.7, roughness: 0.3, emissive: 0xff5a10, emissiveIntensity: 0 });
  const tip = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0018, 6, 16), tipMat);
  tip.rotation.y = Math.PI / 2;
  loop.add(wire, handle, tip);
  ctx.group.add(loop);
  const REST = new THREE.Vector3(HX + 0.62, top + 0.02, HZ + 0.15);
  const FLAME_POS = new THREE.Vector3(BX - 0.012, FY + 0.06, BZ);
  loop.position.copy(REST);
  const rack = new THREE.Mesh(kit.geos.cyl, mats.brass);
  rack.scale.set(0.02, 0.05, 0.02);
  rack.position.set(REST.x + 0.12, top + 0.025, REST.z + 0.08);
  ctx.group.add(rack);
  ctx.interaction.add(loop, { label: L('Ympöglan', 'The loop'), onClick: () => choose(current ?? SALTS[0]) });

  // ---------------------------------------------------------------- cobalt glass
  const cobaltMat = new THREE.MeshStandardMaterial({ color: 0x2033c0, transparent: true, opacity: 0.6, roughness: 0.1, emissive: 0x0a1460, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const cobalt = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), cobaltMat);
  pane.position.y = 0.2;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.006, 4, 4), mats.brass);
  frame.rotation.z = Math.PI / 4;
  frame.position.y = 0.2;
  const post = new THREE.Mesh(kit.geos.cyl, mats.brass);
  post.scale.set(0.006, 0.1, 0.006);
  post.position.y = 0.05;
  cobalt.add(pane, frame, post);
  const COBALT_OFF = new THREE.Vector3(HX + 0.95, top, HZ + 0.3);
  const COBALT_ON = new THREE.Vector3(BX, top, BZ + 0.3);
  cobalt.position.copy(COBALT_OFF);
  ctx.group.add(cobalt);
  ctx.interaction.add(cobalt, { label: L('Koboltglas', 'Cobalt glass'), onClick: () => setCobalt(!useCobalt) });

  // spectroscope tube (decor, aimed at the flame)
  const scope = new THREE.Mesh(kit.geos.cyl, mats.brass);
  scope.scale.set(0.028, 0.32, 0.028);
  scope.rotation.z = Math.PI / 2;
  scope.position.set(BX + 0.42, FY + 0.08, BZ - 0.12);
  scope.rotation.y = 0.25;
  const scopeLeg = new THREE.Mesh(kit.geos.cyl, mats.darkWood);
  scopeLeg.scale.set(0.012, FY + 0.08 - top, 0.012);
  scopeLeg.position.set(BX + 0.42, top + (FY + 0.08 - top) / 2, BZ - 0.12);
  ctx.group.add(scope, scopeLeg);
  kit.staticize(scope, scopeLeg, rack);

  // ---------------------------------------------------------------- state
  let current: Salt | null = null;
  let env = 0; // 0..1 salt colour strength
  let saltAge = 0;
  let useCobalt = false;
  let cobaltK = 0;
  const tested = new Set<string>();
  let pathT = -1;
  const path: THREE.Vector3[] = [];
  const pathFrom = new THREE.Vector3();
  let dipped = false;
  let hud: { draw: () => void; refresh: () => void } | null = null;
  let hudTimer = 0;
  let screenTimer = 0;
  let focused = false;

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const BURNER_OUTER = new THREE.Color(0x2440ff);
  const BURNER_INNER = new THREE.Color(0x6aa0ff);

  function choose(s: Salt) {
    current = s;
    dipped = false;
    env = Math.min(env, 0.15);
    const di = SALTS.indexOf(s);
    const dx = di >= 0 ? dishX(di) : dishX(1);
    path.length = 0;
    pathFrom.copy(loop.position);
    path.push(
      new THREE.Vector3(dx, top + 0.09, DZ),
      new THREE.Vector3(dx, top + 0.018, DZ),
      new THREE.Vector3(dx, top + 0.11, DZ),
      FLAME_POS,
    );
    pathT = 0;
    ctx.sfx.tone(660, 0.08, { type: 'triangle', gain: 0.05 });
    ctx.sfx.noise(0.1, { freq: 4000, gain: 0.03, delay: 0.6 });
    hud?.refresh();
  }

  function setCobalt(v: boolean) {
    useCobalt = v;
    ctx.sfx.tone(v ? 880 : 520, 0.1, { type: 'sine', gain: 0.06 });
    if (v && current?.key === 'NaK' && env > 0.3) {
      kit.buddy.celebrate(L('Där! Genom koboltglaset syns kaliums lila färg som natriumet gömde.',
        'There! Through the cobalt glass you can see the potassium lilac that the sodium was hiding.'));
    }
    hud?.refresh();
  }

  function arrive() {
    if (!current) return;
    dipped = true;
    saltAge = 0;
    ctx.sfx.noise(0.5, { freq: 900, to: 2600, gain: 0.08 });
    ctx.sfx.tone(current.key === 'Na' ? 520 : 440 + SALTS.indexOf(current) * 60, 0.35, { type: 'sine', gain: 0.05 });
    if (current.key !== 'NaK') {
      const first = !tested.has(current.key);
      tested.add(current.key);
      if (tested.size === SALTS.length && first) {
        kit.buddy.celebrate(L('Alla sju salter! Nu kan du läsa ett fyrverkeri som en riktig spektroskopist.',
          'All seven salts! Now you can read a firework like a real spectroscopist.'), true);
      } else if (first && current.key === 'K') {
        kit.buddy.say(L('Ser du hur svag kaliums lila är? Nästan allt ljus ligger i det infraröda.',
          'See how faint the potassium lilac is? Almost all its light is in the infrared.'), { expression: 'surprised' });
      } else if (first && current.key === 'Na') {
        kit.buddy.say(L('Natrium! Samma gula färg som gamla gatlampor. Två linjer, 589,0 och 589,6 nm.',
          'Sodium! The same yellow as old street lamps. Two lines, 589.0 and 589.6 nm.'), { expression: 'happy' });
      }
    } else if (!useCobalt) {
      kit.buddy.say(L('Det ser bara gult ut… Kalium finns där, men natriumet dränker det. Prova koboltglaset!',
        'It just looks yellow… Potassium is there, but the sodium drowns it. Try the cobalt glass!'), { expression: 'thinking' });
    }
    hud?.refresh();
  }

  const strongest = (s: Salt) => s.lines.reduce((a, b) => (b[1] > a[1] ? b : a));

  kit.ctx.addStation({
    id: 'chem-flame',
    title: L('Flamfärger och spektroskopet', 'Flame tests and the spectroscope'),
    position: [HX, HZ + 1.2],
    viewpoint: { position: [HX + 0.45, 1.8, HZ + 3.2], target: [HX + 0.45, 1.4, HZ - 0.2] },
    intro: L('Varför är fyrverkerier röda, gröna och blå? Doppa öglan i ett salt och håll den i lågan!',
      'Why are fireworks red, green and blue? Dip the loop in a salt and hold it in the flame!'),
    howTo: L('Klicka på ett salt (eller välj nedan). Öglan doppas och förs in i lågan. Jämför spektrallinjerna, och prova koboltglaset på blandningen.',
      'Click a salt (or pick one below). The loop dips and goes into the flame. Compare the spectral lines, and try the cobalt glass on the mixture.'),
    science: L(
      'Värmen i lågan knuffar upp elektroner i metallatomerna till högre energinivåer. När de faller tillbaka skickar de ut en ljuspartikel, en foton, med exakt energiskillnaden: E = hc/λ. Varje grundämne har sina egna nivåer och därför sina egna färger, som ett fingeravtryck. Natriums gula linje på 589 nm motsvarar 2,10 eV. Det är alltså inte saltet som "brinner" i färg; atomerna lånar energi och lämnar tillbaka den som ljus. Strontium, kalcium, barium och koppar lyser mest via molekyler som SrOH och CuCl, därför syns breda band i stället för smala linjer. Flamtester görs bara med en vuxen och skyddsglasögon.',
      'The heat of the flame kicks electrons in the metal atoms up to higher energy levels. When they fall back they emit a particle of light, a photon, carrying exactly the energy difference: E = hc/λ. Every element has its own levels and therefore its own colours, like a fingerprint. Sodium\'s yellow line at 589 nm corresponds to 2.10 eV. So the salt isn\'t "burning" in colour; the atoms borrow energy and give it back as light. Strontium, calcium, barium and copper glow mostly through molecules like SrOH and CuCl, so you see broad bands instead of sharp lines. Flame tests are only done with an adult and safety goggles.'),
    wow: L('Helium hittades i solens spektrum 1868, 27 år innan någon hittade det på jorden. Spektrallinjer är hur vi vet vad stjärnor är gjorda av.',
      'Helium was found in the Sun\'s spectrum in 1868, 27 years before anyone found it on Earth. Spectral lines are how we know what stars are made of.'),
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
    controls: (panel) => {
      panel.heading(L('Välj ett salt', 'Pick a salt'));
      const all = [...SALTS, MIX];
      const setActive = panel.buttons(all.map((s) => ({ label: L(s.formula, s.formula), onClick: () => choose(s) })),
        current ? all.indexOf(current) : -1);
      panel.toggle(L('Koboltblått glas framför lågan', 'Cobalt-blue glass in front of the flame'), useCobalt, (v) => setCobalt(v));
      panel.heading(L('Spektroskopet', 'The spectroscope'));
      const sp = panel.canvas(104);
      const name = panel.readout(L('Ämne', 'Substance'));
      const line = panel.readout(L('Starkaste linje', 'Strongest line'));
      const energy = panel.readout(L('Fotonens energi (E = hc/λ)', 'Photon energy (E = hc/λ)'));
      const note = panel.note(L('', ''));
      hud = {
        draw: () => {
          sp.ctx.clearRect(0, 0, sp.width, sp.height);
          drawSpectrum(sp.ctx, sp.width, sp.height, current?.lines ?? [], env * (useCobalt ? 0.85 : 1), 0.3 + 0.2 * (1 - env), {
            labels: true, irLabel: t(L('nära IR', 'near IR')),
          });
        },
        refresh: () => {
          setActive(current ? all.indexOf(current) : -1);
          if (!current) {
            name.set('–');
            line.set('–');
            energy.set('–');
            note.textContent = t(L('Den rena lågan är blå: lite ljus från CH- och C₂-molekyler i gasen.',
              'The clean flame is blue: a little light from CH and C₂ molecules in the gas.'));
            return;
          }
          const s = current.key === 'NaK' ? SALTS[1] : current;
          const [l] = strongest(s);
          name.set(t(current.name));
          line.set(`${fmt(l, 1)} nm`);
          energy.set(`${fmt(HC / l, 2)} eV`);
          note.textContent = t(current.firework);
        },
      };
      hud.refresh();
      hud.draw();
      return () => { hud = null; };
    },
  });

  // ---------------------------------------------------------------- per frame
  return {
    center: [HX, HZ + 0.6],
    update(dt, time, near) {
      innerMat.uniforms.uTime.value = time;
      outerMat.uniforms.uTime.value = time;
      if (!near && !focused) return;

      // loop motion along waypoints
      if (pathT >= 0) {
        const SEG = 0.32;
        pathT += dt / SEG;
        const i = Math.floor(pathT);
        if (i >= path.length) {
          pathT = -1;
          loop.position.copy(path[path.length - 1]);
          arrive();
        } else {
          const a = i === 0 ? pathFrom : path[i - 1];
          const f = pathT - i;
          const e = f * f * (3 - 2 * f);
          loop.position.lerpVectors(a, path[i], e);
        }
      }

      // salt burns off
      if (dipped && current) {
        saltAge += dt;
        const target = saltAge < current.life ? 1 : Math.max(0, 1 - (saltAge - current.life) / 3);
        env += (target - env) * Math.min(1, dt * (target > env ? 6 : 2));
        if (saltAge > current.life + 4 && pathT < 0) {
          dipped = false;
          path.length = 0;
          pathFrom.copy(loop.position);
          path.push(new THREE.Vector3(REST.x, REST.y + 0.12, REST.z), REST);
          pathT = 0;
        }
      } else if (pathT < 0) {
        env = Math.max(0, env - dt * 0.8);
      }
      const inFlame = loop.position.distanceToSquared(FLAME_POS) < 0.0004;
      tipMat.emissiveIntensity += ((inFlame ? 2.2 : 0) - tipMat.emissiveIntensity) * Math.min(1, dt * 3);

      // cobalt glass slides in/out
      cobaltK += ((useCobalt ? 1 : 0) - cobaltK) * Math.min(1, dt * 5);
      cobalt.position.lerpVectors(COBALT_OFF, COBALT_ON, cobaltK);

      // flame colour
      const flick = 0.92 + 0.08 * Math.sin(time * 31) * Math.sin(time * 17.3);
      if (current) tmpA.setHex(useCobalt ? current.cobalt : current.color);
      else tmpA.copy(BURNER_OUTER);
      tmpB.copy(BURNER_OUTER).multiplyScalar(useCobalt ? 0.5 : 0.75);
      const outerCol = outerMat.uniforms.uColor.value as THREE.Color;
      outerCol.copy(tmpB).lerp(tmpA.multiplyScalar(1.6), env);
      outerMat.uniforms.uAlpha.value = (0.55 + env * 0.9) * flick;
      outer.scale.set(1 + env * 0.5, (1 + env * 0.6) * (0.95 + 0.1 * Math.sin(time * 13)), 1 + env * 0.5);
      const innerCol = innerMat.uniforms.uColor.value as THREE.Color;
      innerCol.copy(BURNER_INNER).multiplyScalar(useCobalt ? 0.7 : 1);
      innerMat.uniforms.uAlpha.value = 0.9 * (1 - env * 0.4);
      const gm = glow.material as THREE.SpriteMaterial;
      gm.color.copy(outerCol).multiplyScalar(0.6);
      gm.opacity = 0.25 + env * 0.4;
      glow.scale.setScalar(0.3 + env * 0.6);

      // spectroscope screen (throttled) and HUD canvas
      const want = current ? env * (useCobalt ? 0.85 : 1) : 0;
      screenTimer -= dt;
      if (screenTimer <= 0 && (Math.abs(want - screenGain) > 0.01 || screenSalt !== current)) {
        screenTimer = 0.1;
        screenGain = want;
        screenSalt = current;
        screenBurner = 0.3 + 0.2 * (1 - env);
        screen.redraw();
      }
      hudTimer -= dt;
      if (hud && hudTimer <= 0) {
        hudTimer = 0.06;
        hud.draw();
      }
    },
  };
}
