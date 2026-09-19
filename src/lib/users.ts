import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

/** A player's profile, as stored in `users/{uid}`. */
export interface PlayerProfile {
  readonly uid: string
  readonly username: string
  readonly displayName: string
  /**
   * A small WebP data URI, stored inline rather than in Cloud Storage - Storage
   * requires the paid Blaze plan. See REQUIREMENTS.md §6.
   */
  readonly avatar?: string
  /** Set when an admin resets the password, to prompt a change on next sign-in. */
  readonly mustChangePassword?: boolean
}

/** A profile plus the metadata only the admin list cares about. */
export interface PlayerSummary extends PlayerProfile {
  /** Milliseconds since the epoch, or null while the server timestamp settles. */
  readonly createdAt: number | null
}

const profileRef = (uid: string) => doc(db, 'users', uid)

const readProfile = (uid: string, data: Record<string, unknown>): PlayerProfile => ({
  uid,
  username: String(data.username ?? ''),
  displayName: String(data.displayName ?? data.username ?? ''),
  avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
  mustChangePassword: data.mustChangePassword === true,
})

export async function loadProfile(uid: string): Promise<PlayerProfile | null> {
  const snapshot = await getDoc(profileRef(uid))
  return snapshot.exists() ? readProfile(uid, snapshot.data()) : null
}

/**
 * Newest signup first, ties broken by username.
 *
 * A server timestamp reads as null on the writing device until it settles, and a
 * pending one is by definition the newest signup there is - so it sorts to the
 * top rather than the bottom. That is also why the admin list sorts client-side
 * instead of using orderBy('createdAt'), which would drop those documents from
 * the result entirely and hide exactly the account an admin is most likely to be
 * looking for.
 */
export function byNewestSignup(a: PlayerSummary, b: PlayerSummary): number {
  if (a.createdAt === b.createdAt) return a.username.localeCompare(b.username)
  if (a.createdAt === null) return -1
  if (b.createdAt === null) return 1
  return b.createdAt - a.createdAt
}

/** Every account, newest first — the admin user list (T-2.4). */
export async function listPlayers(): Promise<PlayerSummary[]> {
  const snapshot = await getDocs(collection(db, 'users'))

  return snapshot.docs
    .map((entry) => {
      const data = entry.data()
      const createdAt = data.createdAt as Timestamp | null | undefined
      return {
        ...readProfile(entry.id, data),
        createdAt: createdAt?.toMillis?.() ?? null,
      }
    })
    .sort(byNewestSignup)
}

export async function createProfile(profile: PlayerProfile): Promise<void> {
  await setDoc(profileRef(profile.uid), {
    username: profile.username,
    displayName: profile.displayName,
    createdAt: serverTimestamp(),
    mustChangePassword: false,
  })
}

export async function updateProfile(
  uid: string,
  changes: Partial<Pick<PlayerProfile, 'displayName' | 'avatar' | 'mustChangePassword'>>,
): Promise<void> {
  await setDoc(profileRef(uid), { ...changes, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * Turns a Firebase auth error code into something a golfer can act on.
 *
 * The raw codes leak the email-alias trick ("auth/invalid-email" on a username) and
 * read like stack traces, neither of which helps someone standing on a tee box.
 */
export function describeAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/email-already-in-use':
      return 'That username is taken. Pick another one.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      // Deliberately the same message for all three: saying which half was wrong
      // tells an outsider whether a username exists.
      return 'Wrong username or password.'
    case 'auth/weak-password':
      return 'That password is too short.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your signal and try again.'
    case 'auth/invalid-email':
      return 'That username has characters we cannot use.'
    default:
      return 'Something went wrong. Try again.'
  }
}

/**
 * Whether this user is an admin.
 *
 * Admin status lives in a collection the app cannot write to, so this is a read
 * of fact rather than a claim the client can forge. A denied read means not an
 * admin, which is the safe answer either way.
 */
export async function isAdminUser(uid: string): Promise<boolean> {
  try {
    const snapshot = await getDoc(doc(db, 'admins', uid))
    return snapshot.exists()
  } catch {
    return false
  }
}
