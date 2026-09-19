import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  loadGeometry,
  loadHoles,
  saveAssignments,
  manualShape,
  toMappedShape,
  type Assignment,
  type StoredHole,
} from '../../lib/courseData'
import type { CourseFeature } from '../../lib/course'
import { distanceMetres, type LatLng } from '../../lib/geo'

type Kind = 'green' | 'tee'

/** How far a computed tee-to-green distance may sit from the card before we flag it. */
const DISTANCE_TOLERANCE_M = 25

/** Catches taps on open ground so a missing green can be pinned by hand. */
function PinDropper({ enabled, onPick }: { enabled: boolean; onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      if (enabled) onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

/**
 * Assigns map shapes to hole numbers.
 *
 * OpenStreetMap has most of Trangie's greens and tees as anonymous polygons - nobody
 * ever numbered them - but not all of them: two greens and a tee simply are not in
 * OSM at all. Those get a pin dropped on the satellite image instead. A centre point
 * is all a yardage needs; the traced polygon only ever made the map prettier.
 *
 * The check that makes this trustworthy is the table at the bottom. Once a hole has
 * both a tee and a green - traced or pinned, it makes no difference - the distance
 * between them is compared against the metres printed on the scorecard. A mis-tap
 * shows up as an obviously wrong row while mapping, rather than as a bad yardage
 * discovered on the course.
 */
export function CourseMapper({ courseId = 'trangie' }: { courseId?: string }) {
  const [features, setFeatures] = useState<CourseFeature[] | null>(null)
  const [holes, setHoles] = useState<StoredHole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('green')
  const [currentHole, setCurrentHole] = useState(1)
  const [assignment, setAssignment] = useState<Assignment>({})
  const [pinMode, setPinMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [geometry, storedHoles] = await Promise.all([
          loadGeometry(courseId),
          loadHoles(courseId),
        ])
        if (cancelled) return
        setFeatures(geometry.features)
        setHoles(storedHoles)

        // Resume where a previous session left off rather than starting over.
        const existing: Assignment = {}
        for (const hole of storedHoles) {
          if (hole.green || hole.tee) {
            existing[hole.number] = {
              green: hole.green ?? undefined,
              tee: hole.tee ?? undefined,
            }
          }
        }
        setAssignment(existing)
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load the course.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  const holeCount = holes.length || 18
  const holeInfo = holes.find((h) => h.number === currentHole)

  const candidates = useMemo(() => (features ?? []).filter((f) => f.kind === kind), [features, kind])

  const usedOsmIds = useMemo(() => {
    const ids = new Set<string>()
    for (const shapes of Object.values(assignment)) {
      if (shapes.green?.osmId) ids.add(shapes.green.osmId)
      if (shapes.tee?.osmId) ids.add(shapes.tee.osmId)
    }
    return ids
  }, [assignment])

  const centre = useMemo<[number, number]>(() => {
    if (!features || features.length === 0) return [-32.0394, 147.9733]
    const lat = features.reduce((s, f) => s + f.center.lat, 0) / features.length
    const lng = features.reduce((s, f) => s + f.center.lng, 0) / features.length
    return [lat, lng]
  }, [features])

  const setShape = (shape: Assignment[number][Kind], advance: boolean) => {
    setAssignment((current) => ({
      ...current,
      [currentHole]: { ...current[currentHole], [kind]: shape },
    }))
    setSaved(false)
    if (advance && currentHole < holeCount) setCurrentHole(currentHole + 1)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveAssignments(courseId, assignment)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const checks = useMemo(
    () =>
      holes.map((hole) => {
        const shapes = assignment[hole.number]
        if (!shapes?.green || !shapes?.tee) {
          return { hole: hole.number, card: hole.mens.metres, mapped: null, delta: null }
        }
        const mapped = Math.round(distanceMetres(shapes.tee.center, shapes.green.center))
        return { hole: hole.number, card: hole.mens.metres, mapped, delta: mapped - hole.mens.metres }
      }),
    [holes, assignment],
  )

  const flagged = checks.filter((c) => c.delta !== null && Math.abs(c.delta) > DISTANCE_TOLERANCE_M)
  const assignedCount = Object.values(assignment).filter((s) => s[kind]).length
  const missing = holes.filter((h) => !assignment[h.number]?.[kind]).map((h) => h.number)

  // Pins already dropped, so they can be seen and re-tapped.
  const manualPins = useMemo(
    () =>
      Object.entries(assignment)
        .map(([hole, shapes]) => ({ hole: Number(hole), shape: shapes[kind] }))
        .filter((entry): entry is { hole: number; shape: NonNullable<typeof entry.shape> } =>
          entry.shape?.manual === true,
        ),
    [assignment, kind],
  )

  if (error !== null && features === null) return <p className="p-6 text-chaos-600">{error}</p>
  if (features === null) return <p className="p-6 text-fairway-700">Loading the course…</p>

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-fairway-700">Course mapper</h1>
        <p className="text-sm text-fairway-800">
          Tap shapes in playing order. Where OpenStreetMap has nothing, drop a pin instead.
        </p>
      </header>

      <div className="flex gap-2" role="tablist" aria-label="What to assign">
        {(['green', 'tee'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={kind === option}
            onClick={() => {
              setKind(option)
              setCurrentHole(1)
            }}
            className={`tap-target flex-1 rounded-lg px-4 font-semibold ${
              kind === option ? 'bg-fairway-700 text-white' : 'bg-fairway-100 text-fairway-800'
            }`}
          >
            {option === 'green' ? 'Greens' : 'Tees'}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-fairway-100 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-bold text-fairway-900">
            Hole {currentHole} — {kind}
          </p>
          <div className="flex gap-1">
            {[-1, 1].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() =>
                  setCurrentHole(Math.min(holeCount, Math.max(1, currentHole + step)))
                }
                className="tap-target rounded-lg bg-white px-3 font-bold text-fairway-800"
                aria-label={step < 0 ? 'Previous hole' : 'Next hole'}
              >
                {step < 0 ? '−' : '+'}
              </button>
            ))}
          </div>
        </div>
        {holeInfo && (
          <p className="text-sm text-fairway-800">
            Par {holeInfo.mens.par} · {holeInfo.mens.metres} m · stroke index {holeInfo.mens.strokeIndex}
          </p>
        )}
        <p className="mt-1 text-sm text-fairway-700">
          {assignedCount} of {holeCount} {kind}s assigned
          {missing.length > 0 && ` · still missing: ${missing.join(', ')}`}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPinMode(!pinMode)}
        aria-pressed={pinMode}
        className={`tap-target rounded-xl px-4 text-base font-bold ${
          pinMode ? 'bg-flag-500 text-fairway-900' : 'border-2 border-fairway-300 text-fairway-800'
        }`}
      >
        {pinMode ? `Pin mode ON — tap the map to place hole ${currentHole}'s ${kind}` : 'Drop a pin by hand'}
      </button>
      {pinMode && (
        <p className="-mt-2 text-sm text-fairway-700">
          Use this where OpenStreetMap has no shape. Tap the middle of the {kind}; on your
          annotated map that is the arrow head. Turn pin mode off to go back to tapping shapes.
        </p>
      )}

      <div className="h-[55vh] overflow-hidden rounded-xl border-2 border-fairway-200">
        <MapContainer center={centre} zoom={16} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Imagery &copy; Esri · Course data &copy; OpenStreetMap contributors (ODbL)"
            maxZoom={19}
          />
          <PinDropper
            enabled={pinMode}
            onPick={(point) => setShape(manualShape(kind, currentHole, point), false)}
          />
          {candidates.map((feature) => {
            const assignedTo = Object.entries(assignment).find(
              ([, shapes]) => shapes[kind]?.osmId === feature.osmId,
            )?.[0]
            const isUsed = usedOsmIds.has(feature.osmId)
            return (
              <Polygon
                key={feature.osmId}
                positions={feature.polygon.map((p) => [p.lat, p.lng] as [number, number])}
                pathOptions={{
                  color: isUsed ? '#F2A900' : '#E8541E',
                  weight: 3,
                  fillOpacity: isUsed ? 0.65 : 0.4,
                }}
                eventHandlers={{
                  click: () => {
                    if (!pinMode) setShape(toMappedShape(feature), true)
                  },
                }}
              >
                {assignedTo && (
                  <Tooltip permanent direction="center" className="!border-0 !bg-transparent !shadow-none">
                    <span className="text-base font-bold text-white drop-shadow">{assignedTo}</span>
                  </Tooltip>
                )}
              </Polygon>
            )
          })}
          {manualPins.map(({ hole, shape }) => (
            <CircleMarker
              key={shape.osmId}
              center={[shape.center.lat, shape.center.lng]}
              radius={11}
              pathOptions={{ color: '#ffffff', fillColor: '#F2A900', fillOpacity: 0.9, weight: 3 }}
            >
              <Tooltip permanent direction="center" className="!border-0 !bg-transparent !shadow-none">
                <span className="text-base font-bold text-white drop-shadow">{hole}</span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <section className="rounded-xl border-2 border-fairway-200 p-4">
        <h2 className="font-display text-lg font-bold text-fairway-800">Check against the scorecard</h2>
        <p className="mb-3 text-sm text-fairway-700">
          Once a hole has both a tee and a green, the distance between them should be close to the
          printed metres. More than {DISTANCE_TOLERANCE_M} m out usually means a mis-tap.
        </p>
        {flagged.length > 0 && (
          <p className="mb-3 rounded-lg bg-chaos-500/10 px-3 py-2 text-sm font-semibold text-chaos-600">
            {flagged.length} hole{flagged.length === 1 ? '' : 's'} look wrong:{' '}
            {flagged.map((f) => f.hole).join(', ')}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-fairway-700">
                <th className="py-1 pr-3">Hole</th>
                <th className="py-1 pr-3">Card</th>
                <th className="py-1 pr-3">Mapped</th>
                <th className="py-1">Diff</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr
                  key={check.hole}
                  className={
                    check.delta !== null && Math.abs(check.delta) > DISTANCE_TOLERANCE_M
                      ? 'font-semibold text-chaos-600'
                      : 'text-fairway-900'
                  }
                >
                  <td className="py-1 pr-3 font-semibold">{check.hole}</td>
                  <td className="py-1 pr-3">{check.card} m</td>
                  <td className="py-1 pr-3">{check.mapped === null ? '—' : `${check.mapped} m`}</td>
                  <td className="py-1">
                    {check.delta === null ? '—' : `${check.delta > 0 ? '+' : ''}${check.delta} m`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-chaos-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="tap-target rounded-xl bg-fairway-700 text-lg font-bold text-white active:bg-fairway-800 disabled:opacity-60"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save to the course'}
      </button>
    </div>
  )
}
