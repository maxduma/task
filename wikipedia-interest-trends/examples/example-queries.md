# Example queries

The three scenarios from the brief, mapped to commands. Run from the skill directory after
`npm ci`. Each `run` prints a compact JSON summary and writes a PDF + PNG + analysis JSON to `out/`.

## 1. Compare growth of a topic across two languages
> "Compare the growth of interest in intermittent fasting in Polish- and Czech-language Wikipedia
> over the last two years."

```bash
npm run cli -- run --topic "Intermittent fasting" --languages pl,cs --window 24 --report-lang en
```
Read the summary: per-language `trend`, `growthPoPPct`, `mkPValue`, and `confidence`. If a language
resolves to `method: none` (no concept article), tell the user and offer a `--title` override, e.g.:
```bash
npm run cli -- run --topic "Intermittent fasting" --languages pl,cs \
  --title pl=Głodówka_lecznicza --window 24 --report-lang en
```

## 2. Single-topic trust check
> "We might add an astronomy course. Is interest growing in Ukrainian Wikipedia, and how much can we
> trust that?"

```bash
npm run cli -- run --topic "Astronomy" --languages uk --window 36 --report-lang uk
```
Answer with `trend` + `growthPoPPct`, then the trust picture from `confidence` + `confidenceReasons`
+ `caveats` (volume, seasonality, spikes, Mann-Kendall p-value).

## 3. Multi-language market scan for a report
> "We're building a language-learning app. Compare interest in learning English across selected
> language editions and prepare a short report on which audiences to explore next."

```bash
npm run cli -- run --topic "English language" --languages uk,pl,cs,tr,es --window 24 --report-lang en
```
Use `comparison.rankedByGrowth` and each language's `confidence` to recommend which audiences to
explore next, and why. The one-page PDF in `out/` is the shareable artifact.

## Iterating efficiently
- Verify titles first for unfamiliar topics: `npm run cli -- resolve --topic "..." --languages ...`.
- Change only the report language without refetching:
  `npm run cli -- report --data out/<name>.analysis.json --report-lang pl`.
- Repeated/related queries reuse the `.cache/`; add `--refresh` only when you need the latest month.
