// Hand-rolled statistics used across the skill. No external dependencies so results are
// deterministic and easy to unit-test. All functions tolerate short/empty inputs.

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : sum(xs) / xs.length;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Sample standard deviation (n-1). Returns 0 for fewer than 2 points. */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

/** Coefficient of variation (std / mean). 0 when mean is 0. */
export function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  return m === 0 ? 0 : std(xs) / m;
}

/** Median absolute deviation, scaled to be a consistent estimator of std for normal data. */
export function mad(xs: number[]): number {
  if (xs.length === 0) return 0;
  const med = median(xs);
  const deviations = xs.map((x) => Math.abs(x - med));
  return 1.4826 * median(deviations);
}

export interface Regression {
  slope: number;
  intercept: number;
  r2: number;
}

/** Ordinary least squares of ys against their index 0..n-1. */
export function linearRegression(ys: number[]): Regression {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? ys[0]! : 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

/** Abramowitz & Stegun 7.1.26 approximation of the error function. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export interface MannKendall {
  S: number;
  tau: number;
  z: number;
  pValue: number;
}

/**
 * Mann-Kendall trend test with tie correction and continuity-corrected normal approximation.
 * Non-parametric: no normality assumption, robust to outliers. Two-sided p-value.
 */
export function mannKendall(ys: number[]): MannKendall {
  const n = ys.length;
  if (n < 3) return { S: 0, tau: 0, z: 0, pValue: 1 };

  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      S += Math.sign(ys[j]! - ys[i]!);
    }
  }

  // Tie groups for variance correction.
  const counts = new Map<number, number>();
  for (const y of ys) counts.set(y, (counts.get(y) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) {
    if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  }

  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  let z = 0;
  if (varS > 0) {
    if (S > 0) z = (S - 1) / Math.sqrt(varS);
    else if (S < 0) z = (S + 1) / Math.sqrt(varS);
  }
  const tau = S / (0.5 * n * (n - 1));
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { S, tau, z, pValue: Math.min(1, Math.max(0, pValue)) };
}

/** Sen's slope: median of pairwise slopes (ys per unit index). Robust to outliers. */
export function sensSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      slopes.push((ys[j]! - ys[i]!) / (j - i));
    }
  }
  return median(slopes);
}

/** Trailing moving average of the given window size. Output length equals input length; the first
 * (window-1) entries average whatever is available so far. */
export function movingAverage(ys: number[], window: number): number[] {
  if (window <= 1) return [...ys];
  const out: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const start = Math.max(0, i - window + 1);
    out.push(mean(ys.slice(start, i + 1)));
  }
  return out;
}

/** Centered moving median: a robust local baseline used to detrend before spike detection so a
 * gradual trend or level shift is not mistaken for many one-off spikes. */
export function centeredMovingMedian(ys: number[], window: number): number[] {
  if (window <= 1) return [...ys];
  const half = Math.floor(window / 2);
  return ys.map((_, i) =>
    median(ys.slice(Math.max(0, i - half), Math.min(ys.length, i + half + 1))),
  );
}

/** Robust z-scores using median and MAD. Flags spikes without being skewed by them. */
export function robustZScores(xs: number[]): number[] {
  const med = median(xs);
  const scale = mad(xs);
  if (scale === 0) return xs.map(() => 0);
  return xs.map((x) => (x - med) / scale);
}
