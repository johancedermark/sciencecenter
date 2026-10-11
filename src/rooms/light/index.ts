/** Light & Optics: a dim, magical room where the light itself is the exhibit. */
import { L } from '../../core/i18n';
import type { RoomDef } from '../../core/types';
import { buildPrism } from './prism';
import { buildShadows } from './shadows';
import { buildLens } from './lens';
import { buildPolarisation } from './polarisation';
import { buildFibre } from './fibre';
import { buildDecor } from './decor';

export const lightRoom: RoomDef = {
  id: 'light',
  title: L('Ljus & Optik', 'Light & Optics'),
  subtitle: L('Regnbågar, färgade skuggor och ljus som går runt hörn', 'Rainbows, coloured shadows and light that bends round corners'),
  icon: '🌈',
  accent: 0xff5fa2,
  greeting: L(
    'Välkommen till ljusets rum! Vi har dämpat belysningen så att ljuset självt syns. Här kan du dela vitt ljus i en regnbåge, göra cyanfärgade skuggor och fånga laserljus i en vattenstråle.',
    'Welcome to the room of light! We’ve dimmed the lights so the light itself can shine. Here you can split white light into a rainbow, make cyan shadows and trap laser light in a jet of water.',
  ),
  build(ctx) {
    // Dim, warm light pools over the exhibits; the beams themselves do the rest.
    ctx.addLight({ position: [0, 3.3, -4.6], color: 0xffc58f, intensity: 18, distance: 9 });
    ctx.addLight({ position: [-6, 3.2, -0.8], color: 0xffb48a, intensity: 14, distance: 9 });
    ctx.addLight({ position: [6, 3.2, -0.8], color: 0xffb48a, intensity: 14, distance: 9 });
    ctx.addLight({ position: [0, 3.2, 4.5], color: 0xff9ccc, intensity: 12, distance: 9 });

    const parts = [buildDecor(ctx), buildPrism(ctx), buildShadows(ctx), buildLens(ctx), buildPolarisation(ctx), buildFibre(ctx)];
    return {
      update(dt, time) {
        for (const p of parts) p.update(dt, time);
      },
    };
  },
};
