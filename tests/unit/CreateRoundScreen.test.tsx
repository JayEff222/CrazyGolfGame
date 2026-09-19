import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateRoundScreen } from '../../src/features/rounds/CreateRoundScreen'
import * as rounds from '../../src/lib/rounds'
import type { Round } from '../../src/lib/rounds'
import { renderWithAuth } from './support/renderWithAuth'

/*
 * Setting up a round is the only chance to get the card settings right - they are
 * read by the dealer and never asked for again - so what this screen writes has to
 * be exactly what was tapped.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/rounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rounds')>()
  return { ...actual, createRound: vi.fn(), joinRound: vi.fn() }
})

const hole = (number: number, mens: number, ladies: number) => ({
  number,
  mens: { metres: mens, par: 4, strokeIndex: number },
  ladies: { metres: ladies, par: 4, strokeIndex: number },
  green: null,
  tee: null,
})

vi.mock('../../src/lib/courseData', () => ({
  loadCourse: vi.fn(async (courseId: string) => ({
    courseId,
    name: 'Trangie Golf Club',
    holeCount: 18,
  })),
  loadHoles: vi.fn(async () => [hole(1, 300, 250), hole(2, 400, 350)]),
}))

const { loadCatalogue } = vi.hoisted(() => ({ loadCatalogue: vi.fn() }))
vi.mock('../../src/lib/cardsData', () => ({ loadCatalogue }))

const onCreated = vi.fn()
const onCancel = vi.fn()

const created: Round = {
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'lobby',
  roomCode: 'QF7K',
  createdBy: 'uid-jf',
  settings: { cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
}

const openScreen = async () => {
  const user = userEvent.setup()
  renderWithAuth(<CreateRoundScreen onCreated={onCreated} onCancel={onCancel} />)
  // The course list comes from Firestore, so nothing can be chosen until it lands.
  await screen.findByRole('radio', { name: 'Trangie Golf Club' })
  return user
}

beforeEach(() => {
  vi.mocked(rounds.createRound).mockReset().mockResolvedValue(created)
  vi.mocked(rounds.joinRound).mockReset().mockResolvedValue(undefined)
  loadCatalogue.mockReset().mockResolvedValue({ cards: [], skipped: [] })
  onCreated.mockReset()
  onCancel.mockReset()
})

describe('CreateRoundScreen', () => {
  it('builds the course list from Firestore', async () => {
    await openScreen()

    const course = screen.getByRole('radio', { name: 'Trangie Golf Club' })
    expect(course).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('18 holes')).toBeInTheDocument()
  })

  it('shows each tee set with the length it plays', async () => {
    await openScreen()

    // Summed from the hole documents, so a tee choice is made against real numbers.
    expect(await screen.findByText('700 m')).toBeInTheDocument()
    expect(screen.getByText('600 m')).toBeInTheDocument()
  })

  it('creates a round with the defaults and puts the creator in it', async () => {
    const user = await openScreen()

    await user.click(screen.getByRole('button', { name: 'Create round' }))

    expect(rounds.createRound).toHaveBeenCalledWith({
      courseId: 'trangie',
      teeId: 'mens',
      createdBy: 'uid-jf',
      settings: {
        cardVisibility: 'secret',
        dealMode: 'even',
        // Nothing is dealt until a deck can be chosen (Phase 6).
        cardsPerPlayer: null,
        selectedCardIds: [],
      },
    })
    expect(rounds.joinRound).toHaveBeenCalledWith('round-1', {
      uid: 'uid-jf',
      displayName: 'JF',
      avatar: undefined,
    })
    expect(onCreated).toHaveBeenCalledWith('round-1')
  })

  it('writes the card settings that were tapped', async () => {
    const user = await openScreen()

    await user.click(screen.getByRole('radio', { name: 'Ladies’ tees' }))
    await user.click(screen.getByRole('radio', { name: 'Open hands' }))
    await user.click(screen.getByRole('radio', { name: 'Fixed number each' }))
    await user.click(screen.getByRole('button', { name: 'More cards' }))
    await user.click(screen.getByRole('button', { name: 'More cards' }))
    await user.click(screen.getByRole('button', { name: 'Create round' }))

    expect(rounds.createRound).toHaveBeenCalledWith(
      expect.objectContaining({
        teeId: 'ladies',
        settings: {
          cardVisibility: 'open',
          dealMode: 'fixed',
          cardsPerPlayer: 5,
          selectedCardIds: [],
        },
      }),
    )
  })

  it('only asks how many cards when the deal mode needs a number', async () => {
    const user = await openScreen()

    expect(screen.queryByRole('button', { name: 'More cards' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Fixed number each' }))
    expect(screen.getByRole('status')).toHaveTextContent('3')

    await user.click(screen.getByRole('radio', { name: 'Even split' }))
    expect(screen.queryByRole('button', { name: 'More cards' })).not.toBeInTheDocument()
  })

  it('stops the card count going below one', async () => {
    const user = await openScreen()

    await user.click(screen.getByRole('radio', { name: 'Fixed number each' }))
    await user.click(screen.getByRole('button', { name: 'Fewer cards' }))
    await user.click(screen.getByRole('button', { name: 'Fewer cards' }))
    await user.click(screen.getByRole('button', { name: 'Fewer cards' }))

    expect(screen.getByRole('status')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Fewer cards' })).toBeDisabled()
  })

  it('offers stroke play and is clear the other formats are not built', async () => {
    await openScreen()

    expect(screen.getByRole('radio', { name: 'Stroke play' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Stableford — not built yet')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Stableford' })).not.toBeInTheDocument()
  })

  it('does not claim card selection is still to come — it is right there', async () => {
    // The screen used to carry a note saying the deck picker "arrives with the
    // card catalogue (Phase 6)", sitting directly above the working picker.
    await openScreen()

    expect(screen.queryByText(/arrives with the card catalogue/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Phase \d/)).not.toBeInTheDocument()
  })

  it('reports cards it could not read rather than quietly counting fewer', async () => {
    // A card that fails to parse is otherwise invisible: the count above the
    // picker simply reads lower, with nothing on screen to explain it. That is
    // how the notes bug hid for a whole phase.
    loadCatalogue.mockResolvedValue({
      cards: [],
      skipped: [{ id: 'sandie', reason: 'notes: expected string' }],
    })

    await openScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /1 card could not be read and will not be dealt: sandie/i,
    )
  })

  it('explains a failure and does not pretend a round exists', async () => {
    const user = await openScreen()
    vi.mocked(rounds.createRound).mockRejectedValue(new Error('Could not allocate a room code. Try again.'))

    await user.click(screen.getByRole('button', { name: 'Create round' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not allocate a room code.')
    expect(rounds.joinRound).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
