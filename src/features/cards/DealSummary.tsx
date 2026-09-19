import type { DealSummaryData } from './dealRoundCards'

export interface DealSummaryProps {
  readonly summary: DealSummaryData
}

const cardCount = (n: number) => (n === 1 ? '1 card' : `${n} cards`)

/**
 * What the group sees the moment the cards are out.
 *
 * Deliberately says the awkward parts out loud — how many were discarded, and
 * whether the deck ran short — because the alternative is four people comparing
 * hand sizes on the first tee and assuming the app cheated.
 */
export function DealSummary({ summary }: DealSummaryProps) {
  const counts = summary.hands.map((hand) => hand.count)
  const fewest = counts.length === 0 ? 0 : Math.min(...counts)
  const most = counts.length === 0 ? 0 : Math.max(...counts)

  const shortfallText =
    fewest === most
      ? `Only ${cardCount(fewest)} each — the deck was short.`
      : `Only ${fewest}–${most} cards each — the deck was short.`

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-2 ring-fairway-100">
      <h2 className="font-display text-xl font-bold text-fairway-800">Cards dealt</h2>

      {summary.mode === 'same' && (
        <p className="text-sm text-fairway-700">Everyone has the same hand.</p>
      )}

      <ul className="flex flex-col gap-2">
        {summary.hands.map((hand) => (
          <li
            key={hand.uid}
            className="tap-target flex items-center justify-between gap-3 rounded-xl bg-fairway-50 px-4 py-2"
          >
            <span className="text-lg font-semibold text-fairway-900">{hand.displayName}</span>
            <span className="text-base font-bold text-fairway-700">{cardCount(hand.count)}</span>
          </li>
        ))}
      </ul>

      {summary.shortfall > 0 && (
        <p
          role="status"
          className="rounded-xl bg-flag-400/25 px-4 py-3 text-base font-semibold text-fairway-900"
        >
          {shortfallText}
        </p>
      )}

      <p className="text-sm text-fairway-700">
        {summary.discarded === 0
          ? 'Nothing left over — the whole deck is in play.'
          : `${cardCount(summary.discarded)} discarded and out of play for this round.`}
      </p>
    </section>
  )
}
