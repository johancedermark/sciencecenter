/** TEMPORARY stub: replaced by the full Buddy implementation. */
import * as THREE from 'three';
import type { BuddyController, BuddyFrameState, Expression, Gesture, L10n } from '../core/types';
import type { Sfx } from '../core/sfx';
import type { Collision } from '../core/collision';

export interface BuddyDeps {
  scene: THREE.Scene;
  sfx: Sfx;
  collision: Collision;
}

export class Buddy implements BuddyController {
  readonly root = new THREE.Group();
  speaker: ((line: L10n) => void) | null = null;
  constructor(private deps: BuddyDeps) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    body.position.y = 0.6;
    this.root.add(body);
    deps.scene.add(this.root);
  }
  say(text: L10n, _o?: { expression?: Expression; gesture?: Gesture }) { this.speaker?.(text); }
  emote(_e: Expression) {}
  gesture(_g: Gesture) {}
  celebrate(text?: L10n) { this.deps.sfx.chime(); if (text) this.say(text); }
  attend(_p: THREE.Vector3) {}
  setListening(_on: boolean) {}
  placeNear(pos: THREE.Vector3, yaw: number) {
    this.root.position.set(pos.x - Math.sin(yaw) * 2 + Math.cos(yaw), 0, pos.z - Math.cos(yaw) * 2 - Math.sin(yaw));
  }
  update(_dt: number, _t: number, s: BuddyFrameState) {
    const to = new THREE.Vector3().subVectors(s.playerPos, this.root.position).setY(0);
    if (to.length() > 2.2) this.root.position.addScaledVector(to.normalize(), Math.min(0.05, to.length() - 2.2));
    this.root.lookAt(s.playerPos.x, 0, s.playerPos.z);
  }
}
