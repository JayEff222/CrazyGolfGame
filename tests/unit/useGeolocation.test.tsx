import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  describeGeolocationError,
  toFix,
  useGeolocation,
} from '../../src/features/play/useGeolocation'

/*
 * A stand-in for the browser's Geolocation, so the hook can be driven the way a
 * phone would drive it: a watch that fires repeatedly, sometimes with an error,
 * sometimes recovering. Nothing here touches a real sensor.
 */
interface Watch {
  readonly success: PositionCallback
  readonly error: PositionErrorCallback | null
  readonly options: PositionOptions | undefined
}

class FakeGeolocation {
  readonly watches = new Map<number, Watch>()
  readonly cleared: number[] = []
  private nextId = 1
  /** Every id ever handed out, so double-registration is visible. */
  readonly issued: number[] = []

  watchPosition = (
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): number => {
    const id = this.nextId++
    this.issued.push(id)
    this.watches.set(id, { success, error: error ?? null, options })
    return id
  }

  clearWatch = (id: number): void => {
    this.cleared.push(id)
    this.watches.delete(id)
  }

  getCurrentPosition = (): void => {}

  /** Fires a fix at every live watch. */
  send(lat: number, lng: number, accuracy = 8, timestamp = 1_700_000_000_000): void {
    const position = {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp,
      toJSON: () => ({}),
    } as unknown as GeolocationPosition

    for (const watch of [...this.watches.values()]) watch.success(position)
  }

  /** Fires an error at every live watch. 1 denied, 2 unavailable, 3 timeout. */
  fail(code: number): void {
    const error = { code, message: 'test', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
    for (const watch of [...this.watches.values()]) watch.error?.(error as GeolocationPositionError)
  }
}

let fake: FakeGeolocation

const installGeolocation = (value: unknown): void => {
  Object.defineProperty(navigator, 'geolocation', { value, configurable: true, writable: true })
}

beforeEach(() => {
  fake = new FakeGeolocation()
  installGeolocation(fake)
})

afterEach(() => {
  installGeolocation(undefined)
})

describe('describeGeolocationError', () => {
  it('names a refusal and marks it unrecoverable', () => {
    const failure = describeGeolocationError({ code: 1 })
    expect(failure.kind).toBe('permission-denied')
    expect(failure.recoverable).toBe(false)
  })

  it('treats an unavailable position as worth retrying', () => {
    expect(describeGeolocationError({ code: 2 })).toMatchObject({
      kind: 'position-unavailable',
      recoverable: true,
    })
  })

  it('names a timeout', () => {
    expect(describeGeolocationError({ code: 3 }).kind).toBe('timeout')
  })

  it('falls back sensibly on a code it has never seen', () => {
    expect(describeGeolocationError({ code: 99 })).toMatchObject({
      kind: 'position-unavailable',
      recoverable: true,
    })
  })

  it('never hands the browser’s developer text to a player', () => {
    for (const code of [1, 2, 3, 99]) {
      expect(describeGeolocationError({ code }).message).not.toMatch(/geolocation/i)
    }
  })
})

describe('toFix', () => {
  it('reads latitude, longitude, accuracy in metres and the timestamp', () => {
    const position = {
      coords: { latitude: -32.04, longitude: 147.97, accuracy: 12.4 },
      timestamp: 42,
    } as GeolocationPosition

    expect(toFix(position)).toEqual({
      position: { lat: -32.04, lng: 147.97 },
      accuracyMetres: 12.4,
      timestamp: 42,
    })
  })
})

describe('useGeolocation', () => {
  it('starts watching as soon as it mounts', () => {
    const { result } = renderHook(() => useGeolocation())
    expect(fake.watches.size).toBe(1)
    expect(result.current.status).toBe('locating')
    expect(result.current.isWatching).toBe(true)
  })

  it('stays off when autoStart is false', () => {
    const { result } = renderHook(() => useGeolocation({ autoStart: false }))
    expect(fake.watches.size).toBe(0)
    expect(result.current.status).toBe('idle')
    expect(result.current.isWatching).toBe(false)
  })

  it('asks for high accuracy by default', () => {
    renderHook(() => useGeolocation())
    const watch = [...fake.watches.values()][0]
    expect(watch?.options?.enableHighAccuracy).toBe(true)
  })

  it('passes through the timeout and maximum age it was given', () => {
    renderHook(() => useGeolocation({ timeoutMs: 1234, maximumAgeMs: 99 }))
    const watch = [...fake.watches.values()][0]
    expect(watch?.options?.timeout).toBe(1234)
    expect(watch?.options?.maximumAge).toBe(99)
  })

  it('reports a fix with its accuracy in metres', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.send(-32.0394, 147.9733, 7.5))

    expect(result.current.status).toBe('tracking')
    expect(result.current.fix).toEqual({
      position: { lat: -32.0394, lng: 147.9733 },
      accuracyMetres: 7.5,
      timestamp: 1_700_000_000_000,
    })
    expect(result.current.permission).toBe('granted')
    expect(result.current.error).toBeNull()
  })

  it('keeps up with a moving player', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.send(-32.04, 147.97))
    act(() => fake.send(-32.05, 147.98))
    expect(result.current.fix?.position).toEqual({ lat: -32.05, lng: 147.98 })
  })

  it('stops watching for good when permission is refused', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.fail(1))

    expect(result.current.permission).toBe('denied')
    expect(result.current.error?.kind).toBe('permission-denied')
    expect(result.current.status).toBe('error')
    expect(result.current.isWatching).toBe(false)
    // The radio is off: a refusal would otherwise re-fire the same error forever.
    expect(fake.watches.size).toBe(0)
  })

  it('keeps the watch alive through a timeout, and recovers on the next fix', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.fail(3))

    expect(result.current.error?.kind).toBe('timeout')
    expect(result.current.status).toBe('error')
    expect(fake.watches.size).toBe(1)

    act(() => fake.send(-32.04, 147.97))
    expect(result.current.status).toBe('tracking')
    expect(result.current.error).toBeNull()
  })

  it('keeps the watch alive when the position is momentarily unavailable', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.fail(2))

    expect(result.current.error?.kind).toBe('position-unavailable')
    expect(fake.watches.size).toBe(1)
    expect(result.current.isWatching).toBe(true)
  })

  it('keeps the last known fix when the signal drops', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.send(-32.04, 147.97))
    act(() => fake.fail(2))
    expect(result.current.fix?.position).toEqual({ lat: -32.04, lng: 147.97 })
  })

  it('can be retried after a refusal', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => fake.fail(1))
    act(() => result.current.start())

    expect(fake.watches.size).toBe(1)
    expect(result.current.status).toBe('locating')
    expect(result.current.error).toBeNull()
  })

  it('never registers two watches at once', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    act(() => result.current.start())
    expect(fake.issued).toHaveLength(1)
  })

  it('stop() clears the watch and leaves it off', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.stop())

    expect(fake.watches.size).toBe(0)
    expect(result.current.isWatching).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('can be started again after being stopped', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.stop())
    act(() => result.current.start())
    expect(fake.watches.size).toBe(1)
    expect(result.current.isWatching).toBe(true)
  })

  it('clears the watch when the screen unmounts', () => {
    const { unmount } = renderHook(() => useGeolocation())
    const [id] = fake.issued
    unmount()

    expect(fake.watches.size).toBe(0)
    expect(fake.cleared).toContain(id)
  })

  it('clears a manually started watch on unmount too', () => {
    const { result, unmount } = renderHook(() => useGeolocation({ autoStart: false }))
    act(() => result.current.start())
    expect(fake.watches.size).toBe(1)

    unmount()
    expect(fake.watches.size).toBe(0)
  })

  it('reports an unsupported browser instead of throwing', () => {
    installGeolocation(undefined)
    const { result } = renderHook(() => useGeolocation())

    expect(result.current.status).toBe('unsupported')
    expect(result.current.error?.kind).toBe('unsupported')
    expect(result.current.error?.recoverable).toBe(false)
    expect(result.current.isWatching).toBe(false)
  })

  it('stays unsupported when stop is called on a browser with no geolocation', () => {
    installGeolocation(undefined)
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.stop())
    expect(result.current.status).toBe('unsupported')
  })
})
