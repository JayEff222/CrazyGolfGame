import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { DealResult } from './deal'

/*
 * Hands, and the record of what was played.
 *
 * Cards are honour-system: nothing here changes a score, and nothing here enforces
 * timing (REQUIREMENTS §4.4 — retroactive play is deliberately allowed). What this
 * does guarantee is that a card can only be spent once, and that every play is
 * written down with who, whom, which hole and when.
 */

export type HeldCardStatus = 'held' | 'played'

export interface HeldCard {
  readonly cardId: string
  readonly status: HeldCardStatus
  /** Set once played. */
  readonly playedOnHole?: number
  readonly targetUid?: string
  readonly playedAtMillis?: number
}

export interface Hand {
  readonly uid: string
  readonly cards: readonly HeldCard[]
}

export interface PlayedCardEvent {
  readonly id: string
  readonly type: 'card_played' | 'round_started' | 'round_completed'
  readonly actorUid: string
  readonly targetUid: string | null
  readonly holeNumber: number | null
  readonly cardId: string | null
  readonly atMillis: number | null
}

const handsRef = (roundId: string) => collection(db, 'rounds', roundId, 'hands')
const handRef = (roundId: string, uid: string) => doc(db, 'rounds', roundId, 'hands', uid)
const eventsRef = (roundId: string) => collection(db, 'rounds', roundId, 'events')

const readHand = (uid: string, data: Record<string, unknown>): Hand => ({
  uid,
  cards: Array.isArray(data.cards)
    ? (data.cards as Record<string, unknown>[]).map((card) => ({
        cardId: String(card.cardId),
        status: card.status === 'played' ? 'played' : 'held',
        playedOnHole: card.playedOnHole === null ? undefined : Number(card.playedOnHole),
        targetUid: typeof card.targetUid === 'string' ? card.targetUid : undefined,
        playedAtMillis:
          typeof card.playedAtMillis === 'number' ? card.playedAtMillis : undefined,
      }))
    : [],
})

/**
 * Writes the dealt hands.
 *
 * One batch, so a deal either lands completely or not at all. A half-dealt round
 * would be unrecoverable without everyone seeing cards they should not have.
 */
export async function writeDeal(roundId: string, deal: DealResult): Promise<void> {
  const batch = writeBatch(db)

  for (const [uid, cardIds] of Object.entries(deal.hands)) {
    batch.set(handRef(roundId, uid), {
      uid,
      cards: cardIds.map((cardId) => ({ cardId, status: 'held' as const })),
      dealtAt: serverTimestamp(),
    })
  }

  await batch.commit()
}

/** Whether anyone has been dealt into this round yet. */
export async function hasBeenDealt(roundId: string): Promise<boolean> {
  const snapshot = await getDocs(handsRef(roundId))
  return snapshot.docs.some((d) => Array.isArray(d.data().cards) && d.data().cards.length > 0)
}

export function subscribeHand(
  roundId: string,
  uid: string,
  onChange: (hand: Hand | null) => void,
): Unsubscribe {
  return onSnapshot(handRef(roundId, uid), (snapshot) => {
    onChange(snapshot.exists() ? readHand(snapshot.id, snapshot.data()) : null)
  })
}

/**
 * Every hand in the round.
 *
 * Only usable when the round is set to open hands — on a secret round the security
 * rules refuse to read anyone else's, and the error surfaces here rather than
 * silently returning nothing.
 */
export function subscribeAllHands(
  roundId: string,
  onChange: (hands: Hand[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    handsRef(roundId),
    (snapshot) => onChange(snapshot.docs.map((d) => readHand(d.id, d.data()))),
    (error) => onError?.(error),
  )
}

export class CardAlreadyPlayedError extends Error {
  constructor(cardId: string) {
    super(`Card ${cardId} has already been played.`)
    this.name = 'CardAlreadyPlayedError'
  }
}

/**
 * Spends a card and records the play.
 *
 * The hand is rewritten from what the caller already holds rather than read back
 * first: the caller is the only person who can write their own hand, so there is
 * no other writer to race with, and a read-then-write would stall out of signal.
 *
 * A played card keeps its place in the hand — REQUIREMENTS §4.4 says it stays
 * visible and disabled, not that it disappears.
 */
export async function playCard(
  roundId: string,
  hand: Hand,
  cardId: string,
  context: { holeNumber: number; targetUid?: string },
): Promise<void> {
  const existing = hand.cards.find((c) => c.cardId === cardId)
  if (existing === undefined) throw new Error(`Card ${cardId} is not in this hand.`)
  if (existing.status === 'played') throw new CardAlreadyPlayedError(cardId)

  const playedAtMillis = Date.now()
  const cards = hand.cards.map((card) =>
    card.cardId === cardId
      ? {
          cardId: card.cardId,
          status: 'played' as const,
          playedOnHole: context.holeNumber,
          targetUid: context.targetUid ?? null,
          playedAtMillis,
        }
      : {
          cardId: card.cardId,
          status: card.status,
          playedOnHole: card.playedOnHole ?? null,
          targetUid: card.targetUid ?? null,
          playedAtMillis: card.playedAtMillis ?? null,
        },
  )

  await setDoc(handRef(roundId, hand.uid), { uid: hand.uid, cards }, { merge: true })

  // The feed is the only record of what happened in an honour-system game, so it
  // is written as its own append-only document rather than inferred from hands.
  await setDoc(doc(eventsRef(roundId)), {
    type: 'card_played',
    actorUid: hand.uid,
    targetUid: context.targetUid ?? null,
    holeNumber: context.holeNumber,
    cardId,
    at: serverTimestamp(),
    atMillis: playedAtMillis,
  })
}

export function subscribeEvents(
  roundId: string,
  onChange: (events: PlayedCardEvent[]) => void,
): Unsubscribe {
  return onSnapshot(query(eventsRef(roundId), orderBy('atMillis', 'desc')), (snapshot) => {
    onChange(
      snapshot.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          type: (data.type as PlayedCardEvent['type']) ?? 'card_played',
          actorUid: String(data.actorUid ?? ''),
          targetUid: typeof data.targetUid === 'string' ? data.targetUid : null,
          holeNumber: typeof data.holeNumber === 'number' ? data.holeNumber : null,
          cardId: typeof data.cardId === 'string' ? data.cardId : null,
          atMillis: typeof data.atMillis === 'number' ? data.atMillis : null,
        }
      }),
    )
  })
}

/** Cards still available to play. */
export const heldCards = (hand: Hand | null): HeldCard[] =>
  (hand?.cards ?? []).filter((c) => c.status === 'held')

/** Cards already spent — kept visible and disabled, never hidden. */
export const playedCards = (hand: Hand | null): HeldCard[] =>
  (hand?.cards ?? []).filter((c) => c.status === 'played')
