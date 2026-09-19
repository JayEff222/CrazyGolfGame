import type { ReactNode } from 'react'
import {
  CARD_CATEGORY_LABEL,
  CARD_TIMING_LABEL,
  type Card,
  type CardCategory,
} from '../../lib/cards'

/*
 * One card, as it looks everywhere outside the picker.
 *
 * The face deliberately matches CardPicker: same badges, same order, same full
 * rule text on screen. A card has to be recognisable as the same card whether
 * the admin is choosing it at setup or someone is playing it on the ninth tee.
 * The tone map is copied rather than shared because the picker is a finished,
 * separately-owned file and a card face is worth a few duplicated class names.
 */

const CATEGORY_TONE: Record<CardCategory, string> = {
  boost: 'bg-fairway-100 text-fairway-800',
  attack: 'bg-chaos-500/15 text-chaos-600',
  defence: 'bg-flag-400/25 text-fairway-900',
  group: 'bg-fairway-200 text-fairway-900',
}

export interface CardTileProps {
  /** Undefined when the card was dealt and later deleted from the catalogue. */
  readonly card: Card | undefined
  /** Needed to say something useful when the card is missing. */
  readonly cardId: string
  /** Spent cards stay on screen, dimmed — REQUIREMENTS §4.4. */
  readonly used?: boolean
  /** Who it was played on, which hole — or anything else worth stating. */
  readonly footer?: ReactNode
  /** The action for this card, usually a play button. */
  readonly children?: ReactNode
}

export function CardTile({ card, cardId, used = false, footer, children }: CardTileProps) {
  if (card === undefined) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border-2 border-fairway-200 bg-fairway-50 p-3">
        <span className="font-display text-lg font-bold text-fairway-900">{cardId}</span>
        <span className="text-sm text-fairway-700">
          This card is no longer in the catalogue, so its rule cannot be shown.
        </span>
        {footer}
        {children}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border-2 p-3 ${
        used ? 'border-fairway-200 bg-fairway-50 opacity-70' : 'border-fairway-600 bg-white'
      }`}
    >
      <span className="font-display text-lg font-bold text-fairway-900">{card.title}</span>
      <span className="text-sm text-fairway-800">{card.effect}</span>
      <span className="flex flex-wrap gap-2 pt-1">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${CATEGORY_TONE[card.category]}`}
        >
          {CARD_CATEGORY_LABEL[card.category]}
        </span>
        <span className="rounded-md bg-fairway-100 px-2 py-0.5 text-xs font-semibold text-fairway-700">
          {CARD_TIMING_LABEL[card.timing]}
        </span>
      </span>
      {card.notes !== undefined && card.notes !== '' && (
        <span className="text-xs text-fairway-600 italic">{card.notes}</span>
      )}
      {footer}
      {children}
    </div>
  )
}
