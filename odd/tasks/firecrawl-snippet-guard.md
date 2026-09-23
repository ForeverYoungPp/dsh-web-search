# firecrawl-snippet-guard

## Why

Reported: Firecrawl search returns whole page content. Root cause is in
`normalizeFirecrawlResponse` (`src/host-core.js`): its snippet fallback was
`description || snippet || markdown`, and Firecrawl v2 puts the **scraped page** in
`markdown`. A whole document therefore travelled into the result card and into the
model-facing output. Jina has the same shape (`content`); its request already asks for
`X-Respond-With: no-content`, but the normalizer had no guard if an instance ignored it.

The Firecrawl v2 search response schema (docs) confirms `data.web[]` can carry
`title, description, url, markdown, html, rawHtml, links, screenshot, audio, video,
metadata` — `markdown` being the scraped document.

## How long may a snippet be: the native ceiling

The native `deepseek-official` provider cannot produce more than a citation excerpt:

| Evidence | Finding |
| --- | --- |
| Anthropic web-search tool docs (the API this provider speaks): "`cited_text`: **Up to 150 characters** of the cited content." | the excerpt ceiling is **150 characters** |
| Same docs: `web_search_result` items contain only `url`, `title`, `page_age`, `encrypted_content` | the result item carries **no** snippet field of its own |
| `dsh-web-search-deepseek/lib/index.js:38-52,60-83` | snippets are joined from URL-keyed `cited_text` entries, so an un-cited source has none at all; nothing is clamped because nothing is long |
| `packages/web/web-search-deepseek/README.md:60` | "snippets joined from URL-keyed `cited_text` entries **where an excerpt exists**" |

So native snippets are short *by construction*, and 500 characters was 3.3× that ceiling.

## Tasks

- [x] **F1 — One guard for every page-body provider.** Private `boundedSnippet(short, long)`:
      the short field wins when it has content, otherwise the long field is whitespace-collapsed
      and capped at `SNIPPET_MAX = 150` — the native ceiling; nothing is emitted when both are
      empty (no empty snippet field).
- [x] **F2 — Firecrawl** uses `boundedSnippet(r.description || r.snippet, r.markdown)`.
- [x] **F3 — Jina** uses `boundedSnippet(r.description, r.content)` as defence in depth.
- [x] **F4 — Exa** now goes through the same guard
      (`boundedSnippet(r.summary, r.text || highlights)`) instead of its own `slice(0, 500)`,
      which also collapses whitespace in a `text` body.
- [x] **F5 — Tests.** Three assertions pin the behaviour (Firecrawl, Jina, Exa): a ~10 kB page
      never becomes the snippet, the cap is 150, whitespace is collapsed, a short field wins,
      and a result with no text at all gets no snippet field.
- [x] **F6 — Annotation pass** (behaviour-free, same file): see the note below.

## What is deliberately NOT capped

A provider's **own SERP description** (Tavily `content`, Brave `description`, Kagi
`snippet|description|summary`, SearXNG `content|snippet`, DuckDuckGo `result__snippet`) is
passed through as the provider sized it — exactly as the native path passes `cited_text`
through. The 150 ceiling applies to anything carved out of a whole document, which is where
the unbounded length actually comes from. Capping those too would be uniform, but it would
throw away information the provider deliberately included; say the word and it is one line.

## Deliberately not changed

- **The request body.** The Firecrawl v2 docs page fetched here documents the response schema
  but not the request's `scrapeOptions` / `formats` controls, so no request-side field was
  invented. To stop the scrape at the source, `scrapeOptions: { formats: [] }` (or
  `['summary']`) is the candidate — it needs one live check against a real key, and it is a
  separate change.

## Note: the JSDoc annotation pass

`src/host-core.js` declares `// @ts-check` and already ships `SearchSource` /
`SearchResponse` typedefs, but its object literals were never annotated, so editors reported
~55 strict-mode diagnostics while the repository's own gate (`tsconfig.types.json`,
`strict: false`) stayed green. The existing typedefs are now applied (41 annotation sites), and
five small spots were typed properly:

| Spot | Change |
| --- | --- |
| `validateSetKey` / `validateUnsetKey` | `id` normalised to a string (`typeof args.id === 'string' ? args.id : ''`) — same behaviour, no more `undefined` index |
| kagi `collect(items, tag)` | params annotated |
| `formatSearXNGAnswers` | `@param {any[]}` instead of bare `Array` |
| `parseDuckDuckGoHtml` | declared return is `SearchSource[]` |
| recency maps (`BRAVE_/FIRECRAWL_/DDG_/SEARXNG_RECENCY`, tavily's map) | `Record<string, string>` |

Editor diagnostics for the file went 55 → **0**; `pnpm run typecheck` still exits 0.

## Verification evidence

| Gate | Result |
| --- | --- |
| `pnpm test` | 93 pass / 0 fail (was 90 before this work) + 37 pass / 0 fail |
| `pnpm run test:rpc` | 11 pass / 0 fail + `CLIENT BUNDLE SMOKE OK` |
| `pnpm run typecheck` | exit 0 |
| `pnpm run build` | OK, `diff -r src dist` identical |
| `lens_diagnostics` (LSP) on `src/host-core.js` | 0 diagnostics (was 55) |

## Possible follow-up

The 150-character cap cuts mid-word, and at that length it is more visible than at 500. A
word/sentence-boundary cut with an ellipsis would read better; not done because it adds logic
to a guard whose only job is to bound length.
