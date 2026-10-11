/** Emission spectra for the flame-test station, and a spectroscope-style renderer. */
import { fmt } from './common';

/** [wavelength nm, relative intensity, band half-width nm (0 = sharp atomic line)] */
export type Line = [number, number, number];

export const LAMBDA_MIN = 380;
export const LAMBDA_MAX = 750;
/** The drawn axis continues a little into the near infrared so potassium's lines are visible as "off the colour scale". */
export const LAMBDA_AXIS_MAX = 780;

/** The bare Bunsen flame: CH at 431 nm and the C₂ Swan bands give its faint blue-green glow. */
export const BURNER_LINES: Line[] = [
  [431.4, 0.5, 1.5], [473.7, 0.3, 2], [516.5, 0.5, 2], [563.5, 0.2, 2],
];

/** Wavelength (nm) → sRGB 0..1, after Dan Bruton's approximation, with intensity fall-off at the edges of vision. */
export function wavelengthToRgb(l: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = -(l - 440) / 60; b = 1; }
  else if (l < 490) { g = (l - 440) / 50; b = 1; }
  else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; }
  else if (l < 645) { r = 1; g = -(l - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (l < 420) f = 0.3 + (0.7 * (l - 380)) / 40;
  else if (l > 700) f = 0.3 + (0.7 * (780 - l)) / 80;
  f = Math.max(0, Math.min(1, f));
  return [Math.max(0, r) * f, Math.max(0, g) * f, Math.max(0, b) * f];
}

/**
 * Draws what you see in a spectroscope: a black field with bright coloured lines/bands at their wavelengths,
 * plus a scale in nm. `gain` scales the salt lines (they fade as the salt burns off).
 */
export function drawSpectrum(
  g: CanvasRenderingContext2D, W: number, H: number,
  lines: Line[], gain: number, burnerGain: number, opts: { scale?: number; labels?: boolean; irLabel?: string } = {},
) {
  const s = opts.scale ?? 1;
  const axisH = 22 * s;
  const top = 4 * s;
  const fieldH = H - axisH - top;
  const x0 = 8 * s;
  const x1 = W - 8 * s;
  const X = (l: number) => x0 + ((l - LAMBDA_MIN) / (LAMBDA_AXIS_MAX - LAMBDA_MIN)) * (x1 - x0);
  g.save();
  g.fillStyle = '#07080c';
  g.fillRect(0, 0, W, H);
  // faint rainbow strip under the field, so the scale reads as colours
  for (let l = LAMBDA_MIN; l < LAMBDA_MAX; l += 2) {
    const [r, gg, b] = wavelengthToRgb(l);
    g.fillStyle = `rgba(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0},0.16)`;
    g.fillRect(X(l), top + fieldH - 5 * s, X(l + 2) - X(l) + 0.5, 5 * s);
  }
  // near-IR zone
  g.fillStyle = 'rgba(120,120,140,0.12)';
  g.fillRect(X(LAMBDA_MAX), top, X(LAMBDA_AXIS_MAX) - X(LAMBDA_MAX), fieldH);
  g.globalCompositeOperation = 'lighter';
  const drawSet = (set: Line[], k: number) => {
    if (k <= 0.004) return;
    for (const [l, I, w] of set) {
      const ir = l > LAMBDA_MAX;
      const [r, gg, b] = ir ? [0.55, 0.12, 0.12] : wavelengthToRgb(l);
      const a = Math.min(1, I * k);
      const col = (alpha: number) => `rgba(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0},${alpha})`;
      if (w > 0) {
        // molecular band: soft gaussian-ish bump
        const half = (X(l + w * 2.2) - X(l)) | 0;
        const grad = g.createLinearGradient(X(l) - half, 0, X(l) + half, 0);
        grad.addColorStop(0, col(0));
        grad.addColorStop(0.5, col(a * 0.85));
        grad.addColorStop(1, col(0));
        g.fillStyle = grad;
        g.fillRect(X(l) - half, top, half * 2, fieldH);
      } else {
        const x = X(l);
        g.fillStyle = col(a * 0.35);
        g.fillRect(x - 3 * s, top, 6 * s, fieldH);
        g.fillStyle = col(a);
        g.fillRect(x - 1 * s, top, 2 * s, fieldH);
        if (a > 0.6) {
          g.fillStyle = `rgba(255,255,255,${(a - 0.6) * 0.8})`;
          g.fillRect(x - 0.5 * s, top, 1 * s, fieldH);
        }
      }
    }
  };
  drawSet(BURNER_LINES, burnerGain);
  drawSet(lines, gain);
  g.globalCompositeOperation = 'source-over';
  // axis
  g.fillStyle = '#c9c2b4';
  g.strokeStyle = 'rgba(220,210,190,0.6)';
  g.lineWidth = 1;
  g.font = `${Math.round(10 * s)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let l = 400; l <= LAMBDA_AXIS_MAX; l += 50) {
    const x = X(l);
    g.beginPath();
    g.moveTo(x, top + fieldH);
    g.lineTo(x, top + fieldH + 5 * s);
    g.stroke();
    if (l <= 750) g.fillText(String(l), x, top + fieldH + 7 * s);
  }
  for (let l = 380; l <= LAMBDA_AXIS_MAX; l += 10) {
    const x = X(l);
    g.beginPath();
    g.moveTo(x, top + fieldH);
    g.lineTo(x, top + fieldH + 2.5 * s);
    g.stroke();
  }
  g.textAlign = 'right';
  g.fillText('nm', x1, top + fieldH + 7 * s);
  if (opts.irLabel) {
    g.save();
    g.fillStyle = 'rgba(200,190,210,0.7)';
    g.font = `${Math.round(9 * s)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(opts.irLabel, (X(LAMBDA_MAX) + X(LAMBDA_AXIS_MAX)) / 2, top + 2 * s);
    g.restore();
  }
  if (opts.labels && gain > 0.2) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `${Math.round(9 * s)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    let lastX = -1e9;
    const sorted = lines.filter((l) => l[2] === 0 && l[1] >= 0.3).sort((a, b) => a[0] - b[0]);
    for (const [l] of sorted) {
      const x = Math.min(X(l), x1 - 12 * s);
      if (x - lastX < 30 * s) continue;
      lastX = x;
      g.fillText(fmt(l, 1), x, top + fieldH * 0.08 + 10 * s);
    }
  }
  g.restore();
  return X;
}
