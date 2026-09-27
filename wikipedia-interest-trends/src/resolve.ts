// Resolve a topic to the exact Wikipedia article title in each language.
// Primary: Wikidata item + sitelinks (guarantees the SAME concept across languages).
// Fallback: per-language MediaWiki search. Overrides always win.
import type { ResolvedArticle } from "./types.ts";
import { getJson } from "./http.ts";
import { getCached, setCached } from "./cache.ts";

// Languages whose Wikidata site id / host differ from the `${lang}wiki` / `${lang}.wikipedia` default.
const WIKI_ALIAS: Record<string, { wiki: string; project: string }> = {
  nb: { wiki: "nowiki", project: "no.wikipedia" },
};

function wikiIdFor(lang: string): string {
  return WIKI_ALIAS[lang]?.wiki ?? `${lang}wiki`;
}

export function projectFor(lang: string): string {
  return WIKI_ALIAS[lang]?.project ?? `${lang}.wikipedia`;
}

export interface ResolveOptions {
  searchLang?: string;
  overrides?: Map<string, string>;
  refresh?: boolean;
}

async function cachedGetJson<T>(url: string, refresh?: boolean): Promise<T | null> {
  if (!refresh) {
    const cached = await getCached<T>(url);
    if (cached) return cached;
  }
  const { data } = await getJson<T>(url);
  if (data) await setCached(url, data);
  return data;
}

interface WbSearch {
  search?: Array<{ id: string; label?: string; description?: string }>;
}

async function searchWikidata(term: string, lang: string, refresh?: boolean): Promise<string | null> {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=1` +
    `&language=${encodeURIComponent(lang)}&uselang=${encodeURIComponent(lang)}&search=${encodeURIComponent(term)}`;
  const data = await cachedGetJson<WbSearch>(url, refresh);
  return data?.search?.[0]?.id ?? null;
}

interface WbEntities {
  entities?: Record<string, { sitelinks?: Record<string, { title: string }> }>;
}

async function getSitelinks(qid: string, refresh?: boolean): Promise<Record<string, { title: string }> | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&ids=${encodeURIComponent(qid)}`;
  const data = await cachedGetJson<WbEntities>(url, refresh);
  return data?.entities?.[qid]?.sitelinks ?? null;
}

interface MwSearch {
  query?: { search?: Array<{ title: string }> };
}

async function searchWikipedia(lang: string, term: string, refresh?: boolean): Promise<string | null> {
  const host = projectFor(lang).split(".")[0];
  const url =
    `https://${host}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1` +
    `&srsearch=${encodeURIComponent(term)}`;
  const data = await cachedGetJson<MwSearch>(url, refresh);
  return data?.query?.search?.[0]?.title ?? null;
}

export async function resolveArticles(
  topic: string | null,
  languages: string[],
  opts: ResolveOptions = {},
): Promise<ResolvedArticle[]> {
  let qid: string | null = null;
  let sitelinks: Record<string, { title: string }> | null = null;

  if (topic) {
    qid = await searchWikidata(topic, opts.searchLang ?? "en", opts.refresh);
    if (!qid) {
      for (const lang of languages) {
        qid = await searchWikidata(topic, lang, opts.refresh);
        if (qid) break;
      }
    }
    if (qid) sitelinks = await getSitelinks(qid, opts.refresh);
  }

  const results: ResolvedArticle[] = [];
  for (const language of languages) {
    const project = projectFor(language);
    const override = opts.overrides?.get(language);
    if (override) {
      results.push({ language, project, title: override, qid, method: "override", confidence: "high" });
      continue;
    }

    // When a Wikidata concept was found, its sitelinks are authoritative for "does this language
    // have an article for this exact concept". If the sitelink is absent, that language has no
    // matching article -- searching would only surface an unrelated page, so report `none`.
    if (qid && sitelinks) {
      const fromSitelink = sitelinks[wikiIdFor(language)]?.title ?? null;
      if (fromSitelink) {
        results.push({ language, project, title: fromSitelink, qid, method: "wikidata", confidence: "high" });
      } else {
        results.push({
          language,
          project,
          title: null,
          qid,
          method: "none",
          confidence: "low",
          note: `concept ${qid} has no ${language}.wikipedia article; pass --title ${language}=<Exact_Title> if a suitable page exists`,
        });
      }
      continue;
    }

    // No Wikidata concept matched at all: fall back to a per-language search (verify the result).
    const searched = topic ? await searchWikipedia(language, topic, opts.refresh) : null;
    if (searched) {
      results.push({
        language,
        project,
        title: searched,
        qid,
        method: "search",
        confidence: "medium",
        note: "no Wikidata concept match; per-language search top hit; verify it matches the intended concept",
      });
      continue;
    }
    results.push({
      language,
      project,
      title: null,
      qid,
      method: "none",
      confidence: "low",
      note: "no matching article found; pass --title " + language + "=<Exact_Title>",
    });
  }
  return results;
}
