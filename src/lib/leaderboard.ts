import type { HoleScore, RoundPlayer } from './rounds'

/*
 * Leaderboard maths.
 *
 * Pure functions over plain data, deliberately knowing nothing about React or
 * Firestore, because the awkward cases here are all arithmetic: a player who has
 * skipped a hole, a round in progress where nobody has finished, and ties.
 */

export interface HolePar {
  readonly number: number
  readonly par: number
}

export interface LeaderboardRow {
  readonly uid: string
  readonly displayName: string
  /** Strokes over the holes this player has actually scored. */
  readonly strokes: number
  /** Holes scored so far — "thru 7". */
  readonly holesPlayed: number
  /**
   * Strokes relative to the par of the holes played, not of the whole course.
   * A player level after 7 holes is E, not 64 under.
   */
  readonly toPar: number
  /** Position, sharing a number on a tie (1, 2, 2, 4). */
  readonly position: number
}

/**
 * Builds the live leaderboard.
 *
 * Ranks on to-par, not on total strokes, which matters more than it sounds.
 * Ranking by strokes means a player who has not teed off sits top on zero and
 * drops to last the moment they score - and mid-round, a player thru 3 would
 * always beat one thru 12 regardless of how either is playing. To-par is how real
 * leaderboards do it, and it makes the not-yet-started player level, mid-table,
 * which is also correct.
 */
export function computeLeaderboard(
  players: readonly RoundPlayer[],
  scores: readonly HoleScore[],
  holes: readonly HolePar[],
): LeaderboardRow[] {
  const parByHole = new Map(holes.map((h) => [h.number, h.par]))

  const rows = players.map((player) => {
    const own = scores.filter((s) => s.uid === player.uid)
    const strokes = own.reduce((sum, s) => sum + s.strokes, 0)
    const parPlayed = own.reduce((sum, s) => sum + (parByHole.get(s.hole) ?? 0), 0)
    return {
      uid: player.uid,
      displayName: player.displayName,
      strokes,
      holesPlayed: own.length,
      toPar: strokes - parPlayed,
    }
  })

  // Best to-par first. On equal to-par the player who has played more holes ranks
  // higher, since they have held that score over more golf.
  const sorted = [...rows].sort((a, b) => {
    if (a.toPar !== b.toPar) return a.toPar - b.toPar
    if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed
    return a.displayName.localeCompare(b.displayName)
  })

  const sameRank = (
    a: Omit<LeaderboardRow, 'position'>,
    b: Omit<LeaderboardRow, 'position'>,
  ) => a.toPar === b.toPar && a.holesPlayed === b.holesPlayed

  return sorted.map((row, index) => {
    // Standard competition ranking: equal scores share a position and the next
    // position skips accordingly (1, 2, 2, 4).
    let first = index
    while (first > 0 && sameRank(sorted[first - 1]!, row)) first--
    return { ...row, position: first + 1 }
  })
}

/** Formats a to-par figure the way a scoreboard does: E, +3, −2. */
export function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E'
  return toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`
}

/** The lowest-numbered hole this player has not yet scored, or null when finished. */
export function nextUnscoredHole(
  scores: readonly HoleScore[],
  uid: string,
  holeCount = 18,
): number | null {
  const played = new Set(scores.filter((s) => s.uid === uid).map((s) => s.hole))
  for (let hole = 1; hole <= holeCount; hole++) {
    if (!played.has(hole)) return hole
  }
  return null
}
