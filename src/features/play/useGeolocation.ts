import { useCallback, useEffect, useState } from 'react'
import type { LatLng } from '../../lib/geo'

/**
 * A phone GPS, scoped to a screen.
 *
 * `watchPosition` keeps the location radio awake for as long as the watch is
 * registered, so the hook owns the whole lifecycle: nothing is watching before
 * `start`, and the watch is always cleared on unmount, whatever state the hook was
 * left in. A yardage screen you navigated away from must not still drain the battery.
 *
 * The watch is registered by an effect whose only job is that subscription — all
 * state is either set from the browser's own callbacks or derived from what those
 * callbacks recorded. Nothing is pushed into state from inside the effect body.
 */

export type GeolocationErrorKind =
  | 'unsupported'
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'

export interface GeolocationFailure {
  readonly kind: GeolocationErrorKind
  /** Plain-language, already fit to show on screen. */
  readonly message: string
  /** True when trying again might work. A refusal will not fix itself. */
  readonly recoverable: boolean
}

export interface GeolocationFix {
  readonly position: LatLng
  /** Radius of the 95% confidence circle, in metres, as the browser reports it. */
  readonly accuracyMetres: number
  /** Epoch milliseconds the fix was taken. */
  readonly timestamp: number
}

export type GeolocationStatus =
  /** Not watching, and not asked to be. */
  | 'idle'
  /** No geolocation in this browser at all. */
  | 'unsupported'
  /** Watching, but no fix has landed yet. */
  | 'locating'
  /** Watching, with a fix. */
  | 'tracking'
  /** Stopped or stalled on an error. */
  | 'error'

/**
 * What we know about the permission, inferred from what the browser actually did.
 *
 * Deliberately not read from the Permissions API: it is absent on older Safari and
 * reports `prompt` on iOS even after a grant. A fix means granted; a code-1 error
 * means denied. Nothing else is worth claiming.
 */
export type GeolocationPermission = 'unknown' | 'granted' | 'denied'

export interface UseGeolocationOptions {
  /** Whether to begin watching on mount. Read once; `start`/`stop` drive it after. */
  readonly autoStart?: boolean
  readonly enableHighAccuracy?: boolean
  readonly timeoutMs?: number
  /** How stale a cached fix may be before the browser must take a new one. */
  readonly maximumAgeMs?: number
}

export interface GeolocationReading {
  readonly status: GeolocationStatus
  readonly fix: GeolocationFix | null
  readonly error: GeolocationFailure | null
  readonly permission: GeolocationPermission
  readonly isWatching: boolean
  readonly start: () => void
  readonly stop: () => void
}

const UNSUPPORTED: GeolocationFailure = {
  kind: 'unsupported',
  message: 'This browser has no GPS. Distances are unavailable — the map still works.',
  recoverable: false,
}

/**
 * Turns a `GeolocationPositionError` into something worth putting on a phone screen.
 *
 * Exported so the mapping can be tested without a browser. The browser's own
 * `message` is developer text ("User denied Geolocation"), not player text.
 */
export function describeGeolocationError(error: { readonly code: number }): GeolocationFailure {
  switch (error.code) {
    case 1: // PERMISSION_DENIED
      return {
        kind: 'permission-denied',
        message:
          'Location is blocked for this site. Allow it in your browser settings, then try again.',
        recoverable: false,
      }
    case 2: // POSITION_UNAVAILABLE
      return {
        kind: 'position-unavailable',
        message: 'No fix yet. Step into the open and give it a moment.',
        recoverable: true,
      }
    case 3: // TIMEOUT
      return {
        kind: 'timeout',
        message: 'The GPS is taking a while. Still trying.',
        recoverable: true,
      }
    default:
      return {
        kind: 'position-unavailable',
        message: 'The GPS stopped responding. Try again.',
        recoverable: true,
      }
  }
}

/** Reads a browser position into our own shape, in metres. */
export function toFix(position: GeolocationPosition): GeolocationFix {
  return {
    position: { lat: position.coords.latitude, lng: position.coords.longitude },
    accuracyMetres: position.coords.accuracy,
    timestamp: position.timestamp,
  }
}

/**
 * ±10 m is the accuracy the requirements accept for a yardage. Past that the
 * number on screen deserves a warning rather than to be quietly believed.
 */
export const ACCURACY_WARNING_M = 15

const getGeolocation = (): Geolocation | null => {
  if (typeof navigator === 'undefined') return null
  return navigator.geolocation ?? null
}

export function useGeolocation(options: UseGeolocationOptions = {}): GeolocationReading {
  const {
    autoStart = true,
    enableHighAccuracy = true,
    timeoutMs = 15_000,
    maximumAgeMs = 2_000,
  } = options

  const [supported] = useState(() => getGeolocation() !== null)
  const [watching, setWatching] = useState(autoStart)
  const [fix, setFix] = useState<GeolocationFix | null>(null)
  const [error, setError] = useState<GeolocationFailure | null>(null)
  const [permission, setPermission] = useState<GeolocationPermission>('unknown')

  useEffect(() => {
    if (!watching) return
    const geolocation = getGeolocation()
    if (geolocation === null) return

    const id = geolocation.watchPosition(
      (position) => {
        setFix(toFix(position))
        setError(null)
        setPermission('granted')
      },
      (positionError: GeolocationPositionError) => {
        const failure = describeGeolocationError(positionError)
        setError(failure)
        if (failure.kind === 'permission-denied') {
          setPermission('denied')
          // A refusal never resolves on its own, and the watch would sit there
          // re-firing the same error. Drop it; `start` re-registers on request.
          setWatching(false)
        }
        // A timeout or a momentarily lost fix keeps its watch. The phone usually
        // recovers once it sees the sky, and re-registering would restart the
        // acquisition from cold.
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs },
    )

    // Unmount, `stop`, a refusal, or a change of options all land here, so there
    // is exactly one path by which the radio is left running: none.
    return () => geolocation.clearWatch(id)
  }, [watching, enableHighAccuracy, timeoutMs, maximumAgeMs])

  const start = useCallback(() => {
    setError(null)
    setWatching(true)
  }, [])

  const stop = useCallback(() => {
    setError(null)
    setWatching(false)
  }, [])

  const status: GeolocationStatus = !supported
    ? 'unsupported'
    : error !== null
      ? 'error'
      : !watching
        ? 'idle'
        : fix !== null
          ? 'tracking'
          : 'locating'

  return {
    status,
    fix,
    error: supported ? error : UNSUPPORTED,
    permission,
    isWatching: watching && supported,
    start,
    stop,
  }
}
