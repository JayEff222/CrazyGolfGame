import { useState } from 'react'
import { computeLeaderboard, formatToPar, nextUnscoredHole } from '../../lib/leaderboard'
import type { HoleScore, RoundPlayer } from '../../lib/rounds'
import { ScoreStepper } from './ScoreStepper'
import {
  FRONT_NINE_END,
  indexScores,
  parTotal,
  playerTotals,
  scoreKey,
  scoreTone,
  type ScorecardHole,
  type ScoreTone,
} from './scorecardTotals'

/*
 * The full card: every hole, every player, the way it is printed.
 *
 * This is also where REQUIREMENTS.md §4.2 "any previously played hole can be
 * edited at any time" actually lives. Tapping one of your own cells selects that
 * hole and the stepper at the top retargets to it - so fixing the 6 you wrote on
 * the 4th while standing on the 14th tee is two taps, and you can see the rest of
 * your card while you do it.
 *
 * Only your own column is tappable. Everyone else's scores are text, matching the
 * security rules; offering a control that Firestore would refuse is worse than
 * offering none.
 */

const TONE_CLASS: Record<ScoreTone, string> = {
  eagle: 'bg-chaos-500 text-white',
  birdie: 'bg-chaos-500/15 text-chaos-600',
  par: 'text-fairway-900',
  bogey: 'text-fairway-900',
  worse: 'bg-fairway-200 text-fairway-900',
}

export interface ScorecardScreenProps {
  readonly players: readonly RoundPlayer[]
  readonly scores: readonly HoleScore[]
  readonly holes: readonly ScorecardHole[]
  readonly selfUid: string
  /** Omit to render the card read-only, e.g. in round history. */
  readonly onSetScore?: (hole: number, strokes: number) => void
  readonly courseName?: string
}

export function ScorecardScreen({
  players,
  scores,
  holes,
  selfUid,
  onSetScore,
  courseName,
}: ScorecardScreenProps) {
  const holeCount = holes.length
  // Opens on the hole you still owe a score for, which is where you are standing.
  const [selectedHole, setSelectedHole] = useState(
    () => nextUnscoredHole(scores, selfUid, holeCount) ?? 1,
  )

  const byPlayerHole = indexScores(scores)
  const toParByUid = new Map(computeLeaderboard(players, scores, holes).map((r) => [r.uid, r.toPar]))
  const editable = onSetScore !== undefined && players.some((p) => p.uid === selfUid)
  const selected = holes.find((hole) => hole.number === selectedHole)

  const front = holes.filter((hole) => hole.number <= FRONT_NINE_END)
  const back = holes.filter((hole) => hole.number > FRONT_NINE_END)

  const cell = (uid: string, hole: ScorecardHole) => {
    const strokes = byPlayerHole.get(scoreKey(uid, hole.number)) ?? null
    const mine = uid === selfUid

    if (!mine || !editable) {
      return (
        <td key={uid} className="px-1 py-1 text-center">
          <span
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-base font-semibold tabular-nums',
              strokes === null ? 'text-fairway-600' : TONE_CLASS[scoreTone(strokes, hole.par)],
            ].join(' ')}
          >
            {strokes ?? '–'}
          </span>
        </td>
      )
    }

    return (
      <td key={uid} className="px-1 py-1 text-center">
        <button
          type="button"
          onClick={() => setSelectedHole(hole.number)}
          aria-label={
            strokes === null
              ? `Enter your score for hole ${hole.number}`
              : `Edit your score of ${strokes} for hole ${hole.number}`
          }
          className={[
            'tap-target inline-flex w-full items-center justify-center rounded-lg border-2 text-lg font-bold tabular-nums',
            hole.number === selectedHole
              ? 'border-fairway-700 bg-fairway-100'
              : 'border-fairway-200 bg-white',
            strokes === null ? 'text-fairway-600' : TONE_CLASS[scoreTone(strokes, hole.par)],
          ].join(' ')}
        >
          {strokes ?? '–'}
        </button>
      </td>
    )
  }

  const holeRow = (hole: ScorecardHole) => (
    <tr key={hole.number} className="border-t border-fairway-100">
      <th
        scope="row"
        className="py-1 pr-1 text-left text-base font-bold text-fairway-900 tabular-nums"
      >
        {hole.number}
      </th>
      <td className="py-1 pr-1 text-center text-sm text-fairway-700 tabular-nums">{hole.par}</td>
      {players.map((player) => cell(player.uid, hole))}
    </tr>
  )

  const subtotalRow = (label: string, par: number, valueFor: (uid: string) => number) => (
    <tr className="border-t-2 border-fairway-300 bg-fairway-50">
      <th scope="row" className="py-1 pr-1 text-left text-sm font-bold text-fairway-800">
        {label}
      </th>
      <td className="py-1 pr-1 text-center text-sm font-bold text-fairway-800 tabular-nums">
        {par}
      </td>
      {players.map((player) => {
        const value = valueFor(player.uid)
        return (
          <td
            key={player.uid}
            className="px-1 py-1 text-center text-base font-bold text-fairway-900 tabular-nums"
          >
            {value === 0 ? '–' : value}
          </td>
        )
      })}
    </tr>
  )

  return (
    <section aria-label="Scorecard" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold text-fairway-800">Scorecard</h2>
        {courseName !== undefined && <p className="text-base text-fairway-700">{courseName}</p>}
      </header>

      {editable && selected !== undefined && onSetScore !== undefined && (
        <div className="flex flex-col gap-2 rounded-2xl bg-fairway-100 px-3 py-3">
          <p className="text-sm font-semibold tracking-wide text-fairway-800 uppercase">
            Hole {selected.number} · Par {selected.par}
            {selected.metres !== undefined && ` · ${selected.metres} m`}
          </p>
          <ScoreStepper
            hole={selected.number}
            par={selected.par}
            value={byPlayerHole.get(scoreKey(selfUid, selected.number)) ?? null}
            onChange={(strokes) => onSetScore(selected.number, strokes)}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Every hole for every player. Tap one of your own scores to edit that hole.
          </caption>
          <thead>
            <tr className="text-xs font-semibold tracking-wide text-fairway-700 uppercase">
              <th scope="col" className="pb-1 text-left">
                Hole
              </th>
              <th scope="col" className="pb-1 text-center">
                Par
              </th>
              {players.map((player) => (
                <th key={player.uid} scope="col" className="max-w-16 truncate pb-1 text-center">
                  {player.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {front.map(holeRow)}
            {front.length > 0 &&
              subtotalRow('Out', parTotal(holes, 1, FRONT_NINE_END), (uid) => playerTotals(scores, uid).out)}
            {back.map(holeRow)}
            {back.length > 0 &&
              subtotalRow('In', parTotal(holes, FRONT_NINE_END + 1, holeCount), (uid) => playerTotals(scores, uid).back)}
          </tbody>
          <tfoot>
            {subtotalRow('Total', parTotal(holes, 1, holeCount), (uid) => playerTotals(scores, uid).total)}
            <tr className="border-t border-fairway-200">
              <th
                scope="row"
                colSpan={2}
                className="py-1 text-left text-sm font-bold text-fairway-800"
              >
                To par
              </th>
              {players.map((player) => (
                <td
                  key={player.uid}
                  className="px-1 py-1 text-center text-base font-bold text-fairway-900 tabular-nums"
                >
                  {formatToPar(toParByUid.get(player.uid) ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
