// Client bundle smoke test: simulate the browser module loader, execute the
// hand-written factory, and verify the registration + exports contract.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let captured = null
let mounted = false

const sandbox = {
  console,
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

if (!captured || captured.id !== '@deepseek-ai/dsh-web-search') {
  throw new Error('registration not captured: ' + JSON.stringify(captured && captured.id))
}
const exported = captured.factory(fakeRequire)
console.log('exported keys:', Object.keys(exported).join(', '))
console.log('name:', exported.name)
console.log('inject:', JSON.stringify(exported.inject))
if (exported.name !== '@deepseek-ai/dsh-web-search') throw new Error('bad name')
if (typeof exported.apply !== 'function') throw new Error('apply missing')

// Validate inject payload
if (!Array.isArray(exported.inject) || exported.inject.some((x) => typeof x !== 'string' || x.length === 0)) {
  throw new Error('bad inject payload')
}

// Exercise apply with a minimal stub ctx
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
console.log('CLIENT BUNDLE SMOKE OK')