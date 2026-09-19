import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JoinRoundScreen } from '../../src/features/rounds/JoinRoundScreen'
import * as rounds from '../../src/lib/rounds'
import type { Round, RoundPlayer } from '../../src/lib/rounds'
import { renderWithAuth } from './support/renderWithAuth'

/*
 * Joining is where a round goes wrong in public: someone mishears a character,
 * a fifth person tries to get in, or a player turns up after the tee shot. Each
 * of those has to come back as a sentence that says what to do next, and none of
 * them may write to Firestore.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/rounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rounds')>()
  return {
    ...actual,
    findRoundByCode: vi.fn(),
    joinRound: vi.fn(),
    subscribePlayers: vi.fn(),
  }
})

const onJoined = vi.fn()
const onCancel = vi.fn()

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'lobby',
  roomCode: 'QF7K',
  createdBy: 'uid-host',
  settings: { cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
  ...overrides,
})

const playersIn = (...uids: string[]) => {
  const players: RoundPlayer[] = uids.map((uid, index) => ({
    uid,
    displayName: uid,
    order: index,
  }))
  vi.mocked(rounds.subscribePlayers).mockImplementation((_roundId, onChange) => {
    onChange(players)
    return vi.fn()
  })
}

const join = async (code: string) => {
  const user = userEvent.setup()
  renderWithAuth(<JoinRoundScreen onJoined={onJoined} onCancel={onCancel} />)
  await user.type(screen.getByLabelText('Room code'), code)
  await user.click(screen.getByRole('button', { name: 'Join round' }))
}

beforeEach(() => {
  vi.mocked(rounds.findRoundByCode).mockReset().mockResolvedValue(null)
  vi.mocked(rounds.joinRound).mockReset().mockResolvedValue(undefined)
  vi.mocked(rounds.subscribePlayers).mockReset()
  onJoined.mockReset()
  onCancel.mockReset()
  playersIn()
})

describe('JoinRoundScreen', () => {
  it('joins a round that has room and hands back its id', async () => {
    vi.mocked(rounds.findRoundByCode).mockResolvedValue(round())
    playersIn('uid-host')

    await join('qf7k')

    // Case-insensitive: the code is normalised before it is looked up.
    expect(rounds.findRoundByCode).toHaveBeenCalledWith('QF7K')
    expect(rounds.joinRound).toHaveBeenCalledWith('round-1', {
      uid: 'uid-jf',
      displayName: 'JF',
      avatar: undefined,
    })
    expect(onJoined).toHaveBeenCalledWith('round-1')
  })

  it('says so when the code matches nothing, and writes nothing', async () => {
    vi.mocked(rounds.findRoundByCode).mockResolvedValue(null)

    await join('ZZZZ')

    expect(await screen.findByRole('alert')).toHaveTextContent('No round with that code')
    expect(rounds.joinRound).not.toHaveBeenCalled()
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('refuses a fifth player', async () => {
    vi.mocked(rounds.findRoundByCode).mockResolvedValue(round())
    playersIn('uid-host', 'b', 'c', 'd')

    await join('QF7K')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That round is full — 4 players is the limit.',
    )
    expect(rounds.joinRound).not.toHaveBeenCalled()
  })

  it('refuses a stranger once the round has started', async () => {
    vi.mocked(rounds.findRoundByCode).mockResolvedValue(round({ status: 'in-progress' }))
    playersIn('uid-host', 'b')

    await join('QF7K')

    expect(await screen.findByRole('alert')).toHaveTextContent('already started')
    expect(rounds.joinRound).not.toHaveBeenCalled()
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('lets a player whose phone died back into the round they are already in', async () => {
    vi.mocked(rounds.findRoundByCode).mockResolvedValue(round({ status: 'in-progress' }))
    playersIn('uid-host', 'uid-jf')

    await join('QF7K')

    // Already on the team sheet: rejoining must not rewrite their playing order.
    expect(rounds.joinRound).not.toHaveBeenCalled()
    expect(onJoined).toHaveBeenCalledWith('round-1')
  })

  it('checks the code length before going near the network', async () => {
    await join('QF7')

    expect(await screen.findByRole('alert')).toHaveTextContent('Room codes are 4 characters.')
    expect(rounds.findRoundByCode).not.toHaveBeenCalled()
  })

  it('upper-cases the code as it is typed, so it matches what the host is reading out', async () => {
    const user = userEvent.setup()
    renderWithAuth(<JoinRoundScreen onJoined={onJoined} onCancel={onCancel} />)

    await user.type(screen.getByLabelText('Room code'), 'qf7k')

    expect(screen.getByLabelText('Room code')).toHaveValue('QF7K')
  })

  it('explains a failed lookup instead of leaving the player staring at a spinner', async () => {
    vi.mocked(rounds.findRoundByCode).mockRejectedValue(new Error('offline'))

    await join('QF7K')

    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(onJoined).not.toHaveBeenCalled()
  })
})
