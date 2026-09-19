/*
 * Which round this device was last in.
 *
 * REQUIREMENTS.md §3: a player whose phone dies has to land back in the round
 * rather than hunting for the room code. The round id is remembered per user so
 * a shared phone does not offer JF's round to whoever signs in next.
 *
 * Deliberately localStorage and not Firestore: the round library has no "which
 * rounds is this player in" query, and this needs to work before the app has
 * talked to the network. It is a convenience, never the source of truth - the
 * round itself is re-read from Firestore before anything is offered.
 */

const storageKey = (uid: string) => `cgg.active-round.${uid}`

/** Storage can be unavailable (private mode, blocked cookies). Never fatal. */
function withStorage<T>(action: (storage: Storage) => T, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback
    return action(localStorage)
  } catch {
    return fallback
  }
}

export function rememberActiveRound(uid: string, roundId: string): void {
  withStorage((storage) => storage.setItem(storageKey(uid), roundId), undefined)
}

export function recallActiveRound(uid: string): string | null {
  return withStorage((storage) => storage.getItem(storageKey(uid)), null)
}

export function forgetActiveRound(uid: string): void {
  withStorage((storage) => storage.removeItem(storageKey(uid)), undefined)
}
