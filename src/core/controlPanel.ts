/**
 * Builds HUD controls for a focused station. Rebuilt from scratch on focus and on language change,
 * so stations should keep their state in the station, not in the controls.
 */
import { t } from './i18n';
import type { L10n } from './types';
import type { Sfx } from './sfx';

export interface Readout {
  set(value: string): void;
  el: HTMLElement;
}

export interface Meter {
  /** 0..1 */
  set(fraction: number, label?: string): void;
}

export class ControlPanel {
  constructor(readonly root: HTMLElement, private sfx: Sfx) {}

  private row(cls = 'cp-row') {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  heading(text: L10n) {
    const h = document.createElement('h4');
    h.className = 'cp-heading';
    h.textContent = t(text);
    this.root.appendChild(h);
  }

  note(text: L10n): HTMLElement {
    const p = document.createElement('p');
    p.className = 'cp-note';
    p.textContent = t(text);
    this.root.appendChild(p);
    return p;
  }

  button(label: L10n, onClick: () => void, opts: { primary?: boolean; icon?: string } = {}): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'cp-btn' + (opts.primary ? ' primary' : '');
    b.textContent = (opts.icon ? opts.icon + ' ' : '') + t(label);
    b.addEventListener('click', () => {
      this.sfx.click();
      onClick();
    });
    this.row('cp-row cp-inline').appendChild(b);
    return b;
  }

  /** Several buttons in one row; returns a function to mark one as active. */
  buttons(items: { label: L10n; icon?: string; onClick: () => void }[], activeIndex = -1): (i: number) => void {
    const r = this.row('cp-row cp-inline');
    const els = items.map((it, i) => {
      const b = document.createElement('button');
      b.className = 'cp-btn';
      b.textContent = (it.icon ? it.icon + ' ' : '') + t(it.label);
      b.addEventListener('click', () => {
        this.sfx.click();
        setActive(i);
        it.onClick();
      });
      r.appendChild(b);
      return b;
    });
    const setActive = (i: number) => els.forEach((b, j) => b.classList.toggle('active', i === j));
    setActive(activeIndex);
    return setActive;
  }

  slider(
    label: L10n,
    o: { min: number; max: number; step?: number; value: number; format?: (v: number) => string },
    onChange: (v: number) => void,
  ): HTMLInputElement {
    const r = this.row();
    const top = document.createElement('div');
    top.className = 'cp-label';
    const name = document.createElement('span');
    name.textContent = t(label);
    const val = document.createElement('span');
    val.className = 'cp-value';
    top.append(name, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(o.min);
    input.max = String(o.max);
    input.step = String(o.step ?? (o.max - o.min) / 100);
    input.value = String(o.value);
    const fmt = o.format ?? ((v: number) => String(v));
    val.textContent = fmt(o.value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      onChange(v);
    });
    r.append(top, input);
    return input;
  }

  toggle(label: L10n, value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
    const r = this.row('cp-row cp-toggle');
    const lab = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => {
      this.sfx.click();
      onChange(input.checked);
    });
    const span = document.createElement('span');
    span.textContent = t(label);
    lab.append(input, span);
    r.appendChild(lab);
    return input;
  }

  readout(label: L10n, initial = '–'): Readout {
    const r = this.row('cp-row cp-readout');
    const name = document.createElement('span');
    name.textContent = t(label);
    const v = document.createElement('strong');
    v.textContent = initial;
    r.append(name, v);
    return { el: v, set: (s) => { if (v.textContent !== s) v.textContent = s; } };
  }

  meter(label: L10n, color = '#5ee6d6'): Meter {
    const r = this.row();
    const top = document.createElement('div');
    top.className = 'cp-label';
    const name = document.createElement('span');
    name.textContent = t(label);
    const val = document.createElement('span');
    val.className = 'cp-value';
    top.append(name, val);
    const bar = document.createElement('div');
    bar.className = 'cp-meter';
    const fill = document.createElement('div');
    fill.style.background = color;
    bar.appendChild(fill);
    r.append(top, bar);
    return {
      set: (f, l) => {
        fill.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
        if (l !== undefined) val.textContent = l;
      },
    };
  }

  /** A canvas for small graphs (oscilloscope, spectra). Size in CSS pixels; the canvas is DPR-scaled. */
  canvas(height = 120): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } {
    const r = this.row();
    const c = document.createElement('canvas');
    c.className = 'cp-canvas';
    r.appendChild(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(200, this.root.clientWidth - 4 || 300);
    c.style.height = `${height}px`;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    return { canvas: c, ctx, width, height };
  }
}
