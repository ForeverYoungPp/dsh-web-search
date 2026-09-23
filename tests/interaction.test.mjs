import { test } from 'node:test'
import assert from 'node:assert/strict'

// The shipped copy of this state machine lives in the browser bundle (the host
// loads src/client/bundle.js; a local module could not be required from it), so
// these tests load the bundle exactly the way the browser does and reach the pure
// functions through its `__internals` handle. A `vm` realm is deliberately NOT
// used here: objects created inside it would carry a foreign Object.prototype and
// every deepStrictEqual below would fail on the prototype check.
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load: (registration) => {
      captured = registration
    },
  },
}
await import('../src/client/bundle.js')
const bundle = captured.factory((spec) => {
  if (spec === 'react') return {}
  throw new Error('unexpected require: ' + spec)
})
const { initialState, deriveViewState, reducer, reorderProviders, MASK } = bundle.__internals

function provider(configured) {
  return { keyStatus: { configured } }
}

// ─── deriveViewState basic states ───
test('deriveViewState: no key configured → grayed + Inactive + editable + no mask', () => {
  const s = deriveViewState(initialState, provider(false))
  assert.equal(s.configured, false)
  assert.equal(s.statusKey, 'statusInactiveNoKey')
  assert.equal(s.canClear, false)
  assert.equal(s.canSave, false) // no input
  assert.equal(s.inputDisabled, false)
  assert.equal(s.displayValue, '')
  assert.equal(s.placeholderKey, 'placeholderApiKey')
})

test('deriveViewState: key configured → grayed + masked + not editable + not Save-able', () => {
  const s = deriveViewState(initialState, provider(true))
  assert.equal(s.configured, true)
  assert.equal(s.statusKey, 'statusActive')
  assert.equal(s.canClear, true)
  assert.equal(s.canSave, false) // configured, cannot save
  // Key: grayed out + masked + not editable
  assert.equal(s.inputDisabled, true)
  assert.equal(s.displayValue, MASK)
  assert.equal(s.placeholderKey, '')
})

test('deriveViewState: configured → no input displayed or saved (not editable)', () => {
  const s = deriveViewState({ ...initialState, keyValue: 'tvly-abc' }, provider(true))
  assert.equal(s.inputDisabled, true)
  assert.equal(s.displayValue, MASK) // Mask takes priority
  assert.equal(s.canSave, false)
})

test('deriveViewState: not configured + input present → Save enabled', () => {
  const s = deriveViewState({ ...initialState, keyValue: 'tvly-abc' }, provider(false))
  assert.equal(s.canSave, true)
  assert.equal(s.inputDisabled, false)
  assert.equal(s.displayValue, 'tvly-abc')
})

test('deriveViewState: not configured + whitespace-only input → Save disabled', () => {
  const s = deriveViewState({ ...initialState, keyValue: '   ' }, provider(false))
  assert.equal(s.canSave, false)
})

test('deriveViewState: saving → Save and Clear disabled', () => {
  const s = deriveViewState({ ...initialState, keyValue: 'x', saving: true }, provider(false))
  assert.equal(s.canSave, false)
  assert.equal(s.canClear, false)
})

test('deriveViewState: clearing → Save and Clear disabled', () => {
  const s = deriveViewState({ ...initialState, keyValue: 'x', clearing: true }, provider(false))
  assert.equal(s.canSave, false)
  assert.equal(s.canClear, false)
})

// ─── CHANGE_KEY ───
test('CHANGE_KEY: updates value and clears feedback', () => {
  const s = reducer({ ...initialState, lastResult: { type: 'error', message: 'x' } }, { type: 'CHANGE_KEY', value: 'tvly-1' })
  assert.equal(s.keyValue, 'tvly-1')
  assert.equal(s.lastResult, null)
})

// ─── SAVE ───
test('SAVE_START: enters saving state', () => {
  const s = reducer(initialState, { type: 'SAVE_START' })
  assert.equal(s.saving, true)
  assert.equal(s.clearing, false)
})

test('SAVE_START: already saving → ignores duplicate trigger', () => {
  const s = reducer({ ...initialState, saving: true }, { type: 'SAVE_START' })
  assert.equal(s.saving, true)
})

test('SAVE_SUCCESS: clears input + shows saved feedback (provider configured → masked state)', () => {
  const before = { ...initialState, keyValue: 'tvly-1', saving: true }
  const s = reducer(before, { type: 'SAVE_SUCCESS' })
  assert.equal(s.saving, false)
  assert.equal(s.keyValue, '')
  assert.deepEqual(s.lastResult, { type: 'saved' })
  // After save success, provider is configured → grayed out masked state
  const view = deriveViewState(s, provider(true))
  assert.equal(view.inputDisabled, true)
  assert.equal(view.displayValue, MASK)
})

test('SAVE_FAIL: retains input + shows error feedback', () => {
  const before = { ...initialState, keyValue: 'tvly-1', saving: true }
  const s = reducer(before, { type: 'SAVE_FAIL', message: 'boom' })
  assert.equal(s.saving, false)
  assert.equal(s.keyValue, 'tvly-1')
  assert.deepEqual(s.lastResult, { type: 'error', message: 'boom' })
})

// ─── CLEAR ───
test('CLEAR_START: enters clearing state', () => {
  const s = reducer(initialState, { type: 'CLEAR_START' })
  assert.equal(s.clearing, true)
})

test('CLEAR_START: already clearing → ignores', () => {
  const s = reducer({ ...initialState, clearing: true }, { type: 'CLEAR_START' })
  assert.equal(s.clearing, true)
})

test('CLEAR_SUCCESS: clears input + shows cleared feedback (not configured → editable state)', () => {
  const before = { ...initialState, keyValue: 'tvly-1', clearing: true }
  const s = reducer(before, { type: 'CLEAR_SUCCESS' })
  assert.equal(s.clearing, false)
  assert.equal(s.keyValue, '')
  assert.deepEqual(s.lastResult, { type: 'cleared' })
  // After clear, not configured → editable + placeholder
  const view = deriveViewState(s, provider(false))
  assert.equal(view.inputDisabled, false)
  assert.equal(view.displayValue, '')
  assert.equal(view.placeholderKey, 'placeholderApiKey')
})

test('CLEAR_FAIL: retains input + shows error feedback', () => {
  const before = { ...initialState, keyValue: 'tvly-1', clearing: true }
  const s = reducer(before, { type: 'CLEAR_FAIL', message: 'no' })
  assert.equal(s.clearing, false)
  assert.equal(s.keyValue, 'tvly-1')
  assert.deepEqual(s.lastResult, { type: 'error', message: 'no' })
})

// ─── Misc ───
test('reducer: unknown action returns original state', () => {
  const s = reducer(initialState, { type: 'NOPE' })
  assert.equal(s, initialState)
})

test('Full flow: not configured input → Save → configured mask; Clear → back to editable', () => {
  let s = initialState
  // Not configured: editable
  assert.equal(deriveViewState(s, provider(false)).inputDisabled, false)
  // Input
  s = reducer(s, { type: 'CHANGE_KEY', value: '  tvly-9  ' })
  assert.equal(deriveViewState(s, provider(false)).canSave, true)
  // Save
  s = reducer(s, { type: 'SAVE_START' })
  s = reducer(s, { type: 'SAVE_SUCCESS' })
  // Configured: grayed out masked
  const configuredView = deriveViewState(s, provider(true))
  assert.equal(configuredView.inputDisabled, true)
  assert.equal(configuredView.displayValue, MASK)
  assert.equal(configuredView.canClear, true)
  // Clear
  s = reducer(s, { type: 'CLEAR_START' })
  s = reducer(s, { type: 'CLEAR_SUCCESS' })
  // Not configured: back to editable
  const clearedView = deriveViewState(s, provider(false))
  assert.equal(clearedView.inputDisabled, false)
  assert.equal(clearedView.displayValue, '')
})

// ─── kind branches (apikey / endpoint / none) ───
test('deriveViewState: endpoint not configured → text input + endpoint placeholder + Inactive (no endpoint)', () => {
  const s = deriveViewState(initialState, { kind: 'endpoint', keyStatus: { configured: false } })
  assert.equal(s.inputType, 'text')
  assert.equal(s.placeholderKey, 'placeholderEndpoint')
  assert.equal(s.statusKey, 'statusInactiveNoEndpoint')
  assert.equal(s.configured, false)
})

test('deriveViewState: endpoint configured → grayed masked + Configured', () => {
  const s = deriveViewState(initialState, { kind: 'endpoint', keyStatus: { configured: true } })
  assert.equal(s.configured, true)
  assert.equal(s.inputDisabled, true)
  assert.equal(s.statusKey, 'statusConfigured')
  assert.equal(s.displayValue, MASK)
  assert.equal(s.canClear, true)
})

test('deriveViewState: apikey default (no kind) → password input', () => {
  const s = deriveViewState(initialState, provider(false))
  assert.equal(s.inputType, 'password')
  assert.equal(s.kind, 'apikey')
})

test('deriveViewState: kind none (DDG) → apikey-style default path (current behavior)', () => {
  const s = deriveViewState(initialState, { kind: 'none', keyStatus: { configured: false } })
  assert.equal(s.kind, 'none')
  assert.equal(s.inputType, 'password')
  assert.equal(s.statusKey, 'statusInactiveNoKey')
  assert.equal(s.placeholderKey, 'placeholderApiKey')
})

// ─── reorderProviders (drag-sort) ───
const order = ['tavily', 'brave', 'exa']

test('reorderProviders: drags first item to the end', () => {
  assert.deepEqual(reorderProviders(order, 0, 2), ['brave', 'exa', 'tavily'])
  assert.deepEqual(order, ['tavily', 'brave', 'exa'])
})

test('reorderProviders: drags last item to the start', () => {
  assert.deepEqual(reorderProviders(order, 2, 0), ['exa', 'tavily', 'brave'])
  assert.deepEqual(order, ['tavily', 'brave', 'exa'])
})

test('reorderProviders: adjacent move', () => {
  assert.deepEqual(reorderProviders(order, 0, 1), ['brave', 'tavily', 'exa'])
  assert.deepEqual(order, ['tavily', 'brave', 'exa'])
})

test('reorderProviders: from===to returns original array (immutable)', () => {
  assert.equal(reorderProviders(order, 1, 1), order)
})

test('reorderProviders: out-of-bounds index returns original array', () => {
  assert.equal(reorderProviders(order, -1, 2), order)
  assert.equal(reorderProviders(order, 0, 5), order)
})

test('reorderProviders: non-array safe', () => {
  assert.equal(reorderProviders(undefined, 0, 1), undefined)
})

// ─── TEST (connection test) ───
test('deriveViewState: configured → canTest true, not configured → false', () => {
  assert.equal(deriveViewState(initialState, provider(true)).canTest, true)
  assert.equal(deriveViewState(initialState, provider(false)).canTest, false)
})

test('deriveViewState: while testing → Save disabled despite valid input', () => {
  // Non-configured provider + non-empty keyValue → canSave would be true when idle;
  // testing must be what disables it.
  const s = deriveViewState({ ...initialState, testing: true, keyValue: 'tvly-1' }, provider(false))
  assert.equal(s.canSave, false)
  assert.equal(s.canClear, false)
  assert.equal(s.canTest, false)
  assert.equal(s.testing, true)
})

test('TEST_START: enters testing and clears testResult', () => {
  const before = { ...initialState, testResult: { type: 'error', message: 'old' } }
  const s = reducer(before, { type: 'TEST_START' })
  assert.equal(s.testing, true)
  assert.equal(s.testResult, null)
})

test('TEST_START: already testing → ignores', () => {
  const s = reducer({ ...initialState, testing: true }, { type: 'TEST_START' })
  assert.equal(s.testing, true)
})

test('TEST_SUCCESS: ends testing + success feedback', () => {
  const s = reducer({ ...initialState, testing: true }, { type: 'TEST_SUCCESS', message: 'Connected (HTTP 200)' })
  assert.equal(s.testing, false)
  assert.deepEqual(s.testResult, { type: 'success', message: 'Connected (HTTP 200)' })
})

test('TEST_FAIL: ends testing + error feedback', () => {
  const s = reducer({ ...initialState, testing: true }, { type: 'TEST_FAIL', message: 'Authentication failed (HTTP 401)' })
  assert.equal(s.testing, false)
  assert.deepEqual(s.testResult, { type: 'error', message: 'Authentication failed (HTTP 401)' })
})

test('TEST_START during saving/clearing → ignored (ongoing flag preserved)', () => {
  const saving = { ...initialState, saving: true }
  assert.equal(reducer(saving, { type: 'TEST_START' }), saving)
  assert.equal(saving.saving, true)
  assert.equal(saving.testing, false)

  const clearing = { ...initialState, clearing: true }
  assert.equal(reducer(clearing, { type: 'TEST_START' }), clearing)
  assert.equal(clearing.clearing, true)
  assert.equal(clearing.testing, false)
})

test('SAVE/CLEAR during testing → ignored (mutually exclusive, ongoing flag preserved)', () => {
  const testing = { ...initialState, testing: true }
  assert.equal(reducer(testing, { type: 'SAVE_START' }), testing)
  assert.equal(testing.testing, true)
  assert.equal(testing.saving, false)
  assert.equal(reducer(testing, { type: 'CLEAR_START' }), testing)
  assert.equal(testing.testing, true)
  assert.equal(testing.clearing, false)
})

test('SAVE_START during clearing / CLEAR_START during saving → ignored', () => {
  const clearing = { ...initialState, clearing: true }
  assert.equal(reducer(clearing, { type: 'SAVE_START' }), clearing)
  assert.equal(clearing.clearing, true)
  assert.equal(clearing.saving, false)

  const saving = { ...initialState, saving: true }
  assert.equal(reducer(saving, { type: 'CLEAR_START' }), saving)
  assert.equal(saving.saving, true)
  assert.equal(saving.clearing, false)
})