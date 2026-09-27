import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mean,
  median,
  std,
  mad,
  linearRegression,
  mannKendall,
  sensSlope,
  movingAverage,
  centeredMovingMedian,
  robustZScores,
  normalCdf,
} from "./stats.ts";

test("mean/median/std basics", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Math.abs(std([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
  assert.equal(mean([]), 0);
});

test("linearRegression recovers a known line", () => {
  // y = 3x + 5
  const ys = [5, 8, 11, 14, 17];
  const r = linearRegression(ys);
  assert.ok(Math.abs(r.slope - 3) < 1e-9);
  assert.ok(Math.abs(r.intercept - 5) < 1e-9);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
});

test("normalCdf is calibrated", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 2e-3);
});

test("mannKendall detects a clear increasing trend", () => {
  const ys = Array.from({ length: 24 }, (_, i) => i + 1);
  const mk = mannKendall(ys);
  assert.ok(mk.S > 0);
  assert.ok(mk.tau > 0.9);
  assert.ok(mk.pValue < 0.01);
});

test("mannKendall reports no significant trend for flat noise", () => {
  const ys = [5, 4, 6, 5, 5, 4, 6, 5, 5, 6, 4, 5];
  const mk = mannKendall(ys);
  assert.ok(mk.pValue > 0.05);
});

test("sensSlope is robust to a single outlier", () => {
  const clean = [1, 2, 3, 4, 5, 6, 7, 8];
  const withSpike = [1, 2, 3, 4, 5, 6, 7, 1000];
  assert.ok(Math.abs(sensSlope(clean) - 1) < 1e-9);
  // Median pairwise slope stays near 1 despite the spike.
  assert.ok(Math.abs(sensSlope(withSpike) - 1) < 0.5);
});

test("movingAverage smooths", () => {
  const ma = movingAverage([1, 2, 3, 4, 5], 2);
  assert.deepEqual(ma, [1, 1.5, 2.5, 3.5, 4.5]);
});

test("robustZScores flags a spike", () => {
  const xs = [10, 11, 9, 10, 100, 10, 9, 11];
  const z = robustZScores(xs);
  assert.ok(z[4]! > 3.5);
  assert.ok(Math.abs(z[0]!) < 3.5);
});

test("mad of constant data is 0", () => {
  assert.equal(mad([7, 7, 7, 7]), 0);
});

test("centeredMovingMedian smooths a level shift without creating spikes", () => {
  const values = [100, 100, 100, 100, 10, 10, 10, 10];
  const baseline = centeredMovingMedian(values, 5);
  const residuals = values.map((v, i) => v - baseline[i]!);
  const z = robustZScores(residuals);
  assert.ok(z.every((v) => v <= 3.5));
});

test("centeredMovingMedian keeps a genuine one-off spike detectable", () => {
  const values = [10, 11, 9, 10, 200, 10, 9, 11, 10];
  const baseline = centeredMovingMedian(values, 5);
  const residuals = values.map((v, i) => v - baseline[i]!);
  const z = robustZScores(residuals);
  assert.ok(z[4]! > 3.5);
});
