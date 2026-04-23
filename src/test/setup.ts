import '@testing-library/jest-dom'

// jsdom's localStorage doesn't always expose .clear() — provide a spec-compliant in-memory mock
const _store: Record<string, string> = {}
const localStorageMock: Storage = {
  get length() { return Object.keys(_store).length },
  key:        (i) => Object.keys(_store)[i] ?? null,
  getItem:    (key) => Object.hasOwn(_store, key) ? _store[key] : null,
  setItem:    (key, value) => { _store[key] = String(value) },
  removeItem: (key) => { delete _store[key] },
  clear:      () => { Object.keys(_store).forEach(k => { delete _store[k] }) },
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true, configurable: true })
