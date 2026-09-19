import { describe, it, expect } from 'vitest'
import type { StoredHole } from '../../src/lib/courseData'
import type { HoleScore } from '../../src/lib/rounds'
import {
  clampStrokes,
  indexScores,
  parTotal,
  playerTotals,
  quickPicks,
  scoreKey,
  scoreTerm,
  scoreTone,
  toHolePars,
  MAX_STROKES,
  MIN_STROKES,
} from '../../src/features/scoring/scorecardTotals'

const score = (uid: string, hole: number, strokes: number): HoleScore => ({ uid, hole, strokes })

describe('clampStrokes', () => {
  it('keeps a normal score untouched', () => {
    expect(clampStrokes(5)).toBe(5)
  })

  it('refuses a score below one — you cannot hole out in zero', () => {
    expect(clampStrokes(0)).toBe(MIN_STROKES)
    expect(clampStrokes(-4)).toBe(MIN_STROKES)
  })

  it('caps the top end rather than storing a fat-fingered 150', () => {
    expect(clampStrokes(150)).toBe(MAX_STROKES)
  })

  it('rounds and survives rubbish input', () => {
    expect(clampStrokes(4.6)).toBe(5)
    expect(clampStrokes(Number.NaN)).toBe(MIN_STROKES)
  })
})

describe('scoreTerm', () => {
  it('names a one as a hole in one, whatever the par', () => {
    expect(scoreTerm(1, 3)).toBe('Hole in one')
    expect(scoreTerm(1, 4)).toBe('Hole in one')
  })

  it('names the common scores the way a golfer says them', () => {
    expect(scoreTerm(3, 4)).toBe('Birdie')
    expect(scoreTerm(4, 4)).toBe('Par')
    expect(scoreTerm(5, 4)).toBe('Bogey')
    expect(scoreTerm(6, 4)).toBe('Double bogey')
    expect(scoreTerm(7, 4)).toBe('Triple bogey')
  })

  it('stops inventing names past a triple', () => {
    expect(scoreTerm(9, 4)).toBe('5 over par')
  })

  it('handles an eagle and an albatross on a par 5', () => {
    expect(scoreTerm(3, 5)).toBe('Eagle')
    expect(scoreTerm(2, 5)).toBe('Albatross')
  })
})

describe('quickPicks', () => {
  it('covers one under through three over', () => {
    expect(quickPicks(4)).toEqual([3, 4, 5, 6, 7])
    expect(quickPicks(3)).toEqual([2, 3, 4, 5, 6])
    expect(quickPicks(5)).toEqual([4, 5, 6, 7, 8])
  })

  it('never offers a zero', () => {
    expect(quickPicks(1)).toEqual([1, 2, 3, 4])
  })
})

describe('playerTotals', () => {
  const scores = [
    score('jf', 1, 5),
    score('jf', 9, 4),
    score('jf', 10, 6),
    score('dave', 1, 3),
  ]

  it('splits the card at the turn', () => {
    const totals = playerTotals(scores, 'jf')
    expect(totals.out).toBe(9)
    expect(totals.back).toBe(6)
    expect(totals.total).toBe(15)
    expect(totals.holesPlayed).toBe(3)
  })

  it('counts hole 9 as out and hole 10 as in', () => {
    expect(playerTotals([score('jf', 9, 4)], 'jf').out).toBe(4)
    expect(playerTotals([score('jf', 10, 4)], 'jf').back).toBe(4)
  })

  it('ignores everyone else', () => {
    expect(playerTotals(scores, 'dave').total).toBe(3)
  })

  it('is zero for a player who has not teed off', () => {
    expect(playerTotals(scores, 'sam')).toEqual({ out: 0, back: 0, total: 0, holesPlayed: 0 })
  })
})

describe('parTotal', () => {
  const holes = [
    { number: 1, par: 4 },
    { number: 2, par: 3 },
    { number: 10, par: 5 },
  ]

  it('adds par over a range of holes', () => {
    expect(parTotal(holes, 1, 9)).toBe(7)
    expect(parTotal(holes, 10, 18)).toBe(5)
    expect(parTotal(holes, 1, 18)).toBe(12)
  })
})

describe('toHolePars', () => {
  const stored = (number: number, mensPar: number, ladiesPar: number): StoredHole => ({
    number,
    mens: { par: mensPar, metres: 300, strokeIndex: number },
    ladies: { par: ladiesPar, metres: 260, strokeIndex: number },
    green: null,
    tee: null,
  })

  it('reads the tee set actually being played', () => {
    const holes = [stored(1, 4, 5), stored(2, 3, 3)]
    expect(toHolePars(holes, 'mens').map((h) => h.par)).toEqual([4, 3])
    expect(toHolePars(holes, 'ladies').map((h) => h.par)).toEqual([5, 3])
  })

  it('carries the metres through, because the scorecard prints them', () => {
    expect(toHolePars([stored(1, 4, 5)], 'ladies')[0]?.metres).toBe(260)
  })

  it('sorts by hole number regardless of what Firestore returned', () => {
    expect(toHolePars([stored(3, 4, 4), stored(1, 4, 4)], 'mens').map((h) => h.number)).toEqual([
      1, 3,
    ])
  })
})

describe('indexScores', () => {
  it('keys by player and hole so a grid cell is one lookup', () => {
    const index = indexScores([score('jf', 7, 5), score('dave', 7, 4)])
    expect(index.get(scoreKey('jf', 7))).toBe(5)
    expect(index.get(scoreKey('dave', 7))).toBe(4)
    expect(index.get(scoreKey('sam', 7))).toBeUndefined()
  })
})

describe('scoreTone', () => {
  it('groups scores the way a scorecard marks them', () => {
    expect(scoreTone(2, 4)).toBe('eagle')
    expect(scoreTone(3, 4)).toBe('birdie')
    expect(scoreTone(4, 4)).toBe('par')
    expect(scoreTone(5, 4)).toBe('bogey')
    expect(scoreTone(8, 4)).toBe('worse')
  })
})
