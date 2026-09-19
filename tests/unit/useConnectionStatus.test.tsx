import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { SyncIndicator } from '../../src/features/offline/SyncIndicator'

/*
 * T-8.1 - the offline indicator.
 *
 * The behaviour that matters on a fairway: losing signal says so immediately and
 * reassuringly, and regaining it does not claim everything is safe until the
 * queued writes have actually reached the server.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

const { waitForPendingWrites } = vi.hoisted(() => ({ waitForPendingWrites: vi.fn() }))
vi.mock('firebase/firestore', () => ({ waitForPendingWrites }))

/** Drives navigator.onLine, which jsdom exposes as a read-only true. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

const fireConnection = (event: 'online' | 'offline') =>
  act(() => {
    window.dispatchEvent(new Event(event))
  })

beforeEach(() => {
  setOnline(true)
  waitForPendingWrites.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  setOnline(true)
})

describe('SyncIndicator', () => {
  it('reads online on a normal start without flashing "syncing" first', () => {
    render(<SyncIndicator />)

    expect(screen.getByRole('status')).toHaveTextContent('Online')
    // A cold start has an empty queue; waiting on it would show a pointless
    // "Syncing…" on every launch.
    expect(waitForPendingWrites).not.toHaveBeenCalled()
  })

  it('starts offline when the phone already has no signal', () => {
    setOnline(false)
    render(<SyncIndicator />)

    expect(screen.getByRole('status')).toHaveTextContent('Offline')
  })

  it('tells the player their scores are safe on this phone when signal drops', async () => {
    render(<SyncIndicator />)

    setOnline(false)
    fireConnection('offline')

    expect(screen.getByRole('status')).toHaveTextContent('Offline — saved on this phone')
  })

  it('says syncing until the queued writes actually reach the server', async () => {
    let acknowledge = () => {}
    waitForPendingWrites.mockReturnValue(
      new Promise<void>((resolve) => {
        acknowledge = resolve
      }),
    )

    render(<SyncIndicator />)

    setOnline(false)
    fireConnection('offline')
    setOnline(true)
    fireConnection('online')

    // Back on the network, but nothing has been acknowledged yet - claiming
    // "Online" here would be a lie about where the scores are.
    expect(screen.getByRole('status')).toHaveTextContent('Syncing…')

    await act(async () => {
      acknowledge()
    })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Online'))
  })

  it('does not strand on "syncing" when the wait fails', async () => {
    waitForPendingWrites.mockRejectedValue(new Error('cache closed'))

    render(<SyncIndicator />)

    setOnline(false)
    fireConnection('offline')
    setOnline(true)
    fireConnection('online')

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Online'))
  })

  it('announces politely rather than interrupting mid-round', () => {
    render(<SyncIndicator />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })
})
