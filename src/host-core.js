// @ts-check
/**
 * Host-side pure functions: credential validation, query parsing, Tavily request construction.
 * All pure functions (no ctx dependency), directly testable outside the sandbox with node:test.
 */

/** @typedef {{ method: string, url: string, headers: Record<string, string>, body?: string }} ProviderRequest
 * @typedef {{ url: string, title?: string, snippet?: string, publishedAt?: string }} SearchSource
 * @typedef {{ provider: string, answer?: string, sources: SearchSource[], requestId?: string, authMode: string, truncated?: boolean }} SearchResponse
 * @typedef {{ kind: 'api-key', key: string } | { kind: 'grant', payload: Record<string, unknown> }} CredentialRecord
 * @typedef {{ ok: boolean, kind: 'transport'|'auth'|'http'|'ok'|'invalid', httpStatus?: number, message: string }} ConnectionTestResult
 * @typedef {{ ok: true, id: string, value: string } | { ok: false, error: string }} SetKeyResult
 * @typedef {{ ok: true, id: string } | { ok: false, error: string }} UnsetKeyResult
 * @typedef {{ sites: string[], excludedSites: string[], cleaned: string }} ParsedQuery
 * @typedef {{ query: string, limit?: number, maxResults?: number, recency?: 'day'|'week'|'month'|'year' }} ProviderParams
 * @typedef {{ id: string, label: string, kind: 'apikey'|'endpoint'|'none', build: (params: ProviderParams, key: string) => ProviderRequest, normalize: (data: any) => SearchResponse }} ProviderSpec
 * @typedef {{ order: string[], exclude: string[], timeout: number }} PluginConfig */

/**
 * Classify the result of a single connection test (pure function, unit-testable).
 *
 * Input is the raw return of httpRequest (exitCode + httpStatus + stdout + stderr). Decision:
 * - exitCode != 0 → transport-layer failure (connection timeout/TLS/connection refused, etc.)
 * - 2xx → connection succeeded (credentials valid)
 * - 401/403 → authentication failed (key/endpoint invalid)
 * - otherwise → server error
 *
 * @param {{ exitCode: number, httpStatus?: number, stdout: string, stderr: string }} raw
 * @returns {ConnectionTestResult}
 */
export function classifyConnectionTest(raw) {
  const exitCode = raw && typeof raw.exitCode === 'number' ? raw.exitCode : -1
  if (exitCode !== 0) {
    const detail = String((raw && raw.stderr) || '').trim().slice(0, 300)
    return {
      ok: false,
      kind: 'transport',
      message: `Connection failed (exit ${exitCode})${detail ? `: ${detail}` : ''}`,
    }
  }
  const httpStatus = raw && typeof raw.httpStatus === 'number' ? raw.httpStatus : undefined
  if (httpStatus === undefined) {
    return { ok: false, kind: 'invalid', message: 'No HTTP status in response' }
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return { ok: true, kind: 'ok', httpStatus, message: `Connected (HTTP ${httpStatus})` }
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      kind: 'auth',
      httpStatus,
      message: `Authentication failed (HTTP ${httpStatus})`,
    }
  }
  return { ok: false, kind: 'http', httpStatus, message: `Server error (HTTP ${httpStatus})` }
}

/**
 * Credential record key for each provider (records section, <scope>/<id> format).
 * Not using CredentialRef (environment variable name): values from the environment shadow set, preventing credentials from being saved on the settings page.
 */

/** @type {{ tavily: string, brave: string, exa: string, firecrawl: string, jina: string, kagi: string, searxng: string }} */
export const CREDENTIAL_KEYS = {
  tavily: 'dsh-web-search/tavily',
  brave: 'dsh-web-search/brave',
  exa: 'dsh-web-search/exa',
  firecrawl: 'dsh-web-search/firecrawl',
  jina: 'dsh-web-search/jina',
  kagi: 'dsh-web-search/kagi',
  searxng: 'dsh-web-search/searxng',
}

/**
 * Compute the fallback candidate order (aligned with omp setSearchProviderOrder semantics):
 * - valid providers explicitly listed in order come first (preserving their relative order)
 * - remaining unlisted providers follow in the built-in relative order
 * - providers in exclude are removed entirely
 * @param {string[]|undefined} order User-configured priority
 * @param {string[]} allIds All registered provider ids (built-in order)
 * @param {string[]|undefined} exclude Excluded provider ids
 * @returns {string[]}
 */
export function resolveProviderOrder(order, allIds, exclude) {
  const ex = new Set(exclude || [])
  const prioritized = (order || []).filter(id => allIds.includes(id) && !ex.has(id))
  const rest = allIds.filter(id => !prioritized.includes(id) && !ex.has(id))
  return prioritized.length === 0 ? rest : [...prioritized, ...rest]
}

/**
 * Sanitize user-submitted provider order: keep only registered ids, deduplicate, preserve relative order.
 * Used by the set-order RPC to avoid writing dirty data into config.
 * @param {unknown} value
 * @returns {string[]}
 */
export function sanitizeProviderOrder(value) {
  const seen = new Set()
  const order = []
  if (Array.isArray(value)) {
    for (const id of value) {
      if (typeof id === 'string' && PROVIDER_SPECS[id] && !seen.has(id)) {
        seen.add(id)
        order.push(id)
      }
    }
  }
  return order
}

/**
 * Validate set-key parameters (locate credential record by provider id).
 * kind 'none' (DuckDuckGo) has no key to set; returns an error.
 * kind 'endpoint' (SearXNG) value must be an http(s) URL.
 * @param {{ id?: string, value?: string }} args
 * @returns {SetKeyResult}
 */
export function validateSetKey(args) {
  const id = args && args.id
  const value = args && args.value
  const meta = PROVIDER_SPECS[id]
  if (!meta) return { ok: false, error: 'Unknown provider' }
  if (meta.kind === 'none') return { ok: false, error: 'Provider needs no API key' }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: 'Value cannot be empty' }
  }
  if (meta.kind === 'endpoint') {
    const normalized = normalizeEndpoint(value)
    if (!isHttpUrl(normalized)) {
      return { ok: false, error: 'Endpoint must be an http(s) URL' }
    }
    return { ok: true, id, value: normalized }
  }
  return { ok: true, id, value: value.trim() }
}

/**
 * Validate unset-key parameters. kind 'none' has no credential to clear.
 * @param {{ id?: string }} args
 * @returns {UnsetKeyResult}
 */
export function validateUnsetKey(args) {
  const id = args && args.id
  const meta = PROVIDER_SPECS[id]
  if (!meta) return { ok: false, error: 'Unknown provider' }
  if (meta.kind === 'none') return { ok: false, error: 'Provider needs no API key' }
  return { ok: true, id }
}

/**
 * Whether the value is an http(s) URL (used for SearXNG endpoint validation).
 *
 * Note: the dynamic plugin sandbox (fresh node:vm context) has no URL/URLSearchParams globals,
 * so new URL() cannot be used — use string-prefix matching here to avoid ReferenceError.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  const s = String(value || '').trim()
  if (!s) return false
  // Require http/https protocol + no whitespace (whitespace URLs are invalid)
  return /^https?:\/\/[^\s]+$/i.test(s)
}

/**
 * Normalize endpoint: auto-prepend http:// when the protocol is missing (common for locally self-hosted SearXNG).
 * Preserve as-is if it already carries http/https protocol.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEndpoint(value) {
  const s = String(value || '').trim()
  if (!s) return s
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`
}

/**
 * Map API key to a valid credential record (api-key).
 * @param {string} value
 * @returns {{ kind: 'api-key', key: string }}
 */
export function apiKeyToRecord(value) {
  return { kind: 'api-key', key: value }
}

/**
 * Map SearXNG endpoint to a valid credential record (grant payload { endpoint }).
 * @param {string} value
 * @returns {{ kind: 'grant', payload: { endpoint: string } }}
 */
export function endpointToRecord(value) {
  return { kind: 'grant', payload: { endpoint: value } }
}

/**
 * Read endpoint back from grant record; return undefined when invalid/missing.
 * @param {{ kind?: string, payload?: { endpoint?: string } }} record
 * @returns {string|undefined}
 */
export function recordEndpoint(record) {
  if (record && record.kind === 'grant' && record.payload && typeof record.payload.endpoint === 'string' && record.payload.endpoint.length > 0) {
    return record.payload.endpoint
  }
  return undefined
}

/**
 * @param {{ kind?: string, key?: string }} record
 * @returns {string|undefined}
 */
export function recordApiKey(record) {
  if (record && record.kind === 'api-key' && typeof record.key === 'string' && record.key.length > 0) {
    return record.key
  }
  return undefined
}

/**
 * Simplified query parsing: extract site: / -site: directives.
 * @param {string} query
 * @returns {ParsedQuery}
 */
export function parseQuery(query) {
  const raw = typeof query === 'string' ? query : ''
  if (!raw.trim()) return { sites: [], excludedSites: [], cleaned: raw }
  let sites = []
  let excludedSites = []
  let cleaned = raw.trim()

  // Handle -site: first so the site: regex does not swallow the site: inside -site: (leaving a dangling '-')
  const em = cleaned.match(/(?:^|\s)-site:([^\s]+)/g)
  if (em) {
    excludedSites = em.map(t => t.trim().replace(/^-site:/, '')).filter(Boolean)
    cleaned = cleaned.replace(/(?:^|\s)-site:[^\s]+/g, ' ').trim()
  }
  const m = cleaned.match(/(?:^|\s)site:([^\s]+)/g)
  if (m) {
    sites = m.map(t => t.trim().replace(/^site:/, '')).filter(Boolean)
    cleaned = cleaned.replace(/(?:^|\s)site:[^\s]+/g, ' ').trim()
  }
  return { sites, excludedSites, cleaned: cleaned }
}

/**
 * Construct Tavily request body.
 * @param {{ query: string, limit?: number, maxResults?: number, recency?: string }} params
 * @returns {Record<string, unknown>}
 */
export function buildTavilyBody(params) {
  const parsed = parseQuery(params && params.query)
  const rawLimit = params && (params.maxResults ?? params.limit)
  const limit = rawLimit === undefined
    ? 10
    : Math.min(Math.max(Number(rawLimit) || 1, 1), 20)
  const body = {
    query: parsed.cleaned || '',
    topic: 'general',
    include_answer: true,
    max_results: limit,
  }
  if (params && params.recency) {
    const recencyMap = { day: 'd', week: 'w', month: 'm', year: 'y' }
    body.time_range = recencyMap[params.recency] || params.recency
  }
  if (parsed.sites.length > 0) body.include_domains = parsed.sites
  if (parsed.excludedSites.length > 0) body.exclude_domains = parsed.excludedSites
  return body
}

/**
 * Construct Tavily request (used by PROVIDER_SPECS.tavily.build).
 * @param {{ query: string, limit?: number, maxResults?: number, recency?: string }} params
 * @param {string} key
 * @returns {ProviderRequest}
 */
export function buildTavilyRequest(params, key) {
  return {
    method: 'POST',
    url: 'https://api.tavily.com/search',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildTavilyBody(params)),
  }
}

/**
 * Normalize Tavily API response to a unified SearchResponse.
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeTavilyResponse(data) {
  const sources = []
  if (data && Array.isArray(data.results)) {
    for (const r of data.results) {
      const source = {
        url: (r && r.url) || '',
        title: (r && r.title) || '',
        snippet: (r && r.content) || '',
      }
      const publishedAt = r && (r.published_date || r.publishedDate)
      // Only include publishedAt when present (aligned with the DSH WebSearchSource field name);
      // undefined is not lossless JSON and would be rejected by the harness cloneJson
      if (publishedAt) source.publishedAt = publishedAt
      sources.push(source)
    }
  }
  const answer = data && data.answer
  const requestId = data && data.requestId
  return {
    provider: 'tavily',
    // Same for answer / requestId: undefined is not serialized, omit the field
    ...(answer ? { answer } : {}),
    sources,
    ...(requestId ? { requestId } : {}),
    authMode: 'api_key',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities (streamlined version aligned with omp providers/utils.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamp result count: invalid/missing → default, capped at max.
 * @param {number|undefined} value
 * @param {number} [def=10]
 * @param {number} [max=20]
 * @returns {number}
 */
export function clampNumResults(value, def = 10, max = 20) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(Math.max(Math.floor(n), 1), max)
}

/**
 * Site string or URL → bare host (scheme/path stripped), used by includeDomains and title fallback.
 * @param {string} site
 * @returns {string}
 */
export function hostOf(site) {
  const s = String(site || '').trim()
  if (!s) return ''
  return s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '').split('/')[0].split(/[?#]/)[0]
}

/**
 * recency → YYYY-MM-DD (UTC, date-arithmetic safe, aligned with omp kagi recencyToDate).
 * @param {'day'|'week'|'month'|'year'} recency
 * @returns {string|undefined}
 */
export function recencyToDate(recency) {
  const d = new Date()
  switch (recency) {
    case 'day':
      d.setUTCDate(d.getUTCDate() - 1)
      break
    case 'week':
      d.setUTCDate(d.getUTCDate() - 7)
      break
    case 'month':
      d.setUTCMonth(d.getUTCMonth() - 1)
      break
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() - 1)
      break
    default:
      return undefined
  }
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Synthesize answer from Exa results (at most 3 summaries; returns undefined when no content).
 * @param {Array<{summary?: string, title?: string, url?: string}>} [results]
 * @returns {string|undefined}
 */
export function synthesizeAnswer(results) {
  const parts = []
  if (Array.isArray(results)) {
    for (const r of results) {
      if (parts.length >= 3) break
      const summary = r && typeof r.summary === 'string' ? r.summary.trim() : undefined
      if (!summary) continue
      const title = (r && r.title && r.title.trim()) || (r && r.url) || 'Untitled'
      parts.push(`**${title}**: ${summary}`)
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/**
 * Encode { k: v } as a query string (skipping undefined/null). Pure string implementation.
 * @param {Record<string, unknown>} params
 * @returns {string} e.g. `a=1&b=2` (no `?` prefix, empty returns '')
 */
export function buildQueryString(params) {
  const parts = []
  for (const key of Object.keys(params || {})) {
    const value = params[key]
    if (value === undefined || value === null) continue
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
  }
  return parts.join('&')
}

/**
 * Append query string after base (handles base already having ? or empty query correctly).
 * @param {string} base
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
export function buildUrlWithQuery(base, params) {
  const qs = buildQueryString(params)
  if (!qs) return base
  return base + (base.includes('?') ? '&' : '?') + qs
}

// ─────────────────────────────────────────────────────────────────────────────
// Brave (GET https://api.search.brave.com/res/v1/web/search)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search'

const BRAVE_RECENCY = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }

/**
 * Construct Brave request. Brave parses Google operators inline (site: etc.),
 * so the query is passed through unchanged (directives not stripped), only char-count cap and recency→freshness mapping are applied.
 * @param {{ query: string, limit?: number, maxResults?: number, recency?: string }} params
 * @param {string} key
 * @returns {{ method: string, url: string, headers: Record<string,string> }}
 */
export function buildBraveRequest(params, key) {
  const queryParams = {
    q: (params && params.query) || '',
    count: String(clampNumResults(params && (params.maxResults ?? params.limit))),
    extra_snippets: 'true',
    text_decorations: 'false',
    safesearch: 'moderate',
  }
  if (params && params.recency && BRAVE_RECENCY[params.recency]) {
    queryParams.freshness = BRAVE_RECENCY[params.recency]
  }
  return {
    method: 'GET',
    url: buildUrlWithQuery(BRAVE_URL, queryParams),
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  }
}

/**
 * Normalize Brave response. Results in `web.results[]`; snippet takes description + extra_snippets merged.
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeBraveResponse(data) {
  const sources = []
  const results = data && data.web && Array.isArray(data.web.results) ? data.web.results : []
  for (const r of results) {
    const url = r && r.url
    if (!url) continue
    const source = { url, title: (r && r.title) || hostOf(url) || 'Untitled' }
    const snippets = []
    if (r && typeof r.description === 'string' && r.description.trim()) snippets.push(r.description.trim())
    if (r && Array.isArray(r.extra_snippets)) {
      for (const s of r.extra_snippets) if (typeof s === 'string' && s.trim()) snippets.push(s.trim())
    }
    if (snippets.length > 0) source.snippet = snippets.join('\n')
    const publishedAt = r && r.age
    if (publishedAt) source.publishedAt = publishedAt
    sources.push(source)
  }
  const requestId = data && data.web && data.web.request_id
  const response = { provider: 'brave', sources, authMode: 'api_key' }
  if (requestId) response.requestId = requestId
  return response
}

// ─────────────────────────────────────────────────────────────────────────────
// Exa (POST https://api.exa.ai/search)
// ─────────────────────────────────────────────────────────────────────────────

export const EXA_URL = 'https://api.exa.ai/search'

/**
 * Construct Exa request body + headers. site:/-site: → includeDomains/excludeDomains (bare host),
 * recency → startPublishedDate (YYYY-MM-DD).
 * @param {{ query: string, limit?: number, maxResults?: number, recency?: 'day'|'week'|'month'|'year' }} params
 * @param {string} key
 * @returns {ProviderRequest}
 */
export function buildExaRequest(params, key) {
  const parsed = parseQuery(params && params.query)
  const body = {
    query: parsed.cleaned || '',
    numResults: clampNumResults(params && (params.maxResults ?? params.limit)),
    type: 'auto',
    contents: { summary: { query: parsed.cleaned || '' } },
  }
  if (parsed.sites.length > 0) body.includeDomains = parsed.sites.map(hostOf).filter(Boolean)
  if (parsed.excludedSites.length > 0) body.excludeDomains = parsed.excludedSites.map(hostOf).filter(Boolean)
  if (params && params.recency) {
    const after = recencyToDate(params.recency)
    if (after) body.startPublishedDate = after
  }
  return {
    method: 'POST',
    url: EXA_URL,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  }
}

/**
 * Normalize Exa response. snippet takes summary|text|highlights concatenated (truncated to 500);
 * answer synthesized by synthesizeAnswer.
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeExaResponse(data) {
  const sources = []
  if (data && Array.isArray(data.results)) {
    for (const r of data.results) {
      const url = r && r.url
      if (!url) continue
      const source = { url, title: (r && r.title) || hostOf(url) || 'Untitled' }
      const snippet = (r && (r.summary || r.text || (Array.isArray(r.highlights) ? r.highlights.filter(Boolean).join(' ') : undefined)))
      if (snippet) source.snippet = snippet.length > 500 ? snippet.slice(0, 500) : snippet
      const publishedAt = r && r.publishedDate
      if (publishedAt) source.publishedAt = publishedAt
      sources.push(source)
    }
  }
  const answer = synthesizeAnswer(data && data.results)
  const requestId = data && data.requestId
  const response = { provider: 'exa', sources, authMode: 'api_key' }
  if (answer) response.answer = answer
  if (requestId) response.requestId = requestId
  return response
}

// ─────────────────────────────────────────────────────────────────────────────
// Firecrawl (POST https://api.firecrawl.dev/v2/search)
// ─────────────────────────────────────────────────────────────────────────────

export const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/search'
const FIRECRAWL_RECENCY = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' }

/**
 * Construct Firecrawl request. SERP backend supports Google operators (site: inline),
 * query passed through; recency → tbs (qdr:*).
 * @param {{ query: string, limit?: number, maxResults?: number, recency?: string }} params
 * @param {string} key
 * @returns {ProviderRequest}
 */
export function buildFirecrawlRequest(params, key) {
  const body = {
    query: (params && params.query) || '',
    limit: clampNumResults(params && (params.maxResults ?? params.limit)),
    sources: [{ type: 'web' }],
  }
  if (params && params.recency && FIRECRAWL_RECENCY[params.recency]) {
    body.tbs = FIRECRAWL_RECENCY[params.recency]
  }
  return {
    method: 'POST',
    url: FIRECRAWL_URL,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }
}

/**
 * Normalize Firecrawl response. Results in `data[]` or `data.web[]`.
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeFirecrawlResponse(data) {
  const sources = []
  const list = Array.isArray(data && data.data)
    ? data.data
    : data && data.data && Array.isArray(data.data.web)
      ? data.data.web
      : Array.isArray(data && data.results)
        ? data.results
        : []
  for (const r of list) {
    const url = r && r.url
    if (!url) continue
    const source = { url, title: (r && r.title) || hostOf(url) || 'Untitled' }
    const snippet = r && (r.description || r.snippet || r.markdown)
    if (snippet) source.snippet = snippet
    sources.push(source)
  }
  const requestId = data && data.id
  const response = { provider: 'firecrawl', sources, authMode: 'api_key' }
  if (requestId) response.requestId = requestId
  return response
}

// ─────────────────────────────────────────────────────────────────────────────
// Jina Reader (GET https://s.jina.ai/{query}?count=N)
// ─────────────────────────────────────────────────────────────────────────────

export const JINA_URL = 'https://s.jina.ai'

/**
 * Construct Jina request. Single site: → X-Site header and stripped from query;
 * multiple sites or -site stay inline (parsed by the Bing backend). Default result count 5, cap 20.
 * @param {{ query: string, limit?: number, maxResults?: number }} params
 * @param {string} key
 * @returns {{ method: string, url: string, headers: Record<string,string> }}
 */
export function buildJinaRequest(params, key) {
  const parsed = parseQuery(params && params.query)
  const query = parsed.cleaned || ''
  let site
  if (parsed.sites.length === 1) {
    site = hostOf(parsed.sites[0])
  }
  const url = buildUrlWithQuery(`${JINA_URL}/${encodeURIComponent(query)}`, {
    count: String(clampNumResults(params && (params.maxResults ?? params.limit), 5, 20)),
  })
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${key}`,
    'X-Respond-With': 'no-content',
    'X-Retain-Images': 'none',
  }
  if (site) headers['X-Site'] = site
  return { method: 'GET', url, headers }
}

/**
 * Normalize Jina response. Returns an array or { code, data: [] }.
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeJinaResponse(data) {
  const sources = []
  const list = Array.isArray(data) ? data : data && Array.isArray(data.data) ? data.data : []
  for (const r of list) {
    const url = r && r.url
    if (!url) continue
    const source = { url, title: (r && r.title) || hostOf(url) || 'Untitled' }
    const snippet = r && (r.description || r.content)
    if (snippet) source.snippet = snippet.trim()
    sources.push(source)
  }
  return { provider: 'jina', sources, authMode: 'api_key' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kagi (POST https://kagi.com/api/v1/search)
// ─────────────────────────────────────────────────────────────────────────────

export const KAGI_URL = 'https://kagi.com/api/v1/search'

/**
 * Construct Kagi request. recency → filters.after (YYYY-MM-DD).
 * @param {{ query: string, limit?: number, maxResults?: number, recency?: 'day'|'week'|'month'|'year' }} params
 * @param {string} key
 * @returns {ProviderRequest}
 */
export function buildKagiRequest(params, key) {
  const body = {
    query: (params && params.query) || '',
    workflow: 'search',
    limit: clampNumResults(params && (params.maxResults ?? params.limit)),
  }
  if (params && params.recency) {
    const after = recencyToDate(params.recency)
    if (after) body.filters = { after }
  }
  return {
    method: 'POST',
    url: KAGI_URL,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }
}

/**
 * Normalize Kagi response. Results bucketed in data.search/video/news/infobox;
 * answer taken from data.direct_answer[0].
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeKagiResponse(data) {
  const sources = []
  const buckets = data && data.data && typeof data.data === 'object' ? data.data : {}
  const collect = (items, tag) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      const url = item && (item.url || item.href || item.link)
      if (!url) continue
      const source = { url, title: (item && (item.title || item.name)) || hostOf(url) || 'Untitled' }
      const snippet = item && (item.snippet || item.description || item.summary)
      if (snippet) source.snippet = snippet
      if (item && item.time) source.publishedAt = item.time
      if (tag && source.title !== source.url) source.title = `${tag} ${source.title}`
      sources.push(source)
    }
  }
  collect(buckets.search)
  collect(buckets.video, '[Video]')
  collect(buckets.news, '[News]')
  collect(buckets.infobox, '[Info]')
  const requestId = data && data.meta && (data.meta.trace || data.meta.id)
  let answer
  if (Array.isArray(buckets.direct_answer) && buckets.direct_answer.length > 0) {
    const da = buckets.direct_answer[0]
    answer = da && (da.snippet || da.title)
  }
  const response = { provider: 'kagi', sources, authMode: 'api_key' }
  if (answer) response.answer = answer
  if (requestId) response.requestId = requestId
  return response
}

// ─────────────────────────────────────────────────────────────────────────────
// SearXNG (GET {endpoint}/search?format=json)
// ─────────────────────────────────────────────────────────────────────────────

export const SEARXNG_PATH = '/search'

/** SearXNG recency → time_range (only day/month/year supported, week maps to month). */
export const SEARXNG_RECENCY = { day: 'day', week: 'month', month: 'month', year: 'year' }

/**
 * Construct SearXNG request. Endpoint is the self-hosted address (e.g. https://searx.example.org),
 * query passed through unchanged (bang syntax resolved by the instance), recency → time_range.
 * @param {{ query: string, recency?: string }} params
 * @param {string} endpoint Endpoint URL (with protocol)
 * @returns {ProviderRequest}
 */
export function buildSearXNGRequest(params, endpoint) {
  let base = String(endpoint || '').replace(/\/+$/, '')
  // If the user-supplied endpoint already ends with /search, strip it to avoid /search/search when SEARXNG_PATH is appended later
  if (base.endsWith('/search')) {
    base = base.slice(0, -'/search'.length)
  }
  const queryParams = {
    q: (params && params.query) || '',
    format: 'json',
  }
  if (params && params.recency && SEARXNG_RECENCY[params.recency]) {
    queryParams.time_range = SEARXNG_RECENCY[params.recency]
  }
  const url = buildUrlWithQuery(base + SEARXNG_PATH, queryParams)
  return { method: 'GET', url, headers: { Accept: 'application/json' } }
}

/**
 * Normalize SearXNG response. Results in `results[]`; answer takes the first 3 of `answers[]`.
 * @param {any} data
 * @returns {SearchResponse}
 */
export function normalizeSearXNGResponse(data) {
  const sources = []
  const results = data && Array.isArray(data.results) ? data.results : []
  for (const r of results) {
    const url = r && r.url
    if (!url) continue
    const source = { url, title: (r && r.title) || hostOf(url) || 'Untitled' }
    const snippet = r && (r.content || r.snippet)
    if (snippet) source.snippet = snippet.trim()
    const publishedAt = r && (r.publishedDate || r.published_date)
    if (publishedAt) source.publishedAt = publishedAt
    sources.push(source)
  }
  const answer = formatSearXNGAnswers(data && data.answers)
  const response = { provider: 'searxng', sources, authMode: 'endpoint' }
  if (answer) response.answer = answer
  return response
}

/**
 * Flatten SearXNG answers (strings or structured objects) into an answer (at most 3).
 * @param {Array} [answers]
 * @returns {string|undefined}
 */
export function formatSearXNGAnswers(answers) {
  const texts = []
  if (Array.isArray(answers)) {
    for (const answer of answers) {
      if (texts.length >= 3) break
      let text
      if (typeof answer === 'string') text = answer.trim()
      else if (answer && typeof answer === 'object' && typeof answer.answer === 'string') text = answer.answer.trim()
      if (text) texts.push(text)
    }
  }
  return texts.length ? texts.join('\n\n') : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// DuckDuckGo (keyless: POST https://html.duckduckgo.com/html/ + HTML regex parsing)
// ─────────────────────────────────────────────────────────────────────────────

export const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/'
const DDG_RECENCY = { day: 'd', week: 'w', month: 'm', year: 'y' }

/**
 * Construct DuckDuckGo HTML frontend request (POST form, keyless).
 * @param {{ query: string, recency?: string }} params
 * @returns {ProviderRequest}
 */
export function buildDuckDuckGoRequest(params) {
  const formParams = {
    q: (params && params.query) || '',
    kl: 'us-en',
  }
  if (params && params.recency && DDG_RECENCY[params.recency]) formParams.df = DDG_RECENCY[params.recency]
  formParams.b = ''
  return {
    method: 'POST',
    url: DUCKDUCKGO_HTML_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildQueryString(formParams),
  }
}

/**
 * Decode DDG results page HTML fragment (strip tags + unescape entities + normalize whitespace).
 * @param {unknown} value
 * @returns {string}
 */
export function decodeDuckDuckGoHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Restore the real URL behind DDG result href (handles uddg= wrapping, protocol-relative, and absolute).
 * @param {unknown} href
 * @returns {string|undefined}
 */
export function unwrapDuckDuckGoUrl(href) {
  if (!href) return undefined
  const decoded = String(href).replace(/&amp;/gi, '&')
  const wrapMatch = decoded.match(/[?&]uddg=([^&]+)/)
  if (wrapMatch) {
    try {
      return decodeURIComponent(wrapMatch[1])
    } catch {
      return undefined
    }
  }
  if (decoded.startsWith('//')) return `https:${decoded}`
  if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded
  return undefined
}

/**
 * Whether the page is a DDG bot challenge page (body features, not status code).
 * @param {unknown} html
 * @returns {boolean}
 */
export function isDuckDuckGoAnomaly(html) {
  const text = String(html || '')
  return text.includes('anomaly-modal') || text.includes('anomaly.js')
}

/**
 * Parse DDG HTML results page, returning unified sources.
 * @param {string} html
 * @returns {Array<{url: string, title: string, snippet?: string}>}
 */
export function parseDuckDuckGoHtml(html) {
  const sources = []
  const text = String(html || '')
  const blockRe =
    /<div\b[^>]*\bclass="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*\bclass="[^"]*\bresult\b|<div\b[^>]*\bclass="[^"]*\bnav-link\b|$)/g
  const titleRe = /<a\b[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
  const snippetRe = /<(?:a|div|span)\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/
  for (const match of text.matchAll(blockRe)) {
    const block = match[1]
    const title = titleRe.exec(block)
    if (!title) continue
    const url = unwrapDuckDuckGoUrl(title[1])
    if (!url) continue
    const titleText = decodeDuckDuckGoHtml(title[2])
    if (!titleText) continue
    const snip = snippetRe.exec(block)
    const source = { url, title: titleText }
    if (snip) {
      const snippetText = decodeDuckDuckGoHtml(snip[1])
      if (snippetText) source.snippet = snippetText
    }
    sources.push(source)
  }
  return sources
}

/**
 * Normalize DuckDuckGo response. Input is an HTML string (not JSON);
 * returns empty sources on a challenge page (the fallback chain continues trying other providers).
 * @param {string} html
 * @returns {SearchResponse}
 */
export function normalizeDuckDuckGoResponse(html) {
  if (isDuckDuckGoAnomaly(html)) {
    return { provider: 'duckduckgo', sources: [], authMode: 'keyless' }
  }
  return { provider: 'duckduckgo', sources: parseDuckDuckGoHtml(html), authMode: 'keyless' }
}

/**
 * Registry of Provider → request construction + response normalization (aligned with omp provider.ts lazy-load table).
 * Each entry provides id/label + build(params, key) → httpRequest params + normalize(data) → unified response.
 * @type {Record<string, ProviderSpec>}
 */
export const PROVIDER_SPECS = {
  tavily: { id: 'tavily', label: 'Tavily', kind: 'apikey', build: buildTavilyRequest, normalize: normalizeTavilyResponse },
  brave: { id: 'brave', label: 'Brave', kind: 'apikey', build: buildBraveRequest, normalize: normalizeBraveResponse },
  exa: { id: 'exa', label: 'Exa', kind: 'apikey', build: buildExaRequest, normalize: normalizeExaResponse },
  firecrawl: { id: 'firecrawl', label: 'Firecrawl', kind: 'apikey', build: buildFirecrawlRequest, normalize: normalizeFirecrawlResponse },
  jina: { id: 'jina', label: 'Jina', kind: 'apikey', build: buildJinaRequest, normalize: normalizeJinaResponse },
  kagi: { id: 'kagi', label: 'Kagi', kind: 'apikey', build: buildKagiRequest, normalize: normalizeKagiResponse },
  searxng: { id: 'searxng', label: 'SearXNG', kind: 'endpoint', build: buildSearXNGRequest, normalize: normalizeSearXNGResponse },
  duckduckgo: { id: 'duckduckgo', label: 'DuckDuckGo', kind: 'none', build: buildDuckDuckGoRequest, normalize: normalizeDuckDuckGoResponse },
}
/**
 * Default config: fallback order = all registered providers (built-in relative order).
 * key kinds first, SearXNG (needs endpoint) in the middle, DuckDuckGo (keyless fallback) at the end.
 * @type {{ order: string[], exclude: string[], timeout: number }}
 */
export const DEFAULT_CONFIG = {
  order: Object.keys(PROVIDER_SPECS),
  exclude: [],
  timeout: 60,
}

/**
 * Valid key for plugin config in the credentials records section.
 * The records section key must be `<scope>/<id>` (scope is the plugin name), otherwise credential document parsing fails
 * and all set/unset throw errors (root cause: previously used slash-less 'web-search-config').
 */
export const CONFIG_KEY = 'dsh-web-search/config'

/**
 * Map plugin config to a valid credential record (grant).
 * The records section only accepts { kind: 'api-key' } or { kind: 'grant' }; wrongly writing { value }
 * makes the credential file fail to parse before the next write, causing all set/unset to throw.
 * @param {PluginConfig} config
 * @returns {{ kind: 'grant', payload: PluginConfig }}
 */
export function configToRecord(config) {
  return { kind: 'grant', payload: config }
}

/**
 * Read config back from grant record; return defaults on invalid/missing structure.
 * @param {Record<string, any>|undefined|null} record
 * @param {PluginConfig} defaults
 * @returns {PluginConfig}
 */
export function recordToConfig(record, defaults) {
  if (record && record.kind === 'grant' && record.payload && typeof record.payload === 'object') {
    const p = record.payload
    return {
      order: Array.isArray(p.order) ? p.order : (defaults.order || []),
      exclude: Array.isArray(p.exclude) ? p.exclude : (defaults.exclude || []),
      timeout: typeof p.timeout === 'number' && p.timeout > 0 ? p.timeout : (defaults.timeout || 60),
    }
  }
  return Object.assign({}, defaults)
}
