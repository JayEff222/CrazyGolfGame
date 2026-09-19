import { useMemo } from 'react'
import {
  CARD_CATEGORY_LABEL,
  CARD_TIMING_LABEL,
  type Card,
  type CardCategory,
} from '../../lib/cards'

const CATEGORY_ORDER: CardCategory[] = ['boost', 'attack', 'defence', 'group']

const CATEGORY_TONE: Record<CardCategory, string> = {
  boost: 'bg-fairway-100 text-fairway-800',
  attack: 'bg-chaos-500/15 text-chaos-600',
  defence: 'bg-flag-400/25 text-fairway-900',
  group: 'bg-fairway-200 text-fairway-900',
}

export interface CardPickerProps {
  readonly cards: readonly Card[]
  readonly selectedIds: readonly string[]
  readonly onChange: (ids: string[]) => void
  /** Shown as a warning when the selection is too small for the group. */
  readonly minimumWanted?: number
}

/**
 * Choosing which cards are in play for a round.
 *
 * Doubles as the way to read the deck: the full rule text is on screen, because
 * the admin picking cards on the first tee is usually also the person who has to
 * explain them. Collapsing the text behind a tap would mean nobody ever reads it.
 */
export function CardPicker({ cards, selectedIds, onChange, minimumWanted }: CardPickerProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectable = useMemo(() => cards.filter((c) => c.active), [cards])

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      cards: selectable.filter((c) => c.category === category),
    })).filter((group) => group.cards.length > 0)
  }, [selectable])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  const setAll = (ids: string[], on: boolean) => {
    const next = new Set(selected)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    onChange([...next])
  }

  const allIds = selectable.map((c) => c.id)
  const everySelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  /** Cards in the catalogue but deactivated, so absent from the list below. */
  const retired = cards.length - selectable.length
  const tooFew = minimumWanted !== undefined && selected.size > 0 && selected.size < minimumWanted

  if (selectable.length === 0) {
    return (
      <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
        No cards in the catalogue yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-fairway-900">
          {selected.size} of {selectable.length} cards in play
        </p>
        <button
          type="button"
          onClick={() => setAll(allIds, !everySelected)}
          className="tap-target rounded-lg border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800"
        >
          {everySelected ? 'Clear all' : 'Use all'}
        </button>
      </div>

      {/*
        A retired card is simply absent from this list, which makes the count above
        look wrong to anyone who knows how many cards the deck has. Saying so is the
        difference between "three are switched off" and "three have gone missing".
      */}
      {retired > 0 && (
        <p className="text-sm text-fairway-700">
          {retired} more {retired === 1 ? 'card is' : 'cards are'} switched off in the card editor
          and cannot be picked.
        </p>
      )}

      {selected.size === 0 && (
        <p className="rounded-xl bg-fairway-100 px-4 py-3 text-sm text-fairway-800">
          Pick none and you&apos;ll play a straight round with no cards.
        </p>
      )}

      {tooFew && (
        <p
          role="status"
          className="rounded-xl bg-flag-400/25 px-4 py-3 text-sm font-semibold text-fairway-900"
        >
          Only {selected.size} cards for {minimumWanted} wanted — some players will get fewer than
          others, and the remainder is discarded.
        </p>
      )}

      {grouped.map((group) => {
        const ids = group.cards.map((c) => c.id)
        const allOn = ids.every((id) => selected.has(id))
        return (
          <section key={group.category} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-fairway-800">
                {CARD_CATEGORY_LABEL[group.category]}
                <span className="ml-2 text-sm font-normal text-fairway-600">
                  {ids.filter((id) => selected.has(id)).length}/{ids.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setAll(ids, !allOn)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-fairway-700 underline"
              >
                {allOn ? 'none' : 'all'}
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {group.cards.map((card) => {
                const on = selected.has(card.id)
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => toggle(card.id)}
                      aria-pressed={on}
                      className={`flex w-full flex-col gap-1 rounded-xl border-2 p-3 text-left transition ${
                        on
                          ? 'border-fairway-600 bg-white'
                          : 'border-fairway-200 bg-fairway-50 opacity-70'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
                            on
                              ? 'border-fairway-700 bg-fairway-700 text-white'
                              : 'border-fairway-300 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <span className="font-display text-lg font-bold text-fairway-900">
                          {card.title}
                        </span>
                      </span>
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
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
