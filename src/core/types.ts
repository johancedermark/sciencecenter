/**
 * Shared contract between the engine, the rooms, Buddy and the UI.
 * Rooms are built in a room-local frame:
 *   origin = centre of the room floor, +Y up,
 *   +Z points towards the entrance (the atrium), the back wall is at z = -depth/2,
 *   x runs from -width/2 (left when you walk in) to +width/2.
 */
import type * as THREE from 'three';
import type { Interaction } from './interaction';
import type { Sfx } from './sfx';
import type { ControlPanel } from './controlPanel';

export type Lang = 'sv' | 'en';
export type L10n = { sv: string; en: string };

export type RoomId = 'electricity' | 'light' | 'sound' | 'motion' | 'space' | 'perception' | 'chemistry';
export type AreaId = 'atrium' | RoomId;

export interface Viewpoint {
  /** Camera position, room-local. */
  position: THREE.Vector3Tuple;
  /** Point the camera looks at, room-local. */
  target: THREE.Vector3Tuple;
}

export interface StationDef {
  id: string;
  title: L10n;
  /** Room-local x,z of the exhibit centre; the visitor gets a prompt within ~3 m of it. */
  position: [number, number];
  /** Close-up camera used while the station is focused. */
  viewpoint: Viewpoint;
  /** One or two sentence hook that Buddy says when you start the station. */
  intro: L10n;
  /** What to do, short and imperative. */
  howTo: L10n;
  /** The correct science, 2–5 sentences, kid-friendly but precise. */
  science: L10n;
  /** A surprising fact. */
  wow?: L10n;
  /** Build HUD controls while focused. May return a cleanup function. */
  controls?: (panel: ControlPanel) => void | (() => void);
  onFocus?(): void;
  onBlur?(): void;
}

export interface LightAnchor {
  /** Room-local position. */
  position: THREE.Vector3Tuple;
  color: number;
  intensity: number;
  distance?: number;
}

export type Expression =
  | 'happy' | 'idea' | 'skeptical' | 'joy' | 'wink' | 'surprised'
  | 'sad' | 'confused' | 'determined' | 'sleepy' | 'thinking' | 'love';

export type Gesture = 'wave' | 'point' | 'think' | 'celebrate' | 'thumbsUp' | 'shrug' | 'nod' | 'clap';

export interface BuddyApi {
  /** Speak a line: subtitles, and voice when no realtime session is active. */
  say(text: L10n, opts?: { expression?: Expression; gesture?: Gesture; priority?: boolean }): void;
  emote(expression: Expression, ms?: number): void;
  gesture(gesture: Gesture): void;
  /** Short reaction to a visitor success: joy face, small hop, sound. */
  celebrate(text?: L10n): void;
  /** Ask Buddy to look at / walk next to a world-space point. */
  attend(worldPoint: THREE.Vector3): void;
}

export interface RoomContext {
  /** Room-local root; add all your objects here. */
  group: THREE.Group;
  size: { width: number; depth: number; height: number };
  accent: number;
  interaction: Interaction;
  sfx: Sfx;
  buddy: BuddyApi;
  /** Current-language string. */
  t(text: L10n): string;
  addStation(def: StationDef): void;
  /** Solid box obstacle (room-local, axis-aligned in the room frame) the visitor can't walk through. */
  addCollider(x: number, z: number, width: number, depth: number): void;
  /** Up to 4 per room. The light rig moves real lights here while you're in the room. */
  addLight(anchor: LightAnchor): void;
  /** Convert a room-local point to world space. */
  toWorld(local: THREE.Vector3): THREE.Vector3;
  /** The camera, e.g. for billboards. */
  camera: THREE.PerspectiveCamera;
}

export interface RoomInstance {
  /** Called every frame while the room is visible. */
  update?(dt: number, time: number): void;
}

export interface RoomDef {
  id: RoomId;
  title: L10n;
  subtitle: L10n;
  /** Accent colour: neon sign, trims, carpet tint. */
  accent: number;
  icon: string;
  /** What Buddy says the first time you enter. */
  greeting: L10n;
  build(ctx: RoomContext): RoomInstance;
}

/** What the app needs from Buddy, beyond the room-facing BuddyApi. */
export interface BuddyController extends BuddyApi {
  readonly root: THREE.Object3D;
  /** Per frame. `talkLevel` is 0..1 mouth/voice loudness from whatever speech output is playing. */
  update(dt: number, time: number, s: BuddyFrameState): void;
  /** Put Buddy next to the visitor instantly (after a teleport). */
  placeNear(pos: THREE.Vector3, yaw: number): void;
  /** Speech output for say(); set by the app (realtime voice or browser speech). */
  speaker: ((line: L10n) => void) | null;
  /** True while the visitor is speaking to Buddy (listening pose). */
  setListening(on: boolean): void;
}

export interface BuddyFrameState {
  playerPos: THREE.Vector3;
  playerYaw: number;
  cameraPos: THREE.Vector3;
  /** Station currently focused (Buddy should stand beside it, not in the camera's way). */
  focus: { world: THREE.Vector3; viewPos: THREE.Vector3 } | null;
  talkLevel: number;
  /** Visitor is walking. */
  moving: boolean;
}
