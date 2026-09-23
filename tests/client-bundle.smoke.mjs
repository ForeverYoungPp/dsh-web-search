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
  if (spec === 'react') return {}
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

// Exercise apply with a minimal stub ctx.
const stubCtx = {
  remote: { $mount: async () => { mounted = true; return () => {} } },
  effect: () => {},
  get: (key) => (key === 'slots' ? null : {
    list: async () => ({ ok: true, value: { providers: [] } }),
    setKey: async () => ({ ok: true }),
    unsetKey: async () => ({ ok: true }),
    setOrder: async () => ({ ok: true }),
    testProvider: async () => ({ ok: true }),
  }),
}
await exported.apply(stubCtx)
if (!mounted) throw new Error('$mount was not called')

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