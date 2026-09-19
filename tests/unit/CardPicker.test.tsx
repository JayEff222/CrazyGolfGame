import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardPicker } from '../../src/features/cards/CardPicker'
import type { Card } from '../../src/lib/cards'

const card = (overrides: Partial<Card> = {}): Card => ({
  id: 'mulligan',
  title: 'Mulligan',
  effect: 'Replay your last shot. The first one never happened.',
  category: 'boost',
  timing: 'after-shot',
  target: 'self',
  active: true,
  ...overrides,
})

const deck: Card[] = [
  card(),
  card({
    id: 'no-look',
    title: 'No Look',
    effect: 'They must hit their next shot with their eyes closed.',
    category: 'attack',
    target: 'opponent',
  }),
  card({
    id: 'mirror',
    title: 'Mirror',
    effect: 'Reflect a card straight back at whoever played it.',
    category: 'defence',
    timing: 'response',
    target: 'opponent',
  }),
  card({
    id: 'no-tap-ins',
    title: 'No Tap-Ins',
    effect: 'Nothing is given on this green. Everyone holes out.',
    category: 'group',
    timing: 'green',
    target: 'everyone',
  }),
]

const onChange = vi.fn()
beforeEach(() => onChange.mockReset())

describe('CardPicker', () => {
  it('shows every active card', () => {
    render(<CardPicker cards={deck} selectedIds={[]} onChange={onChange} />)
    for (const c of deck) {
      expect(screen.getByRole('button', { name: new RegExp(c.title) })).toBeInTheDocument()
    }
  })

  it('shows the full rule, because the person picking has to explain it', () => {
    render(<CardPicker cards={deck} selectedIds={[]} onChange={onChange} />)
    expect(screen.getByText(/Replay your last shot/)).toBeInTheDocument()
  })

  it('hides a deactivated card rather than offering something that cannot be dealt', () => {
    render(
      <CardPicker cards={[card({ active: false })]} selectedIds={[]} onChange={onChange} />,
    )
    expect(screen.queryByRole('button', { name: /Mulligan/ })).not.toBeInTheDocument()
  })

  it('adds a card when tapped', async () => {
    const user = userEvent.setup()
    render(<CardPicker cards={deck} selectedIds={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Mulligan/ }))
    expect(onChange).toHaveBeenCalledWith(['mulligan'])
  })

  it('removes a card when tapped again', async () => {
    const user = userEvent.setup()
    render(<CardPicker cards={deck} selectedIds={['mulligan']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Mulligan/ }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('marks a chosen card as pressed, so the state is not colour-only', () => {
    render(<CardPicker cards={deck} selectedIds={['mulligan']} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Mulligan/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /No Look/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('counts what is in play', () => {
    render(<CardPicker cards={deck} selectedIds={['mulligan', 'mirror']} onChange={onChange} />)
    expect(screen.getByText('2 of 4 cards in play')).toBeInTheDocument()
  })

  it('selects everything with Use all', async () => {
    const user = userEvent.setup()
    render(<CardPicker cards={deck} selectedIds={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Use all' }))
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(4)
  })

  it('offers Clear all once everything is selected', async () => {
    const user = userEvent.setup()
    render(
      <CardPicker cards={deck} selectedIds={deck.map((c) => c.id)} onChange={onChange} />,
    )
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('groups by category so a deal is never accidentally all attacks', () => {
    render(<CardPicker cards={deck} selectedIds={[]} onChange={onChange} />)
    expect(screen.getByRole('heading', { name: /Help yourself/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Target someone/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /React/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Everyone/ })).toBeInTheDocument()
  })

  it('says plainly that picking none is a valid choice', () => {
    render(<CardPicker cards={deck} selectedIds={[]} onChange={onChange} />)
    expect(screen.getByText(/straight round with no cards/i)).toBeInTheDocument()
  })

  it('warns when the selection is too small for the deal, and says what happens', () => {
    render(
      <CardPicker cards={deck} selectedIds={['mulligan']} onChange={onChange} minimumWanted={8} />,
    )
    const warning = screen.getByRole('status')
    expect(warning).toHaveTextContent('Only 1 cards for 8 wanted')
    expect(warning).toHaveTextContent(/remainder is discarded/)
  })

  it('does not warn when the selection is big enough', () => {
    render(
      <CardPicker
        cards={deck}
        selectedIds={deck.map((c) => c.id)}
        onChange={onChange}
        minimumWanted={4}
      />,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('handles an empty catalogue without breaking the create screen', () => {
    render(<CardPicker cards={[]} selectedIds={[]} onChange={onChange} />)
    expect(screen.getByText(/No cards in the catalogue yet/i)).toBeInTheDocument()
  })
})
