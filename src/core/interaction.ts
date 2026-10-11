/**
 * Pointer interaction with 3D objects: hover, click, drag.
 * Pointer-down on a registered object with drag handlers captures the drag;
 * otherwise the drag goes to camera look (handled by the player).
 */
import * as THREE from 'three';
import type { L10n } from './types';

export interface PointerInfo {
  ray: THREE.Ray;
  /** Intersection with the registered object (for drag events: the hit at drag start, then refreshed if still over it). */
  hit?: THREE.Intersection;
  clientX: number;
  clientY: number;
  /** Pixel delta since the previous drag event. */
  dx: number;
  dy: number;
  /** Total pixel delta since drag start. */
  totalX: number;
  totalY: number;
  /** Intersect the current pointer ray with a plane (world space). */
  onPlane(plane: THREE.Plane): THREE.Vector3 | null;
}

export interface Interactive {
  onHover?(on: boolean): void;
  onClick?(info: PointerInfo): void;
  onDragStart?(info: PointerInfo): void;
  onDrag?(info: PointerInfo): void;
  onDragEnd?(info: PointerInfo): void;
  /** CSS cursor while hovering. Default: pointer (or grab if draggable). */
  cursor?: string;
  /** Small tooltip shown while hovering. */
  label?: L10n;
  /** Max distance from the camera (m). Default 9. */
  range?: number;
  enabled?: () => boolean;
}

interface Entry {
  object: THREE.Object3D;
  h: Interactive;
}

export class Interaction {
  private entries = new Map<THREE.Object3D, Entry>();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hovered: Entry | null = null;
  private dragging: Entry | null = null;
  private downAt: { x: number; y: number; entry: Entry | null; startedDrag: boolean } | null = null;
  private last = { x: 0, y: 0 };
  private dragStartHit?: THREE.Intersection;
  /** Called when the pointer is pressed and released without hitting an interactive (e.g. walk-to). */
  onEmptyClick: ((info: PointerInfo, worldHit?: THREE.Intersection) => void) | null = null;
  /** Called on hover change, for tooltip display. */
  onHoverLabel: ((label: L10n | null, x: number, y: number) => void) | null = null;
  /** Objects used only for empty-click raycasts (floors). */
  readonly walkables: THREE.Object3D[] = [];
  enabled = true;

  constructor(private camera: THREE.Camera, private dom: HTMLElement) {
    dom.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
  }

  add(object: THREE.Object3D, h: Interactive): () => void {
    const e = { object, h };
    this.entries.set(object, e);
    return () => {
      this.entries.delete(object);
      if (this.hovered === e) this.setHover(null, 0, 0);
    };
  }

  /** True while an interactive object owns the pointer (the camera should not look around). */
  get capturing() {
    return !!this.dragging || !!this.downAt?.entry;
  }

  private setRay(x: number, y: number) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private pick(x: number, y: number): { entry: Entry; hit: THREE.Intersection } | null {
    this.setRay(x, y);
    const objs: THREE.Object3D[] = [];
    for (const e of this.entries.values()) {
      if (!isVisible(e.object)) continue;
      if (e.h.enabled && !e.h.enabled()) continue;
      objs.push(e.object);
    }
    if (!objs.length) return null;
    const hits = this.raycaster.intersectObjects(objs, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const e = this.entries.get(o);
        if (e) {
          if (hit.distance > (e.h.range ?? 9)) return null;
          return { entry: e, hit };
        }
        o = o.parent;
      }
    }
    return null;
  }

  private info(x: number, y: number, hit?: THREE.Intersection): PointerInfo {
    const ray = this.raycaster.ray.clone();
    return {
      ray,
      hit,
      clientX: x,
      clientY: y,
      dx: x - this.last.x,
      dy: y - this.last.y,
      totalX: this.downAt ? x - this.downAt.x : 0,
      totalY: this.downAt ? y - this.downAt.y : 0,
      onPlane: (plane) => ray.intersectPlane(plane, new THREE.Vector3()),
    };
  }

  private setHover(e: Entry | null, x: number, y: number) {
    if (this.hovered === e) {
      if (e?.h.label) this.onHoverLabel?.(e.h.label, x, y);
      return;
    }
    this.hovered?.h.onHover?.(false);
    this.hovered = e;
    e?.h.onHover?.(true);
    const draggable = e && (e.h.onDrag || e.h.onDragStart);
    this.dom.style.cursor = e ? e.h.cursor ?? (draggable ? 'grab' : 'pointer') : '';
    this.onHoverLabel?.(e?.h.label ?? null, x, y);
  }

  private down = (ev: PointerEvent) => {
    if (!this.enabled || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const p = this.pick(ev.clientX, ev.clientY);
    this.last = { x: ev.clientX, y: ev.clientY };
    this.downAt = { x: ev.clientX, y: ev.clientY, entry: p?.entry ?? null, startedDrag: false };
    this.dragStartHit = p?.hit;
    if (p && (p.entry.h.onDrag || p.entry.h.onDragStart)) {
      // Start drag immediately so knobs/cranks respond without a dead zone.
      this.dragging = p.entry;
      this.downAt.startedDrag = true;
      this.dom.style.cursor = 'grabbing';
      p.entry.h.onDragStart?.(this.info(ev.clientX, ev.clientY, p.hit));
    }
  };

  private move = (ev: PointerEvent) => {
    if (!this.enabled) return;
    if (this.dragging) {
      this.setRay(ev.clientX, ev.clientY);
      const info = this.info(ev.clientX, ev.clientY, this.dragStartHit);
      this.dragging.h.onDrag?.(info);
      this.last = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (ev.pointerType === 'mouse' && !this.downAt) {
      const p = this.pick(ev.clientX, ev.clientY);
      this.setHover(p?.entry ?? null, ev.clientX, ev.clientY);
    }
    this.last = { x: ev.clientX, y: ev.clientY };
  };

  private up = (ev: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    if (!d) return;
    const moved = Math.hypot(ev.clientX - d.x, ev.clientY - d.y);
    if (this.dragging) {
      const e = this.dragging;
      this.dragging = null;
      this.setRay(ev.clientX, ev.clientY);
      const info = this.info(ev.clientX, ev.clientY, this.dragStartHit);
      e.h.onDragEnd?.(info);
      if (moved < 6) e.h.onClick?.(info);
      this.dom.style.cursor = e.h.cursor ?? 'grab';
      return;
    }
    if (moved > 6) return; // that was a camera look drag
    if (d.entry) {
      const p = this.pick(ev.clientX, ev.clientY);
      if (p?.entry === d.entry) d.entry.h.onClick?.(this.info(ev.clientX, ev.clientY, p.hit));
      return;
    }
    if (ev.target !== this.dom) return;
    this.setRay(ev.clientX, ev.clientY);
    const hits = this.raycaster.intersectObjects(this.walkables.filter(isVisible), false);
    this.onEmptyClick?.(this.info(ev.clientX, ev.clientY), hits[0]);
  };
}

function isVisible(o: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}
