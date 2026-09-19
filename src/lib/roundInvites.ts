import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

/*
 * "Come and play this round."
 *
 * One document per round per invitee, at `{roundId}_{toUid}`, so inviting the
 * same person twice updates one document rather than filling their screen with
 * duplicates. A flat collection rather than a subcollection under the round,
 * because the person who needs to find these is the invitee - and a
 * collection-group query across every round's invites would need its own index
 * and would let anyone enumerate every invitation in the app.
 *
 * Note what is deliberately NOT enforced: the rules do not require the two
 * players to be friends. Anyone holding a four-character room code can already
 * walk into a round, so a stricter rule on invitations than on the front door
 * would be theatre. What the rules do enforce is that you can only invite as
 * yourself, and only into a round you are actually in.
 */

export type InviteStatus = 'pending' | 'accepted' | 'declined'

export interface RoundInvite {
  readonly id: string
  readonly roundId: string
  readonly toUid: string
  readonly fromUid: string
  /** Denormalised so the invite reads as a name without a second lookup. */
  readonly fromName: string
  readonly roomCode: string
  readonly courseId: string
  readonly status: InviteStatus
  /** Milliseconds since the epoch, or null while the timestamp settles. */
  readonly at: number | null
}

const invitesRef = () => collection(db, 'roundInvites')

export const inviteId = (roundId: string, toUid: string) => `${roundId}_${toUid}`

function readInvite(id: string, data: Record<string, unknown>): RoundInvite | null {
  const roundId = typeof data.roundId === 'string' ? data.roundId : null
  const toUid = typeof data.toUid === 'string' ? data.toUid : null
  if (roundId === null || toUid === null) return null

  const at = data.at as Timestamp | null | undefined
  const status = data.status
  return {
    id,
    roundId,
    toUid,
    fromUid: String(data.fromUid ?? ''),
    fromName: String(data.fromName ?? 'Someone'),
    roomCode: String(data.roomCode ?? ''),
    courseId: String(data.courseId ?? ''),
    status:
      status === 'accepted' || status === 'declined'
        ? status
        : ('pending' satisfies InviteStatus),
    at: at?.toMillis?.() ?? null,
  }
}

export interface SendInviteInput {
  readonly roundId: string
  readonly toUid: string
  readonly fromUid: string
  readonly fromName: string
  readonly roomCode: string
  readonly courseId: string
}

export async function sendRoundInvite(input: SendInviteInput): Promise<void> {
  await setDoc(doc(invitesRef(), inviteId(input.roundId, input.toUid)), {
    roundId: input.roundId,
    toUid: input.toUid,
    fromUid: input.fromUid,
    fromName: input.fromName,
    roomCode: input.roomCode,
    courseId: input.courseId,
    status: 'pending' satisfies InviteStatus,
    at: serverTimestamp(),
  })
}

/** Invitations waiting on this player. */
export async function loadMyInvites(uid: string): Promise<RoundInvite[]> {
  const snapshot = await getDocs(
    query(invitesRef(), where('toUid', '==', uid), where('status', '==', 'pending')),
  )
  return snapshot.docs
    .map((d) => readInvite(d.id, d.data()))
    .filter((i): i is RoundInvite => i !== null)
    .sort((a, b) => {
      // A pending timestamp is the invitation that just arrived.
      if (a.at === b.at) return a.roundId.localeCompare(b.roundId)
      if (a.at === null) return -1
      if (b.at === null) return 1
      return b.at - a.at
    })
}

/** Who has already been invited to this round, so the lobby can say so. */
export async function loadInvitesForRound(roundId: string): Promise<RoundInvite[]> {
  const snapshot = await getDocs(query(invitesRef(), where('roundId', '==', roundId)))
  return snapshot.docs
    .map((d) => readInvite(d.id, d.data()))
    .filter((i): i is RoundInvite => i !== null)
}

/**
 * Marks an invitation answered.
 *
 * Accepting is recorded *after* the join succeeds, never before - an invitation
 * marked accepted by somebody who is not in the round would disappear from their
 * screen with nothing to show for it.
 */
export async function setInviteStatus(
  roundId: string,
  toUid: string,
  status: InviteStatus,
): Promise<void> {
  await updateDoc(doc(invitesRef(), inviteId(roundId, toUid)), {
    status,
    answeredAt: serverTimestamp(),
  })
}

/** Takes back an invitation that has not been answered. */
export async function cancelRoundInvite(roundId: string, toUid: string): Promise<void> {
  await deleteDoc(doc(invitesRef(), inviteId(roundId, toUid)))
}
