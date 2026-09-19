import { computePlayerStats, formatAverageToPar, type PlayedRound } from '../../lib/stats'
import { formatToPar } from '../../lib/leaderboard'

/*
 * T-9.2 - the stats panel.
 *
 * Presentational only: it takes rounds and computes on the spot, so the whole
 * thing can be rendered from fixtures and the arithmetic is proved separately in
 * lib/stats.ts. Nothing here fetches.
 *
 * Every figure says what it is measured over. "Average +8.2" is meaningless
 * without "over 3 rounds", and early on the numbers are all built on one round -
 * saying so is the difference between a stat and a boast.
 */

function Tile({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-white px-4 py-3 ring-1 ring-fairway-200">
      <span className="text-sm font-semibold text-fairway-700">{label}</span>
      <span className="font-display text-2xl font-bold text-fairway-900">{value}</span>
      {note !== undefined && <span className="text-sm text-fairway-600">{note}</span>}
    </div>
  )
}

export function StatsPanel({
  rounds,
  selfUid,
}: {
  readonly rounds: readonly PlayedRound[]
  readonly selfUid: string
}) {
  const stats = computePlayerStats(rounds, selfUid)

  if (stats.roundsPlayed === 0) {
    return (
      <p className="rounded-xl bg-fairway-100 px-4 py-4 text-base text-fairway-800">
        Nothing to count yet. Play a round and this fills in.
      </p>
    )
  }

  const roundsNote = `over ${stats.roundsCompleted} finished round${stats.roundsCompleted === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Rounds"
          value={String(stats.roundsPlayed)}
          note={`${stats.roundsCompleted} finished`}
        />
        <Tile label="Holes" value={String(stats.holesPlayed)} />
        <Tile
          label="Best round"
          value={stats.bestRound === null ? '—' : formatToPar(stats.bestRound.toPar)}
          note={stats.bestRound === null ? 'No finished round yet' : undefined}
        />
        <Tile
          label="Average"
          value={formatAverageToPar(stats.averageToPar)}
          note={stats.averageToPar === null ? 'Needs a finished round' : roundsNote}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-fairway-200">
        <h3 className="text-sm font-semibold text-fairway-700">How the holes went</h3>
        <dl className="grid grid-cols-5 gap-1 text-center">
          {(
            [
              ['Eagles', stats.tally.eagles],
              ['Birdies', stats.tally.birdies],
              ['Pars', stats.tally.pars],
              ['Bogeys', stats.tally.bogeys],
              ['Worse', stats.tally.worse],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="flex flex-col">
              <dd className="font-display text-xl font-bold text-fairway-900">{count}</dd>
              <dt className="text-sm text-fairway-700">{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {stats.bestHole !== null && stats.worstHole !== null && (
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Favourite hole"
            value={`No. ${stats.bestHole.hole}`}
            note={`${formatAverageToPar(stats.bestHole.averageToPar)} over ${stats.bestHole.played}`}
          />
          <Tile
            label="Nemesis"
            value={`No. ${stats.worstHole.hole}`}
            note={`${formatAverageToPar(stats.worstHole.averageToPar)} over ${stats.worstHole.played}`}
          />
        </div>
      )}
    </div>
  )
}
