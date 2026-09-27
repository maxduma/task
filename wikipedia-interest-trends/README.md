# wikipedia-interest-trends

An **Agent Skill** that turns Wikipedia pageview statistics into topic- and language-market
decisions for B2C products. The bundled TypeScript CLI resolves article titles across languages,
fetches pageviews (cached), computes growth/trend/seasonality/spike metrics with a transparent
**confidence** rating, and produces a shareable **one-page PDF** plus a PNG chart. The agent
orchestrates the CLI and writes the narrative; it does not do the math itself.

See [SKILL.md](SKILL.md) for the agent-facing instructions.

## Setup

```bash
npm ci        # or: npm install
```

Requires Node >= 18 and internet access to the Wikimedia API.

## Usage

```bash
npm run cli -- run --topic "Astronomy" --languages uk,pl,cs --window 24 --report-lang uk
npm run cli -- --help
```

Commands: `run`, `analyze`, `resolve`, `fetch`, `report`. Details in [SKILL.md](SKILL.md) and
[examples/example-queries.md](examples/example-queries.md).

## Layout

- `SKILL.md` — agent instructions and workflow.
- `src/` — CLI and library (`resolve`, `pageviews`, `analyze`, `stats`, `report`, `pipeline`).
- `reference/` — API, metrics/confidence rubric, languages, and the growth roadmap.
- `examples/`, `evaluations/` — sample scenarios and a rubric-based eval set.
- `assets/fonts/` — bundled DejaVu Sans (Cyrillic/diacritic support for charts and PDF).

## Verification

- `npm run typecheck` — TypeScript strict, no errors.
- `npm test` — unit tests for the statistics (trend detection, outlier robustness,
  spike-vs-level-shift) on synthetic series with known properties.
- End-to-end: `npm run cli -- run ...` fetches live data and writes artifacts to `out/`.
- `evaluations/` describes how to run the full scenarios on a cheap model (e.g. Claude Haiku 4.5).

Analytical outputs were cross-checked against the public Pageviews Analysis tool
(`pageviews.wmcloud.org`) and Wikimedia Statistics (`stats.wikimedia.org`), and the resolver was
validated by inspecting Wikidata sitelinks and MediaWiki langlinks directly.

## AI tooling

This skill was built with AI coding assistance. Generated code was verified by: strict typechecking,
deterministic unit tests on synthetic data, live end-to-end runs with visual inspection of the chart
and PDF, and spot-checks of resolved titles and pageview values against the official Wikimedia tools
listed above.

## Third-party assets

DejaVu Sans fonts in `assets/fonts/` are distributed under the DejaVu Fonts license (a permissive
Bitstream Vera / Arev derivative). See [assets/fonts/NOTICE.txt](assets/fonts/NOTICE.txt).
