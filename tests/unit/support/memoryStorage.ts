/*
 * A working localStorage for tests.
 *
 * The jsdom environment here exposes a `localStorage` global with no methods on
 * it at all, which is a fair imitation of a browser with site data blocked but
 * useless for testing what gets remembered. Anything that needs storage to work
 * stubs this over the top; anything testing the blocked case leaves it alone.
 */
export function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  const storage = {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key)
    },
    setItem: (key: string, value: string) => {
      entries.set(key, String(value))
    },
  }
  return storage as unknown as Storage
}

/** A storage that throws on every call, as Safari private mode once did. */
export function hostileStorage(): Storage {
  const boom = () => {
    throw new DOMException('QuotaExceededError')
  }
  return {
    get length(): number {
      return boom()
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as unknown as Storage
}
