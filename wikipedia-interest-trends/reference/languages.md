# Languages and title resolution

## Language code → project

By default a language code `xx` maps to project `xx.wikipedia` and Wikidata sitelink id `xxwiki`.
Examples: `uk` → `uk.wikipedia` / `ukwiki`; `pl` → `pl.wikipedia` / `plwiki`;
`cs` → `cs.wikipedia` / `cswiki`; `en` → `en.wikipedia` / `enwiki`.

Known exceptions handled in `src/resolve.ts` (`WIKI_ALIAS`):

- `nb` (Norwegian Bokmål) → `no.wikipedia` / `nowiki`.

Add new exceptions there if you need wikis whose id differs from `${lang}wiki` (e.g. `simple`,
`be-tarask`). Use standard Wikipedia language subdomain codes, not ISO country codes.

## How resolution works

1. **Override wins.** `--title <lang>=<Exact_Title>` is used verbatim (underscores become spaces).
2. **Wikidata concept.** The topic is matched to a Wikidata item; its sitelinks give the exact
   article title per language. Sitelinks are authoritative: if a language is absent, that concept
   has no article there and it is reported as unresolved (`method: none`) rather than guessed.
3. **Search fallback.** Only when no Wikidata concept matched at all, a per-language text search
   provides a best-effort title at medium confidence.

## Gotchas

- **Same concept, different scope.** A topic may exist as a broad article in one language and a
  narrow one in another. Check the resolved titles in the output before trusting a comparison.
- **No article ≠ no interest.** A missing article means the _concept page_ is absent; a related page
  may exist. Provide a `--title` override to analyze it.
- **Ambiguous topics.** For a term with several meanings, pass `--search-lang` matching the topic's
  language, or use `--title` overrides to pin exact pages.
- **Redirects.** Only the exact resolved title is counted. If a topic is commonly reached via
  redirects or alternate spellings, results undercount true interest (see roadmap for aggregation).
- **Verify before deciding.** Run `resolve` first for unfamiliar topics; confirm the titles match
  the intended concept, then run `run`/`analyze`.
