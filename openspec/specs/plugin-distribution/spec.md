# plugin-distribution Specification

## Purpose

Define what must be true of `@ian_p/dsh-web-search` as a *published bundle* after the adaptation:
the manifest declares exactly one supported DSH train, the host compatibility gate admits the
bundle on `0.2.0-rc.2`, no dead peer can produce a false incompatibility warning, and every
functional surface the plugin has today still exists under the target train.

This domain owns manifest and loading-time facts. The browser-half Typert and slot contracts live
in `client-remote-integration`.

## Requirements

### Requirement: Single target train

The plugin MUST target only DSH `0.2.0-rc.2`. It MUST NOT implement dual-train support, and it MUST NOT branch behaviour on a runtime-detected DSH version. Compatibility MUST be decided by the declared manifest ranges alone.

#### Scenario: Manifest declares exactly one train

- GIVEN the plugin manifest at the target revision
- WHEN its `@deepseek-ai/dsh*` `peerDependencies` ranges are read
- THEN every such entry MUST be a range on the `0.2.0` train
- AND no entry MUST admit the previous `0.1.5` train as a supported target

#### Scenario: No runtime version sniffing

- GIVEN the plugin source tree and the shipped client bundle at the target revision
- WHEN the test suites run (`pnpm test`, `pnpm run test:rpc`)
- THEN a check MUST fail if any compatibility decision is derived from a runtime-reported DSH version instead of the declared peer ranges

#### Scenario: The previous train is out of scope

- GIVEN runtime DSH `0.1.5-rc.3`
- WHEN the plugin is loaded there
- THEN the plugin MAY be rejected, and no requirement in this spec constrains that outcome

### Requirement: Compatibility gate admits the bundle on the target runtime

Every `@deepseek-ai/dsh*` entry in `peerDependencies` MUST be satisfiable by the target runtime version `0.2.0-rc.2`, so that `evaluatePluginCompatibility()` (invoked from profile-directory loading) reports no incompatibility and the profile bundle is not pushed into `skippedBundles`.

#### Scenario: Target runtime admits the bundle

- GIVEN the plugin manifest at the target revision
- WHEN the compatibility gate is evaluated against runtime version `0.2.0-rc.2`
- THEN it MUST report no incompatibility issue for the plugin
- AND the bundle MUST NOT be recorded in `skippedBundles`

#### Scenario: The check is not vacuous

- GIVEN the pre-change manifest, whose `@deepseek-ai/dsh*` peers are `^0.1.5-rc.3`
- WHEN the same gate is evaluated against runtime `0.2.0-rc.2`
- THEN it MUST report the plugin as incompatible
- AND the acceptance check MUST fail on that manifest

### Requirement: Cordis peer matches the train's own declaration

The `@deepseek-ai/cordis` peer range MUST be the range the `0.2.0-rc.2` train itself declares (`~4.0.4`), so the plugin cannot claim a cordis version the target train rejects.

#### Scenario: Cordis range follows the train

- GIVEN the cordis version resolved by the `0.2.0-rc.2` train's own declaration
- WHEN the plugin's `@deepseek-ai/cordis` peer range is compared
- THEN that resolved version MUST satisfy the plugin's range
- AND the range MUST NOT admit a cordis release outside the train's declared range

### Requirement: No dead peer declarations

`@deepseek-ai/dsh-tools` MUST NOT be declared in `peerDependencies` and MUST NOT appear in `peerDependenciesMeta`. No `@deepseek-ai/dsh*` peer MAY remain declared when it is imported nowhere in `src/` or `tests/`.

#### Scenario: dsh-tools is removed

- GIVEN the plugin manifest at the target revision
- WHEN `peerDependencies` and `peerDependenciesMeta` are read
- THEN neither MUST contain `@deepseek-ai/dsh-tools`

#### Scenario: Dead-peer check fails on an unused declaration

- GIVEN a manifest that declares an `@deepseek-ai/dsh*` peer with no corresponding import in `src/` or `tests/`
- WHEN the suite's dead-peer check runs as part of `pnpm test`
- THEN it MUST fail and name the unused declaration

### Requirement: Package version mirrors the target train

The package version MUST be `0.2.0-rc.1`, on the target train's `0.2.0` line, so the manifest states which DSH train the bundle was adapted for.

#### Scenario: Version reports the adapted train

- GIVEN the plugin manifest at the target revision
- WHEN `version` is read
- THEN it MUST equal `0.2.0-rc.1`
- AND its `major.minor.patch` MUST equal the target runtime's `0.2.0`

### Requirement: Existing functional surfaces remain available

Removing the dead `dsh-tools` peer MUST NOT remove or degrade any functional surface. The host fallback chain, the `websearch` Remote namespace with its five verbs, the settings page, and the credential handling MUST all remain available.

#### Scenario: Host fallback chain remains

- GIVEN the plugin installed on the target runtime
- WHEN the host-side fallback chain is exercised
- THEN providers MUST still be tried sequentially in the documented order until the first success

#### Scenario: websearch namespace keeps its five verbs

- GIVEN the host contribution at the target revision
- WHEN its Remote namespace is enumerated
- THEN the `websearch` namespace MUST expose exactly the five documented verbs with their declared codecs

#### Scenario: Settings page remains available

- GIVEN the plugin installed on the target runtime
- WHEN the settings surface is inspected
- THEN the provider settings page MUST still be registered by the plugin

#### Scenario: Credentials remain available

- GIVEN an operator who has stored provider credentials
- WHEN the plugin reads them on the target runtime
- THEN the credential record layout MUST be unchanged, so previously stored records MUST still be honoured

### Requirement: Existing behavioural contracts are preserved under the target train

The adaptation MUST NOT change documented runtime policies. Timeout and chain semantics, the absence of racing, merging, retries and caching, and snippet handling MUST be preserved exactly.

#### Scenario: Suites are green on the target train

- GIVEN `devDependencies` resolved to the `0.2.0-rc.2` train, not `0.1.5-rc.3`
- WHEN `pnpm test`, `pnpm run test:rpc`, and `pnpm run typecheck` run
- THEN all three MUST exit successfully
- AND the resolved-tree evidence MUST show the `0.2.0-rc.2` train

#### Scenario: A green run on the old fixtures does not count

- GIVEN `devDependencies` still resolved to the `0.1.5-rc.3` train
- WHEN the same three commands run green
- THEN that result MUST NOT be accepted as evidence for this requirement

#### Scenario: Policies are unchanged

- GIVEN the target-revision source and its existing suites
- WHEN `pnpm test` and `pnpm run test:rpc` run
- THEN the documented 60 s timeout, first-success chain ordering, absence of racing/merging/retry/cache, and snippet-handling assertions MUST be unchanged and green
- AND the snippet ceiling MUST NOT be re-derived in this change

### Requirement: Packaging and client-bundle authoring mechanisms stay unchanged

The plugin MUST keep shipping a hand-written client bundle built by the copy-only build script, and MUST keep the existing `dsh.client` and `dsh.bundle.patch` manifest mechanisms.

#### Scenario: Build stays copy-only

- GIVEN the copy-only build script and the manifest at the target revision
- WHEN the manifest's build script produces the published bundle
- THEN the client bundle MUST be copied as authored, with no bundling or transpilation step introduced

#### Scenario: Manifest mechanisms are unchanged

- GIVEN the plugin manifest at the target revision
- WHEN `dsh.client` and `dsh.bundle.patch` are read
- THEN the `inject` list and the patch-file reference MUST be unchanged from the pre-change manifest

### Requirement: Host overrides and credential layout stay unchanged

The `- id: web` `searchProvider`/`fetchProvider` override rows and the credential record layout MUST stay unchanged, so existing installations keep working without reconfiguration.

#### Scenario: Override rows are unchanged

- GIVEN the plugin's patch file at the target revision
- WHEN the `- id: web` override rows are read
- THEN the `searchProvider` and `fetchProvider` overrides MUST be unchanged from the pre-change patch

#### Scenario: Credential records are read as before

- GIVEN a credential store written by the pre-change plugin version
- WHEN the adapted plugin reads provider credentials
- THEN it MUST resolve the same values from the same record layout

### Requirement: Published documentation states the target train

The plugin's documentation MUST state the target train and the migrated settings-page slot, so readers are not told to expect `0.1.5` behaviour.

#### Scenario: Train references are current

- GIVEN `README.md`, `README_ZH.md`, and `docs/DESIGN.md` at the target revision
- WHEN their peer tables, train statements, and test-count lines are read
- THEN they MUST describe the `0.2.0-rc.2` train
- AND they MUST NOT still assert `^0.1.5-rc.3` peers

#### Scenario: Slot documentation is current

- GIVEN the same documents at the target revision
- WHEN the settings-page description is read
- THEN it MUST name the `plugins.item` extension point, not `settings.section`
