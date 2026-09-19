import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useRoundScoring } from '../../src/features/scoring/useRoundScoring'
import {
  setScore,
  subscribePlayers,
  subscribeScores,
  type HoleScore,
  type RoundPlayer,
} from '../../src/lib/rounds'

/*
 * The hook is the only thing in the scoring feature that touches Firestore, so
 * this is where the write rule is worth proving: a player writes their own score
 * and cannot name anyone else. Firestore is stubbed - the rules themselves are
 * covered against the emulator in tests/rules.
 */

vi.mock('../../src/lib/rounds', () => ({
  setScore: vi.fn(),
  subscribePlayers: vi.fn(),
  subscribeScores: vi.fn(),
}))

const setScoreMock = vi.mocked(setScore)
const subscribePlayersMock = vi.mocked(subscribePlayers)
const subscribeScoresMock = vi.mocked(subscribeScores)

let emitPlayers: ((players: RoundPlayer[]) => void) | null = null
let emitScores: ((scores: HoleScore[]) => void) | null = null
const unsubscribePlayers = vi.fn()
const unsubscribeScores = vi.fn()

beforeEach(() => {
  emitPlayers = null
  emitScores = null
  unsubscribePlayers.mockReset()
  unsubscribeScores.mockReset()

  setScoreMock.mockReset().mockResolvedValue(undefined)
  subscribePlayersMock.mockReset().mockImplementation((_roundId, onChange) => {
    emitPlayers = onChange
    return unsubscribePlayers
  })
  subscribeScoresMock.mockReset().mockImplementation((_roundId, onChange) => {
    emitScores = onChange
    return unsubscribeScores
  })
})

const players: RoundPlayer[] = [
  { uid: 'jf', displayName: 'jayeff', order: 0 },
  { uid: 'dave', displayName: 'dave', order: 1 },
]

const load = (scores: HoleScore[] = []) => {
  act(() => {
    emitPlayers?.(players)
    emitScores?.(scores)
  })
}

const renderScoring = (roundId = 'round-1', uid = 'jf') =>
  renderHook(({ round, self }) => useRoundScoring(round, self), {
    initialProps: { round: roundId, self: uid },
  })

describe('useRoundScoring', () => {
  it('stays loading until both subscriptions have reported', () => {
    const { result } = renderScoring()
    expect(result.current.loading).toBe(true)

    act(() => emitPlayers?.(players))
    expect(result.current.loading).toBe(true)

    act(() => emitScores?.([]))
    expect(result.current.loading).toBe(false)
  })

  it('passes the live players and scores straight through', () => {
    const { result } = renderScoring()
    load([{ uid: 'dave', hole: 1, strokes: 4 }])

    expect(result.current.players).toEqual(players)
    expect(result.current.scores).toEqual([{ uid: 'dave', hole: 1, strokes: 4 }])
  })

  it('picks up a score entered on somebody else’s phone', () => {
    const { result } = renderScoring()
    load([])

    act(() => emitScores?.([{ uid: 'dave', hole: 1, strokes: 3 }]))
    expect(result.current.scores).toHaveLength(1)
  })

  it('writes the signed-in player’s score and nobody else’s', () => {
    const { result } = renderScoring('round-1', 'jf')
    load()

    act(() => result.current.saveScore(7, 5))

    expect(setScoreMock).toHaveBeenCalledWith(
      'round-1',
      { uid: 'jf', hole: 7, strokes: 5 },
      'jf',
    )
  })

  it('has no way to name another player, whatever the caller passes', () => {
    const { result } = renderScoring('round-1', 'jf')
    load()

    act(() => result.current.saveScore(1, 4))

    // The uid comes from the hook, not the call site - so a component bug cannot
    // produce a write that the security rules would reject.
    const written = setScoreMock.mock.calls[0]?.[1]
    expect(written?.uid).toBe('jf')
  })

  it('refuses to store a nonsense score', () => {
    const { result } = renderScoring()
    load()

    act(() => result.current.saveScore(1, 0))
    act(() => result.current.saveScore(2, 900))

    expect(setScoreMock.mock.calls[0]?.[1].strokes).toBe(1)
    expect(setScoreMock.mock.calls[1]?.[1].strokes).toBe(15)
  })

  it('does not block on the write, which offline never settles', () => {
    // Firestore queues an offline write and resolves it only on reconnect. If the
    // hook awaited that, a round played out of signal would sit on a spinner.
    setScoreMock.mockReturnValue(new Promise<void>(() => {}))
    const { result } = renderScoring()
    load()

    act(() => result.current.saveScore(1, 4))
    act(() => result.current.saveScore(2, 5))

    expect(setScoreMock).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it('explains a refused write in words, not an error code', async () => {
    setScoreMock.mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }),
    )
    const { result } = renderScoring()
    load()

    act(() => result.current.saveScore(1, 4))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toContain('you can only enter your own score')
    expect(result.current.error).not.toContain('permission-denied')
  })

  it('clears a previous failure when the next score goes in', async () => {
    setScoreMock.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderScoring()
    load()

    act(() => result.current.saveScore(1, 4))
    await waitFor(() => expect(result.current.error).not.toBeNull())

    act(() => result.current.saveScore(1, 5))
    expect(result.current.error).toBeNull()
  })

  it('lets go of both subscriptions when the screen closes', () => {
    const { unmount } = renderScoring()
    load()

    unmount()
    expect(unsubscribePlayers).toHaveBeenCalledTimes(1)
    expect(unsubscribeScores).toHaveBeenCalledTimes(1)
  })

  it('starts over when the round changes, rather than showing the last one’s card', () => {
    const { result, rerender } = renderScoring()
    load([{ uid: 'jf', hole: 1, strokes: 4 }])
    expect(result.current.scores).toHaveLength(1)

    rerender({ round: 'round-2', self: 'jf' })

    expect(result.current.loading).toBe(true)
    expect(result.current.scores).toHaveLength(0)
    expect(unsubscribeScores).toHaveBeenCalledTimes(1)
  })
})
