import { collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
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
 * Loads the catalogue.
 *
 * A card that fails validation is skipped rather than throwing. The catalogue is
 * hand-edited on a phone, and one malformed card should not stop a round starting.
 */
export async function loadCards(): Promise<Card[]> {
  const snapshot = await getDocs(cardsRef())

  const cards: Card[] = []
  for (const document of snapshot.docs) {
    const parsed = cardSchema.safeParse({ id: document.id, ...document.data() })
    if (parsed.success) cards.push(parsed.data)
  }

  return cards.sort((a, b) => a.title.localeCompare(b.title))
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
      notes: card.notes ?? null,
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
