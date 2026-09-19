import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistoryScreen } from '../../src/features/history/HistoryScreen'
import type { RoundHistoryEntry } from '../../src/features/history/historyData'
import * as historyData from '../../src/features/history/historyData'
import type { HoleScore, Round } from '../../src/lib/rounds'
import { renderWithAuth, testProfile } from './support/renderWithAuth'

/*
 * T-9.1 / T-9.2 - round history.
 *
 * The two things worth pinning down: an empty history has to read as "you have
 * not played yet" rather than as a broken screen, and the numbers on the list
 * have to be this player's, not the group's.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/features/history/historyData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/features/history/historyData')>()
  return { ...actual, loadPlayerHistory: vi.fn() }
})

const JF = 'uid-jf'
const BAZ = 'uid-baz'

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'complete',
  roomCode: 'PQ4T',
  createdBy: JF,
  settings: { cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
  ...overrides,
})

/** A three-hole par-4 round, so a to-par figure is obvious by inspection. */
const entry = (overrides: Partial<RoundHistoryEntry> = {}): RoundHistoryEntry => {
  const holes = [1, 2, 3].map((number) => ({ number, par: 4 }))
  const scores: HoleScore[] = [
    { uid: JF, hole: 1, strokes: 5 },
    { uid: JF, hole: 2, strokes: 4 },
    { uid: JF, hole: 3, strokes: 4 },
    { uid: BAZ, hole: 1, strokes: 9 },
  ]
  return {
    roundId: 'round-1',
    courseId: 'trangie',
    playedAt: Date.UTC(2026, 8, 12),
    holes,
    scores,
    round: round(),
    players: [
      { uid: JF, displayName: 'JF', order: 0 },
      { uid: BAZ, displayName: 'Barry', order: 1 },
    ],
    scorecardHoles: holes,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(historyData.loadPlayerHistory).mockReset().mockResolvedValue([])
})

describe('HistoryScreen', () => {
  it('invites a new player to go and play rather than showing a broken list', async () => {
    renderWithAuth(<HistoryScreen />, testProfile({ uid: JF }))

    expect(await screen.findByText(/no rounds yet/i)).toBeInTheDocument()
  })

  it('lists a round with this player’s own to-par, not the group’s', async () => {
    vi.mocked(historyData.loadPlayerHistory).mockResolvedValue([entry()])

    renderWithAuth(<HistoryScreen />, testProfile({ uid: JF }))

    // JF went 5-4-4 on three par 4s, so +1. Barry's 9 must not appear here.
    expect(await screen.findByText('+1')).toBeInTheDocument()
    expect(screen.getByText(/3 holes/)).toBeInTheDocument()
  })

  it('marks a round nobody has closed yet', async () => {
    vi.mocked(historyData.loadPlayerHistory).mockResolvedValue([
      entry({ round: round({ status: 'in-progress' }) }),
    ])

    renderWithAuth(<HistoryScreen />, testProfile({ uid: JF }))

    expect(await screen.findByText(/still open/)).toBeInTheDocument()
  })

  it('opens the full scorecard for a round', async () => {
    vi.mocked(historyData.loadPlayerHistory).mockResolvedValue([entry()])

    renderWithAuth(<HistoryScreen />, testProfile({ uid: JF }))

    await userEvent.click(await screen.findByRole('button', { name: /3 holes/ }))

    expect(await screen.findByRole('button', { name: /all rounds/i })).toBeInTheDocument()
    // Everyone's card is on show, which is the point of a scorecard.
    expect(screen.getByText('Barry')).toBeInTheDocument()
  })

  it('shows stats computed from the same rounds the list shows', async () => {
    vi.mocked(historyData.loadPlayerHistory).mockResolvedValue([entry()])

    renderWithAuth(<HistoryScreen />, testProfile({ uid: JF }))
    await screen.findByText('+1')

    await userEvent.click(screen.getByRole('tab', { name: 'Stats' }))

    expect(await screen.findByText('Best round')).toBeInTheDocument()
    expect(screen.getByText('Birdies')).toBeInTheDocument()
    // One round, three holes, one bogey and two pars — the same golf the list
    // just showed as +1.
    expect(screen.getByText('Bogeys').previousSibling).toHaveTextContent('1')
  })

  it('reports a failed load instead of pretending there is no golf', async () => {
    vi.mocked(historyData.loadPlayerHistory).mockRejectedValue(new Error('offline'))

    renderWithAuth(<HistoryScreen />, testProfile({ uid: JF }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
  })

  it('asks a signed-out visitor to sign in', () => {
    renderWithAuth(<HistoryScreen />, null)
    expect(screen.getByText(/sign in to see your rounds/i)).toBeInTheDocument()
  })
})
