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
export { HandPanel } from './HandPanel'
export type { HandPanelProps } from './HandPanel'
export { HandScreen } from './HandScreen'
export type { HandScreenProps } from './HandScreen'
export { CardTile } from './CardTile'
export type { CardTileProps } from './CardTile'
export { PlayCardDialog } from './PlayCardDialog'
export type { PlayCardDialogProps } from './PlayCardDialog'
export { CardPlayedNotice } from './CardPlayedNotice'
export type { CardPlayedNoticeProps } from './CardPlayedNotice'
export { useHands } from './useHands'
export type { HandsState } from './useHands'
export { useCardNotices } from './useCardNotices'
export type { CardNotice, CardNoticesState } from './useCardNotices'

export { CardGallery } from './CardGallery'
export { SuggestCardForm } from './SuggestCardForm'
export type { SuggestCardFormProps } from './SuggestCardForm'
export { SuggestionReview } from './SuggestionReview'
export {
  markDecisionSeen,
  readSeenDecisions,
  unseenDecisions,
} from './seenDecisions'

export { CardEditor } from './CardEditor'
export {
  EMPTY_DRAFT,
  allowedTargets,
  toDraft,
  validateDraft,
  withCategory,
  type CardDraft,
  type DraftProblem,
} from './cardDraft'
