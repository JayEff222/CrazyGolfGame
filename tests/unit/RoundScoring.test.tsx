import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoundScoring } from '../../src/features/scoring/RoundScoring'
import type { ScorecardHole } from '../../src/features/scoring/scorecardTotals'
import {
  setScore,
  subscribePlayers,
  subscribeScores,
  type HoleScore,
  type RoundPlayer,
} from '../../src/lib/rounds'

/*
 * The scoring stack wired to a (stubbed) live round - T-4.2 end to end: tap a
 * score, the right document gets written, and a score entered on another phone
 * turns up here without a reload.
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

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const holes: ScorecardHole[] = PARS.map((par, index) => ({ number: index + 1, par }))

const players: RoundPlayer[] = [
  { uid: 'jf', displayName: 'jayeff', order: 0 },
  { uid: 'dave', displayName: 'dave', order: 1 },
]

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

const renderRound = (props: Partial<Parameters<typeof RoundScoring>[0]> = {}) =>
  render(<RoundScoring roundId="round-1" selfUid="jf" holes={holes} {...props} />)

const load = (scores: HoleScore[] = []) => {
  act(() => {
    emitPlayers?.(players)
    emitScores?.(scores)
  })
}

const others = () => within(screen.getByRole('list', { name: 'Other players on this hole' }))

describe('RoundScoring', () => {
  it('waits for the round before showing a card', () => {
    renderRound()
    expect(screen.getByText('Loading the card…')).toBeInTheDocument()

    load()
    expect(screen.queryByText('Loading the card…')).not.toBeInTheDocument()
  })

  it('shows the hole, your entry, the group and the leaderboard together', () => {
    renderRound()
    load()

    expect(screen.getByText('Hole 1')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your score for hole 1, par 4' })).toBeInTheDocument()
    expect(others().getByText('dave')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'To par' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Thru' })).toBeInTheDocument()
  })

  it('writes the signed-in player’s own score for the hole on screen', async () => {
    const user = userEvent.setup()
    renderRound()
    load()

    await user.click(screen.getByRole('button', { name: 'Score 5, bogey' }))

    expect(setScoreMock).toHaveBeenCalledWith('round-1', { uid: 'jf', hole: 1, strokes: 5 }, 'jf')
  })

  it('opens on the hole you still owe a score for, so a rejoin lands in the right place', () => {
    renderRound()
    load([
      { uid: 'jf', hole: 1, strokes: 5 },
      { uid: 'jf', hole: 2, strokes: 4 },
    ])

    expect(screen.getByText('Hole 3')).toBeInTheDocument()
  })

  it('stays on the hole once you have scored it, instead of jumping ahead', async () => {
    const user = userEvent.setup()
    renderRound()
    load()

    await user.click(screen.getByRole('button', { name: 'Score 5, bogey' }))
    act(() => emitScores?.([{ uid: 'jf', hole: 1, strokes: 5 }]))

    expect(screen.getByText('Hole 1')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('5')).toBeInTheDocument()
  })

  it('shows a score entered on another player’s phone, with no reload', () => {
    renderRound()
    load()
    expect(others().getByText('Not in yet')).toBeInTheDocument()

    act(() => emitScores?.([{ uid: 'dave', hole: 1, strokes: 3 }]))

    expect(others().getByText('3')).toBeInTheDocument()
    expect(others().getByText('Birdie')).toBeInTheDocument()
  })

  it('offers nothing that would write another player’s score', () => {
    renderRound()
    load([{ uid: 'dave', hole: 1, strokes: 6 }])

    expect(others().queryAllByRole('button')).toHaveLength(0)
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-label') ?? '').not.toMatch(/dave/i)
    }
  })

  it('scores a hole you have jumped to', async () => {
    const user = userEvent.setup()
    renderRound()
    load()

    await user.click(screen.getByRole('button', { name: 'Hole 5' }))
    expect(screen.getByRole('region', { name: 'Your score for hole 5, par 4' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Score 4, par' }))
    expect(setScoreMock).toHaveBeenCalledWith('round-1', { uid: 'jf', hole: 5, strokes: 4 }, 'jf')
  })

  it('edits a hole played earlier, from the full scorecard', async () => {
    const user = userEvent.setup()
    renderRound()
    load([
      { uid: 'jf', hole: 1, strokes: 5 },
      { uid: 'jf', hole: 2, strokes: 5 },
      { uid: 'jf', hole: 3, strokes: 4 },
    ])

    await user.click(screen.getByRole('button', { name: 'Full scorecard' }))
    await user.click(screen.getByRole('button', { name: 'Edit your score of 5 for hole 2' }))

    const stepper = screen.getByRole('region', { name: 'Your score for hole 2, par 4' })
    await user.click(within(stepper).getByRole('button', { name: 'Score 6, double bogey' }))

    expect(setScoreMock).toHaveBeenLastCalledWith(
      'round-1',
      { uid: 'jf', hole: 2, strokes: 6 },
      'jf',
    )
  })

  it('follows a hole driven from outside, for GPS auto-detection', () => {
    const { rerender } = renderRound({ currentHole: 3 })
    load()
    expect(screen.getByRole('region', { name: 'Your score for hole 3, par 3' })).toBeInTheDocument()

    rerender(<RoundScoring roundId="round-1" selfUid="jf" holes={holes} currentHole={11} />)
    expect(screen.getByRole('region', { name: 'Your score for hole 11, par 4' })).toBeInTheDocument()
  })

  it('reports a manual hole change back, so GPS can stand down', async () => {
    const user = userEvent.setup()
    const onHoleChange = vi.fn()
    renderRound({ onHoleChange })
    load()

    await user.click(screen.getByRole('button', { name: 'Next hole' }))
    expect(onHoleChange).toHaveBeenCalledWith(2)
  })

  it('explains a refused write where the player can see it', async () => {
    const user = userEvent.setup()
    setScoreMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'permission-denied' }),
    )
    renderRound()
    load()

    await user.click(screen.getByRole('button', { name: 'Score 4, par' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('you can only enter your own score'),
    )
  })

  it('lets go of the round when it closes', () => {
    const { unmount } = renderRound()
    load()

    unmount()
    expect(unsubscribePlayers).toHaveBeenCalledTimes(1)
    expect(unsubscribeScores).toHaveBeenCalledTimes(1)
  })
})
