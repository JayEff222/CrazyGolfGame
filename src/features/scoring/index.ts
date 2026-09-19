/*
 * Phase 4 — scoring and the leaderboard.
 *
 * The four presentational pieces take plain props and know nothing about
 * Firestore, so the hole screen can compose them next to the GPS panel and the
 * tests can render them from fixtures. `useRoundScoring` is the single live
 * edge, and `RoundScoring` is the two wired together.
 */

export { ScoreStepper } from './ScoreStepper'
export type { ScoreStepperProps } from './ScoreStepper'

export { HoleSwitcher } from './HoleSwitcher'
export type { HoleSwitcherProps } from './HoleSwitcher'

export { Leaderboard } from './Leaderboard'
export type { LeaderboardProps } from './Leaderboard'

export { HoleScorePanel } from './HoleScorePanel'
export type { HoleScorePanelProps } from './HoleScorePanel'

export { ScorecardScreen } from './ScorecardScreen'
export type { ScorecardScreenProps } from './ScorecardScreen'

export { RoundScoring } from './RoundScoring'
export type { RoundScoringProps } from './RoundScoring'

export { useRoundScoring } from './useRoundScoring'
export type { RoundScoringState } from './useRoundScoring'

export {
  clampStrokes,
  indexScores,
  parTotal,
  playerTotals,
  quickPicks,
  scoreKey,
  scoreTerm,
  scoreTone,
  toHolePars,
  FRONT_NINE_END,
  MAX_STROKES,
  MIN_STROKES,
} from './scorecardTotals'
export type { PlayerTotals, ScorecardHole, ScoreTone } from './scorecardTotals'
