# Archive Report — `adapt-dsh-0.2.0-rc.2`

**Status:** PASS (archive complete)
**Change:** `adapt-dsh-0.2.0-rc.2`
**Repository:** `/home/fy/Projects/code/dsh-web-search`
**Branch:** `feature/adapt-dsh-0.2.0-rc.2` · **Closure HEAD:** `739d0de`
**Base:** `main` @ `d05efec` · 10 commits ahead of `main`
**Archived path:** `openspec/changes/archive/2026-10-01-adapt-dsh-0.2.0-rc.2/`
**Backend:** openspec (file-backed)

## Structured status and action context

Native `gentle-ai.sdd-status` v2 read as authoritative at archive time:

- `nextRecommended: archive`, archive dependency `ready`, apply `all_done`, verify `ready`.
- `taskProgress`: 9 total / 9 completed / 0 pending, `allComplete: true`.
- `artifactStore: openspec`; `planningHome` = repo-local `openspec/`.
- `actionContext.mode: repo-local`, `workspaceRoot` and `allowedEditRoots` both
  `/home/fy/Projects/code/dsh-web-search`. All archive writes and the move target are inside that
  root (resolved, no symlink escape).
- `relationships.sameDomainActiveChanges: []`; `dependsOn`/`supersedes`/`amends`/`conflictsWith`
  all empty.
- `verifyReport: missing` — treated as optional, not a gate. Native archive instructions state
  that neither a report nor task completion is an admission requirement.

## Artifacts read

- `openspec/changes/adapt-dsh-0.2.0-rc.2/proposal.md`
- `openspec/changes/adapt-dsh-0.2.0-rc.2/specs/plugin-distribution/spec.md`
- `openspec/changes/adapt-dsh-0.2.0-rc.2/specs/client-remote-integration/spec.md`
- `openspec/changes/adapt-dsh-0.2.0-rc.2/design.md`
- `openspec/changes/adapt-dsh-0.2.0-rc.2/tasks.md`
- `openspec/changes/adapt-dsh-0.2.0-rc.2/apply-progress.md`
- `openspec/changes/adapt-dsh-0.2.0-rc.2/explore.md`
- `openspec/config.yaml` (untracked project config; read for `rules` only, not committed)
- No `verify-report.md`, no legacy `sync-report.md` (verify was optional and not authored).

## Final task completion gate

Re-read the persisted `tasks.md` immediately before composition. Result:

- 9 `- [x]` implementation task lines.
- 0 `- [ ]` unchecked implementation task lines.
- `dependsOn` / Review Workload Forecast prose preserved byte-for-byte; no checkbox repair was
  needed and none was performed.

## Archive-time spec composition

Both domains are **new** — `openspec/specs/` was empty and no canonical
`openspec/specs/{domain}/spec.md` existed. Per the new-canonical rule, each change spec was copied
in full as the accepted domain spec, preserving every requirement and scenario verbatim. No
`## ADDED` / `## MODIFIED` / `## REMOVED` wrappers were synthesized, and no delta merge ran against
an empty canonical.

`cmp` confirmed both canonical files are byte-identical to their change specs after copy.

| Domain | Canonical path | Operation | Requirements |
| --- | --- | --- | --- |
| `plugin-distribution` | `openspec/specs/plugin-distribution/spec.md` | New full spec (copy) | 10 |
| `client-remote-integration` | `openspec/specs/client-remote-integration/spec.md` | New full spec (copy) | 6 |

### Requirement names (all new, copied verbatim)

`plugin-distribution`:

1. Single target train
2. Compatibility gate admits the bundle on the target runtime
3. Cordis peer matches the train's own declaration
4. No dead peer declarations
5. Package version mirrors the target train
6. Existing functional surfaces remain available
7. Existing behavioural contracts are preserved under the target train
8. Packaging and client-bundle authoring mechanisms stay unchanged
9. Host overrides and credential layout stay unchanged
10. Published documentation states the target train

`client-remote-integration`:

1. Strict codecs satisfy the 0.2.0 contract
2. Contribution mounts on the target runtime
3. Client strict descriptors are covered by a test
4. Settings page registers on the plugins.item slot
5. Slot registration is covered by a test
6. The page is reachable when the plugin is installed

### ADDED / MODIFIED / REMOVED

- **ADDED:** none recorded as delta operations (both domains are new full specs; the whole spec is
  newly canonical).
- **MODIFIED:** none.
- **REMOVED:** none. There is no removed requirement; the `@deepseek-ai/dsh-tools` peer removal is a
  manifest-honesty edit inside `plugin-distribution`, not the deletion of a spec requirement.
- **Superseded:** nothing was superseded.
- **Destructive merge:** none performed; no destructive approval was required or consumed.

## Same-domain collision

No other active change under `openspec/changes/*/specs/{domain}/spec.md` touches either domain
(`sameDomainActiveChanges: []`). No composition/archive order decision was needed.

## Verification evidence recorded at closure

Real command results reported at HEAD `739d0de` (from `apply-progress.md`, consistent with the
parent-validated apply phase):

- `pnpm test` — green: host-core 97 + interaction 37 + manifest 6 = **140** pass, 0 fail.
- `pnpm run test:rpc` — green: remote-contract **18** + the bundle smoke check.
- `pnpm run typecheck` — clean (exit 0).
- Resolved tree: the `0.2.0-rc.2` train (`dsh-web`, `dsh-typert-protocol`, `dsh-app-boot`,
  `dsh-typert-registry`); package `version: 0.2.0-rc.1`.
- Guardrail files byte-identical to `main`: `src/index.js`, `src/host-core.js`, `src/remote.js`,
  `scripts/build.mjs`, `cordis.patch.yml`, `patch.web.yml`, `tsconfig.types.json`,
  `tests/host-core.test.mjs`, `tests/interaction.test.mjs`.
- Five proposal success criteria mapped to commands and recorded green in `apply-progress.md`
  Task 9 table.

### Review-budget exception

- Authored diff vs `main` excluding `pnpm-lock.yaml` and `openspec/`: **460 insertions / 62
  deletions = 522 changed lines** across 8 files (`package.json`, `src/client/bundle.js`,
  `tests/manifest.test.mjs` (new), `tests/remote-contract.test.mjs`,
  `tests/client-bundle.smoke.mjs`, `README.md`, `README_ZH.md`, `docs/DESIGN.md`).
- **`size:exception` explicitly granted by the user** for the single PR at 522 authored changed
  lines, exceeding the 400-line review budget.
- Reason: the overage is entirely test evidence required by the specs (red contracts, non-vacuous
  negative controls, the mutation matrix), not scope growth. No test, doc, or comment was deleted
  or compressed to fit the budget.
- `pnpm-lock.yaml` is generated and excluded from the authored budget.

## Deviations carried into the record

1. **Dead-peer rule accepts a third evidence channel.** The rule reads "imported in `src/`+`tests/`
   or named by `dsh.client.inject`". `@deepseek-ai/dsh-web` is a parent-confirmed peer imported
   nowhere; it is reached through the capability seam `ctx.get('web')` in `src/index.js`. The
   checker accepts the capability-seam channel and documents it in `tests/manifest.test.mjs`
   `peerUseEvidence`. The rule stays non-vacuous: `@deepseek-ai/dsh-tools` is still rejected
   (mutation M5 proves it).
2. **`remotes.register` is one-argument in the real API.** Design's illustrative
   `remotes.register(ctxOf(), probe)` is wrong for the installed API: `RemoteStore.view` closes
   over ctx. Both registry faces are still reached through the public `remotes.register`.
3. **An extra `docs(sdd):` commit corrects line-accounting figures in `apply-progress.md`** instead
   of amending history (`739d0de`).

## Open human acceptance item — NOT verified

Proposal success-criterion 5's manual acceptance is **NOT done** and is recorded here as **open,
never as passed**:

> On a real `0.2.0-rc.2` host with `@ian_p/dsh-web-search@0.2.0-rc.1` installed, open the Plugins
> page (plugin-manager panel), confirm the "Search providers" card one-liner from the `summary`
> key, open it to confirm provider state and the drag / save / test controls, and confirm the
> native `web-search` page is still present.

No browser was available in this session; this is a human step. The
`client-remote-integration` spec makes it an explicit acceptance condition with an isolated revert
point: revert only the slot line in `src/client/bundle.js` if the page proves unreachable. Test
coverage at closure does not and cannot stand in for this check.

## Archive move

- Destination `openspec/changes/archive/2026-10-01-adapt-dsh-0.2.0-rc.2/` was confirmed absent
  before the move (no overwrite, no collision).
- `openspec/changes/adapt-dsh-0.2.0-rc.2/` moved to that destination after this report was written,
  so the report travels inside the archived change.
- Archived change is an audit trail: not modified or deleted after the move.

## Commit

ASCII-committed on `feature/adapt-dsh-0.2.0-rc.2` with a Conventional Commit message and no AI
attribution footer, scoped to `openspec/` only. No file outside `openspec/` was modified; `src/`,
`tests/`, `package.json`, `.pi/` untouched. `openspec/config.yaml` (untracked) and `.pi/` were not
committed.
