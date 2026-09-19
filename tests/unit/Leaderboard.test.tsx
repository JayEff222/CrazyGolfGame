import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Leaderboard } from '../../src/features/scoring/Leaderboard'
import type { HolePar } from '../../src/lib/leaderboard'
import type { HoleScore, RoundPlayer } from '../../src/lib/rounds'

/*
 * The ranking maths is proved in leaderboard.test.ts. What is tested here is that
 * the screen presents it the way a leaderboard is read: to-par first, then how
 * far through the round each player is, with raw strokes as the quiet column.
 */

const players: RoundPlayer[] = [
  { uid: 'jf', displayName: 'jayeff', order: 0 },
  { uid: 'dave', displayName: 'dave', order: 1 },
  { uid: 'sam', displayName: 'sam', order: 2 },
]

const holes: HolePar[] = [
  { number: 1, par: 4 },
  { number: 2, par: 4 },
  { number: 3, par: 3 },
  { number: 4, par: 5 },
]

const score = (uid: string, hole: number, strokes: number): HoleScore => ({ uid, hole, strokes })

const renderBoard = (
  scores: HoleScore[],
  props: Partial<Parameters<typeof Leaderboard>[0]> = {},
) => render(<Leaderboard players={players} scores={scores} holes={holes} {...props} />)

/** Player names in the order the board lists them. */
const order = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('rowheader')[0]?.textContent)

const rowFor = (name: string) =>
  within(screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement)

describe('Leaderboard', () => {
  it('ranks on to-par, not on total strokes', () => {
    // dave is 8 strokes in and one under; jayeff is 14 strokes in and two over.
    // Raw strokes would put dave top for the wrong reason - to-par puts him top
    // for the right one, and keeps the order stable when jayeff catches up.
    renderBoard([
      score('jf', 1, 5),
      score('jf', 2, 5),
      score('jf', 3, 4),
      score('dave', 1, 4),
      score('dave', 2, 4),
      score('sam', 1, 4),
    ])

    expect(order()).toEqual(['dave', 'sam', 'jayeff'])
  })

  it('does not let a player who has barely started sit on top', () => {
    // sam has not teed off. Level par, mid-table - not leading on zero strokes.
    renderBoard([score('jf', 1, 3), score('dave', 1, 6)])
    expect(order()).toEqual(['jayeff', 'sam', 'dave'])
  })

  it('leads with to-par and says how far through each player is', () => {
    renderBoard([score('jf', 1, 5), score('jf', 2, 4)])

    const jayeff = rowFor('jayeff')
    expect(jayeff.getByText('+1')).toBeInTheDocument()
    expect(jayeff.getByText('2')).toBeInTheDocument()
    expect(jayeff.getByText('9')).toBeInTheDocument()
  })

  it('writes level par as E', () => {
    renderBoard([score('jf', 1, 4)])
    expect(rowFor('jayeff').getByText('E')).toBeInTheDocument()
  })

  it('shows a dash rather than a zero before a player has scored', () => {
    renderBoard([])
    const sam = rowFor('sam')
    expect(sam.getAllByText('–')).toHaveLength(2)
  })

  it('shares a position on a tie and skips the next one', () => {
    renderBoard([score('jf', 1, 4), score('dave', 1, 4), score('sam', 1, 6)])

    expect(rowFor('jayeff').getAllByRole('cell')[0]).toHaveTextContent('1')
    expect(rowFor('dave').getAllByRole('cell')[0]).toHaveTextContent('1')
    expect(rowFor('sam').getAllByRole('cell')[0]).toHaveTextContent('3')
  })

  it('highlights the signed-in player so they find themselves at a glance', () => {
    renderBoard([], { highlightUid: 'sam' })
    expect(rowFor('sam').getByRole('rowheader').closest('tr')).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(rowFor('dave').getByRole('rowheader').closest('tr')).not.toHaveAttribute('aria-current')
  })

  it('drops its heading in the compact form used on the hole screen', () => {
    const { unmount } = renderBoard([])
    expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeInTheDocument()
    unmount()

    renderBoard([], { compact: true })
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('says so when nobody has joined yet', () => {
    render(<Leaderboard players={[]} scores={[]} holes={holes} />)
    expect(screen.getByText('Nobody has joined this round yet.')).toBeInTheDocument()
  })
})
