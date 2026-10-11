/** Shared materials and helpers for the atrium (world frame, origin at the atrium centre). */
import * as THREE from 'three';
import { getLang } from '../../core/i18n';
import type { BuddyApi, L10n } from '../../core/types';

export function makeMats() {
  return {
    brass: new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.28, metalness: 0.9 }),
    darkBrass: new THREE.MeshStandardMaterial({ color: 0x8a6430, roughness: 0.4, metalness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9a6438, roughness: 0.5 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 0.6 }),
    warmGlow: new THREE.MeshBasicMaterial({ color: 0xffd39a, toneMapped: false }),
  };
}
export type Mats = ReturnType<typeof makeMats>;

/** Point on a circle using the layout's angle convention (0 = +z, towards +x). */
export function polar(r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.sin(a) * r, Math.cos(a) * r];
}

export function fmt(v: number, digits = 1) {
  return v.toLocaleString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Buddy lines with a shared cooldown so Buddy never spams. */
export function buddyThrottle(buddy: BuddyApi, cooldown = 8) {
  let last = -Infinity;
  const ok = () => {
    const now = performance.now() / 1000;
    if (now - last < cooldown) return false;
    last = now;
    return true;
  };
  return {
    say(text: L10n) {
      if (ok()) buddy.say(text);
    },
    celebrate(text: L10n) {
      if (ok()) buddy.celebrate(text);
    },
  };
}
