/** Wires engine, world, player, UI, Buddy and the voice together. */
import { Engine, isTouch } from './core/engine';
import { Interaction } from './core/interaction';
import { Player } from './core/player';
import { Sfx } from './core/sfx';
import { UI, S } from './core/ui';
import { World, type RegisteredStation } from './core/world';
import { ATRIUM_SPAWN, ROOM_ORDER, roomSpawn } from './core/layout';
import { L, getLang, onLangChange, t } from './core/i18n';
import type { BuddyApi, BuddyController, RoomId } from './core/types';
import { ROOMS, ATRIUM } from './rooms';
import { Buddy } from './buddy/Buddy';
import { BuddyVoice } from './voice/BuddyVoice';
import type { VoiceHost } from './voice/types';

export class App {
  private engine: Engine;
  private sfx = new Sfx();
  private ui: UI;
  private interaction: Interaction;
  private player: Player;
  private world: World;
  private buddy!: BuddyController;
  private voice!: BuddyVoice;
  private focused: RegisteredStation | null = null;
  private nearby: RegisteredStation | null = null;
  private lastArea = '';
  private greeted = new Set<string>();
  private started = false;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.ui = new UI(this.sfx, isTouch);
    this.interaction = new Interaction(this.engine.camera, this.engine.renderer.domElement);
    // Buddy is created before the world so rooms can talk to it; it needs collision later.
    const buddyProxy: BuddyApi = {
      say: (...a) => this.buddy?.say(...a),
      emote: (...a) => this.buddy?.emote(...a),
      gesture: (...a) => this.buddy?.gesture(...a),
      celebrate: (...a) => this.buddy?.celebrate(...a),
      attend: (...a) => this.buddy?.attend(...a),
    };
    this.world = new World(this.engine.scene, this.engine.camera, this.interaction, this.sfx, buddyProxy);
    this.player = new Player(this.engine.camera, this.engine.renderer.domElement, this.world.collision, this.interaction);
  }

  async init() {
    this.ui.setLoading(0.1);
    await document.fonts.ready.catch(() => undefined);
    this.ui.setLoading(0.3);
    await frame();
    this.world.build(ROOMS, ATRIUM);
    this.ui.setLoading(0.6);
    this.ui.setRooms(this.world.roomDefs());

    this.buddy = new Buddy({ scene: this.engine.scene, sfx: this.sfx, collision: this.world.collision });
    this.voice = new BuddyVoice(this.voiceHost(), this.sfx);
    this.buddy.speaker = (line) => this.voice.narrate(line);

    this.player.teleport(ATRIUM_SPAWN.pos, ATRIUM_SPAWN.yaw);
    this.buddy.placeNear(this.player.position, this.player.yaw);
    this.player.update(0);
    await frame();
    await this.world.prewarm(this.engine.renderer, this.engine.scene, this.engine.camera, (f) => this.ui.setLoading(0.6 + 0.39 * f));
    this.ui.setLoading(1);
    this.wire();
    this.engine.onUpdate((dt, time) => this.update(dt, time));
    this.engine.start();
    this.applyDeepLink();
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).gnistan = {
        app: this, engine: this.engine, world: this.world, player: this.player,
        goTo: (id: RoomId | 'atrium') => this.goTo(id),
        open: (id: string) => {
          const s = this.world.stations.find((x) => x.def.id === id);
          if (s) this.openStation(s);
          return !!s;
        },
        close: () => this.closeStation(),
        stats: () => ({ fps: Math.round(this.engine.fps), ...this.engine.renderer.info.render }),
      };
    }
  }

  /**
   * Deep links: `?room=space` starts in a room, `?station=foucault` opens a station,
   * `&go` skips the start screen (sound then starts on the first click).
   */
  private applyDeepLink() {
    const q = new URLSearchParams(location.search);
    const room = q.get('room') as RoomId | 'atrium' | null;
    const station = q.get('station');
    if (q.has('go')) document.getElementById('start-btn')?.click();
    const s = station ? this.world.stations.find((x) => x.def.id === station) : null;
    const target = s ? s.room : room;
    if (target && (target === 'atrium' || ROOM_ORDER.includes(target))) {
      const sp = target === 'atrium' ? ATRIUM_SPAWN : roomSpawn(ROOM_ORDER.indexOf(target));
      this.player.teleport(sp.pos, sp.yaw);
      this.player.update(0);
      this.buddy.placeNear(this.player.position, this.player.yaw);
    }
    if (s) setTimeout(() => this.openStation(s), 400);
  }

  private wire() {
    const ui = this.ui;
    ui.onStart = () => {
      this.started = true;
      this.player.inputEnabled = true;
      setTimeout(() => {
        this.buddy.say(
          L(
            'Hej! Jag heter Buddy. Välkommen till Gnistan! Gå runt och testa allt, eller tryck på kartan. Och prata gärna med mig!',
            "Hi! I'm Buddy. Welcome to Gnistan! Walk around and try everything, or open the map. And feel free to talk to me!",
          ),
          { expression: 'joy', gesture: 'wave' },
        );
      }, 700);
    };
    ui.onTeleport = (id) => void this.goTo(id);
    ui.onExplore = () => this.nearby && this.openStation(this.nearby);
    ui.onBack = () => this.closeStation();
    ui.onJoystick = (x, y, a) => this.player.setJoystick(x, y, a);
    ui.onTalkToggle = async () => {
      this.sfx.resume();
      if (this.voice.active) {
        this.voice.stop();
      } else {
        await this.voice.start();
      }
    };
    ui.onSendText = (text) => this.voice.sendText(text);
    this.player.onLeaveFocus = () => this.closeStation();
    this.interaction.onHoverLabel = (label, x, y) => ui.tooltipAt(label, x, y);
    this.interaction.onEmptyClick = (_info, hit) => {
      if (!this.started || this.focused || !hit) return;
      this.player.walkTo(hit.point);
    };
    onLangChange(() => {
      this.lastArea = '';
      this.voice.contextChanged();
    });
  }

  private update(dt: number, time: number) {
    this.player.update(dt);
    const p = this.player.position;
    this.world.update(dt, time, p, this.player.isFocused);

    // Location chip, first-visit greetings and voice context
    const area = this.world.area;
    if (area.id !== this.lastArea) {
      const isNewArea = this.lastArea !== '';
      this.lastArea = area.id;
      const def = area.id === 'atrium' ? null : this.world.roomDefs().find((r) => r.id === area.id)!;
      this.ui.setLocation(def ? def.icon : '🕰️', def ? def.title : S.atrium);
      if (def && area.kind === 'room' && this.started && !this.greeted.has(def.id) && isNewArea) {
        this.greeted.add(def.id);
        this.buddy.say(def.greeting, { expression: 'happy', gesture: 'wave' });
      }
      this.voice.contextChanged();
    }
    this.ui.setMapPosition(p.x, p.z);

    // Station prompt
    const near = this.focused ? null : this.world.nearestStation(p);
    if (near !== this.nearby) {
      this.nearby = near;
      this.ui.showPrompt(near ? near.def.title : null);
      if (near) this.sfx.hover();
    }

    this.buddy.update(dt, time, {
      playerPos: p,
      playerYaw: this.player.yaw,
      cameraPos: this.engine.camera.position,
      focus: this.focused ? { world: this.focused.world, viewPos: this.focused.viewPos } : null,
      talkLevel: this.voice.level(),
      moving: this.player.speed > 0.3,
    });
  }

  private openStation(s: RegisteredStation) {
    if (this.focused === s) return;
    if (this.focused) this.closeStation();
    this.focused = s;
    this.ui.showPrompt(null);
    this.nearby = null;
    this.sfx.whoosh();
    this.player.focusOn(s.viewPos, s.viewTarget, s.def.fixedViewpoint);
    this.ui.openStation(s.def);
    s.def.onFocus?.();
    this.buddy.attend(s.world);
    this.buddy.say(s.def.intro, { gesture: 'point', expression: 'idea' });
    this.voice.contextChanged();
  }

  private closeStation() {
    const s = this.focused;
    if (!s) return;
    this.focused = null;
    s.def.onBlur?.();
    this.ui.closeStation();
    this.player.unfocus();
    this.voice.contextChanged();
  }

  async goTo(id: RoomId | 'atrium') {
    this.closeStation();
    await this.ui.fade(() => {
      const sp = id === 'atrium' ? ATRIUM_SPAWN : roomSpawn(ROOM_ORDER.indexOf(id));
      this.player.teleport(sp.pos, sp.yaw);
      this.player.update(0);
      this.buddy.placeNear(this.player.position, this.player.yaw);
    });
  }

  private voiceHost(): VoiceHost {
    const stationText = (s: RegisteredStation) =>
      `${t(s.def.title)}. ${t(s.def.intro)} ${t(s.def.howTo)} ${t(s.def.science)} ${s.def.wow ? t(s.def.wow) : ''}`;
    return {
      ui: this.ui,
      buddy: this.buddy,
      lang: () => getLang(),
      describeContext: () => {
        const a = this.world.area;
        const place = t(this.world.titleOf(a.id));
        const where = a.kind === 'corridor' ? `${getLang() === 'sv' ? 'korridoren mot' : 'the corridor to'} ${place}` : place;
        const here = this.world.stations.filter((s) => s.room === a.id).map((s) => `${s.def.id}: ${t(s.def.title)}`);
        const parts = [`${getLang() === 'sv' ? 'Besökaren är i' : 'The visitor is in'}: ${where}.`];
        if (here.length) parts.push(`${getLang() === 'sv' ? 'Stationer här' : 'Stations here'}: ${here.join('; ')}.`);
        if (this.focused) parts.push(`${getLang() === 'sv' ? 'Besökaren tittar nu på' : 'The visitor is now using'}: ${t(this.focused.def.title)}.`);
        else if (this.nearby) parts.push(`${getLang() === 'sv' ? 'Står nära' : 'Standing near'}: ${t(this.nearby.def.title)}.`);
        return parts.join(' ');
      },
      focusedStationText: () => (this.focused ? stationText(this.focused) : null),
      focusedStationScience: () => (this.focused ? t(this.focused.def.science) : null),
      rooms: () => [
        { id: 'atrium' as const, title: t(S.atrium) },
        ...this.world.roomDefs().map((r) => ({ id: r.id, title: t(r.title) })),
      ],
      stations: () => this.world.stations.map((s) => ({ id: s.def.id, room: s.room, title: t(s.def.title) })),
      goTo: async (id) => {
        if (id !== 'atrium' && !ROOM_ORDER.includes(id)) return `unknown room ${id}`;
        await this.goTo(id);
        return `ok, visitor is now in ${t(this.world.titleOf(id))}`;
      },
      openStation: async (id) => {
        const s = this.world.stations.find((x) => x.def.id === id);
        if (!s) return `unknown station ${id}`;
        if (this.world.area.id !== s.room) await this.goTo(s.room);
        // Stand the visitor in front of the station first so "back" lands somewhere sensible.
        this.openStation(s);
        return `ok, opened ${t(s.def.title)}. ${stationText(s)}`;
      },
      closeStation: () => {
        this.closeStation();
        return 'ok';
      },
    };
  }
}

/** Yield to the browser (one frame, or 50 ms if rAF is throttled in a background tab). */
function frame() {
  return new Promise<void>((r) => {
    const id = setTimeout(r, 50);
    requestAnimationFrame(() => {
      clearTimeout(id);
      r();
    });
  });
}

