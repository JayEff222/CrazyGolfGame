import { collection, deleteDoc, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

/*
 * Thumbs up / thumbs down on the cards.
 *
 * This is how Q-3 gets answered - "which of the cards actually work" - without
 * anyone having to remember an opinion until the drive home. The deck is a
 * researched guess until the group has played with it, and a tally is the
 * cheapest way to find out which cards to rewrite.
 *
 * Votes live in one flat collection rather than a subcollection per card, so the
 * whole tally is a single query instead of one per card. The document id is
 * `{cardId}_{uid}`, which makes "one vote per player per card" a property of the
 * path - there is no way to hold two, and the security rules check the id
 * matches the voter, so nobody can write into somebody else's slot.
 */

export type Vote = 'up' | 'down'

export interface VoteTally {
  readonly up: number
  readonly down: number
  /** This player's own vote, so the button can show as pressed. */
  readonly mine: Vote | null
}

export const EMPTY_TALLY: VoteTally = { up: 0, down: 0, mine: null }

const votesRef = () => collection(db, 'cardVotes')

/** The id encodes the rule: one vote, per card, per player. */
export const voteId = (cardId: string, uid: string) => `${cardId}_${uid}`

/**
 * Tallies every vote in one read, keyed by card id.
 *
 * Cards with no votes are simply absent from the map; callers fall back to
 * EMPTY_TALLY rather than this fabricating a row for all forty cards.
 */
export async function loadVoteTallies(selfUid: string): Promise<Map<string, VoteTally>> {
  const snapshot = await getDocs(votesRef())
  const tallies = new Map<string, VoteTally>()

  for (const document of snapshot.docs) {
    const data = document.data()
    const cardId = typeof data.cardId === 'string' ? data.cardId : null
    const vote = data.vote === 'up' || data.vote === 'down' ? (data.vote as Vote) : null
    if (cardId === null || vote === null) continue

    const current = tallies.get(cardId) ?? EMPTY_TALLY
    tallies.set(cardId, {
      up: current.up + (vote === 'up' ? 1 : 0),
      down: current.down + (vote === 'down' ? 1 : 0),
      mine: data.uid === selfUid ? vote : current.mine,
    })
  }

  return tallies
}

/**
 * Casts, changes or clears a vote.
 *
 * Passing the vote already held clears it, so the same button both votes and
 * un-votes. Tapping thumbs-up twice is far more likely to mean "actually, no
 * opinion" than to mean "yes, twice".
 */
export async function castVote(
  cardId: string,
  uid: string,
  vote: Vote | null,
): Promise<void> {
  const ref = doc(votesRef(), voteId(cardId, uid))

  if (vote === null) {
    await deleteDoc(ref)
    return
  }

  await setDoc(ref, { cardId, uid, vote, at: serverTimestamp() })
}

/** What a tap on a thumb should do, given what is already held. */
export function nextVote(current: Vote | null, tapped: Vote): Vote | null {
  return current === tapped ? null : tapped
}

/**
 * Applies a vote to a tally without re-reading Firestore.
 *
 * The screen updates on tap rather than after a round trip - out on a course the
 * round trip may never come, and a thumb that does not visibly move gets tapped
 * again. Kept pure so the arithmetic of switching a vote from up to down (which
 * has to move two counters, not one) can be proved directly.
 */
export function applyVote(tally: VoteTally, vote: Vote | null): VoteTally {
  const withoutMine = {
    up: tally.up - (tally.mine === 'up' ? 1 : 0),
    down: tally.down - (tally.mine === 'down' ? 1 : 0),
  }

  return {
    up: withoutMine.up + (vote === 'up' ? 1 : 0),
    down: withoutMine.down + (vote === 'down' ? 1 : 0),
    mine: vote,
  }
}
