import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type Updater = (dt: number, time: number) => void;

export const isTouch = matchMedia('(pointer: coarse)').matches;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private updaters: Updater[] = [];
  private timer = new THREE.Timer();
  private time = 0;
  /** Smoothed FPS, for adaptive quality. */
  fps = 60;

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.id = 'scene';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(isTouch ? 72 : 66, window.innerWidth / window.innerHeight, 0.05, 220);
    this.scene.background = new THREE.Color(0x0b0a12);
    this.scene.fog = new THREE.Fog(0x1a1420, 30, 90);

    // Soft image-based lighting gives the PBR materials their cozy sheen.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const res = new THREE.Vector2(window.innerWidth, window.innerHeight).multiplyScalar(0.5);
    this.bloom = new UnrealBloomPass(res, 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', this.resize);
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * 0.5, h * 0.5);
  };

  onUpdate(fn: Updater) {
    this.updaters.push(fn);
  }

  start() {
    this.timer.connect(document);
    this.renderer.setAnimationLoop((now) => {
      this.timer.update(now);
      const dt = Math.min(this.timer.getDelta(), 1 / 20);
      this.time += dt;
      this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
      for (const u of this.updaters) u(dt, this.time);
      this.composer.render();
    });
  }
}
