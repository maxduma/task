// CLI entry point. Commands: run, analyze, resolve, fetch, report.
// Designed for an agent: each command prints compact JSON and writes artifacts to disk.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Access, Agent, AnalysisArtifact, Granularity } from "./types.ts";
import { resolveWindow } from "./dates.ts";
import { resolveArticles } from "./resolve.ts";
import { fetchPageviews } from "./pageviews.ts";
import { runPipeline, type RunParams } from "./pipeline.ts";
import { buildReport } from "./report.ts";

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string[]>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      let key: string;
      let val: string;
      if (eq >= 0) {
        key = a.slice(2, eq);
        val = a.slice(eq + 1);
      } else {
        key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          val = next;
          i++;
        } else {
          val = "true";
        }
      }
      const arr = flags.get(key) ?? [];
      arr.push(val);
      flags.set(key, arr);
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function one(flags: Map<string, string[]>, key: string): string | undefined {
  return flags.get(key)?.[0];
}
function bool(flags: Map<string, string[]>, key: string): boolean {
  const v = one(flags, key);
  return v === "true" || v === "1" || v === "yes";
}

function parseOverrides(flags: Map<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of flags.get("title") ?? []) {
    const eq = raw.indexOf("=");
    if (eq > 0) map.set(raw.slice(0, eq), raw.slice(eq + 1).replace(/_/g, " "));
  }
  return map;
}

function slugify(s: string | undefined): string {
  if (!s) return "report";
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "report"
  );
}

function commonParams(flags: Map<string, string[]>): RunParams {
  const languages = (one(flags, "languages") ?? one(flags, "langs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const window = resolveWindow({
    from: one(flags, "from"),
    to: one(flags, "to"),
    window: one(flags, "window") ? Number(one(flags, "window")) : undefined,
  });
  return {
    topic: one(flags, "topic") ?? null,
    languages,
    window,
    granularity: (one(flags, "granularity") as Granularity) ?? "monthly",
    access: (one(flags, "access") as Access) ?? "all-access",
    agent: (one(flags, "agent") as Agent) ?? "user",
    overrides: parseOverrides(flags),
    searchLang: one(flags, "search-lang"),
    refresh: bool(flags, "refresh"),
  };
}

function summarize(artifact: AnalysisArtifact, artifacts?: Record<string, string>) {
  return {
    topic: artifact.topic,
    window: artifact.window,
    granularity: artifact.granularity,
    resolved: artifact.resolved.map((r) => ({
      language: r.language,
      title: r.title,
      method: r.method,
      confidence: r.confidence,
      note: r.note,
    })),
    results: artifact.results.map((r) => ({
      language: r.language,
      article: r.article,
      monthsCovered: r.monthsCovered,
      meanMonthly: Math.round(r.meanMonthly),
      volume: r.volumeBucket,
      growthPoPPct: r.growth.periodOverPeriodPct === null ? null : Number(r.growth.periodOverPeriodPct.toFixed(1)),
      cagrPct: r.growth.cagrPct === null ? null : Number(r.growth.cagrPct.toFixed(1)),
      trend: r.trend.direction,
      mkPValue: Number(r.trend.mkPValue.toFixed(3)),
      sensAnnualizedPct: Number(r.trend.sensSlopeAnnualizedPct.toFixed(1)),
      spikeShare: Number(r.spikes.spikeShareOfTotal.toFixed(2)),
      spikes: r.spikes.spikeDates.length,
      seasonal: r.seasonality.detected,
      confidence: r.confidence,
      confidenceReasons: r.confidenceReasons,
    })),
    comparison: artifact.comparison,
    caveats: artifact.caveats,
    artifacts,
  };
}

async function saveArtifact(outDir: string, name: string, artifact: AnalysisArtifact): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, `${name}.analysis.json`);
  await writeFile(path, JSON.stringify(artifact, null, 2), "utf8");
  return path;
}

function print(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

const HELP = `wikipedia-interest-trends

Usage: npm run cli -- <command> [options]

Commands:
  run       Resolve titles, fetch pageviews, analyze, and build PDF + PNG.
  analyze   Like run but metrics only (no report).
  resolve   Resolve a topic to exact article titles per language.
  fetch     Fetch raw pageviews for a single --project/--article.
  report    Build PDF + PNG from a saved --data <name>.analysis.json.

Common options:
  --topic "Intermittent fasting"    Topic to resolve (omit if using --title for all languages).
  --languages uk,pl,cs              Comma-separated language codes.
  --window 24                       Months ending at the last complete month (default 24).
  --from 2023-01 --to 2025-08       Explicit window (overrides --window).
  --granularity monthly|daily       Default monthly (daily is aggregated to months for metrics).
  --access all-access               Default all-access.
  --agent user                      Default user (excludes bots/spiders).
  --title uk=Exact_Title            Override resolution for a language (repeatable; _ becomes space).
  --search-lang en                  Language of --topic for Wikidata search (default en).
  --report-lang uk                  Language for the report (default: first of --languages).
  --out out                         Output directory (default out).
  --name slug                       Artifact basename (default: slug of topic).
  --refresh                         Bypass cache.
  --no-pdf                          (run only) Skip building the report.
`;

async function cmdRun(flags: Map<string, string[]>): Promise<void> {
  const params = commonParams(flags);
  if (params.languages.length === 0) throw new Error("--languages is required");
  const artifact = await runPipeline(params);

  const outDir = one(flags, "out") ?? "out";
  const name = one(flags, "name") ?? slugify(params.topic ?? undefined);
  const analysisPath = await saveArtifact(outDir, name, artifact);

  let artifacts: Record<string, string> = { analysis: analysisPath };
  if (!bool(flags, "no-pdf")) {
    const reportLang = one(flags, "report-lang") ?? params.languages[0] ?? "en";
    const res = await buildReport(artifact, { reportLang, outDir, name });
    artifacts = { ...artifacts, pdf: res.pdf, chart: res.chart };
  }
  print(summarize(artifact, artifacts));
}

async function cmdAnalyze(flags: Map<string, string[]>): Promise<void> {
  const params = commonParams(flags);
  if (params.languages.length === 0) throw new Error("--languages is required");
  const artifact = await runPipeline(params);
  const outDir = one(flags, "out") ?? "out";
  const name = one(flags, "name") ?? slugify(params.topic ?? undefined);
  const analysisPath = await saveArtifact(outDir, name, artifact);
  print(summarize(artifact, { analysis: analysisPath }));
}

async function cmdResolve(flags: Map<string, string[]>): Promise<void> {
  const languages = (one(flags, "languages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (languages.length === 0) throw new Error("--languages is required");
  const resolved = await resolveArticles(one(flags, "topic") ?? null, languages, {
    searchLang: one(flags, "search-lang"),
    overrides: parseOverrides(flags),
    refresh: bool(flags, "refresh"),
  });
  print(resolved);
}

async function cmdFetch(flags: Map<string, string[]>): Promise<void> {
  const project = one(flags, "project");
  const article = one(flags, "article");
  if (!project || !article) throw new Error("--project and --article are required");
  const window = resolveWindow({
    from: one(flags, "from"),
    to: one(flags, "to"),
    window: one(flags, "window") ? Number(one(flags, "window")) : undefined,
  });
  const series = await fetchPageviews(project.split(".")[0] ?? project, project, article, {
    granularity: (one(flags, "granularity") as Granularity) ?? "monthly",
    access: (one(flags, "access") as Access) ?? "all-access",
    agent: (one(flags, "agent") as Agent) ?? "user",
    from: window.from,
    to: window.to,
    refresh: bool(flags, "refresh"),
  });
  const views = series.points.map((p) => p.views);
  print({
    project,
    article,
    window,
    count: series.points.length,
    empty: series.empty,
    total: views.reduce((a, b) => a + b, 0),
    first: series.points[0],
    last: series.points[series.points.length - 1],
    points: bool(flags, "json") ? series.points : undefined,
  });
}

async function cmdReport(flags: Map<string, string[]>): Promise<void> {
  const dataPath = one(flags, "data");
  if (!dataPath) throw new Error("--data <name>.analysis.json is required");
  const artifact = JSON.parse(await readFile(dataPath, "utf8")) as AnalysisArtifact;
  const outDir = one(flags, "out") ?? "out";
  const name = one(flags, "name") ?? slugify(artifact.topic ?? undefined);
  const reportLang = one(flags, "report-lang") ?? artifact.languages[0] ?? "en";
  const res = await buildReport(artifact, { reportLang, outDir, name });
  print({ pdf: res.pdf, chart: res.chart });
}

async function main(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0];
  if (!command || bool(flags, "help") || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  switch (command) {
    case "run":
      return cmdRun(flags);
    case "analyze":
      return cmdAnalyze(flags);
    case "resolve":
      return cmdResolve(flags);
    case "fetch":
      return cmdFetch(flags);
    case "report":
      return cmdReport(flags);
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
