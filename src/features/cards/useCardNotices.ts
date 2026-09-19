import { useCallback, useEffect, useState } from 'react'
import { subscribeEvents, type PlayedCardEvent } from '../../lib/hands'

/*
 * "The target is notified" (REQUIREMENTS §4.4), driven off the event log.
 *
 * The log is used rather than the hands collection because on a secret round the
 * rules refuse to read the hand the card came out of — the victim would otherwise
 * be the one person who could not find out. Events are readable by every player.
 *
 * Which notices are still pending is remembered in localStorage rather than in
 * component state. A card played while a phone was dead must still be waiting
 * when its owner logs back in (§3), and a notice already dismissed must not come
 * back on every refresh for the rest of the round. Storage is best-effort: on a
 * browser that blocks it, every call throws and the player simply gets the
 * notice again after a reload, which is the harmless direction to fail in.
 */

export interface CardNotice {
  readonly id: string
  readonly actorUid: string
  readonly cardId: string | null
  readonly holeNumber: number | null
}

export interface CardNoticesState {
  /** Unacknowledged plays against this player, newest first. */
  readonly notices: readonly CardNotice[]
  readonly acknowledge: (id: string) => void
}

/** Keeps the stored list from growing for the whole life of a phone. */
const MAX_REMEMBERED = 100

const storageKey = (roundId: string, uid: string) => `cgg.card-notices.${roundId}.${uid}`

function readAcknowledged(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (raw === null || raw === undefined) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeAcknowledged(key: string, ids: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(ids.slice(-MAX_REMEMBERED)))
  } catch {
    // A browser with site data blocked. The notice reappears on reload; that is
    // an annoyance, not a failure, and it must not take the hand screen down.
  }
}

export function useCardNotices(roundId: string, selfUid: string): CardNoticesState {
  const key = storageKey(roundId, selfUid)
  const [events, setEvents] = useState<readonly PlayedCardEvent[]>([])
  const [acknowledged, setAcknowledged] = useState<readonly string[]>(() => readAcknowledged(key))

  useEffect(() => {
    setAcknowledged(readAcknowledged(key))
  }, [key])

  useEffect(() => {
    setEvents([])
    return subscribeEvents(roundId, setEvents)
  }, [roundId])

  const acknowledge = useCallback(
    (id: string) => {
      setAcknowledged((previous) => {
        if (previous.includes(id)) return previous
        const next = [...previous, id]
        writeAcknowledged(key, next)
        return next
      })
    },
    [key],
  )

  const notices = events
    .filter(
      (event) =>
        event.type === 'card_played' &&
        event.targetUid === selfUid &&
        // A card you played on yourself is not news to you.
        event.actorUid !== selfUid &&
        !acknowledged.includes(event.id),
    )
    .map((event) => ({
      id: event.id,
      actorUid: event.actorUid,
      cardId: event.cardId,
      holeNumber: event.holeNumber,
    }))

  return { notices, acknowledge }
}
