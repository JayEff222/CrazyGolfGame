import { useState, type FormEvent } from 'react'
import {
  CARD_CATEGORY_LABEL,
  CARD_TIMING_LABEL,
  type Card,
  type CardCategory,
  type CardTarget,
  type CardTiming,
} from '../../lib/cards'
import {
  EMPTY_DRAFT,
  allowedTargets,
  validateDraft,
  withCategory,
  type CardDraft,
  type DraftProblem,
} from './cardDraft'

/*
 * A player writing a card of their own.
 *
 * Validated through the same `validateDraft` the admin editor uses, deliberately
 * - including the rule that an effect under twenty characters is refused. A card
 * is honour-system, so its wording IS the mechanism, and a suggestion that
 * cannot settle an argument is not a kinder thing to accept than one that is
 * rejected. Better it fails here, while the author is still holding the idea.
 *
 * Deliberately not the full editor: no id field, no active toggle, no delete.
 * Those are the admin's business, and a form that offers them would imply this
 * card goes straight into the deck.
 */

const CATEGORIES: CardCategory[] = ['boost', 'attack', 'defence', 'group']
const TIMINGS: CardTiming[] = [
  'anytime',
  'hole-start',
  'tee',
  'before-shot',
  'after-shot',
  'green',
  'response',
]
const TARGET_LABEL: Record<CardTarget, string> = {
  self: 'Yourself',
  opponent: 'Another player',
  everyone: 'Everyone',
}

const fieldClass =
  'w-full rounded-xl border-2 border-fairway-200 bg-white px-4 py-3 text-base text-fairway-900 outline-none focus:border-fairway-500'

function Problems({ problems, field }: { problems: DraftProblem[]; field: keyof CardDraft }) {
  const mine = problems.filter((p) => p.field === field)
  if (mine.length === 0) return null
  return <p className="text-sm font-semibold text-chaos-600">{mine.map((p) => p.message).join(' ')}</p>
}

export interface SuggestCardFormProps {
  /** Existing card ids, so a suggestion cannot collide with a card in the deck. */
  readonly existingIds: readonly string[]
  /** Receives the validated card, so the caller never re-runs the validation. */
  readonly onSubmit: (card: Card) => Promise<void>
  readonly onCancel: () => void
}

export function SuggestCardForm({ existingIds, onSubmit, onCancel }: SuggestCardFormProps) {
  const [draft, setDraft] = useState<CardDraft>(EMPTY_DRAFT)
  const [problems, setProblems] = useState<DraftProblem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validateDraft(draft, existingIds)
    if (!result.ok) {
      setProblems(result.problems)
      return
    }

    setProblems([])
    setError(null)
    setBusy(true)
    try {
      await onSubmit(result.card)
    } catch {
      setError('Could not send that. Check your signal and try again.')
      setBusy(false)
    }
  }

  const targets = allowedTargets(draft.category)

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="suggest-title" className="text-base font-semibold text-fairway-900">
          Card name
        </label>
        <input
          id="suggest-title"
          value={draft.title}
          maxLength={40}
          onChange={(event) => set('title', event.target.value)}
          className={fieldClass}
        />
        <Problems problems={problems} field="title" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="suggest-effect" className="text-base font-semibold text-fairway-900">
          The rule
        </label>
        <textarea
          id="suggest-effect"
          value={draft.effect}
          rows={5}
          maxLength={400}
          onChange={(event) => set('effect', event.target.value)}
          className={fieldClass}
        />
        <p className="text-sm text-fairway-600">
          Write it so three people standing on a tee can agree what it means.
        </p>
        <Problems problems={problems} field="effect" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="suggest-category" className="text-base font-semibold text-fairway-900">
          What kind of card
        </label>
        <select
          id="suggest-category"
          value={draft.category}
          onChange={(event) =>
            setDraft((current) => withCategory(current, event.target.value as CardCategory))
          }
          className={fieldClass}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CARD_CATEGORY_LABEL[category]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="suggest-timing" className="text-base font-semibold text-fairway-900">
          When it can be played
        </label>
        <select
          id="suggest-timing"
          value={draft.timing}
          onChange={(event) => set('timing', event.target.value as CardTiming)}
          className={fieldClass}
        >
          {TIMINGS.map((timing) => (
            <option key={timing} value={timing}>
              {CARD_TIMING_LABEL[timing]}
            </option>
          ))}
        </select>
        <Problems problems={problems} field="timing" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="suggest-target" className="text-base font-semibold text-fairway-900">
          Who it affects
        </label>
        <select
          id="suggest-target"
          value={draft.target}
          onChange={(event) => set('target', event.target.value as CardTarget)}
          className={fieldClass}
        >
          {targets.map((target) => (
            <option key={target} value={target}>
              {TARGET_LABEL[target]}
            </option>
          ))}
        </select>
        <Problems problems={problems} field="target" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="suggest-notes" className="text-base font-semibold text-fairway-900">
          Notes <span className="font-normal text-fairway-600">(optional)</span>
        </label>
        <textarea
          id="suggest-notes"
          value={draft.notes}
          rows={2}
          maxLength={300}
          onChange={(event) => set('notes', event.target.value)}
          className={fieldClass}
        />
        <p className="text-sm text-fairway-600">
          For the argument that will happen anyway. Where it does and does not apply.
        </p>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="tap-target rounded-xl bg-fairway-700 px-6 text-lg font-bold text-white active:bg-fairway-800 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send it to JF'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
      >
        Cancel
      </button>
    </form>
  )
}
