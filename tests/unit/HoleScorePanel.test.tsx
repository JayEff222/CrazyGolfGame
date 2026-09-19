import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HoleScorePanel } from '../../src/features/scoring/HoleScorePanel'
import type { HoleScore, RoundPlayer } from '../../src/lib/rounds'

/*
 * The scoring half of the hole screen. The thing worth proving is the asymmetry:
 * you get a control, everybody else gets text. REQUIREMENTS.md §4.2 and the
 * security rules both say a player writes only their own score, so a button that
 * edits a rival's score must not exist to be tapped in the first place.
 */

const players: RoundPlayer[] = [
  { uid: 'jf', displayName: 'jayeff', order: 0 },
  { uid: 'dave', displayName: 'dave', order: 1 },
]

const onSetScore = vi.fn()

beforeEach(() => {
  onSetScore.mockReset()
})

const renderPanel = (props: Partial<Parameters<typeof HoleScorePanel>[0]> = {}) =>
  render(
    <HoleScorePanel
      hole={4}
      par={4}
      players={players}
      scores={[]}
      selfUid="jf"
      onSetScore={onSetScore}
      {...props}
    />,
  )

const others = () => within(screen.getByRole('list', { name: 'Other players on this hole' }))

describe('HoleScorePanel', () => {
  it('gives the signed-in player a stepper for this hole', () => {
    renderPanel()
    expect(
      screen.getByRole('region', { name: 'Your score for hole 4, par 4' }),
    ).toBeInTheDocument()
  })

  it('reports the score against the hole it is showing', async () => {
    const user = userEvent.setup()
    renderPanel({ hole: 12, par: 3 })

    await user.click(screen.getByRole('button', { name: 'Score 4, bogey' }))
    expect(onSetScore).toHaveBeenCalledWith(12, 4)
  })

  it('shows the score already entered for this hole', () => {
    renderPanel({ scores: [{ uid: 'jf', hole: 4, strokes: 6 } satisfies HoleScore] })
    expect(within(screen.getByRole('status')).getByText('6')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('Double bogey')).toBeInTheDocument()
  })

  it('shows everyone else on this hole without offering a way to change them', () => {
    renderPanel({
      scores: [
        { uid: 'dave', hole: 4, strokes: 5 },
        { uid: 'dave', hole: 5, strokes: 3 },
      ],
    })

    expect(others().getByText('dave')).toBeInTheDocument()
    expect(others().getByText('5')).toBeInTheDocument()
    // Nothing tappable in the other players' list — you cannot edit their card.
    expect(others().queryAllByRole('button')).toHaveLength(0)
  })

  it('says when another player has not put a score in yet', () => {
    renderPanel()
    expect(others().getByText('Not in yet')).toBeInTheDocument()
  })

  it('never lists the signed-in player among the others', () => {
    renderPanel()
    expect(others().queryByText('jayeff')).not.toBeInTheDocument()
  })

  it('offers no control to someone who is not playing this round', () => {
    renderPanel({ selfUid: 'stranger' })
    expect(screen.queryByRole('region', { name: /Your score/ })).not.toBeInTheDocument()
    expect(screen.getByText(/watching this round/i)).toBeInTheDocument()
  })

  it('surfaces a rejected write as an alert', () => {
    renderPanel({ error: 'That score was refused — you can only enter your own score.' })
    expect(screen.getByRole('alert')).toHaveTextContent('you can only enter your own score')
  })

  it('locks the stepper when scoring is closed', async () => {
    const user = userEvent.setup()
    renderPanel({ disabled: true })

    await user.click(screen.getByRole('button', { name: 'Score 4, par' }))
    expect(onSetScore).not.toHaveBeenCalled()
  })
})
