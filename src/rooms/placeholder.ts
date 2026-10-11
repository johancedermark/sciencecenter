/** Temporary room content until the real room is built. */
import * as THREE from 'three';
import type { L10n, RoomDef, RoomId } from '../core/types';

export function placeholderRoom(id: RoomId, title: L10n, subtitle: L10n, icon: string, accent: number): RoomDef {
  return {
    id, title, subtitle, icon, accent,
    greeting: title,
    build(ctx) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: accent }));
      box.position.set(0, 0.5, -3);
      ctx.group.add(box);
      ctx.addCollider(0, -3, 1, 1);
      ctx.addLight({ position: [0, 4, 0], color: 0xffd9a8, intensity: 30 });
      ctx.addStation({
        id: `${id}-demo`, title, position: [0, -3], viewpoint: { position: [0, 1.6, 0], target: [0, 0.5, -3] },
        intro: subtitle, howTo: subtitle, science: subtitle,
      });
      return { update: (dt) => { box.rotation.y += dt; } };
    },
  };
}
