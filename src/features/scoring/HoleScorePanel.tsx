import type { HoleScore, RoundPlayer } from '../../lib/rounds'
import { ScoreStepper } from './ScoreStepper'
import { indexScores, scoreKey, scoreTerm, scoreTone, type ScoreTone } from './scorecardTotals'

/*
 * The scoring half of the hole screen (REQUIREMENTS.md §5): your own entry plus
 * everybody else's score for this hole, in one block that never scrolls. The GPS
 * yardage panel sits above it.
 *
 * Only the signed-in player gets a control. Everyone else is read-only text -
 * REQUIREMENTS.md §4.2, and the security rules enforce the same thing, so a
 * button to edit a rival's score would simply fail. Better not to offer one.
 */

const TONE_CLASS: Record<ScoreTone, string> = {
  eagle: 'bg-chaos-500 text-white',
  birdie: 'bg-chaos-500/15 text-chaos-600',
  par: 'bg-fairway-100 text-fairway-900',
  bogey: 'bg-fairway-200 text-fairway-900',
  worse: 'bg-fairway-300 text-fairway-900',
}

export interface HoleScorePanelProps {
  readonly hole: number
  readonly par: number
  readonly players: readonly RoundPlayer[]
  readonly scores: readonly HoleScore[]
  readonly selfUid: string
  readonly onSetScore: (hole: number, strokes: number) => void
  readonly disabled?: boolean
  /** Surfaced verbatim when a write is rejected. */
  readonly error?: string | null
}

export function HoleScorePanel({
  hole,
  par,
  players,
  scores,
  selfUid,
  onSetScore,
  disabled = false,
  error = null,
}: HoleScorePanelProps) {
  const byPlayerHole = indexScores(scores)
  const mine = byPlayerHole.get(scoreKey(selfUid, hole)) ?? null
  const isPlaying = players.some((player) => player.uid === selfUid)
  const others = players.filter((player) => player.uid !== selfUid)

  return (
    <section aria-label={`Hole ${hole} scoring`} className="flex flex-col gap-3">
      {isPlaying ? (
        <ScoreStepper
          hole={hole}
          par={par}
          value={mine}
          disabled={disabled}
          onChange={(strokes) => onSetScore(hole, strokes)}
        />
      ) : (
        <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
          You&apos;re watching this round, not playing it.
        </p>
      )}

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/15 px-4 py-3 text-base text-chaos-600">
          {error}
        </p>
      )}

      {others.length > 0 && (
        <ul aria-label="Other players on this hole" className="flex flex-col gap-1">
          {others.map((player) => {
            const strokes = byPlayerHole.get(scoreKey(player.uid, hole)) ?? null
            return (
              <li
                key={player.uid}
                className="flex items-center gap-3 rounded-xl bg-white px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-base font-semibold text-fairway-900">
                  {player.displayName}
                </span>
                {strokes === null ? (
                  <span className="text-base text-fairway-700">Not in yet</span>
                ) : (
                  <>
                    <span className="text-sm text-fairway-700">{scoreTerm(strokes, par)}</span>
                    <span
                      className={[
                        'flex h-10 w-10 items-center justify-center rounded-lg text-xl font-bold tabular-nums',
                        TONE_CLASS[scoreTone(strokes, par)],
                      ].join(' ')}
                    >
                      {strokes}
                    </span>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
