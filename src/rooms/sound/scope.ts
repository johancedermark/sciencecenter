/**
 * "See your voice": oscilloscope + FFT spectrum on a big glowing screen (CanvasTexture) and in the HUD.
 * Sources: the microphone (with permission) and a tone generator (sine/square/sawtooth, 20 Hz–20 kHz),
 * plus a hearing-range sweep.
 */
import * as THREE from 'three';
import { L, t } from '../../core/i18n';
import type { ControlPanel, Readout } from '../../core/controlPanel';
import type { L10n } from '../../core/types';
import { camDist, hz, nf, noteName, rbox, type Shared, type StationModule } from './common';

const CX = 6;
const CZ = -5;
const SW = 1024;
const SH = 576;
const FFT = 4096;
const SWEEP_S = 30; // seconds for 20 Hz → 20 kHz

type Wave = 'sine' | 'square' | 'sawtooth';
type MicState = 'off' | 'asking' | 'on' | 'denied';
const WAVE_GAIN: Record<Wave, number> = { sine: 1, square: 0.38, sawtooth: 0.5 };

export function buildScope(s: Shared): StationModule {
  const { ctx, mats } = s;
  const ac = ctx.sfx.ctx;
  const root = new THREE.Group();
  root.position.set(CX, 0, CZ);
  ctx.group.add(root);

  // Desk
  const desk = new THREE.Mesh(rbox(1.7, 0.74, 0.62, 0.04), mats.darkWood);
  desk.position.set(0, 0.37, 0.3);
  const deskTop = new THREE.Mesh(rbox(1.85, 0.06, 0.72, 0.025), mats.wood);
  deskTop.position.set(0, 0.77, 0.3);
  root.add(desk, deskTop);

  // Screen on two brass posts
  const postGeo = new THREE.CylinderGeometry(0.025, 0.03, 2.2, 10);
  for (const x of [-0.75, 0.75]) {
    const p = new THREE.Mesh(postGeo, mats.brass);
    p.position.set(x, 1.1, -0.28);
    root.add(p);
  }
  const screenGroup = new THREE.Group();
  screenGroup.position.set(0, 1.78, -0.24);
  screenGroup.rotation.x = -0.05;
  root.add(screenGroup);
  const frame = new THREE.Mesh(rbox(1.86, 1.1, 0.08, 0.04), mats.wood);
  screenGroup.add(frame);
  const canvas = document.createElement('canvas');
  canvas.width = SW;
  canvas.height = SH;
  const g = canvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(canvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.9675), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = 0.042;
  screenGroup.add(screen);

  // Microphone on a stand
  const mic = new THREE.Group();
  const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 20), mats.black);
  micBase.position.y = 0.81;
  const micStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8), mats.steel);
  micStem.position.y = 0.94;
  const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3a3d45, metalness: 0.6, roughness: 0.45 }));
  micHead.scale.y = 1.35;
  micHead.position.y = 1.1;
  const micRing = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.006, 6, 20), mats.brass);
  micRing.rotation.x = Math.PI / 2;
  micRing.position.y = 1.08;
  const micLed = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0x331111, toneMapped: false }));
  micLed.position.set(0, 0.835, 0.07);
  mic.add(micBase, micStem, micHead, micRing, micLed);
  mic.position.set(-0.45, 0, 0.35);
  root.add(mic);

  // Speaker
  const spk = new THREE.Group();
  const spkBox = new THREE.Mesh(rbox(0.32, 0.42, 0.26, 0.03), mats.wood);
  spkBox.position.y = 1.01;
  const cone = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), mats.black);
  cone.position.set(0, 1.04, 0.131);
  const dust = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), mats.brass);
  dust.position.set(0, 1.04, 0.133);
  spk.add(spkBox, cone, dust);
  spk.position.set(0.5, 0, 0.3);
  root.add(spk);

  ctx.addCollider(CX, CZ + 0.15, 1.95, 1.05);

  // ---------------------------------------------------------------- audio graph
  const analyser = ac.createAnalyser();
  analyser.fftSize = FFT;
  analyser.smoothingTimeConstant = 0.55;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -20;
  const sink = ac.createGain();
  sink.gain.value = 0; // keeps the analyser pulled without making sound
  analyser.connect(sink).connect(s.bus);
  const timeData = new Float32Array(FFT);
  const freqData = new Float32Array(FFT / 2);

  let osc: OscillatorNode | null = null;
  let genGain: GainNode | null = null;
  let micStream: MediaStream | null = null;
  let micSrc: MediaStreamAudioSourceNode | null = null;

  // ---------------------------------------------------------------- state
  let focused = false;
  let genOn = false;
  let wave: Wave = 'sine';
  let genF = 440;
  let volume = 0.5;
  let sweep = -1; // seconds into the sweep, < 0 = off
  let heardTo = 0;
  let micState = 'off' as MicState;
  let peakDb = -120;
  let peakF = 0;
  let voiced = false;
  let squareSeen = false;
  let drawTimer = 0;

  let ui: {
    gen?: HTMLInputElement; fs?: HTMLInputElement; waveSet?: (i: number) => void;
    micBtn?: HTMLButtonElement; micNote?: HTMLElement; peak?: Readout; sweepR?: Readout; sweepNote?: HTMLElement;
    sweepBtn?: HTMLButtonElement;
    hud?: { ctx: CanvasRenderingContext2D; width: number; height: number };
  } = {};

  const fToS = (f: number) => (Math.log(f / 20) / Math.log(1000)) * 1000;
  const sToF = (v: number) => 20 * Math.pow(1000, v / 1000);

  function currentF() {
    return sweep >= 0 ? 20 * Math.pow(1000, Math.min(1, sweep / SWEEP_S)) : genF;
  }

  function genTarget() {
    if (sweep >= 0) {
      // gentle, slightly lower around 2–5 kHz where the ear is most sensitive
      const f = currentF();
      const x = Math.log2(f / 3500);
      return 0.03 * volume * (1 - 0.5 * Math.exp(-x * x));
    }
    return genOn ? 0.07 * volume * WAVE_GAIN[wave] : 0;
  }

  function startOsc() {
    if (osc) return;
    osc = ac.createOscillator();
    osc.type = sweep >= 0 ? 'sine' : wave;
    osc.frequency.value = currentF();
    genGain = ac.createGain();
    genGain.gain.value = 0;
    osc.connect(genGain);
    genGain.connect(s.bus);
    genGain.connect(analyser);
    osc.start();
  }

  function stopOsc() {
    if (!osc || !genGain) return;
    const now = ac.currentTime;
    genGain.gain.cancelScheduledValues(now);
    genGain.gain.setTargetAtTime(0, now, 0.04);
    const o = osc;
    const gg = genGain;
    o.stop(now + 0.3);
    o.onended = () => {
      o.disconnect();
      gg.disconnect();
    };
    osc = null;
    genGain = null;
  }

  function setGen(on: boolean) {
    genOn = on;
    if (ui.gen) ui.gen.checked = on;
  }

  function stopMic() {
    micStream?.getTracks().forEach((tr) => tr.stop());
    micStream = null;
    micSrc?.disconnect();
    micSrc = null;
    if (micState === 'on' || micState === 'asking') micState = 'off';
    refreshMicUi();
  }

  const MIC_TEXT: Record<MicState, L10n> = {
    off: L('🎤 Använd mikrofonen', '🎤 Use the microphone'),
    asking: L('Väntar på svar …', 'Waiting for permission …'),
    on: L('🎤 Stäng av mikrofonen', '🎤 Turn off the microphone'),
    denied: L('🎤 Försök igen med mikrofonen', '🎤 Try the microphone again'),
  };
  function refreshMicUi() {
    if (ui.micBtn) ui.micBtn.textContent = t(MIC_TEXT[micState]);
    if (ui.micNote) {
      ui.micNote.textContent =
        micState === 'denied'
          ? t(L('Ingen mikrofon den här gången, och det är helt okej. Tongeneratorn är på i stället, så du kan se hur olika toner ser ut.', 'No microphone this time, and that is perfectly fine. The tone generator is on instead, so you can see what different tones look like.'))
          : micState === 'on'
            ? t(L('Mikrofonen är på. Prata, sjung, vissla eller klappa!', 'The microphone is on. Talk, sing, whistle or clap!'))
            : t(L('För att rita din röst behöver vi mikrofonen. Ljudet analyseras bara här i webbläsaren: inget spelas in och inget skickas iväg. Du kan säga nej, då använder du tongeneratorn.', 'To draw your voice we need the microphone. The sound is only analysed here in the browser: nothing is recorded and nothing is sent anywhere. You can say no and use the tone generator instead.'));
    }
  }

  async function askMic() {
    if (micState === 'on') {
      stopMic();
      return;
    }
    if (micState === 'asking') return;
    micState = 'asking';
    refreshMicUi();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (!focused) {
        stream.getTracks().forEach((tr) => tr.stop());
        micState = 'off';
        return;
      }
      micStream = stream;
      micSrc = ac.createMediaStreamSource(stream);
      micSrc.connect(analyser); // analyser only: never to the speakers (no feedback)
      micState = 'on';
      ctx.sfx.resume();
    } catch {
      micState = 'denied';
      if (focused && !genOn && sweep < 0) setGen(true);
    }
    refreshMicUi();
  }

  function startSweep() {
    stopOsc();
    sweep = 0;
    heardTo = 0;
    setGen(false);
    if (ui.sweepBtn) ui.sweepBtn.textContent = t(L('✋ Nu hör jag inget längre!', "✋ I can't hear it any more!"));
    ui.sweepR?.set('…');
    if (ui.sweepNote) ui.sweepNote.textContent = '';
  }

  function hearingVerdict(f: number): L10n {
    if (f >= 17000) return L('Du hör riktigt höga toner, typiskt för barn och unga.', 'You can hear really high tones, typical of children and young people.');
    if (f >= 15000) return L('Vanligt för unga vuxna. Gränsen sjunker sakta med åren.', 'Common for young adults. The limit slowly drops over the years.');
    if (f >= 12000) return L('Vanligt för vuxna: från ungefär 50 års ålder hör många inte över 15 kHz.', 'Common for adults: from about age 50 many people cannot hear above 15 kHz.');
    return L('Det kan bero på åldern, men också på högtalarna: små högtalare klarar ofta inte de högsta tonerna.', 'It may be age, but also the speakers: small speakers often cannot play the highest tones.');
  }

  function stopSweep(heard: boolean) {
    if (sweep < 0) return;
    const f = currentF();
    sweep = -1;
    stopOsc();
    if (ui.sweepBtn) ui.sweepBtn.textContent = t(L('▶ Starta hörselsvepet', '▶ Start the hearing sweep'));
    if (heard) {
      heardTo = f;
      ui.sweepR?.set(hz(f));
      if (ui.sweepNote) ui.sweepNote.textContent = t(hearingVerdict(f));
      ctx.buddy.say(
        L(`Du hörde ända upp till ${hz(f)}! ${t(hearingVerdict(f))}`, `You heard all the way up to ${hz(f)}! ${t(hearingVerdict(f))}`),
        { expression: 'surprised' },
      );
    }
  }

  // In-world: click the mic / the speaker
  ctx.interaction.add(mic, {
    label: L('Mikrofon: klicka för på/av', 'Microphone: click for on/off'),
    enabled: () => focused,
    onClick: () => void askMic(),
  });
  ctx.interaction.add(spk, {
    label: L('Högtalare: tongenerator på/av', 'Speaker: tone generator on/off'),
    enabled: () => focused,
    onClick: () => {
      if (sweep >= 0) stopSweep(false);
      setGen(!genOn);
    },
  });

  // ---------------------------------------------------------------- station
  ctx.addStation({
    id: 'sound-scope',
    title: L('Se din röst', 'See your voice'),
    position: [CX, CZ],
    viewpoint: { position: [CX - 0.05, 1.62, CZ + 2.9], target: [CX + 0.5, 1.28, CZ - 0.2] },
    intro: L(
      'Ljud är snabba tryckvågor i luften. Här kan du se hur din röst och olika toner ser ut!',
      'Sound is fast pressure waves in the air. Here you can see what your voice and different tones look like!',
    ),
    howTo: L(
      'Slå på mikrofonen och prata, sjung eller vissla. Eller spela toner med tongeneratorn och jämför sinus, fyrkant och sågtand. Testa sedan hur höga toner du hör med hörselsvepet.',
      'Turn on the microphone and talk, sing or whistle. Or play tones with the tone generator and compare sine, square and sawtooth. Then test how high you can hear with the hearing sweep.',
    ),
    science: L(
      'Övre halvan av skärmen visar trycket i luften över tid (vågformen), den nedre visar vilka frekvenser ljudet består av (spektrum, beräknat med FFT). En sinuston har bara en frekvens, medan en fyrkantsvåg också innehåller udda övertoner (3f, 5f, 7f …) och en sågtand alla övertoner. Människor hör ungefär 20 Hz till 20 kHz. Med åren slits hårcellerna längst in vid snäckans början, de som känner av de högsta tonerna, så de flesta hör sämre i diskanten med stigande ålder (presbyacusis); många 50-åringar hör inte över 15 kHz. Starka ljud skadar hårcellerna snabbare och skadan läker inte, så håll volymen låg.',
      'The top half of the screen shows the air pressure over time (the waveform); the bottom half shows which frequencies the sound is made of (the spectrum, computed with an FFT). A sine tone has a single frequency, while a square wave also contains odd harmonics (3f, 5f, 7f …) and a sawtooth all harmonics. Humans hear roughly 20 Hz to 20 kHz. Over the years the hair cells at the entrance of the cochlea, the ones that sense the highest tones, wear out, so most people hear less treble as they age (presbycusis); many 50-year-olds cannot hear above 15 kHz. Loud sounds damage hair cells faster and the damage does not heal, so keep the volume low.',
    ),
    wow: L(
      'Barn och tonåringar kan ofta höra "mygg-toner" kring 17 kHz som deras föräldrar inte hör alls.',
      'Children and teenagers can often hear "mosquito tones" around 17 kHz that their parents cannot hear at all.',
    ),
    onFocus: () => {
      focused = true;
      ctx.sfx.resume();
    },
    onBlur: () => {
      focused = false;
      silence();
    },
    controls: (panel: ControlPanel) => {
      panel.heading(L('Mikrofon', 'Microphone'));
      ui.micNote = panel.note(L('', ''));
      ui.micBtn = panel.button(MIC_TEXT[micState], () => void askMic(), { primary: true });
      refreshMicUi();
      ui.peak = panel.readout(L('Starkaste frekvens', 'Strongest frequency'));
      const c = panel.canvas(150);
      ui.hud = { ctx: c.ctx, width: c.width, height: c.height };

      panel.heading(L('Tongenerator', 'Tone generator'));
      ui.gen = panel.toggle(L('Tongenerator på', 'Tone generator on'), genOn, (v) => {
        if (sweep >= 0) stopSweep(false);
        setGen(v);
      });
      const waves: Wave[] = ['sine', 'square', 'sawtooth'];
      ui.waveSet = panel.buttons(
        [
          { label: L('Sinus', 'Sine'), icon: '∿', onClick: () => (wave = 'sine') },
          { label: L('Fyrkant', 'Square'), icon: '⊓', onClick: () => (wave = 'square') },
          { label: L('Sågtand', 'Sawtooth'), icon: '⩘', onClick: () => (wave = 'sawtooth') },
        ],
        waves.indexOf(wave),
      );
      ui.fs = panel.slider(
        L('Frekvens', 'Frequency'),
        { min: 0, max: 1000, step: 0.01, value: fToS(genF), format: (v) => `${hz(sToF(v))} · ${noteName(sToF(v))}` },
        (v) => {
          genF = sToF(v);
          if (sweep < 0 && !genOn) setGen(true);
        },
      );
      panel.buttons([
        { label: L('A4 440 Hz', 'A4 440 Hz'), onClick: () => setF(440) },
        { label: L('100 Hz', '100 Hz'), onClick: () => setF(100) },
        { label: L('1 kHz', '1 kHz'), onClick: () => setF(1000) },
      ]);
      panel.slider(
        L('Volym', 'Volume'),
        { min: 0, max: 100, step: 1, value: Math.round(volume * 100), format: (v) => `${nf(v)} %` },
        (v) => (volume = v / 100),
      );

      panel.heading(L('Hörselsvep 20 Hz – 20 kHz', 'Hearing sweep 20 Hz – 20 kHz'));
      panel.note(
        L(
          '⚠️ Sänk volymen innan du börjar och använd aldrig hög volym i hörlurar: ljud som är för starka kan skada hörseln för alltid. Tonen går från mörk bas till pip på 30 sekunder. Tryck när du inte hör den längre.',
          "⚠️ Turn the volume down before you start, and never use high volume in headphones: sounds that are too loud can damage your hearing for good. The tone goes from deep bass to a squeak in 30 seconds. Press when you can't hear it any more.",
        ),
      );
      ui.sweepBtn = panel.button(
        sweep >= 0 ? L('✋ Nu hör jag inget längre!', "✋ I can't hear it any more!") : L('▶ Starta hörselsvepet', '▶ Start the hearing sweep'),
        () => (sweep >= 0 ? stopSweep(true) : startSweep()),
        { primary: true },
      );
      ui.sweepR = panel.readout(L('Du hörde upp till', 'You heard up to'), heardTo ? hz(heardTo) : '–');
      ui.sweepNote = panel.note(heardTo ? hearingVerdict(heardTo) : L('', ''));
      return () => {
        ui = {};
      };
    },
  });

  function setF(f: number) {
    genF = f;
    if (ui.fs) {
      ui.fs.value = String(fToS(f));
      ui.fs.dispatchEvent(new Event('input'));
    }
    if (sweep < 0) setGen(true);
  }

  function silence() {
    setGen(false);
    sweep = -1;
    stopOsc();
    stopMic();
  }

  // ---------------------------------------------------------------- drawing
  const LOG_SPAN = Math.log(1000);
  const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const fx = (f: number) => 40 + (Math.log(f / 20) / LOG_SPAN) * (SW - 60);

  function drawScreen(time: number, live: boolean) {
    g.fillStyle = '#04121a';
    g.fillRect(0, 0, SW, SH);
    // grid
    g.strokeStyle = 'rgba(79,209,255,0.12)';
    g.lineWidth = 1;
    for (let x = 40; x <= SW - 20; x += 94.4) {
      g.beginPath();
      g.moveTo(x, 40);
      g.lineTo(x, 290);
      g.stroke();
    }
    for (let y = 40; y <= 290; y += 62.5) {
      g.beginPath();
      g.moveTo(40, y);
      g.lineTo(SW - 20, y);
      g.stroke();
    }
    g.font = '600 24px "Nunito", system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#8fe6ff';
    const src = micState === 'on' ? t(L('mikrofon', 'microphone')) : genOn || sweep >= 0 ? t(L('tongenerator', 'tone generator')) : t(L('väntar på ljud', 'waiting for sound'));
    g.fillText(`${t(L('Vågform', 'Waveform'))} · ${src}`, 40, 20);
    g.textAlign = 'right';
    g.fillText(t(L('21 ms över skärmen', '21 ms across')), SW - 20, 20);

    // waveform
    const mid = 165;
    g.shadowColor = '#4fd1ff';
    g.shadowBlur = 12;
    g.strokeStyle = '#7fe4ff';
    g.lineWidth = 3;
    g.beginPath();
    const NW = 1024;
    if (live) {
      analyser.getFloatTimeDomainData(timeData);
      let peak = 0;
      for (let i = 0; i < FFT; i++) peak = Math.max(peak, Math.abs(timeData[i]));
      let start = 0;
      for (let i = 1; i < FFT - NW; i++) {
        if (timeData[i - 1] < 0 && timeData[i] >= 0) {
          start = i;
          break;
        }
      }
      const scale = 115 / Math.max(peak, 0.02);
      for (let i = 0; i < NW; i += 2) {
        const x = 40 + (i / NW) * (SW - 60);
        const y = mid - timeData[start + i] * scale;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
    } else {
      for (let i = 0; i <= 240; i++) {
        const x = 40 + (i / 240) * (SW - 60);
        const y = mid - 40 * Math.sin(i * 0.11 + time * 1.5) * Math.sin(i * 0.013 + time * 0.3);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
    }
    g.stroke();
    g.shadowBlur = 0;

    // spectrum
    const top = 330;
    const bottom = 530;
    g.textAlign = 'left';
    g.fillStyle = '#ffcf8f';
    g.fillText(t(L('Spektrum (frekvenser)', 'Spectrum (frequencies)')), 40, 310);
    g.font = '500 18px "Nunito", system-ui, sans-serif';
    g.textAlign = 'center';
    g.strokeStyle = 'rgba(255,190,110,0.15)';
    for (const f of ticks) {
      const x = fx(f);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bottom);
      g.stroke();
      g.fillStyle = 'rgba(255,207,143,0.8)';
      g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x, bottom + 22);
    }
    peakDb = -120;
    peakF = 0;
    if (live) {
      analyser.getFloatFrequencyData(freqData);
      const binHz = ac.sampleRate / FFT;
      const grad = g.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, 'rgba(255,190,100,0.95)');
      grad.addColorStop(1, 'rgba(255,120,60,0.25)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(40, bottom);
      for (let x = 40; x <= SW - 20; x += 2) {
        const f = 20 * Math.exp(((x - 40) / (SW - 60)) * LOG_SPAN);
        const b = Math.min(freqData.length - 1, Math.round(f / binHz));
        const db = freqData[b];
        const v = Math.max(0, Math.min(1, (db + 105) / 75));
        g.lineTo(x, bottom - v * (bottom - top));
      }
      g.lineTo(SW - 20, bottom);
      g.closePath();
      g.fill();
      let bi = -1;
      const b0 = Math.ceil(30 / binHz);
      for (let b = b0; b < freqData.length - 1; b++) {
        if (freqData[b] > peakDb) {
          peakDb = freqData[b];
          bi = b;
        }
      }
      if (bi > 0 && peakDb > -78) {
        const a = freqData[bi - 1];
        const c = freqData[bi + 1];
        const den = a - 2 * peakDb + c;
        const off = den !== 0 ? (0.5 * (a - c)) / den : 0;
        peakF = (bi + off) * binHz;
        const x = fx(Math.max(20, peakF));
        g.fillStyle = '#ffffff';
        g.font = '700 22px "Nunito", system-ui, sans-serif';
        g.fillText(`${hz(peakF)} · ${noteName(peakF)}`, Math.min(SW - 110, Math.max(110, x)), top + 6);
      }
    }
    screenTex.needsUpdate = true;
    if (ui.hud) {
      ui.hud.ctx.clearRect(0, 0, ui.hud.width, ui.hud.height);
      ui.hud.ctx.drawImage(canvas, 0, 0, ui.hud.width, ui.hud.height);
    }
  }

  // ---------------------------------------------------------------- update
  const micLedMat = micLed.material as THREE.MeshBasicMaterial;
  let level = 0;
  function update(dt: number, time: number) {
    dt = Math.min(dt, 0.05);
    const near = focused || camDist(s, CX, CZ) < 9;
    if (!near) return;

    if (sweep >= 0) {
      sweep += dt;
      if (sweep > SWEEP_S) stopSweep(true);
    }
    const target = focused ? genTarget() : 0;
    if (target > 0) {
      startOsc();
      if (osc && genGain) {
        const want: OscillatorType = sweep >= 0 ? 'sine' : wave;
        if (osc.type !== want) osc.type = want;
        osc.frequency.setTargetAtTime(currentF(), ac.currentTime, 0.02);
        genGain.gain.setTargetAtTime(target, ac.currentTime, 0.03);
      }
    } else if (osc) stopOsc();

    const live = focused && (micState === 'on' || !!osc);
    drawTimer -= dt;
    if (drawTimer <= 0) {
      drawTimer = focused ? 1 / 30 : 1 / 8;
      drawScreen(time, live);
      if (focused) {
        ui.peak?.set(peakF > 0 ? `${hz(peakF)} (${noteName(peakF)})` : '–');
        if (sweep >= 0) ui.sweepR?.set(hz(currentF()));
      }
    }
    level += ((live ? Math.max(0, (peakDb + 90) / 60) : 0) - level) * (1 - Math.exp(-dt * 12));
    cone.scale.setScalar(1 + level * 0.06 * Math.sin(time * 60));
    micLedMat.color.setHex(micState === 'on' ? 0xff4040 : 0x331111);

    if (!focused) return;
    if (micState === 'on' && peakDb > -45 && !voiced) {
      voiced = true;
      s.cheer(L('Där är din röst! Ser du alla toppar i spektrumet? Det är grundtonen och dess övertoner.', 'There is your voice! See all the peaks in the spectrum? That is the fundamental and its harmonics.'));
    }
    if (osc && wave === 'square' && sweep < 0 && !squareSeen) {
      squareSeen = true;
      s.cheer(L('En fyrkantsvåg är en grundton plus udda övertoner: 3f, 5f, 7f … Titta i spektrumet!', 'A square wave is a fundamental plus odd harmonics: 3f, 5f, 7f … Look at the spectrum!'), false);
    }
  }

  drawScreen(0, false); // never a black screen, even from across the room
  return { update, silence };
}
