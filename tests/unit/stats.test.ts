import { describe, it, expect } from 'vitest'
import {
  computePlayerStats,
  formatAverageToPar,
  summariseRound,
  type PlayedRound,
} from '../../src/lib/stats'
import type { HolePar } from '../../src/lib/leaderboard'
import type { HoleScore } from '../../src/lib/rounds'

/*
 * T-9.2 - player stats.
 *
 * The arithmetic is easy; the partial data is not. A round somebody walked off
 * after nine, a player who joined and never scored, a hole that is not on the
 * card - each has an exact right answer and each is the sort of thing that
 * quietly poisons an average.
 */

const JF = 'uid-jf'
const BAZ = 'uid-baz'

/** A flat par-4 course, so expected totals are obvious by inspection. */
const holes = (count: number, par = 4): HolePar[] =>
  Array.from({ length: count }, (_, index) => ({ number: index + 1, par }))

const score = (uid: string, hole: number, strokes: number): HoleScore => ({ uid, hole, strokes })

/** A round where the player went round in `strokes` on every hole. */
const evenRound = (
  roundId: string,
  holeCount: number,
  strokes: number,
  playedAt: number | null = 1000,
): PlayedRound => ({
  roundId,
  courseId: 'trangie',
  playedAt,
  holes: holes(holeCount),
  scores: Array.from({ length: holeCount }, (_, index) => score(JF, index + 1, strokes)),
})

describe('summariseRound', () => {
  it('adds up a full round against the par of the card', () => {
    const result = summariseRound(evenRound('r1', 18, 5), JF)

    expect(result.holesPlayed).toBe(18)
    expect(result.strokes).toBe(90)
    expect(result.toPar).toBe(18)
    expect(result.complete).toBe(true)
  })

  it('scores a partial round against only the holes played', () => {
    const result = summariseRound(evenRound('r1', 18, 4, 1000), JF)
    const partial = summariseRound(
      { ...evenRound('r2', 18, 4), scores: [score(JF, 1, 6), score(JF, 2, 4)] },
      JF,
    )

    expect(result.toPar).toBe(0)
    // Two holes, one of them +2. Level over 16 holes never played would be wrong.
    expect(partial.holesPlayed).toBe(2)
    expect(partial.toPar).toBe(2)
    expect(partial.complete).toBe(false)
  })

  it('ignores another player’s scores entirely', () => {
    const round: PlayedRound = {
      ...evenRound('r1', 2, 4),
      scores: [score(JF, 1, 4), score(BAZ, 1, 9), score(BAZ, 2, 9)],
    }

    const result = summariseRound(round, JF)
    expect(result.holesPlayed).toBe(1)
    expect(result.strokes).toBe(4)
  })

  it('ignores a score on a hole the card does not have', () => {
    // Otherwise it would count towards strokes with a par of zero and read as
    // a catastrophic hole that never happened.
    const round: PlayedRound = {
      ...evenRound('r1', 2, 4),
      scores: [score(JF, 1, 4), score(JF, 19, 4)],
    }

    const result = summariseRound(round, JF)
    expect(result.holesPlayed).toBe(1)
    expect(result.toPar).toBe(0)
  })

  it('does not call an empty card complete', () => {
    const result = summariseRound({ ...evenRound('r1', 0, 4), holes: [], scores: [] }, JF)
    expect(result.complete).toBe(false)
  })
})

describe('computePlayerStats', () => {
  it('returns an honest nothing for a player with no golf', () => {
    const stats = computePlayerStats([], JF)

    expect(stats.roundsPlayed).toBe(0)
    expect(stats.bestRound).toBeNull()
    expect(stats.averageToPar).toBeNull()
    expect(stats.averageStrokesPerHole).toBeNull()
    expect(stats.bestHole).toBeNull()
    expect(stats.tally).toEqual({ eagles: 0, birdies: 0, pars: 0, bogeys: 0, worse: 0 })
  })

  it('does not count a round the player never scored in', () => {
    // Joining a round to walk along is ordinary; counting it would drag every
    // average towards nothing.
    const watched: PlayedRound = { ...evenRound('r1', 18, 4), scores: [score(BAZ, 1, 4)] }
    const stats = computePlayerStats([watched], JF)

    expect(stats.roundsPlayed).toBe(0)
    expect(stats.holesPlayed).toBe(0)
  })

  it('averages to-par over completed rounds only', () => {
    const full = evenRound('r1', 18, 5) // +18
    const walkedOff: PlayedRound = {
      ...evenRound('r2', 18, 4),
      scores: [score(JF, 1, 10)], // +6 over one hole
    }

    const stats = computePlayerStats([full, walkedOff], JF)

    expect(stats.roundsPlayed).toBe(2)
    expect(stats.roundsCompleted).toBe(1)
    // The nine-hole-walk-off must not drag the scoring average around.
    expect(stats.averageToPar).toBe(18)
  })

  it('counts every hole played towards strokes per hole, finished or not', () => {
    const full = evenRound('r1', 2, 4)
    const partial: PlayedRound = { ...evenRound('r2', 2, 4), scores: [score(JF, 1, 6)] }

    const stats = computePlayerStats([full, partial], JF)

    expect(stats.holesPlayed).toBe(3)
    expect(stats.strokes).toBe(14)
    expect(stats.averageStrokesPerHole).toBeCloseTo(14 / 3)
  })

  it('picks the lowest completed round as the best one', () => {
    const stats = computePlayerStats(
      [evenRound('r1', 18, 5), evenRound('r2', 18, 4), evenRound('r3', 18, 6)],
      JF,
    )

    expect(stats.bestRound?.roundId).toBe('r2')
    expect(stats.bestRound?.toPar).toBe(0)
  })

  it('has no best round until one is actually finished', () => {
    const partial: PlayedRound = { ...evenRound('r1', 18, 4), scores: [score(JF, 1, 3)] }
    const stats = computePlayerStats([partial], JF)

    expect(stats.roundsPlayed).toBe(1)
    expect(stats.bestRound).toBeNull()
    expect(stats.averageToPar).toBeNull()
  })

  it('tallies what each hole was called', () => {
    const round: PlayedRound = {
      ...evenRound('r1', 6, 4),
      scores: [
        score(JF, 1, 2), // eagle
        score(JF, 2, 3), // birdie
        score(JF, 3, 4), // par
        score(JF, 4, 5), // bogey
        score(JF, 5, 6), // double
        score(JF, 6, 9), // worse still
      ],
    }

    expect(computePlayerStats([round], JF).tally).toEqual({
      eagles: 1,
      birdies: 1,
      pars: 1,
      bogeys: 1,
      worse: 2,
    })
  })

  it('finds the best and worst holes by average, across rounds', () => {
    const first: PlayedRound = {
      ...evenRound('r1', 3, 4),
      scores: [score(JF, 1, 3), score(JF, 2, 4), score(JF, 3, 7)],
    }
    const second: PlayedRound = {
      ...evenRound('r2', 3, 4),
      scores: [score(JF, 1, 3), score(JF, 2, 4), score(JF, 3, 7)],
    }

    const stats = computePlayerStats([first, second], JF)

    expect(stats.bestHole).toEqual({ hole: 1, played: 2, averageToPar: -1 })
    expect(stats.worstHole).toEqual({ hole: 3, played: 2, averageToPar: 3 })
  })

  it('breaks a tie on the lower hole number so the answer does not reshuffle', () => {
    const round: PlayedRound = {
      ...evenRound('r1', 3, 4),
      scores: [score(JF, 1, 3), score(JF, 2, 3), score(JF, 3, 5)],
    }

    expect(computePlayerStats([round], JF).bestHole?.hole).toBe(1)
  })
})

describe('formatAverageToPar', () => {
  it('quotes a scoring average the way a broadcast does', () => {
    expect(formatAverageToPar(4.25)).toBe('+4.3')
    expect(formatAverageToPar(-2.14)).toBe('−2.1')
  })

  it('calls a level average E, including one that rounds to level', () => {
    expect(formatAverageToPar(0)).toBe('E')
    expect(formatAverageToPar(0.04)).toBe('E')
  })

  it('has a dash for a player with nothing to average yet', () => {
    expect(formatAverageToPar(null)).toBe('—')
  })
})
