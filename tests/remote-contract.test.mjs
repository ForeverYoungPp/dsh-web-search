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
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { hostContribution, WebSearchController, WEBSEARCH_NAMESPACE, WEBSEARCH_SERVICE_KEY } from '../src/remote.js'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

const nodeRequire = createRequire(import.meta.url)

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

// ─── Compatibility gate (D1): the REAL gate from the installed app-boot, plus a
// non-vacuous control reconstructed from the pre-change peer set ───
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// The pre-change manifest is not shipped; its peer set is reconstructed as a literal so the
// control runs the same gate against the shape that produced the reproduced refusal.
const PRE_CHANGE_PEERS = {
  '@deepseek-ai/dsh-api-remotes': '^0.1.5-rc.3',
  '@deepseek-ai/dsh-tools': '^0.1.5-rc.3',
  '@deepseek-ai/dsh-typert-protocol': '^0.1.5-rc.3',
  '@deepseek-ai/dsh-web': '^0.1.5-rc.3',
  '@deepseek-ai/cordis': '^4.0.2',
}

test('the installed app-boot IS the runtime under test', () => {
  assert.equal(getDshRuntimeVersion(), '0.2.0-rc.2')
})

test('compatibility gate admits the target-revision manifest', () => {
  // `undefined` is the gate's "no incompatibility" result: nothing is pushed into skippedBundles.
  assert.equal(evaluatePluginCompatibility(manifest), undefined)
})

test('compatibility gate still refuses the pre-change peers (non-vacuous control)', () => {
  const verdict = evaluatePluginCompatibility({
    name: '@ian_p/dsh-web-search',
    version: '0.1.5-rc.3',
    peerDependencies: PRE_CHANGE_PEERS,
  })
  assert.ok(verdict, 'the gate accepted the pre-change peers')
  assert.equal(verdict.runtimeVersion, '0.2.0-rc.2')
  assert.deepEqual(Object.keys(verdict.peers).sort(), [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-web',
  ])
  // cordis is excluded by the gate's @deepseek-ai/dsh* name filter, not by its range.
  assert.equal(verdict.peers['@deepseek-ai/cordis'], undefined)
})

// ─── Strict-codec contract on BOTH registry faces of the installed runtime (D2) ───
// The descriptors the host would receive: apply() mounts the contribution through
// ctx.remote.$mount(contribution), so the stub captures that argument. Loaded through
// globalThis.window + dynamic import (the tests/interaction.test.mjs technique) so the
// descriptor objects stay same-realm; only the client *registry* is cross-realm by
// necessity, which is why the rejection assertions below match thrown message content
// instead of object identity or `instanceof`.
let bundleRegistration = null
globalThis.window = {
  __ModuleLoader__: {
    load: (registration) => {
      bundleRegistration = registration
    },
  },
}
// apply() injects the host-native stylesheet, so the sandbox needs a document stub.
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ setAttribute: () => {}, textContent: '' }),
  head: { appendChild: () => {} },
}
await import('../src/client/bundle.js')

const clientBundle = bundleRegistration.factory((spec) => {
  if (spec === 'react') return { createElement: () => ({ type: 'element' }) }
  throw new Error('unexpected require: ' + spec)
})

let mountedContribution = null
await clientBundle.apply({
  remote: {
    $mount: async (contribution) => {
      mountedContribution = contribution
      return () => {}
    },
  },
  effect: () => {},
  get: () => null,
})
const clientDescriptors = mountedContribution.descriptors

// Both faces of the real 0.2.0-rc.2 validator, reached through their only public path:
// registry.remotes.register() validates before touching ctx.effect.
const ctxOf = () => ({ reflect: { provide: () => () => {} }, logger: { warn() {} }, effect: () => () => {} })
const hostRegistry = new TypertRegistry(ctxOf())

function loadClientRegistry() {
  // The client face is not importable: lib/client.js IS a window.__ModuleLoader__ bundle,
  // so evaluate it in a vm sandbox and call its factory with the installed cordis.
  const entry = nodeRequire.resolve('@deepseek-ai/dsh-typert-registry/client')
  let registration = null
  const sandbox = { console, window: { __ModuleLoader__: { load: (r) => { registration = r } } } }
  vm.runInNewContext(readFileSync(entry, 'utf8'), sandbox, { filename: 'dsh-typert-registry/client.js' })
  const clientFace = registration.factory(nodeRequire)
  let registry = null
  // Service registers itself through ctx.reflect.provide(name, self, check) — capture it.
  clientFace.apply({
    ...ctxOf(),
    reflect: {
      provide: (_name, self) => {
        registry = self
        return () => {}
      },
    },
  })
  return registry
}
const clientRegistry = loadClientRegistry()

const probe = (descriptors) => ({ package: 'dsh-web-search-contract-probe', descriptors })

test('every shipped strict codec exposes create() returning a parseable schema', () => {
  const codecs = clientDescriptors.flatMap((d) => [d.result, ...d.parameters.map((p) => p.codec)])
  // 5 descriptors, one result codec each plus one parameter codec on each of the four
  // arg-taking verbs: the loop below is not a ghost loop.
  assert.equal(codecs.length, 9)
  for (const codec of codecs) {
    assert.equal(typeof codec.create, 'function', 'strict codec has no create() factory')
    assert.equal(typeof codec.create().parse, 'function', 'create() did not return a { parse } schema')
  }
})

test('host-face validator accepts the shipped descriptors', () => {
  assert.doesNotThrow(() => hostRegistry.remotes.register(probe(clientDescriptors)))
})

test('client-face validator accepts the shipped descriptors', () => {
  assert.doesNotThrow(() => clientRegistry.remotes.register(probe(clientDescriptors)))
})

test('both faces reject the pre-change codec shape (negative control)', () => {
  const PRE_CHANGE_CODEC = { mode: 'strict', typeSymbol: 'dsh-web-search#json', schema: { parse: (v) => v } }
  const warped = [{ ...clientDescriptors[0], result: PRE_CHANGE_CODEC }]
  for (const [face, registry] of [['host', hostRegistry], ['client', clientRegistry]]) {
    assert.throws(
      () => registry.remotes.register(probe(warped)),
      /no create\(\) factory/,
      `${face} validator accepted the pre-change codec shape`,
    )
  }
})