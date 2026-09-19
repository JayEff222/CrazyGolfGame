import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  scorecardSchema,
  courseGeometrySchema,
  buildPlayableHoles,
  type Scorecard,
} from '../../src/lib/course'

/*
 * The most valuable assertion here is that the REAL Trangie files parse. A schema
 * that only ever sees hand-written fixtures proves nothing about the data the app
 * actually loads.
 */

const realScorecard = JSON.parse(
  readFileSync('data/courses/trangie/scorecard.json', 'utf8'),
) as unknown

const realGeometry = JSON.parse(
  readFileSync('data/courses/trangie/geometry.json', 'utf8'),
) as unknown

describe('the real Trangie scorecard', () => {
  it('parses against the schema', () => {
    const result = scorecardSchema.safeParse(realScorecard)
    if (!result.success) console.error(result.error.issues)
    expect(result.success).toBe(true)
  })

  it('is par 71 over 5998 m off the mens tees', () => {
    const card = scorecardSchema.parse(realScorecard)
    const mens = card.tees.find((t) => t.id === 'mens')
    expect(mens?.totalPar).toBe(71)
    expect(mens?.totalMetres).toBe(5998)
  })

  it('has the stroke-1 hole as the 411 m opener', () => {
    const card = scorecardSchema.parse(realScorecard)
    const hardest = card.holes.find((h) => h.mens.strokeIndex === 1)
    expect(hardest?.number).toBe(1)
    expect(hardest?.mens.metres).toBe(411)
  })
})

describe('the real Trangie geometry', () => {
  it('parses against the schema', () => {
    const result = courseGeometrySchema.safeParse(realGeometry)
    if (!result.success) console.error(result.error.issues)
    expect(result.success).toBe(true)
  })

  it('has 16 greens and 17 tees, none yet assigned to a hole', () => {
    const geometry = courseGeometrySchema.parse(realGeometry)
    const greens = geometry.features.filter((f) => f.kind === 'green')
    const tees = geometry.features.filter((f) => f.kind === 'tee')
    expect(greens).toHaveLength(16)
    expect(tees).toHaveLength(17)
    // Until the course mapper runs, every shape is anonymous. If this ever fails
    // because something got assigned, that is progress - update the number.
    expect(geometry.features.every((f) => f.hole === null)).toBe(true)
  })
})

describe('scorecard validation catches transcription errors', () => {
  const valid = scorecardSchema.parse(realScorecard)
  const clone = (): Scorecard => JSON.parse(JSON.stringify(valid)) as Scorecard

  it('rejects a card whose hole metres do not sum to the printed total', () => {
    const broken = clone()
    broken.holes[0]!.mens.metres = 999
    const result = scorecardSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('rejects a card whose par does not sum to the printed total', () => {
    const broken = clone()
    broken.holes[3]!.mens.par = 6
    const result = scorecardSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('rejects a duplicated stroke index', () => {
    const broken = clone()
    // Keep the sums intact so only the index rule can fire.
    broken.holes[1]!.mens.strokeIndex = broken.holes[0]!.mens.strokeIndex
    const result = scorecardSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })

  it('rejects a card with the wrong number of holes', () => {
    const broken = clone()
    broken.holes.pop()
    expect(scorecardSchema.safeParse(broken).success).toBe(false)
  })
})

describe('buildPlayableHoles', () => {
  const card = scorecardSchema.parse(realScorecard)
  const geometry = courseGeometrySchema.parse(realGeometry)

  it('returns all 18 holes even though only 16 greens are mapped', () => {
    const holes = buildPlayableHoles(card, geometry, 'mens')
    expect(holes).toHaveLength(18)
  })

  it('leaves greenCentre null while nothing is assigned, rather than guessing', () => {
    const holes = buildPlayableHoles(card, geometry, 'mens')
    expect(holes.every((h) => h.greenCentre === null)).toBe(true)
  })

  it('carries the right par and metres for the chosen tee set', () => {
    const mens = buildPlayableHoles(card, geometry, 'mens')
    const ladies = buildPlayableHoles(card, geometry, 'ladies')
    // Hole 1 is a par 4 of 411 m for men, a par 5 of 407 m for women.
    expect(mens[0]).toMatchObject({ number: 1, par: 4, metres: 411 })
    expect(ladies[0]).toMatchObject({ number: 1, par: 5, metres: 407 })
  })

  it('attaches a green once a feature is assigned to a hole', () => {
    const assigned = structuredClone(geometry)
    const firstGreen = assigned.features.find((f) => f.kind === 'green')!
    firstGreen.hole = 7

    const holes = buildPlayableHoles(card, assigned, 'mens')
    const seventh = holes.find((h) => h.number === 7)
    expect(seventh?.greenCentre).toEqual(firstGreen.center)
    expect(holes.find((h) => h.number === 8)?.greenCentre).toBeNull()
  })
})
