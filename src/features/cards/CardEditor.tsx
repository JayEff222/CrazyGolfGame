import { useEffect, useMemo, useState } from 'react'
import {
  CARD_CATEGORY_LABEL,
  CARD_TIMING_LABEL,
  type Card,
  type CardCategory,
  type CardTarget,
  type CardTiming,
} from '../../lib/cards'
import { deleteCard, loadCards, saveCard } from '../../lib/cardsData'
import {
  EMPTY_DRAFT,
  allowedTargets,
  toDraft,
  validateDraft,
  withCategory,
  type CardDraft,
  type DraftProblem,
} from './cardDraft'

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
  return (
    <p className="text-sm font-semibold text-chaos-600">{mine.map((p) => p.message).join(' ')}</p>
  )
}

/**
 * Writing and rewriting cards from a phone.
 *
 * The point of this screen is that the deck stops being guesses and becomes the
 * group's own rules — so it has to be usable between holes, not at a desk. Hence
 * big fields, no modal nesting, and a list you can deactivate from without
 * opening anything.
 *
 * Deactivating is offered before deleting: a card that turned out to be too strong
 * is usually worth keeping to soften later, and deleting it loses the wording
 * somebody argued over.
 */
export function CardEditor() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [problems, setProblems] = useState<DraftProblem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /*
   * A counter the effect watches, rather than calling a refresh function directly.
   * Saving a card has to reload the list, and calling setState straight out of an
   * effect body causes a cascading render the repo's react-hooks rules reject.
   * Bumping a counter keeps the fetch inside the effect where it belongs.
   */
  const [reloads, setReloads] = useState(0)
  const reload = () => setReloads((n) => n + 1)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadCards()
        if (!cancelled) setCards(loaded)
      } catch {
        if (!cancelled) setError('Could not load the cards. Check your signal.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloads])

  const existingIds = useMemo(() => (cards ?? []).map((c) => c.id), [cards])

  const edit = (card: Card) => {
    setDraft(toDraft(card))
    setProblems([])
    setConfirmDelete(false)
    setError(null)
  }

  const startNew = () => {
    setDraft(EMPTY_DRAFT)
    setProblems([])
    setConfirmDelete(false)
    setError(null)
  }

  const save = async () => {
    if (draft === null) return
    const result = validateDraft(draft, existingIds)
    if (!result.ok) {
      setProblems(result.problems)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveCard(result.card)
      reload()
      setDraft(null)
    } catch {
      setError('Could not save. Only admins can edit cards.')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (card: Card) => {
    setError(null)
    try {
      await saveCard({ ...card, active: !card.active })
      reload()
    } catch {
      setError('Could not change that card. Only admins can edit cards.')
    }
  }

  const remove = async () => {
    if (draft === null || draft.id === '') return
    setBusy(true)
    try {
      await deleteCard(draft.id)
      reload()
      setDraft(null)
    } catch {
      setError('Could not delete that card.')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  if (cards === null && error === null) {
    return <p className="p-6 text-fairway-700">Loading the cards…</p>
  }

  // ---- the edit form ----
  if (draft !== null) {
    const isNew = draft.id === ''
    const targets = allowedTargets(draft.category)

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-fairway-700">
          {isNew ? 'New card' : draft.title}
        </h1>

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-fairway-900">Name</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={fieldClass}
            maxLength={40}
          />
          <Problems problems={problems} field="title" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-fairway-900">The rule</span>
          <span className="-mt-1 text-sm text-fairway-700">
            Write it so three people can agree on it standing on a tee.
          </span>
          <textarea
            value={draft.effect}
            onChange={(e) => setDraft({ ...draft, effect: e.target.value })}
            rows={4}
            className={fieldClass}
            maxLength={400}
          />
          <Problems problems={problems} field="effect" />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-semibold text-fairway-900">Kind of card</legend>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={draft.category === category}
                onClick={() => setDraft(withCategory(draft, category))}
                className={`tap-target rounded-lg px-3 text-base font-semibold ${
                  draft.category === category
                    ? 'bg-fairway-700 text-white'
                    : 'bg-fairway-100 text-fairway-800'
                }`}
              >
                {CARD_CATEGORY_LABEL[category]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-semibold text-fairway-900">Who it hits</legend>
          {targets.length === 1 ? (
            <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
              {TARGET_LABEL[targets[0]!]}
              <span className="block text-sm text-fairway-700">
                Fixed by the kind of card you picked.
              </span>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {targets.map((target) => (
                <button
                  key={target}
                  type="button"
                  aria-pressed={draft.target === target}
                  onClick={() => setDraft({ ...draft, target })}
                  className={`tap-target rounded-lg px-3 text-base font-semibold ${
                    draft.target === target
                      ? 'bg-fairway-700 text-white'
                      : 'bg-fairway-100 text-fairway-800'
                  }`}
                >
                  {TARGET_LABEL[target]}
                </button>
              ))}
            </div>
          )}
          <Problems problems={problems} field="target" />
        </fieldset>

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-fairway-900">When it can be played</span>
          <span className="-mt-1 text-sm text-fairway-700">
            Shown to players as guidance. Nothing is enforced — the group decides.
          </span>
          <select
            value={draft.timing}
            onChange={(e) => setDraft({ ...draft, timing: e.target.value as CardTiming })}
            className={fieldClass}
          >
            {TIMINGS.map((timing) => (
              <option key={timing} value={timing}>
                {CARD_TIMING_LABEL[timing]}
              </option>
            ))}
          </select>
          <Problems problems={problems} field="timing" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-fairway-900">Note (optional)</span>
          <input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className={fieldClass}
            maxLength={300}
          />
        </label>

        <label className="flex items-center gap-3 rounded-xl bg-fairway-100 px-4 py-3">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="h-6 w-6"
          />
          <span className="text-base font-semibold text-fairway-900">
            In the deck
            <span className="block text-sm font-normal text-fairway-700">
              Turn this off to retire a card without losing it.
            </span>
          </span>
        </label>

        {error !== null && (
          <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-chaos-600">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="tap-target flex-1 rounded-xl border-2 border-fairway-300 font-semibold text-fairway-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="tap-target flex-1 rounded-xl bg-fairway-700 text-lg font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>

        {!isNew && (
          <div className="border-t-2 border-fairway-100 pt-4">
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-base font-semibold text-fairway-900">
                  Delete this card for good?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="tap-target flex-1 rounded-xl border-2 border-fairway-300 font-semibold text-fairway-800"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    className="tap-target flex-1 rounded-xl bg-chaos-500 font-bold text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="tap-target w-full rounded-xl text-base font-semibold text-chaos-600"
              >
                Delete card
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---- the list ----
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-fairway-700">Cards</h1>
        <p className="text-sm text-fairway-800">
          {(cards ?? []).length} cards · {(cards ?? []).filter((c) => c.active).length} in the deck
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-chaos-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={startNew}
        className="tap-target rounded-xl bg-fairway-700 text-lg font-bold text-white"
      >
        Write a new card
      </button>

      <ul className="flex flex-col gap-2">
        {(cards ?? []).map((card) => (
          <li
            key={card.id}
            className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${
              card.active ? 'border-fairway-200 bg-white' : 'border-fairway-200 bg-fairway-50'
            }`}
          >
            <button type="button" onClick={() => edit(card)} className="text-left">
              <span className="font-display text-lg font-bold text-fairway-900">{card.title}</span>
              <span className="block text-sm text-fairway-800">{card.effect}</span>
            </button>
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md bg-fairway-100 px-2 py-0.5 text-xs font-bold text-fairway-700 uppercase">
                {CARD_CATEGORY_LABEL[card.category]}
              </span>
              <button
                type="button"
                onClick={() => void toggleActive(card)}
                aria-pressed={card.active}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  card.active ? 'bg-fairway-100 text-fairway-800' : 'bg-flag-400/30 text-fairway-900'
                }`}
              >
                {card.active ? 'In the deck' : 'Retired'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
