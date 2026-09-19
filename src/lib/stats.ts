import type { HolePar } from './leaderboard'
import type { HoleScore } from './rounds'

/*
 * T-9.2 - what a player's golf adds up to across rounds.
 *
 * Pure arithmetic over plain data, which is the whole reason it lives here: the
 * awkward cases are all about partial data - a round somebody walked off after
 * nine, a hole nobody scored, a player who joined a round and never wrote a
 * number - and each of those has an exact right answer that can be proved
 * without rendering anything.
 *
 * The rule running through all of it: a round only counts towards an average
 * once it is complete. Averaging a nine-hole walk-off against full rounds would
 * flatter every player who ever gave up in the rain.
 */

/** One round as history hands it over: the card, and everyone's scores on it. */
export interface PlayedRound {
  readonly roundId: string
  readonly courseId: string
  /** Milliseconds since the epoch, or null when the timestamp has not settled. */
  readonly playedAt: number | null
  readonly holes: readonly HolePar[]
  readonly scores: readonly HoleScore[]
}

/** How one player's round came out. */
export interface RoundResult {
  readonly roundId: string
  readonly courseId: string
  readonly playedAt: number | null
  readonly holesPlayed: number
  readonly strokes: number
  /** Against the par of the holes actually played, not of the whole course. */
  readonly toPar: number
  /** True only when every hole on the card has a score. */
  readonly complete: boolean
}

export interface ScoreTally {
  readonly eagles: number
  readonly birdies: number
  readonly pars: number
  readonly bogeys: number
  /** Double bogey or worse. One bucket: nobody wants a triple-bogey counter. */
  readonly worse: number
}

export interface HoleRecord {
  readonly hole: number
  readonly played: number
  readonly averageToPar: number
}

export interface PlayerStats {
  readonly roundsPlayed: number
  readonly roundsCompleted: number
  readonly holesPlayed: number
  readonly strokes: number
  /** Lowest to-par among completed rounds, or null until one is finished. */
  readonly bestRound: RoundResult | null
  /** Mean to-par across completed rounds only. */
  readonly averageToPar: number | null
  /** Mean strokes per hole across every hole scored, finished round or not. */
  readonly averageStrokesPerHole: number | null
  readonly tally: ScoreTally
  readonly bestHole: HoleRecord | null
  readonly worstHole: HoleRecord | null
}

const EMPTY_TALLY: ScoreTally = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, worse: 0 }

/** Adds up one player's card in one round. */
export function summariseRound(round: PlayedRound, uid: string): RoundResult {
  const parByHole = new Map(round.holes.map((hole) => [hole.number, hole.par]))
  // A score on a hole the card does not have cannot be scored against par, so it
  // is ignored rather than silently counted as par.
  const own = round.scores.filter((score) => score.uid === uid && parByHole.has(score.hole))

  const strokes = own.reduce((sum, score) => sum + score.strokes, 0)
  const parPlayed = own.reduce((sum, score) => sum + (parByHole.get(score.hole) ?? 0), 0)

  return {
    roundId: round.roundId,
    courseId: round.courseId,
    playedAt: round.playedAt,
    holesPlayed: own.length,
    strokes,
    toPar: strokes - parPlayed,
    complete: round.holes.length > 0 && own.length === round.holes.length,
  }
}

function tallyScore(tally: ScoreTally, diff: number): ScoreTally {
  if (diff <= -2) return { ...tally, eagles: tally.eagles + 1 }
  if (diff === -1) return { ...tally, birdies: tally.birdies + 1 }
  if (diff === 0) return { ...tally, pars: tally.pars + 1 }
  if (diff === 1) return { ...tally, bogeys: tally.bogeys + 1 }
  return { ...tally, worse: tally.worse + 1 }
}

/**
 * Best and worst hole by average to-par.
 *
 * Ties break on the lower hole number so the answer is stable between renders -
 * an "on this day" statistic that reshuffles itself is not a statistic.
 */
function extremes(records: readonly HoleRecord[]): {
  best: HoleRecord | null
  worst: HoleRecord | null
} {
  if (records.length === 0) return { best: null, worst: null }

  let best = records[0]!
  let worst = records[0]!
  for (const record of records) {
    if (record.averageToPar < best.averageToPar) best = record
    if (record.averageToPar > worst.averageToPar) worst = record
  }
  return { best, worst }
}

/**
 * Everything the stats screen shows, from every round the player has been in.
 *
 * A round the player never wrote a score in does not count as played. That is
 * not pedantry: joining a round to watch, or joining and then leaving, is
 * ordinary, and counting it would drag every average towards nothing.
 */
export function computePlayerStats(
  rounds: readonly PlayedRound[],
  uid: string,
): PlayerStats {
  const results = rounds
    .map((round) => summariseRound(round, uid))
    .filter((result) => result.holesPlayed > 0)

  const completed = results.filter((result) => result.complete)

  let tally = EMPTY_TALLY
  // hole number -> the to-par figures this player has posted on it
  const byHole = new Map<number, number[]>()

  for (const round of rounds) {
    const parByHole = new Map(round.holes.map((hole) => [hole.number, hole.par]))
    for (const score of round.scores) {
      if (score.uid !== uid) continue
      const par = parByHole.get(score.hole)
      if (par === undefined) continue

      const diff = score.strokes - par
      tally = tallyScore(tally, diff)
      const posted = byHole.get(score.hole) ?? []
      posted.push(diff)
      byHole.set(score.hole, posted)
    }
  }

  const holeRecords = [...byHole.entries()]
    .map(([hole, diffs]) => ({
      hole,
      played: diffs.length,
      averageToPar: diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length,
    }))
    .sort((a, b) => a.hole - b.hole)

  const { best, worst } = extremes(holeRecords)

  const holesPlayed = results.reduce((sum, result) => sum + result.holesPlayed, 0)
  const strokes = results.reduce((sum, result) => sum + result.strokes, 0)

  const bestRound =
    completed.length === 0
      ? null
      : completed.reduce((lowest, result) => (result.toPar < lowest.toPar ? result : lowest))

  return {
    roundsPlayed: results.length,
    roundsCompleted: completed.length,
    holesPlayed,
    strokes,
    bestRound,
    averageToPar:
      completed.length === 0
        ? null
        : completed.reduce((sum, result) => sum + result.toPar, 0) / completed.length,
    averageStrokesPerHole: holesPlayed === 0 ? null : strokes / holesPlayed,
    tally,
    bestHole: best,
    worstHole: worst,
  }
}

/** One decimal, and a sign, the way a scoring average is quoted. */
export function formatAverageToPar(average: number | null): string {
  if (average === null) return '—'
  const rounded = Math.round(average * 10) / 10
  if (rounded === 0) return 'E'
  return rounded > 0 ? `+${rounded.toFixed(1)}` : `−${Math.abs(rounded).toFixed(1)}`
}
