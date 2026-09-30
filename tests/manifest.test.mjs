/**
 * manifest.test.mjs — Manifest guards for the single-train DSH `0.2.0-rc.2` adaptation.
 *
 * Pure tier: no installed package is imported, so these guards still run on a clean
 * checkout. One pure checker over `{ manifest, sources }` drives both directions —
 * the shipped manifest (must report nothing) and the pre-change peer literal (must
 * report the dead declaration) — so the non-vacuous control reuses exactly the code
 * that guards the real manifest.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const TARGET_VERSION = /^0\.2\.0(?:-rc\.\d+)?$/
const TARGET_PEER_RANGE = '^0.2.0-rc.2'
const TARGET_CORDIS_RANGE = '~4.0.4'
const TARGET_TRAIN_PREFIX = '0.2.0'
const PREVIOUS_TRAIN = '0.1.5'
const DEAD_PEER = '@deepseek-ai/dsh-tools'

// Tokens a compatibility decision would need in order to branch on a runtime-reported
// DSH version instead of the declared peer ranges. `src/` must contain none of them.
const VERSION_SNIFFING_TOKENS = ['getDshRuntimeVersion', 'DSH_VERSION', 'dshVersion', 'process.env.DSH', 'semver']

const readSources = (dir) =>
  readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true })
    .filter((rel) => /\.(js|mjs)$/.test(rel))
    .map((rel) => ({ path: `${dir}/${rel}`, text: readFileSync(new URL(`../${dir}/${rel}`, import.meta.url), 'utf8') }))

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const sources = { src: readSources('src'), tests: readSources('tests') }

const importPatterns = (name) => [
  new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
  new RegExp(`import\\s*\\(\\s*['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
  new RegExp(`require\\(\\s*['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
]

/**
 * Evidence that a declared `@deepseek-ai/dsh*` peer is actually used. Three channels,
 * each one a real declaration of use:
 *   * an import specifier in `src/` or `tests/` — what the code loads directly;
 *   * a `dsh.client.inject` entry — the browser half's declared runtime dependency;
 *   * the capability seam the peer provides, reached as `ctx.get('<seam>')`.
 * The third channel is why `@deepseek-ai/dsh-web` is not a dead declaration: the plugin
 * reaches the web seam through `ctx.get('web')` (src/index.js) rather than importing the
 * package. A peer nothing reaches through any channel is dead and must be undeclared.
 */
function peerUseEvidence(manifest, sources, peer) {
  const files = [...sources.src, ...sources.tests]
  const patterns = importPatterns(peer)
  if (patterns.some((re) => files.some((f) => re.test(f.text)))) return 'import'

  const inject = (manifest.dsh && manifest.dsh.client && manifest.dsh.client.inject) || []
  if (inject.includes(peer)) return 'dsh.client.inject'

  const seam = peer.replace('@deepseek-ai/dsh-', '')
  const seamQuery = new RegExp(`get\\(\\s*['"]${seam}['"]\\s*\\)`)
  if (files.some((f) => seamQuery.test(f.text))) return `ctx.get('${seam}')`
  return null
}

/** Offending items found in `src/` that derive a compat decision from a runtime version. */
function scanVersionSniffing(files) {
  const offenses = []
  for (const file of files) {
    for (const token of VERSION_SNIFFING_TOKENS) {
      if (file.text.includes(token)) offenses.push(`version-sniffing:${file.path}:${token}`)
    }
  }
  return offenses
}

/** Pure checker: returns the offending items (`[]` when the manifest honours the train). */
function checkManifest({ manifest, sources }) {
  const offenses = []
  const peers = manifest.peerDependencies || {}
  const peersMeta = manifest.peerDependenciesMeta || {}
  const client = manifest.dsh && manifest.dsh.client
  const bundle = manifest.dsh && manifest.dsh.bundle

  if (!TARGET_VERSION.test(manifest.version || '')) offenses.push(`version:${manifest.version}`)

  const declared = Object.entries(peers)
  for (const [name, range] of declared.filter(([n]) => n.startsWith('@deepseek-ai/dsh'))) {
    // Exactly the train range is strictly stronger than "no range mentions 0.1.5".
    if (range !== TARGET_PEER_RANGE) offenses.push(`peer-range:${name}@${range}`)
    if (!peerUseEvidence(manifest, sources, name)) offenses.push(`dead-peer:${name}`)
  }
  for (const [name, range] of declared.filter(([n]) => !n.startsWith('@deepseek-ai/dsh'))) {
    if (String(range).includes(PREVIOUS_TRAIN)) offenses.push(`previous-train-range:${name}@${range}`)
  }

  if (peers[DEAD_PEER] !== undefined || peersMeta[DEAD_PEER] !== undefined) offenses.push(`dead-peer:${DEAD_PEER}`)

  if (peers['@deepseek-ai/cordis'] !== TARGET_CORDIS_RANGE) {
    offenses.push(`peer-range:@deepseek-ai/cordis@${peers['@deepseek-ai/cordis']}`)
  }

  offenses.push(...scanVersionSniffing(sources.src))

  if (JSON.stringify(client && client.inject) !== JSON.stringify(['@deepseek-ai/dsh-api-remotes'])) {
    offenses.push('mechanism:dsh.client.inject')
  }
  for (const dep of (client && client.inject) || []) {
    if (peers[dep] === undefined) offenses.push(`inject-not-a-peer:${dep}`)
  }
  if (!bundle || bundle.patch !== './cordis.patch.yml') offenses.push('mechanism:dsh.bundle.patch')
  if (!client || client.platform !== 'web') offenses.push('mechanism:dsh.client.platform')

  return [...new Set(offenses)]
}

test('manifest declares exactly one train', () => {
  assert.match(manifest.version, TARGET_VERSION)
  assert.equal(manifest.version.split('-')[0], TARGET_TRAIN_PREFIX)
})

test('no peer range admits the previous train', () => {
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    assert.equal(String(range).includes(PREVIOUS_TRAIN), false, `${name} still admits the previous train: ${range}`)
  }
})

test('manifest guards report nothing for the shipped manifest', () => {
  // Non-empty in the companion control below, so this emptiness is produced by the
  // real manifest passing the rules, not by a loop that never ran.
  const offenses = checkManifest({ manifest, sources })
  assert.deepEqual(offenses, [], `manifest guards failed: ${offenses.join(', ')}`)
})

test('dead-peer check fails on an unused declaration, naming it', () => {
  const preChange = {
    ...manifest,
    version: '0.1.5-rc.3',
    peerDependencies: {
      '@deepseek-ai/dsh-api-remotes': '^0.1.5-rc.3',
      '@deepseek-ai/dsh-tools': '^0.1.5-rc.3',
      '@deepseek-ai/dsh-typert-protocol': '^0.1.5-rc.3',
      '@deepseek-ai/dsh-web': '^0.1.5-rc.3',
      '@deepseek-ai/cordis': '^4.0.2',
    },
  }
  const offenses = checkManifest({ manifest: preChange, sources })
  // Exactly the unused declaration is reported dead — the other three peers are reached
  // by an import, `dsh.client.inject`, or the `ctx.get('web')` seam.
  assert.deepEqual(offenses.filter((o) => o.startsWith('dead-peer:')), [`dead-peer:${DEAD_PEER}`])
  assert.ok(offenses.includes('version:0.1.5-rc.3'), `train version not named: ${offenses.join(', ')}`)
  assert.ok(offenses.includes('peer-range:@deepseek-ai/cordis@^4.0.2'), `cordis range not named: ${offenses.join(', ')}`)
  assert.equal(offenses.filter((o) => o.startsWith('peer-range:@deepseek-ai/dsh')).length, 4)
})

test('no compatibility decision sniffs a runtime-reported DSH version', () => {
  const hit = scanVersionSniffing([{ path: 'literal.js', text: "if (getDshRuntimeVersion() !== '0.2.0-rc.2') skip()" }])
  assert.equal(hit.length, 1)
  assert.match(hit[0], /getDshRuntimeVersion/)
  assert.deepEqual(scanVersionSniffing(sources.src), [], 'src/ derives a compat decision from a runtime version')
})

test('client-bundle authoring mechanisms are unchanged', () => {
  assert.deepEqual(manifest.dsh.client.inject, ['@deepseek-ai/dsh-api-remotes'])
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
})
