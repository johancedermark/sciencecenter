import type { BuddyController, L10n, RoomId } from '../core/types';
import type { UI } from '../core/ui';

export interface StationSummary {
  id: string;
  room: RoomId | 'atrium';
  title: string;
}

/** What the voice layer can see and do in the app. */
export interface VoiceHost {
  ui: UI;
  buddy: BuddyController;
  /** Short plain-text description of where the visitor is and what they look at (current language). */
  describeContext(): string;
  /** Full science text of the focused station, if any (current language). */
  focusedStationText(): string | null;
  /** Optional: only the science explanation of the focused station (used by the offline "what is this?" reply). */
  focusedStationScience?(): string | null;
  rooms(): { id: RoomId | 'atrium'; title: string }[];
  stations(): StationSummary[];
  /** Tool actions. Return a short result string for the model. */
  goTo(id: RoomId | 'atrium'): Promise<string>;
  openStation(id: string): Promise<string>;
  closeStation(): string;
  lang(): 'sv' | 'en';
}

export interface VoiceApi {
  readonly active: boolean;
  /** Current output loudness 0..1 (for Buddy's mouth). */
  level(): number;
  /** Connect (asks for the microphone). Resolves false if unavailable (no key, denied mic). */
  start(): Promise<boolean>;
  stop(): void;
  /** Typed message from the visitor. Works with or without a live session (offline replies). */
  sendText(text: string): void;
  /** Let Buddy say a scripted line in its realtime voice (or offline speech). */
  narrate(line: L10n): void;
  /** Tell the model the context changed (new room, new station). */
  contextChanged(): void;
}
