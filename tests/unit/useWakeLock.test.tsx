import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { isWakeLockSupported, useWakeLock } from '../../src/features/play/useWakeLock'

/*
 * Stands in for the Screen Wake Lock API. The behaviour worth reproducing is the
 * one that bites in the field: the browser silently drops the lock whenever the
 * page is hidden, and never re-takes it on its own.
 */
class FakeSentinel {
  released = false
  private listeners: Array<() => void> = []

  release = vi.fn(async (): Promise<void> => {
    if (this.released) return
    this.fireRelease()
  })

  addEventListener = (_type: 'release', listener: () => void): void => {
    this.listeners.push(listener)
  }

  removeEventListener = (_type: 'release', listener: () => void): void => {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  /** What the browser does when the page is hidden or the battery gets low. */
  fireRelease(): void {
    this.released = true
    for (const listener of [...this.listeners]) listener()
  }
}

class FakeWakeLock {
  readonly sentinels: FakeSentinel[] = []
  readonly requestedTypes: string[] = []
  rejectWith: Error | null = null

  request = vi.fn(async (type: 'screen'): Promise<FakeSentinel> => {
    this.requestedTypes.push(type)
    if (this.rejectWith !== null) throw this.rejectWith
    const sentinel = new FakeSentinel()
    this.sentinels.push(sentinel)
    return sentinel
  })
}

let wakeLock: FakeWakeLock

const installWakeLock = (value: unknown): void => {
  Object.defineProperty(navigator, 'wakeLock', { value, configurable: true, writable: true })
}

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

/** Lets the request promise inside the hook settle before anything is asserted. */
const flush = async (): Promise<void> => {
  await act(async () => {})
}

const mountWakeLock = async (enabled: boolean) => {
  const view = renderHook(() => useWakeLock(enabled))
  await flush()
  return view
}

const showPage = async (state: 'visible' | 'hidden'): Promise<void> => {
  setVisibility(state)
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => {
  wakeLock = new FakeWakeLock()
  installWakeLock(wakeLock)
  setVisibility('visible')
})

afterEach(() => {
  installWakeLock(undefined)
  setVisibility('visible')
})

describe('isWakeLockSupported', () => {
  it('is true when the browser exposes the API', () => {
    expect(isWakeLockSupported()).toBe(true)
  })

  it('is false when it does not', () => {
    installWakeLock(undefined)
    expect(isWakeLockSupported()).toBe(false)
  })
})

describe('useWakeLock', () => {
  it('takes a screen lock when the screen opens', async () => {
    const { result } = await mountWakeLock(true)

    expect(wakeLock.requestedTypes).toEqual(['screen'])
    expect(result.current.active).toBe(true)
    expect(result.current.supported).toBe(true)
  })

  it('does not take a lock when it is not enabled', async () => {
    const { result } = await mountWakeLock(false)

    expect(wakeLock.request).not.toHaveBeenCalled()
    expect(result.current.active).toBe(false)
    // Still supported - just not asked for.
    expect(result.current.supported).toBe(true)
  })

  it('releases the lock when the screen closes', async () => {
    const { unmount } = await mountWakeLock(true)
    const sentinel = wakeLock.sentinels[0]

    await act(async () => {
      unmount()
    })

    expect(sentinel?.release).toHaveBeenCalled()
  })

  it('takes the lock back after the browser drops it on a hidden page', async () => {
    const { result } = await mountWakeLock(true)
    expect(wakeLock.request).toHaveBeenCalledTimes(1)

    // The page goes to the background; the browser revokes the lock.
    await act(async () => {
      wakeLock.sentinels[0]?.fireRelease()
    })
    expect(result.current.active).toBe(false)

    await showPage('visible')

    expect(wakeLock.request).toHaveBeenCalledTimes(2)
    expect(result.current.active).toBe(true)
  })

  it('does not ask again while the page is still hidden', async () => {
    await mountWakeLock(true)
    await act(async () => {
      wakeLock.sentinels[0]?.fireRelease()
    })

    await showPage('hidden')
    expect(wakeLock.request).toHaveBeenCalledTimes(1)
  })

  it('does not stack locks when the page is shown twice in a row', async () => {
    await mountWakeLock(true)
    await showPage('visible')
    await showPage('visible')
    expect(wakeLock.request).toHaveBeenCalledTimes(1)
  })

  it('stops listening once the screen is closed', async () => {
    const { unmount } = await mountWakeLock(true)
    await act(async () => {
      unmount()
    })

    await showPage('visible')
    expect(wakeLock.request).toHaveBeenCalledTimes(1)
  })

  it('degrades silently where the API is missing', async () => {
    installWakeLock(undefined)
    const { result } = await mountWakeLock(true)

    expect(result.current.supported).toBe(false)
    expect(result.current.active).toBe(false)
  })

  it('swallows a refusal - a dimming screen is not an error worth showing', async () => {
    wakeLock.rejectWith = new Error('NotAllowedError')
    const { result } = await mountWakeLock(true)

    expect(wakeLock.request).toHaveBeenCalledTimes(1)
    expect(result.current.active).toBe(false)
    expect(result.current.supported).toBe(true)
  })

  it('tries again on the next visibility change after a refusal', async () => {
    wakeLock.rejectWith = new Error('NotAllowedError')
    const { result } = await mountWakeLock(true)

    wakeLock.rejectWith = null
    await showPage('visible')

    expect(wakeLock.request).toHaveBeenCalledTimes(2)
    expect(result.current.active).toBe(true)
  })
})
