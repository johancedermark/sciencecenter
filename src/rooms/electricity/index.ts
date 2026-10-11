/**
 * Elektricitet & Energi / Electricity & Energy.
 * Five hands-on stations that all lead to one idea: energy is converted, never created.
 *   1. generator.ts  hand-crank generator (Faraday + Lenz, LED vs incandescent, oscilloscope)
 *   2. faraday.ts    magnet and coil with a galvanometer, and the Lenz tubes
 *   3. solar.ts      a solar module taken apart layer by layer, photons and the band gap
 *   4. lemon.ts      lemon battery with electrode pairs, loaded/unloaded voltage and a red LED
 *   5. human.ts      the human battery (copper, aluminium and sweat)
 */
import type { RoomDef } from '../../core/types';
import { L } from '../../core/i18n';
import { Cheers, bakeStatic } from './shared';
import { buildGenerator } from './generator';
import { buildFaraday } from './faraday';
import { buildSolar } from './solar';
import { buildLemon } from './lemon';
import { buildHuman } from './human';
import { buildDecor } from './decor';

export const electricityRoom: RoomDef = {
  id: 'electricity',
  title: L('Elektricitet & Energi', 'Electricity & Energy'),
  subtitle: L('Generatorer, solceller och batterier', 'Generators, solar cells and batteries'),
  icon: '⚡',
  accent: 0xffc23d,
  greeting: L(
    'Välkommen till Elektricitet & Energi – mitt absoluta favoritrum! Här kan du veva fram ström med armen, skjuta fotoner på en solcell, bygga ett batteri av citroner och till och med bli ett batteri själv. Allt handlar om samma hemlighet: energi skapas aldrig, den byter bara form. Var vill du börja?',
    'Welcome to Electricity & Energy, my very favourite room! Here you can crank out electricity with your arm, fire photons at a solar cell, build a battery from lemons and even become a battery yourself. It all comes down to one secret: energy is never created, it only changes form. Where do you want to start?',
  ),
  build(ctx) {
    const cheers = new Cheers(ctx);
    const parts = [
      buildGenerator(ctx, cheers),
      buildFaraday(ctx, cheers),
      buildSolar(ctx, cheers),
      buildLemon(ctx, cheers),
      buildHuman(ctx, cheers),
      buildDecor(ctx),
    ];
    // Merge all static meshes per material: a handful of draw calls instead of hundreds.
    bakeStatic(ctx.group);

    ctx.addLight({ position: [0, 3.4, -5.0], color: 0xffd9a8, intensity: 30, distance: 9 });
    ctx.addLight({ position: [-5.4, 3.3, -3.6], color: 0xffe2b8, intensity: 26, distance: 9 });
    ctx.addLight({ position: [5.4, 3.3, -3.6], color: 0xffd9a8, intensity: 26, distance: 9 });
    ctx.addLight({ position: [0, 3.6, 3.2], color: 0xffc890, intensity: 30, distance: 12 });

    return {
      update(dt, time) {
        for (const p of parts) p.update(dt, time);
      },
    };
  },
};
