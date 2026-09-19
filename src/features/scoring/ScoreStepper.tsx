import { clampStrokes, quickPicks, scoreTerm, MAX_STROKES, MIN_STROKES } from './scorecardTotals'

/*
 * The one control that gets used eighteen times a round, standing in a fairway,
 * in the sun, with one hand and possibly a wet glove.
 *
 * Two ways in, deliberately:
 *   - Quick picks cover one under through three over. That is nearly every score
 *     anyone in this group will ever make, and it is a single tap.
 *   - The stepper handles the rest. It seeds from par when nothing is entered yet,
 *     because par is the only sensible starting guess and it keeps a 9 three taps
 *     away rather than eight.
 *
 * Nothing here knows about Firestore. The hole screen owns the write.
 */

export interface ScoreStepperProps {
  readonly par: number
  /** Null until this player has scored the hole. */
  readonly value: number | null
  readonly onChange: (strokes: number) => void
  /** Shown in the control's label so screen readers announce which hole this is. */
  readonly hole?: number
  /** Read-only, e.g. once the round is complete. */
  readonly disabled?: boolean
}

export function ScoreStepper({ par, value, onChange, hole, disabled = false }: ScoreStepperProps) {
  const label = hole === undefined ? `Your score, par ${par}` : `Your score for hole ${hole}, par ${par}`

  // An unscored hole steps from par rather than from nothing, so the first press
  // lands somewhere useful instead of on 1.
  const base = value ?? par
  const decrement = clampStrokes(base - 1)
  const increment = clampStrokes(base + 1)

  const set = (strokes: number) => {
    if (disabled) return
    onChange(clampStrokes(strokes))
  }

  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <div className="flex items-stretch gap-3">
        <button
          type="button"
          onClick={() => set(decrement)}
          disabled={disabled || (value !== null && value <= MIN_STROKES)}
          aria-label="One fewer stroke"
          className="tap-target h-16 w-16 shrink-0 rounded-2xl bg-fairway-700 text-4xl leading-none font-bold text-white active:bg-fairway-800 disabled:bg-fairway-200 disabled:text-fairway-400"
        >
          −
        </button>

        {/* An <output> so the running score is announced as it changes. */}
        <output className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border-2 border-fairway-200 bg-white px-2 py-1">
          <span className="font-display text-5xl leading-none font-bold text-fairway-900 tabular-nums">
            {value ?? '–'}
          </span>
          <span className="truncate text-sm font-semibold text-fairway-700">
            {value === null ? `Par ${par}` : scoreTerm(value, par)}
          </span>
        </output>

        <button
          type="button"
          onClick={() => set(increment)}
          disabled={disabled || (value !== null && value >= MAX_STROKES)}
          aria-label="One more stroke"
          className="tap-target h-16 w-16 shrink-0 rounded-2xl bg-fairway-700 text-4xl leading-none font-bold text-white active:bg-fairway-800 disabled:bg-fairway-200 disabled:text-fairway-400"
        >
          +
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Common scores">
        {quickPicks(par).map((strokes) => {
          const selected = value === strokes
          return (
            <button
              key={strokes}
              type="button"
              onClick={() => set(strokes)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`Score ${strokes}, ${scoreTerm(strokes, par).toLowerCase()}`}
              className={[
                'tap-target flex flex-col items-center justify-center rounded-xl border-2 px-1 py-1 font-bold',
                selected
                  ? 'border-fairway-700 bg-fairway-700 text-white'
                  : 'border-fairway-300 bg-white text-fairway-900 active:bg-fairway-100',
                disabled ? 'opacity-50' : '',
              ].join(' ')}
            >
              <span className="text-2xl leading-none tabular-nums">{strokes}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
