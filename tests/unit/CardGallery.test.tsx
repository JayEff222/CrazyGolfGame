import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardGallery } from '../../src/features/cards/CardGallery'
import type { Card } from '../../src/lib/cards'
import * as cardsData from '../../src/lib/cardsData'
import * as cardVotes from '../../src/lib/cardVotes'
import * as suggestions from '../../src/lib/cardSuggestions'
import { renderWithAuth, testProfile } from './support/renderWithAuth'
import { memoryStorage } from './support/memoryStorage'

/*
 * The deck as every player sees it: the rules, a thumb each way, and a route to
 * writing your own card.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/cardsData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/cardsData')>()
  return { ...actual, loadCatalogue: vi.fn() }
})

vi.mock('../../src/lib/cardVotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/cardVotes')>()
  return { ...actual, loadVoteTallies: vi.fn(), castVote: vi.fn() }
})

vi.mock('../../src/lib/cardSuggestions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/cardSuggestions')>()
  return { ...actual, listMySuggestions: vi.fn(), suggestCard: vi.fn() }
})

const card = (id: string, overrides: Partial<Card> = {}): Card => ({
  id,
  title: `Card ${id}`,
  effect: 'Spell the rule out properly so that three people can agree on it.',
  category: 'boost',
  timing: 'anytime',
  target: 'self',
  active: true,
  ...overrides,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.mocked(cardsData.loadCatalogue).mockReset().mockResolvedValue({ cards: [card('a')], skipped: [] })
  vi.mocked(cardVotes.loadVoteTallies).mockReset().mockResolvedValue(new Map())
  vi.mocked(cardVotes.castVote).mockReset().mockResolvedValue(undefined)
  vi.mocked(suggestions.listMySuggestions).mockReset().mockResolvedValue([])
  vi.mocked(suggestions.suggestCard).mockReset().mockResolvedValue('new-id')
})

describe('CardGallery', () => {
  it('shows the full rule text, because that is the mechanism', async () => {
    renderWithAuth(<CardGallery />)

    expect(
      await screen.findByText('Spell the rule out properly so that three people can agree on it.'),
    ).toBeInTheDocument()
  })

  it('leaves deactivated cards out of the deck view', async () => {
    vi.mocked(cardsData.loadCatalogue).mockResolvedValue({
      cards: [card('a'), card('b', { title: 'Retired', active: false })],
      skipped: [],
    })

    renderWithAuth(<CardGallery />)
    await screen.findByText('Card a')

    expect(screen.queryByText('Retired')).not.toBeInTheDocument()
    expect(screen.getByText(/1 cards in play/)).toBeInTheDocument()
  })

  it('records a thumbs up and moves the count straight away', async () => {
    renderWithAuth(<CardGallery />)
    const up = await screen.findByRole('button', { name: /thumbs up for Card a/i })

    expect(up).toHaveTextContent('0')
    await userEvent.click(up)

    expect(cardVotes.castVote).toHaveBeenCalledWith('a', 'uid-jf', 'up')
    // Updated on tap, not after the round trip — out of signal there may not be one.
    expect(up).toHaveTextContent('1')
    expect(up).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves both counts when a vote switches sides', async () => {
    vi.mocked(cardVotes.loadVoteTallies).mockResolvedValue(
      new Map([['a', { up: 3, down: 1, mine: 'up' as const }]]),
    )
    renderWithAuth(<CardGallery />)

    const down = await screen.findByRole('button', { name: /thumbs down for Card a/i })
    await userEvent.click(down)

    expect(down).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /thumbs up for Card a/i })).toHaveTextContent('2')
  })

  it('clears a vote when the same thumb is tapped twice', async () => {
    renderWithAuth(<CardGallery />)
    const up = await screen.findByRole('button', { name: /thumbs up for Card a/i })

    await userEvent.click(up)
    await userEvent.click(up)

    expect(cardVotes.castVote).toHaveBeenLastCalledWith('a', 'uid-jf', null)
    expect(up).toHaveTextContent('0')
  })

  it('reports a card that could not be read rather than dropping it silently', async () => {
    // The notes bug, surfaced. Previously an unreadable card just vanished.
    vi.mocked(cardsData.loadCatalogue).mockResolvedValue({
      cards: [card('a')],
      skipped: [{ id: 'broken', reason: 'category: bad' }],
    })

    renderWithAuth(<CardGallery />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/1 card could not be read: broken/i)
  })

  it('sends a suggested card and says so', async () => {
    renderWithAuth(<CardGallery />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest a card' }))

    await userEvent.type(screen.getByLabelText('Card name'), 'Two Club Special')
    await userEvent.type(
      screen.getByLabelText('The rule'),
      'Play the whole hole using only two clubs of your own choosing.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send it to JF' }))

    expect(suggestions.suggestCard).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Two Club Special' }),
      'uid-jf',
      'JF',
    )
    expect(await screen.findByText(/JF will have a look at it/i)).toBeInTheDocument()
  })

  it('refuses a rule too short to settle an argument', async () => {
    renderWithAuth(<CardGallery />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest a card' }))

    await userEvent.type(screen.getByLabelText('Card name'), 'Freebie')
    await userEvent.type(screen.getByLabelText('The rule'), 'Free shot.')
    await userEvent.click(screen.getByRole('button', { name: 'Send it to JF' }))

    expect(screen.getByText(/spell the rule out/i)).toBeInTheDocument()
    expect(suggestions.suggestCard).not.toHaveBeenCalled()
  })

  it('tells a player their card was accepted', async () => {
    vi.mocked(suggestions.listMySuggestions).mockResolvedValue([
      {
        id: 's1',
        card: card('mine', { title: 'My Card' }),
        suggestedBy: 'uid-jf',
        suggestedByName: 'JF',
        status: 'accepted',
        at: 1000,
      },
    ])

    renderWithAuth(<CardGallery />)

    expect(await screen.findByText(/“My Card” is in the deck/)).toBeInTheDocument()
  })

  it('tells a player why their card was turned down, and stops once dismissed', async () => {
    vi.mocked(suggestions.listMySuggestions).mockResolvedValue([
      {
        id: 's1',
        card: card('mine', { title: 'My Card' }),
        suggestedBy: 'uid-jf',
        suggestedByName: 'JF',
        status: 'rejected',
        reason: 'Too strong on the green.',
        at: 1000,
      },
    ])

    renderWithAuth(<CardGallery />)

    expect(await screen.findByText(/“My Card” was not taken up/)).toBeInTheDocument()
    expect(screen.getByText('Too strong on the green.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText(/was not taken up/)).not.toBeInTheDocument()
  })

  it('offers the review queue to an admin only', async () => {
    const onReview = vi.fn()
    renderWithAuth(<CardGallery onReviewSuggestions={onReview} />)
    await screen.findByText('Card a')

    // renderWithAuth stubs isAdmin false, so the prop alone must not be enough.
    expect(screen.queryByRole('button', { name: 'Review suggestions' })).not.toBeInTheDocument()
  })

  it('asks a signed-out visitor to sign in', () => {
    renderWithAuth(<CardGallery />, null)
    expect(screen.getByText(/sign in to see the deck/i)).toBeInTheDocument()
  })

  it('reports a failed load instead of showing an empty deck', async () => {
    vi.mocked(cardsData.loadCatalogue).mockRejectedValue(new Error('offline'))

    renderWithAuth(<CardGallery />, testProfile())

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the deck/i)
  })
})
