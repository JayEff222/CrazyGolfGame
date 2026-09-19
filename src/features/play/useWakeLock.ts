import { useEffect, useRef, useState } from 'react'

/**
 * Keeps the screen awake while the yardage screen is open.
 *
 * A golfer checks a distance, walks, checks again. A phone that locks every thirty
 * seconds turns that into a passcode exercise on every shot.
 *
 * Everything here degrades silently. The Screen Wake Lock API is absent on older
 * iOS, and even where it exists the request is refused under battery saver or when
 * the page is not visible. A screen that dims is a mild annoyance; an error banner
 * about it in the middle of a round is worse than the problem.
 */

export interface WakeLockState {
  /** Whether this browser has the API at all. */
  readonly supported: boolean
  /** Whether a lock is held right now. */
  readonly active: boolean
}

/**
 * The slice of the API this hook uses.
 *
 * Declared structurally rather than leaning on the DOM lib types so the hook still
 * compiles against a TypeScript DOM library that predates Screen Wake Lock.
 */
interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
  removeEventListener: (type: 'release', listener: () => void) => void
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

const getWakeLock = (): WakeLockLike | null => {
  if (typeof navigator === 'undefined') return null
  const candidate = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
  return candidate ?? null
}

export const isWakeLockSupported = (): boolean => getWakeLock() !== null

export function useWakeLock(enabled: boolean): WakeLockState {
  const [active, setActive] = useState(false)
  const [supported] = useState(isWakeLockSupported)
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) return
    const wakeLock = getWakeLock()
    if (wakeLock === null) return

    let cancelled = false

    const handleRelease = () => {
      sentinelRef.current = null
      setActive(false)
    }

    const acquire = async () => {
      if (cancelled || sentinelRef.current !== null) return
      try {
        const sentinel = await wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release().catch(() => {})
          return
        }
        sentinel.addEventListener('release', handleRelease)
        sentinelRef.current = sentinel
        setActive(true)
      } catch {
        // Refused: battery saver, a background tab, or an unsupported build. The
        // screen simply behaves as it normally would.
        setActive(false)
      }
    }

    /*
     * The browser drops the lock whenever the page is hidden - a call, a glance at
     * the scorecard in another app - and never gives it back on its own. Without
     * this the wake lock works exactly once per visit to the screen.
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      setActive(false)
      if (sentinel !== null) {
        sentinel.removeEventListener('release', handleRelease)
        void sentinel.release().catch(() => {})
      }
    }
  }, [enabled])

  return { supported, active }
}
