import { useRef, type TouchEvent } from 'react'

/*
 * Moving between holes, 1 to 18.
 *
 * Three ways, because the right one depends on what the player is doing:
 *   - Swipe across the header to walk one hole at a time, which is what happens
 *     eighteen times a round while actually playing.
 *   - Prev / next buttons for the same thing with a glove on.
 *   - A tap strip of every hole, for "I need to fix hole 4" without pressing
 *     back fourteen times.
 *
 * The strip scrolls horizontally, so swipes that start inside it are left alone -
 * otherwise scrolling the strip would also change the hole.
 */

/** A swipe has to cover this much horizontally, and stay flatter than it is wide. */
const SWIPE_MIN_PX = 40

export interface HoleSwitcherProps {
  readonly currentHole: number
  readonly onSelect: (hole: number) => void
  readonly holeCount?: number
  /** Holes this player has already scored, marked so gaps are obvious. */
  readonly scoredHoles?: readonly number[]
  /** Par for the current hole, shown beside the number when known. */
  readonly par?: number
}

export function HoleSwitcher({
  currentHole,
  onSelect,
  holeCount = 18,
  scoredHoles = [],
  par,
}: HoleSwitcherProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const scored = new Set(scoredHoles)

  const holes = Array.from({ length: holeCount }, (_, i) => i + 1)
  const previous = currentHole > 1 ? currentHole - 1 : null
  const next = currentHole < holeCount ? currentHole + 1 : null

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    if (touch === undefined) return
    // A swipe that begins on the scrolling strip belongs to the strip.
    if (stripRef.current?.contains(event.target as Node) === true) {
      swipeStart.current = null
      return
    }
    swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipeStart.current
    const touch = event.changedTouches[0]
    swipeStart.current = null
    if (start === null || touch === undefined) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx)) return

    // Swiping left drags the next hole into view, like turning a page.
    const target = dx < 0 ? next : previous
    if (target !== null) onSelect(target)
  }

  return (
    <nav
      aria-label="Hole"
      className="flex flex-col gap-2 select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => previous !== null && onSelect(previous)}
          disabled={previous === null}
          aria-label="Previous hole"
          className="tap-target rounded-xl border-2 border-fairway-300 px-3 text-2xl leading-none font-bold text-fairway-800 active:bg-fairway-100 disabled:border-fairway-200 disabled:text-fairway-300"
        >
          ‹
        </button>

        <p className="flex flex-1 items-baseline justify-center gap-2" aria-live="polite">
          <span className="font-display text-2xl font-bold text-fairway-900">
            Hole {currentHole}
          </span>
          {par !== undefined && (
            <span className="text-base font-semibold text-fairway-700">Par {par}</span>
          )}
        </p>

        <button
          type="button"
          onClick={() => next !== null && onSelect(next)}
          disabled={next === null}
          aria-label="Next hole"
          className="tap-target rounded-xl border-2 border-fairway-300 px-3 text-2xl leading-none font-bold text-fairway-800 active:bg-fairway-100 disabled:border-fairway-200 disabled:text-fairway-300"
        >
          ›
        </button>
      </div>

      <div
        ref={stripRef}
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Jump to a hole"
      >
        {holes.map((hole) => {
          const isCurrent = hole === currentHole
          return (
            <button
              key={hole}
              type="button"
              onClick={() => onSelect(hole)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`Hole ${hole}${scored.has(hole) ? ', scored' : ''}`}
              className={[
                'tap-target flex shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold tabular-nums',
                isCurrent
                  ? 'border-fairway-700 bg-fairway-700 text-white'
                  : scored.has(hole)
                    ? 'border-fairway-300 bg-fairway-100 text-fairway-800'
                    : 'border-fairway-200 bg-white text-fairway-600',
              ].join(' ')}
            >
              {hole}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
