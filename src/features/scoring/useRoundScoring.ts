import { useCallback, useEffect, useState } from 'react'
import {
  setScore,
  subscribePlayers,
  subscribeScores,
  type HoleScore,
  type RoundPlayer,
} from '../../lib/rounds'
import { clampStrokes } from './scorecardTotals'

/*
 * The only part of the scoring feature that talks to Firestore.
 *
 * Everything else takes players and scores as props, so the screens can be
 * rendered from fixtures and dropped beside the GPS panel without dragging a
 * round subscription in with them.
 *
 * Two deliberate decisions:
 *
 * 1. `saveScore` cannot name another player. REQUIREMENTS.md §4.2 says you enter
 *    your own score, and the security rules enforce it, so the uid is taken from
 *    the hook's own argument rather than from the caller. A bug in a component
 *    then cannot produce a write that Firestore would reject.
 *
 * 2. The write is not awaited. With offline persistence on, `setDoc` does not
 *    settle until the server acknowledges it - so awaiting it out of signal would
 *    leave a spinner up for the rest of the round. The queued write still lands
 *    in the local snapshot immediately, which is what the player sees, and it
 *    syncs on reconnect (CLAUDE.md hard constraint 4).
 */

export interface RoundScoringState {
  readonly players: readonly RoundPlayer[]
  readonly scores: readonly HoleScore[]
  /** True until both subscriptions have delivered their first snapshot. */
  readonly loading: boolean
  readonly error: string | null
  readonly saveScore: (hole: number, strokes: number) => void
}

/*
 * Everything the subscriptions produce is held in one object stamped with the
 * round it came from. Switching rounds then reads as "loading" immediately,
 * derived during render, rather than needing an effect to reset three pieces of
 * state - which would be a cascading render and, briefly, one round's scores
 * shown under another round's id.
 */
interface RoundSnapshot {
  readonly roundId: string
  readonly players: readonly RoundPlayer[]
  readonly scores: readonly HoleScore[]
  readonly loadedPlayers: boolean
  readonly loadedScores: boolean
}

const emptySnapshot = (roundId: string): RoundSnapshot => ({
  roundId,
  players: [],
  scores: [],
  loadedPlayers: false,
  loadedScores: false,
})

function describeWriteFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'code')) : ''
  if (code.includes('permission-denied')) {
    return 'That score was refused — you can only enter your own score.'
  }
  return 'Could not save that score. Check you are still signed in and try again.'
}

export function useRoundScoring(roundId: string, selfUid: string): RoundScoringState {
  const [snapshot, setSnapshot] = useState<RoundSnapshot>(() => emptySnapshot(roundId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const apply = (change: (previous: RoundSnapshot) => RoundSnapshot) => {
      setSnapshot((previous) =>
        change(previous.roundId === roundId ? previous : emptySnapshot(roundId)),
      )
    }

    const unsubscribePlayers = subscribePlayers(roundId, (players) => {
      apply((previous) => ({ ...previous, players, loadedPlayers: true }))
    })
    const unsubscribeScores = subscribeScores(roundId, (scores) => {
      apply((previous) => ({ ...previous, scores, loadedScores: true }))
    })

    return () => {
      unsubscribePlayers()
      unsubscribeScores()
    }
  }, [roundId])

  const saveScore = useCallback(
    (hole: number, strokes: number) => {
      setError(null)
      setScore(roundId, { uid: selfUid, hole, strokes: clampStrokes(strokes) }, selfUid).catch(
        (failure: unknown) => {
          setError(describeWriteFailure(failure))
        },
      )
    },
    [roundId, selfUid],
  )

  const current = snapshot.roundId === roundId ? snapshot : emptySnapshot(roundId)

  return {
    players: current.players,
    scores: current.scores,
    loading: !current.loadedPlayers || !current.loadedScores,
    error,
    saveScore,
  }
}
