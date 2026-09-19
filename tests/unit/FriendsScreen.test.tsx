import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FriendsScreen } from '../../src/features/friends/FriendsScreen'
import type { PlayerSummary } from '../../src/lib/users'
import * as users from '../../src/lib/users'
import * as friends from '../../src/lib/friends'
import { pairId, pairMembers, type Friendship } from '../../src/lib/friends'
import { renderWithAuth, testProfile } from './support/renderWithAuth'

/*
 * Finding people and adding them.
 *
 * The behaviours JF asked for by name: an empty search box lists everyone, and a
 * search matches anywhere in a username rather than only at the start.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/users')>()
  return { ...actual, listPlayers: vi.fn() }
})

vi.mock('../../src/lib/friends', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/friends')>()
  return {
    ...actual,
    loadFriendships: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    removeFriendship: vi.fn(),
  }
})

const JF = 'uid-jf'
const DAVE = 'uid-dave'
const STEVE = 'uid-steve'

const player = (uid: string, username: string, displayName: string): PlayerSummary => ({
  uid,
  username,
  displayName,
  createdAt: 1000,
})

const EVERYONE = [
  player(JF, 'jayeff', 'JF'),
  player(DAVE, 'bigdave', 'Big Dave'),
  player(STEVE, 'steve', 'Stevo'),
]

const friendship = (a: string, b: string, overrides: Partial<Friendship> = {}): Friendship => ({
  id: pairId(a, b),
  members: pairMembers(a, b),
  requestedBy: a,
  status: 'pending',
  at: 1000,
  ...overrides,
})

/** The row buttons repeat the name, so queries skip the decorative initials. */
const findPlayer = (name: string) => screen.findByText(name, { ignore: '[aria-hidden="true"]' })

beforeEach(() => {
  vi.mocked(users.listPlayers).mockReset().mockResolvedValue(EVERYONE)
  vi.mocked(friends.loadFriendships).mockReset().mockResolvedValue([])
  vi.mocked(friends.sendFriendRequest).mockReset().mockResolvedValue(undefined)
  vi.mocked(friends.acceptFriendRequest).mockReset().mockResolvedValue(undefined)
  vi.mocked(friends.removeFriendship).mockReset().mockResolvedValue(undefined)
})

describe('FriendsScreen', () => {
  it('lists everyone when nothing has been typed', async () => {
    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))

    expect(await findPlayer('Big Dave')).toBeInTheDocument()
    expect(await findPlayer('Stevo')).toBeInTheDocument()
  })

  it('never lists you — there is nothing to do with yourself', async () => {
    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))
    await findPlayer('Big Dave')

    expect(screen.queryByText('jayeff')).not.toBeInTheDocument()
  })

  it('matches a username from the middle, not just the start', async () => {
    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))
    await findPlayer('Big Dave')

    // Firestore can only do prefix ranges; this is why the filter is in memory.
    await userEvent.type(screen.getByLabelText('Search'), 'dave')

    expect(await findPlayer('Big Dave')).toBeInTheDocument()
    expect(screen.queryByText('Stevo')).not.toBeInTheDocument()
  })

  it('says so plainly when a search matches nobody', async () => {
    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))
    await findPlayer('Big Dave')

    await userEvent.type(screen.getByLabelText('Search'), 'zzzz')

    expect(await screen.findByText(/nobody matching/i)).toBeInTheDocument()
  })

  it('sends a friend request', async () => {
    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))
    await findPlayer('Big Dave')

    const rows = screen.getAllByRole('button', { name: 'Add' })
    await userEvent.click(rows[0]!)

    expect(friends.sendFriendRequest).toHaveBeenCalledWith(JF, expect.any(String))
  })

  it('shows a request you have already sent as pending, not as Add again', async () => {
    vi.mocked(friends.loadFriendships).mockResolvedValue([
      friendship(JF, DAVE, { requestedBy: JF }),
    ])

    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))

    expect(await screen.findByRole('button', { name: /asked — cancel/i })).toBeInTheDocument()
  })

  it('puts a request waiting on you at the top, and accepts it', async () => {
    vi.mocked(friends.loadFriendships).mockResolvedValue([
      friendship(JF, DAVE, { requestedBy: DAVE }),
    ])

    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))

    expect(await screen.findByText(/waiting on you \(1\)/i)).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]!)
    expect(friends.acceptFriendRequest).toHaveBeenCalledWith(JF, DAVE)
  })

  it('lets you ignore a request rather than leaving it hanging', async () => {
    vi.mocked(friends.loadFriendships).mockResolvedValue([
      friendship(JF, DAVE, { requestedBy: DAVE }),
    ])

    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ignore' }))

    expect(friends.removeFriendship).toHaveBeenCalledWith(JF, DAVE)
  })

  it('marks an existing friend as such', async () => {
    vi.mocked(friends.loadFriendships).mockResolvedValue([
      friendship(JF, DAVE, { status: 'accepted' }),
    ])

    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))

    expect(await screen.findByRole('button', { name: /mates/i })).toBeInTheDocument()
  })

  it('reports a failed load instead of showing an empty app', async () => {
    vi.mocked(users.listPlayers).mockRejectedValue(new Error('offline'))

    renderWithAuth(<FriendsScreen />, testProfile({ uid: JF }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
  })

  it('asks a signed-out visitor to sign in', () => {
    renderWithAuth(<FriendsScreen />, null)
    expect(screen.getByText(/sign in to find your mates/i)).toBeInTheDocument()
  })
})
