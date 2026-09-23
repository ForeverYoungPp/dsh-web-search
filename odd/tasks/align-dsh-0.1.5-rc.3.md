# align-dsh-0.1.5-rc.3 (train alignment + npm-style packaging)

## Why

The plugin declared the **0.1.2-alpha.2** train while the host actually running on this
machine is **0.1.5-rc.3** (npm `latest` for `@deepseek-ai/dsh`). The declaration was loose
enough to load, but the repo never stated its target truthfully, its environment tier
resolved whatever the registry served, and it published `src/` instead of a build output.

Verified evidence used for this change:

| Fact | Evidence |
| --- | --- |
| Running host train | `/home/fy/.npm/_npx/1e7f6d9597241db0/node_modules`: `@deepseek-ai/dsh` **0.1.5-rc.3**, `dsh-typert-protocol` / `dsh-web` / `dsh-tools` / `dsh-api-remotes` **0.1.5-rc.3**, `@deepseek-ai/cordis` **4.0.2** |
| The strict codec form this train requires | `dsh-typert-registry/lib/client.js:1342` and `lib/index.js:550`: `if (typeof codec.schema.parse !== "function") throw … "strict codec has no parse() method"` — the `schema` form the bundle already ships |
| Registry availability | `0.1.5-rc.3` exists for all four packages; `@deepseek-ai/dsh@latest` = `0.1.5-rc.3` |
| **Future break, not today's problem** | `0.1.7-rc.1` replaces that check with `create(): TypertSchema` (harness checkout `packages/typert/registry/src/service.ts:722-731`, `packages/typert/protocol/src/types.ts:269-295`). A host moved to 0.1.7+ will reject the current `schema` form at `$mount` with "strict codec has no create() factory"; that migration is its own change |

## Non-goals

- No codec change: the `schema` form is what 0.1.5-rc.3 enforces, so the bundle keeps it and
  the smoke test keeps its original shape. Nothing in `src/` changes for this feature.
- No bundler and no new dependency: the host half is already plain ESM, so the build is a
  clean `src/` → `dist/` copy, not a transform.
- No commit/push/PR beyond the local work-unit commits.

## Tasks

- [x] **A1 — Declare the 0.1.5-rc.3 train.** Peers `^0.1.5-rc.3` for the four
  `@deepseek-ai/dsh*` peers, `@deepseek-ai/cordis` `^4.0.2` (the version the running host
  carries); devDependencies mirror the peers exactly so the environment tier resolves the
  same code the host runs. `package.json#version` follows the train: `0.1.5-rc.3`.
- [x] **A2 — Rewrite the README version contract** (EN + ZH): one DSH train version
  (`0.1.5-rc.3`, the published `latest`) instead of a per-package peer table; only the other
  components this project references are listed separately (`@deepseek-ai/cordis`, `react`,
  `typescript`); the stale "0.1.1-rc.2 is latest" warning is gone.
- [x] **A3 — Regenerate the lockfile** onto the new train.
- [x] **A4 — Verify.** `pnpm test`, `pnpm run test:rpc`, `pnpm run typecheck` green against
  the 0.1.5-rc.3 packages.

## Packaging (npm publish shape)

- [x] **B1 — Build stage.** `scripts/build.mjs`: remove `dist/`, copy `src/` recursively,
  assert four entry points exist. `node:fs` only.
- [x] **B2 — Manifest points at dist.** `main` → `dist/index.js`,
  `exports["."]` → `./dist/index.js`, `exports["./client"]` → `./dist/client/bundle.js`,
  `exports["./src/*"]` removed, `files` → `dist/` + `README_ZH.md` + `cordis.patch.yml`,
  new `build` script, `prepublishOnly` = build → test → test:rpc → typecheck.
- [x] **B3 — Ignore the build output.** `.gitignore` has `dist/`.
- [x] **B4 — Document the flow** (EN + ZH): layout shows `scripts/build.mjs` and `dist/`,
  "No build step" became "No bundler", and a packaging section explains that `--patch`
  loads `src/index.js` while the published bundle patch resolves the package name to
  `dist/index.js`.

## Verification evidence

Baseline (0.1.2-alpha.2 packages installed): `pnpm test` 127 pass, `test:rpc` 11 + smoke OK,
`typecheck` exit 0.

After the change (0.1.5-rc.3 packages installed):

| Gate | Result |
| --- | --- |
| `pnpm test` | 90 pass / 0 fail + 37 pass / 0 fail → OK |
| `pnpm run test:rpc` | 11 pass / 0 fail + smoke OK |
| `pnpm run typecheck` | exit 0 |
| `pnpm run build` | `build: dist/ staged from src/ (4 entry points verified)` |
| `dist/` in git | ignored, absent from `git status` |

## Notes

- Handing the host forward: when the running DSH moves to `0.1.7-rc.1` or later, the client
  strict codec must change from `schema` to `create`, and the peers/devDependencies move to
  that train. The check that will fail is quoted above.
- Working tree: branch `chore/reduce-over-engineering`, no push.
