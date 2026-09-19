import { distanceForDisplay, nearest, type LatLng } from '../../lib/geo'
import type { StoredHole } from '../../lib/courseData'

/**
 * Working out which hole you are standing on, and keeping that from fighting you.
 *
 * Pure functions only — no React, no browser. The awkward parts of hole detection
 * are all decisions (is this close enough to count? should an automatic guess be
 * allowed to move the screen under the player's thumb?) and decisions are exactly
 * what deserves a test with an exact right answer.
 */

export type AnchorKind = 'green' | 'tee'

export interface HoleAnchor {
  readonly holeNumber: number
  readonly kind: AnchorKind
  /** Named `position` so `nearest` from lib/geo can consume it directly. */
  readonly position: LatLng
}

export interface HoleDetection {
  readonly holeNumber: number
  /** Which end of the hole was nearest — useful copy: "on the 7th tee". */
  readonly kind: AnchorKind
  readonly metres: number
}

/**
 * How far from a tee or green you can be and still be counted as on that hole.
 *
 * Trangie's longest hole is 512 m, so mid-fairway there puts you ~256 m from both
 * ends of the hole you are actually playing. 300 m keeps that case detected while
 * still refusing to guess when someone opens the screen from home.
 */
export const DETECTION_RANGE_M = 300

/**
 * Every mapped point that identifies a hole.
 *
 * Both ends count. Greens alone would flip you to the next hole while you were
 * still walking off the last one, and tees alone would lose you for the whole
 * approach — which is precisely when you want a yardage.
 */
export function holeAnchors(holes: readonly StoredHole[]): HoleAnchor[] {
  const anchors: HoleAnchor[] = []
  for (const hole of holes) {
    if (hole.green) {
      anchors.push({ holeNumber: hole.number, kind: 'green', position: hole.green.center })
    }
    if (hole.tee) {
      anchors.push({ holeNumber: hole.number, kind: 'tee', position: hole.tee.center })
    }
  }
  return anchors
}

/**
 * The hole you are most likely on, or null when nothing is close enough to claim.
 *
 * Returning null rather than "hole 1, 40 km away" is the point: a wrong hole shown
 * confidently is worse than no hole at all.
 */
export function detectHole(
  position: LatLng,
  holes: readonly StoredHole[],
  rangeMetres: number = DETECTION_RANGE_M,
): HoleDetection | null {
  const best = nearest(position, holeAnchors(holes))
  if (best === null || best.metres > rangeMetres) return null
  return {
    holeNumber: best.item.holeNumber,
    kind: best.item.kind,
    metres: Math.round(best.metres),
  }
}

/**
 * Metres to the centre of the green — the only distance this app promises (§4.3).
 *
 * Null when the hole has no mapped green, which is a real state: the course mapper
 * may not have been run, or run only partway.
 */
export function distanceToGreen(position: LatLng, hole: StoredHole | undefined): number | null {
  if (!hole?.green) return null
  return distanceForDisplay(position, hole.green.center)
}

/* ------------------------------------------------------------------ *
 * Which hole the screen is showing
 * ------------------------------------------------------------------ */

export type HoleSelectionSource = 'initial' | 'auto' | 'manual'

export interface HoleSelection {
  readonly holeNumber: number
  /** Whether GPS is still allowed to move the screen. */
  readonly autoEnabled: boolean
  readonly source: HoleSelectionSource
}

export type HoleSelectionEvent =
  /** GPS thinks you are on this hole. */
  | { readonly type: 'detected'; readonly holeNumber: number }
  /** The player tapped a hole. */
  | { readonly type: 'pick'; readonly holeNumber: number }
  /** The player handed control back to the GPS. */
  | { readonly type: 'enable-auto' }

export const initialHoleSelection = (holeNumber = 1): HoleSelection => ({
  holeNumber,
  autoEnabled: true,
  source: 'initial',
})

/**
 * The rule that stops auto-detect and the player fighting each other.
 *
 * A player standing between the 9th green and the 10th tee will see detection flip
 * back and forth. If they have gone looking for the 12th to check its yardage, the
 * screen must stay on the 12th. So one manual tap switches auto-detect off for the
 * rest of the round unless it is deliberately turned back on — silence, not a
 * timer, because a timer would hand control back at the moment they stopped
 * looking at the phone.
 */
export function reduceHoleSelection(
  state: HoleSelection,
  event: HoleSelectionEvent,
): HoleSelection {
  switch (event.type) {
    case 'detected':
      if (!state.autoEnabled) return state
      if (state.holeNumber === event.holeNumber && state.source === 'auto') return state
      return { holeNumber: event.holeNumber, autoEnabled: true, source: 'auto' }

    case 'pick':
      if (state.holeNumber === event.holeNumber && !state.autoEnabled) return state
      return { holeNumber: event.holeNumber, autoEnabled: false, source: 'manual' }

    case 'enable-auto':
      if (state.autoEnabled) return state
      // Stays on the current hole until a fix says otherwise, so re-enabling never
      // yanks the screen somewhere on the strength of a stale position.
      return { ...state, autoEnabled: true }
  }
}
