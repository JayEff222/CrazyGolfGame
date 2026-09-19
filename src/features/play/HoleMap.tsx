import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'
import type { StoredHole } from '../../lib/courseData'

type Point = [number, number]

const toPoint = (p: LatLng): Point => [p.lat, p.lng]

/**
 * Keeps both you and the green on screen as the hole changes or you walk.
 *
 * `MapContainer` reads `center` and `zoom` once, at mount, so re-framing has to
 * happen from inside the map. Fitting to the points that matter beats following
 * the player at a fixed zoom: on a 500 m par 5 a fixed zoom either loses the green
 * off the top of the screen or renders you as a dot on a green paddock.
 */
function FitToHole({ points }: { points: readonly Point[] }) {
  const map = useMap()

  // Bounds are compared by value: a new array every render would re-fit the map
  // on every GPS tick and make it impossible to pinch-zoom.
  const key = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|')

  useEffect(() => {
    const [first] = points
    if (first === undefined) return
    if (points.length === 1) {
      map.setView(first, 18)
      return
    }
    map.fitBounds([...points], { padding: [36, 36], maxZoom: 18 })
    // `key` is the value-identity of `points`; `points` itself changes every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])

  return null
}

export interface HoleMapProps {
  readonly hole: StoredHole | undefined
  readonly playerPosition: LatLng | null
  /** Reported GPS accuracy, drawn as a halo so a poor fix looks poor. */
  readonly accuracyMetres?: number | null
}

/**
 * Satellite view of one hole: where you are, where the green is, and its shape
 * where OpenStreetMap traced one.
 *
 * Markers are circles rather than Leaflet's default pin because the default icon
 * is a bundled PNG that breaks under Vite's asset handling, and because a circle
 * sits over the exact point instead of above it.
 */
export function HoleMap({ hole, playerPosition, accuracyMetres }: HoleMapProps) {
  const green = hole?.green ?? null
  const tee = hole?.tee ?? null

  const focus = useMemo<Point[]>(() => {
    const points: Point[] = []
    if (playerPosition) points.push(toPoint(playerPosition))
    if (green) points.push(toPoint(green.center))
    // The tee only frames the shot when you have no fix of your own; once the GPS
    // is up, the useful frame is you-to-green, not the whole hole.
    if (!playerPosition && tee) points.push(toPoint(tee.center))
    return points
  }, [playerPosition, green, tee])

  const initialCentre: Point = focus[0] ?? [-32.0394, 147.9733]

  if (!green && !playerPosition) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-fairway-100 px-6 text-center">
        <p className="font-semibold text-fairway-800">
          No green mapped for this hole yet, and no GPS fix to show.
        </p>
      </div>
    )
  }

  return (
    <MapContainer
      center={initialCentre}
      zoom={17}
      className="h-full w-full"
      scrollWheelZoom
      attributionControl
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Imagery &copy; Esri · Course data &copy; OpenStreetMap contributors (ODbL)"
        maxZoom={19}
      />
      <FitToHole points={focus} />

      {green && green.polygon.length > 0 && (
        <Polygon
          positions={green.polygon.map(toPoint)}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#3DA35D', fillOpacity: 0.45 }}
        />
      )}

      {green && (
        <CircleMarker
          center={toPoint(green.center)}
          radius={10}
          pathOptions={{ color: '#ffffff', fillColor: '#F2A900', fillOpacity: 1, weight: 3 }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]} className="!border-0 !bg-transparent !shadow-none">
            <span className="text-base font-bold text-white drop-shadow">Green</span>
          </Tooltip>
        </CircleMarker>
      )}

      {playerPosition && accuracyMetres != null && accuracyMetres > 0 && (
        // Drawn in metres, so the halo grows when the fix is poor - the honest way
        // to show that the number on the readout is a guess.
        <CircleMarker
          center={toPoint(playerPosition)}
          radius={Math.min(40, Math.max(8, accuracyMetres))}
          pathOptions={{ color: '#046A38', weight: 1, fillColor: '#046A38', fillOpacity: 0.15 }}
        />
      )}

      {playerPosition && (
        <CircleMarker
          center={toPoint(playerPosition)}
          radius={9}
          pathOptions={{ color: '#ffffff', fillColor: '#046A38', fillOpacity: 1, weight: 3 }}
        >
          <Tooltip permanent direction="bottom" offset={[0, 10]} className="!border-0 !bg-transparent !shadow-none">
            <span className="text-base font-bold text-white drop-shadow">You</span>
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  )
}
