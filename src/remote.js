/**
 * dsh-web-search — Host owner of the `websearch` Remote namespace.
 *
 * The settings page (browser half) lists provider status, saves/clears
 * credentials (API keys + SearXNG endpoint), persists the fallback order,
 * and runs connection tests. All five verbs live here so the browser never
 * touches the credential store directly and the HTTP test stays on the Host.
 *
 * This file is the plain-JS equivalent of a Typert `@Remote` owner class:
 * - `TypertRemoteService` registers the service (and its Gateway binding) on
 *   ctx at construction (`super(ctx, 'webSearchController', { namespace:
 *   'websearch' })` sets `this.typertRemote = {service, serviceKey, namespace}`,
 *   which the Gateway reads for binding validation).
 * - Endpoint discovery is dual-path:
 *   1. **Primary** — `ctx.typert.local` (strict DescriptorStore, populated by
 *      `ctx.typert.register()` — see {@link hostContribution}).
 *   2. **Fallback** — SRC prototype descriptor written by `markRemote()` and
 *      read by the Gateway's `remoteMethods()` / `readRemoteMethodDescriptor`.
 *   Both paths converge on the same `typertRemote` binding for validation.
 * - Business failures throw `RemoteError(code, message, details)`. The
 *   structural marker `isDSHRemoteError: true` lets the Gateway's
 *   `remoteErrorOf()` recognize it, and `rpcFailure()` carries `{ code,
 *   message, details }` unchanged onto the wire.
 *
 * The Client half carries the mirror descriptor contribution (see
 * `src/client/bundle.js`).
 */

import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const WEBSEARCH_NAMESPACE = 'websearch'
export const WEBSEARCH_SERVICE_KEY = 'webSearchController'

// ─── SRC prototype descriptor (fallback for Gateway remoteMethods()) ───
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

function markRemote(prototype, method) {
  const existing = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR)?.value
  const methods = [
    ...(existing?.methods ?? []),
    Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }),
  ]
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({ version: 1, methods: Object.freeze(methods) }),
  })
}

const REMOTE_METHODS = ['list', 'setKey', 'unsetKey', 'setOrder', 'testProvider']

/**
 * Build the host-side Typert contribution registered via `ctx.typert.register`.
 * @returns the Typert `face: 'host'` contribution for this package.
 */
export function hostContribution() {
  return {
    package: 'dsh-web-search',
    face: 'host',
    model: { services: [], events: [], objects: [] },
    schemas: [],
    invocations: REMOTE_METHODS.map((method) => ({
      id: `dsh-web-search#websearch/${method}`,
      service: WEBSEARCH_SERVICE_KEY,
      namespace: WEBSEARCH_NAMESPACE,
      method,
      invocation: { kind: 'direct' },
      parameters: method === 'list'
        ? []
        : [{ name: 'args', wire: 'args', source: 'json', codec: { mode: 'src-json' } }],
      result: { mode: 'src-json' },
    })),
  }
}

/**
 * Host service backing the generated `ctx.remote.websearch` namespace.
 * @param ctx - plugin context (the fiber owning the registration).
 * @param ops - host-half operations injected by the plugin entry. Each returns
 *   the plain value shape the settings page consumes; failures are thrown as
 *   `RemoteError`, which the Gateway folds into the `{ ok: false }` branch
 *   (code/message/details preserved verbatim via `rpcFailure`).
 */
export class WebSearchController extends TypertRemoteService {
  constructor(ctx, ops) {
    super(ctx, WEBSEARCH_SERVICE_KEY, { namespace: WEBSEARCH_NAMESPACE })
    this.ops = ops
  }

  /** List every provider with its credential status, in effective fallback order. */
  async list() {
    try {
      return await this.ops.listProviders()
    } catch (e) {
      if (e && e.isDSHRemoteError) throw e
      throw new RemoteError('websearch/list-failed', (e && e.message) || 'List providers failed', {})
    }
  }

  /** Save an API key or SearXNG endpoint. Wire arg: `{ id, value }`. */
  async setKey(args) {
    const result = await this.ops.setKey(args)
    if (!result.ok) {
      throw new RemoteError('websearch/rejected', result.error || 'Save failed', { id: args && args.id })
    }
    return { ok: true }
  }

  /** Clear a saved API key or endpoint. Wire arg: `{ id }`. */
  async unsetKey(args) {
    const result = await this.ops.unsetKey(args)
    if (!result.ok) {
      throw new RemoteError('websearch/rejected', result.error || 'Clear failed', { id: args && args.id })
    }
    return { ok: true }
  }

  /** Persist the provider fallback order. Wire arg: `{ order }`. */
  async setOrder(args) {
    const result = await this.ops.setOrder(args)
    if (!result.ok) {
      throw new RemoteError('websearch/rejected', result.error || 'Reorder failed', {})
    }
    return { ok: true, order: result.order }
  }

  /** Run one minimal host-side connection test. Wire arg: `{ id }`. */
  async testProvider(args) {
    try {
      return await this.ops.testProvider(args)
    } catch (e) {
      if (e && e.isDSHRemoteError) throw e
      throw new RemoteError('websearch/test-failed', (e && e.message) || 'Test provider failed', { id: args && args.id })
    }
  }
}

// ─── SRC fallback: write prototype descriptor for Gateway remoteMethods() ───
for (const method of REMOTE_METHODS) {
  markRemote(WebSearchController.prototype, method)
}