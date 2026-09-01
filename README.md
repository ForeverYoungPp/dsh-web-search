<p align="right">
  <strong>English</strong> · <a href="./README_ZH.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@deepseek-ai/dsh-web-search"><img src="https://img.shields.io/npm/v/@deepseek-ai/dsh-web-search?style=flat-square&amp;color=5B4CF0" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0B7285?style=flat-square" alt="MIT license"></a>
  <a href="./patch.web.yml"><img src="https://img.shields.io/badge/DSH-Web%20%2B%20Headless-5B4CF0?style=flat-square" alt="DSH Web and Headless"></a>
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&amp;logo=node.js" alt="Node version">
</p>

## One fallback chain. Eight providers.

`dsh-web-search` is a static Cordis plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that adds a configurable, multi-provider web search back-end. Each query walks the configured provider order and falls back to the next on failure or empty results. DuckDuckGo needs no API key and acts as the final fallback, so the chain always has a working link.

The plugin routes the harness's native `web_search` tool through its own provider chain — replacing the built-in `deepseek-official` backend — so the built-in web card rendering delivers multi-provider fallback, configured API keys, and DuckDuckGo as a keyless last resort.

> **Design reference:** this multi-provider web-search approach is adapted from Oh My Pi (OMP).

## Why dsh-web-search?

| Capability | What it changes |
|---|---|
| **8 providers, one chain** | Tavily, Brave, Exa, Firecrawl, Jina, Kagi, SearXNG, DuckDuckGo — any order, any subset. |
| **Native `web_search` integration** | Patch override routes the harness's native `web_search` tool through this plugin's multi-provider fallback chain, replacing the built-in `deepseek-official` backend. Access your configured API keys and DuckDuckGo as a keyless last resort — all through the native web card UI. |
| **In-app credential management** | API keys and SearXNG endpoints live in harness credential records, managed from a dedicated "Web Search Providers" settings page — save, clear, test, and drag-to-reorder. |
| **Fail-loud** | When the patch is not applied, the native `web_search` reports `WEB_PROVIDER_AMBIGUOUS` rather than silently degrading. |
| **No build step** | Pure ESM source loaded directly; the browser half ships as a hand-written factory bundle. |

## Table of Contents

- [Requirements](#requirements)
- [Installation / Loading](#installation--loading)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Providers](#providers)
- [Architecture / Project Layout](#architecture--project-layout)
- [Development / Testing](#development--testing)
- [License](#license)

## Requirements

- **Node.js** `^22.19` or `>=24`
- **deepseek-harness** source workspace (for local `--patch` loading) or an installed `dsh` CLI (for the published npm package)

### Host: DeepSeek Harness `0.1.2` alpha train (required)

This plugin calls the host over the Typert Remote protocol and imports `RemoteError` from `@deepseek-ai/dsh-typert-protocol` (present since `0.1.2-alpha.2`), so the host must run a `0.1.2` alpha build — pin it explicitly:

```bash
npm install --global @deepseek-ai/dsh@0.1.2-alpha.2
```

> **Warning:** npm's `latest` tag for `@deepseek-ai/dsh` is currently `0.1.1-rc.2` — the old RC train, which lacks `RemoteError`. A bare `npx @deepseek-ai/dsh web` or `npm install --global @deepseek-ai/dsh` installs that old build and crashes with `RemoteError`. Pin `@0.1.2-alpha.2` explicitly — the new train lives on the `alpha` tag (currently `0.1.2-alpha.3`).

- Peer dependencies (all optional, installed with the package):

  | Package | Version |
  |---|---|
  | `@deepseek-ai/dsh-api-remotes` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/dsh-tools` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/dsh-typert-protocol` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/dsh-web` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/cordis` | `^4.0.2` |

## Installation / Loading

### Local development (`--patch`, loads source directly)

Run inside the deepseek-harness source workspace (where the `dsh` launcher and `@deepseek-ai/*` packages live):

```bash
pnpm dsh web --patch D:/development/dsh-web-search/patch.web.yml
```

`web` is a hard-coded alias for `--profile web` in the dsh launcher. The patch overlay (`patch.web.yml`) inserts `src/index.js` as a plugin row in the `web` profile and sets `searchProvider: dsh-web-search` on the native `web` row so its `web_search` tool routes through this plugin. No build or bundling is required:

- The relative row path is anchored to the patch file's directory and resolved to a `file://` URL, which Node's native ESM loads directly.
- The browser half is discovered via `dsh.client` manifest + `exports["./client"]` in this project's `package.json`, pointing at `src/client/bundle.js` (a hand-written `__ModuleLoader__` factory, no bundler).

Once published, install it persistently into the `web` profile with `dsh plugin --profile web add @deepseek-ai/dsh-web-search` (the package declares `dsh.bundle.patch`, so `dsh plugin add` activates it as a profile bundle); keep using `--patch` for local development.

### Published (installs from npm)

Host first, then plugin — the host must be pinned to the `0.1.2` alpha train (see [Requirements](#requirements)):

```bash
npm install --global @deepseek-ai/dsh@0.1.2-alpha.2   # host, 0.1.2 alpha train (required)
dsh --version
dsh plugin --profile web add @deepseek-ai/dsh-web-search   # resolves @latest
```

`dsh plugin add` resolves the plugin's `@latest` dist-tag and, because the package declares `dsh.bundle.patch`, activates it as a profile bundle.

## Quick Start

Once loaded, the harness's native `web_search` tool is backed by this plugin's multi-provider fallback chain (replacing the built-in `deepseek-official` backend). The patch override (or the equivalent config on the `web` row) sets `searchProvider: dsh-web-search`. Results render with the native web card UI, and the chain falls back to `deepseek-official` only when no plugin provider returns usable results.

No separate tool is needed — the native `web_search` tool is the sole entry point. It supports `site:` domain filtering in the query string (passed through to the provider) and respects the configured result count. The settings page lets you manage API keys, reorder providers, and test connections.

## Configuration

### Credentials

All provider secrets live in harness **credential records** under the `dsh-web-search/` scope, managed from the settings page — no environment variables required.

- **API key providers** — stored as an `api-key` record, e.g. `dsh-web-search/tavily`.
- **SearXNG** — stored as a `grant` record carrying the instance `endpoint`.
- **DuckDuckGo** — no key; always available.

> **Note:** do not reference environment variable names (e.g. `TAVILY_API_KEY`) as credential refs for keys — the launching environment treats them as read-only and would shadow any saved value. Records must be `{kind: 'api-key'}` or `{kind: 'grant'}`, and keys must contain a `/`, otherwise credential parsing fails and all set/unset operations throw.

### Provider order and limits

- **Order** — provider fallback order is configurable; the settings page provides drag-to-reorder, stored in a `grant` record (`dsh-web-search/config`).
- **Results per query** — 5 by default (stays under the native `maxResults` cap so no truncation warning is triggered).

### Settings page

The plugin registers an isolated settings section, **Web Search Providers** (id `web-search-providers`), separate from the native web search config page. From there you can:

- save or clear a provider's API key / endpoint
- test the connection to a provider
- reorder the fallback chain by dragging

The page talks to the host over the plugin's `websearch` Remote namespace (`list` / `setKey` / `unsetKey` / `setOrder` / `testProvider`).

## Providers

| ID | Label | Kind | How to activate |
|---|---|---|---|
| `tavily` | Tavily | API key | Set a Tavily API key |
| `brave` | Brave | API key | Set a Brave API key |
| `exa` | Exa | API key | Set an Exa API key |
| `firecrawl` | Firecrawl | API key | Set a Firecrawl API key |
| `jina` | Jina | API key | Set a Jina API key |
| `kagi` | Kagi | API key | Set a Kagi API key |
| `searxng` | SearXNG | Endpoint | Set a SearXNG instance endpoint |
| `duckduckgo` | DuckDuckGo | None | Always available (default final fallback) |

## Architecture / Project Layout

```
dsh-web-search/
├── patch.web.yml            # --patch overlay: inserts src/index.js into the web profile
├── src/
│   ├── index.js             # Static plugin host entry: ctx.web provider / remote ops / fetch transport
│   ├── host-core.js         # Host-side pure functions (credentials, query parsing, per-provider request/response normalization)
│   ├── interaction.js       # Settings-page interaction state machine (pure reducer, unit-tested)
│   ├── remote.js            # websearch Remote namespace host (WebSearchController)
│   └── client/
│       └── bundle.js        # Browser half: hand-written __ModuleLoader__ factory bundle (no bundler)
├── tests/
│   ├── host-core.test.mjs       # Host-core pure function tests
│   ├── interaction.test.mjs     # Reducer interaction tests
│   ├── remote-contract.test.mjs # Remote RPC contract tests
│   └── client-bundle.smoke.mjs  # Client bundle factory contract smoke test
└── package.json             # exports["./client"] + dsh.client manifest
```

Design highlights:

- **Provider registry** — declared in `PROVIDER_SPECS`; `resolveCandidates()` orders providers by configured order/excludes.
- **Fallback chain** — `executeSearch()` tries providers in order, checks credential availability first, falls back on failure/empty results, and returns an error result (does not throw) when everything fails.
- **HTTP transport** — native `fetch` in the host realm.
- **`ctx.web` injection** — registers a provider with id `dsh-web-search` unconditionally; selection is decided by the web row config's `searchProvider`. When the patch is not applied, the native `web_search` throws `WEB_PROVIDER_AMBIGUOUS` (fail-loud).
- **Host ↔ client RPC** — the static plugin uses the Typert Remote protocol: host methods are registered via `ctx.typert.register` with `src-json` codecs; the client bundle mounts the `websearch` namespace itself via `ctx.remote.$mount`.

## Development / Testing

Fresh clone: `git clone` → `pnpm install` (installs the `@deepseek-ai/*` peer/dev deps from the registry, see `.npmrc`) → the commands below.

```bash
npm test         # 127 pure-function tests (zero dependencies, standalone clone)
npm run test:rpc # 12 environment-dependent tests (resolves independently installed @deepseek-ai/*)
npm run prepublishOnly  # full 139 before publishing
```

139 tests split into two tiers:

| Tier | Suite | File | Count |
|---|---|---|---|
| Pure | Host core | `tests/host-core.test.mjs` | 90 |
| Pure | Interaction | `tests/interaction.test.mjs` | 37 |
| Env  | Remote contract | `tests/remote-contract.test.mjs` | 11 |
| Env  | Client bundle smoke | `tests/client-bundle.smoke.mjs` | 1 |

**`npm test`** runs the 127 pure-function tests. These import only `node:*` and `../src/host-core.js` / `../src/interaction.js` — both of which are zero-dependency pure ESM modules. A standalone clone without the deepseek-harness workspace can run `npm test` with no setup.

**`npm run test:rpc`** runs the 12 environment-dependent tests. These import `@deepseek-ai/dsh-typert-protocol` and `react`, resolved through the independently installed `@deepseek-ai/*` packages (`pnpm install` pulls them from the registry, no harness junction needed). A new clone can install and run the full test suite without the deepseek-harness workspace.

**`npm run prepublishOnly`** runs both tiers (all 139 tests) before publishing. All tests are plain Node scripts — no test framework.

## License

[MIT](./LICENSE) © DeepSeek