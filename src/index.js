/**
 * dsh-web-search — static plugin host entry.
 *
 * Converts the battle-tested dynamic plugin (plugin/host-body.js) into the
 * static Cordis plugin shape for local `--patch` development and later npm
 * packaging. The pure provider logic lives in `src/host-core.js` (unit-tested
 * in tests/); this file owns the ctx-facing shell:
 *
 * - a native-`fetch` transport (the Host realm has fetch/URL/URLSearchParams),
 * - a `ctx.web` provider (id=dsh-web-search) so the native `web_search` tool
 *   is backed by this plugin's multi-provider fallback chain,
 * - the `websearch` Remote namespace (src/remote.js) serving the settings page.
 *
 * Loaded with:
 *   pnpm dsh web --patch D:/development/dsh-web-search/patch.web.yml   # run inside the D:/development/deepseek-harness source workspace; web is an alias for --profile web
 */

import { WebSearchController, hostContribution } from './remote.js'
import {
  CREDENTIAL_KEYS,
  CONFIG_KEY,
  DEFAULT_CONFIG,
  resolveProviderOrder,
  sanitizeProviderOrder,
  validateSetKey,
  validateUnsetKey,
  apiKeyToRecord,
  endpointToRecord,
  recordApiKey,
  recordEndpoint,
  configToRecord,
  recordToConfig,
  PROVIDER_SPECS,
  classifyConnectionTest,
} from './host-core.js'

export const name = 'dsh-web-search'

/** Services this plugin hard-depends on (all present in the base web profile). */
export const inject = ['web', 'credentials', 'typert']

export function apply(ctx) {
  // ================= Credentials & Config Access =================
  function getCredentials() {
    return ctx.get('credentials')
  }

  async function readCredentialRecord(id) {
    const creds = getCredentials()
    if (!creds) return undefined
    try {
      return await creds.readRecord(CREDENTIAL_KEYS[id])
    } catch (e) {
      console.warn('[dsh-web-search] readCredentialRecord(' + id + ') failed: ' + ((e && e.message) || String(e)))
      return undefined
    }
  }

  async function readApiKey(id) {
    return recordApiKey(await readCredentialRecord(id))
  }

  async function readEndpoint(id) {
    return recordEndpoint(await readCredentialRecord(id))
  }

  async function apiKeyAvailable(id) {
    return (await readApiKey(id)) !== undefined
  }

  async function endpointAvailable(id) {
    return (await readEndpoint(id)) !== undefined
  }

  async function loadConfig() {
    const creds = getCredentials()
    if (!creds) return Object.assign({}, DEFAULT_CONFIG)
    try {
      return recordToConfig(await creds.readRecord(CONFIG_KEY), DEFAULT_CONFIG)
    } catch (e) {
      /* ignore */
    }
    return Object.assign({}, DEFAULT_CONFIG)
  }

  async function saveConfig(newConfig) {
    const creds = getCredentials()
    if (!creds) throw new Error('Credentials service unavailable')
    await creds.modifyRecord(CONFIG_KEY, async function () {
      return configToRecord(newConfig)
    })
  }

  // ================= Transport: native fetch (Host realm) =================
  async function httpRequest(opts) {
    const timeoutMs = opts.timeoutMs || 60000
    const controller = new AbortController()
    let settled = false
    const timer = setTimeout(function () {
      if (!settled) controller.abort(new Error('timeout after ' + timeoutMs + 'ms'))
    }, timeoutMs)
    let onAbort = null
    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer)
        throw opts.signal.reason || new Error('aborted')
      }
      onAbort = function () {
        if (!settled) controller.abort(opts.signal.reason)
      }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }
    try {
      const response = await fetch(opts.url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body,
        signal: controller.signal,
        redirect: 'follow',
      })
      const text = await response.text()
      settled = true
      return { status: 0, stdout: text, stderr: '', httpStatus: response.status }
    } catch (e) {
      if (controller.signal.aborted) {
        throw e && e.name === 'AbortError' && e.message === undefined
          ? new Error('request timed out after ' + timeoutMs + 'ms')
          : e
      }
      throw new Error('request failed: ' + ((e && e.message) || String(e)))
    } finally {
      settled = true
      clearTimeout(timer)
      if (onAbort && opts.signal) opts.signal.removeEventListener('abort', onAbort)
    }
  }

  // ================= Provider Registry & Instances =================
  const providerInstances = {}

  function createProvider(spec) {
    return {
      id: spec.id,
      label: spec.label,
      available: async function () {
        if (spec.kind === 'none') return true
        if (spec.kind === 'endpoint') return await endpointAvailable(spec.id)
        return await apiKeyAvailable(spec.id)
      },
      search: async function (params) {
        let cred = null
        if (spec.kind === 'apikey') {
          cred = await readApiKey(spec.id)
          if (!cred) throw new Error(spec.label + ' API key not configured')
        } else if (spec.kind === 'endpoint') {
          cred = await readEndpoint(spec.id)
          if (!cred) throw new Error(spec.label + ' endpoint not configured')
        }
        const req = spec.build(params, cred)
        const result = await httpRequest({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body,
          timeoutMs: params.timeoutMs || 60000,
          signal: params.signal,
        })
        if (result.httpStatus !== undefined && (result.httpStatus < 200 || result.httpStatus >= 300)) {
          throw new Error(spec.label + ' request failed (HTTP ' + result.httpStatus + '): ' + (result.stdout || '').slice(0, 200))
        }
        if (spec.kind === 'none') {
          // DuckDuckGo: response is HTML, do not JSON.parse
          return spec.normalize(result.stdout)
        }
        let data
        try {
          data = JSON.parse(result.stdout)
        } catch (e) {
          throw new Error(spec.label + ' returned invalid JSON: ' + (result.stdout || '').slice(0, 200))
        }
        return spec.normalize(data)
      },
    }
  }

  function getProvider(id) {
    if (providerInstances[id]) return providerInstances[id]
    const spec = PROVIDER_SPECS[id]
    if (!spec) return undefined
    providerInstances[id] = createProvider(spec)
    return providerInstances[id]
  }

  // ================= Search Orchestration (fallback chain) =================
  let currentConfig = null
  async function ensureConfig() {
    if (!currentConfig) currentConfig = await loadConfig()
    return currentConfig
  }

  async function resolveCandidates() {
    const config = await ensureConfig()
    const order = resolveProviderOrder(config.order, Object.keys(PROVIDER_SPECS), config.exclude)
    const candidates = []
    for (let i = 0; i < order.length; i++) {
      candidates.push({ id: order[i] })
    }
    return candidates
  }

  function hasRenderableContent(response) {
    if (response && response.answer && response.answer.trim()) return true
    if (response && response.sources && response.sources.length > 0) return true
    return false
  }

  async function executeSearch(params, execOpts) {
    const signal = execOpts && execOpts.signal
    const candidates = await resolveCandidates()
    const failures = []
    let lastProvider = null
    const effectiveMax = params.maxResults ?? params.num_search_results ?? params.limit ?? 5
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]
      const provider = getProvider(cand.id)
      if (!provider) continue
      try {
        const available = await provider.available()
        if (!available) {
          failures.push({ id: cand.id, error: 'unavailable' })
          continue
        }
        lastProvider = provider
        const response = await provider.search({
          query: params.query,
          limit: params.limit,
          recency: params.recency,
          maxResults: effectiveMax,
          timeoutMs: (await ensureConfig()).timeout * 1000,
          signal: signal,
        })
        if (hasRenderableContent(response)) {
          const sources = response.sources || []
          return {
            ...(response.answer ? { content: response.answer } : {}),
            sources: sources.length > effectiveMax ? sources.slice(0, effectiveMax) : sources,
            truncated: false,
            provider: lastProvider && lastProvider.label,
          }
        }
        failures.push({ id: cand.id, error: 'no renderable content' })
      } catch (e) {
        if (signal && signal.aborted) throw e
        failures.push({ id: cand.id, error: e.message || String(e) })
      }
    }
    if (failures.length === 0) {
      return { content: 'Error: No web search provider configured.', sources: [], truncated: false }
    }
    const lastErr = failures[failures.length - 1]
    return {
      content: 'Error: ' + (lastProvider ? lastProvider.label + ' ' : '') + (lastErr.error || 'search failed'),
      sources: [],
      truncated: false,
    }
  }

  // ================= Remote ops (called by the websearch namespace) =================
  const ops = {
    listProviders: async function () {
      const config = await ensureConfig()
      const creds = getCredentials()
      const providers = []
      // Return in effective fallback order (user order first + unlisted appended), the settings page shows the real search order
      const order = resolveProviderOrder(config.order, Object.keys(PROVIDER_SPECS), config.exclude)
      for (let i = 0; i < order.length; i++) {
        const id = order[i]
        const meta = PROVIDER_SPECS[id]
        let keyStatus = { configured: false, source: 'none', writable: false }
        if (creds && CREDENTIAL_KEYS[id]) {
          try {
            const info = await creds.describeRecord(CREDENTIAL_KEYS[id])
            if (info) keyStatus = { configured: !!info.configured, source: 'plugin', writable: !!info.writable }
          } catch (e) {
            /* ignore */
          }
        }
        providers.push({ id: id, label: meta.label, kind: meta.kind, keyStatus: keyStatus })
      }
      return { providers: providers }
    },

    setKey: async function (args) {
      const v = validateSetKey(args)
      if (!v.ok) return v
      const creds = getCredentials()
      if (!creds) return { ok: false, error: 'Credentials service unavailable' }
      try {
        const meta = PROVIDER_SPECS[v.id]
        const record = meta && meta.kind === 'endpoint' ? endpointToRecord(v.value) : apiKeyToRecord(v.value)
        await creds.modifyRecord(CREDENTIAL_KEYS[v.id], async function () {
          return record
        })
        return { ok: true }
      } catch (e) {
        return { ok: false, error: 'Failed to save credential: ' + ((e && e.message) || String(e)) }
      }
    },

    unsetKey: async function (args) {
      const v = validateUnsetKey(args)
      if (!v.ok) return v
      const creds = getCredentials()
      if (!creds) return { ok: false, error: 'Credentials service unavailable' }
      try {
        await creds.deleteRecord(CREDENTIAL_KEYS[v.id])
        return { ok: true }
      } catch (e) {
        return { ok: false, error: 'Failed to clear credential: ' + ((e && e.message) || String(e)) }
      }
    },

    setOrder: async function (args) {
      const raw = args && args.order
      if (!Array.isArray(raw)) return { ok: false, error: 'order must be an array of provider ids' }
      const order = sanitizeProviderOrder(raw)
      const config = await ensureConfig()
      const next = { order: order, exclude: config.exclude || [], timeout: config.timeout || 60 }
      try {
        await saveConfig(next)
      } catch (e) {
        return { ok: false, error: 'Failed to save config: ' + ((e && e.message) || String(e)) }
      }
      // Sync the in-memory cache so subsequent executeSearch uses the new order immediately
      currentConfig = next
      return { ok: true, order: order }
    },

    testProvider: async function (args) {
      const id = args && args.id
      const meta = PROVIDER_SPECS[id]
      if (!meta) return { ok: false, error: 'Unknown provider' }
      // Read credentials: apikey / endpoint must be configured before testing; none (DDG) is testable without credentials
      let cred = null
      if (meta.kind === 'apikey') {
        cred = await readApiKey(id)
        if (!cred) return { ok: false, error: meta.label + ' API key not configured — save a key first' }
      } else if (meta.kind === 'endpoint') {
        cred = await readEndpoint(id)
        if (!cred) return { ok: false, error: meta.label + ' endpoint not configured — save an endpoint first' }
      }
      try {
        const req = meta.build({ query: 'test', limit: 1 }, cred)
        const result = await httpRequest({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body,
          timeoutMs: 15000,
        })
        const verdict = classifyConnectionTest({ exitCode: result.status, httpStatus: result.httpStatus, stdout: result.stdout, stderr: result.stderr })
        return {
          ok: verdict.ok,
          kind: verdict.kind || 'unknown',
          httpStatus: verdict.httpStatus,
          message: verdict.message,
          provider: id,
        }
      } catch (e) {
        return { ok: false, kind: 'error', message: (e && e.message) ? e.message : String(e), provider: id }
      }
    },
  }
  // ================= Remote Controller (constructs and registers the service) =================
  new WebSearchController(ctx, ops)

  // Register strict invocations into typert.local (the data source for gateway claims/resolve)
  try {
    ctx.typert.register(hostContribution())
  } catch (e) {
    console.error('[dsh-web-search] Failed to register typert host contribution', e)
  }

  // === ctx.web provider injection (backs the native web_search tool) ===
  // Always register provider id=dsh-web-search. Selection semantics are entirely controlled by the web row config's
  // searchProvider (resolveProvider configuredId branch):
  // - patch applied searchProvider: dsh-web-search → we are selected (deterministic)
  // - patch not applied → we + deepseek-official are both available, no configuredId →
  //   native web_search throws WEB_PROVIDER_AMBIGUOUS (loud, the user immediately knows the config
  //   didn't take effect, instead of silently using deepseek)
  // This is the harness's fail-loud philosophy: fail correctly when config is missing, don't silently degrade.
  try {
    const web = ctx.get('web')
    if (web) {
      const disposeProvider = web.registerSearchProvider({
        id: 'dsh-web-search',
        // Always available: selection semantics are not controlled by available(), but by the searchProvider config
        available: function () { return true },
        search: async function (request, signal) {
          const result = await executeSearch(
            { query: request && request.query, maxResults: request && request.maxResults },
            { signal: signal }
          )
          // Fall back to native deepseek search when the entire chain fails. nativeSearch is read on demand at call time,
          // avoiding coupling with the web-search-deepseek apply order (the patch layer loads after the base
          // row, but this does not depend on that order).
          if (result && typeof result.content === 'string' && result.content.indexOf('Error:') === 0) {
            try {
              const providers = web.searchProviders
              const native = providers && typeof providers.get === 'function'
                ? providers.get('deepseek-official') : null
              if (native && typeof native.search === 'function') {
                const fallback = await native.search(request, signal)
                if (fallback && Array.isArray(fallback.sources)) return fallback
              }
            } catch (e) {
              /* native also failed, return our own error */
            }
          }
          return result
        },
      })
      if (disposeProvider) ctx.effect(function () { return disposeProvider })
      // Read the runtime searchProviderId (WebRuntime's private field, at runtime it is a real property)
      let currentId = ''
      try { currentId = web.searchProviderId } catch (e) { /* ignore */ }
      console.log('[dsh-web-search] native web_search provider registered (id=dsh-web-search); searchProviderId=' + JSON.stringify(currentId) + ' — if searchProviderId is not dsh-web-search, native web_search will not use this plugin (will be AMBIGUOUS or fall back to deepseek)')
    }
  } catch (e) {
    console.error('[dsh-web-search] provider injection skipped', e)
  }

  ensureConfig().catch(function (e) {
    console.error('[dsh-web-search] Failed to load config', e)
  })
  console.log('[dsh-web-search] host loaded: webSearchController + typert contribution registered, native web_search provider registered')
}
