/**
 * Geodesy for "how far to the pin".
 *
 * A golf hole is at most ~500 m long, so the difference between a spherical
 * earth and a proper ellipsoid model is far below the ~10 m of noise a phone GPS
 * gives us anyway. Haversine is the right tool: exact enough, cheap enough to run
 * on every position update, and simple enough to test.
 */

export interface LatLng {
  readonly lat: number
  readonly lng: number
}

/** Mean earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * Great-circle distance between two points, in metres.
 *
 * Commutative and always non-negative.
 */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Distance rounded to whole metres — what actually goes on screen.
 *
 * Showing "137.4 m" from a sensor accurate to ±10 m is false precision, and on a
 * sunlit phone screen the decimal is just noise.
 */
export function distanceForDisplay(a: LatLng, b: LatLng): number {
  return Math.round(distanceMetres(a, b))
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from true north (0–360).
 *
 * Used to orient the hole map so the green is always "up" — which is how a golfer
 * thinks about a hole, rather than north-up like a road map.
 */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLng = toRadians(b.lng - a.lng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

/**
 * Centroid of a polygon's vertices.
 *
 * This is the mean of the vertices rather than a true area centroid. Greens are
 * small and roughly convex, so the two agree to well within GPS noise, and the
 * simpler version has no degenerate cases to guard against.
 *
 * Returns null for an empty ring so callers must deal with missing geometry —
 * which is a real case here: OSM has only 16 of Trangie's 18 greens.
 */
export function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null

  let lat = 0
  let lng = 0
  for (const p of points) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / points.length, lng: lng / points.length }
}

/**
 * Picks the nearest point from a list, for auto-detecting which hole you're on.
 *
 * Returns null for an empty list.
 */
export function nearest<T extends { readonly position: LatLng }>(
  from: LatLng,
  candidates: readonly T[],
): { item: T; metres: number } | null {
  let best: { item: T; metres: number } | null = null

  for (const candidate of candidates) {
    const metres = distanceMetres(from, candidate.position)
    if (best === null || metres < best.metres) {
      best = { item: candidate, metres }
    }
  }
  return best
}
