import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { SuggestionReview } from '../../src/features/cards/SuggestionReview'
import { AuthContext, type AuthState } from '../../src/features/auth/AuthContext'
import type { Card } from '../../src/lib/cards'
import * as suggestions from '../../src/lib/cardSuggestions'
import type { CardSuggestion } from '../../src/lib/cardSuggestions'

/*
 * The admin deciding on cards other people wrote.
 *
 * Two things have to hold: only an admin sees it, and a rejection carries a
 * reason — a card turned down in silence reads as the app losing it, and the
 * point of the feature is that people keep writing them.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/cardSuggestions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/cardSuggestions')>()
  return {
    ...actual,
    listPendingSuggestions: vi.fn(),
    acceptSuggestion: vi.fn(),
    rejectSuggestion: vi.fn(),
  }
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

const suggestion = (id: string, overrides: Partial<CardSuggestion> = {}): CardSuggestion => ({
  id,
  card: card(`card-${id}`, { title: 'Two Club Special' }),
  suggestedBy: 'uid-dave',
  suggestedByName: 'Dave',
  status: 'pending',
  at: 1000,
  ...overrides,
})

function renderReview(isAdmin: boolean) {
  const state: AuthState = {
    status: 'signed-in',
    profile: { uid: 'uid-jf', username: 'jf', displayName: 'JF' },
    isAdmin,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
    refresh: vi.fn(),
  }
  const ui: ReactElement = (
    <AuthContext.Provider value={state}>
      <SuggestionReview />
    </AuthContext.Provider>
  )
  return render(ui)
}

beforeEach(() => {
  vi.mocked(suggestions.listPendingSuggestions).mockReset().mockResolvedValue([suggestion('s1')])
  vi.mocked(suggestions.acceptSuggestion).mockReset().mockResolvedValue(undefined)
  vi.mocked(suggestions.rejectSuggestion).mockReset().mockResolvedValue(undefined)
})

describe('SuggestionReview', () => {
  it('turns a non-admin away without fetching anything', () => {
    renderReview(false)

    expect(screen.getByText(/this screen is for the admin/i)).toBeInTheDocument()
    expect(suggestions.listPendingSuggestions).not.toHaveBeenCalled()
  })

  it('shows a pending card, its rule and who wrote it', async () => {
    renderReview(true)

    expect(await screen.findByText('Two Club Special')).toBeInTheDocument()
    expect(screen.getByText('From Dave')).toBeInTheDocument()
    expect(screen.getByText(/1 waiting on you/)).toBeInTheDocument()
  })

  it('adds an accepted card to the deck', async () => {
    renderReview(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Add to the deck' }))

    expect(suggestions.acceptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      'uid-jf',
    )
  })

  it('asks for a reason before rejecting, and passes it on', async () => {
    renderReview(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))

    // Nothing has been decided yet — the reason is part of the decision.
    expect(suggestions.rejectSuggestion).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText(/why not/i), 'Too strong on the green.')
    await userEvent.click(screen.getByRole('button', { name: 'Send it back' }))

    expect(suggestions.rejectSuggestion).toHaveBeenCalledWith(
      's1',
      'uid-jf',
      'Too strong on the green.',
    )
  })

  it('lets the admin back out of a rejection', async () => {
    renderReview(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(suggestions.rejectSuggestion).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add to the deck' })).toBeInTheDocument()
  })

  it('says plainly when the queue is empty', async () => {
    vi.mocked(suggestions.listPendingSuggestions).mockResolvedValue([])
    renderReview(true)

    expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument()
  })

  it('surfaces a failure rather than claiming the card was added', async () => {
    vi.mocked(suggestions.acceptSuggestion).mockRejectedValue(new Error('offline'))
    renderReview(true)

    await userEvent.click(await screen.findByRole('button', { name: 'Add to the deck' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/did not save/i)
  })
})
