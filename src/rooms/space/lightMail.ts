/**
 * Station 5: light-speed mail. A light pulse leaves the Sun at c = 299 792,458 km/s and is tracked in real
 * light-time (sped up by a factor you choose). The rail is square-root scaled so all eight planets fit;
 * the Earth–Moon mode is fully to scale (sizes and distance).
 */
import * as THREE from 'three';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import type { RoomContext } from '../../core/types';
import { getLang } from '../../core/i18n';
import { radialSpot } from '../../core/textures';
import {
  AU_KM, C_KM_S, FONT, L, MAT, MOON, MOON_DIST_KM, PLANETS, canvasPlane, fmt, fmtDuration, planetTexture, sunlitMaterial, t,
  type RoomBuddy,
} from './shared';

export const MAIL_POS: [number, number] = [8.0, 0.2];
const RAIL_X = 9.2;
const RAIL_Y = 1.0;
const Z0 = -2.1;
const Z1 = 2.5;
const LEN = Z1 - Z0;
const NEPTUNE_KM = PLANETS[7].aAU * AU_KM;
const PLANET_Y = 1.17;
const SIZES = [0.03, 0.042, 0.044, 0.035, 0.07, 0.062, 0.05, 0.05];

type Mode = 'sun' | 'moon';

export function buildLightMail(ctx: RoomContext, buddy: RoomBuddy) {
  const root = ctx.group;
  ctx.addCollider(9.35, (Z0 + Z1) / 2, 0.8, LEN + 0.9);

  // --- Bench and glass tube ---------------------------------------------------------------------
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, LEN + 0.8), MAT.wood);
  benchTop.position.set(9.35, 0.85, (Z0 + Z1) / 2);
  root.add(benchTop);
  const benchBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, LEN + 0.7), MAT.darkWood);
  benchBody.position.set(9.37, 0.41, (Z0 + Z1) / 2);
  root.add(benchBody);
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, LEN + 0.3, 16, 1, true).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false }),
  );
  tube.position.set(RAIL_X, RAIL_Y, (Z0 + Z1) / 2 + 0.1);
  root.add(tube);
  const track = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, LEN + 0.3, 6).rotateX(Math.PI / 2), MAT.glow(0x8f7bff, 0.9));
  track.position.copy(tube.position);
  root.add(track);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 0.9), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  beam.position.set(RAIL_X, RAIL_Y, Z0);
  beam.scale.z = 0.001;
  root.add(beam);
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), MAT.glow(0xfff2c8, 3));
  pulse.position.set(RAIL_X, RAIL_Y, Z0);
  root.add(pulse);
  const pulseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSpot('rgba(255,240,200,1)', 'rgba(255,200,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pulseGlow.scale.setScalar(0.3);
  pulse.add(pulseGlow);

  // --- Sun-mode bodies ----------------------------------------------------------------------
  const sunGroup = new THREE.Group();
  root.add(sunGroup);
  const sunPos = new THREE.Vector3(RAIL_X, RAIL_Y + 0.05, Z0 - 0.18);
  const sunMat = new THREE.MeshBasicMaterial({ map: planetTexture('sun'), toneMapped: false });
  sunMat.color.setRGB(1.7, 1.25, 0.75);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 20), sunMat);
  sun.position.copy(sunPos);
  sunGroup.add(sun);
  const sunWorld = ctx.toWorld(sunPos.clone());
  const zOfKm = (km: number) => Z0 + LEN * Math.sqrt(Math.min(km, NEPTUNE_KM) / NEPTUNE_KM);
  const postGeo = new THREE.CylinderGeometry(0.005, 0.005, PLANET_Y - 0.88, 6).translate(0, (PLANET_Y - 0.88) / 2, 0);
  const planets = PLANETS.map((b, i) => {
    const z = zOfKm(b.aAU * AU_KM);
    const post = new THREE.Mesh(postGeo, MAT.brass);
    post.position.set(RAIL_X + 0.12, 0.88, z);
    sunGroup.add(post);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(SIZES[i], 24, 16),
      sunlitMaterial(sunWorld, { map: planetTexture(b.id), ambient: 0.15, sun: 1.2, rim: b.rim, rimStrength: 0.8 }),
    );
    mesh.position.set(RAIL_X + 0.12, PLANET_Y, z);
    sunGroup.add(mesh);
    return { mesh, z, km: b.aAU * AU_KM, flash: 0 };
  });

  // --- Moon-mode bodies (to scale: 4.6 m = 384 400 km) -----------------------------------------
  const moonGroup = new THREE.Group();
  moonGroup.visible = false;
  root.add(moonGroup);
  const mPerKm = LEN / MOON_DIST_KM;
  const earthR = (12756 / 2) * mPerKm;
  const moonR = (MOON.diamKm / 2) * mPerKm;
  const lampW = ctx.toWorld(new THREE.Vector3(RAIL_X - 2, 3, 0));
  const earth = new THREE.Mesh(new THREE.SphereGeometry(earthR, 32, 20), sunlitMaterial(lampW, { map: planetTexture('earth'), ambient: 0.3, sun: 1.0, rim: 0x6fb6ff, rimStrength: 0.8 }));
  earth.position.set(RAIL_X, RAIL_Y, Z0);
  moonGroup.add(earth);
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(moonR, 24, 16), sunlitMaterial(lampW, { map: planetTexture('moon'), ambient: 0.3, sun: 1.0, rimStrength: 0.3 }));
  moonMesh.position.set(RAIL_X, RAIL_Y, Z1);
  moonGroup.add(moonMesh);

  // --- Wall sign ------------------------------------------------------------------------------
  const st = {
    mode: 'sun' as Mode,
    exp: Math.log10(300),
    running: false,
    tLight: 0, // seconds of real light travel time
    target: 7,
    arrived: new Array(8).fill(false) as boolean[],
    moonArrived: false,
  };
  const SIGN_Z0 = Z0 - 0.45;
  const SIGN_W = LEN + 0.9;
  const sign = canvasPlane(SIGN_W, 1.35, [1024, 256], (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#16123a');
    grad.addColorStop(1, '#231c55');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8963e';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    const sv = getLang() === 'sv';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = `700 30px ${FONT}`;
    g.fillText(sv ? 'Ljuspost: hur lång tid tar ljuset?' : 'Light-speed mail: how long does light take?', w / 2, 30);
    const px = (z: number) => ((z - SIGN_Z0) / SIGN_W) * w;
    if (st.mode === 'sun') {
      g.font = `600 17px ${FONT}`;
      g.fillStyle = '#cfc8ff';
      g.fillText(sv ? 'Från Solen • avstånden är hoptryckta (kvadratrotsskala)' : 'From the Sun • distances squeezed (square-root scale)', w / 2, 60);
      PLANETS.forEach((b, i) => {
        const slot = ((i + 0.5) / 8) * (w - 40) + 20;
        const x = px(planets[i].z);
        g.strokeStyle = st.arrived[i] ? 'rgba(125,255,176,0.8)' : 'rgba(200,190,255,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(slot, 160);
        g.lineTo(x, h - 6);
        g.stroke();
        g.fillStyle = i === st.target ? '#ffd68c' : '#fff';
        g.font = `700 21px ${FONT}`;
        g.fillText(t(b.name), slot, 98);
        g.font = `700 22px ${FONT}`;
        g.fillStyle = st.arrived[i] ? '#7dffb0' : 'rgba(255,255,255,0.35)';
        g.fillText(st.arrived[i] ? fmtDuration(planets[i].km / C_KM_S) : '?', slot, 130);
      });
    } else {
      g.font = `600 18px ${FONT}`;
      g.fillStyle = '#cfc8ff';
      g.fillText(sv ? 'Från Jorden till Månen • allt i rätt skala!' : 'From Earth to the Moon • everything to scale!', w / 2, 62);
      g.font = `700 26px ${FONT}`;
      g.fillStyle = '#fff';
      g.fillText(sv ? 'Jorden' : 'Earth', px(Z0) + 40, 130);
      g.fillText(sv ? 'Månen' : 'The Moon', px(Z1) - 30, 130);
      g.fillStyle = st.moonArrived ? '#7dffb0' : 'rgba(255,255,255,0.4)';
      g.font = `700 34px ${FONT}`;
      g.fillText(st.moonArrived ? fmtDuration(MOON_DIST_KM / C_KM_S) : '?', w / 2, 130);
      g.font = `500 18px ${FONT}`;
      g.fillStyle = '#ffd68c';
      g.fillText(sv ? 'Alla planeter får plats i glappet mellan Jorden och Månen.' : 'All the planets would fit in the gap between Earth and the Moon.', w / 2, 200);
    }
  });
  sign.mesh.rotation.y = -Math.PI / 2;
  sign.mesh.position.set(9.97, 2.2, SIGN_Z0 + SIGN_W / 2);
  root.add(sign.mesh);

  // --- Actions ----------------------------------------------------------------------------
  function send(target = st.target) {
    st.target = target;
    st.tLight = 0;
    st.running = true;
    st.arrived.fill(false);
    st.moonArrived = false;
    sign.redraw();
    ctx.sfx.tone(1200, 0.25, { type: 'sine', gain: 0.1, to: 2400 });
  }
  ctx.interaction.add(sun, { label: L('Skicka en ljuspuls', 'Send a light pulse'), onClick: () => send(7) });
  ctx.interaction.add(earth, { label: L('Skicka ljus till Månen', 'Send light to the Moon'), onClick: () => send() });
  planets.forEach((p, i) => {
    ctx.interaction.add(p.mesh, {
      label: L(`Skicka post till ${PLANETS[i].name.sv}`, `Send mail to ${PLANETS[i].name.en}`),
      onClick: () => send(i),
    });
  });

  let ui: { time: Readout; dist: Readout; status: Readout; slider: HTMLInputElement } | null = null;
  function setMode(m: Mode) {
    if (st.mode === m) return;
    st.mode = m;
    sunGroup.visible = m === 'sun';
    moonGroup.visible = m === 'moon';
    st.running = false;
    st.tLight = 0;
    st.exp = m === 'moon' ? 0 : Math.log10(300);
    if (ui) {
      ui.slider.value = String(st.exp);
      ui.slider.dispatchEvent(new Event('input'));
    }
    sign.redraw();
    ctx.sfx.whoosh();
  }

  const speedText = (e: number) => `×${fmt(Math.pow(10, e), 0)}`;
  const controls = (panel: ControlPanel) => {
    panel.buttons([
      { label: L('Solen → planeterna', 'Sun → planets'), icon: '☀️', onClick: () => setMode('sun') },
      { label: L('Jorden → Månen', 'Earth → Moon'), icon: '🌍', onClick: () => setMode('moon') },
    ], st.mode === 'sun' ? 0 : 1);
    const slider = panel.slider(L('Snabbspolning', 'Speed-up'), { min: 0, max: 4, step: 0.01, value: st.exp, format: speedText }, (v) => {
      st.exp = v;
    });
    panel.button(L('Skicka ljuspuls!', 'Send a light pulse!'), () => send(st.mode === 'sun' ? 7 : st.target), { primary: true, icon: '✉️' });
    const time = panel.readout(L('Ljusets restid (på riktigt)', 'Light travel time (real)'));
    const dist = panel.readout(L('Sträcka', 'Distance travelled'));
    const status = panel.readout(L('Senast framme', 'Last delivery'));
    panel.note(L(
      'Klicka på en planet för att skicka post just dit. Med ×1 tar det lika lång tid som på riktigt: drygt 8 minuter till Jorden.',
      'Click a planet to send mail right there. At ×1 it takes as long as it really does: just over 8 minutes to Earth.',
    ));
    ui = { time, dist, status, slider };
    return () => {
      ui = null;
    };
  };

  // --- Update -------------------------------------------------------------------------------
  let uiTimer = 0;
  let lastStatus = '–';
  const update = (dt: number, time: number) => {
    sun.rotation.y += dt * 0.2;
    if (st.running) st.tLight += dt * Math.pow(10, st.exp);
    const km = st.tLight * C_KM_S;
    let z = Z0;
    if (st.mode === 'sun') {
      const stopKm = planets[st.target].km;
      const d = Math.min(km, stopKm);
      z = zOfKm(d);
      planets.forEach((p, i) => {
        if (st.running && !st.arrived[i] && km >= p.km) {
          st.arrived[i] = true;
          p.flash = 1;
          ctx.sfx.tone(1400 - i * 110, 0.35, { type: 'sine', gain: 0.1 });
          lastStatus = `${t(PLANETS[i].name)}: ${fmtDuration(p.km / C_KM_S)}`;
          sign.redraw();
          if (i === 2) {
            buddy.celebrate(L(
              'Framme vid Jorden efter 8 minuter och 19 sekunder. Solljuset du ser just nu lämnade Solen för 8 minuter sedan!',
              'Earth reached after 8 minutes 19 seconds. The sunlight you see right now left the Sun 8 minutes ago!',
            ));
          } else if (i === 7) {
            buddy.celebrate(L('Neptunus! Över fyra timmar, fast ljuset är det snabbaste som finns.', 'Neptune! More than four hours, even though light is the fastest thing there is.'));
          }
        }
        p.flash = Math.max(0, p.flash - dt * 1.5);
        p.mesh.scale.setScalar(1 + p.flash * 0.6);
      });
      if (st.running && km >= stopKm) st.running = false;
    } else {
      const d = Math.min(km, MOON_DIST_KM);
      z = Z0 + d * mPerKm;
      if (st.running && km >= MOON_DIST_KM) {
        st.running = false;
        st.moonArrived = true;
        lastStatus = `${t(MOON.name)}: ${fmtDuration(MOON_DIST_KM / C_KM_S)}`;
        ctx.sfx.chime();
        sign.redraw();
        buddy.celebrate(L(
          'Bara 1,3 sekunder till Månen! Därför hör astronauterna på Månen svaren med lite fördröjning.',
          'Just 1.3 seconds to the Moon! That is why talks with astronauts on the Moon have a small delay.',
        ));
      }
    }
    pulse.position.z = z;
    pulse.visible = st.running || st.tLight > 0;
    beam.scale.z = Math.max(0.001, z - Z0);
    beam.visible = pulse.visible;
    pulseGlow.scale.setScalar(0.26 + 0.05 * Math.sin(time * 20));

    uiTimer -= dt;
    if (ui && uiTimer <= 0) {
      uiTimer = 0.06;
      const shownKm = st.mode === 'sun' ? Math.min(km, planets[st.target].km) : Math.min(km, MOON_DIST_KM);
      ui.time.set(fmtDuration(shownKm / C_KM_S));
      ui.dist.set(shownKm >= 1e6
        ? `${fmt(shownKm / 1e6, shownKm < 1e8 ? 1 : 0)} ${getLang() === 'sv' ? 'miljoner km' : 'million km'}`
        : `${fmt(shownKm, 0)} km`);
      ui.status.set(lastStatus);
    }
  };

  return { controls, update };
}
