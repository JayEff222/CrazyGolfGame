import { describe, it, expect } from 'vitest'
import {
  computeLeaderboard,
  formatToPar,
  nextUnscoredHole,
  type HolePar,
} from '../../src/lib/leaderboard'
import type { HoleScore, RoundPlayer } from '../../src/lib/rounds'
import { generateRoomCode, normaliseRoomCode, ROOM_CODE_LENGTH } from '../../src/lib/rounds'

const players: RoundPlayer[] = [
  { uid: 'jf', displayName: 'jayeff', order: 0 },
  { uid: 'dave', displayName: 'dave', order: 1 },
  { uid: 'sam', displayName: 'sam', order: 2 },
]

// Trangie's first three: par 4, 4, 3.
const holes: HolePar[] = [
  { number: 1, par: 4 },
  { number: 2, par: 4 },
  { number: 3, par: 3 },
]

const score = (uid: string, hole: number, strokes: number): HoleScore => ({ uid, hole, strokes })

describe('computeLeaderboard', () => {
  it('returns a row per player even before anyone has scored', () => {
    const rows = computeLeaderboard(players, [], holes)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.strokes === 0 && r.holesPlayed === 0)).toBe(true)
  })

  it('totals only the holes a player has actually scored', () => {
    const rows = computeLeaderboard(players, [score('jf', 1, 5), score('jf', 2, 4)], holes)
    const jf = rows.find((r) => r.uid === 'jf')
    expect(jf?.strokes).toBe(9)
    expect(jf?.holesPlayed).toBe(2)
  })

  it('measures to-par against the holes played, not the whole course', () => {
    // 5 on a par 4 then 4 on a par 4 = +1 after two holes, not 62 under.
    const rows = computeLeaderboard(players, [score('jf', 1, 5), score('jf', 2, 4)], holes)
    expect(rows.find((r) => r.uid === 'jf')?.toPar).toBe(1)
  })

  it('reports level par as zero', () => {
    const rows = computeLeaderboard(players, [score('jf', 1, 4), score('jf', 3, 3)], holes)
    expect(rows.find((r) => r.uid === 'jf')?.toPar).toBe(0)
  })

  it('ranks the best score relative to par first', () => {
    const rows = computeLeaderboard(
      players,
      [score('jf', 1, 6), score('dave', 1, 4), score('sam', 1, 5)],
      holes,
    )
    expect(rows.map((r) => r.uid)).toEqual(['dave', 'sam', 'jf'])
    expect(rows[0]?.position).toBe(1)
  })

  it('does not let a player who has not teed off lead on zero strokes', () => {
    // jf is +4 thru 1; dave is level thru 2; sam has not started and is level thru 0.
    // Ranking by strokes would put sam top on nothing, which is the wrong answer.
    const rows = computeLeaderboard(
      players,
      [score('jf', 1, 8), score('dave', 1, 4), score('dave', 2, 4)],
      holes,
    )
    expect(rows[0]?.uid).toBe('dave')
  })

  it('shares a position on a genuine tie', () => {
    const rows = computeLeaderboard(
      players,
      [score('jf', 1, 4), score('dave', 1, 4), score('sam', 1, 6)],
      holes,
    )
    const byUid = Object.fromEntries(rows.map((r) => [r.uid, r.position]))
    expect(byUid.jf).toBe(1)
    expect(byUid.dave).toBe(1)
    // Standard competition ranking: two tied firsts push the next to third.
    expect(byUid.sam).toBe(3)
  })

  it('ignores scores belonging to someone not in the round', () => {
    const rows = computeLeaderboard(players, [score('stranger', 1, 2)], holes)
    expect(rows.every((r) => r.strokes === 0)).toBe(true)
  })

  it('treats an unknown hole as par zero rather than throwing', () => {
    const rows = computeLeaderboard(players, [score('jf', 99, 5)], holes)
    expect(rows.find((r) => r.uid === 'jf')?.toPar).toBe(5)
  })
})

describe('formatToPar', () => {
  it('shows level par as E', () => {
    expect(formatToPar(0)).toBe('E')
  })

  it('signs a score over par', () => {
    expect(formatToPar(3)).toBe('+3')
  })

  it('uses a real minus sign under par, not a hyphen', () => {
    expect(formatToPar(-2)).toBe('−2')
  })
})

describe('nextUnscoredHole', () => {
  it('starts at hole 1', () => {
    expect(nextUnscoredHole([], 'jf')).toBe(1)
  })

  it('finds the first gap rather than the highest hole played', () => {
    // Scored 1 and 3 - the next hole needing a score is 2, not 4.
    expect(nextUnscoredHole([score('jf', 1, 4), score('jf', 3, 3)], 'jf')).toBe(2)
  })

  it('returns null once every hole is scored', () => {
    const all = Array.from({ length: 18 }, (_, i) => score('jf', i + 1, 4))
    expect(nextUnscoredHole(all, 'jf')).toBeNull()
  })

  it('only considers this player', () => {
    expect(nextUnscoredHole([score('dave', 1, 4)], 'jf')).toBe(1)
  })
})

describe('room codes', () => {
  it('is the expected length', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it('never uses characters that are easy to misread aloud or in sunlight', () => {
    const ambiguous = /[O0I1LS5]/
    for (let i = 0; i < 500; i++) {
      expect(generateRoomCode()).not.toMatch(ambiguous)
    }
  })

  it('is deterministic given a fixed random source, so it can be tested', () => {
    const fixed = () => 0
    expect(generateRoomCode(fixed)).toBe('AAAA')
  })

  it('normalises what a player types', () => {
    expect(normaliseRoomCode(' ab2c ')).toBe('AB2C')
    expect(normaliseRoomCode('A B 2 C')).toBe('AB2C')
  })
})
