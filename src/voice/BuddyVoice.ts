/** TEMPORARY stub: replaced by the realtime implementation. */
import { t } from '../core/i18n';
import type { L10n } from '../core/types';
import type { Sfx } from '../core/sfx';
import type { VoiceApi, VoiceHost } from './types';

export class BuddyVoice implements VoiceApi {
  active = false;
  constructor(private host: VoiceHost, private sfx: Sfx) {}
  level() { return 0; }
  async start() { return false; }
  stop() {}
  sendText(text: string) { this.host.ui.subtitleSet('you', text); }
  narrate(line: L10n) { this.sfx.chirp(); this.host.ui.subtitleSet('buddy', t(line), 6000); }
  contextChanged() {}
}
