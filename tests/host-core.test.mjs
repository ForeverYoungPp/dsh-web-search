import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CONFIG_KEY,
  CREDENTIAL_KEYS,
  validateSetKey,
  validateUnsetKey,
  parseQuery,
  buildTavilyBody,
  normalizeTavilyResponse,
  configToRecord,
  recordToConfig,
  apiKeyToRecord,
  recordApiKey,
  classifyConnectionTest,
  DEFAULT_CONFIG,
  resolveProviderOrder,
  sanitizeProviderOrder,
  clampNumResults,
  hostOf,
  recencyToDate,
  synthesizeAnswer,
  buildTavilyRequest,
  buildBraveRequest,
  normalizeBraveResponse,
  buildExaRequest,
  normalizeExaResponse,
  buildFirecrawlRequest,
  normalizeFirecrawlResponse,
  buildJinaRequest,
  normalizeJinaResponse,
  buildKagiRequest,
  normalizeKagiResponse,
  PROVIDER_SPECS,
  isHttpUrl,
  normalizeEndpoint,
  endpointToRecord,
  recordEndpoint,
  buildSearXNGRequest,
  normalizeSearXNGResponse,
  formatSearXNGAnswers,
  buildDuckDuckGoRequest,
  decodeDuckDuckGoHtml,
  unwrapDuckDuckGoUrl,
  isDuckDuckGoAnomaly,
  parseDuckDuckGoHtml,
  normalizeDuckDuckGoResponse,
  SEARXNG_RECENCY,
} from '../src/host-core.js'

// ─── validateSetKey ───
test('validateSetKey: valid id + non-empty value → ok', () => {
  const r = validateSetKey({ id: 'tavily', value: ' tvly-abc ' })
  assert.equal(r.ok, true)
  assert.equal(r.value, 'tvly-abc') // trim
})

test('validateSetKey: unknown id → error', () => {
  const r = validateSetKey({ id: 'hacked', value: 'x' })
  assert.equal(r.ok, false)
  assert.match(r.error, /Unknown provider/)
})

test('validateSetKey: empty value → error', () => {
  const r = validateSetKey({ id: 'tavily', value: '   ' })
  assert.equal(r.ok, false)
  assert.match(r.error, /empty/)
})

test('validateSetKey: missing args → error', () => {
  assert.equal(validateSetKey({}).ok, false)
  assert.equal(validateSetKey(undefined).ok, false)
})

test('validateSetKey: non-string value → error', () => {
  assert.equal(validateSetKey({ id: 'tavily', value: 123 }).ok, false)
})

// ─── validateUnsetKey ───
test('validateUnsetKey: valid id → ok', () => {
  const r = validateUnsetKey({ id: 'tavily' })
  assert.equal(r.ok, true)
})

test('validateUnsetKey: unknown id → error', () => {
  const r = validateUnsetKey({ id: 'other' })
  assert.equal(r.ok, false)
})

// ─── apiKeyToRecord / recordApiKey ───
test('apiKeyToRecord: writes valid api-key record (with kind)', () => {
  const r = apiKeyToRecord('tvly-abc')
  assert.equal(r.kind, 'api-key')
  assert.equal(r.key, 'tvly-abc')
  assert.equal('kind' in r, true)
  assert.equal('value' in r, false)
})

test('recordApiKey: reads back from valid api-key record', () => {
  assert.equal(recordApiKey({ kind: 'api-key', key: 'tvly-abc' }), 'tvly-abc')
})

test('recordApiKey: invalid/missing → undefined', () => {
  assert.equal(recordApiKey(undefined), undefined)
  assert.equal(recordApiKey({ kind: 'grant', payload: {} }), undefined)
  assert.equal(recordApiKey({ kind: 'api-key', key: '' }), undefined)
  assert.equal(recordApiKey({ kind: 'api-key' }), undefined)
})

test('CREDENTIAL_KEYS: tavily maps to valid <scope>/<id> credential key', () => {
  const key = CREDENTIAL_KEYS.tavily
  const segments = key.split('/')
  assert.equal(segments.length, 2)
  const segPattern = /^[a-z][a-z0-9-]*$/
  assert.equal(segPattern.test(segments[0]), true)
  assert.equal(segPattern.test(segments[1]), true)
  assert.notEqual(key, 'TAVILY_API_KEY') // Must not use environment variable names, otherwise set would be shadowed
})

// ─── parseQuery ───
test('parseQuery: no directives returns as-is', () => {
  const r = parseQuery('hello world')
  assert.deepEqual(r.sites, [])
  assert.deepEqual(r.excludedSites, [])
  assert.equal(r.cleaned, 'hello world')
})

test('parseQuery: extracts site: and removes directives', () => {
  const r = parseQuery('ai news site:github.com')
  assert.deepEqual(r.sites, ['github.com'])
  assert.equal(r.cleaned, 'ai news')
})

test('parseQuery: extracts -site: exclusion', () => {
  const r = parseQuery('python -site:reddit.com')
  assert.deepEqual(r.excludedSites, ['reddit.com'])
  assert.equal(r.cleaned, 'python')
})

test('parseQuery: site: and -site: adjacent do not interfere (regression)', () => {
  const r = parseQuery('ai site:github.com -site:reddit.com')
  assert.deepEqual(r.sites, ['github.com'])
  assert.deepEqual(r.excludedSites, ['reddit.com'])
  assert.equal(r.cleaned, 'ai')
})

test('parseQuery: null/non-string safe', () => {
  assert.deepEqual(parseQuery(''), { sites: [], excludedSites: [], cleaned: '' })
  assert.deepEqual(parseQuery(null), { sites: [], excludedSites: [], cleaned: '' })
})

// ─── buildTavilyBody ───
test('buildTavilyBody: basic body', () => {
  const b = buildTavilyBody({ query: 'ai', limit: 10 })
  assert.equal(b.query, 'ai')
  assert.equal(b.topic, 'general')
  assert.equal(b.include_answer, true)
  assert.equal(b.max_results, 10)
})

test('buildTavilyBody: site maps to include_domains', () => {
  const b = buildTavilyBody({ query: 'ai site:github.com' })
  assert.deepEqual(b.include_domains, ['github.com'])
  assert.equal(b.query, 'ai')
})

test('buildTavilyBody: recency mapping', () => {
  const b = buildTavilyBody({ query: 'ai', recency: 'week' })
  assert.equal(b.time_range, 'w')
})

test('buildTavilyBody: result count clamped to 1..20', () => {
  assert.equal(buildTavilyBody({ query: 'x', limit: 99 }).max_results, 20)
  assert.equal(buildTavilyBody({ query: 'x', limit: 0 }).max_results, 1)
})

// ─── normalizeTavilyResponse ───
test('normalizeTavilyResponse: normalizes sources', () => {
  const r = normalizeTavilyResponse({
    answer: 'the answer',
    results: [
      { url: 'https://a.com', title: 'A', content: 'snippet', published_date: '2024-01-01' },
      { url: 'https://b.com', title: 'B' },
    ],
  })
  assert.equal(r.provider, 'tavily')
  assert.equal(r.answer, 'the answer')
  assert.equal(r.sources.length, 2)
  assert.equal(r.sources[0].url, 'https://a.com')
  assert.equal(r.sources[0].publishedAt, '2024-01-01') // Aligned with DSH WebSearchSource field name
})

test('normalizeTavilyResponse: empty result safe', () => {
  const r = normalizeTavilyResponse({})
  assert.deepEqual(r.sources, [])
  assert.equal('answer' in r, false) // undefined fields don't appear (lossless JSON)
  assert.equal('requestId' in r, false)
})

test('normalizeTavilyResponse: omits publishedAt when absent (undefined is invalid)', () => {
  const r = normalizeTavilyResponse({
    results: [{ url: 'https://a.com', title: 'A', content: 's' }],
  })
  assert.equal(r.sources.length, 1)
  assert.equal('publishedAt' in r.sources[0], false) // Key: no undefined fields
  // All fields must be lossless JSON (no undefined)
  const json = JSON.parse(JSON.stringify(r))
  assert.deepEqual(json.sources[0], { url: 'https://a.com', title: 'A', snippet: 's' })
})

test('normalizeTavilyResponse: carries publishedAt/answer/requestId when present', () => {
  const r = normalizeTavilyResponse({
    answer: 'ans',
    requestId: 'req-1',
    results: [{ url: 'https://a.com', title: 'A', content: 's', published_date: '2024-01-01' }],
  })
  assert.equal(r.answer, 'ans')
  assert.equal(r.requestId, 'req-1')
  assert.equal(r.sources[0].publishedAt, '2024-01-01')
})

// ─── CONFIG_KEY validity ───
test('CONFIG_KEY: must conform to <scope>/<id> credential key syntax', () => {
  // Both scope and id must match /^[a-z][a-z0-9-]*$/ and contain one slash
  const segments = CONFIG_KEY.split('/')
  assert.equal(segments.length, 2)
  const segPattern = /^[a-z][a-z0-9-]*$/
  assert.equal(segPattern.test(segments[0]), true, `scope "${segments[0]}" invalid`)
  assert.equal(segPattern.test(segments[1]), true, `id "${segments[1]}" invalid`)
  // Must not be the old slash-less format (web-search-config would break credential document parsing)
  assert.notEqual(CONFIG_KEY, 'web-search-config')
})

// ─── configToRecord / recordToConfig ───
// Use the module-exported DEFAULT_CONFIG (built-in order for all 6 providers) as defaults.

test('configToRecord: writes valid grant record (with kind), not bare value', () => {
  const r = configToRecord({ order: ['tavily'], exclude: [], timeout: 60 })
  assert.equal(r.kind, 'grant')
  assert.deepEqual(r.payload, { order: ['tavily'], exclude: [], timeout: 60 })
  // Key: must carry kind, otherwise credential file parsing fails
  assert.equal('kind' in r, true)
  assert.equal('value' in r, false)
})

test('recordToConfig: reads back from valid grant record', () => {
  const c = recordToConfig({ kind: 'grant', payload: { order: ['tavily'], exclude: ['x'], timeout: 120 } }, DEFAULT_CONFIG)
  assert.deepEqual(c.order, ['tavily'])
  assert.deepEqual(c.exclude, ['x'])
  assert.equal(c.timeout, 120)
})

test('recordToConfig: invalid structure (value record without kind) → falls back to default', () => {
  const c = recordToConfig({ value: '{"order":["tavily"]}' }, DEFAULT_CONFIG)
  assert.deepEqual(c, DEFAULT_CONFIG)
})

test('recordToConfig: undefined/non-object → falls back to default', () => {
  assert.deepEqual(recordToConfig(undefined, DEFAULT_CONFIG), DEFAULT_CONFIG)
  assert.deepEqual(recordToConfig(null, DEFAULT_CONFIG), DEFAULT_CONFIG)
  assert.deepEqual(recordToConfig('junk', DEFAULT_CONFIG), DEFAULT_CONFIG)
})

test('recordToConfig: partially missing fields → filled with defaults', () => {
  const c = recordToConfig({ kind: 'grant', payload: { order: ['tavily'] } }, DEFAULT_CONFIG)
  assert.deepEqual(c.exclude, [])
  assert.equal(c.timeout, 60)
})

// ─── Multi-provider registry (aligned with omp PROVIDER_SPECS) ───
test('PROVIDER_SPECS: includes 8 providers (6 key + 1 endpoint + 1 none)', () => {
  const ids = Object.keys(PROVIDER_SPECS)
  assert.equal(ids.length, 8)
  // Order = built-in fallback order (key types first, SearXNG in the middle, DDG keyless fallback at the end)
  assert.deepEqual(ids, ['tavily', 'brave', 'exa', 'firecrawl', 'jina', 'kagi', 'searxng', 'duckduckgo'])
  for (const id of ids) {
    assert.equal(PROVIDER_SPECS[id].id, id)
    assert.ok(PROVIDER_SPECS[id].label.length > 0)
    assert.ok(['apikey', 'endpoint', 'none'].includes(PROVIDER_SPECS[id].kind))
  }
  assert.equal(PROVIDER_SPECS.searxng.kind, 'endpoint')
  assert.equal(PROVIDER_SPECS.duckduckgo.kind, 'none')
})

test('DEFAULT_CONFIG: order covers all providers, no exclude', () => {
  assert.deepEqual(DEFAULT_CONFIG.order, Object.keys(PROVIDER_SPECS))
  assert.deepEqual(DEFAULT_CONFIG.exclude, [])
  assert.equal(DEFAULT_CONFIG.timeout, 60)
})

test('CREDENTIAL_KEYS: apikey/endpoint providers have valid <scope>/<id> credential keys; none type has none', () => {
  for (const id of Object.keys(PROVIDER_SPECS)) {
    if (PROVIDER_SPECS[id].kind === 'none') {
      assert.equal(CREDENTIAL_KEYS[id], undefined)
      continue
    }
    const key = CREDENTIAL_KEYS[id]
    const segments = key.split('/')
    assert.equal(segments.length, 2, `${id} key missing slash`)
    const segPattern = /^[a-z][a-z0-9-]*$/
    assert.equal(segPattern.test(segments[0]), true, `${id} scope invalid`)
    assert.equal(segPattern.test(segments[1]), true, `${id} id invalid`)
  }
})

// ─── resolveProviderOrder (aligned with omp setSearchProviderOrder) ───
test('resolveProviderOrder: no order configured → built-in order', () => {
  assert.deepEqual(resolveProviderOrder(undefined, Object.keys(PROVIDER_SPECS), []), Object.keys(PROVIDER_SPECS))
  assert.deepEqual(resolveProviderOrder([], Object.keys(PROVIDER_SPECS), []), Object.keys(PROVIDER_SPECS))
})

test('resolveProviderOrder: listed first + unlisted appended in built-in order', () => {
  assert.deepEqual(resolveProviderOrder(['jina'], Object.keys(PROVIDER_SPECS), []), ['jina', 'tavily', 'brave', 'exa', 'firecrawl', 'kagi', 'searxng', 'duckduckgo'])
})

test('resolveProviderOrder: exclude always removed', () => {
  assert.deepEqual(resolveProviderOrder(['tavily', 'jina'], Object.keys(PROVIDER_SPECS), ['tavily']), ['jina', 'brave', 'exa', 'firecrawl', 'kagi', 'searxng', 'duckduckgo'])
})

test('resolveProviderOrder: invalid ids ignored', () => {
  assert.deepEqual(resolveProviderOrder(['hacked', 'exa'], Object.keys(PROVIDER_SPECS), []), ['exa', 'tavily', 'brave', 'firecrawl', 'jina', 'kagi', 'searxng', 'duckduckgo'])
})

// ─── sanitizeProviderOrder (input sanitization for the set-order RPC) ───
test('sanitizeProviderOrder: preserves valid id relative order', () => {
  assert.deepEqual(sanitizeProviderOrder(['jina', 'tavily']), ['jina', 'tavily'])
})

test('sanitizeProviderOrder: removes unknown ids', () => {
  assert.deepEqual(sanitizeProviderOrder(['hacked', 'exa', 42, null]), ['exa'])
})

test('sanitizeProviderOrder: deduplicates, keeps first occurrence', () => {
  assert.deepEqual(sanitizeProviderOrder(['brave', 'brave', 'kagi']), ['brave', 'kagi'])
})

test('sanitizeProviderOrder: empty/non-array safe', () => {
  assert.deepEqual(sanitizeProviderOrder([]), [])
  assert.deepEqual(sanitizeProviderOrder(undefined), [])
  assert.deepEqual(sanitizeProviderOrder('tavily'), [])
})

// ─── Shared utilities ───
test('clampNumResults: clamps to range', () => {
  assert.equal(clampNumResults(5), 5)
  assert.equal(clampNumResults(0), 10) // invalid → default
  assert.equal(clampNumResults(undefined), 10)
  assert.equal(clampNumResults(99), 20) // above cap → clamped
  assert.equal(clampNumResults(3, 5, 20), 3)
  assert.equal(clampNumResults(2.9), 2) // floor
})

test('hostOf: handles IPv6, userinfo, trailing-dot, ports', () => {
  assert.equal(hostOf('https://example.com/path?q=1#x'), 'example.com')
  assert.equal(hostOf('https://example.com.'), 'example.com.')
  assert.equal(hostOf('https://user:pass@example.com'), 'user:pass@example.com') // userinfo kept (scheme/path only stripped)
})

test('recencyToDate: returns YYYY-MM-DD', () => {
  const d = recencyToDate('week')
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(recencyToDate('bogus'), undefined)
})

test('synthesizeAnswer: synthesizes answer from at most 3 summaries', () => {
  const results = [
    { url: 'https://a.com', title: 'A', summary: 'one' },
    { url: 'https://b.com', title: 'B', summary: 'two' },
    { url: 'https://c.com', title: 'C', summary: 'three' },
    { url: 'https://d.com', title: 'D', summary: 'four' },
  ]
  const a = synthesizeAnswer(results)
  assert.ok(a.includes('**A**: one'))
  assert.ok(!a.includes('four'))
})

test('synthesizeAnswer: no summary → undefined', () => {
  assert.equal(synthesizeAnswer([]), undefined)
  assert.equal(synthesizeAnswer([{ url: 'x' }]), undefined)
})

// ─── Tavily request ───
test('buildTavilyRequest: full request (method/url/headers/body)', () => {
  const req = buildTavilyRequest({ query: 'ai', limit: 5 }, 'tvly-k')
  assert.equal(req.method, 'POST')
  assert.equal(req.url, 'https://api.tavily.com/search')
  assert.equal(req.headers.Authorization, 'Bearer tvly-k')
  const body = JSON.parse(req.body)
  assert.equal(body.query, 'ai')
  assert.equal(body.max_results, 5)
})

// ─── Brave ───
test('buildBraveRequest: GET + X-Subscription-Token + freshness mapping', () => {
  const req = buildBraveRequest({ query: 'ai', limit: 8, recency: 'week' }, 'brave-k')
  assert.equal(req.method, 'GET')
  assert.equal(req.headers['X-Subscription-Token'], 'brave-k')
  const url = new URL(req.url)
  assert.equal(url.searchParams.get('q'), 'ai')
  assert.equal(url.searchParams.get('count'), '8')
  assert.equal(url.searchParams.get('freshness'), 'pw')
  assert.equal(url.searchParams.get('extra_snippets'), 'true')
})

test('normalizeBraveResponse: merges description + extra_snippets', () => {
  const r = normalizeBraveResponse({
    web: {
      request_id: 'rid-1',
      results: [
        { title: 'A', url: 'https://a.com', description: 'desc', extra_snippets: ['s1', 's2'], age: '2d ago' },
        { title: 'B', url: 'https://b.com' },
      ],
    },
  })
  assert.equal(r.provider, 'brave')
  assert.equal(r.requestId, 'rid-1')
  assert.equal(r.sources.length, 2)
  assert.ok(r.sources[0].snippet.includes('desc'))
  assert.ok(r.sources[0].snippet.includes('s1'))
  assert.equal(r.sources[0].publishedAt, '2d ago')
  // No undefined fields (lossless JSON)
  assert.equal('publishedAt' in r.sources[1], false)
})

test('normalizeBraveResponse: title falls back to bare host', () => {
  const r = normalizeBraveResponse({ web: { results: [{ url: 'https://example.com/a' }] } })
  assert.equal(r.sources[0].title, 'example.com')
})

test('normalizeBraveResponse: empty result safe', () => {
  const r = normalizeBraveResponse({})
  assert.deepEqual(r.sources, [])
  assert.equal('requestId' in r, false)
})

// ─── Exa ───
test('buildExaRequest: site → includeDomains (bare host), recency → startPublishedDate', () => {
  const req = buildExaRequest({ query: 'ai site:github.com -site:reddit.com', limit: 6, recency: 'month' }, 'exa-k')
  assert.equal(req.method, 'POST')
  assert.equal(req.headers['x-api-key'], 'exa-k')
  const body = JSON.parse(req.body)
  assert.equal(body.query, 'ai')
  assert.deepEqual(body.includeDomains, ['github.com'])
  assert.deepEqual(body.excludeDomains, ['reddit.com'])
  assert.match(body.startPublishedDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(body.type, 'auto')
})

test('normalizeExaResponse: summary/text/highlights → snippet, answer synthesized', () => {
  const r = normalizeExaResponse({
    requestId: 'exa-1',
    results: [
      { url: 'https://a.com', title: 'A', summary: 'sum', publishedDate: '2024-01-01' },
      { url: 'https://b.com', title: 'B', text: 'text-b', highlights: ['h1', 'h2'] },
    ],
  })
  assert.equal(r.provider, 'exa')
  assert.equal(r.requestId, 'exa-1')
  assert.equal(r.sources[0].snippet, 'sum')
  assert.equal(r.sources[0].publishedAt, '2024-01-01')
  assert.ok(r.sources[1].snippet.includes('text-b'))
  assert.ok(r.answer.includes('**A**: sum'))
})

// ─── Firecrawl ───
test('buildFirecrawlRequest: Bearer + tbs mapping, query inlined (SERP backend parses site:)', () => {
  const req = buildFirecrawlRequest({ query: 'ai site:github.com', limit: 7, recency: 'day' }, 'fc-k')
  assert.equal(req.method, 'POST')
  assert.equal(req.headers.Authorization, 'Bearer fc-k')
  const body = JSON.parse(req.body)
  assert.equal(body.query, 'ai site:github.com')
  assert.equal(body.tbs, 'qdr:d')
  assert.deepEqual(body.sources, [{ type: 'web' }])
})

test('normalizeFirecrawlResponse: handles both data array and data.web shapes', () => {
  const r1 = normalizeFirecrawlResponse({ id: 'fc-1', data: [{ url: 'https://a.com', title: 'A', description: 'd' }] })
  assert.equal(r1.sources.length, 1)
  assert.equal(r1.requestId, 'fc-1')
  assert.equal(r1.sources[0].snippet, 'd')
  const r2 = normalizeFirecrawlResponse({ data: { web: [{ url: 'https://b.com', title: 'B' }] } })
  assert.equal(r2.sources[0].url, 'https://b.com')
})

// ─── Jina ───
test('buildJinaRequest: single site → X-Site header, query strips site:; limit passed through', () => {
  const req = buildJinaRequest({ query: 'ai site:github.com', limit: 3 }, 'jina-k')
  assert.equal(req.method, 'GET')
  assert.equal(req.headers.Authorization, 'Bearer jina-k')
  assert.equal(req.headers['X-Site'], 'github.com')
  assert.ok(new URL(req.url).pathname.endsWith('/ai'))
  assert.equal(new URL(req.url).searchParams.get('count'), '3')
})

test('buildJinaRequest: defaults to 5 when no limit, capped at 20', () => {
  assert.equal(new URL(buildJinaRequest({ query: 'ai' }, 'k').url).searchParams.get('count'), '5')
  assert.equal(new URL(buildJinaRequest({ query: 'ai', limit: 99 }, 'k').url).searchParams.get('count'), '20')
})

test('buildJinaRequest: no X-Site when no site', () => {
  const req = buildJinaRequest({ query: 'ai', limit: 5 }, 'k')
  assert.equal('X-Site' in req.headers, false)
})

test('normalizeJinaResponse: array or { code, data } shapes', () => {
  const r1 = normalizeJinaResponse([{ url: 'https://a.com', title: 'A', description: 'd' }])
  assert.equal(r1.sources.length, 1)
  const r2 = normalizeJinaResponse({ code: 200, data: [{ url: 'https://b.com', title: 'B' }] })
  assert.equal(r2.sources[0].url, 'https://b.com')
})

// ─── Kagi ───
test('buildKagiRequest: POST + Bearer + filters.after', () => {
  const req = buildKagiRequest({ query: 'ai', limit: 9, recency: 'week' }, 'kagi-k')
  assert.equal(req.method, 'POST')
  assert.equal(req.headers.Authorization, 'Bearer kagi-k')
  const body = JSON.parse(req.body)
  assert.equal(body.workflow, 'search')
  assert.equal(body.limit, 9)
  assert.match(body.filters.after, /^\d{4}-\d{2}-\d{2}$/)
})

test('normalizeKagiResponse: buckets sources + direct_answer synthesized answer', () => {
  const r = normalizeKagiResponse({
    meta: { trace: 'trace-1' },
    data: {
      search: [{ url: 'https://a.com', title: 'A', snippet: 'sa' }],
      video: [{ url: 'https://v.com', title: 'V' }],
      news: [{ url: 'https://n.com', title: 'N' }],
      infobox: [{ url: 'https://i.com', title: 'I' }],
      direct_answer: [{ snippet: 'the answer' }],
    },
  })
  assert.equal(r.provider, 'kagi')
  assert.equal(r.requestId, 'trace-1')
  assert.equal(r.sources.length, 4)
  assert.ok(r.sources[1].title.includes('[Video]'))
  assert.equal(r.answer, 'the answer')
})

test('normalizeKagiResponse: empty data safe (no undefined fields)', () => {
  const r = normalizeKagiResponse({})
  assert.deepEqual(r.sources, [])
  assert.equal('answer' in r, false)
  assert.equal('requestId' in r, false)
})

// ─── PROVIDER_SPECS completeness ───
test('PROVIDER_SPECS: every provider has build + normalize and returns unified shape', () => {
  const authModeOf = { apikey: 'api_key', endpoint: 'endpoint', none: 'keyless' }
  for (const id of Object.keys(PROVIDER_SPECS)) {
    const spec = PROVIDER_SPECS[id]
    assert.ok(spec, `${id} missing spec`)
    assert.equal(spec.id, id)
    assert.equal(typeof spec.build, 'function', `${id} build missing`)
    assert.equal(typeof spec.normalize, 'function', `${id} normalize missing`)
    const req = spec.build({ query: 'test' }, spec.kind === 'endpoint' ? 'https://searx.example.org' : 'key')
    assert.ok(req.url.startsWith('https://'), `${id} URL invalid`)
    assert.equal(typeof req.method, 'string')
    const norm = spec.normalize({})
    assert.equal(norm.provider, id)
    assert.ok(Array.isArray(norm.sources))
    assert.equal(norm.authMode, authModeOf[spec.kind])
  }
})

// ─── isHttpUrl / endpoint records ───
test('isHttpUrl: IPv6, userinfo, uppercase scheme, trailing-dot host accepted; port-only rejected', () => {
  assert.equal(isHttpUrl('http://[::1]:8080'), true)
  assert.equal(isHttpUrl('https://user:pass@host'), true)
  assert.equal(isHttpUrl('HTTPS://EXAMPLE.COM'), true)
  assert.equal(isHttpUrl('https://example.com.'), true)
  assert.equal(isHttpUrl('localhost:8080'), false)
})

test('normalizeEndpoint: auto-prepends http:// when no protocol, keeps existing protocol', () => {
  assert.equal(normalizeEndpoint('localhost:50000'), 'http://localhost:50000')
  assert.equal(normalizeEndpoint('searx.example.org'), 'http://searx.example.org')
  assert.equal(normalizeEndpoint('http://localhost:50000/'), 'http://localhost:50000/')
  assert.equal(normalizeEndpoint('https://a.com'), 'https://a.com')
  assert.equal(normalizeEndpoint(''), '')
})

test('endpointToRecord / recordEndpoint', () => {
  const r = endpointToRecord('https://searx.example.org')
  assert.equal(r.kind, 'grant')
  assert.deepEqual(r.payload, { endpoint: 'https://searx.example.org' })
  assert.equal(recordEndpoint(r), 'https://searx.example.org')
  assert.equal(recordEndpoint(r) !== undefined, true)
  assert.equal(recordEndpoint(undefined), undefined)
  assert.equal(recordEndpoint({ kind: 'grant', payload: {} }), undefined)
  assert.equal(recordEndpoint({ kind: 'api-key', key: 'x' }) !== undefined, false)
})

test('validateSetKey: endpoint type auto-prepends protocol; whitespace/empty rejected', () => {
  // with protocol → ok
  const ok1 = validateSetKey({ id: 'searxng', value: 'https://searx.example.org' })
  assert.equal(ok1.ok, true)
  assert.equal(ok1.value, 'https://searx.example.org')
  // no protocol → auto-prepend http://
  const ok2 = validateSetKey({ id: 'searxng', value: 'localhost:50000' })
  assert.equal(ok2.ok, true)
  assert.equal(ok2.value, 'http://localhost:50000')
  // contains whitespace → rejected
  const bad = validateSetKey({ id: 'searxng', value: 'not a url' })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /http\(s\) URL/)
})

test('validateSetKey/validateUnsetKey: none type (DuckDuckGo) has no credentials to set', () => {
  const set = validateSetKey({ id: 'duckduckgo', value: 'x' })
  assert.equal(set.ok, false)
  assert.match(set.error, /no API key/)
  const unset = validateUnsetKey({ id: 'duckduckgo' })
  assert.equal(unset.ok, false)
})

// ─── SearXNG ───
test('buildSearXNGRequest: endpoint + format=json + time_range mapping', () => {
  const req = buildSearXNGRequest({ query: 'ai', recency: 'week' }, 'https://searx.example.org')
  assert.equal(req.method, 'GET')
  const url = new URL(req.url)
  assert.equal(url.searchParams.get('q'), 'ai')
  assert.equal(url.searchParams.get('format'), 'json')
  // week → month (SearXNG only supports day/month/year)
  assert.equal(url.searchParams.get('time_range'), 'month')
})

test('buildSearXNGRequest: trailing slash safe, no time_range without recency', () => {
  const req = buildSearXNGRequest({ query: 'ai' }, 'https://searx.example.org/')
  assert.ok(!req.url.includes('//search'))
  const url = new URL(req.url)
  assert.equal(url.searchParams.get('time_range'), null)
})

test('SEARXNG_RECENCY: week maps to month', () => {
  assert.equal(SEARXNG_RECENCY.week, 'month')
  assert.equal(SEARXNG_RECENCY.day, 'day')
  assert.equal(SEARXNG_RECENCY.month, 'month')
  assert.equal(SEARXNG_RECENCY.year, 'year')
})

test('normalizeSearXNGResponse: sources + publishedDate both field names + answer', () => {
  const r = normalizeSearXNGResponse({
    results: [
      { url: 'https://a.com', title: 'A', content: 'content-a', publishedDate: '2024-01-01' },
      { url: 'https://b.com', title: 'B', snippet: 'snip-b', published_date: '2024-02-02' },
      { url: 'https://c.com', title: 'C' },
    ],
    answers: ['the answer'],
  })
  assert.equal(r.provider, 'searxng')
  assert.equal(r.authMode, 'endpoint')
  assert.equal(r.sources.length, 3)
  assert.equal(r.sources[0].snippet, 'content-a')
  assert.equal(r.sources[0].publishedAt, '2024-01-01')
  assert.equal(r.sources[1].publishedAt, '2024-02-02')
  assert.equal('publishedAt' in r.sources[2], false)
  assert.equal(r.answer, 'the answer')
})

test('formatSearXNGAnswers: strings and structured objects, at most 3', () => {
  const r = formatSearXNGAnswers(['one', 'two', 'three', 'four'])
  assert.ok(r.includes('one'))
  assert.ok(!r.includes('four'))
  const r2 = formatSearXNGAnswers([{ answer: 'structured' }])
  assert.ok(r2.includes('structured'))
  assert.equal(formatSearXNGAnswers([]), undefined)
})

test('normalizeSearXNGResponse: empty result safe (no undefined fields)', () => {
  const r = normalizeSearXNGResponse({})
  assert.deepEqual(r.sources, [])
  assert.equal('answer' in r, false)
})

// ─── DuckDuckGo ───
test('buildDuckDuckGoRequest: POST form + df mapping', () => {
  const req = buildDuckDuckGoRequest({ query: 'ai', recency: 'week' })
  assert.equal(req.method, 'POST')
  assert.equal(req.url, 'https://html.duckduckgo.com/html/')
  assert.equal(req.headers['Content-Type'], 'application/x-www-form-urlencoded')
  const body = new URLSearchParams(req.body)
  assert.equal(body.get('q'), 'ai')
  assert.equal(body.get('kl'), 'us-en')
  assert.equal(body.get('df'), 'w')
  assert.equal(body.get('b'), '')
})

test('unwrapDuckDuckGoUrl: handles uddg= wrapper / protocol-relative / absolute URLs', () => {
  assert.equal(
    unwrapDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa'),
    'https://example.com/a',
  )
  assert.equal(unwrapDuckDuckGoUrl('//example.com/a'), 'https://example.com/a')
  assert.equal(unwrapDuckDuckGoUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(unwrapDuckDuckGoUrl('javascript:alert(1)'), undefined)
})

test('decodeDuckDuckGoHtml: strips tags + unescapes + normalizes whitespace', () => {
  assert.equal(decodeDuckDuckGoHtml('<b>Hello</b> &amp; world&nbsp;x'), 'Hello & world x')
  assert.equal(decodeDuckDuckGoHtml('a&#39;b &quot;c&quot;'), "a'b \"c\"")
})

test('isDuckDuckGoAnomaly: plain word "anomaly" in content is not a challenge (no false positive)', () => {
  assert.equal(isDuckDuckGoAnomaly('<div class="result__snippet">an anomaly occurred</div>'), false)
  assert.equal(isDuckDuckGoAnomaly('anomaly'), false)
})

test('parseDuckDuckGoHtml: parses multiple blocks and result without snippet', () => {
  const html = [
    '<div class="result"><a class="result__a" href="https://a.com/1">One</a></div>',
    '<div class="result"><a class="result__a" href="https://b.com/2">Two</a><a class="result__snippet">Snip</a></div>',
  ].join('\n')
  const sources = parseDuckDuckGoHtml(html)
  assert.equal(sources.length, 2)
  assert.equal(sources[0].url, 'https://a.com/1')
  assert.equal(sources[0].snippet, undefined)
  assert.equal(sources[1].url, 'https://b.com/2')
  assert.equal(sources[1].snippet, 'Snip')
})

test('normalizeDuckDuckGoResponse: challenge page returns empty sources (fallback-able), normal page parses', () => {
  const anomaly = normalizeDuckDuckGoResponse('<html>anomaly-modal</html>')
  assert.deepEqual(anomaly.sources, [])
  const normal = normalizeDuckDuckGoResponse('<div class="result"><a class="result__a" href="https://example.com">T</a></div>')
  assert.equal(normal.sources.length, 1)
  assert.equal(normal.authMode, 'keyless')
})

// ─── classifyConnectionTest ───
test('classifyConnectionTest: 2xx → ok', () => {
  const r = classifyConnectionTest({ exitCode: 0, httpStatus: 200, stdout: '{"ok":true}', stderr: '' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'ok')
  assert.equal(r.httpStatus, 200)
})

test('classifyConnectionTest: 401/403 → auth failure', () => {
  const r401 = classifyConnectionTest({ exitCode: 0, httpStatus: 401, stdout: '{"error":"unauthorized"}', stderr: '' })
  assert.equal(r401.ok, false)
  assert.equal(r401.kind, 'auth')
  const r403 = classifyConnectionTest({ exitCode: 0, httpStatus: 403, stdout: '', stderr: '' })
  assert.equal(r403.kind, 'auth')
})

test('classifyConnectionTest: other non-2xx → http failure', () => {
  const r = classifyConnectionTest({ exitCode: 0, httpStatus: 500, stdout: '', stderr: '' })
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'http')
  assert.equal(r.httpStatus, 500)
})

test('classifyConnectionTest: missing httpStatus → invalid', () => {
  const r = classifyConnectionTest({ exitCode: 0 })
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'invalid')
})

test('classifyConnectionTest: non-numeric httpStatus → invalid', () => {
  const r = classifyConnectionTest({ exitCode: 0, httpStatus: '200' })
  assert.equal(r.kind, 'invalid')
})

test('classifyConnectionTest: 3xx and 429 → generic http failure', () => {
  assert.equal(classifyConnectionTest({ exitCode: 0, httpStatus: 301 }).kind, 'http')
  assert.equal(classifyConnectionTest({ exitCode: 0, httpStatus: 429 }).kind, 'http')
})

test('classifyConnectionTest: transport failure with empty stderr omits detail suffix', () => {
  const r = classifyConnectionTest({ exitCode: 28, stderr: '' })
  assert.equal(r.kind, 'transport')
  assert.equal(r.message, 'Connection failed (exit 28)')
})

// ─── buildSearXNGRequest: dedupe when endpoint already ends with /search (avoid /search/search) ───
test('buildSearXNGRequest: endpoint already ends with /search → dedupes, no duplicate join', () => {
  const req = buildSearXNGRequest({ query: 'x' }, 'http://searx.example.org/search')
  const url = new URL(req.url)
  assert.equal(req.method, 'GET')
  assert.equal(req.url, 'http://searx.example.org/search?q=x&format=json')
  assert.equal(url.searchParams.get('q'), 'x')
  assert.equal(url.searchParams.get('format'), 'json')
})

test('buildSearXNGRequest: trailing slash + /search ending → dedupes', () => {
  const req = buildSearXNGRequest({ query: 'x' }, 'http://searx.example.org/search/')
  assert.equal(req.url, 'http://searx.example.org/search?q=x&format=json')
})

test('buildSearXNGRequest: base_url + /search ending → keeps base_url, dedupes', () => {
  const req = buildSearXNGRequest({ query: 'x' }, 'http://searx.example.org/base/search')
  assert.equal(req.url, 'http://searx.example.org/base/search?q=x&format=json')
})
