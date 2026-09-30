# Tasks — Adapt `@ian_p/dsh-web-search` to DSH `0.2.0-rc.2`

Change: `adapt-dsh-0.2.0-rc.2` · Backend: openspec · Train: single — DSH `0.2.0-rc.2` only
Scope boundary: `proposal.md` (scope, non-goals, success criteria) + `specs/plugin-distribution/spec.md`
and `specs/client-remote-integration/spec.md` (16 requirements / 34 scenarios). D1–D8 in `design.md`
are decided; these tasks execute them and do not redesign them.

Work happens on a feature branch. Every task closes with one work-unit commit (Conventional
Commit message; tests and docs live with the behavior they describe), except task 9, which is a
pure verification task with no diff by design.

## Review Workload Forecast

| Field | Value |
| --- | --- |
| Estimated changed lines | ≈280 authored (`package.json` ≈15, `src/client/bundle.js` ≈15, `tests/manifest.test.mjs` ≈75 new, `tests/remote-contract.test.mjs` ≈110, `tests/client-bundle.smoke.mjs` ≈30, docs ≈35); plus 200–300 **generated** `pnpm-lock.yaml` lines |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR. Fallback if the lockfile is counted: PR 1 (task 1: dev-dependency train bump + lockfile) → PR 2 (tasks 2–8: manifest peers, codec, slot, tests, docs) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium
```

**Lockfile treatment (the unresolved question, answered explicitly).** `pnpm-lock.yaml` is a
generated artifact — `pnpm install` writes it, no human authors it — so it is **excluded** from the
400-line authored budget, consistent with the work-unit rule that excludes generated files from the
authored count while still including them in the commit and in review. Under that reading the change
is ≈280 authored lines: Medium risk (within ~70 % of budget, with forecast drift possible), single
PR, no chain needed.

**If the reviewer counts the lockfile, the answer flips.** Authored + generated ≈ 480–580 lines in
one PR → High risk, over budget. The smallest honest split is then the boundary that already exists
in D8 step 0:

- **PR 1** — task 1 only: `package.json` devDependencies (two exact-pinned train packages) +
  `pnpm-lock.yaml` ≈ 200–300 generated lines, ~4 authored. A valid intermediate: existing suites
  still pass, nothing is half-adapted.
- **PR 2** — tasks 2–8: peers, removal of the dead `dsh-tools` peer, version, codec, slot, tests,
  docs ≈ 275 authored lines. Under budget without the lockfile.

No smaller split exists: peers without the codec fix produce a bundle that loads and then throws at
`$mount`, and the codec fix without the peers produces a bundle that never loads. Docs are already
the only further cut and are ~35 lines, not worth a third PR.

**Decision needed before apply: Yes.** Under `ask-on-risk`, the reviewer must confirm
(a) single PR with the lockfile treated as generated, or (b) the PR 1 → PR 2 chain above. No chain
strategy is selected, so it stays `pending` until that answer; no `size:exception` is taken.

## Traceability

| Proposal success criterion | Tasks | Command evidence |
| --- | --- | --- |
| 1. Gate admits the new manifest on `0.2.0-rc.2` | 3, 6, 9 | `pnpm run test:rpc` (gate check + pre-change control) |
| 2. Client descriptors satisfy `create()` | 4, 6, 7, 9 | `pnpm run test:rpc` (both registry faces + negative control) |
| 3. Page registers on `plugins.item` (id, order) | 5, 6, 7, 9 | `pnpm run test:rpc` (recording `slots` stub) |
| 4. All three commands green on the resolved `0.2.0-rc.2` tree | 1, 6, 7, 8, 9 | `pnpm test` · `pnpm run test:rpc` · `pnpm run typecheck` · `pnpm ls` |
| 5. No behavioural regression (timeout, chain, no cache, snippets) | 6, 8, 9 | existing unchanged suites in `pnpm test` / `pnpm run test:rpc` |

## Tasks

- [x] 1. Create the feature branch and add the two test-only train devDependencies, then resolve the
  lockfile. Edit `package.json` `devDependencies` only: add `@deepseek-ai/dsh-app-boot: "0.2.0-rc.2"`
  and `@deepseek-ai/dsh-typert-registry: "0.2.0-rc.2"` (exact pins, D1/D2). Leave peers, `version`,
  the `dsh-tools` removal and the `scripts.test` line untouched so task 2 stays red for the right
  reason. Run `pnpm install`. Expect the D1 accepted cost: app-boot's own dev tree adds ~15–20
  generated lockfile entries (dev-only, never published).
  Verify: `pnpm ls @deepseek-ai/dsh-app-boot @deepseek-ai/dsh-typert-registry` reports `0.2.0-rc.2`;
  `pnpm test` still green.
  Commit: `chore(deps): add 0.2.0-rc.2 test-only train devDependencies`.
  Rollback: remove the two entries and re-run `pnpm install`; nothing else depends on them yet.

- [x] 2. RED — manifest guards in a new `tests/manifest.test.mjs` (pure tier, zero installed
  dependencies, ~75 lines). Implement one pure function over `{ manifest, sources }` that returns the
  offending peer names, and call it from both directions so the non-vacuous control reuses the same
  code. Assert: (1) `version` matches `/^0\.2\.0(?:-rc\.\d+)?$/`; (2) every `@deepseek-ai/dsh*` peer
  range is exactly `^0.2.0-rc.2` and no range mentions `0.1.5`; (3) `@deepseek-ai/dsh-tools` is absent
  from `peerDependencies` **and** `peerDependenciesMeta`, and every dsh peer is named by an import in
  `src/`+`tests/` or by `dsh.client.inject`; (4) the `@deepseek-ai/cordis` peer is `~4.0.4`; (5) no
  compatibility decision reads a runtime-reported DSH version (scan `src/**/*.js` for
  `getDshRuntimeVersion`, `DSH_VERSION`, `dshVersion`, `process.env.DSH`, `semver`); (6)
  `dsh.client.inject === ["@deepseek-ai/dsh-api-remotes"]`, `dsh.bundle.patch === "./cordis.patch.yml"`,
  `dsh.client.platform === "web"`. Wire the file into the `test` script in `package.json`
  (`node tests/manifest.test.mjs`).
  Verify: `pnpm test` fails and names the offending items — train version, four `^0.1.5-rc.3` ranges,
  `@deepseek-ai/dsh-tools`, cordis `^4.0.2`; the same function fails on the pre-change 5-key peer
  literal, naming `@deepseek-ai/dsh-tools`; the version-sniffing scanner fails on a literal snippet
  containing `getDshRuntimeVersion`. Record the exact red output.
  Commit: `test(manifest): pin single-train manifest guards (red)`.
  Rollback: delete `tests/manifest.test.mjs` and restore the `test` script line.

- [x] 3. RED — real compatibility gate plus pre-change control in `tests/remote-contract.test.mjs`
  (D1). `import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'`,
  read the real manifest from `package.json`, assert `getDshRuntimeVersion() === '0.2.0-rc.2'`, then
  `assert.equal(evaluatePluginCompatibility(manifest), undefined)`. Add the `PRE_CHANGE_PEERS`
  5-key literal (`^0.1.5-rc.3` x4 + cordis `^4.0.2`) and assert the gate rejects 4 of them (cordis
  excluded by the gate's `@deepseek-ai/dsh*` name filter).
  Verify: `pnpm run test:rpc` fails on the real-manifest assertion with the four stale peers, while
  the pre-change control already passes. Record the exact red output.
  Commit: `test(rpc): pin the real compatibility gate against the installed runtime (red)`.
  Rollback: revert the added block in `tests/remote-contract.test.mjs`.

- [x] 4. RED — strict-codec check against both faces of the real registry, with its negative control,
  in `tests/remote-contract.test.mjs` (D2). Load `src/client/bundle.js` via `globalThis.window` +
  `await import(...)`; the `$mount` stub captures the contribution and reads `.descriptors`. Host
  face: plain `import { TypertRegistry }`. Client face: evaluate
  `@deepseek-ai/dsh-typert-registry/client` in a `vm` sandbox with a `window` stub, call
  `factory(require('@deepseek-ai/cordis'))`, call the bundle's `apply(ctx)` with a ctx whose
  `reflect.provide(name, self)` captures the registry. Register a probe
  `{ package: 'dsh-web-search-contract-probe', descriptors }` through `host.remotes.register(ctxOf(), …)`
  and `clientRegistry.remotes.register(ctxOf(), …)` with
  `ctxOf() = { reflect: { provide: () => () => {} }, logger: { warn() {} }, effect: () => () => {} }`;
  assert both accept. Then assert the protocol contract the registry does not check: every
  `d.result` and `d.parameters[].codec` has `typeof codec.create === 'function'` and
  `typeof codec.create().parse === 'function'`. Negative control: one probe descriptor spread from a
  real descriptor with `PRE_CHANGE_CODEC = { mode: 'strict', typeSymbol: 'dsh-web-search#json', schema: { parse: (v) => v } }`
  must be rejected by **both** faces, asserting thrown **message content**
  (`/no create\(\) factory/`), never `instanceof` (the client registry is cross-realm).
  Verify: `pnpm run test:rpc` fails on the accept assertions with the pre-change `schema` shape while
  the warped-codec control passes. Record the exact red output. If the stub ctx proves insufficient
  (recorded design assumption), fall back to the richer `logger`/`effect` stub the design names.
  Commit: `test(rpc): pin the 0.2.0 strict codec contract on both registry faces (red)`.
  Rollback: revert the added block in `tests/remote-contract.test.mjs`.

- [x] 5. RED — recording `slots` stub in `tests/client-bundle.smoke.mjs` (D5). Replace the
  `slots: null` stub with the recorder
  `{ inject: (name, cb) => { calls.push(['inject', name]); return cb() }, register: (options, component) => { calls.push(['register', options, component]); return () => {} } }`,
  and change the `fakeRequire` React stub from `{}` to
  `{ createElement: () => ({ type: 'element' }) }`. Add the five assertions: (1) `calls[0]` is
  `['inject', 'plugins.item']` with exactly one `inject` call; (2) `options.name === 'plugins.item'`,
  `options.id === 'web-search-providers'`, `options.order === 12`; (3) `typeof options.label === 'function'`
  and `options.label()` is non-empty; (4) `typeof component === 'function'`,
  `component({ view: 'summary' })` is non-empty, `component({ view: 'page' })` returns an element
  object; (5) `options.locale === 'dsh-web-search'`. Keep every existing assertion (exports, inject
  payload, `$mount` called, stylesheet token audit).
  Verify: `pnpm run test:rpc` fails with the recorded slot `settings.section` and the old component
  signature. Record the exact red output. The codec contract is **not** duplicated here (D2 owns it).
  Commit: `test(smoke): record slot registration instead of stubbing slots as absent (red)`.
  Rollback: revert the stub and the added assertions in `tests/client-bundle.smoke.mjs`.

- [x] 6. GREEN — the manifest edits (D6) and the client bundle edits (D3, D4) as one work unit, so the
  branch never holds a half-adapted bundle. `package.json`: `version` → `0.2.0-rc.1`; peers
  `@deepseek-ai/dsh-web`, `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/dsh-api-remotes` →
  `^0.2.0-rc.2`; `@deepseek-ai/cordis` → `~4.0.4`; remove `@deepseek-ai/dsh-tools` from
  `peerDependencies`, from `peerDependenciesMeta`, and from `devDependencies`; devDependencies
  `dsh-web` / `dsh-typert-protocol` → `0.2.0-rc.2`, `cordis` → `~4.0.4`, keep the two task-1 additions;
  `dsh.client`, `dsh.bundle`, `exports`, `files`, `engines` unchanged. Run `pnpm install`.
  `src/client/bundle.js`: replace the codec's `schema` field with the shared
  `var passthrough = { parse: function (value) { return value; } }` and
  `create: function () { return passthrough; }`, keeping `typeSymbol: 'dsh-web-search#json'` and the
  strict mode; move the registration to `slots.inject('plugins.item', …)` with
  `{ name: 'plugins.item', id: 'web-search-providers', order: 12, label: thunk, locale: NS }`,
  `inject` omitted, and the page component branching on `props.view === 'summary'` to `t('summary')`,
  otherwise `React.createElement(components.WebSearchSettings, null)`; add the short `summary` key to
  the `EN` and `ZH` dictionaries next to `title`/`description`. No change to the reducer, styles,
  provider card, `$mount` call, or the data flow.
  Verify: `pnpm test`, `pnpm run test:rpc`, `pnpm run typecheck` all green;
  `pnpm ls @deepseek-ai/dsh-web @deepseek-ai/dsh-typert-protocol @deepseek-ai/dsh-app-boot` shows the
  `0.2.0-rc.2` train, not `0.1.5-rc.3`.
  Commit: `fix(client,manifest): adapt peers, codec and settings slot to DSH 0.2.0-rc.2`.
  Rollback: revert this commit's `package.json` + `src/client/bundle.js` hunks and re-run
  `pnpm install`; the task-1 devDependency commit can stay (it is train-agnostic).

- [x] 7. TRIANGULATE — mutation matrix and the complementary cases. Add the cases the red tests do not
  yet cover: `t('summary')` non-empty in **both** `EN` and `ZH`, `$mount` returns a disposer, and the
  single-`inject` assertion made explicit. Then run the mutation matrix and record command + exact red
  output for each, reverting every mutation before the task ends (`git diff` clean):
  slot name → `settings.section`; page id → `web-search`; order → `40`; codec back to the bare
  `schema` shape; `@deepseek-ai/dsh-tools` re-added to `peerDependencies`. Each mutation must fail
  `pnpm run test:rpc` (or `pnpm test` for the manifest mutation).
  Verify: after all reverts, all three commands green again.
  Commit: `test: triangulate codec, slot and manifest guards (mutation-verified)`.
  Rollback: revert the added assertions; the mutation edits themselves are never committed.

- [x] 8. REFACTOR — docs (D7), the three now-false claims. `docs/DESIGN.md`: header train statement
  → `0.2.0-rc.2`; §1 codec row → **record what was done** (0.2.0 requires `create: () => TypertSchema`,
  enforced at `dsh-typert-registry/lib/index.js:565` / `lib/client.js:1357`; the client descriptors
  ship `{ mode: 'strict', typeSymbol, create: () => ({ parse }) }`) and drop the `0.1.7-rc.1`
  prediction; §4 slot row → `plugins.item`, plugin-manager's list slot, id/order unchanged; §7 first
  bullet → replace the resolved "codec change required" gap with the completed adaptation. `README.md`:
  install command / peer table / cordis range / "same train version" sentence → `0.2.0-rc.2`,
  `~4.0.4`, `^0.2.0-rc.2`; settings-page paragraph → "plugin page on the `plugins.item` slot
  (id `web-search-providers`, order 12) inside the Plugins page", native `web-search` page untouched;
  test-count lines and the resolved-peers line → counts **taken from the actual run** plus
  `0.2.0-rc.2`. `README_ZH.md`: mirrors of the same three spots.
  Verify: all three commands still green; the counts printed by `pnpm test` / `pnpm run test:rpc` equal
  the numbers now written in `README.md` and `README_ZH.md`.
  Commit: `docs: state the 0.2.0-rc.2 train, the create() codec and the plugins.item page`.
  Rollback: revert the doc commit; no code depends on it.

- [x] 9. Final verification and manual acceptance (D8 step 4). Map and run the five proposal success
  criteria to their exact commands: (1) gate check in `pnpm run test:rpc`; (2) both-face codec check in
  `pnpm run test:rpc`; (3) recording-stub slot assertions in `pnpm run test:rpc`; (4) `pnpm test`,
  `pnpm run test:rpc`, `pnpm run typecheck` plus `pnpm ls @deepseek-ai/dsh-web
  @deepseek-ai/dsh-typert-protocol @deepseek-ai/dsh-app-boot` as resolved-tree evidence; (5) the
  unchanged timeout / first-success chain / no-racing-merging-retry-cache / snippet assertions inside
  the existing suites. Then the one thing no test can prove: on a real `0.2.0-rc.2` host with the
  plugin installed, open the Plugins page and confirm the "Search providers" card with its one-liner
  is listed, that opening it renders provider state and the drag / save / test controls work, and that
  the native web-search page is still present. Record the evidence (log/screenshot). If the page is not
  reachable, the change is **not** done: revert only the slot line in `src/client/bundle.js` and
  re-assess (the proposal's criteria-5 risk and its isolated rollback point).
  Work unit: this task has no diff by design — a pure verification task is the documented N/A case for
  a commit; the evidence lands in the verify-phase artifact and the PR description. If verification
  finds a correction, commit it here (`fix:` / `docs:`).
  Rollback: not applicable (no diff); the slot-line revert above is the behavioral fallback.

## Notes for apply

- Strict TDD is active: tasks 2–5 must be observed red for the stated reasons before task 6 lands, and
  task 7 must be observed red per mutation. Do not merge the red tasks into the green task commit.
- Do not commit by file type: tasks 2–5 are red-contract work units; task 6 is the single behavioral
  work unit; task 8 keeps docs with the change they explain.
- Do not shrink the diff to fit the budget by deleting comments, docs, or tests — slice by work unit or
  report the overage.
- The runtime harness for this change is the real installed runtime reached by the tests
  (`pnpm run test:rpc` loads the real `dsh-app-boot` gate and the real `dsh-typert-registry`); no
  separate runtime harness exists in this repository, hence the explicit evidence lines per task.
