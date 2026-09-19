import { describe, it, expect } from 'vitest'
import {
  distanceMetres,
  distanceForDisplay,
  bearingDegrees,
  centroid,
  nearest,
  type LatLng,
} from '../../src/lib/geo'

/*
 * These assertions use cases whose answers are known independently of the
 * implementation, rather than values copied out of a first run - otherwise the
 * test only proves the code still does whatever it did the first time.
 *
 * On a sphere of mean radius 6,371,008.8 m, one degree of latitude spans
 * R * pi/180 = 111,195 m. That figure is the anchor for the cases below.
 */

const ONE_DEGREE_M = 111_195

describe('distanceMetres', () => {
  it('is zero for the same point', () => {
    const p: LatLng = { lat: -32.0394, lng: 147.9733 }
    expect(distanceMetres(p, p)).toBe(0)
  })

  it('matches the known length of one degree of latitude', () => {
    const d = distanceMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeCloseTo(ONE_DEGREE_M, -1) // within 10 m
  })

  it('matches one degree of longitude at the equator', () => {
    const d = distanceMetres({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    expect(d).toBeCloseTo(ONE_DEGREE_M, -1)
  })

  it('shrinks a degree of longitude by cos(latitude) at 60 degrees south', () => {
    // At 60 degrees, a degree of longitude covers half what it does at the equator.
    const d = distanceMetres({ lat: -60, lng: 0 }, { lat: -60, lng: 1 })
    expect(d).toBeCloseTo(ONE_DEGREE_M * 0.5, -1)
  })

  it('is commutative', () => {
    const a: LatLng = { lat: -32.0394, lng: 147.9733 }
    const b: LatLng = { lat: -32.0451, lng: 147.9781 }
    expect(distanceMetres(a, b)).toBeCloseTo(distanceMetres(b, a), 9)
  })

  it('is never negative', () => {
    const a: LatLng = { lat: -32.04, lng: 147.97 }
    const b: LatLng = { lat: 51.5, lng: -0.12 }
    expect(distanceMetres(a, b)).toBeGreaterThan(0)
  })

  it('handles the antimeridian without blowing up', () => {
    // One degree apart in longitude, but either side of the date line.
    const d = distanceMetres({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })
    expect(d).toBeCloseTo(ONE_DEGREE_M, -1)
  })

  it('gives a sane yardage across a real Trangie hole', () => {
    // Two mapped green centroids at opposite ends of the course. The course is
    // roughly a kilometre across, so anything outside 500-2000 m means the maths
    // or the units are wrong.
    const northGreen: LatLng = { lat: -32.039762, lng: 147.973841 }
    const southGreen: LatLng = { lat: -32.04668, lng: 147.97677 }
    const d = distanceMetres(northGreen, southGreen)
    expect(d).toBeGreaterThan(500)
    expect(d).toBeLessThan(2000)
  })
})

describe('distanceForDisplay', () => {
  it('rounds to whole metres', () => {
    const d = distanceForDisplay({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 })
    expect(Number.isInteger(d)).toBe(true)
  })

  it('does not imply precision the GPS cannot deliver', () => {
    const d = distanceForDisplay({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBe(Math.round(distanceMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })))
  })
})

describe('bearingDegrees', () => {
  it('reads 0 due north', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 6)
  })

  it('reads 90 due east', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 6)
  })

  it('reads 180 due south', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 6)
  })

  it('reads 270 due west', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: -1 })).toBeCloseTo(270, 6)
  })

  it('always returns a value in [0, 360)', () => {
    const points: LatLng[] = [
      { lat: 1, lng: 1 },
      { lat: -1, lng: 1 },
      { lat: -1, lng: -1 },
      { lat: 1, lng: -1 },
    ]
    for (const p of points) {
      const b = bearingDegrees({ lat: 0, lng: 0 }, p)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(360)
    }
  })
})

describe('centroid', () => {
  it('returns null for an empty ring, so missing geometry cannot pass silently', () => {
    expect(centroid([])).toBeNull()
  })

  it('returns the point itself for a single vertex', () => {
    expect(centroid([{ lat: -32, lng: 147 }])).toEqual({ lat: -32, lng: 147 })
  })

  it('finds the middle of a square', () => {
    const square: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ]
    expect(centroid(square)).toEqual({ lat: 1, lng: 1 })
  })
})

describe('nearest', () => {
  const holes = [
    { name: 'one', position: { lat: 0, lng: 0 } },
    { name: 'two', position: { lat: 0, lng: 1 } },
    { name: 'three', position: { lat: 0, lng: 5 } },
  ]

  it('returns null when there is nothing to choose from', () => {
    expect(nearest({ lat: 0, lng: 0 }, [])).toBeNull()
  })

  it('picks the closest candidate', () => {
    const result = nearest({ lat: 0, lng: 0.9 }, holes)
    expect(result?.item.name).toBe('two')
  })

  it('reports how far away the winner is', () => {
    const result = nearest({ lat: 0, lng: 0 }, holes)
    expect(result?.item.name).toBe('one')
    expect(result?.metres).toBe(0)
  })

  it('handles a tie deterministically by taking the first', () => {
    const tied = [
      { name: 'left', position: { lat: 0, lng: -1 } },
      { name: 'right', position: { lat: 0, lng: 1 } },
    ]
    expect(nearest({ lat: 0, lng: 0 }, tied)?.item.name).toBe('left')
  })
})
