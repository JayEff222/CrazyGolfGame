import { useEffect, useState } from 'react'
import { subscribeAllHands, subscribeHand, type Hand } from '../../lib/hands'
import type { CardVisibility } from '../../lib/rounds'

/*
 * The live view of who is holding what.
 *
 * Your own hand is always subscribed on its own, even on an open round where the
 * collection listener would also carry it. That listener is the one the security
 * rules can refuse - REQUIREMENTS §4.4, a secret round means secret - and if the
 * refusal took your own cards down with it you would be locked out of your hand
 * by someone else's setting.
 */

export interface HandsState {
  /** The signed-in player's hand, or null before the first snapshot. */
  readonly hand: Hand | null
  /** Everyone else's hands. Always empty on a secret round. */
  readonly otherHands: readonly Hand[]
  /** True until your own hand has arrived. */
  readonly loading: boolean
  /** Set when the round is open but the other hands could not be read. */
  readonly otherHandsError: string | null
}

interface HandsSnapshot {
  readonly key: string
  readonly hand: Hand | null
  readonly all: readonly Hand[]
  readonly loadedHand: boolean
  readonly error: string | null
}

const emptySnapshot = (key: string): HandsSnapshot => ({
  key,
  hand: null,
  all: [],
  loadedHand: false,
  error: null,
})

/**
 * A refused read is the expected outcome on a secret round, so it is worded as a
 * fact about the round rather than as a fault. Anything else is a signal problem.
 */
function describeHandsFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'code')) : ''
  if (code.includes('permission-denied')) {
    return 'Other hands are hidden — this round is not set to open hands.'
  }
  return 'Could not load the other players’ hands. Check your signal.'
}

export function useHands(
  roundId: string,
  selfUid: string,
  visibility: CardVisibility,
): HandsState {
  const key = `${roundId}:${selfUid}:${visibility}`
  const [snapshot, setSnapshot] = useState<HandsSnapshot>(() => emptySnapshot(key))

  useEffect(() => {
    // Stamped with the key it was read under, so switching round or visibility
    // reads as "loading" during the render that follows rather than showing one
    // round's cards under another round's heading.
    const apply = (change: (previous: HandsSnapshot) => HandsSnapshot) => {
      setSnapshot((previous) => change(previous.key === key ? previous : emptySnapshot(key)))
    }

    const unsubscribeHand = subscribeHand(roundId, selfUid, (hand) => {
      apply((previous) => ({ ...previous, hand, loadedHand: true }))
    })

    if (visibility !== 'open') {
      return () => {
        unsubscribeHand()
      }
    }

    const unsubscribeAll = subscribeAllHands(
      roundId,
      (all) => apply((previous) => ({ ...previous, all, error: null })),
      (error) => apply((previous) => ({ ...previous, all: [], error: describeHandsFailure(error) })),
    )

    return () => {
      unsubscribeHand()
      unsubscribeAll()
    }
  }, [roundId, selfUid, visibility, key])

  const current = snapshot.key === key ? snapshot : emptySnapshot(key)

  return {
    hand: current.hand,
    otherHands: current.all.filter((h) => h.uid !== selfUid),
    loading: !current.loadedHand,
    otherHandsError: current.error,
  }
}
