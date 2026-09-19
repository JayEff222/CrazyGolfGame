import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScorecardScreen } from '../../src/features/scoring/ScorecardScreen'
import type { ScorecardHole } from '../../src/features/scoring/scorecardTotals'
import type { HoleScore, RoundPlayer } from '../../src/lib/rounds'

/*
 * The full card, and the home of "any previously played hole can be edited at any
 * time" (REQUIREMENTS.md §4.2). The tests that matter are: the card adds up, you
 * can reach hole 2 from anywhere, and your playing partners' columns are text.
 */

// Par 4,4,3,5,4,4,3,5,4 out and the same back: a 72 like Trangie's.
const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]

const holes: ScorecardHole[] = PARS.map((par, index) => ({
  number: index + 1,
  par,
  metres: 300 + index,
  strokeIndex: index + 1,
}))

const players: RoundPlayer[] = [
  { uid: 'jf', displayName: 'jayeff', order: 0 },
  { uid: 'dave', displayName: 'dave', order: 1 },
]

const score = (uid: string, hole: number, strokes: number): HoleScore => ({ uid, hole, strokes })

// jayeff is three over after three; dave has played the first two.
const scores: HoleScore[] = [
  score('jf', 1, 5),
  score('jf', 2, 5),
  score('jf', 3, 4),
  score('dave', 1, 4),
  score('dave', 2, 6),
]

const onSetScore = vi.fn()

beforeEach(() => {
  onSetScore.mockReset()
})

const renderCard = (props: Partial<Parameters<typeof ScorecardScreen>[0]> = {}) =>
  render(
    <ScorecardScreen
      players={players}
      scores={scores}
      holes={holes}
      selfUid="jf"
      onSetScore={onSetScore}
      {...props}
    />,
  )

const rowFor = (label: string) =>
  within(screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement)

describe('ScorecardScreen', () => {
  it('prints every hole on the course', () => {
    renderCard()
    expect(screen.getByRole('rowheader', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '18' })).toBeInTheDocument()
  })

  it('gives every player a column', () => {
    renderCard()
    expect(screen.getByRole('columnheader', { name: 'jayeff' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'dave' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Par' })).toBeInTheDocument()
  })

  it('adds up out, in and total the way the card does', () => {
    renderCard()

    const out = rowFor('Out').getAllByRole('cell')
    expect(out[0]).toHaveTextContent('36')
    expect(out[1]).toHaveTextContent('14')
    expect(out[2]).toHaveTextContent('10')

    // Nobody has reached the back nine, so there is nothing to add up yet.
    expect(rowFor('In').getAllByRole('cell')[1]).toHaveTextContent('–')

    const total = rowFor('Total').getAllByRole('cell')
    expect(total[0]).toHaveTextContent('72')
    expect(total[1]).toHaveTextContent('14')
  })

  it('shows to-par against the holes played, not the whole course', () => {
    renderCard()
    // 14 strokes over pars 4, 4, 3 = three over. Not 58 under.
    expect(rowFor('To par').getAllByRole('cell')[0]).toHaveTextContent('+3')
  })

  it('opens on the first hole still owing a score', () => {
    renderCard()
    expect(
      screen.getByRole('region', { name: 'Your score for hole 4, par 5' }),
    ).toBeInTheDocument()
  })

  it('edits a hole played earlier in the round', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Edit your score of 5 for hole 2' }))

    const stepper = screen.getByRole('region', { name: 'Your score for hole 2, par 4' })
    expect(within(stepper).getByRole('status')).toHaveTextContent('5')

    await user.click(within(stepper).getByRole('button', { name: 'Score 7, triple bogey' }))
    expect(onSetScore).toHaveBeenCalledWith(2, 7)
  })

  it('reaches a hole that has never been scored', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Enter your score for hole 17' }))

    const stepper = screen.getByRole('region', { name: 'Your score for hole 17, par 5' })
    await user.click(within(stepper).getByRole('button', { name: 'Score 5, par' }))
    expect(onSetScore).toHaveBeenCalledWith(17, 5)
  })

  it('offers no way to touch another player’s score', () => {
    renderCard()

    // dave's 6 on the 2nd is on screen, but not as anything tappable.
    expect(screen.getAllByText('6').length).toBeGreaterThan(0)
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-label') ?? '').not.toMatch(/dave/i)
    }
    expect(screen.queryByRole('button', { name: /score of 6 for hole 2/i })).not.toBeInTheDocument()
  })

  it('renders read-only with no handler, for round history', () => {
    renderCard({ onSetScore: undefined })
    expect(screen.queryByRole('region', { name: /Your score/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('is read-only for someone who is not in the round', () => {
    renderCard({ selfUid: 'stranger' })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('names the course when it is given one', () => {
    renderCard({ courseName: 'Trangie Golf Course' })
    expect(screen.getByText('Trangie Golf Course')).toBeInTheDocument()
  })
})
