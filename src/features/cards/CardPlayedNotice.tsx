import type { Card } from '../../lib/cards'
import type { RoundPlayer } from '../../lib/rounds'
import { useCardNotices } from './useCardNotices'

/*
 * What a card played on you looks like.
 *
 * In-app only, and deliberately loud: no push notifications, so the banner has to
 * catch someone who is looking at their phone in sunlight. It sits at the top of
 * the hand screen, takes an explicit acknowledgement rather than fading, and says
 * what the card actually does — the target is usually the one person who has not
 * read it.
 *
 * It reports; it does not adjudicate. Nothing here changes a score.
 */

export interface CardPlayedNoticeProps {
  readonly roundId: string
  readonly selfUid: string
  readonly players: readonly RoundPlayer[]
  readonly cards: readonly Card[]
}

export function CardPlayedNotice({ roundId, selfUid, players, cards }: CardPlayedNoticeProps) {
  const { notices, acknowledge } = useCardNotices(roundId, selfUid)

  const notice = notices[0]
  if (notice === undefined) return null

  const actor = players.find((p) => p.uid === notice.actorUid)
  const card = cards.find((c) => c.id === notice.cardId)
  const waiting = notices.length - 1

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-2xl border-2 border-chaos-500 bg-chaos-500/10 p-4"
    >
      <p className="font-display text-xl font-bold text-chaos-600">
        {actor?.displayName ?? 'Someone'} played {card?.title ?? notice.cardId ?? 'a card'} on you
        {notice.holeNumber === null ? '' : ` — hole ${notice.holeNumber}`}
      </p>

      {card !== undefined && <p className="text-base text-fairway-900">{card.effect}</p>}

      {waiting > 0 && (
        <p className="text-sm font-semibold text-fairway-800">
          {waiting} more {waiting === 1 ? 'card was' : 'cards were'} played on you.
        </p>
      )}

      <button
        type="button"
        onClick={() => acknowledge(notice.id)}
        className="tap-target rounded-xl bg-chaos-500 px-4 text-base font-bold text-white"
      >
        Got it
      </button>
    </div>
  )
}
