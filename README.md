<p align="right">
  <strong>English</strong> · <a href="./README_ZH.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ian_p/dsh-web-search"><img src="https://img.shields.io/npm/v/@ian_p/dsh-web-search?style=flat-square&amp;color=5B4CF0" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0B7285?style=flat-square" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/DSH-0.1.5--rc.3-5B4CF0?style=flat-square" alt="DSH host version">
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&amp;logo=node.js" alt="Node version">
</p>

## One fallback chain. Eight providers.

`@ian_p/dsh-web-search` is a Cordis plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that replaces the native `web_search` back end with a configurable, multi-provider chain. Each query walks the configured provider order and falls back to the next on failure or empty results; DuckDuckGo needs no key and closes the chain.

The browser half adds a dedicated **Search providers** settings page for keys, connection tests and drag-to-reorder.

> **Design reference:** the multi-provider approach is adapted from Oh My Pi (OMP).

| Capability | What it changes |
| --- | --- |
| **8 providers, one chain** | Tavily, Brave, Exa, Firecrawl, Jina, Kagi, SearXNG, DuckDuckGo — any order, any subset. |
| **Native `web_search` integration** | The patch override routes the harness's own `web_search` tool through this chain. |
| **Fail-loud** | With the patch not applied the native tool reports `WEB_PROVIDER_AMBIGUOUS` instead of silently degrading. |
| **Host-native settings page** | Localized (en/zh) through the host `locale` service and styled with the host's own control contract (`--dsw-*` design tokens), so it follows the host language and light/dark theme. |
| **Auditable fallback** | One host-log line per search names every provider that was skipped or failed, then the one that served. |

## Requirements

- **Node.js** `^22.19` or `>=24`
- **DeepSeek Harness `0.1.5-rc.3`** — this plugin hand-writes its Typert Remote descriptors, so it targets one DSH train:

  ```bash
  npm install --global @deepseek-ai/dsh@0.1.5-rc.3
  ```

  Every `@deepseek-ai/dsh*` service it injects (`web`, `credentials`, `typert`) comes from that host build, so those packages are declared as peers at the same train version rather than listed package by package. The components declared on their own:

  | Component | Version | Role |
  | --- | --- | --- |
  | `@deepseek-ai/dsh` | `0.1.5-rc.3` | Host runtime (source of every `@deepseek-ai/dsh*` peer) |
  | `@deepseek-ai/cordis` | `^4.0.2` | Plugin/context framework (peer + dev) |
  | `react` | `^18.2` | Browser half only (dev) |
  | `typescript` | `^7.0.2` | Type check over `src/host-core.js` (dev) |

## Installation

**From npm** (the package declares `dsh.bundle.patch`, so `dsh plugin add` also activates the profile bundle):

```bash
dsh plugin --profile web add @ian_p/dsh-web-search
```

**Local development** — run inside the harness source workspace; the overlay loads `src/index.js` directly, so no build step is needed:

```bash
pnpm dsh web --patch /path/to/dsh-web-search/patch.web.yml
```

`web` is the launcher's alias for `--profile web`. The overlay (`patch.web.yml`) inserts the plugin row and sets `searchProvider: dsh-web-search` on the native `web` row; the browser half is discovered through the `dsh.client` manifest plus `exports["./client"]`.

**Linked checkout** (`dsh plugin --profile web add "link:/path/to/checkout"`) loads the published shape instead, i.e. `dist/` — run `pnpm run build` after editing `src/` (`pnpm install` also builds it through the `prepare` script). A host restart is required either way.

## How the chain behaves

Order comes from the settings page (drag to reorder) and is stored in the `dsh-web-search/config` credential record. Resolution: your ordered, non-excluded providers first, then every remaining provider in built-in order.

For each provider, in order:

1. `available()` — a local check, **no network call**: keyed providers need a credential record, SearXNG needs its endpoint, DuckDuckGo is always available. Not available ⇒ skipped.
2. `search()` with a per-provider timeout (default 60 s, `timeout` in the config record).
3. Success means a non-empty answer **or** at least one source; then the search returns immediately — later providers are never tried. There is no racing, no merging of providers, no retry and no cache.
4. Failure means HTTP non-2xx, invalid JSON, a thrown error, or "no renderable content"; the reason is recorded and the next provider is tried.

If every provider fails, the error names the last provider tried, and the plugin then retries the native `deepseek-official` provider before giving up.

Each search logs one line to the host log:

```text
[14:32:07] [dsh-web-search] firecrawl: HTTP 429: ... → tavily: served (8 sources, 4437ms)
[14:32:09] [dsh-web-search] trying exa
[14:33:01] [dsh-web-search] brave: not configured → ... → all providers failed
```

A `trying` line with no completion line after it means that provider is still in flight (the harness log itself is not timestamped, so the plugin stamps its own lines).

## Providers

| ID | Label | Kind | How to activate |
| --- | --- | --- | --- |
| `tavily` | Tavily | API key | Save a Tavily API key |
| `brave` | Brave | API key | Save a Brave API key |
| `exa` | Exa | API key | Save an Exa API key |
| `firecrawl` | Firecrawl | API key | Save a Firecrawl API key |
| `jina` | Jina | API key | Save a Jina API key |
| `kagi` | Kagi | API key | Save a Kagi API key |
| `searxng` | SearXNG | Endpoint | Save a SearXNG instance endpoint |
| `duckduckgo` | DuckDuckGo | None | Always available (default final fallback) |

Per-provider details worth knowing:

- **Tavily** — `results[].content` is a page chunk, not a description, so the request asks for `chunks_per_source: 1` (one relevant passage instead of three chunks of page chrome) and `include_published_date: true`.
- **Firecrawl** — reports its own failures as HTTP 200 with `success: false` plus a `warning`; that is surfaced as the provider's failure reason instead of looking like an empty result set.
- **DuckDuckGo** — keyless; the HTML front end is parsed, and a bot-challenge page yields zero sources so the chain keeps going.
- **SearXNG** — self-hosted; `week` recency maps to `month` because the instance only understands day/month/year.

## Configuration

### Credentials

All provider secrets live in harness **credential records** under the `dsh-web-search/` scope, managed from the settings page — no environment variables. (Environment-variable credential refs would shadow saved values and stop the page from working.)

- **API-key providers** — an `api-key` record, e.g. `dsh-web-search/tavily`.
- **SearXNG** — a `grant` record carrying the instance `endpoint`.
- **DuckDuckGo** — no key.
- **Plugin config** — a `grant` record at `dsh-web-search/config`:

  ```yaml
  order: [firecrawl, tavily, brave, exa, jina, kagi, searxng, duckduckgo]
  exclude: []
  timeout: 60        # seconds, per provider
  ```

  The settings page writes `order`; `exclude` and `timeout` currently only via the record.

### Settings page

Registered as the isolated settings section **Search providers** (id `web-search-providers`, order 12), separate from the native web-search config page. It lists providers in effective fallback order and lets you save or clear a key/endpoint, run a connection test, and drag the cards to reorder the chain. It talks to the host over the plugin's `websearch` Remote namespace (`list` / `setKey` / `unsetKey` / `setOrder` / `testProvider`).

The page registers `en` / `zh` dictionaries with the host `locale` service (sidebar label included) and paints itself with `--dsw-*` tokens using the host's own button, input and card geometry, so both language and theme follow the host.

## What the harness receives

`web_search` results are shaped to match the native path:

- **Sources** carry `url`, `title?`, `snippet?`, `publishedAt?` only. Snippets are cleaned (markdown headings stripped, whitespace collapsed, chunk separators removed) and held to **150 characters** — the documented ceiling of the native citation excerpt — with a cut marked by `…`.
- **The provider's own answer** (Tavily and Exa produce one) is passed as `content`, bounded to **400 characters**, and rendered as Markdown above the source list. The native provider never sends one.
- **Truncation is the seam's decision.** The plugin hands back the provider's full source list with `truncated: false`; the harness caps it to `request.maxResults` and sets `truncated: true`, which is what surfaces the "sources truncated" notice to both the user and the model.
- The tool has no field for the serving provider, so it is reported on the host log instead (see above).

## Architecture / project layout

```
dsh-web-search/
├── patch.web.yml            # --patch overlay for local development (relative ./src/index.js)
├── cordis.patch.yml         # published bundle patch (package specifier), declared via dsh.bundle.patch
├── src/                     # source of truth (never published)
│   ├── index.js             # host entry: ctx.web provider, chain orchestration, credential RPC ops
│   ├── host-core.js         # pure functions: query parsing, per-provider request building and
│   │                        # response normalization, snippet/answer policy
│   ├── remote.js            # websearch Remote namespace (WebSearchController)
│   └── client/bundle.js     # browser half: hand-written __ModuleLoader__ factory bundle (no bundler):
│                            # the settings page and its single-copy state machine
├── scripts/build.mjs        # build: clean copy of src/ → dist/ (the publishable tree)
├── dist/                    # build output — published to npm, git-ignored
├── tests/                   # 134 pure + 12 environment-dependent tests (see below)
├── docs/DESIGN.md           # host contracts this plugin depends on, and why the code is shaped this way
└── package.json             # main/exports → dist/, files: ["dist/", …], prepare builds dist/
```

## Development / Testing

```bash
pnpm install             # installs peers/dev deps and runs `prepare`, which builds dist/
pnpm run build           # stage dist/ from src/ (clean copy, no bundler, no new dependency)
pnpm test                # 134 pure-function tests (node:test, zero dependencies)
pnpm run test:rpc        # 12 environment-dependent tests (resolves the 0.1.5-rc.3 peers)
pnpm run typecheck       # tsc -p tsconfig.types.json (JSDoc types of src/host-core.js)
pnpm run prepublishOnly  # build + both test tiers + typecheck, before a publish
```

| Tier | Suite | Count | What it covers |
| --- | --- | --- | --- |
| Pure | `tests/host-core.test.mjs` | 97 | query parsing, provider request bodies, response normalization, snippet/answer policy, credential-record helpers |
| Pure | `tests/interaction.test.mjs` | 37 | the settings page state machine, run against the shipped client bundle |
| Env | `tests/remote-contract.test.mjs` | 11 | the Typert Remote contribution against the installed host contract |
| Env | `tests/client-bundle.smoke.mjs` | 1 | bundle registration, `apply()`, and the injected stylesheet |

`src/index.js` (the host entry: transport, chain, credential ops, `ctx.web` injection) has no test coverage — it needs the harness runtime; `docs/DESIGN.md` records what that leaves unpinned.

## License

[MIT](./LICENSE) © ForeverYoungPp
