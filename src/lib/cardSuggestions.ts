import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { cardSchema, type Card } from './cards'
import { saveCard } from './cardsData'

/*
 * Cards written by players, waiting on the admin's decision.
 *
 * A suggestion is deliberately not a card. It carries the same fields, but it
 * lives in its own collection until it is accepted, because the catalogue is
 * admin-only to write and must stay that way - the deck is what every round is
 * dealt from, and anyone being able to push a card straight into it would make
 * "the admin edits the cards" meaningless.
 *
 * Accepting is therefore two writes: the card into the catalogue, and the
 * decision onto the suggestion. The card is written first - a suggestion marked
 * accepted whose card never landed is the worse of the two failures, because
 * nobody would go looking for it again.
 */

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

export interface CardSuggestion {
  readonly id: string
  readonly card: Card
  readonly suggestedBy: string
  /** Denormalised so the review list reads as names without a second lookup. */
  readonly suggestedByName: string
  readonly status: SuggestionStatus
  /** Why it was turned down, in the admin's own words. */
  readonly reason?: string
  /** Milliseconds since the epoch, or null while the timestamp settles. */
  readonly at: number | null
}

const suggestionsRef = () => collection(db, 'cardSuggestions')

function readSuggestion(id: string, data: Record<string, unknown>): CardSuggestion | null {
  // Same normalisation as the catalogue: Firestore stores an absent optional as
  // null, and zod's .optional() rejects null. See cardsData.ts.
  const parsed = cardSchema.safeParse({
    id: String(data.cardId ?? id),
    title: data.title,
    effect: data.effect,
    category: data.category,
    timing: data.timing,
    target: data.target,
    active: data.active ?? true,
    notes: data.notes ?? undefined,
  })
  if (!parsed.success) return null

  const at = data.at as Timestamp | null | undefined
  const status = data.status
  return {
    id,
    card: parsed.data,
    suggestedBy: String(data.suggestedBy ?? ''),
    suggestedByName: String(data.suggestedByName ?? 'Someone'),
    status:
      status === 'accepted' || status === 'rejected' ? status : ('pending' satisfies SuggestionStatus),
    reason: typeof data.reason === 'string' && data.reason !== '' ? data.reason : undefined,
    at: at?.toMillis?.() ?? null,
  }
}

/** Newest first, with an unsettled timestamp counting as newest. */
export function byNewestSuggestion(a: CardSuggestion, b: CardSuggestion): number {
  if (a.at === b.at) return a.card.title.localeCompare(b.card.title)
  if (a.at === null) return -1
  if (b.at === null) return 1
  return b.at - a.at
}

/**
 * Sends a card to the admin for a decision.
 *
 * The suggestion id is separate from the card id so two players can suggest the
 * same title without one silently overwriting the other - the admin should see
 * both and pick the better wording.
 */
export async function suggestCard(
  card: Card,
  suggestedBy: string,
  suggestedByName: string,
): Promise<string> {
  const ref = doc(suggestionsRef())
  await setDoc(ref, {
    cardId: card.id,
    title: card.title,
    effect: card.effect,
    category: card.category,
    timing: card.timing,
    target: card.target,
    active: true,
    ...(card.notes === undefined ? {} : { notes: card.notes }),
    suggestedBy,
    suggestedByName,
    status: 'pending' satisfies SuggestionStatus,
    at: serverTimestamp(),
  })
  return ref.id
}

/** Everything awaiting a decision. Admin only — the rules enforce it. */
export async function listPendingSuggestions(): Promise<CardSuggestion[]> {
  const snapshot = await getDocs(query(suggestionsRef(), where('status', '==', 'pending')))
  return snapshot.docs
    .map((d) => readSuggestion(d.id, d.data()))
    .filter((s): s is CardSuggestion => s !== null)
    .sort(byNewestSuggestion)
}

/**
 * This player's own suggestions, decided or not.
 *
 * Filtered on suggestedBy because the rules only allow a player to read their
 * own — an unfiltered query would be refused outright rather than trimmed.
 */
export async function listMySuggestions(uid: string): Promise<CardSuggestion[]> {
  const snapshot = await getDocs(query(suggestionsRef(), where('suggestedBy', '==', uid)))
  return snapshot.docs
    .map((d) => readSuggestion(d.id, d.data()))
    .filter((s): s is CardSuggestion => s !== null)
    .sort(byNewestSuggestion)
}

/**
 * Accepts a suggestion into the deck.
 *
 * The card lands active, so it is immediately selectable at round setup — which
 * is not the same as being dealt: the deck for each round is still chosen by
 * hand, so nothing reaches a game unseen.
 */
export async function acceptSuggestion(
  suggestion: CardSuggestion,
  adminUid: string,
): Promise<void> {
  await saveCard({ ...suggestion.card, active: true })
  await updateDoc(doc(suggestionsRef(), suggestion.id), {
    status: 'accepted' satisfies SuggestionStatus,
    decidedBy: adminUid,
    decidedAt: serverTimestamp(),
  })
}

export async function rejectSuggestion(
  suggestionId: string,
  adminUid: string,
  reason: string,
): Promise<void> {
  await updateDoc(doc(suggestionsRef(), suggestionId), {
    status: 'rejected' satisfies SuggestionStatus,
    decidedBy: adminUid,
    reason: reason.trim(),
    decidedAt: serverTimestamp(),
  })
}
