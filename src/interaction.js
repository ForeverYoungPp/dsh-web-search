/**
 * ProviderCard interaction state machine (pure reducer, unit-testable).
 *
 * Rules:
 * - provider key configured → password field is grayed out (disabled) showing MASK（••••••••••）, not editable;
 *   only Clear is available. To change key, Clear first, then enter new key and Save.
 * - provider not configured → password field is editable with placeholder, Save is available.
 *
 * Security: never display the real key; MASK is just the display layer, Save only uses the user's actual input.
 */

export const MASK = '••••••••••••'

export const initialState = {
  keyValue: '',
  saving: false,
  clearing: false,
  testing: false,
  lastResult: null,
  testResult: null,
}

/**
 * Derive view state: display value, whether input is disabled, button availability, status text.
 * @param {object} state reducer state
 * @param {object|null|undefined} provider { kind?: 'apikey'|'endpoint'|'none', keyStatus: { configured: boolean } }
 */
export function deriveViewState(state, provider) {
  const kind = provider && provider.kind ? provider.kind : 'apikey'
  const configured = provider && provider.keyStatus
    ? provider.keyStatus.configured === true
    : false
  // Configured → grayed out + masked; not configured → show input
  const displayValue = configured ? MASK : state.keyValue
  const inputDisabled = configured
  const idle = !state.saving && !state.clearing && !state.testing
  // Not configured, non-empty input, and idle → Save enabled
  const canSave = !configured && idle && state.keyValue.trim().length > 0
  // Configured and idle → Clear enabled
  const canClear = configured && idle
  // Configured and idle → Test enabled (test connection requires saved credentials)
  const canTest = configured && idle
  const statusText = configured
    ? (kind === 'endpoint' ? 'Configured' : 'Active')
    : (kind === 'endpoint' ? 'Inactive (no endpoint)' : 'Inactive (no key)')
  const opacity = configured ? '1' : '0.55'
  const placeholder = configured
    ? ''
    : kind === 'endpoint'
      ? 'Enter endpoint URL (e.g. https://searx.example.org)...'
      : 'Enter API key to activate...'
  const inputType = kind === 'endpoint' ? 'text' : 'password'
  return { kind, configured, canSave, canClear, canTest, testing: state.testing, testResult: state.testResult, statusText, opacity, displayValue, inputDisabled, placeholder, inputType }
}

/**
 * Move the item at position from to position to within the provider list (drag-sort pure function).
 * to is the target insertion index (after the move, the from item ends up at to). Returns a new array (immutable).
 * @param {Array} providers provider list
 * @param {number} from current index of the dragged item
 * @param {number} to target index
 * @returns {Array}
 */
export function reorderProviders(providers, from, to) {
  if (!Array.isArray(providers) || from === to) return providers
  if (from < 0 || from >= providers.length || to < 0 || to >= providers.length) return providers
  const next = providers.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * reducer: handles all user input and async results.
 * Each branch returns a new object (immutable) for easy testing and React re-rendering.
 */
export function reducer(state, action) {
  switch (action.type) {
    case 'CHANGE_KEY':
      return { ...state, keyValue: action.value, lastResult: null }

    case 'SAVE_START':
      if (state.saving || state.clearing || state.testing) return state
      return { ...state, saving: true, lastResult: null }

    case 'SAVE_SUCCESS':
      // After success, configured → grayed out masked state
      return { ...state, saving: false, keyValue: '', lastResult: { type: 'saved' } }

    case 'SAVE_FAIL':
      return { ...state, saving: false, lastResult: { type: 'error', message: action.message } }

    case 'CLEAR_START':
      if (state.saving || state.clearing || state.testing) return state
      return { ...state, clearing: true, lastResult: null }

    case 'CLEAR_SUCCESS':
      // After clearing, not configured → editable state
      return { ...state, clearing: false, keyValue: '', lastResult: { type: 'cleared' } }

    case 'CLEAR_FAIL':
      return { ...state, clearing: false, lastResult: { type: 'error', message: action.message } }

    case 'TEST_START':
      if (state.testing || state.saving || state.clearing) return state
      return { ...state, testing: true, testResult: null }

    case 'TEST_SUCCESS':
      return { ...state, testing: false, testResult: { type: 'success', message: action.message } }

    case 'TEST_FAIL':
      return { ...state, testing: false, testResult: { type: 'error', message: action.message } }

    default:
      return state
  }
}
