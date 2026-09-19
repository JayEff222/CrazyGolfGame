import { useState } from 'react'
import { nextUnscoredHole } from '../../lib/leaderboard'
import { HoleScorePanel } from './HoleScorePanel'
import { HoleSwitcher } from './HoleSwitcher'
import { Leaderboard } from './Leaderboard'
import { ScorecardScreen } from './ScorecardScreen'
import type { ScorecardHole } from './scorecardTotals'
import { useRoundScoring } from './useRoundScoring'

/*
 * The scoring stack, wired to a live round.
 *
 * This is the block the hole screen drops in underneath the GPS yardage panel:
 * hole switcher, your score entry, everyone else's scores, leaderboard - the
 * things REQUIREMENTS.md §5 says must be visible without scrolling, minus the
 * distance, which another feature owns.
 *
 * The current hole can be driven from outside (`currentHole` + `onHoleChange`)
 * so GPS auto-detection can move it, with the switcher acting as the manual
 * override §4.3 asks for. Left uncontrolled, it opens on the first hole you have
 * not scored - which is where you are standing when you rejoin after a dead
 * phone (§3) - and stays put the moment you choose a hole or enter a score.
 */

export interface RoundScoringProps {
  readonly roundId: string
  readonly selfUid: string
  readonly holes: readonly ScorecardHole[]
  /** Pass to drive the hole from outside, e.g. from GPS auto-detection. */
  readonly currentHole?: number
  readonly onHoleChange?: (hole: number) => void
  readonly courseName?: string
}

export function RoundScoring({
  roundId,
  selfUid,
  holes,
  currentHole,
  onHoleChange,
  courseName,
}: RoundScoringProps) {
  const { players, scores, loading, error, saveScore } = useRoundScoring(roundId, selfUid)
  // Null until the player pins a hole themselves, by tapping one or by scoring.
  const [pinnedHole, setPinnedHole] = useState<number | null>(null)
  const [showCard, setShowCard] = useState(false)

  const holeCount = holes.length === 0 ? 18 : holes.length
  const resumeHole = nextUnscoredHole(scores, selfUid, holeCount)
  const hole = currentHole ?? pinnedHole ?? resumeHole ?? 1
  const par = holes.find((h) => h.number === hole)?.par ?? 4

  const selectHole = (next: number) => {
    setPinnedHole(next)
    onHoleChange?.(next)
  }

  // Entering a score pins the hole, so the screen does not jump to the next one
  // underneath the player's thumb the instant they tap a number.
  const handleSetScore = (targetHole: number, strokes: number) => {
    setPinnedHole(targetHole)
    saveScore(targetHole, strokes)
  }

  if (loading) {
    return <p className="px-4 py-6 text-base text-fairway-700">Loading the card…</p>
  }

  const scoredHoles = scores.filter((s) => s.uid === selfUid).map((s) => s.hole)

  return (
    <div className="flex flex-col gap-4">
      <HoleSwitcher
        currentHole={hole}
        par={par}
        holeCount={holeCount}
        scoredHoles={scoredHoles}
        onSelect={selectHole}
      />

      <HoleScorePanel
        hole={hole}
        par={par}
        players={players}
        scores={scores}
        selfUid={selfUid}
        error={error}
        onSetScore={handleSetScore}
      />

      <Leaderboard players={players} scores={scores} holes={holes} highlightUid={selfUid} compact />

      <button
        type="button"
        onClick={() => setShowCard((open) => !open)}
        aria-expanded={showCard}
        className="tap-target rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800 active:bg-fairway-100"
      >
        {showCard ? 'Hide full scorecard' : 'Full scorecard'}
      </button>

      {showCard && (
        <ScorecardScreen
          players={players}
          scores={scores}
          holes={holes}
          selfUid={selfUid}
          courseName={courseName}
          onSetScore={handleSetScore}
        />
      )}
    </div>
  )
}
