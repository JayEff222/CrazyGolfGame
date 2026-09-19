import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LobbyScreen } from '../../src/features/rounds/LobbyScreen'
import * as rounds from '../../src/lib/rounds'
import type { Round, RoundPlayer } from '../../src/lib/rounds'
import { renderWithAuth, testProfile } from './support/renderWithAuth'

/*
 * The lobby is the last screen before anyone hits a ball, and the one place where
 * "who is allowed to press this" matters: only the player who set the round up
 * starts it, and only once there are enough players.
 */

/*
 * The in-progress round renders the whole scoring stack, which is covered by its
 * own tests. Stubbing it here keeps these tests about lobby behaviour - which
 * view is shown, who may start - rather than dragging Firestore subscriptions
 * into a test about a player list.
 */
vi.mock('../../src/features/rounds/InProgressRound', () => ({
  InProgressRound: ({ selfUid }: { selfUid: string }) => (
    <div data-testid="in-progress-round">playing as {selfUid}</div>
  ),
}))

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/rounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rounds')>()
  return {
    ...actual,
    subscribeRound: vi.fn(),
    subscribePlayers: vi.fn(),
    setRoundStatus: vi.fn(),
    recordEvent: vi.fn(),
    leaveRound: vi.fn(),
  }
})

vi.mock('../../src/lib/courseData', () => ({
  loadCourse: vi.fn(async () => ({ courseId: 'trangie', name: 'Trangie Golf Club', holeCount: 18 })),
  loadHoles: vi.fn(async () => []),
}))

const onExit = vi.fn()

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'lobby',
  roomCode: 'QF7K',
  createdBy: 'uid-jf',
  settings: { cardVisibility: 'open', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
  ...overrides,
})

const player = (uid: string, displayName: string, order: number): RoundPlayer => ({
  uid,
  displayName,
  order,
})

const showLobby = (current: Round | null, players: RoundPlayer[], asUid = 'uid-jf') => {
  vi.mocked(rounds.subscribeRound).mockImplementation((_id, onChange) => {
    onChange(current)
    return vi.fn()
  })
  vi.mocked(rounds.subscribePlayers).mockImplementation((_id, onChange) => {
    onChange(players)
    return vi.fn()
  })
  return renderWithAuth(
    <LobbyScreen roundId="round-1" onExit={onExit} />,
    testProfile({ uid: asUid, displayName: asUid === 'uid-jf' ? 'JF' : 'Dave' }),
  )
}

beforeEach(() => {
  vi.mocked(rounds.setRoundStatus).mockReset().mockResolvedValue(undefined)
  vi.mocked(rounds.recordEvent).mockReset().mockResolvedValue(undefined)
  vi.mocked(rounds.leaveRound).mockReset().mockResolvedValue(undefined)
  onExit.mockReset()
})

describe('LobbyScreen', () => {
  it('shows the room code and everyone who has joined', async () => {
    showLobby(round(), [player('uid-jf', 'JF', 0), player('uid-dave', 'Dave', 1)])

    expect(await screen.findByText('QF7K')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Players 2 of 4' })).toBeInTheDocument()
    expect(screen.getByText('JF')).toBeInTheDocument()
    expect(screen.getByText('Dave')).toBeInTheDocument()
    expect(screen.getByText('Host')).toBeInTheDocument()
  })

  it('starts the round and records it in the audit trail', async () => {
    const user = userEvent.setup()
    showLobby(round(), [player('uid-jf', 'JF', 0), player('uid-dave', 'Dave', 1)])

    await user.click(await screen.findByRole('button', { name: 'Start round' }))

    expect(rounds.setRoundStatus).toHaveBeenCalledWith('round-1', 'in-progress')
    expect(rounds.recordEvent).toHaveBeenCalledWith('round-1', {
      type: 'round_started',
      actorUid: 'uid-jf',
    })
  })

  it('will not let a player who did not set the round up start it', async () => {
    showLobby(round(), [player('uid-jf', 'JF', 0), player('uid-dave', 'Dave', 1)], 'uid-dave')

    expect(await screen.findByText('Waiting for JF to start the round.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start round' })).not.toBeInTheDocument()
    expect(rounds.setRoundStatus).not.toHaveBeenCalled()
  })

  it('holds the start button until there are two players', async () => {
    const user = userEvent.setup()
    showLobby(round(), [player('uid-jf', 'JF', 0)])

    const start = await screen.findByRole('button', { name: 'Start round' })
    expect(start).toBeDisabled()
    expect(screen.getByText('Waiting for players — 1 in, 2 needed.')).toBeInTheDocument()

    await user.click(start)
    expect(rounds.setRoundStatus).not.toHaveBeenCalled()
  })

  it('shows a round that is already under way instead of offering to start it again', async () => {
    showLobby(round({ status: 'in-progress' }), [
      player('uid-jf', 'JF', 0),
      player('uid-dave', 'Dave', 1),
    ])

    expect(await screen.findByRole('heading', { name: 'Round in progress' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start round' })).not.toBeInTheDocument()
    // The lobby hands over to the scoring view rather than a placeholder.
    expect(await screen.findByTestId('in-progress-round')).toBeInTheDocument()
  })

  it('shows the card settings the round was created with', async () => {
    showLobby(
      round({
        settings: {
          cardVisibility: 'secret',
          dealMode: 'fixed',
          cardsPerPlayer: 4,
          selectedCardIds: [],
        },
      }),
      [player('uid-jf', 'JF', 0), player('uid-dave', 'Dave', 1)],
    )

    expect(await screen.findByText('Secret hands · 4 cards each')).toBeInTheDocument()
  })

  it('names the course rather than its id', async () => {
    showLobby(round(), [player('uid-jf', 'JF', 0)])

    expect(await screen.findByText(/Trangie Golf Club · Men’s tees · Stroke play/)).toBeInTheDocument()
  })

  it('asks before leaving, then leaves', async () => {
    const user = userEvent.setup()
    showLobby(round(), [player('uid-jf', 'JF', 0), player('uid-dave', 'Dave', 1)])

    await user.click(await screen.findByRole('button', { name: 'Leave round' }))
    expect(rounds.leaveRound).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, leave' }))
    expect(rounds.leaveRound).toHaveBeenCalledWith('round-1', 'uid-jf')
    expect(onExit).toHaveBeenCalled()
  })

  it('says so when the round has been deleted out from under it', async () => {
    showLobby(null, [])

    expect(await screen.findByRole('alert')).toHaveTextContent('That round no longer exists.')
  })

  it('surfaces a failure to start rather than pretending it worked', async () => {
    const user = userEvent.setup()
    vi.mocked(rounds.setRoundStatus).mockRejectedValue(new Error('no signal'))
    showLobby(round(), [player('uid-jf', 'JF', 0), player('uid-dave', 'Dave', 1)])

    await user.click(await screen.findByRole('button', { name: 'Start round' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no signal')
    expect(rounds.recordEvent).not.toHaveBeenCalled()
  })
})
