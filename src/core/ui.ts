/** HTML overlay: start screen, HUD, map/menu, station panel, subtitles, chat dock, joystick. */
import { L, getLang, onLangChange, setLang, t } from './i18n';
import { ControlPanel } from './controlPanel';
import type { Sfx } from './sfx';
import type { L10n, RoomDef, RoomId, StationDef } from './types';
import { N_ROOMS, roomAngle } from './layout';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Static UI strings. */
export const S = {
  appName: L('Gnistan', 'Gnistan'),
  tagline: L('Buddys vetenskapscenter: tänd din nyfikenhet!', "Buddy's science center: spark your curiosity!"),
  start: L('Kliv in', 'Step inside'),
  loading: L('Bygger vetenskapscentret …', 'Building the science center …'),
  controlsDesktop: L(
    'Gå med WASD eller piltangenterna · Dra med musen för att titta · Klicka på golvet för att gå dit · Klicka och dra i experimenten · E för att utforska',
    'Walk with WASD or the arrow keys · Drag the mouse to look · Click the floor to walk there · Click and drag the experiments · E to explore',
  ),
  controlsTouch: L(
    'Styrspaken till vänster går · Dra för att titta · Tryck på golvet för att gå dit · Tryck och dra i experimenten',
    'The joystick on the left walks · Drag to look · Tap the floor to walk there · Tap and drag the experiments',
  ),
  map: L('Karta', 'Map'),
  mapTitle: L('Vart vill du gå?', 'Where do you want to go?'),
  atrium: L('Atriet', 'The Atrium'),
  atriumSub: L('Foucaults pendel och entrén', "Foucault's pendulum and the entrance"),
  explore: L('Utforska', 'Explore'),
  back: L('Tillbaka', 'Back'),
  explain: L('Förklara', 'Explain'),
  stopExplain: L('Stoppa', 'Stop'),
  howTo: L('Gör så här', 'How to'),
  science: L('Vetenskapen bakom', 'The science'),
  wow: L('Visste du?', 'Did you know?'),
  talk: L('Prata med Buddy', 'Talk to Buddy'),
  stopTalk: L('Avsluta samtal', 'End conversation'),
  typeHere: L('Skriv till Buddy …', 'Type to Buddy …'),
  you: L('Du', 'You'),
  help: L('Hjälp', 'Help'),
  close: L('Stäng', 'Close'),
  mute: L('Ljud av/på', 'Sound on/off'),
  youAreHere: L('Du är här', 'You are here'),
};

export type ChatStatus = 'off' | 'connecting' | 'listening' | 'speaking' | 'thinking' | 'error';

export class UI {
  private root = $('#ui');
  private panel = $('#station');
  private prompt = $('#prompt');
  private subtitle = $('#subtitle');
  private tooltip = $('#tooltip');
  private fadeEl = $('#fade');
  private cleanupControls: (() => void) | null = null;
  private currentStation: StationDef | null = null;
  private subtitleTimer = 0;
  private rooms: RoomDef[] = [];
  private mapDot: SVGCircleElement | null = null;

  onStart: (() => void) | null = null;
  onTeleport: ((id: RoomId | 'atrium') => void) | null = null;
  onExplore: (() => void) | null = null;
  onBack: (() => void) | null = null;
  onExplain: (() => void) | null = null;
  onTalkToggle: (() => void) | null = null;
  onSendText: ((text: string) => void) | null = null;
  onJoystick: ((x: number, y: number, active: boolean) => void) | null = null;

  constructor(private sfx: Sfx, readonly isTouch: boolean) {
    document.body.classList.toggle('touch', isTouch);
    this.wireStatic();
    onLangChange(() => this.refreshTexts());
    this.refreshTexts();
    this.setTalkStatus('off');
    if (isTouch) this.buildJoystick();
  }

  // ---------------------------------------------------------------- static wiring

  private wireStatic() {
    $('#start-btn').addEventListener('click', () => {
      this.sfx.resume();
      this.sfx.chime();
      $('#start').classList.add('hidden');
      this.root.classList.remove('hidden');
      this.onStart?.();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        setLang(b.dataset.lang as 'sv' | 'en');
        this.sfx.click();
      }),
    );
    $('#btn-map').addEventListener('click', () => this.toggleMap());
    $('#map-close').addEventListener('click', () => this.toggleMap(false));
    $('#btn-help').addEventListener('click', () => this.toggleHelp());
    $('#help-close').addEventListener('click', () => this.toggleHelp(false));
    $('#btn-mute').addEventListener('click', () => {
      this.sfx.setMuted(!this.sfx.muted);
      $('#btn-mute').textContent = this.sfx.muted ? '🔇' : '🔊';
    });
    $('#station-back').addEventListener('click', () => this.onBack?.());
    $('#station-explain').addEventListener('click', () => {
      this.sfx.click();
      this.onExplain?.();
    });
    this.prompt.addEventListener('click', () => this.onExplore?.());
    $('#talk-btn').addEventListener('click', () => this.onTalkToggle?.());
    const form = $<HTMLFormElement>('#chat-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('#chat-input');
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      this.onSendText?.(v);
    });
    window.addEventListener('keydown', (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') tgt.blur();
        return;
      }
      if (e.code === 'KeyE' && !this.prompt.classList.contains('hidden')) this.onExplore?.();
      if (e.code === 'Escape') {
        if (!$('#map').classList.contains('hidden')) this.toggleMap(false);
        else if (!$('#help').classList.contains('hidden')) this.toggleHelp(false);
        else if (this.currentStation) this.onBack?.();
      }
      if (e.code === 'KeyM') this.toggleMap();
      if (e.code === 'KeyX' && this.currentStation) this.onExplain?.();
      if (e.code === 'Enter') {
        e.preventDefault();
        $<HTMLInputElement>('#chat-input').focus();
      }
    });
  }

  private refreshTexts() {
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => {
      const key = e.dataset.t as keyof typeof S;
      if (S[key]) e.textContent = t(S[key]);
    });
    document.querySelectorAll<HTMLElement>('[data-title]').forEach((e) => {
      const key = e.dataset.title as keyof typeof S;
      if (S[key]) e.title = t(S[key]);
    });
    $<HTMLInputElement>('#chat-input').placeholder = t(S.typeHere);
    $('#controls-hint').textContent = t(this.isTouch ? S.controlsTouch : S.controlsDesktop);
    $('#help-controls').textContent = t(this.isTouch ? S.controlsTouch : S.controlsDesktop);
    document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) =>
      b.classList.toggle('active', b.dataset.lang === getLang()),
    );
    if (this.rooms.length) this.buildMap(this.rooms);
    const status = ($('#talk-btn').dataset.status ?? 'off') as ChatStatus;
    this.setTalkStatus(status);
    if (this.currentStation) this.renderStation(this.currentStation);
  }

  // ---------------------------------------------------------------- map

  setRooms(rooms: RoomDef[]) {
    this.rooms = rooms;
    this.buildMap(rooms);
  }

  private buildMap(rooms: RoomDef[]) {
    const grid = $('#map-grid');
    grid.innerHTML = '';
    const card = (id: RoomId | 'atrium', icon: string, title: L10n, sub: L10n, color: string) => {
      const b = el('button', 'room-card');
      b.style.setProperty('--accent', color);
      b.append(el('span', 'rc-icon', icon), el('span', 'rc-title', t(title)), el('span', 'rc-sub', t(sub)));
      b.addEventListener('click', () => {
        this.sfx.whoosh();
        this.toggleMap(false);
        this.onTeleport?.(id);
      });
      grid.appendChild(b);
    };
    card('atrium', '🕰️', S.atrium, S.atriumSub, '#ffc070');
    rooms.forEach((r) => card(r.id, r.icon, r.title, r.subtitle, `#${r.accent.toString(16).padStart(6, '0')}`));

    // Radial mini-map
    const svg = $('#map-svg');
    const NS = 'http://www.w3.org/2000/svg';
    svg.innerHTML = '';
    const mk = (tag: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      svg.appendChild(e);
      return e;
    };
    // Map coordinates: world x → svg x, world z → svg y (scaled 1 unit = 2px, centre 100,100)
    mk('circle', { cx: 100, cy: 100, r: 24, class: 'map-atrium' });
    for (let i = 0; i < N_ROOMS; i++) {
      const a = roomAngle(i);
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      mk('line', { x1: 100 + sx * 24, y1: 100 + sz * 24, x2: 100 + sx * 48, y2: 100 + sz * 48, class: 'map-corr' });
      const r = rooms[i];
      const g = mk('g', { transform: `translate(${100 + sx * 66} ${100 + sz * 66}) rotate(${(-a * 180) / Math.PI})`, class: 'map-room' });
      const rect = document.createElementNS(NS, 'rect');
      Object.entries({ x: -20, y: -18, width: 40, height: 36, rx: 5, fill: `#${r.accent.toString(16).padStart(6, '0')}` }).forEach(([k, v]) =>
        rect.setAttribute(k, String(v)),
      );
      g.appendChild(rect);
      const txt = mk('text', { x: 100 + sx * 66, y: 100 + sz * 66 + 6, 'text-anchor': 'middle', class: 'map-icon' });
      txt.textContent = r.icon;
      (g as SVGGElement).addEventListener('click', () => {
        this.toggleMap(false);
        this.onTeleport?.(r.id);
      });
    }
    this.mapDot = mk('circle', { cx: 100, cy: 100, r: 4, class: 'map-dot' }) as SVGCircleElement;
  }

  setMapPosition(x: number, z: number) {
    if (!this.mapDot) return;
    this.mapDot.setAttribute('cx', String(100 + x * 2));
    this.mapDot.setAttribute('cy', String(100 + z * 2));
  }

  toggleMap(show?: boolean) {
    const m = $('#map');
    const on = show ?? m.classList.contains('hidden');
    m.classList.toggle('hidden', !on);
    if (on) this.sfx.pop();
  }

  toggleHelp(show?: boolean) {
    const m = $('#help');
    const on = show ?? m.classList.contains('hidden');
    m.classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------- HUD

  setLocation(icon: string, title: L10n) {
    $('#loc-icon').textContent = icon;
    $('#loc-name').textContent = t(title);
  }

  showPrompt(title: L10n | null) {
    if (!title) {
      this.prompt.classList.add('hidden');
      return;
    }
    $('#prompt-title').textContent = t(title);
    this.prompt.classList.remove('hidden');
  }

  tooltipAt(label: L10n | null, x: number, y: number) {
    if (!label) {
      this.tooltip.classList.add('hidden');
      return;
    }
    this.tooltip.textContent = t(label);
    this.tooltip.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
    this.tooltip.classList.remove('hidden');
  }

  toast(text: L10n | string, ms = 2600) {
    const box = $('#toasts');
    const e = el('div', 'toast', typeof text === 'string' ? text : t(text));
    box.appendChild(e);
    setTimeout(() => e.classList.add('out'), ms);
    setTimeout(() => e.remove(), ms + 500);
  }

  async fade(fn: () => void) {
    this.fadeEl.classList.add('on');
    await new Promise((r) => setTimeout(r, 380));
    fn();
    await new Promise((r) => setTimeout(r, 120));
    this.fadeEl.classList.remove('on');
  }

  setLoading(p: number) {
    const bar = $('#load-bar');
    bar.style.width = `${Math.round(p * 100)}%`;
    if (p >= 1) {
      $('#start').classList.add('ready');
    }
  }

  // ---------------------------------------------------------------- station panel

  openStation(def: StationDef) {
    this.currentStation = def;
    this.renderStation(def);
    this.panel.classList.remove('hidden');
    document.body.classList.add('focused');
  }

  private renderStation(def: StationDef) {
    this.cleanupControls?.();
    this.cleanupControls = null;
    $('#station-title').textContent = t(def.title);
    $('#station-intro').textContent = t(def.intro);
    $('#station-howto').textContent = t(def.howTo);
    $('#station-science').textContent = t(def.science);
    const wow = $('#station-wow-box');
    wow.classList.toggle('hidden', !def.wow);
    if (def.wow) $('#station-wow').textContent = t(def.wow);
    const ctrl = $('#station-controls');
    ctrl.innerHTML = '';
    ctrl.classList.toggle('hidden', !def.controls);
    if (def.controls) {
      // Wait a frame so the panel has its width (canvas sizing).
      requestAnimationFrame(() => {
        if (this.currentStation !== def) return;
        const r = def.controls!(new ControlPanel(ctrl, this.sfx));
        this.cleanupControls = typeof r === 'function' ? r : null;
      });
    }
  }

  /** Explain button state: idle ("Förklara") or playing ("Stoppa"). */
  setExplaining(on: boolean) {
    const b = $('#station-explain');
    b.dataset.state = on ? 'playing' : 'idle';
    const label = $('#explain-label');
    label.dataset.t = on ? 'stopExplain' : 'explain';
    label.textContent = t(on ? S.stopExplain : S.explain);
  }

  closeStation() {
    this.cleanupControls?.();
    this.cleanupControls = null;
    this.currentStation = null;
    this.panel.classList.add('hidden');
    document.body.classList.remove('focused');
  }

  get stationOpen() {
    return !!this.currentStation;
  }

  // ---------------------------------------------------------------- Buddy speech & chat

  /** Subtitle under the scene. `who` = 'buddy' | 'you'. Streaming updates replace the text. */
  subtitleSet(who: 'buddy' | 'you', text: string, holdMs = 4500) {
    clearTimeout(this.subtitleTimer);
    this.subtitle.classList.remove('hidden');
    this.subtitle.dataset.who = who;
    $('#sub-who').textContent = who === 'buddy' ? 'Buddy' : t(S.you);
    $('#sub-text').textContent = text;
    if (holdMs > 0) this.subtitleTimer = window.setTimeout(() => this.subtitle.classList.add('hidden'), holdMs);
  }

  subtitleHide(afterMs = 0) {
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => this.subtitle.classList.add('hidden'), afterMs);
  }

  setTalkStatus(s: ChatStatus) {
    const b = $('#talk-btn');
    b.dataset.status = s;
    const label = $('#talk-label');
    const map: Record<ChatStatus, L10n> = {
      off: S.talk,
      connecting: L('Ansluter …', 'Connecting …'),
      listening: L('Jag lyssnar …', "I'm listening …"),
      speaking: L('Buddy pratar …', 'Buddy is talking …'),
      thinking: L('Buddy tänker …', 'Buddy is thinking …'),
      error: L('Kunde inte ansluta', "Couldn't connect"),
    };
    label.textContent = t(map[s]);
    document.body.classList.toggle('talking', s !== 'off' && s !== 'error');
  }

  // ---------------------------------------------------------------- joystick

  private buildJoystick() {
    const base = $('#joystick');
    const knob = $('#joy-knob');
    let id = -1;
    let cx = 0;
    let cy = 0;
    const R = 46;
    const set = (x: number, y: number, active: boolean) => {
      knob.style.transform = `translate(${x * R}px, ${y * R}px)`;
      this.onJoystick?.(x, y, active);
    };
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      base.setPointerCapture(id);
      e.stopPropagation();
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let x = (e.clientX - cx) / R;
      let y = (e.clientY - cy) / R;
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      set(x, y, true);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      set(0, 0, false);
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }
}
