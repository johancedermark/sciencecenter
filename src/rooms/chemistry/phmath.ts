/**
 * Acid/base math for the pH station.
 * Titration: 50 mL of diluted vinegar (0.10 M acetic acid, pKa 4.76) + 1.0 M baking-soda solution (NaHCO₃).
 *   CH₃COOH + HCO₃⁻ → CH₃COO⁻ + H₂O + CO₂↑
 * Simplifications: 25 °C, ideal solution (activities = concentrations), and all CO₂ from the reaction bubbles out;
 * only the bicarbonate added after the equivalence point stays as dissolved carbonate (pKa₁ 6.35, pKa₂ 10.33).
 * The pH is found from the charge balance  [Na⁺] + [H⁺] = [CH₃COO⁻] + [HCO₃⁻] + 2[CO₃²⁻] + [OH⁻]  by bisection.
 */
export const ACID_ML = 50;
export const ACID_M = 0.1;
export const BASE_M = 1.0;
export const EQUIV_ML = (ACID_ML * ACID_M) / BASE_M; // 5.0 mL

const KA = 10 ** -4.76;
const K1 = 10 ** -6.35;
const K2 = 10 ** -10.33;
const KW = 1e-14;

export function titrationPH(baseML: number): number {
  const V = (ACID_ML + baseML) / 1000;
  const nA = (ACID_ML / 1000) * ACID_M;
  const nB = (baseML / 1000) * BASE_M;
  const Na = nB / V;
  const AcT = nA / V;
  const Ct = Math.max(0, nB - nA) / V;
  const f = (pH: number) => {
    const h = 10 ** -pH;
    const ac = (AcT * KA) / (KA + h);
    const D = h * h + h * K1 + K1 * K2;
    const hco3 = (Ct * h * K1) / D;
    const co3 = (Ct * K1 * K2) / D;
    return Na + h - ac - hco3 - 2 * co3 - KW / h;
  };
  let lo = 0, hi = 14;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** CO₂ released (mmol) after adding `baseML`: one CO₂ per bicarbonate that met an acid molecule. */
export function co2mmol(baseML: number) {
  return Math.min(baseML * BASE_M, ACID_ML * ACID_M);
}
