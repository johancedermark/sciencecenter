/**
 * Builds the architecture (atrium, corridors, room shells, doors, signs), owns the light rig,
 * room visibility and the station registry, and hands each RoomDef a RoomContext.
 */
import * as THREE from 'three';
import { Collision } from './collision';
import {
  ATRIUM_H, ATRIUM_R, CORRIDOR_H, CORRIDOR_HALF, N_ROOMS, ROOM, ROOM_NEAR, ROOM_ORDER,
  areaAt, roomCenter, roomDir, roomYaw, type Area,
} from './layout';
import { carpet, plaster, radialSpot, starSky, textTexture, woodFloor, drawText } from './textures';
import { onLangChange, t } from './i18n';
import type { BuddyApi, L10n, LightAnchor, RoomContext, RoomDef, RoomId, RoomInstance, StationDef } from './types';
import type { Interaction } from './interaction';
import type { Sfx } from './sfx';

export interface RegisteredStation {
  room: RoomId | 'atrium';
  def: StationDef;
  /** World-space exhibit centre on the floor. */
  world: THREE.Vector3;
  viewPos: THREE.Vector3;
  viewTarget: THREE.Vector3;
  marker: THREE.Mesh;
}

interface RoomSlot {
  index: number;
  def: RoomDef;
  group: THREE.Group;
  corridor: THREE.Group;
  instance: RoomInstance | null;
  anchors: LightAnchor[];
  door: { left: THREE.Mesh; right: THREE.Mesh; open: number };
}

const DOOR_W = CORRIDOR_HALF * 2;
const DOOR_H = 3.2;
const RIG_SIZE = 6;

export class World {
  readonly collision = new Collision();
  readonly root = new THREE.Group();
  readonly atrium = new THREE.Group();
  readonly stations: RegisteredStation[] = [];
  private slots: RoomSlot[] = [];
  private atriumInstance: RoomInstance | null = null;
  private atriumAnchors: LightAnchor[] = [];
  private rig: THREE.PointLight[] = [];
  private rigTargets: { pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number }[] = [];
  private rigArea = '';
  private signRedraws: (() => void)[] = [];
  private markerTex = radialSpot('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  area: Area = { id: 'atrium', kind: 'atrium', index: -1 };

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private interaction: Interaction,
    private sfx: Sfx,
    private buddy: BuddyApi,
  ) {
    scene.add(this.root);
    this.root.add(this.atrium);
    // Constant base light so shader light counts never change (no recompiles).
    const hemi = new THREE.HemisphereLight(0xffd8b4, 0x2a1a24, 0.5);
    scene.add(hemi);
    for (let i = 0; i < RIG_SIZE; i++) {
      const l = new THREE.PointLight(0xffd9a8, 0, 14, 1.6);
      scene.add(l);
      this.rig.push(l);
      this.rigTargets.push({ pos: new THREE.Vector3(), color: new THREE.Color(0xffd9a8), intensity: 0, distance: 14 });
    }
    onLangChange(() => this.signRedraws.forEach((f) => f()));
  }

  // ------------------------------------------------------------------ build

  build(rooms: RoomDef[], atriumDef: Omit<RoomDef, 'id'>) {
    this.buildAtriumShell();
    const byId = new Map(rooms.map((r) => [r.id, r]));
    ROOM_ORDER.forEach((id, i) => {
      const def = byId.get(id);
      if (!def) throw new Error(`Missing room ${id}`);
      this.buildCorridorAndRoom(i, def);
    });
    // Atrium exhibits (Foucault pendulum etc.) use the same context API, in world space.
    const ctx = this.makeContext('atrium', this.atrium, 0xffc070, this.atriumAnchors, {
      width: ATRIUM_R * 2, depth: ATRIUM_R * 2, height: ATRIUM_H,
    });
    let t0 = performance.now();
    this.atriumInstance = atriumDef.build(ctx);
    if (import.meta.env.DEV) console.info(`[world] built atrium in ${Math.round(performance.now() - t0)} ms`);
    this.slots.forEach((s) => {
      const ctx = this.makeContext(s.def.id, s.group, s.def.accent, s.anchors, ROOM);
      t0 = performance.now();
      s.instance = s.def.build(ctx);
      if (import.meta.env.DEV) console.info(`[world] built ${s.def.id} in ${Math.round(performance.now() - t0)} ms`);
    });
  }

  private makeContext(
    room: RoomId | 'atrium',
    group: THREE.Group,
    accent: number,
    anchors: LightAnchor[],
    size: { width: number; depth: number; height: number },
  ): RoomContext {
    const toWorld = (v: THREE.Vector3) => {
      group.updateMatrixWorld(true);
      return v.clone().applyMatrix4(group.matrixWorld);
    };
    return {
      group,
      size,
      accent,
      interaction: this.interaction,
      sfx: this.sfx,
      buddy: this.buddy,
      camera: this.camera,
      t,
      toWorld,
      addStation: (def) => {
        const world = toWorld(new THREE.Vector3(def.position[0], 0, def.position[1]));
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1.15, 48),
          new THREE.MeshBasicMaterial({
            color: accent, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending,
          }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(def.position[0], 0.012, def.position[1]);
        group.add(marker);
        this.stations.push({
          room,
          def,
          world,
          viewPos: toWorld(new THREE.Vector3(...def.viewpoint.position)),
          viewTarget: toWorld(new THREE.Vector3(...def.viewpoint.target)),
          marker,
        });
      },
      addCollider: (x, z, w, d) => {
        const pts: [number, number][] = [
          [x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2],
        ].map(([px, pz]) => {
          const v = toWorld(new THREE.Vector3(px, 0, pz));
          return [v.x, v.z] as [number, number];
        });
        this.collision.addPolygon(pts);
      },
      addLight: (a) => {
        const limit = room === 'atrium' ? RIG_SIZE : 4;
        if (anchors.length >= limit) {
          console.warn(`[world] ${room}: max ${limit} light anchors`);
          return;
        }
        anchors.push(a);
      },
    };
  }

  private mats = {
    wood: new THREE.MeshStandardMaterial({ map: woodFloor([10, 10]), roughness: 0.55, metalness: 0.0 }),
    plaster: new THREE.MeshStandardMaterial({ map: plaster('#d9c7b0', [6, 1]), roughness: 0.92, side: THREE.DoubleSide }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 0.6 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x2b2330, roughness: 0.95, side: THREE.DoubleSide }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.3, metalness: 0.9 }),
    warmGlow: new THREE.MeshBasicMaterial({ color: 0xffd7a0 }),
  };

  private buildAtriumShell() {
    const g = this.atrium;
    const m = this.mats;

    // Floor: wooden disc with an inlaid brass compass ring.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ATRIUM_R + 0.3, 96), m.wood);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'floor';
    g.add(floor);
    this.interaction.walkables.push(floor);

    // Walls: arcs between door gaps, plus a full band above the doors.
    const gapHalf = Math.asin((CORRIDOR_HALF + 0.05) / ATRIUM_R);
    const step = (Math.PI * 2) / N_ROOMS;
    for (let i = 0; i < N_ROOMS; i++) {
      const a0 = i * step + gapHalf;
      const a1 = (i + 1) * step - gapHalf;
      // three.js cylinder theta starts at +Z and goes towards +X, same as our room angle.
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(ATRIUM_R, ATRIUM_R, CORRIDOR_H, 48, 1, true, a0, a1 - a0),
        m.plaster,
      );
      wall.position.y = CORRIDOR_H / 2;
      g.add(wall);
      // Collision: polyline along the arc.
      const n = 12;
      for (let k = 0; k < n; k++) {
        const t0 = a0 + ((a1 - a0) * k) / n;
        const t1 = a0 + ((a1 - a0) * (k + 1)) / n;
        this.collision.add(Math.sin(t0) * ATRIUM_R, Math.cos(t0) * ATRIUM_R, Math.sin(t1) * ATRIUM_R, Math.cos(t1) * ATRIUM_R);
      }
      // Wainscot: dark wood band along the lower wall.
      const wains = new THREE.Mesh(
        new THREE.CylinderGeometry(ATRIUM_R - 0.03, ATRIUM_R - 0.03, 1.0, 48, 1, true, a0, a1 - a0),
        new THREE.MeshStandardMaterial({ color: 0x5a3824, roughness: 0.55, side: THREE.BackSide }),
      );
      wains.position.y = 0.5;
      g.add(wains);
    }
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(ATRIUM_R, ATRIUM_R, ATRIUM_H - CORRIDOR_H, 96, 1, true),
      m.plaster,
    );
    upper.position.y = CORRIDOR_H + (ATRIUM_H - CORRIDOR_H) / 2;
    g.add(upper);
    // Warm LED cove where the wall meets the dome.
    const cove = new THREE.Mesh(new THREE.TorusGeometry(ATRIUM_R - 0.15, 0.06, 8, 160), new THREE.MeshBasicMaterial({ color: 0xffc27a }));
    cove.rotation.x = Math.PI / 2;
    cove.position.y = ATRIUM_H - 0.1;
    g.add(cove);
    const mid = cove.clone();
    mid.position.y = CORRIDOR_H + 0.15;
    mid.scale.setScalar(0.995);
    g.add(mid);

    // Glass dome with a geodesic brass frame under a starry sky.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(80, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: starSky(), side: THREE.BackSide, fog: false }),
    );
    sky.position.y = ATRIUM_H - 2;
    g.add(sky);
    const domeGeo = new THREE.IcosahedronGeometry(ATRIUM_R, 3);
    const edges = new THREE.EdgesGeometry(domeGeo);
    const pos = edges.getAttribute('position');
    const kept: number[] = [];
    for (let i = 0; i < pos.count; i += 2) {
      if (pos.getY(i) >= -0.01 && pos.getY(i + 1) >= -0.01) {
        kept.push(pos.getX(i), pos.getY(i), pos.getZ(i), pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
      }
    }
    const frameGeo = new THREE.BufferGeometry();
    frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    const frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: 0xffb871, transparent: true, opacity: 0.55 }));
    frame.position.y = ATRIUM_H;
    frame.scale.y = 0.6;
    g.add(frame);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(ATRIUM_R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: 0x223355, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, side: THREE.BackSide, depthWrite: false,
      }),
    );
    glass.position.y = ATRIUM_H;
    glass.scale.y = 0.6;
    g.add(glass);

    // Signs above each corridor mouth are added in buildCorridorAndRoom.
  }

  private neonSign(text: () => string, color: number, w: number, h: number, px = 1024): THREE.Mesh {
    const height = Math.round((px * h) / w);
    const c = document.createElement('canvas');
    c.width = px;
    c.height = height;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const col = `#${new THREE.Color(color).getHexString()}`;
    const draw = () => {
      drawText(g, px, height, text(), {
        color: '#fff8ec', glow: col,
        font: `700 ${Math.round(height * 0.5)}px "Baloo 2", system-ui, sans-serif`,
      });
      tex.needsUpdate = true;
    };
    draw();
    this.signRedraws.push(draw);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    return mesh;
  }

  private buildCorridorAndRoom(i: number, def: RoomDef) {
    const [dx, dz] = roomDir(i);
    const yaw = roomYaw(i);
    const accent = new THREE.Color(def.accent);

    // ---- corridor (built in a frame rotated like the room: local +Z towards atrium)
    const corridor = new THREE.Group();
    corridor.rotation.y = yaw;
    this.root.add(corridor);
    // The corridor starts where its side walls meet the atrium circle.
    const start = Math.sqrt(ATRIUM_R * ATRIUM_R - CORRIDOR_HALF * CORRIDOR_HALF) - 0.02;
    const len = ROOM_NEAR - start;
    const midR = (start + ROOM_NEAR) / 2;
    corridor.position.set(dx * midR, 0, dz * midR);
    const cf = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_W + 0.1, len),
      new THREE.MeshStandardMaterial({ map: carpet(def.accent, [1, len / 2]), roughness: 1 }),
    );
    cf.rotation.x = -Math.PI / 2;
    cf.position.y = 0.004;
    corridor.add(cf);
    this.interaction.walkables.push(cf);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, CORRIDOR_H), this.mats.plaster);
      wall.rotation.y = (side * Math.PI) / 2 * -1;
      wall.position.set(side * CORRIDOR_HALF, CORRIDOR_H / 2, 0);
      corridor.add(wall);
      // Accent LED strip at floor level
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, len), new THREE.MeshBasicMaterial({ color: accent }));
      strip.position.set(side * (CORRIDOR_HALF - 0.02), 0.06, 0);
      corridor.add(strip);
      // Collision
      corridor.updateMatrixWorld(true);
      const aw = new THREE.Vector3(side * CORRIDOR_HALF, 0, -len / 2).applyMatrix4(corridor.matrixWorld);
      const bw = new THREE.Vector3(side * CORRIDOR_HALF, 0, len / 2).applyMatrix4(corridor.matrixWorld);
      this.collision.add(aw.x, aw.z, bw.x, bw.z);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, len), this.mats.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CORRIDOR_H;
    corridor.add(ceil);
    // Warm round ceiling lamps
    for (let k = 0; k < 4; k++) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 24), this.mats.warmGlow);
      lamp.position.set(0, CORRIDOR_H - 0.02, -len / 2 + ((k + 0.5) * len) / 4);
      corridor.add(lamp);
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(1.4, 32),
        new THREE.MeshBasicMaterial({ map: this.markerTex, color: 0xffb877, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.01, lamp.position.z);
      corridor.add(pool);
    }

    // ---- neon sign above the corridor mouth in the atrium
    const sign = this.neonSign(() => `${def.icon}  ${t(def.title)}`, def.accent, 5.2, 1.0);
    // Flat sign in front of a curved wall: inset by the arc's sagitta so the corners don't clip.
    const sr = ATRIUM_R - (5.2 * 5.2) / (8 * ATRIUM_R) - 0.06;
    sign.position.set(dx * sr, CORRIDOR_H + 0.9, dz * sr);
    sign.rotation.y = yaw;
    this.atrium.add(sign);
    // Accent arch around the mouth
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(CORRIDOR_HALF + 0.05, 0.05, 8, 40, Math.PI),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    arch.position.set(dx * (ATRIUM_R - 0.05), CORRIDOR_H - CORRIDOR_HALF - 0.05, dz * (ATRIUM_R - 0.05));
    arch.rotation.y = yaw;
    this.atrium.add(arch);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, CORRIDOR_H - CORRIDOR_HALF - 0.05, 0.1), new THREE.MeshBasicMaterial({ color: accent }));
      const lx = side * (CORRIDOR_HALF + 0.05);
      post.position.set(dx * (ATRIUM_R - 0.05) + Math.cos(yaw) * lx, (CORRIDOR_H - CORRIDOR_HALF - 0.05) / 2, dz * (ATRIUM_R - 0.05) - Math.sin(yaw) * lx);
      post.rotation.y = yaw;
      this.atrium.add(post);
    }

    // ---- room shell
    const group = new THREE.Group();
    group.position.copy(roomCenter(i));
    group.rotation.y = yaw;
    group.name = def.id;
    this.root.add(group);
    group.updateMatrixWorld(true);
    const W = ROOM.width;
    const D = ROOM.depth;
    const H = ROOM.height;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: woodFloor([5, 4.5]), roughness: 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);
    this.interaction.walkables.push(floor);
    // Big soft rug in accent tint in the middle
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 6, D - 6),
      new THREE.MeshStandardMaterial({ map: carpet(def.accent, [4, 3.5]), roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.006;
    group.add(rug);

    const wallMat = new THREE.MeshStandardMaterial({
      map: plaster(`#${new THREE.Color(0xd9c7b0).lerp(accent, 0.1).getHexString()}`, [4, 1]),
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const addWall = (x: number, z: number, w: number, h: number, ry: number, y = h / 2) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      wall.position.set(x, y, z);
      wall.rotation.y = ry;
      group.add(wall);
      return wall;
    };
    addWall(0, -D / 2, W, H, 0); // back
    addWall(-W / 2, 0, D, H, Math.PI / 2); // left
    addWall(W / 2, 0, D, H, -Math.PI / 2); // right
    const sideW = (W - DOOR_W) / 2;
    addWall(-W / 2 + sideW / 2, D / 2, sideW, H, Math.PI);
    addWall(W / 2 - sideW / 2, D / 2, sideW, H, Math.PI);
    addWall(0, D / 2, DOOR_W, H - DOOR_H, Math.PI, DOOR_H + (H - DOOR_H) / 2);

    // Wainscot and LED baseboard in accent colour.
    const wainMat = new THREE.MeshStandardMaterial({ color: 0x4a2f20, roughness: 0.6 });
    const ledMat = new THREE.MeshBasicMaterial({ color: accent });
    const runs: [number, number, number, number][] = [
      [0, -D / 2 + 0.03, W, 0], [-W / 2 + 0.03, 0, D, Math.PI / 2], [W / 2 - 0.03, 0, D, Math.PI / 2],
      [-W / 2 + sideW / 2, D / 2 - 0.03, sideW, 0], [W / 2 - sideW / 2, D / 2 - 0.03, sideW, 0],
    ];
    for (const [x, z, w, ry] of runs) {
      const wain = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.04), wainMat);
      wain.position.set(x, 0.45, z);
      wain.rotation.y = ry;
      group.add(wain);
      const led = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.05), ledMat);
      led.position.set(x, 0.92, z);
      led.rotation.y = ry;
      group.add(led);
    }

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mats.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    group.add(ceiling);
    // Wooden beams and warm pendant lamps
    for (let k = -2; k <= 2; k++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, 0.25), this.mats.darkWood);
      beam.position.set(0, H - 0.15, k * (D / 5));
      group.add(beam);
    }
    for (const [x, z] of [[-5, -4], [5, -4], [-5, 4], [5, 4]] as const) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2), this.mats.darkWood);
      cord.position.set(x, H - 0.6, z);
      group.add(cord);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 0.35, 32, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2d2a33, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }),
      );
      shade.position.set(x, H - 1.3, z);
      group.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), this.mats.warmGlow);
      bulb.position.set(x, H - 1.42, z);
      group.add(bulb);
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(2.6, 32),
        new THREE.MeshBasicMaterial({ map: this.markerTex, color: 0xffb877, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.012, z);
      group.add(pool);
    }

    // Room title on the back wall
    const title = this.neonSign(() => `${def.icon} ${t(def.title)}`, def.accent, 9, 1.4);
    title.position.set(0, H - 1.1, -D / 2 + 0.04);
    group.add(title);
    // Room title above the door, seen from the corridor
    const doorSign = this.neonSign(() => t(def.title), def.accent, 3.2, 0.55, 768);
    doorSign.position.set(0, DOOR_H + 0.4, D / 2 + 0.03);
    group.add(doorSign);

    // Colliders (room-local → world)
    const wp = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(group.matrixWorld);
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => this.collision.add(a.x, a.z, b.x, b.z);
    seg(wp(-W / 2, -D / 2), wp(W / 2, -D / 2));
    seg(wp(-W / 2, -D / 2), wp(-W / 2, D / 2));
    seg(wp(W / 2, -D / 2), wp(W / 2, D / 2));
    seg(wp(-W / 2, D / 2), wp(-DOOR_W / 2, D / 2));
    seg(wp(DOOR_W / 2, D / 2), wp(W / 2, D / 2));

    // Sliding doors (frosted glass with accent edge) and their gate collider.
    const doorMat = new THREE.MeshPhysicalMaterial({
      color: 0xdfe8f0, roughness: 0.35, transmission: 0, transparent: true, opacity: 0.82, metalness: 0.1,
    });
    const mkPanel = () => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H, 0.06), doorMat);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, DOOR_H, 0.08), ledMat);
      edge.position.x = DOOR_W / 4 - 0.02;
      p.add(edge);
      const icon = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: textTexture(def.icon, { width: 256, height: 256, font: '180px system-ui' }), transparent: true }),
      );
      icon.position.set(0, 0.2, 0.035);
      p.add(icon);
      return p;
    };
    const left = mkPanel();
    const right = mkPanel();
    right.scale.x = -1;
    left.position.set(-DOOR_W / 4, DOOR_H / 2, D / 2);
    right.position.set(DOOR_W / 4, DOOR_H / 2, D / 2);
    group.add(left, right);
    const ga = wp(-DOOR_W / 2, D / 2);
    const gb = wp(DOOR_W / 2, D / 2);
    this.collision.addGate(def.id, ga.x, ga.z, gb.x, gb.z);

    this.slots.push({ index: i, def, group, corridor, instance: null, anchors: [], door: { left, right, open: 0 } });
  }

  // ------------------------------------------------------------------ runtime

  /** Distance from a world point to room i's door centre. */
  private doorDistance(i: number, p: THREE.Vector3) {
    const [dx, dz] = roomDir(i);
    return Math.hypot(p.x - dx * ROOM_NEAR, p.z - dz * ROOM_NEAR);
  }

  update(dt: number, time: number, player: THREE.Vector3, playerFocused: boolean) {
    this.area = areaAt(player.x, player.z);
    const a = this.area;

    for (const s of this.slots) {
      const near = this.doorDistance(s.index, player) < 3.6;
      const target = near ? 1 : 0;
      const prev = s.door.open;
      s.door.open += Math.sign(target - s.door.open) * Math.min(Math.abs(target - s.door.open), dt * 2.4);
      if (prev === 0 && s.door.open > 0) this.sfx.noise(0.5, { freq: 500, to: 1400, gain: 0.05 });
      const k = s.door.open * s.door.open * (3 - 2 * s.door.open);
      s.door.left.position.x = -DOOR_W / 4 - k * (DOOR_W / 2 - 0.05);
      s.door.right.position.x = DOOR_W / 4 + k * (DOOR_W / 2 - 0.05);
      this.collision.setGate(s.def.id, s.door.open > 0.6);

      const mine = a.index === s.index;
      s.group.visible = (mine && a.kind !== 'atrium') || s.door.open > 0;
      s.corridor.visible = a.kind === 'atrium' || mine;
      if (s.group.visible) s.instance?.update?.(dt, time);
    }
    const inRoomDeep = a.kind === 'room' && !this.slots[a.index].door.open;
    this.atrium.visible = !inRoomDeep;
    if (this.atrium.visible) this.atriumInstance?.update?.(dt, time);

    this.updateRig(dt);
    this.updateMarkers(time, player, playerFocused);
  }

  private updateRig(dt: number) {
    const a = this.area;
    const key = a.kind === 'atrium' ? 'atrium' : a.id;
    if (key !== this.rigArea) {
      this.rigArea = key;
      const anchors = a.kind === 'atrium' ? this.atriumAnchors : this.slots[a.index].anchors;
      const xf = a.kind === 'atrium' ? this.atrium : this.slots[a.index].group;
      xf.updateMatrixWorld(true);
      for (let i = 0; i < RIG_SIZE; i++) {
        const an = anchors[i];
        const tgt = this.rigTargets[i];
        if (an) {
          tgt.pos.set(...an.position).applyMatrix4(xf.matrixWorld);
          tgt.color.setHex(an.color);
          tgt.intensity = an.intensity;
          tgt.distance = an.distance ?? 14;
        } else {
          tgt.intensity = 0;
        }
      }
      // Move lights instantly while they're dim; fade intensity.
      this.rig.forEach((l, i) => {
        l.intensity = 0;
        l.position.copy(this.rigTargets[i].pos);
        l.color.copy(this.rigTargets[i].color);
        l.distance = this.rigTargets[i].distance;
      });
    }
    this.rig.forEach((l, i) => {
      l.intensity += (this.rigTargets[i].intensity - l.intensity) * Math.min(1, dt * 3);
    });
  }

  private updateMarkers(time: number, player: THREE.Vector3, focused: boolean) {
    for (const s of this.stations) {
      const d = Math.hypot(s.world.x - player.x, s.world.z - player.z);
      const mat = s.marker.material as THREE.MeshBasicMaterial;
      const target = focused ? 0 : d < 7 ? 0.25 + 0.15 * Math.sin(time * 3) : 0.08;
      mat.opacity += (target - mat.opacity) * 0.1;
    }
  }

  /** The closest station within reach in the visitor's current area. */
  nearestStation(p: THREE.Vector3, reach = 3.2): RegisteredStation | null {
    let best: RegisteredStation | null = null;
    let bd = reach;
    for (const s of this.stations) {
      if (s.room !== this.area.id) continue;
      const d = Math.hypot(s.world.x - p.x, s.world.z - p.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  roomDefs(): RoomDef[] {
    return this.slots.map((s) => s.def);
  }

  titleOf(id: RoomId | 'atrium'): L10n {
    if (id === 'atrium') return { sv: 'Atriet', en: 'The Atrium' };
    return this.slots.find((s) => s.def.id === id)!.def.title;
  }

  /** Show everything once so the GPU compiles all shaders before the visitor starts walking. */
  async prewarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, onProgress?: (f: number) => void) {
    // Compile area by area with the async (parallel) compiler so the page never blocks for long.
    const groups = [this.atrium, ...this.slots.map((s) => s.group)];
    const prev = groups.map((g) => g.visible);
    for (let i = 0; i < groups.length; i++) {
      groups.forEach((g, j) => (g.visible = i === j));
      const t0 = performance.now();
      await renderer.compileAsync(scene, camera);
      if (import.meta.env.DEV) console.info(`[world] compiled ${groups[i].name || 'atrium'} in ${Math.round(performance.now() - t0)} ms, programs: ${renderer.info.programs?.length}`);
      onProgress?.((i + 1) / groups.length);
    }
    groups.forEach((g, j) => (g.visible = prev[j]));
  }
}
