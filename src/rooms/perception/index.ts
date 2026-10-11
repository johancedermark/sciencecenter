/**
 * Hjärna & Sinnen / Brain & Senses.
 *
 * Floor plan (room-local, entrance at z = +9):
 *   back-left:  Ames room booth (peephole at x ≈ -6, z ≈ -1.2)
 *   back-right: illusions wall on the back wall
 *   centre:     glowing neuron brain (decor)
 *   right:      reaction-time machine, blind-spot desk
 *   left-front: afterimage flag easel, five-senses poster + bench
 */
import { L } from '../../core/i18n';
import type { RoomDef } from '../../core/types';
import { buildAfterimage } from './afterimage';
import { buildAmes } from './ames';
import { buildBlindspot } from './blindspot';
import { ACCENT, makeBuddyGate } from './common';
import { buildBrain, buildDecor } from './decor';
import { buildIllusions } from './illusions';
import { buildReaction } from './reaction';

export const perceptionRoom: RoomDef = {
  id: 'perception',
  title: L('Hjärna & Sinnen', 'Brain & Senses'),
  subtitle: L('Reaktioner, synvillor och hjärnans smarta genvägar', "Reflexes, illusions and the brain's clever shortcuts"),
  icon: '🧠',
  accent: ACCENT,
  greeting: L(
    'Välkommen till Hjärna & Sinnen! Allt du ser och hör skapas faktiskt inne i huvudet. Kom, så luras vi lite med din hjärna!',
    "Welcome to Brain & Senses! Everything you see and hear is actually made inside your head. Come on, let's play a few tricks on your brain!",
  ),
  build(ctx) {
    const buddy = makeBuddyGate(ctx);

    ctx.addLight({ position: [0, 3.6, -3], color: 0xffa070, intensity: 22, distance: 9 });
    ctx.addLight({ position: [4.5, 3.6, -4.6], color: 0xffe0b8, intensity: 18, distance: 9 });
    ctx.addLight({ position: [5.2, 3.7, 2.4], color: 0xffd9a8, intensity: 16, distance: 10 });
    ctx.addLight({ position: [-5.2, 3.7, 1.8], color: 0xffd9a8, intensity: 18, distance: 10 });

    // 1. Reaction time
    const reactionPos: [number, number] = [7.6, -0.5];
    const reaction = buildReaction(ctx, buddy, reactionPos);
    ctx.addStation({
      id: 'perception-reaction',
      title: L('Reaktionstest', 'Reaction test'),
      position: reactionPos,
      viewpoint: { position: [5.0, 1.7, -0.45], target: [7.6, 1.3, 0.0] },
      intro: L('Hur snabb är du egentligen? Vänta på grönt och tryck så fort du kan!', 'How fast are you really? Wait for green and press as fast as you can!'),
      howTo: L('Tryck på den stora rutan (eller knappen, eller mellanslag) för att börja. När lampan blir grön: tryck direkt! Fem försök per omgång.', 'Press the big pad (or the button, or space) to start. When the lamp turns green: press at once! Five tries per round.'),
      science: L(
        'När lampan tänds fångar tapparna i näthinnan ljuset och gör om det till nervsignaler. Signalen går via synnerven till syncentrum i nackloben, vidare till områden som bestämmer "nu!", och sedan till motorbarken som skickar en order ned genom ryggmärgen till handens muskler, i 10–100 m/s. Varje steg tar några tiotals millisekunder, så de flesta landar på 200–250 ms för en ljussignal och lite snabbare för ljud. Linjaltestet räknar om tiden till en sträcka: en linjal faller d = ½·g·t², så 0,20 s ger 19,6 cm. Mätningen här inkluderar också skärmens och datorns fördröjning, ofta 10–50 ms.',
        'When the lamp lights up, the cones in your retina catch the light and turn it into nerve signals. The signal runs through the optic nerve to the visual cortex at the back of your head, on to areas that decide "now!", and then to the motor cortex, which sends an order down the spinal cord to the muscles in your hand at 10–100 m/s. Each step takes a few tens of milliseconds, so most people land at 200–250 ms for a light and a little faster for a sound. The ruler test turns time into distance: a ruler falls d = ½·g·t², so 0.20 s gives 19.6 cm. The measurement here also includes your screen and computer delay, often 10–50 ms.',
      ),
      wow: L(
        'I 100 km/h hinner en bil rulla drygt 6 meter innan föraren ens börjat trycka på bromsen.',
        'At 100 km/h a car rolls more than 6 metres before the driver even starts to press the brake.',
      ),
      controls: reaction.controls,
      onFocus: reaction.onFocus,
      onBlur: reaction.onBlur,
    });

    // 2. Ames room (registers its own station; the viewpoint is the peephole)
    const ames = buildAmes(ctx, buddy, [-6.0, 1.5, -1.2], [-6.2, -2.2]);

    // 3. Afterimage flag
    buildAfterimage(ctx, buddy, [-7.0, 5.0]);

    // 4. Blind spot
    const blind = buildBlindspot(ctx, buddy, [7.0, 5.0]);

    // 5. Illusions wall (on the back wall, z = -9)
    const illusions = buildIllusions(ctx, buddy, [4.5, -7.2], -8.85);

    // Decor
    const brain = buildBrain(ctx, buddy, [0, -3.0]);
    buildDecor(ctx);

    return {
      update(dt, time) {
        reaction.update(dt, time);
        ames.update(dt, time);
        blind.update(dt, time);
        illusions.update(dt);
        brain.update(dt, time);
      },
    };
  },
};
