/**
 * Kemilabbet / Chemistry Lab: a cozy old-school lab.
 *   Back wall:  fume hood with flame tests (left), periodic table + atom hologram (centre), elephant toothpaste (right)
 *   Left wall:  red-cabbage pH rainbow and titration.   Right wall: the Lennard-Jones particle box.
 *   Centre:     a bubbling distillation island.          Front corners: bottle shelves, plants, posters.
 */
import * as THREE from 'three';
import type { RoomDef } from '../../core/types';
import { createKit, type StationRuntime } from './common';
import { buildDecor } from './decor';
import { buildFlame } from './flame';
import { buildPeriodic } from './periodic';
import { buildPH } from './ph';
import { buildStates } from './states';
import { buildToothpaste } from './toothpaste';

const NEAR = 8;

export const chemistryRoom: RoomDef = {
  id: 'chemistry',
  title: { sv: 'Kemilabbet', en: 'Chemistry Lab' },
  subtitle: { sv: 'Flamfärger, pH-regnbågar, skumberg och atomer', en: 'Flame colours, pH rainbows, foam mountains and atoms' },
  icon: '🧪',
  accent: 0x3dffb5,
  greeting: {
    sv: 'Välkommen till Kemilabbet! Här bubblar det, skummar och lyser i alla färger. Ta på dig låtsasskyddsglasögonen, så börjar vi experimentera!',
    en: 'Welcome to the Chemistry Lab! Things bubble, foam and glow in every colour here. Put on your pretend safety goggles and let\'s start experimenting!',
  },
  build(ctx) {
    const kit = createKit(ctx);

    // Lights sit towards the middle of the room so they don't burn hot spots into the plaster walls.
    ctx.addLight({ position: [-4.8, 3.7, -4.6], color: 0xe0fff0, intensity: 15, distance: 10 });
    ctx.addLight({ position: [-5.6, 3.7, 1.0], color: 0xffd9a8, intensity: 15, distance: 10 });
    ctx.addLight({ position: [5.6, 3.7, 1.0], color: 0xffd9a8, intensity: 15, distance: 10 });
    ctx.addLight({ position: [4.6, 3.7, -4.6], color: 0xffe2b8, intensity: 16, distance: 10 });

    const stations: StationRuntime[] = [
      buildFlame(kit),
      buildPH(kit),
      buildStates(kit),
      buildToothpaste(kit),
      buildPeriodic(kit),
    ];
    const decor = buildDecor(kit);
    kit.mergeStatics();
    const cam = new THREE.Vector3();

    return {
      update(dt, time) {
        cam.copy(ctx.camera.position);
        ctx.group.worldToLocal(cam);
        const inRoom = cam.x > -10.5 && cam.x < 10.5 && cam.z > -9.5 && cam.z < 9.5;
        for (const s of stations) {
          const near = inRoom && Math.hypot(cam.x - s.center[0], cam.z - s.center[1]) < NEAR;
          s.update(dt, time, near);
        }
        decor.update(dt, time, inRoom);
        kit.fx.bubbles.update(dt, time);
        kit.fx.bigBubbles.update(dt, time);
        kit.fx.steam.update(dt, time);
      },
    };
  },
};
