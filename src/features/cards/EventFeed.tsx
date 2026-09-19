import { useEffect, useMemo, useState } from 'react'
import { loadCards } from '../../lib/cardsData'
import { subscribeEvents, type PlayedCardEvent } from '../../lib/hands'
import type { RoundPlayer } from '../../lib/rounds'
import {
  nameIndex,
  relativeTime,
  titleIndex,
  toFeedLines,
  type FeedLine,
} from './feedText'

/** How often the "2 min ago" labels are re-rendered. */
const TICK_MS = 30_000

export interface EventFeedProps {
  readonly roundId: string
  /**
   * The round's players, for resolving uids to names. Taken as a prop rather than
   * subscribed to here: every screen that shows this feed already has the player
   * list, and a second listener on the same collection is a wasted radio wake-up
   * out on a course.
   */
  readonly players: readonly RoundPlayer[]
}

function FeedEntry({ line, now }: { line: FeedLine; now: number }) {
  const when = relativeTime(line.atMillis, now)

  return (
    <li className="tap-target flex flex-col justify-center gap-0.5 rounded-xl bg-white px-4 py-2 ring-2 ring-fairway-100">
      <p className="text-base text-fairway-900">
        <strong className="font-semibold">{line.actorName}</strong>
        {line.kind === 'card_played' ? (
          <>
            {' played '}
            <em className="font-display font-bold text-fairway-700 not-italic">{line.cardTitle}</em>
            {line.targetName !== null && (
              <>
                {' on '}
                <strong className="font-semibold">{line.targetName}</strong>
              </>
            )}
          </>
        ) : line.kind === 'round_started' ? (
          ' started the round'
        ) : (
          ' finished the round'
        )}
        {line.holeNumber !== null && (
          <span className="text-fairway-700"> — hole {line.holeNumber}</span>
        )}
      </p>
      {when !== '' && <p className="text-xs font-medium text-fairway-600">{when}</p>}
    </li>
  )
}

/**
 * T-7.5 — the event feed.
 *
 * Cards are honour-system (REQUIREMENTS §4.4), so this feed is the entire record
 * of what happened: it is what the group argues from. That makes two things
 * non-negotiable. Names and card titles, never uids and ids — an id on screen is
 * unreadable and tells nobody anything. And relative times, because "2 min ago"
 * is the question being asked on the fairway, not what o'clock it was.
 *
 * The catalogue is fetched once rather than subscribed to: a card's title does not
 * change mid-round, and if the fetch fails the feed still reads sensibly with the
 * card unnamed rather than showing nothing at all.
 */
export function EventFeed({ roundId, players }: EventFeedProps) {
  /*
   * The round id is stored with the events rather than cleared in an effect.
   * Resetting state synchronously inside an effect causes a cascading render and
   * is rejected by the repo's react-hooks rules; tagging the data and ignoring a
   * stale tag gets the same "don't show the previous round's feed" behaviour in
   * one render.
   */
  const [feed, setFeed] = useState<{ roundId: string; events: PlayedCardEvent[] } | null>(null)
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [now, setNow] = useState(() => Date.now())

  useEffect(
    () => subscribeEvents(roundId, (events) => setFeed({ roundId, events })),
    [roundId],
  )

  const events = feed !== null && feed.roundId === roundId ? feed.events : null

  useEffect(() => {
    let live = true
    loadCards()
      .then((cards) => {
        if (live) setTitles(titleIndex(cards))
      })
      .catch(() => {
        // Card titles are cosmetic here; the feed degrades to "a card" and reads on.
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const names = useMemo(() => nameIndex(players), [players])
  const lines = useMemo(
    () => toFeedLines(events ?? [], names, titles),
    [events, names, titles],
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold text-fairway-800">What&apos;s happened</h2>

      {events === null ? (
        <p className="text-base text-fairway-700">Loading the feed…</p>
      ) : lines.length === 0 ? (
        <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
          Nothing played yet. Every card that gets played shows up here.
        </p>
      ) : (
        <ol aria-live="polite" className="flex flex-col gap-2">
          {lines.map((line) => (
            <FeedEntry key={line.id} line={line} now={now} />
          ))}
        </ol>
      )}
    </section>
  )
}
