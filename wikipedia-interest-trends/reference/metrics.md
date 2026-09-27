# Metrics and confidence rubric

How each number in the analysis is defined. All metrics are computed on the **monthly** series
(daily input is summed into months). Code lives in `src/stats.ts` and `src/analyze.ts`.

## Contents

- Series preparation
- Volume and volatility
- Growth (period-over-period, CAGR)
- Trend (linear regression, Mann-Kendall, Sen's slope)
- Seasonality
- Spikes and robustness
- Confidence rubric

## Series preparation

- Fetch per-article pageviews, aggregate to monthly buckets.
- Align to the window; the active range runs from the first to the last month with data. Interior
  months with no data are filled with 0 and counted as `missingBuckets`.
- Months before the article existed are not counted as missing.

## Volume and volatility

- `meanMonthly` — average monthly pageviews over the active range.
- `volumeBucket` — `very-low` (<100), `low` (<1000), `medium` (<10000), `high` (>=10000). Lower
  volume means noisier estimates and lower confidence.
- `volatilityCoV` — coefficient of variation (std / mean) of monthly views.

## Growth

- `periodOverPeriodPct` — compares the mean of the last `k` months to the mean of the preceding `k`
  months, where `k = min(12, floor(monthsCovered / 2))`. Percent change `(recent - prev) / prev`.
- `cagrPct` — compound annual growth rate from a smoothed start (mean of first up-to-3 months) to a
  smoothed end (mean of last 3 months) over `monthsCovered / 12` years. Null if the start is 0.
- Growth is descriptive; direction/strength significance comes from the trend tests below.

## Trend

- **Linear regression** (`slope`, `r2`) of views on the month index. Simple, but sensitive to
  outliers — reported for context, not as the significance test.
- **Mann-Kendall** (`mkTau`, `mkPValue`) — non-parametric trend test (no normality assumption,
  robust to outliers). `mkPValue < 0.05` ⇒ a statistically clear monotonic trend. This is the
  primary significance signal.
- **Sen's slope** (`sensSlope`, `sensSlopeAnnualizedPct`) — robust median of pairwise slopes;
  annualized relative to the mean. A trustworthy magnitude estimate for the trend.
- `direction` — `increasing`/`decreasing` when Mann-Kendall is significant, else `flat`.

## Seasonality

- Requires >= 24 months. Builds a seasonal index per calendar month (month mean / overall mean).
- `strength` — coefficient of variation of the 12 indices. `detected` when `strength >= 0.15`.
- `peakMonth` / `troughMonth` — calendar months (1-12) of highest/lowest average interest.
- If seasonality is present and the window is not a whole number of years, growth can be biased by
  which months fall in each half — flagged in confidence reasons.

## Spikes and robustness

- The series is detrended against a centered moving median (window 5) so a gradual trend or level
  shift is **not** mistaken for many spikes.
- A month is a `spike` when the robust z-score of its residual exceeds 3.5.
- `spikeShareOfTotal` — share of total views coming from spike excess above the local baseline.
- `growthRobustToSpikes` — replace spikes with their local baseline and re-test: does the trend keep
  the same direction (and stay significant if it was)? If not, the change is spike-driven.

## Confidence rubric

A transparent additive score → label. Positive factors raise it; weaknesses are listed in
`confidenceReasons` even when overall confidence is high.

| Factor                                  | Points |
| --------------------------------------- | ------ |
| History >= 24 months                    | +2     |
| History 12–23 months                    | +1     |
| Mann-Kendall p < 0.01                   | +2     |
| Mann-Kendall p < 0.05                   | +1     |
| Volume high                             | +2     |
| Volume medium                           | +1     |
| Volume very-low                         | −1     |
| Growth robust to spikes                 | +1     |
| No missing months                       | +1     |
| Article match high (Wikidata/override)  | +1     |
| Article match none                      | −2     |
| Seasonal pattern on a non-annual window | −1     |

Label: **high** if score >= 6, **medium** if 3–5, else **low**.

Confidence expresses trust in the **direction** of the conclusion. Even at high confidence, always
surface the listed caveats (low volume, seasonality, spikes, uncertain match) so magnitude is not
over-read.
