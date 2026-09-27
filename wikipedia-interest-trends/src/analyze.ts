// Core analytics: turn a fetched Series into decision-ready metrics with a confidence rating.
import type {
  Comparison,
  Confidence,
  ResolvedArticle,
  SeriesAnalysis,
  Series,
} from "./types.ts";
import {
  aggregateToMonthly,
  monthOf,
  monthsBetween,
  type Window,
} from "./dates.ts";
import {
  centeredMovingMedian,
  coefficientOfVariation,
  linearRegression,
  mannKendall,
  mean,
  robustZScores,
  sensSlope,
  sum,
} from "./stats.ts";

const SPIKE_Z = 3.5; // robust z-score above which a month is treated as a one-off spike
const SEASONALITY_STRENGTH_THRESHOLD = 0.15; // CoV of monthly seasonal indices

export interface MonthlyAligned {
  dates: string[];
  values: number[];
  missing: number;
  firstObserved: string | null;
  lastObserved: string | null;
}

function expectedMonths(window: Window): string[] {
  const out: string[] = [];
  const [fy, fm] = window.from.split("-").map(Number);
  const total = monthsBetween(window.from, window.to);
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(fy!, fm! - 1 + i, 1));
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

/** Align a series to full months within the window; fill interior gaps with 0. */
export function alignMonthly(series: Series, window: Window): MonthlyAligned {
  const monthly = aggregateToMonthly(series.points);
  const byMonth = new Map(monthly.map((p) => [p.date.slice(0, 7), p.views]));
  const months = expectedMonths(window);
  const withData = months.filter((m) => byMonth.has(m));
  const firstObserved = withData[0] ?? null;
  const lastObserved = withData[withData.length - 1] ?? null;
  if (!firstObserved || !lastObserved) {
    return {
      dates: [],
      values: [],
      missing: 0,
      firstObserved: null,
      lastObserved: null,
    };
  }
  const active = months.filter((m) => m >= firstObserved && m <= lastObserved);
  let missing = 0;
  const values = active.map((m) => {
    if (!byMonth.has(m)) missing++;
    return byMonth.get(m) ?? 0;
  });
  return {
    dates: active.map((m) => `${m}-01`),
    values,
    missing,
    firstObserved,
    lastObserved,
  };
}

function volumeBucket(meanMonthly: number): SeriesAnalysis["volumeBucket"] {
  if (meanMonthly < 100) return "very-low";
  if (meanMonthly < 1000) return "low";
  if (meanMonthly < 10000) return "medium";
  return "high";
}

function computeGrowth(values: number[]) {
  const n = values.length;
  const k = Math.min(12, Math.floor(n / 2));
  if (k < 2) {
    return {
      recentMean: mean(values),
      previousMean: 0,
      periodOverPeriodPct: null,
      cagrPct: null,
      comparisonWindowMonths: 0,
    };
  }
  const recent = values.slice(n - k);
  const previous = values.slice(n - 2 * k, n - k);
  const recentMean = mean(recent);
  const previousMean = mean(previous);
  const periodOverPeriodPct =
    previousMean > 0
      ? ((recentMean - previousMean) / previousMean) * 100
      : null;

  // CAGR from smoothed endpoints (first/last up-to-3 months) to reduce edge noise.
  const head = mean(values.slice(0, Math.min(3, n)));
  const tail = mean(values.slice(Math.max(0, n - 3)));
  const years = n / 12;
  const cagrPct =
    head > 0 && years > 0 ? (Math.pow(tail / head, 1 / years) - 1) * 100 : null;

  return {
    recentMean,
    previousMean,
    periodOverPeriodPct,
    cagrPct,
    comparisonWindowMonths: k,
  };
}

function computeSeasonality(dates: string[], values: number[]) {
  if (values.length < 24) {
    return {
      detected: false,
      strength: 0,
      peakMonth: null,
      troughMonth: null,
      note: "needs >= 24 months",
    };
  }
  const overall = mean(values);
  if (overall === 0)
    return { detected: false, strength: 0, peakMonth: null, troughMonth: null };
  const byCalendarMonth = new Map<number, number[]>();
  for (let i = 0; i < values.length; i++) {
    const m = monthOf(dates[i]!);
    (byCalendarMonth.get(m) ?? byCalendarMonth.set(m, []).get(m)!).push(
      values[i]!,
    );
  }
  const indices: Array<{ month: number; index: number }> = [];
  for (const [m, vs] of byCalendarMonth)
    indices.push({ month: m, index: mean(vs) / overall });
  const idxValues = indices.map((x) => x.index);
  const strength = coefficientOfVariation(idxValues);
  let peak = indices[0]!;
  let trough = indices[0]!;
  for (const x of indices) {
    if (x.index > peak.index) peak = x;
    if (x.index < trough.index) trough = x;
  }
  return {
    detected: strength >= SEASONALITY_STRENGTH_THRESHOLD,
    strength,
    peakMonth: peak.month,
    troughMonth: trough.month,
  };
}

function computeSpikes(dates: string[], values: number[]) {
  const n = values.length;
  if (n < 4)
    return { spikeDates: [], spikeShareOfTotal: 0, growthRobustToSpikes: true };

  // Detrend against a centered moving median so a gradual trend or level shift is not counted as
  // many spikes; only points that jump above their LOCAL baseline are flagged.
  const baseline = centeredMovingMedian(values, 5);
  const residuals = values.map((v, i) => v - baseline[i]!);
  const z = robustZScores(residuals);
  const spikeIdx = z
    .map((v, i) => (v > SPIKE_Z ? i : -1))
    .filter((i) => i >= 0);
  const spikeDates = spikeIdx.map((i) => dates[i]!);

  const total = sum(values);
  const excess = spikeIdx.reduce(
    (a, i) => a + Math.max(0, values[i]! - baseline[i]!),
    0,
  );
  const spikeShareOfTotal = total > 0 ? excess / total : 0;

  // Robustness: replace spikes with their local baseline and re-test the trend.
  const cleaned = values.map((v, i) =>
    spikeIdx.includes(i) ? baseline[i]! : v,
  );
  const originalSign = Math.sign(sensSlope(values));
  const cleanedSign = Math.sign(sensSlope(cleaned));
  const originallySignificant = mannKendall(values).pValue < 0.05;
  const cleanedSignificant = mannKendall(cleaned).pValue < 0.05;
  const growthRobustToSpikes =
    originalSign === cleanedSign &&
    (originallySignificant ? cleanedSignificant : true);

  return { spikeDates, spikeShareOfTotal, growthRobustToSpikes };
}

const STANDARD_CAVEATS = [
  "Pageviews measure attention/curiosity, not willingness to pay.",
  "A Wikipedia language edition is not the same as a country or a market.",
];

export function analyzeSeries(
  series: Series,
  resolved: ResolvedArticle,
  window: Window,
): SeriesAnalysis {
  const aligned = alignMonthly(series, window);
  const { values, dates } = aligned;
  const base: Omit<
    SeriesAnalysis,
    "growth" | "trend" | "seasonality" | "spikes"
  > = {
    language: series.language,
    project: series.project,
    article: series.article,
    resolveMethod: resolved.method,
    resolveConfidence: resolved.confidence,
    granularity: series.granularity,
    monthsCovered: values.length,
    dataStart: aligned.firstObserved ? `${aligned.firstObserved}-01` : null,
    dataEnd: aligned.lastObserved ? `${aligned.lastObserved}-01` : null,
    totalViews: values.reduce((a, b) => a + b, 0),
    meanMonthly: mean(values),
    lastValue: values[values.length - 1] ?? 0,
    volumeBucket: volumeBucket(mean(values)),
    volatilityCoV: coefficientOfVariation(values),
    missingBuckets: aligned.missing,
    confidence: "low",
    confidenceReasons: [],
    caveats: [],
  };

  if (values.length === 0) {
    return {
      ...base,
      growth: {
        recentMean: 0,
        previousMean: 0,
        periodOverPeriodPct: null,
        cagrPct: null,
        comparisonWindowMonths: 0,
      },
      trend: {
        slope: 0,
        intercept: 0,
        r2: 0,
        mkS: 0,
        mkTau: 0,
        mkZ: 0,
        mkPValue: 1,
        sensSlope: 0,
        sensSlopeAnnualizedPct: 0,
        direction: "flat",
        significant: false,
      },
      seasonality: {
        detected: false,
        strength: 0,
        peakMonth: null,
        troughMonth: null,
        note: "no data",
      },
      spikes: {
        spikeDates: [],
        spikeShareOfTotal: 0,
        growthRobustToSpikes: true,
      },
      confidence: "low",
      confidenceReasons: ["no pageview data for this article in the window"],
      caveats: [
        `No data found for "${series.article}" in ${series.project}.`,
        ...STANDARD_CAVEATS,
      ],
    };
  }

  const reg = linearRegression(values);
  const mk = mannKendall(values);
  const sens = sensSlope(values);
  const meanMonthly = base.meanMonthly;
  const sensAnnualizedPct =
    meanMonthly > 0 ? ((sens * 12) / meanMonthly) * 100 : 0;
  const significant = mk.pValue < 0.05;
  const direction: SeriesAnalysis["trend"]["direction"] = significant
    ? mk.S > 0
      ? "increasing"
      : "decreasing"
    : "flat";

  const growth = computeGrowth(values);
  const seasonality = computeSeasonality(dates, values);
  const spikes = computeSpikes(dates, values);

  // --- Confidence rubric (see reference/metrics.md) ---
  let score = 0;
  const reasons: string[] = [];
  if (base.monthsCovered >= 24) score += 2;
  else if (base.monthsCovered >= 12) score += 1;
  else reasons.push(`short history (${base.monthsCovered} months)`);

  if (mk.pValue < 0.01) score += 2;
  else if (mk.pValue < 0.05) score += 1;
  else
    reasons.push(
      `trend not statistically significant (Mann-Kendall p=${mk.pValue.toFixed(2)})`,
    );

  if (base.volumeBucket === "high") score += 2;
  else if (base.volumeBucket === "medium") score += 1;
  else if (base.volumeBucket === "low")
    reasons.push("low pageview volume (noisy)");
  else {
    score -= 1;
    reasons.push("very low pageview volume");
  }

  if (spikes.growthRobustToSpikes) score += 1;
  else reasons.push("change is partly driven by one-off spikes");

  if (base.missingBuckets === 0) score += 1;
  else reasons.push(`${base.missingBuckets} missing month(s) in range`);

  if (resolved.confidence === "high") score += 1;
  else if (resolved.confidence === "medium")
    reasons.push("article match is uncertain");
  else {
    score -= 2;
    reasons.push("no reliable article match");
  }

  if (seasonality.detected && base.monthsCovered % 12 !== 0) {
    score -= 1;
    reasons.push("seasonal pattern may bias a non-annual window");
  }

  const confidence: Confidence =
    score >= 6 ? "high" : score >= 3 ? "medium" : "low";

  const caveats: string[] = [];
  if (base.volumeBucket === "very-low" || base.volumeBucket === "low") {
    caveats.push("Absolute interest is small; differences may be noise.");
  }
  if (seasonality.detected && seasonality.peakMonth) {
    caveats.push(
      `Interest is seasonal (peaks around month ${seasonality.peakMonth}).`,
    );
  }
  if (spikes.spikeDates.length > 0) {
    caveats.push(
      `${spikes.spikeDates.length} one-off spike(s) detected (e.g., ${spikes.spikeDates[0]}).`,
    );
  }
  caveats.push(
    `Only the exact article "${series.article}" is counted (redirects/related pages excluded).`,
  );
  caveats.push(...STANDARD_CAVEATS);

  return {
    ...base,
    confidence,
    confidenceReasons: reasons,
    caveats,
    growth,
    trend: {
      slope: reg.slope,
      intercept: reg.intercept,
      r2: reg.r2,
      mkS: mk.S,
      mkTau: mk.tau,
      mkZ: mk.z,
      mkPValue: mk.pValue,
      sensSlope: sens,
      sensSlopeAnnualizedPct: sensAnnualizedPct,
      direction,
      significant,
    },
    seasonality,
    spikes,
  };
}

function confRank(c: Confidence): number {
  return c === "high" ? 2 : c === "medium" ? 1 : 0;
}

export function buildComparison(results: SeriesAnalysis[]): Comparison {
  const ranked = [...results]
    .map((r) => ({
      language: r.language,
      periodOverPeriodPct: r.growth.periodOverPeriodPct,
      confidence: r.confidence,
    }))
    .sort((a, b) => {
      const av = a.periodOverPeriodPct ?? Number.NEGATIVE_INFINITY;
      const bv = b.periodOverPeriodPct ?? Number.NEGATIVE_INFINITY;
      return bv - av;
    });

  const withData = ranked.filter((r) => r.periodOverPeriodPct !== null);
  const noData = ranked
    .filter((r) => r.periodOverPeriodPct === null)
    .map((r) => r.language);
  const strongest = withData[0]?.language ?? null;
  const weakest = withData[withData.length - 1]?.language ?? null;

  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
  const notes: string[] = [];
  if (withData.length >= 1) {
    const top = withData[0]!;
    const v = top.periodOverPeriodPct!;
    notes.push(
      v > 0
        ? `Highest recent growth: ${top.language} (${fmt(v)}).`
        : `All measured languages declined; smallest decline: ${top.language} (${fmt(v)}).`,
    );
  }
  if (withData.length >= 2) {
    const bottom = withData[withData.length - 1]!;
    notes.push(
      `Weakest: ${bottom.language} (${fmt(bottom.periodOverPeriodPct!)}).`,
    );
  }
  if (noData.length > 0) notes.push(`No data for: ${noData.join(", ")}.`);
  if (new Set(withData.map((r) => r.confidence)).size > 1) {
    notes.push(
      "Compare with caution: data quality/confidence differs by language.",
    );
  }
  const trustworthy = withData.filter(
    (r) => confRank(r.confidence) >= 1 && (r.periodOverPeriodPct ?? -1) > 0,
  );
  if (trustworthy.length > 0 && trustworthy[0]!.language !== strongest) {
    notes.push(`Most trustworthy growth: ${trustworthy[0]!.language}.`);
  }

  return { rankedByGrowth: ranked, strongest, weakest, notes };
}
