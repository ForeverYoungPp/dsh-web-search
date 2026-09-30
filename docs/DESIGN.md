# Design notes

Why the code is shaped this way: the host contracts this plugin depends on, the policies it
applies to results, and the things that are deliberately *not* done. Read this before changing
`src/index.js` (the host entry) or `src/client/bundle.js` (the browser half).

Everything below was verified against the DSH train this plugin targets, **`0.2.0-rc.2`**.

## 1. Host contracts we depend on

| Contract | Evidence | What we rely on |
| --- | --- | --- |
| Typert Remote strict codec | `dsh-typert-registry/lib/index.js:565`, `lib/client.js:1357` | This train requires a strict codec to expose `create(): TypertSchema`, where `TypertSchema` is a `{ parse }` interface — the bare `schema` field the plugin used to ship is rejected with `strict codec has no create() factory`. The client descriptors ship `{ mode: 'strict', typeSymbol: 'dsh-web-search#json', create: () => ({ parse }) }` (one shared, stateless schema). `tests/remote-contract.test.mjs` proves both registry faces accept the shipped shape and reject the pre-change one. |
| SRC method descriptor | `@deepseek-ai/dsh-typert-protocol/remote-methods` | The fallback discovery path in `src/remote.js` (`markRemote`). A test in `tests/remote-contract.test.mjs` asserts it stays discoverable, so it is not dead weight. |
| `locale` service | `dsh-client-locale/lib/client.js:1256-1283, 1378` | `register(ns, dicts)` **throws if the namespace already has that locale**; `bind(ns)` resolves the active locale per call; `subscribe(fn)` drives re-render. |
| Settings slots | `plugins.item` list (the plugin-manager's own item ledger) | The page registers as its own entry `{ id: 'web-search-providers', order: 12 }` — ids do not collide with the native page's `web-search` — and the `label` thunk keeps the entry following the language. |
| Theme | `dsh-client-ui-theme/lib/client.js:1047-1059` | `--dsw-*` tokens on `body` / `body[data-ds-dark-theme]`. **There are no radius/spacing tokens** — radii and paddings are per-component literals on this train. |
| Web seam | `dsh-web/lib/index.js:97-98, 133-141` | `registerSearchProvider({ id, available, search })`; `capSources()` slices only when `sources.length > maxResults` **and sets `truncated: true`**; `searchProviders` / `searchProviderId` are TypeScript-private but real runtime properties, used for the native fallback. |
| Tool boundary | `dsh-tool-web/lib/index.js:307-314` (`execute`), `:118-124` (`searchMetaFromValue`), `dsh-client-ui-tool/lib/client.js:768-783` (`webCardModel`) | The tool projects only `content`/`sources`/`truncated`, the card meta is built from exactly those plus `answer`, and the card model reads exactly those — **there is no field for the serving provider**. |
| Credentials | `dsh-credentials/lib/index.ts` | `readRecord` / `modifyRecord` / `deleteRecord` / `describeRecord`; record kinds `api-key` and `grant`; keys are `<scope>/<id>`, so all of ours live under `dsh-web-search/`. |
| Client module table | `dsh-web-frontend/dist/assets/index-*.js` (`by()`), `dsh-client-modules/lib/client.js:295-308` | Platform seed words include `@deepseek-ai/dsh-client-ui-primitives`, so the host's component kit **is** requirable, and `react` is the only require our bundle uses today. |

## 2. Chain semantics (`src/index.js`, `executeSearch`)

Strictly **sequential, in resolved order, first success wins**. No racing, no merging, no retry,
no cache. Order resolution is `resolveProviderOrder()` (`src/host-core.js`): the user's ordered,
non-excluded providers first, then the remainder in built-in order.

Per provider: `available()` is a local check with **no network call** (keyed ⇒ a credential
record exists, endpoint ⇒ endpoint record, none ⇒ always true); then `search()` with
`timeout = config.timeout × 1000` (**60 s**, a deliberate user decision — do not lower it without
being asked). Success is a non-empty answer **or** ≥1 source; failure is HTTP non-2xx, invalid
JSON, a throw, or "no renderable content", each recorded and followed by the next provider. A
caller abort is re-thrown, never swallowed. When everything fails the plugin retries the native
`deepseek-official` provider once before returning the error.

Every search logs one line: `trying <id>` before each attempt, then
`<id>: <reason> → … → <id>: served (N sources, Nms)`. Both carry an `HH:MM:SS` stamp because the
harness log has none and a stall has to be distinguishable from a hang.

## 3. Result shaping policy

- **Snippets are cleaned and capped at 150 characters** (`SNIPPET_MAX`). 150 is the documented
  ceiling of the native citation excerpt — Anthropic's web-search tool, which
  `deepseek-official` speaks: `cited_text`: *"Up to 150 characters of the cited content"* — and
  `web_search_result` items carry no snippet field at all, so the native path can never show
  more. Cleaning strips markdown image syntax and heading markers, collapses whitespace, drops
  Tavily's `<chunk 1> [...] <chunk 2>` join separator, and marks a cut with `…`. `C#`/`F#`
  survive: heading markers are only stripped at a line start or after whitespace.
- **Page bodies never become snippets.** Firecrawl's scraped `markdown`, Jina's `content` and
  Exa's `text` are whole documents; each normalizer prefers the short field, falls back to a
  collapsed, bounded prefix, and emits no `snippet` at all when there is nothing to show.
- **The provider's own answer** (Tavily, Exa) becomes `content`, capped at `ANSWER_MAX = 400`
  with Markdown preserved (the card renders it as Markdown). `ANSWER_MAX = 0` drops it — closest
  to native, which never sends `content`.
- **We never pre-slice sources.** Handing the seam the full list is what lets `capSources()` set
  `truncated: true`; pre-slicing presents a capped list as complete (the bug fixed in `86d062a`).
- **Per-provider adaptations** with their reasons: Tavily `chunks_per_source: 1` (its `content`
  is a page chunk; the default of three measured 1179/1333/242 chars and opened with site
  navigation, versus 384/490/482 opening with the article's own sentence) plus
  `include_published_date: true` (its `published_date` is opt-in, while native `page_age` is
  not); Firecrawl's HTTP 200 + `success: false` + `warning` is thrown as a failure rather than
  mistaken for an empty result; DuckDuckGo ignores the requested count, so the seam does the
  capping; SearXNG maps `week` to `month` because instances only understand day/month/year.

## 4. Browser half (`src/client/bundle.js`)

- **One copy of the state machine.** The bundle is a hand-written `__ModuleLoader__` factory that
  can only `require` platform modules, so it cannot import a sibling file; the pure reducer /
  `deriveView` / `reorderProviders` therefore live here and are exercised through the
  test-only `__internals` handle. Keeping a second copy in `src/` (as the repo once did) meant
  the tests validated a module that never shipped.
- **i18n.** `inject: ['slots', 'remote', 'locale']`, one `ctx.locale.register('dsh-web-search',
  { en, zh })` inside a `try` (a live reload re-materializes the bundle and re-registering throws
  — that must not take the client half down), one `bind` (it resolves the locale per call), a
  label thunk, and a `subscribe` tick so a language switch re-renders without a remount.
- **Styles** are one injected `<style data-plugin-css="dsh-web-search">` whose values are copied
  from the host's own **Plugins page** (`dsh-client-ui-settings-plugins/lib/client.js`): buttons
  `8px` radius with `5px 14px` padding at 13px, primary = `label-primary` fill on `bg-layer-3`
  text, secondary = `border-l2` outline, inputs `34px / radius 8 / border-l4 / 0 12 / 13px`,
  cards `.5px border-l4 / radius 16`, hairline (`border-l2`) separators around body and footer,
  section `gap 12 / max-width 760`, heading `18px/600`. Two deliberate deviations, both with
  host tokens: error text uses `--dsw-alias-state-error-primary` because the page's own
  `--dsw-alias-label-error` is referenced five times on this train and **defined nowhere** (an
  invalid declaration that would silently inherit a colour), and the input keeps a focus border
  plus a `:hover` tint for keyboard/accessibility feedback the copied rules omit.

## 5. Packaging and release

`dist/` is the published tree and only `dist/` — `files` lists it, `scripts/build.mjs` stages it
from `src/` (a clean copy: the host half is already plain ESM, the browser half is a hand-written
factory bundle, nothing is transformed), and `dist/` is git-ignored. `prepare` runs the same
build, so `pnpm install` and `link:` installs always have a `dist/` to resolve — without it a
linked profile loads stale code or fails to resolve at all. `prepublishOnly` = build → both test
tiers → typecheck.

Two patch files: `patch.web.yml` (local `--patch`, inserts the relative `./src/index.js`) and
`cordis.patch.yml` (published, inserts the package specifier, declared via `dsh.bundle.patch`).
Both use the loader's real shape — a list of entries, each either `{ insert: [...] }` or
`{ id, …overrides }` (`harness/vendor/include/src/index.ts:77-93`) — which generic YAML/JSON-Patch
schemas will report as invalid; ignore that.

Publishing needs `--tag` for a prerelease version (`npm publish … --tag rc`), because npm refuses
to publish a prerelease onto `latest`.

## 6. Testing, and what is not pinned

140 pure tests (`host-core` 97, `interaction` 37, `manifest` 6) run with zero dependencies;
19 environment tests (`remote-contract` 18, `client-bundle.smoke` 1) need the peers installed and
cover the compatibility gate, the Typert contribution, the strict-codec contract on both registry
faces, bundle registration, `apply()` and the injected stylesheet.

Not covered, on purpose or for lack of a runtime:

- `src/index.js` — transport, chain orchestration, credential ops and `ctx.web` injection need
  the harness. Changes there are verified by reading and by the host log, not by a test.
- The React render path — the client tests reach the pure functions and `apply()`, not a mounted
  tree (no `react-dom` in devDependencies).

## 7. Known gaps and next steps

- **The adaptation to `0.2.0-rc.2` is done**, not pending: peers moved to `^0.2.0-rc.2` (cordis
  `~4.0.4`, `@deepseek-ai/dsh-tools` dropped as a dead declaration), the strict codec moved from
  `schema` to `create()` (§1), and the page moved from `settings.section` to `plugins.item` (§4).
  The one thing a test cannot prove is that the page is reachable in a running host: the
  Plugins-page acceptance step is manual, and the slot line is the isolated revert point.
- `@deepseek-ai/dsh-client-ui-primitives` is requirable but unused: its prop contract is compiled
  into a 280 kB single-line bundle and cannot be verified read-only, so the settings page copies
  the CSS contract instead. Adopting the real `Button`/`Input` (and its hover/focus handling) is
  a follow-up for a session that can test against a running host.
- The 150-character cut is mid-word; a word/sentence-boundary cut with an ellipsis would read
  better.
- `exclude` and `timeout` exist in the config record but have no settings-page UI.
- Publishing to npm is manual (local `bypass_2fa` token), matching the other plugin in this
  family; CI/trusted publishing is not configured in this repository.
