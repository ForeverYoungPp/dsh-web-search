# Design — Adapt `@ian_p/dsh-web-search` to DSH `0.2.0-rc.2`

**Change:** `adapt-dsh-0.2.0-rc.2` · **Backend:** openspec · **Train:** single — DSH `0.2.0-rc.2` only
**Inputs:** `explore.md`, `proposal.md`, `specs/plugin-distribution/spec.md`,
`specs/client-remote-integration/spec.md` (16 requirements / 34 scenarios — the acceptance boundary)

## Answer first

Three breakages, three edits, one manifest bump — and the two properties nothing proves today
become **real** checks against the **real** runtime code, not against a re-implementation of it:

| Breakage | Edit | Proven by |
| --- | --- | --- |
| Gate refuses the bundle (4 dead/stale `dsh*` peers) | `package.json` peers + version, `dsh-tools` removed | `evaluatePluginCompatibility()` imported from the **installed** `@deepseek-ai/dsh-app-boot@0.2.0-rc.2` |
| Client strict codec rejected (`schema` instead of `create()`) | `jsonCodec()` in `src/client/bundle.js` | the **installed** `@deepseek-ai/dsh-typert-registry@0.2.0-rc.2`, **both** faces (host import + client bundle) |
| Page registers on the built-in `settings.section` | slot registration → `plugins.item` | recording `slots` stub in the existing smoke suite |

Cost of that decision: **two test-only devDependencies** pinned to the train, a roughly rewritten
`pnpm-lock.yaml`, and ~270 authored lines. No runtime dependency changes; the published artifact
(`files: ["dist/", …]`) is unaffected by devDependencies.

## Decisions and the alternatives they reject

Every row names the alternative that was rejected and why — required by
`openspec/config.yaml` (`design.require_tradeoffs: true`).

### D1 — Prove the manifest against the real gate, not a copy of its rule

**Decision.** Add `@deepseek-ai/dsh-app-boot@0.2.0-rc.2` as a **test-only** devDependency and call
the exported gate in `tests/remote-contract.test.mjs`:

```js
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { createRequire } from 'node:module'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(getDshRuntimeVersion(), '0.2.0-rc.2')          // the runtime under test IS installed
assert.equal(evaluatePluginCompatibility(manifest), undefined)  // default runtime = installed app-boot
```

Evidence it actually produces: the exported gate (`dsh-app-boot/lib/index.js:286`, exported at
`:4137`) iterates `peerDependencies`, keeps only `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` names
(`:294`), resolves `workspace:` ranges to the runtime (`:295-299`) and tests
`semver.satisfies(runtimeVersion, range, { includePrerelease: true })` (`:300`). Passing means the
bundle is **not** pushed into `skippedBundles` — the exact reproduced failure. The extra
`assert.equal(getDshRuntimeVersion(), '0.2.0-rc.2')` removes the last free variable: the runtime
the gate evaluates against is read from the installed package, so a green run cannot be a green
run against the old train.

**Non-vacuous control.** The pre-change manifest is *not* shipped; its peer set is reconstructed as
a 5-key literal inside the test:

```js
const PRE_CHANGE_PEERS = { '@deepseek-ai/dsh-api-remotes': '^0.1.5-rc.3',
  '@deepseek-ai/dsh-tools': '^0.1.5-rc.3', '@deepseek-ai/dsh-typert-protocol': '^0.1.5-rc.3',
  '@deepseek-ai/dsh-web': '^0.1.5-rc.3', '@deepseek-ai/cordis': '^4.0.2' }
const verdict = evaluatePluginCompatibility({ name: '@ian_p/dsh-web-search', version: '0.1.5-rc.3', peerDependencies: PRE_CHANGE_PEERS })
assert.equal(Object.keys(verdict.peers).length, 4)   // all four dsh peers, cordis excluded by the gate
```

**Rejected — (b) re-implement the rule locally with `semver`.** Cheaper in lockfile churn (one
small package), but it tests *our copy* of the gate. The real gate's semantics are non-obvious in
exactly the ways a copy drifts: the `includePrerelease: true` flag (which is what lets a
prerelease range be satisfied at all), the `@deepseek-ai/dsh`-name filter that makes `cordis`
irrelevant, the `workspace:` rewrite, and the `identityField()` throw when a name/version is
missing on a mismatch. The spec names `evaluatePluginCompatibility()` by name; a stand-in cannot
satisfy "WHEN the compatibility gate is evaluated".
**Rejected — (c) resolving app-boot from an out-of-tree location** (e.g. an `npx` cache directory
like `~/.npm/_npx/<hash>/node_modules`). Machine-specific and not reproducible from the lockfile;
a committed test dependency must come from the registry. Not acceptable, as the brief states.

**Accepted cost (stated, not hidden).** `auto-install-peers=true` and
`strict-peer-dependencies=false` (`.npmrc`) mean the npm resolver also pulls app-boot's own peers
(`cordis-plugin-group/include/loader`, `dsh-launch-environment`, `dsh-home-paths`,
`dsh-system-prompt`, `cordis`) and dependencies (`ajv`, `js-yaml`, `semver`, `resolve.exports`,
`node-addon-require-builtin`, `@eslint-community/regexpp`, `dsh-package-manifest`,
`dsh-atomic-write`) — on the order of 15–20 extra lockfile entries, dev-only, never published.

### D2 — Prove the codec against the real validator, both faces, with the client half loaded as a bundle

**Decision.** Add `@deepseek-ai/dsh-typert-registry@0.2.0-rc.2` as a **test-only** devDependency and
validate every strict descriptor of the mounted contribution through **both** registry faces.

Which face is importable under plain Node matters, so state it exactly:

| Face | Artifact | How the test reaches it |
| --- | --- | --- |
| Host | `@deepseek-ai/dsh-typert-registry` → `lib/index.js` | **plain `import`** — `{ TypertRegistry }` is a normal ESM export |
| Client | `@deepseek-ai/dsh-typert-registry/client` → `lib/client.js` | **not importable**: the file *is* a `window.__ModuleLoader__.load({ id, factory })` bundle. Evaluate it in a `vm` sandbox with a `window` stub (the technique `tests/client-bundle.smoke.mjs` already uses), call `factory(require)` with `require('@deepseek-ai/cordis')` → the real installed cordis (its only external require, `lib/client.js:7`), then call the bundle's exported `apply(ctx)` with a ctx whose `reflect.provide(name, self)` **captures** the `TypertRegistry` instance (`Service` registers itself via `ctx.reflect.provide(name, self, check)` — `cordis/lib/index.js:1782`). |

Neither face exports `validateCodec` (`lib/index.js:577` exports only `TypertRegistry`,
`typertEndpoint`, `typertKey`, `typertPackageKey`; the client bundle exports only `apply`/`inject`).
The reachable public path for both is the `remotes` view: `registry.remotes.register(ctx, { package, descriptors })`
validates **before** touching `ctx.effect` (`lib/index.js:141-147`, `lib/client.js:1305-1315`), so a
stub ctx of `{ reflect: { provide }, logger: { warn }, effect: () => () => {} }` is sufficient.

```js
const ctxOf = () => ({ reflect: { provide: () => () => {} }, logger: { warn() {} }, effect: () => () => {} })
const probe = (descriptors) => ({ package: 'dsh-web-search-contract-probe', descriptors })

// accepted: the descriptor objects a real host receives from $mount()
assert.doesNotThrow(() => host.remotes.register(ctxOf(), probe(descriptors)))
assert.doesNotThrow(() => clientRegistry.remotes.register(ctxOf(), probe(descriptors)))

// the protocol contract the registry does NOT check, checked here (TypertSchema = { parse })
for (const d of descriptors)
  for (const codec of [d.result, ...d.parameters.map((p) => p.codec)])
    { assert.equal(typeof codec.create, 'function'); assert.equal(typeof codec.create().parse, 'function') }
```

Where the descriptors come from: `apply()` mounts the contribution through
`ctx.remote.$mount(contribution)`; the test's `$mount` stub captures that argument and reads
`.descriptors` — the same objects the host would validate. `tests/remote-contract.test.mjs` loads
the bundle through `globalThis.window` + `await import('../src/client/bundle.js')` (the
`tests/interaction.test.mjs` technique) so the descriptors stay **same-realm**; the client
*registry* is cross-realm by necessity, and the test therefore asserts on thrown **message
content** (`/strict codec has no create\(\) factory/`), never on `instanceof` or cross-realm object
identity.

**Non-vacuous control, without shipping the broken shape.** One probe descriptor spreads a real
descriptor and swaps only the codec for the exact pre-change shape:

```js
const PRE_CHANGE_CODEC = { mode: 'strict', typeSymbol: 'dsh-web-search#json', schema: { parse: (v) => v } }
const warped = [{ ...descriptors[0], result: PRE_CHANGE_CODEC }]
try { host.remotes.register(ctxOf(), probe(warped)); throw new Error('host validator accepted the pre-change shape') }
catch (e) { assert.match(String(e.message), /no create\(\) factory/) }        // lib/index.js:565
try { clientRegistry.remotes.register(ctxOf(), probe(warped)); throw new Error('client validator accepted the pre-change shape') }
catch (e) { assert.match(String(e.message), /no create\(\) factory/) }        // lib/client.js:1357
```

This is a faithful 3-key reconstruction of what all six descriptors shipped before the change, so
"the probe is rejected" entails "the pre-change client bundle would be rejected" — the spec's
negative control — without committing a broken bundle. Limit, stated for review: it reconstructs
the shape rather than re-running the git-archived file; checking out the previous revision at test
time would need git access inside the suite and was rejected as non-hermetic.

**Owner.** `tests/remote-contract.test.mjs` — it is already the "our shipped artifacts vs the
installed runtime contract" suite (`tests/remote-contract.test.mjs:13` imports
`@deepseek-ai/dsh-typert-protocol`), it is part of `pnpm run test:rpc` (the spec's "existing RPC
suite"), and the new codec check is the same kind of check as its existing `src-json` codec tests
(`:110`, `:129-140`), which stay unchanged. `tests/client-bundle.smoke.mjs` does **not** grow a
second copy of the codec assertions.

### D3 — The exact codec object

```js
// Client requires a strict codec exposing `create(): TypertSchema`, where TypertSchema is a
// { parse(value) } interface — a transparent passthrough works, no zod needed. The schema holds no
// state, so one shared object is handed out (the gateway calls create().parse(value) per decode).
var passthrough = { parse: function (value) { return value; } };
function jsonCodec() {
  return { mode: 'strict', typeSymbol: 'dsh-web-search#json', create: function () { return passthrough; } };
}
```

- **`create` returns a shared, already-built schema** — not a fresh object per call, not a
  locally memoized one. The consumer does not cache: `dsh-api-gateway/lib/index.js:1513` calls
  `codec.create().parse(value)` on **every** decode. A shared stateless `{ parse }` is one object
  for the process's lifetime instead of one per boundary value.
- **Rejected: memoize inside the bundle** (`create: () => cached ??= passthrough`) — the only
  in-package cache in the pipeline is `materializeSchema`'s `record.value ??= record.create()`
  (`lib/index.js:519`), and that path is for **schema** records, not codecs. A second cache in the
  bundle buys nothing.
- **Rejected: a fresh schema per call** — correct, but allocates per decode and implies the schema
  is per-materialization, which the protocol does not require (`TypertSchema` is just `{ parse }`,
  `dsh-typert-protocol/lib/types/types.d.ts:190-197`). The previous `schema:` field exposed the
  same shared object, so this is not a new mutation risk.
- **`typeSymbol` stays `'dsh-web-search#json'`.** The validator only requires it nonempty
  (`lib/index.js:564`); it names the wire type, and the wire shape (JSON passthrough) is
  unchanged. Changing it would alter wire identity for zero gain.

### D4 — The exact slot registration

```js
      var slots = ctx.get('slots');
      if (!slots) return;
      // One stable component per apply(), so the Plugins-page detail panel never remounts the
      // subtree; the same component serves the list card's one-liner and the detail page.
      var page = function (props) {
        if (props && props.view === 'summary') return t('summary');
        return React.createElement(components.WebSearchSettings, null);
      };
      slots.inject('plugins.item', function () {
        return slots.register(
          {
            name: 'plugins.item',
            id: 'web-search-providers',
            order: 12,
            label: function () { return t('title'); },
            locale: NS,
          },
          page,
        );
      });
```

- **`id: 'web-search-providers'`** — unchanged from today, and not `web-search` (the native page:
  `dsh-client-ui-settings-web-search/lib/client.js:309`). A `list` slot rejects a duplicate id at
  the same priority (`dsh-client-ui-slots/lib/index.js:181`), so non-collision is enforced, not
  assumed.
- **`order: 12`** — unchanged from today and already documented. **Rejected: native's `40`.** The
  list sorts by `(priority, order)` (`slots/lib/index.js:221`); borrowing 40 changes the plugin's
  documented position for no proven benefit, and 12 vs 40 is a pure preference.
- **`locale: NS` kept.** For a list entry the renderer turns `entry.locale` into the component's
  `props.t` seat (`dsh-client-ui-renderer/lib/client.js:721-724`), re-minted on each locale
  revision so children re-render on a language switch. The label thunk already follows the switch
  on its own; keeping `locale` costs one line, matches all three native registrations, and pins no
  new failure mode (`inject` already requires the `locale` service, so the renderer's
  `host.locale` is present).
- **`inject` omitted.** Native passes `inject: () => card.inject()` because its page needs the
  slot to supply form state (`.../settings-web-search/lib/client.js:310`, consumed as
  `props.useWebSearchCard/save/edit` in `WebSearchCard`, `:74-83`). This plugin has no
  `configForms` namespace: its page reads the remote namespace directly. **Rejected: routing the
  page's data through `inject`** — it would replace the reducer/state machine that
  `tests/interaction.test.mjs` covers with a slot-provided store, a far larger diff than the
  adaptation requires, with no contract asking for it.
- **The page still receives the namespace the way it does today**: `apply()` resolves
  `ctx.get('remote.websearch')` after `$mount` and closes it into the components it builds, so the
  slot only has to *render* the component. No change to the data flow.
- **`props.view` branch.** `plugins.item` is a list slot rendered twice per entry — as the list
  card's one-liner (`renderSlot("plugins.item", { view: "summary" }, { only: item.id })`,
  `dsh-client-ui-plugin-manager/lib/client.js:2266`) and as the detail page
  (`:2330`). Without the branch, each list card would render the full card list. The summary is a
  new short dictionary key per locale (`summary` in `EN`/`ZH`, next to `title`/`description` about
  `src/client/bundle.js:96`/`:128`) because `description` is a three-sentence paragraph — too long
  for a card one-liner. A new key beats reusing `title` (redundant with the card heading).
- **Reachability, resolved by evidence.** The plugin-manager's item ledger *is* the `plugins.item`
  slot: `items: ctx.slots.entries("plugins.item").map(…)` (`…plugin-manager/lib/client.js:57`),
  rendered as cards with `data-plugin-item={item.id}` (`:2260`). So registering on this slot is
  precisely what puts a page in the Plugins panel for an installed plugin. If the plugin-manager
  is not composed, the slot is undeclared and `register` would throw
  (`slots/lib/index.js:151`) — which is why the registration stays inside `slots.inject('plugins.item', …)`:
  the callback only runs once the slot exists.
- **Traded off:** the plan cannot prove *pixel* reachability from a test. The manual acceptance
  step in §Verification is the gate; the slot line is the isolated revert point if it fails.

### D5 — The client-bundle smoke test gains a recording stub

`tests/client-bundle.smoke.mjs` stubs `slots` as `null` (`:57`) and never exercises registration.
Replace that with a recorder and keep every current assertion (registration id, exports, `inject`
payload, `$mount` called, stylesheet token audit):

```js
  const slotsCalls = []
  const slots = {
    inject: (name, cb) => { slotsCalls.push(['inject', name]); return cb() },
    register: (options, component) => { slotsCalls.push(['register', options, component]); return () => {} },
  }
```

then assert, after `await exported.apply(stubCtx)`:

1. `slotsCalls[0]` is `['inject', 'plugins.item']` and there is exactly one `inject` call — so a
   wrong slot name, and the old `settings.section`, both fail;
2. the recorded `options.name === 'plugins.item'` and `options.id === 'web-search-providers'` (so
   `web-search` and the old `settings.section` id fail) and `options.order === 12`;
3. `typeof options.label === 'function'` and `options.label()` is a non-empty string;
4. `typeof component === 'function'`, `component({ view: 'summary' })` is a non-empty string, and
   `component({ view: 'page' })` returns a React element object;
5. `options.locale === 'dsh-web-search'` (the namespace must be the plugin's own).

The current `fakeRequire` React stub is `{}`; it becomes `{ createElement: () => ({ type: 'element' }) }`
so assertion 4 can exercise both branches without a renderer. `$mount`'s stub captures its argument
so a later assertion can see it if needed; the codec contract itself stays in
`tests/remote-contract.test.mjs` (D2) so the two suites do not duplicate it.

### D6 — devDependency and manifest mechanics, exactly

`package.json`, complete list of edits:

| Field | From | To |
| --- | --- | --- |
| `version` (`:3`) | `0.1.5-rc.3` | `0.2.0-rc.1` |
| `peerDependencies["@deepseek-ai/dsh-web"]` | `^0.1.5-rc.3` | `^0.2.0-rc.2` |
| `peerDependencies["@deepseek-ai/dsh-typert-protocol"]` | `^0.1.5-rc.3` | `^0.2.0-rc.2` |
| `peerDependencies["@deepseek-ai/dsh-api-remotes"]` | `^0.1.5-rc.3` | `^0.2.0-rc.2` |
| `peerDependencies["@deepseek-ai/dsh-tools"]` | `^0.1.5-rc.3` | **removed** |
| `peerDependenciesMeta["@deepseek-ai/dsh-tools"]` | `{ optional: true }` | **removed** |
| `peerDependencies["@deepseek-ai/cordis"]` | `^4.0.2` | `~4.0.4` |
| `devDependencies["@deepseek-ai/dsh-tools"]` | `0.1.5-rc.3` | **removed** |
| `devDependencies["@deepseek-ai/dsh-web"]` | `0.1.5-rc.3` | `0.2.0-rc.2` |
| `devDependencies["@deepseek-ai/dsh-typert-protocol"]` | `0.1.5-rc.3` | `0.2.0-rc.2` |
| `devDependencies["@deepseek-ai/cordis"]` | `^4.0.2` | `~4.0.4` |
| `devDependencies["@deepseek-ai/dsh-app-boot"]` | — | **added** `0.2.0-rc.2` (D1) |
| `devDependencies["@deepseek-ai/dsh-typert-registry"]` | — | **added** `0.2.0-rc.2` (D2) |
| `dsh.client`, `dsh.bundle`, `exports`, `files`, `scripts`, `engines` | — | unchanged |

Checking the removal before removing it: `@deepseek-ai/dsh-tools` is imported nowhere in `src/` or
`tests/` (grep: only `package.json` and `pnpm-lock.yaml` mention it); `tsconfig.types.json`
type-checks `src/host-core.js` alone, which imports no dsh package; `@deepseek-ai/dsh-web` is
likewise imported nowhere (reached via `ctx.get('web')`, `src/index.js:407`) but stays as a
devDependency because it installs the peer the plugin configures and criterion 4 wants the target
train resolved. The only dsh import in the package is
`src/remote.js:29` + `tests/remote-contract.test.mjs:13` → `@deepseek-ai/dsh-typert-protocol`, which
stays. `@deepseek-ai/dsh-api-remotes` is named by `dsh.client.inject` (`package.json:55`) — see §Contracts.

Both new devDependencies are pinned **exact** to the train, matching the existing convention for
dsh devDependencies and the single-train decision. The cordis devDependency moves to `~4.0.4` for
the same reason: leaving it at `^4.0.2` would let `pnpm install` resolve a cordis the peer range
forbids. **Traded off:** `~4.0.4` rejects later 4.x releases, exactly as the train's own packages
do (`@deepseek-ai/dsh-app-boot`, `@deepseek-ai/dsh-typert-registry` both declare `~4.0.4`).

### D7 — Documentation: the three false claims and their minimal edits

| File | Claim that is now false | Minimal edit |
| --- | --- | --- |
| `docs/DESIGN.md` header (`:7`) | "verified against … **`0.1.5-rc.3`**" | `0.2.0-rc.2` |
| `docs/DESIGN.md` §1 codec row (`:13`) | predicts the `create()` change as a future risk, cites `dsh-typert-registry/lib/client.js:1342` / `lib/index.js:550` and `0.1.7-rc.1` | state what **is** done: 0.2.0 requires `create: () => TypertSchema`, enforced at `lib/index.js:565` / `lib/client.js:1357`, so the client descriptors ship `{ mode: 'strict', typeSymbol, create: () => ({ parse }) }`; drop the prediction |
| `docs/DESIGN.md` §4 slot row (`:16`) + bullet | "Settings slots: `settings.section` list; the page registers `{ id, order: 12 }`" | `plugins.item`, the plugin-manager's list slot; the page id/order are unchanged |
| `docs/DESIGN.md` §7 first bullet | "Moving the host to `0.1.7-rc.1`+ requires the codec change …" | replace with the completed adaptation (train, codec, slot) and drop the resolved gap |
| `README.md:31`,`:34`,`:41` | DSH `0.1.5-rc.3` install command, peer table version, `@deepseek-ai/cordis` `^4.0.2`, and the "peers at the same train version" sentence | `0.2.0-rc.2`; cordis `~4.0.4`; note the peers are `^0.2.0-rc.2` |
| `README.md:128` | "isolated settings **section** … (id `web-search-providers`, order 12)" | "plugin page on the `plugins.item` slot (id `web-search-providers`, order 12) inside the Plugins page", native page keeps its own `web-search` page |
| `README.md:156`,`:167`,`:174-177` | `134 pure + 12 environment` counts and "resolves the `0.1.5-rc.3` peers" | new counts **taken from the actual run** (not invented here) and `0.2.0-rc.2`; add the new suite rows |
| `README_ZH.md` | the same three spots (install command / peer table, settings-page paragraph, test-count lines) | mirrors of the above |

Not edited: `README.md:37` ("those packages are declared as peers at the same train version") stays
true; the `dsh.client`/patch narrative stays true.

### D8 — Verification order, evidence, and the review budget

Strict TDD (`openspec/config.yaml: strict_tdd: true`), so tests come first and must be seen red for
the right reason:

| Step | Action | Expected result |
| --- | --- | --- |
| 0 | Add the two devDependencies to `package.json`; `pnpm install` | lockfile rewritten; **no** source change yet |
| 1 | Add `tests/manifest.test.mjs`; wire it into `pnpm test`; extend `tests/remote-contract.test.mjs` and `tests/client-bundle.smoke.mjs` | **red**: gate reports the four `^0.1.5-rc.3` peers; `create` missing on all descriptors; slot recorded as `settings.section`; manifest guards report `0.1.5-rc.3`, `@deepseek-ai/dsh-tools`, wrong version |
| 2 | Edit `package.json` (D6) and `src/client/bundle.js` (D3, D4, dictionaries) | **green**: `pnpm test`, `pnpm run test:rpc`, `pnpm run typecheck` |
| 3 | Edit the docs (D7); re-run all three commands | green; counts in docs match the printed counts |
| 4 | Manual acceptance on a real `0.2.0-rc.2` host | Plugins page lists a "Search providers" card with the one-liner; opening it renders provider state and the drag/save/test controls work; the native web-search page is still present. Record the evidence (log/screenshot). |

Command → evidence:

| Command | Evidence |
| --- | --- |
| `pnpm test` | the 3 pure suites: manifest guards (train version, no dead peer, no runtime version sniffing, mechanisms unchanged) plus the unchanged 97 `host-core` and 37 `interaction` assertions → criterion 5, and the `plugin-distribution` pure-tier scenarios |
| `pnpm run test:rpc` | resolved-train assertion (`0.2.0-rc.2`), gate admits / pre-change rejected, strict descriptors accepted by host **and** client validators, pre-change codec shape rejected by both, recording-stub slot assertions, unchanged smoke + stylesheet audit → criteria 1, 2, 3 and 4 |
| `pnpm run typecheck` | `tsc -p tsconfig.types.json` over untouched `src/host-core.js` |
| `pnpm ls @deepseek-ai/dsh-web @deepseek-ai/dsh-typert-protocol @deepseek-ai/dsh-app-boot` | the human-readable resolved-tree evidence for criterion 4 (the suite asserts the same fact in-process) |

`tests/manifest.test.mjs` (new, pure tier, zero installed dependencies). One pure function over
`{ manifest, sources }` returning the offending peer names, so the non-vacuous control is the same
function used twice:

1. version is on the `0.2.0` line (`/^0\.2\.0(?:-rc\.\d+)?$/` — states the train without a
   change-detector on the exact RC);
2. every `@deepseek-ai/dsh*` peer range is exactly `^0.2.0-rc.2`, and no peer range mentions
   `0.1.5` — run against the real manifest (pass) and the pre-change peer literal (fail);
3. `@deepseek-ai/dsh-tools` absent from `peerDependencies` **and** `peerDependenciesMeta`; every
   dsh peer must be named by an import in `src/`+`tests/` **or** by `dsh.client.inject` — real
   manifest passes, the pre-change literal fails **naming `@deepseek-ai/dsh-tools`**;
4. `@deepseek-ai/cordis` peer is `~4.0.4`;
5. no compatibility decision reads a runtime-reported DSH version: scan `src/**/*.js` for
   `getDshRuntimeVersion`, `DSH_VERSION`, `dshVersion`, `process.env.DSH`, `semver` — must find
   nothing, with the same scanner asserted to **fail** on a literal snippet containing
   `getDshRuntimeVersion`;
6. `dsh.client.inject` is `["@deepseek-ai/dsh-api-remotes"]`, `dsh.bundle.patch` is
   `"./cordis.patch.yml"`, `dsh.client.platform` is `"web"` (the "mechanisms unchanged" requirement).

**Review workload — honest numbers.** Authored diff: `package.json` ≈ 12 lines,
`src/client/bundle.js` ≈ 15, `tests/manifest.test.mjs` ≈ 75 (new), `tests/remote-contract.test.mjs`
≈ 110, `tests/client-bundle.smoke.mjs` ≈ 30, docs ≈ 35 → **≈ 275 authored lines**. Plus
`pnpm-lock.yaml`, which is rewritten across the dsh sections (train bump + `dsh-tools` subtree out,
`app-boot`/`typert-registry` trees in): order-of-magnitude 200–300 changed generated lines.

**Delivery decision under `ask-on-risk`:** proceed as **one PR** while authored lines stay ≈ ≤ 300
and the lockfile is treated as generated. If the reviewer counts the lockfile toward the 400-line
budget — or if authored lines cross ~300 — **pause and ask** which way to go before applying; do
not invent a chain strategy and do not take a `size:exception`. The change is deliberately **not**
split across PRs: peers without the codec fix produce a bundle that loads and then throws at
`$mount`, and the codec fix without the peers produces a bundle that never loads, so every slice
except "manifest + codec + slot together" is a broken intermediate. If a split is demanded, the
only honest cut is docs in a second commit.

## Contracts (exact shapes the tests pin)

```text
manifest contract      version = 0.2.0-rc.1
                       peerDependencies: dsh-web|dsh-typert-protocol|dsh-api-remotes = ^0.2.0-rc.2, cordis = ~4.0.4
                       no dsh-tools in peerDependencies / peerDependenciesMeta
                       dsh.client.inject = ["@deepseek-ai/dsh-api-remotes"]   (declared use of the api-remotes peer)
                       dsh.bundle.patch = "./cordis.patch.yml"

codec contract         { mode: 'strict', typeSymbol: 'dsh-web-search#json', create: () => ({ parse }) }
                       create() must be a function; create().parse must be a function

slot contract          slots.inject('plugins.item', …) → register({ name: 'plugins.item',
                         id: 'web-search-providers', order: 12, label: thunk, locale: 'dsh-web-search' }, component)
                       component({ view: 'summary' }) → string; component({ view: 'page' }) → element
```

The dead-peer rule's "declared use" includes `dsh.client.inject`. That is a deliberate reading, not
a loophole: `@deepseek-ai/dsh-api-remotes` is a real runtime dependency of the browser half (it is
what provides `ctx.remote.$mount`), and the parent-confirmed decision keeps that peer. **Traded
off:** the check is slightly looser than "imported in `src/` or `tests/`" — accepted because the
stricter reading would force removing a peer the confirmed decisions keep, and because the check
runs in both directions (an `inject` entry that is not a declared peer also fails).

## Unchanged by design (guardrails)

`src/index.js`, `src/host-core.js`, `src/remote.js` (the 5 `websearch` verbs, `WebSearchController`,
`TypertRemoteService`, the SRC `markRemote` fallback, the `src-json` host descriptors),
`scripts/build.mjs` (copy-only build), the hand-written bundle format,
`cordis.patch.yml`/`patch.web.yml` (`- id: web` `searchProvider`/`fetchProvider`), the credential
record layout, `docs/DESIGN.md` policies (60 s timeout, sequential first-success chain, no
racing/merging/retry/cache, snippet cleaning, no pre-slicing), and `tsconfig.types.json`. No
bundler, no new runtime dependency, no generated Remote artifact pipeline.

## Risks and limits

| Risk | Handling |
| --- | --- |
| `plugins.item` pages only render inside the plugin-manager panel. | Evidence says the panel's item ledger *is* the slot (`plugin-manager/lib/client.js:57`). Still an explicit manual acceptance step (D8 step 4); failure blocks acceptance and reverts only the slot line. |
| The lockfile could still resolve `0.1.5-rc.3`; green tests would prove nothing. | The suite asserts `getDshRuntimeVersion() === '0.2.0-rc.2'` and the installed version of each dev train package; criterion 4 also asks for `pnpm ls` output. |
| `^0.2.0-rc.2` admits later `0.2.x` prereleases (and `0.2.0` final). | Accepted in the proposal as the cost of a stable single-train range. |
| The stub ctx for `new TypertRegistry(ctx)` is only assumed sufficient (verified by reading `Service`, `reflect.provide`, and the `RemoteStore.register` order, not by execution during design). | Step 1 of the TDD order fails loudly if it is not; the fallback is `registry.remotes` reached via the same `provide` capture with a richer stub (`logger`/`effect` are already supplied). Recorded as an unverified assumption for apply. |
| Cross-realm objects from the client registry bundle. | Assert on thrown **message content** and accept/reject decisions only; the descriptors themselves are loaded same-realm. |
| `@deepseek-ai/dsh-app-boot`'s dev-only tree is large. | Accepted (D1); alternate (b) documented and rejected; the tree never ships (`files` = `dist/` + docs + patch file). |
| New locale key `summary` could drift out of parity between `EN` and `ZH`. | Not guarded by a test (existing dictionaries have no parity check either); a one-line smoke assertion on `t('summary')` non-emptiness is included, full parity is a noted gap. |
| `SNIPPET_MAX = 150` rests on external documented Anthropic behaviour, not on DSH code. | Unchanged in this change; recorded as a standing limitation, not silently assumed fixed. |

## Quick verify checklist for the reviewer

- [ ] `package.json` matches the D6 table exactly, including the two new exact-pinned devDependencies.
- [ ] `src/client/bundle.js` diff is confined to the codec comment/codec, the two `summary` keys, and the slot block (no change to the reducer, styles, or provider card).
- [ ] `pnpm test` includes `tests/manifest.test.mjs`, and that file's dead-peer/no-sniffing checks are each shown failing on a literal pre-change input.
- [ ] `pnpm run test:rpc` fails if the codec reverts to `schema` or the slot reverts to `settings.section` (mutate, observe red, revert).
- [ ] Manual acceptance evidence for the Plugins-page card is attached to the verification artifact.

## Next step

Proceed to implementation planning (`tasks`) with this design as the contract: manifest edits (D6) →
client bundle edits (D3, D4) → tests (D8) in red-first order → docs (D7) → manual reachability
acceptance. Growth path if review changes are demanded: commit the docs separately; do not split the
manifest/codec/slot change.
