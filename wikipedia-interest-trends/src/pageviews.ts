// Fetch per-article pageviews from the Wikimedia REST API, with caching.
import type {
  Access,
  Agent,
  Granularity,
  PageviewPoint,
  Series,
} from "./types.ts";
import { getJson } from "./http.ts";
import { getCached, setCached } from "./cache.ts";
import { timestampToIso, toApiDate } from "./dates.ts";

const API_BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article";

export interface FetchOptions {
  granularity: Granularity;
  access: Access;
  agent: Agent;
  from: string;
  to: string;
  refresh?: boolean;
}

/** Encode an article title the way the API expects: spaces -> underscores, then percent-encode. */
export function encodeArticle(title: string): string {
  return encodeURIComponent(title.replace(/ /g, "_"));
}

interface ApiResponse {
  items?: Array<{ timestamp: string; views: number }>;
}

export async function fetchPageviews(
  language: string,
  project: string,
  article: string,
  opts: FetchOptions,
): Promise<Series> {
  const url = [
    API_BASE,
    project,
    opts.access,
    opts.agent,
    encodeArticle(article),
    opts.granularity,
    toApiDate(opts.from),
    toApiDate(opts.to),
  ].join("/");

  if (!opts.refresh) {
    const cached = await getCached<Series>(url);
    if (cached) return cached;
  }

  const { data } = await getJson<ApiResponse>(url);
  const points: PageviewPoint[] = (data?.items ?? []).map((it) => ({
    date: timestampToIso(it.timestamp),
    views: it.views,
  }));

  const series: Series = {
    language,
    project,
    article,
    granularity: opts.granularity,
    access: opts.access,
    agent: opts.agent,
    points,
    empty: points.length === 0,
  };
  await setCached(url, series);
  return series;
}
