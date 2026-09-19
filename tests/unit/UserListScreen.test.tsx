import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserListScreen } from '../../src/features/admin/UserListScreen'
import { byNewestSignup, type PlayerSummary } from '../../src/lib/users'
import * as users from '../../src/lib/users'

/*
 * T-2.4 (part) - the admin player list.
 *
 * Read-only by design: the password reset it was originally paired with cannot
 * be built on the client (REQUIREMENTS.md §3). What this list has to get right is
 * showing every account, including one created seconds ago whose server
 * timestamp has not settled - that is the account an admin is looking for.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/users')>()
  return { ...actual, listPlayers: vi.fn(), isAdminUser: vi.fn() }
})

const summary = (overrides: Partial<PlayerSummary> = {}): PlayerSummary => ({
  uid: 'uid-jf',
  username: 'jf',
  displayName: 'JF',
  createdAt: Date.UTC(2026, 8, 1),
  ...overrides,
})

/*
 * The initials badge beside each row is decorative and spells out the first two
 * letters of the same name, so a plain getByText('JF') matches twice. Queries
 * skip aria-hidden nodes, which is also the thing a screen reader does.
 */
const findPlayer = (name: string) => screen.findByText(name, { ignore: '[aria-hidden="true"]' })
const getPlayer = (name: string) => screen.getByText(name, { ignore: '[aria-hidden="true"]' })

beforeEach(() => {
  vi.mocked(users.listPlayers).mockReset()
  vi.mocked(users.isAdminUser).mockReset().mockResolvedValue(false)
})

describe('byNewestSignup', () => {
  it('puts the most recent signup first', () => {
    const older = summary({ username: 'older', createdAt: 1000 })
    const newer = summary({ username: 'newer', createdAt: 5000 })
    expect([older, newer].sort(byNewestSignup)).toEqual([newer, older])
  })

  it('sorts an unsettled server timestamp to the very top', () => {
    // A null createdAt is a signup from moments ago on this device. Sorting it
    // last - or dropping it, as orderBy would - hides the new account.
    const settled = summary({ username: 'settled', createdAt: 9_999_999 })
    const pending = summary({ username: 'pending', createdAt: null })
    expect([settled, pending].sort(byNewestSignup)).toEqual([pending, settled])
  })

  it('breaks a tie on username so the order is stable', () => {
    const bravo = summary({ username: 'bravo', createdAt: 1000 })
    const alpha = summary({ username: 'alpha', createdAt: 1000 })
    expect([bravo, alpha].sort(byNewestSignup)).toEqual([alpha, bravo])
  })
})

describe('UserListScreen', () => {
  it('lists every account with its username and join date', async () => {
    vi.mocked(users.listPlayers).mockResolvedValue([
      summary({ uid: 'uid-jf', username: 'jf', displayName: 'JF' }),
      summary({ uid: 'uid-baz', username: 'baz', displayName: 'Barry' }),
    ])

    render(<UserListScreen />)

    expect(await findPlayer('JF')).toBeInTheDocument()
    expect(getPlayer('Barry')).toBeInTheDocument()
    expect(screen.getByText(/2 accounts/)).toBeInTheDocument()
  })

  it('says "Just now" for a signup whose timestamp has not settled', async () => {
    vi.mocked(users.listPlayers).mockResolvedValue([summary({ createdAt: null })])

    render(<UserListScreen />)

    expect(await screen.findByText(/Just now/)).toBeInTheDocument()
  })

  it('marks who holds the keys', async () => {
    vi.mocked(users.listPlayers).mockResolvedValue([
      summary({ uid: 'uid-jf', username: 'jf', displayName: 'JF' }),
      summary({ uid: 'uid-baz', username: 'baz', displayName: 'Barry' }),
    ])
    vi.mocked(users.isAdminUser).mockImplementation(async (uid) => uid === 'uid-jf')

    render(<UserListScreen />)

    expect(await screen.findByText('Admin')).toBeInTheDocument()
    expect(screen.getAllByText('Admin')).toHaveLength(1)
  })

  it('offers no way to reset a password, because the client cannot', async () => {
    vi.mocked(users.listPlayers).mockResolvedValue([summary()])

    render(<UserListScreen />)
    await findPlayer('JF')

    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })

  it('reports a failed load rather than showing an empty list', async () => {
    vi.mocked(users.listPlayers).mockRejectedValue(new Error('offline'))

    render(<UserListScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
  })

  it('says so plainly when nobody has signed up', async () => {
    vi.mocked(users.listPlayers).mockResolvedValue([])

    render(<UserListScreen />)

    expect(await screen.findByText(/nobody has signed up yet/i)).toBeInTheDocument()
  })

  it('re-reads the list on refresh, so a new signup appears', async () => {
    vi.mocked(users.listPlayers)
      .mockResolvedValueOnce([summary()])
      .mockResolvedValueOnce([summary(), summary({ uid: 'uid-new', username: 'newbie', displayName: 'Newbie' })])

    render(<UserListScreen />)
    await findPlayer('JF')

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await findPlayer('Newbie')).toBeInTheDocument()
  })
})
