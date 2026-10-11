/**
 * The atrium: a round hall (r = 12 m) under a glass dome, with Foucault's pendulum in the middle,
 * a welcome desk, Buddy's charging dock and cozy decor. The context group is world space,
 * origin at the atrium centre. Corridor mouths sit at angles i·360°/7 (0° = +z); everything on the
 * floor is placed at the midpoints between them, so the 3.5 m zones in front of the mouths stay clear.
 */
import type { RoomDef } from '../../core/types';
import { makeMats, polar } from './common';
import { buildFoucault } from './foucault';
import { buildWelcome, DESK_ANGLE } from './welcome';
import { buildDecor } from './decor';

export const atrium: Omit<RoomDef, 'id'> = {
  title: { sv: 'Atriet', en: 'The Atrium' },
  subtitle: { sv: 'Foucaults pendel', en: "Foucault's pendulum" },
  icon: '🕰️',
  accent: 0xffc070,
  greeting: { sv: 'Välkommen!', en: 'Welcome!' },
  build(ctx) {
    const mats = makeMats();
    // Six warm light anchors: one high above the pendulum, five in a ring of soft pools.
    ctx.addLight({ position: [0, 7.5, 0], color: 0xffd9a8, intensity: 55, distance: 16 });
    for (let k = 0; k < 5; k++) {
      const [x, z] = polar(8.2, DESK_ANGLE + k * 72);
      ctx.addLight({ position: [x, 3.8, z], color: k % 2 ? 0xffc890 : 0xffd9a8, intensity: 24, distance: 10 });
    }

    const parts = [buildFoucault(ctx, mats), buildWelcome(ctx, mats), buildDecor(ctx, mats)];
    return {
      update(dt, time) {
        for (const p of parts) p.update(dt, time);
      },
    };
  },
};
