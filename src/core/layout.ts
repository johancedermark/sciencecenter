/**
 * Floor plan: a round atrium in the middle, seven corridors like the spokes of a wheel,
 * and a rectangular themed room at the end of each spoke.
 */
import * as THREE from 'three';
import type { AreaId, RoomId } from './types';

export const ROOM_ORDER: RoomId[] = ['electricity', 'light', 'sound', 'motion', 'space', 'perception', 'chemistry'];
export const N_ROOMS = ROOM_ORDER.length;
const STEP = (Math.PI * 2) / N_ROOMS;

export const ATRIUM_R = 12;
export const ATRIUM_H = 9;
export const CORRIDOR_HALF = 1.6;
export const CORRIDOR_H = 3.6;
export const ROOM_NEAR = 24; // radial distance of the room's entrance wall
export const ROOM = { width: 20, depth: 18, height: 6 };
export const ROOM_CENTER_R = ROOM_NEAR + ROOM.depth / 2;

export function roomAngle(i: number) {
  return i * STEP;
}

/** Unit vector (x,z) from the centre towards room i. */
export function roomDir(i: number): [number, number] {
  const a = roomAngle(i);
  return [Math.sin(a), Math.cos(a)];
}

/** Rotation for the room group so that local +Z points back to the atrium. */
export function roomYaw(i: number) {
  return roomAngle(i) + Math.PI;
}

export function roomCenter(i: number) {
  const [x, z] = roomDir(i);
  return new THREE.Vector3(x * ROOM_CENTER_R, 0, z * ROOM_CENTER_R);
}

export type Area = { id: AreaId; kind: 'atrium' | 'corridor' | 'room'; index: number };

export function areaAt(x: number, z: number): Area {
  const r = Math.hypot(x, z);
  if (r < ATRIUM_R + 0.2) return { id: 'atrium', kind: 'atrium', index: -1 };
  let a = Math.atan2(x, z);
  if (a < 0) a += Math.PI * 2;
  const i = Math.round(a / STEP) % N_ROOMS;
  const id = ROOM_ORDER[i];
  return r < ROOM_NEAR ? { id, kind: 'corridor', index: i } : { id, kind: 'room', index: i };
}

/** Where the visitor appears when teleporting into room i, and the yaw to face into the room. */
export function roomSpawn(i: number) {
  const [x, z] = roomDir(i);
  const r = ROOM_NEAR + 2.2;
  // Player yaw convention: forward = (-sin(yaw), -cos(yaw)); we want forward = (x, z).
  return { pos: new THREE.Vector3(x * r, 0, z * r), yaw: Math.atan2(-x, -z) };
}

export const ATRIUM_SPAWN = { pos: new THREE.Vector3(0, 0, 8.5), yaw: 0 };
