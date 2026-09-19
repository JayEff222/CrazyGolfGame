import { describe, it, expect } from 'vitest'
import {
  DETECTION_RANGE_M,
  detectHole,
  distanceToGreen,
  holeAnchors,
  initialHoleSelection,
  reduceHoleSelection,
  type HoleSelection,
} from '../../src/features/play/holeDetection'
import type { MappedShape, StoredHole } from '../../src/lib/courseData'
import type { LatLng } from '../../src/lib/geo'

/*
 * Coordinates here are built from a base point plus an offset in degrees, so every
 * expected distance can be worked out on paper rather than copied from a run.
 * One degree of latitude is 111,195 m on the sphere lib/geo uses, so 0.001 degrees
 * of latitude is 111.195 m due north. Every case below is a multiple of that.
 */
const BASE: LatLng = { lat: -32.04, lng: 147.97 }
const ONE_DEGREE_M = 111_195

const north = (metres: number): LatLng => ({
  lat: BASE.lat + metres / ONE_DEGREE_M,
  lng: BASE.lng,
})

const shape = (center: LatLng, polygon: LatLng[] = []): MappedShape => ({
  center,
  polygon,
  osmId: `test:${center.lat},${center.lng}`,
})

const hole = (
  number: number,
  green: MappedShape | null,
  tee: MappedShape | null,
): StoredHole => ({
  number,
  mens: { metres: 300, par: 4, strokeIndex: number },
  ladies: { metres: 280, par: 4, strokeIndex: number },
  green,
  tee,
})

/** Hole 1 tee at the base, green 200 m north; hole 2 tee 250 m north, green 600 m north. */
const COURSE: StoredHole[] = [
  hole(1, shape(north(200)), shape(north(0))),
  hole(2, shape(north(600)), shape(north(250))),
]

describe('holeAnchors', () => {
  it('yields both ends of every mapped hole', () => {
    const anchors = holeAnchors(COURSE)
    expect(anchors).toHaveLength(4)
    expect(anchors.map((a) => `${a.holeNumber}${a.kind[0]}`)).toEqual(['1g', '1t', '2g', '2t'])
  })

  it('skips ends that were never mapped', () => {
    const anchors = holeAnchors([hole(7, null, shape(north(0))), hole(8, null, null)])
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toMatchObject({ holeNumber: 7, kind: 'tee' })
  })

  it('is empty for a course with no geometry at all', () => {
    expect(holeAnchors([])).toEqual([])
  })
})

describe('detectHole', () => {
  it('picks the tee you are standing on', () => {
    const detection = detectHole(north(5), COURSE)
    expect(detection).toEqual({ holeNumber: 1, kind: 'tee', metres: 5 })
  })

  it('picks the green you are putting on', () => {
    const detection = detectHole(north(195), COURSE)
    expect(detection).toEqual({ holeNumber: 1, kind: 'green', metres: 5 })
  })

  it('prefers the nearer of two holes that overlap', () => {
    // 220 m north is 20 m past hole 1's green and 30 m short of hole 2's tee.
    expect(detectHole(north(220), COURSE)).toMatchObject({ holeNumber: 1, kind: 'green' })
    // 240 m north flips it: 40 m past hole 1's green, 10 m short of hole 2's tee.
    expect(detectHole(north(240), COURSE)).toMatchObject({ holeNumber: 2, kind: 'tee' })
  })

  it('still finds the hole from the middle of a long fairway', () => {
    // Hole 2 is 350 m tee to green; its midpoint is 175 m from each end.
    expect(detectHole(north(425), COURSE)).toMatchObject({ holeNumber: 2 })
  })

  it('refuses to guess when nothing is within range', () => {
    // 20 km north of the course: the nearest anchor is far outside the range.
    expect(detectHole(north(20_000), COURSE)).toBeNull()
  })

  it('detects up to the range and not past it', () => {
    // One lonely anchor at the base point, so the nearest distance is the offset.
    const single = [hole(1, shape(BASE), null)]
    expect(detectHole(north(DETECTION_RANGE_M - 1), single)).not.toBeNull()
    expect(detectHole(north(DETECTION_RANGE_M + 1), single)).toBeNull()
  })

  it('honours a caller-supplied range', () => {
    expect(detectHole(north(50), COURSE, 10)).toBeNull()
    expect(detectHole(north(50), COURSE, 60)).toMatchObject({ holeNumber: 1, kind: 'tee' })
  })

  it('returns null when no hole has any geometry', () => {
    expect(detectHole(BASE, [hole(1, null, null)])).toBeNull()
  })
})

describe('distanceToGreen', () => {
  it('measures to the centre of the green, in whole metres', () => {
    expect(distanceToGreen(BASE, COURSE[0])).toBe(200)
  })

  it('is null for a hole with no mapped green', () => {
    expect(distanceToGreen(BASE, hole(3, null, shape(BASE)))).toBeNull()
  })

  it('is null when the hole itself is missing', () => {
    expect(distanceToGreen(BASE, undefined)).toBeNull()
  })

  it('ignores the polygon and uses the stored centre', () => {
    // A green whose traced outline sits nowhere near its recorded centre still
    // measures to the centre - that is the point the scorecard was checked against.
    const odd = hole(4, shape(north(100), [north(9000), north(9100)]), null)
    expect(distanceToGreen(BASE, odd)).toBe(100)
  })
})

describe('reduceHoleSelection', () => {
  const auto: HoleSelection = initialHoleSelection(1)

  it('starts on hole 1 with auto-detect on', () => {
    expect(auto).toEqual({ holeNumber: 1, autoEnabled: true, source: 'initial' })
  })

  it('follows the GPS while auto-detect is on', () => {
    const next = reduceHoleSelection(auto, { type: 'detected', holeNumber: 4 })
    expect(next).toEqual({ holeNumber: 4, autoEnabled: true, source: 'auto' })
  })

  it('switches auto-detect off the moment the player picks a hole', () => {
    const next = reduceHoleSelection(auto, { type: 'pick', holeNumber: 12 })
    expect(next).toEqual({ holeNumber: 12, autoEnabled: false, source: 'manual' })
  })

  it('never lets the GPS move a hand-picked hole', () => {
    const picked = reduceHoleSelection(auto, { type: 'pick', holeNumber: 12 })
    const afterFixes = [3, 4, 5].reduce(
      (state, holeNumber) => reduceHoleSelection(state, { type: 'detected', holeNumber }),
      picked,
    )
    expect(afterFixes).toBe(picked)
  })

  it('hands control back only when auto-detect is turned on again', () => {
    const picked = reduceHoleSelection(auto, { type: 'pick', holeNumber: 12 })
    const resumed = reduceHoleSelection(picked, { type: 'enable-auto' })
    expect(resumed).toEqual({ holeNumber: 12, autoEnabled: true, source: 'manual' })

    const moved = reduceHoleSelection(resumed, { type: 'detected', holeNumber: 5 })
    expect(moved).toEqual({ holeNumber: 5, autoEnabled: true, source: 'auto' })
  })

  it('re-enabling auto does not jump the hole on its own', () => {
    const picked = reduceHoleSelection(auto, { type: 'pick', holeNumber: 12 })
    expect(reduceHoleSelection(picked, { type: 'enable-auto' }).holeNumber).toBe(12)
  })

  it('is stable when the GPS repeats the hole it already chose', () => {
    const detected = reduceHoleSelection(auto, { type: 'detected', holeNumber: 6 })
    expect(reduceHoleSelection(detected, { type: 'detected', holeNumber: 6 })).toBe(detected)
  })

  it('is stable when the player re-taps the hole they are already locked to', () => {
    const picked = reduceHoleSelection(auto, { type: 'pick', holeNumber: 9 })
    expect(reduceHoleSelection(picked, { type: 'pick', holeNumber: 9 })).toBe(picked)
  })

  it('locks the current hole when the player taps the hole the GPS chose', () => {
    // This is the "pin this hole" gesture: same number, but auto-detect goes off.
    const detected = reduceHoleSelection(auto, { type: 'detected', holeNumber: 6 })
    const pinned = reduceHoleSelection(detected, { type: 'pick', holeNumber: 6 })
    expect(pinned).toEqual({ holeNumber: 6, autoEnabled: false, source: 'manual' })
  })

  it('is stable when auto is already on', () => {
    expect(reduceHoleSelection(auto, { type: 'enable-auto' })).toBe(auto)
  })

  it('does not mutate the state it was given', () => {
    const before = { ...auto }
    reduceHoleSelection(auto, { type: 'pick', holeNumber: 3 })
    expect(auto).toEqual(before)
  })
})
