// safeStorage — wraps localStorage for environments where it may be unavailable
// or throw on access (Safari private mode pre-2022, strict iframes, cookies
// blocked globally, quota exhausted). every call is no-throw.
//
// never import `localStorage` directly anywhere in the project: route through this module.

interface SafeStorage {
  /** true only if read and write round-trip successfully at module init */
  readonly available: boolean
  get:    (key: string) => string | null
  set:    (key: string, value: string) => boolean
  remove: (key: string) => void
}

const PROBE_KEY = '__glace_storage_probe__'

function detect(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if (!window.localStorage) return false
    window.localStorage.setItem(PROBE_KEY, '1')
    const ok = window.localStorage.getItem(PROBE_KEY) === '1'
    window.localStorage.removeItem(PROBE_KEY)
    return ok
  } catch {
    return false
  }
}

const available = detect()

export const safeStorage: SafeStorage = {
  available,

  get(key) {
    if (!available) return null
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },

  set(key, value) {
    if (!available) return false
    try {
      window.localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  },

  remove(key) {
    if (!available) return
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore — storage became unavailable mid-session */
    }
  },
}
