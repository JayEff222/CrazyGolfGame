import { useEffect, useMemo, useReducer, useState } from 'react'
import { HoleMap } from './HoleMap'
import { useGeolocation, ACCURACY_WARNING_M } from './useGeolocation'
import { useWakeLock } from './useWakeLock'
import {
  detectHole,
  distanceToGreen,
  initialHoleSelection,
  reduceHoleSelection,
} from './holeDetection'
import { loadCourse, loadHoles, type StoredCourse, type StoredHole } from '../../lib/courseData'

/**
 * The yardage screen: how far to the middle of the green, and a picture of where
 * you are standing.
 *
 * Deliberately standalone. It needs a course and a GPS, nothing else - no round,
 * no other players - so it can be opened on a practice round, or by one person
 * walking the course on their own, long before the round lifecycle exists.
 *
 * Sunlight rules the layout: the distance is the largest thing on the screen, the
 * controls are along the bottom where a thumb reaches, and everything is dark ink
 * on a light ground because a dark theme washes out completely at midday.
 */

interface YardageScreenProps {
  readonly courseId?: string
}

const HOLE_NUMBERS = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index + 1)

export function YardageScreen({ courseId = 'trangie' }: YardageScreenProps) {
  const [course, setCourse] = useState<StoredCourse | null>(null)
  const [holes, setHoles] = useState<StoredHole[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selection, dispatch] = useReducer(reduceHoleSelection, undefined, () =>
    initialHoleSelection(1),
  )

  // Mounting the screen turns the GPS on; unmounting turns it off. That is the
  // whole of requirement 4.3's "GPS only runs while the distance screen is open".
  const { status, fix, error, permission, start } = useGeolocation()
  const wakeLock = useWakeLock(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [storedCourse, storedHoles] = await Promise.all([
          loadCourse(courseId),
          loadHoles(courseId),
        ])
        if (cancelled) return
        setCourse(storedCourse)
        setHoles(storedHoles)
      } catch (caught) {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'Could not load the course.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  const detected = useMemo(
    () => (fix && holes ? detectHole(fix.position, holes) : null),
    [fix, holes],
  )

  useEffect(() => {
    if (detected === null) return
    // A no-op while the player is driving the hole number by hand - the reducer
    // owns that rule, so a stray fix can never move the screen under their thumb.
    dispatch({ type: 'detected', holeNumber: detected.holeNumber })
  }, [detected])

  const holeCount = course?.holeCount ?? holes?.length ?? 18
  const hole = holes?.find((h) => h.number === selection.holeNumber)
  const metresToGreen = fix ? distanceToGreen(fix.position, hole) : null
  const accuracy = fix ? Math.round(fix.accuracyMetres) : null
  const accuracyIsPoor = accuracy !== null && accuracy > ACCURACY_WARNING_M

  const step = (delta: number) => {
    const next = selection.holeNumber + delta
    if (next < 1 || next > holeCount) return
    dispatch({ type: 'pick', holeNumber: next })
  }

  const distanceLine = (() => {
    if (metresToGreen !== null) return `${metresToGreen}`
    if (hole && !hole.green) return '—'
    if (status === 'unsupported') return '—'
    return '…'
  })()

  const distanceNote = (() => {
    if (metresToGreen !== null) return 'to the middle of the green'
    if (hole && !hole.green) return `Hole ${selection.holeNumber} has no green mapped yet`
    if (error) return error.message
    if (holes === null) return 'Loading the course…'
    return 'Finding you…'
  })()

  if (loadError !== null) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10">
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 font-semibold text-chaos-600">
          {loadError}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-3 px-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-fairway-700">
          {course?.name ?? 'Course'}
        </h1>
        {hole && (
          <p className="text-sm font-semibold text-fairway-800">
            Par {hole.mens.par} · {hole.mens.metres} m · SI {hole.mens.strokeIndex}
          </p>
        )}
      </header>

      {/* The number the whole screen exists for. */}
      <section
        aria-live="polite"
        className="rounded-2xl bg-fairway-700 px-5 py-4 text-white"
      >
        <p className="text-sm font-semibold tracking-wide text-fairway-100 uppercase">
          Hole {selection.holeNumber}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-7xl font-bold tabular-nums">{distanceLine}</span>
          <span className="text-2xl font-bold text-fairway-100">m</span>
        </p>
        <p className="text-sm font-medium text-fairway-100">{distanceNote}</p>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded-lg px-3 py-1 font-semibold ${
            accuracyIsPoor
              ? 'bg-flag-500/25 text-flag-600'
              : 'bg-fairway-100 text-fairway-800'
          }`}
        >
          {accuracy === null ? 'GPS: no fix yet' : `GPS accuracy ±${accuracy} m`}
        </span>
        {accuracyIsPoor && (
          <span className="text-fairway-800">Weak signal — treat the distance as a guide.</span>
        )}
        {permission === 'denied' && (
          <button
            type="button"
            onClick={start}
            className="tap-target rounded-lg bg-chaos-500 px-4 font-bold text-white"
          >
            Retry location
          </button>
        )}
        {error !== null && error.recoverable && permission !== 'denied' && (
          <button
            type="button"
            onClick={start}
            className="tap-target rounded-lg border-2 border-fairway-300 px-4 font-semibold text-fairway-800"
          >
            Try again
          </button>
        )}
      </div>

      <div className="h-[38vh] min-h-56 overflow-hidden rounded-2xl border-2 border-fairway-200">
        <HoleMap
          hole={hole}
          playerPosition={fix?.position ?? null}
          accuracyMetres={fix?.accuracyMetres ?? null}
        />
      </div>

      <p className="text-xs text-fairway-700">
        Imagery © Esri · Course data © OpenStreetMap contributors (ODbL)
      </p>

      {/* Hole control, kept at the bottom so it falls under the thumb. */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={selection.holeNumber <= 1}
            aria-label="Previous hole"
            className="tap-target flex-1 rounded-xl bg-fairway-100 text-2xl font-bold text-fairway-800 disabled:opacity-40"
          >
            −
          </button>
          <p className="min-w-24 text-center font-display text-2xl font-bold text-fairway-900">
            Hole {selection.holeNumber}
          </p>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={selection.holeNumber >= holeCount}
            aria-label="Next hole"
            className="tap-target flex-1 rounded-xl bg-fairway-100 text-2xl font-bold text-fairway-800 disabled:opacity-40"
          >
            +
          </button>
        </div>

        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Choose a hole"
        >
          {HOLE_NUMBERS(holeCount).map((number) => (
            <button
              key={number}
              type="button"
              aria-pressed={number === selection.holeNumber}
              onClick={() => dispatch({ type: 'pick', holeNumber: number })}
              className={`tap-target shrink-0 rounded-xl px-1 text-lg font-bold ${
                number === selection.holeNumber
                  ? 'bg-fairway-700 text-white'
                  : 'bg-fairway-100 text-fairway-800'
              }`}
            >
              {number}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={selection.autoEnabled}
          onClick={() =>
            selection.autoEnabled
              ? // Pinning the current hole is the same gesture as picking it: it
                // switches auto-detect off and leaves the screen where it is.
                dispatch({ type: 'pick', holeNumber: selection.holeNumber })
              : dispatch({ type: 'enable-auto' })
          }
          className={`tap-target rounded-xl px-4 text-base font-bold ${
            selection.autoEnabled
              ? 'bg-fairway-100 text-fairway-800'
              : 'border-2 border-fairway-300 text-fairway-800'
          }`}
        >
          {selection.autoEnabled ? 'Auto hole: on — tap to lock this hole' : 'Auto hole: off — tap to follow the GPS again'}
        </button>

        <p className="text-sm text-fairway-700">
          {selection.autoEnabled
            ? detected
              ? `GPS puts you at the ${detected.kind} of hole ${detected.holeNumber}, ${detected.metres} m away.`
              : 'GPS has not placed you on a hole yet.'
            : 'You picked this hole, so the GPS will not change it.'}
          {!wakeLock.supported && ' Your browser will not hold the screen awake.'}
        </p>
      </section>
    </main>
  )
}
