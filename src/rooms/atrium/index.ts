import type { RoomDef } from '../../core/types';

export const atrium: Omit<RoomDef, 'id'> = {
  title: { sv: 'Atriet', en: 'The Atrium' },
  subtitle: { sv: 'Foucaults pendel', en: "Foucault's pendulum" },
  icon: '🕰️',
  accent: 0xffc070,
  greeting: { sv: 'Välkommen!', en: 'Welcome!' },
  build(ctx) {
    ctx.addLight({ position: [0, 7, 0], color: 0xffd9a8, intensity: 60, distance: 30 });
    return {};
  },
};
