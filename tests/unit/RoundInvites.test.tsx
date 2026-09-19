import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoundInvites } from '../../src/features/friends/RoundInvites'
import type { RoundInvite } from '../../src/lib/roundInvites'
import type { Round, RoundPlayer } from '../../src/lib/rounds'
import * as invites from '../../src/lib/roundInvites'
import * as rounds from '../../src/lib/rounds'
import * as roundsData from '../../src/features/rounds/roundsData'
import { renderWithAuth, testProfile } from './support/renderWithAuth'

/*
 * Accepting an invitation.
 *
 * The rule that matters: an invitation is not a skeleton key. A round that
 * filled up, started or finished while the invite sat on somebody's phone has to
 * refuse it with the same message the room-code path would give — which is why
 * accepting runs `decideJoin` rather than a second set of conditions.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/roundInvites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/roundInvites')>()
  return { ...actual, loadMyInvites: vi.fn(), setInviteStatus: vi.fn() }
})

vi.mock('../../src/lib/rounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rounds')>()
  return { ...actual, loadRound: vi.fn(), joinRound: vi.fn() }
})

vi.mock('../../src/features/rounds/roundsData', () => ({ readPlayersOnce: vi.fn() }))

const JF = 'uid-jf'

const invite = (overrides: Partial<RoundInvite> = {}): RoundInvite => ({
  id: 'round-1_uid-jf',
  roundId: 'round-1',
  toUid: JF,
  fromUid: 'uid-dave',
  fromName: 'Big Dave',
  roomCode: 'QF7K',
  courseId: 'trangie',
  status: 'pending',
  at: 1000,
  ...overrides,
})

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'lobby',
  roomCode: 'QF7K',
  createdBy: 'uid-dave',
  settings: { cardVisibility: 'open', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
  ...overrides,
})

const player = (uid: string, order: number): RoundPlayer => ({
  uid,
  displayName: uid,
  order,
})

const onJoined = vi.fn()

beforeEach(() => {
  onJoined.mockReset()
  vi.mocked(invites.loadMyInvites).mockReset().mockResolvedValue([invite()])
  vi.mocked(invites.setInviteStatus).mockReset().mockResolvedValue(undefined)
  vi.mocked(rounds.loadRound).mockReset().mockResolvedValue(round())
  vi.mocked(rounds.joinRound).mockReset().mockResolvedValue(undefined)
  vi.mocked(roundsData.readPlayersOnce).mockReset().mockResolvedValue([player('uid-dave', 0)])
})

describe('RoundInvites', () => {
  it('shows nothing at all when there are no invitations', async () => {
    vi.mocked(invites.loadMyInvites).mockResolvedValue([])
    const { container } = renderWithAuth(
      <RoundInvites onJoined={onJoined} />,
      testProfile({ uid: JF }),
    )

    // An empty section with a heading would be clutter on the screen somebody
    // came to in order to start a round.
    expect(container).toBeEmptyDOMElement()
  })

  it('names who invited you and the room code', async () => {
    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))

    expect(await screen.findByText('Big Dave')).toBeInTheDocument()
    expect(screen.getByText('QF7K')).toBeInTheDocument()
  })

  it('joins the round and lands you in it', async () => {
    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }))

    expect(rounds.joinRound).toHaveBeenCalledWith('round-1', expect.objectContaining({ uid: JF }))
    expect(invites.setInviteStatus).toHaveBeenCalledWith('round-1', JF, 'accepted')
    expect(onJoined).toHaveBeenCalledWith('round-1')
  })

  it('marks the invite accepted only after the join actually succeeds', async () => {
    vi.mocked(rounds.joinRound).mockRejectedValue(new Error('offline'))
    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))

    await userEvent.click(await screen.findByRole('button', { name: 'Join' }))

    // Otherwise the invitation vanishes off their screen with nothing to show.
    expect(invites.setInviteStatus).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not join/i)
  })

  it('refuses a round that filled up while the invite was sitting there', async () => {
    vi.mocked(roundsData.readPlayersOnce).mockResolvedValue([
      player('a', 0),
      player('b', 1),
      player('c', 2),
      player('d', 3),
    ])

    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/full/i)
    expect(rounds.joinRound).not.toHaveBeenCalled()
  })

  it('refuses a round that has already started', async () => {
    vi.mocked(rounds.loadRound).mockResolvedValue(round({ status: 'in-progress' }))

    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already started/i)
    expect(rounds.joinRound).not.toHaveBeenCalled()
  })

  it('lets a player back into a round they are already on the sheet for', async () => {
    // The dead-phone case: invited, joined, phone died, invite still showing.
    vi.mocked(roundsData.readPlayersOnce).mockResolvedValue([player('uid-dave', 0), player(JF, 1)])

    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }))

    // No second join — they are already a player — but they still get in.
    expect(rounds.joinRound).not.toHaveBeenCalled()
    expect(onJoined).toHaveBeenCalledWith('round-1')
  })

  it('declines without joining', async () => {
    renderWithAuth(<RoundInvites onJoined={onJoined} />, testProfile({ uid: JF }))
    await userEvent.click(await screen.findByRole('button', { name: 'No thanks' }))

    expect(invites.setInviteStatus).toHaveBeenCalledWith('round-1', JF, 'declined')
    expect(rounds.joinRound).not.toHaveBeenCalled()
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('stays quiet when invitations cannot be loaded — the room code still works', async () => {
    vi.mocked(invites.loadMyInvites).mockRejectedValue(new Error('offline'))
    const { container } = renderWithAuth(
      <RoundInvites onJoined={onJoined} />,
      testProfile({ uid: JF }),
    )

    expect(container).toBeEmptyDOMElement()
  })
})
