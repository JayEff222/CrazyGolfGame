import { z } from 'zod'

/*
 * The Crazy Cards model.
 *
 * Cards are honour-system: the app deals them, records what was played and when,
 * and never touches a score. That means the *wording* is the mechanism - a card
 * has to be unambiguous standing on a tee with three mates arguing about it, so
 * every card states its own timing in plain words as well as in `timing`.
 *
 * Cards live in Firestore and are editable in-app, so this schema is the contract
 * the editor validates against.
 */

/**
 * When a card may legally be played. The card text repeats this in words —
 * `timing` is for filtering and sorting, the text is what settles an argument.
 */
export const cardTimingSchema = z.enum([
  /** Any time during the round. */
  'anytime',
  /** Declared before anyone tees off on a hole. */
  'hole-start',
  /** On the tee box, before the affected player hits. */
  'tee',
  /** Immediately before a specific shot is played. */
  'before-shot',
  /** Immediately after a shot has been played. */
  'after-shot',
  /** Only on the putting green. */
  'green',
  /** Only in response to a card played on you. */
  'response',
])
export type CardTiming = z.infer<typeof cardTimingSchema>

export const CARD_TIMING_LABEL: Record<CardTiming, string> = {
  anytime: 'Any time',
  'hole-start': 'Before the hole starts',
  tee: 'On the tee',
  'before-shot': 'Before a shot',
  'after-shot': 'Straight after a shot',
  green: 'On the green',
  response: 'In response to a card',
}

export const cardCategorySchema = z.enum(['boost', 'attack', 'defence', 'group'])
export type CardCategory = z.infer<typeof cardCategorySchema>

export const CARD_CATEGORY_LABEL: Record<CardCategory, string> = {
  boost: 'Help yourself',
  attack: 'Target someone',
  defence: 'React',
  group: 'Everyone',
}

export const cardTargetSchema = z.enum(['self', 'opponent', 'everyone'])
export type CardTarget = z.infer<typeof cardTargetSchema>

export const cardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(40),
  /** The rule, addressed to the player holding the card. This is the mechanism. */
  effect: z.string().min(1).max(400),
  category: cardCategorySchema,
  timing: cardTimingSchema,
  target: cardTargetSchema,
  /** Deactivated cards stay in the catalogue but are never dealt. */
  active: z.boolean(),
  /** Optional clarification for the argument that will inevitably happen. */
  notes: z.string().max(300).optional(),
})
export type Card = z.infer<typeof cardSchema>

export const cardDeckSchema = z.object({
  version: z.number().int().positive(),
  cards: z.array(cardSchema).min(1),
})
export type CardDeck = z.infer<typeof cardDeckSchema>

/** A card that targets someone must be playable against someone. */
export function validateDeck(deck: unknown): { ok: true; deck: CardDeck } | { ok: false; problems: string[] } {
  const parsed = cardDeckSchema.safeParse(deck)
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }

  const problems: string[] = []
  const ids = new Set<string>()
  for (const card of parsed.data.cards) {
    if (ids.has(card.id)) problems.push(`duplicate card id "${card.id}"`)
    ids.add(card.id)

    if (card.category === 'attack' && card.target !== 'opponent') {
      problems.push(`"${card.title}" is an attack but does not target an opponent`)
    }
    if (card.category === 'group' && card.target !== 'everyone') {
      problems.push(`"${card.title}" is a group card but does not target everyone`)
    }
    if (card.category === 'defence' && card.timing !== 'response') {
      problems.push(`"${card.title}" is a defence card but is not played in response`)
    }
  }

  return problems.length === 0 ? { ok: true, deck: parsed.data } : { ok: false, problems }
}
