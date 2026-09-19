import type { TeeId } from '../../lib/course'
import type { StoredHole } from '../../lib/courseData'
import type { HolePar } from '../../lib/leaderboard'
import type { HoleScore } from '../../lib/rounds'

/*
 * Scorecard arithmetic and the small vocabulary the scoring screens share.
 *
 * Pure functions over plain data, kept out of the components so the sums can be
 * proved directly. The leaderboard maths lives in lib/leaderboard.ts and is not
 * duplicated here - this file only covers what a printed scorecard adds up
 * (out, in, total) and the naming a golfer expects to see on screen.
 */

/** A hole can be scored in one, and nobody has ever needed a 16. */
export const MIN_STROKES = 1
export const MAX_STROKES = 15

/** Trangie, like most courses, turns after nine. */
export const FRONT_NINE_END = 9

/**
 * What the scoring screens need to know about a hole.
 *
 * `HolePar` is the minimum; metres and stroke index are printed on the scorecard
 * when they are available. `PlayableHole` from lib/course.ts satisfies this, so a
 * caller that has already joined scorecard to geometry can pass its holes straight in.
 */
export interface ScorecardHole extends HolePar {
  readonly metres?: number
  readonly strokeIndex?: number
}

/** Flattens stored holes onto the tee set actually being played. */
export function toHolePars(holes: readonly StoredHole[], teeId: TeeId): ScorecardHole[] {
  return holes
    .map((hole) => ({
      number: hole.number,
      par: hole[teeId].par,
      metres: hole[teeId].metres,
      strokeIndex: hole[teeId].strokeIndex,
    }))
    .sort((a, b) => a.number - b.number)
}

export function clampStrokes(strokes: number): number {
  if (!Number.isFinite(strokes)) return MIN_STROKES
  return Math.min(MAX_STROKES, Math.max(MIN_STROKES, Math.round(strokes)))
}

/**
 * What a golfer calls this score out loud.
 *
 * An ace is named for the stroke, not the difference: a one on a par 3 is a hole
 * in one, never a "two under".
 */
export function scoreTerm(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole in one'
  const diff = strokes - par
  switch (diff) {
    case -3:
      return 'Albatross'
    case -2:
      return 'Eagle'
    case -1:
      return 'Birdie'
    case 0:
      return 'Par'
    case 1:
      return 'Bogey'
    case 2:
      return 'Double bogey'
    case 3:
      return 'Triple bogey'
    default:
      return diff > 0 ? `${diff} over par` : `${Math.abs(diff)} under par`
  }
}

/**
 * The scores most likely to be tapped on this hole: one under through three over.
 *
 * Covers the overwhelming majority of amateur scores in a single tap. Anything
 * wilder is reachable on the stepper, which is the right trade - a rare 9 costing
 * three extra presses is better than shrinking the buttons everyone hits.
 */
export function quickPicks(par: number): number[] {
  const picks: number[] = []
  for (let strokes = par - 1; strokes <= par + 3; strokes++) {
    const clamped = clampStrokes(strokes)
    if (!picks.includes(clamped)) picks.push(clamped)
  }
  return picks
}

/** Keys a score lookup by player and hole, so a grid cell is a map read. */
export const scoreKey = (uid: string, hole: number) => `${uid}_${hole}`

export function indexScores(scores: readonly HoleScore[]): Map<string, number> {
  return new Map(scores.map((s) => [scoreKey(s.uid, s.hole), s.strokes]))
}

export interface PlayerTotals {
  /** Holes 1-9. */
  readonly out: number
  /** Holes 10-18. `in` is a reserved word, so the back nine is `back`. */
  readonly back: number
  readonly total: number
  readonly holesPlayed: number
}

/**
 * Adds up one player's card.
 *
 * Only counts holes that have actually been scored, so a card mid-round reads as
 * the golf played so far rather than implying a string of zeros.
 */
export function playerTotals(scores: readonly HoleScore[], uid: string): PlayerTotals {
  let out = 0
  let back = 0
  let holesPlayed = 0

  for (const score of scores) {
    if (score.uid !== uid) continue
    holesPlayed++
    if (score.hole <= FRONT_NINE_END) out += score.strokes
    else back += score.strokes
  }

  return { out, back, total: out + back, holesPlayed }
}

/** Par for a stretch of holes, for the par row of the scorecard. */
export function parTotal(holes: readonly HolePar[], from: number, to: number): number {
  return holes
    .filter((hole) => hole.number >= from && hole.number <= to)
    .reduce((sum, hole) => sum + hole.par, 0)
}

/**
 * Scorecard shorthand for how a hole went, used to tint a cell.
 *
 * Broadcast convention: under par stands out, par is quiet, over par is plain.
 */
export type ScoreTone = 'eagle' | 'birdie' | 'par' | 'bogey' | 'worse'

export function scoreTone(strokes: number, par: number): ScoreTone {
  const diff = strokes - par
  if (diff <= -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  return 'worse'
}
