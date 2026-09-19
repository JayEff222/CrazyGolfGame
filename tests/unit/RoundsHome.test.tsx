import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoundsHome } from '../../src/features/rounds/RoundsHome'
import { recallActiveRound, rememberActiveRound } from '../../src/features/rounds/activeRound'
import * as rounds from '../../src/lib/rounds'
import type { Round } from '../../src/lib/rounds'
import { renderWithAuth } from './support/renderWithAuth'
import { memoryStorage } from './support/memoryStorage'

/*
 * T-3.5 - the dead phone. A player who charges their phone at the turn should be
 * offered their round back, and should never be offered one that has finished or
 * been deleted.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/rounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rounds')>()
  return {
    ...actual,
    loadRound: vi.fn(),
    subscribeRound: vi.fn(),
    subscribePlayers: vi.fn(),
    findRoundByCode: vi.fn(),
    joinRound: vi.fn(),
    createRound: vi.fn(),
  }
})

vi.mock('../../src/lib/courseData', () => ({
  loadCourse: vi.fn(async (courseId: string) => ({
    courseId,
    name: 'Trangie Golf Club',
    holeCount: 18,
  })),
  loadHoles: vi.fn(async () => []),
}))

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'in-progress',
  roomCode: 'QF7K',
  createdBy: 'uid-jf',
  settings: { cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
  ...overrides,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.mocked(rounds.loadRound).mockReset().mockResolvedValue(null)
  vi.mocked(rounds.subscribeRound)
    .mockReset()
    .mockImplementation((_id, onChange) => {
      onChange(round())
      return vi.fn()
    })
  vi.mocked(rounds.subscribePlayers)
    .mockReset()
    .mockImplementation((_id, onChange) => {
      onChange([{ uid: 'uid-jf', displayName: 'JF', order: 0 }])
      return vi.fn()
    })
})

describe('RoundsHome', () => {
  it('offers the two ways into a round and nothing to rejoin on a fresh device', async () => {
    renderWithAuth(<RoundsHome />)

    expect(await screen.findByRole('button', { name: 'Start a round' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join a round' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rejoin round' })).not.toBeInTheDocument()
    expect(rounds.loadRound).not.toHaveBeenCalled()
  })

  it('offers the round back when the phone comes back to life mid-round', async () => {
    rememberActiveRound('uid-jf', 'round-1')
    vi.mocked(rounds.loadRound).mockResolvedValue(round())
    const user = userEvent.setup()
    renderWithAuth(<RoundsHome />)

    expect(await screen.findByText('Your round is still going')).toBeInTheDocument()
    expect(screen.getByText('QF7K')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rejoin round' }))

    expect(await screen.findByRole('heading', { name: 'Round in progress' })).toBeInTheDocument()
    expect(rounds.subscribeRound).toHaveBeenCalledWith('round-1', expect.any(Function))
  })

  it('does not offer a round that finished while the phone was flat', async () => {
    rememberActiveRound('uid-jf', 'round-1')
    vi.mocked(rounds.loadRound).mockResolvedValue(round({ status: 'complete' }))
    renderWithAuth(<RoundsHome />)

    expect(await screen.findByRole('button', { name: 'Start a round' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rejoin round' })).not.toBeInTheDocument()
    expect(recallActiveRound('uid-jf')).toBeNull()
  })

  it('forgets a round that no longer exists', async () => {
    rememberActiveRound('uid-jf', 'round-gone')
    vi.mocked(rounds.loadRound).mockResolvedValue(null)
    renderWithAuth(<RoundsHome />)

    await screen.findByRole('button', { name: 'Start a round' })
    expect(screen.queryByRole('button', { name: 'Rejoin round' })).not.toBeInTheDocument()
    expect(recallActiveRound('uid-jf')).toBeNull()
  })

  it('only offers a round to the player who was in it', async () => {
    // A shared phone: the round belongs to another sign-in.
    rememberActiveRound('uid-dave', 'round-1')
    renderWithAuth(<RoundsHome />)

    await screen.findByRole('button', { name: 'Start a round' })
    expect(rounds.loadRound).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Rejoin round' })).not.toBeInTheDocument()
  })

  it('lets a player dismiss a round they are finished with', async () => {
    rememberActiveRound('uid-jf', 'round-1')
    vi.mocked(rounds.loadRound).mockResolvedValue(round())
    const user = userEvent.setup()
    renderWithAuth(<RoundsHome />)

    await user.click(await screen.findByRole('button', { name: 'Not this one' }))

    expect(screen.queryByRole('button', { name: 'Rejoin round' })).not.toBeInTheDocument()
    expect(recallActiveRound('uid-jf')).toBeNull()
  })

  it('opens the join screen', async () => {
    const user = userEvent.setup()
    renderWithAuth(<RoundsHome />)

    await user.click(await screen.findByRole('button', { name: 'Join a round' }))

    expect(screen.getByLabelText('Room code')).toBeInTheDocument()
  })

  it('opens the create screen', async () => {
    const user = userEvent.setup()
    renderWithAuth(<RoundsHome />)

    await user.click(await screen.findByRole('button', { name: 'Start a round' }))

    expect(await screen.findByRole('heading', { name: 'New round' })).toBeInTheDocument()
  })

  it('asks a signed-out visitor to sign in first', () => {
    renderWithAuth(<RoundsHome />, null)

    expect(screen.getByText('Sign in to start a round.')).toBeInTheDocument()
  })
})
