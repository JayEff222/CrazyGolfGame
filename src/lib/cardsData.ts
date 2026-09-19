import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { cardSchema, type Card } from './cards'

/**
 * The card catalogue in Firestore.
 *
 * Cards are edited in the app between play tests, so this is read on demand rather
 * than bundled — a deck change must not need a redeploy.
 */

const cardsRef = () => collection(db, 'cards')

/**
 * Normalises a stored card before validation.
 *
 * Firestore cannot store `undefined`, so an absent optional field comes back as
 * `null` - and zod's `.optional()` means "may be undefined", not "may be null".
 * Without this, every card saved without notes failed to parse and was silently
 * dropped: 8 of the 20 starter cards disappeared from the app that way, and the
 * in-app editor ate any card written with the notes field left blank.
 *
 * Normalising on the way in rather than tightening the writer is deliberate -
 * it repairs the documents already sitting in Firestore without a re-seed.
 */
function normaliseStoredCard(id: string, data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, id, notes: data.notes ?? undefined }
}

export interface Catalogue {
  readonly cards: readonly Card[]
  /** Document ids that would not parse, with the reason. Never silently dropped. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[]
}

/**
 * Loads the catalogue, reporting anything it could not read.
 *
 * A malformed card is skipped rather than thrown, because one bad card must not
 * stop a round starting - but it is *reported*, because the previous behaviour of
 * dropping it silently is what let the notes bug hide for a whole phase.
 */
export async function loadCatalogue(): Promise<Catalogue> {
  const snapshot = await getDocs(cardsRef())

  const cards: Card[] = []
  const skipped: { id: string; reason: string }[] = []

  for (const document of snapshot.docs) {
    const parsed = cardSchema.safeParse(normaliseStoredCard(document.id, document.data()))
    if (parsed.success) {
      cards.push(parsed.data)
    } else {
      skipped.push({
        id: document.id,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
  }

  return { cards: cards.sort((a, b) => a.title.localeCompare(b.title)), skipped }
}

/** The catalogue alone, for the callers that cannot act on a malformed card anyway. */
export async function loadCards(): Promise<Card[]> {
  const { cards } = await loadCatalogue()
  return [...cards]
}

/** Only the cards eligible to be dealt. */
export const activeCards = (cards: readonly Card[]): Card[] => cards.filter((c) => c.active)

export async function saveCard(card: Card): Promise<void> {
  await setDoc(
    doc(db, 'cards', card.id),
    {
      title: card.title,
      effect: card.effect,
      category: card.category,
      timing: card.timing,
      target: card.target,
      active: card.active,
      /*
       * Removed rather than written as null. This is a merge, so simply omitting
       * the key would leave a previous note in place - clearing the field has to
       * be said explicitly. Writing null instead is what broke the reader.
       */
      notes: card.notes ?? deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteCard(cardId: string): Promise<void> {
  await deleteDoc(doc(db, 'cards', cardId))
}

/** Turns a title into an id for a newly written card. */
export function cardIdFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
