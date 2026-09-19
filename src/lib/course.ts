import { z } from 'zod'
import type { LatLng } from './geo'

/*
 * The course model.
 *
 * Schemas are the source of truth and the TypeScript types are derived from them,
 * so there is exactly one definition to keep in step. Course data arrives from a
 * hand transcription, from OpenStreetMap, and from an admin tapping a map - three
 * routes with three different ways of being wrong - so it is validated at the
 * boundary rather than trusted.
 */

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/** Which set of tees a player is using. Trangie prints two. */
export const teeIdSchema = z.enum(['mens', 'ladies'])
export type TeeId = z.infer<typeof teeIdSchema>

const HOLE_MIN = 1
const HOLE_MAX = 18

export const holeNumberSchema = z.number().int().min(HOLE_MIN).max(HOLE_MAX)

/** Per-tee figures for a single hole, straight off the scorecard. */
export const teeHoleSchema = z.object({
  metres: z.number().int().positive().max(700),
  par: z.number().int().min(3).max(6),
  strokeIndex: holeNumberSchema,
  /**
   * Trangie's card prints a second index (e.g. "1/19") used for competitions over
   * more than 18 holes. Carried through so the card can be reproduced faithfully,
   * but unused by scoring.
   */
  secondIndex: z.number().int().positive().nullable().optional(),
})
export type TeeHole = z.infer<typeof teeHoleSchema>

export const holeSchema = z.object({
  number: holeNumberSchema,
  mens: teeHoleSchema,
  ladies: teeHoleSchema,
  matchIndex: holeNumberSchema,
})
export type Hole = z.infer<typeof holeSchema>

export const teeSetSchema = z.object({
  id: teeIdSchema,
  label: z.string().min(1),
  totalMetres: z.number().int().positive(),
  outMetres: z.number().int().positive(),
  inMetres: z.number().int().positive(),
  totalPar: z.number().int().positive(),
  outPar: z.number().int().positive(),
  inPar: z.number().int().positive(),
})
export type TeeSet = z.infer<typeof teeSetSchema>

export const scorecardSchema = z
  .object({
    courseId: z.string().min(1),
    name: z.string().min(1),
    club: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
    holeCount: z.literal(18),
    units: z.literal('metres'),
    ratings: z.object({ acr: z.number(), alcr: z.number() }).optional(),
    tees: z.array(teeSetSchema).min(1),
    holes: z.array(holeSchema).length(18),
  })
  .superRefine((card, ctx) => {
    // The printed Out/In/Total rows are a checksum the club already computed for
    // us. A transcription that does not reconcile is a typo, not a course.
    const holes = card.holes
    const front = holes.slice(0, 9)
    const back = holes.slice(9)
    const total = <T>(rows: readonly T[], pick: (row: T) => number) =>
      rows.reduce((sum, row) => sum + pick(row), 0)

    const numbers = holes.map((h) => h.number)
    if (new Set(numbers).size !== 18) {
      ctx.addIssue({ code: 'custom', message: 'holes must be numbered 1-18 with no repeats' })
    }

    for (const tee of card.tees) {
      const id = tee.id
      const checks: Array<[string, number, number]> = [
        [`${id} out metres`, total(front, (h) => h[id].metres), tee.outMetres],
        [`${id} in metres`, total(back, (h) => h[id].metres), tee.inMetres],
        [`${id} total metres`, total(holes, (h) => h[id].metres), tee.totalMetres],
        [`${id} out par`, total(front, (h) => h[id].par), tee.outPar],
        [`${id} in par`, total(back, (h) => h[id].par), tee.inPar],
        [`${id} total par`, total(holes, (h) => h[id].par), tee.totalPar],
      ]
      for (const [label, got, want] of checks) {
        if (got !== want) {
          ctx.addIssue({ code: 'custom', message: `${label} is ${got} but the card prints ${want}` })
        }
      }

      const indexes = holes.map((h) => h[id].strokeIndex)
      if (new Set(indexes).size !== 18) {
        ctx.addIssue({ code: 'custom', message: `${id} stroke index must use each of 1-18 exactly once` })
      }
    }

    const matchIndexes = holes.map((h) => h.matchIndex)
    if (new Set(matchIndexes).size !== 18) {
      ctx.addIssue({ code: 'custom', message: 'match index must use each of 1-18 exactly once' })
    }
  })
export type Scorecard = z.infer<typeof scorecardSchema>

/** What OSM gives us: an anonymous shape that a human still has to name. */
export const courseFeatureSchema = z.object({
  osmId: z.string(),
  kind: z.enum(['green', 'tee', 'fairway', 'bunker', 'water_hazard', 'clubhouse', 'rough', 'path']),
  center: latLngSchema,
  polygon: z.array(latLngSchema).min(3),
  /**
   * Null until an admin assigns it in the course mapper. OpenStreetMap carries no
   * hole numbering for Trangie, and this null is the honest representation of that
   * gap - it must not default to a guess.
   */
  hole: holeNumberSchema.nullable(),
})
export type CourseFeature = z.infer<typeof courseFeatureSchema>

export const courseGeometrySchema = z.object({
  courseId: z.string().min(1),
  name: z.string().min(1),
  fetchedAt: z.string(),
  source: z.string(),
  licence: z.string(),
  features: z.array(courseFeatureSchema),
})
export type CourseGeometry = z.infer<typeof courseGeometrySchema>

/** A hole with everything the hole screen needs, once data and geometry are joined. */
export interface PlayableHole {
  readonly number: number
  readonly par: number
  readonly strokeIndex: number
  readonly metres: number
  /** Null where OSM has no green for this hole — 2 of Trangie's 18. */
  readonly greenCentre: LatLng | null
  readonly teeCentre: LatLng | null
}

/**
 * Joins a scorecard to its geometry for one tee set.
 *
 * Holes with no mapped green come back with `greenCentre: null` rather than being
 * dropped: hole 12 must still appear on the scorecard even if we cannot give a
 * yardage for it.
 */
export function buildPlayableHoles(
  scorecard: Scorecard,
  geometry: CourseGeometry,
  teeId: TeeId,
): PlayableHole[] {
  const greenByHole = new Map<number, LatLng>()
  const teeByHole = new Map<number, LatLng>()

  for (const feature of geometry.features) {
    if (feature.hole === null) continue
    if (feature.kind === 'green') greenByHole.set(feature.hole, feature.center)
    if (feature.kind === 'tee') teeByHole.set(feature.hole, feature.center)
  }

  return scorecard.holes.map((hole) => ({
    number: hole.number,
    par: hole[teeId].par,
    strokeIndex: hole[teeId].strokeIndex,
    metres: hole[teeId].metres,
    greenCentre: greenByHole.get(hole.number) ?? null,
    teeCentre: teeByHole.get(hole.number) ?? null,
  }))
}
