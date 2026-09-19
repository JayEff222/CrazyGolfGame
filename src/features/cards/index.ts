/*
 * Phase 6 / 7 — the cards feature.
 *
 * `CardPicker` chooses the deck at setup, `dealRoundCards` deals it when the round
 * starts, and `EventFeed` is the record of what happened with it afterwards.
 */

export { CardPicker } from './CardPicker'
export type { CardPickerProps } from './CardPicker'

export { dealRoundCards, summariseDeal } from './dealRoundCards'
export type { DealOutcome, DealSummaryData, DealtHand } from './dealRoundCards'

export { DealSummary } from './DealSummary'
export type { DealSummaryProps } from './DealSummary'

export { EventFeed } from './EventFeed'
export type { EventFeedProps } from './EventFeed'

export {
  nameIndex,
  relativeTime,
  titleIndex,
  toFeedLine,
  toFeedLines,
  UNKNOWN_CARD,
  UNKNOWN_PLAYER,
  type FeedLine,
} from './feedText'
