# Evaluations

Rubric-based scenarios in `eval.json` for checking the skill end to end, especially on a fast, cheap
model (the brief targets Claude Haiku 4.5 or similar with tool use).

## How to run

1. Make the skill available to an agent that has bash + filesystem + internet:
   - **Claude Code**: copy or symlink this directory into `.claude/skills/wikipedia-interest-trends`,
     then start Claude Code selecting a Haiku-class model.
   - **OpenRouter / custom agent**: expose a shell tool and put this directory on disk; include
     `SKILL.md` in the system context so the model can discover it.
2. Ensure dependencies are installed once: `npm ci` (or `npm install`) in the skill directory.
3. For each scenario in `eval.json`, send the `query` and check the `expected_behavior` items.

## What to look for (cheap-model quality signals)

- The model **calls the CLI** (`resolve`, `run`, `analyze`, `report`) instead of writing its own
  fetching/plotting code.
- It reads the compact JSON summary and does **not** try to load raw daily/monthly arrays into the
  conversation.
- It reports **exact resolved titles**, the **confidence** rating, and **caveats**.
- On an unresolved language it offers a `--title` override rather than inventing a number.
- A one-page PDF and PNG appear in `out/`.

## Scoring

For each scenario, count the satisfied `expected_behavior` items. A scenario passes when all
critical items (calls the CLI, grounded answer, confidence + caveats, PDF produced) are met. Track
pass rate per model to compare Haiku vs Sonnet vs Opus.

## Local determinism checks (no model required)

```bash
npm run typecheck
npm test
npm run cli -- run --topic "Astronomy" --languages uk --window 24 --report-lang uk
```

The metric unit tests in `src/stats.test.ts` cover trend detection, robustness to outliers, and
spike-vs-level-shift behavior on synthetic series with known properties.
