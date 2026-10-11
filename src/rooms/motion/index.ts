/**
 * Forces & Motion ("Kraft & Rörelse"): brachistochrone race, pendulum wave, Newton's cradle,
 * loop the loop and a lever that lifts a car. All physics uses g = 9.82 m/s² (Sweden) and fixed substeps.
 */
import type { RoomDef } from '../../core/types';
import { L } from '../../core/i18n';
import { ACCENT, type StationModule } from './common';
import { buildBrachistochrone } from './brachistochrone';
import { buildPendulumWave } from './pendulumWave';
import { buildCradle } from './cradle';
import { buildLoop } from './loop';
import { buildLever } from './lever';
import { buildDecor } from './decor';

export const motionRoom: RoomDef = {
  id: 'motion',
  title: L('Kraft & Rörelse', 'Forces & Motion'),
  subtitle: L('Kulbanor, pendlar och hävstänger', 'Ball tracks, pendulums and levers'),
  icon: '🎢',
  accent: ACCENT,
  greeting: L(
    'Välkommen till Kraft & Rörelse! Här kan du tävla med kulor, få femton pendlar att dansa och lyfta en bil med en hand. Allt följer Newtons lagar, med g = 9,82 m/s², precis som här i Sverige.',
    'Welcome to Forces & Motion! Here you can race balls, make fifteen pendulums dance and lift a car with one hand. Everything follows Newton\'s laws, with g = 9.82 m/s², just like here in Sweden.',
  ),
  build(ctx) {
    for (const [x, z] of [[-4.2, -4.6], [4.2, -4.6], [-5.6, 3.0], [5.6, 3.0]] as const) {
      ctx.addLight({ position: [x, 4.1, z], color: 0xffd9a8, intensity: 20, distance: 11 });
    }
    const modules: StationModule[] = [
      buildBrachistochrone(ctx, -5.5, -5.3, 0),
      buildPendulumWave(ctx, 0, -5.6, 0),
      buildCradle(ctx, 5.5, -5.3, 0),
      buildLoop(ctx, -6.3, 3.0, Math.PI / 2),
      buildLever(ctx, 6.5, 3.0, -Math.PI / 2, -(10 - 6.5)),
      buildDecor(ctx),
    ];
    return {
      update(dt, time) {
        for (const m of modules) m.update(dt, time);
      },
    };
  },
};
