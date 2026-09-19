import { useEffect, useState } from 'react'
import { waitForPendingWrites } from 'firebase/firestore'
import { db } from '../../lib/firebase'

/*
 * T-8.1 - is this phone actually talking to Firestore?
 *
 * REQUIREMENTS.md §4.6: the app keeps working without signal and syncs on
 * reconnect. That already happens - Firestore's IndexedDB cache queues the
 * writes - but from the fairway it is invisible, and a golfer who taps in a 6
 * with no bars has no way to know whether it landed. The whole point of this
 * indicator is to answer that without them having to ask.
 *
 * Three states rather than two, because "back online" and "back online and
 * everything you tapped has actually reached the server" are different moments,
 * and it is the second one that means the round is safe.
 */
export type ConnectionState = 'online' | 'offline' | 'syncing'

/** The browser's own view, defaulting to online where it has no opinion. */
function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useConnectionStatus(): ConnectionState {
  const [online, setOnline] = useState(browserIsOnline)
  /*
   * Starts true so a normal launch reads 'online' immediately. Waiting for
   * waitForPendingWrites on mount would flash 'syncing' on every cold start for
   * a queue that is almost always empty.
   */
  const [flushed, setFlushed] = useState(true)

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      // Anything typed while offline is still only in IndexedDB at this instant.
      setFlushed(false)
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (!online || flushed) return
    let live = true

    // Resolves once every queued write has been acknowledged by the server. It
    // never resolves while offline, which is exactly the behaviour wanted here.
    void waitForPendingWrites(db)
      .then(() => {
        if (live) setFlushed(true)
      })
      .catch(() => {
        // A failed wait is not worth stranding the indicator on 'syncing'
        // forever; the scores are still queued either way.
        if (live) setFlushed(true)
      })

    return () => {
      live = false
    }
  }, [online, flushed])

  if (!online) return 'offline'
  return flushed ? 'online' : 'syncing'
}

/** What the player is told, per state. Kept here so the copy is testable. */
export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  online: 'Online',
  offline: 'Offline — saved on this phone',
  syncing: 'Syncing…',
}
