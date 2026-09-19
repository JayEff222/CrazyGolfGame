import type { Card } from '../../lib/cards'
import type { PlayedCardEvent } from '../../lib/hands'
import type { RoundPlayer } from '../../lib/rounds'

/*
 * Turning stored events into something readable on a phone in the sun.
 *
 * Kept pure and separate from the component for two reasons: the resolution rules
 * are the interesting part (an event stores uids and card ids, the feed must never
 * show either), and a feed that renders "undefined played undefined" is exactly
 * the sort of thing that only shows up mid-round when someone has left the group
 * or the admin has deleted a card. That is testable without rendering anything.
 */

/** Shown when a uid cannot be resolved — a player who left, or a stale event. */
export const UNKNOWN_PLAYER = 'Someone'
/** Shown when a card id cannot be resolved — deleted from the catalogue since. */
export const UNKNOWN_CARD = 'a card'

export interface FeedLine {
  readonly id: string
  readonly kind: PlayedCardEvent['type']
  readonly actorName: string
  /** Null for anything that is not a card play. */
  readonly cardTitle: string | null
  readonly targetName: string | null
  readonly holeNumber: number | null
  readonly atMillis: number | null
}

export function nameIndex(players: readonly RoundPlayer[]): Map<string, string> {
  return new Map(
    players
      .filter((player) => player.uid !== '' && player.displayName !== '')
      .map((player) => [player.uid, player.displayName]),
  )
}

export function titleIndex(cards: readonly Card[]): Map<string, string> {
  return new Map(cards.filter((card) => card.title !== '').map((card) => [card.id, card.title]))
}

const resolveName = (uid: string | null, names: ReadonlyMap<string, string>): string | null => {
  if (uid === null || uid === '') return null
  return names.get(uid) ?? UNKNOWN_PLAYER
}

export function toFeedLine(
  event: PlayedCardEvent,
  names: ReadonlyMap<string, string>,
  titles: ReadonlyMap<string, string>,
): FeedLine {
  return {
    id: event.id,
    kind: event.type,
    actorName: resolveName(event.actorUid, names) ?? UNKNOWN_PLAYER,
    cardTitle:
      event.type !== 'card_played'
        ? null
        : event.cardId === null || event.cardId === ''
          ? UNKNOWN_CARD
          : (titles.get(event.cardId) ?? UNKNOWN_CARD),
    targetName: resolveName(event.targetUid, names),
    holeNumber: event.holeNumber,
    atMillis: event.atMillis,
  }
}

/**
 * Newest first.
 *
 * `subscribeEvents` already orders by time, but the ordering is the whole point of
 * a feed and it costs nothing to make it true here as well. An event with no
 * timestamp sorts last rather than jumping to the top of the round.
 */
export function toFeedLines(
  events: readonly PlayedCardEvent[],
  names: ReadonlyMap<string, string>,
  titles: ReadonlyMap<string, string>,
): FeedLine[] {
  return [...events]
    .sort((a, b) => (b.atMillis ?? -Infinity) - (a.atMillis ?? -Infinity))
    .map((event) => toFeedLine(event, names, titles))
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "2 min ago".
 *
 * An absolute time is useless mid-round — nobody knows what time it was on the
 * 4th tee, they know it was about ten minutes ago. Rounds are hours long, so this
 * only needs to be coarse; it stops at days.
 */
export function relativeTime(atMillis: number | null, now: number): string {
  if (atMillis === null) return ''

  // A clock that is behind the writer's reads as the present, not the future.
  const elapsed = Math.max(0, now - atMillis)

  if (elapsed < 45_000) return 'just now'
  if (elapsed < HOUR) return `${Math.max(1, Math.floor(elapsed / MINUTE))} min ago`
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    return hours === 1 ? '1 hr ago' : `${hours} hr ago`
  }
  const days = Math.floor(elapsed / DAY)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
