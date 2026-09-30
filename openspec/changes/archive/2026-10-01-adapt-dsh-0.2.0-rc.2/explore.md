# Explore — adapt-dsh-0.2.0-rc.2

Status: exploration only. No source changed. Backend: openspec. Single train: DSH `0.2.0-rc.2` only.

## Problem

The plugin still targets the `0.1.5-rc.3` train and the old settings integration slot. On DSH
`0.2.0-rc.2` it cannot load at all, and even if it could, its browser half throws at mount:

1. **Compatibility gate blocks the plugin.** `dsh-app-boot/lib/index.js:286`
   `evaluatePluginCompatibility()` requires every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*`
   entry in `peerDependencies` to satisfy the runtime version (semver, `includePrerelease: true`)
   and is invoked from `loadProfileDirectory()` (`dsh-app-boot/lib/index.js:930`). A mismatch is
   pushed into `skippedBundles` (silently unloaded; warning text at `:320`). The plugin declares
   four such peers at `package.json:28-31` (`^0.1.5-rc.3`), so none satisfies `0.2.0-rc.2`.
   Reproduced by parent: `Plugin @ian_p/dsh-web-search@0.1.5-rc.3 is incompatible with dsh
   0.2.0-rc.2`.
2. **Client strict-codec contract changed.** `0.2.0` requires a strict `TypertCodec` to expose
   `create: () => TypertSchema` instead of a `schema` field
   (`dsh-typert-protocol/lib/types/types.d.ts:199-214`). The registry rejects the old shape:
   `dsh-typert-registry/lib/index.js:565` and the identical
   `dsh-typert-registry/lib/client.js:1357` throw `strict codec has no create() factory`.
   The plugin's browser half returns `{ mode:'strict', typeSymbol, schema }`
   (`src/client/bundle.js:35-36`), used by all 6 descriptors of the contribution
   (`src/client/bundle.js:39-86`). That contribution is mounted at
   `src/client/bundle.js:580` (`ctx.remote.$mount(contribution)`), so the whole client half
   throws and the settings page never registers. `docs/DESIGN.md` §1 already predicted this
   ("`0.1.7-rc.1` replaces this with `create()`… fails at `$mount`").
3. **Non-standard settings slot.** The page registers `settings.section`
   (`src/client/bundle.js:593-598`, `{ id:'web-search-providers', order:12 }`). `settings.section`
   is the built-in sections slot (`dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`,
   "one settings page per list entry" for sections such as models/account/general/plugins). The
   0.2.0 standard extension point for a feature-owned plugin page is `plugins.item`, declared as
   a child of the plugin-manager's `main` panel
   (`dsh-client-ui-plugin-manager/lib/client.js:3725-3728`, list/root) and used by the native
   pages: `dsh-client-ui-settings-web-search/lib/client.js:307`, and identically
   `dsh-client-ui-settings-agent-loop/lib/client.js:158` and
   `dsh-client-ui-settings-shell/lib/client.js:182`.

## Affected files (exact paths)

- `package.json` — peer ranges (`:27-33`), devDeps pins (`:71-77`), package version (`:3`),
  `dsh.client.inject` (`:54-56`).
- `src/client/bundle.js` — `jsonCodec()` (`:35-36`) → `create()`; slot registration
  (`:593-598`) → `plugins.item`; `$mount` (`:580`, unchanged).
- `tests/client-bundle.smoke.mjs` — currently stubs `slots` as `null` (`:57`), so it never
  exercises the slot registration; needs a recording stub.
- `tests/remote-contract.test.mjs` — validates only the host (`src-json`) descriptors
  (`:110`, `:129-140`); no coverage of the client bundle's strict descriptors.
- `docs/DESIGN.md` — §1 codec row, §4 slot description, §7 "known gaps" all still describe
  the 0.1.5 train and the `settings.section` choice.
- `README.md` / `README_ZH.md` — peer table (`:42`) and "Settings page" section ("id
  `web-search-providers`, order 12").
- `cordis.patch.yml` / `patch.web.yml` — no change expected; the `- id: web` override row still
  exists at `dsh-base/cordis.patch.yml:472-476` with the same `searchProvider`/`fetchProvider`
  keys.

## Confirmed unchanged (do not plan work for these)

- `dsh-web` type/runtime surface: `ctx.web.registerSearchProvider`, `searchProviders`,
  `searchProviderId`, `WebRuntimeConfig` keys, `WEB_PROVIDER_AMBIGUOUS` — parent diffed zero
  lines; the `- id: web` row is present at `dsh-base/cordis.patch.yml:472-476`.
- `dsh.bundle.patch`, `exports["./client"]`, `dsh.client`, and
  `window.__ModuleLoader__.load({id,factory})` are still discovered (client packages in 0.2.0
  still advertise this; e.g. `dsh-client-ui-directory-picker-browse/lib/index.js:5-6`).
- Credentials API and record kinds; host Typert path `TypertRemoteService(ctx,key,{namespace})`
  and the SRC `markRemote` fallback (`src/remote.js:35-45`); host contribution uses `src-json`
  (`src/remote.js:57-72`), accepted unchanged (`validateCodec` short-circuits on `src-json`,
  `dsh-typert-registry/lib/index.js:563`).

## Unresolved questions / risks

1. **Peer range style.** `^0.1.5-rc.3` must become a range satisfied by `0.2.0-rc.2` under
   `includePrerelease`. Natural candidate `^0.2.0-rc.2` (for `0.x`, `>=0.2.0-rc.2 <0.3.0`).
   Note the gate compares every dsh-* peer against the single `@deepseek-ai/dsh` runtime version
   (`dsh-app-boot/lib/index.js:286-305`), not against each peer's own installed version. Open:
   exact range text and whether to permit future `0.2.x` (single-train says target 0.2.0-rc.2;
   a `^0.2.0-rc.2` range still admits later 0.2 prereleases). Also whether to keep the peers
   exact-pinned at `0.2.0-rc.2` in devDependencies (`package.json:73-75`).
2. **Which dsh-* peers the code honestly uses.** Only `@deepseek-ai/dsh-typert-protocol` is
   imported (`src/remote.js:29,35`); `@deepseek-ai/dsh-web` is reached through the runtime
   `ctx.get('web')` service (`src/index.js:407`); `@deepseek-ai/dsh-api-remotes` appears only in
   `dsh.client.inject` (`package.json:55`); `@deepseek-ai/dsh-tools` is imported nowhere in
   `src/` or `tests/`. So `@deepseek-ai/dsh-tools` looks like a **dead peer** whose stale range
   alone blocks loading. Open: remove it (fewer constraints, honest manifest) vs. bump it.
   `tsconfig.types.json` only checks `src/host-core.js`, which imports no dsh package.
3. **Proving "the settings page registers providers" with a test.** No current test touches the
   slot registration, and none validates the client bundle's strict codecs against the 0.2.0
   registry rules. Candidate: extend `tests/client-bundle.smoke.mjs` with a recording `slots`
   stub that captures `inject`/`register` and asserts the registered slot name/id/order and that
   `jsonCodec()`-produced descriptors expose a callable `create` returning `{ parse }`. Richer
   option: load the bundle's descriptors and run the real
   `dsh-typert-registry/lib/client.js` `validateCodec` rules. Rendering the React tree is still
   out of reach (`react-dom` is not a devDependency, `docs/DESIGN.md` §6).
4. **`plugins.item` availability.** It lives under the plugin-manager `main` panel
   (`dsh-client-ui-plugin-manager/lib/client.js:3725`), not under `settings.section`. Native
   pages gate registration on `ctx.configForms.whileServed([ns], ...)`
   (`dsh-client-ui-settings-web-search/lib/client.js:307`); this plugin has no host config
   namespace, so it registers a plain remote-driven page. Open: confirm the page shows when the
   plugin is installed but the plugin-manager panel is not mounted, and pick a non-colliding
   `id` (native uses `web-search`, `dsh-client-ui-settings-web-search/lib/client.js:309`).
5. **`SNIPPET_MAX = 150` comment accuracy** (`src/host-core.js:373`, and §3/§4 of
   `docs/DESIGN.md`). The 150 figure is Anthropic's documented `cited_text` ceiling, external to
   DSH. 0.2.0's native path still sources snippets from `cited_text`
   (`dsh-web-search-deepseek/lib/index.js:32-75`) with no code-side cap visible, so the comment
   appears still accurate; the claim should be re-confirmed against Anthropic docs rather than
   DSH code.
6. **Next published version.** Current `package.json:3` is `0.1.5-rc.3`. Options: `0.2.0-rc.1`
   (mirror the DSH train, requires `npm publish --tag rc` since npm refuses a prerelease on
   `latest`, `docs/DESIGN.md` §5) or a plugin-local bump. Open decision for the user.
7. **Test fixtures.** The stated green suites (`pnpm test` 37, `pnpm run test:rpc` 11) currently
   run against the project's own `node_modules/@deepseek-ai/*`, still the 0.1.5-rc.3 train.
   After the devDep bump the environment tests must be re-run and shown green against
   `0.2.0-rc.2`; `pnpm-lock.yaml` will change.

## Must stay unchanged

- Multi-provider fallback-chain behaviour and the host-then-client architecture:
  `src/index.js` chain orchestration, `src/host-core.js` pure policies, `src/remote.js` host
  namespace, `src/client/bundle.js` single-copy state machine.
- The hand-written client bundle and copy-only build (`scripts/build.mjs`); **no new runtime
  dependency** (build copies `src/` → `dist/`, `scripts/build.mjs:9-17`).
- The `websearch` Remote namespace, its 5 verbs, `WebSearchController` / `TypertRemoteService`,
  and the SRC `markRemote` fallback (`src/remote.js`).
- Credential-record layout (`dsh-web-search/*`, `api-key`/`grant`) and the `src-json` host
  descriptors.
- The `- id: web` `searchProvider`/`fetchProvider` override in both patch files, and the
  `window.__ModuleLoader__.load({ id, factory })` bundle format.
- `docs/DESIGN.md` policies (60 s timeout, no racing/merging/retry/cache, snippet cleaning,
  no pre-slicing of sources).

## Suggested verification for later phases (evidence only, not a plan)

- `node tests/client-bundle.smoke.mjs` after adding a recording `slots` stub — proves the page
  registration shape and the `create()` codec without a host.
- A descriptor-contract check against `dsh-typert-registry/lib/client.js` `validateCodec` rules
  (`:1354-1358`) would have caught the current failure; it does not exist today.
- `pnpm test`, `pnpm run test:rpc`, `pnpm run typecheck` all green against the bumped
  devDependencies.
