/**
 * Sound & Waves: Chladni plate, standing waves on a string, oscilloscope/spectrum (microphone),
 * Doppler effect and Rubens' tube. All sound goes through one room bus and is silenced when a station
 * is blurred, when the visitor leaves the room, or when the room stops updating.
 */
import { L } from '../../core/i18n';
import type { RoomDef } from '../../core/types';
import { buildChladni } from './chladni';
import { ACCENT, makeShared, type StationModule } from './common';
import { buildDecor } from './decor';
import { buildDoppler } from './doppler';
import { buildRubens } from './rubens';
import { buildScope } from './scope';
import { buildString } from './string';

export const soundRoom: RoomDef = {
  id: 'sound',
  title: L('Ljud & Vågor', 'Sound & Waves'),
  subtitle: L('Svängningar, resonans och ljud du kan se', 'Vibrations, resonance and sound you can see'),
  accent: ACCENT,
  icon: '🎵',
  greeting: L(
    'Välkommen till Ljud & Vågor! Här kan du se ljud: sand som dansar, lågor som rör sig i takt och din egen röst på en skärm. Ha lagom låg volym och börja var du vill!',
    'Welcome to Sound & Waves! Here you can see sound: dancing sand, flames that move to the beat and your own voice on a screen. Keep the volume nice and low, and start wherever you like!',
  ),
  build(ctx) {
    const s = makeShared(ctx);
    ctx.addLight({ position: [-3.8, 3.4, -3.2], color: 0xffd9a8, intensity: 16, distance: 10 });
    ctx.addLight({ position: [3.8, 3.4, -3.2], color: 0xffd9a8, intensity: 16, distance: 10 });
    ctx.addLight({ position: [-4.6, 3.3, 3.2], color: 0xffcf9a, intensity: 16, distance: 10 });
    ctx.addLight({ position: [4.6, 3.3, 3.2], color: 0xffcf9a, intensity: 15, distance: 10 });

    const modules: StationModule[] = [
      buildChladni(s),
      buildString(s),
      buildScope(s),
      buildDoppler(s),
      buildRubens(s),
      buildDecor(s),
    ];

    let inside = false;
    let lastUpdate = performance.now();
    const silenceAll = () => {
      for (const m of modules) m.silence();
    };
    // Watchdog: update() only runs while the room is visible, so if it stops, nothing may keep sounding.
    setInterval(() => {
      if (inside && performance.now() - lastUpdate > 2000) {
        inside = false;
        silenceAll();
      }
    }, 500);

    return {
      update(dt, time) {
        lastUpdate = performance.now();
        s.cam.copy(ctx.camera.position);
        ctx.group.worldToLocal(s.cam);
        const nowInside = Math.abs(s.cam.x) < 10.2 && Math.abs(s.cam.z) < 9.3;
        if (inside && !nowInside) silenceAll();
        inside = nowInside;
        for (const m of modules) m.update(dt, time);
      },
    };
  },
};
