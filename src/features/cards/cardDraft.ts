import {
  cardSchema,
  type Card,
  type CardCategory,
  type CardTarget,
  type CardTiming,
} from '../../lib/cards'
import { cardIdFromTitle } from '../../lib/cardsData'

/*
 * Editing a card, as pure logic.
 *
 * The rules coupling category to target and timing is genuinely fiddly - an attack
 * must target an opponent, a group card must hit everyone, a defence card is only
 * playable in response - and getting it wrong produces a card that validates but
 * cannot be played. So the coupling is enforced here, in one tested place, rather
 * than in the form's event handlers.
 */

export interface CardDraft {
  readonly id: string
  readonly title: string
  readonly effect: string
  readonly category: CardCategory
  readonly timing: CardTiming
  readonly target: CardTarget
  readonly active: boolean
  readonly notes: string
}

export const EMPTY_DRAFT: CardDraft = {
  id: '',
  title: '',
  effect: '',
  category: 'attack',
  timing: 'anytime',
  target: 'opponent',
  active: true,
  notes: '',
}

export const toDraft = (card: Card): CardDraft => ({
  id: card.id,
  title: card.title,
  effect: card.effect,
  category: card.category,
  timing: card.timing,
  target: card.target,
  active: card.active,
  notes: card.notes ?? '',
})

/**
 * Applies a category change, dragging target and timing somewhere legal.
 *
 * Silently fixing the dependent fields beats showing an error after the fact:
 * the person editing is standing on a fairway, not reading a validation summary.
 */
export function withCategory(draft: CardDraft, category: CardCategory): CardDraft {
  switch (category) {
    case 'attack':
      return { ...draft, category, target: 'opponent' }
    case 'group':
      return { ...draft, category, target: 'everyone' }
    case 'defence':
      return { ...draft, category, target: 'opponent', timing: 'response' }
    case 'boost':
      // A boost helping someone else is a coherent idea, so target is left alone
      // unless it was forced to 'everyone' by a previous category.
      return { ...draft, category, target: draft.target === 'everyone' ? 'self' : draft.target }
  }
}

/** Which targets make sense for a category. An empty result means "not the user's choice". */
export function allowedTargets(category: CardCategory): CardTarget[] {
  switch (category) {
    case 'attack':
      return ['opponent']
    case 'group':
      return ['everyone']
    case 'defence':
      return ['opponent']
    case 'boost':
      return ['self', 'opponent']
  }
}

export type DraftProblem = { readonly field: keyof CardDraft; readonly message: string }

/**
 * Validates a draft for saving.
 *
 * Errors are addressed to the person writing the card, not to a developer, and
 * every one names the field it belongs to so the form can point at it.
 */
export function validateDraft(
  draft: CardDraft,
  existingIds: readonly string[] = [],
): { ok: true; card: Card } | { ok: false; problems: DraftProblem[] } {
  const problems: DraftProblem[] = []
  const title = draft.title.trim()
  const effect = draft.effect.trim()

  if (title === '') problems.push({ field: 'title', message: 'Give the card a name.' })
  if (title.length > 40) {
    problems.push({ field: 'title', message: 'Keep the name under 40 characters — it has to fit on a phone.' })
  }

  if (effect === '') {
    problems.push({ field: 'effect', message: 'Write the rule. This is what players read.' })
  } else if (effect.length < 20) {
    // Cards are honour-system, so the text IS the mechanism. Something too short
    // to settle an argument is a card that will cause one.
    problems.push({
      field: 'effect',
      message: 'Spell the rule out — three people have to agree on it standing on a tee.',
    })
  }

  const id = draft.id === '' ? cardIdFromTitle(title) : draft.id
  if (id === '') {
    problems.push({ field: 'title', message: 'That name needs at least one letter or number.' })
  }
  if (draft.id === '' && existingIds.includes(id)) {
    problems.push({ field: 'title', message: 'There is already a card with that name.' })
  }

  if (draft.category === 'attack' && draft.target !== 'opponent') {
    problems.push({ field: 'target', message: 'An attack has to target another player.' })
  }
  if (draft.category === 'group' && draft.target !== 'everyone') {
    problems.push({ field: 'target', message: 'A group card has to affect everyone.' })
  }
  if (draft.category === 'defence' && draft.timing !== 'response') {
    problems.push({ field: 'timing', message: 'A reaction card is played in response to another card.' })
  }

  if (problems.length > 0) return { ok: false, problems }

  const candidate = {
    id,
    title,
    effect,
    category: draft.category,
    timing: draft.timing,
    target: draft.target,
    active: draft.active,
    ...(draft.notes.trim() === '' ? {} : { notes: draft.notes.trim() }),
  }

  const parsed = cardSchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        field: (issue.path[0] as keyof CardDraft) ?? 'title',
        message: issue.message,
      })),
    }
  }

  return { ok: true, card: parsed.data }
}
