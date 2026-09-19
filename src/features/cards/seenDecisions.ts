/*
 * Which decisions on your suggested cards you have already been told about.
 *
 * Kept on the device rather than on the suggestion document, matching what
 * useCardNotices already does for card plays: only an admin may write to a
 * suggestion, so recording "the suggester has seen this" server-side would mean
 * opening that document up to a second writer for the sake of a dismissed
 * banner. Not worth the rules surface.
 *
 * The trade is that switching phones shows you a decision again. For a decision
 * you are pleased about that is harmless, and it is the safe direction to fail
 * in - the alternative is a player never finding out their card was accepted.
 */

const storageKey = (uid: string) => `cgg.seen-decisions.${uid}`

/** Keeps the stored list from growing for the whole life of a phone. */
const MAX_REMEMBERED = 100

function withStorage<T>(action: (storage: Storage) => T, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback
    return action(localStorage)
  } catch {
    // Private mode, blocked site data. The banner simply reappears; never fatal.
    return fallback
  }
}

export function readSeenDecisions(uid: string): string[] {
  return withStorage((storage) => {
    const raw = storage.getItem(storageKey(uid))
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  }, [])
}

export function markDecisionSeen(uid: string, suggestionId: string): void {
  withStorage((storage) => {
    const seen = readSeenDecisions(uid)
    if (seen.includes(suggestionId)) return
    // Newest last, oldest trimmed first.
    const next = [...seen, suggestionId].slice(-MAX_REMEMBERED)
    storage.setItem(storageKey(uid), JSON.stringify(next))
  }, undefined)
}

/** Decided suggestions this player has not been shown yet. */
export function unseenDecisions<T extends { id: string; status: string }>(
  suggestions: readonly T[],
  seen: readonly string[],
): T[] {
  return suggestions.filter((s) => s.status !== 'pending' && !seen.includes(s.id))
}
