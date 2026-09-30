// Client bundle smoke test: simulate the browser module loader, execute the
// hand-written factory, and verify the registration + exports contract.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let captured = null
let mounted = false
// apply() injects the host-native stylesheet, so the sandbox gets a document stub too.
let injected = null
const stubDocument = {
  querySelector: () => null,
  createElement: () => ({ setAttribute: () => {}, textContent: '' }),
  head: { appendChild: (el) => { injected = el } },
}

const sandbox = {
  console,
  document: stubDocument,
  window: {
    __ModuleLoader__: {
      load: (registration) => {
        captured = registration
      },
    },
  },
}

const code = readFileSync(new URL('../src/client/bundle.js', import.meta.url), 'utf8')
const fakeRequire = (spec) => {
  if (spec === 'react') return { createElement: () => ({ type: 'element' }) }
  throw new Error('unexpected require: ' + spec)
}

// Execute the bundle in a sandbox so it sees only window (+ console), not Node globals.
captured = null
vm.runInNewContext(code, sandbox, { filename: 'src/client/bundle.js' })

if (!captured || captured.id !== '@ian_p/dsh-web-search') {
  throw new Error('registration not captured: ' + JSON.stringify(captured && captured.id))
}
const exported = captured.factory(fakeRequire)
console.log('exported keys:', Object.keys(exported).join(', '))
console.log('name:', exported.name)
console.log('inject:', JSON.stringify(exported.inject))
if (exported.name !== '@ian_p/dsh-web-search') throw new Error('bad name')
if (typeof exported.apply !== 'function') throw new Error('apply missing')

// Validate inject payload
if (!Array.isArray(exported.inject) || exported.inject.some((x) => typeof x !== 'string' || x.length === 0)) {
  throw new Error('bad inject payload')
}

// Exercise apply with a minimal stub ctx. `slots` RECORDS the registration instead of
// being stubbed as absent, so the slot name/id/order the plugin really registers are
// asserted rather than assumed.
const slotsCalls = []
const slots = {
  inject: (name, cb) => { slotsCalls.push(['inject', name]); return cb() },
  register: (options, component) => { slotsCalls.push(['register', options, component]); return () => {} },
}
const stubCtx = {
  remote: { $mount: async () => { mounted = true; return () => {} } },
  effect: () => {},
  get: (key) => (key === 'slots' ? slots : {
    list: async () => ({ ok: true, value: { providers: [] } }),
    setKey: async () => ({ ok: true }),
    unsetKey: async () => ({ ok: true }),
    setOrder: async () => ({ ok: true }),
    testProvider: async () => ({ ok: true }),
  }),
}
await exported.apply(stubCtx)
if (!mounted) throw new Error('$mount was not called')

// 1. Exactly one slots.inject call, on the standard 0.2.0 plugin-owned page slot.
const injectCalls = slotsCalls.filter((call) => call[0] === 'inject')
if (injectCalls.length !== 1) throw new Error('expected exactly one slots.inject call: ' + JSON.stringify(injectCalls))
if (slotsCalls[0][0] !== 'inject') throw new Error('slots.inject must be the first slots call')
if (injectCalls[0][1] !== 'plugins.item') throw new Error('wrong slot name: ' + JSON.stringify(injectCalls[0][1]))

// 2. The page descriptor carries the plugin's own non-colliding id and its documented order.
const registerCall = slotsCalls.find((call) => call[0] === 'register')
if (!registerCall) throw new Error('slots.register was not called')
const options = registerCall[1]
const component = registerCall[2]
if (options.name !== 'plugins.item') throw new Error('options.name: ' + JSON.stringify(options.name))
if (options.id !== 'web-search-providers') throw new Error('options.id: ' + JSON.stringify(options.id))
if (options.order !== 12) throw new Error('options.order: ' + JSON.stringify(options.order))

// 3. The label is a thunk so the entry follows the host language.
if (typeof options.label !== 'function') throw new Error('options.label must be a thunk')
const label = options.label()
if (typeof label !== 'string' || label.length === 0) throw new Error('label() must be a non-empty string, got ' + JSON.stringify(label))

// 4. One component serves both the list card's one-liner and the detail page.
if (typeof component !== 'function') throw new Error('component must be a function')
const summary = component({ view: 'summary' })
if (typeof summary !== 'string' || summary.length === 0) throw new Error('component({view:"summary"}) must be a non-empty string, got ' + JSON.stringify(summary))
const page = component({ view: 'page' })
if (!page || typeof page !== 'object' || page.type !== 'element') throw new Error('component({view:"page"}) must return an element, got ' + JSON.stringify(page))

// 5. The namespace is the plugin's own.
if (options.locale !== 'dsh-web-search') throw new Error('options.locale: ' + JSON.stringify(options.locale))
console.log('slot registration:', injectCalls[0][1], options.id, options.order, 'label=' + JSON.stringify(label))
console.log('summary:', JSON.stringify(summary))

// The stylesheet must use the host's design tokens, not fixed values, and the primary button
// must follow the Plugins page contract (label-primary fill, bg-layer-3 text).
if (!injected || !injected.textContent.includes('.dws-btn')) throw new Error('stylesheet was not injected')
for (const token of [
  'var(--dsw-alias-label-primary)',
  'var(--dsw-alias-border-l4)',
  'var(--dsw-alias-bg-layer-3)',
  'var(--dsw-alias-state-error-primary)',
]) {
  if (!injected.textContent.includes(token)) throw new Error(`stylesheet does not consume ${token}`)
}
if (!injected.textContent.includes('.dws-btn--primary{background:var(--dsw-alias-label-primary)')) {
  throw new Error('primary button does not follow the host Plugins page contract')
}
if (injected.textContent.includes('#')) throw new Error('stylesheet contains a fixed colour')
console.log('stylesheet injected:', injected.textContent.split('\n').length, 'rules, token-based only')
console.log('CLIENT BUNDLE SMOKE OK')