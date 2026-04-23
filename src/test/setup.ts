import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

// Node 22+ ships a built-in `localStorage` proxy global that lacks Storage.prototype
// methods (.clear, .key) and shadows jsdom's implementation. Replace both with a
// plain Map-backed Storage shim so tests can exercise the full API.
function makeStorageShim(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear()                { store.clear() },
    key(i: number)         { return [...store.keys()][i] ?? null },
    getItem(k: string)     { return store.has(k) ? store.get(k)! : null },
    setItem(k: string, v: string) { store.set(k, String(v)) },
    removeItem(k: string)  { store.delete(k) },
  }
}

Object.defineProperty(globalThis, 'localStorage',   { value: makeStorageShim(), configurable: true, writable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: makeStorageShim(), configurable: true, writable: true })
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage',   { value: globalThis.localStorage,   configurable: true, writable: true })
  Object.defineProperty(window, 'sessionStorage', { value: globalThis.sessionStorage, configurable: true, writable: true })
}

// guarantee a clean slate between tests even if individual files forget to clear
beforeEach(() => {
  globalThis.localStorage.clear()
  globalThis.sessionStorage.clear()
})
