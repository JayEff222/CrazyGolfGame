import { subscribePlayers, type RoundPlayer } from '../../lib/rounds'
import { loadCourse, loadHoles, type StoredCourse } from '../../lib/courseData'
import type { TeeId } from '../../lib/course'

/*
 * Thin reads the round screens need that the libraries do not expose directly.
 * Everything here goes through src/lib - no document paths are built in this
 * feature.
 */

/**
 * The players in a round, once.
 *
 * Joining needs a head count before it writes, and a subscription is the only
 * read of the players collection the round library offers. Firestore serves the
 * first snapshot from cache when offline, so this still answers in a dead spot.
 */
export function readPlayersOnce(roundId: string): Promise<RoundPlayer[]> {
  return new Promise((resolve) => {
    let settled = false
    let unsubscribe: (() => void) | null = null

    unsubscribe = subscribePlayers(roundId, (players) => {
      if (settled) return
      settled = true
      resolve(players)
      // The callback can fire before subscribePlayers has returned, in which case
      // there is nothing to unsubscribe from yet - the check below covers it.
      unsubscribe?.()
    })

    if (settled) unsubscribe()
  })
}

/*
 * Courses live in Firestore, but nothing in the course library lists them - it
 * loads a course you already know the id of. Listing the ids here keeps the
 * screen honest (name and hole count still come from Firestore) without this
 * feature querying a collection directly.
 *
 * More courses are deferred (REQUIREMENTS.md §9). When a second one arrives this
 * should become a real `listCourses()` in src/lib/courseData.ts.
 */
export const KNOWN_COURSE_IDS: readonly string[] = ['trangie']

export async function listCourses(): Promise<StoredCourse[]> {
  const loaded = await Promise.all(KNOWN_COURSE_IDS.map((id) => loadCourse(id)))
  return loaded.filter((course): course is StoredCourse => course !== null)
}

export type TeeLengths = Partial<Record<TeeId, number>>

/**
 * Total metres per tee set, for the tee picker.
 *
 * Best-effort: a course with no holes seeded yet still has to be selectable, so
 * a failure here comes back empty rather than blocking the screen.
 */
export async function loadTeeLengths(courseId: string): Promise<TeeLengths> {
  try {
    const holes = await loadHoles(courseId)
    if (holes.length === 0) return {}
    return {
      mens: holes.reduce((total, hole) => total + (hole.mens?.metres ?? 0), 0),
      ladies: holes.reduce((total, hole) => total + (hole.ladies?.metres ?? 0), 0),
    }
  } catch {
    return {}
  }
}
