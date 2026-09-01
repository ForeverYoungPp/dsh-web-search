/**
 * remote-contract.test.mjs — Validate the host-side Typert Remote contribution
 * against the installed dsh runtime's contract rules.
 *
 * Mirrors the real registry validation (wireName segments, package, face, id
 * constraints) that ctx.typert.register() enforces at runtime, so the
 * registration call in src/index.js does not throw.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostContribution, WebSearchController, WEBSEARCH_NAMESPACE, WEBSEARCH_SERVICE_KEY } from '../src/remote.js'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

// ─── Shared controller factory ───
function createController(overrides = {}) {
  const stubOps = {
    listProviders: () => ({ providers: [] }),
    setKey: () => ({ ok: true }),
    unsetKey: () => ({ ok: true }),
    setOrder: () => ({ ok: true }),
    testProvider: () => ({ ok: true }),
    ...overrides,
  }
  // Cordis Service constructor calls ctx.reflect.provide(name, self, check) to
  // register the service key; a no-op suffices — the test only inspects the
  // resulting typertRemote binding, not real fiber registration.
  const ctx = { reflect: { provide: () => () => {} } }
  return new WebSearchController(ctx, stubOps)
}

// ─── wireName segment regex (same as dsh-typert-protocol) ───
const WIRE_SEGMENT = /^[A-Za-z0-9_$.-]+$/
const wireName = (label, value) => {
  assert.equal(value !== '.' && value !== '..' && WIRE_SEGMENT.test(value), true, `${label} "${value}" is not a valid wireName segment`)
}

// ─── hostContribution() shape ───
test('hostContribution shape', () => {
  const c = hostContribution()
  assert.equal(c.package, 'dsh-web-search')
  assert.equal(c.face, 'host')
  assert.deepEqual(c.schemas, [])
  assert.ok(Array.isArray(c.invocations))
  assert.equal(c.invocations.length, 5)
  assert.deepEqual(c.model, { services: [], events: [], objects: [] })
})

// ─── package validation ───
test('package is valid segment', () => {
  const pkg = hostContribution().package
  assert.equal(typeof pkg, 'string')
  assert.ok(pkg.length > 0, 'package must be non-empty')
  assert.equal(pkg.includes('#'), false, 'package must not contain "#"')
})

// ─── face validation ───
test('face is valid Typert face', () => {
  const face = hostContribution().face
  assert.ok(face === 'host' || face === 'client', `face must be 'host' or 'client', got ${face}`)
})

// ─── invocations: no duplicate ids, non-empty ids ───
test('invocations have unique non-empty ids', () => {
  const invocations = hostContribution().invocations
  const ids = new Set()
  for (const inv of invocations) {
    assert.equal(typeof inv.id, 'string')
    assert.ok(inv.id.length > 0, `invocation id must be non-empty, got ${JSON.stringify(inv.id)}`)
    assert.equal(ids.has(inv.id), false, `duplicate invocation id: ${inv.id}`)
    ids.add(inv.id)
  }
})

// ─── each invocation: service, namespace, method, invocation, result ───
test('each invocation has correct structure', () => {
  const invocations = hostContribution().invocations
  const methods = new Set()

  for (const inv of invocations) {
    assert.equal(inv.service, WEBSEARCH_SERVICE_KEY)
    assert.equal(inv.namespace, WEBSEARCH_NAMESPACE)
    assert.deepEqual(inv.invocation, { kind: 'direct' })
    assert.equal(inv.result.mode, 'src-json')
    assert.ok(typeof inv.method === 'string')
    assert.ok(inv.method.length > 0)
    assert.equal(methods.has(inv.method), false, `duplicate method: ${inv.method}`)
    methods.add(inv.method)

    // wireName segments
    wireName('service', inv.service)
    wireName('namespace', inv.namespace)
    wireName('method', inv.method)
  }

  const expectedMethods = new Set(hostContribution().invocations.map((inv) => inv.method))
  assert.deepEqual(methods, expectedMethods)
})

// ─── list has no parameters, others have args ───
test('list has zero parameters; others have one args parameter', () => {
  const invocations = hostContribution().invocations

  for (const inv of invocations) {
    if (inv.method === 'list') {
      assert.deepEqual(inv.parameters, [])
    } else {
      assert.equal(inv.parameters.length, 1)
      const p = inv.parameters[0]
      assert.deepEqual(p, { name: 'args', wire: 'args', source: 'json', codec: { mode: 'src-json' } })
      wireName('parameter name', p.name)
      wireName('parameter wire', p.wire)
    }
  }
})

// ─── wire fields unique per invocation ───
test('wire fields are unique within each invocation', () => {
  const invocations = hostContribution().invocations
  for (const inv of invocations) {
    const wires = new Set()
    for (const p of inv.parameters) {
      assert.equal(wires.has(p.wire), false, `invocation ${inv.id} has duplicate wire "${p.wire}"`)
      wires.add(p.wire)
    }
  }
})

// ───  src-json codec passes through (no schema required) ───
test('src-json codec is accepted without schema', () => {
  // This is the validation that the real dsh-typert-registry applies:
  // validateCodec({mode:'src-json'}, ...) does not check typeSymbol or schema.
  const invocations = hostContribution().invocations
  for (const inv of invocations) {
    const checkCodec = (codec, label) => {
      assert.ok(codec, `${label} codec missing in ${inv.id}`)
      assert.equal(codec.mode, 'src-json', `${label} codec mode must be 'src-json' in ${inv.id}`)
    }
    checkCodec(inv.result, 'result')
    for (const p of inv.parameters) checkCodec(p.codec, `parameter ${p.name}`)
  }
})

// ─── WebSearchController: TypertRemoteService binding ───
test('WebSearchController typertRemote binding is correct and frozen', () => {
  const controller = createController()

  // TypertRemoteService sets this.typertRemote = bindTypertRemote(this, this.name, options)
  assert.ok(controller.typertRemote, 'typertRemote must be set')
  assert.equal(controller.typertRemote.service, controller)
  assert.equal(controller.typertRemote.serviceKey, WEBSEARCH_SERVICE_KEY)
  assert.equal(controller.typertRemote.namespace, WEBSEARCH_NAMESPACE)
  assert.ok(Object.isFrozen(controller.typertRemote), 'typertRemote must be frozen')
})

// ─── WebSearchController: 5 methods exist and are async ───
test('WebSearchController has all 5 methods', async () => {
  const controller = createController({
    listProviders: () => ({ providers: [{ id: 'test' }] }),
    setOrder: () => ({ ok: true, order: [] }),
  })

  assert.equal(typeof controller.list, 'function')
  assert.equal(typeof controller.setKey, 'function')
  assert.equal(typeof controller.unsetKey, 'function')
  assert.equal(typeof controller.setOrder, 'function')
  assert.equal(typeof controller.testProvider, 'function')

  // Smoke call each (stubOps resolves)
  await controller.list()
  await controller.setKey({ id: 'x', value: 'y' })
  await controller.unsetKey({ id: 'x' })
  await controller.setOrder({ order: [] })
  await controller.testProvider({ id: 'test' })
})

// ─── markRemote: SRC fallback descriptor must be discoverable via remoteMethods ───
test('markRemote descriptor is discoverable via remoteMethods (SRC fallback)', () => {
  const controller = createController()
  // remoteMethods(service) reads Object.getPrototypeOf(service) on the
  // '@deepseek-ai/dsh-typert-protocol/remote-methods' descriptor —
  // exactly what markRemote writes.
  const methods = remoteMethods(controller).map(m => m.method).sort()
  assert.deepEqual(methods, ['list', 'setKey', 'setOrder', 'testProvider', 'unsetKey'].sort())
})