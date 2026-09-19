import { useEffect, useState } from 'react'
import type { Round } from '../../lib/rounds'
import { loadHoles, type StoredHole } from '../../lib/courseData'
import { RoundScoring, toHolePars } from '../scoring'

/**
 * The playing view, once a round has started.
 *
 * This is the join between Phase 3 and Phase 4: the lobby knows which round and
 * which tee set, the scoring components need hole pars, and this loads the one
 * from the other. Holes are fetched once per round rather than subscribed to -
 * course data does not change mid-round, and a live listener out on a course
 * would be a wasted radio wake-up every few seconds.
 */
export function InProgressRound({ round, selfUid }: { round: Round; selfUid: string }) {
  const [holes, setHoles] = useState<StoredHole[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadHoles(round.courseId)
        if (!cancelled) setHoles(loaded)
      } catch {
        if (!cancelled) setError('Could not load the course. Check your signal.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [round.courseId])

  if (error !== null) {
    return (
      <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-chaos-600">
        {error}
      </p>
    )
  }

  if (holes === null) {
    return <p className="px-1 py-3 text-base text-fairway-700">Loading the course…</p>
  }

  return (
    <RoundScoring
      roundId={round.id}
      selfUid={selfUid}
      holes={toHolePars(holes, round.teeId)}
    />
  )
}
