# settings-page-i18n-theme

## Why

Reported by the user: the settings page had no i18n (it ignored the host language) and its
colours did not follow the host's light/dark theme. Both were literal in
`src/client/bundle.js`: 17 distinct hardcoded hex values (`#ddd`, `#fff`, `#3b82f6`,
`#dc2626`, `#888`, `#fef2f2`, …) and ~40 English-only strings, with no `locale`
registration at all.

Evidence gathered from the host tree that actually runs (`0.1.5-rc.3`,
`/home/fy/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`):

| Fact | Evidence |
| --- | --- |
| `locale` is a Cordis service | `dsh-client-locale/lib/client.js:1378` — `ctx.provide("locale", locale)` |
| Bound `t` resolves the ACTIVE locale at call time | `dsh-client-locale/lib/client.js:1283-1302` — `bind(ns)` returns `(key, params) => this.translate(ns, key, params)`, and `translate` reads `this.snapshot.active` |
| Missing keys fall back to the key; `{name}` params supported | same function: `?? key`, then `template.replace(/\{(\w+)\}/g, …)` |
| Locale changes are observable | `dsh-client-locale/lib/client.js:1119-1129` — `getSnapshot()` (carries `revision`) and `subscribe(fn)` returning an unsubscribe |
| Theme is CSS custom properties, dark via a body attribute | `dsh-client-ui-theme/lib/client.js:1053` — `body{--dsw-alias-…}` and `body[data-ds-dark-theme]{--dsw-alias-…}` |
| Tokens used here all exist on this train | verified in that same stylesheet: `--dsw-alias-border-l2/l3`, `--dsw-alias-bg-layer-1/layer-2`, `--dsw-specific-input-major`, `--dsw-alias-label-primary/secondary/tertiary/dimmed/primary-foreground`, `--dsw-alias-button-primary-fill/dimmed`, `--dsw-alias-button-info-fill`, `--dsw-alias-state-success-primary`, `--dsw-alias-state-error-primary`, `--dsw-alias-interactive-bg-hover-danger` |

There is **no** `@deepseek-ai/dsh-client-ui-primitives` (or any UI kit) on this train — that
package exists in the harness master (0.1.7-rc.1) — so token styling is the only option that
needs no new dependency and no module-table assumption.

## Tasks

- [x] **T1 — Register dictionaries and bind a translator.** `inject` gains `locale`;
      `apply()` registers `{ en, zh }` under the namespace `dsh-web-search` through
      `ctx.locale.register(NS, …)` (inside `ctx.effect`) and binds one `t` via
      `ctx.locale.bind(NS)`. A fallback `t (key) => EN[key] || key` keeps the page alive on a
      host without the service.
- [x] **T2 — Keep the pure state machine locale-agnostic.** `deriveView` now returns
      `statusKey` / `placeholderKey` (dictionary keys) instead of user-visible English text;
      the component translates at render time. The 37 assertions in
      `tests/interaction.test.mjs` were retargeted to the key contract (10 lines), the rest
      unchanged.
- [x] **T3 — Replace every hardcoded colour with a design token**, including button fills,
      disabled states, status dots, feedback text, input background and the error panel, so
      the page follows `body[data-ds-dark-theme]` automatically.
- [x] **T4 — Follow language switches.** The sidebar label became a thunk
      (`label: () => t('title')`), and the page subscribes to the locale runtime
      (`locale.subscribe`) through a small `useLocaleTick()` hook so React re-renders on a
      switch instead of waiting for a remount.
- [x] **T5 — Verify.** Gates below; plus a grep proving no hardcoded colour and no English
      literal survives outside the dictionaries.

## Verification evidence

| Gate | Result |
| --- | --- |
| `pnpm test` | 90 pass / 0 fail + 37 pass / 0 fail |
| `pnpm run test:rpc` | 11 pass / 0 fail + `CLIENT BUNDLE SMOKE OK` (the smoke test exercises `apply()` with a stub ctx that has no `locale`, i.e. the EN fallback path) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run build` | `dist/` restaged from `src/` |

## Notes and known gaps

- Inline styles cannot express `:hover` / `:focus-visible`. Buttons therefore carry no hover
  treatment; the fix is either an injected `<style>` block with token-based rules or the
  host's UI kit — the latter only exists from 0.1.7-rc.1, so it is deliberately not used here.
- The page now matches the host palette but not yet the host's spacing/typography scale
  (`--dsw-font-*`); px sizes were left as they were to keep this change to colour + language.
- Nothing here changes the host contract, the fallback chain or the RPC surface.
