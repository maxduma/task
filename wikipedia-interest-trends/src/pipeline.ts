// Orchestrates resolve -> fetch -> analyze into a single AnalysisArtifact.
import type {
  Access,
  Agent,
  AnalysisArtifact,
  Granularity,
  Series,
  SeriesAnalysis,
} from "./types.ts";
import type { Window } from "./dates.ts";
import { resolveArticles } from "./resolve.ts";
import { fetchPageviews } from "./pageviews.ts";
import { analyzeSeries, buildComparison } from "./analyze.ts";

export interface RunParams {
  topic: string | null;
  languages: string[];
  window: Window;
  granularity: Granularity;
  access: Access;
  agent: Agent;
  overrides: Map<string, string>;
  searchLang?: string;
  refresh?: boolean;
}

export async function runPipeline(params: RunParams): Promise<AnalysisArtifact> {
  const resolved = await resolveArticles(params.topic, params.languages, {
    searchLang: params.searchLang,
    overrides: params.overrides,
    refresh: params.refresh,
  });

  const series: Series[] = [];
  const results: SeriesAnalysis[] = [];

  for (const r of resolved) {
    if (!r.title) {
      const empty: Series = {
        language: r.language,
        project: r.project,
        article: "",
        granularity: params.granularity,
        access: params.access,
        agent: params.agent,
        points: [],
        empty: true,
      };
      series.push(empty);
      results.push(analyzeSeries(empty, r, params.window));
      continue;
    }
    const s = await fetchPageviews(r.language, r.project, r.title, {
      granularity: params.granularity,
      access: params.access,
      agent: params.agent,
      from: params.window.from,
      to: params.window.to,
      refresh: params.refresh,
    });
    series.push(s);
    results.push(analyzeSeries(s, r, params.window));
  }

  const comparison = buildComparison(results);

  const caveats: string[] = [];
  const uncertain = resolved.filter((r) => r.method === "search" || r.method === "none");
  if (uncertain.length > 0) {
    caveats.push(
      `Article match is uncertain for: ${uncertain.map((u) => u.language).join(", ")}. Verify titles or pass --title overrides.`,
    );
  }
  caveats.push("Pageviews measure attention, not willingness to pay; a language edition is not a market.");

  return {
    topic: params.topic,
    languages: params.languages,
    window: params.window,
    granularity: params.granularity,
    access: params.access,
    agent: params.agent,
    resolved,
    series,
    results,
    comparison,
    caveats,
    generatedAt: new Date().toISOString(),
  };
}
