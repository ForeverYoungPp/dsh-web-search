# align-with-native-search

## Why

User report: search results come back truncated, and the plugin should match the native
search's behaviour and presentation.

## Native behaviour (evidence)

Running train `0.1.5-rc.3`, `/home/fy/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`:

| Question | Answer | Evidence |
| --- | --- | --- |
| What does the native provider return? | `{ sources, truncated: false }` — never `content` | `dsh-web-search-deepseek/lib/index.js:60-83` |
| How are sources mapped? | `url` required (deduped), `title` only when non-empty, `snippet` from citation `cited_text` (first per url), `publishedAt` = `page_age` verbatim | same file `:41-77` |
| Who caps the list? | The **seam**: `capSources(result, maxResults)` slices only when `sources.length > maxResults` and sets `truncated: true` | `dsh-web/lib/index.js:97-98, 133-141` |
| Extra fields? | Preserved by the seam spread, then **dropped** by the tool, whose output schema is `additionalProperties: false` with only `content/sources/truncated` | `dsh-tool-web/lib/index.js:264-311` |
| What count does the tool send? | `maxResults` only, default `WEB_SEARCH_MAX_RESULTS = 8` (`searchMaxResults` config default 8); there is no `maxResults`/`num_search_results` model parameter — only `queries` | `dsh-tool-web/lib/index.js:25, 264-269, 308, 848` |
| Presentation | answer as Markdown above the list; sources rendered as `title ?? hostname(url)`, snippet and `publishedAt` verbatim with **no length clamp**; `truncated: true` renders the "sources truncated" notice | card `WebBlock.tsx:92-140, 162-167` (master source; same labels/strings in the running frontend bundle) |
| Snippet/content clamps anywhere | none in provider, seam, tool or card | grep over those files |

## Root cause of the reported truncation

`executeSearch` sliced the list itself and then hardcoded `truncated: false`
(`src/index.js`), so the seam's `capSources()` never saw `sources.length > maxResults` and
never set the flag. A capped list was therefore presented as complete: no "sources truncated"
notice in the card and no "(Showing the first N sources. Refine the query for more.)" in the
model-facing text. DuckDuckGo aggravated it — its HTML parser ignores the requested count and
returns every parsed result, which the plugin then silently cut to the requested number.

## Tasks

- [x] **N1 — Let the seam own the cap.** `executeSearch` returns the provider's full source
      list with `truncated: false`; `capSources()` slices and flags. Same shape as
      `deepseek-official`.
- [x] **N2 — Drop the extra `provider` field** (dead: the tool projects only
      `content/sources/truncated`).
- [x] **N3 — Stop inventing a default count.** `effectiveMax` no longer falls back to `5`; an
      omitted `maxResults` leaves each provider's own default in charge, which is how the
      native path behaves (the seam asks, the backend decides).
- [x] **N4 — Housekeeping.** Three unused `catch (e)` bindings became `catch {`.
- [x] **N5 — Verify.** Gates below.

## Deliberately not changed

- **Exa's 500-character snippet cap** stays. Native applies no clamp only because its backend
  returns short cited text; Exa's `text` field is a whole document, so the cap is a payload
  guard, not a divergence.
- `publishedAt` is passed through verbatim in both paths — no normalisation to align.
- The `title ?? hostname(url)` fallback chain already matches the native card's
  `title ?? hostname ?? url` for any well-formed URL; the trailing `'Untitled'` only appears
  for malformed URLs.
- `content` (the provider answer for Tavily/Exa/Kagi) is additive: the native provider never
  sets it, but the card renders `content` as Markdown, so it is a bonus, not a mismatch.

## Verification evidence

| Gate | Result |
| --- | --- |
| `pnpm test` | 90 pass / 0 fail + 37 pass / 0 fail |
| `pnpm run test:rpc` | 11 pass / 0 fail + `CLIENT BUNDLE SMOKE OK` |
| `pnpm run typecheck` | exit 0 |
| `pnpm run build` | `dist/` restaged, `diff -r src dist` identical |

## Known gaps

- `src/index.js` has no test coverage in this repo (it needs the harness runtime), so this fix
  is not pinned by a test. The change is a three-line passthrough; pinning it would mean
  extracting the result-shaping into a pure `host-core` function and asserting that it keeps
  every source and reports `truncated: false`.
- The editor/LSP flags ~55 strict-mode type diagnostics in `src/host-core.js` that the repo's
  own gate does not (`tsconfig.types.json` uses `strict: false`). Trying to point the editor at
  the real config with a root `tsconfig.json` did not change what this LSP reports, so that
  file was dropped rather than adding ~40 JSDoc annotations to this change. Separate task.

## Acceptance check for the user

With a keyless provider (DuckDuckGo) a real search should now show more than the requested
number of raw hits sliced down by the seam, and the card should show its truncation notice
when it happens — the same behaviour the native `deepseek-official` provider produces.
