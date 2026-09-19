import {
  listPlayerRounds,
  loadPlayers,
  loadRound,
  loadScores,
  type Round,
  type RoundPlayer,
} from '../../lib/rounds'
import { loadHoles, type StoredHole } from '../../lib/courseData'
import { toHolePars, type ScorecardHole } from '../scoring'
import type { PlayedRound } from '../../lib/stats'

/*
 * T-9.1 - assembling a player's history.
 *
 * A round is spread over four places (the round document, its players, its
 * scores, and the course's holes) and history needs all four for every round.
 * Doing that naively is four reads per round plus a course fetch each time; the
 * course fetch is the expensive one and the most obviously wasteful, since every
 * round here is at the same course.
 *
 * Reads are capped rather than unbounded. The Spark plan allows 50k reads a day,
 * which this will never trouble, but an unbounded fan-out over a growing history
 * is the kind of thing that is fine for a year and then is not.
 */

/** How many rounds back the history screen goes. */
export const HISTORY_LIMIT = 20

export interface RoundHistoryEntry extends PlayedRound {
  readonly round: Round
  readonly players: readonly RoundPlayer[]
  readonly scorecardHoles: readonly ScorecardHole[]
}

/**
 * Every round this player has been in, newest first, ready to render.
 *
 * A round that cannot be loaded is dropped rather than failing the whole screen:
 * a deleted round should cost you that one row, not your entire history.
 */
export async function loadPlayerHistory(
  uid: string,
  limit: number = HISTORY_LIMIT,
): Promise<RoundHistoryEntry[]> {
  const refs = (await listPlayerRounds(uid)).slice(0, limit)

  // One fetch per course, not per round. Firestore serves repeats from cache
  // anyway, but this also avoids the round trip when offline.
  const holesByCourse = new Map<string, Promise<StoredHole[]>>()
  const holesFor = (courseId: string): Promise<StoredHole[]> => {
    const existing = holesByCourse.get(courseId)
    if (existing !== undefined) return existing
    const loading = loadHoles(courseId).catch(() => [] as StoredHole[])
    holesByCourse.set(courseId, loading)
    return loading
  }

  const entries = await Promise.all(
    refs.map(async (ref): Promise<RoundHistoryEntry | null> => {
      try {
        const [round, players, scores, holes] = await Promise.all([
          loadRound(ref.roundId),
          loadPlayers(ref.roundId),
          loadScores(ref.roundId),
          holesFor(ref.courseId),
        ])
        if (round === null) return null

        const scorecardHoles = toHolePars(holes, round.teeId)
        return {
          roundId: ref.roundId,
          courseId: ref.courseId,
          playedAt: ref.joinedAt,
          holes: scorecardHoles,
          scores,
          round,
          players,
          scorecardHoles,
        }
      } catch {
        return null
      }
    }),
  )

  return entries.filter((entry): entry is RoundHistoryEntry => entry !== null)
}
