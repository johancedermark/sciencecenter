/** Station 5: a periodic-table wall (elements 1–36) with a Bohr-model hologram and a build-a-molecule game. */
import * as THREE from 'three';
import { L, onLangChange, t } from '../../core/i18n';
import type { L10n } from '../../core/types';
import { fmtUpTo, type Kit, type StationRuntime } from './common';
import { CATEGORY, ELEMENTS, shells, type Element } from './elements';

type Atom = 'H' | 'O' | 'C';
const VALENCE: Record<Atom, number> = { H: 1, O: 2, C: 4 };
const ATOM_INFO: Record<Atom, { color: number; r: number; name: L10n }> = {
  H: { color: 0xf2f2f2, r: 0.045, name: L('väte', 'hydrogen') },
  O: { color: 0xe8413a, r: 0.068, name: L('syre', 'oxygen') },
  C: { color: 0x3a3a40, r: 0.072, name: L('kol', 'carbon') },
};

interface Molecule {
  formula: string;
  name: L10n;
  atoms: [Atom, number, number, number][];
  bonds: [number, number, number][]; // a, b, order
  note: L10n;
  goal?: boolean;
}

const tet = (x: number, y: number, z: number, d = 0.17): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [(x / l) * d, (y / l) * d, (z / l) * d];
};
const HOH = (104.5 / 2) * (Math.PI / 180);

const MOLECULES: Molecule[] = [
  {
    formula: 'H₂O', name: L('Vatten', 'Water'), goal: true,
    atoms: [['O', 0, 0.04, 0], ['H', -0.16 * Math.sin(HOH), 0.04 - 0.16 * Math.cos(HOH), 0], ['H', 0.16 * Math.sin(HOH), 0.04 - 0.16 * Math.cos(HOH), 0]],
    bonds: [[0, 1, 1], [0, 2, 1]],
    note: L('Syre har två bindningsarmar och väte en. Vinkeln är 104,5°, därför är vattenmolekylen böjd.',
      'Oxygen has two bonding arms and hydrogen one. The angle is 104.5°, which is why the water molecule is bent.'),
  },
  {
    formula: 'CO₂', name: L('Koldioxid', 'Carbon dioxide'), goal: true,
    atoms: [['C', 0, 0, 0], ['O', -0.2, 0, 0], ['O', 0.2, 0, 0]],
    bonds: [[0, 1, 2], [0, 2, 2]],
    note: L('Kol har fyra armar: två dubbelbindningar, en till varje syre. Molekylen är rak. Det är gasen i bubblorna vid pH-stationen.',
      'Carbon has four arms: two double bonds, one to each oxygen. The molecule is straight. It is the gas in the bubbles at the pH station.'),
  },
  {
    formula: 'CH₄', name: L('Metan', 'Methane'), goal: true,
    atoms: [['C', 0, 0, 0], ['H', ...tet(1, 1, 1)], ['H', ...tet(1, -1, -1)], ['H', ...tet(-1, 1, -1)], ['H', ...tet(-1, -1, 1)]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    note: L('Kolets fyra armar pekar mot hörnen i en tetraeder, 109,5° isär. Metan är huvuddelen av naturgas och biogas.',
      'Carbon\'s four arms point to the corners of a tetrahedron, 109.5° apart. Methane is the main part of natural gas and biogas.'),
  },
  {
    formula: 'H₂', name: L('Vätgas', 'Hydrogen gas'),
    atoms: [['H', -0.075, 0, 0], ['H', 0.075, 0, 0]], bonds: [[0, 1, 1]],
    note: L('Två väteatomer delar sina elektroner. Den lättaste molekylen som finns.', 'Two hydrogen atoms share their electrons. The lightest molecule there is.'),
  },
  {
    formula: 'O₂', name: L('Syrgas', 'Oxygen gas'),
    atoms: [['O', -0.1, 0, 0], ['O', 0.1, 0, 0]], bonds: [[0, 1, 2]],
    note: L('En dubbelbindning. Det är syrgasen som tänder den glödande stickan vid elefanttandkrämen.', 'A double bond. This is the oxygen that relights the glowing splint at the elephant toothpaste.'),
  },
  {
    formula: 'H₂O₂', name: L('Väteperoxid', 'Hydrogen peroxide'),
    atoms: [['O', -0.09, 0, 0], ['O', 0.09, 0, 0], ['H', -0.15, -0.12, 0.07], ['H', 0.15, -0.03, -0.14]],
    bonds: [[0, 1, 1], [0, 2, 1], [1, 3, 1]],
    note: L('Bonusmolekyl! Den svaga O–O-bindningen är varför väteperoxid gärna sönderfaller till vatten och syrgas.',
      'Bonus molecule! The weak O–O bond is why hydrogen peroxide likes to fall apart into water and oxygen.'),
  },
];

const key = (c: Record<Atom, number>) => `${c.H}-${c.O}-${c.C}`;
const countsOf = (m: Molecule) => {
  const c: Record<Atom, number> = { H: 0, O: 0, C: 0 };
  for (const [a] of m.atoms) c[a]++;
  return c;
};

export function buildPeriodic(kit: Kit): StationRuntime {
  const { ctx, mats } = kit;
  const BX = 0.6, BW = 6.2, BH = 2.52, BY = 1.58 + BH / 2, WALL = -9 + 0.06;

  let mode: 'atom' | 'molecule' = 'atom';
  const counts: Record<Atom, number> = { H: 0, O: 0, C: 0 };
  const order: Atom[] = [];
  let match: Molecule | null = null;
  // ---------------------------------------------------------------- the wall table
  let selected: Element = ELEMENTS[0];
  const CW = 1024, CH = 416;
  const M = 16, TITLE = 44, LEG = 44;
  const cw = (CW - 2 * M) / 18, ch = (CH - TITLE - LEG - 2 * M) / 4;
  const cellX = (g: number) => M + (g - 1) * cw;
  const cellY = (p: number) => M + TITLE + (p - 1) * ch;

  const board = kit.canvasPlane(BW, BH, CW, (g) => {
    g.fillStyle = '#f3ead9';
    g.fillRect(0, 0, CW, CH);
    g.fillStyle = '#3b2a1c';
    g.font = '700 26px "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(t(L('Periodiska systemet: grundämne 1–36', 'The periodic table: elements 1–36')), M + 4, M + TITLE / 2 - 2);
    g.font = '15px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillStyle = '#6b5440';
    g.fillText(t(L('Klicka på ett grundämne', 'Click an element')), CW - M - 4, M + TITLE / 2);
    for (const e of ELEMENTS) {
      const x = cellX(e.group), y = cellY(e.period);
      const sel = e === selected;
      g.fillStyle = CATEGORY[e.cat].color;
      roundRect(g, x + 2, y + 2, cw - 4, ch - 4, 6);
      g.fill();
      if (sel) {
        g.lineWidth = sel ? 4 : 2;
        g.strokeStyle = sel ? '#1f6f5a' : '#3b2a1c';
        g.stroke();
      }
      g.fillStyle = '#2b1d12';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.font = '600 11px system-ui, sans-serif';
      g.fillText(String(e.z), x + 6, y + 6);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 24px "Baloo 2", system-ui, sans-serif';
      g.fillText(e.sym, x + cw / 2, y + ch * 0.55);
      g.font = '9px system-ui, sans-serif';
      g.fillText(fmtUpTo(e.mass, 2), x + cw / 2, y + ch * 0.86);
    }
    // info panel in the gap (groups 3–12, periods 1–3)
    const ix = cellX(3) + 4, iy = cellY(1) + 2, iw = cw * 10 - 8, ih = ch * 3 - 6;
    g.fillStyle = 'rgba(255,255,255,0.65)';
    roundRect(g, ix, iy, iw, ih, 10);
    g.fill();
    g.fillStyle = CATEGORY[selected.cat].color;
    roundRect(g, ix + 10, iy + 10, 96, 96, 10);
    g.fill();
    g.fillStyle = '#2b1d12';
    g.textAlign = 'center';
    g.font = '800 50px "Baloo 2", system-ui, sans-serif';
    g.fillText(selected.sym, ix + 58, iy + 64);
    g.font = '600 13px system-ui, sans-serif';
    g.fillText(String(selected.z), ix + 58, iy + 24);
    g.textAlign = 'left';
    g.font = '800 28px "Baloo 2", system-ui, sans-serif';
    g.fillText(t(selected.name), ix + 120, iy + 30);
    g.font = '600 14px system-ui, sans-serif';
    g.fillStyle = '#5a4430';
    g.fillText(`${t(CATEGORY[selected.cat].name)} · ${t(L('massa', 'mass'))} ${fmtUpTo(selected.mass, 3)} u`, ix + 120, iy + 60);
    g.fillText(`${t(L('Elektroner per skal', 'Electrons per shell'))}: ${shells(selected.z).join(', ')}`, ix + 120, iy + 84);
    g.fillStyle = '#2b1d12';
    g.font = '15px system-ui, sans-serif';
    wrap(g, t(selected.fact), ix + 14, iy + 128, iw - 28, 20, 4);
    // legend
    let lx = M + 4;
    const ly = CH - M - LEG / 2 + 4;
    g.font = '600 13px system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const k of Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]) {
      const name = t(CATEGORY[k].name);
      g.fillStyle = CATEGORY[k].color;
      roundRect(g, lx, ly - 8, 16, 16, 4);
      g.fill();
      g.fillStyle = '#3b2a1c';
      g.textAlign = 'left';
      g.fillText(name, lx + 20, ly);
      lx += 30 + g.measureText(name).width;
    }
  });
  (board.mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.72);
  board.mesh.position.set(BX, BY, WALL + 0.035);
  ctx.group.add(board.mesh);
  kit.box(BW + 0.16, BH + 0.16, 0.06, mats.darkWood, BX, BY - BH / 2 - 0.08, WALL);
  onLangChange(() => board.redraw());

  const elementAt = (uv: THREE.Vector2 | undefined) => {
    if (!uv) return null;
    const x = uv.x * CW, y = (1 - uv.y) * CH;
    const gcol = Math.floor((x - M) / cw) + 1;
    const p = Math.floor((y - M - TITLE) / ch) + 1;
    return ELEMENTS.find((e) => e.group === gcol && e.period === p) ?? null;
  };
  ctx.interaction.add(board.mesh, {
    label: L('Periodiska systemet', 'The periodic table'),
    onClick: (info) => {
      const e = elementAt(info.hit?.uv);
      if (e) selectElement(e);
    },
  });

  // ---------------------------------------------------------------- hologram pedestal
  const PX = BX, PZ = -7.15, PTOP = 0.62, AY = 1.12;
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, PTOP, 28), mats.cabinet);
  ped.position.set(PX, PTOP / 2, PZ);
  const pedTop = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.04, 28), mats.brass);
  pedTop.position.set(PX, PTOP + 0.02, PZ);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 48), kit.mats.accentGlow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(PX, PTOP + 0.045, PZ);
  const beamMat = new THREE.MeshBasicMaterial({ color: ctx.accent, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.9, 32, 1, true), beamMat);
  beam.position.set(PX, PTOP + 0.48, PZ);
  ctx.group.add(ped, pedTop, ring, beam);
  kit.staticize(ped, pedTop, ring);
  ctx.addCollider(PX, PZ, 0.7, 0.7);

  const holo = new THREE.Group();
  holo.position.set(PX, AY, PZ);
  ctx.group.add(holo);
  // Bohr atom
  const atomG = new THREE.Group();
  holo.add(atomG);
  const nucleus = new THREE.Mesh(kit.geos.sphere, new THREE.MeshStandardMaterial({ color: 0xff8a5a, emissive: 0xff5a2a, emissiveIntensity: 0.7, roughness: 0.4 }));
  atomG.add(nucleus);
  const SHELL_R = [0.11, 0.18, 0.25, 0.32];
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x9ff8e0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const shellMeshes = SHELL_R.map((r) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0025, 4, 64), shellMat);
    atomG.add(m);
    return m;
  });
  const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8ff0ff, toneMapped: false }), 36);
  electrons.frustumCulled = false;
  atomG.add(electrons);
  const atomLabel = kit.label(() => `${selected.sym} · ${shells(selected.z).join(' · ')}`, 0.42, 0.07, {
    bg: 'rgba(0,0,0,0)', color: '#c8fff0', glow: '#3dffb5', px: 512,
  });
  atomLabel.mesh.position.set(0, -0.4, 0.05);
  atomG.add(atomLabel.mesh);

  // Molecule builder
  const molG = new THREE.Group();
  molG.visible = false;
  holo.add(molG);
  const atomMats: Record<Atom, THREE.Material> = {
    H: new THREE.MeshStandardMaterial({ color: ATOM_INFO.H.color, roughness: 0.35 }),
    O: new THREE.MeshStandardMaterial({ color: ATOM_INFO.O.color, roughness: 0.35 }),
    C: new THREE.MeshStandardMaterial({ color: ATOM_INFO.C.color, roughness: 0.35 }),
  };
  const atomPool = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(kit.geos.sphere, atomMats.H);
    m.visible = false;
    molG.add(m);
    return m;
  });
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.4, metalness: 0.3 });
  const bondPool = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(kit.geos.cyl, bondMat);
    m.visible = false;
    molG.add(m);
    return m;
  });
  const molLabel = kit.label(() => molText(), 0.5, 0.08, { bg: 'rgba(0,0,0,0)', color: '#c8fff0', glow: '#3dffb5', px: 512 });
  molLabel.mesh.position.set(0, 0.36, 0);
  molG.add(molLabel.mesh);

  // atom bins on the pedestal rim
  const bins: THREE.Mesh[] = [];
  (['H', 'O', 'C'] as Atom[]).forEach((a, i) => {
    const m = new THREE.Mesh(kit.geos.sphere, atomMats[a]);
    m.scale.setScalar(ATOM_INFO[a].r * 0.8);
    const ang = -0.75 + i * 0.75;
    m.position.set(PX + Math.sin(ang) * 0.22, PTOP + 0.1, PZ + Math.cos(ang) * 0.22);
    ctx.group.add(m);
    bins.push(m);
    ctx.interaction.add(m, {
      label: L(`Lägg till en ${ATOM_INFO[a].name.sv}atom (${a})`, `Add a ${ATOM_INFO[a].name.en} atom (${a})`),
      onHover: (on) => m.scale.setScalar(ATOM_INFO[a].r * (on ? 1 : 0.8)),
      onClick: () => addAtom(a),
    });
  });
  const binTags = kit.label(() => 'H     O     C', 0.42, 0.08, { bg: 'rgba(0,0,0,0)', color: '#f6e7c8', px: 256 });
  binTags.mesh.position.set(PX, PTOP + 0.2, PZ + 0.28);
  ctx.group.add(binTags.mesh);

  // ---------------------------------------------------------------- state
  const found = new Set<string>();
  let focused = false;
  let hud: { refresh: () => void } | null = null;
  let pulse = 0;
  const viewed = new Set<number>();

  function molText() {
    if (mode !== 'molecule') return '';
    if (match) return `${match.formula} · ${t(match.name)}`;
    if (!order.length) return t(L('Klicka på H, O eller C', 'Click H, O or C'));
    return formulaOf(counts);
  }

  function selectElement(e: Element) {
    selected = e;
    mode = 'atom';
    viewed.add(e.z);
    board.redraw();
    atomLabel.redraw();
    layoutAtom();
    pulse = 1;
    ctx.sfx.tone(300 + e.z * 25, 0.18, { type: 'sine', gain: 0.07 });
    if (e.z === 18) kit.buddy.say(L('Argon! Samma sorts atomer som i partikellådan där borta.', 'Argon! The same kind of atoms as in the particle box over there.'), { expression: 'wink' });
    else if (viewed.size === 10) kit.buddy.say(L('Tio grundämnen utforskade! Ser du hur ytterskalet fylls på, rad för rad?', 'Ten elements explored! See how the outer shell fills up, row by row?'), { expression: 'happy' });
    hud?.refresh();
  }

  function layoutAtom() {
    const s = shells(selected.z);
    nucleus.scale.setScalar(0.028 + 0.009 * Math.cbrt(selected.mass));
    shellMeshes.forEach((m, i) => { m.visible = i < s.length; });
    electrons.count = selected.z;
    atomG.visible = mode === 'atom';
    molG.visible = mode === 'molecule';
  }

  function addAtom(a: Atom) {
    if (mode !== 'molecule') {
      mode = 'molecule';
      clearMol(false);
    }
    if (order.length >= 6) {
      ctx.sfx.error();
      return;
    }
    counts[a]++;
    order.push(a);
    ctx.sfx.pop();
    evaluate();
  }

  function clearMol(sound = true) {
    counts.H = counts.O = counts.C = 0;
    order.length = 0;
    match = null;
    if (sound) ctx.sfx.whoosh();
    evaluate();
  }

  function evaluate() {
    match = MOLECULES.find((m) => key(countsOf(m)) === key(counts)) ?? null;
    atomG.visible = mode === 'atom';
    molG.visible = mode === 'molecule';
    layoutMolecule();
    molLabel.redraw();
    if (match) {
      pulse = 1;
      const first = !found.has(match.formula);
      found.add(match.formula);
      ctx.sfx.chime();
      const goals = MOLECULES.filter((m) => m.goal);
      if (first && goals.every((m) => found.has(m.formula)) && match.goal) {
        kit.buddy.celebrate(L('Vatten, koldioxid och metan! Du har byggt alla tre med rätt antal bindningar.',
          'Water, carbon dioxide and methane! You built all three with the right number of bonds.'), true);
      } else if (first) {
        kit.buddy.celebrate(L(`Du byggde ${match.formula}, ${match.name.sv.toLowerCase()}!`, `You built ${match.formula}, ${match.name.en.toLowerCase()}!`));
      }
    }
    hud?.refresh();
  }

  const up = new THREE.Vector3(0, 1, 0);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vd = new THREE.Vector3(), vo = new THREE.Vector3();
  function layoutMolecule() {
    atomPool.forEach((m) => { m.visible = false; });
    bondPool.forEach((m) => { m.visible = false; });
    if (match) {
      match.atoms.forEach(([a, x, y, z], i) => {
        const m = atomPool[i];
        m.material = atomMats[a];
        m.scale.setScalar(ATOM_INFO[a].r);
        m.position.set(x, y, z);
        m.visible = true;
      });
      let k = 0;
      for (const [ia, ib, ord] of match.bonds) {
        va.set(match.atoms[ia][1], match.atoms[ia][2], match.atoms[ia][3]);
        vb.set(match.atoms[ib][1], match.atoms[ib][2], match.atoms[ib][3]);
        vd.subVectors(vb, va);
        const len = vd.length();
        vd.normalize();
        vo.crossVectors(vd, Math.abs(vd.z) > 0.9 ? up : new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.022);
        for (let o = 0; o < ord; o++) {
          const m = bondPool[k++];
          const off = ord === 1 ? 0 : o === 0 ? -1 : 1;
          m.position.addVectors(va, vb).multiplyScalar(0.5).addScaledVector(vo, off);
          m.quaternion.setFromUnitVectors(up, vd);
          m.scale.set(0.011, len, 0.011);
          m.visible = true;
        }
      }
    } else {
      // loose atoms floating in a ring, not yet a known molecule
      order.forEach((a, i) => {
        const m = atomPool[i];
        const ang = (i / Math.max(1, order.length)) * Math.PI * 2;
        m.material = atomMats[a];
        m.scale.setScalar(ATOM_INFO[a].r);
        m.position.set(Math.cos(ang) * 0.17 * Math.min(1, order.length / 2), Math.sin(ang) * 0.12, 0);
        m.visible = true;
      });
    }
  }

  function hint(): L10n {
    if (!order.length) return L('Bygg vatten (H₂O), koldioxid (CO₂) och metan (CH₄). Varje atom har ett bestämt antal bindningsarmar: H 1, O 2, C 4.',
      'Build water (H₂O), carbon dioxide (CO₂) and methane (CH₄). Every atom has a set number of bonding arms: H 1, O 2, C 4.');
    if (match) return match.note;
    // closest molecule you can still reach by adding atoms
    let best: { m: Molecule; add: Record<Atom, number>; n: number } | null = null;
    for (const m of MOLECULES) {
      const c = countsOf(m);
      if (c.H < counts.H || c.O < counts.O || c.C < counts.C) continue;
      const add = { H: c.H - counts.H, O: c.O - counts.O, C: c.C - counts.C };
      const n = add.H + add.O + add.C;
      if (!best || n < best.n || (n === best.n && m.goal && !best.m.goal)) best = { m, add, n };
    }
    const arms = order.reduce((s, a) => s + VALENCE[a], 0);
    if (!best) return L(`Den här kombinationen blir ingen stabil molekyl här. Armar totalt: ${arms}. Töm och prova igen!`,
      `This combination doesn't make a stable molecule here. Total arms: ${arms}. Empty and try again!`);
    const parts = (lang: 'sv' | 'en') => (['H', 'O', 'C'] as Atom[]).filter((a) => best!.add[a] > 0)
      .map((a) => `${best!.add[a]} ${a}`).join(lang === 'sv' ? ' och ' : ' and ');
    return L(`Lediga bindningsarmar kvar! Lägg till ${parts('sv')} för att få ${best.m.formula}.`,
      `Free bonding arms left! Add ${parts('en')} to make ${best.m.formula}.`);
  }

  ctx.addStation({
    id: 'chem-periodic',
    title: L('Periodiska systemet och molekylbygget', 'The periodic table and molecule builder'),
    position: [PX, PZ + 0.2],
    viewpoint: { position: [PX + 0.4, 1.7, -3.9], target: [PX + 1.0, 2.15, -8.9] },
    intro: L('Allt du ser är byggt av drygt hundra grundämnen. Klicka på ett och titta in i dess atom!',
      'Everything you see is built from just over a hundred elements. Click one and look inside its atom!'),
    howTo: L('Klicka på ett grundämne på väggen för att se dess atom. Klicka på H, O och C vid hologrammet för att bygga molekyler.',
      'Click an element on the wall to see its atom. Click H, O and C at the hologram to build molecules.'),
    science: L(
      'En atom har en kärna med protoner och neutroner, och elektroner runt omkring i skal. Atomnumret är antalet protoner: väte har 1, krypton 36. Elektronerna fyller skalen inifrån och ut, ungefär 2, 8, 8 och sedan 18, och ämnen med lika många elektroner i ytterskalet hamnar i samma kolumn och beter sig likt. Bohrs modell med cirkelbanor är en förenkling; egentligen är elektronerna utsmetade moln. Atomer binder till varandra genom att dela elektroner: väte har en bindningsarm, syre två och kol fyra. Atomer är nästan helt tomma: om kärnan var en ärta skulle atomen vara stor som en fotbollsarena.',
      'An atom has a nucleus of protons and neutrons, with electrons around it in shells. The atomic number is the number of protons: hydrogen has 1, krypton 36. Electrons fill the shells from the inside out, roughly 2, 8, 8 and then 18, and elements with the same number of outer electrons end up in the same column and behave alike. Bohr\'s model with circular orbits is a simplification; really the electrons are smeared-out clouds. Atoms bond by sharing electrons: hydrogen has one bonding arm, oxygen two and carbon four. Atoms are almost completely empty: if the nucleus were a pea, the atom would be the size of a football stadium.'),
    wow: L('Mendelejev lämnade tomma rutor i sitt system 1869 och förutsade gallium och germanium innan någon hade hittat dem.',
      'Mendeleev left empty boxes in his table in 1869 and predicted gallium and germanium before anyone had found them.'),
    onFocus: () => { focused = true; },
    onBlur: () => { focused = false; },
    controls: (panel) => {
      panel.heading(L('Atomen', 'The atom'));
      panel.buttons([
        { label: L('◀ Föregående', '◀ Previous'), onClick: () => selectElement(ELEMENTS[(selected.z + 34) % 36]) },
        { label: L('Nästa ▶', 'Next ▶'), onClick: () => selectElement(ELEMENTS[selected.z % 36]) },
      ]);
      const name = panel.readout(L('Grundämne', 'Element'));
      const zR = panel.readout(L('Atomnummer (protoner)', 'Atomic number (protons)'));
      const sh = panel.readout(L('Elektroner per skal', 'Electrons per shell'));
      const fact = panel.note(L('', ''));
      panel.heading(L('Bygg en molekyl', 'Build a molecule'));
      panel.buttons([
        { label: L('+ H', '+ H'), onClick: () => addAtom('H') },
        { label: L('+ O', '+ O'), onClick: () => addAtom('O') },
        { label: L('+ C', '+ C'), onClick: () => addAtom('C') },
        { label: L('Töm', 'Empty'), icon: '🧽', onClick: () => clearMol() },
      ]);
      const formula = panel.readout(L('Du har', 'You have'));
      const goals = panel.readout(L('Byggda', 'Built'));
      const hintEl = panel.note(L('', ''));
      hud = {
        refresh: () => {
          name.set(`${selected.sym} · ${t(selected.name)}`);
          zR.set(String(selected.z));
          sh.set(shells(selected.z).join(', '));
          fact.textContent = t(selected.fact);
          formula.set(order.length ? formulaOf(counts) + (match ? ` = ${t(match.name)}` : '') : '–');
          goals.set(MOLECULES.filter((m) => m.goal || found.has(m.formula))
            .map((m) => `${found.has(m.formula) ? '✅' : '⬜'} ${m.formula}`).join('  '));
          hintEl.textContent = t(hint());
        },
      };
      hud.refresh();
      return () => { hud = null; };
    },
  });

  layoutAtom();
  const mm = new THREE.Matrix4();
  const SPEED = [1.6, 1.0, 0.7, 0.5];

  return {
    center: [PX, PZ],
    update(dt, time, near) {
      beamMat.opacity = 0.06 + 0.025 * Math.sin(time * 1.7);
      if (!near && !focused) return;
      pulse = Math.max(0, pulse - dt * 1.5);
      holo.scale.setScalar(1.25 * (1 + pulse * 0.12 * Math.sin(pulse * 12)));
      holo.position.y = AY + Math.sin(time * 1.2) * 0.012;
      if (mode === 'atom') {
        atomG.rotation.y = Math.sin(time * 0.4) * 0.5;
        const s = shells(selected.z);
        let k = 0;
        for (let sh = 0; sh < s.length; sh++) {
          const r = SHELL_R[sh];
          for (let i = 0; i < s[sh]; i++) {
            const a = (i / s[sh]) * Math.PI * 2 + time * SPEED[sh] * (sh % 2 ? -1 : 1);
            mm.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, 0);
            electrons.setMatrixAt(k++, mm);
          }
        }
        electrons.instanceMatrix.needsUpdate = true;
        nucleus.rotation.y = time;
      } else {
        molG.rotation.y = time * 0.6;
        if (!match) {
          order.forEach((_, i) => {
            atomPool[i].position.y += Math.sin(time * 2 + i) * 0.0006;
          });
        }
      }
    },
  };
}

const SUB: Record<string, string> = { '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆' };
function formulaOf(c: Record<Atom, number>) {
  const part = (a: Atom) => (c[a] ? a + (c[a] > 1 ? SUB[String(c[a])] : '') : '');
  return part('C') + part('H') + part('O') || '–';
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + n * lh);
      line = w;
      if (++n >= maxLines) return;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n * lh);
}
