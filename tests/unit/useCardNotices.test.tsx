import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardNotices } from '../../src/features/cards/useCardNotices'
import type { PlayedCardEvent } from '../../src/lib/hands'
import { memoryStorage } from './support/memoryStorage'

/*
 * This hook is what tells a player a card has been played on them. The failure
 * that matters is silence: a notice that never appears means someone quietly
 * ignores a card, which in an honour-system game is the whole ballgame.
 *
 * It also holds state tagged by round and by storage key, so the stale cases are
 * worth pinning down — they are the kind of bug that only shows up on the second
 * round of the day.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

const subscribeEvents = vi.fn()
vi.mock('../../src/lib/hands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/hands')>()
  return { ...actual, subscribeEvents: (...args: unknown[]) => subscribeEvents(...args) }
})

const event = (overrides: Partial<PlayedCardEvent> = {}): PlayedCardEvent => ({
  id: 'e1',
  type: 'card_played',
  actorUid: 'dave',
  targetUid: 'jf',
  holeNumber: 7,
  cardId: 'no-look',
  atMillis: 1000,
  ...overrides,
})

/** Drives the mocked subscription. */
let emit: (events: PlayedCardEvent[]) => void = () => {}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  subscribeEvents.mockReset()
  subscribeEvents.mockImplementation((_roundId: string, onChange: (e: PlayedCardEvent[]) => void) => {
    emit = onChange
    return vi.fn()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCardNotices', () => {
  it('starts with nothing to show', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    expect(result.current.notices).toEqual([])
  })

  it('raises a notice for a card played on you', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    expect(result.current.notices).toHaveLength(1)
    expect(result.current.notices[0]).toMatchObject({
      id: 'e1',
      actorUid: 'dave',
      cardId: 'no-look',
      holeNumber: 7,
    })
  })

  it('ignores a card played on somebody else', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event({ targetUid: 'sam' })]))
    expect(result.current.notices).toEqual([])
  })

  it('ignores a card you played on yourself — that is not news', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event({ actorUid: 'jf', targetUid: 'jf' })]))
    expect(result.current.notices).toEqual([])
  })

  it('ignores untargeted plays', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event({ targetUid: null })]))
    expect(result.current.notices).toEqual([])
  })

  it('ignores events that are not card plays', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event({ type: 'round_started' })]))
    expect(result.current.notices).toEqual([])
  })

  it('drops a notice once acknowledged', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    expect(result.current.notices).toHaveLength(1)

    act(() => result.current.acknowledge('e1'))
    expect(result.current.notices).toEqual([])
  })

  it('keeps other notices when one is acknowledged', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event(), event({ id: 'e2', cardId: 'wrong-hand' })]))
    act(() => result.current.acknowledge('e1'))
    expect(result.current.notices.map((n) => n.id)).toEqual(['e2'])
  })

  it('does not resurrect an acknowledged notice when the feed updates again', () => {
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    act(() => result.current.acknowledge('e1'))
    // A later snapshot still contains the same event — it must stay dismissed.
    act(() => emit([event(), event({ id: 'e2' })]))
    expect(result.current.notices.map((n) => n.id)).toEqual(['e2'])
  })

  it('remembers acknowledgements across a remount, so a refresh does not re-nag', () => {
    const first = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    act(() => first.result.current.acknowledge('e1'))
    first.unmount()

    const second = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    expect(second.result.current.notices).toEqual([])
  })

  it('keeps each player’s acknowledgements separate', () => {
    const jf = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    act(() => jf.result.current.acknowledge('e1'))

    // Same round, different player: dave has not dismissed anything.
    // Note the actor must not be dave, or the hook correctly treats it as a card
    // he played on himself and stays quiet.
    const dave = renderHook(() => useCardNotices('round-1', 'dave'))
    act(() => emit([event({ actorUid: 'jf', targetUid: 'dave' })]))
    expect(dave.result.current.notices).toHaveLength(1)
  })

  it('does not carry notices from one round into the next', () => {
    const { result, rerender } = renderHook(
      ({ roundId }) => useCardNotices(roundId, 'jf'),
      { initialProps: { roundId: 'round-1' } },
    )
    act(() => emit([event()]))
    expect(result.current.notices).toHaveLength(1)

    rerender({ roundId: 'round-2' })
    // The new round's subscription has not delivered anything yet.
    expect(result.current.notices).toEqual([])
  })

  it('survives a browser with site data blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const { result } = renderHook(() => useCardNotices('round-1', 'jf'))
    act(() => emit([event()]))
    expect(result.current.notices).toHaveLength(1)
    // Acknowledging cannot persist, but must not throw and take the screen down.
    expect(() => act(() => result.current.acknowledge('e1'))).not.toThrow()
  })
})
