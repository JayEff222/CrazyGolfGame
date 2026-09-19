import type { DealMode } from './rounds'

/*
 * Dealing the Crazy Cards.
 *
 * Pure and seedable. Dealing is the one moment in the game that cannot be redone -
 * once four people have seen their hands you cannot re-deal without everyone
 * knowing what everyone else had - so it is worth being able to reproduce a deal
 * exactly in a test rather than hoping Math.random behaved.
 */

export interface DealInput {
  /** Card ids chosen for this round, in any order. */
  readonly cardIds: readonly string[]
  /** Player uids, in playing order. */
  readonly playerUids: readonly string[]
  readonly mode: DealMode
  /** Used by 'fixed' and 'same'. Null means "as many as the mode implies". */
  readonly cardsPerPlayer: number | null
  readonly random?: () => number
}

export interface DealResult {
  /** uid → the card ids that player holds. */
  readonly hands: Record<string, string[]>
  /** Cards left over and deliberately not dealt (REQUIREMENTS §4.4). */
  readonly discarded: string[]
  /**
   * Set when there were not enough cards to give everyone what was asked for.
   * The deal still happens — it just says so, rather than failing at the moment
   * four people are standing on the first tee waiting.
   */
  readonly shortfall: number
}

/**
 * Fisher-Yates, taking its randomness as an argument so a test can pin it.
 * Does not mutate the input.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * A small deterministic generator, so a deal can be replayed exactly.
 *
 * mulberry32 — fine for shuffling a card deck, and emphatically not for anything
 * where the randomness needs to be unguessable.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const emptyHands = (uids: readonly string[]): Record<string, string[]> =>
  Object.fromEntries(uids.map((uid) => [uid, [] as string[]]))

/**
 * Deals the selected cards to the players.
 *
 * Three modes, as specified in REQUIREMENTS §4.4:
 *
 * - `even`   — split the deck as evenly as it goes; the remainder is discarded, so
 *              nobody starts with an extra card nobody else could have had.
 * - `fixed`  — a set number each, drawn at random from the deck.
 * - `same`   — every player gets an identical hand, so any difference in the round
 *              is down to when cards were played rather than who was dealt what.
 *
 * Never throws. A round with no cards selected is a legitimate round of golf.
 */
export function dealCards(input: DealInput): DealResult {
  const { cardIds, playerUids, mode, cardsPerPlayer } = input
  const random = input.random ?? Math.random

  if (playerUids.length === 0) {
    return { hands: {}, discarded: [...cardIds], shortfall: 0 }
  }
  if (cardIds.length === 0) {
    return { hands: emptyHands(playerUids), discarded: [], shortfall: 0 }
  }

  const deck = shuffle(cardIds, random)

  if (mode === 'same') {
    // Everyone holds the same hand, so the deck is not consumed and nothing is
    // "left over" in the way the other modes mean it.
    const size = cardsPerPlayer ?? deck.length
    const wanted = Math.max(0, Math.min(size, deck.length))
    const shared = deck.slice(0, wanted)
    return {
      hands: Object.fromEntries(playerUids.map((uid) => [uid, [...shared]])),
      discarded: deck.slice(wanted),
      shortfall: size > deck.length ? (size - deck.length) * playerUids.length : 0,
    }
  }

  const perPlayer =
    mode === 'fixed'
      ? Math.max(0, cardsPerPlayer ?? 0)
      : Math.floor(deck.length / playerUids.length)

  const hands = emptyHands(playerUids)
  let index = 0

  // Deal round-robin rather than in blocks. With a shuffled deck the result is
  // equivalent, but if a deal ever runs short it runs short fairly - the last
  // player loses one card, not their whole hand.
  for (let round = 0; round < perPlayer; round++) {
    for (const uid of playerUids) {
      if (index >= deck.length) break
      hands[uid]!.push(deck[index]!)
      index++
    }
  }

  const wanted = perPlayer * playerUids.length
  return {
    hands,
    discarded: deck.slice(index),
    shortfall: Math.max(0, wanted - deck.length),
  }
}

/** How many cards each player would get, for showing before the deal happens. */
export function previewHandSize(
  cardCount: number,
  playerCount: number,
  mode: DealMode,
  cardsPerPlayer: number | null,
): number {
  if (playerCount === 0 || cardCount === 0) return 0
  if (mode === 'same') return Math.min(cardsPerPlayer ?? cardCount, cardCount)
  if (mode === 'fixed') return Math.min(cardsPerPlayer ?? 0, Math.floor(cardCount / playerCount))
  return Math.floor(cardCount / playerCount)
}
