/**
 * Station 1: the orrery. Eight planets (and the Moon) circle the Sun with their true orbital periods
 * and real mean longitudes (circular-orbit approximation), so the date readout shows roughly where
 * the planets really are. Three scale modes show why no model can have both sizes and distances right.
 */
import * as THREE from 'three';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import type { RoomContext } from '../../core/types';
import type { Interactive } from '../../core/interaction';
import { getLang } from '../../core/i18n';
import { radialSpot } from '../../core/textures';
import {
  AU_KM, L, MAT, MOON, PLANETS, SUN_DIAM_KM, fmt, locale, planetTexture, ringTexture, sunlitMaterial, t,
  type RoomBuddy,
} from './shared';

export const ORRERY_POS: [number, number] = [0, -3.2];
const TABLE_R = 1.95;
const TABLE_Y = 0.7;
const PLANET_Y = 1.02;
const MODEL_R = [0.36, 0.49, 0.62, 0.76, 1.0, 1.28, 1.5, 1.72];
const MODEL_SIZE = [0.03, 0.045, 0.047, 0.036, 0.1, 0.085, 0.06, 0.058];
const SUN_MODEL_R = 0.17;
const MOON_MODEL_ORBIT = 0.095;
const MOON_MODEL_R = 0.014;
const JUP_R_TRUE_SIZE = 0.1; // in "true sizes" mode Jupiter keeps its model size and everything else follows
const AU_TRUE = MODEL_R[7] / PLANETS[7].aAU; // metres per AU in "true distances" mode
const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;

type Mode = 0 | 1 | 2; // model, true sizes, true distances

export function buildOrrery(ctx: RoomContext, buddy: RoomBuddy) {
  const root = new THREE.Group();
  root.position.set(ORRERY_POS[0], 0, ORRERY_POS[1]);
  ctx.group.add(root);
  ctx.addCollider(ORRERY_POS[0], ORRERY_POS[1], TABLE_R * 2 + 0.1, TABLE_R * 2 + 0.1);

  // --- Table -------------------------------------------------------------------------------
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R - 0.12, TABLE_Y, 64), MAT.darkWood);
  plinth.position.y = TABLE_Y / 2;
  root.add(plinth);
  const topTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(512, 512, 40, 512, 512, 512);
    grad.addColorStop(0, '#2a2560');
    grad.addColorStop(1, '#0b0d26');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(220,215,255,${Math.random() * 0.6})`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 1.6, 1.6);
    }
    // Zodiac-style brass ring of month ticks
    g.strokeStyle = 'rgba(232,190,110,0.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(512, 512, 496, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r0 = i % 6 === 0 ? 470 : 484;
      g.beginPath();
      g.moveTo(512 + Math.cos(a) * r0, 512 + Math.sin(a) * r0);
      g.lineTo(512 + Math.cos(a) * 496, 512 + Math.sin(a) * 496);
      g.stroke();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();
  const top = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R - 0.02, 64), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.5 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = TABLE_Y + 0.002;
  root.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.035, 10, 96), MAT.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = TABLE_Y;
  root.add(rim);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, PLANET_Y - TABLE_Y, 16), MAT.brass);
  column.position.y = (TABLE_Y + PLANET_Y) / 2;
  root.add(column);

  // --- Sun -----------------------------------------------------------------------------------
  const sunWorld = ctx.toWorld(new THREE.Vector3(ORRERY_POS[0], PLANET_Y, ORRERY_POS[1]));
  const sunMat = new THREE.MeshBasicMaterial({ map: planetTexture('sun'), transparent: true, toneMapped: false });
  sunMat.color.setRGB(1.7, 1.25, 0.75);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sunMat);
  sun.position.y = PLANET_Y;
  sun.scale.setScalar(SUN_MODEL_R);
  root.add(sun);
  const haloMat = new THREE.SpriteMaterial({
    map: radialSpot('rgba(255,200,110,0.9)', 'rgba(255,120,40,0)'), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.y = PLANET_Y;
  root.add(halo);

  // --- Planets -------------------------------------------------------------------------------
  const armGeo = new THREE.BoxGeometry(1, 0.008, 0.012).translate(0.5, 0, 0);
  const pinGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 6).translate(0, 0.5, 0);
  const sphereGeo = new THREE.SphereGeometry(1, 40, 24);
  const ringMarkTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#fff';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();

  interface P {
    pivot: THREE.Group;
    arm: THREE.Mesh;
    pin: THREE.Mesh;
    mesh: THREE.Mesh;
    hit: THREE.Mesh;
    mark: THREE.Sprite;
    r: number; // current orbit radius
    size: number; // current radius
    armY: number;
  }
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const planets: P[] = PLANETS.map((b, i) => {
    const pivot = new THREE.Group();
    root.add(pivot);
    const armY = TABLE_Y + 0.03 + i * 0.012;
    const arm = new THREE.Mesh(armGeo, MAT.brass);
    arm.position.y = armY;
    arm.scale.x = MODEL_R[i];
    pivot.add(arm);
    const pin = new THREE.Mesh(pinGeo, MAT.brass);
    pin.position.set(MODEL_R[i], armY, 0);
    pin.scale.y = PLANET_Y - armY;
    pivot.add(pin);
    const mesh = new THREE.Mesh(
      sphereGeo,
      sunlitMaterial(sunWorld, { map: planetTexture(b.id), ambient: 0.1, sun: 1.35, rim: b.rim, rimStrength: 0.9 }),
    );
    mesh.position.set(MODEL_R[i], PLANET_Y, 0);
    mesh.scale.setScalar(MODEL_SIZE[i]);
    if (b.id === 'uranus') mesh.rotation.z = THREE.MathUtils.degToRad(97.8);
    pivot.add(mesh);
    if (b.id === 'saturn') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.25, 2.0, 64),
        new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: 0xd8c8a0 }),
      );
      ring.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(26.7);
      mesh.add(ring);
    }
    const hit = new THREE.Mesh(sphereGeo, hitMat);
    hit.position.copy(mesh.position);
    pivot.add(hit);
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringMarkTex, color: b.rim, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mark.position.copy(mesh.position);
    mark.visible = false;
    pivot.add(mark);
    return { pivot, arm, pin, mesh, hit, mark, r: MODEL_R[i], size: MODEL_SIZE[i], armY };
  });

  // Moon around Earth
  const earth = planets[2];
  const moonPivot = new THREE.Group();
  earth.pivot.add(moonPivot);
  const moonMesh = new THREE.Mesh(sphereGeo, sunlitMaterial(sunWorld, { map: planetTexture('moon'), ambient: 0.06, sun: 1.3, rim: 0xd0d0ff, rimStrength: 0.4 }));
  moonMesh.scale.setScalar(MOON_MODEL_R);
  moonPivot.add(moonMesh);
  const moonHit = new THREE.Mesh(sphereGeo, hitMat);
  moonHit.scale.setScalar(0.035);
  moonPivot.add(moonHit);

  // Orbit lines (one draw call, rebuilt while radii animate)
  const SEG = 128;
  const orbitPos = new Float32Array(9 * SEG * 2 * 3);
  const orbitGeo = new THREE.BufferGeometry();
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
  const orbits = new THREE.LineSegments(orbitGeo, new THREE.LineBasicMaterial({ color: 0xa894ff, transparent: true, opacity: 0.45 }));
  orbits.position.y = PLANET_Y;
  root.add(orbits);
  orbits.frustumCulled = false;
  const COS = new Float32Array(SEG + 1);
  const SIN = new Float32Array(SEG + 1);
  for (let i = 0; i <= SEG; i++) {
    COS[i] = Math.cos((i / SEG) * Math.PI * 2);
    SIN[i] = Math.sin((i / SEG) * Math.PI * 2);
  }
  const drawnR = new Float32Array(9).fill(-1);
  const putOrbit = (slot: number, cx: number, cz: number, r: number) => {
    let k = slot * SEG * 6;
    for (let s = 0; s < SEG; s++) {
      orbitPos[k++] = cx + COS[s] * r; orbitPos[k++] = 0; orbitPos[k++] = cz - SIN[s] * r;
      orbitPos[k++] = cx + COS[s + 1] * r; orbitPos[k++] = 0; orbitPos[k++] = cz - SIN[s + 1] * r;
    }
  };
  function writeOrbits(moonR: number) {
    planets.forEach((p, i) => {
      if (Math.abs(drawnR[i] - p.r) > 1e-5 * p.r) {
        drawnR[i] = p.r;
        putOrbit(i, 0, 0, p.r);
      }
    });
    // Moon orbit drawn around Earth's current position
    const ex = earth.r * Math.cos(earth.pivot.rotation.y);
    const ez = -earth.r * Math.sin(earth.pivot.rotation.y);
    putOrbit(8, ex, ez, moonR);
    orbitGeo.attributes.position.needsUpdate = true;
  }

  // --- State -------------------------------------------------------------------------------
  const startMs = Date.now();
  const st = {
    simDays: 0,
    exp: Math.log10(20), // log10(days per second)
    playing: true,
    mode: 0 as Mode,
    selected: 2, // index into PLANETS, 8 = Moon
    dragging: false,
    sunR: SUN_MODEL_R,
    moonOrbit: MOON_MODEL_ORBIT,
    moonSize: MOON_MODEL_R,
    neptuneLaps: 0,
  };
  const daysJ2000 = () => (startMs - J2000) / DAY_MS + st.simDays;

  function targets(i: number): [number, number] {
    const b = PLANETS[i];
    if (st.mode === 0) return [MODEL_R[i], MODEL_SIZE[i]];
    if (st.mode === 1) return [MODEL_R[i], (JUP_R_TRUE_SIZE * b.diamKm) / PLANETS[4].diamKm];
    return [b.aAU * AU_TRUE, ((b.diamKm / 2) / AU_KM) * AU_TRUE];
  }
  const sunTarget = () =>
    st.mode === 0 ? SUN_MODEL_R : st.mode === 1 ? (JUP_R_TRUE_SIZE * SUN_DIAM_KM) / PLANETS[4].diamKm : ((SUN_DIAM_KM / 2) / AU_KM) * AU_TRUE;

  // --- Interaction ---------------------------------------------------------------------------
  const tableWorldPlane = new THREE.Plane();
  const tmp = new THREE.Vector3();
  const select = (i: number) => {
    st.selected = i;
    ctx.sfx.pop();
    refreshFacts();
    const b = i === 8 ? MOON : PLANETS[i];
    buddy.say(L(`${b.name.sv}: ett dygn varar ${b.day.sv}.`, `${b.name.en}: one day lasts ${b.day.en}.`));
  };
  planets.forEach((p, i) => {
    const h: Interactive = { label: PLANETS[i].name, onClick: () => select(i) };
    if (i === 2) {
      // Earth can be dragged along its orbit: that scrubs time for the whole solar system.
      let lastAngle = 0;
      h.cursor = 'grab';
      h.onDragStart = (info) => {
        st.dragging = true;
        tableWorldPlane.copy(planeAt(PLANET_Y));
        const q = info.onPlane(tableWorldPlane);
        if (q) lastAngle = angleOf(q);
      };
      h.onDrag = (info) => {
        const q = info.onPlane(tableWorldPlane);
        if (!q) return;
        const a = angleOf(q);
        let d = a - lastAngle;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        lastAngle = a;
        st.simDays += (d / (Math.PI * 2)) * 365.25;
        if (Math.abs(d) > 0.02) ctx.sfx.tone(300 + Math.random() * 40, 0.03, { type: 'triangle', gain: 0.03 });
      };
      h.onDragEnd = () => {
        st.dragging = false;
      };
    }
    ctx.interaction.add(p.hit, h);
  });
  ctx.interaction.add(moonHit, { label: MOON.name, onClick: () => select(8) });
  ctx.interaction.add(sun, {
    label: L('Solen', 'The Sun'),
    onClick: () => {
      ctx.sfx.chime();
      buddy.say(L(
        'Solen är 1,39 miljoner km bred. 109 jordklot får plats i rad tvärs över den!',
        'The Sun is 1.39 million km wide. 109 Earths would fit side by side across it!',
      ));
    },
  });

  function planeAt(y: number) {
    root.updateWorldMatrix(true, false);
    tmp.set(0, y, 0).applyMatrix4(root.matrixWorld);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), tmp);
  }
  function angleOf(world: THREE.Vector3) {
    tmp.copy(world);
    root.worldToLocal(tmp);
    return Math.atan2(-tmp.z, tmp.x);
  }

  // --- HUD -------------------------------------------------------------------------------
  let ui: {
    date: Readout; elapsed: Readout; laps: Readout; scaleNote: HTMLElement; playBtn: HTMLButtonElement;
    facts: Readout[]; slider: HTMLInputElement;
  } | null = null;

  const speedText = (exp: number) => {
    const d = Math.pow(10, exp);
    if (d >= 365.25) return getLang() === 'sv' ? `${fmt(d / 365.25, d < 3652 ? 1 : 0)} år/s` : `${fmt(d / 365.25, d < 3652 ? 1 : 0)} years/s`;
    return getLang() === 'sv' ? `${fmt(d, d < 10 ? 1 : 0)} dygn/s` : `${fmt(d, d < 10 ? 1 : 0)} days/s`;
  };
  const scaleNotes = [
    L(
      'Modell: storlekar och avstånd är hoptryckta så att allt syns. Tiden är däremot rätt: varje planet har sin sanna omloppstid.',
      'Model: sizes and distances are squeezed so you can see everything. The timing is true: every planet has its real orbital period.',
    ),
    L(
      'Sanna storlekar: Jupiter behåller sin storlek och allt annat följer. Solen blir nästan 2 m bred och sväljer banorna ända ut till Mars!',
      'True sizes: Jupiter keeps its size and everything else follows. The Sun becomes almost 2 m wide and swallows the orbits all the way out to Mars!',
    ),
    L(
      'Sanna avstånd OCH storlekar: Solen är nu 0,5 mm, ett sandkorn, och Jorden 0,005 mm, mindre än en röd blodkropp. Ringarna visar var de är. Om Solen vore 1 m bred skulle Jorden vara 9,2 mm och ligga 107 m bort.',
      'True distances AND sizes: the Sun is now 0.5 mm, a grain of sand, and Earth 0.005 mm, smaller than a red blood cell. The rings show where they are. If the Sun were 1 m wide, Earth would be 9.2 mm across and 107 m away.',
    ),
  ];

  function refreshFacts() {
    if (!ui) return;
    const i = st.selected;
    const b = i === 8 ? MOON : PLANETS[i];
    const lang = getLang();
    ui.facts[0].set(t(b.name));
    ui.facts[1].set(
      i === 8
        ? (lang === 'sv' ? '27,3 dygn runt Jorden' : '27.3 days around Earth')
        : b.periodYr < 2
          ? `${fmt(b.periodYr * 365.25, 0)} ${lang === 'sv' ? 'dygn' : 'days'} (${fmt(b.periodYr, 3)} ${lang === 'sv' ? 'år' : 'yr'})`
          : `${fmt(b.periodYr, 1)} ${lang === 'sv' ? 'år' : 'years'}`,
    );
    ui.facts[2].set(t(b.day));
    ui.facts[3].set(t(b.moons));
    ui.facts[4].set(t(b.temp));
    ui.facts[5].set(
      i === 8
        ? `${fmt(384400)} km ${lang === 'sv' ? 'från Jorden' : 'from Earth'}`
        : `${fmt((b.aAU * AU_KM) / 1e6, 0)} ${lang === 'sv' ? 'miljoner km' : 'million km'} (${fmt(b.aAU, 2)} AU)`,
    );
    ui.facts[6].set(`${fmt(b.diamKm)} km`);
  }

  const controls = (panel: ControlPanel) => {
    panel.heading(L('Tid', 'Time'));
    const slider = panel.slider(L('Tidens fart', 'Time speed'), { min: 0, max: 4.5, step: 0.01, value: st.exp, format: speedText }, (v) => {
      st.exp = v;
    });
    const playBtn = panel.button(st.playing ? L('Pausa', 'Pause') : L('Spela', 'Play'), () => {
      st.playing = !st.playing;
      playBtn.textContent = (st.playing ? '⏸ ' : '▶ ') + t(st.playing ? L('Pausa', 'Pause') : L('Spela', 'Play'));
    }, { icon: st.playing ? '⏸' : '▶' });
    panel.button(L('Tillbaka till i dag', 'Back to today'), () => {
      st.simDays = 0;
    }, { icon: '⟲' });
    const date = panel.readout(L('Datum', 'Date'));
    const elapsed = panel.readout(L('Tid som gått', 'Time passed'));
    const laps = panel.readout(L('Jordens varv runt Solen', "Earth's laps around the Sun"));
    panel.note(L('Tips: dra Jorden runt sin bana för att spola tiden. Klicka på en planet för fakta.', 'Tip: drag Earth along its orbit to scrub time. Click a planet for facts.'));
    panel.heading(L('Skala', 'Scale'));
    const setMode = panel.buttons(
      [
        { label: L('Modell', 'Model'), onClick: () => setScale(0) },
        { label: L('Sanna storlekar', 'True sizes'), onClick: () => setScale(1) },
        { label: L('Sanna avstånd', 'True distances'), onClick: () => setScale(2) },
      ],
      st.mode,
    );
    void setMode;
    const scaleNote = panel.note(scaleNotes[st.mode]);
    panel.heading(L('Vald himlakropp', 'Selected world'));
    const facts = [
      panel.readout(L('Namn', 'Name')),
      panel.readout(L('Ett varv runt Solen', 'One lap around the Sun')),
      panel.readout(L('Ett dygn', 'One day')),
      panel.readout(L('Månar', 'Moons')),
      panel.readout(L('Temperatur', 'Temperature')),
      panel.readout(L('Avstånd', 'Distance')),
      panel.readout(L('Diameter', 'Diameter')),
    ];
    ui = { date, elapsed, laps, scaleNote, playBtn, facts, slider };
    refreshFacts();
    return () => {
      ui = null;
    };
  };

  function setScale(m: Mode) {
    if (st.mode === m) return;
    st.mode = m;
    ctx.sfx.whoosh();
    if (ui) ui.scaleNote.textContent = t(scaleNotes[m]);
    if (m === 1) {
      buddy.say(L(
        'Titta på Solen! Med rätt storlekar blir den så stor att den slukar de inre planeternas banor.',
        'Look at the Sun! At true sizes it is so big it swallows the inner planets\' orbits.',
      ));
    } else if (m === 2) {
      buddy.celebrate(L(
        'Nästan allt försvann! Rymden är mest tom: Jorden är ett dammkorn 107 meter från en strandboll.',
        'Almost everything vanished! Space is mostly empty: Earth is a speck of dust 107 metres from a beach ball.',
      ));
    }
  }

  // --- Update ----------------------------------------------------------------------------
  let uiTimer = 0;
  let lastNeptuneLaps = 0;
  const update = (dt: number, time: number) => {
    if (st.playing && !st.dragging) st.simDays += Math.pow(10, st.exp) * dt;
    const days = daysJ2000();
    const k = Math.min(1, dt * 2.5);

    // Scale transition (exponential in log-space so tiny sizes animate smoothly)
    const lerpLog = (a: number, b: number) => {
      const d = Math.log(b) - Math.log(a);
      return Math.abs(d) < 1e-3 ? b : a * Math.exp(d * k);
    };
    st.sunR = lerpLog(st.sunR, sunTarget());
    sun.scale.setScalar(st.sunR);
    const big = st.sunR > SUN_MODEL_R * 1.5;
    sunMat.opacity = big ? 0.35 : 1;
    sunMat.depthWrite = !big;
    halo.scale.setScalar(Math.max(st.sunR * 5, 0.05));
    haloMat.opacity = st.mode === 2 ? 0.6 : 0.9;

    planets.forEach((p, i) => {
      const [tr, ts] = targets(i);
      p.r = lerpLog(p.r, tr);
      p.size = lerpLog(p.size, ts);
      const lam = THREE.MathUtils.degToRad(PLANETS[i].L0 + (360 * days) / (PLANETS[i].periodYr * 365.25));
      p.pivot.rotation.y = lam;
      p.arm.scale.x = p.r;
      p.pin.position.x = p.r;
      p.mesh.position.x = p.r;
      p.mesh.scale.setScalar(p.size);
      if (i !== 5 && i !== 6) p.mesh.rotation.y = time * 0.4 + i;
      p.hit.position.x = p.r;
      p.hit.scale.setScalar(Math.max(p.size * 1.4, 0.07));
      p.mark.position.x = p.r;
      const showMark = st.mode === 2 || st.selected === i;
      p.mark.visible = showMark;
      const pulse = 1 + 0.12 * Math.sin(time * 4);
      p.mark.scale.setScalar(Math.max(p.size * 3, 0.07) * pulse);
    });
    // Moon: true sidereal period around Earth, real mean longitude.
    const moonLam = THREE.MathUtils.degToRad(MOON.L0 + (360 * days) / 27.321661);
    moonPivot.position.set(earth.r, PLANET_Y, 0);
    moonPivot.rotation.y = moonLam - earth.pivot.rotation.y;
    const moonOrbitT = st.mode === 2 ? (MOON_MODEL_ORBIT * 0.02) : MOON_MODEL_ORBIT;
    const moonSizeT = st.mode === 0 ? MOON_MODEL_R : st.mode === 1 ? (JUP_R_TRUE_SIZE * MOON.diamKm) / PLANETS[4].diamKm : 1e-6;
    st.moonOrbit = lerpLog(st.moonOrbit, moonOrbitT);
    st.moonSize = lerpLog(st.moonSize, moonSizeT);
    moonMesh.position.x = st.moonOrbit;
    moonMesh.scale.setScalar(st.moonSize);
    moonHit.position.x = st.moonOrbit;
    moonHit.visible = st.mode !== 2;
    writeOrbits(st.mode === 2 ? 0.0001 : st.moonOrbit);

    // Milestone: Neptune completes a lap (164.8 years)
    const nLaps = Math.floor(st.simDays / (PLANETS[7].periodYr * 365.25));
    if (nLaps > lastNeptuneLaps) {
      buddy.celebrate(L(
        'Neptunus har gått ett helt varv runt Solen. Det tar 165 år, så ingen människa har hunnit med ett Neptunus-år!',
        'Neptune has gone all the way round the Sun. That takes 165 years, longer than any human lifetime!',
      ));
      ctx.sfx.chime();
    }
    lastNeptuneLaps = nLaps;

    uiTimer -= dt;
    if (ui && uiTimer <= 0) {
      uiTimer = 0.1;
      const d = new Date(startMs + st.simDays * DAY_MS);
      ui.date.set(
        Number.isNaN(d.getTime()) || Math.abs(d.getUTCFullYear()) > 9999
          ? '–'
          : d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' }),
      );
      const yrs = st.simDays / 365.25;
      ui.elapsed.set(`${fmt(yrs, Math.abs(yrs) < 10 ? 2 : 1)} ${getLang() === 'sv' ? 'år' : 'years'}`);
      ui.laps.set(fmt(Math.floor(Math.abs(yrs)), 0));
    }
  };

  return { controls, update, root };
}
