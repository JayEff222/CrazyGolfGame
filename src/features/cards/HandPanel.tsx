import { useEffect, useMemo, useState } from 'react'
import type { Card } from '../../lib/cards'
import { loadCards } from '../../lib/cardsData'
import {
  CardAlreadyPlayedError,
  heldCards,
  playCard,
  playedCards,
  type Hand,
  type HeldCard,
} from '../../lib/hands'
import type { CardVisibility, RoundPlayer } from '../../lib/rounds'
import { CardPlayedNotice } from './CardPlayedNotice'
import { CardTile } from './CardTile'
import { PlayCardDialog } from './PlayCardDialog'
import { useHands } from './useHands'

/*
 * Your hand, and — on an open round — everyone else's.
 *
 * The rules this screen exists to keep (REQUIREMENTS §4.4):
 *
 * - A played card stays on screen, marked used and disabled. It is not removed.
 *   The hand is the record of the round as much as it is a list of options.
 * - Unplayed cards are carried to the end. Nothing here discards a card, on a
 *   hole change or on any other event.
 * - Timing is never enforced. Every held card is playable on every hole at every
 *   moment; the stated timing is printed and the group settles it.
 * - Nothing changes a score. The play is recorded and that is all.
 */

export interface HandPanelProps {
  readonly roundId: string
  readonly selfUid: string
  /** The hole a play is recorded against — normally the one being scored. */
  readonly holeNumber: number
  readonly visibility: CardVisibility
  readonly players: readonly RoundPlayer[]
}

function describePlayFailure(error: unknown, title: string): string {
  if (error instanceof CardAlreadyPlayedError) {
    return `${title} has already been played.`
  }
  const code = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'code')) : ''
  if (code.includes('permission-denied')) {
    return 'That play was refused — you can only play cards out of your own hand.'
  }
  return `Could not record ${title}. Check you are still signed in and try again.`
}

const playedAtLabel = (millis: number | undefined): string =>
  millis === undefined
    ? ''
    : ` at ${new Date(millis).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`

export function HandPanel({
  roundId,
  selfUid,
  holeNumber,
  visibility,
  players,
}: HandPanelProps) {
  const { hand, otherHands, loading, otherHandsError } = useHands(roundId, selfUid, visibility)

  const [cards, setCards] = useState<readonly Card[]>([])
  const [cardsLoaded, setCardsLoaded] = useState(false)
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [pending, setPending] = useState<Card | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadCards()
        if (!cancelled) {
          setCards(loaded)
          setCatalogueError(null)
        }
      } catch {
        if (!cancelled) setCatalogueError('Could not load the card rules. Check your signal.')
      } finally {
        if (!cancelled) setCardsLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const nameOf = (uid: string) => players.find((p) => p.uid === uid)?.displayName

  const held = heldCards(hand)
  const played = playedCards(hand)
  const opponents = players.filter((p) => p.uid !== selfUid)

  /** Who a spent card landed on, in the words the group would use. */
  const targetLabel = (card: HeldCard): string => {
    if (card.targetUid !== undefined) return nameOf(card.targetUid) ?? 'a player who has left'
    return byId.get(card.cardId)?.target === 'everyone' ? 'the whole group' : 'yourself'
  }

  const playedFooter = (card: HeldCard) => {
    const hole =
      typeof card.playedOnHole === 'number' && Number.isFinite(card.playedOnHole)
        ? `hole ${card.playedOnHole}`
        : 'this round'
    return (
      <span className="pt-1 text-sm font-semibold text-fairway-800">
        Played on {hole} · on {targetLabel(card)}
        {playedAtLabel(card.playedAtMillis)}
      </span>
    )
  }

  /*
   * The write is not awaited. Firestore's offline queue does not settle a write
   * until the server acknowledges it, so awaiting here would hang the dialog for
   * the rest of a round played out of signal (CLAUDE.md hard constraint 4). The
   * local snapshot already shows the card spent; a genuine rejection - a refused
   * write, or a card someone spent on another device first - lands in the catch.
   */
  const confirmPlay = (targetUid: string | undefined) => {
    const card = pending
    if (card === null || hand === null) return
    setPending(null)
    setPlayError(null)
    playCard(roundId, hand, card.id, { holeNumber, targetUid }).catch((failure: unknown) => {
      setPlayError(describePlayFailure(failure, card.title))
    })
  }

  return (
    <section aria-labelledby="hand-heading" className="flex flex-col gap-4">
      <CardPlayedNotice roundId={roundId} selfUid={selfUid} players={players} cards={cards} />

      <div className="flex items-baseline justify-between gap-3">
        <h2 id="hand-heading" className="font-display text-xl font-bold text-fairway-900">
          Your cards
        </h2>
        <span className="text-sm font-semibold text-fairway-700">
          {held.length} to play · {played.length} played
        </span>
      </div>

      {playError !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base text-chaos-600">
          {playError}
        </p>
      )}

      {catalogueError !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base text-chaos-600">
          {catalogueError}
        </p>
      )}

      {loading || !cardsLoaded ? (
        <p className="px-1 py-3 text-base text-fairway-700">Looking at your hand…</p>
      ) : (
        <>
          {held.length === 0 && played.length === 0 && (
            <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
              You have no cards this round.
            </p>
          )}

          {held.length > 0 && (
            <ul className="flex flex-col gap-3">
              {held.map((card) => {
                const definition = byId.get(card.cardId)
                return (
                  <li key={card.cardId}>
                    <CardTile card={definition} cardId={card.cardId}>
                      <button
                        type="button"
                        disabled={definition === undefined}
                        onClick={() => definition !== undefined && setPending(definition)}
                        className="tap-target mt-2 rounded-xl bg-fairway-700 px-4 text-base font-bold text-white disabled:bg-fairway-200 disabled:text-fairway-600"
                      >
                        Play {definition?.title ?? card.cardId}
                      </button>
                    </CardTile>
                  </li>
                )
              })}
            </ul>
          )}

          {held.length > 0 && (
            <p className="rounded-xl bg-fairway-100 px-4 py-3 text-sm text-fairway-800">
              Cards you never play stay in your hand to the end of the round. Nothing is taken off
              you, and there is no rush — a card can be played on any hole, at any point.
            </p>
          )}

          {played.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-bold text-fairway-800">Already played</h3>
              <ul className="flex flex-col gap-3">
                {played.map((card) => {
                  const definition = byId.get(card.cardId)
                  return (
                    <li key={card.cardId}>
                      <CardTile
                        card={definition}
                        cardId={card.cardId}
                        used
                        footer={playedFooter(card)}
                      >
                        <button
                          type="button"
                          disabled
                          className="tap-target mt-2 rounded-xl bg-fairway-200 px-4 text-base font-bold text-fairway-600"
                        >
                          {definition?.title ?? card.cardId} already played
                        </button>
                      </CardTile>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {visibility === 'open' ? (
        <section aria-labelledby="other-hands-heading" className="flex flex-col gap-3">
          <h2 id="other-hands-heading" className="font-display text-xl font-bold text-fairway-900">
            Everyone else’s cards
          </h2>

          {otherHandsError !== null && (
            <p
              role="alert"
              className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base text-chaos-600"
            >
              {otherHandsError}
            </p>
          )}

          {otherHandsError === null && otherHands.length === 0 && (
            <p className="text-base text-fairway-700">Nobody else has a hand in this round yet.</p>
          )}

          {otherHands.map((other: Hand) => (
            <article key={other.uid} className="flex flex-col gap-2">
              <h3 className="text-base font-bold text-fairway-800">
                {nameOf(other.uid) ?? 'A player who has left'}
              </h3>
              <ul className="flex flex-col gap-3">
                {other.cards.map((card) => (
                  <li key={card.cardId}>
                    <CardTile
                      card={byId.get(card.cardId)}
                      cardId={card.cardId}
                      used={card.status === 'played'}
                      footer={card.status === 'played' ? playedFooter(card) : undefined}
                    />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : (
        <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
          Hands are secret this round — you only see your own cards.
        </p>
      )}

      {pending !== null && (
        <PlayCardDialog
          card={pending}
          holeNumber={holeNumber}
          opponents={opponents}
          onConfirm={confirmPlay}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  )
}
