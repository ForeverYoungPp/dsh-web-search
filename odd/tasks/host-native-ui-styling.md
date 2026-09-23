# host-native-ui-styling

## Why

Reported twice: the settings page's buttons and colours did not match DSH's own UI. The page was
styled with inline `style` objects (4px radii, 13px labels, fixed-width buttons, hand-picked blue
/ red / cyan fills). Inline styles cannot express `:hover`, `:focus-visible`, `::placeholder` or
`:disabled` at all, which is why the controls read as foreign.

## The reference page

The page the user compares against is the **Plugins settings page** —
`dsh-client-ui-settings-plugins/lib/client.js` on the running train (0.1.5-rc.3). Its CSS is a
different dialect from `settings-models` (the first pass copied that one and was wrong):

| Element | Plugins page value (copied) |
| --- | --- |
| Card | `border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3); border-radius:16px; transition:border-color .16s,background .16s` |
| Card (muted/open) | `background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-dimmed)` |
| Card head row | `display:flex; align-items:center; gap:12px; padding:14px 16px` |
| Card name | `font-size:15px; font-weight:600; line-height:1.4; color:var(--dsw-alias-label-primary)` |
| Card description | `font-size:13px; line-height:1.5; color:var(--dsw-alias-label-tertiary)` |
| Field row | `border-top:.5px solid var(--dsw-alias-border-l2); gap:6px; padding:12px 0; margin:0 16px` |
| Input | `border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3); height:34px; border-radius:8px; padding:0 12px; font-size:13px; line-height:1.5` |
| Field label / hint | `13px/500` / `12px/1.5 var(--dsw-alias-label-tertiary)` |
| Footer | `border-top:.5px solid var(--dsw-alias-border-l2); justify-content:flex-end; align-items:center; gap:8px; padding:12px 0; margin:0 16px` |
| Button base | `appearance:none; font:inherit; cursor:pointer; border:1px solid transparent; border-radius:8px; padding:5px 14px; font-size:13px; line-height:1.5` |
| Primary button | `background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3)` — inverted, not a brand fill |
| Outline button | `border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); background:0 0` |
| Cards list | `display:flex; flex-direction:column; gap:10px` |
| Section | `display:flex; flex-direction:column; gap:12px; max-width:760px` |
| Heading / intro | `18px/600` / `13px var(--dsw-alias-label-tertiary)` |

## Two deliberate deviations (both commented in the stylesheet)

1. **Error text uses `--dsw-alias-state-error-primary`, not the page's `--dsw-alias-label-error`.**
   On this train `label-error` is **referenced 5 times and defined nowhere** (checked the whole
   `@deepseek-ai/` tree and the theme stylesheet), so copying it would produce an invalid
   declaration that silently inherits a colour. `state-error-primary` is the token the host uses
   for errors 73 times.
2. **The input keeps a focus border and the two outline buttons keep a `:hover` tint**
   (`--dsw-alias-interactive-bg-hover`, `--dsw-alias-brand-primary` on focus). The copied rules
   omit both; they are kept for keyboard/accessibility feedback and use host tokens.

## Also relevant (recorded because it changes what is possible)

`@deepseek-ai/dsh-client-ui-primitives` **is requirable at runtime** on this train even though it is
not an installed package: it ships compiled inside the shell bundle and is one of the 9 platform
seed words (`dsh-web-frontend/dist/assets/index-BKQ_L1z6.js`: `react`, `react/jsx-runtime`,
`react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `dsh-client-store`,
`dsh-client-ui-slots`, `dsh-client-ui-primitives`, `dsh-client-ui-dockkit`), and `makeRequire`
resolves seed words before the factory table (`dsh-client-modules/lib/client.js:295-308`). Its
component **prop contract** is compiled into that same 280 kB single-line bundle and cannot be
verified read-only, so the page keeps its own elements and adopts the visual contract instead —
guessing `Input`'s `value`/`onChange` wrong would break the page's core interaction with no way to
test on the host from here. Switching to the real components is a follow-up for a live session.

CSS injection point: the factory body runs at **materialization**, where `document` exists
(`dsh-client-modules/lib/client.js:20-34`), and the loader tags untagged `<style>` elements with
`data-plugin` (`claimStyles`, `:170-177,283-286`) — so the plugin appends
`<style data-plugin-css="dsh-web-search">` itself.

## Tasks

- [x] **U1 — Ship the stylesheet.** 33 rules in `src/client/bundle.js` (`STYLES`), every
      declaration derived from the Plugins page table above, every colour a `--dsw-*` token, no
      `#hex` anywhere.
- [x] **U2 — Inject it from the factory.** `injectStyles()` appends the `<style>`, guarded by
      `typeof document === 'undefined'` and idempotent by selector.
- [x] **U3 — Card anatomy on classes.** Head (dot + name + description), body (input), footer
      (message slot + Test / Clear / Save right-aligned). Buttons: **Save = primary** (inverted),
      **Clear = danger** (outline, error text), **Test = secondary** (outline) — replacing the
      hand-picked fills and the fixed widths.
- [x] **U4 — Drop the presentation constant.** `deriveView` no longer returns `opacity`; the
      `dws-card--idle` class owns the muted state, so the interaction suite dropped the two
      assertions that pinned `'0.55'`/`'1'`.
- [x] **U5 — Test.** The bundle smoke test runs with a `document` stub inside its `vm` sandbox and
      asserts the stylesheet is injected, consumes four named host tokens, matches the primary
      button contract, and contains no fixed colour.

## Verification evidence

| Gate | Result |
| --- | --- |
| `pnpm test` | 94 pass / 0 fail + 37 pass / 0 fail |
| `pnpm run test:rpc` | 11 pass / 0 fail + `stylesheet injected: 33 rules, token-based only` + `CLIENT BUNDLE SMOKE OK` |
| `pnpm run typecheck` | exit 0 |
| `pnpm run build` | OK, `diff -r src dist` identical |
| LSP on `src/client/bundle.js` | 0 diagnostics |
| inline styles in the bundle | 0 (`grep -c "style: {"` → 0) |

## Notes

- Values are a snapshot of the **0.1.5-rc.3** Plugins page; a host upgrade should re-check them
  (0.1.7-rc.1's primitives, for example, use `md = 36px / radius 18`). A small extractor script
  could automate that if it becomes a chore.
- The keyless DuckDuckGo card reuses the same anatomy (head + body), so both card kinds match.
