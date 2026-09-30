# client-remote-integration Specification

## Purpose

Define what must be true of the plugin's browser half after the adaptation: every strict Typert
codec it ships satisfies the `0.2.0` `create: () => TypertSchema` contract so the contribution
mounts, the settings page registers on the standard `plugins.item` slot with a non-colliding id,
and both facts are proven by tests rather than by reading the code.

## Requirements

### Requirement: Strict codecs satisfy the 0.2.0 contract

Every strict Typert codec shipped by the browser half MUST expose `create` as a function that returns a `TypertSchema`, as the `0.2.0` protocol type requires. A codec MUST NOT satisfy the registry validators by carrying a bare `schema` field instead of a callable `create`.

#### Scenario: Every strict descriptor exposes a callable create

- GIVEN the client contribution's strict descriptors at the target revision
- WHEN each descriptor's codec is checked against the `0.2.0` strict validator
- THEN every codec MUST have `create` as a function
- AND `codec.create()` MUST return a schema the validator accepts

#### Scenario: The host and client validators agree

- GIVEN the same codec object
- WHEN it is passed through the host registry validator and through the client registry validator
- THEN both MUST reach the same accept/reject decision

#### Scenario: The old shape is rejected

- GIVEN a codec of the pre-change shape `{ mode: 'strict', typeSymbol, schema }`
- WHEN the `0.2.0` strict validator checks it
- THEN the check MUST fail
- AND the acceptance check MUST fail on the pre-change client bundle

### Requirement: Contribution mounts on the target runtime

`ctx.remote.$mount(contribution)` MUST complete successfully on `0.2.0-rc.2` for every descriptor the client contribution ships, so the plugin's browser half activates instead of throwing.

#### Scenario: Mount succeeds for all descriptors

- GIVEN the client contribution executed with the target-runtime codec contract
- WHEN `ctx.remote.$mount(contribution)` is invoked
- THEN it MUST resolve without throwing
- AND it MUST return a disposer

#### Scenario: Mount failure is observable

- GIVEN a descriptor whose codec violates the `0.2.0` contract
- WHEN `ctx.remote.$mount(contribution)` is invoked
- THEN the check MUST fail rather than pass silently

### Requirement: Client strict descriptors are covered by a test

Coverage of the client strict descriptors MUST come from an automated check in the existing RPC suite, not from code inspection. The check MUST fail if a strict descriptor stops satisfying the `0.2.0` contract.

#### Scenario: RPC suite covers the client descriptors

- GIVEN `pnpm run test:rpc`
- WHEN the suite runs against the target train
- THEN it MUST include a check that validates the client bundle's strict descriptors
- AND the suite MUST fail if one of those descriptors is mutated to the pre-change `schema` shape

### Requirement: Settings page registers on the plugins.item slot

The settings page MUST register on the `0.2.0` standard plugin-owned page slot `plugins.item`, using the plugin's own page id, and MUST NOT take over the native page's `web-search` id.

#### Scenario: Slot name is plugins.item

- GIVEN the client contribution's apply step running against a recording `slots` stub
- WHEN registration is captured
- THEN the registered slot name MUST equal `plugins.item`
- AND it MUST NOT equal `settings.section`

#### Scenario: Page id and order are preserved

- GIVEN the same recorded registration
- WHEN the page descriptor is read
- THEN its id MUST be the plugin's own id and MUST NOT be `web-search`
- AND its order MUST match the value the plugin intends to register

#### Scenario: The native page is not displaced

- GIVEN the native `web-search` page on the `plugins.item` slot
- WHEN the plugin's page is registered on the same slot
- THEN both pages MUST remain registered, because the ids do not collide

### Requirement: Slot registration is covered by a test

Slot registration MUST be asserted by a test using a recording `slots` stub. The existing stub that passes `slots` as absent MUST NOT remain the only exercise of the apply step, and the test MUST fail on a wrong slot name, id, or order.

#### Scenario: Recording stub drives the assertion

- GIVEN `pnpm run test:rpc` running the client-bundle smoke suite
- WHEN the apply step is exercised
- THEN the stub MUST record the registration call and the assertion MUST check slot name, id, and order
- AND a mutated slot name, id, or order MUST fail the suite

### Requirement: The page is reachable when the plugin is installed

Because `plugins.item` pages render only inside the plugin-manager panel, reachability of the provider settings page for an installed plugin MUST be an explicit acceptance condition, not an assumption.

#### Scenario: Installed plugin page is reachable

- GIVEN the plugin installed on the target runtime
- WHEN the plugin-manager panel is opened for that plugin
- THEN the provider settings page MUST be listed as an item and MUST render its provider state

#### Scenario: Unreachable page blocks acceptance

- GIVEN verification finds that the page is not reachable through the plugin-manager panel on the target runtime
- WHEN the change is assessed against these criteria
- THEN the change MUST NOT be accepted as done
- AND the slot line MUST be revertible on its own, leaving the codec and peer fixes in place
