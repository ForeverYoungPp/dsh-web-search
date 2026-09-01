/**
 * dsh-web-search — browser half, shipped as a hand-written loader factory
 * bundle (the exact artifact format tsdown's client preset emits, written by
 * hand so local `--patch` development needs no bundler):
 *
 *   window.__ModuleLoader__.load({ id, factory(require) { ... return module.exports } })
 *
 * `react` is a module-table row (baseline platform module), so the only
 * `require` here is `react`. The `websearch` Remote contribution is mounted
 * by this very plugin (the api-remotes assembly does not know our namespace),
 * then the settings page talks to it through `ctx.remote.websearch.*`.
 *
 * Component identity note (same fix as the dynamic plugin): components are
 * defined once in the apply scope, never inside the slot render callback, so
 * React does not remount the subtree on every render and lose reducer state.
 */

window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-web-search',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    // ================= Remote contribution (mirrors the SRC side of src/remote.js) =================
    // Client requires strict codec; TypertSchema is just a { parse(value) } interface, transparent passthrough works, no zod needed.
    var passthrough = { parse: function (value) { return value; } };
    function jsonCodec() {
      return { mode: 'strict', typeSymbol: 'dsh-web-search#json', schema: passthrough };
    }

    var contribution = {
      package: 'dsh-web-search',
      descriptors: [
        {
          id: 'dsh-web-search#websearch/list',
          service: 'webSearchController',
          namespace: 'websearch',
          method: 'list',
          invocation: { kind: 'direct' },
          parameters: [],
          result: jsonCodec(),
        },
        {
          id: 'dsh-web-search#websearch/setKey',
          service: 'webSearchController',
          namespace: 'websearch',
          method: 'setKey',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'args', wire: 'args', source: 'json', codec: jsonCodec() }],
          result: jsonCodec(),
        },
        {
          id: 'dsh-web-search#websearch/unsetKey',
          service: 'webSearchController',
          namespace: 'websearch',
          method: 'unsetKey',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'args', wire: 'args', source: 'json', codec: jsonCodec() }],
          result: jsonCodec(),
        },
        {
          id: 'dsh-web-search#websearch/setOrder',
          service: 'webSearchController',
          namespace: 'websearch',
          method: 'setOrder',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'args', wire: 'args', source: 'json', codec: jsonCodec() }],
          result: jsonCodec(),
        },
        {
          id: 'dsh-web-search#websearch/testProvider',
          service: 'webSearchController',
          namespace: 'websearch',
          method: 'testProvider',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'args', wire: 'args', source: 'json', codec: jsonCodec() }],
          result: jsonCodec(),
        },
      ],
    };

    // ================= Pure reducer (consistent with the dynamic version) =================
    var MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    var interactionInitial = { keyValue: '', saving: false, clearing: false, testing: false, lastResult: null, testResult: null };

    function interactionReducer(state, action) {
      switch (action.type) {
        case 'CHANGE_KEY':
          return Object.assign({}, state, { keyValue: action.value, lastResult: null });
        case 'SAVE_START':
          if (state.saving || state.clearing || state.testing) return state;
          return Object.assign({}, state, { saving: true, lastResult: null });
        case 'SAVE_SUCCESS':
          return Object.assign({}, state, { saving: false, keyValue: '', lastResult: { type: 'saved' } });
        case 'SAVE_FAIL':
          return Object.assign({}, state, { saving: false, lastResult: { type: 'error', message: action.message } });
        case 'CLEAR_START':
          if (state.saving || state.clearing || state.testing) return state;
          return Object.assign({}, state, { clearing: true, lastResult: null });
        case 'CLEAR_SUCCESS':
          return Object.assign({}, state, { clearing: false, keyValue: '', lastResult: { type: 'cleared' } });
        case 'CLEAR_FAIL':
          return Object.assign({}, state, { clearing: false, lastResult: { type: 'error', message: action.message } });
        case 'TEST_START':
          if (state.testing || state.saving || state.clearing) return state;
          return Object.assign({}, state, { testing: true, testResult: null });
        case 'TEST_SUCCESS':
          return Object.assign({}, state, { testing: false, testResult: { type: 'success', message: action.message } });
        case 'TEST_FAIL':
          return Object.assign({}, state, { testing: false, testResult: { type: 'error', message: action.message } });
        default:
          return state;
      }
    }

    function deriveView(state, provider) {
      var kind = provider && provider.kind ? provider.kind : 'apikey';
      var configured = provider && provider.keyStatus ? provider.keyStatus.configured === true : false;
      var displayValue = configured ? MASK : state.keyValue;
      var inputDisabled = configured;
      var idle = !state.saving && !state.clearing && !state.testing;
      var canSave = !configured && idle && state.keyValue.trim().length > 0;
      var canClear = configured && idle;
      var canTest = configured && idle;
      var placeholder = configured
        ? ''
        : kind === 'endpoint'
          ? 'Enter endpoint URL (e.g. https://searx.example.org)...'
          : 'Enter API key to activate...';
      var inputType = kind === 'endpoint' ? 'text' : 'password';
      return {
        kind: kind,
        configured: configured,
        canSave: canSave,
        canClear: canClear,
        canTest: canTest,
        testing: state.testing,
        testResult: state.testResult,
        displayValue: displayValue,
        inputDisabled: inputDisabled,
        placeholder: placeholder,
        inputType: inputType,
      };
    }

    function reorderProviders(providers, from, to) {
      if (!Array.isArray(providers) || from === to) return providers;
      if (from < 0 || from >= providers.length || to < 0 || to >= providers.length) return providers;
      var next = providers.slice();
      var moved = next.splice(from, 1)[0];
      next.splice(to, 0, moved);
      return next;
    }

    // ================= Component factory (created once in the apply scope) =================
    function createComponents(ctx, websearch) {
      function ProviderCard(props) {
        var p = props.p;
        var onSave = props.onSave;
        var onClear = props.onClear;
        var onTest = props.onTest;

        var stateHook = React.useReducer(interactionReducer, interactionInitial);
        var state = stateHook[0];
        var dispatch = stateHook[1];

        var view = deriveView(state, p);
        var lastResult = state.lastResult;
        var testResult = state.testResult;

        var handleSave = function () {
          if (!view.canSave) return;
          dispatch({ type: 'SAVE_START' });
          onSave(p.id, state.keyValue.trim(), function (ok, message) {
            if (ok) dispatch({ type: 'SAVE_SUCCESS' });
            else dispatch({ type: 'SAVE_FAIL', message: message || 'Save failed' });
          });
        };

        var handleClear = function () {
          if (!view.canClear) return;
          dispatch({ type: 'CLEAR_START' });
          onClear(p.id, function (ok, message) {
            if (ok) dispatch({ type: 'CLEAR_SUCCESS' });
            else dispatch({ type: 'CLEAR_FAIL', message: message || 'Clear failed' });
          });
        };

        var handleTest = function () {
          if (!view.canTest) return;
          dispatch({ type: 'TEST_START' });
          onTest(p.id, function (ok, message) {
            if (ok) dispatch({ type: 'TEST_SUCCESS', message: message || 'OK' });
            else dispatch({ type: 'TEST_FAIL', message: message || 'Test failed' });
          });
        };

        var feedback = null;
        if (lastResult) {
          if (lastResult.type === 'saved') feedback = React.createElement('span', { style: { fontSize: '12px', color: '#16a34a' } }, 'Saved \u2713');
          else if (lastResult.type === 'cleared') feedback = React.createElement('span', { style: { fontSize: '12px', color: '#6b7280' } }, 'Cleared');
          else feedback = React.createElement('span', { style: { fontSize: '12px', color: '#dc2626' } }, lastResult.message || 'Error');
        }

        var testFeedback = null;
        if (testResult) {
          if (testResult.type === 'success') testFeedback = React.createElement('span', { style: { fontSize: '12px', color: '#16a34a' } }, testResult.message || 'OK');
          else testFeedback = React.createElement('span', { style: { fontSize: '12px', color: '#dc2626' } }, testResult.message || 'Test failed');
        }

        var statusText = view.configured
          ? (view.kind === 'endpoint' ? 'Configured' : 'Active')
          : (view.kind === 'endpoint' ? 'Inactive (no endpoint)' : 'Inactive (no key)');

        // DuckDuckGo: keyless provider, display only, no input
        if (view.kind === 'none') {
          return React.createElement('div', { style: { opacity: '1' } },
            React.createElement('div', { style: { border: '1px solid #ddd', borderRadius: '8px', padding: '16px', background: '#fff' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
                React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', marginRight: '10px', background: '#22c55e' } }),
                React.createElement('strong', { style: { fontSize: '15px' } }, p.label || p.id),
                React.createElement('span', { style: { fontSize: '12px', color: '#888', marginLeft: '10px' } }, 'No API key required \u2014 always available'),
              ),
              React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: '#666' } }, 'Used as the last-resort fallback when every keyed provider fails.'),
            ),
          );
        }

        var btnStyle = { padding: '6px 0', width: '76px', textAlign: 'center', color: 'white', border: 'none', borderRadius: '4px', fontSize: '13px', flexShrink: '0' };
        var clearBtnStyle = { padding: '6px 0', width: '64px', textAlign: 'center', color: 'white', border: 'none', borderRadius: '4px', fontSize: '13px', flexShrink: '0' };

        return React.createElement('div', { style: { opacity: view.configured ? '1' : '0.55' } },
          React.createElement('div', { style: { border: '1px solid #ddd', borderRadius: '8px', padding: '16px', background: '#fff' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '14px' } },
              React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', marginRight: '10px', background: view.configured ? '#22c55e' : '#d1d5db' } }),
              React.createElement('strong', { style: { fontSize: '15px' } }, p.label || p.id),
              React.createElement('span', { style: { fontSize: '12px', color: '#888', marginLeft: '10px' } }, statusText),
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              React.createElement('input', {
                type: view.inputType,
                value: view.displayValue,
                disabled: view.inputDisabled,
                onChange: function (ev) { dispatch({ type: 'CHANGE_KEY', value: ev.target.value }); },
                placeholder: view.placeholder,
                style: { flex: '1', minWidth: '0', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', background: view.inputDisabled ? '#f3f4f6' : '#fff' },
              }),
              React.createElement('button', {
                onClick: handleSave,
                disabled: !view.canSave,
                style: Object.assign({}, btnStyle, { background: view.canSave ? '#3b82f6' : '#93c5fd', cursor: view.canSave ? 'pointer' : 'default' }),
              }, state.saving ? 'Saving...' : 'Save'),
              React.createElement('button', {
                onClick: handleClear,
                disabled: !view.canClear,
                style: Object.assign({}, clearBtnStyle, { background: view.canClear ? '#ef4444' : '#d1d5db', cursor: view.canClear ? 'pointer' : 'default' }),
              }, state.clearing ? 'Clearing...' : 'Clear'),
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' } },
              React.createElement('button', {
                onClick: handleTest,
                disabled: !view.canTest,
                title: 'Test connection with saved credentials',
                style: Object.assign({}, btnStyle, { background: view.canTest ? '#0ea5e9' : '#9ecbdc', cursor: view.canTest ? 'pointer' : 'default' }),
              }, state.testing ? 'Testing...' : 'Test'),
              testFeedback ? React.createElement('div', { style: { minHeight: '16px' } }, testFeedback) : null,
            ),
            React.createElement('div', { style: { marginTop: '10px', minHeight: '16px' } }, feedback),
          ),
        );
      }

      function WebSearchSettings() {
        var state = React.useState({ providers: [], loading: true, error: null });
        var data = state[0];
        var setData = state[1];
        // Drag state: original index of the currently dragged card
        var dragFrom = React.useRef(null);

        React.useEffect(function () {
          if (!websearch) {
            setData({ providers: [], loading: false, error: 'websearch Remote namespace is not mounted (ctx.remote.websearch is undefined)' });
            return;
          }
          try {
            websearch.list().then(function (result) {
              setData({ providers: (result.ok ? result.value.providers : []) || [], loading: false, error: result.ok ? null : String((result.error && result.error.message) || 'Failed to load providers') });
            }, function (err) {
              setData({ providers: [], loading: false, error: String(err && err.message || err) });
            });
          } catch (e) {
            setData({ providers: [], loading: false, error: 'websearch.list() threw synchronously: ' + (e && e.message) });
          }
        }, []);

        var refreshProviders = React.useCallback(function () {
          websearch.list().then(function (result) {
            if (result.ok) {
              setData(function (prev) { return Object.assign({}, prev, { providers: result.value.providers || [] }); });
            } else {
              setData(function (prev) { return Object.assign({}, prev, { error: String((result.error && result.error.message) || 'Failed to refresh providers') }); });
            }
          }, function (err) {
            setData(function (prev) { return Object.assign({}, prev, { error: String(err && err.message || err) }); });
          });
        }, []);

        var handleSetKey = React.useCallback(function (id, value, done) {
          websearch.setKey({ id: id, value: value }).then(function (result) {
            if (result.ok) { refreshProviders(); if (done) done(true, null); }
            else { if (done) done(false, (result.error && result.error.message) || 'Save failed'); }
          }, function (err) {
            if (done) done(false, String(err && err.message || err));
          });
        }, [refreshProviders]);

        var handleClearKey = React.useCallback(function (id, done) {
          websearch.unsetKey({ id: id }).then(function (result) {
            if (result.ok) { refreshProviders(); if (done) done(true, null); }
            else { if (done) done(false, (result.error && result.error.message) || 'Clear failed'); }
          }, function (err) {
            if (done) done(false, String(err && err.message || err));
          });
        }, [refreshProviders]);

        // Test connection: call host's testProvider (send one minimal request with saved credentials to determine status)
        var handleTestKey = React.useCallback(function (id, done) {
          websearch.testProvider({ id: id }).then(function (result) {
            if (result.ok && result.value && result.value.ok) { if (done) done(true, result.value.message || 'OK'); }
            else if (result.ok) { if (done) done(false, (result.value && result.value.message) || 'Test failed'); }
            else { if (done) done(false, (result.error && result.error.message) || 'Test failed'); }
          }, function (err) {
            if (done) done(false, String(err && err.message || err));
          });
        }, []);

        // Drag sorting: record original index when drag starts
        var handleDragStart = React.useCallback(function (index) {
          dragFrom.current = index;
        }, []);

        // Drag sorting: clear on drag end/cancel
        var handleDragEnd = React.useCallback(function () {
          dragFrom.current = null;
        }, []);

        // Drag sorting: reorder and persist on drop
        var handleDrop = React.useCallback(function (toIndex) {
          var from = dragFrom.current;
          dragFrom.current = null;
          if (from === null || from === toIndex) return;
          var before = data.providers;
          var next = reorderProviders(before, from, toIndex);
          setData(function (prev) { return Object.assign({}, prev, { providers: next }); });
          var ids = next.map(function (p) { return p.id; });
          websearch.setOrder({ order: ids }).then(function (result) {
            if (result.ok) { refreshProviders(); }
            else { setData(function (prev) { return Object.assign({}, prev, { providers: before }); }); }
          }, function () {
            setData(function (prev) { return Object.assign({}, prev, { providers: before }); });
          });
        }, [data.providers, refreshProviders]);

        if (data.loading) {
          return React.createElement('div', { style: { padding: '20px', color: '#888' } }, 'Loading Web Search providers...');
        }

        var cards = data.providers.map(function (p, i) {
          return React.createElement('div', {
            key: p.id,
            draggable: true,
            onDragStart: function () { handleDragStart(i); },
            onDragOver: function (ev) { ev.preventDefault(); },
            onDrop: function (ev) { ev.preventDefault(); handleDrop(i); },
            onDragEnd: handleDragEnd,
            style: { cursor: 'grab' },
            title: 'Drag to reorder fallback priority',
          }, React.createElement(ProviderCard, { p: p, onSave: handleSetKey, onClear: handleClearKey, onTest: handleTestKey }));
        });

        return React.createElement('div', { style: { padding: '16px' } },
          React.createElement('h2', { style: { fontSize: '18px', marginBottom: '8px' } }, 'Web Search Providers \u2014 Third-party'),
          React.createElement('p', { style: { fontSize: '13px', color: '#666', marginBottom: '16px', lineHeight: '1.5' } },
            'These third-party providers back the native web_search tool, falling back automatically in the order you configure. Keyed providers (Tavily, Brave, Exa, Firecrawl, Jina, Kagi) activate as soon as you save an API key; SearXNG activates once you provide its endpoint URL; DuckDuckGo needs no key and is the last-resort fallback. Drag the cards to set the priority order.'
          ),
          data.error ? React.createElement('div', { style: { padding: '8px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: '4px', marginBottom: '12px', fontSize: '13px' } }, data.error) : null,
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, cards),
        );
      }

      return { WebSearchSettings: WebSearchSettings };
    }

    async function apply(ctx) {
      // Mount the websearch namespace (self-mounted by this package; api-remotes assembly only mounts namespaces it knows)
      const dispose = await ctx.remote.$mount(contribution);
      ctx.effect(function () { return dispose; });

      // namespace service is provided in $mount's child fiber; ctx.remote.websearch
      // property access via fiber chain fails (self-mounting cannot inject itself, would deadlock);
      // ctx.get('remote.websearch') uses the global DescriptorStore and is available after $mount.
      const websearch = ctx.get('remote.websearch');

      // Components defined once in the apply scope (stable function identity, avoids settings page remounting and losing state)
      var components = createComponents(ctx, websearch);

      var slots = ctx.get('slots');
      if (!slots) return;
      slots.inject('settings.section', function () {
        return slots.register(
          // Unique id (web-search-providers) → appears as a side-by-side page in the settings sidebar,
          // isolated from the native web_search config page, does not replace it (settings.section is a list, unique id = unique page).
          { name: 'settings.section', id: 'web-search-providers', order: 12, label: 'Web Search Providers' },
          function () {
            return React.createElement(components.WebSearchSettings, null);
          }
        );
      });
    }

    module.exports = {
      name: '@deepseek-ai/dsh-web-search',
      inject: ['slots', 'remote'],
      apply: apply,
    };

    return module.exports;
  },
});