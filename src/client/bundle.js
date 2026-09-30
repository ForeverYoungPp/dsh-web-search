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
  id: '@ian_p/dsh-web-search',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    // ================= Remote contribution (mirrors the SRC side of src/remote.js) =================
    // Client requires a strict codec exposing `create(): TypertSchema`, where TypertSchema is a
    // { parse(value) } interface — a transparent passthrough works, no zod needed. The schema holds
    // no state, so one shared object is handed out (the gateway calls create().parse(value) per decode).
    var passthrough = { parse: function (value) { return value; } };
    function jsonCodec() {
      return { mode: 'strict', typeSymbol: 'dsh-web-search#json', create: function () { return passthrough; } };
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
      title: 'Search providers',
      summary: 'Configure the providers behind the native web_search tool',
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
      title: '搜索 Provider',
      summary: '配置原生 web_search 工具背后的 provider',
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

    // ================= Host-native stylesheet =================
    // A hand-written bundle cannot import the host's CSS modules, so these rules are copied from
    // the page the user compares against: the Plugins settings page
    // (dsh-client-ui-settings-plugins/lib/client.js on this train). Geometry and colours come
    // from its card / header / field / footer / save / discard rules, and every value consumes a
    // --dsw-* token so light and dark follow the host. Two deliberate deviations:
    //   * error text uses --dsw-alias-state-error-primary, because the page's own
    //     --dsw-alias-label-error is referenced but defined nowhere on this train (an invalid
    //     declaration that would fall back to inherited colour); state-error-primary is the
    //     token the host uses for errors everywhere else.
    //   * the input keeps a focus border and the buttons a :hover tint, which the copied rules
    //     omit; both use host tokens and exist for keyboard/accessibility feedback.
    var STYLES = [
      '.dws-page{padding:16px}',
      '.dws-section{display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary)}',
      '.dws-heading{margin:0;font-size:18px;font-weight:600}',
      '.dws-intro{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dws-alert{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}',
      '.dws-empty{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}',
      '.dws-cards{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}',
      '.dws-card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;transition:border-color .16s,background .16s}',
      '.dws-card--idle{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.dws-card-head{display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.dws-head-text{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}',
      '.dws-name{margin:0;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}',
      '.dws-desc{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dws-dot{flex:none;display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}',
      '.dws-dot--on{background:var(--dsw-alias-state-success-primary)}',
      '.dws-body{display:flex;flex-direction:column;gap:6px;margin:0 16px;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dws-input{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}',
      '.dws-input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}',
      '.dws-input::placeholder{color:var(--dsw-alias-label-dimmed)}',
      '.dws-input:disabled{opacity:.6;cursor:default}',
      '.dws-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin:0 16px;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dws-slot{flex:1;min-width:0}',
      '.dws-feedback{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dws-feedback--ok{color:var(--dsw-alias-state-success-primary)}',
      '.dws-feedback--err{color:var(--dsw-alias-state-error-primary)}',
      '.dws-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;white-space:nowrap;background:transparent;color:var(--dsw-alias-label-primary)}',
      '.dws-btn:disabled{opacity:.4;cursor:default}',
      '.dws-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}',
      '.dws-btn--primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
      '.dws-btn--secondary{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.dws-btn--danger{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-state-error-primary)}',
      '.dws-btn--secondary:hover:not(:disabled),.dws-btn--danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dws-drag{cursor:grab}',
    ].join('\n')

    // The loader tags untagged <style> elements with its own data-plugin attribute, so this one
    // carries data-plugin-css to stay identifiable. Runs at materialization, where document exists.
    function injectStyles() {
      if (typeof document === 'undefined' || !document.head) return
      if (document.querySelector('style[data-plugin-css="dsh-web-search"]')) return
      var el = document.createElement('style')
      el.setAttribute('data-plugin-css', 'dsh-web-search')
      el.textContent = STYLES
      document.head.appendChild(el)
    }

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
          var feedbackClass = 'dws-feedback';
          var feedbackText;
          if (lastResult.type === 'saved') {
            feedbackClass += ' dws-feedback--ok';
            feedbackText = t('saved');
          } else if (lastResult.type === 'cleared') {
            feedbackText = t('cleared');
          } else {
            feedbackClass += ' dws-feedback--err';
            feedbackText = lastResult.message || t('error');
          }
          feedback = React.createElement('span', { className: feedbackClass }, feedbackText);
        }

        var testFeedback = null;
        if (testResult) {
          var testOk = testResult.type === 'success';
          testFeedback = React.createElement(
            'span',
            { className: 'dws-feedback' + (testOk ? ' dws-feedback--ok' : ' dws-feedback--err') },
            testResult.message || (testOk ? t('ok') : t('errorTest')),
          );
        }

        // DuckDuckGo: keyless provider, display only, no input
        if (view.kind === 'none') {
          return React.createElement('div', { className: 'dws-card' },
            React.createElement('div', { className: 'dws-card-head' },
              React.createElement('span', { className: 'dws-dot dws-dot--on' }),
              React.createElement('div', { className: 'dws-head-text' },
                React.createElement('span', { className: 'dws-name' }, p.label || p.id),
                React.createElement('span', { className: 'dws-desc' }, t('keylessNote')),
              ),
            ),
            React.createElement('div', { className: 'dws-body' },
              React.createElement('p', { className: 'dws-desc' }, t('keylessHint')),
            ),
          );
        }

        return React.createElement('div', { className: view.configured ? 'dws-card' : 'dws-card dws-card--idle' },
          React.createElement('div', { className: 'dws-card-head' },
            React.createElement('span', { className: view.configured ? 'dws-dot dws-dot--on' : 'dws-dot' }),
            React.createElement('div', { className: 'dws-head-text' },
              React.createElement('span', { className: 'dws-name' }, p.label || p.id),
              React.createElement('span', { className: 'dws-desc' }, t(view.statusKey)),
            ),
          ),
          React.createElement('div', { className: 'dws-body' },
            React.createElement('input', {
              className: 'dws-input',
              type: view.inputType,
              value: view.displayValue,
              disabled: view.inputDisabled,
              onChange: function (ev) { dispatch({ type: 'CHANGE_KEY', value: ev.target.value }); },
              placeholder: view.placeholderKey ? t(view.placeholderKey) : '',
            }),
          ),
          React.createElement('div', { className: 'dws-footer' },
            React.createElement('div', { className: 'dws-slot' }, testFeedback, feedback),
            React.createElement('button', {
              className: 'dws-btn dws-btn--secondary',
              onClick: handleTest,
              disabled: !view.canTest,
              title: t('testHint'),
            }, state.testing ? t('testing') : t('test')),
            React.createElement('button', {
              className: 'dws-btn dws-btn--danger',
              onClick: handleClear,
              disabled: !view.canClear,
            }, state.clearing ? t('clearing') : t('clear')),
            React.createElement('button', {
              className: 'dws-btn dws-btn--primary',
              onClick: handleSave,
              disabled: !view.canSave,
            }, state.saving ? t('saving') : t('save')),
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
          return React.createElement('div', { className: 'dws-page' },
            React.createElement('p', { className: 'dws-empty' }, t('loading')),
          );
        }

        var cards = data.providers.map(function (p, i) {
          return React.createElement('div', {
            key: p.id,
            className: 'dws-drag',
            draggable: true,
            onDragStart: function () { handleDragStart(i); },
            onDragOver: function (ev) { ev.preventDefault(); },
            onDrop: function (ev) { ev.preventDefault(); handleDrop(i); },
            onDragEnd: handleDragEnd,
            title: t('dragHint'),
          }, React.createElement(ProviderCard, { p: p, onSave: handleSetKey, onClear: handleClearKey, onTest: handleTestKey }));
        });

        return React.createElement('div', { className: 'dws-page' },
          React.createElement('div', { className: 'dws-section' },
            React.createElement('h2', { className: 'dws-heading' }, t('title')),
            React.createElement('p', { className: 'dws-intro' }, t('description')),
            data.error ? React.createElement('p', { className: 'dws-alert' }, data.error) : null,
            React.createElement('div', { className: 'dws-cards' }, cards),
          ),
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
      if (locale) {
        try {
          ctx.effect(function () { return locale.register(NS, { en: EN, zh: ZH }); });
        } catch (e) {
          // A live plugin reload materializes this bundle a second time and the namespace already
          // carries our dictionaries; register() throws "locale namespace ... already has locale"
          // (dsh-client-locale/lib/client.js:1264) and that must not take the whole client half
          // down - the bound `t` works either way.
          console.warn('[dsh-web-search] locale dictionaries were already registered: ' + ((e && e.message) || String(e)));
        }
      }

      // Nothing to undo: the <style> element lives as long as the document, like the host's own
      // injected stylesheets, and apply() only runs once per materialization.
      injectStyles();

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
      // One stable component per apply(), so the Plugins-page detail panel never remounts the
      // subtree; the same component serves the list card's one-liner and the detail page.
      var page = function (props) {
        if (props && props.view === 'summary') return t('summary');
        return React.createElement(components.WebSearchSettings, null);
      };
      slots.inject('plugins.item', function () {
        return slots.register(
          // Unique id (web-search-providers) → listed as its own entry next to the native
          // web-search page, does not replace it (plugins.item is a list, unique id = unique page).
          // The label is a thunk so the entry follows the host language, and `locale` lets the
          // renderer re-render it on a language switch.
          { name: 'plugins.item', id: 'web-search-providers', order: 12, label: function () { return t('title'); }, locale: NS },
          page,
        );
      });
    }

    module.exports = {
      name: '@ian_p/dsh-web-search',
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