---
name: wikipedia-interest-trends
description: Analyzes Wikipedia pageview trends across languages to decide which topics to build and which language markets to launch a B2C product in. Produces trend and growth metrics with a confidence rating, comparison charts (PNG), and a shareable one-page PDF report grounded in data with explicit assumptions. Use when the user asks whether interest or demand for a topic is growing and how trustworthy that growth is, wants to compare topics or language editions of Wikipedia, evaluate a localization or new-course idea, or needs a data-backed topic/market recommendation from Wikipedia pageviews.
---

# Wikipedia Interest Trends

Turn Wikipedia pageview statistics into topic- and language-market decisions. All heavy work
(fetching, math, charts, PDF) is done by the bundled TypeScript CLI, which prints a compact JSON
summary and writes artifacts to disk. Do not re-implement the analysis in the model — call the CLI.

## When to use

- "Is interest in <topic> growing in <language> Wikipedia, and can we trust it?"
- "Compare interest in <topic> across <languages>."
- "We are choosing a language to launch / a course to add — what does the data say?"

## Setup (run once, in this skill directory)

```bash
npm ci || npm install
```

Requires Node >= 18 and internet access to the Wikimedia API. Fonts for Cyrillic/diacritics are
bundled in `assets/fonts/`. Nothing else to configure.

## Primary command: run the full pipeline

Resolve article titles → fetch pageviews (cached) → analyze → build charts + one-page PDF.

```bash
npm run cli -- run \
  --topic "Intermittent fasting" \
  --languages uk,pl,cs \
  --window 24 \
  --report-lang uk
```

It prints a compact JSON object (resolved titles, per-language metrics, comparison, artifact paths,
caveats) and writes to `out/`: `<name>.pdf`, `<name>.png` (comparison chart), and
`<name>.analysis.json` (full data, reusable by the `report` command).

Read the JSON, then write the user a short data-grounded answer. Base every claim on the returned
metrics, name the exact article titles used, and surface the `caveats` and confidence rating.

## Workflow checklist

Copy and track:

```
- [ ] 1. Run `resolve` (or `run`) and confirm the resolved article titles match the intended topic
- [ ] 2. If a title is wrong/ambiguous, re-run with --title <lang>=<Exact_Title> overrides
- [ ] 3. Run `run` to get metrics + artifacts
- [ ] 4. Read metrics: growth, trend (Mann-Kendall p), spike share, seasonality, confidence
- [ ] 5. Answer using the data; state assumptions/limits and the confidence rating; cite titles
- [ ] 6. For follow-ups, reuse the cache (fast) and, to only change the report, run `report` on the saved analysis JSON
```

## Commands

Run any command with `npm run cli -- <command> --help` for full options.

- `run` — full pipeline (topic + languages → metrics + PDF/PNG). Main entry point.
- `resolve` — topic + languages → exact article titles with a match confidence and warnings. Use to verify titles before analyzing, or when the user's topic is ambiguous.
- `fetch` — raw pageviews for one `--project`/`--article` (debugging or a single series).
- `analyze` — like `run` but no report; prints metrics JSON only (fast iteration).
- `report` — build PDF/PNG from a saved `--data <name>.analysis.json` (change `--report-lang` or title without refetching).

Key `run`/`analyze` options: `--topic`, `--languages uk,pl,cs`, `--window 24` (months) or
`--from 2023-01 --to 2025-08`, `--granularity monthly|daily`, `--access all-access`,
`--agent user`, `--title <lang>=<Title>` (repeatable override), `--search-lang en`,
`--report-lang <lang>`, `--out out/`, `--name <slug>`, `--refresh` (bypass cache).

## Interpreting results (be honest about limits)

- Report the **confidence** rating (`high`/`medium`/`low`) and its `reasons`. Do not overstate.
- **Growth** = recent period vs previous period (%) and CAGR. **Trend** significance comes from the
  Mann-Kendall test (`pValue`) with Sen's slope; treat `pValue >= 0.05` as "not statistically clear".
- Check **spikeShare**: if growth is driven by one-off spikes (a news event), say so.
- Check **seasonality**: do not mistake a seasonal swing for a lasting trend.
- Always repeat the standard limits: pageviews measure attention, not willingness to pay; a language
  edition is not the same as a country/market; only the exact titles analyzed are counted (redirects
  and closely related pages are not summed unless requested).

## Reference (read only what a task needs)

- [reference/metrics.md](reference/metrics.md) — exact metric definitions and the confidence rubric.
- [reference/api.md](reference/api.md) — Wikimedia + Wikidata endpoints, parameters, encoding, limits.
- [reference/languages.md](reference/languages.md) — language→project mapping and title-resolution gotchas.
- [reference/roadmap.md](reference/roadmap.md) — how to evolve this skill for larger/complex research.
- [examples/example-queries.md](examples/example-queries.md) — the sample scenarios with exact commands.
