import type { RoomDef } from '../core/types';
import { electricityRoom } from './electricity';
import { lightRoom } from './light';
import { soundRoom } from './sound';
import { motionRoom } from './motion';
import { spaceRoom } from './space';
import { perceptionRoom } from './perception';
import { chemistryRoom } from './chemistry';
export { atrium as ATRIUM } from './atrium';

export const ROOMS: RoomDef[] = [electricityRoom, lightRoom, soundRoom, motionRoom, spaceRoom, perceptionRoom, chemistryRoom];
