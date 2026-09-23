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
 *
 * This bundle is the single copy of the ProviderCard state machine
 * (reducer / deriveView / reorderProviders). It cannot `require` local files —
 * only `react` is on the module table — so the pure functions live here rather
 * than in a shared module, and `__internals` exposes them to
 * tests/interaction.test.mjs, which exercises exactly the code users load.
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

    // ================= i18n + design tokens =================
    // Flat key -> string dictionaries registered with the host's `locale` service. A bound
    // `t` resolves the ACTIVE locale at call time, so one binding follows a language switch;
    // a missing key falls back to the key itself (host behaviour).
    var NS = 'dsh-web-search';
    var EN = {
      title: 'Web Search Providers \u2014 Third-party',
      description: 'These third-party providers back the native web_search tool, falling back automatically in the order you configure. Keyed providers (Tavily, Brave, Exa, Firecrawl, Jina, Kagi) activate as soon as you save an API key; SearXNG activates once you provide its endpoint URL; DuckDuckGo needs no key and is the last-resort fallback. Drag the cards to set the priority order.',
      loading: 'Loading Web Search providers...',
      save: 'Save',
      saving: 'Saving...',
      clear: 'Clear',
      clearing: 'Clearing...',
      test: 'Test',
      testing: 'Testing...',
      saved: 'Saved \u2713',
      cleared: 'Cleared',
      ok: 'OK',
      statusActive: 'Active',
      statusConfigured: 'Configured',
      statusInactiveNoKey: 'Inactive (no key)',
      statusInactiveNoEndpoint: 'Inactive (no endpoint)',
      placeholderApiKey: 'Enter API key to activate...',
      placeholderEndpoint: 'Enter endpoint URL (e.g. https://searx.example.org)...',
      keylessNote: 'No API key required \u2014 always available',
      keylessHint: 'Used as the last-resort fallback when every keyed provider fails.',
      dragHint: 'Drag to reorder fallback priority',
      testHint: 'Test connection with saved credentials',
      error: 'Error',
      errorSave: 'Save failed',
      errorClear: 'Clear failed',
      errorTest: 'Test failed',
      errorLoad: 'Failed to load providers',
      errorRefresh: 'Failed to refresh providers',
      errorNoNamespace: 'websearch Remote namespace is not mounted (ctx.remote.websearch is undefined)',
      errorSyncThrew: 'websearch.list() threw synchronously: {message}',
    };
    var ZH = {
      title: '网络搜索 Provider — 第三方',
      description: '这些第三方 provider 支撑原生 web_search 工具，按你配置的顺序自动回退。带 key 的 provider（Tavily、Brave、Exa、Firecrawl、Jina、Kagi）保存 API key 后即生效；SearXNG 在你填入 endpoint 后生效；DuckDuckGo 无需 key，是最后的兜底。拖拽卡片可调整优先级顺序。',
      loading: '正在加载网络搜索 provider...',
      save: '保存',
      saving: '保存中...',
      clear: '清除',
      clearing: '清除中...',
      test: '测试',
      testing: '测试中...',
      saved: '已保存 \u2713',
      cleared: '已清除',
      ok: '正常',
      statusActive: '已启用',
      statusConfigured: '已配置',
      statusInactiveNoKey: '未启用（无 key）',
      statusInactiveNoEndpoint: '未启用（无 endpoint）',
      placeholderApiKey: '填入 API key 以启用...',
      placeholderEndpoint: '填入 endpoint URL（如 https://searx.example.org）...',
      keylessNote: '无需 API key — 始终可用',
      keylessHint: '当所有带 key 的 provider 都失败时，作为最后兜底使用。',
      dragHint: '拖拽调整回退优先级',
      testHint: '用已保存的凭据测试连接',
      error: '错误',
      errorSave: '保存失败',
      errorClear: '清除失败',
      errorTest: '测试失败',
      errorLoad: '加载 provider 失败',
      errorRefresh: '刷新 provider 失败',
      errorNoNamespace: 'websearch Remote 命名空间未挂载（ctx.remote.websearch 为 undefined）',
      errorSyncThrew: 'websearch.list() 同步抛错：{message}',
    };

    // ================= Pure reducer (consistent with the dynamic version) =================
    var MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
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
      // User-visible text comes out as dictionary KEYS so this stays a pure, locale-agnostic
      // function; the component translates them at render time.
      var statusKey = configured
        ? (kind === 'endpoint' ? 'statusConfigured' : 'statusActive')
        : (kind === 'endpoint' ? 'statusInactiveNoEndpoint' : 'statusInactiveNoKey');
      var opacity = configured ? '1' : '0.55';
      var placeholderKey = configured
        ? ''
        : (kind === 'endpoint' ? 'placeholderEndpoint' : 'placeholderApiKey');
      var inputType = kind === 'endpoint' ? 'text' : 'password';
      return {
        kind: kind,
        configured: configured,
        canSave: canSave,
        canClear: canClear,
        canTest: canTest,
        testing: state.testing,
        testResult: state.testResult,
        statusKey: statusKey,
        opacity: opacity,
        displayValue: displayValue,
        inputDisabled: inputDisabled,
        placeholderKey: placeholderKey,
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
    function createComponents(websearch, t, locale) {
      // `t` resolves the active locale when called, but React needs a reason to render again
      // after a language switch, so follow the locale runtime's revisions.
      function useLocaleTick() {
        var state = React.useState(0);
        var bump = state[1];
        React.useEffect(function () {
          if (!locale || typeof locale.subscribe !== 'function') return undefined;
          return locale.subscribe(function () { bump(function (n) { return n + 1; }); });
        }, []);
      }
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
            else dispatch({ type: 'SAVE_FAIL', message: message || t('errorSave') });
          });
        };

        var handleClear = function () {
          if (!view.canClear) return;
          dispatch({ type: 'CLEAR_START' });
          onClear(p.id, function (ok, message) {
            if (ok) dispatch({ type: 'CLEAR_SUCCESS' });
            else dispatch({ type: 'CLEAR_FAIL', message: message || t('errorClear') });
          });
        };

        var handleTest = function () {
          if (!view.canTest) return;
          dispatch({ type: 'TEST_START' });
          onTest(p.id, function (ok, message) {
            if (ok) dispatch({ type: 'TEST_SUCCESS', message: message || t('ok') });
            else dispatch({ type: 'TEST_FAIL', message: message || t('errorTest') });
          });
        };

        var feedback = null;
        if (lastResult) {
          if (lastResult.type === 'saved') feedback = React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary)' } }, t('saved'));
          else if (lastResult.type === 'cleared') feedback = React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, t('cleared'));
          else feedback = React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' } }, lastResult.message || t('error'));
        }

        var testFeedback = null;
        if (testResult) {
          if (testResult.type === 'success') testFeedback = React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary)' } }, testResult.message || t('ok'));
          else testFeedback = React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' } }, testResult.message || t('errorTest'));
        }

        // DuckDuckGo: keyless provider, display only, no input
        if (view.kind === 'none') {
          return React.createElement('div', { style: { opacity: '1' } },
            React.createElement('div', { style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '16px', background: 'var(--dsw-alias-bg-layer-1)' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
                React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', marginRight: '10px', background: 'var(--dsw-alias-state-success-primary)' } }),
                React.createElement('strong', { style: { fontSize: '15px', color: 'var(--dsw-alias-label-primary)' } }, p.label || p.id),
                React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginLeft: '10px' } }, t('keylessNote')),
              ),
              React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, t('keylessHint')),
            ),
          );
        }

        var btnStyle = { padding: '6px 0', width: '76px', textAlign: 'center', color: 'var(--dsw-alias-label-primary-foreground)', border: 'none', borderRadius: '4px', fontSize: '13px', flexShrink: '0' };
        var clearBtnStyle = { padding: '6px 0', width: '64px', textAlign: 'center', color: 'var(--dsw-alias-label-primary-foreground)', border: 'none', borderRadius: '4px', fontSize: '13px', flexShrink: '0' };

        return React.createElement('div', { style: { opacity: view.opacity } },
          React.createElement('div', { style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '16px', background: 'var(--dsw-alias-bg-layer-1)' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '14px' } },
              React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', marginRight: '10px', background: view.configured ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-dimmed)' } }),
              React.createElement('strong', { style: { fontSize: '15px', color: 'var(--dsw-alias-label-primary)' } }, p.label || p.id),
              React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginLeft: '10px' } }, t(view.statusKey)),
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              React.createElement('input', {
                type: view.inputType,
                value: view.displayValue,
                disabled: view.inputDisabled,
                onChange: function (ev) { dispatch({ type: 'CHANGE_KEY', value: ev.target.value }); },
                placeholder: view.placeholderKey ? t(view.placeholderKey) : '',
                style: { flex: '1', minWidth: '0', padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: '4px', fontSize: '13px', color: 'var(--dsw-alias-label-primary)', background: view.inputDisabled ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-specific-input-major)' },
              }),
              React.createElement('button', {
                onClick: handleSave,
                disabled: !view.canSave,
                style: Object.assign({}, btnStyle, { background: view.canSave ? 'var(--dsw-alias-button-primary-fill)' : 'var(--dsw-alias-button-primary-dimmed)', cursor: view.canSave ? 'pointer' : 'default' }),
              }, state.saving ? t('saving') : t('save')),
              React.createElement('button', {
                onClick: handleClear,
                disabled: !view.canClear,
                style: Object.assign({}, clearBtnStyle, { background: view.canClear ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-button-primary-dimmed)', cursor: view.canClear ? 'pointer' : 'default' }),
              }, state.clearing ? t('clearing') : t('clear')),
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' } },
              React.createElement('button', {
                onClick: handleTest,
                disabled: !view.canTest,
                title: t('testHint'),
                style: Object.assign({}, btnStyle, { background: view.canTest ? 'var(--dsw-alias-button-info-fill)' : 'var(--dsw-alias-button-primary-dimmed)', cursor: view.canTest ? 'pointer' : 'default' }),
              }, state.testing ? t('testing') : t('test')),
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

        // Re-render when the host language changes (the bound `t` resolves it at call time).
        useLocaleTick();

        React.useEffect(function () {
          if (!websearch) {
            setData({ providers: [], loading: false, error: t('errorNoNamespace') });
            return;
          }
          try {
            websearch.list().then(function (result) {
              setData({ providers: (result.ok ? result.value.providers : []) || [], loading: false, error: result.ok ? null : String((result.error && result.error.message) || t('errorLoad')) });
            }, function (err) {
              setData({ providers: [], loading: false, error: String(err && err.message || err) });
            });
          } catch (e) {
            setData({ providers: [], loading: false, error: t('errorSyncThrew', { message: (e && e.message) || String(e) }) });
          }
        }, []);

        var refreshProviders = React.useCallback(function () {
          websearch.list().then(function (result) {
            if (result.ok) {
              setData(function (prev) { return Object.assign({}, prev, { providers: result.value.providers || [] }); });
            } else {
              setData(function (prev) { return Object.assign({}, prev, { error: String((result.error && result.error.message) || t('errorRefresh')) }); });
            }
          }, function (err) {
            setData(function (prev) { return Object.assign({}, prev, { error: String(err && err.message || err) }); });
          });
        }, []);

        var handleSetKey = React.useCallback(function (id, value, done) {
          websearch.setKey({ id: id, value: value }).then(function (result) {
            if (result.ok) { refreshProviders(); if (done) done(true, null); }
            else { if (done) done(false, (result.error && result.error.message) || t('errorSave')); }
          }, function (err) {
            if (done) done(false, String(err && err.message || err));
          });
        }, [refreshProviders]);

        var handleClearKey = React.useCallback(function (id, done) {
          websearch.unsetKey({ id: id }).then(function (result) {
            if (result.ok) { refreshProviders(); if (done) done(true, null); }
            else { if (done) done(false, (result.error && result.error.message) || t('errorClear')); }
          }, function (err) {
            if (done) done(false, String(err && err.message || err));
          });
        }, [refreshProviders]);

        // Test connection: call host's testProvider (send one minimal request with saved credentials to determine status)
        var handleTestKey = React.useCallback(function (id, done) {
          websearch.testProvider({ id: id }).then(function (result) {
            if (result.ok && result.value && result.value.ok) { if (done) done(true, result.value.message || t('ok')); }
            else if (result.ok) { if (done) done(false, (result.value && result.value.message) || t('errorTest')); }
            else { if (done) done(false, (result.error && result.error.message) || t('errorTest')); }
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
          return React.createElement('div', { style: { padding: '20px', color: 'var(--dsw-alias-label-tertiary)' } }, t('loading'));
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
            title: t('dragHint'),
          }, React.createElement(ProviderCard, { p: p, onSave: handleSetKey, onClear: handleClearKey, onTest: handleTestKey }));
        });

        return React.createElement('div', { style: { padding: '16px' } },
          React.createElement('h2', { style: { fontSize: '18px', marginBottom: '8px', color: 'var(--dsw-alias-label-primary)' } }, t('title')),
          React.createElement('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '16px', lineHeight: '1.5' } },
            t('description')
          ),
          data.error ? React.createElement('div', { style: { padding: '8px 12px', background: 'var(--dsw-alias-interactive-bg-hover-danger)', color: 'var(--dsw-alias-state-error-primary)', borderRadius: '4px', marginBottom: '12px', fontSize: '13px' } }, data.error) : null,
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, cards),
        );
      }

      return { WebSearchSettings: WebSearchSettings };
    }

    async function apply(ctx) {
      // Localized through the host's injected `locale` service: register the dictionaries
      // before the slot is registered so the first render resolves, and bind once — the
      // bound `t` reads the active locale at call time, so it follows a language switch.
      var locale = ctx.locale;
      var t = locale ? locale.bind(NS) : function (key) { return EN[key] || key; };
      if (locale) ctx.effect(function () { return locale.register(NS, { en: EN, zh: ZH }); });

      // Mount the websearch namespace (self-mounted by this package; api-remotes assembly only mounts namespaces it knows)
      const dispose = await ctx.remote.$mount(contribution);
      ctx.effect(function () { return dispose; });

      // namespace service is provided in $mount's child fiber; ctx.remote.websearch
      // property access via fiber chain fails (self-mounting cannot inject itself, would deadlock);
      // ctx.get('remote.websearch') uses the global DescriptorStore and is available after $mount.
      const websearch = ctx.get('remote.websearch');

      // Components defined once in the apply scope (stable function identity, avoids settings page remounting and losing state)
      var components = createComponents(websearch, t, locale);

      var slots = ctx.get('slots');
      if (!slots) return;
      slots.inject('settings.section', function () {
        return slots.register(
          // Unique id (web-search-providers) → appears as a side-by-side page in the settings sidebar,
          // isolated from the native web_search config page, does not replace it (settings.section is a list, unique id = unique page).
          // The label is a thunk so the sidebar entry follows the host language.
          { name: 'settings.section', id: 'web-search-providers', order: 12, label: function () { return t('title'); } },
          function () {
            return React.createElement(components.WebSearchSettings, null);
          }
        );
      });
    }

    module.exports = {
      name: '@deepseek-ai/dsh-web-search',
      inject: ['slots', 'remote', 'locale'],
      apply: apply,
      // Test-only handle on the pure state machine shipped above. The browser half
      // cannot `require` local files, so this is the only way tests can reach the
      // copy that users actually load (see tests/interaction.test.mjs).
      __internals: {
        MASK: MASK,
        initialState: interactionInitial,
        deriveViewState: deriveView,
        reducer: interactionReducer,
        reorderProviders: reorderProviders,
      },
    };

    return module.exports;
  },
});