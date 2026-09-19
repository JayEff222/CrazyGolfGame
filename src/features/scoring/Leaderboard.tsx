import { computeLeaderboard, formatToPar, type HolePar } from '../../lib/leaderboard'
import type { HoleScore, RoundPlayer } from '../../lib/rounds'

/*
 * The live leaderboard, ranked the way a broadcast leaderboard is: to-par first,
 * then how far through the round each player is. Total strokes is still there
 * because this group will ask for it, but it is deliberately the quiet column -
 * mid-round, raw strokes tell you almost nothing about who is winning.
 *
 * All maths comes from lib/leaderboard.ts. This file only lays it out.
 */

export interface LeaderboardProps {
  readonly players: readonly RoundPlayer[]
  readonly scores: readonly HoleScore[]
  readonly holes: readonly HolePar[]
  /** The signed-in player, highlighted so they find themselves instantly. */
  readonly highlightUid?: string
  /** Drops the heading, for the hole screen where space is the scarce thing. */
  readonly compact?: boolean
}

export function Leaderboard({
  players,
  scores,
  holes,
  highlightUid,
  compact = false,
}: LeaderboardProps) {
  const rows = computeLeaderboard(players, scores, holes)

  return (
    <section aria-label="Leaderboard" className="flex flex-col gap-2">
      {!compact && (
        <h2 className="font-display text-xl font-bold text-fairway-800">Leaderboard</h2>
      )}

      {rows.length === 0 ? (
        <p className="text-base text-fairway-700">Nobody has joined this round yet.</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Live leaderboard, best score relative to par first</caption>
          <thead>
            <tr className="text-xs font-semibold tracking-wide text-fairway-700 uppercase">
              <th scope="col" className="w-8 py-1">
                <span className="sr-only">Position</span>
                <span aria-hidden="true">#</span>
              </th>
              <th scope="col" className="py-1">
                Player
              </th>
              <th scope="col" className="py-1 text-right">
                To par
              </th>
              <th scope="col" className="py-1 text-right">
                Thru
              </th>
              <th scope="col" className="py-1 text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelf = row.uid === highlightUid
              return (
                <tr
                  key={row.uid}
                  aria-current={isSelf ? 'true' : undefined}
                  className={[
                    'border-t-2 border-fairway-100',
                    isSelf ? 'bg-fairway-100' : 'bg-white',
                  ].join(' ')}
                >
                  <td className="py-2 text-base font-bold text-fairway-700 tabular-nums">
                    {row.position}
                  </td>
                  <th
                    scope="row"
                    className="max-w-0 truncate py-2 pr-2 text-base font-semibold text-fairway-900"
                  >
                    {row.displayName}
                  </th>
                  <td className="py-2 text-right font-display text-2xl leading-none font-bold text-fairway-900 tabular-nums">
                    {formatToPar(row.toPar)}
                  </td>
                  <td className="py-2 text-right text-base font-semibold text-fairway-700 tabular-nums">
                    {row.holesPlayed === 0 ? '–' : row.holesPlayed}
                  </td>
                  <td className="py-2 text-right text-base text-fairway-600 tabular-nums">
                    {row.strokes === 0 ? '–' : row.strokes}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
