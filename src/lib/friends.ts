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
 * Friends.
 *
 * One document per pair, not one per direction. The id is the two uids sorted
 * and joined, so a given pair always maps to the same document no matter who
 * asked first - which makes "are we friends" a single lookup and makes it
 * impossible for the two sides to end up disagreeing, the classic failure of
 * storing a copy in each player's own subtree.
 *
 * `members` carries both uids as an array so one query -
 * `where('members', 'array-contains', me)` - returns friendships, requests you
 * have sent and requests you have received, all at once. The security rules key
 * off the same array: you can only ever read or write a document you are in.
 */

export type FriendshipStatus = 'pending' | 'accepted'

export interface Friendship {
  readonly id: string
  readonly members: readonly [string, string]
  /** Who asked. The other member is the only one who may accept. */
  readonly requestedBy: string
  readonly status: FriendshipStatus
  /** Milliseconds since the epoch, or null while the timestamp settles. */
  readonly at: number | null
}

/**
 * The document id for a pair, independent of who asked.
 *
 * Sorted so that pairId(a, b) and pairId(b, a) are the same document. Without
 * this a request each way would create two documents and the pair could sit
 * "friends" in one direction and "pending" in the other forever.
 */
export function pairId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

/** The members array, in the same order the id uses. */
export function pairMembers(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

const friendshipsRef = () => collection(db, 'friendships')

function readFriendship(id: string, data: Record<string, unknown>): Friendship | null {
  const members = Array.isArray(data.members) ? (data.members as unknown[]) : []
  if (members.length !== 2 || members.some((m) => typeof m !== 'string')) return null

  const at = data.at as Timestamp | null | undefined
  return {
    id,
    members: [String(members[0]), String(members[1])],
    requestedBy: String(data.requestedBy ?? ''),
    status: data.status === 'accepted' ? 'accepted' : 'pending',
    at: at?.toMillis?.() ?? null,
  }
}

/** Everything this player is involved in: friends, requests sent, requests received. */
export async function loadFriendships(uid: string): Promise<Friendship[]> {
  const snapshot = await getDocs(query(friendshipsRef(), where('members', 'array-contains', uid)))
  return snapshot.docs
    .map((d) => readFriendship(d.id, d.data()))
    .filter((f): f is Friendship => f !== null)
}

/**
 * Asks somebody to be a friend.
 *
 * Merged onto the pair document rather than created blindly: if they had already
 * asked you, this would otherwise clobber their pending request with an
 * identical one pointing the other way, and neither of you could accept it.
 * Callers check for that case first and accept instead - see `relationshipWith`.
 */
export async function sendFriendRequest(from: string, to: string): Promise<void> {
  await setDoc(doc(friendshipsRef(), pairId(from, to)), {
    members: pairMembers(from, to),
    requestedBy: from,
    status: 'pending' satisfies FriendshipStatus,
    at: serverTimestamp(),
  })
}

/** Accepts a request. The rules allow only the member who did not ask. */
export async function acceptFriendRequest(a: string, b: string): Promise<void> {
  await updateDoc(doc(friendshipsRef(), pairId(a, b)), {
    status: 'accepted' satisfies FriendshipStatus,
    acceptedAt: serverTimestamp(),
  })
}

/** Declines a request, or removes an existing friend. Either member may. */
export async function removeFriendship(a: string, b: string): Promise<void> {
  await deleteDoc(doc(friendshipsRef(), pairId(a, b)))
}

// ---------------------------------------------------------------------------
// Pure helpers — what the screens actually ask
// ---------------------------------------------------------------------------

export type Relationship =
  /** No connection at all. */
  | { readonly kind: 'none' }
  /** You asked them; waiting on them. */
  | { readonly kind: 'requested' }
  /** They asked you; you can accept. */
  | { readonly kind: 'incoming' }
  | { readonly kind: 'friends' }
  /** Yourself. Never offer to befriend yourself. */
  | { readonly kind: 'self' }

/** Where this player stands with another, from the loaded friendships. */
export function relationshipWith(
  friendships: readonly Friendship[],
  selfUid: string,
  otherUid: string,
): Relationship {
  if (selfUid === otherUid) return { kind: 'self' }

  const id = pairId(selfUid, otherUid)
  const found = friendships.find((f) => f.id === id)
  if (found === undefined) return { kind: 'none' }
  if (found.status === 'accepted') return { kind: 'friends' }
  return found.requestedBy === selfUid ? { kind: 'requested' } : { kind: 'incoming' }
}

/** The other half of a pair. */
export function otherMember(friendship: Friendship, selfUid: string): string {
  return friendship.members[0] === selfUid ? friendship.members[1] : friendship.members[0]
}

/** Uids of everyone this player is actually friends with. */
export function friendUids(friendships: readonly Friendship[], selfUid: string): string[] {
  return friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => otherMember(f, selfUid))
}

/** Requests waiting on this player to answer. */
export function incomingRequests(
  friendships: readonly Friendship[],
  selfUid: string,
): Friendship[] {
  return friendships.filter((f) => f.status === 'pending' && f.requestedBy !== selfUid)
}

/**
 * Filters players by a search box.
 *
 * Substring rather than prefix, because "any one with that user name or
 * containing that username should pop up". Firestore cannot express that - it
 * only does prefix ranges - so the match happens here over the loaded list.
 * That is a deliberate trade for an app with a handful of accounts; if this ever
 * grew past a few hundred players it would need a real search index.
 *
 * An empty box is not a filter: it lists everyone.
 */
export function matchPlayers<T extends { username: string; displayName: string }>(
  players: readonly T[],
  search: string,
): T[] {
  const needle = search.trim().toLowerCase()
  if (needle === '') return [...players]

  return players.filter(
    (player) =>
      player.username.toLowerCase().includes(needle) ||
      player.displayName.toLowerCase().includes(needle),
  )
}
