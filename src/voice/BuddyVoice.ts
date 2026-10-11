/**
 * Buddy's voice: a live OpenAI Realtime session over WebRTC when the server has a key,
 * otherwise browser speech plus a small offline responder. See docs/voice.md.
 */
import { L, t } from '../core/i18n';
import type { AreaId, Expression, Gesture, L10n } from '../core/types';
import type { Sfx } from '../core/sfx';
import type { VoiceApi, VoiceHost } from './types';
import { BrowserSpeech, estimateMs } from './browserSpeech';
import { offlineReply } from './offline';
import { EXPRESSIONS, GESTURES, buildInstructions } from '../../server/buddyPersona';

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

/** Server events we read (loosely typed: the API sends many more fields). */
interface ServerEvent {
  type: string;
  delta?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  response?: {
    id?: string;
    status?: string;
    metadata?: Record<string, string> | null;
    output?: { type: string; call_id?: string; name?: string; arguments?: string }[];
  };
  error?: { type?: string; code?: string; message?: string };
}

type Status = 'off' | 'connecting' | 'listening' | 'speaking' | 'thinking' | 'error';

const QUIET_ERRORS = new Set(['conversation_already_has_active_response', 'response_cancel_not_active']);

export class BuddyVoice implements VoiceApi {
  private _active = false;
  private connecting = false;
  /** Bumped on every start/stop so stale async work can bail out. */
  private gen = 0;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private lvl = 0;

  // Turn state
  private activeResponses = 0;
  private pendingResponse: Record<string, unknown> | null = null;
  private outputPlaying = false;
  private userSpeaking = false;
  private handledCalls = new Set<string>();
  private toolWork: { name: string; done: Promise<void> }[] = [];
  private toolDepth = 0;
  private quietUntil = 0;
  private errorToasted = false;

  // Subtitles
  private buddyText = '';
  private youUntil = 0;
  private renderTimer = 0;
  private subToken = 0;
  private buddyToken = 0;

  private ctxTimer = 0;
  private speech: BrowserSpeech;

  constructor(private host: VoiceHost, private sfx: Sfx) {
    this.speech = new BrowserSpeech(sfx);
  }

  get active() {
    return this._active;
  }

  level(): number {
    if (this.audioEl) this.audioEl.muted = this.sfx.muted;
    if (!this._active) return this.speech.level();
    let target = 0;
    if (this.analyser && this.buf) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      target = Math.min(1, Math.sqrt(sum / this.buf.length) * 5);
    }
    this.lvl += (target - this.lvl) * (target > this.lvl ? 0.5 : 0.15);
    return this.lvl;
  }

  // ---------------------------------------------------------------- connect / disconnect

  async start(): Promise<boolean> {
    if (this._active) return true;
    if (this.connecting) return false;
    this.connecting = true;
    const gen = ++this.gen;
    const ui = this.host.ui;
    ui.setTalkStatus('connecting');
    this.sfx.resume();

    try {
      // 1. Ephemeral key from our server
      const token = await this.fetchToken();
      if (gen !== this.gen) return false;
      if (token === 'no_key') {
        ui.toast(
          L(
            'Röstläget behöver en OpenAI API-nyckel (OPENAI_API_KEY i .env). Du kan fortfarande skriva till mig!',
            'Voice mode needs an OpenAI API key (OPENAI_API_KEY in .env). You can still type to me!',
          ),
          5000,
        );
        this.finishFailed(gen, 'off');
        return false;
      }
      if (typeof token !== 'object') {
        ui.toast(
          token === 'rate_limited'
            ? L('Oj, många samtal just nu. Vänta en stund och försök igen.', 'Whoa, lots of calls right now. Wait a bit and try again.')
            : L('Kunde inte nå Buddys röstserver. Du kan fortfarande skriva!', "Couldn't reach Buddy's voice server. You can still type!"),
          4000,
        );
        this.finishFailed(gen, 'error');
        return false;
      }

      // 2. Microphone
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (gen !== this.gen) {
          mic.getTracks().forEach((tr) => tr.stop());
          return false;
        }
        this.mic = mic;
      } catch (e) {
        if (gen !== this.gen) return false;
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        ui.toast(
          denied
            ? L('Jag behöver mikrofonen för att höra dig. Tillåt den i webbläsaren, eller skriv till mig!', 'I need the microphone to hear you. Allow it in the browser, or type to me!')
            : L('Hittade ingen mikrofon. Du kan skriva till mig i stället!', "Couldn't find a microphone. You can type to me instead!"),
          4500,
        );
        this.finishFailed(gen, 'error');
        return false;
      }
      if (gen !== this.gen) return false;

      // 3. WebRTC
      const pc = new RTCPeerConnection();
      this.pc = pc;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.style.display = 'none';
      audio.muted = this.sfx.muted;
      document.body.appendChild(audio);
      this.audioEl = audio;
      pc.ontrack = (e) => {
        if (gen !== this.gen) return;
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        // Chrome only lets remote WebRTC audio flow when it's attached to a media element.
        audio.srcObject = stream;
        audio.play().catch(() => undefined);
        this.attachAnalyser(stream);
      };
      pc.onconnectionstatechange = () => {
        if (gen !== this.gen) return;
        if (pc.connectionState === 'failed') this.lostConnection();
      };
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (e) => {
        if (gen !== this.gen) return;
        let ev: ServerEvent;
        try {
          ev = JSON.parse(typeof e.data === 'string' ? e.data : '');
        } catch {
          return;
        }
        this.onEvent(ev);
      };
      dc.onclose = () => {
        if (gen === this.gen && this._active) this.lostConnection();
      };
      const opened = new Promise<void>((resolve, reject) => {
        dc.addEventListener('open', () => resolve(), { once: true });
        dc.addEventListener('close', () => reject(new Error('data channel closed')), { once: true });
        setTimeout(() => reject(new Error('data channel timeout')), 15_000);
      });
      opened.catch(() => undefined); // handled below; avoid an unhandled rejection if we bail out early

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/sdp' },
      });
      if (gen !== this.gen) return false;
      if (!res.ok) throw new Error(`realtime/calls ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
      const answer = await res.text();
      if (gen !== this.gen) return false;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      await opened;
      if (gen !== this.gen) return false;

      // 4. Live
      this.connecting = false;
      this._active = true;
      this.speech.cancel();
      this.resetTurnState();
      this.sendSessionUpdate();
      this.updateStatus();
      this.requestResponse({
        instructions:
          'Greet the visitor very briefly (one short sentence) in the language from your instructions, ' +
          'say you are listening, and invite a question about what they see. No tool calls.',
      });
      return true;
    } catch (e) {
      if (gen !== this.gen) return false;
      console.warn('[voice] connect failed', e);
      ui.toast(L('Kunde inte starta röstläget. Försök igen, eller skriv till mig!', "Couldn't start voice mode. Try again, or type to me!"), 4000);
      this.finishFailed(gen, 'error');
      return false;
    }
  }

  stop(): void {
    this.gen++;
    this.teardown();
    this.host.ui.setTalkStatus('off');
  }

  private finishFailed(gen: number, status: Status) {
    if (gen !== this.gen) return;
    this.teardown();
    this.host.ui.setTalkStatus(status);
  }

  private lostConnection() {
    console.warn('[voice] connection lost');
    this.gen++;
    this.teardown();
    this.host.ui.setTalkStatus('off');
    this.host.ui.toast(L('Röstanslutningen bröts. Tryck på Prata för att fortsätta.', 'The voice connection dropped. Press Talk to continue.'), 4000);
  }

  private teardown() {
    this.connecting = false;
    this._active = false;
    clearTimeout(this.ctxTimer);
    clearTimeout(this.renderTimer);
    const dc = this.dc;
    this.dc = null;
    if (dc) {
      dc.onmessage = dc.onclose = null;
      try { dc.close(); } catch { /* ignore */ }
    }
    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.ontrack = pc.onconnectionstatechange = null;
      try { pc.getSenders().forEach((s) => s.track?.stop()); } catch { /* ignore */ }
      try { pc.close(); } catch { /* ignore */ }
    }
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.source = null;
    this.analyser = null;
    this.buf = null;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.srcObject = null;
      this.audioEl.remove();
      this.audioEl = null;
    }
    this.lvl = 0;
    this.resetTurnState();
    this.host.buddy.setListening(false);
  }

  private resetTurnState() {
    this.activeResponses = 0;
    this.pendingResponse = null;
    this.outputPlaying = false;
    this.userSpeaking = false;
    this.handledCalls.clear();
    this.toolWork = [];
    this.toolDepth = 0;
    this.buddyText = '';
    this.errorToasted = false;
  }

  private async fetchToken(): Promise<{ value: string } | 'no_key' | 'rate_limited' | 'error'> {
    try {
      const res = await fetch('/api/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: this.host.lang(),
          context: this.host.describeContext().slice(0, 4000),
          rooms: this.host.rooms(),
          stations: this.host.stations(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { value?: string; error?: string };
      if (res.status === 503 && data.error === 'no_key') return 'no_key';
      if (res.status === 429) return 'rate_limited';
      if (!res.ok || !data.value) {
        console.warn('[voice] token request failed', res.status, data);
        return 'error';
      }
      return { value: data.value };
    } catch (e) {
      console.warn('[voice] token request failed', e);
      return 'error';
    }
  }

  private attachAnalyser(stream: MediaStream) {
    try {
      this.source?.disconnect();
      const ctx = this.sfx.ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an); // analysis only: playback goes through the <audio> element
      this.source = src;
      this.analyser = an;
      this.buf = new Float32Array(an.fftSize);
    } catch (e) {
      console.warn('[voice] analyser unavailable', e);
    }
  }

  // ---------------------------------------------------------------- outgoing

  private send(ev: Record<string, unknown>) {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(ev));
      return true;
    } catch (e) {
      console.warn('[voice] send failed', e);
      return false;
    }
  }

  private instructions() {
    return buildInstructions({
      lang: this.host.lang(),
      rooms: this.host.rooms(),
      stations: this.host.stations(),
      context: this.host.describeContext(),
      stationText: this.host.focusedStationText(),
    });
  }

  private sendSessionUpdate() {
    this.send({ type: 'session.update', session: { type: 'realtime', instructions: this.instructions() } });
  }

  /** response.create now, or as soon as the current response finishes. */
  private requestResponse(response: Record<string, unknown> = {}) {
    if (this.activeResponses > 0) {
      this.pendingResponse = response;
      return;
    }
    this.pendingResponse = null;
    this.send({ type: 'response.create', response });
  }

  // ---------------------------------------------------------------- incoming

  private onEvent(ev: ServerEvent) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        this.userSpeaking = true;
        this.host.buddy.setListening(true);
        break;
      case 'input_audio_buffer.speech_stopped':
        this.userSpeaking = false;
        this.host.buddy.setListening(false);
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (ev.transcript?.trim()) this.showYou(ev.transcript.trim());
        break;
      case 'response.created':
        this.activeResponses++;
        this.buddyText = '';
        break;
      case 'response.output_audio_transcript.delta':
        this.buddyText += ev.delta ?? '';
        this.renderBuddy();
        break;
      case 'response.output_audio_transcript.done':
        if (ev.transcript) this.buddyText = ev.transcript;
        this.renderBuddy(Math.max(4000, estimateMs(this.buddyText) + 1500));
        break;
      case 'output_audio_buffer.started':
        this.outputPlaying = true;
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.outputPlaying = false;
        this.hideIfMine(this.buddyToken, 2500);
        break;
      case 'response.function_call_arguments.done':
        if (ev.call_id && ev.name) this.onCall(ev.call_id, ev.name, ev.arguments ?? '{}');
        break;
      case 'response.done':
        this.onResponseDone(ev);
        break;
      case 'error':
        this.onError(ev);
        break;
    }
    this.updateStatus();
  }

  private onResponseDone(ev: ServerEvent) {
    this.activeResponses = Math.max(0, this.activeResponses - 1);
    const r = ev.response ?? {};
    const output = r.output ?? [];
    for (const item of output) {
      if (item.type === 'function_call' && item.call_id && item.name) this.onCall(item.call_id, item.name, item.arguments ?? '{}');
    }
    if (r.status === 'failed') console.warn('[voice] response failed', r);

    const work = this.toolWork.splice(0);
    if (work.length) {
      const spoke = output.some((o) => o.type === 'message');
      // Mood changes alongside speech need no follow-up; anything else needs the model to react to the result.
      const followUp = r.status !== 'cancelled' && (!spoke || work.some((w) => w.name !== 'set_mood'));
      const gen = this.gen;
      void Promise.all(work.map((w) => w.done)).then(() => {
        if (gen === this.gen && followUp) this.requestResponse();
      });
    }
    if (this.activeResponses === 0 && this.pendingResponse) {
      const next = this.pendingResponse;
      this.pendingResponse = null;
      this.send({ type: 'response.create', response: next });
    }
  }

  private onError(ev: ServerEvent) {
    const err = ev.error ?? {};
    console.warn('[voice] realtime error', err);
    if (err.code && QUIET_ERRORS.has(err.code)) return;
    if (!this.errorToasted) {
      this.errorToasted = true;
      this.host.ui.toast(L('Buddy fick ett fel i röstläget, men försöker fortsätta.', 'Buddy hit a voice error but will keep trying.'), 3500);
    }
  }

  private updateStatus() {
    if (!this._active) return;
    let s: Status = 'listening';
    if (this.outputPlaying) s = 'speaking';
    else if (this.userSpeaking) s = 'listening';
    else if (this.activeResponses > 0 || this.toolDepth > 0) s = 'thinking';
    this.host.ui.setTalkStatus(s);
  }

  // ---------------------------------------------------------------- tools

  private onCall(callId: string, name: string, args: string) {
    if (this.handledCalls.has(callId)) return;
    this.handledCalls.add(callId);
    const gen = this.gen;
    const done = this.runTool(name, args).then((output) => {
      if (gen !== this.gen) return;
      this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
    });
    this.toolWork.push({ name, done });
  }

  private async runTool(name: string, rawArgs: string): Promise<Record<string, unknown>> {
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(rawArgs || '{}');
      if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'invalid JSON arguments' };
    }
    const h = this.host;
    this.toolDepth++;
    this.updateStatus();
    try {
      switch (name) {
        case 'go_to_room': {
          const id = String(args.room_id ?? '');
          if (!h.rooms().some((r) => r.id === id)) return { ok: false, error: `unknown room_id "${id}"`, rooms: h.rooms() };
          return { ok: true, result: await h.goTo(id as AreaId) };
        }
        case 'open_station': {
          const id = String(args.station_id ?? '');
          if (!h.stations().some((s) => s.id === id)) return { ok: false, error: `unknown station_id "${id}"` };
          return { ok: true, result: await h.openStation(id) };
        }
        case 'close_station':
          return { ok: true, result: h.closeStation() };
        case 'set_mood': {
          const ex = args.expression as Expression;
          const ge = args.gesture as Gesture | undefined;
          if (!(EXPRESSIONS as readonly string[]).includes(ex)) return { ok: false, error: 'unknown expression' };
          h.buddy.emote(ex);
          if (ge && (GESTURES as readonly string[]).includes(ge)) h.buddy.gesture(ge);
          return { ok: true };
        }
        case 'get_context':
          return {
            ok: true,
            context: h.describeContext(),
            focused_station: h.focusedStationText(),
            rooms: h.rooms(),
            stations: h.stations(),
          };
        default:
          return { ok: false, error: `unknown tool ${name}` };
      }
    } catch (e) {
      console.warn('[voice] tool failed', name, e);
      return { ok: false, error: 'tool failed' };
    } finally {
      this.toolDepth--;
      // Scripted lines triggered by the move (station intro, room greeting) would talk over the model.
      this.quietUntil = performance.now() + 1500;
      this.updateStatus();
    }
  }

  // ---------------------------------------------------------------- subtitles

  private sub(who: 'buddy' | 'you', text: string, holdMs: number) {
    this.host.ui.subtitleSet(who, text, holdMs);
    return ++this.subToken;
  }

  private hideIfMine(token: number, afterMs: number) {
    if (token === this.subToken) this.host.ui.subtitleHide(afterMs);
  }

  private showYou(text: string) {
    this.sub('you', text, 4000);
    this.youUntil = performance.now() + 1400; // let it be read before Buddy's words replace it
  }

  private renderBuddy(holdMs = 0) {
    clearTimeout(this.renderTimer);
    const wait = this.youUntil - performance.now();
    if (wait > 0) {
      this.renderTimer = window.setTimeout(() => this.renderBuddy(holdMs), wait);
      return;
    }
    if (this.buddyText) this.buddyToken = this.sub('buddy', this.buddyText, holdMs);
  }

  // ---------------------------------------------------------------- public API

  sendText(text: string): void {
    const msg = text.trim().slice(0, 1000);
    if (!msg) return;
    this.sub('you', msg, 4000);
    if (this._active) {
      this.youUntil = performance.now() + 1000;
      this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: msg }] } });
      if (this.activeResponses > 0) {
        // Interrupt Buddy; the new response goes out when the cancelled one is done.
        this.send({ type: 'response.cancel' });
        this.send({ type: 'output_audio_buffer.clear' });
        this.pendingResponse = {};
      } else {
        this.requestResponse();
      }
      return;
    }
    const reply = offlineReply(this.host, msg);
    window.setTimeout(() => {
      this.say(reply.text, reply.lang);
      if (reply.action) {
        Promise.resolve()
          .then(reply.action)
          .catch((e) => console.warn('[voice] offline action failed', e));
      }
    }, 450);
  }

  narrate(line: L10n): void {
    if (this._active) {
      // Don't talk over the visitor, a running answer, or a tool action the model will describe itself.
      if (this.userSpeaking || this.activeResponses > 0 || this.toolDepth > 0 || performance.now() < this.quietUntil) return;
      const lang = this.host.lang() === 'sv' ? 'Swedish' : 'English';
      this.requestResponse({
        conversation: 'none',
        output_modalities: ['audio'],
        tool_choice: 'none',
        metadata: { kind: 'narration' },
        instructions:
          `Say this line to the visitor in your own voice, naturally and briefly. Speak the language you are currently using with the visitor ` +
          `(if you haven't talked yet, ${lang}); translate it if needed. Keep its meaning, add nothing else, and don't call tools.\n` +
          `Line: "${t(line).replace(/"/g, "'")}"`,
      });
      return;
    }
    this.say(t(line), this.host.lang());
  }

  /** Offline speech + subtitles. */
  private say(text: string, lang: 'sv' | 'en') {
    const token = this.sub('buddy', text, estimateMs(text) + 2500);
    this.speech.onEnd = () => this.hideIfMine(token, 1500);
    this.speech.speak(text, lang);
  }

  contextChanged(): void {
    clearTimeout(this.ctxTimer);
    if (!this._active) return;
    this.ctxTimer = window.setTimeout(() => {
      if (this._active) this.sendSessionUpdate();
    }, 600);
  }
}
