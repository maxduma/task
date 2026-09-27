# API reference

Endpoints and parameters used by this skill. All requests send a descriptive `User-Agent`
(override with the `WIT_USER_AGENT` env var) and are cached under `.cache/`.

## Contents
- Wikimedia Pageviews (per-article)
- Article title encoding
- Wikidata (concept + sitelinks)
- MediaWiki search (fallback)
- Rate limits and errors

## Wikimedia Pageviews (per-article)
```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/{access}/{agent}/{article}/{granularity}/{start}/{end}
```
- `project` — e.g. `uk.wikipedia`, `pl.wikipedia`, `en.wikipedia`.
- `access` — `all-access` (default) | `desktop` | `mobile-web` | `mobile-app`.
- `agent` — `user` (default; excludes bots/spiders) | `all-agents` | `spider` | `automated`.
- `article` — page title, spaces as `_`, then percent-encoded (`/` becomes `%2F`).
- `granularity` — `daily` | `monthly`.
- `start` / `end` — `YYYYMMDD`. Data begins **2015-07-01**.

Response shape:
```json
{ "items": [ { "project": "uk.wikipedia", "article": "Астрономія", "granularity": "monthly",
  "timestamp": "2024090100", "access": "all-access", "agent": "user", "views": 1234 } ] }
```
`timestamp` is `YYYYMMDDHH`; for monthly data it is the first hour of the first day of the month.
A `404` means "no data for this article/range" and is treated as an empty series, not an error.

Notes and gotchas:
- The **current month is incomplete** for monthly granularity; the default window ends at the last
  complete month. Do not read the final partial month as a drop.
- Per-article counts are for the **exact title only**. Redirects and closely related pages are
  counted separately (see roadmap for redirect aggregation).
- `agent=user` still includes some undetected automated traffic; treat low counts with caution.

## Article title encoding
`encodeURIComponent(title.replace(/ /g, "_"))`. Underscores are preserved; slashes and other
special characters are percent-encoded. Titles are case- and diacritic-sensitive.

## Wikidata (concept + sitelinks)
Resolve a topic to the same concept across languages, then read its per-language article titles.
```
# 1. Find the concept id (Qxxxx) for a term in a given language
GET https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=1&language={lang}&uselang={lang}&search={term}
# 2. Read the concept's sitelinks (authoritative list of which wikis have an article)
GET https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&ids={qid}
```
Sitelink keys are wiki ids like `ukwiki`, `plwiki`, `cswiki` → titles. If a language's wiki id is
**absent** from sitelinks, that language has no article for the concept (report as unresolved
rather than guessing).

## MediaWiki search (fallback, only when no Wikidata concept matched)
```
GET https://{host}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch={term}
```
Returns `query.search[0].title`. Marked medium confidence because a top text hit may not match the
intended concept.

## Rate limits and errors
- The REST API tolerates generous throughput but is a shared resource: this skill caches responses
  and retries `429`/`5xx` with exponential backoff (honoring `Retry-After`).
- If you see repeated `429`, wait and rely on the cache; avoid `--refresh` for large batches.
