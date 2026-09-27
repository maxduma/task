# Roadmap: evolving this skill for larger and more complex research

The current skill answers the core questions (is interest in a topic growing, across languages, and
how trustworthy is that) from live per-article pageviews with caching. This document sketches how to
grow it toward heavier research and larger data volumes, roughly in order of value/effort.

## Contents
- 1. Bigger data: from per-article REST to bulk datasets
- 2. Richer signals beyond pageviews
- 3. Smarter topic and title handling
- 4. Stronger statistics
- 5. Cross-market normalization
- 6. Performance and scale
- 7. Evaluation and quality
- 8. Packaging and UX

## 1. Bigger data: from per-article REST to bulk datasets
- The per-article endpoint is ideal for a handful of titles. For hundreds/thousands of pages or
  whole categories, switch to the **pageview complete dumps** and **clickstream** dumps
  (`dumps.wikimedia.org`) and load them into a local **DuckDB**/SQLite store.
- Keep the same analysis layer; add a data-source adapter so `fetch` can read from the local store
  or the API transparently. Cache becomes a real database with incremental monthly refresh.

## 2. Richer signals beyond pageviews
- **Unique devices** (per project) and **aggregate project views** to sanity-check per-article
  trends against the platform baseline (is the topic growing faster than Wikipedia overall?).
- **Per-country pageviews** (`top-by-country`, country-split where available) to separate a market
  from a language edition.
- **Edits / editors / bytes-changed** as a supply-side signal of topic momentum.
- Corroborate with external series (search-trend exports, app-store categories) where licensing
  allows, clearly labeled as separate sources.

## 3. Smarter topic and title handling
- **Redirect aggregation**: sum the resolved title plus its redirects (MediaWiki `list=backlinks` /
  `redirects`) to capture true interest in a concept.
- **Topic baskets**: expand a topic to a set of related articles via Wikidata (`P279`/`P31`,
  categories) and analyze the basket, not a single page.
- **Disambiguation guards**: detect disambiguation pages and prompt for the intended sense.

## 4. Stronger statistics
- **STL decomposition** to separate trend/seasonal/residual instead of the current seasonal index.
- **Changepoint detection** (e.g. PELT/binary segmentation) to date regime shifts (a launch, a news
  event) rather than only flagging spikes.
- **Forecasting with uncertainty** (e.g. exponential smoothing / structural time series) to project
  the next few months with intervals.
- **Causal-ish impact** (Bayesian structural time series) to estimate the lift from a known event
  against a synthetic control built from comparison articles.

## 5. Cross-market normalization
- Normalize per-article views by project size (unique devices or total project views) and by
  population / internet penetration, so language markets can be compared on a fairer footing.
- Add a "reachable audience" estimate combining interest with market-size priors.

## 6. Performance and scale
- Batch and parallelize fetches with a concurrency limit and shared rate-limit budget.
- Incremental cache refresh (only fetch the newest complete month) and a manifest of cached ranges.
- Precompute common windows (12/24/36 months) for a saved set of topics/languages.

## 7. Evaluation and quality
- Grow `evaluations/eval.json` into a scored suite (correct titles resolved, correct trend sign,
  presence of caveats, one-page PDF produced) and run it across Haiku/Sonnet/Opus.
- Add golden-file tests for the metrics on recorded fixtures so results stay deterministic.

## 8. Packaging and UX
- Config defaults (default languages, window, report language) via a small config file.
- Optional HTML/Markdown report alongside the PDF for inline agent follow-ups.
- Publish as an installable skill (copy into `.claude/skills/`), with `npm ci` pinned by the
  committed lockfile for reproducibility.
