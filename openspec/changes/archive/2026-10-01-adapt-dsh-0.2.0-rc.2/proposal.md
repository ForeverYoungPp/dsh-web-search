# Adapt `@ian_p/dsh-web-search` to DSH `0.2.0-rc.2`

**Status:** proposed · **Backend:** openspec · **Train:** single — DSH `0.2.0-rc.2` only

## Intent (problem statement)

The plugin cannot load on DSH `0.2.0-rc.2` (the current `latest`/`next` dist-tag), and its
browser half would throw even if the host bundle loaded. Three independent breakages, all
verified in `openspec/changes/adapt-dsh-0.2.0-rc.2/explore.md`:

1. **Compatibility gate refuses the plugin.** `evaluatePluginCompatibility()`
   (`dsh-app-boot/lib/index.js:286`, invoked from `loadProfileDirectory()` at `:930`) requires
   every `@deepseek-ai/dsh*` peer in `peerDependencies` to satisfy the runtime version
   (`includePrerelease: true`). The plugin declares four such peers at `^0.1.5-rc.3`
   (`package.json:28-31`), so the profile bundle is pushed into `skippedBundles` and unloaded.
   Reproduced: `Plugin @ian_p/dsh-web-search@0.1.5-rc.3 is incompatible with dsh 0.2.0-rc.2`.
2. **Client strict-codec contract changed.** 0.2.0 requires a strict `TypertCodec` to expose
   `create: () => TypertSchema` (`dsh-typert-protocol/lib/types/types.d.ts:199-214`), enforced at
   `dsh-typert-registry/lib/index.js:565` and the identical client-side validator. The plugin
   still ships `{ mode: 'strict', typeSymbol, schema }` (`src/client/bundle.js:35-36`) for all
   6 descriptors (`:39-86`), so `ctx.remote.$mount(contribution)` (`:580`) throws and the
   settings page never registers.
3. **Settings page uses a non-standard slot.** The page registers the built-in
   `settings.section` slot (`src/client/bundle.js:593-598`) instead of the 0.2.0 standard
   extension point `plugins.item` (declared as a child of the plugin-manager `main` panel,
   `dsh-client-ui-plugin-manager/lib/client.js:3725-3728`; used by the native `web-search` page
   at `dsh-client-ui-settings-web-search/lib/client.js:307-310`).

The plugin's own suites still pass — but only because `pnpm test` / `pnpm run test:rpc` resolve
against the project's `node_modules/@deepseek-ai/*`, which is still the `0.1.5-rc.3` train.
Green tests therefore prove nothing about the target train.

**Why now:** `0.2.0-rc.2` is the published current train. On it the plugin is a no-op: it
installs, warns, and disappears. Every additional day on `0.1.5-rc.3` widens the drift between
what the manifest claims and what the runtime does.

## Confirmed product decisions

These are parent-confirmed and are not reopened by this proposal.

| Decision | Resolution |
|---|---|
| Train support | Single train: DSH `0.2.0-rc.2` only. No dual-train support, no runtime version sniffing. |
| Peer ranges | `^0.2.0-rc.2` for `@deepseek-ai/dsh-web`, `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/dsh-api-remotes`; `@deepseek-ai/cordis` becomes `~4.0.4` (the 0.2.0 train's own declaration). |
| `@deepseek-ai/dsh-tools` | Removed from `peerDependencies`. It is imported nowhere in `src/` or `tests/`, so it is a dead declaration that can only produce false incompatibility warnings. Removal is a manifest-honesty change, not a feature removal: all four functional surfaces stay (host fallback chain, `websearch` Remote namespace with its 5 verbs, settings page, credentials). |
| Package version | `0.2.0-rc.1`, mirroring the DSH train. Publishing stays a user decision; a prerelease publish needs `--tag rc`. |
| Settings slot | Move to the 0.2.0 standard slot `plugins.item`, keeping the plugin's own non-colliding id (the native page already uses `web-search`). |
| Dependencies / build | No new runtime dependency. The hand-written client bundle and the copy-only build (`scripts/build.mjs`) stay. |

## Scope

In scope:

- Four peer/version manifest edits in `package.json` (peers, removal of the dead `dsh-tools`
  peer and its `peerDependenciesMeta` entry, package version).
- `jsonCodec()` shape fix in `src/client/bundle.js` — `schema` → `create: () => TypertSchema`.
- Slot migration in the same file — `settings.section` → `plugins.item`.
- devDependency bump to the `0.2.0-rc.2` train so the suites exercise the real target.
- Test coverage for the two things no test covers today: client strict descriptors, and the
  settings-page slot registration.
- Doc updates that still state the 0.1.5 train and the old slot: `README.md` (peer table,
  settings-page section, test counts), `README_ZH.md`, `docs/DESIGN.md` §1 codec row / §4 slot
  description / §7 known gaps.

### Non-goals

- Dual-train compatibility and any runtime version sniffing or version-conditional code paths.
- Any change to the provider fallback chain, its ordering, or the host-then-client architecture.
- Any change to snippet or answer policies.
- New providers, new UI, new settings surfaces.
- The `dsh.client` / `bundle.patch` mechanisms and the `cordis.patch.yml` / `patch.web.yml`
  override rows.
- Publishing, tagging, or release automation.

## Affected areas (exact paths)

| Path | Change |
|---|---|
| `package.json` | Peer ranges (`:28-31`), remove `@deepseek-ai/dsh-tools` peer + its meta entry, version (`:3`), devDependency pins (`:73-75`). `dsh.client.inject` (`:54-56`) stays. |
| `src/client/bundle.js` | `jsonCodec()` (`:35-36`) → `create()`; slot registration (`:593-598`) → `plugins.item`; `$mount` (`:580`) unchanged. |
| `tests/client-bundle.smoke.mjs` | `slots` is stubbed as `null` (`:57`), so registration is never exercised; needs a recording stub asserting slot name/id/order. |
| `tests/remote-contract.test.mjs` | Covers only host `src-json` descriptors (`:110`, `:129-140`); add coverage of the client bundle's strict descriptors against the 0.2.0 contract. |
| `pnpm-lock.yaml` | Expected to change with the devDependency bump. |
| `README.md`, `README_ZH.md` | Peer table (`README.md:41`, `README_ZH.md:41`), settings-page description (`:128`), test-count line (`:167`). |
| `docs/DESIGN.md` | §1 codec row (`:13`), §4 slot description (`:16`), §7 known gaps; header train statement (`:7`). |

Explicitly unchanged: `src/index.js`, `src/host-core.js`, `src/remote.js`, `scripts/build.mjs`,
`cordis.patch.yml`, `patch.web.yml`, `tsconfig.types.json`.

## Success criteria

Each criterion is falsifiable and bound to a command or artifact.

| # | Criterion | Proof |
|---|---|---|
| 1 | `evaluatePluginCompatibility` returns no issue for the new manifest against runtime `0.2.0-rc.2` — the gate that currently refuses the plugin. | Compatibility-gate check; the current manifest produces the reproduced `... is incompatible with dsh 0.2.0-rc.2` failure. |
| 2 | The client contribution's descriptors satisfy the 0.2.0 `create()` contract, and the check would fail on the current `schema` shape. | New strict-codec registration check (test) asserting a callable `create` returning a parseable schema. |
| 3 | The settings page registers on `plugins.item` with the expected id and order. | Test with a recording `slots` stub asserting slot name, id, and order — not inspection. |
| 4 | `pnpm test`, `pnpm run test:rpc`, `pnpm run typecheck` all green **with devDependencies resolved to the `0.2.0-rc.2` train**. | Command output plus resolved-tree evidence showing `0.2.0-rc.2`, not `0.1.5-rc.3`. |
| 5 | No behavioural regression in documented policies: 60 s timeout, sequential first-success chain, no racing/merging/retry/cache, snippet cleaning. | Existing `pnpm test` / `pnpm run test:rpc` suites, unchanged and green. |

## Risks

| Risk | Handling |
|---|---|
| `plugins.item` pages only render inside the plugin-manager panel. | Confirm the page is reachable when the plugin is installed; treat as an explicit acceptance check before considering the change done. |
| The worktree/lockfile might still resolve `0.1.5-rc.3`; a green run against 0.1.5 fixtures proves nothing. | Criterion 4 requires resolved-tree evidence, not just green output. |
| `^0.2.0-rc.2` also admits later `0.2.x` prereleases. | Accepted deliberately as the cost of a stable single-train range. |
| `SNIPPET_MAX = 150` rests on Anthropic's documented `cited_text` ceiling, not on DSH code. | It cannot be re-verified from this repository; the comment stays as-is and this limitation is recorded, not silently assumed fixed. |
| Removing the `dsh-tools` peer could surprise a downstream consumer relying on it. | It is imported nowhere in `src/` or `tests/` and is `optional: true`; the four functional surfaces are unaffected. |

## Rollback

The change is confined to a manifest, one client bundle file, tests, and docs — no data, no
migration, no persistent state. Rollback is `git revert` of the change commit(s) plus
`pnpm install` to restore the previous lockfile resolution; the published artifact of the
previous version is unaffected because publishing is out of scope here. If the migrated page
proves unreachable under `plugins.item`, reverting only the slot line restores the previous
registration while the codec and peer fixes stay independently useful.

## Proposal question round

Not applicable — the orchestrator supplied parent-confirmed product decisions and instructed that
no user interview take place. The assumptions carried forward are the decision table above, the
non-goals, and the four listed risks. The one assumption worth naming for review is that
`plugins.item` remains the correct and reachable extension point for a plugin-owned page in
`0.2.0-rc.2`; if that is wrong, the slot line is the isolated revert point.

## Next step

Proceed to spec/tasks for `adapt-dsh-0.2.0-rc.2`, using this proposal's scope, non-goals, and
success criteria as the acceptance boundary.
